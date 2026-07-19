# Analysis Dimensions

**Rule loading is owned by the code reviewer**, not the main orchestrator. When dispatched for a code analysis run, the reviewer reads the rule files below itself and evaluates the 14 dimensions against them. The orchestrator never needs to preload them — keeping the orchestrator context light.

## Rule Files (loaded by the reviewer)

| Rule File | Scope |
|-----------|-------|
| `naming-conventions.md` | ABAP object naming (Z/Y prefix, ZCL_/ZIF_/ZCX_, variable prefixes LV_/LS_/LT_, etc.) |
| `constant-rule.md` | Constants declaration & usage (GC_/LC_/CO_ patterns, magic number avoidance) |
| `oop-pattern.md` | OO design patterns (class responsibility, interfaces, exception classes) |
| `procedural-form-naming.md` | FORM/PERFORM naming for legacy procedural code |
| `include-structure.md` | Include organization (_TOP, _F01, _SEL, _CLS separations) |
| `text-element-rule.md` | Text symbols/messages handling (hardcoded strings forbidden) |
| `alv-rules.md` | ALV grid / list display patterns and field catalog conventions |
| `data-extraction-policy.md` | Sensitive table extraction policy (PII, credentials, HR, financial) |

Also reference any project-specific module-aware naming extension where one exists.

---

## 14 Evaluation Dimensions

The code reviewer evaluates these dimensions:

**1. Syntax and Semantics**
- Parse/compile validity via `SyntaxCheck`
- Type errors, unresolved references via `SyntaxCheck` / `RunATCCheck`
- Unused variables, unreachable code

**2. Naming Conventions** → `naming-conventions.md` (plus any module-aware naming extension)
- Z/Y prefix compliance, object-type prefixes (ZCL_/ZIF_/ZCX_/ZR_/...)
- Variable prefixes (LV_/LS_/LT_/IV_/EV_/MV_)
- Method, parameter, constant naming

**3. Constants & Magic Numbers** → `constant-rule.md`
- GC_/LC_/CO_ usage, avoidance of hardcoded literals
- Enum-like constant groupings

**4. OO Patterns** → `oop-pattern.md`
- Single responsibility, interface usage, exception class design (ZCX_)
- Dependency injection, method cohesion

**5. Procedural/Form Naming** → `procedural-form-naming.md`
- FORM naming, PERFORM parameter passing (legacy code)

**6. Include Structure** → `include-structure.md`
- TOP/F01/SEL/CLS separation in module pools and reports

**7. Text Elements & Messages** → `text-element-rule.md`
- Text symbols for UI strings, message class usage, no hardcoded literals

**8. ALV Patterns** → `alv-rules.md`
- Field catalog, layout, event handling, classical ALV vs CL_SALV_TABLE vs CL_GUI_ALV_GRID

**9. SPRO Config Lookup**
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

**13. Security** → `data-extraction-policy.md`
- SQL injection risks (dynamic WHERE clauses)
- Authorization checks (AUTHORITY-CHECK placement)
- Sensitive data handling per extraction policy

**14. Where-Used Impact**
- `FindReferences` to identify all callers/users of the object
- Flag high-impact objects (used in >10 places) for extra care
