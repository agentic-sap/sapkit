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

Comprehensive, severity-rated ABAP code review backed by the AST, semantic analysis, and where-used data that only the live SAP system can produce. A single agent performs the intake, the full 14-dimension review, the report, and the follow-up action menu.

## Purpose

Review an ABAP object end to end: read the source, run structural/semantic/where-used analysis, match against the rule files, and return findings with severity, location, rule reference, and concrete fix suggestions.

## Use When

- User says "analyze", "review code", "check this class", "what's wrong with", "analyze code", or "code review"
- Before releasing a transport, to catch issues early
- When taking over existing ABAP code and wanting to understand its quality
- When optimizing performance of an ABAP program or class
- User wants where-used impact analysis before modifying an object

## Do Not Use When

- User wants to modify the code immediately — use the `create-program` procedure (full program flows) or direct `UpdateClass` / `UpdateProgram` / `UpdateInclude` MCP calls
- Object doesn't exist yet — use the [create-object](create-object.md) procedure
- User just wants to read the source — `ReadClass`, `ReadProgram` etc. directly

## Workflow Steps

### Step 1 — Identify Object

- If the request supplies the object: use directly (e.g., `ZCL_MY_CLASS CLAS`).
- Otherwise ask: *"Which ABAP object do you want to analyze? (name and type — class/program/FM/interface/CDS view)"*
- Verify existence with `SearchObject(<name>, <type>)`. On not-found, report and stop.

Exit condition: `<OBJECT_NAME>` + `<OBJECT_TYPE>` resolved and confirmed.

### Step 2 — Full Review

Perform this step from the [sap-code-reviewer](../personas/sap-code-reviewer.md) persona's perspective. The review is analysis-only — do NOT mutate or suggest write operations during this step.

1. Read the source via the appropriate MCP tool (`GetClass` / `GetProgram` / `GetProgFullCode` / `GetFunctionModule` / `GetInterface` / `GetView`).
2. Run structural analysis: `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetWhereUsed`.
3. Load the rule files listed below and evaluate the 14 dimensions defined below.
4. Produce findings: severity (CRITICAL / HIGH / MEDIUM / LOW) · location (program:line) · rule reference · description · concrete fix (with code example where helpful).
5. Include summary metrics: total findings by severity · overall quality score (0–10) · top-3 highest-impact fixes.
6. Also record a one-line `complexity_hint` classifying the review:
   - `canned` → 0 CRITICAL AND < 10 total findings (simple template output)
   - `briefing` → ≥ 1 CRITICAL OR ≥ 10 findings (rich reader-facing report needed)

If the review cannot proceed (e.g., source unreadable), surface the reason verbatim and stop.

## Rule Files (loaded during Step 2)

| Rule File | Scope |
|-----------|-------|
| [naming-conventions](../knowledge/abap/conventions/naming-conventions.md) | ABAP object naming (Z/Y prefix, ZCL_/ZIF_/ZCX_, variable prefixes LV_/LS_/LT_, etc.) |
| [constant-rule](../knowledge/abap/conventions/constant-rule.md) | Constants declaration & usage (GC_/LC_/CO_ patterns, magic number avoidance) |
| [oop-pattern](../knowledge/abap/conventions/oop-pattern.md) | OO design patterns (class responsibility, interfaces, exception classes) |
| [procedural-form-naming](../knowledge/abap/conventions/procedural-form-naming.md) | FORM/PERFORM naming for legacy procedural code |
| [include-structure](../knowledge/abap/conventions/include-structure.md) | Include organization (_TOP, _F01, _SEL, _CLS separations) |
| [text-element-rule](../knowledge/abap/conventions/text-element-rule.md) | Text symbols/messages handling (hardcoded strings forbidden) |
| [alv-rules](../knowledge/abap/conventions/alv-rules.md) | ALV grid / list display patterns and field catalog conventions |
| [spro-lookup](spro-lookup.md) | SPRO config lookup patterns (avoid hardcoded values) |
| [data-extraction-policy](../policies/data-protection/data-extraction-policy.md) | Sensitive table extraction policy (PII, credentials, HR, financial) |

Also reference [naming-conventions (module-aware)](../knowledge/modules/common/naming-conventions.md) as the module-aware naming extension.

## 14 Evaluation Dimensions

**1. Syntax and Semantics**
- Parse tree validity via `GetAbapAST`
- Type errors, unresolved references via `GetAbapSemanticAnalysis`
- Unused variables, unreachable code

**2. Naming Conventions** → [naming-conventions](../knowledge/abap/conventions/naming-conventions.md), [naming-conventions (module-aware)](../knowledge/modules/common/naming-conventions.md)
- Z/Y prefix compliance, object-type prefixes (ZCL_/ZIF_/ZCX_/ZR_/...)
- Variable prefixes (LV_/LS_/LT_/IV_/EV_/MV_)
- Method, parameter, constant naming

**3. Constants & Magic Numbers** → [constant-rule](../knowledge/abap/conventions/constant-rule.md)
- GC_/LC_/CO_ usage, avoidance of hardcoded literals
- Enum-like constant groupings

**4. OO Patterns** → [oop-pattern](../knowledge/abap/conventions/oop-pattern.md)
- Single responsibility, interface usage, exception class design (ZCX_)
- Dependency injection, method cohesion

**5. Procedural/Form Naming** → [procedural-form-naming](../knowledge/abap/conventions/procedural-form-naming.md)
- FORM naming, PERFORM parameter passing (legacy code)

**6. Include Structure** → [include-structure](../knowledge/abap/conventions/include-structure.md)
- TOP/F01/SEL/CLS separation in module pools and reports

**7. Text Elements & Messages** → [text-element-rule](../knowledge/abap/conventions/text-element-rule.md)
- Text symbols for UI strings, message class usage, no hardcoded literals

**8. ALV Patterns** → [alv-rules](../knowledge/abap/conventions/alv-rules.md)
- Field catalog, layout, event handling, classical ALV vs CL_SALV_TABLE vs CL_GUI_ALV_GRID

**9. SPRO Lookup** → [spro-lookup](spro-lookup.md)
- Use of config tables vs hardcoded values

**10. Performance Patterns**
- SELECT * vs. explicit field list; SELECT inside loops (N+1 pattern)
- Missing WHERE clauses on large tables; unoptimized sorts
- Buffer usage (ABAP table buffer, shared buffer)

**11. Error Handling**
- Missing exception handling (sy-subrc after DB ops)
- Uncaught OO exceptions; MESSAGE vs exception classes
- RAISE EXCEPTION TYPE vs. legacy RAISE

**12. Modern ABAP**
- Inline declarations (DATA(...)), string templates instead of CONCATENATE
- VALUE/REDUCE/FILTER/FOR expressions, BDEF/RAP vs legacy BOR

**13. Security** → [data-extraction-policy](../policies/data-protection/data-extraction-policy.md)
- SQL injection risks (dynamic WHERE clauses)
- Authorization checks (AUTHORITY-CHECK placement)
- Sensitive data handling per extraction policy

**14. Where-Used Impact**
- `GetWhereUsed` to identify all callers/users of the object
- Flag high-impact objects (used in >10 places) for extra care

## Step 3 — Report (branching on `complexity_hint`)

Read the `complexity_hint` from Step 2 (or compute it from severity counts if missing: canned if `critical_count == 0 && total_findings < 10`, else briefing).

### Branch A — canned report

Default path. Format the findings into the template defined in the Output Format section below. No further work.

### Branch B — rich briefing

Triggered when `complexity_hint = "briefing"`. Render the briefing from the [sap-writer](../personas/sap-writer.md) persona's perspective (language = user's current conversation language; default Korean). Consume the Step 2 findings — do NOT re-run MCP reads.

Required sections (Markdown, 25–40 lines):

1. **🧭 Summary** — object name · lines · methods · callers · overall score.
2. **🚨 Critical & High** — for each: location · root cause · why it matters · concrete fix (code example).
3. **🟡 Medium** — concise one-liner each.
4. **🔗 Where-Used impact** — callers count + high-blast-radius call-outs.
5. **✅ Top 3 impactful fixes** — ordered by estimated impact, not severity.
6. **▶ Next step hint** — one line pointing to `UpdateClass`/`UpdateProgram` or the `create-program` procedure for a full rewrite.

Rules:

- Do NOT re-fetch the object via MCP.
- Do NOT restate the full findings list (Branch A covers raw enumeration).
- Be concrete: prefer "SELECT * on VBAP inside LOOP — move to FOR ALL ENTRIES above the LOOP" over "performance could be improved".

If the briefing cannot be rendered, fall back to Branch A (canned) and note the fallback reason.

## Step 4 — Action Menu

After the report (canned or briefing), offer:

1. **"Fix findings"** — explain options: manual `UpdateClass` / `UpdateProgram` / `UpdateInclude`, full rewrite via the `create-program` procedure, or apply the fixes now as the [sap-executor](../personas/sap-executor.md) persona. Fixes are applied by the worker, then re-reviewed.
2. **"Show where-used callers"** — display from the Step 2 where-used data (already collected).
3. **"Explain finding #N in more detail"** — re-read the specific finding entry and expand it.
4. **"Save report to `.sc4sap/analysis/<object>-<timestamp>.md`"** — write the report to file.

Stop on user selection or silence.

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

- `SearchObject` — verify the object exists during Step 1 intake
- `GetClass` / `GetProgram` / `GetFunctionModule` / `GetInterface` / `GetView` — read source
- `GetProgFullCode` — full program source including includes
- `GetAbapAST` — parse tree and structural analysis
- `GetAbapSemanticAnalysis` — semantic and type analysis
- `GetWhereUsed` — usage scope and caller list
- `GetObjectInfo` — object metadata (package, transport, author)
