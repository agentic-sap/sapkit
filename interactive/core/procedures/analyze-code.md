---
name: analyze-code
description: ABAP code review procedure — read source, run AST/semantic/where-used analysis, evaluate 14 dimensions against the rule files, and report severity-rated findings with fixes
source:
  - sc4sap-custom/skills/analyze-code/SKILL.md
  - sc4sap-custom/skills/analyze-code/analysis-dimensions.md
  - sc4sap-custom/skills/analyze-code/workflow.md
  - sc4sap-custom/skills/analyze-code/output-and-tools.md
---

# Analyze Code

A thorough, severity-rated ABAP code review resting on the AST, the semantic analysis, and the where-used data that only a live SAP system can hand over. One agent runs the intake, the whole 14-dimension review, the report, and the follow-up action menu.

## Purpose

Take an ABAP object through a review end to end: read its source, run the structural / semantic / where-used analysis, hold the result against the rule files, and hand back findings that carry a severity, a location, a rule reference, and a concrete suggested fix.

## Use When

- The user says "analyze", "review code", "check this class", "what's wrong with", "analyze code", or "code review"
- Before a transport release, to surface problems early
- When inheriting existing ABAP code and needing a read on its quality
- When tuning the performance of an ABAP program or class
- The user wants a where-used impact analysis before an object is modified

## Do Not Use When

- The code is to be modified right away — reach for the `create-program` procedure (whole-program flows) or the direct `UpdateClass` / `UpdateProgram` / `UpdateInclude` MCP calls
- The object does not exist yet — reach for the [create-object](create-object.md) procedure
- Reading the source is all that is wanted — `ReadClass`, `ReadProgram` and the rest, called directly

## Workflow Steps

### Step 1 — Identify Object

- Where the request already names the object: take it as given (e.g., `ZCL_MY_CLASS CLAS`).
- Otherwise ask: *"Which ABAP object do you want to analyze? (name and type — class/program/FM/interface/CDS view)"*
- Confirm it exists with `SearchObject(<name>, <type>)`. On a not-found, report it and stop.

Exit condition: `<OBJECT_NAME>` and `<OBJECT_TYPE>` both resolved and confirmed.

### Step 2 — Full Review

Run this step wearing the [sap-code-reviewer](../personas/sap-code-reviewer.md) persona. The review is analysis only — do NOT mutate or propose write operations while this step runs.

1. Read the source through whichever MCP tool fits (`GetClass` / `GetProgram` / `GetProgFullCode` / `GetFunctionModule` / `GetInterface` / `GetView`).
2. Run the structural analysis: `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetWhereUsed`.
3. Load the rule files listed below and work through the 14 dimensions defined below.
4. Emit findings: severity (CRITICAL / HIGH / MEDIUM / LOW) · location (program:line) · rule reference · description · concrete fix (with a code example where it helps).
5. Carry summary metrics: total findings per severity · overall quality score (0–10) · the top-3 highest-impact fixes.
6. Record as well a one-line `complexity_hint` that classifies the review:
   - `canned` → 0 CRITICAL AND < 10 total findings (plain template output)
   - `briefing` → ≥ 1 CRITICAL OR ≥ 10 findings (a rich reader-facing report is needed)

Where the review cannot go forward (source unreadable, say), surface the reason verbatim and stop.

## Rule Files (loaded during Step 2)

| Rule File | Scope |
|-----------|-------|
| [naming-conventions](../knowledge/abap/conventions/naming-conventions.md) | Naming of ABAP objects (Z/Y prefix, ZCL_/ZIF_/ZCX_, variable prefixes LV_/LS_/LT_, and so on) |
| [constant-rule](../knowledge/abap/conventions/constant-rule.md) | Declaring and using constants (GC_/LC_/CO_ patterns, keeping magic numbers out) |
| [oop-pattern](../knowledge/abap/conventions/oop-pattern.md) | OO design patterns (what a class is responsible for, interfaces, exception classes) |
| [procedural-form-naming](../knowledge/abap/conventions/procedural-form-naming.md) | FORM/PERFORM naming inside legacy procedural code |
| [include-structure](../knowledge/abap/conventions/include-structure.md) | How includes are organized (_TOP, _F01, _SEL, _CLS separations) |
| [text-element-rule](../knowledge/abap/conventions/text-element-rule.md) | Handling of text symbols and messages (hardcoded strings forbidden) |
| [alv-rules](../knowledge/abap/conventions/alv-rules.md) | ALV grid / list display patterns, plus field catalog conventions |
| [rap-odata-rules](../knowledge/abap/conventions/rap-odata-rules.md) | Silent RAP/OData failure modes (BDEF masters & projection `use etag`, DDLX facet scope, conversion exits, Edm.Boolean mapping, metadata-cache judgment) — reach for it when the object under review is RAP/CDS/OData |
| [spro-lookup](spro-lookup.md) | Patterns for looking SPRO config up (so values are not hardcoded) |
| [data-extraction-policy](../policies/data-protection/data-extraction-policy.md) | Policy on extracting from sensitive tables (PII, credentials, HR, financial) |

Take [naming-conventions (module-aware)](../knowledge/modules/common/naming-conventions.md) alongside them as the module-aware naming extension.

## 14 Evaluation Dimensions

**1. Syntax and Semantics**
- Parse-tree validity, via `GetAbapAST`
- Type errors and unresolved references, via `GetAbapSemanticAnalysis`
- Variables nothing uses, code nothing reaches

**2. Naming Conventions** → [naming-conventions](../knowledge/abap/conventions/naming-conventions.md), [naming-conventions (module-aware)](../knowledge/modules/common/naming-conventions.md)
- Compliance with the Z/Y prefix, plus object-type prefixes (ZCL_/ZIF_/ZCX_/ZR_/...)
- Prefixes on variables (LV_/LS_/LT_/IV_/EV_/MV_)
- Naming of methods, parameters, constants

**3. Constants & Magic Numbers** → [constant-rule](../knowledge/abap/conventions/constant-rule.md)
- Use of GC_/LC_/CO_, and hardcoded literals kept out
- Constant groupings that stand in for enums

**4. OO Patterns** → [oop-pattern](../knowledge/abap/conventions/oop-pattern.md)
- Single responsibility, how interfaces are used, exception class design (ZCX_)
- Dependency injection, cohesion within methods

**5. Procedural/Form Naming** → [procedural-form-naming](../knowledge/abap/conventions/procedural-form-naming.md)
- FORM names, and how PERFORM passes parameters (legacy code)

**6. Include Structure** → [include-structure](../knowledge/abap/conventions/include-structure.md)
- The TOP/F01/SEL/CLS split across module pools and reports

**7. Text Elements & Messages** → [text-element-rule](../knowledge/abap/conventions/text-element-rule.md)
- Text symbols behind UI strings, use of the message class, no hardcoded literals

**8. ALV Patterns** → [alv-rules](../knowledge/abap/conventions/alv-rules.md)
- The field catalog, the layout, event handling, classical ALV vs CL_SALV_TABLE vs CL_GUI_ALV_GRID

**9. SPRO Lookup** → [spro-lookup](spro-lookup.md)
- Config tables standing in place of hardcoded values

**10. Performance Patterns**
- SELECT * against an explicit field list; SELECT sitting inside a loop (the N+1 pattern)
- WHERE clauses missing on large tables; sorts left unoptimized
- How buffers are used (ABAP table buffer, shared buffer)

**11. Error Handling**
- Exception handling that is missing (sy-subrc after DB ops)
- OO exceptions left uncaught; MESSAGE against exception classes
- RAISE EXCEPTION TYPE against the legacy RAISE

**12. Modern ABAP**
- Inline declarations (DATA(...)), string templates where CONCATENATE used to sit
- VALUE/REDUCE/FILTER/FOR expressions, BDEF/RAP against the legacy BOR

**13. Security** → [data-extraction-policy](../policies/data-protection/data-extraction-policy.md)
- SQL injection exposure (dynamic WHERE clauses)
- Authorization checks (where AUTHORITY-CHECK is placed)
- Handling of sensitive data, per the extraction policy

**14. Where-Used Impact**
- `GetWhereUsed` to pin down all callers/users of the object
- Flag high-impact objects (in use in >10 places) for extra care

## Step 3 — Report (branching on `complexity_hint`)

Read the `complexity_hint` Step 2 left behind (or, where it is missing, derive it from the severity counts: canned if `critical_count == 0 && total_findings < 10`, else briefing).

### Branch A — canned report

The default path. Pour the findings into the template given in the Output Format section below. Nothing further.

### Branch B — rich briefing

Fires when `complexity_hint = "briefing"`. Render the briefing wearing the [sap-writer](../personas/sap-writer.md) persona (language = the user's current conversation language; Korean by default). Feed on the Step 2 findings — do NOT re-run the MCP reads.

Required sections (Markdown, 25–40 lines) are:

1. **🧭 Summary** — object name · line count · methods · callers · overall score.
2. **🚨 Critical & High** — per finding: location · root cause · why it matters · concrete fix (with code example).
3. **🟡 Medium** — a tight one-liner for each.
4. **🔗 Where-Used impact** — how many callers, plus the high-blast-radius call-outs.
5. **✅ Top 3 impactful fixes** — ordered by the impact you estimate, not by severity.
6. **▶ Next step hint** — a single line pointing at `UpdateClass`/`UpdateProgram`, or at the `create-program` procedure when a full rewrite is wanted.

Rules:

- Do NOT fetch the object again through MCP.
- Do NOT repeat the whole findings list (Branch A already covers the raw enumeration).
- Stay concrete: "SELECT * on VBAP inside LOOP — move to FOR ALL ENTRIES above the LOOP" beats "performance could be improved".

Where the briefing cannot be rendered, drop back to Branch A (canned) and note why.

## Step 4 — Action Menu

After the report is out (canned or briefing), offer:

1. **"Fix findings"** — lay out the options: `UpdateClass` / `UpdateProgram` / `UpdateInclude` by hand, a full rewrite through the `create-program` procedure, or applying the fixes right now as the [sap-executor](../personas/sap-executor.md) persona. The worker applies the fixes, and they are reviewed again afterwards.
2. **"Show where-used callers"** — render it from the Step 2 where-used data, which is already in hand.
3. **"Explain finding #N in more detail"** — go back to that one finding entry and expand it.
4. **"Save report to `.sapkit/analysis/<object>-<timestamp>.md`"** — write the report out to that file.

Stop on the user's selection, or on silence.

## Output Format

```
ABAP Code Analysis: ZCL_MY_CLASS
==================================
Lines analyzed: 247 | Methods: 12 | Callers: 8

CRITICAL (1)
  Line 45: SELECT * used on large table VBAP — specify explicit field list
  Fix: SELECT vbeln matnr kwmeng FROM vbap INTO TABLE @lt_items WHERE ...

MAJOR (3)
  Line 67: SELECT inside LOOP — moves DB call outside loop
  Line 112: sy-subrc not checked after MODIFY db_table
  Line 189: CONCATENATE used — replace with string template |...|

MINOR (2)
  Line 23: Variable lv_x has non-descriptive name
  Line 78: RAISE EXCEPTION TYPE cx_sy_... — prefer structured exception message

INFO (1)
  Line 1: Class uses obsolete FINAL addition pattern — consider ABAP 7.54+ syntax

Quality Score: 6.2/10
Top fix: Eliminate SELECT inside LOOP (line 67) — highest performance impact
```

## MCP Tools Used

- `SearchObject` — confirm the object exists during the Step 1 intake
- `GetClass` / `GetProgram` / `GetFunctionModule` / `GetInterface` / `GetView` — read the source
- `GetProgFullCode` — the whole program source, includes as well
- `GetAbapAST` — the parse tree, and structural analysis over it
- `GetAbapSemanticAnalysis` — analysis of semantics and types
- `GetWhereUsed` — the usage scope and the caller list
- `GetObjectInfo` — metadata about the object (package, transport, author)
