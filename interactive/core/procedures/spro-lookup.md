# SPRO Lookup Protocol

**MANDATORY for all sapkit consultant personas and any procedure that needs SAP Customizing / IMG data.**

Whenever a module's SAP Customizing information is needed, walk the lookup in the order below. Steps 2 and 3 usually run together — the static docs name *which table to look at*, the live MCP call reports *what the customer actually configured*.

## Resolution Order

### 1. Local SPRO Cache (preferred — short-circuits everything below)

Look for `.sapkit/spro-config.json` at the project root.

- If present:
  - Load the file and read `modules.{MODULE}` for the module in question
  - Show the cache timestamp in your reasoning/output (e.g., "config snapshot: 2026-04-13T…")
  - **Do NOT call MCP** to re-fetch tables the cache already holds
  - When the user question targets a module missing from the cached `modules` map, fall through to Steps 2+3 for that module only
- A module-specific cache file `.sapkit/spro-config-{MODULE}.json` serves just as well when the merged file is absent
- Where no extraction artifact exists at all (fresh checkout, extraction never run), head straight to Steps 2+3 — static module knowledge plus a live system query reaches everything the cache would

The keys populated per module are typically: customizing tables, view contents, timestamp, extraction source.

### 2. Static Reference Docs — identify WHICH tables/views to read

Generic per-module reference docs ship in this repo under `../knowledge/modules/{MODULE}/`. They never carry the customer's actual configured values; what they give you is the names of the tables, views, BAPIs, and transactions the question touches:

- `../knowledge/modules/{MODULE}/spro.md` — SPRO customizing reference (IMG paths → underlying tables)
- `../knowledge/modules/{MODULE}/tcodes.md` — transaction codes
- `../knowledge/modules/{MODULE}/tables.md` — key tables
- `../knowledge/modules/{MODULE}/bapi.md` — BAPI / Function Module reference
- `../knowledge/modules/{MODULE}/enhancements.md` — BAdI / User Exit / BTE
- `../knowledge/modules/{MODULE}/workflows.md` — development workflows

Come out of this step holding a short-list of candidate tables/views — for example, "material type customizing → `T134` (header) + `T134T` (texts)". When the static doc fully answers the question on its own (purely conceptual / naming / BAPI signature), stop here and cite the file.

> **An IMG path is not one of those answers.** See the next sub-step before you quote one.

#### 2a. IMG node existence and wording — verify, never infer

Writing an IMG (SPRO) path from general SAP knowledge fails in two ways that look identical to a correct answer, both measured 2026-08-02 while annotating a build manual:

1. **The node may not exist at all.** Application transactions have no IMG activity behind them — `KS01`, `KP26`, `KO88`, `KSV5`, `KB21N`, `KB31N`, `KSB1`, `KOB1`, `KE5Z`, and `FB50` were each absent from `CUS_IMGACH`. Quoting a plausible path for one of these sends the user hunting through SPRO for a node that was never there.
2. **A node carrying the transaction code may be a different activity.** Activity IDs follow `SIMG_CFMENU<menu-area><TCODE>`, so a search on the transaction "finds" something — but `SIMG_CFMENUORKSKO01` reads *"Create **Accrual** Orders"*, which has nothing to do with creating an internal order. `KS01` (→ "Create Accrual Cost Centers") and `KA01` (→ "Create Accrual Cost Elements") carry the same trap.

So: a transaction code appearing inside an activity ID is **not** evidence that the node is the one you mean. Confirm both existence and wording against the live system before quoting a path — `CUS_IMGACH` for the activity, `CUS_IMGACT` with `SPRAS = 'E'` for its display text (see [modules/common/spro.md](../knowledge/modules/common/spro.md) → *IMG Activity Verification*). When the system is unreachable, state the path as unverified rather than presenting it as fact, and say which transactions may have no node.

Note the boundary: the **full IMG tree path** cannot be read from DDIC at all — the structure lives in SIMG objects, and `CUS_STRUC*` / `*IMGSTR*` do not exist. The tables above verify that an activity exists and what it is called; the breadcrumb above it still comes from the shipped module docs or from the user's own SPRO screen.

### 3. Live MCP Query — read the customer's actual customizing

Where the answer turns on the customer's real customizing values and not just table names, chain out of Step 2 into MCP:

1. Take the candidate table(s)/view(s) from Step 2
2. Put the plan in front of the user before the call, e.g.:
   "Local SPRO cache is not present. I'll read T134 / T134T via MCP to see the configured material types. This consumes tokens. Proceed?"
3. Once confirmed, call `GetTableContents` / `GetView` / `GetTable` for schema-only questions
4. Never reach the server silently — always show the cost implication and the chosen table list so the user can veto
5. Respect the [data-extraction policy](../policies/data-protection/data-extraction-policy.md) — some tables require `acknowledge_risk` plus explicit user authorization

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
        ├── question is "what is the name / signature?" ──► answer from static doc, done
        │
        ├── question is "what is the IMG path?" ──► Step 2a: confirm the activity exists
        │                                           and reads as you expect, then answer
        │
        └── question is "what is the customer's configured value?"
                 │
                 ▼
         Step 3: pick tables from Step 2, warn user, MCP GetTableContents
```

## Separate branch — Official SAP Help Portal (standard behavior & citations)

> **This branch is NOT a 4th rung on the ladder above.** Steps 1–3 ask *"what did THIS customer configure?"* (cache / static / MCP); what this branch asks is *"what is the STANDARD/official SAP behavior, and what can I cite?"* Hold that line — do not route every customizing question through a web fetch.

**Trigger (Tier 3 — on-demand):** load [help-portal-fetch](help-portal-fetch.md) and use this branch ONLY when the task needs authoritative official SAP documentation text — standard process/behavior, official config guidance, Fiori app help — and the local cache / static `../knowledge/modules/{MODULE}/*.md` cannot answer, or an explicit citation is required. Otherwise stay in Steps 1–3.

**Cost gate:** what goes out here is a public network fetch — lower risk than customer MCP, but not free. A single targeted lookup can run directly; broad or comprehensive retrieval states the network/token cost first, the same courtesy Step 3 extends.

**Module-consultant scope:** fetch **functional/module/config docs for your own module** only, using `tools/fetch/fetch-sap-help-doc.mjs` (ships with this plugin — when `$CLAUDE_PLUGIN_ROOT` is unavailable, use the manual fallback described in [help-portal-fetch](help-portal-fetch.md)). Handle **ABAP keyword/language** lookups and deep cross-topic doc research under the [sap-doc-specialist](../personas/sap-doc-specialist.md) persona — that is not module-consulting territory.

Workflow: web-search `<topic> help.sap.com` → pick the `/docs/<product>/<deliverable>/<topic>.html` result → run the fetch (script or manual fallback) → **cite the Source URL** and **state the SAP release** it reports. Out of scope: OSS Notes (me.sap.com — auth-walled).

## Generating the cache

The extractor ships with this plugin at `tools/extract/extract-spro.mjs` (pure
Node, no npm install). It is run **by the user, from the project root** — the
directory holding `.sapkit/` — against the active profile:

```bash
node "$CLAUDE_PLUGIN_ROOT/tools/extract/extract-spro.mjs" --dry-run SD MM
node "$CLAUDE_PLUGIN_ROOT/tools/extract/extract-spro.mjs" SD MM
node "$CLAUDE_PLUGIN_ROOT/tools/extract/extract-spro.mjs" all
```

One module writes `.sapkit/spro-config-{MODULE}.json`; two or more (or `all`)
write the merged `.sapkit/spro-config.json`. `--dry-run` lists every table that
would be read, the row cap, and the output path, and connects to nothing.

**Approval gate — this is a P2 action.** Each table is a `GetSqlQuery` row read,
so Gate B of [approval-gates](../policies/approval-gates.md) applies:

- **You do not run this for the user.** Recommend it, show the command, and let
  the user execute it. Never run it yourself, never delegate it to a subagent,
  and never use it as a route around the per-call approval you would otherwise
  owe (Gate B(c) — subagent and batch use are prohibited under every layer).
- The `--dry-run` output is the scope disclosure; the user running the command
  without `--dry-run` is the approval act for exactly that scope.
- Allowed scope is the IMG/Customizing tables named in the shipped
  `../knowledge/modules/{MODULE}/spro.md` files. The extractor never sets
  `acknowledge_risk`, so the server-side blocklist floor still decides: a
  `deny`/`ask`-tier table is refused, recorded in the output `errors[]`, and
  never written into the cache. (Measured 2026-07-26: of the 481 tables the
  15 shipped `spro.md` files resolve to, exactly one — `T012K`, house-bank
  account customizing — is on the blocklist.)
  [data-extraction-policy](../policies/data-protection/data-extraction-policy.md)
  stays authoritative for everything else.

## Extraction Awareness

- The cache is optional. Its absence is normal — Steps 2+3 fully cover the lookup without it.
- With the cache missing, you MAY recommend that the user run the SPRO extraction once the current task is done — but do not block the current task on it
- Read a stale cache (> 90 days, or a customizing change the user mentions) as a cue to suggest a refresh, while still preferring it over a live query unless the user explicitly opts out

## Persona Integration Checklist

Every consultant persona's `<Reference_Data>` section MUST list:

1. Local SPRO Cache (`.sapkit/spro-config.json` → `modules.{MODULE}`) — **priority 1**
2. Static reference (`../knowledge/modules/{MODULE}/spro.md` etc.) — for naming table/view candidates
3. Live MCP (`GetTableContents` / `GetView`) — for reading customer values, chained out of Step 2
4. Pointer to this protocol: `spro-lookup.md`
*(Triggered, not part of the always-on customizing path — do NOT preload):* when a standard/official SAP documentation citation is needed, use the separate "Official SAP Help Portal" branch above (read [help-portal-fetch](help-portal-fetch.md) on demand).

Any procedure that hands off to a consultant persona MUST carry a "local cache available: yes/no" flag in the handoff context, so the consultant can short-circuit the lookup decision.
