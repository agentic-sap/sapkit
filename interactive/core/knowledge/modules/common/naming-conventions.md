# Common - ABAP Naming Conventions
# 공통 - ABAP 명명 규칙

Every custom ABAP object MUST comply with the naming conventions below. The customer namespace is entered through the `Z` prefix for standard development or the `Y` prefix for temporary and prototype work.
커스텀 ABAP 오브젝트는 예외 없이 아래 명명 규칙을 지켜야 합니다. 커스텀 네임스페이스로 들어가는 접두사는 표준 개발이면 `Z`, 임시·프로토타입 작업이면 `Y`입니다.

## General Rules / 공통 규칙

| Rule | Description |
|------|-------------|
| Prefix | `Z` (customer standard) or `Y` (temporary/prototype) — never modify SAP-delivered objects without enhancements |
| Case | UPPERCASE only (ABAP is case-insensitive, but convention is uppercase) |
| Character set | Letters (A-Z), digits (0-9), underscore (`_`) — no other special characters |
| Max length | 30 characters (most objects); 8 characters (package); 40 (class method) |
| Namespace pattern | `Z{MODULE}_{OBJECT_TYPE}_{NAME}` recommended for clarity |
| Avoid | Generic names (ZTEST, ZTEMP, ZDUMMY), Hungarian notation inside ABAP code |

## Module Codes / 모듈 코드

The second segment of a name carries one of the 2-3 letter module codes below (`Z{MODULE}_...`):

| Code | Module |
|------|--------|
| SD | Sales and Distribution / 영업 및 유통 |
| MM | Materials Management / 자재 관리 |
| FI | Financial Accounting / 재무 회계 |
| CO | Controlling / 관리 회계 |
| PP | Production Planning / 생산 계획 |
| PM | Plant Maintenance / 설비 관리 |
| QM | Quality Management / 품질 관리 |
| HR / HCM | Human Capital Management / 인적 자본 관리 |
| WM | Warehouse Management / 창고 관리 |
| EWM | Extended Warehouse Management (S/4) |
| TM | Transportation Management / 운송 관리 |
| TR | Treasury / 재무(자금) |
| BW | Business Warehouse / 비즈니스 웨어하우스 |
| AR | Ariba integration |
| BC | Basis / 기반 |
| CA | Cross-Application / 공통 |

## Object-Specific Naming / 오브젝트별 명명 규칙

The patterns for each object type — classes, interfaces, programs, function groups, data dictionary, UI/Dynpro, OData/RAP, enhancements, configuration, IDoc/ALE — live in the companion file **[naming-conventions-objects.md](naming-conventions-objects.md)**. Read it before you create any ABAP object.

## Code-Level Naming / 코드 레벨 명명

### Variables / 변수

| Prefix | Type | Example |
|--------|------|---------|
| `LV_` | Local Variable (scalar) | `LV_ORDER_NUMBER` |
| `LS_` | Local Structure | `LS_ORDER_HEADER` |
| `LT_` | Local Internal Table | `LT_ORDER_ITEMS` |
| `LR_` | Local Reference (object ref) | `LR_ORDER_HANDLER` |
| `LO_` | Local Object (instance ref) | `LO_ORDER` |
| `GV_` | Global Variable | `GV_CLIENT` (avoid globals where possible) |
| `GS_`, `GT_`, `GR_`, `GO_` | Global Structure/Table/Ref/Object | `GT_ORDER_CACHE` |
| `IV_` | Importing parameter (scalar) | `IV_ORDER_ID` |
| `IS_` | Importing Structure | `IS_ORDER_HEADER` |
| `IT_` | Importing internal Table | `IT_ORDER_ITEMS` |
| `EV_`, `ES_`, `ET_`, `ER_` | Exporting parameters | `EV_RESULT`, `ES_ORDER` |
| `CV_`, `CS_`, `CT_` | Changing parameters | `CV_STATUS` |
| `RV_`, `RS_`, `RT_`, `RR_` | Returning | `RV_TOTAL_AMOUNT` |
| `MV_`, `MS_`, `MT_`, `MR_`, `MO_` | Member (class attribute) | `MV_ORDER_ID`, `MO_LOGGER` |

### Constants / 상수

| Prefix | Description | Example |
|--------|-------------|---------|
| `GC_` | Global Constant | `GC_STATUS_NEW` |
| `LC_` | Local Constant | `LC_DEFAULT_CLIENT` |
| `CO_` | Interface/Class Constant | `CO_MAX_ITEMS` |

### Types / 타입

| Prefix | Description | Example |
|--------|-------------|---------|
| `TY_` | Local Type | `TY_ORDER_HEADER` |
| `TY_T_` | Local Table Type | `TY_T_ORDER_ITEMS` |
| `TY_S_` | Local Structure Type | `TY_S_ORDER_LINE` |

### Methods / 메서드

- Use one of these verbs: `GET_`, `SET_`, `CREATE_`, `DELETE_`, `CALCULATE_`, `CHECK_`, `VALIDATE_`, `PROCESS_`, `CONVERT_`, `BUILD_`
- Private methods carry no extra prefix; public methods keep the same style, and so do static methods
- Event handler methods: `ON_{EVENT}`
- For instance: `GET_ORDER_DETAIL`, `CALCULATE_TAX`, `ON_VALUE_CHANGED`

### Forms (ABAP Subroutines - legacy) / 폼 (레거시)

- Naming pattern: `F01_{NAME}`, `FORM_{NAME}`, or verb-based
- Such as: `FORM GET_ORDER_DATA`, `FORM F01_READ_CUSTOMER`
- Modern ABAP reaches for class methods rather than FORMs

## Special Prefixes / 특수 접두사 (예약됨)

| Prefix | Owner | Do NOT use |
|--------|-------|-----------|
| A, B, C, D, ... X | SAP standard | Customer modifications need key |
| Z | Customer namespace | ✅ Safe for custom development |
| Y | Customer namespace (alt) | ✅ Safe for temp/prototype |
| /namespace/ | Registered namespace | Requires SAP namespace registration |
| `SAPL` + FG | Function Group main pool | Auto-generated |
| `SAPM` + program | Module pool | Use `SAPMZ...` for custom |

## Validation Rules / 검증 규칙

Check each of these before you create an object:

1. **Name starts with `Z` or `Y`** (these are the customer-namespace prefixes)
2. **Name is uppercase** (not a single lowercase letter)
3. **Only A-Z, 0-9, _** (no hyphen, no space, no special character)
4. **Max length respected** (30 characters for most; confirm the limit for the specific type)
5. **Not reserved** (no collision with an SAP reserved name)
6. **Not generic** (steer clear of `ZTEST`, `ZTEMP`, `ZDUMMY`, `Z1`, `ZAAA`)
7. **Descriptive** (the name says what the object is for)
8. **Module code included** where it applies (`Z{MODULE}_...`)
9. **Package assignment correct** (`$TMP` is wrong for anything transportable)

## Recommended Approach / 권장 접근

- Reach for the `Z{MODULE}_{TYPE}_{NAME}` pattern; it reads clearest
- Classes always take one of the type prefixes `ZCL_`, `ZIF_`, `ZCX_`
- Objects local to a program take `LCL_`, `LIF_`, `LTCL_`
- Keep the `Y` prefix out of production code — it is reserved for prototypes that will be renamed
- Stay inside the character limits — when something has to give, truncate the `{NAME}` portion and never the prefix
- On S/4HANA, OData/Fiori artifacts follow RAP naming: `Z_I_`, `Z_C_`, `Z_SD_`, `Z_SB_`, `Z_BP_`
