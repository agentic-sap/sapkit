# BW Module Enhancements / BW 모듈 개선사항

## Overview / 개요

Enhancements in SAP BW / BW/4HANA reach across reporting variables, extractors, transformations, planning, and authorizations. On modern BW/4HANA, HANA-native transformations come from **AMDP**.

| Type / 유형 | Description / 설명 |
|------|-------------|
| Customer Exits (CMOD) | RSR00001 (variables), RSAP0001 (extractors) |
| BAdIs | Query, extractor, transformation, planning, authorization |
| Enhancement Spots | Modern containers that hold enhancements |
| Transformation Routines | Start/End/Expert/Field routines (ABAP/AMDP) |
| AMDP | Procedures that run natively on HANA (BW/4HANA) |
| Custom DataSources | RSO2 generic extractors, function module extractors |
| Process Chains | Custom process types |

---

## Classic Customer Exits (CMOD/SMOD)

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| RSR00001 | ECC/S4 | BW Reporting — **CRITICAL** customer exit covering query variables (include ZXRSRU01) | I_STEP=1 for default values, I_STEP=2 for derivation, I_STEP=3 for validation |
| RSAP0001 | ECC/S4 | Extractor enhancement carried through CMOD | Parent enhancement of the extractor exits |
| EXIT_SAPLRSAP_001 | ECC/S4 | Transaction data | Enhances the transaction data extractor |
| EXIT_SAPLRSAP_002 | ECC/S4 | Master data | Enhances the master data attribute extractor |
| EXIT_SAPLRSAP_003 | ECC/S4 | Texts | Enhances the text extractor |
| EXIT_SAPLRSAP_004 | ECC/S4 | Hierarchies | Enhances the hierarchy extractor |
| RSU5_SAPI_BADI | ECC/S4 | Source system extractor, as an alternative | Stands as the modern alternative to RSAP0001 |
| RSCNV_RZ10 | ECC/S4 | Transformation | Conversion routines used in transformation |
| RSPLAN_CUS | ECC/S4 | Planning | Customizing exits on the planning side |

### Variable Exit Example (ZXRSRU01) / 변수 Exit 예시

```abap
CASE I_VNAM.
  WHEN 'ZVAR_CUSTOM'.
    IF I_STEP = 1.
      " Default value logic (before popup) / 팝업 전 기본값 로직
    ELSEIF I_STEP = 2.
      " Derivation after entry / 입력 후 파생
    ELSEIF I_STEP = 3.
      " Validation / 검증
    ENDIF.
ENDCASE.
```

---

## BAdIs

| Name | System | Description | Usage |
|------|--------|-------------|-------|
| RSR_OLAP_BADI | ECC/S4 | Manipulating the query at runtime | Modifies query results at runtime |
| RSAP_BIW_APPEND | ECC/S4 | Appends fields onto a standard extractor | Extractor enhancement at field level |
| RSU5_SAPI_BADI | ECC/S4 | Source system API | Modern extractor for the source system |
| RSCNV_BADI | ECC/S4 | Transformation | Logic that sits at transformation level |
| RSROUTINE_SUPPORT | ECC/S4 | Support for transformation routines | Backs the development of routines |
| RSSB_AUTH_BIW_GENERATE | ECC/S4 | Analysis authorization | Custom generation of auth |
| RSPLS_CR_BADI | ECC/S4 | Planning characteristic relationships | Characteristic relations in custom form |
| RSPLS_DS_BADI | ECC/S4 | Planning data slice | Custom logic for a data slice |
| RSPLS_BADI_DESIGN | ECC/S4 | Planning sequence design | Customizing the planning sequence |

---

## Module-Specific Special Enhancements / 모듈별 특수 개선

### Transformation Routines (BW/4HANA & BW 7.x) / 변환 루틴

- **Start routine**: Pre-processing that happens before the transformation
- **End routine**: Post-processing that happens after the transformation
- **Expert routine**: Takes full control of the data flow
- **Field-level routines**: Transformation done field by field
- Coded either in **ABAP** (classic) or in **AMDP** (BW/4HANA, for HANA-native execution)

### AMDP (ABAP Managed Database Procedures) — `S4`

- BW/4HANA transformations may reach for **AMDP** to get HANA-native processing
- Built as a class, inheriting `IF_AMDP_MARKER_HDB`
- **HANA SQL Script** that the DB layer executes for maximum performance
- The preferred choice for large data volumes in BW/4HANA

### Custom DataSources / 커스텀 데이터소스

- **RSO2**: Generic extractor built on a table, a view, or a function module
- Template for a Function Module extractor: `ZBW_EXTRACT_*` (copy it from `RSAX_BIW_GET_DATA_SIMPLE`)
- **Delta methods**:
  - `0` — Timestamp
  - `1` — Calendar day
  - `2` — Full upload
  - `3` — Generic delta

### Process Chain Custom Process Types / 프로세스 체인 커스텀 프로세스 유형

- **RSPC / RSPC1**: Define custom process types here, together with their start / check / finish programs
- Useful when a non-standard step has to be brought in (external API, custom validations)

### Open Hub Destination (OHD) / Open Hub 대상

- **BAdI**: `RSB_API_OHD_BADI`, which handles OHD in custom form

---

## Custom Fields / Append Structures / 커스텀 필드

- **DataSource append**: Transaction `RSA6` — appends custom fields onto the extractor
- **InfoObject attribute structure**: An append that enhances the master data attributes
- **CompositeProvider**: Adds calculated fields inside BW/4HANA modeling

---

## S/4HANA Extensions (CDS/RAP) / S/4HANA 확장 (BW/4HANA)

- **AMDP transformations**: HANA-native, and the highest performing
- **SAP HANA views** and **CDS views** standing in as sources (replaces many traditional extractors)
- **CompositeProvider**: JOINs / UNIONs done in the modeling layer
- **SAP Analytics Cloud (SAC)**: Takes over from BEx for reporting extensions
- **SAP Data Warehouse Cloud (DWC) / Datasphere**: Extensions for data warehousing in the cloud

---

## Recommended Approach / 권장 접근법

- **Modern BW/4HANA / 최신 BW/4HANA**: AMDP transformations, CDS views, CompositeProvider, SAC reporting.
- **Legacy BW 7.x / 레거시 BW 7.x**: CMOD `RSR00001` for variables — the most common one — and `RSAP0001` for extractors.
- **Variables**: Always go through the `RSR00001` exit (ZXRSRU01) — that is the standard pattern.
- **Extractors**: `RSU5_SAPI_BADI` gets the preference over the classic `EXIT_SAPLRSAP_001`.
- **Performance**: Wherever it can be done, push the logic down to HANA through AMDP.
