# SAP Help Portal Fetch Protocol (browserless)

**For retrieving AUTHORITATIVE official SAP documentation text from help.sap.com.**

Because `help.sap.com` renders as a JavaScript SPA, pointing a plain web fetch / `curl` at a doc URL hands back an empty shell or "Page Not Found" — NOT the content. Two bundled Node scripts (`tools/fetch/fetch-abap-keyword-doc.mjs`, `tools/fetch/fetch-sap-help-doc.mjs`) pull the real text down without a browser. Reach for them first; the manual fallback below runs the same mechanism by hand and exists only for environments where `$CLAUDE_PLUGIN_ROOT` isn't wired up. On either path, never cite help.sap.com from memory when the content can be fetched.

> Node only, no extra deps, no auth.

## Which script to use

| You need… | Script | Input |
|---|---|---|
| **ABAP language / keyword reference** (SELECT, syntax, statements, ABAP types) | `tools/fetch/fetch-abap-keyword-doc.mjs` | topic id (`abenwhere_all_entries`) or any abapdocu URL |
| **Functional / module / config / process docs** (SD pricing, FI dunning, MM release strategy, IMG concepts, Fiori app help) | `tools/fetch/fetch-sap-help-doc.mjs` | a full `help.sap.com/docs/<product>/<deliverable>/<topic>.html` URL |

```bash
node "$CLAUDE_PLUGIN_ROOT/tools/fetch/fetch-abap-keyword-doc.mjs" abenwhere_all_entries
node "$CLAUDE_PLUGIN_ROOT/tools/fetch/fetch-sap-help-doc.mjs" "https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/<deliverable>/<topic>.html"
```
Each script emits the official body text (description, restrictions, examples / config steps) followed by the source URL you cite. Where `$CLAUDE_PLUGIN_ROOT` is not set in your environment, apply the **manual fallback** in the Rules section — it walks exactly the path the scripts automate (see "Why these work").

## How to find the URL (when you only have a topic)

1. Search the web for the topic with results restricted to help.sap.com — e.g. `MM release strategy purchase order help.sap.com` or `SELECT FOR ALL ENTRIES help.sap.com`.
2. Read the shape of the `help.sap.com` URL that comes back:
   - `…/doc/abapdocu_…/<topic>.htm` → hand the `<topic>` (or the URL) to `fetch-abap-keyword-doc.mjs` (or apply the ABAP manual fallback)
   - `…/docs/<product>/<deliverable>/<topic>.html` → hand the full URL to `fetch-sap-help-doc.mjs` (or apply the functional manual fallback)
3. Run whichever fetch matched; cite the Source URL it prints.

## Why these work (so you can fix/extend)

- **ABAP keyword docs**: the body sits inside the `.html` itself, as a `new sap.ui.model.json.JSONModel({ par1, … })` literal (note `.html`, not the `.htm` SPA route) — the script lifts it out of there.
- **Functional docs**: nothing but an empty shell lives in the `.html`; the body is delivered by the `http.svc` JSON API instead, so the script chains `deliverableMetadata` (→ `data.deliverable.id`) into `pagecontent` (→ `data.body`).

## Rules

- **Cite the Source URL** of the page you fetched. Never hand back help.sap.com content from memory while fetching it remains possible.
- **Specify the SAP release.** The functional fetcher reports the version it resolved; a version that resolved from `LATEST` is a FALLBACK rather than authoritative — for release-specific guidance put `?version=<rel>` in the URL and check it against the project's `.sapkit/config.json` release (ECC vs S/4HANA).
- **Role split.** A module consultant persona fetches its OWN module's functional/config docs only; ABAP keyword/language lookups and deep cross-topic doc research sit with the [sap-doc-specialist](../personas/sap-doc-specialist.md) persona.
- **Manual fallback.** `fetch-abap-keyword-doc.mjs` / `fetch-sap-help-doc.mjs` ship with this plugin at `tools/fetch/`. Where `$CLAUDE_PLUGIN_ROOT` is unavailable in your environment, run the mechanism by hand (same steps — see "Why these work"): for ABAP keyword docs, `curl` the `.html` page (not the `.htm` SPA route) and read the `par*/ul*/code*` strings out of the embedded JSONModel literal; for functional docs, call `http.svc/deliverableMetadata` (→ `data.deliverable.id`) and then `http.svc/pagecontent` (→ `data.body`).

## Scope / limits (be honest)

- ✅ help.sap.com ABAP keyword docs + application/functional/config docs.
- ❌ **OSS Notes (me.sap.com)** — sit behind an auth wall (S-user login). NOT retrievable by this method; web-search for the note + state plainly that full text needs SAP support login.
- ❌ The `/docs/r/…` readable-URL variant — hand over the canonical `/docs/<product>/<deliverable>/<topic>.html` form instead.
