# PM Module Enhancements / PM 모듈 확장

Enhancement catalog for Plant Maintenance (PM) / Enterprise Asset Management (EAM) — it spans classic customer exits, BAdIs, enhancement spots, custom fields, and S/4HANA extensibility.

사용자 출구, BAdI, 확장 스폿, 사용자 정의 필드, S/4HANA 확장성 — 설비 관리(PM) / 기업 자산 관리(EAM) 모듈의 카탈로그.

---

## 1. Overview / 개요

Maintenance orders, notifications, technical objects (equipment & functional location), measurement documents, maintenance plans, and confirmations — these are the areas PM/EAM enhancements cover.

보전 오더, 통지, 기술 객체(장비 및 기능 위치), 측정 문서, 보전 계획, 확인이 PM/EAM 확장의 대상입니다.

- Classic Customer Exits (CMOD/SMOD)
- BAdIs (Business Add-Ins)
- Enhancement Spots
- Custom Fields / Append Structures
- S/4HANA Asset Management extensions

---

## 2. Classic Customer Exits (CMOD/SMOD) / 클래식 사용자 출구

| Name | System | Description | Usage |
|---|---|---|---|
| IWO10001 – IWO10033 | ECC/S4 | Maintenance order / 보전 오더 | Order processing |
| IWOC0001 – IWOC0004 | ECC/S4 | Notification / 통지 | Notification processing |
| ICA10001 | ECC/S4 | Structure list / 구조 목록 | Structure list display |
| IMRC0001 – IMRC0007 | ECC/S4 | Measurement document / 측정 문서 | Measurement processing |
| ITOB0001 | ECC/S4 | Technical object / 기술 객체 | Tech object processing |
| IEQM0001 – IEQM0004 | ECC/S4 | Equipment / 장비 | Equipment master |
| IEQM_SERNO_CHECK | ECC/S4 | Serial number / 일련 번호 | Serial number checks |
| ISAX0001 – ISAX0005 | ECC/S4 | Service notification / 서비스 통지 | Service notification |
| IWP1 | ECC/S4 | Maintenance plan / 보전 계획 | Maintenance plan |
| QQMA0001 – QQMA0030 | ECC/S4 | Notification (shared with QM) / 통지 (QM 공유) | Notification enhancements |

---

## 3. BAdIs / BAdI

| Name | System | Description | Usage |
|---|---|---|---|
| WORKORDER_UPDATE | ECC/S4 | Maintenance order (shared with PP) / 보전 오더 (PP 공유) | Order create/change |
| WORKORDER_STATUS | ECC/S4 | Status changes / 상태 변경 | Status-driven logic |
| WORKORDER_GOODSMVT | ECC/S4 | Order goods movements / 오더 자재 이동 | GR/GI on orders |
| NOTIF_EVENT_HANDLER | ECC/S4 | Notification (shared with QM) / 통지 (QM 공유) | Notification events |
| NOTIF_AUTH_CHECK_BADI | ECC/S4 | Authorization / 권한 검사 | Notification authorization |
| EQUIPMENT_MODIFY | ECC/S4 | Equipment master / 장비 마스터 | Equipment change |
| EQUIPMENT_UPDATE | ECC/S4 | Equipment update / 장비 업데이트 | Equipment update logic |
| FUNCL_MODIFY | ECC/S4 | Functional location / 기능 위치 | FL change |
| FUNCL_UPDATE | ECC/S4 | FL update / FL 업데이트 | FL update logic |
| PM_SCHED_MPLAN | ECC/S4 | Maintenance plan scheduling / 보전 계획 일정 | Plan scheduling |
| MAINTENANCE_PLAN_BADI | ECC/S4 | Maintenance plan / 보전 계획 | Plan customization |
| PARTNER_DETERMINATION_PM | ECC/S4 | Partner determination / 파트너 결정 | Partner logic |
| CO_CONF_UPDATE | ECC/S4 | Confirmation / 확인 | Confirmation update |
| STATUS_CHECK | ECC/S4 | Status management / 상태 관리 | Status validation |
| BADI_EAM_OBJECT_NETWORK | ECC/S4 | Object network / 객체 네트워크 | Object relationships |
| BADI_EAM_PM_COMPL | ECC/S4 | Completion confirmation / 완료 확인 | Completion logic |

---

## 4. Enhancement Spots (Modern) / 확장 스폿

| Name | System | Description | Usage |
|---|---|---|---|
| ES_EAM_NOTIF | ECC/S4 | EAM notification framework / EAM 통지 프레임워크 | Notification enhancements |
| ES_EAM_ORDER | ECC/S4 | EAM order framework / EAM 오더 프레임워크 | Order enhancements |

---

## 5. Module-Specific Special Enhancements / 모듈 특수 확장

- **Measurement reading upload**: BAdI `MEASURE_DOC_UPLOAD` — 측정값 업로드
- **Refurbishment**: BAdI `REFURB_PROC` — 수리 프로세스
- **Notification workflow**: `WS20000081` — 통지 워크플로
- **Shift handover / shift log** — 교대 인계 / 교대 로그
- **Mobile maintenance**: SAP Work Manager integration via OData / SAP Work Manager OData 연동

---

## 6. Custom Fields / Append Structures / 사용자 정의 필드

| Include | Table | Description |
|---|---|---|
| CI_AUFK | AUFK | Order master header / 오더 마스터 헤더 |
| CI_AFIH | AFIH | Maintenance order header / 보전 오더 헤더 |
| CI_AFVC | AFVC | Order operation / 오더 작업 |
| CI_QMEL | QMEL | Notification header / 통지 헤더 |
| CI_QMIH | QMIH | Maintenance notification / 보전 통지 |
| CI_EQUI | EQUI | Equipment master / 장비 마스터 |
| CI_ITOB | ITOB | Technical object / 기술 객체 |
| CI_IFLOT | IFLOT | Functional location / 기능 위치 |

---

## 7. S/4HANA Extensions (CDS / RAP) / S/4HANA 확장

- **CDS Views**:
  - `I_MaintenanceOrder` — Maintenance order interface view
  - `I_MaintenanceNotification` — Maintenance notification interface view
  - `I_Equipment` — Equipment interface view
  - `I_FunctionalLocation` — Functional location interface view
- **SAP Asset Manager** (mobile app) integration via OData
- **EAM on S/4HANA Cloud** — the apps are Fiori, and Key User Extensibility comes with them
- **RAP** — Custom maintenance apps via Behavior Definitions

---

## 8. Recommended Approach / 권장 접근 방식

1. **Prefer BAdIs over CMOD exits** — `WORKORDER_UPDATE` and `NOTIF_EVENT_HANDLER` are the ones to use.
2. **Technical object master data** — go through `EQUIPMENT_MODIFY` and `FUNCL_MODIFY`.
3. **Shared logic** — `WORKORDER_UPDATE` (PP+PM) and `NOTIF_EVENT_HANDLER` (QM+PM) are there to be reused.
4. **S/4HANA** — for mobile/Fiori scenarios, pair CDS views with Key User Extensibility.

BAdI 쪽을 먼저 고르고, 기술 객체 마스터 데이터에는 `EQUIPMENT_MODIFY` / `FUNCL_MODIFY`를 쓰세요.
