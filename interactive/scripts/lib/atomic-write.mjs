/**
 * All-or-nothing file writes. Harness-neutral: the Claude adapter's
 * `install-hooks.mjs` and the neutral `setup-state.mjs` both write through it,
 * so it lives in the neutral tree — an adapter may depend on this direction,
 * never the reverse.
 *
 * A hook that is killed mid-write must not leave a half-written file behind:
 * the next run would read the fragment as if it were the whole thing. So the
 * content goes to a sibling temporary file first and only becomes the target
 * through `rename`, which is atomic on the same filesystem — a reader sees
 * either the previous file or the complete new one, never a partial one.
 *
 * Durability is bought with two `fsync` calls: one on the file, so the bytes
 * are on disk before the rename, and one on the directory afterwards, so the
 * rename itself survives a crash. The second is best-effort, since not every
 * platform lets a directory be opened for that.
 *
 * The temporary file is created with `wx` and mode 0600 — it must not exist
 * already, and it is removed again on any failure.
 *
 * ⚠ The 0600 half is a POSIX-only guarantee. Windows maps a Node file mode
 * onto the read-only attribute alone, so the bits are silently discarded:
 * a file opened here with 0600 measures `666` (verified on Windows 11, Node 24).
 * Callers that write credentials — `sap.env` under the runtime home is the one
 * that matters — get no protection from this argument on Windows. What protects
 * them there is the DACL the file inherits from its directory, which is the
 * operator's to set: the default `~/.sapkit` inherits the user-profile DACL
 * (SYSTEM, Administrators, the user), while a runtime home moved elsewhere via
 * `SAPKIT_HOME_DIR`, or one an admin has granted a service or sandbox account
 * access to, inherits whatever that location carries.
 *
 * This function deliberately does not harden the DACL itself. Node exposes no
 * ACL API, so the only route is spawning `icacls`, and a helper that strips
 * inheritance would overrule access the machine's owner granted on purpose —
 * it cannot tell a stray principal from a service account that has to read the
 * profile. Stating the limit is the honest contract; widening it is the
 * operator's call, made on the directory.
 *
 * Node built-ins only. These helpers run inside hooks, which ship without
 * dependencies.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from 'fs';
import { basename, dirname, join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Create `dir` and any missing parents.
 *
 * A concurrent creator winning the race is success, not failure, so `EEXIST`
 * is swallowed; every other error is the caller's to handle.
 *
 * @param {string} dir directory to create
 */
export function ensureDirSync(dir) {
  if (existsSync(dir)) return;
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err.code === 'EEXIST') return;
    throw err;
  }
}

/**
 * Write `content` to `filePath` so that readers never observe a partial file.
 *
 * @param {string} filePath        target path; its directory is created if missing
 * @param {string|Buffer} content  text to store (written as UTF-8), or raw bytes
 */
export function atomicWriteFileSync(filePath, content) {
  const dir = dirname(filePath);
  const tempPath = join(dir, `.${basename(filePath)}.tmp.${randomUUID()}`);

  let fd = null;
  let renamed = false;

  try {
    ensureDirSync(dir);
    fd = openSync(tempPath, 'wx', 0o600);
    // `writeSync` reads its trailing arguments differently for each kind:
    // (fd, string, position, encoding) versus (fd, buffer, offset, length).
    // Handing a buffer to the string shape makes 'utf-8' the length argument,
    // so the two cases have to be told apart here.
    if (typeof content === 'string') writeSync(fd, content, 0, 'utf-8');
    else writeSync(fd, content, 0, content.length);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tempPath, filePath);
    renamed = true;

    try {
      const dirFd = openSync(dir, 'r');
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
    } catch {
      // Directory fsync is unavailable on some platforms — the rename stands.
    }
  } finally {
    // Anything a failure left behind is ours to clean up; neither cleanup can
    // be allowed to replace the error that got us here.
    if (fd !== null) {
      try { closeSync(fd); } catch { /* the descriptor dies with the process */ }
    }
    if (!renamed) {
      try { unlinkSync(tempPath); } catch { /* it may never have been created */ }
    }
  }
}
