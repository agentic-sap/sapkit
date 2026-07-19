# ECC DDIC Fallback

Shared rule for any workflow that may create DDIC objects (Table, Data Element, Domain). Applies to every pipeline that creates or may create DDIC objects.

**Context.** On ECC systems the ADT REST API does not expose DDIC object endpoints (no source-based DDIC representation). Direct MCP DDIC creation calls (`CreateTable`, or Data Element / Domain creation) fail. For those three types and `SAP_VERSION = ECC` only, switch to a **program-generation fallback**: write an executable ABAP report into `$TMP` that — when the user runs it in SE38 — creates the DDIC object via the SAP-internal `DDIF_*_PUT` function modules (inactive version only; the user activates and assigns to transport manually in SE11).

**When this branch triggers.**
- `SAP_VERSION` (from the project's SAP connection config, or via `GetSystemInfo`) equals `ECC`, AND
- The workflow needs to create an object of type Table, Data Element, or Domain.

All other object types (Class, Program, Function Module, Structure, CDS View, …) continue through the standard MCP create flow unchanged. S/4HANA always uses the standard flow.

**Program naming (Y-prefix on purpose — helper generators are distinct from their Z* targets).**
| DDIC target | Generator program |
|---|---|
| Table `Z<NAME>` | `YCREATE_<NAME>` |
| Data Element `Z<NAME>` | `YCREATE_DTEL_<NAME>` |
| Domain `Z<NAME>` | `YCREATE_DOMA_<NAME>` |

If the resulting name exceeds 30 characters, truncate the `<NAME>` segment while keeping prefix and type tag intact.

**Source format (strict).** Mirror the three reference templates one-to-one — same header block, same `p_dryrun` checkbox default `'X'`, same `DEFINE ... END-OF-DEFINITION` helper macros, same preview/WRITE section, same `DDIF_*_PUT` exception list, same final "Next steps: open SE11 -> activate -> assign to transport." line. Reference template files (kept alongside this rule set):
- Table:        `templates/ecc/table_create_sample.abap`
- Domain:       `templates/ecc/domain_create_sample.abap`
- Data Element: `templates/ecc/element_create_sample.abap`

Read the matching template with `Read` on every run and generate the new report by substituting only: target object name, DDIC field list / fixed values / label texts, and the `ddtext` description. Do not refactor the skeleton.

**Target package.** `$TMP` always. The helper program is a one-shot developer utility, not a deliverable. Never assign it to a transport. Never attempt to activate the DDIC object from inside the program (PUT only, no `DDIF_*_ACTIVATE`, no `TR_OBJECTS_INSERT`).

**Mandatory completion message format** (when this fallback triggers):
```
⚠ ECC detected — DDIC {Table|Data Element|Domain} cannot be created via MCP.
Helper program generated instead:
  Program : <HELPER_NAME>           (package $TMP, activated)
  Target  : <DDIC_OBJECT_NAME>      ({type})

Next steps (manual, in ECC):
  1. SE38 → run <HELPER_NAME>                 (dry-run previews field layout)
  2. Uncheck p_dryrun → re-run                (writes inactive DDIC version)
  3. SE11 → open <DDIC_OBJECT_NAME>           (activate, assign package + transport)
```
Do not claim the DDIC object is created. Do not propose follow-up automation until the user confirms activation in SE11.
