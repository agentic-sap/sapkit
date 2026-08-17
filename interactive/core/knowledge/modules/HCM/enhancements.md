# HCM Module Enhancements / HCM 모듈 확장

A catalog of Human Capital Management (HCM) enhancements, taking in classic customer exits, BAdIs, enhancement spots, Features (PE03), payroll rules, time management, HR Forms, custom infotype fields, and SuccessFactors extensibility.

인사 관리(HCM) 모듈에서 쓰는 사용자 출구와 BAdI, 확장 스폿, Feature(PE03), 급여 규칙, 시간 관리, HR 폼, 사용자 정의 인포타입 필드, SuccessFactors 확장성을 모은 카탈로그.

---

## 1. Overview / 개요

Structurally, HCM stands apart from the other SAP modules — what it works with is infotypes, Features (PE03), payroll schemas/rules (PE01/PE02), and HR Forms (HRFORMS). An enhancement strategy has to combine classic SAP extensibility with the customization tools particular to HCM.

HCM은 구조 면에서 다른 SAP 모듈과 갈라집니다. 다루는 것은 인포타입과 Feature(PE03), 급여 스키마/규칙(PE01/PE02), HR 폼(HRFORMS)입니다. 확장 전략은 일반 SAP 확장성과 HCM 고유 도구를 함께 묶어야 합니다.

- Classic Customer Exits (CMOD/SMOD)
- BAdIs (Business Add-Ins)
- Enhancement Spots
- **Features (PE03)** — decision tables particular to HCM / HCM만의 결정 테이블
- **Payroll Customization** (PE01, PE02, PE04, PE51)
- **Time Management** (time schemas, evaluation rules)
- **HR Forms (HRFORMS)** — Payslips together with country-specific forms
- Custom infotype fields (CI_*)
- S/4HANA: on-premise stays largely as it was; Cloud → SuccessFactors (MDF + Business Rules)

---

## 2. Classic Customer Exits (CMOD/SMOD) / 클래식 사용자 출구

| Name | System | Description | Usage |
|---|---|---|---|
| PBAS0001 – PBAS0002 | ECC/S4 | Personnel administration / 인사 관리 | Master data in PA |
| PBASRP01 | ECC/S4 | Personnel reports / 인사 보고서 | Reports |
| PSPAR001 | ECC/S4 | Personnel action parameters / 인사 조치 매개변수 | Parameters of the action |
| PSST0001 | ECC/S4 | Structure maintenance / 구조 유지 | Maintaining the structure |
| PAOC_GBN_01 – PAOC_GBN_04 | ECC/S4 | Global business object / 글로벌 비즈니스 객체 | Global BO |
| HRBAS00INFTY | ECC/S4 | Infotype operations / 인포타입 작업 | Infotype ops |
| HRPAD00INFTYDB | ECC/S4 | Infotype database / 인포타입 데이터베이스 | Infotype DB |
| HRPAD00AUTH_CHECK | ECC/S4 | Authorization / 권한 | Auth check |
| HRPAD00_REL | ECC/S4 | Relationship / 관계 | Relationships in OM |
| PPBAS0001 | ECC/S4 | Organizational management / 조직 관리 | OM |
| QPPOR001 | ECC/S4 | Position / 직위 | Processing a position |
| HRREFR_01 – HRREFR_05 | ECC/S4 | Reference personnel number / 참조 사번 | Reference PERNR |
| PTIM_SCH1 | ECC/S4 | Time management schema / 시간 관리 스키마 | Time schema |
| HRPY00EE | ECC/S4 | Payroll / 급여 | Payroll core |
| HRPAYUS_KIND_OF_EARNING | ECC | US payroll / 미국 급여 | US earnings |
| PAYXX | ECC/S4 | Country-specific payroll / 국가별 급여 | Country payroll |

---

## 3. BAdIs / BAdI

| Name | System | Description | Usage |
|---|---|---|---|
| HRPAD00INFTY | ECC/S4 | Infotype processing / 인포타입 처리 | Logic for infotypes |
| HRPAD00INFTYMENU | ECC/S4 | Infotype menu / 인포타입 메뉴 | Customizing the menu |
| HRPAD00_BADI_EMPLOYEE | ECC/S4 | Employee processing / 직원 처리 | Logic for the employee |
| HRCPY00_PAYROLL | ECC/S4 | Payroll country-specific / 국가별 급여 | Country payroll |
| HRPTIM00_TIMEEVAL | ECC/S4 | Time evaluation / 시간 평가 | Time evaluation |
| HRHAP00_DOC_FAV | ECC/S4 | Document - Appraisal / 문서 - 평가 | Appraisal doc |
| HRHAP00_DOC_CREATE | ECC/S4 | Appraisal doc creation / 평가 문서 생성 | Creating an appraisal |
| HRESS00_GENERAL | ECC/S4 | ESS customization / ESS 사용자 정의 | ESS general |
| HRESS_PER_BIRTH_DATE | ECC/S4 | Birth date display / 생년월일 표시 | ESS birthday |
| HRWPC_ABS_REQ | ECC/S4 | Absence request / 부재 요청 | Absence requests |
| HRMSS00 | ECC/S4 | MSS customization / MSS 사용자 정의 | MSS |
| RHINTE00 | ECC/S4 | OM-PA integration / OM-PA 통합 | Integration of OM and PA |
| HRBEN00ENGINE | ECC/S4 | Benefits / 복리후생 | Benefits engine |
| HRPAYUS_CUS_EOY | ECC | US year-end / 미국 연말 | US EOY |
| HRBAS00_BUPA | ECC/S4 | BP-PA integration / BP-PA 통합 | Integration with BP |

---

## 4. Enhancement Spots (Modern) / 확장 스폿

| Name | System | Description | Usage |
|---|---|---|---|
| ES_HRPAD00INFTY | ECC/S4 | Infotype enhancement framework / 인포타입 확장 프레임워크 | Infotype ES |
| ES_HRESS00 | ECC/S4 | ESS enhancement framework / ESS 확장 프레임워크 | ESS ES |

---

## 5. Module-Specific Special Enhancements / 모듈 특수 확장

### 5.1 Features (PE03) — HCM 고유 설정 방식

Features are the decision tables particular to HCM, and **PE03** is where they are maintained.

Feature는 HCM만의 결정 테이블이며 PE03에서 유지합니다.

| Feature | System | Description | Usage |
|---|---|---|---|
| ACTIO | ECC/S4 | Default action / 기본 조치 | The action defaulted when hiring |
| PINCH | ECC/S4 | Organizational assignment / 조직 배정 | IT0001 defaults |
| SCHKZ | ECC/S4 | Work schedule / 근무 일정 | Work schedule rule |
| ABKRS | ECC/S4 | Payroll area / 급여 영역 | Default for the payroll area |
| IGMOD | ECC/S4 | Infotype modifier / 인포타입 수정자 | Infotype variant |
| LGMST | ECC/S4 | Basic pay wage types / 기본급 임금 유형 | IT0008 wage types |
| NUMKR | ECC/S4 | Number range for personnel / 사번 번호 범위 | PERNR number range |
| QUOMO | ECC/S4 | Time account / 시간 계좌 | Quota generation |
| TMSTA | ECC/S4 | Time status / 시간 상태 | Time management status |

### 5.2 Payroll Customization / 급여 사용자 정의

| Tool | System | Description | Usage |
|---|---|---|---|
| PE01 | ECC/S4 | Schema / 스키마 | Payroll schema |
| PE02 | ECC/S4 | Personnel calculation rule (PCR) / 인사 계산 규칙 | Payroll rules defined by the user |
| PE04 | ECC/S4 | Functions / Operations / 기능 / 작업 | Functions and operations defined by the user (ABAP-based) |
| PE51 | ECC/S4 | Form editor / 폼 편집기 | Editor for payroll forms |

### 5.3 Time Management / 시간 관리

- Schemas for time evaluation: **TM00**, **TM04** (positive/negative time / 실근무/소극시간)
- Time evaluation rules defined by the user: **TE01–TE99** (via PE02)
- BAdI `HRPTIM00_TIMEEVAL`, which carries time evaluation extensions

### 5.4 HR Forms (HRFORMS) / HR 폼

- Payslips designed through the **HRFORMS** transaction / HRFORMS 트랜잭션에서 급여명세서를 디자인
- Forms specific to a country: US, DE, KR, etc. / 국가별 폼

---

## 6. Custom Fields / Append Structures / 사용자 정의 필드

| Include | Table / Infotype | Description |
|---|---|---|
| CI_P0001 | PA0001 | Extension of infotype 0001 (Org. Assignment) / 인포타입 0001에 붙는 확장 |
| CI_PAnnnn | PAnnnn | Infotype fields defined by the user / 사용자가 정의하는 인포타입 필드 |
| CI_HRP1000 | HRP1000 | OM object / OM 객체 |

Creating a custom infotype normally goes through **PM01** (the transaction that generates custom infotypes).

사용자가 정의하는 인포타입은 대개 **PM01** 트랜잭션으로 만듭니다.

---

## 7. S/4HANA Extensions (CDS / RAP) / S/4HANA 확장

- **S/4HANA on-premise** — HCM carries over largely as it was; the same classic exits/BAdIs/Features apply.
- **S/4HANA Cloud** — **SuccessFactors** takes the place of HCM (a completely different extensibility model).
- **CDS Views** (limited on-premise): `I_EmployeeBasic`
- **SuccessFactors extensibility**:
  - **MDF (Metadata Framework)** — Objects and fields defined by the user
  - **Business Rules** — Logic stated declaratively (replaces PCRs/Features)
  - **Integration Center** — Integrations built by the user (replaces PI/PO for SFSF)
  - **SAP Build / Extension Suite** — UI extensions

S/4HANA 온프레미스는 HCM을 거의 그대로 남겨 두지만, S/4HANA Cloud는 SuccessFactors로 통째로 대체되며 MDF와 Business Rules를 씁니다.

---

## 8. Recommended Approach / 권장 접근 방식

1. **Infotype processing** — reach for BAdI `HRPAD00INFTY` (preferred over the `HRBAS00INFTY` exit).
2. **Defaults & decision logic** — turn to **Features (PE03)** before any code gets written.
3. **Payroll customization** — go with **PE02 custom rules (PCRs)** rather than customer exits.
4. **Time evaluation** — take BAdI `HRPTIM00_TIMEEVAL` together with custom TE rules.
5. **Payslip / forms** — design modern forms in **HRFORMS**.
6. **SuccessFactors** — put **MDF + Business Rules + Integration Center** in place of ABAP exits.
7. **Custom fields** — extend infotypes through CI_P* includes, and create custom infotypes with **PM01**.

인포타입 처리라면 BAdI `HRPAD00INFTY`, 급여라면 PE02 사용자 규칙, SuccessFactors라면 MDF와 Business Rules를 권장합니다.
