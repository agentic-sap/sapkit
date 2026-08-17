#!/usr/bin/env node
/**
 * SAPKIT — ABAP Keyword Documentation reader for help.sap.com (no browser, no eval)
 *
 * WHY A SPECIAL READER IS NEEDED
 * The abapdocu pages (`help.sap.com/doc/abapdocu_*`) are served by a SAPUI5
 * single-page app. The address a browser shows — `…/<topic>.htm` — is only the
 * client-side shell; fetched directly it answers "Page Not Found". The prose
 * lives one letter away, in the sibling `…/<topic>.html`, where the build has
 * inlined it as a JavaScript object literal handed to
 * `new sap.ui.model.json.JSONModel({ par1: "…", ul1: "…", code1: "…" })`.
 *
 * HOW THE LITERAL IS READ — WITHOUT RUNNING IT
 * Remote page text is never executed and never handed to `eval`, `Function`, or
 * `JSON.parse` on unvetted input. Instead the literal is located by scanning
 * characters: `sliceBalancedObject` walks forward from the opening brace keeping
 * a depth counter, skipping over anything inside quotes so that a `{` or `}`
 * printed in the documentation prose cannot end the object early. Inside that
 * slice, only `par<n>` / `ul<n>` / `code<n>` string values are lifted out, one
 * quoted run at a time, and their backslash escapes are expanded by an explicit
 * decoder. So the worst a hostile page could achieve is nonsense on stdout.
 *
 * USAGE
 *   node fetch-abap-keyword-doc.mjs <topic-or-help.sap.com-url>
 *   node fetch-abap-keyword-doc.mjs abenwhere_all_entries
 *
 * EXIT CODES
 *   0  documentation printed to stdout
 *   1  the page could not be retrieved (network failure or non-OK HTTP status)
 *   2  nothing to do: no argument, or an argument this reader will not accept
 *   3  page retrieved, but it holds no keyword-reference content model
 *
 * BOUNDARIES
 *   Contacts help.sap.com and nothing else. Node built-ins only, no packages,
 *   no credentials. Covers keyword/statement reference pages, i.e. the
 *   par/ul/code page template. Out of scope: OSS Notes behind an S-user login,
 *   and Help Portal products that are not abapdocu.
 */

const DOC_ROOT = 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US';
const ALLOWED_HOST = 'help.sap.com';

const LOOKS_LIKE_URL = /^https?:\/\//i;
const TOPIC_IN_PATH = /\/([A-Za-z0-9_]+)\.html?$/;
const TRAILING_HTML_SUFFIX = /\.html?$/i;
const TOPIC_ID = /^[A-Za-z0-9_]+$/;
const PAGE_TITLE = /<title>([^<]*)<\/title>/i;

const EXIT_UNREACHABLE = 1;
const EXIT_BAD_INVOCATION = 2;
const EXIT_NO_MODEL = 3;

// ---------------------------------------------------------------------------
// Argument → content URL
// ---------------------------------------------------------------------------

/**
 * Accepts either a bare topic id or a help.sap.com URL and returns the address
 * of the `.html` file that carries the text. Throws on anything else; every
 * throw here is an invocation problem, so main() maps it to exit 2.
 */
function resolveContentUrl(argument) {
  let topic = String(argument).trim();
  if (LOOKS_LIKE_URL.test(topic)) topic = topicFromUrl(topic);
  topic = topic.replace(TRAILING_HTML_SUFFIX, '');
  if (!TOPIC_ID.test(topic)) {
    throw new Error(`Not a usable topic id — letters, digits and underscore only: ${topic}`);
  }
  return `${DOC_ROOT}/${topic}.html`;
}

/** Narrow a supplied URL down to its topic id, refusing any other host. */
function topicFromUrl(candidate) {
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Could not read that as a URL: ${candidate}`);
  }
  if (parsed.hostname !== ALLOWED_HOST) {
    throw new Error(`This reader contacts ${ALLOWED_HOST} only — that URL points at ${parsed.hostname}.`);
  }
  const inPath = parsed.pathname.match(TOPIC_IN_PATH);
  if (!inPath) {
    throw new Error(`No abapdocu topic id at the end of that path: ${candidate}`);
  }
  return inPath[1];
}

// ---------------------------------------------------------------------------
// Locating and reading the embedded model — character scanning, never eval
// ---------------------------------------------------------------------------

/**
 * Return the `{ … }` run that starts at openIndex, matched by brace depth.
 * Quoted spans are stepped over wholesale (honouring backslash escapes) so a
 * brace inside a documentation string never counts toward the depth.
 * Null when the braces never balance before the text runs out.
 */
function sliceBalancedObject(source, openIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let at = openIndex; at < source.length; at++) {
    const ch = source[at];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(openIndex, at + 1);
    }
  }
  return null;
}

/**
 * Read one quoted run starting at `from`, which must be the first character
 * after the opening quote. Escapes are carried through untouched — decoding is
 * a separate step — so the scan only has to know that a backslash makes the
 * next character ordinary, including a quote that would otherwise close.
 * Reports where the closing quote sits (or where the text ended).
 */
function readQuotedRun(source, from, quote) {
  let body = '';
  let at = from;
  let escaped = false;
  for (; at < source.length; at++) {
    const ch = source[at];
    if (escaped) {
      body += '\\' + ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quote) break;
    body += ch;
  }
  return { body, closesAt: at };
}

const SHORT_ESCAPE = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['r', '\r'],
  ['b', '\b'],
  ['f', '\f'],
  ['v', '\v'],
  ['0', '\0'],
]);

/** Expand the backslash escapes of a JS string literal body into real text. */
function expandEscapes(body) {
  return String(body).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, sequence) => {
    const lead = sequence[0];
    if (lead === 'u' || lead === 'x') return String.fromCharCode(parseInt(sequence.slice(1), 16));
    if (SHORT_ESCAPE.has(lead)) return SHORT_ESCAPE.get(lead);
    return sequence; // \" → "  \\ → \  \/ → /  \<newline> → <newline>
  });
}

/**
 * Harvest the par/ul/code string values out of one object literal. Keys are
 * matched by pattern rather than by parsing the whole object, and scanning
 * always resumes past the closing quote so string contents are never mistaken
 * for further keys. First value wins if a key somehow repeats.
 * Null when the literal contributes no fields at all.
 */
function collectContentFields(objectSource) {
  const fieldHead = /\b(par|ul|code)(\d+)\s*:\s*("|')/g;
  const fields = {};
  let head;
  while ((head = fieldHead.exec(objectSource))) {
    const key = head[1] + head[2];
    const run = readQuotedRun(objectSource, fieldHead.lastIndex, head[3]);
    if (fields[key] === undefined) fields[key] = expandEscapes(run.body);
    fieldHead.lastIndex = run.closesAt + 1;
  }
  return Object.keys(fields).length ? fields : null;
}

/**
 * Walk every JSONModel construction on the page and return the first one that
 * looks like a documentation model — a `par1` field is the tell, since the same
 * page also builds small models for navigation and versioning.
 */
function findContentModel(pageSource) {
  const modelCall = /JSONModel\(\s*\{/g;
  let call;
  while ((call = modelCall.exec(pageSource))) {
    const objectSource = sliceBalancedObject(pageSource, pageSource.indexOf('{', call.index));
    if (!objectSource || !/\bpar1\s*:\s*["']/.test(objectSource)) continue;
    const fields = collectContentFields(objectSource);
    if (fields && fields.par1) return fields;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rendering the model as plain text
// ---------------------------------------------------------------------------

// Applied in order: block-level tags become line breaks first, then the rest of
// the markup is dropped, then entities are resolved, then whitespace is tidied.
const TEXT_REWRITES = [
  [/<pre[^>]*>/gi, '\n'],
  [/<\/pre>/gi, '\n'],
  [/<li[^>]*>/gi, '\n  - '],
  [/<\/p>/gi, '\n'],
  [/<[^>]+>/g, ''],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&amp;/g, '&'],
  [/&#x9;/g, '  '],
  [/&#xA;/g, '\n'],
  [/&nbsp;/g, ' '],
  [/[ \t]+\n/g, '\n'],
  [/\n{3,}/g, '\n\n'],
];

/** Reduce a documentation HTML fragment to readable plain text. */
function htmlToText(fragment) {
  let text = String(fragment || '');
  for (const [pattern, replacement] of TEXT_REWRITES) text = text.replace(pattern, replacement);
  return text.trim();
}

// The three field families, in the order they are printed. `par` carries the
// running description and needs no heading of its own.
const SECTIONS = [
  { prefix: 'par', keyPattern: /^par\d+$/, heading: null, fenced: false },
  { prefix: 'ul', keyPattern: /^ul\d+$/, heading: '\n## Hints / Restrictions', fenced: false },
  { prefix: 'code', keyPattern: /^code\d+$/, heading: '\n## Examples', fenced: true },
];

/**
 * Assemble the printable document. Fields arrive keyed by family and number
 * (`par1`, `par2`, `ul1`, …); each family is emitted in numeric order, because
 * the key order in the page source is not reliably the reading order.
 */
function formatDocument(fields) {
  const buckets = SECTIONS.map(() => []);
  for (const [key, fragment] of Object.entries(fields)) {
    const text = htmlToText(fragment);
    if (!text) continue;
    const which = SECTIONS.findIndex((section) => section.keyPattern.test(key));
    if (which === -1) continue;
    const order = Number(key.slice(SECTIONS[which].prefix.length));
    buckets[which].push([order, text]);
  }

  const blocks = [];
  SECTIONS.forEach((section, which) => {
    const bucket = buckets[which];
    if (!bucket.length) return;
    if (section.heading) blocks.push(section.heading);
    bucket.sort((left, right) => left[0] - right[0]);
    for (const [, text] of bucket) {
      blocks.push(section.fenced ? '```abap\n' + text + '\n```' : text);
    }
  });
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------

async function main() {
  const argument = process.argv[2];
  if (!argument) {
    console.error('Usage: node fetch-abap-keyword-doc.mjs <topic-or-help.sap.com-url>');
    process.exit(EXIT_BAD_INVOCATION);
  }

  let url;
  try {
    url = resolveContentUrl(argument);
  } catch (problem) {
    console.error(problem.message);
    process.exit(EXIT_BAD_INVOCATION);
  }

  let response;
  try {
    response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' } });
  } catch (problem) {
    console.error('FETCH FAILED: ' + problem.message);
    process.exit(EXIT_UNREACHABLE);
  }
  if (!response.ok) {
    console.error(`HTTP ${response.status} from ${url} — check the topic id against the abapdocu index.`);
    process.exit(EXIT_UNREACHABLE);
  }

  const pageSource = await response.text();
  const fields = findContentModel(pageSource);
  if (!fields) {
    console.error('NO_CONTENT_MODEL: no keyword/statement reference content on this page (' + url + ')');
    process.exit(EXIT_NO_MODEL);
  }

  const title = pageSource.match(PAGE_TITLE);
  console.log('# ' + (title ? title[1].trim() : argument));
  console.log('Source: ' + url + '\n');
  console.log(formatDocument(fields));
}

main();
