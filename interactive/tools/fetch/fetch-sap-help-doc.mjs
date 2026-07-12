#!/usr/bin/env node
/**
 * sc4sap — SAP Help Portal FUNCTIONAL / module doc fetcher (browserless)
 *
 * For application/configuration/process docs at
 *   help.sap.com/docs/<product>/<deliverable>/<topic>.html
 * (e.g. SD pricing, FI config, MM procurement — the consultant/module knowledge).
 *
 * This is a DIFFERENT mechanism from the ABAP keyword fetcher: the `.html` here is
 * an empty SPA shell; the real content is delivered by the http.svc JSON API.
 * Chain (all plain HTTPS GET, no browser, no auth):
 *   1. deliverableMetadata(product_url, deliverable_url, topic_url) -> data.deliverable.id
 *   2. pagecontent(deliverable_id, file_path)                       -> data.body (HTML)
 *
 * Usage:
 *   node fetch-sap-help-doc.mjs "<full help.sap.com/docs URL>"
 *
 * Scope: help.sap.com application/functional docs only.
 * Out of scope: OSS Notes (me.sap.com — auth-walled) and the `/docs/r/...` readable-URL form.
 */

const SVC = 'https://help.sap.com/http.svc';

function parseDocUrl(input) {
  let u;
  try { u = new URL(input); } catch { throw new Error('Invalid URL: ' + input); }
  if (u.hostname !== 'help.sap.com') throw new Error('Only help.sap.com URLs are allowed (got ' + u.hostname + ').');
  const parts = u.pathname.split('/').filter(Boolean); // [docs, <product>, <deliverable>, <topic>.html]
  const di = parts.indexOf('docs');
  if (di >= 0 && parts[di + 1] === 'r') {
    throw new Error('Readable-URL form (/docs/r/...) is not supported. Get the canonical /docs/<product>/<deliverable>/<topic>.html form: re-run WebSearch and pick the help.sap.com result whose path is NOT "/docs/r/", or open the page and copy its address-bar canonical URL.');
  }
  if (di < 0 || parts.length < di + 4) {
    throw new Error('Expected a /docs/<product>/<deliverable>/<topic>.html URL: ' + input);
  }
  const explicit = u.searchParams.get('version');
  return {
    product: parts[di + 1],
    deliverable: parts[di + 2],
    topic: parts[di + 3],
    version: explicit || 'LATEST',
    versionExplicit: !!explicit,
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const strip = h => String(h || '')
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<li[^>]*>/gi, '\n  - ')
  .replace(/<\/(p|div|h[1-6]|tr|li|ul|ol)>/gi, '\n')
  .replace(/<th[^>]*>|<td[^>]*>/gi, ' | ')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

async function main() {
  const input = process.argv[2];
  if (!input) { console.error('Usage: node fetch-sap-help-doc.mjs "<help.sap.com/docs URL>"'); process.exit(2); }
  let p;
  try { p = parseDocUrl(input); } catch (e) { console.error(e.message); process.exit(2); }

  let meta;
  try {
    meta = await getJson(`${SVC}/deliverableMetadata?product_url=${encodeURIComponent(p.product)}&topic_url=${encodeURIComponent(p.topic)}&version=${encodeURIComponent(p.version)}&loadlandingpageontopicnotfound=true&deliverable_url=${encodeURIComponent(p.deliverable)}`);
  } catch (e) { console.error('METADATA ERROR: ' + e.message + ' (' + input + ')'); process.exit(1); }
  const did = meta?.data?.deliverable?.id;
  if (!did) { console.error('Could not resolve deliverable_id — page may not exist or URL form unsupported.'); process.exit(3); }

  let page;
  try {
    page = await getJson(`${SVC}/pagecontent?deliverableInfo=1&deliverable_id=${did}&file_path=${encodeURIComponent(p.topic)}`);
  } catch (e) { console.error('PAGECONTENT ERROR: ' + e.message); process.exit(1); }
  const body = page?.data?.body;
  if (!body) { console.error('No body content for ' + p.topic); process.exit(3); }

  const d = page.data;
  const title = (d.currentPage && d.currentPage.title) || (d.deliverable && d.deliverable.title) || p.topic;
  const resolvedVer = (d.deliverable && d.deliverable.version) || null;
  console.log('# ' + title);
  console.log('Source: ' + input);
  console.log('Deliverable: ' + ((d.deliverable && d.deliverable.title) || p.deliverable) + ' (id ' + did + ')');
  console.log('Version: ' + (resolvedVer || '(unknown)') +
    (p.versionExplicit ? ' [requested explicitly]'
                       : ' [resolved from LATEST — pass ?version=<rel> for a release-specific page; confirm it matches the project release]') + '\n');
  console.log(strip(body));
}

main();
