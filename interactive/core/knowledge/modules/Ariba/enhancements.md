# Ariba Module Enhancements / Ariba 모듈 개선사항

> **Note / 참고**: Ariba runs as **cloud-based SaaS**. On the cloud side, customization goes through SAP Ariba's extensibility model; the integration with the SAP backend (ECC / S/4HANA) rests on IDoc / BAPI exits and BAdIs.
> Ariba는 클라우드 기반 SaaS입니다. 커스터마이징은 클라우드 쪽에서는 Ariba 확장 모델에 맞추고, SAP 백엔드(ECC / S/4HANA) 통합에서는 IDoc / BAPI Exit과 BAdI를 씁니다.

## Overview / 개요

Ariba enhancements sit on two sides:
1. **SAP Side (ECC / S4)**: IDoc processing, BAPI exits, and BAdIs for procurement
2. **Ariba Side (Cloud)**: Data Dictionary, approval rules, cXML, CIG, and the BTP Integration Suite

| Type / 유형 | Description / 설명 |
|------|-------------|
| IDoc Customer Exits | Processing for ORDERS05, INVOIC02, and DESADV01 |
| IDoc BAdIs | Mappers, both generic and process-specific |
| Procurement BAdIs | ME_PROCESS_PO_CUST, MB_MIGO_BADI, etc. |
| Ariba Cloud Customization | Data Dictionary, approvals, reports, cXML |
| CIG | Cloud Integration Gateway |
| BTP Integration Suite | Groovy scripts, XSLT, custom adapters |

---

## SAP Side (ECC/S4) Integration Exits

### IDoc Processing Customer Exits / IDoc 처리 Customer Exit

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| EXIT_SAPLVED1_002 | ECC/S4 | Inbound ORDERS05 (process code ORDE) | Header of the inbound PO IDoc |
| EXIT_SAPLVED1_004 | ECC/S4 | Inbound ORDERS05 (process code ORDE) | Item of the inbound PO IDoc |
| EXIT_SAPLMRMH_001 | ECC/S4 | Inbound INVOIC02 — invoice verification | Processing of the invoice header |
| EXIT_SAPLMRMH_002 | ECC/S4 | Inbound INVOIC02 — invoice verification | Processing of the invoice item |
| EXIT_SAPLV55K_001 | ECC/S4 | Outbound DESADV01 — shipment cost | Delivery notification going outbound |

### IDoc BAdIs / IDoc BAdIs

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| IDOC_DATA_MAPPER | ECC/S4 | Maps IDoc data generically | Logic for generic mapping |
| INBOUND_IDOC_ORDERS | ECC/S4 | PO IDoc arriving inbound | PO IDoc that came from Ariba |
| MRM_HEADER_CHECK | ECC/S4 | Invoice receipt — aimed at the Ariba e-invoice | Validates the header |
| MRM_ITEM_CUST | ECC/S4 | Invoice item — aimed at the Ariba e-invoice | Processes the item |
| MRM_CUSTOM_FIELDS | ECC/S4 | Custom fields carried in the invoice | Maps the Ariba fields |
| CCIH_MAPPER | ECC/S4 | Maps CIG messages | Mapping between CIG and SAP |

### Procurement BAdIs (Ariba Flow) / 구매 BAdIs

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| ME_PROCESS_PO_CUST | ECC/S4 | PO created out of an Ariba requisition | Processing a PO that came from Ariba |
| ME_PROCESS_REQ_CUST | ECC/S4 | PR brought in from Ariba | Purchase requisition originating in Ariba |
| MB_MIGO_BADI | ECC/S4 | GR is posted, then transferred to Ariba | Flow from GR to Ariba |
| INVOICE_UPDATE | ECC/S4 | Invoice that comes from the Ariba e-invoice | Posting an invoice that came from Ariba |

---

## Ariba Side Customizations (Cloud)

### Ariba Customization Types / Ariba 커스터마이징 유형

| Type | System | Description | Usage |
|------|--------|-------------|-------|
| Data Dictionary Extensions | Cloud | Custom fields placed on Ariba forms | Adds fields specific to the buyer |
| Approval Rules | Cloud | Approval chains driven by conditions | Customizing the workflow |
| Custom Reports | Cloud | Customizes operational reporting | Analytics specific to the buyer |
| cXML Customization | Cloud | Extensions to cXML for transactions | Data at the transaction level |
| Guided Buying Tiles | Cloud | Custom tiles set up for procurement categories | Procurement UI that is friendly to users |
| Supplier Forms | Cloud | Questionnaires for qualification and registration | Supplier onboarding |
| Sourcing Templates | Cloud | Custom RFx templates that carry scoring | Strategic sourcing |
| CIG Integration Flows | BTP | Mappings for the SAP Cloud Integration Gateway | Integration between Ariba and SAP |
| BTP Integration Suite | BTP | Custom-built integration flows | Handles advanced integration scenarios |

---

## Module-Specific Special Enhancements / 모듈별 특수 개선

### CIG (Cloud Integration Gateway) Extensions / CIG 확장

- **Message mapping customization** applied to Ariba ↔ SAP messages
- **cXML to IDoc field mapping** (PO, Invoice, GR, ASN)
- **Pre-processing / post-processing handlers** that hold custom logic
- **Error handling customization** along with monitoring

### BTP Integration Suite / BTP 통합 스위트

- **Groovy scripts** placed in iFlows for complex transformations
- **XSLT transformations** applied to XML-based messages
- **Custom adapters** that connect to the Ariba Network
- **Event mesh** for integration patterns that run asynchronously

---

## Custom Fields / Append Structures / 커스텀 필드

| Append | System | Target Table | Purpose |
|--------|--------|--------------|---------|
| CI_EKPO | ECC/S4 | EKPO | PO item, sourced from Ariba |
| CI_EKKO | ECC/S4 | EKKO | PO header, sourced from Ariba |
| CI_RBKP | ECC/S4 | RBKP | Invoice header out of the Ariba e-invoice |
| CI_RSEG | ECC/S4 | RSEG | Invoice item out of the Ariba e-invoice |

---

## S/4HANA Extensions (CDS/RAP) / S/4HANA 확장

- **Key User Extensibility**: the Custom Fields and Logic app, for extensions at field level
- **Extend PO, Supplier, Contract** through the Fiori-based extension
- **CDS views**: `I_PurchaseOrder`, `I_SupplierInvoice` — custom apps consume these
- **Restricted CDS extensions** where the S/4HANA Cloud edition (public cloud model) applies

---

## Recommended Approach / 권장 접근법

- **Ariba-side changes / Ariba 측 변경**: Work in the **Ariba admin UI** — most configurations (Data Dictionary, approval rules, templates) need no coding.
- **SAP-side changes / SAP 측 변경**: Go through **BAdIs**, not CMOD customer exits. The `ME_PROCESS_*` and `MRM_*` BAdIs come first.
- **Integration mapping**: Put complex data transformations in **CIG message mappings**; fall back to BTP Integration Suite once a flow is non-standard.
- **S/4HANA Cloud**: **Key User Extensibility** is the only way in — classic enhancements are not available.
- **Governance**: Document every Ariba customization — custom configurations may be affected when the cloud is upgraded.
