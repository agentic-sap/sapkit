---
name: analyze-cbo-obj
description: Analyze a CBO (Customer Business Object) package — discover frequently-used Z tables / function modules / data elements / classes / structures / table types — and save a per-module / per-package reference file so later program / program-to-spec runs prefer existing CBO elements over new ones.
source:
  - sc4sap-custom/skills/analyze-cbo-obj/SKILL.md
  - sc4sap-custom/skills/analyze-cbo-obj/workflow-steps.md
---

# Analyze CBO Objects

Walk a CBO (Customer Business Object) package, take stock of every ABAP element the project built (table, structure, data element, class, interface, function module, program, view, table type), work out which of them are **reused often inside the package**, read each element's business purpose off its name/fields/descriptions, and write the result down under `.sapkit/cbo/<MODULE>/<PACKAGE>/` so downstream procedures (`create-program`, [program-to-spec](program-to-spec.md), `create-object`) can consult it before anything new gets created.

## Purpose

Projects pile up Z tables, Z data elements, Z function modules, and ZCL_ classes that carry domain logic. New development keeps rebuilding near-duplicates of them, because nobody holds a compact inventory of what is already there. This procedure builds that inventory — once per package — into a file later procedures read on their own, so the next spec / program / object creation reaches for proven CBO assets by default.

## When to Use

- Development is starting on a module that already carries a sizeable Z-package
- Onboarding onto an AMS / support engagement, where a map of the custom assets is needed
- Before `create-program` or `create-object` runs against a new spec — so reuse gets weighed
- User says "analyze CBO", "analyze custom objects", "map Z package", "list frequently used customs", "CBO inventory"

## When NOT to Use

- A code quality review of one object is wanted → `analyze-code`
- Reverse-engineering ONE program into a spec is wanted → [program-to-spec](program-to-spec.md)
- An object is to be created → `create-object`
- The package does not yet hold custom objects (CBO discovery has nothing to find)

## Workflow Steps

The shape of the flow: **3 Socratic intake steps** (Step 1 / 1.5 / 2) → **the inventory walk** (Steps 3–7, carried out by adopting the sap-stocker persona) → **a hand-off summary that branches** (Step 8).

### Socratic intake

**Step 1 — Ask for the CBO package name** (exactly one question)
> "Which CBO package do you want to analyze? (e.g., `ZSD_MAIN`, `ZMM_CORE`). If you only know a prefix like `ZSD*`, tell me the prefix and I will search for packages."

- If a prefix pattern comes back: call `SearchObject(objectType='DEVC', query=<prefix>)`, list what matches, then ask again.
- Confirm the settled package with `GetPackage(<name>)`. Where it does not exist, report that and stop.

**Step 1.5 — Ask about flagship programs in this package** (exactly one question, optional)
> "Are there any programs in this package that are especially frequently used? If yes, list them comma-separated (e.g., `ZSDR_ORDER_ALV, ZSDR_BILL_POST`). Type `skip` if none or unknown."

- Accept PROG names separated by commas. Upper-case them and trim the whitespace.
- Check each name with `SearchObject(<name>, PROG)`. Names that come back unknown get a one-line warning (`"ZXXX not found — ignored"`) and are dropped.
- Hold the validated list as `<KEY_PROGRAMS>` (it may be empty).
- **Why this step exists**: a CBO object that a user-marked flagship program references carries a stronger business signal than raw internal reference count does. In the scoring pass it receives a `key_boost = len(used_by_key_programs) * 10`, which floats it to the top of the inventory.

**Step 2 — Ask which module this package belongs to** (exactly one question, constrained list)
> "Which SAP module does this package belong to? Pick one of: SD / MM / PP / PM / QM / WM / TM / TR / FI / CO / HCM / BW / PS / Ariba."

- Valid values = the list of module folders under `core/knowledge/modules/`. Anything else is rejected, and the question is asked again.
- Upper-case it (e.g., `sd` → `SD`) and confirm `../knowledge/modules/<MODULE>/` is there.

### Inventory walk (Steps 3–7)

Adopt the [sap-stocker](../personas/sap-stocker.md) persona across these steps and run the whole inventory pass yourself — walk → where-used graph → classify → interpret → cross-module gap → safety → persist. The authoritative spec sits in the persona file's § Investigation_Protocol and § Output_Format; what follows is the summary:

- **Walk** (`GetPackageContents` + `GetPackageTree`): TABL / STRU / TTYP / DTEL / DOMA / VIEW / CLAS / INTF / FUGR / PROG (and DDLS / BDEF / SRVB on S/4).
- **Reference graph** (`GetWhereUsed` object by object, filtered down to in-package callers): `ref_count`, `used_by_key_programs`, `key_boost`, `score`.
- **Frequently-used tier**: thresholds keyed to package size (small <30 → ref_count ≥2 · medium 30–150 → ≥3 · large >150 → ≥5); anything a flagship references → always pinned.
- **Business purpose inference** (off DDIC signals): a role classification — `header / line / log / mapping / classification / config / util / service / event / dto` — and a purpose in 1–2 sentences.
- **Cross-module gap** (read `SAP_ACTIVE_MODULES` out of `sap.env` / `config.json`, see [project-context](../project-context.md)): against the [active-modules](../knowledge/modules/common/active-modules.md) matrix, flag the integration fields that ought to be there and are not (e.g., an MM CBO without `PS_POSID` while PS is active) → `inventory.json → crossModuleGaps[]`.
- **Sensitive-name check** against [custom-patterns](../policies/data-protection/custom-patterns.md) (PII / HR / CUST / BANK / PRICE / ...). Never call `GetTableContents` or `GetSqlQuery`.
- **Persist** `.sapkit/cbo/<MODULE>/<PACKAGE>/{index.md, inventory.json}` (plus an optional `raw-walk.md` where the package holds <200 objects).
- **Classify the result** as `Logic-heavy: <true|false>` by the persona's Output_Format rule (it drives the Step 8 branching).

`inventory.json` schema example (authoritative — `create-program` / `create-object` consume it too):

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

Sort order inside `objects[]`: every object whose `used_by_key_programs` is non-empty comes first, and the rest follow by `score` descending.

Sort order inside `index.md`:
1. `## 📌 Pinned — used by flagship programs` (grouped under the flagship program that pulls each one in)
2. `## Frequently used tables`, `## Frequently used structures`, ... (the frequently-used objects that were not pinned, by score descending)
3. `## Sensitive CBO objects` (flagged by name pattern; suggest additions to `.sapkit/blocklist-extend.txt`)

### Hand-off (Step 8 — branches on `Logic-heavy` flag)

**Branch A — `Logic-heavy: false` (DDIC-dominant package) · canned summary**

Print:
```
CBO inventory written:
  .sapkit/cbo/<MODULE>/<PACKAGE>/index.md
  .sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json

📌 Pinned (used by flagship programs [P1, P2]): P objects — always surfaced first
Frequently used: N tables · M structures · K data elements · P classes · Q FMs
Cross-module gaps: G (or "n/a — SAP_ACTIVE_MODULES unset")
Sensitive objects flagged: X

Downstream procedures (create-program, program-to-spec, create-object)
read inventory.json and prefer pinned objects > frequently-used objects > new creation.
```

**Branch B — `Logic-heavy: true` (FM / class / interface / large PROG in the inventory) · reader-facing briefing**

Counts on their own do not convey what the business-logic assets DO. Adopt the [sap-writer](../personas/sap-writer.md) persona and write a reader-facing briefing out of `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json` (language = the user's current conversation language; Korean by default).

Required sections (15–25 lines, markdown):
1. **📌 Pinned highlights** — one line for each pinned object: name · type · 1-sentence purpose · reuse_hint.
2. **🔧 Business-logic assets** — the 3 most-referenced FUGR/CLAS/INTF outside the pinned set. For each: name · what it does in business terms · when to call it rather than write something new.
3. **🔗 Cross-module gaps** — where `crossModuleGaps[]` is non-empty, explain each gap in one sentence and attach a concrete remediation hint. Where it is empty, one line: "No integration gaps detected for active modules: <list>".
4. **⚠️ Sensitive objects** — where any exist, list them with a short reason and a blocklist-extension suggestion. Skip the section when there are none.
5. **▶ Next step hint** — one line naming which downstream procedure runs next (create-program / create-object / program-to-spec).

Rules:
- Do NOT read SAP again through MCP for the briefing. Work only from `inventory.json`.
- Do NOT repeat the full file counts (the header lines already printed them).
- Stay concrete: "ZFM_CALC_SD_MARGIN — calculates gross margin per sales order line; call from any billing-related new program" beats a generic "utility FM".

Prepend one header line that names the artifacts:
```
CBO inventory written:
  .sapkit/cbo/<MODULE>/<PACKAGE>/index.md
  .sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json
```

**Failure handling (both branches)**: where the inventory walk is blocked (package missing, connection failure), surface the reason verbatim and stop — do not retry blindly. Where the Branch B briefing cannot be produced, fall back to Branch A (the canned summary) and log `briefing: "fallback_to_canned: <reason>"` into `inventory.json → meta`.

## Output Files

```
.sapkit/cbo/
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

Reading DDIC metadata and where-used relations is the only thing this procedure does. It MUST NOT call `GetTableContents` or `GetSqlQuery`. Row-level access stays behind the standard blocklist gate. See [data-extraction-policy](../policies/data-protection/data-extraction-policy.md).

## Related Procedures

- `create-program` — reads `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json` while drafting a spec, so existing CBO elements win
- [program-to-spec](program-to-spec.md) — the same, on the reverse-engineering side
- `create-object` — the same, to put reuse forward before anything is created
- [package-to-process](package-to-process.md) — consumes that same `inventory.json` a level up: how the package's programs work together as a business-document flow
