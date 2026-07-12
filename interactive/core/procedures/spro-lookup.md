# SPRO Lookup Protocol

**MANDATORY for all sc4sap consultant personas and any procedure that needs SAP Customizing / IMG data.**

When you need SAP Customizing information for a module, resolve the lookup in this order. Steps 2 and 3 are typically combined — the static docs tell you *which table to look at*, the live MCP call tells you *what the customer actually configured*.

## Resolution Order

### 1. Local SPRO Cache (preferred — short-circuits everything below)

Check for `.sc4sap/spro-config.json` at the project root.

- If present:
  - Load the file and use `modules.{MODULE}` for the target module
  - Surface the cache timestamp in your reasoning/output (e.g., "config snapshot: 2026-04-13T…")
  - **Do NOT call MCP** to re-fetch tables that already exist in the cache
  - If the user question targets a module that is missing from the cached `modules` map, fall through to Steps 2+3 for that module only
- Module-specific cache files `.sc4sap/spro-config-{MODULE}.json` are also acceptable if the merged file is absent
- If no extraction artifact exists at all (fresh checkout, extraction never run), go directly to Steps 2+3 — the static module knowledge plus a live system query covers everything the cache would

Per-module populated keys typically include: customizing tables, view contents, timestamp, extraction source.

### 2. Static Reference Docs — identify WHICH tables/views to read

This repo ships generic reference docs per module under `../knowledge/modules/{MODULE}/`. These never contain the customer's actual configured values, but they tell you the names of the tables, views, BAPIs, and transactions relevant to the question:

- `../knowledge/modules/{MODULE}/spro.md` — SPRO customizing reference (IMG paths → underlying tables)
- `../knowledge/modules/{MODULE}/tcodes.md` — transaction codes
- `../knowledge/modules/{MODULE}/tables.md` — key tables
- `../knowledge/modules/{MODULE}/bapi.md` — BAPI / Function Module reference
- `../knowledge/modules/{MODULE}/enhancements.md` — BAdI / User Exit / BTE
- `../knowledge/modules/{MODULE}/workflows.md` — development workflows

Use this step to produce a short-list of candidate tables/views — for example, "material type customizing → `T134` (header) + `T134T` (texts)". If the static doc alone fully answers the question (purely conceptual / naming / BAPI signature), stop here and cite the file.

### 3. Live MCP Query — read the customer's actual customizing

If the answer depends on the customer's real customizing values (not just table names), chain from Step 2 into MCP:

1. Identify candidate table(s)/view(s) from Step 2
2. Surface the plan to the user before the call, e.g.:
   "Local SPRO cache is not present. I'll read T134 / T134T via MCP to see the configured material types. This consumes tokens. Proceed?"
3. On confirm, call `GetTableContents` / `GetView` / `GetTable` for schema-only questions
4. Never silently hit the server — always surface the cost implication and the chosen table list so the user can veto
5. Respect the [data-extraction policy](../policies/data-protection/data-extraction-policy.md) — some tables require `acknowledge_risk` and explicit user authorization

### Decision flow summary

```
question about SAP customizing
        │
        ▼
  cache present?
    yes ──► use cache, done
     no
        │
        ▼
  Step 2: read ../knowledge/modules/{MODULE}/*.md
        │
        ├── question is "what is the name / signature / IMG path?" ──► answer from static doc, done
        │
        └── question is "what is the customer's configured value?"
                 │
                 ▼
         Step 3: pick tables from Step 2, warn user, MCP GetTableContents
```

## Separate branch — Official SAP Help Portal (standard behavior & citations)

> **This is NOT a 4th step of the ladder above.** Steps 1–3 answer *"what did THIS customer configure?"* (cache / static / MCP). This branch answers *"what is the STANDARD/official SAP behavior, and what can I cite?"* Keep them distinct — do not route every customizing question through a web fetch.

**Trigger (Tier 3 — on-demand):** load [help-portal-fetch](help-portal-fetch.md) and use this branch ONLY when the task needs authoritative official SAP documentation text — standard process/behavior, official config guidance, Fiori app help — and the local cache / static `../knowledge/modules/{MODULE}/*.md` cannot answer, or an explicit citation is required. Otherwise stay in Steps 1–3.

**Cost gate:** these are public network fetches (lower risk than customer MCP, but not free). For a single targeted lookup, run it directly. For broad/comprehensive retrieval, state the network/token cost first — same courtesy as Step 3.

**Module-consultant scope:** fetch **functional/module/config docs for your own module** only, using `tools/fetch/fetch-sap-help-doc.mjs` (ships with this plugin — when `$CLAUDE_PLUGIN_ROOT` is unavailable, use the manual fallback described in [help-portal-fetch](help-portal-fetch.md)). Handle **ABAP keyword/language** lookups and deep cross-topic doc research under the [sap-doc-specialist](../personas/sap-doc-specialist.md) persona — that is not module-consulting territory.

Workflow: web-search `<topic> help.sap.com` → pick the `/docs/<product>/<deliverable>/<topic>.html` result → run the fetch (script or manual fallback) → **cite the Source URL** and **state the SAP release** it reports. Out of scope: OSS Notes (me.sap.com — auth-walled).

## Extraction Awareness

- The cache is produced by an optional SPRO extraction utility from the original plugin's setup; this repo does not bundle the extractor. Its absence is normal — Steps 2+3 fully cover the lookup without it.
- If the cache is missing, you MAY recommend the user run the SPRO extraction (if their environment provides it) after the current task — but do not block the current task on it
- Treat a stale cache (> 90 days, or user-indicated customizing change) as a prompt to suggest refresh, but still prefer it over live query unless the user explicitly opts out

## Persona Integration Checklist

Every consultant persona's `<Reference_Data>` section MUST list:

1. Local SPRO Cache (`.sc4sap/spro-config.json` → `modules.{MODULE}`) — **priority 1**
2. Static reference (`../knowledge/modules/{MODULE}/spro.md` etc.) — to identify table/view candidates
3. Live MCP (`GetTableContents` / `GetView`) — to read customer values, chained from Step 2
4. Pointer to this protocol: `spro-lookup.md`
*(Triggered, not part of the always-on customizing path — do NOT preload):* when a standard/official SAP documentation citation is needed, use the separate "Official SAP Help Portal" branch above (read [help-portal-fetch](help-portal-fetch.md) on demand).

Any procedure that hands off to a consultant persona MUST state a "local cache available: yes/no" flag in the handoff context so the consultant can short-circuit the lookup decision.
