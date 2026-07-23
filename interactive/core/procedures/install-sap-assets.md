---
name: install-sap-assets
description: DEV-tier installation procedure for the bundled server-side ABAP objects — ZMCP_ADT_UTILS dispatch/textpool FMs, ECC DDIC bridge FMs, ALV OOP reuse handlers, and conditional OData backend objects — with tier gate, cross-profile dedup, and partial-failure rules.
source:
  - sc4sap-custom/skills/setup/wizard-step-09-abap-objects.md
  - sc4sap-custom/skills/setup/odata-classes-install.md
---

# Install SAP Assets

Installs the server-side ABAP utility objects whose sources ship in this repo under [server/sap-assets/](../../server/sap-assets/). All bundles go into package `$TMP` (**local-only, not transportable** by design — these are developer/reuse helpers, not business logic).

| Bundle | Objects | Needed for | Condition |
|---|---|---|---|
| 1. MCP ADT utilities | FUGR `ZMCP_ADT_UTILS` + FMs `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL` | Screen / GUI Status / Text Element tool families | Always (DEV) |
| 2. ECC DDIC bridge FMs | 8 FMs in the same function group | DDIC writes + legacy reads on ECC | `SAP_VERSION=ECC` only |
| 3. ALV OOP reuse handlers | `ZIF_S4SAP_CM` + `ZCX_S4SAP_EXCP` + 5 `ZCL_S4SAP_CM_*` classes | Generated ALV programs | Always (DEV) |
| 4. OData backend | `ZCL_ZMCP_ADT_MPC/DPC_EXT` injections + `ZMCP_ADT_FLUSH_CACHE` | RFC dispatch via OData Gateway | `SAP_RFC_BACKEND=odata` only |
| 5. zrfc backend | ICF handler class — **not bundled** (see Step 5) | RFC dispatch via custom ICF node | `SAP_RFC_BACKEND=zrfc` only |

## Use When / Do Not Use When

Use when:
- A fresh DEV profile was configured and the utility objects have never been installed on that system
- [troubleshooting §1 Layer 4](troubleshooting.md#layer-4--required-server-side-abap-objects-gated) reports required objects missing or inactive
- The RFC backend was switched to `odata` and its backend objects are not yet on the system

Do NOT use when:
- The active profile's tier is QA or PRD — installation is refused by design; follow the CTS guidance in Step 0
- Layer 4 already reports all objects installed and active — nothing to do
- The MCP server or SAP connection is unhealthy — fix connectivity first ([troubleshooting §1](troubleshooting.md#1-mcp-server-connection--diagnostic-checklist)); a dead connection makes every object look "missing"

## Ground Rules (apply to every step)

- **Package `$TMP`, transport `LOCAL`** — pass `transport_request=LOCAL` on every upload; the objects are local and not transportable.
- **Already-exists skip** — check each bundle's anchor object via `SearchObject` before creating anything; if it exists, skip that bundle and report "already exists".
- **Partial failure** — if some objects were created and a later one fails, surface which object failed and the error, then let the user decide whether to retry or remove. Do NOT auto-delete successfully created objects.
- **RFC-enabled flag is a MANUAL step** — `TFDIR.FMODE` is not writable via ADT REST. After upload, the user must set each FM to Remote-Enabled in SE37 (Properties → Processing Type → Remote-Enabled Module). This applies to the dispatch/textpool FMs AND the ECC DDIC bridge FMs.
- **Source selection by `SAP_VERSION`** — read `SAP_VERSION` (`S4` | `ECC`) from the active profile's `sap.env`. Release-specific variants exist only as sibling source files (`*_ecc.abap`); **installed FM object names never carry the `_ecc` suffix** — the MCP server calls the unsuffixed names directly, and the `FUNCTION <name>` identifier inside every variant file is already unsuffixed.

## Step 0 — Tier Gate (MANDATORY — runs before anything else)

Read `SAP_TIER` from the active profile's env (`~/.sc4sap/profiles/<alias>/sap.env` — see [troubleshooting §4](troubleshooting.md#4-profiles--tiers)). Branch:

| Tier | Behaviour |
|---|---|
| `DEV` | Proceed to the system dedup check (Step 0b), then Steps 1–5 as applicable |
| `QA` / `PRD` | **REFUSE all install steps.** Print the CTS guidance below and stop. |

### QA/PRD — CTS import guidance (print verbatim)

> ⚠️ ABAP utility object installation is disabled on QA/PRD tiers by design.
>
> The utility objects (`ZMCP_ADT_UTILS` function group, `ZIF_S4SAP_CM` interface,
> `ZCL_S4SAP_CM_*` ALV OOP classes, and optionally `ZCL_ZMCP_ADT_*` OData classes)
> must be transported into this system via the Change & Transport System (CTS),
> not installed ad-hoc.
>
> Recommended path:
>   1. Install the utilities on the matching DEV profile first — switch the active
>      profile to the DEV alias (rewrite `<project>/.sc4sap/active-profile.txt`,
>      then call `ReloadProfile`; see troubleshooting §4), and run this procedure there.
>   2. Collect them in a CTS Workbench request on DEV (transaction `SE09`).
>   3. Release the transport on DEV, then import to QA/PRD via the standard
>      TMS import queue (transaction `STMS` on the target system).
>
> Why: the utilities live in package `$TMP` (local-only) on DEV by default —
> you will need to either (a) move them to a transportable package before
> releasing, or (b) re-create them in a transportable package on DEV as part
> of a one-time bootstrap transport. Talk to your Basis team for the package
> assignment (common choice: `Z_SC4SAP_UTILS`, delivery class `S` or `C`).

Record the skip in `~/.sc4sap/profiles/<alias>/.abap-utils-installed`:

```json
{ "installedAt": null, "dedupKey": "<SAP_URL>#<SAP_CLIENT>", "skippedReason": "tier=<QA|PRD>", "objects": [] }
```

Then apply the mandatory SKIPPED handling below ("If installation is skipped").

## Step 0b — System Dedup Check (DEV only)

Compute `dedupKey = SAP_URL + '#' + SAP_CLIENT`. Iterate sibling profiles under `~/.sc4sap/profiles/*/.abap-utils-installed`; if any sentinel has the same `dedupKey` AND `installedAt != null`, the same SAP system was already provisioned via another profile — skip the actual install and record:

```json
{ "installedAt": "<now>", "dedupKey": "<same>", "skippedReason": "already-installed-on-sibling", "via": "<siblingAlias>", "objects": [] }
```

If no match, proceed to Step 1. The real sentinel (with `objects[]`) is written after the final bundle activates (see Post-Install Verification).

## Step 1 — Dispatch / Textpool Function Modules (`ZMCP_ADT_UTILS`)

Required by the MCP server for the Screen, GUI Status, and Text Element tool families.

1. Check via `SearchObject` (query=`ZMCP_ADT_UTILS`, objectType=`FUGR`). If found, skip creation and report "ZMCP_ADT_UTILS already exists".
2. If NOT found:
   - `CreateFunctionGroup` — name `ZMCP_ADT_UTILS`, package `$TMP`, description `MCP ADT Utility Functions`
   - `CreateFunctionModule` — name `ZMCP_ADT_DISPATCH`, group `ZMCP_ADT_UTILS`, description `MCP ADT Dispatcher for Screen/GUI Status`
   - `CreateFunctionModule` — name `ZMCP_ADT_TEXTPOOL`, group `ZMCP_ADT_UTILS`, description `MCP ADT Text Pool Read/Write`
   - `UpdateFunctionModule` — upload the ABAP source per `SAP_VERSION`:
     - `S4` → [zmcp_adt_dispatch.abap](../../server/sap-assets/zmcp_adt_dispatch.abap), [zmcp_adt_textpool.abap](../../server/sap-assets/zmcp_adt_textpool.abap)
     - `ECC` → [zmcp_adt_dispatch_ecc.abap](../../server/sap-assets/zmcp_adt_dispatch_ecc.abap), [zmcp_adt_textpool_ecc.abap](../../server/sap-assets/zmcp_adt_textpool_ecc.abap)
     - Value absent or unrecognised → treat as `S4` and log a warning.
   - **S/4 header conversion required before upload**: the S/4 primary sources keep the SE37-style `*"*"Local Interface:` comment header for human reading, but ADT REST (`UpdateFunctionModule`) rejects it with "Parameter comment blocks are not allowed". Convert the header to the inline `FUNCTION ... IMPORTING ... EXPORTING.` signature syntax that the ECC variants already use (see [function-module-rule](../knowledge/abap/conventions/function-module-rule.md)), keeping parameter names and types identical.
   - **Invariant** — the installed FM object names are always `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL` regardless of which source file is picked (see Ground Rules).
   - Known ECC/S4 divergences that justify the sibling files:
     - `RS_CUA_INTERNAL_FETCH` table param `TIT` — ECC 7.40 expects `rsmpe_titt`; S/4HANA uses `rsmpe_tit`. Passing the wrong one fails with "parameter TIT — types match, but not the length".
     - Screen container/field line types — `RPY_DYCATT` / `RPY_DYFIELD` exist on S/4HANA but not ECC 7.40; the ECC variant declares internal tables using the FM's actual TABLES-parameter table types (`DYCATT_TAB`, `DYFATC_TAB`).
   - Activate all objects.
3. Set both FMs **RFC-enabled** — manual SE37 step (see Ground Rules).
4. Verify via `SearchObject` for `ZMCP_ADT_DISPATCH`.

## Step 2 — ECC DDIC Bridge FMs (ECC ONLY — skip on S/4HANA)

**Version gate:** if `SAP_VERSION=S4`, skip Step 2 entirely — the MCP server uses ADT's native DDIC paths on S/4HANA (`CreateTable` / `CreateDataElement` / `CreateDomain` / `GetTable` / ...). Do not port these FMs to S/4. If `ECC`, proceed.

All eight FMs live in the same function group `ZMCP_ADT_UTILS` (created in Step 1) — do NOT create a separate group. Create each via `CreateFunctionModule` (group `ZMCP_ADT_UTILS`), then upload via `UpdateFunctionModule` (`activate=true`, `transport_request=LOCAL`).

### 2a — DDIC write fallback FMs

ECC's ADT REST API does not support DDIC writes (TABL / DTEL / DOMA), so the MCP server falls back to RFC-exposed wrappers around `DDIF_*_PUT` / `DDIF_*_ACTIVATE`:

| Installed FM name | Source file | Description |
|---|---|---|
| `ZMCP_ADT_DDIC_TABL` | [zmcp_adt_ddic_tabl_ecc.abap](../../server/sap-assets/zmcp_adt_ddic_tabl_ecc.abap) | `MCP DDIC: Table CREATE/UPDATE/DELETE (ECC)` |
| `ZMCP_ADT_DDIC_DTEL` | [zmcp_adt_ddic_dtel_ecc.abap](../../server/sap-assets/zmcp_adt_ddic_dtel_ecc.abap) | `MCP DDIC: DataElement CREATE/UPDATE/DELETE (ECC)` |
| `ZMCP_ADT_DDIC_DOMA` | [zmcp_adt_ddic_doma_ecc.abap](../../server/sap-assets/zmcp_adt_ddic_doma_ecc.abap) | `MCP DDIC: Domain CREATE/UPDATE/DELETE (ECC)` |
| `ZMCP_ADT_DDIC_ACTIVATE` | [zmcp_adt_ddic_activate_ecc.abap](../../server/sap-assets/zmcp_adt_ddic_activate_ecc.abap) | `MCP DDIC: Activate TABL/DTEL/DOMA (ECC)` |

- **Install order matters** — TABL → DTEL → DOMA → ACTIVATE, in the order listed. All three write FMs must be present before any CREATE flow runs, and ACTIVATE must be present before any CREATE action returns; ADT's function-group-wide precheck requires every sibling's FORM references to resolve.
- **FORM naming invariant** — each FM defines its TADIR helper with an FM-specific suffix (`register_tadir_tabl` / `_dtel` / `_doma`). Do NOT rename to a shared `register_tadir` — ADT's FG-wide precheck treats duplicate FORMs across sibling FMs as compile errors.

### 2b — DDIC read bridge FMs

Bridges for legacy ECC kernels (BASIS < 7.50) where the standard ADT read endpoints are missing; the MCP server routes the matching read operations through them:

| Installed FM name | Source file | Bridges |
|---|---|---|
| `ZMCP_ADT_DDIC_TABL_READ` | [zmcp_adt_ddic_tabl_read_ecc.abap](../../server/sap-assets/zmcp_adt_ddic_tabl_read_ecc.abap) | Table / structure metadata reads |
| `ZMCP_ADT_DDIC_DTEL_READ` | [zmcp_adt_ddic_dtel_read_ecc.abap](../../server/sap-assets/zmcp_adt_ddic_dtel_read_ecc.abap) | Data element reads |
| `ZMCP_ADT_DDIC_DOMA_READ` | [zmcp_adt_ddic_doma_read_ecc.abap](../../server/sap-assets/zmcp_adt_ddic_doma_read_ecc.abap) | Domain reads |
| `ZMCP_ADT_DDIC_BADI` | [zmcp_adt_ddic_badi_ecc.abap](../../server/sap-assets/zmcp_adt_ddic_badi_ecc.abap) | BAdI implementation discovery |

Finish Step 2 with:

- **FM object name invariant** — installed names are exactly the ones in the tables above; no `_ecc` suffix (see Ground Rules).
- All eight FMs **RFC-enabled** — same manual SE37 step as Step 1.
- Re-verify via `SearchObject` for each of the eight FM names.

## Step 3 — ALV OOP Reuse Handlers (`ZIF_S4SAP_CM` / `ZCX_S4SAP_EXCP` / `ZCL_S4SAP_CM_*`)

Reusable ALV Grid + ALV Tree + SALV wrapper library consumed by programs generated via the [create-program](create-program.md) procedure and by custom dialogs.

1. Check via `SearchObject` (query=`ZIF_S4SAP_CM`, objectType=`INTF`). If found, skip Step 3 entirely and report "ALV OOP handlers already installed".
2. Source location: [server/sap-assets/alv-oop-handlers/](../../server/sap-assets/alv-oop-handlers/) — 7 objects = 14 files (`.abap` source + `.xml` ADT metadata pairs; take each object's description from the paired `.xml` → `DESCRIPT`).
3. Uses **standard message class `S_UNIFIED_CON`** (messages `013 No data found`, `000 &1 &2 &3 &4`). Do NOT create a custom message class — SAP ships it, and the exception class is hardcoded against it. If `S_UNIFIED_CON` is missing from the system (very rare), stop and inform the user.
4. Create in **dependency order** (`CreateInterface`/`CreateClass` → `UpdateInterface`/`UpdateClass` with the `.abap` source → activate):
   - ① `ZIF_S4SAP_CM` (interface) — no Z deps. Source: [zif_s4sap_cm.intf.abap](../../server/sap-assets/alv-oop-handlers/zif_s4sap_cm.intf.abap)
   - ② `ZCX_S4SAP_EXCP` (exception class) — `CreateClass` with superclass `CX_STATIC_CHECK`, category `40` (exception), final, public. Source: [zcx_s4sap_excp.clas.abap](../../server/sap-assets/alv-oop-handlers/zcx_s4sap_excp.clas.abap)
   - ③ `ZCL_S4SAP_CM_OALV` (ALV Grid subclass of `CL_GUI_ALV_GRID`) — no Z deps. Source: [zcl_s4sap_cm_oalv.clas.abap](../../server/sap-assets/alv-oop-handlers/zcl_s4sap_cm_oalv.clas.abap)
   - ④ `ZCL_S4SAP_CM_OTREE` (ALV Tree subclass of `CL_GUI_ALV_TREE`) — no Z deps. Source: [zcl_s4sap_cm_otree.clas.abap](../../server/sap-assets/alv-oop-handlers/zcl_s4sap_cm_otree.clas.abap)
   - ⑤ `ZCL_S4SAP_CM_ALV_EVENT` (event handler for `CL_GUI_ALV_GRID`) — no Z deps. Source: [zcl_s4sap_cm_alv_event.clas.abap](../../server/sap-assets/alv-oop-handlers/zcl_s4sap_cm_alv_event.clas.abap)
   - ⑥ `ZCL_S4SAP_CM_TREE_EVENT` (event handler for `CL_GUI_ALV_TREE`) — no Z deps. Source: [zcl_s4sap_cm_tree_event.clas.abap](../../server/sap-assets/alv-oop-handlers/zcl_s4sap_cm_tree_event.clas.abap)
   - ⑦ `ZCL_S4SAP_CM_ALV` (main container manager) — depends on ①–⑥; implements `ZIF_S4SAP_CM`. Source: [zcl_s4sap_cm_alv.clas.abap](../../server/sap-assets/alv-oop-handlers/zcl_s4sap_cm_alv.clas.abap)
5. After each object: `CheckSyntax`, then activate. If activation fails at ⑦ with unresolved references, verify ①–⑥ are **active** (not just created) via `GetInactiveObjects`.
6. Final check: `SearchObject` for `ZCL_S4SAP_CM_ALV` returns an active object → report "ALV OOP handlers installed (7 objects)".
7. On partial failure, apply the Ground Rules partial-failure rule.

## Step 4 — OData Backend Objects (conditional)

Only when `SAP_RFC_BACKEND=odata` in the active profile's `sap.env` (see [troubleshooting §3](troubleshooting.md#3-rfc-backend-selection)). Skip entirely for other backends.

### Prerequisite — SEGW project shell (manual, SAPGUI, ~5 minutes)

The SEGW project cannot be created via the MCP tools. Ask the user to run:

> **SAPGUI → SEGW → Create Project**
> - **Project**: `ZMCP_ADT`
> - **Type**: `Service with SAP Annotations`
> - **Package**: `$TMP`
>
> SEGW auto-generates 4 classes: `ZCL_ZMCP_ADT_MPC` / `ZCL_ZMCP_ADT_MPC_EXT` /
> `ZCL_ZMCP_ADT_DPC` / `ZCL_ZMCP_ADT_DPC_EXT` (base classes: do not modify;
> extension classes: the code below is injected there).
>
> Confirm project creation before proceeding.

Note: the `_EXT` extension classes are SEGW-generated shells — their final sources are not shipped as separate files in this distribution. The two bundled base sources below are adapted into them.

### Automated (MCP)

1. **Check existence** — `SearchObject(ZCL_ZMCP_ADT_MPC, CLAS)`. If absent, halt and re-prompt the user for SEGW project creation.
2. **Inject MPC_EXT source** — `UpdateClass` on `ZCL_ZMCP_ADT_MPC_EXT` with source adapted from [zcl_zmcp_adt_mpc.clas.abap](../../server/sap-assets/zcl_zmcp_adt_mpc.clas.abap):
   - `INHERITING FROM zcl_zmcp_adt_mpc` (the SEGW-generated parent, replacing the file's `/iwbep/cl_mgw_push_abs_model`)
   - `METHODS define REDEFINITION` — defines complex types (`DispatchResult`, `TextpoolResult`) + function imports (`Dispatch`, `Textpool`)
   - Activate.
3. **Inject DPC_EXT source** — `UpdateClass` on `ZCL_ZMCP_ADT_DPC_EXT` with source adapted from [zcl_zmcp_adt_dpc.clas.abap](../../server/sap-assets/zcl_zmcp_adt_dpc.clas.abap):
   - `INHERITING FROM zcl_zmcp_adt_dpc`
   - `METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION` — routes `Dispatch` → `CALL FUNCTION 'ZMCP_ADT_DISPATCH'`, `Textpool` → `CALL FUNCTION 'ZMCP_ADT_TEXTPOOL'`
   - Activate.
4. **Install the cache/diagnostics program** — `CreateProgram` + `UpdateProgram` for `ZMCP_ADT_FLUSH_CACHE` with source from [zmcp_adt_flush_cache.abap](../../server/sap-assets/zmcp_adt_flush_cache.abap). Activate. Three modes:
   - `P_FLUSH` — flush OData model / service-alias / proxy caches
   - `P_DIAG` — instantiate `ZCL_ZMCP_ADT_DPC_EXT` directly and call `execute_action` (bypasses Gateway, proves the ABAP logic)
   - `P_REG` — programmatically INSERT backend service rows into `/IWBEP/I_MGW_SRH` / `_OHD` / `_SRG` (emergency escape hatch when Basis isn't available)

### Manual follow-up — service registration (cannot be automated)

One of three paths, in order of preference:

- **Path A — Basis cooperation (recommended)**: ask the Basis team to run `/IWBEP/REG_SERVICE` + `/IWFND/MAINT_SERVICE` for `ZMCP_ADT_SRV` (~5 minutes).
- **Path B — Self-service via SEGW (requires `/IWBEP/SB` auth)**: in SEGW with project `ZMCP_ADT` open: Generate Runtime Objects (F6, Local Object `$TMP`) → Activate (Ctrl+F3) → Register Service (System Alias `LOCAL`, Package `$TMP`) → `/IWFND/MAINT_SERVICE` → Add Service → `ZMCP_ADT_SRV` → then SICF: activate `/default_host/sap/opu/odata/sap/ZMCP_ADT_SRV` if not already active.
- **Path C — Emergency escape hatch**: `SE38 → ZMCP_ADT_FLUSH_CACHE → F8 with P_REG = X`. This is a **partial** workaround — it writes the minimum SRH/OHD/SRG rows but may leave related tables under-populated. Full Basis registration remains preferred.

### Verification

After the service is registered, run the odata backend checks in [troubleshooting §3 — Verification — odata](troubleshooting.md#verification--odata) (env → metadata → CSRF → FunctionImport probes). An HTTP 500 on the FunctionImport probe usually means partial `/IWBEP` registration — run `ZMCP_ADT_FLUSH_CACHE` first, then fall back to Path A.

## Step 5 — zrfc Backend (conditional — handler not bundled)

Only when `SAP_RFC_BACKEND=zrfc`. The zrfc backend is powered by a single ICF handler class (`ZCL_MCP_RFC_HTTP_HANDLER`) that exposes `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL` as HTTPS/JSON endpoints. **That handler class source is not bundled in this distribution**, so this procedure cannot install it. If `zrfc` was chosen: either obtain the handler from the upstream distribution, or reconsider the backend choice per the selection criteria in [troubleshooting §3](troubleshooting.md#3-rfc-backend-selection). Verification of an already-installed handler (SICF node `/sap/bc/rest/zmcp_rfc`, CSRF probe) is covered in [troubleshooting §3 — Verification — zrfc](troubleshooting.md#verification--zrfc).

## Post-Install Verification

1. Re-run the required-objects checks in [troubleshooting §1 Layer 4](troubleshooting.md#layer-4--required-server-side-abap-objects-gated) — every installed object found via `SearchObject`, and `GetInactiveObjects` returns 0 entries for them.
2. Remind the user of any pending **manual** steps: SE37 RFC-enabled flags (Steps 1–2), OData service registration (Step 4).
3. On successful activation of the final bundle, write the sentinel to `~/.sc4sap/profiles/<alias>/.abap-utils-installed`:

```json
{ "installedAt": "<ISO 8601>", "dedupKey": "<SAP_URL>#<SAP_CLIENT>", "skippedReason": null, "objects": ["ZMCP_ADT_UTILS", "ZMCP_ADT_DISPATCH", "ZMCP_ADT_TEXTPOOL", "..."] }
```

## If Installation Is Skipped

If the utility FMs are not installed (tier-gate refusal, user choice, or FMs found absent mid-task) or the RFC backend is not configured, the three RFC-dispatched tool families — **Screen, GUI Status, Text Element** — cannot work on that system. Any procedure step that would use them must be treated as **SKIPPED, not failed**, and the skip must be recorded in the review request's `environment_context.known_outages[]` (fields `component` / `affected_step` / `observed_at` per [schemas/review-request.schema.json](./schemas/review-request.schema.json)) — see [create-program](create-program.md) Phase 6. Diagnosing whether the FMs are present: [troubleshooting §1 Layer 4](troubleshooting.md#layer-4--required-server-side-abap-objects-gated).

## Backend Tools Used

`SearchObject` (existence checks) · `CreateFunctionGroup` / `CreateFunctionModule` / `UpdateFunctionModule` (Steps 1–2) · `CreateInterface` / `UpdateInterface` / `CreateClass` / `UpdateClass` (Steps 3–4) · `CreateProgram` / `UpdateProgram` (Step 4) · `CheckSyntax` · `ActivateObjects` / `GetInactiveObjects` (activation + verification) · `ReloadProfile` (after profile switches in the CTS guidance)
