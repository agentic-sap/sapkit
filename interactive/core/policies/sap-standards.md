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
4. After every create/update: `CheckSyntax` → activate → confirm `GetInactiveObjects` returns zero leftovers.
5. Never release a transport containing syntax errors or inactive objects.
6. Respect the configured `sapVersion` and `abapRelease` from `.sc4sap/config.json` — ECC, S/4, Cloud Public, and Cloud Private each forbid different tables, patterns, and syntax.
7. If `sapVersion` / `abapRelease` are unset, fail safe: stop and ask the user to establish [project context](../project-context.md) first.

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
- The full machine-verification chain (syntax → activation → unit tests → ATC) is defined in [verification-policy](./verification-policy.md).

## 4. Version guard

Check `sapVersion` and `abapRelease` in `.sc4sap/config.json` **before** recommending any table, TCode, BAPI, pattern, or syntax ([project-context](../project-context.md)). Summary of what each version forbids:

| Version | Forbidden / constrained | Reference |
|---|---|---|
| **ECC 6.0** | S/4-only tables (`ACDOCA`, `MATDOC`, `BUT000`-centric BP flows); `MATNR` longer than CHAR18; syntax newer than the configured `abapRelease`. If a needed DDIC element is missing, follow the fallback gate. | [sap-version-reference](../knowledge/abap/conventions/sap-version-reference.md), [ecc-ddic-fallback](../knowledge/abap/conventions/ecc-ddic-fallback.md) |
| **S/4HANA (on-prem / Private)** | Direct `SELECT` on `BSEG`, `MKPF`/`MSEG` (use `ACDOCA`, `MATDOC`, or released CDS views); deprecated BAPIs such as `BAPI_CUSTOMER_CREATEFROMDATA1`; write access to compatibility tables (`KNA1`/`LFA1` are read-only). | [sap-version-reference](../knowledge/abap/conventions/sap-version-reference.md) |
| **S/4HANA Cloud Public** | Entire classic stack: Dynpro/`CALL SCREEN`, event blocks (`START-OF-SELECTION` etc.), freestyle reports, `CL_GUI_ALV_GRID`, file/dataset access, direct DDIC selects. Redirect to `if_oo_adt_classrun`, RAP + Fiori Elements, released APIs. Fail fast and propose the Cloud-native equivalent. | [cloud-abap-constraints](../knowledge/abap/conventions/cloud-abap-constraints.md) |
| **S/4HANA Cloud Private** | Classic Dynpro is technically possible but discouraged — warn the user and confirm intent before generating it. | [sap-version-reference](../knowledge/abap/conventions/sap-version-reference.md) |

- Independently of `sapVersion`, never emit syntax newer than the configured `abapRelease`: [abap-release-reference](../knowledge/abap/conventions/abap-release-reference.md).
