---
name: sap-standards
description: Non-negotiable SAP development standards — Z/Y naming, transport assignment, activation discipline, and per-version guard rails
source:
  - sc4sap-custom/CLAUDE.md
  - core/knowledge/abap/conventions/naming-conventions.md
  - core/knowledge/abap/conventions/sap-version-reference.md
  - core/knowledge/abap/conventions/cloud-abap-constraints.md
  - core/policies/transport-client-rule.md
---

# SAP Development Standards

## Always-on summary

> This block is injected verbatim into every harness context. Full rules below.

1. Every custom object uses a `Z`/`Y` prefix — pattern `Z{MODULE}{TYPE}{NN}`; verify the name is free before creating.
2. Every change (create, update, delete) is assigned to a transport — no transport, no change.
3. `CreateTransport` always receives an explicit `client` resolved from the active profile — never an implicit default.
4. After every create/update: `CheckSyntax` → activate → confirm `GetInactiveObjects` returns zero leftovers — read the run-level `activated`/`checked` flags, and treat an empty `GetInactiveObjects` as necessary, not sufficient.
5. Never release a transport containing syntax errors or inactive objects.
6. Respect the configured `sapVersion` and `abapRelease` from `.sapkit/config.json` — ECC, S/4, Cloud Public, and Cloud Private each forbid different tables, patterns, and syntax.
7. If `sapVersion` / `abapRelease` are unset, fail safe: stop and ask the user to establish [project context](../project-context.md) first.
8. Never state a platform or tooling constraint from memory — look for a counter-example on the connected system first, above all where the constraint would hand work back to the user.

## 1. Naming — Z/Y prefix is mandatory

- All custom objects live in the customer namespace: `Z` or `Y` prefix, no exceptions.
- Programs and DDIC objects follow `Z{MODULE}{TYPE}{NN}` (e.g. `ZFIR00010`); classes `ZCL_{MODULE}_{PURPOSE}`; function modules `Z{MODULE}FM_{PURPOSE}`; CDS views use VDM prefixes `ZI_`/`ZR_`/`ZC_`/`ZP_`.
- Before proposing any name, verify it does not already exist (`SearchObject` / `GetObjectInfo`); pick sequence numbers as last-used + 10, and share one `{NN}` across sibling objects of the same unit of work.
- Full rules: [naming-conventions](../knowledge/abap/conventions/naming-conventions.md).

## 2. Transport discipline

- Every change goes on a transport. Description format: `[MODULE] [Action] [Object] - [brief]`.
- Every `CreateTransport` call MUST pass an explicit `client`, resolved from the active profile (`sap.env` → `SAP_CLIENT`, fallback `config.json` → `client`). If neither is set, refuse the call. Full rule: [transport-client-rule](./transport-client-rule.md).
- Never release a transport while any contained object has syntax errors or is inactive. Release flow and machine checks: [verification-policy](./verification-policy.md).

## 3. Activation discipline

- Activation is part of the change, not an afterthought. After every create or update:
  1. `CheckSyntax` — server-side ADT syntax check.
  2. Activate (`ActivateObjects`) — note that activating a main program does NOT cascade to sub-includes; activate them explicitly or in one batch call.
  3. `GetInactiveObjects` — must come back empty for the touched objects before reporting success.
- Read the activation response correctly: the **run-level** `activated` and `checked` flags are the signal, not the per-object `status`. A run reporting `activated: false` + `checked: false` activated nothing even where each object says `status: "activated"` with no errors. And an empty `GetInactiveObjects` is a **necessary** condition, not a sufficient one — an orphaned inactive version never reaches the worklist. Both readings, their oracle, and the way out: [verification-policy](./verification-policy.md) step 2 and [troubleshooting](../procedures/troubleshooting.md) § 8.
- The full machine-verification chain (syntax → activation → unit tests → ATC) is defined in [verification-policy](./verification-policy.md).

## 4. Version guard

Check `sapVersion` and `abapRelease` in `.sapkit/config.json` **before** recommending any table, TCode, BAPI, pattern, or syntax ([project-context](../project-context.md)). Summary of what each version forbids:

| Version | Forbidden / constrained | Reference |
|---|---|---|
| **ECC 6.0** | S/4-only tables (`ACDOCA`, `MATDOC`, `BUT000`-centric BP flows); `MATNR` longer than CHAR18; syntax newer than the configured `abapRelease`. If a needed DDIC element is missing, follow the fallback gate. | [sap-version-reference](../knowledge/abap/conventions/sap-version-reference.md), [ecc-ddic-fallback](../knowledge/abap/conventions/ecc-ddic-fallback.md) |
| **S/4HANA (on-prem / Private)** | Direct `SELECT` on `BSEG`, `MKPF`/`MSEG` (use `ACDOCA`, `MATDOC`, or released CDS views); deprecated BAPIs such as `BAPI_CUSTOMER_CREATEFROMDATA1`; write access to compatibility tables (`KNA1`/`LFA1` are read-only). | [sap-version-reference](../knowledge/abap/conventions/sap-version-reference.md) |
| **S/4HANA Cloud Public** | Entire classic stack: Dynpro/`CALL SCREEN`, event blocks (`START-OF-SELECTION` etc.), freestyle reports, `CL_GUI_ALV_GRID`, file/dataset access, direct DDIC selects. Redirect to `if_oo_adt_classrun`, RAP + Fiori Elements, released APIs. Fail fast and propose the Cloud-native equivalent. | [cloud-abap-constraints](../knowledge/abap/conventions/cloud-abap-constraints.md) |
| **S/4HANA Cloud Private** | Classic Dynpro is technically possible but discouraged — warn the user and confirm intent before generating it. | [sap-version-reference](../knowledge/abap/conventions/sap-version-reference.md) |

- Independently of `sapVersion`, never emit syntax newer than the configured `abapRelease`: [abap-release-reference](../knowledge/abap/conventions/abap-release-reference.md).

## 5. Constraint claims — check the connected system before asserting a limit

§4 governs claims about what a *release* forbids. This rule governs the wider
class: any statement that something **cannot be done** — not by this tool set, not
in this platform, not without a GUI. State one from memory and it becomes a
design premise, and premises are rarely re-examined once the plan is built on
them.

- Before asserting a constraint, **look for a counter-example on the system that
  is already connected** — an existing object built the way you just declared
  impossible, an interface listing the method you assumed absent. That check is
  usually one read call.
- Apply it hardest where **the constraint would push work back onto the user**
  ("only SE80 can do this", "that model has to be built in the GUI"). A wrong
  limit in that direction costs the user their own time, and it is the direction
  where a claim is least likely to be challenged.
- Where the check cannot be run, say what is unverified rather than rounding it
  to a fact — "I have not confirmed this on your system" is a usable answer; an
  invented boundary is not.
- The same care applies to the opposite claim: a tool being absent does not
  establish that a capability is absent
  ([troubleshooting](../procedures/troubleshooting.md) § 8).

Field-reported 2026-09-09: a model was declared GUI-only and a work order written
on that premise, while a counter-example sat on the same server and the user had
to produce it.
