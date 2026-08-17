// sapkit:program-to-spec — the one ZIP reader/writer the xlsx pipeline shares.
//
// template-clone.mjs rewrites sharedStrings and image-swap.mjs replaces media;
// both open and reseal the same workbook, so both go through this file. Keeping
// it single-source is what makes their output byte-comparable.
//
// Deliberately partial: only enough of the ZIP format to handle the small
// archives this pipeline produces — ≤ 1 MB, no ZIP64, no encryption, no split
// volumes. Inputs outside that envelope are out of scope, not merely untested.
// Nothing here reaches past node:zlib.

import { deflateRawSync, inflateRawSync } from 'node:zlib';

// Record signatures and the fixed-size part of each header (PKWARE APPNOTE
// §4.3.7 local file header, §4.3.12 central directory entry, §4.3.16 EOCD).
// Every header also carries a variable-length name after its fixed part.
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const LOCAL_FIXED = 30;
const CENTRAL_FIXED = 46;
const EOCD_FIXED = 22;
// An archive comment may sit between the EOCD and the end of file, pushing the
// record up to 64 KiB - 1 back from the tail. That bounds the backward search.
const MAX_COMMENT = 0xffff;

const STORED = 0;
const DEFLATED = 8;
const NEEDS_2_0 = 20; // "requires ZIP 2.0" — the floor once deflate is in play
const NAMES_ARE_UTF8 = 0x0800; // general purpose bit 11

// CRC-32 as ZIP wants it: reflected polynomial 0xedb88320, pre/post inverted.
// One byte-indexed table, built at load, serves every entry.
const CRC_BY_BYTE = buildCrcTable();

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte++) {
    let acc = byte;
    for (let round = 0; round < 8; round++) {
      acc = (acc & 1) ? (0xedb88320 ^ (acc >>> 1)) : (acc >>> 1);
    }
    table[byte] = acc >>> 0;
  }
  return table;
}

export function crc32(bytes) {
  let acc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    acc = CRC_BY_BYTE[(acc ^ bytes[i]) & 0xff] ^ (acc >>> 8);
  }
  return (acc ^ 0xffffffff) >>> 0;
}

// The EOCD is the last record in the file, so walk backwards from the earliest
// byte it could still start at. Returns -1 when no candidate carries the
// signature, which is the only way this reader can conclude "not a ZIP".
function findEocd(buf) {
  const floor = Math.max(0, buf.length - (EOCD_FIXED + MAX_COMMENT));
  for (let at = buf.length - EOCD_FIXED; at >= floor; at--) {
    if (buf.readUInt32LE(at) === SIG_EOCD) return at;
  }
  return -1;
}

// Reads every member into memory as { name, data }. Callers are free to mutate
// `data` or append entries and hand the same array back to zipFiles().
export function unzipEntries(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('xlsx-zip: EOCD not found');

  const memberCount = buf.readUInt16LE(eocd + 10);
  let record = buf.readUInt32LE(eocd + 16); // start of the central directory

  const entries = [];
  for (let i = 0; i < memberCount; i++) {
    const method = buf.readUInt16LE(record + 10);
    const storedSize = buf.readUInt32LE(record + 20);
    const nameSize = buf.readUInt16LE(record + 28);
    const extraSize = buf.readUInt16LE(record + 30);
    const commentSize = buf.readUInt16LE(record + 32);
    const localAt = buf.readUInt32LE(record + 42);
    const name = buf.toString('utf8', record + CENTRAL_FIXED, record + CENTRAL_FIXED + nameSize);

    // The payload begins after the local header's own name and extra fields,
    // whose lengths may differ from the central copy's — so read them locally.
    const payloadAt = localAt + LOCAL_FIXED
      + buf.readUInt16LE(localAt + 26)
      + buf.readUInt16LE(localAt + 28);
    const payload = buf.subarray(payloadAt, payloadAt + storedSize);

    entries.push({ name, data: method === STORED ? payload : inflateRawSync(payload) });
    record += CENTRAL_FIXED + nameSize + extraSize + commentSize;
  }
  return entries;
}

// Both headers describe the same member, so they are filled from one `member`
// record: { method, crc, storedSize, rawSize, nameBytes }.
function localHeader(member) {
  const head = Buffer.alloc(LOCAL_FIXED);
  head.writeUInt32LE(SIG_LOCAL, 0);
  head.writeUInt16LE(NEEDS_2_0, 4); // version needed to extract
  head.writeUInt16LE(NAMES_ARE_UTF8, 6); // general purpose bit flag
  head.writeUInt16LE(member.method, 8);
  // Modification time and date stay zero: the pipeline diffs its own output, so
  // a clock in the bytes would make identical input produce unequal files. No
  // consumer of these workbooks reads member timestamps.
  head.writeUInt16LE(0, 10);
  head.writeUInt16LE(0, 12);
  head.writeUInt32LE(member.crc, 14);
  head.writeUInt32LE(member.storedSize, 18);
  head.writeUInt32LE(member.rawSize, 22);
  head.writeUInt16LE(member.nameBytes.length, 26);
  head.writeUInt16LE(0, 28); // no extra field
  return Buffer.concat([head, member.nameBytes]);
}

function centralHeader(member, localAt) {
  const head = Buffer.alloc(CENTRAL_FIXED);
  head.writeUInt32LE(SIG_CENTRAL, 0);
  head.writeUInt16LE(NEEDS_2_0, 4); // version made by
  head.writeUInt16LE(NEEDS_2_0, 6); // version needed to extract
  head.writeUInt16LE(NAMES_ARE_UTF8, 8);
  head.writeUInt16LE(member.method, 10);
  head.writeUInt16LE(0, 12); // mod time — see localHeader
  head.writeUInt16LE(0, 14); // mod date
  head.writeUInt32LE(member.crc, 16);
  head.writeUInt32LE(member.storedSize, 20);
  head.writeUInt32LE(member.rawSize, 24);
  head.writeUInt16LE(member.nameBytes.length, 28);
  head.writeUInt16LE(0, 30); // extra field length
  head.writeUInt16LE(0, 32); // comment length
  head.writeUInt16LE(0, 34); // disk this member starts on
  head.writeUInt16LE(0, 36); // internal attributes
  head.writeUInt32LE(0, 38); // external attributes
  head.writeUInt32LE(localAt, 42); // where this member's local header sits
  return Buffer.concat([head, member.nameBytes]);
}

function eocdRecord(memberCount, centralSize, centralAt) {
  const tail = Buffer.alloc(EOCD_FIXED);
  tail.writeUInt32LE(SIG_EOCD, 0);
  tail.writeUInt16LE(0, 4); // this disk's number
  tail.writeUInt16LE(0, 6); // disk holding the central directory
  tail.writeUInt16LE(memberCount, 8); // members on this disk …
  tail.writeUInt16LE(memberCount, 10); // … and in total: single volume, so equal
  tail.writeUInt32LE(centralSize, 12);
  tail.writeUInt32LE(centralAt, 16);
  tail.writeUInt16LE(0, 20); // no archive comment
  return tail;
}

// Seals `entries` into a complete archive: every local header + payload first,
// then the central directory, then the EOCD.
export function zipFiles(entries) {
  const body = [];
  const directory = [];
  let written = 0; // bytes emitted so far = offset of the next local header

  for (const entry of entries) {
    const raw = entry.data;
    const packed = deflateRawSync(raw, { level: 9 });
    // Compress speculatively and keep the result only when it actually pays.
    // Already-compressed members (the template's PNGs) grow under deflate, and
    // storing those verbatim is both smaller and cheaper to reopen.
    const worthPacking = packed.length < raw.length;
    const member = {
      method: worthPacking ? DEFLATED : STORED,
      crc: crc32(raw),
      storedSize: worthPacking ? packed.length : raw.length,
      rawSize: raw.length,
      nameBytes: Buffer.from(entry.name, 'utf8'),
    };

    const head = localHeader(member);
    body.push(head, worthPacking ? packed : raw);
    directory.push(centralHeader(member, written));
    written += head.length + member.storedSize;
  }

  const centralSize = directory.reduce((sum, head) => sum + head.length, 0);
  return Buffer.concat([
    ...body,
    ...directory,
    eocdRecord(entries.length, centralSize, written),
  ]);
}
