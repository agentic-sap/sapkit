# PS Module Enhancements / PS 모듈 확장

This catalog gathers the Project System (PS) enhancements — classic customer exits (CMOD/SMOD), BAdIs, enhancement spots, custom fields, and S/4HANA extensibility.

프로젝트 시스템(PS) 모듈에서 쓰는 클래식 사용자 출구(CMOD/SMOD)와 BAdI, 확장 스폿, 사용자 정의 필드, S/4HANA 확장성을 모은 카탈로그.

---

## 1. Overview / 개요

SAP PS carries several enhancement mechanisms, and which of them applies varies with the release and the use case:

SAP PS가 갖춘 확장 메커니즘은 릴리스와 사용 사례에 따라 여러 가지로 갈립니다:

- **Classic Customer Exits (CMOD/SMOD)** — Function exits CNEX0001 – CNEX0027, which are valid in ECC and S/4HANA.
- **BAdIs (Business Add-Ins)** — Object-oriented; these get the preference in new development.
- **Enhancement Spots (Implicit/Explicit)** — The modern-generation framework (NetWeaver 7.0+).
- **Custom Fields / Append Structures** — Extends PROJ, PRPS, AUFK, AFVC through the CI_* includes.
- **S/4HANA Extensions (CDS / RAP / Key User Extensibility)** — Extensibility that is ready for the cloud.

신규 개발이라면 BAdI/확장 스폿을 권장하고, S/4HANA에서는 CDS 확장과 키 사용자 확장성을 먼저 고려합니다.

---

## 2. Classic Customer Exits (CMOD/SMOD) / 클래식 사용자 출구

| Name | System | Description | Usage |
|---|---|---|---|
| CNEX0001 | ECC/S4 | Project Definition save / 프로젝트 정의 저장 | Validation that runs as CJ06/CJ20N saves |
| CNEX0002 | ECC/S4 | Project Definition field defaults / 필드 기본값 | Fields defaulted at creation |
| CNEX0003 | ECC/S4 | WBS field values check / WBS 필드 검증 | Checks the PRPS fields |
| CNEX0004 | ECC/S4 | WBS authorization / WBS 권한 | Auth checks written by the user |
| CNEX0005 | ECC/S4 | WBS validation / WBS 검증 | Validation reaching across fields |
| CNEX0007 | ECC/S4 | WBS update / WBS 업데이트 | Logic placed at the PRPS update |
| CNEX0008 | ECC/S4 | Network header save / 네트워크 헤더 저장 | AUFK/AFKO checks |
| CNEX0009 | ECC/S4 | Network activity save / 네트워크 활동 저장 | AFVC validation |
| CNEX0010 | ECC/S4 | Network relationships / 네트워크 관계 | AFAB logic |
| CNEX0014 | ECC/S4 | Activity update (network) / 활동 업데이트 | Changes AFVC/AFVV at save |
| CNEX0017 | ECC/S4 | Milestone update / 마일스톤 업데이트 | MLST logic |
| CNEX0018 | ECC/S4 | Milestone dates / 마일스톤 일자 | Milestone trigger dates |
| CNEX0023 | ECC/S4 | Cost planning / 원가 계획 | Validation on the planning form |
| CNEX0024 | ECC/S4 | Project Builder integration / 프로젝트 빌더 통합 | CJ20N enhancements |
| CNEX0026 | ECC/S4 | Project Definition — additional data / 프로젝트 정의 추가 데이터 | Logic behind the custom tab |
| CNEX0027 | ECC/S4 | WBS — additional data tab / WBS 추가 데이터 탭 | Logic behind the custom subscreen |
| CJPNFUNC | ECC/S4 | Project number check / 프로젝트 번호 검증 | PSPID validation |
| CONFPS01 – CONFPS05 | ECC/S4 | Confirmation of network activity / 활동 확인 | Validating and updating at the confirmation |
| COBL0001 – COBL0002 | ECC/S4 | Account assignment (CO block) / 계정 배정 | Customizing the CO fields on PS postings |

---

## 3. BAdIs / BAdI

| Name | System | Description | Usage |
|---|---|---|---|
| WORKORDER_UPDATE | ECC/S4 | Order/network update / 오더·네트워크 업데이트 | Intercepts the network save |
| WORKORDER_STATUS | ECC/S4 | Status changes / 상태 변경 | Logic on networks driven by status |
| WORKORDER_GOODSMVT | ECC/S4 | Goods movement on network / 네트워크 자재 이동 | Customizing GR/GI for the network components |
| PS_MILESTONE_BILL | ECC/S4 | Milestone billing release / 마일스톤 대금청구 | Controls the logic of the billing release |
| PS_CASH_MGMT | ECC/S4 | Project Cash Management / 프로젝트 자금 관리 | Cash management postings |
| BADI_SCOL_PROJ_COST | ECC/S4 | Project cost collection / 프로젝트 원가 수집 | Customizing the cost rollup onto the WBS |
| BADI_PS_EVAL | ECC/S4 | PS evaluation / PS 평가 | Info system evaluation |
| CNIF_PS_TABLES | ECC/S4 | PS BAPI table enhancement / PS BAPI 테이블 확장 | Adds custom fields into the BAPI structures |
| BADI_PROJ_PROF | ECC/S4 | Project profile derivation / 프로젝트 프로파일 결정 | Derives the default profile |
| BADI_PS_NETPLAN | ECC/S4 | Network planning / 네트워크 계획 | Customizing the scheduling |
| BADI_PS_CLAIM | ECC/S4 | Claim Management / 클레임 관리 | Claim processing |
| PROGRESS_CUST | ECC/S4 | Progress analysis / 진행률 분석 | POC calculation |
| DIP_INPUT | ECC/S4 | DIP input / DIP 입력 | Customizing the DP91 input |
| AD01_EXPERT | ECC/S4 | Resource-Related Billing / 자원 기반 대금청구 | Logic for the DP91 expert mode |
| SMOD_V50B0001 | ECC/S4 | Billing plan (milestone) / 대금청구 계획 | Milestone billing plan |
| BADI_CJWBS | ECC/S4 | CJ20N WBS screen enhancement / CJ20N 화면 확장 | Additional WBS subscreen |

---

## 4. Enhancement Spots (Modern) / 확장 스폿 (현대식)

| Name | System | Description | Usage |
|---|---|---|---|
| ES_SAPLCOZF | ECC/S4 | Order/network processing framework / 오더·네트워크 처리 | Implicit & explicit enhancements |
| ES_SAPLCJWB | ECC/S4 | Project Builder framework / 프로젝트 빌더 프레임워크 | Hooks for the CJ20N subscreen |
| ES_SAPLIHEX | ECC/S4 | Confirmation framework / 확인 프레임워크 | Activity confirmation |
| ES_BUPA_PS | S4 | BP assignment to project (S/4) / BP 프로젝트 배정 | Business Partner integration |

---

## 5. Module-Specific Special Enhancements / 모듈 특수 확장

- **Project Builder (CJ20N)**: Custom tabs built from CNEX0026/CNEX0027 + BADI_CJWBS.
- **Availability Control**: BAdI `EXIT_SAPLKBPU_001` — overrides the tolerance warning/error / 가용성 관리의 초과 처리.
- **Settlement**: BAdI `CO_RESTRICT_KOKRS`, `K_SETTLEMENT_RULE` — derives the settlement rule / 정산 규칙의 도출.
- **DIP (DP81/DP91)**: BAdI `AD01_EXPERT`, `DIP_INPUT` — enriches the dynamic items / 동적 항목의 강화.
- **Progress Analysis**: BAdI `PROGRESS_CUST` — POC formulas defined by the user / 사용자가 정의하는 POC.
- **Cash Management integration**: BAdI `PS_CASH_MGMT` — drives the FI-CA postings / 자금 관리와의 연동.

---

## 6. Custom Fields / Append Structures / 사용자 정의 필드

| Include | Table | Description |
|---|---|---|
| CI_PROJ | PROJ | Custom fields for the project definition / 프로젝트 정의 |
| CI_PRPS | PRPS | Custom fields on the WBS element / WBS 사용자 필드 |
| CI_AUFK | AUFK | Network order header / 네트워크 오더 헤더 |
| CI_AFKO | AFKO | Network header / 네트워크 헤더 |
| CI_AFVC | AFVC | Network activity / 네트워크 활동 |
| CI_MLST | MLST | Milestone / 마일스톤 |
| CI_RPSCO | RPSCO | Project info DB / 프로젝트 정보 DB |

---

## 7. S/4HANA Extensions (CDS / RAP) / S/4HANA 확장

- **CDS Views**:
  - `I_ProjectDefinition`, `I_WBSElement`, `I_WBSElementBasic` — released APIs
  - `I_NetworkActivity`, `I_ProjectHierarchyNode`
- **Key User Extensibility** (Fiori) — Custom fields on the Project Control and WBS apps, put in through the Custom Fields & Logic app.
- **RAP** — Extends the WBS through Behavior Definitions (S/4HANA 2021+).
- **Commercial Project Management (CPM) / Hierarchical Project** — a CDS stack of its own (`CPD_*`).
- **Event-based Revenue Recognition (EBRR)** — BAdIs `EVENT_BASED_REV_REC`, carrying revenue rules defined by the user.

---

## 8. Recommended Approach / 권장 접근 방식

1. **BAdIs > CMOD customer exits** — the object-oriented BAdIs get the preference.
2. **Project save/validate** — `WORKORDER_UPDATE` and `BADI_CJWBS` are the ones to use, not CNEX0007.
3. **Milestone billing** — reach for the `PS_MILESTONE_BILL` BAdI rather than V50B0001.
4. **Resource-Related Billing (DP91)** — implement `AD01_EXPERT` together with `DIP_INPUT`.
5. **S/4HANA** — CDS extensions + Key User Extensibility come before classic exits.
6. **Custom fields** — go through CI_* append structures; on S/4 the Custom Fields app and released CDS are preferred.

우선순위는 BAdI에 두는 것이 원칙이고, 마일스톤 대금청구에는 `PS_MILESTONE_BILL`를 권장합니다. S/4HANA라면 CDS 확장과 키 사용자 확장성을 먼저 고려하세요.
