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

- something isn't working and you're not sure where the problem is
- after initial configuration, to confirm everything is set up correctly
- after a SAP system change (password reset, IP change, client migration)
- MCP tools return errors or are not visible in your harness
- you need to confirm which system you are connected to before a risky operation

Run the checks in order and report **PASS / FAIL / WARN / SKIP** per layer — later layers depend on earlier ones.

> **Before walking the checklist**: if `.sapkit/RULES.md` / `LESSONS.md` / `knowledge/system.md` exist, grep them for the failing symptom first — this project's recorded failure modes (a profile-missing rule, a tool-response trap) resolve many diagnostics in one step, and the verified cause is already written down. Absent → proceed normally. Contract: [knowledge-sourcing](../policies/knowledge-sourcing.md).

## 1. MCP Server Connection — Diagnostic Checklist

### Layer 1 — MCP server

- [ ] The SAP MCP server is registered and running in your harness's MCP server list
- [ ] The server bundle exists at `server/server.bundle.cjs` and is **> 1 MB** — a missing/truncated bundle makes the server *appear* registered while every tool call fails
- [ ] `server/VERSION` is readable — report its first line (engine version + source commit). Missing VERSION with a healthy bundle → WARN only
- [ ] At least one MCP tool (`GetSession`) responds without error

### Layer 2 — SAP system connection

- [ ] `GetSession` returns valid system data (system ID, client, user)
- [ ] `GetInactiveObjects` responds (tests developer authorization `S_DEVELOP`)
- [ ] `ListTransports` responds (tests transport authorization `S_TRANSPRT`)
- [ ] `SearchObject` with a simple query responds (tests object repository access)
- [ ] `GetTableContents` on `T000` responds (tests table access)

### Layer 3 — configuration consistency

- [ ] SAP host URL is reachable (HTTPS / ICM port, typically 44300)
- [ ] Configured client matches the `GetSession` response
- [ ] Configured username matches the `GetSession` response

### Layer 4 — required server-side ABAP objects (gated)

> **Gate — strict dependency**: run this layer ONLY when Layer 1 (MCP server) AND Layer 2 (SAP connection) both end in PASS. If either is FAIL, mark Layer 4 as **[SKIP — SAP connection not ready]** and do **not** issue any `SearchObject` / `GetInactiveObjects` call. Every check here depends on a live MCP + SAP session; an MCP or connectivity failure makes every object appear "missing" and would mislead you toward re-installing objects that actually exist. Fix connectivity first, then re-run.

*MCP ADT utilities — required for Screen / GUI Status / Text Element operations:*

- [ ] `SearchObject(ZMCP_ADT_UTILS, FUGR)` — function group exists
- [ ] `SearchObject(ZMCP_ADT_DISPATCH, FUNC)` — dispatcher function module exists and is RFC-enabled
- [ ] `SearchObject(ZMCP_ADT_TEXTPOOL, FUNC)` — text pool function module exists and is RFC-enabled

*ALV OOP reuse handlers — consumed by generated ALV programs:*

- [ ] `SearchObject(ZIF_S4SAP_CM, INTF)` — interface exists
- [ ] `SearchObject(ZCX_S4SAP_EXCP, CLAS)` — exception class exists
- [ ] `SearchObject(ZCL_S4SAP_CM_OALV, CLAS)` — ALV Grid wrapper exists
- [ ] `SearchObject(ZCL_S4SAP_CM_OTREE, CLAS)` — ALV Tree wrapper exists
- [ ] `SearchObject(ZCL_S4SAP_CM_ALV_EVENT, CLAS)` — Grid event handler exists
- [ ] `SearchObject(ZCL_S4SAP_CM_TREE_EVENT, CLAS)` — Tree event handler exists
- [ ] `SearchObject(ZCL_S4SAP_CM_ALV, CLAS)` — main container manager exists
- [ ] `GetInactiveObjects` returns 0 entries for any of the above — every object must be **active**; created-but-inactive counts as FAIL

Report counts at the layer level, e.g. `utilities: 3/3 installed`, `ALV handlers: 7/7 installed, 7/7 active`. If an object exists but is inactive, flag a WARN with the specific object names.

Remediation: ABAP sources for all of these ship in this repo under `server/sap-assets/` (`zmcp_adt_dispatch.abap`, `zmcp_adt_textpool.abap`, `alv-oop-handlers/`). Install on a **DEV-tier** system only; QA/PRD systems receive them via CTS transport.

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
| **Refusal when reading a legitimate table** | Blocklist guard — see §5 |
| **Authorization errors on specific operations** | Required authorization objects: `S_DEVELOP` (development), `S_TRANSPRT` (transports); RFC-dispatched ops additionally need `S_RFC` |

### Report format

```
SAP Diagnostic Report
=====================
MCP Server          [PASS]  server responding, bundle present
SAP Connection      [PASS]  SID=S4H · Client=100 · User=DEV01
Configuration       [PASS]
Required Objects    [WARN]  utilities: 3/3 · ALV handlers: 7/7 (ZCL_S4SAP_CM_ALV inactive)
RFC Backend         [PASS]  odata — metadata + CSRF + dispatch OK

Issues Found: 0 errors, 1 warning
Fix: Activate ZCL_S4SAP_CM_ALV (source in server/sap-assets/alv-oop-handlers/)
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

Determine which system type you are working against:

- **S/4HANA** (`S4`) — Business Partner (BP), MATDOC, ACDOCA, Fiori, CDS-based
- **ECC 6.0** (`ECC`) — Vendor/Customer separate (XK01/XD01/FK01/FD01), MKPF/MSEG, BKPF/BSEG

### ABAP release

Determine the **ABAP release** (e.g. `750`, `751`, `756`, `757`, `758`):

- Check via `GetSession` once connected, or in SAPGUI: TCode `SE38` → System → Status
- Or ask the user directly

This is **critical** — it determines:

- Which SPRO config tables, BAPIs, TCodes, and workflows to reference from the module knowledge (`../knowledge/modules/{MODULE}/`)
- Which tables/views to query (ECC: `MKPF`+`MSEG` vs S4: `MATDOC`; ECC: `KNA1`+`LFA1` vs S4: `BUT000`)
- Which ABAP syntax features generated code may use — see [abap-release-reference](../knowledge/abap/conventions/abap-release-reference.md) and [sap-version-reference](../knowledge/abap/conventions/sap-version-reference.md)

Persist the answers as `SAP_VERSION` (`S4` | `ECC`) and `ABAP_RELEASE` (3-digit numeric) in the profile's `sap.env` and in `.sapkit/config.json`. `SAP_INDUSTRY` (industry key) belongs in the same pair of files and drives which industry knowledge applies.

## 3. RFC Backend Selection

Three MCP operation families (Screen, GUI Status, Text Element) dispatch through RFC-enabled function modules (`ZMCP_ADT_DISPATCH`, `ZMCP_ADT_TEXTPOOL`); everything else uses the ADT HTTPS channel. `SAP_RFC_BACKEND` selects the transport for those RFC-dispatched operations.

> **Agent context (R-005)**: under an agent/wizard context bound by R-005 (never read, handle, or print passwords), skip the `curl` probes below and verify the backend instead with an equivalent MCP tool call over the same RFC path — e.g. for `odata`, a lightweight read like `GetTextElement` on any known program; an error surfaced this way (e.g. an HTTP 500) is the same evidence the curl probe would give. The curl commands remain the human-operator path.

### Selection criteria

| Backend | Transport | Choose when |
|---|---|---|
| `odata` (default) | SAP OData v2 service `ZMCP_ADT_SRV` via HTTPS (SEGW + Gateway registration) | Default choice. Gateway is almost always reachable and routes through standard Gateway authorization (`S_SERVICE`) instead of `S_RFC` |
| `soap` | HTTPS via `/sap/bc/soap/rfc` | The legacy SOAP ICF node is active (hardened installs increasingly disable it). No extra env fields needed |
| `native` | Direct TCP via SAP NW RFC SDK | The (paid-download) SDK + build tools are available on this host |
| `gateway` | Remote RFC Gateway middleware via HTTPS/JSON | A central SDK host exists; no SDK needed on this machine |
| `zrfc` | Custom ICF handler `/sap/bc/rest/zmcp_rfc` via HTTPS | Company blocks `/sap/bc/soap/rfc` AND OData Gateway is hard (typical ECC). Needs neither SDK nor Gateway registration — just one handler class (`ZCL_MCP_RFC_HTTP_HANDLER`, not bundled in this repo) + one SICF node |

The default changed 2026-04-22 from `soap` to `odata`. Existing configurations that pinned `SAP_RFC_BACKEND=soap` keep working unchanged.

Write the choice to the **active profile's** env (`~/.sapkit/profiles/<alias>/sap.env`) as `SAP_RFC_BACKEND=odata|soap|native|gateway|zrfc`. Never write it to `<project>/.sapkit/sap.env` — that file does not exist in multi-profile mode.

### Bootstrap order (first-time vs re-run)

`soap` / `native` / `gateway` can be verified in full immediately — they need no backend objects on SAP.

`odata` / `zrfc` have a **chicken-and-egg**: their probes target server-side objects (`ZCL_ZMCP_ADT_MPC_EXT` / `ZCL_ZMCP_ADT_DPC_EXT` for odata; `ZCL_MCP_RFC_HTTP_HANDLER` + SICF node for zrfc) that are installed *after* the backend is chosen. On a fresh system a 404 from the probe is **expected, not a bug** — record the choice, emit a deferred-verification note, and verify after the backend objects are installed. On a re-run/reconfiguration where the objects were installed previously, probe failures are genuine.

### Per-backend env keys

- **soap** — none beyond the base connection (`SAP_URL` + `SAP_USERNAME` + `SAP_PASSWORD` are reused)
- **native** — `SAP_RFC_USER`, `SAP_RFC_PASSWD` (secret — always mask), `SAP_RFC_CLIENT` (3 digits), `SAP_RFC_LANG` (2-letter uppercase, default `EN`), and either (`SAP_RFC_ASHOST` + `SAP_RFC_SYSNR` [2 digits]) **or** (`SAP_RFC_MSHOST` + `SAP_RFC_SYSID`, optional `SAP_RFC_GROUP` default `PUBLIC`, `SAP_RFC_MSSERV`) — `ASHOST` and `MSHOST` are mutually exclusive. Optional SNC: `SAP_RFC_SNC_QOP` (`1|2|3|8|9`); when set, `SAP_RFC_SNC_MYNAME` and `SAP_RFC_SNC_PARTNERNAME` become required (`SAP_RFC_SNC_LIB` optional)
- **gateway** — `SAP_RFC_GATEWAY_URL` (required, `https://host[:port]`, no trailing slash), `SAP_RFC_GATEWAY_TOKEN` (secret — always mask; warn if missing), `SAP_RFC_GATEWAY_TLS_VERIFY` (`1` default; `0` dev-only). `SAP_USERNAME`/`SAP_PASSWORD`/`SAP_CLIENT`/`SAP_LANGUAGE` are forwarded per-request as `X-SAP-User`/`X-SAP-Password`/`X-SAP-Client`/`X-SAP-Language` headers, so the gateway opens a per-developer RFC session and the SAP audit trail stays accurate — no separate RFC user needed on this host
- **odata** — `SAP_RFC_ODATA_SERVICE_URL` (required, e.g. `https://host:44300/sap/opu/odata/sap/ZMCP_ADT_SRV`, no trailing slash), `SAP_RFC_ODATA_CSRF_TTL_SEC` (default `600`, min 60). Basic auth reuses `SAP_USERNAME`/`SAP_PASSWORD`; `SAP_CLIENT` is appended as `?sap-client=<n>`. The client performs an automatic CSRF handshake (GET `$metadata` with `X-CSRF-Token: Fetch`), caches the token, and refreshes on HTTP 403
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
4. *Live probes*: `RFC_PING` returns without error (connectivity + credentials + handshake); `ZMCP_ADT_DISPATCH` with a harmless action returns a non-fatal `EV_SUBRC` (proves `S_RFC` on the dispatcher); `ZMCP_ADT_TEXTPOOL` `READ` on a known program (`RSPARAM`) returns a non-empty result (proves `S_RFC` on the textpool FM).

If check 1–2 fails → **BLOCKER**. If only check 4 fails while 1–3 pass → **authorization issue** (usually `S_RFC` missing `RFC_NAME = ZMCP_ADT_*`). Best practice: use a dedicated RFC user with `S_RFC` (`RFC_NAME = ZMCP_ADT_DISPATCH, ZMCP_ADT_TEXTPOOL, RFC_PING, SYSTEM`) plus minimal `S_DEVELOP` for TEXTPOOL INSERT — do not reuse the ADT user's credentials in both blocks unless intentional.

### Verification — gateway

1. *Env completeness*: `SAP_RFC_GATEWAY_URL` parses as a valid `https://host[:port]` URL; base SAP credentials present; warn if `SAP_RFC_GATEWAY_TOKEN` missing (unauthenticated gateways are discouraged).
2. *Reachability*: `GET $SAP_RFC_GATEWAY_URL/health` (with `Authorization: Bearer $SAP_RFC_GATEWAY_TOKEN`) returns HTTP 200 within 10s with JSON `status: "ok"` — TLS handshake, routing, and the gateway process validated in one call. Surface `sdk_version` / `pool_size` if reported.
3. *Live probes*: `POST /rfc/dispatch` with `{"action":"PING","params":{}}` and the X-SAP-* headers returns `{subrc: 0}` (gateway → SAP RFC works with forwarded credentials); `POST /rfc/textpool` `READ` for `RSPARAM` returns non-empty `result[]` (full pipeline incl. `S_RFC` on ZMCP_ADT_TEXTPOOL).

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
| metadata HTTP 404 | Install the OData MPC/DPC classes (`zcl_zmcp_adt_mpc.clas.abap` / `zcl_zmcp_adt_dpc.clas.abap` in `server/sap-assets/`), then register the service in `/IWFND/MAINT_SERVICE` |
| metadata HTTP 401 | Basic auth rejected — verify `SAP_USERNAME` / `SAP_PASSWORD` |
| no CSRF token | ICF node for `/sap/opu/odata/` inactive — ask Basis to activate |
| FunctionImport HTTP 500 | Backend `/IWBEP` service registration missing (known gotcha — `/IWFND/MAINT_SERVICE` "Add Service" does not always populate the backend `/IWBEP` tables on all releases). First try `SE38 → ZMCP_ADT_FLUSH_CACHE`, then have Basis run `/IWBEP/REG_SERVICE` |
| `EV_SUBRC` ≠ 0 | User lacks `S_RFC` authorization for `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL` |

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

Fix: set `"toolSurface": "development"` in that `config.json` and **restart the MCP server** — the surface is decided once at launch; `ReloadProfile` does not re-list tools. `development` only takes effect when the active profile's `SAP_TIER=DEV`; on QA/PRD (or an unresolved tier) the launcher stays `readonly` fail-closed, which is correct behavior, not a bug.

Upgrade trap: projects created before v0.5.0 have no `toolSurface` key, so their write tools disappear silently on the first post-upgrade session — they never saw the [setup](setup.md) Step 3 question that normally decides this (field-reported 2026-08-03).

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

> **Which channel wins.** `MCP_ALLOW_TABLE` is read from the **active profile's `sap.env` only** — a value in the process environment is ignored, because it opens the guard. A `MCP_BLOCKLIST_PROFILE` from the environment applies only when it is **stricter** than the profile's, and the two `MCP_BLOCKLIST_EXTEND` lists are **unioned**. In one line: the process environment can tighten this guard, never loosen it (D-096). So if a table is refused and you believe it should not be, the fix is always in `sap.env`.

Value format for EXTEND/ALLOW: uppercase table names, `[A-Z0-9_*]+` where `*` is a glob; strip whitespace around commas.

Category definitions and the full policy live in [data-extraction-policy](../policies/data-protection/data-extraction-policy.md). This server-side guard is the authoritative layer; a harness-level pre-call hook may exist in front of it (adapter concern, not covered here).

### Verifying blocklist behavior

- [ ] Call `GetTableContents` on a known-sensitive table (e.g. `BNKA` — banking, blocked under every profile except `off`) and confirm the call is **refused**
- [ ] Confirm the refusal message references the blocklist/policy rather than a connectivity error
- [ ] If a **legitimate** table is refused: adjust `MCP_BLOCKLIST_PROFILE` or add the table to `MCP_ALLOW_TABLE` (audited bypass), then reconnect the MCP server — blocklist env changes are not hot-reloaded
- [ ] Some tables additionally require an `acknowledge_risk` flag and explicit user authorization per the data-extraction policy — a refusal asking for acknowledgement is working as designed

## 6. Quick Status Snapshot

Before any risky operation ("which system am I connected to?"), render a compact panel (~10–14 lines). Silence rows you cannot resolve (e.g. MCP disconnected) rather than failing:

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

Responses that look like a failure, a block, or a truncation but are none of those — plus a few that look like success and are not. Each one below was actually mis-read in project work (measured 2026-07-28 → 2026-08-05 across two S/4 systems), and the wrong reading was the expensive part — not the tool.

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

### `GrepObjects` — a FUGR search does not reach function-module bodies

Searching a function group returns 0 matches for patterns that demonstrably exist in its function modules; the search does not descend into the FM includes. The tool description ("Individual function modules (FUNC) are not supported; use FUGR with the group name to search the whole group") reads as if the group covers them — it does not. To search FM source, read each module with `GetFunctionModule`. Never conclude "not present" from a FUGR grep alone.

### `Update*` on a `$`-prefixed local package — try `transport_request: "local"` first

Local-package detection recognises the literal `$TMP` only. An object in any other local package (`$ZJNCFLOW`, …) is refused with *"The object may be assigned to a transport request. Pass transport_request explicitly."* despite being local. Escalating straight to `CreateTransport` is usually unnecessary:

1. Retry with the literal string `transport_request: "local"` — `CreateFunctionModule` returns exactly that value in its own response, so this is the value the server already handed you.
2. Only if that is also refused (observed with objects that arrived via abapGit import and may carry transport history) issue a workbench transport with `CreateTransport` and pass its number.

### `CreateTransport` — non-ASCII descriptions come back corrupted

A description containing non-ASCII text (e.g. Korean) is stored with those characters replaced by `#`; ASCII segments survive intact. The transport itself is created and fully usable — only the display text is damaged, and it cannot be repaired through this tool. Write transport descriptions in English. Whether the loss happens client-side or in the backend codepage was not established.

### Class implementations include — the reader is `GetLocalTypes`, not the obvious names

The working code of a class pool — RAP behavior-implementation (BIL) handlers, `lcl_*` locals — lives in the **implementations include** (CCIMP; the Eclipse "Local Types" tab), and none of the intuitively-named readers show it: `ReadBehaviorImplementation` / `GetBehaviorImplementation` / `ReadClass` return only the 4-line global shell, `GetInclude("…CCIMP")` fails with HTTP 500, `GetIncludesList(CLAS/OC)` finds nothing, and `GrepObjects` on a class searches `source/main` only. Nothing in those responses points at the right tool, so "there is no reader" is the natural — and wrong — conclusion (field-reported 2026-08-03: a BIL was reconstructed by hand from old copies because of it). The reader exists: **`GetLocalTypes`** reads the implementations include (active or inactive version), alongside `GetLocalDefinitions` (CCDEF), `GetLocalMacros` (CCMAC), and `GetLocalTestClass` (CCAU). Write side: `UpdateLocalTypes` targets the same include; for a BIL prefer `UpdateBehaviorImplementation`, which rewrites shell and implementations together.

### `UpdateSourceByPatch` — three write-side traps (serial loss · CRLF · main source only)

Three independent behaviors, each returning success while doing less than the response implies. ⓐ **Serial patches with `activate: false` lose the earlier ones** — the patch is written to the *inactive* version, but each next call fetches the *active* source to apply onto, so with activation deferred only the last patch survives (responses stay `success` + `occurrences_replaced: 1` + a plausible diff; field-verified on two systems, CLAS 3-in-a-row → 1 survivor). Tell: the `diff_preview` context of patch N does not show patch N−1's change. Safe pattern: `activate: true` on **every** patch plus a `GrepObjects` read-back of the changed token — with that, even serial CLAS patching is safe (6-in-a-row verified 2026-08-05). ⓑ **Multi-line `old_string` never matches** — server source is CRLF, an LF-joined pattern fails with `old_string not found` even though the text is visibly present. Use single-line anchors only. ⓒ **CLAS patches reach the main source only** — test includes (CCAU) and local types are out of range; use `UpdateLocalTestClass` / `UpdateLocalTypes` (full-text) for those, and see the CCIMP entry above for reading them.

### `RunUnitTest` — empty `runResult` on older engine versions (resolved; verify before blaming the tool)

Engines before the classic `/testruns` bridge (server 4.13.11, shipped with plugin v0.5.1) could return `status: completed` with a completely empty `<aunit:runResult/>` — indistinguishable from "no tests exist". Re-measured 2026-08-03 on v0.5.1 against the same system: full results, matching a user-side ADT run exactly (17/17). If the empty-result symptom appears, check the engine version (`server/VERSION`, or `GetSystemInfo`) before concluding the tool is broken. Residual quirks of the classic endpoint: `format: "junit"` is refused (omit the format), and a run covers **all** local test classes of the container class — a narrower `test_class` selection can return more than requested; that is normal, not a mis-scope.
