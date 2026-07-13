# Upstream fix hand-off: `abap-mcp-adt-powerup` server + `mcp-abap-adt-clients` client, releases 4.13.2 – 4.13.12

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
| 4.13.12 | (this release) | Table check-with-source + parse/throw (§7) + create logon-language for 8 more paths (§5) |

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
  the create POST (reverse-verified).
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

The 4.13.10 release resolved/injected the language on the three live-proven
create paths (view/domain/dataElement). **4.13.12 extended the same
`resolveLogonLanguage` infrastructure to the eight remaining create handlers**
(HANDOFF §6 backlog 11-⑫): `handleCreateClass`, `handleCreateInterface`,
`handleCreateProgram`, `handleCreatePackage`, `handleCreateTable`,
`handleCreateStructure`, `handleCreateServiceDefinition` (SRVD),
`handleCreateMetadataExtension` (DDLX) each now resolve the logon language and
pass `masterLanguage` into the create config, and the vendored `class`,
`interface`, `program`, `package`, `table`, `structure`, `serviceDefinition`,
`metadataExtension` `create.js` builders emit it (their `Adt<Obj>` wrappers
forward `master_language: config.masterLanguage`; DDLX already forwarded
`masterLanguage` and only needed its `language="EN"` un-hardcoded). Types add
`master_language?` (create params) + `masterLanguage?` (config). These creates
did not *fail* on a non-EN system (the DDLS hard-reject is view-specific) but
stored the description in the EN row so it showed empty under a non-EN logon —
real demand was a fork bundle hand-edited in 19 places to force KO. Verified
live on KR-DEV (logon language KO): the create POST carries the resolved language
and the create succeeds (payload accepted, no rejection). **`DCL` /
`accessControl` create is deliberately NOT extended** — no handler routes to it
(unreachable dead code, same precedent as `tabletype`/`enhancement` in §3);
`functionGroup/create.js` is outside the named 11-⑫ scope (FUGR-create verified
green in 4.13.1). Both keep EN. The low-level `Create*Low` / compact paths call
the same patched builders but do not resolve the language themselves — without a
caller-supplied `master_language` they keep the EN default (unchanged semantics).

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

## Known-remaining defects (still present upstream)

Confirmed against the reference `HANDOFF.md` §6 backlog. These are **not** fixed
in the reference implementation and remain in the original sources. Where a fix
was only reasoned (not live-staged) it is flagged **code-review-verified only**.

1. **Local Delete family always fails at the client level (backlog 11-⑩).**
   `AdtLocalTestClass` / `AdtLocalTypes` / `AdtLocalMacros` /
   `AdtLocalDefinitions` `.delete()` are implemented as `update(code: '')`, but
   every `update()` rejects empty code with "… code is required" **before**
   locking — so `DeleteLocalTestClass` / `DeleteLocalTypes` / `DeleteLocalMacros`
   / `DeleteLocalDefinitions` can never succeed. Separate defect class from §1
   (not a lock-session leak). *Code-review-verified only* (found during the
   4.13.7 audit; no live repro staged). Related: a class with no testclasses
   include cannot be updated (the include-create ADT POST is unsupported) — bundle
   with the missing Create-side tool.

   *(The former item 2 — `AdtTable.check` drops `ddlCode`, backlog 11-⑪ — was
   fixed in 4.13.12; see §7. `CreateTableLow` and the compact table-create path
   still hardcode EN, mirroring the `Create*Low` note under §5.)*

2. **`CreateProgramLow` shares the §4 substitution root.** The low-level tool
   calls the same type-ignoring vendored `create()` directly and was left
   untouched to keep the §4 fix minimal to the named high-level tool (low-level
   caller contract differs — separate judgment).

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

6. **Low unit-test schema still advertises 4 cloud-only no-op parameters**
   (harmless leftover after §8) — a follow-up cleanup candidate, not a fault.

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
add-if-missing, `4.13.11` = §7 structure check, `4.13.12` = §7 table check +
§5 language extension (8 more create builders/wrappers/typings). When porting to
the client package's own repo, apply the equivalent edit in its TypeScript
`src/core/**` / `src/utils/**` (the patch targets the compiled `dist/`).

### Run the regression suites

```bash
cd engine
npm ci            # re-applies patch-package via the prepare hook
npm test          # jest unit suites — reference passes 599/0 at 4.13.12 (5 skipped)
```

Focused run of just the fix suites:

```bash
npx jest updateClassStatefulSession updateInterfaceStatefulSession \
  updateProgramStatefulSession updateHandlersStatefulSessionFamily \
  createHandlersStatefulSessionFamily vendoredClientLockChainStatefulSession \
  updateFunctionGroupContentTypeNegotiation deletionResultHonesty \
  createProgramTypeGuard createStructureNoDeadLock \
  createLogonLanguageConsistency createViewErrorBody \
  isAlreadyExistsErrorMachineId updateStructureCheckSource \
  updateTableCheckSource createLogonLanguageFamily \
  unitTestClassicLowCds getSqlQueryGate readonlyGuard
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
