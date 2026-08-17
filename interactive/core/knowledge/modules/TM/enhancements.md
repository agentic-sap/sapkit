# TM Module Enhancements / TM 모듈 개선사항

## Overview / 개요

Enhancements in Transportation Management reach across **LE-TRA** (classic shipment, ECC) and **SAP TM** (embedded or standalone, S/4HANA). TM rests on BOPF, and it makes heavy use of BRF+ and PPF.

| Type / 유형 | Description / 설명 |
|------|-------------|
| Customer Exits (CMOD) | LE-TRA's classic exits (V55*/V54*) |
| BAdIs | BAdIs found in LE-TRA and in SAP TM |
| Enhancement Spots | `/SCMTMS/ES_*` on the TM side |
| BRF+ | Business Rule Framework — TM relies on it heavily |
| Condition Technique | Charge determination |
| PPF | Post Processing Framework (output) |
| VSR | Planning strategies that carry custom algorithms |
| BOPF | Extensions on the Business Object Processing Framework |

---

## Classic Customer Exits (CMOD/SMOD)

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| V55K0001 | ECC | Shipment cost | Processing of shipment costs |
| V55K0002 | ECC | Shipment cost | Additional logic for shipment costs |
| V55K0003 | ECC | Shipment cost | Validation of shipment costs |
| V55S0001 | ECC | Shipment | Processing of shipments (VT01N) |
| V54B0001 | ECC | Shipment cost calculation | Calculation logic written by the user |
| V54U0001 | ECC | Shipment cost document | Enhancements on the document header |
| V54U0002 | ECC | Shipment cost document | Enhancements on the document item |
| V54U0003 | ECC | Shipment cost document | Enhancements to pricing |
| V54U0004 | ECC | Shipment cost document | Enhancements to settlement |
| V54U0005 | ECC | Shipment cost document | Account assignment |
| V54U0006 | ECC | Shipment cost document | Additional logic on the document |

---

## BAdIs

### LE-TRA BAdIs (Classic) / LE-TRA BAdIs (클래식)

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| LE_SHIPMENT | ECC | Processing of shipments in VT01N | Shipment logic written by the user |
| BADI_LE_SHP_01 | ECC | Shipment 1 | Additional enhancements on shipments |
| BADI_LE_SHP_CHRG_CUSTOM | ECC | Shipment charges | Calculation of charges in custom form |

### S/4HANA TM BAdIs / S/4HANA TM BAdIs

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| /SCMTMS/BADI_FO_PROCESS | S4 | Freight order | Processing of the freight order |
| /SCMTMS/BADI_FO_CHARGE | S4 | Freight order charges | Logic for charges on freight orders |
| /SCMTMS/BADI_CHRG_CALC | S4 | Charge calculation | Charge calculation written by the user |
| /SCMTMS/BADI_CARRIER_SEL | S4 | Carrier selection | Logic that selects the carrier |
| /SCMTMS/BADI_PLANNING | S4 | Planning | Extensions to the planning process |
| /SCMTMS/BADI_SETTLE | S4 | Settlement | Logic for freight settlement |
| /SCMTMS/BADI_EVENT | S4 | Event processing | Enhancements on event management |
| /SCMTMS/BADI_EWM_INT | S4 | EWM integration | Integration between TM and EWM |
| /SCMTMS/BADI_TOR_UI | S4 | Customizing the UI | Transportation order UI |
| /SCMTMS/BADI_ITIN | S4 | Itinerary | Generating the itinerary |
| /SCMTMS/BADI_ROUTING | S4 | Routing | Logic used in routing |
| /SCMTMS/BADI_SCHED | S4 | Scheduling | Logic used in scheduling |
| /SCMTMS/BADI_TENDER | S4 | Tendering | Freight tendering |
| /SCMTMS/BADI_CUST_DIST | S4 | Customer distance | Calculating the customer distance |

---

## Enhancement Spots / 향상 스팟

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| /SCMTMS/ES_COMMON | S4 | The common enhancement spot for TM | Holds the common BAdIs |
| /SCMTMS/ES_PLANNING | S4 | The enhancement spot for planning | Holds the planning BAdIs |

---

## Module-Specific Special Enhancements / 모듈별 특수 개선

- **BRF+ (Business Rule Framework plus)**: TM leans on it heavily for charge determination, carrier selection, routing, and condition rules. Business rules can change without ABAP code.
- **Condition Technique**: Serves charge determination; it works much like SD pricing.
- **PPF (Post Processing Framework)**: Manages output — labels, print forms, emails.
- **Planning strategies (VSR)**: Vehicle Scheduling and Routing — custom algorithms can plug in through BAdI `/SCMTMS/BADI_PLANNING`.
- **Costs distribution profiles**: Customize the distribution of charges to stages/items.

---

## Custom Fields / Append Structures / 커스텀 필드

The SAP TM data model is **BOPF-based** — extend it through key fields in the `/BOPF/` framework:
- Reach for **BOPF Enhancement** to add nodes/attributes onto business objects
- Extend the freight order (`/SCMTMS/TOR`), the freight agreement, and the forwarding order
- Custom fields put in through the Fiori "Custom Fields and Logic" app (S/4HANA)

---

## S/4HANA Extensions (CDS/RAP) / S/4HANA 확장

- **S/4HANA embedded TM**: the `/SCMTMS/*` BAdIs continue to apply.
- **CDS views**: `/SCMTMS/I_*` serve analytical consumption in TM.
- **Extension via BOPF**: Use BOPF enhancements when the data model changes run deep.
- **Key User Extensibility**: Custom fields and logic, delivered through Fiori.

---

## Recommended Approach / 권장 접근법

- **Prefer BAdIs** to classic customer exits. The `/SCMTMS/*` BAdIs cover nearly every scenario.
- **Use BRF+** when business rules change — no ABAP needed, and functional consultants can maintain it.
- **PPF** for every output requirement.
- **BOPF enhancement** for extending the data model.
- **Avoid modifications** to the standard TM code.
