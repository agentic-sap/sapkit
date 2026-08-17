# QM Module Enhancements / QM 모듈 확장

The enhancement catalog for Quality Management (QM) — it brings together classic customer exits, BAdIs, enhancement spots, custom fields, and S/4HANA extensibility.

사용자 출구와 BAdI, 확장 스폿, 사용자 정의 필드, S/4HANA 확장성을 모은 품질 관리(QM) 모듈 카탈로그.

---

## 1. Overview / 개요

The areas the QM enhancements cover are inspection lots, results recording, usage decisions, quality notifications, certificates, sampling procedures, and master data.

QM 확장이 다루는 영역은 검사 로트와 결과 기록, 사용 결정, 품질 통지, 인증서, 샘플링 절차, 마스터 데이터입니다.

- Classic Customer Exits (CMOD/SMOD)
- BAdIs (Business Add-Ins)
- Enhancement Spots
- Custom Fields / Append Structures
- S/4HANA CDS + Key User Extensibility

---

## 2. Classic Customer Exits (CMOD/SMOD) / 클래식 사용자 출구

| Name | System | Description | Usage |
|---|---|---|---|
| QAAT0001 | ECC/S4 | Inspection characteristic / 검사 특성 | Characteristic processing |
| QAPP0001 | ECC/S4 | Sample-drawing / 표본 추출 | Sample drawing logic |
| QBCK0001 | ECC/S4 | Control chart / 관리도 | Control chart enhancements |
| QC010001 | ECC/S4 | Quality certificate / 품질 인증서 | Certificate output |
| QEEM0001 | ECC/S4 | Inspection results / 검사 결과 | Results recording logic |
| QISR0001 – QISR0007 | ECC/S4 | Internet service request / 인터넷 서비스 요청 | ISR customization |
| QLCO0001 | ECC/S4 | Inspection lot completion / 검사 로트 완료 | Completion checks |
| QPAP0001 | ECC/S4 | Inspection plan / 검사 계획 | Inspection plan processing |
| QPL10001 | ECC/S4 | Inspection lot creation / 검사 로트 생성 | Lot creation hook |
| QPL20001 | ECC/S4 | Source inspection / 출처 검사 | Source inspection logic |
| QQMA0001 – QQMA0030 | ECC/S4 | Quality notification / 품질 통지 | Notification enhancements |
| QSS10001 | ECC/S4 | Status / 상태 | Status management |
| QBAT0001 | ECC/S4 | Batch / 배치 | Batch-related checks |
| QEVA0003 | ECC/S4 | Usage decision / 사용 결정 | UD processing |

---

## 3. BAdIs / BAdI

| Name | System | Description | Usage |
|---|---|---|---|
| INSPECTIONLOT_UPDATE | ECC/S4 | Inspection lot / 검사 로트 | Lot create/change |
| INSPECTIONLOT_STATUS | ECC/S4 | Status / 상태 | Status changes |
| INSPECTIONLOT_STOCKPOSTING | ECC/S4 | Stock posting after UD / UD 후 재고 전기 | Custom stock posting |
| INSPRES_RECORD | ECC/S4 | Results recording / 결과 기록 | Results processing |
| INSPUSAGEDEC_UPDATE | ECC/S4 | Usage decision / 사용 결정 | UD update logic |
| NOTIF_EVENT_HANDLER | ECC/S4 | Notification (shared with PM) / 통지 (PM 공유) | Notification events |
| QCM_CERTIFICATE | ECC/S4 | Quality certificate / 품질 인증서 | Certificate logic |
| QPM_GET_CONFIG_MD | ECC/S4 | Master data / 마스터 데이터 | Config master data |
| QBM_MATERIAL_PHYSSAMPLE | ECC/S4 | Physical sample / 물리적 샘플 | Physical sample logic |
| QAP_INSPECTION_PLAN | ECC/S4 | Inspection plan / 검사 계획 | Plan customization |
| QEVA_PRINT_USAGE | ECC/S4 | Usage decision print / UD 인쇄 | UD printout |

---

## 4. Enhancement Spots (Modern) / 확장 스폿

| Name | System | Description | Usage |
|---|---|---|---|
| ES_QAUR | ECC/S4 | Usage decision framework / 사용 결정 프레임워크 | UD enhancements |
| ES_QPAP | ECC/S4 | Inspection plan framework / 검사 계획 프레임워크 | Plan enhancements |

---

## 5. Module-Specific Special Enhancements / 모듈 특수 확장

- **Defects recording**: BAdI `INSPECTIONRESULT_SAVE` — 결함 기록 저장
- **Sampling**: `EXIT_SAPLQPLP_001` — Sampling procedure / 샘플링 절차
- **Calibration**: BAdI `CALIBRATION_BADI` — 교정 관리
- **Stability study**: Enhancements tied to the quality certificate / 안정성 연구
- **Test equipment management**: IA11 / IA12 exits — 시험 장비 관리

---

## 6. Custom Fields / Append Structures / 사용자 정의 필드

| Include | Table | Description |
|---|---|---|
| CI_QALS | QALS | Inspection lot / 검사 로트 |
| CI_QAMV | QAMV | Inspection characteristic / 검사 특성 |
| CI_QAMR | QAMR | Inspection results / 검사 결과 |
| CI_QMEL | QMEL | Quality notification header / 품질 통지 헤더 |
| CI_QMFE | QMFE | Notification defect item / 통지 결함 품목 |
| CI_QINF | QINF | Inspection setup / 검사 설정 |

---

## 7. S/4HANA Extensions (CDS / RAP) / S/4HANA 확장

- **CDS Views**:
  - `I_InspectionLot` — Inspection lot interface view
  - `I_QualityNotification` — Quality notification interface view
- **Key User Extensibility** — Open to the QM notifications (Fiori apps)
- **RAP** — Build quality apps of your own over CDS + behavior definitions

---

## 8. Recommended Approach / 권장 접근 방식

1. **BAdIs for processing logic** — prefer `INSPECTIONLOT_UPDATE`, `INSPRES_RECORD`, and `INSPUSAGEDEC_UPDATE`.
2. **Customer exits for simple field additions** — use CMOD for the cases where no BAdI is available.
3. **Shared notification logic** — reuse the existing `NOTIF_EVENT_HANDLER` (PM & QM).
4. **S/4HANA** — notification extensions through Key User Extensibility; reporting through CDS views.

처리 로직에는 BAdI를 먼저 쓰고, 단순한 필드 추가에는 사용자 출구를 활용하세요.
