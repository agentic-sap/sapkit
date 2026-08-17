# Field Typing Rule — Data Element First

**Scope.** This rule governs every field-type decision an sc4sap skill or agent makes for a Table, a Structure, or a Table Type — the standard `CreateTable` / `CreateStructure` flow **and** the ECC helper-program fallback under `ecc-ddic-fallback.md` alike.

**What goes wrong without it.** Earlier runs typed fields as a raw data type plus a length — `LIFNR CHAR 10`, `MATNR CHAR 40`, `WERKS CHAR 4` — even though SAP already delivers authoritative Data Elements carrying exactly those semantics (`LIFNR`, `MATNR`, `WERKS_D`, …). Every consuming program is then left without the search helps, the foreign-key propagation, the conversion exits, and the documentation. That reuse is obligatory, not discretionary.

## Priority (MANDATORY — applied per field)

| Priority | Source | When to use |
|---|---|---|
| **1 — Standard DE** | SAP-delivered data element (e.g., `LIFNR`, `MATNR`, `WERKS_D`, `BELNR_D`, `BUDAT`, `MENGE_D`, `MEINS`, `WAERS`, `USNAM`, `CPUDT`, `CPUTM`, `MANDT`) | Field semantics match a standard business term. This is the default — try it first. |
| **2 — CBO DE** | Existing customer Z/Y data element from the project CBO inventory | No standard DE fits, but a previously-created project DE does (e.g., from `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json`). Reuse over create. |
| **3 — New CBO DE** | Freshly-created Z data element (triggers a `CreateDataElement` / ECC DTEL helper) | Semantics are genuinely new AND the field will appear in ≥ 2 places OR carries domain-specific meaning that deserves a label + F1 help. Must follow `naming-conventions.md` (`ZFIE00010`, …). |
| **4 — Data Type + Length** | `CHAR 10`, `NUMC 4`, `DEC 15 2`, … directly on the field | Last resort. Only for purely technical / internal fields with NO business meaning (counters, flags, temporary buffers, checksums). Never for business keys (vendor, material, plant, doc no, date, quantity, UoM, currency, user, …). |

## HARD RULE — Semantic Categories That REQUIRE a Data Element

**A field that belongs to any of the five semantic categories below may never be typed at priority 4 (raw data type + length). It MUST land on priority 1, 2, or 3 — and when nothing existing fits, that means creating a new DE:**

| Category | Intent | Typical standard DE candidates | If no match → create |
|---|---|---|---|
| **Quantity / 수량** | Any numeric count of business things (pcs, kg, liters, units, …) | `MENGE_D`, `LABST`, `MEINS` (UoM companion), `BRGEW`/`NTGEW` (weight), `VOLUM` | `ZMME{NN}` domain `QUAN n d` + sibling UoM field referencing `MEINS` |
| **Amount / 금액** | Any monetary value | `DMBTR` (local crcy), `WRBTR` (doc crcy), `NETWR`, `BRTWR`, `WAERS` (currency companion) | `ZMME{NN}` domain `CURR 15 2` + sibling currency field referencing `WAERS` |
| **Date / 날짜** | Any calendar date | `BUDAT`, `BLDAT`, `CPUDT`, `ERDAT`, `AEDAT`, `LAEDA`, `VALDT` | `ZMME{NN}` domain `DATS 8` |
| **Number / 번호** | Document numbers, IDs, sequences, reference numbers | `BELNR_D`, `VBELN`, `EBELN`, `EBELP`, `MBLNR`, `AUFNR`, `POSNR`, `BANFN`, `BNFPO`, `MATNR`, `LIFNR`, `KUNNR`, `AENNR`, `STLNR` | `ZMME{NN}` domain `CHAR n` or `NUMC n` |
| **Status / 상태값** | Enum-like status / flag with a fixed set of values | `SYMSGTY`, domain-backed status DEs | `ZMME{NN}` + **new `ZMMD{NN}` domain with fixed values** (e.g., `S` / `E` / `P` for Success/Error/Pending). Do NOT emit `CHAR 1` as raw primitive — the fixed-value list is what makes a status semantically meaningful. |

### What each category loses without a DE

- **Quantity / Amount** — the decimal handling, the unit/currency linkage (the `REFERENCE` fields in DDIC), and the conversion exits all fall away, so the data quietly rounds or drifts out of alignment by report time.
- **Date** — locale-aware display and the validation helpers are gone.
- **Number** — foreign-key propagation, the alpha/numc conversion exits, and search helps are gone.
- **Status** — with no DE-backed domain there is no fixed-value whitelist, so any 1-char junk gets accepted and the UI shows no F4 dropdown.

### Detection heuristics (field-name → category)

An agent applying this rule reads the field's name alongside its length and its business context, then assigns a category:
- Name ends with `MENGE` / `QTY` / `_QTY` / `_MNG`, or a number type carries decimal places > 0 → **Quantity**
- Name ends with `BETR` / `AMT` / `_AMT` / `WRBTR` / `NETWR`, or the type is `CURR` → **Amount**
- Name ends with `DAT` / `_DATE` / `_DT`, or the type is `DATS` → **Date**
- Name ends with `NR` / `NO` / `_NO` / `_ID` / `NUMBER` / `BELNR` / `VBELN` / `EBELN` / `POSNR`, or the type is `NUMC` → **Number**
- A 1-char `CHAR` serving as a flag / state / indicator, or a name containing `STATUS` / `FLAG` / `TYPE` / `KZ` / `_ST` → **Status** (MUST have a fixed-value domain)

Once a heuristic fires, plan review rejects the priority-4 primitive automatically. Instead the planner/executor is required to route through priority 1→2→3 and, at priority 3, to create the DE — plus the domain wherever one is needed — as a sibling artifact of the table.

## Lookup Protocol (before picking a priority)

Every field walks this sequence on every run. No shortcut, no cached guess.

0. **Verify standard-table field names against the live system FIRST (standard tables only)** — never enumerate or type a field of a *standard* SAP table before reading its real field names out of the system, via `GetTable` or a single-column `GetSqlQuery` (`SELECT fieldname FROM dd03l WHERE tabname = '<TAB>'` — the single column is deliberate, so the multi-column result-shift risk cannot arise). Memory and design documents are not sources for a standard field name: an offline ABAP parser is incapable in principle of catching a wrong one, because such a name is syntactically valid and only semantically absent. Trusting memory produced these, every one of them wrong: `VBAK-WAERS` → the real field is `WAERK`; `AWTYPE` → real `AWTYP`; `COSS-WKG_WRT` → no such field exists at all, the period amounts live in columns `WKG001`–`WKG016`; `PLPO-ARBPL` → the work center is not on `PLPO`, it lives on `CRHD` (join `PLPO-ARBID` → `CRHD-OBJID`). Fields you define yourself as new CBO fields skip this step.
1. **Standard DE search** — run `SearchObject` with `query = <field-semantic-guess>` and `object_type = DTEL`, or look the field name up in the **Common Standard DE Reference** below.
   - Hit → priority 1: that DE becomes the field's `rollname`. Stop here.
   - Miss → fall through.
2. **CBO DE search** — when `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json` is present, grep it for a DE whose role / domain / length / label lines up. Run `SearchObject` against the project Z-prefix as well (e.g., `ZFIE*`).
   - Hit → priority 2. Stop here.
   - Miss → fall through.
3. **New CBO DE decision** — ask whether the field earns a DE of its own and answer with the priority-3 gate (reuse ≥ 2 OR domain-specific label). Yes → priority 3: emit a `CreateDataElement` (S/4) or an ECC DTEL helper program (ECC, per `ecc-ddic-fallback.md`), then point the field's `rollname` at it.
4. **Primitive only once every step above has failed** — priority 4, with the reason written inline in the plan / spec (`"Field X: primitive CHAR 20 — internal scratch buffer, no business meaning"`).

## Common Standard DE Reference (quick lookup — expand as needed)

Business partners / org:
- Vendor: `LIFNR` · Customer: `KUNNR` · Plant: `WERKS_D` · Storage location: `LGORT_D` · Company code: `BUKRS` · Purchasing org: `EKORG` · Sales org: `VKORG` · Cost center: `KOSTL` · Profit center: `PRCTR` · WBS: `PS_POSID` · Internal order: `AUFNR`

Material / quantity:
- Material: `MATNR` · Batch: `CHARG_D` · Quantity: `MENGE_D` · UoM: `MEINS` · Base UoM: `LAGME` · Gross weight: `BRGEW` · Net weight: `NTGEW`

Document / item:
- FI doc: `BELNR_D` · MM doc: `MBLNR` · SD doc: `VBELN` · PO: `EBELN` · PO item: `EBELP` · Line item: `POSNR` · Fiscal year: `GJAHR` · Period: `MONAT`

Money / currency:
- Amount (local crcy): `DMBTR` · Amount (doc crcy): `WRBTR` · Currency: `WAERS` · Exchange rate: `UKURS`

Date / time / user:
- Posting date: `BUDAT` · Document date: `BLDAT` · Entry date: `CPUDT` · Entry time: `CPUTM` · Changed on: `AEDAT` · User: `USNAM` · Changed by: `AENAM`

Technical / system:
- Client: `MANDT` · Language: `SPRAS` · Country: `LAND1` · Unit: `UNIT`

For a field this list does not cover, the agent MUST run `SearchObject` against `DTEL` with 2–3 synonym queries (e.g., `vendor`, `supplier`, `creditor`) before it may conclude "no standard DE exists." Write the empty searches into the plan, so the next run can verify them.

## Anti-Patterns (STOP — these must never pass review)

- `LIFNR CHAR 10` ← use data element `LIFNR`
- `MATNR CHAR 40` ← use data element `MATNR`
- `WERKS CHAR 4` ← use data element `WERKS_D`
- `BUKRS CHAR 4` ← use data element `BUKRS`
- `BELNR CHAR 10` ← use data element `BELNR_D` (or `VBELN` / `MBLNR` / `EBELN`, according to the document type)
- `BUDAT DATS 8` ← use data element `BUDAT`
- `MENGE QUAN 13 3` with no UoM companion ← use `MENGE_D` plus a sibling `MEINS` field
- `WAERS CHAR 5` ← use data element `WAERS`
- `USNAM CHAR 12` ← use data element `USNAM`
- `MANDT CLNT 3` ← use data element `MANDT` (and the client field itself: name `MANDT`, DE `MANDT`, at position 1 of every client-dependent transparent table)

## Anti-Pattern — Field Name / Domain ≠ Meaning

A field's business meaning cannot be read off its name or its domain name alone — SAP reuses both, and either one will steer you into the wrong join or the wrong data model.

- `T001B-BUKRS` carries domain `OPVAR`: despite the `BUKRS` field name it is the **posting period variant**, NOT the company code.
- `SKA1-VBUND` runs the other way — its domain is `RCOMP`, yet the field **IS** the trading partner, not a generic company-code field.

Establish meaning from the data element's own semantics instead (`GetDataElement` → label + documentation); never from the field name or the domain name. Where the question is shared versus org-specific data modelling (one shared table against an org-partitioned one), the key structure is not what decides it — **measure the actual data**: values that cross org units → the entity is SHARED; values dedicated to a single org unit → PARTITIONED.

## DDIC Activation Constraint — No NOT NULL on Fields Longer Than 255 Bytes

A `RAWSTRING`, a `STRING`, or any field exceeding 255 bytes must never carry the NOT NULL / initial-values flag — DDIC declines activation and reports `'not null' flag ... too long (>255)`, and SAP standard holds zero exceptions (a full `DD03L` sweep of active `RSTR` fields found all 25 with the flag blank). The trap is the habit of flagging every field NOT NULL; leave the LOB-class fields unflagged. (Field-verified in real project work, 2026-07.)

## Integration Points

- `skills/create-object/workflow-steps.md` → Step 5 (standard flow) and Step 4-ECC (helper-program generation) both send their field-type decisions through this rule.
- `skills/create-program/phase4-parallel.md` → Wave 1 sub-step 3 (parallel `CreateTable` / `CreateStructure`) applies the rule to each field before emitting `rollname`.
- `skills/create-program/phase6-review.md` → the reviewer fails the plan when a field drops to priority 4 without an inline justification, and equally when a priority-1 miss is visible — a standard DE existed and the plan reached for a primitive anyway.
- `skills/analyze-cbo-obj/` → the CBO inventory `inventory.json` is the source priority 2 (existing CBO DE) draws on. Keep it fresh; a stale inventory forces needless priority-3 creations.

## Enforcement Checklist (per field, before `CreateTable` / `UpdateTable` / ECC helper emission)

1. `SearchObject` was run for a standard DE, OR the quick-lookup table was matched → decision recorded.
2. No standard hit → `cbo-context.md` was checked for a CBO DE → decision recorded.
3. Priority 3 (new CBO DE) → the DE name follows `ZFIE{NN}` / `ZMME{NN}` / … from `naming-conventions.md`.
4. Priority 4 (primitive) → an inline justification exists in `plan.md` / `spec.md`.
5. Client-dependent table → field 1 is `MANDT` with DE `MANDT`, key-flag `X`.
