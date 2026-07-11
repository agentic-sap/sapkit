# Phase 2 Recon Raw Transcript (IDES-DEV, S4H, client 100)

All commands run via:
`. 'D:\AI PROJECT\sap-agentic-harness\scripts\vsp-env.ps1'; & 'D:\Claude for SAP\vsp-custom\build\vsp.exe' <args>`
Credentials/host values redacted per instructions (vsp-env.ps1 loads them; not echoed here).

## 1. vsp system info

```
System:    S4H
Host:      
Client:    100
SAP:       756
ABAP:      756
Kernel:    75G
Database:  HDB
ZADT_VSP:  installed
EXIT=0
```

## 2. vsp --help (full command surface)

Available Commands: api-surface, atc, boundaries, changelog, changes, class-sections,
compile, completion, config, context, copy, cr-boundaries, cr-config-audit, cr-history,
debug, deploy, deps, examples, execute, export, graph, grep, health, help, install,
lint, lsp, lua, method-signature, parse, query, recover-failed-create, rename-preview,
search, slim, source, system, systems, test, tr-boundaries, transport, what-package,
workflow

Read-only-candidate `--help` outputs captured (all EXIT=0):

- **api-surface**: "Show top standard SAP APIs used by custom code in a package" —
  `vsp api-surface <package> [--format text|json] [--include-subpackages] [--top N] [--with-release-state]`
- **boundaries**: "Analyze directional package boundary crossings" —
  `vsp boundaries <package> [--exact] [--format text|json|md|mermaid|html|dot|plantuml|graphml] [--report file.md]`
- **graph**: "Show call graph or run dependency analysis" —
  `vsp graph <type> <name> [--direction callees|callers|both] [--depth N]`
  Subcommands: `co-change` (transport-based co-change), `where-used-config` (heuristic:
  find programs reading a TVARVC/STVARV variable — narrow, not general where-used).
  No dedicated general "where-used" command exists; closest is `graph <type> <name>
  --direction callers`.
- **grep**: "Search source code in packages" — `vsp grep <pattern> --package <pkg>
  [-i] [--max N] [--type TYPE]`
- **search**: "Search for ABAP objects by name pattern" — `vsp search <query>
  [-m|--max N] [-t|--type TYPE]`
- **examples**: "Find real usage examples of an ABAP object (FM, method, SUBMIT, FORM)"
  — `vsp examples <type> <name> [--method M | --form F | --submit] [--top N]
  [--format text|json]`
- **deps**: "Analyze package dependencies and transport readiness" —
  `vsp deps <package> [--include-subpackages] [--object OBJ] [--format tree|summary|json]`
- **context**: "Get source with compressed dependency contracts" —
  `vsp context <type> <name> [--depth 1-3] [--max-deps N]`
- **health**: "Show a compact health snapshot for a package or object" —
  `vsp health [type] [name] [--package PKG] [--fast] [--details]
  [--format text|json|md|html] [--report file]`
- **slim**: "Find dead code in a package (read-only analysis)" —
  `vsp slim <package> [--exact-package] [--include-subpackages] [--level objects|methods|full]
  [--format text|json]`
- **rename-preview**: "Preview what references would be affected by renaming (read-only)"
  — `vsp rename-preview <type> <old_name> <new_name> [--format text|json]`
- **what-package**: "Look up TADIR package assignment for objects" —
  `vsp what-package <name> [name...]`
- **source**: "Get ABAP source code" — `vsp source [type] [name] | vsp source read|write|edit|context`
  (read/context are read-only; write/edit are NOT — not used in this recon)

## 3. vsp health --package '$TMP'

Ran 4 phases: tests, boundaries, ATC, staleness. Boundary-scan sub-step iterated
~48 objects in $TMP and hit several 404 WARNs for objects that don't actually have
retrievable source (e.g. `%_HR3406`, `%_HR5094`, `%_HR5561`, `%_HR3435`,
`GP5N80OOJDIJDFEKYLEGT5AGO3J100`, `GP1QKDP6HOS865QINPWPUDH2UIN100`,
`RK2FGTTR`) — these are pre-existing unrelated objects already in the shared
$TMP package (SAP-generated/other-user artifacts), not ZSAH* objects.

Final summary:
```
Health: package $TMP
Summary: WARN — ATC findings detected

tests:      PASS {"alerts":0,"classes":1,"methods":5,"packages_scanned":1}
atc:        FINDINGS {"errors":3,"findings":461,"infos":372,"warnings":86}
boundaries: CLEAN {"dynamic":6,"external":6,"objects_scanned":48,"packages_scanned":1}
staleness:  ACTIVE {"age_days":0,"checked":0,"last_changed":"2026-07-11T00:00:00Z"}
```
EXIT=0

Note: tests summary (1 class, 5 methods) matches exactly ltc_workdays' 5 test methods
in ZSAH1_WORKDAYS — the only test class currently in $TMP. The 461 ATC findings /
86 warnings / 3 errors are aggregated across the whole $TMP package (988 objects per
api-surface scan below), not attributable to ZSAH* alone.

## search "ZSAH*" --max 50

```
Found 5 objects:
  PROG/P     ZSAH0B_BROKEN                            $TMP
  PROG/P     ZSAH0B_SMOKE                             $TMP
  PROG/P     ZSAH0B_SMOKE2                            $TMP
  PROG/P     ZSAH15_BROKEN                            $TMP
  PROG/P     ZSAH1_WORKDAYS                           $TMP
```
EXIT=0 — matches background info exactly (3x ZSAH0B_*, ZSAH1_WORKDAYS, ZSAH15_BROKEN).

## 4. vsp source read PROG ZSAH1_WORKDAYS

Full source retrieved (89 lines incl. trailing blank), EXIT=0. Structure:
- `REPORT zsah1_workdays.`
- `CLASS lcl_workdays DEFINITION FINAL` (PUBLIC SECTION: ty_dates type, calc class-method)
- `CLASS lcl_workdays IMPLEMENTATION` — floor-mod weekday calc anchored to
  2024-01-01 (known Monday) reference date, MOD 7 arithmetic, excludes holidays
  via `it_holidays` sorted table
- `CLASS ltc_workdays DEFINITION ... FOR TESTING RISK LEVEL HARMLESS DURATION SHORT`
  (PRIVATE SECTION: 5 test methods — weekdays_only, spans_weekend, excludes_holidays,
  same_day, inverted_range)
- `CLASS ltc_workdays IMPLEMENTATION` — 5 test method bodies using
  `cl_abap_unit_assert=>assert_equals`

Compared line-by-line against local file
`D:\AI PROJECT\sap-agentic-harness\src\zsah1_workdays.prog.abap`: **identical**,
no whitespace/newline or content differences observed.

## 5. Boundaries / api-surface / graph real runs

### vsp boundaries '$TMP' --exact
```
Analyzing boundaries for $TMP (1 packages in scope)...
[... same 404 WARNs on unrelated pre-existing objects as in health step ...]
Boundaries: $TMP (1 packages, 57 objects scanned)

  WARN  EXTERNAL     6
         $TMP →   PROG RFMFGBLDRVAREAMR → TYPE YS_TABLE_BUFFER  [REFERENCES TYPE:YS_TABLE_BUFFER]
         $TMP →   PROG RFMFGBLDRVAREAMR → TYPE YT_TABLE_BUFFER  [REFERENCES TYPE:YT_TABLE_BUFFER]
         $TMP →   PROG RFMFGBLDRVAREAMR → TYPE YS_TABLE_FIELDS  [REFERENCES TYPE:YS_TABLE_FIELDS]
         $TMP →   PROG RFMFGBLDRVAREAEAA → TYPE YS_TABLE_BUFFER  [REFERENCES TYPE:YS_TABLE_BUFFER]
         $TMP →   PROG RFMFGBLDRVAREAEAA → TYPE YT_TABLE_BUFFER  [REFERENCES TYPE:YT_TABLE_BUFFER]
         $TMP →   PROG RFMFGBLDRVAREAEAA → TYPE YS_TABLE_FIELDS  [REFERENCES TYPE:YS_TABLE_FIELDS]

CLEAN — no directional violations
```
EXIT=0. None of the 6 EXTERNAL warnings involve ZSAH* objects — all pre-existing
unrelated $TMP content (RFMFGBLDRVAREA* programs).

### vsp api-surface '$TMP'
```
Loading package $TMP (1 packages in scope)...
Found 988 scoped custom objects (55 source-bearing).
Querying object references...
Collected 1067 cross-references.
API Surface: $TMP (988 custom objects -> 637 standard APIs, 1011 crossings)
[top-50 API usage table by ranked caller count, dominated by unrelated $TMP objects
 like ZFCCL_WB2_*, GP*100 generated programs, ZR2401*_EX* programs]
50 standard APIs shown (of 637 total)
```
EXIT=0. Key finding: $TMP contains **988 scoped custom objects** total (system-wide
shared local package across all IDES users), of which only 5 are ZSAH*. Any
'$TMP'-scoped health/boundaries/api-surface command output will be dominated by
noise from unrelated pre-existing objects — scoping to the specific object name
(not the package) is preferable when planning around ZSAH1_WORKDAYS specifically.

### vsp graph PROG ZSAH1_WORKDAYS (default direction=callees)
```
ADT call graph not available, using WBCROSSGT table fallback

  TYPE CL_ABAP_UNIT_ASSERT

1 unique references
```
EXIT=0. Correctly shows the program's one dependency (cl_abap_unit_assert used in
test methods). Falls back to WBCROSSGT because ADT-native call graph isn't available
for this program type/config — noted as a fallback behavior, not an error.

## 6. Where-used real run (graph --direction callers, as where-used substitute)

### vsp graph PROG ZSAH1_WORKDAYS --direction callers
```
ADT call graph not available, using WBCROSSGT table fallback

  (no references found)
```
EXIT=0. Command executes correctly; 0 callers is expected/correct for a brand-new
object with no other program referencing it yet. Confirms the command's signature
and output shape work as a where-used substitute.

## 7. Name collision check: vsp search "ZSAH2*" --max 50
```
Found 0 objects:
```
EXIT=0. No ZSAH2*-prefixed objects exist yet in the system — no collision risk for
that prefix.

## 8. Deploy/copy --help (help only, not executed)

### vsp deploy --help
```
Deploy an ABAP source file to a SAP package.
Supports abapGit-compatible file extensions:
  .clas.abap, .prog.abap, .intf.abap, .ddls.asddls, etc.
Usage: vsp deploy <file> <package> [--transport TR]
```
EXIT=0. Explicitly names `.clas.abap` (CLAS) and `.prog.abap` (PROG) extensions;
does not explicitly enumerate an INCLUDE-specific extension in the shown examples
(the "etc." implies more types exist but aren't listed by name here).

### vsp copy --help
```
Copy ABAP objects from an abapGit-format ZIP file to a SAP package.
If ZADT_VSP WebSocket handler is available, uses it for full 158 object type support.
Otherwise falls back to ADT native deployment (PROG, CLAS, INTF, DDLS, BDEF, SRVD).
Usage: vsp copy <source.zip> --to <$PACKAGE> [--dry-run] [--embedded ...] [--name ...] [--type ...]
```
EXIT=0. Explicitly lists CLAS in the ADT-native fallback type list (PROG, CLAS,
INTF, DDLS, BDEF, SRVD). INCLUDE is not named explicitly in either fallback list,
though the ZADT_VSP-backed path claims "full 158 object type support" (INCLUDE
presumably among those, but not itemized in --help text).
