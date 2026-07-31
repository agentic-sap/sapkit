# Document Flows — Business-Document Chains + Process Clustering
# 문서 흐름 — 업무 문서 체인과 프로세스 군집화

An SAP business process is a **chain of business documents** (`PR → PO → GR → IR`,
`SO → DN → Billing`), and each link in that chain leaves rows in a known set of
anchor tables. This file holds two things that let a procedure recover the chain
from a package of custom code:

1. the **clustering algorithm** — how to group programs into processes from their
   table usage and reference graph, and
2. the **module dictionary** — the canonical flow per module with its anchor
   tables, so a recovered cluster can be given the name a consultant recognizes.

Consumed by [package-to-process](../../../procedures/package-to-process.md)
(Steps 4–5). Object-level inventory comes from `analyze-cbo-obj`; this file is
about what those objects *do together*.

> **Scope note** — the dictionary covers the 14 modules that own business-document
> chains. **BC has no entry by design**: Basis objects (jobs, RFC, authorization,
> transports) are infrastructure, not a document chain. A BC-heavy package will
> land in the `Misc / utility` residue group, which is the correct answer.
>
> **Verification status** — the anchor tables and TCodes below are the upstream
> author's domain knowledge, carried over unverified against a live SAP system
> (D-053 유보 ⓓ). Treat a dictionary match as a **naming hint**, never as proof;
> the cluster's real evidence is its measured table set.

## Clustering algorithm

Run per package, after the entry points are confirmed.

1. **Seed** — every confirmed entry-point program is a candidate group leader.
2. **Reference graph** — for each entry point, fetch `GetWhereUsed` 1-hop callers
   and callees **inside the package**. 1-hop callers from outside the package are
   recorded as **boundary only** — they never become group members.
3. **Core-table set** — for each program/FM, extract the DB tables it actually
   touches (header + line) from the source plus `GetAbapSemanticAnalysis`. Drop
   CDS aliases that fan out into many standard tables (e.g. `I_*`) — they inflate
   every set and destroy the similarity signal.
4. **Cluster** — Jaccard similarity between entry-point neighborhoods' core-table
   sets. `≥ 0.35` joins the cluster. The threshold is deliberately low-yield:
   it biases toward **more, narrower groups**, because merging two groups in the
   user review (Step 4) is one click and splitting one is an argument.
5. **Label match** — compare the cluster's core-table set against the module
   dictionary below. `≥ 60%` overlap with a flow's anchor tables → use that
   canonical label (e.g. `PR → PO → GR → IR`). No match → descriptive auto-label
   from the dominant table (e.g. `VBAK-centric flow`).
6. **Confidence** `0.0–1.0` =
   `0.3 × jaccard_min_within_cluster + 0.4 × dictionary_overlap + 0.3 × shared_actors_ratio`
   (shared actors = TCode / user-exit reached by more than one member).
7. **Residue** — programs still unclustered after the pass go into a
   `Misc / utility programs` group with confidence `0.0`. Residue is **always**
   shown to the user for a manual call; it is never silently dropped.

## Module document-flow dictionary

Canonical end-to-end flow per module, with the anchor tables that identify it.

### MM (Materials Management — Procure-to-Pay)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| PR → PO | `EBAN`, `EBKN`, `EKKO`, `EKPO`, `EKBE` | ME51N, ME21N |
| PO → GR | `EKKO`, `EKPO`, `MSEG`, `MKPF` | ME21N, MIGO |
| GR → IR | `MSEG`, `RBKP`, `RSEG`, `BKPF`, `BSEG` | MIGO, MIRO |
| Source list / Vendor master | `EORD`, `LFA1`, `LFB1`, `LFM1` | ME01, XK01 |

### SD (Sales & Distribution — Order-to-Cash)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Inquiry → Quote → Order | `VBAK`, `VBAP`, `VBKD`, `VBPA` | VA11, VA21, VA01 |
| Order → Delivery | `VBAK`, `VBAP`, `LIKP`, `LIPS` | VL01N |
| Delivery → Billing | `LIKP`, `LIPS`, `VBRK`, `VBRP` | VF01 |
| Pricing condition | `KONV` (ECC) / `PRCD_ELEMENTS` (S/4), `A***` access tables | VK11 |

### PP (Production Planning)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| MRP → Planned Order | `MDVM`, `PLAF`, `MDKP`, `MDTB` | MD01, MD04 |
| Planned → Production Order | `PLAF`, `AFKO`, `AFPO`, `AFVC` | CO40, CO01 |
| Production Confirmation | `AFRU`, `AFVV`, `MSEG`, `MKPF` | CO11N, MIGO |
| BOM / Routing master | `MAST`, `STKO`, `STPO`, `PLKO`, `PLPO` | CS01, CA01 |

### PM (Plant Maintenance)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Notification → Work Order | `QMEL`, `QMIH`, `AUFK`, `AFKO`, `AFPO` | IW21, IW31 |
| Order Execution → Confirmation | `AFKO`, `AFRU`, `AFVV`, `MSEG` | IW41 |
| Equipment master | `EQUI`, `EQUZ`, `IFLOT` | IE01, IL01 |

### QM (Quality Management)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Inspection Lot → Result | `QALS`, `QAMR`, `QAMV`, `QAPP`, `QASE` | QA32, QE51N |
| Quality Notification | `QMEL`, `QMFE`, `QMUR`, `QMMA` | QM01 |
| Usage Decision | `QAVE`, `QAMB`, `MSEG` | QA11 |

### WM / EWM (Warehouse Management)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Inbound Delivery → Putaway | `LIKP`, `LIPS`, `LTAK`, `LTAP`, `LAGP` | VL31N, LT03 |
| Outbound Delivery → Picking | `LIKP`, `LIPS`, `LTAK`, `LTAP` | VL01N, LT03 |
| Bin / Stock | `LAGP`, `LQUA`, `LEIN` | LS24 |

### TM (Transportation Management)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Freight Order → Settlement | `/SCMTMS/D_TOR_ROOT`, `/SCMTMS/D_FREORD`, `/SCMTMS/D_FBINV` | /n/SCMTMS/TOR01 |

### FI (Financial Accounting)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Posting → Cleared | `BKPF`, `BSEG`, `BSAK`, `BSAD`, `BSAS` | FB01, FB60, F-28 |
| AR / AP master | `KNA1`, `KNB1`, `LFA1`, `LFB1` | FD01, FK01 |
| Asset accounting | `ANLA`, `ANLB`, `ANLC`, `ANEK`, `ANEP` | AS01, AB01 |

### CO (Controlling)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Cost Center → Posting | `CSKS`, `CSSL`, `COEP`, `COSP`, `COSS` | KS01, KB11N |
| Internal Order | `AUFK`, `COEP`, `COSP`, `COSS` | KO01, KO88 |
| Profitability (CO-PA) | `CE1XXXX`, `CE4XXXX` (operating concern-specific) | KE21N |

### PS (Project System)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| WBS → Network → Confirmation | `PROJ`, `PRPS`, `AUFK`, `AFKO`, `AFVC`, `AFRU` | CJ20N, CN21 |

### TR (Treasury)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Treasury deal → Posting | `VTBFHA`, `VTBFHAPO`, `BKPF`, `BSEG` | FTR_CREATE |
| Cash management | `FDSB`, `FDFI` | FF7A |

### HCM (Human Capital Management)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Personnel master | `PA0000`, `PA0001`, `PA0002`, `PA0006` | PA30, PA40 |
| Time / Payroll | `PA2001`, `PA2002`, `PCL1`, `PCL2` | PT60, PC00_M99 |

### BW (Business Warehouse)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| InfoCube / DSO | `RSDCUBE`, `RSDODSO`, `RSDIOBJ` | RSA1 |

### Ariba (Procurement Network Integration)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| cXML / CIG integration | `/ARBA/*` Z-tables, `EKKO`, `EKPO`, `BBP_*` | (web-driven) |

## Edge cases

These four are the ones that break a naive clustering pass; handle each explicitly.

- **Single-entry monolith** — one program implements the whole flow internally.
  One group, confidence `1.0`, label = canonical flow + `(monolithic)`.
- **Multi-flow program** — one program serves more than one flow (a consolidated
  MM+SD report). List it under **each** matching cluster with a `(shared)`
  annotation and raise a Cross-Module Note.
- **Cross-module cluster** — anchors span two modules' dictionaries
  (`EKKO + BKPF`). Label it as the pair (`MM→FI (P2P-to-Accounting)`) and check
  it against the [active-modules](active-modules.md) matrix.
- **No usable entry point** — no PROG carries a TCode and the inventory's
  `key_programs[]` is empty. Do not guess: stop and ask the user for a manual
  entry point.

## Related

- [active-modules](active-modules.md) — cross-module integration matrix, used to
  decide whether a Cross-Module Note is expected
- [tables](tables.md) — cross-module key tables (DD*, T000, …)
- per-module `tcodes.md` / `bapi.md` / `spro.md` under `../<MODULE>/`
