---
name: program-to-spec
description: Reverse-engineer an ABAP program into a Functional/Technical Specification artifact (Markdown or Excel). Socratic scope narrowing from "everything" to "only what the user needs".
source:
  - sc4sap-custom/skills/program-to-spec/SKILL.md
  - sc4sap-custom/skills/program-to-spec/workflow-steps.md
  - sc4sap-custom/skills/program-to-spec/spec-templates.md
---

# Program → Specification

Read an existing ABAP program (Report / Module Pool / FM Group / Class / CDS / RAP) through MCP, run the structural + semantic + where-used analysis, then turn out a Specification artifact in **Markdown** (`.md`) or **Excel** (`.xlsx`) format. The scope is **negotiated Socratically** — open wide, narrow on every turn, stop once the user's target granularity is confirmed.

## Purpose

Turn legacy or unfamiliar ABAP objects into a reviewable Functional/Technical Spec — for a handover, a documentation audit, an AMS transition, refactoring preparation, or compliance artifacts. Where a code-quality review (`analyze-code`) asks what is wrong, this procedure is **documentation-focused**: it sets down what the program DOES, not what's wrong with it.

## When to Use

- User says "program to spec", "reverse engineer", "make a spec", "document this program", "functional specification", "technical specification", "generate a specification"
- Knowledge transfer / handover of legacy ABAP into another team's hands
- Preparing a refactoring or a rewrite (the as-is behavior has to be captured)
- Compliance / audit demands a written spec for custom code
- Building a WRICEF inventory carrying detailed per-object specs

## When NOT to Use

- A **code quality review** is wanted → `analyze-code`
- **Creating a new** program from a spec is wanted → `create-program`
- **Fixing** the program is wanted → direct MCP `Update*` calls
- The object does not exist yet

## Socratic Scope Narrowing

The interview works as a **funnel**: each turn shrinks the decision space that is left. Score the remaining ambiguity 0–10 after every answer; stop at **≤3**.

**Default opener — bundled 4-question message** (MANDATORY once the target object arrives in the task arguments):
Put these four questions to the user in ONE message, in exactly this order — Audience / Format / Depth / Language — each a single-select whose first option carries "(Recommended)". One turn here stands in for Rounds 2+3+5. Only fall back to per-round questioning where the object itself is missing or ambiguous (Round 1), or where the user picks L3/L4 (Round 4 scope trimming).

| # | Header | Question | Options (Recommended first) |
|---|--------|----------|-----------------------------|
| 1 | Audience | Who is the primary audience for the spec? | Both (Recommended) · Functional · Technical |
| 2 | Format | Which output format? | Markdown (Recommended) · Excel · Both |
| 3 | Depth | What depth of detail? | L2 Standard (Recommended) · L1 Quick Spec · L3 Deep Technical · L4 Audit-grade |
| 4 | Language | Output language? | Korean · English · Japanese (order follows user's current language — promote the matching one to first with "(Recommended)") |

**Round 1 — Target object (only if the arguments did not supply it)**
- "Which object? (program / FM group / class / CDS / RAP BO name)"
- Verify with `SearchObject`. Where it is ambiguous, list the candidates.

**Round 2 — Audience + format** *(covered by the default opener — do not ask separately)*
- Audience: **Functional** (business readers — SD/FI/MM users) vs **Technical** (developers) vs **Both**
- Format: **Markdown** (review-friendly, git-friendly) vs **Excel** (project-PMO-friendly, reviewable cell-by-cell)
- Default when the user says "up to you" / "you choose" → Both + Markdown.

**Round 3 — Depth (pick one)** *(covered by the default opener)*

| Depth | Contains |
|-------|----------|
| **L1 — Quick Spec** | Purpose, inputs, outputs, **main logic steps** (numbered; for Module Pool includes PBO/PAI module flow) |
| **L2 — Standard Spec** (default) | L1 + inputs & screens, data model, authorizations, outputs, exceptions, **every subroutine / method signature** |
| **L3 — Deep Technical** | L2 + SQL inventory, BAdI / exit list, performance notes |
| **L4 — Audit-grade** | L3 + line-level cross-references, **where-used** (scope: main object + screens × `Z*` / `Y*` callers), risk register, transport history |

**Round 4 — Scope trimming (only if L3/L4)**
Put ONE narrowing question per turn until the ambiguity is ≤3:
- "Include unit tests inventory?"
- "Include generated artifacts (Screens / GUI Status / Text Elements)?"
- "Cover all includes or just main?"

**Where-Used scope (L4 only — fixed default, no interactive prompt)**
- Target = main program / class / FM-group / CDS / RAP-BO object **+ each of its screens**.
- Caller filter = customer namespace `Z*` / `Y*` only. Standard SAP and add-on namespaces are excluded.
- The rendered `Where-Used` section MUST restate this scope in its header, so a reviewer knows what was (and wasn't) searched.

**Round 5 — Output location**
- Default: `.sapkit/specs/{object_name}-{YYYYMMDD}-{lang}.{md|xlsx}`
- Language: ko / en / ja (infer it from the user's current language; confirm once).

**Stop condition**: every dimension above carries a concrete answer OR the user explicitly says "skip remaining, use defaults".

## Workflow Steps

**Step 0 — Socratic interview** (see § Socratic Scope Narrowing above)
Never skip it outright unless the user supplies fully-qualified arguments in the `object=... depth=L2 format=md lang=ko` style.

**Step 1 — Inventory** (auto)
- `SearchObject` — confirm the object and its sub-type
- Metadata: `GetObjectInfo` — package, author, created/changed, transport

**Step 1.5 — CBO inventory lookup** (auto)
- Resolve `<PACKAGE>` out of the `GetObjectInfo` above.
- Put one question to the user: "Which module does package `<PACKAGE>` belong to? (SD / MM / PP / PM / QM / WM / TM / TR / FI / CO / HCM / BW / PS / Ariba)" — only where the module cannot be derived from `.sapkit/config.json` or from the package's existing CBO folder (see [project-context](../project-context.md)).
- Check `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json`.
  - **Exists** → Load it. While Step 3 describes data sources, tables, or helper calls, annotate every one that matches an inventory entry with its CBO role + one-line business purpose (e.g., "writes to `ZSD_ORDER_LOG` — append-only sales-order processing log"). That turns the spec's opaque Z-references into named reusable assets.
  - **Missing** → Print one line: "No CBO inventory at `.sapkit/cbo/<MODULE>/<PACKAGE>/`. Run the [analyze-cbo-obj](analyze-cbo-obj.md) procedure first for richer spec annotations, or type `skip` to proceed."
- Persist the loaded entries into `.sapkit/specs/<OBJECT>/cbo-context.md` for Steps 3–4 to use.
- Source reads:
  - Report/Program: `GetProgFullCode` + `GetIncludesList` → iterate `GetInclude`
  - Class: `ReadClass` (all sections) + `GetLocalDefinitions` / `GetLocalMacros` / `GetLocalTestClass` / `GetLocalTypes`
  - Function Module: `ReadFunctionModule` + function group includes
  - CDS: `ReadView` + `GetMetadataExtension`
  - RAP: `ReadBehaviorDefinition` + `ReadBehaviorImplementation` + `ReadServiceDefinition` + `ReadServiceBinding`
- Screens / GUI Status / Text Elements (where it is a report / module pool): `GetScreensList`, `GetGuiStatusList`, `GetTextElement`
- Structural: `GetAbapAST`, `GetAbapSemanticAnalysis`
- Enhancements (L3+): `GetEnhancements`, `GetEnhancementSpot`
- Where-Used (L4 only — fixed scope): `GetWhereUsed` against the main object **plus each screen**; filter the callers down to customer namespace `Z*` / `Y*` only. Skip standard SAP and add-on namespaces.

**Step 2 — Classify** (auto)
- Object archetype: ALV report / batch job / BDC / FM wrapper / CDS view / RAP BO / enhancement impl / utility class
- It decides which spec template Step 3 applies.

**Step 3 — Analysis**

Adopt the [sap-analyst](../personas/sap-analyst.md) persona for this step. Extract the business purpose, the inputs (selection screen / importing params), the outputs (ALV cols / exporting params / OData entity), the data sources (tables + CDS + BAPIs), the main logic narrative, the error cases, and the authorization checks (`AUTHORITY-CHECK` statements). Where `cbo-context.md` exists, check every Z-object mentioned against the inventory and swap the opaque "Z-table" / "Z-class" labels for the inventory's documented role + business purpose.

**Audit verification gate (L4 only)**: adopt the [sap-critic](../personas/sap-critic.md) persona **in a fresh context** (a new session/subagent, per the adapter guidance). The critic judges read-only: confirm that every claim in the rendered spec cross-references a concrete line range in source. The worker applies the fixes, and they are verified again. Skip it for L1 / L2 / L3.

**Step 3.5 — Draw screens (Markdown only)**

The Excel output inherits the reference mockup imagery pipeline (see Step 4) — do NOT hand-draw images for Excel.

For **Markdown output only**, draw every Selection-Screen and every output Screen / ALV as an ASCII wireframe inside fenced code blocks (character widths run uniform there):
- Reconstruct Dynpros from `GetScreen` / `ReadScreen` (`HEADER` + `FLOW_LOGIC` + field positions `LINE` / `COLUMN` / `LENGTH` / `HEIGHT`).
- Reconstruct Selection-Screens from `PARAMETERS` / `SELECT-OPTIONS` / `SELECTION-SCREEN BLOCK` statements.
- Reconstruct ALV output from the field catalog (columns + widths + headings).
- Show the label, the input box, the F4-help marker `[▼]`, and the mandatory `*`.
- Optionally a Mermaid `flowchart TD` for screen-to-screen navigation.
- For GUI Status: a short FKEY → FCODE → text table, plus an ASCII toolbar bar.

For objects without UI (a pure class, an FM, a CDS, a RAP without screens), skip the wireframes — the Parameters table inside the Inputs section carries enough.

**Step 4 — Render**

Adopt the [sap-writer](../personas/sap-writer.md) persona for this step. Render into whichever format was chosen (MD or Excel), at the chosen depth + language.

- **Markdown**: one `.md`, an H2 section per spec dimension, tables for the selection-screen / tables / methods / exits. See § Markdown Template below.
- **Excel (MANDATORY workflow — template preservation + program-specific imagery, single entry point)**:

  > **Why clone + image swap?** The geometry (styles / borders / fonts / column widths / row heights / drawings) arrives from a byte-for-byte clone of [template_base.xlsx](../../assets/spec/template_base.xlsx) — that is what holds throwaway-driver geometry drift off. Per-program data comes in through TWO inputs: (1) a TR (translation) map that swaps out the template's English strings, and (2) an image-spec that drives the per-program Selection / ALV / Process-Flow mockups. Both run on every Excel spec — no opt-in trigger keywords. The writer's job is to produce both JSON files; one helper handles the rest.

  The pipeline for each Excel-output spec:

  1. **Produce TWO JSON files**:
     - `.sapkit/specs/_tr/{OBJECT}-{YYYYMMDD}.tr.json` — a flat `{ "English key": "한국어 값" }` map. Schema + slot semantics live in § Excel TR Map below.
     - `.sapkit/specs/_img/{OBJECT}-{YYYYMMDD}.image-spec.json` — the `renderScreenImages()` argument: `{ selection: {fields:[…]}, alv: {columns:[…], sampleRows:[…]}, processFlow: [string,…], lang }`. The exact key names live in § image-spec.json Schema below. A schema mistake (e.g. `field` where `name` belongs, or sampleRows as arrays instead of objects) renders empty PNGs in silence — catch it by inspecting the resulting ALV byte size (~12 KB normal, ~1 KB = empty grid).
  2. **Run the single entry point** — [build-spec.mjs](../../tools/spec/build-spec.mjs):
     ```bash
     node tools/spec/build-spec.mjs <tr.json> <image-spec.json> <out.xlsx>
     ```
     (the path is relative to the harness repo root). Inside: `cloneTemplate(tr)` → `renderScreenImages(imageSpec)` → `swapImages(xlsxPath, …pngBuffers)`. The default output path is `.sapkit/specs/{OBJECT}-{YYYYMMDD}-{lang}.xlsx`. Pass `-` as the image-spec argument to skip image rendering and ship the text-only spec carrying the template's generic mockups (rare — only where no per-program imagery makes sense).
  3. **Verify the artifact** — the output runs ≈ 60–75 KB, depending on the PNG sizes. `unzip -l` lists `xl/sharedStrings.xml` + `xl/media/image1.png` + `image2.png` + `image3.png` + `xl/drawings/drawing3.xml` + `drawing4.xml`. Open it in Excel and scan every sheet — the geometry MUST match [template_base.xlsx](../../assets/spec/template_base.xlsx), Sheet 3 shows the program-specific Selection + ALV, Sheet 4 shows the horizontal Process Flow under the heading.
  4. **Cleanup** — leave both JSON files sitting in `_tr/` and `_img/` for traceability. Remove only the ephemeral files (probes, smoke tests).

  **Graceful degrade** — where no headless browser sits on PATH (Chrome / Edge / Chromium not installed), `renderScreenImages` returns `null` per slot and `swapImages` skips them. The xlsx lands with template generic mockups on Sheet 3 and a blank Sheet 4 drawing — never crashes.

  **Zero external npm dependencies** — [build-spec.mjs](../../tools/spec/build-spec.mjs) / [template-clone.mjs](../../tools/spec/template-clone.mjs) / [image-swap.mjs](../../tools/spec/image-swap.mjs) draw only on `node:fs` / `node:zlib` / `node:path` / `node:url`. Image rendering runs through [screen-image-renderer.mjs](../../tools/spec/screen-image-renderer.mjs), which shells out to a system headless browser; no npm modules.

  **Sheet order is fixed by the template** — the clone never reorders it. What the template ships with:
  1. `프로그램 개요` / Program Overview — Field/Value metadata (17 rows)
  2. `데이터 모델` / Data Model — Table/Access/Key Fields/Join Type/Notes (4 table slots + trailer)
  3. `입력 및 화면` / Inputs & Screens — Parameters (5 slots) + 5 warning rows + image anchors at C4 (Selection) / C19 (ALV)
  4. `처리 로직` / Processing Logic — #/Event/Step (12 step slots) + Process Flow Chart heading at B18 + horizontal flow image at B19
  5. `출력` / Output — Order/Field/Description/Length/Edit/Hidden (10 column slots)
  6. `권한` / Authorizations — Check/Object/Level/Implemented?/Notes (5 rows)
  7. `예외 처리` / Exceptions — Trigger/Mechanism/Message/Recovery (3 rows)

  **Image anchor extents are dynamic** — every `<xdr:ext>` is computed off the supplied PNG's IHDR (`px × 9525` EMU), so the PNGs render at native aspect ratio without stretching. The Sheet 3 anchors (drawing3.xml C4 + C19) are updated surgically, by image name. Sheet 4 (drawing4.xml) is injected on demand, because each program's flow chart differs (`xl/media/image3.png` + `<xdr:oneCellAnchor>` from B19 + `_rels/drawing4.xml.rels`).

**Step 5 — Review loop**
- Show a table of contents and the first section inline.
- Ask: "OK to finalize, or trim/expand a section?"
- On confirmation → write the file → print the absolute path.

## Markdown Template — L2 Standard Spec skeleton

```markdown
# Specification: {OBJECT_NAME}

- **Type**: {Report | Class | FM | CDS | RAP BO}
- **Package**: {PKG} · **Transport (original)**: {TR}
- **Author / Changed**: {user} / {date}
- **Archetype**: {ALV report | Batch | BDC | ...}
- **Purpose (1–2 sentences)**: ...

## 1. Business Context
## 2. Data Model
| Table / CDS | Access | Key Fields | Notes |
## 3. Inputs & Screens
## 4. Main Logic (step-by-step)
## 5. Outputs
## 6. Authorizations
## 7. Exceptions & Messages
## 8. Dependencies (BAPIs, RFCs, enhancements)

### 8.1 Parameters
| Field | Type | Required | Default | Description |

(Report → `PARAMETERS` / `SELECT-OPTIONS` · FM/Class → `IMPORTING` · CDS → view params · RAP → action inputs.
 Always rendered, even when the object has no UI screens.)
### 8.2 Selection-Screen (only if screens exist) — ASCII wireframe in fenced block
### 8.3 Output — ALV / Dynpro 0100 (only if ALV/Dynpro output exists) — ASCII wireframe
### 8.4 Screen-flow (only if multi-screen) — Mermaid `flowchart LR`
## 9. Open Questions / Assumptions
```

## Excel TR Map — Template-clone workflow

The Excel output comes from cloning [template_base.xlsx](../../assets/spec/template_base.xlsx) byte-for-byte and swapping out only `xl/sharedStrings.xml`. The clone helper is [template-clone.mjs](../../tools/spec/template-clone.mjs). What the writer delivers is therefore a **TR (translation) map**, not a styled workbook.

### TR map schema

```jsonc
{
  "Program Overview (ZMMRTEST003)": "프로그램 개요 (ZMMR1001)",
  "ZMMRTEST003":                   "ZMMR1001",
  "Object Type":                   "오브젝트 타입",
  "PROG/P (ABAP Report)":          "PROG/P (ABAP Report)",
  // … one entry per English source string in the template …
}
```

A flat object · key = the English source string out of the template's sharedStrings.xml · value = the target-language replacement for THIS program. Persist it to `.sapkit/specs/_tr/{OBJECT}-{YYYYMMDD}.tr.json` (UTF-8, pretty-printed).

### Slot semantics

Where the target program carries fewer items than the template's fixed slot count, **fill unused slots with placeholders** so row counts — and with them the borders, fills, and styles — stay identical:

| Section | Template count | Placeholder convention |
|---|---|---|
| Sheet 3 Parameters | 5 (S_VKORG..S_VBELN) | `— (해당 없음)` for the field name, `—` for type/required/default, and a short note in the description |
| Sheet 3 Warnings | 5 ⚠ rows | Use the real findings; where fewer than 5 exist, repeat the most important caveat or summarise into 5 buckets |
| Sheet 4 Steps | 12 numbered rows | `— (해당 없음)` for the FORM name, and a brief explainer for the step text |
| Sheet 5 Output columns | 10 ALV column rows | `— (해당 없음)` for an unused field, `—` for length |
| Sheet 6 Auth | 5 rows | Use the real auth objects + GAP rows; rewire the template's row labels semantically where needed (e.g. `Sales organisation` → `플랜트 단위`) |
| Sheet 7 Exceptions | 3 rows | Combine where the target has only 2; split where it has 4+ — keep the 3-row template count |

### SAP identifier remapping

The template's identifiers (`ZMMRTEST003`, `VBAK`, `VBELN`, `S_VKORG`, etc.) MUST show up as TR keys mapping onto the target program's identifiers wherever the two differ (`ZMMR1001`, `MARA`, `MATNR`, `P_WERKS`). An identifier absent from TR stays in the cloned file unchanged — which is the behaviour wanted when the target shares that identifier with the template.

### Quality gates (before declaring done)

1. `node tools/spec/template-clone.mjs <tr-json> <out-xlsx>` exits 0.
2. Stdout shows `NO TRANSLATION:` for ONLY the SAP standard identifiers the target program genuinely reuses (table names, field names the two specs share). Any prose / label / sheet-title / warning string missing from TR is a bug — patch it and re-run.
3. `unzip -l <out-xlsx>` lists 32 entries — the template's 30, plus the injected `xl/media/image3.png` and `xl/drawings/_rels/drawing4.xml.rels` (a text-only clone stays at 30; only the `xl/sharedStrings.xml` size differs from the template).
4. Output file ≈ 45 KB (text-only clone) / ≈ 60–75 KB (with images).
5. Open it in Excel — every sheet renders with geometry identical to the template.

## Image Replacement (always-on — part of the default Excel pipeline)

Every Excel spec ships carrying program-specific imagery on Sheet 3 (the Selection + ALV mockups) and Sheet 4 (the horizontal Process Flow chart). The image pipeline runs off a single `image-spec.json` that [build-spec.mjs](../../tools/spec/build-spec.mjs) consumes. No trigger keywords required.

| Slot | xlsx path | Sheet | Anchor | Ext | Source |
|---|---|---|---|---|---|
| `selection`  | `xl/media/image2.png` | 3 (입력 및 화면) | C4  | PNG IHDR × 9525 (dynamic) | `image-spec.json.selection` |
| `alv`        | `xl/media/image1.png` | 3 (입력 및 화면) | C19 | PNG IHDR × 9525 (dynamic) | `image-spec.json.alv` |
| `processFlow`| `xl/media/image3.png` | 4 (처리 로직)    | B19 | PNG IHDR × 9525 (dynamic) | `image-spec.json.processFlow` |

### Image-swap CLI (when you already have PNGs on disk)

```bash
node tools/spec/image-swap.mjs <out-xlsx> --selection <sel.png> --alv <alv.png> --process-flow <pf.png>
```

- `--selection`     → `xl/media/image2.png` (Sheet 3, C4)
- `--alv`           → `xl/media/image1.png` (Sheet 3, C19)
- `--process-flow`  → injects `xl/media/image3.png` + `drawing4.xml` oneCellAnchor + rels (Sheet 4, B19)
- Any flag may be left off; a slot left off keeps its template state.
- The positional form (`<xlsx> <sel.png> <alv.png> <pf.png>`, with `-` to skip) is accepted too.

The PNG signature is verified before any write; non-PNG input is rejected without the xlsx being touched.

### image-spec.json schema

**Exact JSON shape** (keys that fail to match render an empty grid in silence — check it by inspecting the PNG byte sizes: ~12 KB normal ALV vs ~1 KB empty grid):

```jsonc
{
  "lang": "ko",
  "selection": {
    "blockLabel": "조회 조건",
    "fields": [
      { "name": "P_BUKRS", "label": "회사코드",      "required": true },
      { "name": "P_WERKS", "label": "플랜트",        "required": true },
      { "name": "S_MATNR", "label": "자재번호 범위", "range": true, "note": "LOW~HIGH 입력" }
    ],
    "optionFields": []
  },
  "alv": {
    "columns": [
      { "name": "MATNR", "header": "자재",     "width": 140 },
      { "name": "MAKTX", "header": "자재설명", "width": 320 },
      { "name": "LBKUM", "header": "재고수량", "width": 130, "align": "end" },
      { "name": "MEINS", "header": "단위",     "width": 80 }
    ],
    "sampleRows": [
      { "MATNR": "HALB-001234", "MAKTX": "반제품 A (조립용)",   "LBKUM": "120.00", "MEINS": "EA" },
      { "MATNR": "ROH-005678",  "MAKTX": "원자재 B (강판)",     "LBKUM": "450.50", "MEINS": "KG" },
      { "MATNR": "FERT-009999", "MAKTX": "완제품 C (출하 대기)", "LBKUM": "78.00",  "MEINS": "EA" }
    ],
    "maxRows": 3
  },
  "processFlow": ["시작", "입력 검증", "? 자재 마스터 존재?", "BAPI 호출", "ALV 출력", "! 종료"]
}
```

**Field semantics**
- `selection.fields[].name` — the identifier shown in parentheses beside the label
- `selection.fields[].required` — `true` adds the red `*` mark + legend entry
- `selection.fields[].range` — `true` renders it SELECT-OPTIONS style (LOW input ~ HIGH input + dropdown)
- `alv.columns[].name` — **REQUIRED**; it serves as the lookup key for each `sampleRows[i][name]`. A schema mistake here is the most common cause of empty ALV PNGs.
- `alv.columns[].header` — the display text (it falls back to `name` when absent)
- `alv.columns[].align` — `'end'` (right-aligned, monospace for numerics) / `'left'` / default centre
- `alv.columns[].hotspot` — `true` renders the cell value as blue underlined text
- `alv.columns[].editable` — `true` renders a yellow input cell
- `alv.sampleRows[]` — **OBJECTS** keyed by `name` (NOT positional arrays). Special keys: `_status` (`'●'`/`'○'`/`'◉'`) for tri-state indicators, `_locked: true` to grey the row
- `processFlow[]` — a string array. Prefix `?` = decision (diamond), `!` = terminal (pill), no prefix = process box. Always rendered **horizontal** on the xlsx embed path (a Markdown caller wanting vertical should call `renderProcessFlowSVG()` directly with `orientation: 'vertical'`)

## Output Format (completion block)

```
Spec generated: ZSDR_OPEN_ORDER_ALV
Depth: L2 Standard · Format: markdown · Lang: ko
Sections: 9 · Tables referenced: 6 · Screens: 1 · GUI status: 1
File: .sapkit/specs/ZSDR_OPEN_ORDER_ALV-20260414-ko.md

Top-level summary:
  Report that lists open sales orders by Sales Organization and date range and displays them via ALV.
  Main tables: VBAK, VBAP, VBUK, KNA1 (+ CDS I_SalesOrder).
  Authorizations: S_TCODE=ZSDR01, S_TABU_DIS=VBAK.

Next options:
  • "Regenerate as Excel"
  • "Extend to L4 with Where-used"
  • "Add an English version"
```

## MCP Tools Used

- `SearchObject`, `GetObjectInfo`
- `GetProgFullCode`, `GetIncludesList`, `GetInclude`
- `ReadClass`, `ReadFunctionModule`, `ReadInterface`, `ReadView`
- `ReadBehaviorDefinition`, `ReadBehaviorImplementation`, `ReadServiceDefinition`, `ReadServiceBinding`
- `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes`
- `GetScreensList`, `GetGuiStatusList`, `GetTextElement`
- `GetMetadataExtension`
- `GetAbapAST`, `GetAbapSemanticAnalysis`
- `GetWhereUsed`, `GetEnhancements`, `GetEnhancementSpot`

## Data Extraction Safety

Spec generation only reads **source code + DDIC metadata + where-used** — never `GetTableContents` / `GetSqlQuery`. No row data is extracted. Where the user asks for sample data, refuse per [data-extraction-policy](../policies/data-protection/data-extraction-policy.md) and record the request in the `Risk` sheet instead.

## Related Procedures

- [compare-programs](compare-programs.md) — business-angle comparison across 2–5 programs
- [analyze-cbo-obj](analyze-cbo-obj.md) — CBO package inventory (feeds Step 1.5 annotations)
- [package-to-process](package-to-process.md) — a process-level view of the whole package; reach for it to see which flow this program sits in
- [deep-interview](deep-interview.md) — requirement clarification for new builds
