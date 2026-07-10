---
name: compare-programs
description: Business-angle comparison of 2–5 ABAP programs that share the same business scenario but diverge by module (MM vs CO), country (KR vs EU), persona (controller vs warehouse), or time horizon. Reader = functional consultant.
source:
  - sc4sap-custom/skills/compare-programs/SKILL.md
  - sc4sap-custom/skills/compare-programs/comparison-scope.md
  - sc4sap-custom/skills/compare-programs/workflow.md
  - sc4sap-custom/skills/compare-programs/dispatch-prompts.md
  - sc4sap-custom/skills/compare-programs/report-template.md
---

# Compare Programs

Read 2–5 ABAP programs that implement the **same business scenario** but in **different variants**, analyze them across 10 business dimensions, and emit a side-by-side Markdown comparison targeted at **functional consultants** (not developers).

## Purpose

Companies often split one logical business flow (e.g. GR list) into 2–3 programs so the same data answers different questions — MM sees quantity, CO sees value; KR sees e-tax-invoice fields, EU sees VAT codes; month-end controllers see aggregates, warehouse clerks see live transactions.

This procedure crystallizes **why each variant exists** so a consultant can:
- pick the right program for a new requirement instead of creating a 4th,
- map fit/gap across localizations,
- brief a handover or knowledge transfer without reading ABAP.

## When to Use

- User says "compare programs", "what's the difference between A and B", "MM vs CO version", "country-specific programs", or equivalent in the user's language
- Consultant handover / AMS transition — need to document "when to use which"
- Fit/Gap analysis across country rollouts — same flow, different programs
- Rationalization / decommissioning — considering whether to merge duplicates

## When NOT to Use

- Only **one** program → use [program-to-spec](program-to-spec.md) instead
- User wants **code quality** review (not business intent) → `analyze-code`
- User wants to **build a new** program → `create-program`
- More than 5 programs — break into multiple comparison sessions

## Comparison Scope — 10 Business Dimensions

The comparison is organized along **10 dimensions**. Each dimension answers a question a consultant actually asks when two programs claim to do "the same thing".

### Default vs Opt-in

| # | Dimension | Default | Reader question |
|---|-----------|---------|-----------------|
| 1 | **Module / Domain perspective** | ✅ | "Is this MM quantity, CO value, SD margin, FI posting?" |
| 2 | **Organization / Country scope** | ✅ | "Which BUKRS / WERKS / VKORG / country variant does each cover?" |
| 3 | **Selection screen (input surface)** | ✅ | "What does the user filter on — units, amounts, tax keys?" |
| 4 | **Core data sources** | ⬜ | "MSEG vs BSEG vs ACDOCA vs CDS I_* — which tables drive the result?" |
| 5 | **Business logic (calculation / derivation)** | ✅ | "How is aggregation done? Currency/UOM conversion? GL derivation?" |
| 6 | **Output columns / KPIs** | ✅ | "Quantity-centric, value-centric, tax-centric, or mixed?" |
| 7 | **Authorization objects** | ✅ | "Which role sees this — controller (F_BKPF_*) or warehouse (M_MSEG_*)?" |
| 8 | **CBO / Enhancement usage** | ⬜ | "Which append structures, BAdI impls, CMOD exits are wired in?" |
| 9 | **Country / Legal specifics** | ⬜ | "KR e-tax-invoice? EU VAT triangulation? BR NFe? US 1099?" |
| 10 | **Usage timing / Persona** | ✅ | "Month-end controller, daily warehouse clerk, real-time auditor?" |

**Default bundle** = 1, 2, 3, 5, 6, 7, 10 (7 dimensions) — covers ~80% of consultant questions without reading every include.
**Opt-in** = 4, 8, 9 — technical depth / enhancement depth / country depth.

### Scope Prompt (Step 2 of workflow)

Show the user this table with checkboxes, marking defaults pre-ticked, and ask a **single question**. Render the prompt in the user's current conversation language; the skeleton below is English.

```
Confirm comparison dimensions (7 defaults pre-selected, [x]=include / [ ]=exclude):

[x] 1. Module / Domain perspective (MM·CO·SD·FI …)
[x] 2. Organization / Country scope (BUKRS, WERKS, country)
[x] 3. Selection-screen input fields
[ ] 4. Core data sources (tables / CDS)
[x] 5. Business logic (aggregation · conversion · derivation)
[x] 6. Output columns / KPI
[x] 7. Authorization objects
[ ] 8. CBO · Enhancement usage
[ ] 9. Country / Legal specifics
[x] 10. Usage timing / Persona

Reply with: numbers to toggle (e.g. "+4 +8", "-7"), "all" to enable every dimension,
"only N,M" to keep a specific subset, or "ok" to proceed with defaults.
```

Accept short replies (language-agnostic):
- `ok` / `proceed` / equivalents → keep defaults.
- `+N` / `-N` → toggle dimension N.
- `all` → enable 1–10.
- `only N,M` → keep only the listed numbers.

### Per-Dimension Data Sources (what to read per dimension)

| Dim | Primary MCP source | Notes |
|-----|--------------------|-------|
| 1 | `GetObjectInfo`, package name, program TITLE, message class usage | Module is often encoded in package prefix (ZMM / ZCO / ZSD / ZFI) |
| 2 | Selection screen field types (DDIC), hard-coded WHERE on BUKRS/LAND1 | See [naming-conventions](../knowledge/abap/conventions/naming-conventions.md) for module prefix rules |
| 3 | Selection screen PARAMETERS / SELECT-OPTIONS + associated types | From `GetScreen` or parsed from source |
| 4 | `FROM` clauses in SELECT statements, JOIN targets, CDS view names | AST-based |
| 5 | Main computation blocks: ON CHANGE, COLLECT, AT END OF, aggregation FMs, BAPI calls | Narrative summary, not line-by-line |
| 6 | ALV field catalog entries, WRITE statements, output structure fields | `GetScreen` + source parse |
| 7 | `AUTHORITY-CHECK OBJECT '…'` statements | Listed verbatim with field/value |
| 8 | `GetEnhancements`, `GetEnhancementImpl`, append structures on referenced tables | See [customization-lookup](customization-lookup.md) |
| 9 | Country-specific includes (`L*ID*`, RFUMSV*), country table lookups (T005), CDS localization | Cross-reference with the loaded `../knowledge/country/<iso>.md` file |
| 10 | Job scheduling metadata, variant names, program title wording | Often explicit: "Month-end", "Daily", "Real-time" |

### Dimension Scoring — "Different or Same?"

For each selected dimension × each program, emit one of:

- ✅ **Same** — all programs behave identically on this dimension
- 🔷 **Variant** — differs but in a structured, comparable way (e.g. different currency conversion rule)
- ⚠️ **Divergent** — fundamentally different (e.g. one reads MSEG, another reads ACDOCA)
- ❓ **Unclear** — source doesn't expose the answer; consultant must clarify

The **Executive Summary** is driven by the ⚠️ Divergent rows (those are the "why this program exists" story).

## Workflow Steps

**Step 1 — Program Input**

**Accepts**:
- User passes 2–5 program names in the initial argument: `"compare ZMMR_GR_LIST and ZCOR_GR_LIST"` / `"ZMMR_GR_LIST, ZCOR_GR_LIST, ZFIR_GR_LIST"`.
- User passes nothing → ask (in the user's current conversation language): *"Which 2–5 programs should I compare? (comma-separated, e.g. ZMMR_GR_LIST, ZCOR_GR_LIST)"*.

**Validation**:
1. For each name, call `SearchObject` to resolve the ADT object type (REPS / CLAS / FUGR / CDS).
2. If a name is ambiguous or missing → list candidates, ask user to choose.
3. If user provides only 1 → suggest [program-to-spec](program-to-spec.md) instead and stop.
4. If user provides > 5 → ask to trim, or propose splitting into multiple comparison sessions.

Store the confirmed list as `compared_objects` (array of `{name, type, package}`).

**Step 2 — Scope Confirmation**

Show the **Scope Prompt** from § Comparison Scope above with defaults pre-ticked, rendered in the user's current conversation language. Wait for user response. Accept `ok` / `proceed` / `+N` / `-N` / `only N,M` / `all` (and equivalent phrasings in other languages).

Store the confirmed dimension set as `active_dimensions` (subset of 1–10). Echo back one line confirming the selection, e.g.: *"Dimensions confirmed: 1·2·3·5·6·7·10 (7 of 10). Starting analysis."*

**Step 3 — Facts Extraction (one program at a time, sequentially)**

Adopt the [sap-code-reviewer](../personas/sap-code-reviewer.md) persona for this step. For **each program in `compared_objects` in turn**, extract structural facts ONLY — no quality scoring:

Read:
- Source: `GetProgFullCode` (REPS) / `ReadClass` (CLAS) / `ReadFunctionGroup` + `ReadFunctionModule` (FUGR) / `ReadView` + `GetMetadataExtension` (CDS)
- Structure: `GetAbapAST` (selection-screen fields, SELECT targets, AUTHORITY-CHECK calls)
- Object info: `GetObjectInfo` (package, author, transport history)
- UI surface (if applicable): `GetScreensList` + per-screen `GetScreen`, `GetGuiStatusList`, `GetTextElement`
- Enhancements (only if dim 8 active): `GetEnhancements`, `GetEnhancementImpl`, `GetEnhancementSpot`
- Where-used (only if caller-frequency in scope): `GetWhereUsed`

Facts format per program (structured JSON, minimal):
- `selection_fields`: [{name, type, label}]
- `db_tables`: [{name, ops: [SELECT|MODIFY|INSERT|DELETE]}]
- `authority_checks`: [{object, fields}]
- `alv_columns`: [{position, fieldname, title}]
- `computation_narrative`: 1 paragraph (what the program computes at a high level)
- `package`: <name>
- `transport_history`: [{trkorr, desc, released_at}]
- `screens`: [{number, title, fields_count}]
- `gui_statuses`: [{code, functions_count}]
- `text_elements`: {symbols_count, messages_count}
- `enhancements_found`: [{name, type, status}]   // only if dim 8
- `callers`: {count, top_10: [...]}              // only if caller-frequency in scope

Rules:
- Do NOT call `GetTableContents` or `GetSqlQuery` under any circumstance.
- No quality scoring, no "this is bad" commentary — pure facts.
- No cross-program comparison yet — one program at a time.

If a program cannot be read (blocked / missing), surface the reason and ask the user whether to proceed with the remaining programs or abort. Store the N facts blobs as `program_facts[<PROG>]`.

**Step 4 — Analysis & Narrative**

Adopt the [sap-analyst](../personas/sap-analyst.md) persona for this step. With all N facts blobs + the active dimension set + the user's conversation language, perform in this order, in one continuous pass:

A. **Module classification** — for each program, decide primary module based on package prefix, table families touched, and TITLE wording. Output: `[{prog, module}]`.

B. **Dimension scoring** — per active dimension × per program, mark ✅ / 🔷 / ⚠️ / ❓ per the rubric in § Dimension Scoring. Output: matrix (JSON).

C. **Executive Summary** — 3 sentences. Headline = the single biggest divergence among the programs. Write in the user's current conversation language.

D. **Recommendation** — "when to use which" matrix (one row per program, one column per likely use-case).

E. If programs span 2+ distinct modules (from step A), list the module set for Step 4b. Output: `module_set: [MM, CO, ...]`.

All narrative text in the user's current conversation language.

**Step 4b — Module Specialist Pass (conditional, one perspective at a time)**

Triggered when `module_set` has ≥ 2 modules. If `module_set` has 1 module, SKIP this step.

For **each distinct module in `module_set` in turn**, adopt the matching module consultant persona (pick from [INDEX](../personas/INDEX.md), e.g. [sap-mm-consultant](../personas/sap-mm-consultant.md), [sap-co-consultant](../personas/sap-co-consultant.md)) and — from that module consultant's view — briefly explain (2–3 sentences per program) which of these programs a {module} user would reach for, and why, working from the subset of `program_facts` relevant to that module. Answer in the user's current conversation language.

Collect the per-module answers as `module_consultant_outputs`.

**Step 5 — Render**

Adopt the [sap-writer](../personas/sap-writer.md) persona for this step. Render the comparison report using § Report Template below as the skeleton. Do NOT re-read any MCP objects — work only from:
- `compared_objects`, `active_dimensions`, `program_facts`
- analyst outputs: { module_classification, dimension_matrix, exec_summary, recommendation }
- `module_consultant_outputs` (optional)
- user language

Write the Markdown file to `.sc4sap/comparisons/<filename>.md` (path rule in § Output Location). Then emit a concise completion block to the user (in the user's current conversation language — English skeleton below):

```
Comparison report generated.
File: .sc4sap/comparisons/ZMMR_GR_LIST__vs__ZCOR_GR_LIST-20260423.md
Dimensions: 7 · Divergent: 3 · Variant: 2 · Same: 2
Key divergence: ZMMR = quantity-centric (MSEG, M_MSEG_WWA) / ZCOR = cost-value-centric (ACDOCA, F_BKPF_*)
```

**Step 6 — Follow-up Options (offer, don't execute)**

Present as a short menu (localized to the user's language at render time):

- Deeper analysis of a specific dimension — user specifies the number
- Add more programs to the comparison (current N → up to 5)
- Convert to Excel (.xlsx) *(deferred — stub for future parity with program-to-spec)*
- Generate the report in another language
- Add Where-used analysis to compare actual call-site frequency
- Derive a consolidation / split recommendation report from the findings

Wait for user instruction — do not loop automatically.

## Language Policy

**Report language mirrors the user's current conversation language.**
- User writes in Korean → report in Korean (section headers + body).
- User writes in English → report in English.
- User writes in Japanese → report in Japanese.
- If mixed or unclear, default to the user's last full sentence language.
- Do not ask — detect and proceed. Only ask if the user explicitly requests a specific language.

## Output Location

`.sc4sap/comparisons/{prog1}__vs__{prog2}[__vs__{prog3}…]-{YYYYMMDD}.md`

- Program names are uppercase, underscore-safe (slashes → `_`).
- If the filename exceeds 120 chars (5-program case), use `.sc4sap/comparisons/compare-{YYYYMMDD}-{hash6}.md` and list the programs inside the front-matter.

## Report Template

All section headings and body prose are rendered **in the user's current conversation language**. The example below is English; translate the section titles and narrative, keep the structure identical.

### Front-matter (YAML)

```yaml
---
type: program-comparison
programs:
  - ZMMR_GR_LIST
  - ZCOR_GR_LIST
generated: 2026-04-19
language: en
dimensions_included: [1, 2, 3, 5, 6, 7, 10]
sap_version: S/4HANA On-Premise 816
client: "100"
---
```

### Template Body (English example — replace ▫ placeholders)

```markdown
# Program Comparison Report: ZMMR_GR_LIST vs ZCOR_GR_LIST

## 1. Executive Summary (3 sentences)

▫ [Sentence 1: the shared business scenario. e.g. "Both programs list Goods Receipt (GR) documents."]
▫ [Sentence 2: the biggest Divergent finding. e.g. "ZMMR is MSEG-based and quantity-centric; ZCOR is ACDOCA-based and cost-value-centric."]
▫ [Sentence 3: the recommendation. e.g. "Warehouse clerks should use ZMMR; cost controllers should use ZCOR. Personas must be separated so the same report is not run twice."]

## 2. Shared Baseline (what all programs do in common)

- Business scenario: ▫ [e.g. Goods Receipt document lookup]
- Shared selection-screen fields: ▫ [BUKRS, WERKS, date range]
- Shared output purpose: ▫ [GR transaction listing and filtering]

## 3. Per-Dimension Comparison Matrix

Legend: ✅ Same · 🔷 Variant · ⚠️ Divergent · ❓ Unclear

| # | Dimension | ZMMR_GR_LIST | ZCOR_GR_LIST | Verdict |
|---|-----------|--------------|--------------|---------|
| 1 | Module / Domain | MM (inventory movement) | CO (cost accounting) | ⚠️ |
| 2 | Org / Country scope | All company codes | All company codes | ✅ |
| 3 | Selection screen | MATNR, WERKS, movement type | KOSTL, KOKRS, cost element | ⚠️ |
| 5 | Business logic | Quantity aggregation (MENGE, MEINS) | Value aggregation (DMBTR, HWAER); no UOM conversion | ⚠️ |
| 6 | Output columns | Material · quantity · UoM · movement type | G/L · cost element · amount · currency | ⚠️ |
| 7 | Authorization | M_MSEG_WWA, M_MATE_WRK | F_BKPF_BUK, K_CCA | ⚠️ |
| 10 | Usage timing / Persona | Daily / warehouse clerk | Month-end / cost controller | ⚠️ |

(Opt-in dimensions add further rows when enabled.)

## 4. Per-Program Detail

### 4.1 ZMMR_GR_LIST

- **Package**: ▫ ZMMPAEK
- **Persona**: ▫ Warehouse clerk (daily)
- **Core data sources**: ▫ MSEG, MKPF, MARA
- **Business logic summary**: ▫ Simple sum of MENGE; UOM kept as stored on material master (no conversion)
- **Main authorizations**: ▫ M_MSEG_WWA, M_MATE_WRK
- **CBO / Enhancement**: ▫ MSEG append structure (Z-field: ZZ_LOT_NO)
- **Consultant view (1–2 sentences)**: ▫ [from the module consultant perspective in Step 4b]

### 4.2 ZCOR_GR_LIST

(Same structure.)

## 5. Recommendation — "Which program for which situation?"

| Use-case | Recommended program | Reason |
|----------|---------------------|--------|
| Daily GR quantity check | ZMMR_GR_LIST | Quantity- and material-centric; live MSEG |
| Month-end cost review | ZCOR_GR_LIST | ACDOCA-based; accurate amounts and cost elements |
| Audit reconciliation (quantity vs value) | Both in parallel + persona separation | Both needed |
| New country rollout (e.g. EU) | ▫ [if neither program covers the target localization, flag as a new localization requirement] | — |

## 6. Consolidation Opportunities (optional)

- ▫ [e.g. Extract the shared selection-screen block into a common INCLUDE reused by both programs]
- ▫ [e.g. Append module marker ("(MM)" / "(CO)") to ALV titles to make the persona distinction visible at first glance]

## 7. Risk & Open Questions

- ▫ [Items a consultant should confirm with the business — e.g. "Do both programs use moving-average price?"]
- ▫ [Items that would need a data sample to verify but are out of scope under the data-extraction policy — record them here instead of extracting rows.]

## 8. Appendix

### 8.1 Authorization Objects (verbatim)

| Program | Object | Field | Example value |
|---------|--------|-------|---------------|
| ZMMR_GR_LIST | M_MSEG_WWA | WERKS, BWART | Various |
| ZCOR_GR_LIST | F_BKPF_BUK | BUKRS, ACTVT | 03 (Display) |

### 8.2 Main Tables / CDS Views

| Program | Table / CDS | Note |
|---------|-------------|------|
| ZMMR_GR_LIST | MSEG, MKPF | Standard MM inventory document |
| ZCOR_GR_LIST | ACDOCA | S/4 Universal Journal |

### 8.3 Related CBO / Enhancement (only if dimension 8 enabled)

| Program | CBO / Enh type | Object | Purpose |
|---------|---------------|--------|---------|
| ... | ... | ... | ... |

### 8.4 Referenced Documents

- `core/knowledge/modules/common/active-modules.md` — active module matrix
- `core/procedures/customization-lookup.md` — enhancement lookup procedure
- `core/knowledge/country/<iso>.md` — country-specific rules (loaded when dimension 9 is enabled)
```

### Rendering Rules

1. **Omit unused sections** — if a dimension wasn't selected in Step 2, drop the corresponding matrix row AND any dedicated section (e.g. skip §8.3 if dim 8 is off).
2. **Minimum bar**: Executive Summary + Matrix + Per-program detail + Recommendation are **always** present, even if the user picked only 3 dimensions.
3. **Placeholder filling**: every ▫ placeholder must be replaced. If a value is genuinely unknown, write "❓ Not determined — confirmation needed" and also add it to §7 Risk & Open Questions.
4. **Verbatim extracts** in §8 — AUTHORITY-CHECK lines and table names are pulled directly from the source, not paraphrased.
5. **Length target** — 3–8 printed pages. Trim narrative if longer; split into two sessions if more than 5 programs.
6. **No code snippets** — this is a consultant-facing document. If an implementation detail is load-bearing, paraphrase it in business terms.
7. **Language localization** — when rendering for a non-English user, translate all section headers, table headers, narrative sentences, and the Legend (Same/Variant/Divergent/Unclear). Keep placeholders (▫) and technical identifiers (table names, object names, program names, authorization objects) verbatim.

## Safety Rails

- Blocklist: `GetTableContents` / `GetSqlQuery` are **forbidden** in this procedure. If the user asks for sample row data to illustrate a difference, refuse per [data-extraction-policy](../policies/data-protection/data-extraction-policy.md) and document the request in the report's `Risk & Open Questions` section instead.
- Country/Industry context: if dimension 9 is active, load `../knowledge/country/<iso>.md` based on `.sc4sap/config.json` → `country` (or `sap.env` → `SAP_COUNTRY`). If unset, ask the user once for the relevant country list.
- Module activation: respect [active-modules](../knowledge/modules/common/active-modules.md) — if a module is not active in the project, flag with "(module not active in this landscape — observation only)".
- Per-call transports: this procedure is **read-only** — never creates or modifies transports.

## Related Procedures

- [program-to-spec](program-to-spec.md) — single-program reverse-engineering (vertical depth)
- [analyze-cbo-obj](analyze-cbo-obj.md) — CBO package inventory (complementary context for dimension 8)
- [deep-interview](deep-interview.md) — use before comparison if user is unsure which programs to include
