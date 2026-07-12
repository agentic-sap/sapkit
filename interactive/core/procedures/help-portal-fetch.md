# SAP Help Portal Fetch Protocol (browserless)

**For retrieving AUTHORITATIVE official SAP documentation text from help.sap.com.**

`help.sap.com` is a JavaScript SPA — a plain web fetch / `curl` on a doc URL returns an empty shell or "Page Not Found", NOT the content. Two bundled Node scripts (`tools/fetch/fetch-abap-keyword-doc.mjs`, `tools/fetch/fetch-sap-help-doc.mjs`) retrieve the real text without a browser. Use them; the manual fallback below (same mechanism, done by hand) exists only for environments where `$CLAUDE_PLUGIN_ROOT` isn't wired up. Either way, never cite help.sap.com from memory when the content can be fetched.

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
Both print the official body text (description, restrictions, examples / config steps) plus the source URL for citation. If `$CLAUDE_PLUGIN_ROOT` is not set in your environment, apply the **manual fallback** in the Rules section — it reproduces exactly what the scripts automate (see "Why these work").

## How to find the URL (when you only have a topic)

1. Web-search the topic restricted to help.sap.com, e.g. `MM release strategy purchase order help.sap.com` or `SELECT FOR ALL ENTRIES help.sap.com`.
2. Take the resulting `help.sap.com` URL:
   - `…/doc/abapdocu_…/<topic>.htm` → pass the `<topic>` (or the URL) to `fetch-abap-keyword-doc.mjs` (or apply the ABAP manual fallback)
   - `…/docs/<product>/<deliverable>/<topic>.html` → pass the full URL to `fetch-sap-help-doc.mjs` (or apply the functional manual fallback)
3. Run the matching fetch; cite the printed Source URL.

## Why these work (so you can fix/extend)

- **ABAP keyword docs**: content is embedded in the `.html` as a `new sap.ui.model.json.JSONModel({ par1, … })` literal (note `.html`, not the `.htm` SPA route). The script extracts it.
- **Functional docs**: the `.html` is an empty shell; content arrives via the `http.svc` JSON API. The script chains `deliverableMetadata` (→ `data.deliverable.id`) then `pagecontent` (→ `data.body`).

## Rules

- **Cite the Source URL** of the fetched page. Never present help.sap.com content from memory when it can be fetched.
- **Specify the SAP release.** The functional fetcher prints the resolved version; if it resolved from `LATEST` that is a FALLBACK, not authoritative — for release-specific guidance pass `?version=<rel>` in the URL and confirm it matches the project's `.sc4sap/config.json` release (ECC vs S/4HANA).
- **Role split.** Module consultant personas fetch their OWN module's functional/config docs only; ABAP keyword/language lookups and deep cross-topic doc research belong to the [sap-doc-specialist](../personas/sap-doc-specialist.md) persona.
- **Manual fallback.** `fetch-abap-keyword-doc.mjs` / `fetch-sap-help-doc.mjs` ship with this plugin at `tools/fetch/`. If `$CLAUDE_PLUGIN_ROOT` is unavailable in your environment, do it manually (same mechanism — see "Why these work"): for ABAP keyword docs, `curl` the `.html` page (not the `.htm` SPA route) and read the `par*/ul*/code*` strings from the embedded JSONModel literal; for functional docs, call `http.svc/deliverableMetadata` (→ `data.deliverable.id`) then `http.svc/pagecontent` (→ `data.body`).

## Scope / limits (be honest)

- ✅ help.sap.com ABAP keyword docs + application/functional/config docs.
- ❌ **OSS Notes (me.sap.com)** — auth-walled (S-user login). NOT retrievable by this method; web-search for the note + state plainly that full text needs SAP support login.
- ❌ The `/docs/r/…` readable-URL variant — pass the canonical `/docs/<product>/<deliverable>/<topic>.html` form instead.
