# TR Module Enhancements / TR 모듈 개선사항

## Overview / 개요

Enhancements in Treasury and Risk Management span financial transactions, cash management, electronic bank statement processing, in-house cash, and market risk. Alongside the classic BAdIs, TR leans heavily on **BTE (Business Transaction Events)**.

| Type / 유형 | Description / 설명 |
|------|-------------|
| Customer Exits (CMOD) | Bank statement, treasury, loans, funds mgmt |
| BTE | Business Transaction Events — critical to TR and CM |
| BAdIs | Financial transactions, cash mgmt, IHC, risk |
| Enhancement Spots | Containers for FSCM enhancements |
| EBS processing | Posting rules, interpretation algorithms |
| IHC | Payment processing in In-House Cash |

---

## Classic Customer Exits (CMOD/SMOD)

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| FEBOLD0001 | ECC | Bank statement old format | Exit for the legacy bank statement format |
| FEB00001 | ECC | Electronic bank statement | Exit 1 in EBS processing |
| FEB00002 | ECC | Electronic bank statement | Exit 2 in EBS processing |
| FEB00003 | ECC | Electronic bank statement | Exit 3 in EBS processing |
| TPMW_GENERIC | ECC | Treasury generic | Generic exit on the treasury workstation |
| TPMPROD01 | ECC | Treasury production | Exit for treasury production data |
| JBDFIARL01 | ECC | Loans | Exit 1 in loans management |
| JBDFIARL02 | ECC | Loans | Exit 2 in loans management |
| FMFW00001 | ECC | Funds management | Exit for funds management |
| FARC_TRA0001 | ECC | Archiving treasury | Exit for treasury archiving |

---

## Business Transaction Events (BTE) for TR / Cash Management

| Event | System | Description | Usage |
|-------|--------|-------------|-------|
| 00001063 | ECC/S4 | Bank statement: posting rules | Posting logic written by the user on EBS |
| 00001820 | ECC/S4 | Treasury transaction posting | Customizing of treasury posting |
| 00001830 | ECC/S4 | Cash management update | Logic for the CM update |
| 00001840 | ECC/S4 | Cash position refresh | Logic for the cash position |

---

## BAdIs

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| FTR_BADI | ECC/S4 | Financial transactions | Enhancements on TR-TM transactions |
| FTR_TRANSACTION_CONTROL | ECC/S4 | Transaction control | Control the processing of transactions |
| FTR_VALUATION | ECC/S4 | Valuation logic | Valuation written by the user |
| FSCM_CMAN_MEMO | ECC/S4 | Cash management memo | Logic for the memo record |
| FDCB_SUBBST | ECC/S4 | Payment program substitution | Substitution of fields in the payment program |
| IHC_PAYMENT | ECC/S4 | In-house cash payment | Processing of IHC payments |
| IHC_PAYMENT_FORM | ECC/S4 | IHC payment format | Customizing of the IHC payment form |
| JBRX_ADDON | ECC/S4 | Market risk analyzer | Add-ons on the risk analyzer |
| JBR_BADI_PRODUCT_ENH | ECC/S4 | Product enhancement | Enhancement of the product definition |
| CNV_MDT_NUM_CHANGES | ECC/S4 | Number changes | Changes to the number range |
| BADI_FITR_RATE | ECC/S4 | Exchange rate | FX rate logic written by the user |
| BAI2_BADI_LOCK | ECC/S4 | Bank statement lock | Logic that locks BAI2 statements |
| CNTR_CTPTY_LIMIT_CHECK | ECC/S4 | Counterparty limit | Check on the counterparty limit |

---

## Enhancement Spots / 향상 스팟

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| ES_FSCM_CMAN | ECC/S4 | The enhancement spot for FSCM Cash Management | Holds the CM BAdIs |

---

## Module-Specific Special Enhancements / 모듈별 특수 개선

### Electronic Bank Statement (EBS) Processing / 전자 은행 명세서 처리

- **Posting rules (OT83)**: Can be extended through BTE `00001063`
- **External transaction types (OT51)**: Maps external codes onto posting rules
- **Interpretation algorithm (OT55)**: Governs the way statement lines are interpreted
- **Search string configuration**: Matches intelligently against open items
- **Custom posting logic**: Implement it through BTE `00001063`

### Cash Flow Forecast / 현금 흐름 예측

- **Planning levels / groups (OT55)**: Determine how cash flow is aggregated
- **BAdI `FSCM_CMAN_MEMO`**: Logic for the memo record on planned flows
- **User exits**: For cash flow sources defined by the user

### In-House Cash (IHC) / 사내 은행

- **BAdI `IHC_PAYMENT`**: Processing of payments inside IHC
- **IHC accounts customization**: Transaction `FBICA1`
- **Payment formats**: `IHC_PAYMENT_FORM`

### Market Risk Analyzer / 시장 위험 분석기

- **BAdI `JBRX_ADDON`**: Risk calculations written by the user
- **Customer-specific risk metrics**: VaR, sensitivity, scenario analysis

---

## Custom Fields / Append Structures / 커스텀 필드

| Append | System | Target Table | Purpose |
|--------|--------|--------------|---------|
| CI_VTBFHA | ECC/S4 | VTBFHA | Financial transaction |
| CI_FDSR | ECC/S4 | FDSR | Cash management |
| CI_FPOS | ECC/S4 | FPOS | Planning items |
| CI_T012K | ECC/S4 | T012K | Bank accounts |

---

## S/4HANA Extensions (CDS/RAP) / S/4HANA 확장

- **SAP Cash Management (on S/4HANA)** takes the place of classic CM.
- **New tables**: `FCLM_BAM_AMD` (Bank Account Master), `FQM_FLOW` (Cash flow one-exposure model).
- **Bank Account Management (BAM)**: Built on Fiori, and extensible through Key User Extensibility.
- **CDS views**: `I_BankAccount`, `I_CashFlow`, etc.
- **Advanced Credit Management (FSCM-CR)**: Carries its own BAdIs under the prefix `BADI_FSCM_CR_*`.
- **BAdIs**: `FCLM_BAM_AMD_BADI` (Bank Account Master Data), `FCLM_BAM_SIG_PROC` (Signature process).

---

## Recommended Approach / 권장 접근법

- **S/4HANA / S/4HANA**: For field-level extensions, use the new **Cash Management (BAM)** and **Fiori Key User Extensibility**.
- **Legacy ECC / 레거시 ECC**: Combine **BTE + BAdI** — BTEs carry the event-driven logic, BAdIs the object-level extensions.
- **EBS**: Always prefer BTE `00001063` to CMOD `FEB00001-00003`.
- **Avoid modifications**: Use only the documented enhancement points — in TR, modifications are risky because of their compliance and audit implications.
