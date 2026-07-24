<!-- Fork lineage: mario-andreschak/mcp-abap-adt → fr0ster/mcp-abap-adt → babamba2/abap-mcp-adt-powerup → hjaewon/abap-mcp-adt-powerup (current) -->

# Changelog

## [Unreleased]

## [4.13.19] - 2026-07-24

### Fixed
- **`CheckSyntax` (program, no source_code) still surfaced a false `"REPORT/PROGRAM statement is missing"` error on a fully-active program — the 4.13.18 "active source" fallback never actually checked the active source (ZUNIWTH dogfooding #12 residual; live-observed on DEV/700 against `ZUNIWR2030`).** 4.13.18 converted the `-32603` tool-error leak into a normal result (that part is live-confirmed green), but the fallback it chose — `runProgramTreeCheck` — issues its `/checkruns` POST with `chkrun:version="inactive"` (correct for its other callers, the `programTree`/`screen` post-write checks). For a fully-active program with **no inactive version staged**, re-checking the absent inactive version re-hits the *same* SAP noise, so the `errors[]` still carried `"The REPORT/PROGRAM statement is missing, or the program type is INCLUDE"` with `success:false` even though `ZUNIWR2030` starts with a valid `REPORT` statement — the code and §17-B both *claimed* "validates the real active source" but that path was never built (the unit test's fake connection returned an empty `/checkruns` body, masking the residual). The `program`/no-source noise branch now calls a new `runActiveProgramSourceCheck`: it **reads the active source** (`getProgram().read({...}, 'active')`) and validates it through the already-honest source-bearing inline-artifact check (`runInlineArtifactCheck`, `chkrun:version="active"` with the real source embedded — the same path a caller-supplied `source_code` takes, honest per layer1 #7), so a valid active program returns clean and a genuinely broken one returns real errors with line numbers. A new `downgradeReportMissingNoise` safety net strips any residual REPORT-missing noise from that result — recomputing `success`/`has_errors` with the SAME status-aware rule as `parseCheckRunResponse` (`success = status 'processed' && no errors`), so a non-`processed` status is never silently reported as clean; real errors and all warnings/info are preserved — and if the active source can't be read the result is a clean `EMPTY_RESULT` (the only signal was the known-false noise). `runProgramTreeCheck` is untouched (its `inactive` callers are unchanged); the pre-existing, never-wired `perIncludeSweep` remains dead code (flagged, not removed). `src/__tests__/unit/checkSyntaxNoInactiveFallback.test.ts` is rewritten to reproduce the live scenario over a mocked client + a fake connection whose `/checkruns` body is set per test (13 cases: the fix reads `active`; clean active → success; broken active → real error surfaces; residual noise → downgraded clean; unreadable active → clean with no inline check; the `downgradeReportMissingNoise` unit incl. the status-aware non-`processed` guard; and the unchanged non-noise-propagates / already-checked cases). **Verification boundary:** the branch logic is unit-pinned and the fallback reuses existing, separately-exercised infrastructure, but the live red→green replay against `ZUNIWR2030` on DEV/700 (a valid program → clean, a deliberately-broken active program → real errors) is tracked as `UPSTREAM-FIX-HANDOFF.md` Known-remaining #12.

### Notes
- **Capability surface unchanged** (155 tools at the default `readonly,high` exposition). Server-only change — no client-package patch, no tool added/removed/renamed, no schema change. `isReportMissingNoiseText` and the new `downgradeReportMissingNoise` are exported for the unit test only. Full jest suite: 677 passed / 5 skipped / 0 failed (670 → +7 from the rewritten #12 test). A fresh-context independent review returned SHIP-WITH-NITS; the MINOR nit — `downgradeReportMissingNoise` recomputing `success` from `errors.length` alone, discarding the parser's status gate — was fixed before commit (status-aware recompute + a pinning test). The remaining MINOR (an unreadable active source reports as bare `success:true`, indistinguishable from verified-clean) is disclosed as a follow-up in `UPSTREAM-FIX-HANDOFF.md` §18.

## [4.13.18] - 2026-07-24

### Fixed
- **`CheckSyntax` (program, no source_code) false-failed a fully-active program as a hard tool error (ZUNIWTH dogfooding #12; live-reproduced on DEV/700 against `ZUNIWR2030`).** With `source_code` omitted, `runSyntaxCheck`'s `program` branch runs the vendored `getProgram().check({...}, 'inactive')`. For a fully-active program with **no inactive version staged**, that check throws SAP's `"The REPORT/PROGRAM statement is missing, or the program type is INCLUDE"` noise — a false positive (nothing inactive to compile). `safeCheckOperation` only swallows `isAlreadyChecked`, so the noise propagated out of the outer catch and surfaced as an MCP `-32603` tool error — also breaking `CheckSyntax`'s own contract ("syntax errors are returned as normal results, not tool errors"). The `program`/no-source branch now wraps the vendored check: on the `isReportMissingNoiseText` signature (and not `isAlreadyChecked`, which is re-thrown for the outer catch) it falls back to the noise-aware `runProgramTreeCheck`, which validates the real (active) source, filters the REPORT-missing noise, and returns a **normal** result. Non-noise errors still propagate unchanged, and the source-bearing path (already honest per layer1 #7) is untouched — the try only intercepts the throw, so the happy path has zero behavior change. `isReportMissingNoiseText` is now exported; `src/__tests__/unit/checkSyntaxNoInactiveFallback.test.ts` pins both the detection (the exact live ZUNIWTH message recognised as noise; genuine syntax errors not) and the branch **wiring** over a mocked client + fake connection (noise → fallback returns a normal result, no throw; a non-noise error still propagates; an already-checked error re-throws to the outer catch → `EMPTY_RESULT`) — review nit #3. **Verification boundary:** the branch logic is unit-pinned and the fallback target is existing, separately-exercised infrastructure, but the live red→green replay against `ZUNIWR2030` is tracked as `UPSTREAM-FIX-HANDOFF.md` Known-remaining #12.

### Added
- **`ActivateObjects` now confirms activation with a server-state oracle re-query, completing the lessons-pack #6/#11 remedy (ZUNIWTH dogfooding #11; follows the 4.13.17 §16 false-*failure* fix).** 4.13.17 fixed the false-failure but still derived activation from the run's response flags. After the run finishes, `activateObjectsLocal` now best-effort re-queries the inactive-object worklist (`createAdtClient(connection).getUtils().getInactiveObjects()` — the same path as `GetInactiveObjects`) and, for any object it reported `activated` that is **still in the worklist**, downgrades it to `failed` with an explanatory error and flips run-level `success` to false — exactly what the ZUNIWTH operator did by hand. This closes the residual false-*success* gap (an object that fails to activate but emits no per-object error message under a `generationExecuted="true"` run). Matching is by uppercased **name + base type prefix** (the worklist reports `{ type, name }` with a `<base>/<subtype>` code whose subtype does not always equal the activation input's — live-measured 2026-07-24 on DEV/700: activation input `PROG/I` vs worklist `PROG/P`/`TABL/DS`/`DDLS/DF`; name is the stable key), with a **name-only fallback** when our object arrived without a type (the `{name, uri}` input mode) so an empty base can never silently disable the check for that object (fail-open guard, review MEDIUM #1). The re-query is best-effort: any failure of the probe itself is swallowed — and logged via the threaded `logger` so a permanently-disabled oracle (a legacy 404, a wiring regression) is detectable rather than an invisible no-op — and never flips a real result (same discipline as the 4.13.14 FM `check_inactive` probe). `src/__tests__/unit/localGroupActivation.test.ts` gains six cases (still-inactive → downgrade + success false; name+base-type match across differing subtype/casing; unrelated inactive object ignored; same-name-different-base not downgraded; name-only fallback for a typeless input; failing probe swallowed), reverse-verified by neutering the oracle (the downgrade cases fail, the ignore/best-effort cases stay green). **Verification boundary:** unit-verified with the live-confirmed worklist shape; the live red→green replay is tracked as Known-remaining #11.

### Notes
- **Capability surface unchanged** (155 tools at the default `readonly,high` exposition). Server-only changes — no client-package patch, no tool added/removed/renamed, no schema change. The oracle re-query adds one read-only ADT round-trip after each `ActivateObjects` run (best-effort, swallowed on failure). A fresh-context independent review returned SHIP-WITH-NITS; all four actionable nits were fixed before commit — the MEDIUM fail-open (empty-type → oracle disabled → name-only fallback), the silent-swallow visibility (logger), the untested #12 wiring (three branch tests), and a same-name/different-base negative test. `UPSTREAM-FIX-HANDOFF.md` §17 records both fixes; Known-remaining #10 (4.13.17 live replay) is closed live (ZUNIWR2030 red→green confirmed on DEV/700), #11/#12 remain open only for their own live replays.

## [4.13.17] - 2026-07-24

### Fixed
- **`ActivateObjects` false-reported a fully successful activation as an all-objects-failure (dogfooding finding, ZUNIWTH project; lessons-pack layer1 #6/#11 recurrence).** On S/4HANA 2021, activating a program-with-screens object family via the mass-activation endpoint (`/sap/bc/adt/activation/runs`) returned a self-contradictory result: `success:false, activated:false, failed_count:7` alongside `errors:[], warnings:[], generated:true`. Root cause in `parseActivationResults` (`src/lib/localGroupActivation.ts`): per-object status was `errs.length === 0 && activated`, where `activated` is derived **solely** from the group-level `activationExecuted` attribute — but this successful run's results carried `generationExecuted="true"` with **no** `activationExecuted="true"` and zero error messages, so every object fell to the `failed` default even though the oracle (`GetInactiveObjects` → 0 of our objects) confirmed they were active. Generation is downstream of activation, so its success implies activation ran; per-object status now gates on `activated || generated` (`runExecuted`), and the run-level `success` (both the `runs` and `sync` return paths) likewise becomes `(activated || generated) && errors.length === 0`. An object still fails only when it carries an actual activation error message (unchanged). The `ActivateObjects` tool description gains an in-band #6/#11 guardrail: the success/activated flags are not proof — confirm by re-querying `GetInactiveObjects`. A regression case in `src/__tests__/unit/localGroupActivation.test.ts` pins a results body with `generationExecuted="true"` and no `activationExecuted` → all objects `activated`; reverse-verified by reverting the gate to `activated`-only, which reproduces the exact `failed` symptom, then restoring to green. The prior "survives empty input" contract (`<chkl:messages/>` with no flags → all `failed`) is preserved (`runExecuted` is false there). **Verification boundary:** the fix is derived from the reported parsed output (which pins that the real results XML omitted `activationExecuted`) and jest reverse-verified; a live red→green replay against the exact ZUNIWTH family, and the fuller lessons-#6/#11 remedy of embedding the `GetInactiveObjects` oracle re-query inside the handler, are recorded as follow-ups in `UPSTREAM-FIX-HANDOFF.md` (needs live SAP + the raw `/results/{id}` XML).

### Notes
- **Capability surface unchanged** (155 tools at the default `readonly,high` exposition). Server-only change — no client-package patch, no tool added/removed/renamed. No schema change; the `ActivateObjects` description text is amended (guarded by `handleActivateObjects.test.ts`, whose existing assertions still hold).

## [4.13.16] - 2026-07-19

### Fixed
- **Merge-artifact duplicate `resolveLogonLanguage()` calls in three create handlers (branch-integration cleanup, same class as the 4.13.12 §11 family).** `origin/main` and this machine's `main` both independently added the identical §11 language-stamp call to `handleCreateClass` / `handleCreateInterface` / `handleCreateProgram`, at two slightly different line positions each; git's line-based merge could not recognize the two insertions as the same logical change and applied both, leaving a duplicate `const masterLanguage = await resolveLogonLanguage(...)` in each of the three handlers (a same-scope `noRedeclare` compile error in `handleCreateInterface`/`handleCreateProgram`, and unreachable dead code in `handleCreateClass` — its duplicate landed one block scope up, outside the `try`, so it type-checked but was shadowed before use). `npm run build` caught the two compile errors; the third was found by auditing the rest of the §11 family for the same pattern. Each handler now keeps a single declaration, at this machine's `main` position and comment. No behavior change — both copies always resolved and injected the same value.

### Notes
- **Branch-integration renumber.** Two machines progressed the engine in parallel for six days: the primary machine's `origin/main` stopped at 4.13.12 (commit `0b304de7`), while this machine's `main` independently fixed the same two defects under its own 4.13.12 (commit `6524e7ee`) and continued on to 4.13.13 → 4.13.14 → 4.13.15. On integration, the local lineage (4.13.12–4.13.15, the entries below) is adopted as the merged tree's canonical history — a strict superset of the primary machine's stopping point — and the merge is stamped 4.13.16 to mark the integration event distinctly. The only source delta versus 4.13.15 is the merge-artifact cleanup above; jest is green at the same 655 passed / 5 skipped this machine already carried at 4.13.15.
- **Remote parallel 4.13.12 (`0b304de7`) reconciliation, preserved for reference.** The primary machine's independent write-up of the same two backlog 11-⑪/11-⑫ fixes recorded live verification against a KR-DEV system (logon language KO) for both items; this machine's 4.13.12 entry below records reverse-verification at the jest level only, with no live-system claim for that specific version. The remote write-up also carried two report-only observations not reflected below: **(1)** `table/create.js` derives the create-time description from `params.table_name` (ignoring the caller's description) — a separate, still-open defect from the language-row fix; `handleCreateTable` immediately follows create with a skeleton-replacing `UpdateTable`, so the effective description still flows through the update path. **(2)** because the parse+throw now lives in `AdtTable.check`, the low-level `CheckTableLow` / `CheckObjectLow` report a hard table-check error as a thrown message string rather than the previously structured `check_result.errors[]` with line/href — warnings-only and clean checks are unchanged, and the detail is still surfaced (mirrors the already-accepted 4.13.11 `CheckStructureLow` behavior). This alternative design was **not** adopted — this machine's `AdtTable.check()` stays non-throwing (§10 below), so `CheckTableLow`/`CheckObjectLow` are unaffected.

## [4.13.15] - 2026-07-19

### Fixed
- **`DeleteLocalTypes` / `DeleteLocalDefinitions` / `DeleteLocalMacros` / `DeleteLocalTestClass` were 100% broken — every call failed pre-wire with "…code is required" (HANDOFF §6 engine backlog 11-⑩).** All four MCP delete tools delegate to the vendored high-level `delete()`, which "deleted by updating with empty code": `this.update({ ...config, <kind>Code: '' })`. But `update()`'s very first guard is `if (!config.<kind>Code) throw new Error('… code is required')`, and `''` is falsy — so the guard threw **before the lock**, and the delete PUT that would clear the include never reached the wire (a second falsy guard, `if (!includeSource)` in the low-level `updateClassInclude` / `updateClassTestInclude`, backstops the same failure). Live-reproduced on IDES (S/4HANA 2021, logon CS) on 4.13.14: all four tools returned `Failed to delete … : … code is required` against a `$TMP` class with populated includes. **Fix (Option A, client-package `patch-package`):** each vendored `delete()` now runs its own dedicated clear chain — `lock → setSessionType('stateful') (4.13.7 pin) → empty-payload PUT → unlock`, with unlock-on-error cleanup — calling two new low-level functions, `clearClassInclude` (`class/includes.js`, for implementations/definitions/macros) and `clearClassTestInclude` (`class/testclasses.js`, for testclasses), that PUT the effectively-empty payload without the code guard. The common `if (!includeSource)` / `if (!testClassSource)` guards on the **update** helpers are intentionally left intact, so a normal `Update*` with empty code is still rejected (blast-radius containment — a relaxed shared guard would let an accidental empty-code Update silently wipe a real include). **Clear-payload probe (live, required):** on IDES `$TMP`, a **single space** PUT to `/sap/bc/adt/oo/classes/<c>/includes/{implementations,testclasses}` is accepted by S/4HANA and normalised to an **empty** include — inactive read-back returned `""` on both endpoints — so a single space (`EMPTY_INCLUDE_SOURCE` / `EMPTY_TESTCLASS_SOURCE`) is the clear payload; a literal `''` would re-trip the falsy guards, and "error absence" alone was not trusted (each probe was read-back-confirmed). A regression test (`src/__tests__/unit/deleteLocalIncludesFamily.test.ts`) drives all four real delete handlers over a fake `IAbapConnection` (same pattern as `vendoredClientLockChainStatefulSession.test.ts`) and pins, per family member: the chain succeeds, a stateful LOCK precedes the clear PUT to `/includes/<type>`, every request from lock through the write rides the stateful session (4.13.7 pin), the write body is the single space, and an UNLOCK follows. Reverse-verified by actually reversing the `patch-package` patch: with `delete()` back on `update('')` all four cases FAIL (the guard throws before any wire call — no PUT at all), and re-applying restores green. Verified live on IDES `$TMP` red→green: on the 4.13.14 bundle all four Delete tools failed "…code is required"; on the freshly-bundled 4.13.15 (spawned via the plugin launch path, live connection confirmed) all four returned success and inactive read-back confirmed each populated include (`local types` / `definitions` / `macros` / `test class`) emptied to `""`. The `$TMP` probe class was deleted and read-back-confirmed gone (404); no orphan lock.
- **`CreateProgramLow` silently substituted the object type for unsupported `program_type` values — a false success (HANDOFF §6 backlog 3-3 low-level sibling; UPSTREAM Known-remaining #2).** 4.13.9 fixed the **high-level** `CreateProgram` (reject unsupported types before any create + `inputSchema` enum tightened 6→2), but the low-level `CreateProgramLow` kept the unguarded direct-to-vendored path: its `program_type` schema advertised all six values with **no enum**, and the handler passed the raw type straight to the vendored `create()`, which ignores it and always produces a `PROG/P` shell — so `CreateProgramLow(program_type:'function_group')` created a plain program and reported `success:true`. Live-reproduced on IDES `$TMP` on the pre-fix bundle (spawned with `--exposition readonly,high,low`): the call returned success and `SearchObject` confirmed the created object was `PROG/P` (a `REPORT` shell), not a function group. The high-level guard is mirrored into the low handler — `SUPPORTED_PROGRAM_TYPES=['executable','module_pool']`, the `DEDICATED_TOOL_FOR_PROGRAM_TYPE` map, and a pre-create reject block pointing the caller at the dedicated tool (`CreateInclude` / `CreateFunctionGroup` / `CreateClass` / `CreateInterface`) — and the low `inputSchema` `program_type` gains the same `enum:['executable','module_pool']` (mirroring high-level line-for-line, so the MCP input-validation layer also rejects an unsupported value before the handler runs). The low-specific contract (`session_id` / `session_state` / `skip_check`) is unchanged. The existing `src/__tests__/unit/createProgramTypeGuard.test.ts` gains five low-level cases: each of the four unsupported types is refused with **zero** outbound requests and the dedicated-tool name in the message, and `executable` still reaches the create POST. Reverse-verified by actually removing the low guard: exactly the four low reject cases FAIL (the high cases and the low `executable` case stay green); restoring makes them green. Verified live on IDES `$TMP` red→green: pre-fix `CreateProgramLow(function_group)` created a `PROG/P` shell (deleted, read-back-confirmed 404); on the freshly-bundled post-fix 4.13.15 the same call is rejected pre-wire (the added enum makes the MCP validation reject it — `Invalid option: expected one of "executable"|"module_pool"`) and no object is created (`GetProgram` → not found). Tool count unchanged (schema enum edit — no tool added/removed/renamed).

### Removed
- **Four decorative, no-op parameters on the low-level class ABAP-Unit tool schemas (HANDOFF §6 engine observation 2; schema-only).** 4.13.11 moved `RunClassUnitTestsLow` / `GetClassUnitTestStatusLow` / `GetClassUnitTestResultLow` off the ABAP-Cloud-only `/abapunit/runs` collection onto the classic synchronous `/testruns` bridge. That switch left four `inputSchema` parameters that the handlers' argument destructuring never reads — `RunClassUnitTestsLow.title` + `.context`, `GetClassUnitTestStatusLow.with_long_polling`, `GetClassUnitTestResultLow.with_navigation_uris` — advertised in the MCP contract as no-ops (a caller passing them sees nothing happen). They are removed from the three schemas; handler logic is unchanged. The params the handlers **do** consume are kept — `scope` / `risk_level` / `duration` flow into the `abapUnitClassic` options block, and `format` is honoured by the result reader (rejects `"junit"`). A regression test (`src/__tests__/unit/lowUnitTestSchemaShape.test.ts`) asserts the four keys are absent from the three `inputSchema.properties` and the consumed ones are still present (reverse-verified — re-adding a key fails it). Tool count is unchanged (removing a schema property does not add or remove a tool).

### Notes
- **Capability surface unchanged** (155 tools at the default `readonly,high` exposition). The delete-family fix is a client-package `patch-package` change (its hunks accumulate into `patches/@babamba2+mcp-abap-adt-clients+3.13.1.patch` alongside the 4.13.7–4.13.12 ones — two new low-level functions plus the four rewritten `delete()` chains); the low-tool change is schema-only. No tool added, removed, or renamed.
- **Create-side local includes remain write-only via `Update*` (out of scope, recorded).** There is no `CreateLocalTypes` / `CreateLocalDefinitions` / `CreateLocalMacros` / `CreateLocalTestClass` tool — an include is first populated through the corresponding `Update*` tool. Adding dedicated create tools is a feature extension, not part of this delete-path repair; noted as a candidate only.

## [4.13.14] - 2026-07-18

### Fixed
- **`CreateStructure` discarded its required `fields` input and created an empty shell, reporting success — a false success (backlog 5-13 layer 1 Wave 2, items 3 + 11-①).** The handler validated `fields` for presence and then threw it away, calling `create({ ddlCode: '' })` (the create endpoint only produces a shell; the field DDL write was never implemented — the handler even carried a "not yet implemented" comment) and returning `{ success: true, activated: true }`. Live-measured on IDES (S/4HANA, logon CS) on 4.13.13: creating a structure with `ID CHAR(10)` + `AMOUNT DEC(15,2)` reported success but read back as only a placeholder `component_to_be_changed : abap.string(0)` — neither field present. A new pure builder (`src/lib/structureDdl.ts`, `generateStructureDdl`) turns the field/include spec into DDIC `define structure` DDL — built-ins resolve to `abap.<type>` with length/decimals where required, `data_element` resolves to the element, `CURR`/`QUAN` optionally emit `@Semantics` annotations — and the header **always** emits `@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE` (item 11-①; a DDIC structure is rejected without it). The builder throws on an incomplete spec (a length-bearing built-in with no length, an unresolved `data_type`, a field with neither `data_element` nor `data_type`, an include with a suffix, or no fields/includes). `handleCreateStructure` generates the DDL **before any object is created** — an incomplete spec fails with nothing on the wire, so there is no half-built shell to clean up (no partial creation) — then applies it under lock: create shell → check-with-source on the generated DDL (4.13.11 `AdtStructure.check` ddlCode-forward) → lock → `update({ ddlCode }, { lockHandle })` → unlock → check inactive → activate. The write is pinned stateful right after the lock (4.13.5 class — IDES recycles the connection, so a stateless PUT would evaporate the lock); this supersedes the 4.13.9 dead lock/unlock removal — the lock now brackets a real write. The 4.13.12 logon-language stamping on the shell create is preserved. Two additive `fields[]` params (`currency_reference`, `unit_reference`) and a `fields_applied` response count are new; no tool added/removed/renamed. Regression suites (`src/__tests__/structureDdl.test.ts` 15 cases; `src/__tests__/handleCreateStructure.test.ts` 3 cases) pin the rendering, the always-present enhancement.category, every incomplete-spec throw, the generated DDL transmitted as the check-with-source base64 body, the lock bracketing exactly one source PUT, and an incomplete spec failing with zero wire requests (reverse-verified: dropping the enhancement.category push, the incomplete-spec throw, or the transmitted ddlCode fails the matching cases). The obsolete `createStructureNoDeadLock` test — which asserted the lock/unlock pair was absent — is superseded. Verified live on IDES $TMP red→green: 4.13.13 created an empty `component_to_be_changed` shell; 4.13.14 created a structure with all three fields (`ID`/`AMOUNT`/`CREATED_ON`) and the enhancement.category header present. Both $TMP objects deleted and read-back-confirmed gone (404); no orphan lock.
- **`GetFunctionModule` / `ReadFunctionModule` returned the pre-edit active source when an unactivated edit existed, silently masking a pending edit (backlog 5-13 layer 1 Wave 3, item 2).** Reading `version='active'` (the default) returns the deployed source; when an inactive (edited-but-not-activated) version exists, a caller that re-edits on top of the returned active source silently destroys the pending edit and no gate catches it. Both handlers gain a `check_inactive` parameter: when reading active, they also read the inactive version and, if it exists and its source differs, attach a `warning` to the response. The extra read never fails or slows the main read (a missing inactive version is swallowed). `GetFunctionModule` defaults it **on** (interactive single reads); `ReadFunctionModule` defaults it **off** (opt-in — the bulk-read surface, where the per-FM extra call would be costly). Regression suites (`handleGetFunctionModule.test.ts` 6, `handleReadFunctionModule.test.ts` 4) drive the real handlers over a fake connection serving active vs inactive by `?version=` and pin: differs → warning, identical → none, Get default reads inactive / Read default does not, and a failing inactive read never breaks the main read (reverse-verified). Judged on the jest evidence — a live repro needs a provisioned FUGR+FM with a staged divergent inactive version, disproportionate to the deterministic coverage.

### Changed
- **FM/activation description honesty (backlog 5-13 layer 1 Wave 3, items 4/5/6 — description-only).** `GetFunctionModule` / `ReadFunctionModule` descriptions now state that a returned 'active' source is **not** proof of successful activation (never-activated FMs also return it) and warn to read `version='inactive'` before re-editing (item 6). `ActivateObjects` documents the FUGR recipe — activate the function group + its TOP include (FUGR/I) + every FM (FUGR/FF) + the SAPL<group> main program in ONE run, do NOT include the system include L<group>UXX, and never mix unrelated objects into one activation run (item 4). `UpdateFunctionModule` states the write persists (as the inactive version) even when the post-write syntax check fails, and that those check errors can originate from pre-existing defects in sibling FMs of the same function group (item 5). Description-pin tests (`handleActivateObjects.test.ts`, `handleUpdateFunctionModule.test.ts`) guard the text.

### Notes
- **Capability surface unchanged** (155 tools at the default `readonly,high` exposition). Server-only change — no client-package patch, no tool added/removed/renamed. New parameters (`check_inactive` on the two FM reads; `currency_reference`/`unit_reference` on `CreateStructure` fields) and new response fields (`warning`, `fields_applied`) are additive.
- **`DeleteStructure` read-back verification (backlog 5-13 layer 1 Wave 3, item 11-②) investigated, deliberately not repaired.** Live on IDES, deleting an unlocked `$TMP` structure via the 4.13.9 `assertDeletionSucceeded` parse reported success and a read-back confirmed 404 (genuinely gone) — the "unlocked deletion-framework POST returns a no-op 2xx" pathology did not reproduce, and `assertDeletionSucceeded` already throws on `isDeleted != "true"`. Per the Wave's no-over-repair instruction, the handler is unchanged; the read-back-404 hardening (present in sc4sap-custom v4.14.0) is recorded as a candidate in `UPSTREAM-FIX-HANDOFF.md` Known-remaining #9.

## [4.13.13] - 2026-07-18

### Fixed
- **Real-data gate honesty — the two row-data tools (`GetSqlQuery`, `GetTableContents`) silently mis-attributed NULL-cell values, and the response could not be trusted for completeness (backlog 5-13 layer 1 Wave 1; JNC lesson-pack items 1 + 9 + 8).** Both tools share one XML parser, `parseSqlQueryXml` (`handleGetSqlQuery.ts`, reused by `handleGetTableContents.ts`), which carried three defects. **(1) Self-closing NULL cell drop + row shift.** The per-column cell regex `/<dataPreview:data[^>]*>(.*?)<\/dataPreview:data>/g` requires a closing tag, but SAP emits a nil / NULL cell as self-closing `<dataPreview:data/>`. The pattern skipped the self-closing cell and then spanned forward to the *next* cell's `</dataPreview:data>`, swallowing that value into one match — so the column array came up short and every following row in that column shifted up. Live-measured on an on-prem S/4HANA system: a read-only `T000` self-join that makes only the middle client's column non-NULL returned that value (`"Ready-to-activate client"`) on the **`MANDT=000`** row (which must be NULL) and NULL on the `MANDT=200` row that actually owns it (confirmed by the unaffected sibling column). The regex is now an alternation matching the self-closing form first and capturing the paired form's body, walked with `matchAll` so cell position is preserved: a self-closing or empty cell → `null`, any other body (including a blank `" "` CHAR value) kept verbatim, so a nil NULL is distinguished from an empty string. When columns still come out unequal (a genuinely ragged response the parser cannot align) the per-column shape is surfaced as a new `ragged_columns` field and logged, instead of silently shifting rows. **(2) Self-contradicting row-count meta.** The response emitted only server-reported `total_rows`; it now also reports `returned_row_count` (rows actually parsed), `server_total_rows` (server total when the XML provides it), and `truncated` (`returned >= row_number` or `server_total > returned`). `GetTableContents` inherits all of this through the shared parser. **(3) Sporadic HTTP 400 on complex queries.** The handler issued the Data Preview POST once and threw immediately; multi-way joins / long IN lists and concurrent calls draw a transient 400 that succeeds on an immediate re-run. The call is now wrapped in a retry-once helper — a first-attempt HTTP 400 is retried exactly once; any other error, or a second 400, propagates unchanged — and the tool description documents the 400 constraint plus the alias-shortening / BETWEEN work-arounds. An offline-fixture regression test (`src/__tests__/handleGetSqlQuery.test.ts`) pins the self-closing shift, the nil-vs-blank-CHAR distinction, the ragged-column warning, the three meta fields across three truncation cases, and the 400 retry (retry-then-succeed / give-up-after-one-retry / no-retry-on-500), and drives the real `handleGetTableContents` to prove the shared parser fix flows through. Reverse-verified: reverting only the cell regex fails exactly the four alignment cases while the meta / retry cases stay green. Verified live on IDES (on-prem): the same `T000` self-join shifted the value onto `MANDT=000` with no row-count meta on 4.13.12; on 4.13.13 the value sits on its true `MANDT=200` row, all other rows are NULL, and `returned_row_count`/`server_total_rows`/`truncated` are present and correct. Read-only throughout.

### Notes
- **Capability surface unchanged** (155 tools at the default `readonly,high` exposition). Server-only change — no client-package patch, no tool added/removed/renamed, and the only schema change is the enriched `GetSqlQuery` description text. New response fields (`returned_row_count`, `truncated`, `server_total_rows`, `ragged_columns`) are additive.

## [4.13.12] - 2026-07-13

### Fixed
- **`UpdateTable` pre-check validated the stored version, not the new DDL — so a real DDL error surfaced only as SAP's opaque write failure (HANDOFF §6 engine backlog 11-⑪, the `UpdateTable` sibling of the 4.13.11 structure fix).** `handleUpdateTable`'s "check new DDL code before update" step calls `client.getTable().check({ tableName, ddlCode }, 'inactive')`, but the vendored `AdtTable.check(config, status)` **silently dropped `config.ddlCode`** and check-ran the object's *stored* inactive version instead (`runTableCheckRun(conn, 'abapCheckRun', name, undefined, version)`) — so the pre-check never validated the new code. When the stored version was valid, the pre-check passed and the invalid new DDL only failed at the write PUT, as SAP's opaque *"Kein Sichern wegen Fehler in Quelle. Details erhalten Sie mit Prüfung."* (error in source, get details via a check) — the details never shown. Unlike `AdtStructure.check` (which parses the `/checkruns` response and throws on errors), `AdtTable.check` returns the raw response **without evaluating it** — the low-level `CheckTableLow` tool relies on that non-throwing contract and parses the result itself, so the block-decision for the high-level `UpdateTable` pre-check belongs in the handler. The fix is therefore two coordinated parts: **(1)** the vendored `AdtTable.check()` now forwards `config.ddlCode` as the source to validate (`patch-package`, marked `[powerup 4.13.12]`), so the pre-check runs a check-**with-source** on the actual new DDL — this also revives the low-level `CheckTableLow` tool's documented `ddl_code` validation, which the same drop had silently defeated; callers that pass no `ddlCode` (the post-unlock inactive check) keep the prior saved-version behavior (`undefined`). **(2)** `handleUpdateTable` now parses that pre-check result (`parseCheckRunResponse`) and **blocks the write** with an honest, actionable message when the new DDL has real errors — surfacing the real SAP detail **before** any write PUT (with the same DDIC "inactive version does not exist" / "importing from database" tolerance as `checkStructure`, and a non-empty status fallback so the thrown message is never bare). A regression test drives the real `handleUpdateTable` over a fake connection that answers `/checkruns` differently for source vs no-source requests, pinning: valid code → the pre-check carries the new DDL as base64 source and the update completes; a real check error (stored version clean, new DDL bad) → the exact SAP detail is surfaced and **no** write PUT is issued; a `notProcessed` result → an honest status-carrying error (never bare). Reverse-verified in both layers: reverting the `ddlCode`-forward makes all three cases fail (the pre-check goes back to the wrong version), and neutralizing the handler block-decision makes the real-error and notProcessed cases fail (the bad write reaches the PUT).
- **Create-payload EN hardcoding remainder — the reachable non-DDLS create builders (HANDOFF §6 engine backlog 11-⑫, the mechanical extension of the 4.13.10 logon-language fix).** 4.13.10 resolved the logon language only for the three live-proven create paths (DDLS view, domain, data element); the remaining vendored create payloads still hardcoded `adtcore:language="EN"` / `adtcore:masterLanguage="EN"`. Those creates *succeed* (SAP tolerates the EN→logon-language normalization), but the description lands in the **EN text slot** and reads back empty on a non-EN logon system (live context: IDES = CS, real users = KO). Each reachable create handler is now plugged into the same dynamic `resolveLogonLanguage()` (`src/lib/adtLogonLanguage.ts`, EN fallback when systeminformation is unavailable) and injects it into the create call; the vendored builders stamp both `adtcore:language` and `adtcore:masterLanguage` from it via `patch-package` (marked `[powerup 4.13.12]`). Eight object types, all reachable from a high-level Create tool: **class, interface, program, package, table, structure, service definition, and metadata extension (DDLX)**. The DDLX builder already threaded `masterLanguage` into `adtcore:masterLanguage` but still hardcoded `adtcore:language="EN"` — both attributes now use the resolved language. A family regression test drives all eight real handlers over a fake connection whose systeminformation advertises CS and pins `adtcore:language="CS"` / `adtcore:masterLanguage="CS"` on each create POST body, plus EN-fallback cases when systeminformation 404s (reverse-verified: reverting a builder's `EN`→`${masterLanguage}` substitution or a handler's language injection makes that type's CS case fail while the EN-fallback case still passes).

### Notes
- **Capability surface unchanged** (155 tools at the default `readonly,high` exposition). Both fixes are internal validation / payload changes — no tool added, removed, or renamed, and no schema change. The vendored `patch-package` patch (`patches/@babamba2+mcp-abap-adt-clients+3.13.1.patch`) accumulates the new hunks alongside the existing 4.13.7–4.13.11 ones.
- **DCL (access control) deliberately left untouched, not fixed here.** The backlog named DCL among the EN-hardcoded create payloads, but the vendored `accessControl/create.js` is **unreachable from any handler** — no `Create*` tool routes to it (dead from the engine's side, same judgment as the `tabletype`/`enhancement` create builders and the §3 dead-delete helpers). Without a reachable Create tool it cannot be live-verified, so its EN payload is left as-is; `resolveLogonLanguage` is the shared root to plug in if such a tool is ever added. `functionGroup` and `enhancement` create builders also still hardcode EN and are out of this Wave's named scope (FUGR create tolerates the normalization and was verified green in 4.13.1).
- **Language scope for other creates unchanged.** The low-level `Create*Low` / compact dispatch paths call the same patched builders but do not resolve the language themselves — without a caller-supplied `master_language`/`masterLanguage` they keep the EN default (fallback semantics, same as the 4.13.10 note).

## [4.13.11] - 2026-07-12

### Fixed
- **`UpdateStructure` pre-check validated the wrong version, so the real DDL error was hidden behind SAP's opaque "run a check for details" (HANDOFF §6 engine backlog 11-⑤).** The handler's "check new DDL code before update" step calls `client.getStructure().check({ structureName, ddlCode }, 'inactive')`, but the vendored `AdtStructure.check(config, status)` **silently dropped `config.ddlCode`** and check-ran the object's *stored* inactive version instead (`checkStructure(conn, name, version, undefined)`) — so the pre-check never validated the new code. Two live-measured manifestations on IDES (S/4HANA 2021, logon CS), same root: **(a) opaque write failure** — when the stored inactive version is valid, the pre-check passes on it and the invalid new DDL only fails at the write PUT, as `ExceptionResourceAlreadyExists` / *"Kein Sichern wegen Fehler in Quelle. Details erhalten Sie mit Prüfung."* (no saving because of a source error, get details via a check) — the details never shown; **(b) bare empty error** — when the stored inactive version cannot be validated (empty shell → `status="notProcessed"` with no messages), `parseCheckRunResponse` flags `has_errors` with an empty `errors` list, and `checkStructure` threw a bare `"Structure check failed:"` with nothing after the colon (the "빈 에러" the backlog names). The fix is two vendored `patch-package` edits: **(1)** `AdtStructure.check()` now forwards `config.ddlCode` as the source to validate, so the pre-check runs a check-*with-source* on the actual new DDL and surfaces the real error **before** the write PUT (blocking the bad write with an honest, actionable message); callers that pass no `ddlCode` (`CreateStructure`'s inactive check, `UpdateStructure`'s final check) are unchanged (`undefined` → prior saved-version behavior). The same drop also silently defeated the low-level `CheckStructure` tool's documented `ddl_code` validation — now repaired by the same edit. **(2)** `checkStructure()` never throws a bare `"Structure check failed:"` — it keeps only non-empty error texts and, when none remain, falls back to the check status/statusText. A regression test drives the real `handleUpdateStructure` over a fake connection that answers `/checkruns` differently for source vs no-source requests, pinning: valid code → the pre-check carries the new DDL as base64 source and the update completes; a real check error → the exact SAP detail is surfaced and **no** write PUT is issued; a `notProcessed` result → an honest status-carrying error (never bare). Reverse-verified: with the `ddlCode`-forward reverted, the valid-code and real-error cases fail (the pre-check goes back to the wrong version). Verified live on IDES: on 4.13.10 `UpdateStructure` with DDL missing the mandatory `@AbapCatalog.enhancement.category` annotation failed with the opaque *"Kein Sichern wegen Fehler in Quelle …"*; on 4.13.11 the pre-check surfaces the real *"Obligatorische Annotation \"AbapCatalog.enhancement.category\" für Struktur … fehlt"* before any write, and a corrected DDL updates + activates cleanly.
- **Low-level class + CDS ABAP Unit run/read still used the ABAP-Cloud-only endpoint → HTTP 404 on-prem (HANDOFF §6 old backlog 3-6).** 4.13.1 moved the **high-level** `RunUnitTest` / `GetUnitTest*` off `/sap/bc/adt/abapunit/runs` (+ `/results/`), the ABAP-Cloud-only async collection absent on on-prem (404 on S/4HANA 2021 and BASIS 7.00), onto the classic synchronous `/sap/bc/adt/abapunit/testruns` endpoint bridged through a connection-scoped, TTL-bounded run_id store (`lib/abapUnitClassic.ts`). The low-level `RunClassUnitTestsLow` / `GetClassUnitTestStatusLow` / `GetClassUnitTestResultLow` and the CDS readers `GetCdsUnitTest` / `GetCdsUnitTestStatus` / `GetCdsUnitTestResult` were left on the vendored cloud path and 404'd there identically. They now **reuse the same 4.13.1 helpers** (`runClassicUnitTest` / `storeUnitTestRun` / `getUnitTestRun`) rather than re-porting the logic: `RunClassUnitTestsLow` runs the classic sync endpoint and caches the result under a generated run_id; the low + CDS readers look that run_id up in the SAME connection-scoped store, so run_ids from `RunUnitTest` and `RunClassUnitTestsLow` interoperate. There is no `RunCdsUnitTest` tool — CDS test classes (created by `CreateCdsUnitTest`) are run through the classic `RunUnitTest`, whose run_id the CDS readers now resolve. The low-level caller contract is preserved (tests in → run_id out; `run_id` in → status/result out; `session_id`/`session_state` still accepted); unit-test runs never lock, so there is no `lock_handle`/session contract to break. `format:"junit"` is rejected on the low + CDS result readers (unsupported by the classic endpoint), matching the high-level reader. The compact `HandlerCdsUnitTestStatus`/`Result` delegate to the fixed CDS readers and inherit the fix. A regression test drives all six real handlers over a fake connection that serves `/testruns` and **hard-fails any request to the old `/abapunit/runs|results` collection** (so a regression to the cloud path is caught, not 404-swallowed). Reverse-verified: reverting the six handlers to the 4.13.10 cloud path fails all five cases. Verified live on IDES via a `--exposition readonly,high,low` server against a `$TMP` class with a passing local test: on 4.13.10 `RunClassUnitTestsLow` returned HTTP 404 and `GetCdsUnitTest` hit the cloud read; on 4.13.11 `RunClassUnitTestsLow` + `GetClassUnitTestStatusLow`/`ResultLow` and `GetCdsUnitTest`/`Status`/`Result` all return the real `<aunit:runResult>` (the executed `LTCL_SAH`/`TEST_DOUBLE`).

### Notes
- **Capability surface unchanged** (155 tools at the default `readonly,high` exposition; the low tools stay behind `--exposition …,low` as before). Both fixes are internal routing/validation changes — no tool added, removed, or renamed, and no schema change.
- **CDS test-double creation not in scope.** The CDS *run/read* 404 is resolved above; `CreateCdsUnitTest`'s test-class lifecycle (global class + local test class via `AdtClass`/`AdtLocalTestClass`, not the cloud run endpoint) was never part of this 404 class and is untouched.

## [4.13.10] - 2026-07-12

### Fixed
- **Create-payload logon-language mismatch — the language family (HANDOFF §6 engine backlog 11-⑧ + 11-④'s deferred fix).** The vendored `@babamba2/mcp-abap-adt-clients` create payloads hardcode `adtcore:language="EN"` / `adtcore:masterLanguage="EN"`, which breaks every create against a system whose logon language is not EN (live-measured on IDES / S/4HANA 2021, logon language **CS**) in two distinct ways: **(a) hard create rejection** — the DDLS create service refuses the payload outright, so `CreateView` failed with HTTP 400 *"Sprache EN zum Anlegen der Beschreibung entspricht nicht Mastersprache CS"* (`T100 DDIC_ADT_DDLS/016`, no shell left behind); **(b) silently dropped description** — DOMA/DTEL creates succeed but SAP normalizes the master language to the logon language and DROPS the description entirely (the created skeleton's GET XML carries **no `adtcore:description` attribute at all** — live-captured), so the read-modify-write attribute step inside `CreateDomain` / `CreateDataElement` then fails with *"Die Beschreibung fehlt"* (`T100 SWB_TOOL/019`), leaving a half-created skeleton. The fix is **dynamic, not another hardcoded language**: a new `resolveLogonLanguage()` (`src/lib/adtLogonLanguage.ts`) resolves the connected system's logon language from the live ADT system-information document (`GET /sap/bc/adt/core/http/systeminformation` — the same source `GetSystemInfo` reads; live-verified to return `"CS"` on the IDES box), cached per connection, validated against a `^[A-Z]{1,3}$` shape, falling back to the historical `EN` only when the endpoint is unavailable. `handleCreateView` / `handleCreateDomain` / `handleCreateDataElement` inject it into the create call, and the vendored `view/create.js` / `domain/create.js` / `dataElement/create.js` payload builders (plus the `AdtView`/`AdtDomain`/`AdtDataElement` wrapper forwarding and their config typings) accept it as `master_language` via `patch-package` (accumulated into `patches/@babamba2+mcp-abap-adt-clients+3.13.1.patch`; the published bundle bakes it in). Family regression tests drive all three handlers over a fake connection whose systeminformation advertises CS and pin `adtcore:language="CS"`/`adtcore:masterLanguage="CS"` on the create POST body, plus EN-fallback cases when systeminformation 404s (reverse-verified: the three CS cases fail with the language patch reverted; the EN-fallback cases pass either way). Verified live on IDES: `CreateView` red 400 on 4.13.9 → green create on 4.13.10; `CreateDomain`/`CreateDataElement` red *"Die Beschreibung fehlt"* → green create with the description landing (read back with `masterLanguage="CS"`).
- **Half-created skeletons are now repairable via Update — `patchXmlAttribute` add-if-missing (same backlog item, the "permanently crippled skeleton" half).** The vendored XML patch helper used by the domain/data-element read-modify-write updates was replace-only: when the GET XML carries no `adtcore:description` attribute (the skeleton case above), the patch silently no-op'd and the PUT failed with *"Die Beschreibung fehlt"* — so a skeleton left by an older bundle could never be repaired through the Update tools (GUI delete + recreate was the only way out). `patchXmlAttribute` now takes an **opt-in** `{ addIfMissing: true }` option that injects the absent attribute into the root element's opening tag (prolog/comment-safe, quote-aware); only the `adtcore:description` patches in `domain/update.js` and `dataElement/update.js` opt in — every other call site keeps the exact replace-only behavior. Regression tests drive the real `UpdateDomain`/`UpdateDataElement` handlers over a description-less skeleton GET fixture (modeled on the live IDES capture) and pin the injected description on the PUT body (reverse-verified: both fail with the option removed). Verified live on IDES: the actual half-skeleton domain left behind by the 4.13.9 red repro was repaired by `UpdateDomain` on 4.13.10 (description read back), then deleted.
- **`isAlreadyExistsError` was English-only — now machine-identifier-first (HANDOFF §6 engine backlog 11-⑥).** The matcher looked only for English phrases ("already exists" …), but the message TEXT follows the backend's language pool: live-measured on IDES, the already-exists rejection arrives as `<exc:exception>` with GERMAN text (*"Domain mit Name X ist bereits vorhanden"*) **even under `lang="EN"`** — so `UpdateDataElement`'s pre-validation (which treats already-exists as the expected case for an update) misclassified it as a real error and refused the update. Detection is now language-independent-first: **(1)** exception type ids containing `AlreadyExists` (e.g. `ExceptionResourceAlreadyExists`), **(2)** the T100 message key `SWB_TOOL/016` (*"&1 mit Name &2 ist bereits vorhanden"* — live-captured on IDES for both DOMA and DTEL, serialized as `<entry key="T100KEY-ID">SWB_TOOL</entry><entry key="T100KEY-NO">016</entry>`), and only **then** the multilingual text fallback (existing English patterns + German *"bereits vorhanden"* / *"existiert bereits"*). A regression suite pins the verbatim live captures — including the negative control that the *different* German error `SWB_TOOL/019` (*"Die Beschreibung fehlt"*) is NOT classified as already-exists (reverse-verified: the four new-detection cases fail on the old matcher). Verified live on IDES: `UpdateDataElement` against an existing $TMP data element failed on 4.13.9 with the German already-exists text and completes on 4.13.10.
- **`handleCreateView` discarded the ADT error body (Wave 2 side-discovery, HANDOFF 11-④ note).** The catch forwarded only `error.message` — the generic axios *"Request failed with status code 400"* — while the actual SAP diagnosis (e.g. the master-language rejection above) lives in `error.response.data`. The catch now routes the error through the existing `extractAdtErrorMessage` parser and appends the HTTP status (`SAP Error: … [HTTP 400]`), matching the central `return_error` behavior; `isPreCheckFailure` forwarding is unchanged. Regression test pins the SAP message text + status on the returned error (reverse-verified). **Sibling survey (report-only, minimal-change):** ~50 handlers share the `error.message`-only conversion pattern, but most either sit behind wrappers that already fold the response body into `error.message`, pass the original error object to `return_error` (which parses ADT XML itself since 4.13.0), or serve read paths where the generic message is the whole story; none is a live-proven diagnosis blocker today, so they are left untouched (this fix repairs the one live-measured case).

### Notes
- **Language scope deliberately minimal.** Only the three live-proven create paths (DDLS view, domain, data element) resolve and inject the logon language; other vendored create payloads that also hardcode EN (class, interface, program, structure, table, FUGR, include, DDLX, BDEF …) are left untouched — live evidence shows those services tolerate the EN→logon-language normalization (their creates succeed on the CS box; e.g. `CreateFunctionGroup`/`CreateProgram`/`CreateStructure` all verified green in 4.13.1–4.13.9), and the domain/data-element description-drop pathology was not observed for them in this Wave's audit. If a fourth surface proves affected, `resolveLogonLanguage` is the shared root to plug into.
- The low-level `CreateViewLow` / compact dispatch paths call the same patched vendored `createView()` but do not resolve the language themselves — without a caller-supplied `master_language` they keep the EN default (fallback semantics, same as before).

## [4.13.9] - 2026-07-12

### Fixed
- **Silent delete failures reported as success across the ADT deletion service (HANDOFF §6 backlog 3-5, live-measured 3× on `DeleteFunctionGroup`).** The generic `POST /sap/bc/adt/deletion/delete` service returns HTTP 200 even when it *refuses* the delete (e.g. the object is still locked), signalling the real outcome only via `del:deletionResult/del:object[@del:isDeleted]` plus an E-level `del:message`. The vendored low-level `deleteFunctionGroup()` (and its siblings) discarded that body and hardcoded `{ success: true }`, so a failed delete was reported to the caller as a success — a lock or authorization failure looked like a clean deletion. **Scope (full survey):** every vendored `deleteX()` that POSTs to the *shared* `/sap/bc/adt/deletion/delete` endpoint returns this same uniform `del:deletionResult` shape (the vendored `deletePackage()` already parses it correctly, proving the format), and all but `package` ignored it. A shared `assertDeletionSucceeded()` helper was added to the vendored `utils/internalUtils.js` and is now called by every such helper reachable from a live Delete handler — **11 hardcoded-`success:true` deletes** (`functionGroup`, `class`, `program`, `interface`, `domain`, `dataElement`, `table`, `structure`, `view`, `serviceDefinition`, `functionModule`) plus **`behaviorDefinition`** (same endpoint/format; it returned the raw response but the handler treated any non-throw as success). The helper normalizes the `del:object` node(s) to an array — a single delete can cascade into several nodes (a structure delete returns both its `TABL/DS` and `TABT/DTT` nodes, which `fast-xml-parser` yields as an array) — and throws with the SAP message when **any** node reports `isDeleted !== "true"` (positively-identified failure); unknown/absent `deletionResult` bodies fall back to the HTTP status only, so an unusual-but-successful response shape is never mis-reported as a failure. Applied via `patch-package` (accumulated into `patches/@babamba2+mcp-abap-adt-clients+3.13.1.patch`; the published bundle bakes it in). A family regression test drives the real `DeleteFunctionGroup`/`DeleteClass`/`DeleteProgram`/`DeleteBehaviorDefinition` handlers over a fake connection serving an `isDeleted="false"` body and asserts an honest failure carrying the SAP message, plus a green `isDeleted="true"` case per handler, and a cascade case driving `DeleteStructure` over a multi-node deletion result (all nodes deleted → success; one node `isDeleted="false"` → honest failure). Reverse-verified: with the helper neutralized all four red cases report success and fail. Verified live on IDES (S/4HANA 2021, logon language CS): deleting a function group held under an ADT lock reported `success:true` on 4.13.8 while the object survived (`GetFunctionGroup` still returned it), and reports an honest failure carrying the SAP message *"Zpracováváte již …"* on 4.13.9; an unlocked function group and a structure both still delete successfully (no over-fix).
- **`CreateProgram` silently substituted the object type for unsupported `program_type` values (HANDOFF §6 backlog 3-3, live-proven for `function_group`).** The ADT `programs/programs` create endpoint only produces `PROG/P` objects, but the tool accepted `program_type` values (`include`, `function_group`, `class_pool`, `interface_pool`) that map to distinct ADT object types with their own create endpoints; the vendored create ignored the type, always produced a `PROG/P` shell, and the handler reported it as `"type":"PROG/P"` — so a request for a function group was fulfilled as a plain program. The handler now rejects those four types up front, before any object is created, pointing the caller at the dedicated tool (`CreateInclude` / `CreateFunctionGroup` / `CreateClass` / `CreateInterface`); the `inputSchema` enum was tightened from six values to the two this endpoint actually creates (`executable`, `module_pool` — both `PROG/P`). A regression test asserts each unsupported type is refused with **zero** outbound requests and a supported type still reaches the create POST (reverse-verified). The tool count is unchanged (schema-only enum edit).

### Removed
- **Dead lock/unlock pair in `CreateStructure` (HANDOFF §6 backlog 11-⑨).** The handler `lock()`ed the structure and immediately `unlock()`ed it with only a TODO comment in between — the DDL update the lock was meant to protect was never implemented, so the pair bracketed no request at all (already flagged as a cleanup candidate in the 4.13.6 audit). Removed, along with the now-redundant inner try/catch whose sole job was unlock-on-error. Behaviour is unchanged (two round-trips fewer); the create endpoint still produces an empty structure shell — field/include DDL generation remains unimplemented (tracked as backlog 11-⑤/11-⑧). A regression test asserts the handler runs create→check→activate without issuing any structure LOCK/UNLOCK (reverse-verified).

### Notes
- **Not fixed (same root, deliberately out of scope):** `tabletype` / `accessControl` / `enhancement` `delete.js` share the hardcoded-`success:true` root but are **unreachable from any handler** (no `Delete*` tool routes to them — dead from the engine's side, per the 4.13.8 dead-code precedent). `metadataExtension` delete uses a REST `DELETE /ddic/ddlx/sources/{name}` (a different endpoint/response shape, not the `/deletion/delete` family). The `DeleteLocalTestClass/Types/Macros/Definitions` client `delete()`s are a separate pre-existing defect (`update(code:'')` rejected before locking — HANDOFF §6 backlog 11-⑩), not this silent-success class. The **low-level `CreateProgramLow`** tool calls the same type-ignoring vendored `create()` directly and still shares the `CreateProgram` substitution root; it was left untouched to keep this fix minimal to the named high-level tool. The **compact `HandlerCreate`** dispatcher, by contrast, delegates `PROGRAM.create` to the patched high-level `handleCreateProgram` and therefore **inherits the guard** (review-verified — no separate fix needed).

## [4.13.8] - 2026-07-12

### Fixed
- **`UpdateFunctionGroup` failed with HTTP 415 "ExceptionUnsupportedMediaType" on systems that advertise only `functions.groups.v2` (e.g. IDES / S/4HANA 2021).** The handler updates FUGR metadata via a raw `makeAdtRequest` PUT that hardcoded both request headers to `application/vnd.sap.adt.functions.groups.v3+xml`, so the 4.13.1 discovery negotiation — which already fixed the identical hardcoding on the **create** path — never reached the update path (HANDOFF §6 engine backlog 11-③). Live-reproduced on IDES: the PUT was rejected with *"Nicht unterstützter Medientyp. Unterstützte Medientypen: application/vnd.sap.adt.functions.groups.v2+xml"* while `CreateFunctionGroup` (which negotiates) succeeded on the same system. The handler now calls the same `negotiateFunctionGroupContentTypes()` used by `CreateFunctionGroup` **before** locking (while the session is still stateless), and injects the advertised media type into the raw PUT's `Content-Type`/`Accept`, falling back to the hardcoded v3 default only when discovery is unavailable and skipping negotiation on legacy stacks. Negotiation results are cached per connection, so a `Create` or prior `Update` in the same session costs no extra discovery round-trip. The 4.13.5 stateful-lock pin (`setSessionType('stateful')` immediately after the inline lock) is unchanged — the negotiation GET runs before it. A regression test drives the real handler over a fake connection serving a v2-only discovery document and asserts the PUT carries the negotiated v2 media type (and falls back to v3 when discovery rejects) — reverse-verified: the v2 assertion fails with the fix reverted. Verified live on IDES: the same `UpdateFunctionGroup` that returned 415 on 4.13.7 now succeeds and the new description persists (read back with `masterLanguage="CS"`).

### Notes
- **Vendored FG content-type constant asymmetry (HANDOFF §6 old backlog 3-7) is subsumed by the negotiation, no patch needed.** The upstream `@babamba2/mcp-abap-adt-clients` constants disagree on version — `ACCEPT_FUNCTION_GROUP` is `"v2, v1"` (used only by `AdtUtils` for FUGR *reads*) while `CT_FUNCTION_GROUP` is `"v3"` (create/update write default). That asymmetry only ever manifested as **write** failures on v2-only systems (reads advertise v2/v1 and succeed; writes send v3 and 415/400) — exactly the failure both 4.13.1 (create) and this release (update) resolve at runtime by negotiating from the live discovery document. After this fix every FG write path reachable from a handler negotiates; the vendored `functionGroup/update.js` (whose fallback `Accept: ct?.accept || CT_FUNCTION_GROUP` re-uses the v3 constant asymmetrically) is dead code from the engine's side — no handler calls it (`UpdateFunctionGroup` issues its own raw PUT). The static v3 write default is retained only as the discovery-unavailable fallback, where the library's newest-version default is a reasonable choice; changing it would be speculative and could regress v3-capable systems, so no `patch-package` change is made.
- **`CreateView` HTTP 400 on IDES (HANDOFF §6 engine backlog 11-④) diagnosed — NOT content-type, deferred as logon-language mismatch (backlog 11-⑧ family), not fixed here.** Live root-cause capture on IDES (logon/master language **CS**): the DDLS-create POST is rejected with `ExceptionResourceCreationFailure` — *"Sprache EN zum Anlegen der Beschreibung entspricht nicht Mastersprache CS"* (`T100KEY DDIC_ADT_DDLS/016`, V1=EN, V2=CS). The vendored `view/create.js` hardcodes `adtcore:language="EN"` / `adtcore:masterLanguage="EN"` in the metadata payload, which the DDLS create service rejects when it differs from the system master language (CS). This is the same EN-payload-vs-CS-logon-language root cause as backlog 11-⑧, surfacing here as a hard create 400 (no DDLS shell is left — the object is rejected before creation), and is out of scope for this Wave. The content-type-negotiation hypothesis is disproven (the FUGR case rejects with 415/UnsupportedMediaType; this rejects with 400/ResourceCreationFailure citing the language, not the media type). `CreateFunctionGroup` succeeds on the same system because FUGR-create tolerates the EN→CS master-language normalization that DDLS-create enforces.

## [4.13.7] - 2026-07-12

### Fixed
- **Vendored-client patch for the latent HTTP 423 "resource … is not locked (invalid lock handle)" bug (4.13.3–4.13.6 class) in the client's own full-chain lock → write → unlock paths — the cases 4.13.5 explicitly deferred as "not handler-fixable".** Handlers `UpdateLocalTestClass` / `UpdateLocalTypes` / `UpdateLocalMacros` / `UpdateLocalDefinitions` (and their Delete* siblings), `UpdateCdsUnitTest` / `CreateCdsUnitTest` (which delegate into `AdtLocalTestClass`), and `UpdateBehaviorImplementation` hand the ENTIRE chain to `@babamba2/mcp-abap-adt-clients` wrappers without a lockHandle, so no handler-side pin can help: the wrapper's internal `lock()` resets the connection to **stateless** before the intermediate `/checkruns` POST and the write PUT(s) go out, and on backends that recycle the HTTP connection (e.g. IDES) the stateful ADT session is torn down mid-chain, the ENQUEUE lock evaporates, and the write fails with an *invalid lock handle* — live-reproduced on IDES (S/4HANA 2021) with `UpdateLocalTestClass` on the 4.13.6 bundle. The vendored client is now patched via `patch-package` (`patches/@babamba2+mcp-abap-adt-clients+3.13.1.patch`, applied by the `prepare` npm hook so `npm install`/`npm ci` re-apply it; the published bundle bakes the patched code in): `AdtLocalTestClass` / `AdtLocalTypes` / `AdtLocalMacros` / `AdtLocalDefinitions` re-pin `setSessionType('stateful')` right after the parent-class lock in **both** their `create()` and `update()` full chains, `AdtBehaviorImplementation.update()` re-pins after `this.class.lock()` (its chain carries TWO writes — main-source PUT + implementations-include PUT), and `AdtClass.updateTestClasses()` (public API named in the backlog, not reachable from any current handler) no longer resets to stateless between its inline lock and the testclasses PUT. The wrappers' own `unlock()` restores stateless, so post-unlock behavior (final check, activation) is unchanged. `UpdateUnitTest` is NOT affected (its `AdtUnitTest.update()` throws "not supported" — no chain exists); `UpdateClassMethod` is NOT affected (delegates to the 4.13.3-fixed `UpdateClass` lockHandle path); `UpdateClassTestClassesLow` is NOT affected (caller-supplied lock handle + session, low-level contract); the other object wrappers' full-chain update paths (`AdtClass.update()` without lockHandle, view/table/domain/etc.) share the defect but are unreachable from every current handler (all pass a lockHandle since 4.13.5) and stay unpatched — upstream-fix candidates. A family regression test drives the six affected surfaces plus `updateTestClasses` over a fake connection and pins `x-sap-adt-sessiontype: stateful` on every request from each inline lock through the write (reverse-verified: all seven cases fail with the patch reversed). Verified live on IDES: the same `UpdateLocalTestClass` call that failed mid-chain on 4.13.6 completes on 4.13.7.
- **Known separate defect (not fixed here, discovered during the audit):** the vendored `AdtLocalTestClass/Types/Macros/Definitions.delete()` implement delete as `update(code: '')`, but every `update()` rejects empty code with "… code is required" before locking — the high-level `DeleteLocalTestClass` / `DeleteLocalTypes` / `DeleteLocalMacros` / `DeleteLocalDefinitions` tools therefore cannot ever succeed at the client level. Tracked as a backlog candidate.

## [4.13.6] - 2026-07-12

### Fixed
- **Create-family fix for the latent HTTP 423 "resource … is not locked (invalid lock handle)" bug (4.13.3–4.13.5 class): `CreateDomain`, `CreateDataElement`, `CreateTable`, `CreateMetadataExtension`, `CreateBehaviorDefinition`, `CreateInclude`.** These handlers orchestrate an inline create → lock → (attribute-write / skeleton PUT / post-create check / main-program insert) → unlock chain, and the requests issued while the ENQUEUE lock is held went out stateless — `CreateDomain`/`CreateDataElement` were live-proven on IDES during the 4.13.5 verification (both failed mid-chain with `ExceptionResourceInvalidLockHandle`, leaving half-created skeletons that lack description/type attributes and are unrepairable via the read-modify-write Update path). Each handler now keeps the session stateful from its inline lock through the unlock: `CreateDomain`/`CreateDataElement`/`CreateTable` pin after the lock (read-modify-write GET + attribute/skeleton PUT), `CreateMetadataExtension`/`CreateBehaviorDefinition` pin across the post-create `/checkruns` POST (whose statelessness invalidated the subsequent unlock, reporting the create as failed even though it succeeded), and `CreateInclude` no longer resets the session to stateless between locking the main program and PUTting its modified source. `CreateStructure` is deliberately NOT pinned — its lock/unlock pair brackets no request at all (the mechanism does not apply; the dead pair is a cleanup candidate). `CreateTextElement` locks around an RFC textpool write (not a lock-handle-validated ADT PUT) — different pathology, untouched. A parameterized family regression test pins `x-sap-adt-sessiontype: stateful` on every request from each handler's inline lock through its unlock (reverse-verified: all six cases fail without their pins).

## [4.13.5] - 2026-07-12

### Fixed
- **Family-wide fix for the latent HTTP 423 "resource … is not locked (invalid lock handle)" bug (4.13.3/4.13.4 class) across every remaining high-level Update handler that orchestrates an inline lock → write chain: `UpdateView`, `UpdateServiceDefinition`, `UpdateFunctionModule`, `UpdateFunctionGroup`, `UpdateMetadataExtension`, `UpdateBehaviorDefinition`, `UpdateTable`, `UpdateStructure`, `UpdateDomain`, `UpdateDataElement`.** Every client wrapper's `lock()` acquires the ENQUEUE lock in a stateful request but returns with the connection reset to **stateless**, and the low-level update branch (`options.lockHandle` provided) performs the raw write with no session pin — so the write PUT went out stateless, as did the intermediate requests several handlers issue between lock and PUT (pre-write `/checkruns` POSTs for view/table/structure, read-modify-write GETs for domain/data element/function group — the vendored `updateDomain`/`updateDataElement` even document "requires stateful session" in their own comments). On backends that recycle the HTTP connection (e.g. IDES), SAP routes a stateless request through a fresh work process, tears the stateful ADT session down, the lock evaporates, and the write fails with an *invalid lock handle*. Each handler now re-asserts `setSessionType('stateful')` immediately after its inline lock; `unlock()` restores stateless. For `UpdateMetadataExtension`/`UpdateBehaviorDefinition` the pin applies only when the handler locked inline — caller-supplied `lock_handle` flows manage their own session. A parameterized family regression test pins `x-sap-adt-sessiontype: stateful` on every request from the lock through the write for all ten handlers (reverse-verified: all ten cases fail without their pins). Known remaining (library-level, not handler-fixable): `AdtClass.updateTestClasses` and the wrappers' own full-chain update paths (no `lockHandle` passed) reset to stateless internally between lock and PUT — affects the local-include/test-class handlers; requires a vendored-client patch and is tracked separately.

## [4.13.4] - 2026-07-12

### Fixed
- **`UpdateInterface` and `UpdateProgram` (high-level) had the same latent HTTP 423 "resource … is not locked (invalid lock handle)" bug fixed for `UpdateClass` in 4.13.3.** Both handlers orchestrate their own lock → pre-write syntax check → source PUT → unlock chain inline. `getInterface().lock()` / `getProgram().lock()` acquire the ENQUEUE lock in a stateful request but return with the connection reset to **stateless** (both wrap `setSessionType('stateful')` → lock → `setSessionType('stateless')` internally), so the intermediate pre-write `/checkruns` POST and the subsequent source PUT went out stateless. On backends that recycle the underlying HTTP connection (e.g. IDES), SAP routes a stateless request through a fresh work process that has no record of the stateful ADT session, tears the session down, and the lock evaporates — the PUT then fails with an *invalid lock handle* seconds after the lock appeared to succeed. Both handlers now re-assert `setSessionType('stateful')` immediately after the lock, so the pre-write check and the PUT ride the same stateful session as the lock; `unlock()` restores stateless afterwards. Directly-connected systems that retained the session anyway (e.g. KR-DEV) are unaffected. Regression tests pin `x-sap-adt-sessiontype: stateful` on both the intermediate check and the PUT for each handler (reverse-verified: each test fails without its fix). Closes HANDOFF §6 engine backlog 9. The low-level `UpdateInterfaceLow` / `UpdateProgramLow` handlers are unaffected — they take a caller-supplied lock handle and session state and do not lock inline.

## [4.13.3] - 2026-07-12

### Fixed
- **`UpdateClass` (high-level) failed with HTTP 423 "resource … is not locked (invalid lock handle)" on systems that recycle the HTTP connection between requests (e.g. IDES).** The handler orchestrates its own lock → pre-write syntax check → source PUT → unlock chain. `getClass().lock()` acquires the ENQUEUE lock in a stateful request but returns with the connection reset to **stateless**, so the intermediate pre-write `/checkruns` POST (and the subsequent source PUT) went out stateless. On backends that recycle the underlying HTTP connection, SAP routes a stateless request through a fresh work process that has no record of the stateful ADT session, tears the session down, and the lock evaporates — the PUT then fails with an *invalid lock handle* a few seconds after the lock appeared to succeed (each retry re-locks, so the reported handle differs every time). The handler now re-asserts `setSessionType('stateful')` immediately after the lock, so the pre-write check and the PUT ride the same stateful session as the lock; `unlock()` restores stateless afterwards. Same fix class as the `UpdateInclude` path (already stateful) and vsp issue #88. Directly-connected systems that retained the session anyway (e.g. KR-DEV) are unaffected — stateful lock/check/write is the normal Eclipse-ADT protocol. Regression test pins `x-sap-adt-sessiontype: stateful` on both the intermediate check and the PUT.

## [4.13.2] - 2026-07-11

### Security
- **Tier guard now fails closed when SAP_TIER is unresolved on a live connection.** Previously a missing or unrecognized `SAP_TIER` resolved to `DEV` (`normalizeTier` "unknown/missing → DEV"), and the readonly guard treats `DEV` as allow-all — so a profile or legacy `sap.env` that simply omitted the tier, or set a typo (`STG`, `PROD`), silently opened every write/mutation tool. A loaded connection whose tier cannot be resolved to `dev`/`qa`/`prd` now resolves to a new fail-closed `UNKNOWN` tier that the guard treats as the most restrictive column (reads allowed; mutations, unit-test execution, and profiling all blocked). Only an explicit `SAP_TIER=dev` (case-insensitive) opens writes. The connectionless inspection-only shell keeps its permissive `DEV` default — harmless, since every tool call fails at connect time anyway — so tool-list exposition is unchanged. `--env-path` / `MCP_ENV_PATH` connections (which carry no `.sc4sap` profile) were the widest hole: their `SAP_TIER` was never read, so QA/PRD env files ran wide-open. `SAP_TIER` is now hydrated from the env file and reconciled into the guard cache after config load, with the same fail-closed default. `.sc4sap` profiles that already set `SAP_TIER=dev` are unaffected.
- **`GetSqlQuery` table-extraction bypass closed (defense-in-depth blocklist).** `extractTablesFromSql` used `/\b(?:FROM|JOIN)\s+([A-Z0-9_/]+)/` which missed comma-separated tables (`FROM SAFE_TABLE, KNA1` extracted only `SAFE_TABLE`, dropping the protected `KNA1`) and mis-parsed a comment between `FROM` and the table (`FROM /*c*/ KNA1` extracted `/`), letting protected tables slip past the row-extraction gate. Extraction now (1) strips `/* … */` and `--` comments first, (2) parses comma-separated table lists (skipping `AS`/bare aliases), and (3) still scans every `FROM`/`JOIN`, so subquery and JOIN sources are captured. A **fail-closed** guard was added: if a table source survives comment stripping (`FROM`/`JOIN` present) but no table name can be parsed, `GetSqlQuery` is refused with guidance to rewrite as a simple `FROM <table>` — a parser blind spot can no longer bypass the gate.

## [4.13.1] - 2026-07-11

### Fixed
- **ABAP Unit execution never worked on on-prem releases** — `RunUnitTest` (and the run_id readers `GetUnitTestStatus` / `GetUnitTestResult` / `GetUnitTest`) posted to `/sap/bc/adt/abapunit/runs`, the ABAP-Cloud-only async API; live ADT discovery on both S/4HANA 2021 and BASIS 7.00 confirms the collection does not exist there (HTTP 404). The high-level handlers now use the classic Eclipse-ADT endpoint (`POST /sap/bc/adt/abapunit/testruns` with a `testruns.config.v1+xml` runConfiguration — including the `<options>` block whose absence makes SAP silently select zero tests, the trap the legacy path sits in) and bridge the synchronous response into the existing run_id contract via an in-memory, **connection-scoped**, TTL-bounded store (30 min / 200 runs, checked on read and write). Container-class names are URI-encoded (namespaced objects), responses without an `<aunit:runResult>` root are rejected instead of cached, the synchronous call gets a ≥5-minute timeout, per-`test_class` sub-selection being unsupported by the classic protocol is stated in the response, and `format:"junit"` is rejected explicitly. Verified live on S/4HANA 2021: 2 test classes / 4 methods, all pass.
- **`CreateFunctionGroup` failed with HTTP 400 ("Daten sind ungültig und konnten nicht konvertiert werden") on systems advertising only `groups.v2`** — the vendored client hardcodes `functions.groups.v3+xml` (its own `ACCEPT_FUNCTION_GROUP` is "v2, v1" — asymmetric). The handler now negotiates the content type from the live ADT discovery document (quote/slash/absolute-href tolerant extraction, highest advertised version, per-connection cache; falls back to current defaults when discovery is silent). The legacy branch is untouched and skips negotiation entirely. A/B-probed on the same payload: v3→400, v2→200; verified create+activate+delete live.

## [4.13.0] - 2026-07-07

### Added
- **`ReleaseTransport`** (high-level) — release a transport request or task via the ADT CTS release action (`POST /sap/bc/adt/cts/transportrequests/<trkorr>/newreleasejobs`). Completes the transport lifecycle (previously only create/get/list existed, so releases had to happen in SE09/SE10/STMS outside the server). The readonly guard auto-classifies it as mutating (DEV-only; blocked on QA/PRD). Response parsing (`parseReleaseJobResponse`) is defensive across the varying release-report / refreshed-request / job-acknowledgement shapes SAP returns — unknown shapes yield nulls plus a raw excerpt rather than silently dropping data. **The compact matrix is intentionally unchanged** (`ReleaseTransport` is high-level only). Because the ADT release action is absent from this repo's captured discovery document, a 404/405 is surfaced as a success payload `{ supported: false, hint: ... }` (mirroring `GetInstalledComponents`) instead of a tool error.

### Changed
- **ADT exception XML in HTTP error responses is now parsed into readable text.** The central `return_error` path previously truncated an `<exc:exception>` error body to 2000 chars of raw XML; it now routes such bodies through the existing `extractAdtErrorMessage` parser to produce `SAP Error: <message> [HTTP nnn]`. Non-XML bodies, the object branch, and the network-error mappings (ENOTFOUND/ECONNREFUSED/ETIMEDOUT) are unchanged. `GetObjectInfo`'s error-entry filter was widened (`Error: <?xml` → `Error:`) so parsed error text is still skipped when scanning SearchObject results.

### Docs
- README tool counts re-synced to the generator (`AVAILABLE_TOOLS.md` is the source of truth): total **287 → 339**, Read-Only 52→70, High-Level 113→135 (includes the 22 Compact), Low-Level 122→134. `tools/generate-tools-docs.js` now emits a non-fatal drift warning when a README advertises a total that no longer matches the code-derived count.

## [4.12.0] - 2026-07-07

### Security
- **Readonly guard rewritten fail-closed.** The tier guard classified mutations by `Create*`/`Update*`/`Delete*` name prefix only; an audit of the full 338-tool registry found ~60 mutating tools that bypassed it on QA/PRD profiles — `Activate*` (17), `Lock*`/`Unlock*` (35), `PatchGuiStatus`, `WriteTextElementsBulk`, and the compact dispatchers `HandlerCreate`/`HandlerUpdate`/`HandlerDelete`/`HandlerActivate`/`HandlerLock`/`HandlerUnlock`/`HandlerTransportCreate`. On QA/PRD a tool is now allowed only if positively classified read-only (read prefixes / compact read set) or by the execution matrix; unknown and future tools are blocked by default. Unit-test execution (`RunUnitTest`, `RunClassUnitTestsLow`, `HandlerUnitTestRun`) stays QA-allowed; profiling runs (`RuntimeRun*`, `HandlerProfileRun`) stay DEV-only.

### Fixed
- Empty `SAP_RFC_BACKEND=` resolves to the documented `odata` default instead of silently selecting the legacy `soap` backend (leftover from the 2026-04-22 default switch).

### Added
- Regression suite for the 4.8.3 keychain bug: session-store seeding must resolve `keychain:<service>/<account>` references to plaintext (literal pass-through caused 401 → account lockout after 3 tries); missing keychain entries surface as errors.

### Changed
- Fork identity completed: `server.json` / `glama.json` / README links / CONTRIBUTORS now consistently `@hjaewon` (4.9.0 had only migrated `package.json`); changelog backfilled for 4.7.0–4.8.2.
- CI: SAP-independent unit suites (`__tests__/lib`, `__tests__/unit`) are a required gate (previously all tests were advisory via `continue-on-error`); package smoke-install glob follows the `@hjaewon` scope; release notes install snippet and docs link corrected.

## [4.11.0] - 2026-07-06

### Added
- `GetCallGraph` — read-only call-relationship graph via server-side BFS (replaces dozens of chained `GetWhereUsed` round-trips). `direction` callers (where-used traversal) / callees (source fetch + dependency scan) / both, `depth` 1-4, `max_nodes` cap with `truncated` flag, `custom_only` gate (standard SAP objects appear as leaves but are not expanded). Function modules discovered mid-traversal resolve their function group from the where-used reference URI; unresolvable ones are marked `expandable:false`. Static analysis only — dynamic calls / BAdI dispatch are not captured. Object-level nodes (method-scoped where-used is not exposed by the ADT client wrapper).

### Notes
- Phase 3 (vsp package-analysis suite: health/slim/boundaries/api-surface) intentionally NOT ported to the server — those are composition pipelines best built as sc4sap skills over existing primitives. GetCallGraph is the only Phase-3 item that belongs server-side (round-trip/token economics).

## [4.10.2] - 2026-07-06

### Fixed
- `UpdateInterface` never passed `transport_request` to the ADT update call (`corrNr` URL param) — it was only echoed in the response, so updates to interfaces in transportable packages relied on the object already being in an open task. Now forwarded like `UpdateClass`; also fixes `UpdateSourceByPatch` on INTF.

## [4.10.1] - 2026-07-06

Codex review fixes on the 4.10.0 vsp-adopt tools (3 verified P2 findings).

### Fixed
- `GetClassMethod` / `UpdateClassMethod`: method statement parser now accepts AMDP additions (`METHOD x BY DATABASE PROCEDURE ...`, including multi-line statements) and namespaced names (`/iwbep/if_x~method`) — previously reported such methods as missing and rejected valid replacement blocks.
- `GrepPackages` / `GrepObjects`: an object exceeding the 20000-line scan cap no longer aborts the whole package scan as if `max_results` were reached; per-object truncation is now reported separately (`truncated_object` / distinct skip reason) and the global stop only triggers on the actual match budget.
- `GetSourceDiff`: common prefix/suffix trimming before the LCS matrix plus a hard 4M-cell guard — two large mostly-identical sources no longer allocate O(N*M) memory, and fully-differing oversized inputs return a structured `too_large` result instead of stalling the server.

## [4.10.0] - 2026-07-06

vsp ([vibing-steampunk](https://github.com/oisee/vibing-steampunk)) feature adoption — token-efficiency and code-intelligence tools.

### Added
- `UpdateSourceByPatch` — surgical old_string/new_string patch edit for CLAS/PROG/INTF/INCL/FUNC; uniqueness-validated, delegates to the existing Update* flows (lock → syntax check → update → unlock → optional activate) so a broken patch never lands.
- `GetClassMethod` / `UpdateClassMethod` — method-level read/edit for classes (~95% token reduction vs full-class round-trips); splices a single METHOD block and revalidates the whole class before writing.
- `CheckSyntax` — standalone read-only syntax check (proposed source for CLAS/PROG/INTF; current inactive version for INCL/FUNC).
- `GetSourceDiff` — client-side unified diff between two ABAP objects (CLAS/PROG/INTF/INCL), dependency-free LCS implementation.
- `GrepObjects` / `GrepPackages` — regex source search across explicit object lists / package hierarchies (subpackage recursion, context lines, type filter, global max_results cap with early fetch stop). FUNC excluded structurally (package listings carry no parent function group).
- `GetSystemInfo` / `GetInstalledComponents` — system identity (SID/client/modern-vs-legacy stack hint) and software component list; degrade to `supported:false` instead of erroring on releases without the endpoints.
- `GetClass` / `GetInterface` / `GetProgram`: opt-in `with_context` + `context_max_deps` — appends a `dependency_context` JSON field with compressed public contracts (public section / interface / FM signature) of referenced objects, 7–30x smaller than fetching full dependency sources.

### Notes
- All new write tools follow the `Update*` prefix so sc4sap QA/Prod prefix guards cover them; everything else is read-only.
- MCP `tools/list` (default exposition): 144 → 153 tools.

## [4.9.1] - 2026-07-06

Codex review follow-ups on the 4.9.0 bundle distribution.

### Fixed
- `--version` resolved package.json two levels above the package root when run from the single-file bundle (`dist/server.bundle.cjs`); now walks upward so both bundled and unbundled layouts work.
- Removed `main` pointing at the executable bundle — `require()` of the package no longer boots the MCP server as an import side effect (CLI-only distribution).
- `getDefaultLogger()` (BaseMcpServer / EmbeddableMcpServer / handlerLogger) falls back to a no-op logger when `@babamba2/mcp-abap-adt-logger` is absent — the published tarball ships without it.
- Docs: `@mcp-abap-adt/core` references updated to `@hjaewon/abap-mcp-adt-powerup`, phantom `mcp-abap-adt-v2` bin references removed, library subpath import example marked source-checkout-only.
- Deduplicated `pino`/`pino-pretty` (were in both dependencies and devDependencies with different ranges).

## [4.9.0] - 2026-07-06

First release under `@hjaewon/abap-mcp-adt-powerup` (independent fork; upstream `@babamba2` remains at 4.8.4).

### Added
- `GetAtcFindings` — read-only ATC (ABAP Test Cockpit) findings tool: object → ADT URI resolution, worklist run, parsed findings with priority/check title/message. (`feat/atc-findings`)
- Single-file server bundle `dist/server.bundle.cjs` built with esbuild (`npm run bundle`). Internal `@babamba2/mcp-abap-*` runtime packages, MCP SDK, axios, XML/YAML parsers and zod are baked in; `pino`/`pino-pretty` (dynamic transport loading) and native optionals (`node-rfc`, `@napi-rs/keyring`) stay external.

### Changed
- npm distribution is now the bundle only: tarball 7 files / ~1.4MB, installs 2 runtime deps (+2 optional) instead of the full dependency tree. Verified identical MCP `tools/list` (144 tools) against the unbundled server.
- `bin/mcp-abap-adt` runs the bundle; nonexistent `mcp-abap-adt-v2` bin entry removed.
- Library subpath exports (`./handlers`, `./utils`, `./server`) removed from the published package — for library consumption use the upstream `@babamba2` package or this repo's source.

## [4.8.4] - 2026-04-29

### Added
- ECC 7.40 DDIC **read** fallback via OData RFC. 4 handlers (`GetTable / GetStructure / GetDataElement / GetDomain`) activate on `SAP_VERSION=ECC`, routing DDIC reads through server-side FMs (`ZMCP_ADT_DDIC_TABL_READ / _DTEL_READ / _DOMA_READ`) invoked via OData FunctionImports on `ZMCP_ADT_SRV`. `TABL_READ` covers both Table and Structure (TABL/STRU share TABL DDIC category). Validated 2026-04-29 on HKT-DEV (path=ecc-odata-rfc).
- `GetBadiImplementations` — new read-only handler to find Z/Y implementations of classic BAdI definitions. ECC-only: routes through `ZMCP_ADT_DDIC_BADI` bridge FM (SXS_ATTR-based lookup). Returns `kind=classic` with implementation list (`impl_name`, `impl_class`, `package`, `methods_redefined`) or `kind=unknown` for kernel BAdIs / non-existent definitions. Use during symptom analysis when a standard BAdI is implicated.
- `lib/odataRfc.ts`: 4 new adapters (`callDdicTablRead / DdicDtelRead / DdicDomaRead / DdicBadi`) + `DdicReadResult` / `DdicBadiResult` types.
- `lib/rfcBackend.ts`: 4 new wrappers + informative error for non-odata backends.

## [4.8.3] - 2026-04-24

### Fixed
- Keychain password resolution in broker-based auth path. `EnvFileSessionStore` (from `@babamba2/mcp-abap-adt-auth-stores`) reads `SAP_PASSWORD` raw from the .env file and does not know about `keychain:<service>/<account>` references, so `authBroker.getConnectionConfig()` returned the literal reference string as the Basic Auth password → 401 → account lockout after 3 tries. `profile.ts activateProfile()` only fixed `process.env.SAP_PASSWORD`, which the v2 broker architecture (`lib/utils.ts:515` "No fallback to getConfig()") does not read. `brokerFactory.ts` now calls `resolveSecret()` on both `createBrokerWithEnvFileStore` (Variant 2, --env=path) and `loadEnvFileIntoSessionStore` (Variant 3, cwd .env) and seeds the session store's `inMemoryUpdates` so downstream reads return plaintext.

## [4.8.2] - 2026-04-23

### Fixed
- Transport handlers (3 bugs): `ListTransports` parser looked for `tm:request` directly under `tm:workbench` and missed the `tm:modifiable` / `tm:released` middle layer — silently returned 0 transports (new `collectRequests()` walks every category × status combination). `GetTransport` unifies the S/4 single-TR path URL vs the ECC user-scoped list (new `owner` input param for cross-user queries on ECC; response gains `resolved_via` / `view_type`). Accept header now content-negotiates `transportorganizertree.v1+xml` alongside `transportorganizer.v1+xml` (S/4 rejected the latter with HTTP 406). Not-found throws `McpError(InvalidParams)` instead of returning a 200 all-nulls stub.

## [4.8.1] - 2026-04-22

### Added
- ECC 7.40 DDIC write fallback via OData RFC. 9 handlers (Domain/DataElement/Table × CRUD) activate on `SAP_VERSION=ECC`, routing DDIC writes through server-side FMs (`ZMCP_ADT_DDIC_{TABL,DTEL,DOMA,ACTIVATE}`) invoked via OData FunctionImports on `ZMCP_ADT_SRV`. Full implementations: Domain C/U/D + DataElement C/U/D (type_kind=domain only) + Table Delete. Inform-only: Table Create/Update (CDS-DDL translator deferred).
- `lib/odataRfc.ts`: `callDdicTabl / DdicDtel / DdicDoma / DdicActivate` + `DdicResult` type.
- `lib/rfcBackend.ts`: 4 new wrappers + informative error for non-odata backends.

## [4.8.0] - 2026-04-21

### Added
- Multi-profile activation on server start (`profile.ts`) — `.sc4sap` profile files select the active SAP destination.
- Server-side readonly guard (`readonlyGuard.ts`) — tier-based (DEV/QA/PRD) block matrix that fires before every handler on non-DEV tiers; last line of defense independent of any client-side hook.
- Secrets management via `@napi-rs/keyring` (optional dep, `secrets.ts`) — `SAP_PASSWORD=keychain:<service>/<account>` resolves from the OS keychain.
- `ReloadProfile` handler (system/readonly) — escape hatch to switch back to a DEV profile.
- `zcl_mcp_rfc_http_handler.abap` sample + ZRFC_SETUP guide + architecture.html.

### Fixed
- Legacy SAP `GetPackage` emits a `legacy_limited` flag instead of throwing on missing metadata.

## [4.7.1] - 2026-04-19

### Changed
- Version-alignment release (package metadata only, no code changes).

## [4.7.0] - 2026-04-17

### Added
- Runtime feeds: `RuntimeListFeeds` (descriptor+dumps+sm+gw single reader), `RuntimeListSystemMessages` (SM02), `RuntimeGetGatewayErrorLog` (/IWFND/ERROR_LOG list + detail), `RuntimeGetDumpById` `response_mode={payload,summary,both}`. ADT Atom-feed parsing ported locally (upstream adt-clients 3.10.2 does not expose the v5 FeedRepository).
- Mass activation: `ActivateObjects` — batch activation via a single `/sap/bc/adt/activation/runs` call, resolving cyclic cross-references that break per-include activation. `ActivateObjectLow` honors the input `uri`; `CreateInclude` gains `source_code` + `activate_main_program`.
- `PatchGuiStatus` (GUI status surgical patch) and `WriteTextElementsBulk` (text-elements bulk write).

## [4.5.2] - 2026-03-27

### Added
- Pre-commit hook via husky + lint-staged — auto-fixes formatting and lint issues before commit so CI stays green.

## [4.5.1] - 2026-03-26

### Changed
- Rewrite `ListTransports` handler to use `AdtClient.getRequest().list()` with proper Accept negotiation instead of direct `connection.makeAdtRequest()`. Update `@mcp-abap-adt/adt-clients` to 3.13.0.
- Add integration tests for `ListTransports` handler.

## [4.5.0] - 2026-03-26

### Fixed
- Give `SAP_AUTH_TYPE` priority over `SAP_JWT_TOKEN` in test helpers — fixes onprem basic-auth tests failing when OS has stale BTP JWT token (#24).

### Changed
- Update `@mcp-abap-adt/adt-clients` to 3.12.0 — adds 415 Content-Type negotiation with auto-retry and caching. Accept correction enabled by default (#22, #23).

## [4.4.2] - 2026-03-26

### Fixed
- Guarantee unlock via `try-finally` in all update handlers — prevents locked objects when errors occur between lock and unlock (#22). Affected: UpdateProgram, UpdateClass, UpdateInterface, UpdateView, UpdateTable, UpdateStructure, UpdateDomain, UpdateServiceDefinition, UpdateDataElement.

## [4.4.1] - 2026-03-26

### Improved
- Rewrite `SearchObject` tool description with operation-first approach for better RAG discoverability (#21). Description now leads with action verbs (find, search, locate, check exists) instead of object type lists, so embedding vectors match user intent queries like "is there a program named X?".

## [4.4.0] - 2026-03-22

### Improved
- Enrich 15 tool descriptions with domain-specific keywords for better vector RAG discoverability (#20). Tools like `SearchObject`, `GetTypeInfo`, `GetTransaction`, `GetTableContents`, and others now include ABAP object type names (DEVC, CLAS, TABL, DDLS, BDEF, DDLX, etc.) so embedding-based tool discovery returns correct results.

## [4.3.2] - 2026-03-20

### Improved
- Suppress `ping` request logging in StreamableHttpServer and SseServer — ping is now silent unless debug logging is enabled, reducing log noise.

## [4.3.1] - 2026-03-20

### Improved
- StreamableHttpServer request logging now includes MCP method, tool name, destination, and completion status. Helps diagnose issues like #19 where health polls generate excessive `tools/list` noise.

## [4.3.0] - 2026-03-19

### Added
- `GET /mcp/health` endpoint for HTTP and SSE transports — lightweight health check without MCP protocol overhead. Returns `status`, `uptime`, `version`, `transport`, and `activeSessions` (SSE only). Resolves #18.
- Unit tests for health endpoint (both transports).

## [4.2.1] - 2026-03-15

### Fixed
- Shorten `server.json` description to fit MCP registry 100-character limit.

## [4.2.0] - 2026-03-15

### Added
- **16 new Read\* tools** — read source code and metadata for all object types with CRUD handlers:
  ReadClass, ReadInterface, ReadProgram, ReadTable, ReadStructure, ReadView, ReadDomain,
  ReadDataElement, ReadFunctionModule, ReadFunctionGroup, ReadPackage, ReadServiceDefinition,
  ReadServiceBinding, ReadMetadataExtension, ReadBehaviorDefinition, ReadBehaviorImplementation.
- `transport_request` parameter for UpdateBehaviorDefinition (low), UpdateMetadataExtension (high).
- `record_changes` parameter for CreatePackage (high + low).
- Transported Object CRUD integration test reproducing GitHub #11 (transport lock issue on legacy systems).

### Fixed
- `SAP_SYSTEM_TYPE` now propagated from test config to `process.env`, so `createAdtClient` correctly selects `AdtClientLegacy` on legacy systems.
- `transport_request` passed in class update tests for transportable packages.
- UpdateDataElement now passes `transportRequest` to adt-clients.
- BDEF low test resilience: guaranteed BIMPL unlock via try/finally, delay after delete in cleanup, skip create if BDEF already exists (transport re-create limitation).
- Removed duplicate GetFunction handler (delegates to GetFunctionModule).
- Auto-detect JWT auth for `--env-path`, SAP_CLIENT auto-resolve.

## [4.1.1] - 2026-03-13

### Fixed
- Unit test `systemContext.test.ts` updated to match `SAP_SYSTEM_TYPE` env var approach (removed obsolete `isModernAdtSystem` mock).

## [4.1.0] - 2026-03-13

### Added
- `SAP_SYSTEM_TYPE` environment variable (`cloud` | `onprem` | `legacy`) to explicitly control SAP system type. Default: `cloud`.
- `--system-type` CLI argument as alternative to the env var.
- Eager HTTP session initialization — `connect()` is now called for all connection types (not just RFC), establishing CSRF token and cookies before the first request.

### Changed
- Removed unreliable auto-detection via `/sap/bc/adt/core/discovery`. System type is now determined solely by `SAP_SYSTEM_TYPE`.
- **Migration note:** on-premise users must set `SAP_SYSTEM_TYPE=onprem` in `.env` to access on-premise-only tools (e.g., Programs).

### Fixed
- 403 errors on first request to SAP systems (e.g., E96) that require pre-established session cookies.
- Inconsistent legacy detection across different shell environments, proxy configs, and ICM sessions.

## [4.0.0] - 2026-03-13

### Added
- **Legacy system support (BASIS < 7.50)**: automatic detection of legacy systems, `AdtClientLegacy` factory, RFC connection transport via `SADT_REST_RFC_ENDPOINT`.
- **RFC connection type**: `--connection-type=rfc` CLI flag and `SAP_CONNECTION_TYPE=rfc` env var for legacy systems requiring SAP NW RFC SDK.
- **`available_in` mechanism**: each handler's `TOOL_DEFINITION` declares supported environments (`onprem`, `cloud`, `legacy`). Unsupported tools are hidden from clients at registration time.
- **Legacy `available_in` on 102 handlers**: Class, Interface, View, Program, Function Group/Module, Package (read/update/delete), Include, Unit Test, and common utilities.
- **FunctionGroup/FunctionModule on cloud**: previously restricted to on-premise only.
- **Runtime profiling and dumps on cloud**: class-based profiling now works on ABAP Cloud.
- **Shared dependencies management**: `npm run shared:setup` / `shared:teardown` / `shared:check` for test objects.
- **Test infrastructure**: `test:init` / `test:reinit` scripts, explicit connection config (`env`, `system_type`, `connection_type`) in `test-config.yaml`, `available_in` support in test cases for system-aware skipping.
- **AVAILABLE_TOOLS_LEGACY.md**: generated documentation listing 115 legacy-compatible tools.

### Changed
- **BREAKING: Node 18 dropped** — minimum Node.js version is now 20.0.0.
- **BREAKING: `@mcp-abap-adt/adt-clients` upgraded** from 2.x to 3.11.2 (major API changes).
- **BREAKING: `@mcp-abap-adt/connection` upgraded** to 1.5.3.
- **CI matrix**: Node 20 + 25 on 3 OS for push/PR; Node 20/22/24/25 for release.
- **Guaranteed unlock**: force-release DDIC locks, unlock-on-error in CreateDataElement/CreateDomain.
- **TADIR conflict retry**: automatic retry on 409 TADIR conflict during create operations.

### Fixed
- Circular reference in CDS unit test handlers.
- i18n check handling (adt-clients 3.8.7).
- MetadataExtension high/low test object conflicts (separate config keys).
- Function test lock conflicts (separate high/low test objects).
- Package tests use `update()` for lock/unlock.
- Jest 30 deprecated `--testPathPattern` migrated to `--testPathPatterns`.
- `SAP_USER` → `SAP_USERNAME` in configuration examples.

## [3.2.1] - 2026-03-07

### Fixed
- **Integration test cleanup**: close MCP connections, reuse auth session, random ports.

## [3.2.0] - 2026-03-05

### Added
- **GetTableContents handler**: fully implemented — was a stub returning "temporarily unavailable", now reads table data via ADT Data Preview API with field extraction and SQL query generation.

### Changed
- **parseSqlQueryXml**: exported from `handleGetSqlQuery` for reuse in `GetTableContents`.

## [3.1.0] - 2026-03-04

### Added
- **BehaviorImplementation low-level MCP tools**: registered `ValidateBehaviorImplementationLow`, `CreateBehaviorImplementationLow`, `LockBehaviorImplementationLow` in LowLevelHandlersGroup.

### Fixed
- **System context not passed to AdtClient**: `createAdtClient()` now forwards `responsible` and `masterSystem` from resolved system context to `AdtClient` options. Fixes package creation on BTP Cloud failing with "Enter a valid user, not , as the person responsible".
- **ValidatePackageLow schema**: added missing `super_package` property to `inputSchema.properties` (was in `required` but not declared — MCP SDK rejected the parameter in hard mode).
- **CreatePackageLow handler**: removed incorrect `createResult` check — `AdtPackage.create()` returns `{ errors: [] }` without `createResult` (packages are containers with no response body).

## [3.0.0] - 2026-03-04

### Changed
- **BREAKING: Separate Create and Update** — Create handlers no longer accept source code. Use Update after Create to set source code.

## [2.7.5] - 2026-03-03

### Fixed
- **MCP Registry publish**: sync `server.json` version with npm package version (`2.5.2` → `2.7.5`).

## [2.7.4] - 2026-03-03

### Added
- **System context HTTP headers for HTTP/SSE transport**:
  - `x-sap-master-system` and `x-sap-responsible` headers allow per-request system context override.
  - Priority: HTTP headers → `process.env` → cloud `getSystemInformation()` API.
  - Enables on-prem transport request binding for HTTP/SSE connections without `.env` file.
- **System context cache isolation**: cache is reset before each non-stdio request to prevent stale values leaking between requests targeting different SAP systems.

## [2.7.3] - 2026-03-03

### Fixed
- **Release workflow lint gate** for `v2.7.2`:
  - Applied Biome formatting/import ordering fixes in updated hard-mode test infrastructure and integration suites.
  - Kept hard-mode behavior unchanged; this patch is focused on CI/release pipeline stability.

## [2.7.2] - 2026-03-03

### Added
- **YAML-driven MCP hard mode test infrastructure**:
  - Added `environment.integration_hard_mode` support for integration tests.
  - Added real MCP client execution path for `stdio`, `sse`, and `http` transports.
  - Added MCP CRUD smoke/matrix scripts in `tools/`.

### Fixed
- **Real MCP integration gaps in tests**:
  - Lambda-based integration suites now support hard mode via real MCP tool calls.
  - `LowTester` hard mode now bootstraps MCP session (`GetSession`) so low-level lock/unlock flows receive required `session_id`.
  - Hard mode test object names now include per-run suffix to prevent object name collisions between runs.
- **System context bootstrap on server startup**:
  - Launcher now hydrates on-prem system context env values earlier so real MCP runs consistently resolve context.

## [2.7.1] - 2026-03-01

### Added
- **`SAP_MASTER_SYSTEM` and `SAP_RESPONSIBLE`** documented in CLI help (`--help`) and `.env.example`.

## [2.7.0] - 2026-03-01

### Added
- **System context support for on-premise systems** (issue #11):
  - `masterSystem` and `responsible` are now passed to all ADT create/update XML requests via `IAdtSystemContext`.
  - On-prem resolution: `SAP_MASTER_SYSTEM` env var → `getSystemInformation()` API fallback (cloud).
  - Responsible resolution: `SAP_RESPONSIBLE` env var → `SAP_USERNAME` fallback → API.
  - Ensures correct transport request binding on on-premise systems.
- **New `.env` variables for on-premise configuration**:
  - `SAP_MASTER_SYSTEM` — SAP system ID (e.g., `E19`, `DEV`). Required for on-prem create/update operations.
  - `SAP_RESPONSIBLE` — Responsible user (optional, falls back to `SAP_USERNAME`).
- **Test infrastructure**: `resolveTestSystemContext()` resolves system context from YAML config for integration tests.

### Changed
- **Upgraded `@mcp-abap-adt/adt-clients`** from `^2.0.0` to `^2.2.0`.
- Renamed `default_system` → `default_master_system` in test config template.

## [2.6.1] - 2026-02-27

### Fixed
- **`UpdateProgram` missing `transport_request`**: Added `transport_request` to schema, interface, and `.update()` call — same fix as other handlers in 2.6.0.

### Changed
- **Upgraded `@mcp-abap-adt/adt-clients`** to `1.2.2`.

## [2.6.0] - 2026-02-27

### Added
- **`ListTransports` tool** (read-only):
  - Lists transport requests for the current or specified user.
  - Filters by modifiable status (default: modifiable only).
  - Use before create/update to find the correct transport request.

### Fixed
- **`transportRequest` forwarding in all high-level handlers** (issue #11):
  - Create handlers now forward `transportRequest` to the internal update (PUT) step: `CreateFunctionModule`, `CreateTable`, `CreateInterface`, `CreateView`, `CreateProgram`, `CreateDomain`, `CreateDataElement`.
  - Standalone update handlers now forward `transportRequest`: `UpdateStructure`, `UpdateDomain`, `UpdateServiceDefinition`.
  - Added `transport_request` to tool schemas where it was missing: `UpdateClass`, `UpdateView`, `UpdateBehaviorDefinition`.

### Changed
- **Upgraded `@mcp-abap-adt/adt-clients`** from `0.3.22` to `1.2.1`.

### Documentation
- Regenerated tools documentation:
  - `docs/user-guide/AVAILABLE_TOOLS.md`
  - `docs/user-guide/AVAILABLE_TOOLS_HIGH.md`
  - `docs/user-guide/AVAILABLE_TOOLS_LOW.md`
  - `docs/user-guide/AVAILABLE_TOOLS_COMPACT.md`
  - `docs/user-guide/AVAILABLE_TOOLS_READONLY.md`

## [2.5.2] - 2026-02-23
### Fixed
- **`--mcp` precedence over local `.env`**:
  - Fixed CLI fallback logic so `.env` from current working directory is no longer auto-loaded when `--mcp=<destination>` is provided.
  - Startup auth source display now correctly prioritizes `service-key: <destination>` over `.env`.
- **JWT auth error diagnostics**:
  - Improved HTTP/SSE request-time error reporting for missing JWT tokens by surfacing token provider failure reason in `BaseMcpServer`.
- **Auth broker runtime behavior**:
  - Fixed v2 auth-broker config to respect `--unsafe` instead of always forcing safe in-memory stores.

### Added
- **Browser OAuth callback port override**:
  - Added `--browser-auth-port=<port>` and `MCP_BROWSER_AUTH_PORT` to override auth callback server port (useful when default ports are occupied).
- **Inspector runtime dependency safety**:
  - Added explicit `express-rate-limit` dev dependency to avoid missing transitive package issues during `dev:http` inspector startup.

### Documentation
- Updated auth and CLI docs for `--mcp` behavior and browser auth callback port override:
  - `README.md`
  - `docs/user-guide/AUTHENTICATION.md`
  - CLI help text via `ServerConfigManager`.

## [2.5.1] - 2026-02-21
### Changed
- **Compact handler descriptions**:
  - Reworked compact handler descriptions to be explicit and deterministic for tool routing.
  - Added per-`object_type` required parameter mapping directly in handler descriptions (`TYPE(param*)` format).
  - Clarified read vs validate intent to avoid `HandlerGet` / `HandlerValidate` confusion.
- **Compact schemas metadata**:
  - Added missing parameter descriptions in compact schemas to remove `No description` in generated tool docs.

### Documentation
- Regenerated tools documentation:
  - `docs/user-guide/AVAILABLE_TOOLS.md`
  - `docs/user-guide/AVAILABLE_TOOLS_HIGH.md`
  - `docs/user-guide/AVAILABLE_TOOLS_COMPACT.md`

## [2.5.0] - 2026-02-21
### Added
- **Compact facade CRUD routing**:
  - Added compact facade CRUD operations routed by `object_type`.
  - Added compact router/matrix coverage for supported object/action combinations.
- **Compact lifecycle and test handlers**:
  - Added compact handlers for validation, unlock, and unit test workflows.

### Changed
- **Compact routing architecture**:
  - Removed legacy `HandlerAction` path and standardized on dedicated compact handlers.

## [2.4.2] - 2026-02-20
### Added
- **Service Binding high-level tools**:
  - Added `CreateServiceBinding`, `GetServiceBinding`, `UpdateServiceBinding`, `DeleteServiceBinding`, `ListServiceBindingTypes`, `ValidateServiceBinding`.
  - Added `serviceBindingPayloadUtils` for response parsing/format normalization.
- **Runtime profiling tools**:
  - Added `RuntimeAnalyzeProfilerTrace`, `RuntimeRunClassWithProfiling`, `RuntimeRunProgramWithProfiling`.

### Changed
- **System read-only handlers**:
  - Migrated `GetAllTypes`, `GetObjectStructure`, and `GetSqlQuery` to `AdtClient` flow.
- **Lint/type hygiene**:
  - Removed explicit `any` usage in new service binding/runtime handlers and high-level handler registrations.

## [2.4.1] - 2026-02-17
### Fixed
- **Dev HTTP/SSE launch scripts**:
  - Fixed dist entry path to `dist/server/launcher.js` in `tools/dev-http-v2.js` and `tools/dev-sse-v2.js`.
  - Fixed `dev:http` transport argument to `--transport=http`.
- **HTTP/SSE server startup reliability**:
  - Updated standalone server startup flow to listen on `listening`/`error` events, preventing false "started" logs followed by silent exits.
  - Kept strong server references in launcher to avoid premature process shutdown.

### Changed
- **Runtime profiling + dumps explorer**:
  - Refocused tool workflow to class-based profiling run flow.
  - Improved ABAP user resolution/validation and diagnostics for dumps/traces filtering.
  - Improved object validation/update flow and trace feed handling in interactive tool.
- **Tools documentation**:
  - Updated `tools/README.md` to reflect class-focused profiling flow and ABAP user resolution behavior.

## [2.4.0] - 2026-02-15
### Added
- **Runtime diagnostics tools**:
  - Added runtime profiling tools: `RuntimeCreateProfilerTraceParameters`, `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`.
  - Added runtime dump tools: `RuntimeListDumps`, `RuntimeGetDumpById`.
- **Architecture documentation**:
  - Added comprehensive architecture document: `docs/architecture/ARCHITECTURE.md`.

### Changed
- **Runtime payload format**:
  - Runtime profiling and dump handlers now return parsed JSON payloads (instead of raw XML strings in `payload`).
  - Runtime dump read uses `dump_id` input (`RuntimeGetDumpById`) instead of URI-based input.
- **Dependencies**:
  - Updated `@mcp-abap-adt/adt-clients` to `^0.3.16`.

### Documentation
- Regenerated tools docs (`docs/user-guide/AVAILABLE_TOOLS*.md`) with runtime diagnostics tools.
- Updated `README.md` feature list with runtime diagnostics capabilities.

## [2.3.1] - 2026-02-13
### Fixed
- **YAML config flag compatibility**:
  - Added `--conf` support as an alias for `--config` in argument parsing.
  - Fixed YAML template flow: when config file is missing, template generation now exits cleanly instead of continuing into inspection-only mode.
- **YAML env config clarity**:
  - Added `env-path` YAML option to map directly to `--env-path`.
  - Clarified `env` as destination name and removed duplicate `allowed-origins` entry in template.
- **HTTP/SSE connection context resolution**:
  - Enforced priority: `x-mcp-destination` header -> server default destination (`--mcp` / `--env-path`) -> `400` error.
  - HTTP default-destination broker initialization now uses the resolved destination key.

## [2.3.0] - 2026-02-13
### Changed
- **.env parsing policy**:
  - Inline comments are no longer parsed from values.
  - `#` is treated as a comment only when it starts the line.
  - This avoids accidental truncation of secrets containing `#` (for example passwords/tokens).
- **Update tool error handling**:
  - Added unified ADT/SAP error extraction for update handlers to improve `409` conflict diagnostics.
  - XML exception payloads (`exc:exception`) are now surfaced as detailed user-facing errors in previously generic update flows.
- **GetTypeInfo structure fallback**:
  - Added optional structure lookup fallback (`include_structure_fallback`, default: `true`).
  - Fallback is executed only when type lookups return `404` or empty result.
  - Non-`404` errors no longer silently fall through to unrelated lookups.

### Documentation
- Updated `.env` comments guidance in:
  - `README.md`
  - `docs/user-guide/AUTHENTICATION.md`

## [2.2.7] - 2026-02-12
### Fixed
- **CI (Biome)**: Applied formatting fixes required by `npx biome check src --diagnostic-level=error`.
  - `src/handlers/function_module/high/handleGetFunctionModule.ts`
  - `src/lib/config/envResolver.ts`

## [2.2.6] - 2026-02-12
### Changed
- **Function Module handlers**: Fixed parameter propagation for function module operations:
  - `GetFunctionModule` and `DeleteFunctionModule` now require and pass `function_group_name`.
  - `GetFunction` (read-only) now requires and passes `function_group`.
  - `UpdateFunctionModule` (high/low) now forwards `transport_request` to ADT update calls.
- **CLI env resolution**: Updated env argument behavior:
  - `--env=<name>` now resolves to platform sessions path: `{sessions}/<name>.env`.
  - Added `--env-path=<path|file>` for explicit `.env` file usage.
  - `MCP_ENV_PATH` now maps to explicit env file path behavior (same as `--env-path`).
- **Errors**: Improved function module update error messages for transport-related `400` responses and XML SAP errors.

## [2.2.5] - 2026-02-11
### Changed
- **Tools docs generator**: Reworked `tools/generate-tools-docs.js` to scan only handler code in `src/handlers/**`.
- **Tools docs structure**: Updated `docs/user-guide/AVAILABLE_TOOLS.md` hierarchy to `Group (level) → Object (folder) → Tools`.
- **Coverage fix**: Ensured BDEF and other handler folders are included consistently in generated tools documentation.

## [2.2.4] - 2026-02-11
### Changed
- **Discoverability metadata**: Updated npm keywords and package metadata to improve MCP search relevance for ABAP, ABAP Cloud, JWT/XSUAA, and service-key flows.
- **Registry description**: Shortened `server.json` description to meet the MCP publisher 100-character constraint.
- **README positioning**: Clarified first-screen value proposition around full CRUD, On-Premise + ABAP Cloud support, and auth options.

## [2.2.3] - 2026-02-10
### Added
- **Docs**: Added dedicated Terminology and Authentication guides, with links from README.

### Changed
- **README**: Reworked first-screen content and links to emphasize configurator usage and destinations.
- **Docs structure**: Moved GitHub configuration README into deployment docs and fixed internal links.
- **Client configuration docs**: Linked to the configurator repo and usage guide.

## [2.2.2] - 2026-02-10
### Added
- **Client support**: Added OpenCode and Copilot configuration support.
- **Claude config**: Added `.mcp.json` project configuration and docs.
- **Configurator options**: Added URL, headers, and timeout options in `mcp-abap-adt-configure`.

### Changed
- **Configurator split**: Removed `mcp-abap-adt-configure` from core. Use `@mcp-abap-adt/configurator` (repo: `mcp-abap-adt-conf`) with `mcp-conf` instead.
- **Codex/Goose handling**: Improved transport handling and timeout defaults for non-stdio transports.
- **Default-disabled entries**: Updated JSON config handling and docs to keep new entries disabled by default.
- **Streamable HTTP**: Refactored server handling for per-request connections.

### Fixed
- **Goose config**: Corrected enabled state handling in `writeGooseConfig`.

## [2.2.0] - 2026-02-09
### Added
- **MCP Registry metadata**: Added `server.json` and `mcpName` for registry publishing.
- **Client configurator**: Added `mcp-abap-adt-configure` to add/enable/disable/remove MCP entries across clients.
- **Auto-config docs**: Added `docs/installation/CLIENT_INSTALLERS.md` with usage and common tasks.

### Changed
- **Default logger loading**: Lazy-load logger to avoid bundler issues with optional transports.
- **Claude config**: Write MCP settings under `projects.<full_path>.mcpServers` for Claude CLI on Linux.
- **Config defaults**: New entries for Cline/Codex/Windsurf/Goose are disabled by default; enable explicitly.

## [2.1.7] - 2026-01-29
### Fixed
- **UpdateLocalTestClass**: Added detailed SAP error information for 409 conflict errors to improve troubleshooting (#6)

## [2.1.6] - 2026-01-29
### Fixed
- **GetIncludesList, GetObjectsList, GetObjectsByType, GetEnhancements, GetObjectInfo**: Migrate from deprecated `fetchNodeStructure` stub to `AdtClient.getUtils().fetchNodeStructure()` - fixes "not implemented" errors

### Changed
- **LowTester logging**: Unified to compact format with emojis, matching LambdaTester output style

## [2.1.5] - 2026-01-28
### Added
- **Startup diagnostics**: Display SAP connection configuration at server startup when using `--env` parameter
  - Shows source file, SAP URL, client, auth type, and UAA URL
  - Tokens and secrets are safely masked (first/last 4 chars for long values, full mask for short)
  - Helps diagnose auth issues by showing which config is actually used

## [2.1.4] - 2026-01-21
### Fixed
- **CreateLocalTestClass**: Return full SAP error details on failure (including the original response payload).

## [2.1.3] - 2026-01-02
### Changed
- **Documentation**: Restored the stateful ADT flow guide without file-based session persistence references.
- **Available tools**: Regenerated `docs/user-guide/AVAILABLE_TOOLS.md` and restored links across docs.

### Removed
- **Lock/session persistence**: Removed filesystem lock registry and session persistence helpers/config from core and tests.
- **CLI commands**: `adt-lock-object`, `adt-unlock-object`, `adt-manage-locks`, `adt-manage-sessions`, and `adt-unlock-objects` removed from package bins.
- **User guides**: Removed usage/scenario docs tied to legacy session flows.

## [2.1.2] - 2026-01-02
### Changed
- **Lock registry types**: `LockState.objectType` now uses `AdtObjectType` with normalization for legacy entries.
- **adt-lock-object**: No longer registers lock handles in `.locks/active-locks.json`; session save only.

### Removed
- **CLI commands**: `adt-unlock-object`, `adt-manage-locks`, `adt-manage-sessions`, and `adt-unlock-objects` removed from package bins.

## [2.1.1] - 2025-12-31
### Changed
- **@mcp-abap-adt/auth-broker**: bumped to `^0.3.0` - auto-detect service key format, credentials wrapper support, debug logging
- **@mcp-abap-adt/auth-stores**: bumped to `^0.3.0`

## [2.1.0] - 2025-12-31
### Fixed
- Updated `@mcp-abap-adt/auth-broker` so installs now pull `0.2.17` instead of the stale `0.2.14` release that was hiding upstream fixes.
- Removed the accidental `@mcp-abap-adt/core` dependency that caused consumers to download the old `1.4.1` tarball.

## [2.0.3] - 2025-12-31
### Changed
- **@mcp-abap-adt/auth-broker**: bumped to `0.2.15` so the locked dependency pulls in the latest fixes referenced by the release.

### Fixed
- **CI workflow package install**: `.github/workflows/ci.yml` now looks for `mcp-abap-adt-core-*.tgz`, matching the actual npm pack output before testing global install.

## [2.0.2] - 2025-12-30
### Changed
- **GetWhereUsed handler**: Now uses `getWhereUsedList()` from adt-clients and returns parsed JSON with structured references instead of raw XML

### Fixed
- **Release workflow**: Simplified to use npm registry instead of uploading tgz artifacts

## [2.0.1] - 2025-12-30
### Documentation
- Added glama.ai badge with security/license/quality grades
- Updated README example to use `EmbeddableMcpServer` instead of deprecated `HandlerExporter.registerOnServer()`

## [2.0.0] - 2025-12-30
### Added
- **EmbeddableMcpServer**: New server class for external integration (e.g., cloud-llm-hub)
  - Accepts injected `AbapConnection` from consumer
  - Extends `BaseMcpServer` with proper handler registration
  - Configurable exposition levels: `readonly`, `high`, `low`, `system`, `search`
  - Export via `@mcp-abap-adt/core/server`

### Changed
- **HandlerExporter**: Now serves only as registry factory
  - Use `createRegistry()` to get `IHandlersRegistry` for custom scenarios
  - `getHandlerEntries()` and `getToolNames()` still available for inspection

### Removed
- **BREAKING**: `HandlerExporter.registerOnServer()` method removed
  - Had bug with handler signature (passed context twice)
  - Replace with `EmbeddableMcpServer` for cleaner architecture

### Migration Guide
```typescript
// Before (v1.x - broken)
import { HandlerExporter } from '@mcp-abap-adt/core/handlers';
const exporter = new HandlerExporter({ includeReadOnly: true, includeHighLevel: true });
const mcpServer = new McpServer({ name: 'mcp-abap-adt', version: '1.0.0' });
exporter.registerOnServer(mcpServer, () => connection, logger);

// After (v2.x)
import { EmbeddableMcpServer } from '@mcp-abap-adt/core/server';
const server = new EmbeddableMcpServer({
  connection,
  logger,
  exposition: ['readonly', 'high'],
});
await server.connect(transport);
```

## [1.4.3] - 2025-12-29
### Documentation
- **CLI Help**: Extended `--help` output with comprehensive environment variables documentation
  - Added MCP Server Configuration section (`MCP_TRANSPORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PORT`, `MCP_SSE_HOST`, `MCP_SSE_PORT`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_USE_AUTH_BROKER`, `MCP_BROWSER`)
  - Added Debug Options section (`DEBUG_HANDLERS`, `DEBUG_CONNECTORS`, `DEBUG_CONNECTION_MANAGER`, `HANDLER_LOG_SILENT`)
  - Extended SAP Connection section with JWT/OAuth2 variables (`SAP_REFRESH_TOKEN`, `SAP_UAA_URL`, `SAP_UAA_CLIENT_ID`, `SAP_UAA_CLIENT_SECRET`, `SAP_LANGUAGE`)
- **CLI_OPTIONS.md**: Added missing environment variables documentation
  - Added `MCP_UNSAFE`, `MCP_USE_AUTH_BROKER`, `MCP_BROWSER` to General section
  - Added JWT/OAuth2 authentication variables to SAP Connection section
  - New Auth-Broker section with `AUTH_BROKER_PATH` and debug variables
  - New Debug section with handler and connector logging options
- **INSTALLATION.md**: Expanded Environment Variables section with full reference and link to CLI_OPTIONS.md

## [1.4.2] - 2025-12-29
### Fixed
- **Version path**: Fixed incorrect path to package.json in `--version` command

## [1.4.1] - 2025-12-29
### Changed
- **Package renamed**: Changed from `@fr0ster/mcp-abap-adt` to `@mcp-abap-adt/core` for npm publishing
- **Package now public**: Removed `private: true` flag to allow npm publishing

### Added
- **Inspection-only mode**: Server can now start in stdio mode without connection parameters for tool inspection (used by glama.ai)
- **MockAbapConnection**: Added mock connection class for inspection-only mode that returns descriptive error when tools are executed
- **Docker inspection support**: Added `Dockerfile.inspect` and `docker-compose.inspect.yml` for local testing of inspection mode
- **CLAUDE.md**: Added project documentation for Claude Code assistance

## [1.3.0] - 2025-12-29
### Added
- **glama.json**: Added configuration for compatibility with the Glama platform.
- **Node.js Debugging**: Added `--inspect` support to Docker container and exposed port 9229.
- **MCP_TRANSPORT Environment Variable**: Added support for selecting transport mode via environment variable.

### Changed
- **@mcp-abap-adt/adt-clients Updated**: Upgraded to version 0.3.13, bringing fixes for recursion and 406 Accept errors.
- **GetPackageTree Optimized**: Simplified implementation by using the library's `getPackageHierarchy` method, ensuring correct recursive traversal of subpackages.
- **GetPackageContents Enhanced**: Added support for `include_subpackages`, `max_depth`, and `include_descriptions` parameters.
- **Docker Defaults**: Changed default transport to `stdio` in Docker and updated healthcheck logic.

## [1.2.9] - 2025-12-29
### Changed
- **v1 McpHandlers Refactoring**: Rewrote `McpHandlers` to use `HandlerExporter` internally. This ensures the legacy embeddable server (v1) stays in sync with all tools available in v2 while reducing code duplication.
- **Shared Schema Utilities**: Replaced duplicated `jsonSchemaToZod` logic in `v1` with a central implementation from `src/lib/handlers/utils/schemaUtils.ts`.
- **Documentation Generator**: Updated `tools/generate-tools-docs.js` category mapping to support the standardized `GetBehaviorDefinition` naming.

### Removed
- **GetBdef compatibility adapter**: Removed the manual adapter for `GetBdef` in v1 server. All tools now use standard names (e.g., `GetBehaviorDefinition`).

### Added
- **tsx** added to `devDependencies` for improved TypeScript execution and testing.

## [1.2.8] - 2025-12-29
### Added
- **GetPackageContents** tool: New read-only tool to retrieve objects inside an ABAP package (moved from legacy `GetPackage`).

### Changed
- **GetPackage** tool: Migrated to high-level API (`AdtClient.getPackage().read()`). Now returns package metadata and supports `version` parameter (`active`/`inactive`).
- **GetFunction** tool: Updated to support `version` parameter and migrated to new `adt-clients` signature.
- **High-level handlers**: Improved parameter handling and consistency with new `adt-clients` versioning requirements.
- Test cleanup documentation updated to clarify `afterEach` behavior and multi-object cleanup requirements.
- Test runners (`LowTester`/`HighTester`) now emit step-level flow logs for validate/create/lock/update/unlock/activate.
- Package cleanup can use a fresh connection with optional `connection_config` for locked session cases.

### Fixed
- Package create now treats ADT "import" 404 as success when the package is readable.
- Function group/module low-level create handles transient 400/empty responses with read verification.
- Table create now validates and creates with explicit descriptions to satisfy ADT requirements.
- Package low-level tests avoid double-unlock during cleanup.

## [1.2.7] - 2025-12-27
### Changed
- GetPackageTree now builds the tree from node-structure traversal to preserve package/subpackage hierarchy and ordering.
- Package tree nodes now include `adtType`, normalized `type`, `codeFormat`, and `restoreStatus` for parity with backup tooling.
- Migrated handler usage to `AdtClient` now that `CrudClient`/`ReadOnlyClient` are removed in `@mcp-abap-adt/adt-clients`.

### Fixed
- Updated handler typings to match `@mcp-abap-adt/adt-clients@0.3.2` (I* config/state interfaces).
- SearchObject now uses `AdtUtils.searchObjects` instead of the removed `SharedBuilder` export.
- Restored `encodeSapObjectName` helper in `utils` to avoid relying on unstable client exports.

## [1.2.6] - 2025-12-23
### Fixed
- Fixed LICENSE file - corrected copyright attribution (removed incorrect fork author)
- Fixed TypeScript compilation errors in test files:
  - Updated `handlers.test.ts` to use high-level handlers instead of removed readonly handlers
  - Removed non-existent `getAuthHeaders` import from `utils.test.ts`
  - Fixed `sessionHelpers.ts` - added type assertions for connection methods not in `IAbapConnection` interface (`getConfig`, `connect`)
  - Fixed `ClassCrudClientDirect.test.ts` - added type assertions for `connect()` and `reset()` methods
  - Fixed `BehaviorImplementationLowHandlers.test.ts` - removed invalid `session_id` and `session_state` parameters from `UnlockClassArgs`

## [1.2.5] - 2025-12-23
### Removed
- **Removed duplicate readonly handlers that duplicate high-level CRUD operations**
  - Deleted `handleGetClass.ts` (replaced by high-level `GetClass`)
  - Deleted `handleGetDomain.ts` (replaced by high-level `GetDomain`)
  - Deleted `handleGetDataElement.ts` (replaced by high-level `GetDataElement`)
  - Deleted `handleGetTable.ts` (replaced by high-level `GetTable`)
  - Deleted `handleGetStructure.ts` (replaced by high-level `GetStructure`)
  - Deleted `handleGetView.ts` (replaced by high-level `GetView`)
  - Deleted `handleGetServiceDefinition.ts` (replaced by high-level `GetServiceDefinition`)
  - Deleted `handleGetProgram.ts` (replaced by high-level `GetProgram`)
  - Deleted `handleGetInterface.ts` (replaced by high-level `GetInterface`)
  - Deleted `handleGetFunctionGroup.ts` (replaced by high-level `GetFunctionGroup`)
  - Deleted `handleGetBdef.ts` (replaced by high-level `GetBehaviorDefinition`)

### Changed
- **v1 server now uses high-level handlers instead of readonly duplicates**
  - `GetClass`, `GetDomain`, `GetDataElement`, `GetTable`, `GetStructure`, `GetView`, `GetServiceDefinition`, `GetProgram`, `GetInterface`, `GetFunctionGroup` now use high-level handlers internally
  - `GetBdef` now uses `GetBehaviorDefinition` high-level handler with parameter adapter for backward compatibility
  - All high-level handlers support `version` parameter (active/inactive) for better flexibility

### Fixed
- Fixed TypeScript type errors in `handleGetAbapSystemSymbols.ts`
  - Added proper JSON parsing for `GetClass` and `GetInterface` responses
  - Fixed type assertions for class and interface data
- Fixed TypeScript type error in `utils.ts`
  - Added type assertion for `makeAdtRequest` return type
- Fixed documentation generator (`tools/generate-tools-docs.js`)
  - Updated regex pattern to support multi-line imports in handler groups
  - Now correctly detects all handlers including system and search handlers
  - Documentation now includes all 219 tools (76 high-level, 116 low-level, 27 read-only)

## [1.2.4] - 2025-12-22
### Changed
- **Migrated from ESLint+Prettier to Biome**
  - Removed ESLint and Prettier dependencies
  - Added @biomejs/biome for faster linting and formatting
  - Configured Biome with strict rules for production code
  - Relaxed rules for test files (noImplicitAnyLet, noExplicitAny)
  - Updated package.json scripts: `lint`, `lint:check`, `format`
  - Updated `npm run build` to include Biome check before TypeScript compilation

### Fixed
- Fixed TypeScript errors in production code:
  - `handleGetAbapAST.ts` - Fixed regex match types and while loop patterns in 4 methods
  - `handleGetObjectInfo.ts` - Added type annotation for `packageName`
  - `handleDescribeByList.ts` - Added type annotation for `parsed`
  - `handleValidateDataElement.ts` - Added type assertion for `AxiosResponse`
  - `handleCreateClass.ts` - Added `ClassBuilderState` type import
  - `handleDeleteObject.ts` - Changed `any` to `unknown` for response
  - `handleGetEnhancementSpot.ts` - Fixed array types and while loops
  - `handleGetProgFullCode.ts` - Fixed 3 while loops with regex.exec() pattern
- All production code now passes strict Biome rules (no implicit any, no assignments in expressions)

### Added
- Added Biome check to CI workflow (`.github/workflows/ci.yml`)
- Added Biome check to Release workflow (`.github/workflows/release.yml`)

### Dependencies
- Updated `@mcp-abap-adt/adt-clients` to ^0.2.6
- Updated `@mcp-abap-adt/adt-interfaces` to ^0.2.6
- Added `@biomejs/biome` ^2.3.10 as devDependency
- Removed `eslint` and `prettier` dependencies

## [1.2.3] - 2025-12-22
### Fixed
- Removed unused import of `IAbapConnectionExtended` from `@mcp-abap-adt/interfaces`
  - Interface was removed in interfaces package v1.1.0

## [1.2.2] - 2025-12-22
### Changed
- **BREAKING: Removed legacy-server.ts**
  - Full removal of 3000+ line legacy server with CLI, AuthBroker, .env parsing, etc.
  - v1 module now exports only lightweight `EmbeddableMcpServer` class

### Added
- **EmbeddableMcpServer** - lightweight MCP server for embedding
  - Minimal class (~100 lines) for external HTTP server integration
  - Constructor takes `context: HandlerContext` with connection and logger
  - Handlers registered immediately in constructor - no `run()` method needed
  - Access underlying `McpServer` via `.mcpServer` getter
  - Configurable `exposition` levels: `readonly`, `high`, `low`, `system`
  
### Removed
- `mcp_abap_adt_server` class (was 3000+ lines with CLI, transports, AuthBroker)
- `setAbapConnectionOverride()` function
- `ServerOptions` interface
- All CLI argument parsing
- All transport management (stdio, SSE, streamable-http)
- AuthBroker integration
- .env file loading logic

### Migration Guide
**For embedding in external servers (cloud-llm-hub, etc.):**
```typescript
// Before (1.2.x)
import { mcp_abap_adt_server } from '@fr0ster/mcp-abap-adt/server/v1';
const server = new mcp_abap_adt_server({ connection, allowProcessExit: false });
server.registerHandlers({ connection, logger });

// After (1.2.2)
import { EmbeddableMcpServer } from '@fr0ster/mcp-abap-adt/server/v1';
const server = new EmbeddableMcpServer({
  context: { connection, logger },
  exposition: ['readonly', 'high']
});
const mcpServer = server.mcpServer; // Use with transport
```

## [1.2.1] - 2025-12-22
### Added
- **Subpath export `./utils`** for internal utilities access
  - `@fr0ster/mcp-abap-adt/utils` - exports `sessionContext`, `getManagedConnection`, and other utilities
  - Required for cloud-llm-hub integration to access session context

## [1.2.0] - 2025-12-21
### Changed
- **BREAKING: v2 is now the default server**
  - `mcp-abap-adt` command now runs v2 server (was v1)
  - v1 server moved to `legacy-server.ts`, accessible via `npm run start:legacy`
  - Removed separate `mcp-abap-adt-v2` binary

- **v1 becomes Handler Exporter**
  - v1/index.ts now exports `HandlerExporter` class for external server integration
  - Allows registering ABAP ADT handlers on any McpServer instance
  - Designed for embedding into existing Express/CDS/CAP servers (e.g., cloud-llm-hub)

### Added
- **Subpath exports** for modular imports
  - `@fr0ster/mcp-abap-adt` - main package (unchanged)
  - `@fr0ster/mcp-abap-adt/handlers` - HandlerExporter and handler groups
  - `@fr0ster/mcp-abap-adt/server/v1` - v1 module (exporter + legacy server)
  - v2 server is internal, not exported as subpath

- **HandlerExporter class** for programmatic handler registration
  - `new HandlerExporter(options?)` - create exporter with configurable handler groups
  - `registerOnServer(mcpServer, connectionProvider)` - register handlers with connection injection
  - `getHandlerEntries()` - get raw handler entries for custom registration
  - `getToolNames()` - list all available tool names
  - `createRegistry()` - create IHandlersRegistry for v2 servers

- **Handler Groups** - modular handler organization
  - `ReadOnlyHandlersGroup` - read-only handlers (getProgram, getClass, etc.)
  - `HighLevelHandlersGroup` - high-level operations
  - `LowLevelHandlersGroup` - low-level operations
  - `SystemHandlersGroup` - system handlers
  - `SearchHandlersGroup` - search handlers

### Migration Guide
**For CLI users:**
- No changes needed - `mcp-abap-adt` command works the same
- To use legacy v1 server: `npm run start:legacy`

**For library users (cloud-llm-hub, etc.):**
```typescript
// Old way (v1 server class) - still works via legacy import
import { mcp_abap_adt_server } from '@fr0ster/mcp-abap-adt';

// New way (handler exporter) - recommended
import { HandlerExporter } from '@fr0ster/mcp-abap-adt/handlers';

const exporter = new HandlerExporter();
exporter.registerOnServer(mcpServer, () => getConnection());
```

**For CAP/CDS projects with file: dependency:**
Add path mapping to tsconfig.json:
```json
{
  "paths": {
    "@fr0ster/mcp-abap-adt/handlers": ["./submodules/mcp-abap-adt/dist/lib/handlers/index"]
  }
}
```

## [1.1.32] - 2025-12-21
### Added
- **v2 HTTP Server Injection**: Added support for external HTTP application injection in v2 servers
  - New `IHttpApplication` interface for Express-like HTTP applications
  - `StreamableHttpServer` and `SseServer` now support `app` option in constructor
  - New `registerRoutes(app, options?)` method for embedding into existing Express/CDS/CAP servers
  - Enables integration with cloud-llm-hub and other CAP-based applications
  - Helper methods: `getPath()`, `getSsePath()`, `getPostPath()`

## [1.1.31] - 2025-12-21
### Fixed
- **CLI `--version` flag**: Fixed package.json path resolution for both v1 and v2 servers
  - Path now correctly resolves from `dist/server/v1/` and `dist/server/v2/` to root `package.json`

## [1.1.30] - 2025-12-21
### Added
- **MCP Server v2 Architecture**:
  - New modular server architecture with `BaseMcpServer`, `StdioServer`, `StreamableHttpServer`
  - Handler registration system with Dependency Injection pattern
  - `HandlerContext` for unified connection and logging access in handlers
  - `ServerConfigManager` for centralized configuration management
  - `AuthBrokerConfig` for V2 server configuration
  - `StdioLogger` for minimal logging in stdio transport
  - Transport-specific server implementations (stdio, SSE, HTTP)

- **Headless Browser Mode**: Added `--browser` CLI parameter for SSH and remote sessions
  - `--browser=headless`: Logs authentication URL and waits for manual callback
  - `--browser=none`: Logs URL and rejects immediately (for automated tests)
  - `--browser=system`: Opens system default browser (default)
  - `--browser=chrome|edge|firefox`: Opens specific browser
  - Environment variable: `MCP_BROWSER`
  - Ideal for SSH sessions, Docker containers, and CI/CD environments

- **YAML Configuration Support**:
  - Load server configuration from YAML files
  - Enhanced command-line transport handling
  - Improved configuration validation

- **Structured Logging**:
  - Handler logging with configurable options and integration
  - Structured logging for handler functions
  - Logger cleanup and enhanced handler implementations

- **Testing Improvements**:
  - Jest configuration and enhanced testing framework
  - Unified test refactoring roadmap with base tester classes
  - Integration tests for low-level view handlers
  - Read-only handler tests for WhereUsed analysis
  - `AuthBrokerFactory` for test configuration

- **Infrastructure & Handlers**:
  - Added `tabletypes` to integrated terminal profiles
  - Handler migration to infrastructure module
  - Basic auth support in MCP destination handling

### Changed
- **Token Refresh Architecture (Breaking)**:
  - Removed legacy `createDestinationAwareConnection()` wrapper (~150 lines)
  - Token refresh now handled internally by `JwtAbapConnection` via DI `ITokenRefresher`
  - `getConnectionForSession()` creates `tokenRefresher` from `AuthBroker` and passes to `createAbapConnection()`
  - Removed all `reset()` calls from 23+ handler files (no longer needed)
  - Removed unused `disposeConnection()` and `getAuthHeaders()` functions
  - Simplified `HandlerContext` to use `IAbapConnection` instead of deprecated `IAbapConnectionExtended`

- **Handler Refactoring**:
  - All handlers updated to utilize `HandlerContext` for connection and logging
  - Standardized import statements across handlers
  - Enhanced error handling and logging across all handlers
  - Replaced direct connection creation with managed connection

- **Configuration Module**:
  - Extracted configuration logic into dedicated module
  - Improved YAML configuration loading and command line parsing
  - Enhanced connection handling and configuration validation

### Fixed
- Network error handling in `createDestinationAwareConnection`
- Handler results properly awaited and errors handled in `BaseMcpServer`
- Basic auth support in MCP destination handling
### Removed
- Legacy test files and deprecated test scripts (85 files)
- Obsolete v2 components from earlier iterations
- Deprecated tools: `update-crudclient-api.js`, `update-handlers-with-tool-definitions.js`, etc.

### Documentation
- Comprehensive documentation for various components and usage scenarios
- MCP Server architecture and implementation roadmap
- Handler refactoring roadmap
- YAML configuration support documentation
- Issue roadmap system for structured issue tracking
- Updated development guidelines

### Dependencies
- `@mcp-abap-adt/interfaces`: `^0.2.3` → `^0.2.6`
  - Removed deprecated `IAbapConnectionExtended` interface
  - Added `ITokenRefresher` interface for DI
- `@mcp-abap-adt/connection`: `^0.2.3` → `^0.2.5`
  - `createAbapConnection()` now accepts 4th parameter `tokenRefresher`
  - `JwtAbapConnection` handles token refresh internally
- `@mcp-abap-adt/auth-providers`: `^0.2.1` → `^0.2.3` (headless mode, cross-platform fixes)
- `@mcp-abap-adt/auth-broker`: `^0.2.4` → `^0.2.9`
  - Added `createTokenRefresher()` factory method
  - Headless mode passthrough
- `@mcp-abap-adt/auth-stores`: `^0.2.5` → `^0.2.8` (EnvFileSessionStore with JWT persistence)
- `@mcp-abap-adt/clients`: `^0.2.4` → `^0.2.5`

## [1.1.29] - 2025-12-08

### Added
- **Parameter Passing Unit Tests Roadmap**: Added comprehensive roadmap for unit tests to verify parameter passing
  - Created `doc/roadmaps/parameter_passing_unit_tests_roadmap.md`
  - Detailed test strategy for verifying all parameters pass correctly from MCP handlers through CrudClient to Builder classes and finally to low-level functions
  - Test implementation plan with 4 phases covering infrastructure, individual object types, and integration tests
  - Test examples for ViewBuilder, CrudClient, and low-level functions
  - Coverage goals (100% for parameter passing) and success criteria
  - Addresses issue where parameters like `transportRequest` can be lost during the call chain

### Documentation
- **Roadmap Documentation**: Added roadmap for future unit test development
  - Comprehensive plan for preventing parameter loss regression
  - Test file structure and organization guidelines
  - Maintenance and CI/CD integration recommendations

## [1.1.28] - 2025-01-XX

### Changed
- **Header Constants Migration**: Replaced all hardcoded header strings with constants from `@mcp-abap-adt/interfaces`
  - All header references now use constants (e.g., `HEADER_SAP_URL`, `HEADER_SAP_AUTH_TYPE`, `HEADER_MCP_DESTINATION`, etc.)
  - Improved type safety and consistency across packages
  - Updated error messages and hints to use header constants
- **Updated dependencies**:
  - `@mcp-abap-adt/header-validator`: `^0.1.6` → `^0.1.7`
    - Added comprehensive header sets documentation
    - Enhanced validation for Basic Auth and UAA refresh token sets
    - All header references migrated to constants from `@mcp-abap-adt/interfaces`
  - `@mcp-abap-adt/interfaces`: `^0.1.1` → `^0.1.2`
    - Added HTTP header constants for all headers used across packages
    - Added header groups and authentication type constants

### Technical
- **Code Quality**: Improved maintainability by centralizing header name definitions
- **Type Safety**: Better compile-time checking for header names

## [1.1.27] - 2025-12-07

### Changed
- **Updated dependencies**:
  - `@mcp-abap-adt/auth-broker`: `^0.1.9` → `^0.1.10`
    - Added constructor validation for stores and tokenProvider parameters
    - Ensures required dependencies are present upon AuthBroker instantiation

## [1.1.26] - 2025-12-06

### Added
- **Comprehensive usage documentation** – Added complete MCP function call documentation:
  - Created `doc/user-guide/usage/` directory with structured documentation
  - **Simple Objects** (22 files): High-level and low-level handlers for 11 object types:
    - Classes, Interfaces, Programs, Function Groups, Function Modules
    - Tables, Structures, CDS Views, Domains, Data Elements, Service Definitions
    - Each object has separate `-high.md` and `-low.md` files with exact MCP call examples
  - **RAP Business Objects** documentation:
    - Complete workflow for creating RAP BO with all components
    - Deferred group activation guide
    - Step-by-step examples with exact MCP function calls
  - All documentation uses compact, laconic format with only exact MCP calls and parameters
  - No unnecessary descriptions, maximum clarity
- **Test syntax checking** – Added `npm run test:check` command:
  - Performs TypeScript syntax check on test files without running tests
  - Uses `tsc --noEmit -p tsconfig.test.json`
  - Helps catch type errors before running tests

### Changed
- **Updated dependencies to latest versions**:
  - `@mcp-abap-adt/adt-clients`: `^0.1.35` → `^0.1.36`
  - `@mcp-abap-adt/auth-broker`: `^0.1.8` → `^0.1.9`
  - `@mcp-abap-adt/auth-providers`: `^0.1.1` → `^0.1.2`
  - `@mcp-abap-adt/auth-stores`: `^0.1.3` → `^0.1.4`
  - `@mcp-abap-adt/connection`: `^0.1.14` → `^0.1.15`
  - `@mcp-abap-adt/header-validator`: `^0.1.4` → `^0.1.6`
  - `@mcp-abap-adt/interfaces`: `^0.1.1` (unchanged)
  - `@mcp-abap-adt/logger`: `^0.1.0` → `^0.1.1`

### Fixed
- **TypeScript type errors in TableLowHandlers.test.ts** – Fixed type inference issues:
  - Corrected `lockSessionForCleanup` variable declaration and usage
  - Fixed type narrowing in catch and finally blocks

## [1.1.25] - 2025-12-12

### Added
- **`--mcp=<destination>` parameter** – Default MCP destination name for auth-broker:
  - Allows using auth-broker (service keys) with stdio and SSE transports
  - When specified, this destination is used when `x-mcp-destination` header is not provided in requests
  - For stdio transport: Server initializes auth-broker with the specified destination at startup
  - For SSE transport: Server uses the specified destination as fallback when header is missing
  - For HTTP transport: Server uses the specified destination as fallback when header is missing
  - Example: `mcp-abap-adt --transport=stdio --mcp=TRIAL`
  - This enables auth-broker usage with stdio and SSE transports, which previously required `.env` file configuration

### Changed
- **Auth-broker support for stdio and SSE transports** – Extended `getOrCreateAuthBroker()` to support stdio and SSE transports:
  - Previously, auth-broker was only available for HTTP/streamable-http transport
  - Now works with all transport types when `--mcp` parameter is specified
  - For stdio: Auth-broker is initialized at server startup with the destination from `--mcp` parameter
  - For SSE: Auth-broker works the same way as HTTP transport (via headers or `--mcp` fallback)

### Fixed
- **`--mcp` parameter now skips `.env` file loading** – When `--mcp` is specified:
  - `.env` file is not automatically loaded (even if it exists in current directory)
  - `.env` file is not considered mandatory for stdio and SSE transports
  - Auth-broker configuration takes precedence over `.env` file
  - This ensures that `--mcp` parameter works correctly without conflicts from `.env` file settings
- **SSE transport with `--mcp` parameter** – Fixed issue where SSE transport was using `.env` configuration instead of auth-broker when `--mcp` was specified:
  - Server now initializes auth-broker at startup for SSE transport when `--mcp` is provided
  - `applyAuthHeaders()` now handles empty headers correctly when `defaultMcpDestination` is set
  - Configuration from auth-broker takes precedence over `.env` file

### Documentation
- Updated `CLI_OPTIONS.md` with `--mcp` parameter documentation and examples
- Updated `CLIENT_CONFIGURATION.md` with information about using `--mcp` parameter for stdio and SSE transports
- Added examples for Cline configuration with stdio transport and `--mcp` parameter
- Updated help text in both `src/index.ts` and `bin/mcp-abap-adt.js` with `--mcp` parameter information

## [1.1.24] - 2025-12-02

### Changed
- **Safe session storage by default** – Session data is now stored in-memory using `SafeSessionStore` by default:
  - Session tokens are no longer persisted to disk by default (secure by default)
  - Session data is lost after server restart (requires re-authentication)
  - Use `--unsafe` flag to enable file-based session storage (legacy behavior)
  - File-based storage (`UnixFileSessionStore`/`WindowsFileSessionStore`) is only used when `--unsafe` is specified

### Added
- **`--unsafe` flag** – Enables file-based session storage (persists tokens to disk):
  - When specified, session data is saved to platform-specific locations:
    - Unix: `~/.config/mcp-abap-adt/sessions/{destination}.env`
    - Windows: `%USERPROFILE%\Documents\mcp-abap-adt\sessions\{destination}.env`
  - Can be set via environment variable: `MCP_UNSAFE=true`
  - Use this flag if you need session persistence across server restarts

### Dependencies
- Updated `@mcp-abap-adt/auth-broker` to `^0.1.5`:
  - Benefits from new `SafeSessionStore` implementation (in-memory, secure)
  - Updated to use new `ISessionStore` interface (replaces `SessionStore`)

## [1.1.23] - 2025-12-02

### Fixed
- **Help text correction** – fixed incorrect help message for `x-mcp-destination` header:
  - Removed incorrect statement that `x-mcp-destination` requires `x-sap-url` header
  - Updated help text to correctly state that URL is automatically derived from service key (same as `x-sap-destination`)
  - Help text now accurately reflects that `x-sap-url` is not required and will be ignored if provided

## [1.1.22] - 2025-12-01

### Dependencies
- Updated `@mcp-abap-adt/adt-clients` to `^0.1.33`:
  - Benefits from optimized CSRF token endpoint (`/sap/bc/adt/core/discovery`)
  - Faster connection initialization for all CRUD operations
- Updated `@mcp-abap-adt/auth-broker` to `^0.1.4`:
  - Benefits from optimized CSRF token endpoint in connection layer
  - Faster authentication flows when managing JWT tokens

### Added
- **ABAP Unit class test tools**: Added `[low-level]` handlers to cover the new CrudClient APIs for class test includes and ABAP Unit orchestration:
  - `LockClassTestClassesLow`, `UpdateClassTestClassesLow`, `UnlockClassTestClassesLow`, `ActivateClassTestClassesLow`
  - `RunClassUnitTestsLow`, `GetClassUnitTestStatusLow`, `GetClassUnitTestResultLow`
  - All new tools live in `class/low/` and are registered with the server and documentation generator.
- **Package creation options**: `CreatePackage` (high- and low-level) now accepts optional `package_type`, `software_component`, `transport_layer`, `application_component`, and `responsible` parameters and forwards them directly to `CrudClient`, enabling Cloud systems to pass values such as `ZLOCAL` while keeping the transport layer empty.

## [1.1.21] - 2025-12-01

### Fixed
- **x-mcp-destination validation** – fixed issue where `x-mcp-destination` header was incorrectly requiring `x-sap-url`:
  - `x-mcp-destination` now works identically to `x-sap-destination` - URL is automatically derived from service key
  - `x-sap-url` is now optional for `x-mcp-destination` (and will be ignored with a warning if provided)
  - Fixed issue on Windows where `x-mcp-destination` was being ignored
  - Updated header validator to check headers in both lowercase and original case for better compatibility

### Added
- **Custom auth-broker path** – added `--auth-broker-path` command-line option:
  - Allows specifying custom base path for service keys and sessions
  - Automatically creates `service-keys` and `sessions` subdirectories in the specified path
  - Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`
  - Directories are created automatically if they don't exist
  - Can be used together with `--auth-broker` flag

- **Automatic directory creation** – service keys and sessions directories are now created automatically:
  - Directories are created at server startup if they don't exist
  - Prevents errors when saving sessions for the first time
  - Works for both default platform paths and custom `--auth-broker-path`

- **Enhanced startup information** – improved auth-broker path display at server startup:
  - Shows all search paths for service keys (in order of priority)
  - Shows all save paths for sessions
  - Formatted with clear visual separators for better readability
  - Only displayed when `--auth-broker` flag is used

- **Diagnostic logging** – added platform-aware logging for better debugging:
  - Logs platform information when processing authentication headers
  - Logs all header keys that start with `x-sap` or `x-mcp`
  - Logs search paths when creating AuthBroker instances
  - Helps diagnose issues on different platforms (especially Windows)

### Changed
- **Header validation logic** – improved validation order and case handling:
  - `x-mcp-destination` is now checked immediately after `x-sap-destination`, regardless of `x-sap-url` presence
  - Added case-insensitive header checking for better compatibility
  - Both `x-sap-destination` and `x-mcp-destination` now check headers in both lowercase and original case

- **Documentation updates** – comprehensive documentation improvements:
  - Added `--auth-broker-path` parameter documentation in help text
  - Updated `CLIENT_CONFIGURATION.md` with custom path examples
  - Updated `INSTALLATION.md` with new command-line option
  - Updated `SERVICE_KEY_SETUP.md` with custom path usage examples
  - Added Cline configuration example in help text

### Dependencies
- **Updated `@mcp-abap-adt/auth-broker` to `^0.1.3`** – upgraded to latest version
- **Updated `@mcp-abap-adt/header-validator` to `^0.1.3`** – upgraded to latest version

## [1.1.20] - 2025-12-01

### Changed
- **Help documentation improvements** – updated help messages with detailed instructions for saving service keys:
  - Added platform-specific instructions for Linux, macOS, and Windows
  - Replaced example JSON structure with instructions to copy service key from SAP BTP
  - Fixed backslash escaping in Windows PowerShell commands
  - Updated both launcher help (`bin/mcp-abap-adt.js`) and server help (`src/index.ts`)
  - Updated documentation files: `SERVICE_KEY_SETUP.md` and `CLIENT_CONFIGURATION.md`

## [1.1.19] - 2025-11-30

### Changed
- **Handler refactoring** – migrated handlers to use `CrudClient` and `SharedBuilder` from `@mcp-abap-adt/adt-clients`:
  - `handleSearchObject` now uses `SharedBuilder.search()` instead of manual URL construction
  - Eliminates redundant URL concatenation and potential duplication errors
  - Better code reuse and consistency across handlers

- **URL handling simplification** – removed unnecessary URL cleaning logic:
  - URLs from `.env` files and service keys are expected to be clean
  - Removed aggressive URL cleaning that was causing issues
  - Only basic trimming is performed where needed

- **Transport-specific auth-broker handling** – `auth-broker` is now ignored for `stdio` and `sse` transports:
  - AuthBroker initialization is skipped for non-HTTP transports
  - Prevents unnecessary errors and resource usage
  - `.env` file is used directly for `stdio` and `sse` transports

### Fixed
- **URL duplication in stdio transport** – fixed incorrect URL formation when using `stdio` transport:
  - Resolved `getaddrinfo ENOTFOUND ...comhttps` errors
  - Proper URL handling in connection initialization
  - Correct `.env` file parsing for `stdio` mode

### Added
- **Lazy AuthBroker initialization** – AuthBroker instances are now created on-demand per destination:
  - AuthBroker is only created when a destination is actually needed (not at server startup)
  - Each destination gets its own AuthBroker instance, cached in a map for reuse
  - Reduces memory usage and startup time when auth-broker is not needed
  - Default AuthBroker instance for non-destination requests

- **Improved method filtering** – only `tools/call` requires SAP configuration:
  - All other MCP methods (`tools/list`, `tools/get`, `initialize`, `ping`, `notifications/initialized`, etc.) work without SAP config
  - Prevents unnecessary authentication errors for metadata requests
  - Better separation between metadata operations and actual tool execution

### Changed
- **AuthBroker instance management** – switched from single instance to per-destination map:
  - `authBrokers` map stores AuthBroker instances keyed by destination name
  - `defaultAuthBroker` for requests without specific destination
  - Lazy initialization via `getOrCreateAuthBroker()` method
  - Better isolation between different destinations

- **Platform store imports** – fixed ES module compatibility:
  - Replaced `require()` with static imports in `getPlatformStores()`
  - Fixes "UnixFileSessionStore is not a constructor" error
  - Proper ES module support for platform-specific stores

### Fixed
- **ES module compatibility** – fixed "UnixFileSessionStore is not a constructor" error:
  - Changed `getPlatformStores()` to use static imports instead of `require()`
  - Properly handles ES module exports for Unix/Windows store implementations
  - AuthBroker now correctly initializes on Unix systems

- **Request processing logic** – improved handling of requests that don't require SAP connection:
  - Only `tools/call` method triggers SAP configuration validation
  - All other methods bypass authentication checks
  - Prevents false errors for metadata and initialization requests

## [1.1.17] - 2025-11-28

### Added
- **Cross-platform session storage** – optional persistent session management:
  - Session storage now disabled by default (stateless mode)
  - Enable via `MCP_ENABLE_SESSION_STORAGE=true` environment variable
  - Custom session directory via `MCP_SESSION_DIR=/path/to/sessions`
  - Platform-specific defaults: Windows temp dir, `/tmp` on Linux, `/var/folders` on macOS
  - Prevents `ENOENT` errors when running from different working directories

- **Cline configuration documentation** – comprehensive setup guide:
  - Created `doc/installation/CLINE_CONFIGURATION.md` with detailed configuration for all transport types
  - Added example configs in `doc/installation/examples/` for NPX, global install, and local development
  - Platform-specific notes for macOS, Linux, and Windows
  - Session storage configuration examples and best practices
  - Troubleshooting guide for common connection issues

- **Cross-platform fixes documentation** – created `doc/development/CROSS_PLATFORM_FIXES.md`:
  - Documented dotenv removal and stdio transport fixes
  - Cross-platform path handling with `os.tmpdir()` and `path.join()`
  - Platform-specific session storage locations
  - Testing instructions for all three transports (stdio, HTTP, SSE)

### Changed
- **Session storage architecture** – improved reliability and cross-platform support:
  - Moved from relative `.sessions` path to absolute paths using `os.tmpdir()`
  - Session storage now optional and controlled by environment variables
  - Removed `FileSessionStorage` usage from individual handlers (e.g., `handleDeletePackage`)
  - All session management now centralized in connection manager (`utils.ts`)

- **Environment variable documentation** – comprehensive env var reference:
  - Added table of all available environment variables in Cline configuration docs
  - Documented `MCP_ENABLE_SESSION_STORAGE` and `MCP_SESSION_DIR` usage
  - Platform-specific default values and examples
  - Guidance on when to enable/disable session storage

### Fixed
- **Session directory creation errors** – fixed `ENOENT: no such file or directory, mkdir '/.sessions'`:
  - Replaced relative `.sessions` path with absolute paths
  - Session directory now uses OS-specific temp directory by default
  - Works correctly when running as global npm package or via npx
  - No longer depends on current working directory

- **Handler session management** – simplified connection handling:
  - Removed custom `FileSessionStorage` creation in `handleDeletePackage`
  - Deprecated `force_new_connection` parameter (now ignored)
  - All connections use centralized session management
  - Restart server to force new session instead of per-handler sessions

### Dependencies
- No dependency changes in this release

## [1.1.16] - 2025-01-XX

### Removed
- **dotenv dependency** – completely removed `dotenv` package from dependencies:
  - Eliminated `dotenv` as a dependency to prevent stdout pollution in stdio mode
  - Resolved `"[dotenv@17."... is not valid JSON` error that was breaking stdio transport
  - Server now uses manual `.env` file parsing for all transport modes

### Changed
- **.env file parsing** – replaced `dotenv` library with manual parsing:
  - Manual `.env` file parsing for all transport modes (stdio, http, sse)
  - Supports both Unix (`\n`) and Windows (`\r\n`) line endings
  - Handles comments, quoted values, and empty lines correctly
  - Cross-platform compatible (works on Linux, Windows, macOS)
  - No external dependencies for environment variable loading

- **stdio mode auto-detection** – improved stdio mode detection:
  - Auto-detects stdio mode when `stdin` is not a TTY (piped by MCP Inspector or other tools)
  - Checks `!process.stdin.isTTY` in addition to command-line arguments and environment variables
  - Allows seamless connection from MCP Inspector and other stdio-based clients without explicit `--transport=stdio` flag

- **stderr handling in stdio mode** – restored stderr for error logging:
  - Following reference implementation pattern, stderr is now available for error logging in stdio mode
  - stdout remains reserved exclusively for MCP JSON-RPC protocol
  - console.error() and console.warn() now work correctly in stdio mode (write to stderr)

### Fixed
- **stdio transport connection** – fixed issue where server was not connecting properly in stdio mode:
  - Server now correctly detects stdio mode when launched by MCP Inspector
  - Tools are properly registered and available when connecting via stdio
  - Resolved connection issues that prevented tools from being listed

### Dependencies
- Updated `@mcp-abap-adt/connection` to `^0.1.12`:
  - Connection package no longer reads `.env` files or depends on `dotenv`
  - Consumers must pass `SapConfig` directly to connection constructors
- Updated `@mcp-abap-adt/adt-clients` to `^0.1.27`:
  - Updated to work with connection@0.1.12
  - Fixed example scripts to use manual `.env` parsing

## [1.1.15] - 2025-01-27

### Fixed
- **Git tag management** – fixed issues with release tag creation and management:
  - Corrected tag placement on the latest commit with CHANGELOG updates
  - Ensured proper tag synchronization between local and remote repositories
  - Fixed tag deletion and recreation workflow for release management

## [1.1.14] - 2025-01-27

### Added
- **Command-line flags --version/-v and --help/-h** – added support for standard command-line flags:
  - `--version` or `-v` – displays package version and exits
  - `--help` or `-h` – displays help message and exits
  - Flags are processed before any other initialization, allowing quick version/help checks

### Changed
- **.env file search logic** – improved .env file discovery and loading:
  - **Search location:** Now searches for `.env` file only in the current working directory (where the command is executed)
  - **No recursive search:** Removed fallback searches in parent directories or project root
  - **Explicit path support:** Still supports `--env=/path/to/.env` or `MCP_ENV_PATH` environment variable for custom locations
  - **Cross-platform paths:** Uses `path.resolve()` and `path.join()` for proper path handling on Windows, Linux, and macOS

- **Transport mode and .env file relationship** – refined logic for transport mode selection and .env file requirements:
  - **Default behavior:** If transport is not explicitly specified and no `.env` file is found, server starts in HTTP mode (no .env required)
  - **Explicit transport with .env:** If transport is explicitly set to `stdio` or `sse` but `.env` file is missing, server exits with clear error message
  - **Explicit transport without .env:** If transport is explicitly set to `http` or `streamable-http`, server starts without .env file (as expected)
  - **Error messages:** Improved error messages that clearly indicate what transport mode requires .env file and how to specify custom .env location

### Fixed
- **Cross-platform compatibility** – ensured all file path operations work correctly on Windows, Linux, and macOS:
  - All path operations use Node.js `path` module methods (`path.join()`, `path.resolve()`, `path.isAbsolute()`)
  - Proper handling of Windows path separators (`\`) vs Unix path separators (`/`)
  - Version reading from `package.json` uses cross-platform path resolution

## [1.1.13] - 2025-01-27

### Fixed
- **Handler parameter schemas alignment with CrudClient** – comprehensive fix to ensure all handler input schemas match actual CrudClient method parameters:
  - **Data Element handlers:**
    - Added `type_name` parameter to `handleCreateDataElement` schema (was missing but used in code)
    - Added `search_help`, `search_help_parameter`, `set_get_parameter` to `handleUpdateDataElement` schema (now properly passed to builder)
    - Updated field label descriptions to clarify they are applied during update step after creation
  - **Domain handlers:**
    - Removed unsupported parameters from `handleCreateDomain` low-level handler: `domain_type`, `application`, `master_system`, `responsible`
  - **Program handlers:**
    - Removed `master_system` and `responsible` from both high and low-level handlers (these are set automatically by system)
  - **Class handlers:**
    - Removed `master_system` and `responsible` from high-level handler schema (set automatically by system)
    - Removed `master_system` and `responsible` from low-level handler schema and code
  - **Interface handlers:**
    - Removed `master_system` and `responsible` from both high and low-level handlers (set automatically by system)
  - **Structure, View, Table handlers:**
    - Removed `master_system` and `responsible` from low-level create handlers (set automatically by system)
  - **Behavior Definition, Metadata Extension handlers:**
    - Removed `master_system` and `responsible` from low-level create handlers (set automatically by system)
  - **Impact:** All handler schemas now accurately reflect what parameters are actually supported and used by CrudClient methods, preventing confusion and ensuring correct API usage

### Changed
- **Data Element handlers – search help support** – enhanced data element handlers to support search help configuration:
  - `handleCreateDataElement` now accepts `search_help`, `search_help_parameter`, `set_get_parameter` parameters
  - `handleUpdateDataElement` now accepts `search_help`, `search_help_parameter`, `set_get_parameter` parameters
  - These parameters are properly passed through to `DataElementBuilder` and included in update operations
  - Enables full configuration of search help and parameter settings for data elements

### Dependencies
- **Updated `@mcp-abap-adt/adt-clients` to `^0.1.26`** – upgraded to latest version which includes:
  - Added `searchHelp`, `searchHelpParameter`, `setGetParameter` to `DataElementBuilderConfig`
  - Updated `DataElementBuilder.update()` to pass search help parameters to `UpdateDataElementParams`
  - Full support for search help configuration in data element operations

## [1.1.11] - 2025-11-28

### Fixed
- **DomainHighHandlers - Update workflow detection bug** – fixed critical issue where domain update operations were incorrectly using CREATE workflow instead of UPDATE workflow:
  - **Root cause:** `DomainBuilder.update()` method determines which workflow to use (CREATE vs UPDATE) by checking if `this.state.createResult` exists. When `CrudClient.getDomainBuilder()` reuses a builder instance from a previous `createDomain()` call, the builder still has `createResult` in its state, causing `update()` to incorrectly use CREATE workflow (`upload()` function) instead of UPDATE workflow (`updateDomain()` function).
  - **Solution:** Modified `handleUpdateDomain` to pass `packageName` directly to `lockDomain()` call, ensuring the builder is created with correct configuration from the start. This prevents builder reuse issues and ensures proper workflow detection.
  - **Additional fix:** Removed redundant validation step from `handleUpdateDomain` handler. The validation was checking if domain exists, but `lockDomain()` will fail if domain doesn't exist anyway, making the validation step unnecessary and potentially causing confusion.
  - **Impact:** Domain update operations now correctly use UPDATE workflow for existing domains, preventing "Domain already exists" errors that were occurring when the system tried to create an already-existing domain.

### Changed
- **DomainHighHandlers test logging** – completely refactored test logging system for better information density and clarity:
  - **Removed verbose `debugLog()` system** – eliminated all `debugLog()` calls that were cluttering test output with verbose JSON structures and nested data objects
  - **Introduced concise logging** – replaced with simple, informative `console.log()` statements that provide clear, actionable information:
    - Clear operation names (e.g., "High Create: Creating domain...", "High Update: Updating domain...")
    - Success/failure status with object names
    - Skip reasons when tests are skipped
    - Visual infographics (emojis) for quick visual scanning of test output
  - **Simplified error handling** – removed redundant try-catch blocks and verbose error logging, now relies on Jest's native error handling which provides better stack traces
  - **More informative output** – each log statement now provides essential information (operation type, object name, status) without JSON noise
  - **Consistent with other tests** – matches logging patterns used in BehaviorDefinitionHighHandlers, PackageHighHandlers, and other high-level handler tests
  - **Better maintainability** – removed ~50 lines of verbose debug logging code, making tests easier to read and maintain
  - **Improved debugging** – concise logs make it easier to identify which operation failed and why, without scrolling through JSON dumps

### Dependencies
- **Updated `@mcp-abap-adt/adt-clients` to `^0.1.25`** – upgraded to latest version which includes:
  - Improved `DomainBuilder.update()` workflow detection logic
  - Better handling of CREATE vs UPDATE workflow selection based on builder state
  - Enhanced error messages for domain operations

### Documentation
- **Test Issues Roadmap** – comprehensive update to development roadmap:
  - **Issue #10 (DomainHighHandlers)** – changed status from "Expected Skip" to "Fixed" with detailed explanation
  - **Updated statistics:** 8 fixed issues (was 7), 1 expected skip (was 3)
  - **Added detailed problem analysis:** Documented root cause, solution approach, and code changes
  - **Improved issue tracking:** Better categorization of issues vs expected skips vs cloud limitations

### Development Process
- **Issue Roadmap System** – introduced systematic problem analysis and resolution tracking:
  - **New workflow:** Test failures are now systematically analyzed and documented in `doc/development/TEST_ISSUES_ROADMAP_*.md`
  - **Issue classification:** Problems are categorized as Simple (⚡) or Complex (🔍), with clear distinction between real issues and expected skips
  - **Problem analysis:** Each issue includes detailed error messages, root cause analysis, solution approach, and code references
  - **Progress tracking:** Roadmap maintains statistics on fixed vs pending vs expected issues, providing clear visibility into test suite health
  - **Solution documentation:** All fixes are documented with code references, making it easier to understand what was changed and why
  - **Continuous improvement:** Roadmap is updated after each test run, ensuring it reflects current state and helps prioritize future work
  - **Benefits:** Enables faster problem resolution, prevents duplicate work, and provides historical context for similar issues

## [1.1.10] - 2025-11-27

### Added
- **Behavior Implementation integration tests** – added comprehensive integration tests for Behavior Implementation handlers:
  - `BehaviorImplementationLowHandlers.test.ts` – full workflow test: Validate → Create → Check → Lock → Update → Unlock → Activate
  - `BehaviorImplementationHighHandlers.test.ts` – high-level handler test: CreateClass → Update implementations include → DeleteClass
  - Both tests include detailed step-by-step logging for better visibility and debugging
  - Tests use `implementationCode` parameter for custom implementations include code
  - Proper cleanup logic ensures test objects are deleted only if successfully created
- **Test configuration parameter for Behavior Implementation** – added `implementation_code` parameter:
  - Separate parameter for updating implementations include (local handler class) in low-level handler tests
  - `update_source_code` parameter for high-level handler tests
  - Updated test templates with correct implementation code structure
  - Improved test configuration clarity and maintainability

### Changed
- **Behavior Implementation HighHandlers test** – simplified test implementation:
  - Removed manual session state management (save/restore) – CrudClient now manages session internally
  - Removed low-level handler imports (`handleLockClass`, `handleUnlockClass`, `handleActivateClass`)
  - Test now uses only CrudClient methods for lock → update → unlock → activate workflow
  - Aligns with high-level handler pattern where each handler manages its own session and lock/unlock operations
- **Behavior Implementation handlers** – updated to use types from `@mcp-abap-adt/adt-clients`:
  - All handler parameter types now imported from `adt-clients` package
  - Ensures type consistency across handlers and client library
  - `handleCreateBehaviorImplementation` now correctly uses `BehaviorImplementationBuilderConfig` type

### Fixed
- **Behavior Implementation test configuration** – fixed test configuration for managed behavior definitions:
  - Removed `read FOR READ` method from implementation code examples in `test-config.yaml` and `test-config.yaml.template`
  - For managed behavior definitions, `read` method is auto-generated and should not be included in custom implementation code
  - Updated both low-level and high-level test configurations with correct implementation code structure
  - Tests now correctly handle managed behavior implementation classes without superfluous `read` method errors

## [1.1.10] - 2025-11-26

### Added
- **Client Connection Isolation**: Implemented per-session connection isolation to prevent data mixing between different clients
  - Each client session now maintains its own isolated SAP connection based on `sessionId` and configuration hash
  - Connections are cached per unique combination of `sessionId` + `sapUrl` + authentication parameters
  - Uses `AsyncLocalStorage` to pass session context to handlers, ensuring each request uses the correct connection
  - Prevents race conditions where concurrent requests from different clients could overwrite each other's connection settings
  - Backward compatible: falls back to global connection cache for non-HTTP transports (stdio)

- **Non-Local Connection Restrictions**: Added security restrictions for non-local connections
  - **SSE Transport**: Always restricted to localhost connections only (127.0.0.1, ::1, localhost)
  - **HTTP Transport**: Non-local connections are restricted when:
    - `.env` file exists (was found at startup)
    - AND request does not include SAP connection headers (`x-sap-url`, `x-sap-auth-type`)
  - Non-local connections with SAP headers are allowed (enables multi-tenant scenarios)
  - Local connections are always allowed regardless of `.env` file presence
  - Clear error messages guide users when connections are rejected

### Changed
- **Connection Management**: Refactored `getManagedConnection()` to support session-based connection caching
  - Added `generateConnectionCacheKey()` function to create unique cache keys from sessionId and config signature
  - Implemented `getConnectionForSession()` to retrieve or create session-specific connections
  - Added automatic cleanup of old connection cache entries (older than 1 hour)
  - Each session uses unique `sessionId` for its `AbapConnection` to prevent session mixing

- **Session Tracking**: Enhanced `streamableHttpSessions` to store SAP configuration per session
  - Added `sapConfig` field to session objects to track configuration per client
  - `applyAuthHeaders()` now stores configuration in session object
  - Session cleanup automatically removes associated connection from cache

### Security
- **Connection Isolation**: Prevents one client from receiving another client's data when multiple clients connect to different SAP systems
- **Access Control**: Restricts non-local access when `.env` file is present, requiring explicit SAP headers for remote connections

## [1.1.9] - 2025-11-24

### Added
- **DDLX (Metadata Extension) Management Tools**:
  - `CreateMetadataExtension`: Create new ABAP Metadata Extensions (DDLX) with automatic activation
  - `UpdateMetadataExtension`: Update source code of existing Metadata Extensions
  - Full CRUD workflow: Create → Lock → Check → Unlock → Activate
  - Support for transport request validation
  - Integrated with CrudClient API for consistent behavior

- **BDEF (Behavior Definition) Management Tools**:
  - `CreateBehaviorDefinition`: Create new ABAP Behavior Definitions (BDEF) with support for Managed, Unmanaged, Abstract, and Projection implementation types
  - `UpdateBehaviorDefinition`: Update source code of existing Behavior Definitions
  - Full CRUD workflow: Create → Lock → Check → Unlock → Activate
  - Support for root entity specification and implementation type selection
  - Transport request validation integrated
- **Full Low-Level CRUD Coverage**:
  - Added dedicated `create`, `lock`, `unlock`, `check`, `validate`, `delete`, and `update` handlers for classes, programs, interfaces, function groups/modules, domains, data elements, packages, tables, views, structures, transports, and more to cover every `CrudClient` method.
  - Each handler now has a consistent naming scheme (`CreateX`, `UpdateX`, etc.) to match the high-level counterparts.

- **System Management Tools**:
  - `GetInactiveObjects`: Retrieve list of inactive ABAP objects (objects that have been modified but not activated)
  - Provides count and detailed list of objects waiting for activation
  - Useful for monitoring development progress and identifying objects requiring attention

### Changed
- **Handler Organization Refactoring**: All handlers reorganized into categorized subdirectories with explicit `high/`, `low/`, and `readonly/` layers for better maintainability. Each low-level handler description now starts with `[low-level]`, and every read handler was moved to the new `readonly/` folders and tagged `[read-only]`. This improves discoverability, enforces single-responsibility boundaries, and makes it clear which tools mutate SAP data.
  - `bdef/` - Behavior Definition handlers (GetBdef, CreateBehaviorDefinition, UpdateBehaviorDefinition)
  - `class/` - Class handlers (GetClass, CreateClass, UpdateClass, ValidateClass, CheckClass)
  - `common/` - Common handlers (ActivateObject, DeleteObject, CheckObject, LockObject, UnlockObject, ValidateObject)
  - `data_element/` - Data Element handlers (GetDataElement, CreateDataElement, UpdateDataElement)
  - `ddlx/` - Metadata Extension handlers (CreateMetadataExtension, UpdateMetadataExtension)
  - `domain/` - Domain handlers (GetDomain, CreateDomain, UpdateDomain)
  - `enhancement/` - Enhancement handlers (GetEnhancements, GetEnhancementImpl, GetEnhancementSpot)
  - `function/` - Function handlers (GetFunction, GetFunctionGroup, CreateFunctionGroup, CreateFunctionModule, UpdateFunctionModule, ValidateFunctionModule, CheckFunctionModule)
  - `include/` - Include handlers (GetInclude, GetIncludesList)
  - `interface/` - Interface handlers (GetInterface, CreateInterface, UpdateInterface)
  - `package/` - Package handlers (GetPackage, CreatePackage)
  - `program/` - Program handlers (GetProgram, CreateProgram, UpdateProgram)
  - `search/` - Search handlers (SearchObject, GetObjectsByType, GetObjectsList)
  - `structure/` - Structure handlers (GetStructure, CreateStructure)
  - `system/` - System handlers (GetTypeInfo, GetTransaction, GetSqlQuery, GetWhereUsed, GetObjectInfo, GetSession, GetAbapAST, GetAbapSemanticAnalysis, GetAbapSystemSymbols, GetAllTypes, GetObjectStructure, GetObjectNodeFromCache, GetInactiveObjects)
  - `table/` - Table handlers (GetTable, GetTableContents, CreateTable, ValidateTable, CheckTable)
  - `transport/` - Transport handlers (GetTransport, CreateTransport)
  - `view/` - View handlers (GetView, CreateView, UpdateView)
  - This reorganization improves code navigation, reduces merge conflicts, and makes the codebase more maintainable

- **Dependencies Updated**:
  - `@mcp-abap-adt/adt-clients`: ^0.1.9 → ^0.1.12
  - `@mcp-abap-adt/connection`: ^0.1.4 → ^0.1.9
  - Updated to leverage new CrudClient methods for DDLX and BDEF operations

- **Index and Tools Registry Updates**:
  - `src/index.ts`: Updated all handler imports to reflect new subdirectory structure
  - `src/lib/toolsRegistry.ts`: Updated tool definitions imports to match new handler locations
  - All 81 handler files moved and imports updated consistently
- **Tooling Improvements**:
  - `tools/generate-tools-docs.js` now outputs a navigation tree that mirrors the document structure, separates high-/low-/read-only tools, and adds summary counts for each level.
  - `doc/user-guide/AVAILABLE_TOOLS.md` regenerated to include the new navigation, level-specific anchors, and the `[read-only]` marker.
  - Test suite, configs, and helper scripts updated to follow the new directory layout and renamed high-level handlers (`UpdateClass`, `UpdateProgram`, etc.).
- **Low-Level Tool Names**:
  - Every low-level handler now advertises a unique MCP tool name suffixed with `Low` (e.g., `CreateClassLow`, `UpdateDomainLow`, `LockPackageLow`). This prevents `Tool <name> is already registered` errors when both low/high versions exist and keeps the server compatible with clients that look up tools by name.

### Documentation
- Added `implementation_plan.md`: Plan for future refactoring of read handlers to `src/readers` directory
- Removed `roadmap.md`: Work items are complete, so the standalone roadmap is no longer required

## [1.1.8] - 2025-11-24

_Documentation for this tag is intentionally minimal; see the Git tag `v1.1.8` for its exact contents._

## [1.1.6] - 2025-11-21

### Documentation
- **Comprehensive CLI documentation**: Added detailed documentation for all command line options and configuration
  - Updated README.md with global installation guide and CLI usage examples
  - Enhanced INSTALLATION.md with complete CLI options reference
  - Created new CLI_OPTIONS.md with comprehensive command line reference
  - Documented environment file priority and auto-discovery behavior
  - Added troubleshooting section for common CLI issues

## [1.1.5] - 2025-11-21

### Added
- **--help flag**: Added comprehensive help message showing all CLI options, environment variables, and usage examples
  - Shows transport options (stdio, http, sse)
  - Lists all HTTP and SSE configuration options
  - Documents SAP connection environment variables
  - Includes practical usage examples

### Fixed
- **Global installation .env loading**: Fixed .env file discovery for globally installed packages
  - Now correctly prioritizes `process.cwd()/.env` (user's working directory) over package directory
  - Works correctly when installed via `npm install -g`
  - Better error messages showing current directory and suggesting --env flag
- **--env argument parsing**: Fixed custom .env file path support
  - Both `--env=/path/to/.env` and `--env /path/to/.env` formats now work correctly
  - Relative paths are resolved from current working directory
  - Clear feedback messages showing which .env file is being used
- **Runtime dependencies**: Moved `dotenv` from devDependencies to dependencies
  - Fixes "Cannot find module 'dotenv'" error when installed globally
  - Ensures all runtime dependencies are available in production

### Changed
- **All handlers refactored to use CrudClient** – replaced Builder pattern with unified CrudClient API
  - **18 handlers converted**: Create (Program, DataElement, Domain, FunctionGroup, FunctionModule, Package, Structure, Table, Transport, View), Update (ClassSource, DataElement, InterfaceSource), Check (Class, FunctionModule, Table, Object), Validate (Class, Object), Lock/Unlock (Object)
  - Removed direct Builder instantiation from all handlers
  - All CRUD operations now use CrudClient methods (createProgram, lockClass, updateInterface, etc.)
  - Session ID no longer exposed - internal to CrudClient implementation
  - Simplified error handling with try-catch around lock/update/unlock sequences

### Fixed
- **utils.ts deprecated methods** – added TODO comments for missing ReadOnlyClient methods
  - `fetchNodeStructure()` - marked for future implementation
  - `getSystemInformation()` - marked for future implementation
  - Both throw errors with clear TODO messages instead of attempting non-existent method calls

## [1.1.3] - 2025-11-21

### Added
- **Parameter Optionality Sync Tool**: Created `tools/sync-optional-from-interfaces.js` to extract optional parameter information from TypeScript interfaces
  - Extracts required vs optional fields from `@mcp-abap-adt/adt-clients` builder interfaces
  - Provides single source of truth for parameter optionality
  - Prevents drift between TypeScript interfaces and MCP tool definitions
  - Documentation added in `doc/development/SYNC_OPTIONAL_PARAMS.md`

### Changed
- **CreateDomain Handler**: Synced parameter optionality with `DomainBuilderConfig` interface
  - Only `domain_name` is required (was incorrectly requiring `package_name`)
  - Marked all optional parameters with `(optional)` prefix in descriptions
  - Ensures consistency with TypeScript interface definitions

## [1.1.2] - 2025-11-21

### Fixed
- **STDIO Transport**: Fixed STDIO transport broken by mixing old `Server` and new `McpServer` APIs
  - Removed legacy `Server` class and `setupHandlers()` method
  - Unified all transports (STDIO, HTTP, SSE) to use single `McpServer` instance
  - Fixed STDIO connection to use `mcpServer.server.connect(transport)` pattern
  - Removed unused imports: `Server`, `CallToolRequestSchema`, `ListToolsRequestSchema`

### Added
- **SSE Development Tool**: Created `tools/dev-sse.js` for proper SSE server development workflow
  - Launches SSE server on port 3001 (default)
  - Automatically starts MCP Inspector with correct SSE endpoint (`http://localhost:3001/sse`)
  - Mirrors `dev-http.js` functionality for consistent development experience
  - Updated `npm run dev:sse` to use new development script

## [Unreleased]

> Package-specific changes (e.g., `@mcp-abap-adt/adt-clients`) are tracked in their respective repositories and npm packages.

### Changed
- **Dependencies**: Project now uses published npm packages instead of local workspace dependencies:
  - `@mcp-abap-adt/adt-clients` and `@mcp-abap-adt/connection` are now installed from npm
  - Removed workspace configuration and git submodules
  - Updated documentation to reflect npm package usage

### Added
- **Documentation Restructure**:
  - New platform-specific installation guides: `INSTALL_WINDOWS.md`, `INSTALL_MACOS.md`, `INSTALL_LINUX.md`
  - Main entry point: `INSTALLATION.md` with quick links to platform guides
  - SSE/HTTP transport mode documentation for web-based clients
  - nvm (Node Version Manager) as recommended installation method for all platforms
  - Server transport modes documentation: stdio (default for Cline/Cursor) and SSE/HTTP (for web interfaces)
  - SSE server options: `--sse-port`, `--sse-host`, `--sse-allowed-origins`, `--sse-enable-dns-protection`
  - Examples for running server in SSE mode: `npm run start:sse`, `npm run start:http`
- **Transport Request Validation**:
  - New utility function `validateTransportRequest()` for consistent validation across all Create handlers
  - Transport request is now optional for `$TMP` (local) package only
  - Transport request is required for all transportable (non-`$TMP`) packages
  - Clear error messages guide users to use `package_name: "$TMP"` for local development
  - Test configuration updated with `$TMP` example in `test-config.yaml.template`
  - Note: `$TMP` is the only local package in SAP - each user has their own `$TMP`
- **Domain Management Tools**:
  - `GetDomain`: Retrieve ABAP domain structure and properties
  - `CreateDomain`: Create new ABAP domains with automatic activation
  - Simplified workflow: POST with all properties + Activate + Verify
  - SAP handles locking automatically on transport
  - Full test coverage with `test-create-domain.js` and `test-get-domain.js`
- **Data Element Management Tools**:
  - `GetDataElement`: Retrieve ABAP data element information including type definition, field labels, and metadata
  - `CreateDataElement`: Create new ABAP data elements with domain references and field labels
  - Simplified workflow: POST with full body + Activate + Verify (similar to CreateDomain)
  - Support for all field labels: short (10), medium (20), long (40), heading (55)
  - Support for search help, change document, and other data element properties
  - Full test coverage with `test-create-data-element.js` and `test-get-data-element.js`
- **Transport Management Tools**:
  - `CreateTransport`: Create new ABAP transport requests with automatic task creation
  - `GetTransport`: Retrieve comprehensive transport information with objects and tasks
  - Eclipse-compatible XML structure with proper Content-Type headers
  - Support for workbench (K) and customizing (T) transport types
  - Complete transport metadata parsing and validation
  - Full test coverage with `test-create-transport.js` and `test-get-transport.js`
- **Dictionary Objects Management Tools**:
  - `CreateTable`: Create new ABAP tables with fields, keys, and technical settings
  - `CreateStructure`: Create new ABAP structures with fields and type references
  - `GetView`: Retrieve ABAP database view definition including tables, fields, joins, and selection conditions
  - Comprehensive field definitions with data types, lengths, decimals, key flags, NOT NULL constraints
  - Support for domain and data element references in field definitions
  - Table delivery classes (A/C/L/G) and data categories (APPL0/APPL1/APPL2) configuration
  - Structure includes and field type references (domains, data elements, structures, tables)
  - View analysis with tables, joins, selection conditions, and optional data retrieval
  - Full test coverage with `test-create-table.js`, `test-create-structure.js`, and `test-get-view.js`
- Domain creation creates and activates domain in one operation (3 steps vs Eclipse's 7 steps)
- Data element creation follows same simplified approach (3 steps vs Eclipse's multiple LOCK/UNLOCK operations)
- All domain properties (datatype, length, decimals, lowercase, sign, conversion exit, value table) supported
- All data element properties (domain reference, field labels, type info, search help) supported

### Changed
- `CreateTable` handler now mirrors Eclipse ADT workflow: status check, `abapCheckRun`, lock cleanup, activation retry, and post-activation ident checks matching SAP behaviour.
- `BaseAbapConnection` merges session cookies across responses to keep SAP ADT sequences authenticated and clears them on reset.
- Added dedicated `jest.setup.js` to skip automatic MCP server bootstrap during Jest runs, eliminating TDZ errors in the test environment.
- Narrowed Jest `testMatch` patterns to `*.test.[tj]s` and removed legacy CLI scripts from the suite to prevent false negatives.
- Updated `tests/integration/handleGetFunction.int.test.js` to accept either JSON or plain-text payloads and perform case-insensitive source assertions.
- Translated legacy inline comments and documentation references to English for consistency with project guidelines.
- MCP protocol compliance: All handler responses now strictly follow the MCP protocol.
- Removed all `mimeType` and `data` fields from handler responses.
- For type `"text"` in `content`, only the `text` field is used.
- For type `"json"` in `content`, only the `json` field is used.
- Unified response format for all handlers: `{ isError, content: [{ type: "text", text: ... }] }` or `{ isError, content: [{ type: "json", json: ... }] }`.
- Fixed all MCP client errors related to invalid response format.
- Updated documentation and handler tables to reflect new response format.
- Added two new tools for batch ABAP object type detection:
  - DetectObjectTypeListArray: accepts array of objects via 'objects' parameter.
  - DetectObjectTypeListJson: accepts JSON payload with 'objects' array via 'payload' parameter.
- Added documentation for both tools: see [DetectObjectTypeListTools.md](docs/development/DetectObjectTypeListTools.md).
- Repository URL changed from `mario-andreschak/mcp-abap-adt` to `fr0ster/mcp-abap-adt`
- Added acknowledgment to original project in README.md
- **All Create handlers updated**:
  - `CreateDomain`, `CreateDataElement`, `CreateClass`, `CreateProgram`, `CreateInterface`
  - `CreateFunctionGroup`, `CreateTable`, `CreateStructure`, `CreateView`
  - All now validate transport_request based on package type ($TMP vs transportable)
  - `transport_request` parameter removed from `required` fields in tool schemas where applicable

### Removed
- **Deprecated Documentation Files**:
  - Removed `INSTALLATION_GUIDE_EN.md`, `INSTALLATION_GUIDE_UA.md`, `INSTALLATION_GUIDE_BY.md` (replaced by platform-specific guides)
  - Removed Smithery automatic installation instructions (not supported)
  - Removed Smithery badge from README.md
  - Removed all references to `@mario-andreschak/mcp-abap-adt` package

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- New MCP tool: `DetectObjectTypeList`
  - Batch detection of ABAP object types by a list of names.
  - Input: `{ global: [{ name: string, type?: string }] }`
  - Output: `{ isError: boolean, content: Array<{ name, detectedType, description, shortText, longText, text, package, uri }> }`
  - Available via MCP API and web interface.
  - All comments and documentation in English.

### Changed
- All handler modules now use a unified in-memory caching mechanism via `objectsListCache`. This provides consistent, easily swappable cache logic across the codebase.
- The `filePath` parameter and all file write logic have been removed from all handlers. Handler results are now only cached in memory, not written to disk.
- This refactor improves maintainability, testability, and performance by eliminating redundant file operations and centralizing cache management.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2025-07-08

### Added
- All MCP handler functions now support an optional `filePath` parameter. If provided, the handler will save the result to the specified file path (any absolute or relative path, with any extension).
- All CLI test scripts now accept the `--filePath=...` argument to save the result to a file.
- The result written to file is exactly what is returned to the user (no extra formatting or caching).
- Improved error logging and debug output for file writing operations.
- Updated documentation and usage examples in README.md to reflect new file output support.
- Implemented utility `writeResultToFile` for safe file writing with directory restriction and logging.

## [1.3.0] - 2025-07-08

### Added
- Added integration test `tests/integration/handleGetFunction.int.test.js` for handleGetFunction.
- Significantly expanded integration test coverage in `src/index.test.ts` for all main tools (GetProgram, GetClass, GetFunctionGroup, GetFunction, GetTable, GetStructure, GetTableContents, GetPackage, GetInclude, GetTypeInfo, GetInterface, GetTransaction, GetEnhancements, GetSqlQuery, SearchObject).
- Added new checks for advanced scenarios (e.g., SQL generation, error handling, enhancement XML parsing).

### Changed
- Updated documentation regarding testing and integration scenarios.

## [1.2.0] - 2025-07-02

### Changed
- `GetWhereUsed` now supports any ADT object type (e.g. table/TABL, bdef/BDEF, etc.), not just class, program, include, function, interface, package.
- Updated documentation in README.md and jsdoc for supported object types and usage examples.

## [1.1.0] - 2025-02-19

### Added
- New `GetTransaction` tool to retrieve ABAP transaction details.
  - Allows fetching transaction details using the ADT endpoint `/sap/bc/adt/repository/informationsystem/objectproperties/values`.
  - Added documentation in README.md.

## [0.1.2] - 2025-02-18

### Changed
- Added Jest Test Script `index.test.ts` available through `npm test`
- Enhanced `makeAdtRequest` method to support:
  - Custom headers through an optional parameter
  - Query parameters through an optional `params` parameter
- Improved `handleGetPackage` method to use ADT's nodeContent API
  - Now uses POST request with proper XML payload
  - Added specific content type headers for nodeContent endpoint
  - Added filtering to return only objects with URI 
- Improved CSRF token handling in utils.ts
  - Added automatic CSRF token fetching for POST/PUT requests
  - Enhanced token extraction to work with error responses
  - Added cookie management for better session handling
  - Implemented singleton axios instance for consistent state
  - Added proper cleanup for test environments

## [0.1.1] - 2025-02-13

### Added
- New `GetInterface` tool to retrieve ABAP interface source code
  - Allows fetching source code of ABAP interfaces using the ADT endpoint `/sap/bc/adt/oo/interfaces/`
  - Similar functionality to GetClass but for interfaces
  - Added documentation in README.md

## [0.1.0] - Initial Release

### Added
- Initial release of the MCP ABAP ADT server
- Basic ABAP object retrieval functionality
- Support for programs, classes, function modules, and more
- Documentation and setup instructions
