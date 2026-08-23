# Function Module Source Convention

**Scope.** Every source body that sapkit skills and agents produce for `CreateFunctionModule` and `UpdateFunctionModule`.

**Problem this rule fixes.** Earlier runs emitted Function Module source shaped like this:

```abap
FUNCTION zmmfm_po_create_ext
 " You can use the template 'functionModuleParameter' to add here the signature!
.
  DATA: lv_iv_lifnr TYPE lifnr.   " ← FAKE import: actually a local, never populated
  ...
ENDFUNCTION.
```

What came of it: SE37 showed an empty signature, no caller could hand the module an argument, and every internal `IS INITIAL` guard fired unconditionally. To all appearances the FM was activated; in function it was dead.

## HARD RULE — Inline signature only

As far as SAP ADT is concerned, Function Module parameters live **inline in the `FUNCTION` statement source** — not in `*"` comment blocks, and not behind a separate metadata endpoint. The evidence is standard SAP code: ask `GetFunctionModule` for `BAPI_TRANSACTION_COMMIT` or `BAPI_MATERIAL_SAVEDATA` and its source shows the parameters sitting directly between `FUNCTION name` and the first `.`:

```abap
FUNCTION bapi_transaction_commit
  IMPORTING
    VALUE(WAIT) LIKE BAPITA-WAIT OPTIONAL
  EXPORTING
    VALUE(RETURN) LIKE BAPIRET2.

  " body
ENDFUNCTION.
```

Hand FM source to `UpdateFunctionModule` from sapkit and SAP parses that inline signature, updating TFDIR/FUPARAREF on its own. **The signature can be set no other way** — there is no "parameters" endpoint standing apart from the source, and no `*"*"Local Interface:` auto-generation that writes itself back into it.

## Required source template (every FM)

```abap
FUNCTION {fm_name}
  IMPORTING
    VALUE({IV_PARAM1})  TYPE  {type}  [OPTIONAL|DEFAULT value]
    VALUE({IV_PARAM2})  TYPE  {type}
  EXPORTING
    VALUE({EV_PARAM1})  TYPE  {type}
  CHANGING
    VALUE({CV_PARAM1})  TYPE  {type}           " only if actually needed
  TABLES
    {ET_TABLE1}  STRUCTURE  {structure}         " note: TABLES uses STRUCTURE, not TYPE
  EXCEPTIONS
    {EXCEPTION_NAME}.                           " only if the FM signals via EXCEPTIONS; prefer RETURN of BAPIRET2

  " ---- body -------------------------------------------------------------
  " real code here; reference IV_* / EV_* / CV_* / ET_* directly,
  " NEVER declare `lv_iv_xxx TYPE ...` locals to simulate parameters.
ENDFUNCTION.
```

### Key constraints

1. **Whatever follows the `FUNCTION {name}` line must immediately be an `IMPORTING` / `EXPORTING` / `CHANGING` / `TABLES` / `EXCEPTIONS` clause** — the only alternative is a bare `.`, and that only for a module which genuinely takes no parameters (rare — dispatcher and trigger FMs alone).
2. **This placeholder line must never be emitted**: `" You can use the template 'functionModuleParameter' to add here the signature!` → its presence means the signature is empty.
3. **No "shadow locals"** — a declaration such as `lv_iv_lifnr TYPE lifnr` inside the body, standing in for a missing IMPORTING parameter, is forbidden. Either declare the parameter for real, or leave the check out.
4. **TABLES vs TYPES table**: `STRUCTURE` (the line type) is what the old `TABLES` clause takes, never `TYPE`. Where the BAPI pattern allows it, modern style favours `IMPORTING it_xxx TYPE STANDARD TABLE OF structure`, yet traditional RFC BAPIs typically stay with `TABLES ... STRUCTURE`. Null cannot travel through an RFC `TABLES` parameter — a value that was never computed arrives as `0.00`, and never as "absent". The caller is the side that has to normalize absence into null; see [`clean-code.md`](clean-code.md) § Reconciliation Logic — Null vs Zero.
5. **Return pattern**: for BAPI-style RFCs, take `EXPORTING ev_return TYPE bapiret2` — or `TABLES et_return STRUCTURE bapiret2` where several rows are possible — in preference to ABAP `EXCEPTIONS`; that is what SAP standard convention does.
6. **Pass-by-value** (`VALUE(param)`) is the default for RFC-enabled FMs. Reference pass — `REFERENCE(param)`, or the bare name — stays available to non-RFC FMs.

## Anti-Patterns (MUST NEVER EMIT)

```abap
" ❌ Empty signature + fake locals — results in dead FM
FUNCTION zmmfm_xxx
 " You can use the template 'functionModuleParameter' to add here the signature!
.
  DATA: lv_iv_matnr TYPE matnr.
  IF lv_iv_matnr IS INITIAL. RETURN. ENDIF.   " always true — FM is unusable
ENDFUNCTION.
```

```abap
" ❌ *"*"Local Interface: block — that's READ-ONLY auto-doc, not a way to define signature
FUNCTION zmmfm_xxx.
*"----------------------------------------------------------------------
*"*"Local Interface:
*"  IMPORTING
*"     VALUE(IV_MATNR) TYPE MATNR
*"----------------------------------------------------------------------
  " body
ENDFUNCTION.
```
SAP itself GENERATES those `*"` lines on read, deriving them from TFDIR metadata. Putting them into source creates no parameters — it creates comment lines, and saving overwrites or ignores them.

## FM Signature Representation Is Direction-Specific (ADT ↔ abapGit)

The difference between the two serializations is legitimate, and **a verbatim transfer survives in neither direction** (field-verified in real project work, 2026-07, both directions):

- **Mirror → server**: the classic form is what abapGit serializes (`FUNCTION NAME.` plus a `*"` interface comment block plus `TABLES ... STRUCTURE`). Paste that into `UpdateFunctionModule` and it comes back rejected — `Parameterkommentarblöcke sind nicht zulässig`. **Modern inline signatures are all the ADT write path accepts.**
- **Server → mirror**: what `GetFunctionModule` returns is the modern inline form, and dropping that into an abapGit mirror violates the mirror's classic-format convention. Leave the body byte-identical; rewrite the signature representation and nothing else.
- When authoring a new FM, the fastest safe path is to pull an existing FM **from the same system** through `GetFunctionModule` and copy, exactly, the format the server hands back. The mirror-side rules live in [`abapgit-roundtrip-rule.md`](abapgit-roundtrip-rule.md).

## Integration Points

- `skills/create-object/SKILL.md` → the FM path has to route through this rule before it reaches `UpdateFunctionModule`.
- `skills/create-program/phase4-parallel.md` Wave 2 Group 3 (Functions) → the executor assembles the FM body with an inline signature drawn from the `spec.md` parameter list.
- `skills/create-program/phase6-review.md` → the reviewer rejects any FM whose `GetFunctionModule` output still carries the `" You can use the template...` placeholder, and any whose FUNCTION statement lacks parameter clauses although the spec called for them.
- `agents/sap-executor.md` → executor templates have to carry an explicit inline-signature example ahead of every `UpdateFunctionModule` call.

## Enforcement Checklist (per FM, before `UpdateFunctionModule`)

1. The source opens with `FUNCTION {name}` and parameter clauses follow it (no empty placeholder line).
2. Each IN/OUT parameter the spec declares appears in the signature as written — no shadow locals.
3. `STRUCTURE {linetype}` is what the `TABLES` clause uses, not `TYPE`.
4. Return convention: either a `BAPIRET2` scalar or table — the preferred choice — or well-named `EXCEPTIONS`, never both.
5. RFC-enabled FM → every parameter passed by value with `VALUE(...)`.
6. A sanity `GetFunctionModule` call made after `UpdateFunctionModule` + activation comes back WITHOUT the `'functionModuleParameter'` placeholder string.

## Calling Standard FMs — Read the Signature First

An assumed interface is never a basis for calling a standard FM — read the real signature out with `GetFunctionModule` first. There are two failure modes, and neither syntax check nor activation catches either one (field-verified in real project work, 2026-07, both on one call):

- **Parameter type mismatch** stays invisible until runtime, where it surfaces as a `CALL_FUNCTION_CONFLICT_TYPE` dump.
- **`EXCEPTIONS OTHERS = 1` written against an FM that declares no EXCEPTIONS** pins `sy-subrc` at 0 — every failure then reads as success, silently. An `EXCEPTIONS` clause belongs there only when the signature actually declares exceptions.

## Remote-Enabled (RFC) flag — manual step, scope note

`TFDIR.FMODE` is where the RFC flag (`Processing Type: Remote-Enabled Module`) is stored; source does not carry it. After MCP-based FM creation it remains a **known manual step** — an investigation (2026-04-19) confirmed that the ADT REST API exposes no metadata PUT endpoint for this attribute, and that a `fmodule:processingType` attribute placed in the CREATE payload gets silently ignored. Eclipse ADT reaches it over an internal RFC channel rather than REST.

**Verify, don't assume**: for every FM destined to be reached via RFC/JCo, interrogate the flag once it exists — `SELECT funcname FROM tfdir WHERE funcname = '<FM>' AND fmode = 'R'`; nothing coming back means the module is NOT remote-enabled. Neither a successful activation nor a 0-error/0-warning syntax check exposes this; the defect appears only at call time, as "function not found in repository" on the caller side (field-verified in real project work, 2026-07: 5 of 6 freshly-created FMs failed exactly this way until the type was fixed in SE37).

Whenever sapkit creates an RFC-facing FM (PLM / WMS / external I/F), the FMs concerned MUST be flagged in the completion report with:

> ⚠ Processing Type `Remote-Enabled Module` must be set manually in SE37 Properties for: `<FM_LIST>`. MCP ADT REST does not expose this flag.

Setting the flag through source code, a metadata PUT, or CREATE-time attributes must not be attempted — all three paths are non-functional.

## RFC Interface Type Constraints

Generic types get rejected on RFC-enabled FM parameters — `TYPE P DECIMALS 2` is rejected, as is any other non-concrete type; a concrete DDIC type is required of each RFC parameter, meaning a data element or else a DDIC structure / table type. Note also that `ABAP_BOOL` is a **domain** rather than a data element: it never belongs in a data-element slot, and the data element built on that domain — `ABAP_BOOLEAN` — is what goes there. The `ABAP_BOOL` → `ABAP_BOOLEAN` release note is in [`abap-release-reference.md`](abap-release-reference.md).

## Narrow DEC Fields — BCD Overflow Kills the Whole Call

Percentage / ratio arithmetic must never be assigned into a narrow DEC field (e.g., `DEC(5,2)`). Once real data drives the ratio past ±999.99, `COMPUTE_BCD_OVERFLOW` tears down the **entire FM call** at runtime — the offending statement is not the limit of the damage. Nothing static catches it: syntax check, code review and activation all pass, since only values trigger the defect and the source never does. It gets worse over RFC — the runtime error can travel back to the caller while leaving no ST22 dump behind on the server, so afterwards there is nothing to find.

Rule: ratio / percentage math is the caller's business (Java `BigDecimal`, for instance), not that of a narrow ABAP DEC/CURR result field. When an RFC call fails and offers no explanation, capture the exception verbatim from an independent standalone probe — a minimal separate caller whose only job is to invoke the FM and surface the exception, as opposed to the full application — which is what preserves the raw runtime text.

## Function Group Is One Compile and Activation Unit

Compilation takes the function group as a whole — the group's syntax has to read **0 errors / 0 warnings** before activation, and a defect sitting in a **sibling FM** blocks activation of *your* FM as well (isolating one FM out of a defective group for activation is not possible).

- **Diagnosis leverage**: check server-side per FM — `CheckSyntax` given `object_type='function_module'` together with the shared `function_group_name` reports that module's errors with `line:column` (read-only). One compile unit means sibling defects show up in those checks too. Do NOT reach for the shortcut of `object_type='program'` against the `SAPL<fugr>` main program — only the main program body gets checked that way, and errors inside the FM includes are missed.
- **False-failure trap**: the whole group is postchecked by FM write tools, which lets a pre-existing sibling defect report your own write as *failed* even though it persisted. Verify by re-reading the FM before you write again — see [`source-repair-protocol.md`](source-repair-protocol.md).
- **The system UXX include (`L<fugr>UXX`) never belongs in an activation list.** `SAP*` editor-locks it; it is a generated container. Mechanically enumerating group members (includes list, object structure) to build an `ActivateObjects` list therefore has to filter `L<fugr>UXX` out — on the legacy `/sap/bc/adt/activation` endpoint a single UXX entry kills the ENTIRE run with 403 `ExceptionResourceNoAccess` ("Changes to L...UXX are forbidden by SAP*"; live-verified on S/4 2021, 2026-07-17). What the proven FUGR family consists of is exactly this: the `SAPL<fugr>` main program, `L<fugr>TOP`, every FM, and the FUGR itself — UXX has no place in it. (What the `/sap/bc/adt/activation/runs` mass endpoint does with a UXX entry is unmeasured — exclude it there as well.)
