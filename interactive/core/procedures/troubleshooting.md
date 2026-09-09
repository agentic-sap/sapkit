---
name: troubleshooting
description: Harness-neutral diagnostics and operations for the SAP MCP server — connection checklist, SAP system identification, RFC backend selection criteria, profile/tier checks, and blocklist verification.
source:
  - sc4sap-custom/skills/sap-doctor/SKILL.md
  - sc4sap-custom/skills/sap-doctor/diagnostic-checks.md
  - sc4sap-custom/skills/sap-doctor/diagnostic-checks-rfc.md
  - sc4sap-custom/skills/mcp-setup/SKILL.md
  - sc4sap-custom/skills/sap-option/SKILL.md
  - sc4sap-custom/skills/sap-option/workflow.md
  - sc4sap-custom/skills/sap-option/profile-management.md
  - sc4sap-custom/skills/sap-option/rfc-managed-keys.md
  - sc4sap-custom/skills/setup/SKILL.md
  - sc4sap-custom/skills/setup/wizard-step-02-system-identification.md
  - sc4sap-custom/skills/setup/rfc-backend-selection.md
  - sc4sap-custom/skills/setup/wizard-step-12-blocklist-hook.md
---

# Troubleshooting & Operations

Diagnostic and operational know-how for the bundled SAP ADT MCP server (`server/server.bundle.cjs` — built from this repo's own `sapkit-engine/` since 2026-08-19; before that it was the `abap-mcp-adt-powerup` fork) and its SAP connection. Everything here is harness-neutral: any agent that can call the MCP tools and read/write local files can follow it.

Use this document when:

- something is broken and where it broke is not yet obvious
- initial configuration just finished and you want confirmation that it all landed correctly
- a SAP system change just happened (password reset, IP change, client migration)
- MCP tools are erroring out, or they are missing from your harness entirely
- a risky operation is coming and you need to confirm which system you are connected to

Walk the checks in order and report **PASS / FAIL / WARN / SKIP** for each layer — the later layers rest on the earlier ones.

> **Before walking the checklist**: if `.sapkit/RULES.md` / `LESSONS.md` / `knowledge/system.md` exist, grep them for the failing symptom first — this project's recorded failure modes (a profile-missing rule, a tool-response trap) resolve many diagnostics in one step, and the verified cause is already written down. Absent → proceed normally. Contract: [knowledge-sourcing](../policies/knowledge-sourcing.md).

## 1. MCP Server Connection — Diagnostic Checklist

### Layer 1 — MCP server

- [ ] The SAP MCP server is registered and running in your harness's MCP server list
- [ ] The server bundle exists at `server/server.bundle.cjs` and is **> 1 MB** — a missing/truncated bundle makes the server *appear* registered while every tool call fails
- [ ] `server/VERSION` is readable — report its first line (engine version + source commit). Missing VERSION with a healthy bundle → WARN only
- [ ] An MCP tool call (`GetSession`) comes back without an error — one is enough

### Layer 2 — SAP system connection

- [ ] `GetSession` comes back with valid system data (system ID, client, user)
- [ ] `GetInactiveObjects` answers (exercises developer authorization `S_DEVELOP`)
- [ ] `ListTransports` answers (exercises transport authorization `S_TRANSPRT`)
- [ ] `SearchObject` answers on a simple query (exercises object repository access)
- [ ] `GetTableContents` answers on `T000` (exercises table access)

### Layer 3 — configuration consistency

- [ ] The SAP host URL is reachable (HTTPS / ICM port, typically 44300)
- [ ] The configured client matches what `GetSession` reports
- [ ] The configured username matches what `GetSession` reports

### Layer 4 — required server-side ABAP objects (gated)

> **Gate — strict dependency**: run this layer ONLY when Layer 1 (MCP server) AND Layer 2 (SAP connection) both end in PASS. If either is FAIL, mark Layer 4 as **[SKIP — SAP connection not ready]** and do **not** issue any `SearchObject` / `GetInactiveObjects` call. Every check here depends on a live MCP + SAP session; an MCP or connectivity failure makes every object appear "missing" and would mislead you toward re-installing objects that actually exist. Fix connectivity first, then re-run.

*MCP ADT utilities — required for Screen / GUI Status / Text Element operations:*

- [ ] `SearchObject(ZSAPKIT_ADT_UTILS, FUGR)` finds the function group
- [ ] `SearchObject(ZSAPKIT_ADT_DISPATCH, FUNC)` finds the dispatcher function module, and it is RFC-enabled
- [ ] `SearchObject(ZSAPKIT_ADT_TEXTPOOL, FUNC)` finds the text pool function module, and it is RFC-enabled

*ALV OOP reuse handlers — consumed by generated ALV programs:*

- [ ] `SearchObject(ZIF_SAPKIT_CM, INTF)` finds the interface
- [ ] `SearchObject(ZCX_SAPKIT_EXCP, CLAS)` finds the exception class
- [ ] `SearchObject(ZCL_SAPKIT_CM_OALV, CLAS)` finds the ALV Grid wrapper
- [ ] `SearchObject(ZCL_SAPKIT_CM_OTREE, CLAS)` finds the ALV Tree wrapper
- [ ] `SearchObject(ZCL_SAPKIT_CM_ALV_EVENT, CLAS)` finds the Grid event handler
- [ ] `SearchObject(ZCL_SAPKIT_CM_TREE_EVENT, CLAS)` finds the Tree event handler
- [ ] `SearchObject(ZCL_SAPKIT_CM_ALV, CLAS)` finds the main container manager
- [ ] `GetInactiveObjects` returns 0 entries for any of the above — every object must be **active**; created-but-inactive counts as FAIL

Report counts at the layer level, e.g. `utilities: 3/3 installed`, `ALV handlers: 7/7 installed, 7/7 active`. If an object exists but is inactive, flag a WARN with the specific object names.

Remediation: ABAP sources for all of these ship in this repo under `server/sap-assets/` (`zsapkit_adt_dispatch.abap`, `zsapkit_adt_textpool.abap`, `alv-oop-handlers/`). Install on a **DEV-tier** system only; QA/PRD systems receive them via CTS transport.

### Layer 5 — RFC backend (conditional)

Resolve `SAP_RFC_BACKEND` from the active profile's `sap.env`, then run the matching verification sub-section in §3 below. Output a one-line banner stating which backend was verified.

### Common failures → fixes

| Symptom | Likely cause → fix |
|---|---|
| **401 Unauthorized** | Wrong `SAP_USERNAME` / `SAP_PASSWORD` in `sap.env`; confirm the user is not locked (SU01) |
| **Connection refused** | Verify `SAP_URL` host and ICM HTTPS port; check VPN if required |
| **ADT service not found** | Activate `/sap/bc/adt` in transaction SICF and ensure ICF is running |
| **SSL certificate errors** | Add the SAP system certificate to the Node.js trust store (recommended), or temporarily set `TLS_REJECT_UNAUTHORIZED=0` in `sap.env` (dev only — never in prod) |
| **Server registered but every tool call fails** | `server/server.bundle.cjs` missing or truncated — restore the server bundle |
| **`Basic authentication requires SAP_CLIENT to be provided` on every tool** | Do NOT read this as "MCP is down" — the tools are attached and answering. The alias in `active-profile.txt` has no profile directory on *this* machine, so no connection parameters resolve. See §4 → *Profile missing on this machine* |
| **Write tools missing from the tool list** (`Update*` / `Create*` / `ActivateObjects` absent; ~65 tools inspection-only / ~74 connected instead of ~155/186) | Not an outage and not the tier guard — the launcher started with the `readonly` tool surface because the project's runtime `config.json` has no `toolSurface`. See §4 → *Tool surface* |
| **Config changes have no effect** | `sap.env` changes are NOT hot-reloaded — reconnect/restart the MCP server per your harness's procedure |
| **`400 Bad request. Session Timed Out`** after an idle stretch (typically on a large source upload) | The stateful ADT session expired and there is no auto-recovery — the payload is lost, not the connection. One read call of any kind (`GetInactiveObjects` will do) re-establishes it; then repeat the failed call. Not credentials, not an outage (field-verified 2026-07-29) |
| **Refusal when reading a legitimate table** | Blocklist guard — see §5 |
| **Authorization errors on specific operations** | Required authorization objects: `S_DEVELOP` (development), `S_TRANSPRT` (transports); RFC-dispatched ops additionally need `S_RFC` |

### Report format

```
SAP Diagnostic Report
=====================
MCP Server          [PASS]  server responding, bundle present
SAP Connection      [PASS]  SID=S4H · Client=100 · User=DEV01
Configuration       [PASS]
Required Objects    [WARN]  utilities: 3/3 · ALV handlers: 7/7 (ZCL_SAPKIT_CM_ALV inactive)
RFC Backend         [PASS]  odata — metadata + CSRF + dispatch OK

Issues Found: 0 errors, 1 warning
Fix: Activate ZCL_SAPKIT_CM_ALV (source in server/sap-assets/alv-oop-handlers/)
```

When connectivity fails, gate the dependent layers:

```
MCP Server          [FAIL]  server not responding
SAP Connection      [SKIP]  Cannot test without MCP server
Required Objects    [SKIP]  SAP connection not ready
```

If everything passes: `System healthy. System: {SID} Client: {client} User: {user}`.

## 2. SAP System Identification (version / release)

### System type

Work out which system type you are up against:

- **S/4HANA** (`S4`) — Business Partner (BP), MATDOC, ACDOCA, Fiori, CDS-based
- **ECC 6.0** (`ECC`) — Vendor/Customer separate (XK01/XD01/FK01/FD01), MKPF/MSEG, BKPF/BSEG

### ABAP release

Pin down the **ABAP release** (e.g. `750`, `751`, `756`, `757`, `758`):

- Read it off `GetSession` once connected, or in SAPGUI: TCode `SE38` → System → Status
- Or ask the user outright

This is **critical**, because it decides:

- Which SPRO config tables, BAPIs, TCodes, and workflows the module knowledge (`../knowledge/modules/{MODULE}/`) gets read for
- Which tables/views a query targets (ECC: `MKPF`+`MSEG` vs S4: `MATDOC`; ECC: `KNA1`+`LFA1` vs S4: `BUT000`)
- Which ABAP syntax features generated code may reach for — see [abap-release-reference](../knowledge/abap/conventions/abap-release-reference.md) and [sap-version-reference](../knowledge/abap/conventions/sap-version-reference.md)

Persist the answers as `SAP_VERSION` (`S4` | `ECC`) and `ABAP_RELEASE` (3-digit numeric) in the profile's `sap.env` and in `.sapkit/config.json`. `SAP_INDUSTRY` (industry key) belongs in the same pair of files and drives which industry knowledge applies.

## 3. RFC Backend Selection

Three MCP operation families (Screen, GUI Status, Text Element) dispatch through RFC-enabled function modules (`ZSAPKIT_ADT_DISPATCH`, `ZSAPKIT_ADT_TEXTPOOL`); everything else uses the ADT HTTPS channel. `SAP_RFC_BACKEND` selects the transport for those RFC-dispatched operations.

> **Agent context (R-005)**: under an agent/wizard context bound by R-005 (never read, handle, or print passwords), skip the `curl` probes below and verify the backend instead with an equivalent MCP tool call over the same RFC path — e.g. for `odata`, a lightweight read like `GetTextElement` on any known program; an error surfaced this way (e.g. an HTTP 500) is the same evidence the curl probe would give. The curl commands remain the human-operator path.

### Selection criteria

| Backend | Transport | Choose when |
|---|---|---|
| `odata` (default) | SAP OData v2 service `ZSAPKIT_ADT_SRV` via HTTPS (SEGW + Gateway registration) | Default choice. Gateway is almost always reachable and routes through standard Gateway authorization (`S_SERVICE`) instead of `S_RFC` |
| `soap` | HTTPS via `/sap/bc/soap/rfc` | The legacy SOAP ICF node is active (hardened installs increasingly disable it). No extra env fields needed |
| `native` | Direct TCP via SAP NW RFC SDK | The (paid-download) SDK + build tools are available on this host |
| `gateway` | Remote RFC Gateway middleware via HTTPS/JSON | A central SDK host exists; no SDK needed on this machine |
| `zrfc` | Custom ICF handler `/sap/bc/rest/zmcp_rfc` via HTTPS | Company blocks `/sap/bc/soap/rfc` AND OData Gateway is hard (typical ECC). Needs neither SDK nor Gateway registration — just one handler class (`ZCL_MCP_RFC_HTTP_HANDLER`, not bundled in this repo) + one SICF node |

The default changed 2026-04-22 from `soap` to `odata`. Existing configurations that pinned `SAP_RFC_BACKEND=soap` keep working unchanged.

Write the choice to the **active profile's** env (`~/.sapkit/profiles/<alias>/sap.env`) as `SAP_RFC_BACKEND=odata|soap|native|gateway|zrfc`. Never write it to `<project>/.sapkit/sap.env` — that file does not exist in multi-profile mode.

### Bootstrap order (first-time vs re-run)

`soap` / `native` / `gateway` can be verified in full immediately — they need no backend objects on SAP.

`odata` / `zrfc` have a **chicken-and-egg**: their probes target server-side objects (`ZCL_ZSAPKIT_ADT_MPC_EXT` / `ZCL_ZSAPKIT_ADT_DPC_EXT` for odata; `ZCL_MCP_RFC_HTTP_HANDLER` + SICF node for zrfc) that are installed *after* the backend is chosen. On a fresh system a 404 from the probe is **expected, not a bug** — record the choice, emit a deferred-verification note, and verify after the backend objects are installed. On a re-run/reconfiguration where the objects were installed previously, probe failures are genuine.

### Per-backend env keys

- **soap** — none beyond the base connection (`SAP_URL` + `SAP_USERNAME` + `SAP_PASSWORD` are reused)
- **native** — `SAP_RFC_USER`, `SAP_RFC_PASSWD` (secret — always mask), `SAP_RFC_CLIENT` (3 digits), `SAP_RFC_LANG` (2-letter uppercase, default `EN`), and either (`SAP_RFC_ASHOST` + `SAP_RFC_SYSNR` [2 digits]) **or** (`SAP_RFC_MSHOST` + `SAP_RFC_SYSID`, optional `SAP_RFC_GROUP` default `PUBLIC`, `SAP_RFC_MSSERV`) — `ASHOST` and `MSHOST` are mutually exclusive. Optional SNC: `SAP_RFC_SNC_QOP` (`1|2|3|8|9`); when set, `SAP_RFC_SNC_MYNAME` and `SAP_RFC_SNC_PARTNERNAME` become required (`SAP_RFC_SNC_LIB` optional)
- **gateway** — `SAP_RFC_GATEWAY_URL` (required, `https://host[:port]`, no trailing slash), `SAP_RFC_GATEWAY_TOKEN` (secret — always mask; warn if missing), `SAP_RFC_GATEWAY_TLS_VERIFY` (`1` default; `0` dev-only). `SAP_USERNAME`/`SAP_PASSWORD`/`SAP_CLIENT`/`SAP_LANGUAGE` are forwarded per-request as `X-SAP-User`/`X-SAP-Password`/`X-SAP-Client`/`X-SAP-Language` headers, so the gateway opens a per-developer RFC session and the SAP audit trail stays accurate — no separate RFC user needed on this host
- **odata** — `SAP_RFC_ODATA_SERVICE_URL` (required, e.g. `https://host:44300/sap/opu/odata/sap/ZSAPKIT_ADT_SRV`, no trailing slash), `SAP_RFC_ODATA_CSRF_TTL_SEC` (default `600`, min 60). Basic auth reuses `SAP_USERNAME`/`SAP_PASSWORD`; `SAP_CLIENT` is appended as `?sap-client=<n>`. The client performs an automatic CSRF handshake (GET `$metadata` with `X-CSRF-Token: Fetch`), caches the token, and refreshes on HTTP 403
- **zrfc** — `SAP_RFC_ZRFC_BASE_URL` (required, e.g. `https://host:44300/sap/bc/rest/zmcp_rfc`), `SAP_RFC_ZRFC_CSRF_TTL_SEC` (default `600`, min 60). Reuses `SAP_USERNAME`/`SAP_PASSWORD`/`SAP_CLIENT` as Basic auth; automatic CSRF double-submit handshake

After switching backends, always re-run the §1 checklist including the matching backend verification below.

### Verification — soap

- [ ] ICF node `/default_host/sap/bc/soap/rfc` must be **active** in SICF (transaction `SICF` → Hierarchy Type `SERVICE` → Execute → `default_host` → `sap` → `bc` → `soap` → `rfc` → if grey, right-click → Activate Service). SAP exposes no anonymous GET on this endpoint, so a **405 on GET is the positive signal**:

  ```bash
  curl -s -o /dev/null -w "%{http_code}" -u $SAP_USERNAME:$SAP_PASSWORD \
    "$SAP_URL/sap/bc/soap/rfc?sap-client=$SAP_CLIENT"
  ```

  Expect `405`. A `404` means the ICF node is inactive.

The SOAP backend otherwise reuses the Layer 2 HTTPS ADT channel — its health is already covered there.

### Verification — native

1. *RFC module*: `node-rfc` resolves next to the server bundle and `require('node-rfc')` succeeds (the native addon links to `libsapnwrfc`; the bundle keeps `node-rfc` external, so it must be installed separately).
2. *NW RFC SDK*: `SAPNWRFC_HOME` points to an existing folder, OR `libsapnwrfc.{dll,so,dylib}` is resolvable from the loader path; SDK version ≥ 7.50 (read from `<SAPNWRFC_HOME>/lib/sapnwrfc_version`; surface the version string). If missing: download the SAP NW RFC SDK (SAP Support Portal → SAP Development Tools → SAP NetWeaver RFC SDK 7.50) and set `SAPNWRFC_HOME`.
3. *Env completeness*: `SAP_RFC_USER` / `SAP_RFC_PASSWD` / `SAP_RFC_CLIENT` present; exactly one of (`ASHOST`+`SYSNR`) or (`MSHOST`+`SYSID`); `SAP_RFC_LANG` present; SNC triple complete if `SAP_RFC_SNC_QOP` is set.
4. *Live probes*: `RFC_PING` returns without error (connectivity + credentials + handshake); `ZSAPKIT_ADT_DISPATCH` with a harmless action returns a non-fatal `EV_SUBRC` (proves `S_RFC` on the dispatcher); `ZSAPKIT_ADT_TEXTPOOL` `READ` on a known program (`RSPARAM`) returns a non-empty result (proves `S_RFC` on the textpool FM).

If check 1–2 fails → **BLOCKER**. If only check 4 fails while 1–3 pass → **authorization issue** (usually `S_RFC` missing `RFC_NAME = ZSAPKIT_ADT_*`). Best practice: use a dedicated RFC user with `S_RFC` (`RFC_NAME = ZSAPKIT_ADT_DISPATCH, ZSAPKIT_ADT_TEXTPOOL, RFC_PING, SYSTEM`) plus minimal `S_DEVELOP` for TEXTPOOL INSERT — do not reuse the ADT user's credentials in both blocks unless intentional.

### Verification — gateway

1. *Env completeness*: `SAP_RFC_GATEWAY_URL` parses as a valid `https://host[:port]` URL; base SAP credentials present; warn if `SAP_RFC_GATEWAY_TOKEN` missing (unauthenticated gateways are discouraged).
2. *Reachability*: `GET $SAP_RFC_GATEWAY_URL/health` (with `Authorization: Bearer $SAP_RFC_GATEWAY_TOKEN`) returns HTTP 200 within 10s with JSON `status: "ok"` — TLS handshake, routing, and the gateway process validated in one call. Surface `sdk_version` / `pool_size` if reported.
3. *Live probes*: `POST /rfc/dispatch` with `{"action":"PING","params":{}}` and the X-SAP-* headers returns `{subrc: 0}` (gateway → SAP RFC works with forwarded credentials); `POST /rfc/textpool` `READ` for `RSPARAM` returns non-empty `result[]` (full pipeline incl. `S_RFC` on ZSAPKIT_ADT_TEXTPOOL).

If check 1 fails → fill the gateway env block. If check 2 fails → verify VPN / firewall / DNS / gateway process. If only check 3 fails → credentials are forwarded but SAP-side authorization is wrong.

### Verification — odata

1. *Env completeness*: `SAP_RFC_ODATA_SERVICE_URL` present with the service path; base credentials present.
2. *Metadata probe*:

   ```bash
   curl -sSu $SAP_USERNAME:$SAP_PASSWORD \
     "$SAP_RFC_ODATA_SERVICE_URL/\$metadata?sap-client=$SAP_CLIENT"
   ```

   Must return HTTP 200 with `Content-Type: application/xml`, an `<edmx:Edmx` marker, and both `ComplexType Name="DispatchResult"` and `FunctionImport Name="Dispatch"` (proves the MPC definition reached the gateway). A 404 on fresh setup → deferred (see bootstrap order); 404 on re-run → service not registered.
3. *CSRF handshake*: `GET /$metadata` with header `X-CSRF-Token: Fetch` returns a non-empty `X-CSRF-Token` header plus `Set-Cookie`. If the server answers `X-CSRF-Token: required` on GET, Basic auth is being rejected — verify credentials and the user's authorization.
4. *Live FunctionImport probes*: `POST .../Dispatch?IV_ACTION='PING'&IV_PARAMS='%7B%7D'` (with CSRF token + cookie) returns HTTP 200; `POST .../Textpool?IV_ACTION='READ'&IV_PROGRAM='RSPARAM'&...` returns `EV_SUBRC=0` with non-empty `EV_RESULT`.

| Failure | Action |
|---|---|
| env missing | Set `SAP_RFC_ODATA_SERVICE_URL` in the profile's `sap.env` |
| metadata HTTP 404 | Install the OData MPC/DPC classes (`zcl_zsapkit_adt_mpc.clas.abap` / `zcl_zsapkit_adt_dpc.clas.abap` in `server/sap-assets/`), then register the service in `/IWFND/MAINT_SERVICE` |
| metadata HTTP 401 | Basic auth rejected — verify `SAP_USERNAME` / `SAP_PASSWORD` |
| no CSRF token | ICF node for `/sap/opu/odata/` inactive — ask Basis to activate |
| FunctionImport HTTP 500 | Backend `/IWBEP` service registration missing (known gotcha — `/IWFND/MAINT_SERVICE` "Add Service" does not always populate the backend `/IWBEP` tables on all releases). First try `SE38 → ZSAPKIT_ADT_FLUSH_CACHE`, then have Basis run `/IWBEP/REG_SERVICE` |
| `EV_SUBRC` ≠ 0 | User lacks `S_RFC` authorization for `ZSAPKIT_ADT_DISPATCH` / `ZSAPKIT_ADT_TEXTPOOL` |

### Verification — zrfc

1. *Handler present*: class `ZCL_MCP_RFC_HTTP_HANDLER` exists on the SAP backend. Absent on fresh setup → deferred; absent on re-run → install the handler first.
2. *CSRF fetch probe*:

   ```bash
   curl -sSu $SAP_USERNAME:$SAP_PASSWORD -H "X-CSRF-Token: Fetch" \
     -o /dev/null -w "status=%{http_code} token=%header{x-csrf-token}\n" \
     "$SAP_RFC_ZRFC_BASE_URL/dispatch?sap-client=$SAP_CLIENT"
   ```

   Must return `status=200` and a non-empty token. `404` on re-run → SICF node `/sap/bc/rest/zmcp_rfc` not active; activate it in transaction `SICF` (right-click → Activate Service). `401` = Basic auth failure (genuine error regardless of phase).
3. *Security note*: the handler uses a hardcoded deny list (e.g. `SXPG_CALL_SYSTEM`, `RFC_ABAP_INSTALL_AND_RUN`) on its `/call` endpoint; the two MCP endpoints `/dispatch` and `/textpool` map to fixed FMs and are not affected. Extending the deny list means editing `ZCL_MCP_RFC_HTTP_HANDLER->class_constructor` and re-transporting (source-level control, not table-maintained).

## 4. Profiles & Tiers

### Storage layout

Profile home resolution order: `$SAPKIT_HOME_DIR` if set, else `~/.sapkit`. A
`SAPKIT_HOME_DIR` that is set but points nowhere is a hard error (`ENV_INVALID`),
never a silent fall-through to `~/.sapkit` — fix or unset it.

```
~/.sapkit/profiles/<alias>/sap.env        # user-level connection env (shared across repos)
~/.sapkit/profiles/<alias>/config.json    # user-level plugin settings (sapVersion, abapRelease,
                                          #   industry, activeModules, namingConvention,
                                          #   systemInfo, activeTransport, blocklistProfile)
~/.sapkit/profiles/.trash/<alias>-<ts>/   # soft-deleted profiles (7-day auto-purge)

<project>/.sapkit/active-profile.txt      # project-level pointer (alias only)
<project>/.sapkit/work/<alias>/...        # per-profile project artifacts
```

A **single-profile** layout (`<project>/.sapkit/sap.env`, no `active-profile.txt`)
is still read — report it as `(single-profile)` when encountered.

Alias convention: `{COMPANY}-{TIER}` (e.g. `KR-DEV`, `US-PRD`), matching `^[A-Z0-9_-]+$`. Never auto-name a profile `default`.

### Tier semantics

`SAP_TIER` enum: `DEV` | `QA` | `PRD`. Non-canonical tiers are mapped: SBX→DEV, STG/PRE-PRD→PRD, INT/TRN→QA.

| Tier | Allowed operations |
|---|---|
| `DEV` | Writes allowed; server-side ABAP objects (§1 Layer 4) are installed on this tier only |
| `QA` | Read + `RunUnitTest` only; mutations (`Create*` / `Update*` / `Delete*`, `CreateTransport`) and `RuntimeRun*` blocked |
| `PRD` | Strict read-only; `RunUnitTest` also blocked |

Tier read-only enforcement lives in the MCP server itself (a readonly guard applied at profile load). A harness-level pre-call guard may exist as an additional outer layer — that is an adapter concern, not covered here.

**Tier is immutable on an existing profile** — changing it requires remove + re-add. This prevents accidentally downgrading a PRD profile to DEV.

### Tool surface — write tools missing from the list

Symptom: reads work normally but `Create*` / `Update*` / `Delete*` / `ActivateObjects` / `ReleaseTransport` are **absent from the tool list** — roughly 65 tools (inspection-only) or 74 (connected) instead of ~155/186. Since v0.5.0 the launcher decides the tool surface from `toolSurface` in the project's runtime `config.json`; when the key is absent or misspelled it starts `readonly` **by design** (fail-closed), and the only notice goes to stderr — which an agent session cannot see, so from inside the session this is indistinguishable from a broken install or a permission problem. It is neither.

Tell it apart from the tier guard first:

- Write tool **listed but refused when called** (`ERR_READONLY_TIER`) → tier guard — see *Tier semantics* above.
- Write tool **not in the list at all** → tool surface (this subsection). Permissions, blocklist, and tier are not the cause.

Checks:

- [ ] Locate the project's ACTIVE runtime directory — the one holding `active-profile.txt` (or a legacy `sap.env`): `.sapkit/` for a new or migrated project, the legacy-generation directory otherwise (see *Storage layout* above). A `config.json` placed in the *other* generation is **not read**.
- [ ] Read `toolSurface` in `<that dir>/config.json` — absent or a typo means the surface is `readonly` by design, not a defect.

Fix: set `"toolSurface": "development"` in that `config.json` and **restart the MCP server** — the surface is decided once at launch, and `ReloadProfile` does not re-read `config.json`. `development` only takes effect when the active profile's `SAP_TIER=DEV`; on QA/PRD (or an unresolved tier) the launcher stays `readonly` fail-closed, which is correct behavior, not a bug.

Upgrade trap: projects created before v0.5.0 have no `toolSurface` key, so their write tools disappear silently on the first post-upgrade session — they never saw the [setup](setup.md) Step 3 question that normally decides this (field-reported 2026-08-03).

Same root, different entry point: reload a profile that sits on a **different deployment axis** (onprem / cloud / legacy) than the one this server started on, and the connection and tier come from the new profile while `UpdateClass`, `ActivateObjects` and the other write tools may be **absent from the tool list** — they cannot be called, and no later response explains why (field-verified 2026-09-09). *On older bundles* `ReloadProfile` answered `restartRequired: true` for that case and the list stayed as it was fixed at launch. Since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) the server re-registers its tool list for the new axis, reports what moved under `tool_list_republished` (`added` / `removed`), and sends a `notifications/tools/list_changed`; `restartRequired` is now reserved for a lost destination token. Offline-verified only, and one link in the chain is **unconfirmed by design** — whether Claude Code, Codex or Antigravity actually re-reads the tool list on that notification has not been measured. So read the response's `note`: where the tools you need are still not listed, reconnect the MCP server (`/mcp` on the Claude adapter) rather than retrying the call. Absent write tools here are not a permission or tier problem either way.

### Profile checks

- [ ] `<project>/.sapkit/active-profile.txt` exists and contains a single alias
- [ ] `~/.sapkit/profiles/<alias>/sap.env` and `config.json` exist for that alias
- [ ] `GetSession` system/client/user match the profile's `SAP_URL` / `SAP_CLIENT` / `SAP_USERNAME`
- [ ] Tier enforcement matches `SAP_TIER` (on QA/PRD, a mutation attempt must be refused)

After **switching** profiles (rewriting `active-profile.txt`) or **mutating the active profile's files**, call `ReloadProfile` so the MCP server picks up the change in-session. Expect a response like `{ ok: true, alias, tier, readonly, host, client }` — confirm `alias`/`tier` match what you switched to.

### Profile missing on this machine

`active-profile.txt` stores an **alias only**; the profile body lives in the user home and is git-ignored. Clone a project onto a second machine and the pointer still resolves to a name that has no directory behind it — the repo carries no trace of the mismatch. Every tool then fails with `Basic authentication requires SAP_CLIENT to be provided` (profile lookup fails → env fallback → no client), which reads like an outage but is not one: the tool schemas loaded and the server answered.

Confirm before diagnosing anything else:

- [ ] Compare the alias in `active-profile.txt` against the actual contents of the profile home resolved above (`~/.sapkit/profiles/`, or its legacy equivalent when that is the active home)
- [ ] Read `~/.sapkit/state/mcp-stderr.log` — `[MCP] Starting in inspection-only mode (no connection parameters).` is the server reporting the missing middle link itself
- [ ] A stale `<project>/.sapkit/state/mcp-stderr.log` may point at a home directory that does not exist on this machine at all (e.g. another user's `C:\Users\<other>\…`) — that is the fingerprint of a profile created elsewhere
- [ ] Check **which runtime directory the project actually has**. A project last set up before 0.7.0 carries the pre-0.7 runtime directory and no `.sapkit/`. Nothing migrates it, and no fallback reads the older generation any more, so every call fails with this same message while the profile itself is present and healthy in the user home. Renaming the project's directory to `.sapkit/` and reconnecting restores it — move `config.json` across with it, or the launcher finds no `toolSurface` and starts `readonly` (see *Tool surface* above). (field-verified 2026-08-19)

Fix by re-creating the profile through [setup](setup.md) on this machine, or by pointing `active-profile.txt` at an alias that exists here. Never invent the missing profile on the user's behalf — connection settings and credentials are theirs to supply. (Live-observed 2026-08-02; the reverse direction — that creating the profile clears it — was not re-measured.)

### Secrets

- Passwords are ideally stored in the OS keychain (service `sc4sap`, account `<alias>/<username>`) and referenced as `SAP_PASSWORD=keychain:sc4sap/<alias>/<username>` in `sap.env`. Plaintext fallback (headless/Docker) deserves an explicit warning.
- Never display `SAP_PASSWORD`, `SAP_RFC_PASSWD`, `SAP_RFC_GATEWAY_TOKEN`, or `XSUAA_CLIENT_SECRET` in any form — logs, prompts, diffs, or error messages. Mask as `*** (n chars)`.
- Never copy `sap.env` outside `.sapkit/` locations, and never commit it to version control.

### Editing sap.env safely

1. Parse as `KEY=VALUE`; preserve comment lines (`#`), blank lines, and unmanaged keys untouched on write.
2. Validate before writing: `SAP_URL` matches `^https?://[^ ]+` with no trailing slash; `SAP_CLIENT` exactly 3 digits; `SAP_AUTH_TYPE` `basic`|`xsuaa`; `SAP_LANGUAGE` 2-letter uppercase; `SAP_SYSTEM_TYPE` `onprem`|`cloud`|`legacy`; `SAP_VERSION` `S4`|`ECC`; `ABAP_RELEASE` 3-digit numeric; `TLS_REJECT_UNAUTHORIZED` `0` or unset (warn: dev-only).
3. Show a Before/After diff of only the changing lines (secrets masked in both columns) and get confirmation.
4. Back up to `sap.env.bak`, then write atomically (`sap.env.tmp` → rename). The backup contains secrets — mention its existence but never read it back out.
5. Remind: changes are **not hot-reloaded** — reconnect/restart the MCP server (or call `ReloadProfile` for profile switches) for changes to take effect.

## 5. Blocklist Verification

The MCP server carries an internal row-extraction guard on `GetTableContents` / `GetSqlQuery`, configured in the profile's `sap.env` — and, **for tightening only**, in the server's process environment:

- `MCP_BLOCKLIST_PROFILE` — `minimal` | `standard` | `strict` | `off` (default: `standard`)
  - `minimal` — block only PII / credentials / banking
  - `standard` — minimal + Protected Business Data (ACDOCA, BKPF, VBAK, EKKO, ...) *(default)*
  - `strict` — standard + Audit/Security + Communication/Workflow
  - `off` — disable the guard entirely (NOT recommended; require an explicit confirmation such as "This disables ALL row-extraction guards. Type `I UNDERSTAND` to proceed.")
- `MCP_BLOCKLIST_EXTEND` — comma-separated extra table names/patterns, always denied (use for site-specific Z-tables with sensitive data, e.g. `ZHR_SALARY,ZCUSTOMER_PII`)
- `MCP_ALLOW_TABLE` — comma-separated whitelist for an **audited one-off bypass**; each use is logged to stderr. Remove entries when no longer actively needed.

> **Which channel wins.** `MCP_ALLOW_TABLE` is read from the **active profile's `sap.env` only** — a value in the process environment is ignored, because it opens the guard. A `MCP_BLOCKLIST_PROFILE` from the environment applies only when it is **stricter** than the profile's, and the two `MCP_BLOCKLIST_EXTEND` lists are **unioned**. In one line: the process environment can tighten this guard, never loosen it (D-096). So if a table is refused and you believe it should not be, the fix goes in `sap.env`.
>
> ⚠ That rule is about the **contents** of the profile file, not about **which file** is used. `MCP_ENV_PATH` and `SAPKIT_HOME_DIR` still select the profile from the process environment, so whoever can set those can point the server at a `sap.env` they wrote. Read "the profile file only" as "the only place an opening value can be written", not as a wall.

Value format for EXTEND/ALLOW: uppercase table names, `[A-Z0-9_*]+` where `*` is a glob; strip whitespace around commas.

Category definitions and the full policy live in [data-extraction-policy](../policies/data-protection/data-extraction-policy.md). This server-side guard is the authoritative layer; a harness-level pre-call hook may exist in front of it (adapter concern, not covered here).

### Verifying blocklist behavior

- [ ] Call `GetTableContents` on a known-sensitive table (e.g. `BNKA` — banking, blocked under every profile except `off`) and confirm the call is **refused**
- [ ] Confirm the refusal message references the blocklist/policy rather than a connectivity error
- [ ] If a **legitimate** table is refused: adjust `MCP_BLOCKLIST_PROFILE` or add the table to `MCP_ALLOW_TABLE` (audited bypass), then reconnect the MCP server — blocklist env changes are not hot-reloaded
- [ ] Some tables additionally require an `acknowledge_risk` flag and explicit user authorization per the data-extraction policy — a refusal asking for acknowledgement is working as designed

## 6. Quick Status Snapshot

Ahead of any risky operation ("which system am I connected to?"), render a compact panel (~10–14 lines). Rows you cannot resolve (e.g. MCP disconnected) go silent rather than failing the panel:

- **Active profile**: `<alias> [<tier>]` (locked marker if tier ≠ DEV) — from `active-profile.txt` + profile `sap.env` → `SAP_TIER`; `(legacy)` if running on a legacy single-profile `sap.env`
- **System**: `<SID>` · client `<MANDT>` · user `<BNAME>` · lang — from `GetSession`
- **Connection**: `SAP_URL` · auth `SAP_AUTH_TYPE` · type `SAP_SYSTEM_TYPE` · version `SAP_VERSION` · ABAP `ABAP_RELEASE`
- **RFC backend**: `SAP_RFC_BACKEND` (+ backend-specific endpoint, tokens masked)
- **Industry**: `SAP_INDUSTRY` or "(not set)"
- **Inactive objects**: count from `GetInactiveObjects` (0 = healthy)
- **Active transport (pinned)**: `<TRKORR> — <description>` from `config.json` → `activeTransport`, else "-"
- **Blocklist**: profile + extend/allow entry counts
- **sap.env path**: absolute path in effect

## 7. SAPKIT Checker — Local Offline Analysis (Bundled)

The **SAPKIT checker** ships inside the plugin as a single CommonJS file,
`checker/sapkit-checker.bundle.cjs`. There is nothing to download and nothing
to install — it is present exactly when the plugin is, and it runs with the
same `node` that runs the harness. It **never connects to SAP and has no MCP
mode**, so it stays entirely on the local machine, and nothing else in this
document depends on it.

- **Run it**: `node "PLUGIN_ROOT/checker/sapkit-checker.bundle.cjs" --help`
- **Provenance / re-bundling**: [checker/UPDATE-RUNBOOK.md](../../checker/UPDATE-RUNBOOK.md)
  (source of record is `sapkit-cli/` in the repo; the integrity gate is
  `node interactive/scripts/verify-checker.mjs`).

Four surfaces — do not confuse the two that report code quality:

- **`lint <file>`** — 7 style rules (line length, empty statement, obsolete
  statements, one-statement-per-line, compare operators, colon spacing, local
  naming). Style filter, not defect detection.
- **`analyze <file> --format json`** — 13 rules including security
  (hardcoded_credentials), performance (commit_in_loop, select_star), and
  robustness (catch_cx_root, dynamic_call_no_try). This is the surface worth
  running on abapGit-dropped local sources, and the one the Claude hook uses.
- **`parse <file>`** — lexer-grade statement split and classification.
  **Not a syntax check**: non-ABAP garbage is still split into statements and
  still exits 0.
- **`check <dir>`** — project INCLUDE resolution across a directory tree;
  unresolved `Z*` / `Y*` / `$*` includes are defects.

The two quality surfaces disagree by design. Measured 2026-08-15 on a probe
carrying `SELECT *`, `COMMIT WORK` inside a loop, and `CATCH cx_root`: `lint`
reports **no findings** (exit 0) while `analyze` flags **3 (1 high)**. Reading
a clean `lint` as "this code is fine" is the mistake this paragraph exists to
prevent.

- **Exit contract**: `0` clean · `1` defects found · `2` usage or input error.
  Only `lint` (Error severity) and `check` (unresolved Z/Y/$ includes) return
  1; `parse` and `analyze` return 0 whenever they could run at all.
- **Claude adapter**: the `offline-code-analysis.mjs` PostToolUse hook runs the
  13-rule `analyze` surface automatically after `.abap` file writes and MCP
  `source_code` uploads (warn-only; silent no-op if the bundle cannot run).
  Other harnesses: invoke it manually.
- **Coverage honesty**: no surface here verifies syntax. Syntax and activation
  authority is always the server-side `CheckSyntax` + `ActivateObjects` chain,
  and completion still needs [verify-applied.md](verify-applied.md).

**Leftover from the download era**: releases before 0.7.0 installed a separate
`vsp` binary under `~/.sapkit/bin/vsp` (`vsp.exe` on Windows) to do this job.
Nothing reads it any more. If it is still on the machine it is inert — delete
it whenever convenient; the plugin behaves identically either way.

## 8. Tool Response Pitfalls

Responses that look like a failure, a block, or a truncation but are none of those — plus a few that look like success and are not, and one absence that reads as a limit. Each one below was actually mis-read in project work (measured 2026-07-28 → 2026-09-09 across two S/4 systems), and the wrong reading was the expensive part — not the tool.

**Several of these were repaired in the engine on 2026-09-09** (D-147, shipped as server engine 1.4.0 / plugin 0.10.3). Those entries state the repaired behavior first and keep the original observation under *older bundles*, because an installation that has not been updated still behaves the old way — `server/VERSION` or `GetSystemInfo` says which side of the line an installation is on. **Every one of those repairs is offline-verified only; none has been confirmed against a live SAP system**, so treat the new behavior as expected rather than established, and confirm it on first live use. Where the two readings disagree, the old prescription is still the safe one.

### `GetSqlQuery` — `truncated: true` on row-collapsing queries

A query whose result collapses rows (`SUM` / `COUNT` / `AVG` without `GROUP BY`, and equally `DISTINCT`) reports `truncated: true` even when the result is complete. The server's total is the number of **base rows matched by `WHERE`**, not the number of result rows, and the tool derives `truncated` as `server_total_rows > returned_row_count` — so any population larger than one row trips it permanently. Raising `row_number` does not change it.

```
SELECT SUM( vbrp~netwr ) …  →  returned_row_count: 1 · total_rows: 6 · truncated: true   ← result IS complete
SELECT COUNT(*)         …  →  N: "6"                                                     ← 6 was the population
```

Judge completeness by `returned_row_count` against what the query can produce (an aggregate is one row by construction), or by whether `row_number` exceeds the base count — never by the `truncated` flag alone. Reading it as "the total was cut off" turns a correct figure into a false discrepancy; `total_rows` is still useful here, just as the population size.

### `GetSqlQuery` — HTTP 400 on a wide `OR` chain

Roughly 6–7 `OR` terms is the practical ceiling; beyond that the call fails with HTTP 400 and no hint that length was the cause. Split into prefix `LIKE` scans or several narrower calls. HTTP 400 from this tool is generic — a non-existent table, a non-existent field, and an unsupported aggregate all surface identically, so never read a single 400 as "the object does not exist".

### `GetSqlQuery` — a wide SELECT list silently drops the WHERE clause

Past a certain column count (observed boundary between 18 and 28 columns) the WHERE clause is ignored entirely and the table's first N rows come back — as a normal `success` response with intact column metadata. Field-verified 2026-08-04: a 28-column SELECT returned the same 10 unrelated rows whether the predicate was `belnr IN (three values)` or a single `belnr =`; 18- and 12-column versions of the same query filtered correctly. This is not a failure but a **plausible wrong answer** — the worst case in this section, because the result can flow into P2 judgments and write-gate approvals looking legitimate. Three tells, all inside the response: ⓐ returned rows do not satisfy your own predicate — the only reliable signal, so check it every time; ⓑ `truncated: true` with exactly `row_number` rows returned; ⓒ `execution_time` collapsed to sub-second where comparable queries take tens of seconds. Practical guard: keep the SELECT list at ~15 columns or fewer and split wider needs into key-joined queries. By comparison, an HTTP 400/500 on a complex query is the *safe* failure — it never hands you wrong data.

### `GrepObjects` — FUGR coverage, and what a 0 still does not prove

Since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) a FUGR search **expands the group** into its function modules and includes and scans each member's source, reporting every hit under the member's own name (`object_type: FUGR/FF` or `FUGR/I`, plus `function_group`). Where a group cannot be expanded, has no members, or exceeds the per-call cap of **200 scanned objects after expansion**, the group is listed under `skipped` with the reason instead of contributing a silent 0 — so read `skipped` before reading `total_matches: 0`. This is offline-verified only, and the shape of the group's node structure is an informed guess; confirm on first live use. Passing `FUGR/I` with an *include* name is not the way in — that name is expanded as a group, finds nothing, and lands in `skipped`; read an include as `INCL`.

On older bundles the FUGR branch read the group's metadata instead of any source, so patterns that demonstrably existed in the group's function modules returned 0 matches with an empty `skipped` (measured 2026-07-28 · 07-30 · 07-31). The workaround there — read each module with `GetFunctionModule` — still works on any bundle, and it is still the only way through `GrepPackages`: **the repair did not touch that tool**, so a FUGR reached through a package sweep behaves the old way on every bundle.

Two limits are unchanged by the repair. `GrepObjects` reads the **active** version, so 0 matches on an object with a pending inactive version means only that the active source does not carry the text — check `GetInactiveObjects` before concluding anything. And a CLAS search covers `source/main` only, with no `skipped` entry for the parts it does not read; the implementations include is read with `GetLocalTypes` (see the CCIMP entry below). Never conclude "not present" from a grep alone.

### `Update*` on a `$`-prefixed local package — try `transport_request: "local"` first

Local-package detection recognises the literal `$TMP` only. An object in any other local package (`$ZJNCFLOW`, …) is refused with *"The object may be assigned to a transport request. Pass transport_request explicitly."* despite being local. Escalating straight to `CreateTransport` is usually unnecessary:

1. Retry with the literal string `transport_request: "local"` — `CreateFunctionModule` returns exactly that value in its own response, so this is the value the server already handed you.
2. Only if that is also refused (observed with objects that arrived via abapGit import and may carry transport history) issue a workbench transport with `CreateTransport` and pass its number.

### `CreateTransport` — non-ASCII descriptions came back corrupted

On older bundles a description containing non-ASCII text (e.g. Korean) was stored with those characters replaced by `#` while ASCII segments survived intact (field-verified 2026-07-28). The transport itself was created and fully usable — only the display text was damaged, and it could not be repaired through the tool.

The D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) declares the request body as `encoding="utf-8"` and sends `Content-Type: text/plain; charset=utf-8`; the bytes were always UTF-8, so what changed is only what they are declared to be, which matches the observed damage exactly (non-ASCII folded, ASCII untouched). **This is offline-verified only — no live transport has been created through it.** So: on the first transport whose description carries non-ASCII text, read the description back and check it, and fall back to writing descriptions in English if it still comes back as `#`. Two changes went in together, so a live failure does not yet say which one mattered.

### Class implementations include — the reader is `GetLocalTypes`, not the obvious names

The working code of a class pool — RAP behavior-implementation (BIL) handlers, `lcl_*` locals — lives in the **implementations include** (CCIMP; the Eclipse "Local Types" tab), and none of the intuitively-named readers show it: `ReadBehaviorImplementation` / `GetBehaviorImplementation` / `ReadClass` return only the 4-line global shell, `GetIncludesList(CLAS/OC)` finds nothing, and `GrepObjects` on a class searches `source/main` only. On older bundles `GetInclude("…CCIMP")` answered HTTP 500 with nothing to point at an alternative, so "there is no reader" was the natural — and wrong — conclusion (field-reported 2026-08-03: a BIL was reconstructed by hand from old copies because of it). The reader exists: **`GetLocalTypes`** reads the implementations include (active or inactive version), alongside `GetLocalDefinitions` (CCDEF), `GetLocalMacros` (CCMAC), and `GetLocalTestClass` (CCAU). Write side: `UpdateLocalTypes` targets the same include; for a BIL prefer `UpdateBehaviorImplementation`, which rewrites shell and implementations together.

Since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3), `GetInclude` recognises a `=`-padded class-include name (`…CCIMP`, `CCDEF`, `CCMAC`, `CCAU`, …) and **refuses it before any request is sent**, naming the tool that does read it. A name merely ending in `CCIMP` without the `=` padding is an ordinary standalone include and is not refused. Offline-verified only — confirm on first live use. Second cause worth ruling out first: all four `GetLocal*` readers sit on the **`development` tool surface**, so on a `readonly` surface they are simply not in the tool list, which reads as "no such tool" rather than as a surface setting (see *Tool surface* in § 4).

### `UpdateSourceByPatch` — write-side traps (version read · line endings · anchor uniqueness · object types)

Four traps, each of which used to return success or a refusal while doing less than the response implied. Three of them (ⓐ ⓑ ⓓ) were addressed by the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3), **offline-verified only — confirm each on first live use**; ⓒ is unchanged. The older-bundle behavior is kept throughout, because an installation that has not been updated still has it.

ⓐ **Which version the patch is applied onto.** Since the repair the tool reads the **inactive** version first and falls back to the active one, and the response's `source_version_read` (`"inactive"` / `"active"`) says which it patched — so consecutive `activate: false` patches build on each other instead of overwriting. *On older bundles* every call fetched the **active** source, so with activation deferred only the last patch survived while responses stayed `success` + `occurrences_replaced: 1` with a plausible diff (field-verified on two systems, CLAS 3-in-a-row → 1 survivor); the tell was that patch N's `diff_preview` context did not show patch N−1's change. The repair brings a **new risk in the other direction**: an inactive version may hold edits you did not make — someone else's abandoned draft — and the tool cannot tell whose it is, so `activate: true` activates that whole version, draft included. Read `source_version_read`, and where it says `inactive` on an object you did not stage yourself, read the source back before activating. Keeping the old habit — `activate: true` on every patch plus a `GrepObjects` read-back of the changed token (6-in-a-row verified 2026-08-05) — is still the safe pattern on any bundle; only its reason has changed.

ⓑ **Line endings.** Since the repair, source and both strings are normalized to LF for matching and the source's own line ending is restored on write, so a **multi-line `old_string` matches** on a CRLF source, the file does not end up with mixed endings, and `diff_preview` carries no stray CR. *On older bundles* server source was CRLF while an LF-joined pattern was not, so any multi-line `old_string` failed with `old_string not found` even though the text was visibly present — single-line anchors were the only option.

ⓒ **CLAS patches reach the main source only** — unchanged. Test includes (CCAU) and local types are out of range; use `UpdateLocalTestClass` / `UpdateLocalTypes` (full-text) for those, and see the CCIMP entry above for reading them.

ⓓ **Object types.** Since the repair, `object_type: "FUNC"` and `"INTF"` are wired — the patch is applied and handed to `UpdateFunctionModule` / `UpdateInterface` — and a function-group include (`L<group>TOP`, `L<group>F01`, …) is locked through its **function-group address** rather than the standalone-include address, which is what used to fail. *On older bundles* `"FUNC"` was refused outright with an explicit message that the delegated write was not implemented and that nothing had been read from or written to SAP (field-verified 2026-08-31) — a clean refusal, not a false success — and the way through was `GetFunctionModule` → change locally → `UpdateFunctionModule` (full source), which is still perfectly good. A function group in a `/NS/` namespace is outside the include-name rule and still takes the standalone address.

**Choosing the anchor is where most of the remaining failures live.** `old_string` matches as a plain substring by default — not a whole line, not a word — so `FORM do_show.` also matches inside `PERFORM do_show.` and is refused as two locations (2026-08-04); a two-space-indented statement matches inside its four-space-indented twin (2026-08-12); and in a program that keeps commented-out copies of live lines (`*****      LOOP AT …`), every live line in that region is a substring of its own comment copy, so no single-line anchor is unique there at all (2026-07-31). Since the repair two things make this cheaper: the optional **`match_whole_line: true`** requires every line of `old_string` to match a whole source line (leading/trailing whitespace ignored), which settles the `FORM` / `PERFORM` and indentation cases outright, and a non-unique `old_string` is now refused with **the line number and text of each match** (up to 8, then "… and N more") instead of a bare count. Default stays `false`, i.e. the old substring behavior. *On older bundles* neither existed, and the standing prescription was to `GrepObjects` the intended anchor first and count the matches — still a sound habit, and the only option where the response gives you nothing but `matches N locations`. Where a bare statement is ambiguous and `match_whole_line` is not available, anchor on something unique beside it — a neighbouring comment line — or start the anchor with a newline (`"\nFORM do_show."`). Common lines (`ELSE.`, `ENDIF.`) are never anchors. Related: when `GetInclude` spills to a file because the source exceeds the token limit, the line numbers in that file are the server's own line numbers and can be used directly for this work (field-verified 2026-07-31).

**Deleting.** Since the repair a multi-line `old_string` can be expressed, so **lines can be removed as a block** — with `match_whole_line` on, an `old_string` of whole lines and an empty `new_string` takes those lines out cleanly. *On older bundles* only insertion worked (because `new_string` may be multi-line), and the workaround that carried the load was blanking: where exactly one line had to go, a `new_string` of a single space blanked it and passed (2026-08-12, four sites). One constraint is independent of the repair and still applies: writing `\r\n` **as characters** in `new_string` yields one long line and the write is refused with `The line N exceeds 255 characters` (HTTP 400) — send real newlines. Escalate to a full-source `UpdateInclude` / `UpdateClass` when the structure changes rather than a few lines.

**Reading the result back reads the *active* version.** `GrepObjects` serves active source, so a grep taken before activation shows the old text and looks exactly like a failed write. The trap closes when includes are patched without `activate` and the main program is then patched with `activate: true`: the tree cannot activate while an include is inactive, so the main program stays inactive too and a grep of it is stale — the change was declared a false success on that basis, wrongly (field-verified 2026-08-19). Fix the order: write the includes, run `ActivateObjects` over the main program **and every sibling**, confirm `GetInactiveObjects` is empty, then grep. Two independent tells in the meantime: line numbers in `check_warnings` shift by exactly the number of lines inserted (736 → 745 for a 9-line insert), and to test the *write* alone rather than the activation, re-issue the string you just inserted as `old_string` — `old_string not found` means it never landed.

### `ActivateObjects` — the run-level `activated` / `checked` flags are the signal; per-object `status: "activated"` is not

A run whose response carries `activated: false` **and** `checked: false` activated nothing, whatever the per-object entries say. The two run-level flags are the signal; the per-object status is not. A genuine activation reports `activated: true` **and** `checked: true` (field-verified 2026-09-04, against successful runs in the same session). `checked: false` says the syntax-check stage never ran, so "no errors" there means nothing was examined rather than nothing was wrong.

Since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) the tool no longer folds that shape into a success: it answers `success: false` with `run_executed: false`, gives every object `status: "not_executed"` (neither failed nor activated — nothing happened), counts those in `failed_count`, and carries the prescription below in `errors` / `message`. Offline-verified only — confirm on first live use. *On older bundles* the same run answered `success: true`, `failed_count: 0`, and `status: "activated"` with an empty `errors[]` per object, so reading the run-level flags yourself was the only defence. Read them either way: the repair catches the shape that was measured, not a guarantee that no other false success exists.

`GetInactiveObjects` does not rescue this. Through the same incident it never listed the three affected includes although their inactive versions were still present — an inactive version can be orphaned, written into the repository but absent from the ADT inactive worklist. **An empty `GetInactiveObjects` is a necessary condition for activation, never a sufficient one.** The oracle that settled it was the database: `SELECT PROGNAME, R3STATE, UDAT, UTIME FROM REPOSRC WHERE PROGNAME = '<object>'` — a surviving `R3STATE = 'I'` row means not active, and the `'A'` row's `UDAT`/`UTIME` must fall after your write for the change to be the one being served. That read goes through `GetSqlQuery`, so it is a row-data call and carries the per-call approval step of [data-extraction-policy](../policies/data-protection/data-extraction-policy.md) like any other.

When a run lands in that state, **do not retry the activation** — six variations behaved identically (single object; with its sibling includes; with the main `PROG/P` object; `preaudit: false`; after `GetSession(force_new: true)`; and `UpdateSourceByPatch(activate: true)`, which answered `activated: true` and still left the `'I'` row). What cleared it was **rewriting the whole source**: one `UpdateInclude` (naming `main_program`, `activate: true`) with the complete text, after which ordinary patch-plus-activate worked normally on the remaining objects (field-verified 2026-09-04). Try that before handing the object to a human in SE38/SE80: reaching for the human first was the original prescription in the field, and it turned out to be one step early. Honest limit: a user also touched activation in the GUI and a pre-existing syntax error was fixed inside the same window, so the full-source rewrite is the first thing to try, not a proven cause.

Two rules about what goes **into** the activation list, and one about reading a hang. Put the **main program in** when includes will not activate: an include-only run hides program-level syntax errors, and adding the `PROG/P` object is what surfaced a real one (`failed_count: 1`, naming the program). Keep **objects you did not change out** of routine runs: an unmodified object holds no transport lock, and including it fails the whole run with `Resource <name> REPS is not locked in a transport request` (field-verified 2026-07-31 — the batch went through once the untouched main program was dropped). The two are not in conflict: pulling an unchanged main program into a run is a **deliberate diagnostic**, and that lock error is its price — read it as "this object is not in my transport", not as a real blocker. And where activation *hangs* instead of lying — one include finishing in seconds while its siblings time out — activate one small unrelated object to tell a lock apart from a tool or system problem.

### `CheckSyntax` / `UpdateProgram` — `INCLUDE report "X" not found` is a false negative; judge from the DB, not from retry count

Immediately after includes are written and activated, a syntax check against their main program can report `INCLUDE report "<one of them>" not found` — as a `CheckSyntax` result with `success: false`, or as an `UpdateProgram` preCheck that refuses the write. The include exists, is registered, and is active; the main program's ADT check context is simply stale. The named include is **the first stale one in source order**, so the target moves with whatever was touched (field-verified 2026-08-04: editing only the `S` include named `…S`, editing only `I` named `…I`).

**The oracle is the database, not the response.** Three reads settle it, and all three were correct in both incidents below while the tool was still complaining: `TRDIR-SUBC = 'I'` for every include, a `D010INC` row for each include under the main program as `MASTER`, and the `ActivateObjects` run reporting `checked` + `generated` with `failed_count: 0`. When those agree, the program is already fine — do not reach for the workarounds this symptom invites (moving code into an include, hand-editing in SE38, re-delivering through abapGit); they cost real time and fix nothing.

**Do not treat "retry once" as the cure.** An earlier note in project work claimed the failing call warms the cache so the next attempt succeeds. That held in one shape and not in another: an existing program with a single edited include cleared on the first retry (2026-08-04), while a newly created program — six includes via `CreateInclude` with `skip_program_tree_check: true`, then all seven objects activated in one `ActivateObjects` run — failed **twice in a row** and only passed on a third call issued after unrelated work (2026-09-04). Whether the difference is new-vs-existing, the number of objects in the activation run, or `skip_program_tree_check` was **not** established; treat the retry as unbounded and let the DB reads, not the attempt counter, decide when to move on. One further hypothesis from the same project, also uncontrolled: firing several main-program writes in one message (concurrent requests on the same ADT session) appeared to keep the symptom alive across retries, and issuing them sequentially did not.

**A second false negative from the same tool, different mechanism.** `CheckSyntax` on an include **alone** — no `source_code`, no main program in play — reports zero errors and no verdict, because an include has no main-program context of its own to be compiled in. *On older bundles* that came back as `success: false` with `errors: []` and `warnings: []`, twice in a row, while the very next `ActivateObjects` compiled the same source with zero errors (field-verified 2026-07-31) — a "cannot judge" expressed as a failure, and the empty error list made it indistinguishable from a real one. Since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) every response carries `verdict: "clean" | "errors" | "indeterminate"` plus `check_status`, and this case answers **`success: null` with `verdict: "indeterminate"`** and a `reason`. The fix, not just the label: pass **`main_program`** (the program that `INCLUDE`s it) and the include is compiled inside that program's tree — main plus every include, inactive version — which produces a real verdict. Offline-verified only; the exact status SAP returns for a bare include check has not been re-measured live. Either way the reading rule is the same: only `success: true` with `errors: []` (`verdict: "clean"`) is a pass, and neither `success: null` nor an older bundle's `success: false` with `errors: []` is a result. Where a check and an activation disagree, the activation is the stronger evidence — but read the fixed-point-arithmetic entry below before concluding that a write is blocked. Blocking criteria: [verification-policy](../policies/verification-policy.md) step 1.

### `UpdateProgram` / `UpdateSourceByPatch(PROG)` — a false "fixed point arithmetic" precheck that blocks the write

A PROG write can be refused by its own preCheck with dozens of `This ABAP SQL statement uses additions that can only be used when the fixed point arithmetic flag is activated`, trailed by a cascade of `Field "<X>" is unknown` from inline declarations. At the same moment, `CheckSyntax` on that program **without** `source_code` reports zero errors and `ActivateObjects` activates it cleanly. `TRDIR-FIXPT` stays `'X'` throughout, so nothing cleared a flag: the two checks look at different things — the write path compiles the *proposed* source inline, and that path appears not to carry the program's attributes.

It is not a property of the program and it is not permanent. On one program, patches passed in the morning, were refused six times in a row from mid-session (anchors and payloads varied; identical every time), and passed again the same evening with nothing done in between (field-verified 2026-08-19; first seen 2026-08-06 on a different program, where the earlier reading — that only single-file programs are affected — did not hold up). What flips the state is not established. So the judgment criterion is **whether the write is actually refused**, not what any syntax check says.

Since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) the write does not stop there. When the inline pre-check fails **and any of its messages names fixed point arithmetic**, the tool re-checks the *stored* version once; if that comes back with no real errors it stops believing the pre-check and **writes anyway**, marking the response `precheck_overridden: true` with the original text under `precheck_messages` and a `precheck_note`, and `check_stored_version` in `steps_completed`. `UpdateSourceByPatch(PROG)` delegates to the same path and reports the same three keys. A pre-check failure that does **not** mention fixed point arithmetic still blocks the write exactly as before. Offline-verified only — confirm on first live use.

**Read that override for what it is.** On that branch the proposed source went up **without being checked first** — the stored-version check looked at the stored version, not at what you sent. The real verdict then comes from the post-write check and the activation, so where the post-write check returns a type `E` error the tool fails the call and says so plainly: the source is saved as the **inactive** version, it was **not activated**, the active version is untouched, and a human has to look. That is a genuine failure, not a formality; do not re-issue the write hoping for a different answer.

The include write path runs a different check, which is why moving the touch point into an include (`UpdateInclude` / `UpdateSourceByPatch(INCL)`) was the practical way through on older bundles — on the day a main program was refused six times, its includes were never refused once. It remains a reasonable move where the code belongs in an include anyway; it is no longer the only way past this symptom. Where the change genuinely belongs in the main program and stays blocked, hand that piece to the user in SE38 instead of looping. Do not generalize a refusal into "this program cannot be edited through MCP": try once and read the message, because the same object later came back with an ordinary editor lock (`… is being edited by user …`) rather than the false precheck.

### `UpdateLocalTestClass` / `DeleteLocalTestClass` — HTTP 500 "no inactive version" means the class has no test-class include

Both tools edit an **existing** `…CCAU` include; neither creates one. Where the class has none, SAP answers HTTP 500 with a message about there being no inactive version of `<CLASS>…CCAU` — *on older bundles* that text came back as-is and sent you hunting a version problem that does not exist. Since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) both tools recognise that message (English, German, Korean) and answer with the real cause and the fix — this class has no test-class include, create it once from the ADT **Test Classes** tab — with SAP's original text kept behind it. Offline-verified only; the tools still do not create the include, because the ADT request that adds one to an existing class has not been established. Staging an inactive version of the class first (a patch with `activate: false`) changes nothing — the message is about the include, not the class. Whether a class has the include at all is settled when the class is **created**: `CreateClass` sends a `testclasses` include in its payload, so classes made that way have one and classes that arrived by another route may not (field-verified 2026-08-25).

Confirm before prescribing. `SELECT PROGNAME FROM REPOSRC WHERE PROGNAME LIKE '<class>%'` answers it — the presence of a `…CCAU` row is the whole question (a row-data call, so the usual approval step applies). `GrepObjects(INCL, '<class>…CCAU')` is **not** a way to look inside it: that returns HTTP 500, because a class include does not sit under the `programs/includes` URI. Read the text with `GetLocalTestClass`, or take the cheap structural check — `GetObjectStructure(CLAS/OC, <class>)` and count the local-class nodes. The fix itself belongs to the user: saving one line in the ADT class editor's **Test Classes** tab and activating creates the include, after which the MCP write path works normally (measured the same day). SE24 has no such tab — there the path is *Goto → Class-local types → Test classes*. Do not manufacture the include with `INSERT REPORT`.

### `transport_request` — a task number comes back as a CTS lock, and omitting it is worse on CLAS

Pass the **task** number an object is registered under and the write fails with HTTP 500, *"Object … is already locked in request `<REQUEST>`"* — naming the request that task belongs to. Nothing is locked: the registration is on the task, the lock is held at request level, and the task number cannot satisfy it. Pass the request number and the identical call goes through (field-verified 2026-08-10). `E070-STRKORR` is what separates the two — it carries a task's parent request.

Since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) the write tools append a hint to that wording — *`transport_request` is missing or is a task number; pass the parent request (`E070.STRKORR`); this is often not somebody else's lock* — leaving SAP's own text in front of it untouched. Offline-verified only, and the coverage has a hole worth knowing: the hint rides on the shared failure describer, so tools that build their own text per status code (`UpdateLocalTestClass`, `DeleteLocalTestClass`, `UpdateFunctionModule` on HTTP 423) will not show it. Absence of the hint is therefore not evidence that a lock is real.

Omitting `transport_request` altogether fails differently by object type, and that asymmetry is what makes it expensive. A PROG write refuses explicitly with `Parameter corrNr could not be found` (HTTP 400), a safe failure that names its own cause. A CLAS write refuses with **the same CTS lock wording** as above, so it reads as a stale lock and invites asking the user to release something that was never locked (field-verified 2026-08-05: three retries, a user-side check finding no lock, then immediate success once the request number was supplied). **Check the parameter before asking anyone to unlock anything.** Resolution order and the rest of this call path: [transport-client-rule](../policies/transport-client-rule.md).

### A tool that is absent is not a capability that is absent — object write plus run

This tool set ships no row-writing tool by design; the two row-data tools are reads. It does ship object writes (`CreateProgram` / `UpdateProgram`) and execution (`RuntimeRunProgramWithProfiling`), and carrying the statement in a one-off program and running it is the normal way to write data through this tool set (established as the working method in real project work, 2026-08-19), not a workaround to be avoided. The same shape answers "there is no tool for this": `GetTransaction` can answer `Not implemented` on a system, and the standard function module SE93 itself uses — `RPY_TRANSACTION_INSERT` — is still callable from a one-off program run the same way; confirm the outcome in `TSTC`, `TSTCT`, `TADIR` and `E071` (field-verified 2026-08-31).

Three conditions ride with that path, each measured rather than theoretical. ⓐ Give the program a name **that has never been loaded in this system before** — a resident session can execute a previously loaded version of a name you have just rewritten, and then what runs is not what you wrote. ⓑ **Say what you are about to write, to the user, before running it.** The execution tools carry no approval gate of their own, unlike the row-data reads, so on this path the only gate is the one you volunteer. ⓒ Read the result back afterwards and remove the program.

State the asymmetry plainly rather than reasoning from it: reading rows is gated three ways (tool exposition, adapter deny-lists, per-call approval) while writing rows through an executed program has no mechanical gate at all. Whether that is the intended threat model — object-write authority implying data-write authority — or a gap is **an open question for the product owner**, and nothing here settles it. It is not licence to skip ⓑ. The write-side counterpart of the extraction rules: [data-extraction-policy](../policies/data-protection/data-extraction-policy.md).

### `RunUnitTest` — empty `runResult` on older engine versions (resolved; verify before blaming the tool)

Engines before the classic `/testruns` bridge (server 4.13.11, shipped with plugin v0.5.1) could return `status: completed` with a completely empty `<aunit:runResult/>` — indistinguishable from "no tests exist". Re-measured 2026-08-03 on v0.5.1 against the same system: full results, matching a user-side ADT run exactly (17/17). If the empty-result symptom appears, check the engine version (`server/VERSION`, or `GetSystemInfo`) before concluding the tool is broken. Residual quirks of the classic endpoint: `format: "junit"` is refused (omit the format), and a run covers **all** local test classes of the container class — a narrower `test_class` selection can return more than requested; that is normal, not a mis-scope.

Where a run genuinely executes zero tests on a current engine, the fallback used in the field is to carry the check itself in an executable program, run it with `RuntimeRunProgramWithProfiling`, and record its results in a table read back afterwards — `WRITE` output does not come back through the runner. That path, and what it is and is not evidence of, is written up in [verification-policy](../policies/verification-policy.md) step 3.
