# Upstream fix hand-off: `abap-mcp-adt-powerup` server + `mcp-abap-adt-clients` client, releases 4.13.2 – 4.13.18

Paste this whole file into the Claude Code (or hand it to the maintainer) on the
machine that holds the fork/upstream source. It is **self-contained**: for each
defect it gives the live symptom, the root cause, the exact fix location, the
regression test that pins it, and the live-verification summary — enough to
reproduce the repair against the original sources.

## Who this is for

Two upstream code bases, kept in sync from one reference implementation:

1. **The MCP server** — `hjaewon/abap-mcp-adt-powerup` (GitHub fork, **frozen at
   4.13.1**, history archive only) and its ancestors
   `babamba2/abap-mcp-adt-powerup` → `fr0ster/mcp-abap-adt` →
   `mario-andreschak/mcp-abap-adt`. **Every fix from 4.13.2 onward lives only in
   the reference implementation below**, never in the frozen GitHub fork.
2. **The vendored ADT client package** — `@babamba2/mcp-abap-adt-clients`
   (pinned at `3.13.1`). The server never edits this package's published code;
   it carries client-side repairs as a **`patch-package`** patch. In this
   hand-off, every hunk in that patch is a **client-package source change** you
   should apply to the client's own repository (the patch targets the compiled
   `dist/core/**/*.js` and `dist/utils/*.js`; the equivalent upstream edit is in
   the client's TypeScript `src/`).

## Reference implementation

All fixes are live in `github.com/hjaewon/sap-agentic-harness`, subtree
`engine/` (the canonical source; the published bundle is built from it). Pull
exact diffs from these commits if a hand-application drifts:

| Release | Commit | What it fixed |
|---|---|---|
| 4.13.1 | `53225186` | (baseline, referenced) RunUnitTest 404, CreateFunctionGroup CT negotiation |
| 4.13.2 | `11f8d854` | Tier guard fail-closed, GetSqlQuery table-extraction bypass (§9) |
| 4.13.3 | `264e7b4a` | UpdateClass lock-session collapse (§1) |
| 4.13.4 | `8d91a263` | UpdateInterface / UpdateProgram (§1) |
| 4.13.5 | `fab609ef` | Update-handler family × 10 (§1) |
| 4.13.6 | `dcb049ea` | Create-handler family × 6 (§1) |
| 4.13.7 | `e4bc611c` | Vendored-client lock-chain wrappers (§1, client-package) |
| 4.13.8 | `acad614d` | UpdateFunctionGroup CT negotiation (§2) |
| 4.13.9 | `4247dd89` | Silent-delete honesty (§3) + CreateProgram type guard (§4) |
| 4.13.10 | `8711b67b` | Logon-language resolution (§5) + already-exists machine id (§6) |
| 4.13.11 | `5373268e` | Structure check-with-source (§7) + low/CDS classic unit test (§8) |
| 4.13.12 | `(pending)` | Table check-with-source + handler blocks bad DDL (§10) + create-payload logon-language remainder × 8 (§11) |
| 4.13.13 | `(pending)` | Real-data gate honesty: self-closing NULL cell drop/shift + row-count meta + sporadic-400 retry (§12) |
| 4.13.14 | `(pending)` | DDIC write real-generation: CreateStructure fields→DDL (§13) + FM read inactive-edit-loss warning + description honesty (§14) |
| 4.13.15 | `(pending)` | Local-include Delete family repaired — dedicated clear path replaces the broken `update('')` delegation (§15, client-package, backlog 11-⑩) + low unit-test schemas drop 4 cloud-only no-op params (§15, server) + `CreateProgramLow` type-substitution guard mirrored from the high-level (§4, Known-remaining #2) |
| 4.13.16 | `(pending)` | Branch-integration renumber — no code change (see engine/CHANGELOG.md [4.13.16]) |
| 4.13.17 | `(pending)` | `ActivateObjects` false-failure: a clean run (`generationExecuted="true"`, no `activationExecuted`, 0 errors) reported every object failed — per-object status + run success now gate on `activated \|\| generated` (§16, server) |
| 4.13.18 | `(pending)` | `ActivateObjects` server-state oracle re-query (§17-A, #11 — completes #6/#11) + `CheckSyntax` no-source fallback for fully-active programs (§17-B, #12 — noise-throw → active program-tree check, fixes `-32603` leak) |
| 4.13.19 | `(pending)` | `CheckSyntax` no-source fallback now actually reads the **active** source (§18, #12 residual — §17-B's `runProgramTreeCheck` re-checked the absent `inactive` version and re-hit the noise; live-observed on `ZUNIWR2030`) |

> Note: commit `acad614d` is the authoritative 4.13.8 boundary (the CHANGELOG's
> `## [4.13.8]` header was added retroactively — content is identical).

### Live-evidence discipline

"Verified live" below means executed against **an on-premise S/4HANA 2021
system whose logon/master language is CS**, unless noted. A second,
**directly-connected on-premise system** is referenced only as the negative
baseline for the lock-session class (it never reproduced §1). No host,
credential, or user identity is reproduced here; German message texts are quoted
verbatim because they are the diagnostic signal.

---

## §1 — Lock-chain stateful-session collapse (HTTP 423 "invalid lock handle")

**This is the largest class: 19 server handlers + 6 client wrapper families,
one mechanism.** Fixed incrementally across 4.13.3 – 4.13.7.

### Symptom

An Update/Create flow locks an object, then a few seconds later the write PUT is
rejected:

```
ADT API error: status 423 ... <type id="ExceptionResourceInvalidLockHandle"/>
... resource ... is not locked (invalid lock handle: ...)
```

Each retry re-locks and reports a *different* handle, so it does not look like a
stale cached handle. Reproduces on backends that recycle the underlying HTTP
connection between requests; a directly-connected system that keeps the socket
warm never shows it (which is why it stayed latent). Live-reproduced for
`UpdateClass`, then the whole family; for `CreateDomain`/`CreateDataElement` it
additionally left half-created skeletons behind.

### Root cause

The ADT lock/check/write sequence must run as **one stateful ADT session**
(the normal Eclipse-ADT protocol). But every client wrapper's `lock()` acquires
the ENQUEUE lock in a stateful request and then **resets the connection to
stateless before returning** (`setSessionType('stateful')` → lock →
`setSessionType('stateless')`). The intermediate requests the handler issues
between lock and PUT — a pre-write `/checkruns` syntax check, or a
read-modify-write GET — and the write PUT itself therefore go out **stateless**.
On a connection-recycling backend SAP routes a stateless request through a fresh
work process that has no record of the stateful session, tears the session down,
and the ENQUEUE lock evaporates. The subsequent PUT fails with *invalid lock
handle*. Same bug class as vsp issue #88 (the `SyntaxCheck`-runs-stateless case).

### Fix — two layers

**(a) Server handlers that lock inline** — re-assert
`this.connection.setSessionType('stateful')` **immediately after** the inline
`lock()`, so the check + PUT ride the same stateful session as the lock; the
handler's `unlock()` restores stateless afterward. One line per handler. Where a
handler locks inline only conditionally (caller-supplied `lock_handle` flows
manage their own session), the pin applies only to the inline-lock branch.

Handler pins (all under `engine/src/handlers/<object>/high/handle<Op><Object>.ts`):

| Release | Handlers pinned | Note |
|---|---|---|
| 4.13.3 | `handleUpdateClass` | anchor case, live red→green |
| 4.13.4 | `handleUpdateInterface`, `handleUpdateProgram` | same inline lock→check→PUT shape |
| 4.13.5 | `handleUpdateView`, `handleUpdateTable`, `handleUpdateStructure`, `handleUpdateDomain`, `handleUpdateDataElement`, `handleUpdateFunctionGroup`, `handleUpdateFunctionModule`, `handleUpdateServiceDefinition`, `handleUpdateMetadataExtension`, `handleUpdateBehaviorDefinition` | last four = inline-lock branch only; PUT-first ones (FM/SRVD/DDLX/BDEF) pinned because the post-check goes out before unlock |
| 4.13.6 | `handleCreateDomain`, `handleCreateDataElement`, `handleCreateTable`, `handleCreateMetadataExtension`, `handleCreateBehaviorDefinition` (pin) + `handleCreateInclude` (**remove** the explicit stateless reset between locking the main program and PUTting its modified source) | `handleCreateStructure` deliberately NOT pinned — its lock/unlock pair brackets no request (dead pair; see §4). `handleCreateTextElement` uses an RFC textpool write, different pathology, untouched. |

`handleUpdateInclude` already carried the pin (the original correct precedent).
Total: 13 Update + 6 Create = **19 server handler pins**.

**(b) Client-package wrappers that own the whole chain** (4.13.7, client-package
source) — some handlers hand the *entire* lock→check→write chain to a client
wrapper without a `lockHandle`, so no handler-side pin can reach inside. The
wrapper's internal `lock()` resets to stateless before its own intermediate
`/checkruns` POST and write PUT(s). These are patched inside the client package:

| Client source (`src/core/...`) | Method(s) | Edit |
|---|---|---|
| `class/AdtLocalTestClass` | `create()`, `update()` | re-pin `setSessionType('stateful')` right after the parent-class lock |
| `class/AdtLocalTypes` | `create()`, `update()` | same |
| `class/AdtLocalMacros` | `create()`, `update()` | same |
| `class/AdtLocalDefinitions` | `create()`, `update()` | same |
| `behaviorImplementation/AdtBehaviorImplementation` | `update()` | re-pin after `this.class.lock()`; this chain carries **two** writes (main source PUT + implementations-include PUT) |
| `class/AdtClass` | `updateTestClasses()` | remove the stateless reset between the inline lock and the testclasses PUT (public API, not reached by any current handler, but part of the defect) |

The wrappers' own `unlock()` still restores stateless, so post-unlock behavior
(final check, activation) is unchanged. In the reference repo these are the
first six hunks of
`engine/patches/@babamba2+mcp-abap-adt-clients+3.13.1.patch` (each marked
`[powerup 4.13.7]`).

**Not affected (verified, no change):** `UpdateUnitTest` (its
`AdtUnitTest.update()` throws "not supported" — no chain), `UpdateClassMethod`
(delegates to the 4.13.3-fixed `UpdateClass` path), `UpdateInterfaceLow` /
`UpdateProgramLow` / `UpdateClassTestClassesLow` (caller-supplied lock handle +
session — low-level contract), Legacy wrappers (already correct).

### Regression tests

- `engine/src/__tests__/unit/updateClassStatefulSession.test.ts`
- `engine/src/__tests__/unit/updateInterfaceStatefulSession.test.ts`
- `engine/src/__tests__/unit/updateProgramStatefulSession.test.ts`
- `engine/src/__tests__/unit/updateHandlersStatefulSessionFamily.test.ts` (10 cases)
- `engine/src/__tests__/unit/createHandlersStatefulSessionFamily.test.ts` (6 cases)
- `engine/src/__tests__/unit/vendoredClientLockChainStatefulSession.test.ts` (7 cases, incl. `updateTestClasses`)

Each drives the real handler/wrapper over a fake connection and pins
`x-sap-adt-sessiontype: stateful` on every request from the inline lock through
the write. All reverse-verified (each fails with its pin reverted).

### Live verification

- `UpdateClass`: the exact call that failed twice on one day returned
  updated+activated after 4.13.3.
- `UpdateInterface`/`UpdateProgram`: 4.13.3 bundle reproduced *ungültiges
  Sperr-Handle*; 4.13.4 completed both ($TMP objects).
- `UpdateTable`/`UpdateDomain`: 423 reproduced on the 4.13.4 bundle, resolved on
  4.13.5.
- `CreateDomain`/`CreateDataElement`: 423 reproduced on 4.13.5, gone on 4.13.6
  (residual failure was a *separate* defect — §5); all six $TMP objects deleted,
  zero orphan locks.
- `UpdateLocalTestClass`: mid-chain 423 on the 4.13.6 bundle → completes on
  4.13.7.

---

## §2 — Function-group content-type discovery negotiation

### Symptom

On a system that advertises only `functions.groups.v2`, `UpdateFunctionGroup`
was rejected:

```
HTTP 415 ExceptionUnsupportedMediaType
"Nicht unterstützter Medientyp. Unterstützte Medientypen:
 application/vnd.sap.adt.functions.groups.v2+xml"
```

while `CreateFunctionGroup` on the same system succeeded.

### Root cause

The vendored client hardcodes `functions.groups.v3+xml` for FG writes (and its
own constants disagree: `ACCEPT_FUNCTION_GROUP` = "v2, v1" for reads vs
`CT_FUNCTION_GROUP` = "v3" for writes — an upstream asymmetry). 4.13.1 already
fixed the **create** path by negotiating the media type from the live ADT
discovery document, but `handleUpdateFunctionGroup` issues its own raw
`makeAdtRequest` PUT that still hardcoded v3 in both `Content-Type` and `Accept`.

### Fix (server)

`engine/src/handlers/function/high/handleUpdateFunctionGroup.ts`: call the same
`negotiateFunctionGroupContentTypes()` used by `CreateFunctionGroup`
(`engine/src/lib/adtFunctionGroupContentTypes.ts`) **before** locking (while the
session is still stateless), inject the advertised media type into the raw PUT's
`Content-Type`/`Accept`, fall back to the hardcoded v3 default only when
discovery is unavailable, and skip negotiation on legacy stacks. Results are
cached per connection, so a Create or prior Update in the same session costs no
extra discovery round-trip. The 4.13.5 stateful-lock pin (§1) is unchanged — the
negotiation GET runs before it.

The vendored `functionGroup/update.js` fallback (`ct?.accept ||
CT_FUNCTION_GROUP`, re-using the v3 constant) is **dead code from the server's
side** — no handler calls it — so the constant asymmetry needs no client-package
patch; every FG write path reachable from a handler now negotiates. (If you want
to fix it at the client level anyway, align the two constants or make the write
default negotiate; the reference implementation left it, judging a static change
speculative and potentially regressive on v3-capable systems.)

### Regression test

`engine/src/__tests__/unit/updateFunctionGroupContentTypeNegotiation.test.ts` —
serves a v2-only discovery document, pins the negotiated v2 media type on the
PUT, and checks the v3 fallback when discovery rejects (reverse-verified).

### Live verification

The `UpdateFunctionGroup` that returned 415 on 4.13.7 now succeeds; the new
description persists (read back with `masterLanguage="CS"`).

---

## §3 — Silent delete failures reported as success

### Symptom

Deleting a function group held under an ADT lock returned `success: true` while
the object survived (`GetFunctionGroup` still returned it). Live-measured 3× on
`DeleteFunctionGroup`. The real SAP signal was an E-level message, e.g.
*"Zpracováváte již …"* (Czech: "you are already processing …").

### Root cause

The generic `POST /sap/bc/adt/deletion/delete` service returns **HTTP 200 even
when it refuses** the delete, signalling the real outcome only via
`del:deletionResult/del:object[@del:isDeleted]` plus a `del:message`. The
vendored low-level `deleteX()` helpers discarded that body and hardcoded
`{ success: true }`, so a lock/authorization failure looked like a clean delete.
(The vendored `deletePackage()` already parsed the flag correctly — proof of the
response shape — but every other helper ignored it.)

### Fix (client-package)

Add a shared helper `assertDeletionSucceeded(response, objectLabel)` to
`utils/internalUtils.js` and call it from every vendored `deleteX()` that POSTs
to the shared `/deletion/delete` endpoint. It:

- parses `del:deletionResult`, normalizing `del:object` to an array — **a single
  delete can cascade into several nodes** (a structure delete returns both its
  `TABL/DS` and `TABT/DTT` nodes, which `fast-xml-parser` yields as an array);
- throws with the SAP `del:message` text when **any** node reports
  `isDeleted !== "true"` (positively-identified failure);
- falls back to the HTTP status only for unknown/absent `deletionResult` bodies,
  so an unusual-but-successful shape is never mis-reported as a failure.

**12 helpers** now call it: `functionGroup`, `class`, `program`, `interface`,
`domain`, `dataElement`, `table`, `structure`, `view`, `serviceDefinition`,
`functionModule`, and `behaviorDefinition` (same endpoint/format; its handler
previously treated any non-throw as success). In the reference repo these are
the `assertDeletionSucceeded` hunks plus the helper definition in the
`3.13.1.patch` (marked `[powerup 4.13.9]`).

**Deliberately excluded:** `tabletype` / `accessControl` / `enhancement`
`delete.js` share the root but are unreachable from any handler (dead code);
`metadataExtension` delete uses a REST `DELETE /ddic/ddlx/sources/{name}` (a
different endpoint/response shape).

### Regression test

`engine/src/__tests__/unit/deletionResultHonesty.test.ts` — drives real
`DeleteFunctionGroup`/`DeleteClass`/`DeleteProgram`/`DeleteBehaviorDefinition`
over an `isDeleted="false"` body (honest failure carrying the SAP message) and a
green `isDeleted="true"` case each, plus a `DeleteStructure` multi-node cascade
(all-deleted → success; one node false → honest failure). Reverse-verified.

### Live verification

Deleting a locked FG reported `success:true` + survival on 4.13.8; reports an
honest failure carrying the SAP message on 4.13.9. An unlocked FG and a
structure both still delete cleanly (no over-fix).

---

## §4 — CreateProgram type-substitution guard

### Symptom

`CreateProgram` with `program_type: "function_group"` silently produced a plain
`PROG/P` object (response `"type":"PROG/P"`, URI `programs/programs`) — a request
for a function group was fulfilled as a program. Live-proven for `function_group`.

### Root cause

The ADT `programs/programs` create endpoint only produces `PROG/P`. The tool
accepted `program_type` values (`include`, `function_group`, `class_pool`,
`interface_pool`) that map to distinct ADT object types with their own create
endpoints, but the vendored create ignored the type and always produced a
`PROG/P` shell.

### Fix (server)

`engine/src/handlers/program/high/handleCreateProgram.ts`: reject the four
unsupported types **up front, before any object is created**, pointing the caller
at the dedicated tool (`CreateInclude` / `CreateFunctionGroup` / `CreateClass` /
`CreateInterface`). Tighten the `inputSchema` enum from six values to the two
this endpoint actually creates (`executable`, `module_pool` — both `PROG/P`).
Schema-only enum edit; tool count unchanged.

The compact `HandlerCreate` dispatcher delegates `PROGRAM.create` to this patched
handler and inherits the guard (review-verified — no separate fix).

### Low-level sibling (4.13.15, was Known-remaining #2)

`engine/src/handlers/program/low/handleCreateProgram.ts` (`CreateProgramLow`) had
the same defect and was left unguarded at 4.13.9 — its `program_type` schema
advertised all six values with **no enum**, and the handler passed the raw type
straight to the vendored `create()`. `CreateProgramLow(program_type:'function_group')`
therefore created a `PROG/P` shell and reported `success:true` (live-reproduced
on IDES `$TMP` via a `--exposition readonly,high,low` server; `SearchObject`
confirmed the object was `PROG/P`, not `FUGR`). Fixed by **mirroring** the
high-level guard into the low handler — the same `SUPPORTED_PROGRAM_TYPES`,
`DEDICATED_TOOL_FOR_PROGRAM_TYPE` map, and pre-create reject block — and adding
the same `enum:['executable','module_pool']` to the low `program_type` schema
(so the MCP input-validation layer rejects an unsupported value before the
handler too). The low-specific `session_id` / `session_state` / `skip_check`
contract is untouched. Verified live red→green on IDES `$TMP`: pre-fix created a
`PROG/P` shell (deleted, read-back 404); post-fix the call is rejected pre-wire
and nothing is created.

### Also removed (4.13.9): CreateStructure dead lock/unlock pair

`engine/src/handlers/structure/high/handleCreateStructure.ts` locked the
structure and immediately unlocked it with only a TODO between — the DDL update
it was meant to protect was never implemented, so the pair bracketed no request.
Removed, along with the now-redundant unlock-on-error try/catch. Behavior
unchanged (two round-trips fewer); the create endpoint still produces an empty
structure shell (field/include DDL generation remains unimplemented — see
Known-remaining). This is why `handleCreateStructure` was excluded from the §1
Create-family pins.

### Regression tests

- `engine/src/__tests__/unit/createProgramTypeGuard.test.ts` — each unsupported
  type refused with **zero** outbound requests; a supported type still reaches
  the create POST (reverse-verified). Covers **both** `CreateProgram` (high) and
  `CreateProgramLow` (low, 4.13.15) — the low reverse-verify removes only the low
  guard and fails exactly the four low reject cases.
- `engine/src/__tests__/unit/createStructureNoDeadLock.test.ts` — asserts
  create→check→activate issues no structure LOCK/UNLOCK.

---

## §5 — Logon-language dynamic resolution + add-if-missing skeleton repair

### Symptom (two manifestations, one root)

On a system whose logon language is not EN (measured with logon language CS):

**(a) hard create rejection** — `CreateView` (DDLS) failed:

```
HTTP 400 ExceptionResourceCreationFailure
"Sprache EN zum Anlegen der Beschreibung entspricht nicht Mastersprache CS"
(T100 DDIC_ADT_DDLS/016)
```

No shell was left behind.

**(b) silently dropped description** — DOMA/DTEL creates *succeed* but SAP
normalizes the master language to the logon language and **drops the description
entirely** (the created skeleton's GET XML carries no `adtcore:description`
attribute at all). The subsequent read-modify-write attribute step inside
`CreateDomain`/`CreateDataElement` then fails:

```
"Die Beschreibung fehlt" (T100 SWB_TOOL/019)
```

leaving a half-created skeleton that Update could not repair either.

### Root cause

The vendored create payloads hardcode `adtcore:language="EN"` /
`adtcore:masterLanguage="EN"`. The DDLS create service hard-rejects a payload
whose master language differs from the system's; DOMA/DTEL tolerate the create
but drop the mismatched-language description. Separately, the XML patch helper
used by the Update read-modify-write path was **replace-only**, so it silently
no-op'd on a description-less skeleton and the PUT failed with *"Die Beschreibung
fehlt"* — the skeleton was unrepairable except by GUI delete + recreate.

### Fix — server + client-package

**Server, new module** `engine/src/lib/adtLogonLanguage.ts`:
`resolveLogonLanguage(connection)` reads the live ADT system-information document
(`GET /sap/bc/adt/core/http/systeminformation`, the same source `GetSystemInfo`
uses; live-verified to return `"CS"`), validates it against `^[A-Z]{1,3}$`,
caches per connection, and falls back to `EN` (`DEFAULT_MASTER_LANGUAGE`) only
when the endpoint is unavailable. **Dynamic, not a second hardcoded language.**

`handleCreateView`, `handleCreateDomain`, `handleCreateDataElement` (under
`engine/src/handlers/<object>/high/`) resolve it and inject it into the create
call as `master_language`.

**Client-package** — the payload builders and their wrappers/typings accept the
new `master_language` (marked `[powerup 4.13.10]` in `3.13.1.patch`):

- `view/create.js`, `domain/create.js`, `dataElement/create.js` — emit
  `adtcore:language`/`adtcore:masterLanguage` from `master_language`, EN fallback.
- `view/AdtView.js`, `domain/AdtDomain.js`, `dataElement/AdtDataElement.js` —
  forward `config.masterLanguage`.
- `view/types.d.ts`, `domain/types.d.ts`, `dataElement/types.d.ts` — add
  `master_language?` / `masterLanguage?` to the param/config interfaces.

**Add-if-missing skeleton repair** — `utils/xmlPatch.js` (+ `.d.ts`):
`patchXmlAttribute` takes an **opt-in** `{ addIfMissing: true }` that injects the
absent attribute into the root element's opening tag (prolog/comment-safe,
quote-aware). Only the `adtcore:description` patches in `domain/update.js` and
`dataElement/update.js` opt in; every other call site keeps the exact
replace-only behavior.

**Also fixed (server, side-discovery):** `handleCreateView` previously discarded
the ADT error body (forwarding only the generic axios *"Request failed with
status code 400"*). It now routes the error through `extractAdtErrorMessage` and
appends the HTTP status (`SAP Error: … [HTTP 400]`). See
`engine/src/handlers/view/high/handleCreateView.ts`.

### Scope note

At 4.13.10 only the three live-proven create paths (DDLS view, domain, data
element) resolved/injected the language; the other EN-hardcoded create payloads
were left untouched because those creates succeed on the CS box (EN→logon-
language normalization is tolerated) and the description-drop was not observed
for them. **§11 (4.13.12) extends the same `resolveLogonLanguage` injection to
the remaining reachable create builders** — class, interface, program, package,
table, structure, service definition, DDLX — so their descriptions land in the
system's master-language slot too. Still not resolved (deliberately): the
`accessControl` (DCL), `functionGroup`, `enhancement`, and `tabletype` create
builders — `accessControl`/`enhancement`/`tabletype` are unreachable from any
handler (dead from the engine's side) and FUGR is out of the named 11-⑫ scope
(its create tolerates the normalization; verified green since 4.13.1). The
low-level `Create*Low` / compact paths call the same patched builders but do not
resolve the language themselves — without a caller-supplied
`master_language`/`masterLanguage` they keep the EN default (unchanged
semantics).

### Regression tests

- `engine/src/__tests__/unit/createLogonLanguageConsistency.test.ts` — drives
  all three create handlers over a fake connection advertising CS, pins
  `adtcore:language="CS"`/`masterLanguage="CS"` on the POST body, plus EN-fallback
  cases when systeminformation 404s (reverse-verified).
- `engine/src/__tests__/unit/createViewErrorBody.test.ts` — pins the SAP message
  text + status on the returned error.
- The add-if-missing behavior is exercised via the real `UpdateDomain`/
  `UpdateDataElement` handlers over a description-less skeleton fixture.

### Live verification

`CreateView` red 400 on 4.13.9 → green create on 4.13.10; `CreateDomain`/
`CreateDataElement` red *"Die Beschreibung fehlt"* → green create with the
description landing (read back with `masterLanguage="CS"`). The actual
half-skeleton domain left by the 4.13.9 red repro was repaired by `UpdateDomain`
on 4.13.10 (description read back), then deleted.

---

## §6 — already-exists detection: machine-identifier-first

### Symptom

`UpdateDataElement`'s pre-validation (which treats already-exists as the expected
case for an update) misclassified the already-exists rejection as a real error
and refused the update. Live-measured: the rejection arrived as `<exc:exception>`
with **German** text *"Domain mit Name X ist bereits vorhanden"* — **even under
`lang="EN"`** (the message text follows the backend's language pool, not the
request header).

### Root cause

`isAlreadyExistsError` matched only English phrases ("already exists" …), so any
non-English message pool defeated it.

### Fix (server)

`engine/src/lib/utils.ts` — `isAlreadyExistsError` is now
language-independent-first:

1. exception type ids containing `AlreadyExists` (e.g.
   `ExceptionResourceAlreadyExists`);
2. the T100 message key `SWB_TOOL/016` (*"&1 mit Name &2 ist bereits
   vorhanden"* — live-captured for both DOMA and DTEL, serialized as
   `<entry key="T100KEY-ID">SWB_TOOL</entry><entry key="T100KEY-NO">016</entry>`);
3. only **then** the multilingual text fallback (existing English patterns plus
   German *"bereits vorhanden"* / *"existiert bereits"*).

Consumed by `engine/src/handlers/data_element/high/handleUpdateDataElement.ts`.

### Regression test

`engine/src/__tests__/unit/isAlreadyExistsErrorMachineId.test.ts` — pins the
verbatim live captures, including the **negative control** that the *different*
German error `SWB_TOOL/019` (*"Die Beschreibung fehlt"*, §5) is NOT classified as
already-exists (reverse-verified: the four new-detection cases fail on the old
matcher).

### Live verification

`UpdateDataElement` against an existing $TMP data element failed on 4.13.9 with
the German already-exists text and completes on 4.13.10.

---

## §7 — Structure pre-check must validate the new DDL (check-with-source)

### Symptom

`UpdateStructure` failed on the CS box in two ways, both hiding the real error:

**(a) opaque write failure** —

```
ExceptionResourceAlreadyExists
"Kein Sichern wegen Fehler in Quelle. Details erhalten Sie mit Prüfung."
(no saving because of a source error, get details via a check)
```

the promised details never shown.

**(b) bare empty error** — `"Structure check failed:"` with nothing after the
colon.

### Root cause

`handleUpdateStructure`'s "check the new DDL before update" step calls
`client.getStructure().check({ structureName, ddlCode }, 'inactive')`, but the
vendored `AdtStructure.check(config, status)` **silently dropped
`config.ddlCode`** and check-ran the object's *stored* inactive version
(`checkStructure(conn, name, version, undefined)`). So the pre-check never
validated the new code:

- when the stored inactive version is valid, the pre-check passes and the invalid
  new DDL only fails at the write PUT (manifestation a);
- when the stored inactive version cannot be validated (empty shell →
  `status="notProcessed"` with no messages), `parseCheckRunResponse` flags
  `has_errors` with an empty `errors` list and `checkStructure` threw a bare
  `"Structure check failed:"` (manifestation b).

The same drop also silently defeated the low-level `CheckStructure` tool's
documented `ddl_code` validation.

### Fix (client-package, two edits)

Marked `[powerup 4.13.11]` in `3.13.1.patch`:

1. `structure/AdtStructure.js` — `check()` forwards `config.ddlCode` as the
   source to validate (`checkStructure(conn, name, version, config.ddlCode, …)`),
   so the pre-check runs a check-**with-source** on the actual new DDL and
   surfaces the real error **before** the write PUT. Callers that pass no
   `ddlCode` (`CreateStructure`'s inactive check, `UpdateStructure`'s final
   check) are unchanged (`undefined` → prior saved-version behavior). This also
   revives the low-level `CheckStructure` `ddl_code` path.
2. `structure/check.js` — never throw a bare `"Structure check failed:"`. Keep
   only non-empty error texts; when none remain, fall back to the check
   status/statusText so the thrown message is always actionable.

### Regression test

`engine/src/__tests__/unit/updateStructureCheckSource.test.ts` — drives real
`handleUpdateStructure` over a fake connection that answers `/checkruns`
differently for source vs no-source requests: valid code → pre-check carries the
new DDL as base64 source, update completes; real check error → the exact SAP
detail surfaced and **no** write PUT issued; `notProcessed` → an honest
status-carrying error (never bare). Reverse-verified.

### Live verification

On 4.13.10, `UpdateStructure` with DDL missing the mandatory
`@AbapCatalog.enhancement.category` annotation failed with the opaque *"Kein
Sichern wegen Fehler in Quelle …"*; on 4.13.11 the pre-check surfaces the real
*"Obligatorische Annotation \"AbapCatalog.enhancement.category\" für Struktur …
fehlt"* before any write, and a corrected DDL updates + activates cleanly.

### 4.13.12 — the same defect in `UpdateTable` (backlog 11-⑪), with a second gap

`AdtTable.check(config, status)` had the **identical** `ddlCode`-drop
(`runTableCheckRun(conn, 'abapCheckRun', name, undefined, version)`), **plus** a
second gap the structure path did not have: `runTableCheckRun` (`table/check.js`)
returns the raw response **unparsed** — unlike `checkStructure`, which parses and
throws — so `AdtTable.check` always returned `{ errors: [] }` and
`handleUpdateTable`'s `checkNewCodePassed` was **always true**. The pre-check
therefore never blocked a bad update *even if* the source were forwarded. On a
connection-recycling on-prem box this was worse than opaque: a bad
`UpdateTable` returned **`success: true`** (a false success — the bad DDL was
written to the inactive version). The fix is one vendored edit to
`table/AdtTable.js` `check()`: forward `config.ddlCode` **and** parse the result
with the shared `parseCheckRunResponse`, throwing `Table check failed: <detail>`
on a real error (same DDIC-benign skip + never-bare fallback as `checkStructure`).
The parse+throw lives in `AdtTable.check` (not the shared `runTableCheckRun`,
which other callers in `AdtTable.update`'s own chain use), so no other caller's
contract changes; the same edit revives the low-level `CheckTable` `ddl_code`
path. Regression test:
`engine/src/__tests__/unit/updateTableCheckSource.test.ts` (mirrors the structure
test; both edits reverse-verified independently). **Live on KR-DEV (logon KO):**
the same bad-DDL `UpdateTable` (a field typed to a non-existent data element)
returned `success:true` on 4.13.11 (false success) and, on 4.13.12, an honest
*"Table check failed: Field … Component type or domain used not active or does
not exist …"* before any write; a corrected DDL still updates + activates
(no over-block). *Low-tool parity note:* placing the parse+throw in `check()`
means `CheckTableLow`/`CheckObjectLow` now report a **hard** check error as a
thrown message string rather than a structured `errors[]` — same as
`CheckStructureLow` since 4.13.11 (intended parity; warnings/clean checks
unchanged).

---

## §8 — Low-level class + CDS ABAP Unit run/read: classic on-prem endpoint

### Symptom

`RunClassUnitTestsLow` and the CDS unit-test readers returned **HTTP 404** on
on-prem (the ABAP-Cloud-only collection does not exist there).

### Root cause

4.13.1 moved the **high-level** `RunUnitTest`/`GetUnitTest*` off the ABAP-Cloud
async collection `/sap/bc/adt/abapunit/runs` (+ `/results/`) onto the classic
synchronous `/sap/bc/adt/abapunit/testruns` endpoint, bridged through a
connection-scoped TTL-bounded run_id store (`engine/src/lib/abapUnitClassic.ts`).
The low-level `RunClassUnitTestsLow` / `GetClassUnitTestStatusLow` /
`GetClassUnitTestResultLow` and the CDS readers `GetCdsUnitTest` /
`GetCdsUnitTestStatus` / `GetCdsUnitTestResult` were left on the cloud path and
404'd identically.

### Fix (server) — reuse the 4.13.1 helpers, no re-port

The six handlers now **reuse** `runClassicUnitTest` / `storeUnitTestRun` /
`getUnitTestRun` from `engine/src/lib/abapUnitClassic.ts`:

- `engine/src/handlers/class/low/handleRunClassUnitTests.ts` runs the classic
  sync endpoint and caches the result under a generated run_id;
- `engine/src/handlers/class/low/handleGetClassUnitTestStatus.ts` /
  `handleGetClassUnitTestResult.ts` and
  `engine/src/handlers/unit_test/high/handleGetCdsUnitTest.ts` /
  `handleGetCdsUnitTestStatus.ts` / `handleGetCdsUnitTestResult.ts` look that
  run_id up in the **same** connection-scoped store — so run_ids from
  `RunUnitTest` and `RunClassUnitTestsLow` interoperate.

There is no `RunCdsUnitTest` tool: CDS test classes (created by
`CreateCdsUnitTest`) are run through the classic `RunUnitTest`, whose run_id the
CDS readers now resolve. The low-level caller contract is preserved (tests in →
run_id out; run_id in → status/result out; `session_id`/`session_state` still
accepted); unit-test runs never lock, so there is no lock/session contract to
break. `format:"junit"` is rejected on the low + CDS result readers (unsupported
by the classic endpoint), matching the high reader. The compact
`HandlerCdsUnitTestStatus`/`Result` delegate to the fixed CDS readers and inherit
the fix.

### Regression test

`engine/src/__tests__/unit/unitTestClassicLowCds.test.ts` — drives all six real
handlers over a fake connection serving `/testruns` and **hard-fails any request
to the old `/abapunit/runs|results` collection** (a regression to the cloud path
is caught, not 404-swallowed). Reverse-verified: reverting the six handlers to
the cloud path fails all five cases.

### Live verification

Via a `--exposition readonly,high,low` server against a $TMP class with a passing
local test: `RunClassUnitTestsLow` returned 404 on 4.13.10 and `GetCdsUnitTest`
hit the cloud read; on 4.13.11 the low trio and the CDS trio all return the real
`<aunit:runResult>`.

---

## §9 — Safety hardening (4.13.2)

### Tier guard fail-closed

**Root cause:** a missing/unrecognized `SAP_TIER` resolved to `DEV`
(`normalizeTier` "unknown/missing → DEV"), and the readonly guard treats `DEV` as
allow-all — so a profile or env file that omitted the tier, or set a typo
(`STG`, `PROD`), silently opened every write/mutation tool. `--env-path` /
`MCP_ENV_PATH` connections (no `.sc4sap` profile) never read `SAP_TIER` at all,
so QA/PRD env files ran wide-open.

**Fix (server):** a loaded connection whose tier cannot be resolved to
`dev`/`qa`/`prd` now resolves to a new fail-closed `UNKNOWN` tier that the guard
treats as the most restrictive column (reads allowed; mutations, unit-test
execution, profiling blocked). Only an explicit `SAP_TIER=dev` (case-insensitive)
opens writes. `SAP_TIER` is hydrated from the env file and reconciled into the
guard cache after config load. The connectionless inspection-only shell keeps its
permissive `DEV` default (harmless — every tool call fails at connect time).
Touches `engine/src/lib/profile.ts` (`normalizeTier`) and
`engine/src/lib/readonlyGuard.ts`.

**Remaining (documented):** a `--mcp` service-key connection carries no env-file
tier source and keeps the DEV default — revisit before starting service-key
operation.

### GetSqlQuery table-extraction bypass

**Root cause:** `extractTablesFromSql` used `/\b(?:FROM|JOIN)\s+([A-Z0-9_/]+)/`,
which missed comma-separated tables (`FROM SAFE_TABLE, KNA1` extracted only
`SAFE_TABLE`, dropping the protected `KNA1`) and mis-parsed a comment between
`FROM` and the table (`FROM /*c*/ KNA1` extracted `/`) — protected tables slipped
past the row-extraction gate.

**Fix (server):** `engine/src/lib/policy/tableBlocklist.ts` — extraction now
(1) strips `/* … */` and `--` comments first, (2) parses comma-separated table
lists (skipping `AS`/bare aliases), (3) still scans every `FROM`/`JOIN`. Plus a
**fail-closed** guard: if a table source survives comment stripping (`FROM`/`JOIN`
present) but no table name can be parsed, `GetSqlQuery` is refused with guidance
to rewrite as a simple `FROM <table>`. Consumed by
`engine/src/handlers/system/readonly/handleGetSqlQuery.ts`.

### Regression tests

- `engine/src/__tests__/lib/readonlyGuard.test.ts` (+ `lib/profile.test.ts`,
  `lib/tableBlocklist.test.ts`)
- `engine/src/__tests__/unit/getSqlQueryGate.test.ts`

---

## §10 — Table pre-check must validate the new DDL (check-with-source) + handler blocks bad writes

**The `UpdateTable` sibling of §7, but the deficiency is deeper.** 4.13.12.

### Symptom

`UpdateTable` with a DDL error (live-measured on IDES/CS: a field typed by a
non-existent data element) returned `success: true` — the bad DDL was written
and the object went inactive, the real error appearing only buried in
`activation_warnings` (*"Pole BAD_FIELD: Typ komponenty nebo použitá doména není
aktivní nebo neexistuje"* / *"Nametab … nelze generovat"*). The pre-check never
caught it before the write PUT.

### Root cause — two layers

1. Same drop as §7: `handleUpdateTable` calls
   `client.getTable().check({ tableName, ddlCode }, 'inactive')`, but the vendored
   `AdtTable.check(config, status)` **silently dropped `config.ddlCode`**
   (`runTableCheckRun(conn, 'abapCheckRun', name, undefined, version)`), so the
   pre-check ran the *stored* version, not the new DDL.
2. Unlike `AdtStructure.check` (which parses the `/checkruns` response and throws
   on errors), `AdtTable.check` returns the **raw response without evaluating
   it** — the low-level `CheckTableLow` tool relies on that non-throwing contract
   and parses the result itself. So even with `ddlCode` forwarded, nothing in the
   high-level `UpdateTable` path evaluated the result: `handleUpdateTable`
   discarded the returned `checkResult` and set `checkNewCodePassed = true`
   unconditionally.

### Fix — client-package + server

- **Client-package** (`patch-package`, marked `[powerup 4.13.12]`):
  `structure/AdtStructure.js`'s sibling `table/AdtTable.js` `check()` now forwards
  `config.ddlCode` as the source to validate (`runTableCheckRun(conn,
  'abapCheckRun', name, config.ddlCode, version)`). This also revives the
  low-level `CheckTableLow` tool's documented `ddl_code` validation, which the
  same drop had silently defeated. Callers that pass no `ddlCode` (the post-unlock
  inactive check) keep the prior saved-version behavior (`undefined`). `check()`
  stays **non-throwing** — the `CheckTableLow` contract is unchanged.
- **Server** (`engine/src/handlers/table/high/handleUpdateTable.ts`): the pre-check
  step now parses the returned `checkResult` with `parseCheckRunResponse` and
  **throws to block the write** when the new DDL has real errors, surfacing the
  honest SAP detail *before* the write PUT — with the same DDIC tolerance
  (`inactive version does not exist` / `importing from database`) and non-empty
  status fallback as `checkStructure`. Because table's `check()` returns rather
  than throws, the block-decision lives in the handler (not the client wrapper),
  which is where it belongs given the `CheckTableLow` contract.

### Regression test

`engine/src/__tests__/unit/updateTableCheckSource.test.ts` — drives the real
`handleUpdateTable` over a fake connection that answers `/checkruns` differently
for source vs no-source: valid code → the pre-check carries the new DDL as base64
source and the update completes; real check error (stored version clean, new DDL
bad) → the exact SAP detail surfaced and **no** write PUT issued; `notProcessed`
→ an honest status-carrying error (never bare). Reverse-verified in **both**
layers: reverting the `ddlCode`-forward fails all three cases; neutralizing the
handler block-decision fails the real-error and notProcessed cases (the bad write
reaches the PUT).

### Live verification

On the 4.13.11 bundle `UpdateTable` with the bad DDL returned `success:true`
(error only in `activation_warnings`); on 4.13.12 it returns an error with *"New
code check failed: … doména není aktivní nebo neexistuje"* and leaves the table's
stored version untouched (read back = clean shell), and a corrected DDL
updates + activates cleanly (fresh session). **Observation (not a regression in
the fix):** immediately re-running `UpdateTable` on the *same* table in the *same*
connection after a blocked update returns ADT's per-session cached check result
(the stale error) until a fresh session; ADT caches `/checkruns` per
session/object, newly surfaced by the block. Out of scope to change.

**Branch-integration note:** a second machine fixed this same defect in
parallel (commit `0b304de7`) and additionally verified it live on a second
system (KR-DEV, logon language KO). That parallel commit put the block-decision
inside `AdtTable.check()` itself (client-package layer) rather than in the
handler — which would have changed the `CheckTableLow`/`CheckObjectLow`
low-tool contract to a thrown message string. That alternative was not carried
into the merged tree; the handler-side design above (`check()` stays
non-throwing, the `CheckTableLow` contract is unchanged) is what ships. See
`engine/CHANGELOG.md` `[4.13.16]` for the full reconciliation record.

---

## §11 — Create-payload logon-language remainder (the reachable non-DDLS builders)

**The mechanical extension of §5 to the other reachable create builders.** 4.13.12.

### Symptom / root cause

Same root as §5: the vendored create payloads hardcode `adtcore:language="EN"` /
`adtcore:masterLanguage="EN"`. §5 fixed only view/domain/data-element; class,
interface, program, package, table, structure, service definition and metadata
extension (DDLX) still hardcoded EN. Those creates *succeed* (SAP tolerates the
EN→logon-language normalization — confirmed live on the CS box: an EN-payload
class create reads its description back fine), but on systems that do not
tolerate it (the real-demand driver was a KO logon system) the description lands
in the EN text slot and reads back empty.

### Fix — server + client-package

Each reachable create handler resolves the language with `resolveLogonLanguage()`
(§5's `src/lib/adtLogonLanguage.ts`, EN fallback) and injects it into the create
call; the vendored builders stamp both `adtcore:language` and
`adtcore:masterLanguage` from it (`patch-package`, marked `[powerup 4.13.12]`).

- **Handlers** (`engine/src/handlers/<obj>/high/handleCreate*.ts`):
  `handleCreateClass`, `handleCreateInterface`, `handleCreateProgram`,
  `handleCreatePackage`, `handleCreateTable`, `handleCreateStructure`,
  `handleCreateServiceDefinition`, `handleCreateMetadataExtension` (DDLX).
- **Client-package**: the eight `*/create.js` builders emit both language
  attributes from a resolved `master_language`/`masterLanguage` (EN fallback);
  the `AdtClass`/`AdtInterface`/`AdtProgram`/`AdtPackage`/`AdtStructure`/`AdtTable`/
  `AdtServiceDefinition` wrappers forward `config.masterLanguage` to their builder
  (DDLX's `AdtMetadataExtension` already forwarded it — only its builder's
  hardcoded `adtcore:language="EN"` needed the substitution); the create-param and
  config typings gain `master_language?` / `masterLanguage?`.

### Deliberately not fixed

`accessControl` (DCL), `functionGroup`, `enhancement`, `tabletype` create
builders still hardcode EN. `accessControl`/`enhancement`/`tabletype` are
**unreachable from any handler** (no `Create*` tool routes to them — dead from the
engine's side, same judgment as the §3 dead-delete helpers), so they cannot be
live-verified; FUGR create is out of the named 11-⑫ scope (tolerates the
normalization). `resolveLogonLanguage` is the shared root if any is ever exposed.

### Regression test

`engine/src/__tests__/unit/createLogonLanguageFamily.test.ts` — drives all eight
real handlers over a fake connection whose systeminformation advertises CS and
pins `adtcore:language="CS"` / `adtcore:masterLanguage="CS"` on each create POST,
plus EN-fallback cases when systeminformation 404s (reverse-verified: reverting a
builder's `EN`→`${masterLanguage}` substitution or a handler's injection fails
that type's CS case while the EN-fallback case still passes).

### Live verification

All eight create handlers succeed on the CS box with the new bundle and their
descriptions read back via `SearchObject`. Note: because the CS box **tolerates**
the EN payload (create succeeds, description reads back for both bundles), a
red→green *description-slot* delta is not observable on this system for these
types — the reverse-verified family test is the authoritative proof that the
payload now carries the resolved language. The non-tolerant surfaces (DDLS,
DOMA/DTEL) were already live-proven in §5.

**Branch-integration note:** a second machine fixed this same defect in
parallel (commit `0b304de7`) and additionally verified all eight create
handlers live on a second, non-tolerant system (KR-DEV, logon language KO) —
see `engine/CHANGELOG.md` `[4.13.16]`.

---

## §12 — Real-data gate honesty: self-closing NULL cell drop/shift, row-count meta, sporadic-400 retry

**The two real-data gate tools (`GetSqlQuery`, `GetTableContents`) share one XML
parser; three defects, one Wave.** 4.13.13. Server-only (no client-package patch).

### Symptom

A `GetSqlQuery` / `GetTableContents` result silently mis-attributes NULL-cell
values. Live on an on-premise S/4HANA system, a read-only self-join of `T000`
that makes exactly one middle row's column non-NULL and the rest NULL:

```
SELECT a~mandt, b~mtext AS bmtext, a~mtext
FROM t000 AS a LEFT OUTER JOIN t000 AS b
  ON b~mandt = a~mandt AND a~mandt = '200'
ORDER BY a~mandt
```

returned `BMTEXT = "Ready-to-activate client"` on the **`MANDT=000`** row (which
must be NULL) and `NULL` on the `MANDT=200` row that actually owns that value —
confirmed by the unaffected `MTEXT` column of the same row. The single non-NULL
value had shifted up over the two leading NULLs. The response also carried only
`total_rows`, with no honest count of the rows actually returned.

### Root cause

Three independent defects in
`dist/handlers/system/readonly/handleGetSqlQuery.js` (`parseSqlQueryXml`, reused
by `dist/handlers/table/readonly/handleGetTableContents.js`):

1. **Self-closing cell drop + shift.** The per-column cell regex
   `/<dataPreview:data[^>]*>(.*?)<\/dataPreview:data>/g` requires a closing tag.
   SAP emits a nil / NULL cell as self-closing `<dataPreview:data/>`, which the
   pattern skips; it then spans forward to the *next* cell's `</dataPreview:data>`,
   swallowing that value into one match. The column array comes up short and every
   following row in that column shifts up. Both real-data gate tools call the same
   function, so both are affected.
2. **Self-contradicting meta.** The response carried only `total_rows`
   (server-reported), never the count of rows actually parsed, so a truncated or
   mis-parsed result looked complete.
3. **Sporadic HTTP 400 on complex queries.** The handler issued the Data Preview
   POST once and threw immediately; multi-way joins / long IN lists and concurrent
   calls draw a transient 400 that succeeds on an immediate re-run.

### Fix — server only

`engine/src/handlers/system/readonly/handleGetSqlQuery.ts`:

1. The cell regex becomes an alternation that matches the self-closing form first
   and captures the paired form's body, walked with `matchAll` so cell position is
   preserved:
   `/<dataPreview:data(?:\s[^>]*?)?\/>|<dataPreview:data(?:\s[^>]*?)?>([\s\S]*?)<\/dataPreview:data>/g`.
   A self-closing or empty cell → `null`; any other body (including a blank `" "`
   CHAR value) is kept verbatim, so a nil NULL is distinguished from an empty
   string. When columns still come out unequal (a genuinely ragged response the
   parser cannot align) the per-column shape is surfaced as a new `ragged_columns`
   field and logged, instead of silently shifting rows.
2. The response adds `returned_row_count` (rows actually parsed), `server_total_rows`
   (server total when the XML provides it) and `truncated` (`returned >= row_number`
   or `server_total > returned`). `GetTableContents` inherits all of this through
   the shared parser.
3. The handler wraps the Data Preview call in a retry-once helper: a first-attempt
   HTTP 400 (`isHttp400` — matches `err.response?.status === 400`) is retried
   exactly once; any other error, or a second 400, propagates unchanged. The tool
   description documents the 400 constraint and the alias-shortening / BETWEEN
   work-arounds.

### Regression test

`engine/src/__tests__/handleGetSqlQuery.test.ts` — offline XML fixtures pin: the
self-closing shift (a NULL keeps its row; the value stays on its own row),
nil-vs-blank-CHAR distinction, the all-NULL column, the ragged-column warning
(present when genuinely unaligned, absent when self-closing cells realign), the
three meta fields across three truncation cases, and the 400 retry
(retry-then-succeed / give-up-after-one-retry / no-retry-on-500) driving the real
handler over a fake connection. It also drives the real `handleGetTableContents`
to prove the shared parser fix flows through. Reverse-verified: reverting only the
cell regex fails exactly the four alignment cases while the meta / retry cases stay
green.

### Live verification

Same read-only `T000` self-join, same on-premise system. On 4.13.12 the value
shifted onto the `MANDT=000` row and no row-count meta was present; on 4.13.13
`BMTEXT` is `NULL` for 000/100/400/500 and `"Ready-to-activate client"` on the
`MANDT=200` row (matching its `MTEXT`), with `returned_row_count=5`,
`server_total_rows=5`, `truncated=false`. Read-only throughout; no write issued.

---

## §13 — CreateStructure generates real fields (false success removed)

**`CreateStructure` discarded its required `fields` input and created an empty
shell, then reported success.** 4.13.14. Server-only (no client-package patch).
Backlog 5-13 layer 1 Wave 2, items 3 + 11-①.

### Symptom

`CreateStructure` takes `fields` as a required parameter, but the handler passed
`create({ ddlCode: '' })` — an empty structure shell — and dropped the fields
entirely (the handler even carried a comment: "field/include DDL generation is
not yet implemented"). It then returned `{ success: true, activated: true }`.
Live on IDES (S/4HANA, logon CS) on 4.13.13: creating `ZSAH_S_5713R` with fields
`ID CHAR(10)` + `AMOUNT DEC(15,2)` reported success, but a read-back showed only
a placeholder `component_to_be_changed : abap.string(0)` — **neither field was
present**. A false success: the tool said the structure was built when it was an
empty shell.

### Root cause

The ADT structure-create endpoint only produces a shell; the field DDL must be
applied by a subsequent source write, which was never implemented. The `fields`
input was validated for presence and then thrown away.

### Fix — server only

A new pure builder `engine/src/lib/structureDdl.ts` (`generateStructureDdl`)
turns the field/include spec into DDIC `define structure` DDL. The header always
emits `@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE` (item 11-①; a DDIC
structure is rejected without it — the same annotation §7's check-with-source
surfaces as the real error when missing). Built-in types resolve to
`abap.<type>` with length/decimals where the kind requires them; a `data_element`
resolves to the element name; `CURR`/`QUAN` optionally emit
`@Semantics.amount.currencyCode` / `@Semantics.quantity.unitOfMeasure`. The
builder throws on an **incomplete spec** — a length-bearing built-in with no
length, an unsupported/unresolved `data_type`, a field with neither
`data_element` nor a built-in `data_type`, an include carrying a suffix, or no
fields/includes at all.

`engine/src/handlers/structure/high/handleCreateStructure.ts` now generates the
DDL **before any object is created** (an incomplete spec fails here with nothing
on the wire — no half-built shell to clean up), then applies it: create the
shell → check-with-source on the generated DDL (§7's `AdtStructure.check`
ddlCode-forward) → lock → `update({ ddlCode }, { lockHandle })` → unlock → check
inactive → activate. The write is pinned stateful right after the lock (§1 class:
IDES recycles the connection, so a stateless PUT would evaporate the lock) —
this supersedes the 4.13.9 "dead lock/unlock pair" removal (§4): the lock now
brackets a real write. The 4.13.12 logon-language stamping on the shell create is
preserved. Two additive `fields[]` params (`currency_reference`,
`unit_reference`) and a `fields_applied` count in the response are new; no tool
added/removed.

### Regression tests

`engine/src/__tests__/structureDdl.test.ts` (15 cases) pins the field/include
rendering, the always-present enhancement.category, and every incomplete-spec
throw. `engine/src/__tests__/handleCreateStructure.test.ts` drives the real
handler over a fake connection and pins: the generated DDL (with the field lines
and enhancement.category) is transmitted as the check-with-source base64 body;
the lock brackets exactly one source PUT (lock < PUT < unlock); an incomplete
spec fails with **zero** requests on the wire. Reverse-verified: removing the
enhancement.category push, the incomplete-spec throw, or the ddlCode passed to
the check each fails the matching cases. (The obsolete `createStructureNoDeadLock`
test — which asserted the lock/unlock pair was absent — is superseded, since the
lock now legitimately brackets the field write.)

### Live verification

IDES $TMP, red→green. 4.13.13 created `ZSAH_S_5713R` reporting success but read
back as the empty `component_to_be_changed` placeholder. 4.13.14 created
`ZSAH_S_5713G` with `ID CHAR(10)` + `AMOUNT DEC(15,2)` + `CREATED_ON DATS` and
read back with all three fields present and `@AbapCatalog.enhancement.category`
in the header. Both objects deleted and read-back-confirmed gone (404); no orphan
lock.

---

## §14 — Function-module read honesty: inactive-edit-loss warning + descriptions

**Reading `version='active'` returns the pre-edit source when an unactivated edit
exists, silently masking a pending edit; and several FM/activation descriptions
lacked load-bearing cautions.** 4.13.14. Server-only. Backlog 5-13 layer 1 Wave 3,
items 2 / 4 / 5 / 6.

### Symptom (item 2)

`GetFunctionModule` / `ReadFunctionModule` default to `version='active'`. When an
unactivated inactive version exists, the active read returns the *old* source; a
caller that re-edits on top of it silently destroys the pending edit, and no gate
catches it.

### Fix — server only

Both handlers gain a `check_inactive` parameter: when reading active, they also
read the inactive version and, if it exists and its source **differs**, attach a
`warning` to the response. The extra read is wrapped so it never fails or slows
the main read (a missing inactive version is swallowed). `GetFunctionModule`
defaults it **on** (interactive single reads); `ReadFunctionModule` defaults it
**off** (opt-in — it is the bulk-read surface and the per-FM extra call would be
costly). Description cautions added (items 4/5/6, description-only): the FM read
descriptions state that a returned 'active' source is **not** proof of successful
activation (item 6); `ActivateObjects` documents the FUGR recipe — activate the
function group + its TOP include (FUGR/I) + every FM (FUGR/FF) + the SAPL<group>
main program in ONE run, never include the system include L<group>UXX, never mix
unrelated objects (item 4); `UpdateFunctionModule` states the write persists as
the inactive version even when the post-write check fails and that check errors
can originate from pre-existing defects in sibling FMs of the same group (item 5).

### Regression tests

`engine/src/__tests__/handleGetFunctionModule.test.ts` (6) and
`handleReadFunctionModule.test.ts` (4) drive the real handlers over a fake
connection serving active vs inactive source by `?version=`: differs → warning;
identical → none; Get default reads inactive, Read default does not; a failing
inactive read never breaks the main read; the activation-evidence caution is
pinned in the description. `handleActivateObjects.test.ts` (3) and
`handleUpdateFunctionModule.test.ts` (2) pin the FUGR-recipe and sibling-persist
description text. Reverse-verified: suppressing the warning assignment fails the
Get "differs → warning" case.

### Live verification

item 2's live repro requires provisioning a function group + FM and staging a
divergent inactive version (an FM edited but not activated) — heavier than a
$TMP structure and disproportionate to the deterministic jest + reverse-verify
coverage above, so it was judged on the jest evidence (per the Wave's explicit
allowance). items 4/5/6 are description-only.

---

## §15 — Local-include Delete family + low unit-test schema cleanup (4.13.15)

Two fixes: a client-package repair that makes the four `DeleteLocal*` tools work
at all (backlog 11-⑩ — was Known-remaining #1), and a server-side schema cleanup
that drops four no-op params the §8 switch orphaned (was Known-remaining #6).

### Symptom

`DeleteLocalTypes` / `DeleteLocalDefinitions` / `DeleteLocalMacros` /
`DeleteLocalTestClass` fail on **every** call, before any request reaches the
wire, with `Failed to delete … : … code is required`. Live-reproduced on IDES
(S/4HANA 2021, logon CS) on the 4.13.14 bundle against a `$TMP` class with all
four includes populated: all four tools returned that error.

### Root cause

The four vendored high-level clients implement `delete()` as
"delete by updating with empty code":
`return this.update({ ...config, <kind>Code: '' })`. But `update()`'s first
statement is `if (!config.<kind>Code) throw new Error('… code is required')`, and
`''` is falsy — the guard throws **before** the lock, so the include-clearing PUT
is never issued. A second falsy guard, `if (!includeSource)` /
`if (!testClassSource)` in the low-level `updateClassInclude` /
`updateClassTestInclude`, backstops the same failure one layer down.

### Fix — client-package (delete family)

Option A: give delete its own path instead of borrowing update's. In
`patch-package` (`patches/@babamba2+mcp-abap-adt-clients+3.13.1.patch`, marked
`[powerup 4.13.15]`):

1. `class/includes.js` — new `clearClassInclude(connection, className,
   includeType, lockHandle, transportRequest, sourceContentType)`: the same PUT
   as `updateClassInclude` but **without** the `if (!includeSource)` guard,
   sending an effectively-empty body (`EMPTY_INCLUDE_SOURCE = ' '`, a single
   space). Handles `implementations` / `definitions` / `macros`.
2. `class/testclasses.js` — new `clearClassTestInclude(connection, className,
   lockHandle, transportRequest, sourceContentType)`, the testclasses-endpoint
   twin (`EMPTY_TESTCLASS_SOURCE = ' '`).
3. `class/AdtLocalTypes.js` / `AdtLocalDefinitions.js` / `AdtLocalMacros.js` /
   `AdtLocalTestClass.js` — each `delete()` now runs its own chain: `lock →
   setSessionType('stateful')` (the §1 4.13.7 pin — IDES recycles the connection
   between requests, so a stateless PUT after the lock evaporates the ENQUEUE
   lock) `→ clear PUT → unlock`, with unlock-on-error cleanup, calling the new
   low-level clear function with the right include type.

The common `if (!code)` guards on `update()` **and** the `if (!includeSource)` /
`if (!testClassSource)` guards on the update helpers are deliberately left
intact — a normal `Update*` with empty code must still be rejected. Relaxing the
shared guard was rejected: it would let an accidental empty-code Update silently
wipe a populated include (blast radius). The clear path is delete-only.

### Fix — server (low unit-test schema)

§8 (4.13.11) moved `RunClassUnitTestsLow` / `GetClassUnitTestStatusLow` /
`GetClassUnitTestResultLow` onto the classic `/testruns` bridge, which left four
`inputSchema` params the handlers' destructuring never reads: `title` +
`context` on the run tool, `with_long_polling` on the status tool,
`with_navigation_uris` on the result tool. Removed from the three schemas
(handler logic untouched). The consumed params stay — `scope` / `risk_level` /
`duration` feed the `abapUnitClassic` options block, `format` is honoured by the
result reader.

### Clear-payload probe (live, required before the repair)

The clear payload is not empty string. On IDES `$TMP`, a **single space** PUT to
`/sap/bc/adt/oo/classes/<c>/includes/{implementations,testclasses}` is accepted
by S/4HANA and normalised to an **empty** include — the inactive read-back
returned `""` on both endpoints. A literal `''` re-trips the falsy guards, so the
clear functions send a single space. Judged by read-back, never by error absence
(§3 discipline).

### Regression tests

- `src/__tests__/unit/deleteLocalIncludesFamily.test.ts` drives all four real
  delete handlers over a fake `IAbapConnection` (the §1
  `vendoredClientLockChainStatefulSession` pattern) and pins, per family member:
  the chain succeeds, a stateful LOCK precedes the clear PUT to `/includes/<type>`,
  every request from lock through the write is stateful (the 4.13.7 pin), the
  write body is the single space, and an UNLOCK follows. **Reverse-verified by
  reversing the `patch-package` patch**: with `delete()` back on `update('')` all
  four cases FAIL (guard throws, no PUT); re-applying restores green.
- `src/__tests__/unit/lowUnitTestSchemaShape.test.ts` asserts the four removed
  keys are absent from the three `inputSchema.properties` and the consumed params
  are still present (reverse-verified — re-adding a key fails it).

### Live verification

On the 4.13.14 bundle all four Delete tools failed "…code is required"; on the
freshly-bundled 4.13.15 (spawned via the plugin launch path, live connection
confirmed by `GetSystemInfo`) all four returned success and the inactive
read-back confirmed each populated include (`local types` / `definitions` /
`macros` / `test class`) emptied to `""`. The `$TMP` probe class was deleted and
read-back-confirmed gone (404); no orphan lock. Tool count unchanged (155) — the
schema change removes properties, not tools.

---

## §16 — ActivateObjects false-failure: a clean run reported as all-objects-failed (4.13.17)

Server-only, one file. A recurrence of the lessons-pack layer1 #6/#11 principle
("a success flag is not proof; re-query to confirm") — here in its *inverse*
form: the **absence** of a success flag was treated as proof of failure.

### Symptom

Dogfooding finding (ZUNIWTH project, S/4HANA 2021). Activating a
program-with-screens object family via the mass endpoint
(`/sap/bc/adt/activation/runs`) returned a self-contradictory result:
`success:false, activated:false, failed_count:7` next to
`errors:[], warnings:[], generationExecuted="true"`, message "0 error(s)". The
oracle (`GetInactiveObjects` → 0 of the seven objects present) confirmed all
seven were in fact active. So the run succeeded but every object was reported
`failed`.

Note: the old observation that MCP activation *hangs* on screen-bearing programs
did **not** reproduce on the current engine — activation completed normally; the
only remaining defect was this reporting bug.

### Root cause

`parseActivationResults` (`src/lib/localGroupActivation.ts`) derived per-object
status as `errs.length === 0 && activated`, where `activated` comes **solely**
from the group `activationExecuted` attribute
(`props['@_activationExecuted'] === 'true'`). This run's `/results/{id}` body
carried `generationExecuted="true"` (parsed correctly — the caller saw
`generated:true`) but **no** `activationExecuted="true"`, and zero error
messages. So `activated` was false, and every object fell to the `failed`
default. The run-level `success` (`parsed.activated && errors.length === 0`, on
both the `runs` and `sync` return paths) collapsed for the same reason.

### Fix — server (parser + description)

Per-object `failed` now requires an actual activation error. The group flag is
not a reliable per-object gate: generation is downstream of activation, so
`generationExecuted="true"` implies activation ran. A `runExecuted =
activated || generated` local now gates per-object status, and run-level
`success` becomes `(activated || generated) && errors.length === 0` on both
return paths. An object with ≥1 attributed error message still fails
(unchanged). The `ActivateObjects` tool description gains the #6/#11 guardrail in
band: the success/activated flags are not proof — confirm by re-querying
`GetInactiveObjects`.

### Regression test

`src/__tests__/unit/localGroupActivation.test.ts` gains a case: a results body
with `generationExecuted="true"`, no `activationExecuted`, zero errors → every
object `activated` (while `result.activated`, the raw flag, stays `false`).
**Reverse-verified** by reverting the gate to `activated`-only: the new case
FAILS with the exact `failed` symptom ("Expected activated, Received failed");
restoring makes it green. The prior "survives empty input" contract
(`<chkl:messages/>`, no flags → all `failed`) is preserved — `runExecuted` is
false there. Full suite 656 passed / 5 skipped.

### Verification boundary (why this is not marked live-verified)

The fix is derived from the reported *parsed output* — which pins that the real
results XML omitted `activationExecuted` — and is jest reverse-verified, but it
was **not** replayed live against the exact ZUNIWTH family, and the raw
`/results/{id}` XML was not captured (the handler summary does not surface
`raw_response`). Two follow-ups are recorded in Known-remaining #10/#11 below:
a live red→green replay, and the fuller remedy of embedding the
`GetInactiveObjects` oracle re-query inside the handler so activation is
confirmed by server state rather than by any response flag.

---

## §17 — ActivateObjects oracle re-query + CheckSyntax no-inactive fallback (4.13.18)

Two ZUNIWTH-dogfooding follow-ups, both live-reproduced on DEV/700, both
server-only. §17-A completes the #6/#11 remedy that §16 began (#11); §17-B is a
separate CheckSyntax false-positive (#12). §16's live replay (#10) is closed
here: on DEV/700, re-activating the `ZUNIWR2030` family (main + 6 includes) on
the 4.13.17 bundle returned `success:true` / all `activated` where the pre-fix
bundle false-failed — and the oracle (`GetInactiveObjects` → our objects absent)
confirmed real activation.

### §17-A — ActivateObjects server-state oracle (#11)

`activateObjectsLocal` now re-queries the inactive worklist after the run and
overrides the flag-based verdict with server state: any object reported
`activated` that is still in the worklist is downgraded to `failed` and
`success` flips to false. Uses `createAdtClient(connection).getUtils()
.getInactiveObjects()` (the `GetInactiveObjects` path). Best-effort — a failed
probe is swallowed. Match key = uppercased **name + base type** (the worklist's
`{type,name}` subtype does not always equal the input's — live-measured: input
`PROG/I` vs worklist `PROG/P`/`TABL/DS`/`DDLS/DF`; name is the stable key).
Four jest cases pin it (downgrade+success-false, name/base-type match across
differing subtype+casing, unrelated-object ignored, failing-probe swallowed);
reverse-verified by neutering the oracle. **Live replay still open — #11.**

### §17-B — CheckSyntax no-inactive fallback (#12)

`runSyntaxCheck` program/no-source now wraps the vendored `getProgram().check(
{...},'inactive')`: on the `isReportMissingNoiseText` signature it falls back to
the noise-aware `runProgramTreeCheck` (validates the real active source, returns
a normal result); `isAlreadyChecked` is re-thrown for the outer catch; other
errors propagate. This fixes both the false positive on a fully-active program
with no inactive version *and* the contract-breaking `-32603` tool-error leak.
The try only intercepts the throw, so the happy path is unchanged.
`isReportMissingNoiseText` is exported and pinned against the exact live message.
**Live-replayed on DEV/700 (`ZUNIWR2030`): the `-32603`→normal-result conversion
is green, but it exposed a residual content false-positive (see §18).**

### §18 — CheckSyntax active-source fallback actually reads the active source (4.13.19, #12 residual)

§17-B's fallback (`runProgramTreeCheck`) issues its `/checkruns` with
`chkrun:version="inactive"` — correct for its `programTree`/`screen` post-write
callers, but for a fully-active program with **no inactive version** it re-checks
the absent inactive version and re-hits the same REPORT-missing noise. Live on
DEV/700 the `-32603` leak was gone (§17-B green) yet `ZUNIWR2030`'s result still
carried the false `"REPORT/PROGRAM statement is missing"` E with `success:false`,
so §17-B's "validates the real active source" was never actually met (the unit
test's empty fake-`/checkruns` body masked it). `runSyntaxCheck`'s program/
no-source noise branch now calls `runActiveProgramSourceCheck`: read the active
source (`getProgram().read({...},'active')`) and validate it via the
source-bearing `runInlineArtifactCheck` (`version="active"`, real source embedded
— honest per layer1 #7); `downgradeReportMissingNoise` strips any residual noise
(mirrors `assertNoCheckErrors`, real errors preserved); an unreadable active
source returns a clean `EMPTY_RESULT`. `runProgramTreeCheck` is untouched (its
`inactive` callers unchanged); the pre-existing, never-wired `perIncludeSweep`
stays dead code (flagged, not removed). The rewritten
`checkSyntaxNoInactiveFallback.test.ts` (13 cases) reproduces the live scenario
by setting the fake `/checkruns` body per test. A fresh-context review returned
SHIP-WITH-NITS: the MINOR nit (`downgradeReportMissingNoise` recomputing
`success` from `errors.length` alone, dropping the parser's status gate) was
fixed before commit — the recompute is now status-aware and pinned by a test.
**Disclosed follow-up:** when the active source cannot be read, the fallback
returns a bare `success:true` (`EMPTY_RESULT`) that a caller cannot distinguish
from a verified-clean program — a transient read failure is thus reported as a
passing check. Narrow (the inactive check just responded, so the connection is
live) and logged (`logger.warn`), but a future pass should surface an
"inconclusive / active source unread" note through `handleCheckSyntax` (the
handler currently only echoes `success`/`errors`/`warnings`/`note`).
**Live replay against `ZUNIWR2030` still open — #12.**

---

## Known-remaining defects (still present upstream)

Confirmed against the reference `HANDOFF.md` §6 backlog. These are **not** fixed
in the reference implementation and remain in the original sources. Where a fix
was only reasoned (not live-staged) it is flagged **code-review-verified only**.

1. **~~Local Delete family always fails at the client level (backlog 11-⑩).~~
   RESOLVED in 4.13.15 — see §15.**
   `AdtLocalTestClass` / `AdtLocalTypes` / `AdtLocalMacros` /
   `AdtLocalDefinitions` `.delete()` were implemented as `update(code: '')`, but
   every `update()` rejects empty code with "… code is required" **before**
   locking — so `DeleteLocalTestClass` / `DeleteLocalTypes` / `DeleteLocalMacros`
   / `DeleteLocalDefinitions` could never succeed. Separate defect class from §1
   (not a lock-session leak). Fixed by the §15 dedicated clear path (live
   red→green). Still open (Create-side gap): a class has no `CreateLocalTestClass`
   / `CreateLocalTypes` / … tool — an include is first populated through the
   corresponding `Update*` tool; adding dedicated create tools is a feature
   extension, recorded as a candidate only.

2. **~~`CreateProgramLow` shares the §4 substitution root.~~ RESOLVED in
   4.13.15 — see §4.** The low-level tool called the same type-ignoring vendored
   `create()` directly with no guard and no schema enum, so
   `CreateProgramLow(program_type:'function_group')` created a `PROG/P` shell and
   reported success (live-reproduced on IDES `$TMP`). Fixed by mirroring the §4
   high-level guard into the low handler (`SUPPORTED_PROGRAM_TYPES` +
   `DEDICATED_TOOL_FOR_PROGRAM_TYPE` + pre-create reject) and adding the same
   `enum:['executable','module_pool']` to the low `program_type` schema; the
   low-specific `session_id`/`session_state`/`skip_check` contract is unchanged.

3. **Un-reached full-chain stateless leaks in the client wrappers.** The other
   object wrappers' full-chain `update()` paths without a `lockHandle`
   (`AdtClass.update()`, view/table/domain/etc.) share the §1 defect but are
   currently unreachable from every handler (all pass a lockHandle since 4.13.5),
   so they were left unpatched. **Upstream-fix candidates** — a consumer that
   calls those wrappers without a lockHandle would hit the bug. *Code-review-
   verified only.*

4. **RFC-backed write handlers, separate pathology (backlog 11-⑦).**
   `UpdateTextElement` / `UpdateScreen` / `UpdateGuiStatus` and
   `CreateTextElement` do an ADT lock with no stateful pin **plus** an RFC
   textpool/screen write — not a lock-handle-validated ADT PUT, so §1 does not
   apply. Observed only; grouped with the RFC-backend issues. Not fixed.

5. **add-if-missing description not serialized back on GET (observation).**
   After §5's add-if-missing repair, the injected `adtcore:description` is not
   echoed in the object's GET XML (suspected SAP-side text-row placement). The
   object is functionally complete; a deeper diagnosis needs a `DD01T` real-data
   query and was deferred. Observation only, no defect claimed.

6. **~~Low unit-test schema still advertises 4 cloud-only no-op parameters~~
   RESOLVED in 4.13.15 — see §15.** The harmless leftover after §8 (`title` /
   `context` / `with_long_polling` / `with_navigation_uris`) is removed from the
   three low-tool schemas; the consumed params are kept.

7. **`accessControl` (DCL) / `functionGroup` / `enhancement` / `tabletype`
   create payloads still hardcode EN (after §11).** `accessControl` /
   `enhancement` / `tabletype` are unreachable from any handler (dead from the
   engine's side); `functionGroup` create is reachable but out of the named 11-⑫
   scope (tolerates the normalization, green since 4.13.1). Plug them into
   `resolveLogonLanguage` (§5/§11) if any is ever exposed or proves affected on a
   non-tolerant system.

8. **ADT caches `/checkruns` per session/object (observation, surfaced by §10).**
   After a `UpdateTable` blocked by the §10 pre-check, an immediate same-session
   retry of the same table returns the cached (stale) check result until a fresh
   session. Pre-existing ADT behavior, harmless in normal use; not a defect in the
   fix.

9. **`DeleteStructure` reports success from the deletion-result parse, not a
   read-back (backlog 5-13 layer 1 Wave 3, item 11-② — investigated, deliberately
   not repaired).** The concern was whether the unlocked deletion-framework POST
   can return a no-op 2xx (object survives) that the 4.13.9 `assertDeletionSucceeded`
   parse (`del:isDeleted`) reports as success. Live on IDES: deleting an unlocked
   `$TMP` structure via `assertDeletionSucceeded` reported success **and** a
   read-back confirmed 404 (genuinely gone) — the no-op pathology did **not**
   reproduce, and `assertDeletionSucceeded` already throws on `isDeleted != "true"`
   (the locked/refused case, §3). Reproducing a genuine no-op (2xx claiming
   deletion while the object survives) needs an unusual server state; per the
   Wave's "no over-repair unless the pathology is demonstrated" instruction, the
   handler was left unchanged. Hardening candidate: sc4sap-custom v4.14.0 promotes
   `DeleteStructure` to an explicit lock → `DELETE(lockHandle)` → read-back-404
   flow (verifying by absence, not by a non-error) — adopt it if a no-op case is
   ever observed.

10. **~~`ActivateObjects` false-failure fix awaits a live red→green replay
    (§16, 4.13.17).~~ CLOSED live (ZUNIWTH dogfooding, 2026-07-24).** On DEV/700,
    re-activating the `ZUNIWR2030` family (main + 6 includes) on the 4.13.17
    bundle returned `success:true` / all `activated` — the exact false-failure
    scenario (`activated:false` + `generated:true`) now judged correctly — and
    the oracle (`GetInactiveObjects` → our objects absent) confirmed real
    activation. The pre-fix bundle false-failed the same family. Live-verified.

11. **~~`ActivateObjects` still trusts a response flag rather than server
    state.~~ RESOLVED in 4.13.18 — see §17-A. CLOSED live (ZUNIWTH dogfooding,
    2026-07-24, DEV/700).** `activateObjectsLocal` best-effort re-queries the
    inactive worklist after the run and overrides the flag verdict with server
    state (match by name + base type; failing probe swallowed). Live-verified
    both paths: **(A)** re-activating the `ZUNIWR2030` family (main + 6 includes)
    → `success:true` / all `activated` / oracle 0 inactive — no false downgrade;
    **(B)** injecting a `period missing` error into the smallest sibling include
    `ZUNIWI2030S` → activation `success:false` / `failed_count:7`, the real error
    attributed to `ZUNIWI2030S`, and `GetInactiveObjects` shows exactly that one
    object inactive — the oracle's server-state downgrade fired correctly. The
    injection was fully reverted (original 8-line include re-uploaded + activated
    → worklist back to the 6-object baseline, `ZUNIWI2030S` gone).

12. **`CheckSyntax` no-source false-fails a fully-active program — tool-error
    leak CLOSED live (4.13.18/§17-B), content false-positive RESOLVED in
    4.13.19/§18 (live replay pending).** 4.13.18 stopped the `-32603` tool-error
    leak (the program/no-source branch catches the `isReportMissingNoiseText`
    throw and returns a normal result) — **live-confirmed green on DEV/700
    (`ZUNIWR2030`)**. But that live replay exposed a residual: the fallback it
    chose (`runProgramTreeCheck`, `version="inactive"`) re-checked the still-absent
    inactive version and re-hit the same noise, so the result still carried a
    false `"REPORT/PROGRAM statement is missing"` E with `success:false` on a
    program that starts with a valid `REPORT`. 4.13.19 (§18) replaces that with
    `runActiveProgramSourceCheck` — read the **active** source and validate it via
    the honest inline path (`version="active"`), plus a `downgradeReportMissingNoise`
    safety net. Unit-pinned (12 cases); **only the live red→green replay of the
    4.13.19 fallback remains** (`ZUNIWR2030` → clean; a deliberately-broken active
    program → real errors with line numbers). (`class`/`interface` no-source use
    `getX().check(...,'inactive')` too but do not carry the REPORT/INCLUDE noise;
    left unchanged unless a live case shows otherwise.)

---

## Applying and verifying

### Extract exact diffs from the reference

```bash
git clone https://github.com/hjaewon/sap-agentic-harness.git
cd sap-agentic-harness/engine

# Server-side fixes for one release (e.g. the §3/§4 release):
git show 4247dd89 -- 'src/**'

# All client-package hunks (they translate to the client repo's src/):
sed -n '1,$p' patches/@babamba2+mcp-abap-adt-clients+3.13.1.patch
```

The `3.13.1.patch` hunks are grouped by `[powerup 4.13.N]` markers: `4.13.7` =
§1 wrapper pins, `4.13.9` = §3 deletion honesty, `4.13.10` = §5 language +
add-if-missing, `4.13.11` = §7 structure check, `4.13.12` = §10 table
check-with-source + §11 create-payload language remainder (8 builders + wrappers
+ typings). When porting to the client package's own repo, apply the equivalent
edit in its TypeScript `src/core/**` / `src/utils/**` (the patch targets the
compiled `dist/`).

### Run the regression suites

```bash
cd engine
npm ci            # re-applies patch-package via the prepare hook
npm test          # jest unit suites — reference passes 572/0 at 4.13.10, 580/0 at 4.13.11, 599/0 at 4.13.12, 611/5skip at 4.13.13, 643/5skip at 4.13.14, 655/5skip at 4.13.15
```

Focused run of just the fix suites:

```bash
npx jest updateClassStatefulSession updateInterfaceStatefulSession \
  updateProgramStatefulSession updateHandlersStatefulSessionFamily \
  createHandlersStatefulSessionFamily vendoredClientLockChainStatefulSession \
  updateFunctionGroupContentTypeNegotiation deletionResultHonesty \
  createProgramTypeGuard structureDdl handleCreateStructure \
  createLogonLanguageConsistency createViewErrorBody \
  isAlreadyExistsErrorMachineId updateStructureCheckSource \
  updateTableCheckSource createLogonLanguageFamily \
  handleGetFunctionModule handleReadFunctionModule \
  unitTestClassicLowCds getSqlQueryGate readonlyGuard \
  deleteLocalIncludesFamily lowUnitTestSchemaShape
```

Every suite is reverse-verified in the reference (revert the fix → the pinned
assertions fail), so a clean run against the *unpatched* upstream tree should
show those suites **red** first, then green after applying the fixes — the fastest
confirmation you reproduced the repair correctly.

### Live confirmation (optional, needs a SAP connection)

Reproduce the §1/§5/§7 cases on a **connection-recycling on-prem system whose
logon language is not EN** — that combination is what surfaced most of these.
Confirm by the object actually landing (read it back), never by a non-error alone
— §3 exists precisely because "no error" was a lie.
