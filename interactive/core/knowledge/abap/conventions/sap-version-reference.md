# SAP Version Reference (ECC vs S/4HANA)

Between ECC 6.0 and S/4HANA the same recommendation can be right on one platform
and wrong on the other — a different table holds the data, a different API writes
it, a different programming model is expected. The dangerous cases are the ones
that still compile and still return rows. This document is the lookup that keeps
an agent from making them: which **tables**, **TCodes**, **BAPIs**, **Fiori
apps**, and **development patterns** apply to the system that is actually
configured.

Read it in four moves: settle which version you are on (§1), obey what that
version forbids (§2), look up the concrete object names for the area you are
working in (§3–§9), and escalate when the answer is not certain (§10).

---

## 1. Entry gate — settle the version before you speak

- Resolve `SAP_VERSION` from `.sapkit/config.json` (or `sap.env`) **before**
  naming a single TCode, table, BAPI, or pattern. This is a precondition of the
  recommendation, not a review step afterwards.
- Resolve `ABAP_RELEASE` **before** generating ABAP source. Which syntax each
  release supports is a separate axis, documented in
  [`abap-release-reference.md`](abap-release-reference.md); emitting syntax the
  configured release does not have fails at activation.
- **Unset is not a default.** If `SAP_VERSION` is missing, stop. Ask the user to
  run the profile setup
  ([`troubleshooting.md`](../../../procedures/troubleshooting.md)) and proceed
  only once it is established. Never fall back to a guess.

---

## 2. What the configured version forbids — and what to use instead

Everything in this section is a directive. §3–§9 are the evidence behind it.

### 2.1 Reading data

**On S/4HANA:**

- **Do not `SELECT` directly from `BSEG`.** It survived the move from cluster
  storage to transparent, but it is retained for legacy compatibility only —
  `ACDOCA` is the actual source of truth. Report from `ACDOCA`, or from the
  released CDS view `I_JournalEntryItem`.
- **Do not `SELECT` directly from `MKPF` / `MSEG`.** Performance suffers and the
  result can be inaccurate. Read `MATDOC`, or a released CDS view such as
  `I_MaterialDocumentItem`.
- `KNA1` / `LFA1` are still kept in sync and may be **read**, but treat them as
  strictly read-only (see §2.2 for the write path).
- Account-based CO-PA carried in `ACDOCA` is the standard. Name the
  costing-based `CE1xxxx` / `CE4xxxx` tables only after confirming that
  costing-based CO-PA is actually in use on that system.

**On ECC 6.0:**

- The `MKPF` ∪ `MSEG` JOIN is the correct construction for material documents,
  and `BSEG` ∪ `BKPF` for finance reporting — on this platform that is the
  design, not a workaround.
- Establish whether new G/L is active before settling on a finance data source:
  check `T881` / `T882G` first.

### 2.2 Creating and changing master data

- **On S/4HANA, never recommend `BAPI_CUSTOMER_CREATEFROMDATA1` for new work.**
  SAP has explicitly flagged it for removal (deprecated). Use the CVI/BUPA family
  (`BUPA_CREATE_FROM_DATA`, `CVI_EI_INBOUND_MAIN`) or the OData service
  `API_BUSINESS_PARTNER` instead.
- On S/4HANA, perform business-partner create and change **exclusively** through
  the `BP` transaction or the CVI APIs. The compatibility tables `KNA1` / `LFA1`
  are never a write target, even though they still exist.

### 2.3 Field typing

- **On ECC, force `CHAR18` on `MATNR` declarations.** Declaring `CHAR40` risks
  truncation on the ECC 7.x runtime.
- **On S/4HANA, type against the `MATNR` domain** rather than hardcoding any
  length.

### 2.4 Forms and output

- **Do not author SAPscript for new S/4HANA projects.** SmartForms is
  acceptable; Adobe Forms is preferred.

---

## 3. Master data — Business Partner

The single most frequently misunderstood area. ECC keeps customer and vendor as
two separate masters; S/4HANA unifies them behind one Business Partner object
with roles.

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Model | Separate Customer (KNA1) + Vendor (LFA1) | Unified BP (BUT000 + roles) |
| Create TCode | XD01 (Customer) / XK01 (Vendor) / MK01 | BP (unified) |
| Change TCode | XD02 / XK02 / VD02 / MK02 | BP |
| Display TCode | XD03 / XK03 | BP |
| Core tables | KNA1, KNB1 (company code), KNVV (sales area) / LFA1, LFB1, LFM1 | BUT000, BUT020 (address), BUT100 (role), BUT0BK (bank); KNA1/LFA1 still kept in sync |
| Address | ADRC (via ADRNR) | ADRC (BUT020 via PARTNER_GUID) |
| BAPI | BAPI_CUSTOMER_CREATEFROMDATA1 / BAPI_VENDOR_CREATE | BUPA_CREATE_FROM_DATA, CVI_EI_INBOUND_MAIN |

Directives for this area: §2.1 (read-only compatibility tables) and §2.2
(deprecated BAPI, BP/CVI write path).

---

## 4. Master data — Material

Structurally the most stable area: the transactions and the table set carry over
unchanged. The one thing that moves is the field length.

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Length limit | MATNR 18 characters | MATNR 40 characters (1909+) |
| TCode | MM01 / MM02 / MM03 | MM01 / MM02 / MM03 (unchanged) |
| Tables | MARA, MARC (plant), MARD (storage), MVKE (sales), MBEW (valuation) | Same — MARA retained, only the MATNR field length is extended |
| Images/documents | DMS | DMS + Fiori "Manage Product Master Data" |

Directive for this area: §2.3 (how to type `MATNR` on each platform).

---

## 5. Logistics — material movement documents

The header/item pair collapses into one table. This is the change most likely to
produce a silently wrong query, because the old tables are still there.

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Table structure | MKPF (header) + MSEG (item) | MATDOC (single unified table) |
| Backward compatibility | — | MKPF/MSEG are **reproduced via CDS views** (compatibility views) |
| TCode | MB01/MB1A/MB1B/MB1C, MIGO | MIGO only — many MB* transactions are obsolete |
| BAPI | BAPI_GOODS_CREATE_FROM_DATA, BAPI_GOODS_MVT_CREATE | Same BAPIs retained; internal logic routed through MATDOC |

Directive for this area: §2.1 (MATDOC / `I_MaterialDocumentItem` on S/4, the
MKPF ∪ MSEG JOIN on ECC).

---

## 6. Logistics — sales and purchasing documents

Document tables largely survive intact here; what changes is the UI layer and,
for sales, the output determination technology.

### 6.1 Sales documents

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Create TCode | VA01 (Order) / VA21 (Quote) / VA11 (Inquiry) | VA01 + Fiori "Manage Sales Orders" (F1873) |
| Tables | VBAK (header), VBAP (item), VBEP (schedule), VBKD (business data) | Same — VBAK/VBAP structure retained |
| BAPI | BAPI_SALESORDER_CREATEFROMDAT2 | Same (+ API_SALES_ORDER_SRV OData) |
| Output | NACE (condition-based) | BRF+ Output Management (SAP S4 1809+) |

### 6.2 Purchasing

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Create PO | ME21N / ME21 | ME21N + Fiori "Manage Purchase Orders" (F0842A) |
| Create PR | ME51N | ME51N + Fiori "Manage Purchase Requisitions" |
| Tables | EKKO (header), EKPO (item), EKET (schedule), EKKN (acct assignment) | Same |
| Approval | Release Strategy (ME28/ME29N) | Flexible Workflow + legacy Release Strategy coexisting |

---

## 7. Financials

### 7.1 Accounting document (Universal Journal)

The deepest structural change in the whole comparison: header, item, totals, and
sub-ledger indexes converge on one transparent table.

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Document storage | BKPF (header) + BSEG (item, CLUSTER TABLE) | **ACDOCA** (Universal Journal — transparent, single table) |
| Totals | GLT0 / FAGLFLEXT (new GL) | ACDOCA unified — no separate totals table required |
| Sub-ledger | BSID/BSIK/BSAD/BSAK (index tables) | Delivered as ACDOCA-based CDS views |
| TCode | FB01, FB50, FBL3N, FBL5N | FB01/FB50 retained; new Fiori "Post General Journal Entries" (F0718) |
| Asset accounting | ANLA + ANLP (classic) | ACDOCA-integrated (new asset accounting, mandatory) |
| New G/L | FAGLFLEXA (optional) | None — ACDOCA replaces it |

Directives for this area: §2.1 (no direct `BSEG` SELECT on S/4;
`I_JournalEntryItem` for reporting; `T881` / `T882G` new-G/L check on ECC).

### 7.2 G/L master

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Chart of accounts | SKA1 (chart level) + SKB1 (company code) | Same + **FINS_FIN_GLA** (extensions) |
| TCode | FS00 | FS00 + Fiori "Manage G/L Account Master Data" |

### 7.3 Credit management

Classic FI-AR credit management is not merely deprecated on S/4HANA — the FSCM
implementation is mandatory, and the data moves to BP-based tables.

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Implementation | FI-AR-CR (classic) | SAP Credit Management (FSCM, UKM*) — mandatory |
| Tables | KNKK, KNKA | UKMBP_CMS_SGM, UKMBP_CMS (BP-based) |
| TCode | FD32, F.28 (rebuild) | UKM_BP, UKM_COMMITMENTS |

---

## 8. Costing and controlling

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Key tables | COEP (line items), COSP/COSS (totals) | ACDOCA (CO documents unified) + COEP (retained) |
| Internal Order | KO01/KO02/KO03 | Same |
| Cost Center Master | KS01 | KS01 + Fiori "Manage Cost Centers" |
| Profitability Analysis | CE1xxxx/CE4xxxx (costing-based) | ACDOCA (account-based CO-PA, default) |

Directive for this area: §2.1 (confirm costing-based CO-PA before naming
CE1/CE4).

---

## 9. Planning, execution, output, and the development model

### 9.1 MRP

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Classic MRP | MD01 / MD02 / MD03 | Retained (compatibility) |
| MRP Live | None | **MD01N** (HANA-based, in-memory, 10x+ faster) — recommended default |
| Tables | MDKP, MDTB (obsolete in S4) | PPH_DBVM (HANA-optimized) |

### 9.2 Production orders

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| TCode | CO01/CO02/CO03 | Same + Fiori "Manage Production Orders" |
| Tables | AUFK (header), AFKO (order), AFPO (item) | Same |

### 9.3 Output management

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Approach | NACE (condition-based), SmartForms / SAPscript | **BRF+** Output Management (S4 1809+) + Adobe Forms recommended; NACE compatibility retained |
| New development | NACE-based condition records | BRF+ conditions + determination |

Directive for this area: §2.4 (no new SAPscript on S/4; Adobe Forms preferred).

### 9.4 Development model

This row set decides how new code is shaped, not merely which object it reads.

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Recommended model | Classic Dynpro + Module Pool + BAPI | **RAP** (ABAP RESTful Application Programming, 754+) |
| Client | SAPGUI + WebDynpro | SAPGUI (legacy) + **Fiori** (standard) |
| DB access | Open SQL + SELECT on tables | **CDS views + Released APIs** (clean core) |
| Extensibility | User-exits, BAdI, customer includes | **Key User Extensibility** (in-app) + BAdI + CDS extensions |
| Cloud readiness | N/A | ABAP Cloud Development Model (released APIs only) — 756+ |

---

## 10. Escalation and fallback

- **A compatibility view is not a guarantee.** When migrating an ECC→S/4HANA
  script, never assume the compatibility views alone are enough — verify with
  `GetView` before you SELECT.
- **ABAP Cloud tier narrows the surface further.** On an S/4HANA system running
  the ABAP Cloud tier (`SAP_SYSTEM_TYPE=cloud`), only released APIs (C1 tier)
  are callable. Consult
  [`spro-lookup.md`](../../../procedures/spro-lookup.md) and SAP Note guidance
  before recommending any classic FM or BAPI.
- **Version unknown means stop, not improvise.** An unset `SAP_VERSION` routes
  back to §1: ask the user to run the profile setup before proceeding.
- **Release is checked separately from version.** Even on the correct platform,
  syntax newer than the configured `ABAP_RELEASE` causes activation errors —
  see [`abap-release-reference.md`](abap-release-reference.md).
