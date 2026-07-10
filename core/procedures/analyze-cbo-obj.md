---
name: analyze-cbo-obj
description: Analyze a CBO (Customer Business Object) package — discover frequently-used Z tables / function modules / data elements / classes / structures / table types — and save a per-module / per-package reference file so later program / program-to-spec runs prefer existing CBO elements over new ones.
source:
  - sc4sap-custom/skills/analyze-cbo-obj/SKILL.md
  - sc4sap-custom/skills/analyze-cbo-obj/workflow-steps.md
---

# Analyze CBO Objects

Walk a CBO (Customer Business Object) package, inventory every project-built ABAP element (table, structure, data element, class, interface, function module, program, view, table type), detect which elements are **frequently reused inside the package**, infer each element's business purpose from its name/fields/descriptions, and persist the result to `.sc4sap/cbo/<MODULE>/<PACKAGE>/` for downstream procedures (`create-program`, [program-to-spec](program-to-spec.md), `create-object`) to consult before creating anything new.

## Purpose

Projects accumulate Z tables, Z data elements, Z function modules, and ZCL_ classes that encode domain logic. New development too often recreates near-duplicates because nobody has a compact inventory of what already exists. This procedure produces that inventory — once per package — and writes it to a file that later procedures read automatically, so the next spec / program / object creation defaults to reusing proven CBO assets.

## When to Use

- Starting development on a module that already has a sizeable Z-package
- Onboarding onto an AMS / support engagement (need a map of custom assets)
- Before `create-program` or `create-object` on a new spec — so reuse is evaluated
- User says "analyze CBO", "analyze custom objects", "map Z package", "list frequently used customs", "CBO inventory"

## When NOT to Use

- User wants a code quality review of one object → `analyze-code`
- User wants to reverse-engineer ONE program into a spec → [program-to-spec](program-to-spec.md)
- User wants to create an object → `create-object`
- Package does not yet contain custom objects (CBO discovery is not meaningful)

## Workflow Steps

The flow is: **3 Socratic intake steps** (Step 1 / 1.5 / 2) → **the inventory walk** (Steps 3–7, performed by adopting the sap-stocker persona) → **a branching hand-off summary** (Step 8).

### Socratic intake

**Step 1 — Ask for the CBO package name** (exactly one question)
> "Which CBO package do you want to analyze? (e.g., `ZSD_MAIN`, `ZMM_CORE`). If you only know a prefix like `ZSD*`, tell me the prefix and I will search for packages."

- If the user gives a prefix pattern: call `SearchObject(objectType='DEVC', query=<prefix>)` and list matches, then re-ask.
- Verify the final package with `GetPackage(<name>)`. If it does not exist, report and stop.

**Step 1.5 — Ask about flagship programs in this package** (exactly one question, optional)
> "Are there any programs in this package that are especially frequently used? If yes, list them comma-separated (e.g., `ZSDR_ORDER_ALV, ZSDR_BILL_POST`). Type `skip` if none or unknown."

- Accept comma-separated PROG names. Normalize to uppercase and trim whitespace.
- Verify each name via `SearchObject(<name>, PROG)`. For unknown names, print a one-line warning (`"ZXXX not found — ignored"`) and drop them.
- Keep the validated list as `<KEY_PROGRAMS>` (may be empty).
- **Why this step exists**: CBO objects referenced by user-marked flagship programs carry stronger business signal than pure internal reference count. In the scoring pass they receive a `key_boost = len(used_by_key_programs) * 10` so they surface at the top of the inventory.

**Step 2 — Ask which module this package belongs to** (exactly one question, constrained list)
> "Which SAP module does this package belong to? Pick one of: SD / MM / PP / PM / QM / WM / TM / TR / FI / CO / HCM / BW / PS / Ariba."

- Valid values = the module folder list under `core/knowledge/modules/`. Reject anything else and re-ask.
- Normalize to uppercase (e.g., `sd` → `SD`) and verify `../knowledge/modules/<MODULE>/` exists.

### Inventory walk (Steps 3–7)

Adopt the [sap-stocker](../personas/sap-stocker.md) persona for these steps and perform the full inventory pass yourself — walk → where-used graph → classify → interpret → cross-module gap → safety → persist. The persona file's § Investigation_Protocol and § Output_Format are the authoritative spec; the summary:

- **Walk** (`GetPackageContents` + `GetPackageTree`): TABL / STRU / TTYP / DTEL / DOMA / VIEW / CLAS / INTF / FUGR / PROG (+ DDLS / BDEF / SRVB on S/4).
- **Reference graph** (`GetWhereUsed` per object, filtered to in-package callers): `ref_count`, `used_by_key_programs`, `key_boost`, `score`.
- **Frequently-used tier**: package-size thresholds (small <30 → ref_count ≥2 · medium 30–150 → ≥3 · large >150 → ≥5); flagship-referenced → always pinned.
- **Business purpose inference** (DDIC signals): role classification — `header / line / log / mapping / classification / config / util / service / event / dto` — plus 1–2 sentence purpose.
- **Cross-module gap** (read `SAP_ACTIVE_MODULES` from `sap.env` / `config.json`, see [project-context](../project-context.md)): per the [active-modules](../knowledge/modules/common/active-modules.md) matrix, flag expected-but-missing integration fields (e.g., MM CBO without `PS_POSID` when PS is active) → `inventory.json → crossModuleGaps[]`.
- **Sensitive-name check** against [custom-patterns](../policies/data-protection/custom-patterns.md) (PII / HR / CUST / BANK / PRICE / ...). Never call `GetTableContents` or `GetSqlQuery`.
- **Persist** `.sc4sap/cbo/<MODULE>/<PACKAGE>/{index.md, inventory.json}` (+ optional `raw-walk.md` if the package has <200 objects).
- **Classify the result** as `Logic-heavy: <true|false>` per the persona's Output_Format rule (drives Step 8 branching).

`inventory.json` schema example (authoritative — also consumed by `create-program` / `create-object`):

```json
{
  "package": "ZSD_MAIN",
  "module": "SD",
  "scanned_at": "<ISO timestamp>",
  "sap_version": "<S4|ECC>",
  "key_programs": ["ZSDR_ORDER_ALV", "ZSDR_BILL_POST"],
  "objects": [
    {
      "name": "ZSD_ORDER_LOG",
      "type": "TABL",
      "ref_count": 7,
      "key_boost": 20,
      "score": 27,
      "used_by_key_programs": ["ZSDR_ORDER_ALV", "ZSDR_BILL_POST"],
      "role": "log",
      "purpose": "append-only sales-order processing log keyed by VBELN",
      "keys": ["MANDT", "VBELN", "POSNR", "LOGDATE"],
      "fk_to_standard": ["VBAK-VBELN", "VBAP-POSNR"],
      "reuse_hint": "extend this table instead of creating a new order log — used by both flagship programs"
    }
  ],
  "crossModuleGaps": []
}
```

Sort order in `objects[]`: every object with `used_by_key_programs` non-empty first, then the rest by `score` descending.

Sort order in `index.md`:
1. `## 📌 Pinned — used by flagship programs` (grouped by the flagship program that pulls each in)
2. `## Frequently used tables`, `## Frequently used structures`, ... (remaining non-pinned frequently-used objects, by score descending)
3. `## Sensitive CBO objects` (name-pattern flagged; suggest additions to `.sc4sap/blocklist-extend.txt`)

### Hand-off (Step 8 — branches on `Logic-heavy` flag)

**Branch A — `Logic-heavy: false` (DDIC-dominant package) · canned summary**

Print:
```
CBO inventory written:
  .sc4sap/cbo/<MODULE>/<PACKAGE>/index.md
  .sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json

📌 Pinned (used by flagship programs [P1, P2]): P objects — always surfaced first
Frequently used: N tables · M structures · K data elements · P classes · Q FMs
Cross-module gaps: G (or "n/a — SAP_ACTIVE_MODULES unset")
Sensitive objects flagged: X

Downstream procedures (create-program, program-to-spec, create-object)
read inventory.json and prefer pinned objects > frequently-used objects > new creation.
```

**Branch B — `Logic-heavy: true` (FM / class / interface / large PROG in the inventory) · reader-facing briefing**

Structured counts alone do not convey what the business-logic assets DO. Adopt the [sap-writer](../personas/sap-writer.md) persona and produce a reader-facing briefing from `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` (language = user's current conversation language; default Korean).

Required sections (15–25 lines, markdown):
1. **📌 Pinned highlights** — for each pinned object, one line: name · type · 1-sentence purpose · reuse_hint.
2. **🔧 Business-logic assets** — top 3 most-referenced FUGR/CLAS/INTF (outside pinned). For each: name · what it does in business terms · when to call it vs write new.
3. **🔗 Cross-module gaps** — if `crossModuleGaps[]` non-empty, explain each gap in one sentence with a concrete remediation hint. If empty, one line "No integration gaps detected for active modules: <list>".
4. **⚠️ Sensitive objects** — if any, list with short reason and blocklist-extension suggestion. Skip section if none.
5. **▶ Next step hint** — one line pointing to which downstream procedure to run next (create-program / create-object / program-to-spec).

Rules:
- Do NOT re-read SAP via MCP for the briefing. Work only from `inventory.json`.
- Do NOT restate the full file counts (already printed in the header lines).
- Be concrete: prefer "ZFM_CALC_SD_MARGIN — calculates gross margin per sales order line; call from any billing-related new program" over generic "utility FM".

Prepend one header line identifying the artifacts:
```
CBO inventory written:
  .sc4sap/cbo/<MODULE>/<PACKAGE>/index.md
  .sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json
```

**Failure handling (both branches)**: if the inventory walk is blocked (missing package, connection failure), surface the reason verbatim and stop — do not retry blindly. If the Branch B briefing cannot be produced, fall back to Branch A (canned summary) and log `briefing: "fallback_to_canned: <reason>"` in `inventory.json → meta`.

## Output Files

```
.sc4sap/cbo/
└── <MODULE>/               # SD, MM, PP, PM, QM, WM, TM, TR, FI, CO, HCM, BW, PS, Ariba
    └── <PACKAGE>/          # e.g., ZSD_MAIN
        ├── index.md        # human-readable summary, grouped by object type
        ├── inventory.json  # machine-readable, consumed by sibling procedures
        └── raw-walk.md     # optional full walk (only if asked or small package)
```

## MCP Tools Used

- Discovery: `GetPackage`, `GetPackageContents`, `GetPackageTree`, `SearchObject`, `GetObjectsByType`
- Object detail: `GetTable`, `GetStructure`, `GetDataElement`, `GetDomain`, `GetView`, `GetClass`, `GetInterface`, `GetFunctionGroup`, `GetFunctionModule`, `GetProgram`, `GetObjectInfo`
- Usage graph: `GetWhereUsed`
- NEVER used by this procedure: `GetTableContents`, `GetSqlQuery` (no row data — DDIC metadata only)

## Data Extraction Safety

This procedure only reads DDIC metadata and where-used relations. It MUST NOT call `GetTableContents` or `GetSqlQuery`. Row-level access stays behind the standard blocklist gate. See [data-extraction-policy](../policies/data-protection/data-extraction-policy.md).

## Related Procedures

- `create-program` — reads `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` during spec drafting to prefer existing CBO elements
- [program-to-spec](program-to-spec.md) — same, for reverse-engineering
- `create-object` — same, to suggest reuse before creation
