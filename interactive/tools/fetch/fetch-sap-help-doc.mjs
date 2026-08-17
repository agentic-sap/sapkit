#!/usr/bin/env node
/**
 * Reads one SAP Help Portal FUNCTIONAL page as plain text — no browser, no auth, no deps.
 *
 * Target material is application knowledge: configuration, process and module docs living at
 *   help.sap.com/docs/<product>/<deliverable>/<topic>.html
 * (SD pricing, FI dunning, MM release strategy, IMG concepts, Fiori app help …).
 * ABAP language/keyword reference is a different portal area with a different mechanism —
 * fetch-abap-keyword-doc.mjs handles that one.
 *
 * Why two requests instead of downloading the .html: that page is only an SPA shell, so the
 * prose is not in it. The portal serves the prose from its http.svc JSON endpoints, and the
 * second endpoint needs a numeric deliverable id that only the first one knows:
 *   deliverableMetadata(product, topic, version, deliverable) -> data.deliverable.id
 *   pagecontent(that id, topic)                               -> data.body   (HTML fragment)
 * Both are ordinary HTTPS GETs.
 *
 * Usage:
 *   node fetch-sap-help-doc.mjs "<full help.sap.com/docs URL>"
 *
 * Exit codes (a caller may branch on these):
 *   0  page fetched, text on stdout
 *   1  an http.svc call did not come back usable
 *   2  nothing fetchable was asked for — argument missing, or URL rejected before any request
 *   3  http.svc answered, but the answer carried no deliverable id / no body
 *
 * Not covered: SAP Notes on me.sap.com (an S-user login stands in front of them, so this method
 * cannot reach them) and the /docs/r/… readable-URL form, which this tool asks the caller to
 * convert rather than guess at.
 */

const SVC = 'https://help.sap.com/http.svc';
const PORTAL_HOST = 'help.sap.com';
const UNPINNED_VERSION = 'LATEST';

const EXIT_TRANSPORT = 1;
const EXIT_UNUSABLE_INPUT = 2;
const EXIT_EMPTY_ANSWER = 3;

/**
 * Splits a portal doc URL into the four coordinates http.svc wants, and refuses anything the
 * two-call chain cannot address. Throwing here is always an exit-2 situation: no request has
 * gone out yet, and none can.
 */
function readCoordinates(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Not a URL: ' + rawUrl);
  }
  if (parsed.hostname !== PORTAL_HOST) {
    throw new Error('This tool reads ' + PORTAL_HOST + ' only — got ' + parsed.hostname + '.');
  }

  // Canonical shape: /docs/<product>/<deliverable>/<topic>.html
  const segments = parsed.pathname.split('/').filter(Boolean);
  const docsAt = segments.indexOf('docs');

  if (docsAt >= 0 && segments[docsAt + 1] === 'r') {
    throw new Error(
      'The /docs/r/… readable-URL form carries no product segment, so the metadata call cannot be built. ' +
      'Supply the canonical /docs/<product>/<deliverable>/<topic>.html form instead: search again and take ' +
      'the help.sap.com hit whose path is not "/docs/r/", or open this page in a browser and copy the URL ' +
      'its address bar settles on.',
    );
  }
  if (docsAt < 0 || segments.length < docsAt + 4) {
    throw new Error('Not a /docs/<product>/<deliverable>/<topic>.html URL: ' + rawUrl);
  }

  // No ?version= means the portal picks; that is a fallback, and the printed header says so.
  const pinned = parsed.searchParams.get('version');
  return {
    product: segments[docsAt + 1],
    deliverable: segments[docsAt + 2],
    topic: segments[docsAt + 3],
    version: pinned || UNPINNED_VERSION,
    versionPinned: !!pinned,
  };
}

/** Step 1 of the chain — resolves the opaque deliverable id. */
function metadataUrl(at) {
  return `${SVC}/deliverableMetadata` +
    `?product_url=${encodeURIComponent(at.product)}` +
    `&topic_url=${encodeURIComponent(at.topic)}` +
    `&version=${encodeURIComponent(at.version)}` +
    `&loadlandingpageontopicnotfound=true` +
    `&deliverable_url=${encodeURIComponent(at.deliverable)}`;
}

/** Step 2 of the chain — the prose itself, keyed by the id step 1 returned. */
function pageContentUrl(deliverableId, topic) {
  return `${SVC}/pagecontent` +
    `?deliverableInfo=1` +
    `&deliverable_id=${deliverableId}` +
    `&file_path=${encodeURIComponent(topic)}`;
}

/** A default Node user-agent gets a shell back, so present as a browser and ask for JSON. */
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Flattens the returned HTML fragment to readable text, in this order — the order is the
 * behaviour: list markers must be inserted while the <li> tags still exist, and every entity
 * rule must run after tag removal.
 */
const TEXT_RULES = [
  [/<(script|style)[\s\S]*?<\/\1>/gi, ''],      // machinery, never prose
  [/<li[^>]*>/gi, '\n  - '],                    // bullets survive as dashes
  [/<\/(p|div|h[1-6]|tr|li|ul|ol)>/gi, '\n'],   // block ends become line breaks
  [/<th[^>]*>|<td[^>]*>/gi, ' | '],             // table rows stay column-separated
  [/<[^>]+>/g, ''],                             // whatever markup is left
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&amp;/g, '&'],
  [/&nbsp;/g, ' '],
  [/&#39;/g, "'"],
  [/&quot;/g, '"'],
  [/[ \t]+\n/g, '\n'],                          // trailing whitespace from the markup
  [/\n{3,}/g, '\n\n'],                          // at most one blank line
];

function toPlainText(fragment) {
  let text = String(fragment || '');
  for (const [pattern, replacement] of TEXT_RULES) text = text.replace(pattern, replacement);
  return text.trim();
}

function abort(message, code) {
  console.error(message);
  process.exit(code);
}

async function main() {
  const rawUrl = process.argv[2];
  if (!rawUrl) {
    abort('Usage: node fetch-sap-help-doc.mjs "<help.sap.com/docs URL>"', EXIT_UNUSABLE_INPUT);
  }

  let at;
  try {
    at = readCoordinates(rawUrl);
  } catch (err) {
    abort(err.message, EXIT_UNUSABLE_INPUT);
  }

  let metadata;
  try {
    metadata = await fetchJson(metadataUrl(at));
  } catch (err) {
    abort('METADATA ERROR: ' + err.message + ' (' + rawUrl + ')', EXIT_TRANSPORT);
  }
  const deliverableId = metadata?.data?.deliverable?.id;
  if (!deliverableId) {
    abort('Could not resolve deliverable_id — page may not exist or URL form unsupported.', EXIT_EMPTY_ANSWER);
  }

  let payload;
  try {
    payload = await fetchJson(pageContentUrl(deliverableId, at.topic));
  } catch (err) {
    abort('PAGECONTENT ERROR: ' + err.message, EXIT_TRANSPORT);
  }
  const body = payload?.data?.body;
  if (!body) {
    abort('No body content for ' + at.topic, EXIT_EMPTY_ANSWER);
  }

  const page = payload.data;
  // Whichever title is present is the citable one; the topic slug is the last resort.
  const heading = page.currentPage?.title || page.deliverable?.title || at.topic;
  const resolvedVersion = page.deliverable?.version || null;
  const versionNote = at.versionPinned
    ? ' [requested explicitly]'
    : ' [resolved from LATEST — pass ?version=<rel> for a release-specific page; confirm it matches the project release]';

  console.log([
    '# ' + heading,
    'Source: ' + rawUrl,
    'Deliverable: ' + (page.deliverable?.title || at.deliverable) + ' (id ' + deliverableId + ')',
    'Version: ' + (resolvedVersion || '(unknown)') + versionNote,
    '',
    toPlainText(body),
  ].join('\n'));
}

main();
