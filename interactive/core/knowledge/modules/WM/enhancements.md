# WM Module Enhancements / WM 모듈 개선사항

> **Deprecation Note / 사용 중단 안내**: LE-WM (Warehouse Management) is **deprecated in S/4HANA**. The strategic solution that takes its place is EWM (Extended Warehouse Management) — embedded or decentralized.
> LE-WM은 S/4HANA에서 사용이 중단되었고, 그 자리를 EWM(내장형 또는 분산형)이 대신합니다.

## Overview / 개요

Enhancements in Warehouse Management sit across two architectures — **LE-WM** (classic, ECC) and **EWM** (modern, S/4HANA). The techniques they draw on include:

| Type / 유형 | Description / 설명 |
|------|-------------|
| Customer Exits (CMOD/SMOD) | The classic exits SAP delivers for LE-WM |
| BAdIs | Business Add-Ins, available in LE-WM and EWM alike |
| Enhancement Spots | The modern enhancement points, implicit and explicit |
| PPF | Post Processing Framework — output and printing in EWM |
| Condition Technique | Used for determinations inside EWM |
| MFS | Material Flow System, used for automation |
| RF Framework | Customizing of the Radio Frequency UI |
| Custom Fields | Append structures (CI_*, /SCWM/INCL_EEW_*) |

---

## Classic Customer Exits (CMOD/SMOD) — LE-WM

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| MWMIDO06 | ECC | Transfer Order (TO) creation | Logic written by the user at the moment a TO is created |
| MWM2S001 | ECC | Warehouse monitor | Enhance the displays used for warehouse monitoring |
| MWMTO001 | ECC | TO processing | Modify a TO while it is being processed |
| MWMRF001-999 | ECC | RF framework | Exits on Radio Frequency screens and flows |
| LMIW0001 | ECC | Inventory | Enhancements to physical inventory |
| LEMEC001 | ECC | Movement type | Determination of the movement type |
| LELC0001 | ECC | Lean WM | Exits for lean warehouse management |
| LVS10001 | ECC | Storage unit | Logic for managing storage units |
| MWMBI001 | ECC | Batch input for TO | Processing of batch input on transfer orders |
| MWMD0001 | ECC | Warehouse doors | Logic for doors and staging areas |

---

## BAdIs

### LE-WM BAdIs (Classic) / LE-WM BAdIs (클래식)

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| LE_WM_TO_CONFIRMATION | ECC | TO confirmation | Logic written by the user when a transfer order is confirmed |
| WM_PUTAWAY_STRATEGY | ECC | Putaway | Putaway strategy logic defined by the user |
| WM_PICKING_STRATEGY | ECC | Picking | Picking strategy logic defined by the user |
| MB_MIGO_BADI | ECC | Goods movement WM integration | Integration between MIGO and WM |
| LE_WM_TR_CREATE | ECC | TR creation | Logic that creates the Transfer Requirement |
| LE_SHP_DELIVERY_PROC | ECC | Delivery-WM integration | Processing of deliveries inside WM |
| BADI_WM_STOCK_TRANSFER | ECC | Stock transfer | Logic for the stock transfer |

### EWM BAdIs (S/4HANA) / EWM BAdIs (S/4HANA)

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| /SCWM/EX_CORE_CO | S4 | Core | Enhancements on the core EWM processes |
| /SCWM/EX_CORE_CO_PRE_UP | S4 | Pre-update | Ahead of the database update |
| /SCWM/EX_CORE_CO_POST_UP | S4 | Post-update | Once the database update is done |
| /SCWM/EX_RF_BL_CUST | S4 | RF UI customization | Customize the business logic behind RF |
| /SCWM/EX_RF_FLOW_CUSTOMIZE | S4 | RF flow | Customize the flow of RF screens |
| /SCWM/EX_DLV_DET_AUTO | S4 | Determination | Delivery determinations made automatically |
| /SCWM/EX_WAVE | S4 | Wave management | Logic for wave processing |
| /SCWM/EX_WAVE_CREATE_AUTO | S4 | Auto wave creation | Rules for creating waves automatically |
| /SCWM/EX_MFS_MP_PICK_STRAT | S4 | MFS picking | Picking strategy in the Material Flow System |
| /SCWM/EX_SLOT_OPT | S4 | Slotting | Optimization of slotting |
| /SCWM/EX_BATCH_DET | S4 | Batch determination | Determination of batches inside EWM |
| /SCWM/EX_PUT_ALT | S4 | Putaway alternative | Putaway logic taken as an alternative |
| /SCWM/EX_PICK_ALT | S4 | Picking alternative | Picking logic taken as an alternative |
| /SCWM/EX_COUNT_RECOUNT | S4 | Recount physical inventory | Logic for recounting physical inventory |

---

## Enhancement Spots (Modern) / 향상 스팟 (최신)

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| /SCWM/ES_CORE | S4 | The enhancement spot for the EWM core | Holds the core EWM BAdIs |
| /SCWM/ES_RF | S4 | The enhancement spot for EWM RF | Holds the BAdIs of the RF framework |

---

## Module-Specific Special Enhancements / 모듈별 특수 개선

### LE-WM Specific
- **Storage unit management**: User exit `MWMRCU01`, which carries the SU logic
- **RF (Radio Frequency)**: RF transactions defined by the user through `/SPE/FRAMEWORK`
- **Batch management in WM**: Include `MCB1`, which holds the logic specific to batches
- **Hazardous goods**: BAdI `LE_WM_HAZMAT`, which handles dangerous goods

### EWM Specific
- **PPF (Post Processing Framework)**: Output management, printing, label printing
- **Condition Technique**: Serves the determinations (warehouse process type, packaging, etc.)
- **MFS (Material Flow System)**: Integration with conveyor / AS-RS / crane automation
- **RF framework**: RF screens defined by the user through `/SCWM/RFUI` or ITS mobile

---

## Custom Fields / Append Structures / 커스텀 필드

| Append / Include | System | Target Table |
|------------------|--------|--------------|
| CI_LTAK | ECC | Transfer Order header (LTAK) |
| CI_LTAP | ECC | Transfer Order item (LTAP) |
| CI_LQUA | ECC | Quant (LQUA) |
| /SCWM/INCL_EEW_* | S4 | The includes for EWM extensibility |

---

## S/4HANA Extensions (CDS/RAP) / S/4HANA 확장

- In S/4HANA, use **EWM** rather than LE-WM (embedded or decentralized).
- **CDS views**: `/SCWM/I_*`, for analytical and transactional consumption of EWM.
- **RAP (Restful ABAP Programming)**: Serves the modern Fiori apps built on EWM data.
- **Key User Extensibility**: Fields added through the Fiori "Custom Fields and Logic" app.

---

## Recommended Approach / 권장 접근법

- **New S/4HANA projects / 신규 S/4HANA 프로젝트**: Implement **EWM**, embedded or decentralized. LE-WM is reserved for legacy migration scenarios.
- **EWM enhancements**: Prefer the `/SCWM/EX_*` BAdIs that sit under the `/SCWM/ES_CORE` / `/SCWM/ES_RF` enhancement spots. Take PPF for output and the condition technique for determinations.
- **Legacy LE-WM**: Reach for the classic BAdIs (`LE_WM_*`, `WM_*`) before you fall back on CMOD customer exits.
- **Avoid modifications**: Never modify standard SAP code; go through the documented enhancement points at all times.
