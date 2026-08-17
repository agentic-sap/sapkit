# Common - Cross-Module SPRO Configuration
# 공통 - 교차 모듈 SPRO 설정

어느 SAP 모듈에서나 똑같이 걸리는 SPRO 커스터마이징을 담은 참조.
SPRO customizing that every SAP module has in common.

## Enterprise Structure (Cross-Module) / 기업 구조 (교차 모듈)

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Define Client | ECC/S4 | T000 | Defines the client / 클라이언트를 정의한다 | SCC4 |
| Define Country | ECC/S4 | T005 | Defines a country / 국가를 정의한다 | OY01 |
| Define Language | ECC/S4 | T002 | Defines a language / 언어를 정의한다 | - |
| Define Company | ECC/S4 | T880 | Defines a company — the trading partner / 회사를 정의한다 | - |
| Define Company Code | ECC/S4 | T001 | Defines a Company Code / 회사코드를 정의한다 | OX02 |
| Assign Company Code to Company | ECC/S4 | T001_ASSIGN | Assignment of the one to the other / 둘 사이의 배정 | - |
| Define Business Area | ECC/S4 | TGSB | Defines a Business Area / 사업 영역을 정의한다 | - |
| Define Functional Area | ECC/S4 | TFKB | Defines a Functional Area / 기능 영역을 정의한다 | - |
| Define Segment | ECC/S4 | FAGL_SEGM | Defines a Segment / 세그먼트를 정의한다 | - |

## Currency / Exchange Rate / 통화 및 환율

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Define Currency Codes | ECC/S4 | TCURC | Defines currency codes / 통화 코드를 정의한다 | OY03 |
| Define Currency Translation Factors | ECC/S4 | TCURF | Factors used in translation / 환율 변환에 쓰는 계수 | - |
| Maintain Exchange Rates | ECC/S4 | TCURR | Holds the exchange rates / 환율을 유지한다 | OB08 |
| Define Exchange Rate Types | ECC/S4 | TCURV | Types a rate can carry / 환율의 유형 | - |
| Define Decimal Places | ECC/S4 | TCURX | How many decimal places / 소수점을 몇 자리까지 쓰는지 | - |

## Calendar / 달력

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Maintain Factory Calendar | ECC/S4 | TFACS | Keeps the factory calendar / 공장 달력을 유지한다 | SCAL |
| Maintain Public Holidays | ECC/S4 | THOL | Keeps the public holidays / 공휴일을 유지한다 | SCAL |
| Maintain Holiday Calendar | ECC/S4 | THOC | Keeps the holiday calendar / 휴일 달력을 유지한다 | SCAL |
| Assign Factory Calendar to Plant | ECC/S4 | T001W | Assigns a calendar to a plant / 플랜트에 달력을 배정한다 | - |

## Units of Measure / 측정 단위

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Check Units of Measure | ECC/S4 | T006 | Checks the units of measure / 측정 단위를 점검한다 | CUNI |
| Dimensions | ECC/S4 | T006D | Dimensions of the UoM / 측정 단위의 차원 | - |

## Number Range (Cross-Module) / 번호 범위 (교차 모듈)

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Maintain Number Range Objects | ECC/S4 | TNRO | Where a number-range object is defined / 번호 범위 객체를 정의하는 곳 | SNRO |
| Number Range Intervals | ECC/S4 | NRIV | Intervals, held per object / 객체별 번호 범위 구간 | - |

**Group ≠ interval / 그룹과 인터벌은 별개 체계.** Where a number-range object is grouped
(CO orders via KONK, CO documents via KANK, …), the *group* numbers run on a counter of
their own, unrelated to the `NRIV` interval numbers — and the standard groups SAP ships
are already present on a fresh system: for `AUFTRAG`, groups 03–20. Read "interval 20 is
free" as "group 20 does not exist yet" and the instructions you write will contradict what
the Group Selection popup actually shows; a group created by mistake is also not
straightforward to remove.
번호범위 **그룹** 번호를 `NRIV` **인터벌** 번호와 한 체계로 묶어 읽어서는 안 된다 —
표준으로 배송된 그룹이 이미 들어 있다.

No DDIC table has turned up for the group texts or the element assignment — `TNRO*`,
`NRGR*`, and `CUS_STRUC*` were all tried and all came back empty. So read the group state
off the maintenance screen, or work occupancy out backwards from whichever customizing
table consumes the group — `T003O-NUMKR` for CO order types, for example, where an empty
result says the group exists but no order type is using it.

## Fiscal Year / 회계 연도

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Define Fiscal Year Variant | ECC/S4 | T009 | Defines the fiscal year variant / 회계 연도 변형을 정의한다 | OB29 |
| Assign Fiscal Year Variant to CoCd | ECC/S4 | T001_GJ | Assigns the variant to a company code / 회사코드에 배정한다 | - |

## Logical System / ALE Cross-System / 논리적 시스템 및 ALE

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Define Logical System | ECC/S4 | TBDLS | Defines the logical system / 논리적 시스템을 정의한다 | BD54 |
| Assign Logical System to Client | ECC/S4 | T000 | Ties a client to a logical system / 클라이언트를 잇는다 | SCC4 |
| Maintain Distribution Model | ECC/S4 | TBD62 | Keeps the distribution model / 배포 모델을 유지한다 | BD64 |
| RFC Destination Configuration | ECC/S4 | RFCDES | Sets up the RFC destinations / RFC 대상을 설정한다 | SM59 |

## Output / Message Control / 출력 및 메시지 제어

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Maintain Output Determination | ECC/S4 | NAST | Configures output determination / 출력 결정을 설정한다 | NACE |
| Condition Maintenance | ECC/S4 | KONH/KONP | Keeps the condition records / 조건 레코드를 유지한다 | - |

## Address Management / 주소 관리

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Define Address Check | ECC/S4 | SAD_ADRCHK | Sets up address validation / 주소 검증을 정의한다 | - |
| Define Communication Types | ECC/S4 | T77S0 | Defines the communication types / 통신 유형을 정의한다 | - |

## Authorization / 권한

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Define Authorization Object | ECC/S4 | TOBJ | Defines the authorization object / 권한 객체를 정의한다 | SU21 |
| Maintain Profiles (generated via PFCG) | ECC/S4 | AGR_* | Profiles that come from roles / 역할에서 나오는 프로파일 | PFCG |

## Client Administration / 클라이언트 관리

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| Client Settings (SCC4) | ECC/S4 | T000 | The client role, and whether changes are allowed / 클라이언트 역할과 변경 허용 여부 | SCC4 |
| Default Client for Logon | ECC/S4 | - | Comes from profile parameter login/system_client / 로그온 기본 클라이언트 | - |
| Copy Client (SCC1) | ECC/S4 | - | Copies a client / 클라이언트를 복사한다 | SCC1 |

## IMG Activity Verification / IMG 액티비티 검증

Before quoting an IMG (SPRO) path anywhere, check these two —
[spro-lookup](../../../procedures/spro-lookup.md) § 2a carries the procedure.

| Config | System | Table | Description / 설명 | TCode |
|--------|--------|-------|--------------------|-------|
| IMG Activity Header | ECC/S4 | CUS_IMGACH | Is there such an activity at all? / 액티비티가 있는지 없는지 | SPRO |
| IMG Activity Text | ECC/S4 | CUS_IMGACT | Its display text; filter on `SPRAS = 'E'` / 표시 텍스트를 읽는다 | SPRO |

An activity ID is built as `SIMG_CFMENU<menu-area><TCODE>`. The menu-area codes that have
turned up in CO/PS:

| Code | Area |
|------|------|
| ORKS | Cost Center Accounting |
| ORK1 | Profit Center Accounting |
| ORKA | Internal Orders |
| ORKE | Profitability Analysis (CO-PA) |
| ORKK | Product Cost Controlling |
| OLPR | Project System |

Two limits to state before anything else:

- **The full IMG tree path is not readable from DDIC.** The tree itself lives in SIMG
  objects, and `CUS_STRUC*` / `*IMGSTR*` do not exist. What these two tables answer is
  whether a node exists and what it is called — not where it sits. / IMG 트리의 풀패스는
  DDIC로 읽어낼 수 없다.
- Sweeping many activity IDs in one query runs into the `GetSqlQuery` `OR`-width limit —
  take a prefix, `LIKE 'SIMG_CFMENUORKS%'`, rather than a long `OR` chain. See
  [troubleshooting](../../../procedures/troubleshooting.md) § 8.
