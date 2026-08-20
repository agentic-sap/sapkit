# 판6.3 실행 기록 — attended 실기 46종 + 꼬리 기준 인하 집행

> **기록이지 권위가 아니다.** 판단의 정본은 `docs/RUN-PLAN.md`(판 큐·브리프) ·
> `docs/reference/DECISIONS.md`(결정) · `sapkit-engine/TOOL-LEDGER.md`(대장 · 기계 생성물)다.
> 이 문서는 그 판단들이 **무엇을 실측하고 나왔는지**를 남긴다.
>
> 접속 정보(호스트·자격증명)는 여기 적지 않는다 — 레포는 PUBLIC이다.

---

## T1 — 착수 기준선 (2026-08-20 · 오프라인 + P1)

### 원격 대조

`git fetch` 후 `main..origin/main` **0건** · `origin/main..main` **0건** — 병렬 줄기 없음.
착수 커밋 `89e8c17`. 작업 가지 `dryforge/phase63-attended`.

### 게이트 네 묶음 + doctor

| 묶음 | 결과 |
|---|---|
| 제품 게이트 9종 | **9/9 exit 0** |
| 제품 음성시험 9종 | **9/9 exit 0** |
| `sapkit-engine` 전종 | **전종 exit 0** — `verify`(jest 4161 pass / 1 skip · 242 suite) · `gates` · `test-gates`(44건) · `stdio-smoke` · `bundle-smoke`(1.0.0 스탬프 일치 · 단일 파일 3.64MiB) · `keyring-fallback-smoke`(12건) · `test-refusal-vocab`(8건) · `render-ledger --check` · `build-plan --check` |
| `sapkit-cli` 전종 | **전종 exit 0** — `verify`(jest 355 pass · 12 suite) · `gates`(코퍼스 47파일 × 표면 3종 · 갈림 0) · `test-corpus-gate`(14건) · `test-compare-baseline`(21건) |
| `doctor` | **exit 1 — FAIL 1 · WARN 4 · SKIP 2 · OK 7** |

**doctor FAIL은 이 판이 만든 것이 아니다** — 착수 시점에 이미 나 있던 **로컬 설치 상태**다:
`Antigravity 호환성 — 설치 1.1.1 ≠ 고정 1.1.4`. doctor는 레포가 아니라 이 머신의 설치본을
읽는다(`doctor.mjs`는 CLAUDE.md 게이트 절에서 「로컬 전용」으로 표시된 유일한 항목).
WARN 4종도 같은 성질이다 — Codex pre-conformance · Claude 설치본 v0.7.0/v0.5.4 ≠ 레포 v0.8.0 ·
Codex legacy 전역 `sap` 그림자. **마감 실측에서 같은 상태면 「차이 없음」이고, 달라지면 그것을 적는다.**

### 대장 착수 수치

```
도구 186 · 안 지음 0 · 증거 대기 126 · 증거 있음 60
요구 급  replay 96 · attended 48 · contract 42     (harness/build-plan.json 실측)
```

### KR-DEV 접속 확인 (P1)

- 프로파일 `~/.sapkit/profiles/KR-DEV/sap.env` **존재** · `SAP_TIER=DEV` **실측 확인**
  (하드게이트 1 — P3 write의 전제).
- `GetSystemInfo` 1회 → `system_id=DEV` · `client=700` · `language=KO` ·
  `adt_stack_type=modern` · 접속 사용자 확인됨.
  같은 머신의 다른 프로파일(`IDEA-JNC`)은 `client=100`이므로 **client로 갈린다** — 지금 붙은
  자리가 KR-DEV다.

### 보호 자산 8종 — 1차 조회 (P1 · 마스크 3종)

`ZSAPKIT*` **6건** · `ZCL_SAPKIT*` **1건** · `Z_SAPKIT*` **1건** = **8건**. spec §3.4 명부와 **완전 일치**.

| 이름 | 타입 | 패키지 |
|---|---|---|
| ZSAPKIT_M1_DEMO | PROG/P | `$TMP` |
| ZSAPKIT_M1_FG | FUGR/F | `$TMP` |
| ZSAPKIT_M1_INC01 | PROG/I | `$TMP` |
| ZSAPKIT_M1_INCMAIN | PROG/P | `$TMP` |
| ZSAPKIT_M1_STR | TABL/DS | `$TMP` |
| ZSAPKIT_M1_TAB | TABL/DT | `$TMP` |
| ZCL_SAPKIT_M1_DEMO | CLAS/OC | `$TMP` |
| Z_SAPKIT_M1_FM | FUGR/FF | `$TMP` |

**연습 이름(`*_63*`) 잔재 0건** — 세 마스크 결과에 `_63`이 들어간 이름이 하나도 없다.
이것이 T7 중간 조회·T10 정리 후 조회가 대조할 **기준선**이다.

### P2 계수

**0건.** `GetTableContents`·`GetSqlQuery` 미사용 — 이 시점까지 호출 0회.

---

## T4 — attended 정찰 3건 (2026-08-20 · KR-DEV · P3)

정찰 대상은 전부 `$TMP`에 새로 만든 `ZSAPKIT_63_R*` 이름이고, **만든 것은 전부 지웠다**
(아래 각 항 끝에 재조회 결과를 적는다).

### T4-3 — 활성화 갈래: **두 갈래 다 선다**

| 시험 | 결과 |
|---|---|
| `CreateDomain ZSAPKIT_63_RX (activate=false)` → `status: "inactive"` → `DeleteDomain` | **성공** — 재조회 0건 |
| `CreateDomain ZSAPKIT_63_RY (activate=true)` → `status: "active"` → `DeleteDomain` | **성공** — 재조회 0건 |

**판정**: **비활성 객체도 그냥 지워진다.** 그러므로 T3이 미리 적어 둔 두 갈래 중
**기본 갈래 ⑴(생성 → 활성화 → 삭제)를 그대로 쓴다** — 활성화 단계를 빼도 왕복은
성립하지만, 두면 `ActivateObjects`가 시퀀스마다 한 번 더 밟히고 「실제 업무 흐름은
활성 객체를 지운다」는 성질을 담는다. 시나리오는 손대지 않았다.

### T4-1 — CDS/RAP: **선다.** 다만 두 가지가 정찰로 확정됐다

| 단계 | 결과 |
|---|---|
| `CreateTable ZSAPKIT_63_R0` → `UpdateTable`(MANDT 키 + 2필드, activate) | **성공** (`activated: true`) |
| `CreateView ZSAPKIT_63_RV0` → `UpdateView`(`define root view entity`, activate) | **성공** (`activated: true`) |
| `CreateBehaviorDefinition`(Managed, activate=false) | **성공** |
| `CreateBehaviorImplementation ZBP_SAPKIT_63_RV0` | **성공** |
| 정리 4종(BImp → BDef → View → Table) | **전부 성공** — `ZSAPKIT_63_R*` 재조회 0건 |

**확정 ⑴ — 동작 구현 클래스 이름은 우리가 고르는 것이 아니다.**
생성된 BDEF 소스 첫 줄이 정본이다:

```
managed implementation in class zbp_sapkit_63_rv0 unique;
strict ( 1 );
define behavior for ZSAPKIT_63_RV0
persistent table ZSAPKIT_63_R0
lock master
authorization master ( instance )
```

규칙은 **BDEF 이름의 선두 `Z`를 `ZBP_`로 바꾸는 것**이다. 그래서 시나리오 9의
구현 클래스 이름을 `ZCL_SAPKIT_63_BP` → **`ZBP_SAPKIT_63_RV`**로 고쳤다.
이 이름은 spec §4.1이 적은 네 접두어 밖이므로 **정리 마스크에 `ZBP_SAPKIT*`를 더한다**
(보호 자산 확인 마스크 3종은 spec대로 그대로 둔다 — 더하는 것은 정리 쪽이지 보호 쪽이
아니다).

**확정 ⑵ — BDEF는 구현 클래스가 생긴 뒤에 활성화한다.** 먼저 활성화하면 없는 클래스를
참조한다. 시나리오 9의 `CreateBehaviorDefinition`을 `activate: false`로 바꾸고 활성화를
뒤로 옮겼다.

### 🔎 정찰이 부수적으로 잡은 **제품 엔진 결함 1건** (구·신 공통 · 회귀 아님)

`ActivateObjects`에 이름+타입만 주고 BDEF를 활성화하면 **실패한다**:

```
"status": "failed",
"text": "Object ZSAPKIT_63_RV0 is still inactive after the activation run
         (oracle re-query via GetInactiveObjects) — activation did not take,
         despite the run response."
"objectUri": "/sap/bc/adt/ddic/bdef/sources/zsapkit_63_rv0"
```

같은 객체에 **`uri`를 명시하면 성공한다**(`"status": "activated"`):

```
"uri": "/sap/bc/adt/bo/behaviordefinitions/zsapkit_63_rv0"
```

- **원인**: `sapkit-engine/src/tools/write/activateObjects.ts:126-127`이 `BDEF/BDO`를
  `/sap/bc/adt/ddic/bdef/sources/{이름}`으로 푼다. 그런데 **같은 엔진의 읽기 쪽**
  (`src/tools/read/internal/behaviorRead.ts:124`)은 `/sap/bc/adt/bo/behaviordefinitions/{이름}`을
  쓴다 — 엔진이 **자기 안에서 두 주소를 갖고 있고**, SAP이 인정하는 것은 뒤쪽이다.
- **교체가 만든 회귀가 아니다.** 구 포크도 같은 매핑이다
  (`engine/src/lib/resolveAdtUri.ts:117`) — **물려받은 결함**이고, 실 SAP에서 이번에
  처음 관측됐다. 그러므로 `harness/DIVERGENCES.md`(구·신 **차이**)의 자리가 아니라
  **백로그**의 자리다.
- **이 판은 고치지 않는다** — `src/` 수정은 재번들까지 한 커밋이고 이 판의 배정 밖이다.
  시나리오 9는 `uri` 명시로 우회하며, 그 대가(러너의 네임스페이스 사전 검사 우회)를
  단계 note에 적었다.
- **`GetInactiveObjects` 재조회 오라클이 이 결함을 잡았다** — 활성화 run 응답만 믿었으면
  「성공」으로 읽었을 자리다. 「write 성공 보고를 그대로 믿지 않는다」가 기계로 작동한
  실례다.

### T4-2 — 화면·GUI: 진단 재료가 **사라졌다.** 캐시 플러시 1회 태움

- `RuntimeGetGatewayErrorLog`(user=HJAEWON · 상한 10) → **4건**이고 전부
  2026-08-19의 **다른 서비스**(`ZDTV3_UI_AP_RECON`)다. 판6.2가 실측했던
  `/SAP/-ZMCP_ADT_SRV-0` Frontend Error **2건은 로그 창에서 밀려나 없다.**
  즉 **지금 시점의 진단 재료가 없고**, 새로 재현해야 생긴다.
- `ZMCP_ADT_FLUSH_CACHE`(`$TMP` · 활성)의 소스를 읽어 파라미터 셋을 확인했다 —
  `p_flush`(기본 켬) · `p_reg`(기본 끔) · `p_diag`(기본 켬). **`p_reg`가 기본으로 꺼져
  있는 것이 중요하다**: 그것이 `/IWBEP` 등록 테이블을 직접 MODIFY하는 갈래이고,
  프로그램 주석 자신이 「보통은 Basis가 표준 트랜잭션으로 등록한다」고 적는다.
  **기본값으로만 태웠다** — 등록 갈래는 건드리지 않았다.
- `RuntimeRunProgramWithProfiling`으로 **1회 실행**(`run_status: 200`).
  플러시+진단은 돌았으나 **그 프로그램의 WRITE 목록 출력은 이 표면으로 회수되지 않는다** —
  그래서 「플러시가 무엇을 고쳤는가」는 이 기록으로 알 수 없다.
- **판정**: 「선다/못 선다」를 여기서 가르지 않는다. **측정은 시나리오 6이 한다** —
  T3에서 그 시나리오를 화면·GUI 단계를 **빼지 않고** 위험도 역순으로 짜 뒀기 때문에,
  실패하면 그 응답 전문이 「어느 단계에서 어떤 이유로 막혔는가」의 근거로 픽스처에 남는다.
  단계를 빼면 「관찰되지 않았다」밖에 못 적는다. **상한 1회를 지켰다**(플러시 1회).

---

## T5~T10 — 실기 46종 (2026-08-20 · KR-DEV · P3/P4)

### 갈림 — **34종 섰다 / 12종 못 섰다** (기계 집계)

집계는 `fixtures/attended-only/zsapkit63-*.json` 9편에서 **도구별 `isError`를 세어** 낸 것이다
(사람이 센 것이 아니다). 픽스처 9편 · 단계 107 · 엔진은 전부 `sapkit-engine 1.0.0`.

⚠ **필터가 하나 더 있다 — 그것을 빼면 36이 나온다.** 같은 방법을 필터 없이 돌리면
`isError: false`인 `Create*`/`Delete*`는 **36종**인데, 늘어난 둘은 `CreateProgram`·`CreateInclude`이고
**이 판의 대상 46종이 아니다**(판6.1에서 이미 닫혔고 여기서는 숙주 준비로 쓰였다).
그러므로 정확한 방법은 「`isError`를 센다」가 아니라 **「대상 46종 안에서 `isError`를 센다」**이고,
그렇게 세면 **34**다. 대장 델타 `+34`가 이 수와 맞는 이유도 같다 — 그 둘은 이미 「증거 있음」이었다.
(판6.3 최종 독립 리뷰 B2가 이 서술의 불완전함을 잡았다.)

| 픽스처 | 단계 | 오류 |
|---|---:|---:|
| `zsapkit63-domain-dataelement` | 9 | 0 |
| `zsapkit63-structure-table` | 9 | 0 |
| `zsapkit63-class-locals-unittest` | 21 | 1 |
| `zsapkit63-interface` | 5 | 0 |
| `zsapkit63-function` | 9 | 0 |
| `zsapkit63-include` | 8 | 0 |
| `zsapkit63-cds-view-mde-test` | 19 | 2 |
| `zsapkit63-rap-bdef-bimp-service` | 26 | 1 |
| `zsapkit63-p4-transport` | 1 | 0 |

**섰다 (34)** — `CreateBehaviorDefinition` `CreateBehaviorImplementation` `CreateClass`
`CreateDataElement` `CreateDomain` `CreateFunctionGroup` `CreateFunctionModule`
`CreateInterface` `CreateServiceBinding` `CreateStructure` `CreateTable` `CreateTransport`
`CreateView` `DeleteBehaviorDefinition` `DeleteBehaviorImplementation` `DeleteCdsUnitTest`
`DeleteClass` `DeleteDataElement` `DeleteDomain` `DeleteFunctionGroup` `DeleteFunctionModule`
`DeleteInclude` `DeleteInterface` `DeleteLocalDefinitions` `DeleteLocalMacros`
`DeleteLocalTestClass` `DeleteLocalTypes` `DeleteMetadataExtension` `DeleteProgram`
`DeleteServiceBinding` `DeleteServiceDefinition` `DeleteStructure` `DeleteTable` `DeleteView`

**못 섰다 (12) — 이유가 네 부류로 갈린다**

| 부류 | 도구 | 이유 (실측) |
|---|---|---|
| **원리상 불가 · SAP 호출 0회** | `DeleteUnitTest` · `CreateCdsUnitTest` | ADT가 그 조작을 지원하지 않거나(전자), 벤더의 생성 갈래가 요구하는 인자가 **발행 스키마에 없어** 언제나 시험-실행 갈래로 떨어진다(후자). 둘 다 엔진 소스가 이미 그 사연을 적어 두었고, 이 판이 **그 계약 문구를 실기로 확인**했다. 관측 문구: `Delete operation is not supported for Unit Test objects in ADT` · `At least one test definition is required for test run` |
| **거짓 음성 — 객체는 생겼는데 오류를 보고한다** | `CreateMetadataExtension` · `CreateServiceDefinition` | 사슬이 **껍데기 생성 → 잠금 → 인액티브 검사** 순서라, 빈 소스가 자기 검사에서 깨져도 **생성은 이미 끝난 뒤다.** 같은 시퀀스의 `Get*`·`Update*`·`Delete*`가 전부 성공하는 것이 그 증거다. 관측 문구: `preCheck syntax check failed (1 error): [L1] Illegal syntax. Malformed 'annotate' statement` / `… Malformed service definition`. **「write 성공 보고를 그대로 믿지 않는다」의 뒤집힌 짝 — 실패 보고도 그대로 믿으면 안 된다.** |
| **시스템 측 고장 · 오류에 실호스트** ⚠ **레포에 픽스처가 없다 — 근거는 이 서술과 아래 T7 절뿐이다** | `CreateTextElement` · `DeleteTextElement` · `CreateScreen` · `DeleteScreen` · `CreateGuiStatus` · `DeleteGuiStatus` | 여섯 종 전부 커스텀 OData 서비스 `ZMCP_ADT_SRV`를 거치는데 그 서비스가 **HTTP 500**을 낸다. `ZMCP_ADT_FLUSH_CACHE`를 태운 **뒤에도 그대로**였고, Gateway 에러로그에 `Service: /SAP/-ZMCP_ADT_SRV-0` Frontend Error가 새로 남았다(상세는 여전히 빈 구조). ⚠ **브리프가 예고한 것은 4종인데 실제로는 6종이다** — 텍스트 엘리먼트도 같은 서비스를 탄다는 것이 이 판의 새 관측이다. |
| **엔드포인트 부재 / P4 실패** | `CreateUnitTest` · `CreatePackage` | 아래 별항 |

### `CreateUnitTest` — 이 시스템에 엔드포인트가 없다

벤더 경로 `POST /sap/bc/adt/abapunit/runs`가 **404**다(제품 MCP로 직접 재현). 엔진 소스
(`src/tools/write/createUnitTest.ts` 머리말)가 이미 그 사실을 적고 있다 — 구 엔진이 실
S/4HANA·BASIS 7.00에서 discovery로 확인해 **형제 `RunUnitTest`만** 고전 엔드포인트
(`/abapunit/testruns`)로 옮겼고, `CreateUnitTest`는 구가 보내던 전문을 그대로 보내도록
남겨 두었다. 그러므로 **이 시스템에서는 원리상 설 수 없다.**

⚠ 그리고 그 404 오류 문구에 **실호스트가 실려** 마스킹 검사가 시퀀스 전체의 저장을 거부했다.
한 단계가 21단계의 증거를 날리는 자리라 시나리오 3에서 **뺐다.**

### `CreatePackage` — 세 갈래가 다 막혔고, **되돌릴 수 없는 흔적이 남았다**

| 시도 | 인자 | 결과 |
|---|---|---|
| ⑴ 로컬 우선 | `software_component=LOCAL` | SAP 거부 — `Package ZSAPKIT_63_PKG may not be assigned to software component LOCAL` (T100 `TR/462`). **아무것도 안 생김**(직후 `GetPackage`=not found) |
| ⑵ 인자 생략 | `software_component` 없음 | **도구가** 거부 — `Software component is required`(`createPackage.ts:299`, 벤더 가드를 그대로 되살린 자리). ⚠ **발행 설명과 실제가 갈린다** — 선언은 「주지 않으면 SAP이 기본값(보통 ZLOCAL)을 정한다」고 적는다 |
| ⑶ 이송 갈래 | `HOME` + `ZDEV` + `DEVK901065` + `record_changes` | 도구는 **오류를 보고**했고 픽스처는 없다. 그러나 **패키지는 존재한다** — 아래 |

**⑶의 흔적 판정 (여러 읽기 경로가 갈린다 — 그대로 적는다):**

- `CreatePackage` 재시도 → `Package ZSAPKIT_63_PKG already exists` (SAP 이름 검증이 그렇게 답한다)
- `GetPackageContents` → `[]` (**오류가 아니라 빈 목록** — 존재하는 빈 패키지의 응답이다)
- `ReadPackage` → `success: true`이나 `metadata: null`
- `GetPackage`(active·inactive) → `not found`
- `SearchObject ZSAPKIT_63_PKG` → 0건

→ **반쯤 만들어진 패키지**로 판단한다. 생성 요청은 통과했고 그 뒤 단계에서 깨졌다.
**「없다」로 적지 않는다** — 존재를 가리키는 경로가 둘, 부재를 가리키는 경로가 셋이고,
확정은 사용자가 SE80/SE21에서 해야 한다.

이송요청 `DEVK901065`(+태스크 `DEVK901066`)는 **미해제**다(status `D` 수정가능 ·
target `로컬변경요청`)이고 **객체 0건**이다 — 반쯤 만들어진 패키지가 이 요청에 실리지도
않았다. **해제(`ReleaseTransport`)는 하지 않았다.**

### 신 엔진이 고친 것이 실기로 확인됐다 — `CreateTransport`의 번호 회수

`zsapkit63-p4-transport` 픽스처의 유일한 단계 응답에 `"transport_request": "DEVK901065"`가
실려 있다. **구 엔진은 이 번호를 응답에서 잃었고 신 엔진이 고쳤다(장부 D81)** — 그 수리가
실제로 먹는다는 것이 여기서 관측됐다.

### 안전 — 세 지점 조회 결과

| 시점 | `ZSAPKIT*` | `ZCL_SAPKIT*` | `Z_SAPKIT*` | 판정 |
|---|---:|---:|---:|---|
| T1 착수 전 | 6 | 1 | 1 | 보호 8종 |
| T7 중간 (프로그램 계열 직후) | 6 | 1 | 1 | **기준선과 일치** |
| T10 정리 후 | 6 | 1 | 1 | **기준선과 일치** |

**세 시점 모두 같은 8개 이름·타입·패키지였다** — 건수만이 아니라 명부로 대조했다.
T7·T10의 조회가 돌려준 것도 T1 절의 표와 **글자로 같다**:

```
ZSAPKIT*     : ZSAPKIT_M1_DEMO (PROG/P) · ZSAPKIT_M1_FG (FUGR/F) · ZSAPKIT_M1_INC01 (PROG/I)
               ZSAPKIT_M1_INCMAIN (PROG/P) · ZSAPKIT_M1_STR (TABL/DS) · ZSAPKIT_M1_TAB (TABL/DT)
ZCL_SAPKIT*  : ZCL_SAPKIT_M1_DEMO (CLAS/OC)
Z_SAPKIT*    : Z_SAPKIT_M1_FM (FUGR/FF)
               — 여덟 전부 packageName `$TMP`
```

⚠ **다음 attended 판을 위한 메모**: 이 명부를 세 시점 모두 적어 두지 않으면 「같은 수의 다른
객체로 바뀐 경우」를 기록만으로는 배제할 수 없다. 이 판은 세션 안에서 세 번 다 명부를 봤고
그것을 여기 옮겼지만, **처음부터 그렇게 적는 편이 낫다**(판6.3 최종 독립 리뷰 A4).

- **보호 자산 8종 전부 무사.** 세 조회 모두 같은 8개 이름·타입·패키지(`$TMP`)다.
- **연습 객체 잔재 0** — `ZSAPKIT_63*` · `ZCL_SAPKIT_63*` · `Z_SAPKIT_63*` · `ZIF_SAPKIT*` ·
  `ZBP_SAPKIT*` 다섯 마스크 전부 0건. ⚠ **마스크를 넷이 아니라 다섯으로 뜬 이유**는 T4가
  확정한 대로 동작 구현 클래스 이름을 SAP이 `ZBP_`로 정하기 때문이다.
- **예외 2종**(§T9) — 이송요청 `DEVK901065` · 반쯤 만들어진 패키지 `ZSAPKIT_63_PKG`.
  **우리 도구로 지울 수 없다**(표면 186종에 `DeleteTransport`·`DeletePackage`가 없다).
- **P2 0건** — `GetTableContents`·`GetSqlQuery` 호출 0회로 판을 마쳤다.

### 마스킹이 증거를 막는 구조적 자리 — 이 판이 새로 관측한 것

엔진이 실패를 접을 때 **요청 URL을 오류 문구에 싣는 경로**가 있다(예: `POST http://…/sap/opu/odata/…`).
픽스처는 PUBLIC 레포로 나가므로 마스킹 검사가 그것을 옳게 거부하는데, 그 결과
**한 단계의 오류 문구가 시퀀스 전체의 증거를 날린다.** 이 판에서 세 번 겪었다 —
`CreateUnitTest`(시나리오 3) · 화면·GUI 9단계(시나리오 6) · `GetClass`를 갓 만든 클래스에
건 되읽기(시나리오 8). **처방은 시나리오 쪽에서 그 단계를 피하는 것뿐이고, 그것은
「증거를 못 만든다」와 같은 말이다.** 근본 처방(오류 문구에서 호스트를 정규화)은 이 판의
범위 밖이며 **백로그로 넘긴다.**

### 채록기 회수 — 위치를 안 찍으면 사람이 22단계를 손으로 뒤진다

마스킹 거부가 `violations[].path`를 참조하라고만 하고 **그 배열을 아무도 안 찍었다.**
attended 구간에서 그것은 「SAP write는 이미 나갔는데 어디가 걸렸는지 모른다」는 뜻이라,
실기 도중에 진입점이 위반 목록(`ruleId` + `path` + `hint`)을 찍도록 고쳤다.
`hint`는 설계상 걸린 원문을 담지 않으므로 이 출력으로 비밀이 새지 않는다.

---

## T11 — D8 관찰 판정 (오프라인)

**판정: 「관찰되지 않았다」.** 「없다」가 아니다. D8은 **결함으로 승격하지 않는다.**

D8(장부 `harness/DIVERGENCES.md:202`)의 판정 조건은 마일스톤이 아니라
**「C1 녹화에서 발동이 관찰되는가」**이고, 대상은 셋이다 — `406`/`415` Accept/Content-Type
자동 재협상 · `/sap/bc/adt/discovery` 외 폴백 및 리다이렉트 추종 · 구의 `skipSessionType`.

### 관찰 범위 (여기까지만 봤다)

| 재료 | 무엇을 담는가 | 판정에 쓸 수 있는가 |
|---|---|---|
| 픽스처 9편 · 107단계 | 도구 **응답 본문**(인자 포함) | ○ — 오류 응답에는 상태코드가 문구로 실린다 |
| 자식 프로세스 stderr (시퀀스별 파일로 보존) | **기동 배너 2줄뿐** (`transport(resolved)` · `profile:`) | ✕ — **HTTP 수준 로그가 애초에 없다** |
| 그 밖 제품 MCP 직접 호출 (정찰·진단) | 응답 본문 | ○ |

⚠ **T5가 「자식 stderr를 파일로 남긴다」를 요구한 것은 이 판정의 재료를 늘리기 위해서였는데,
실제로 남는 것이 기동 배너뿐이라 그 목적으로는 무력했다.** 남긴 것 자체는 유지한다(다른 판정에
쓰일 수 있다) — 다만 **D8 판정의 재료로 계산하면 안 된다.**

### 셋 각각

- **`406`/`415`** — 신 엔진에는 **자동 재협상이 애초에 없다**(도구 소스가 그렇게 적는다:
  `src/tools/read/getPackage.ts:44` · `readPackage.ts:47`). 그러므로 「재협상이 발동했는가」는
  신 엔진 쪽에서 **원리상 관측될 수 없고**, 관측 가능한 것은 **「406/415가 실제로 오는가」**뿐이다.
  그 자리는 실재한다 — `src/tools/read/internal/classIncludes.ts:120-124`가 로컬 인클루드
  읽기의 406을 잡아 `"… read not supported on this system (HTTP 406)."`라는 **고유 문구**를 낸다.
  **이 판은 그 경로를 4회 밟았고**(`zsapkit63-class-locals-unittest`의 `GetLocalDefinitions` ·
  `GetLocalTypes` · `GetLocalMacros` · `GetLocalTestClass` 되읽기) **넷 다 성공했다** —
  그 문구는 한 번도 나오지 않았다. 픽스처 전량에서 `406`·`415` 문자열 출현 **0건**.
- **discovery 외 폴백 · 리다이렉트 추종** — **관측 자리가 없다.** 픽스처는 응답 본문만 담고
  stderr에 HTTP 로그가 없어서, 리다이렉트를 따라갔는지 여부가 어디에도 나타나지 않는다.
  픽스처 전량에서 `redirect` 출현 0건이지만 **그것은 「안 일어났다」의 증거가 아니다.**
- **`skipSessionType`** — 같은 이유로 관측 자리가 없다. 출현 0건.

### 그래서 장부에 무엇을 적는가

**D8은 그대로 둔다** — 승격 근거가 없다. 다만 **판정 조건 자체의 관측 가능성 한계**를 적어 둘
필요가 있다: 셋 중 **406/415만** C1으로 관측 가능하고(그것도 「재협상」이 아니라 「도래」),
나머지 둘은 **현재 채록 설비로는 원리상 관측되지 않는다.** 조건을 그대로 두면 다음 사람이
「몇 판을 더 돌리면 판정이 난다」로 읽는데, 실제로는 **설비를 먼저 고쳐야 한다.**
이 사실을 D-항목에 적고 장부는 손대지 않는다(등재 없는 차이는 결함이지만, **이것은 차이가 아니라
판정 조건의 성질**이다).

---

## T12 — 꼬리 기준 인하 집행 (오프라인)

### 세 지점 수치 — **세 수를 다 적는다**

| 시점 | 증거 대기 | 증거 있음 |
|---|---:|---:|
| ⓐ 착수 (2026-08-20) | **126** | **60** |
| ⓑ 실기 46종 반영 후 (인하 **전**) | **92** | **94** |
| ⓒ 인하 반영 후 | **30** | **156** |

- ⓐ→ⓑ의 **+34는 증거다** — 이 판의 실기가 세운 34종과 정확히 같다.
- ⓑ→ⓒ의 **+62는 증거가 아니다.** **인하는 증거를 만든 것이 아니라 요구를 낮춘 것이다.**
  그 62종이 실 SAP에서 검증된 것은 **아니다**. 대장이 이 「인하 전」 수치를 **같은 증거로 요구만
  되돌려 다시 세어** 머리말에 병기하므로, 대장만 봐도 두 사실이 갈린다.

요구 급 분포: `replay` **96 → 34** · `attended` 48(불변) · `contract` 42 → **104**(= 원래 42 +
인하 62).

### 무엇을 인하했나 — 해석과 인코딩

D-092 ⓐ의 문언은 「**판6이 끝나는 시점까지 한 번도 쓰이지 않은 재생 대상**은 계약 시험 급으로
인하한다」다. ⚠ **항목 제목의 「꼬리」는 오독을 부르는 이름이다** — 꼬리 묶음(`tail` 49종)에
요구 급 `replay`인 도구가 **0종**이라 좁게 읽으면 집행이 **공전한다.** 그래서 문언대로
**요구 급 `replay` 전체**를 대상으로 읽었다.

**⚠ 「80종 인하」로 적으면 안 된다.** 80은 **판 착수 시점**의 수(픽스처 10파일 · 도구 18종)이고,
이 판의 실기가 픽스처를 19파일·78종으로 늘려 그 수를 **62**로 줄였다. 실측한 수를 적는다.

### 자기충족 구조를 막는 것이 이 과제의 핵심이었다

산식이 매 실행마다 `fixtures/`를 다시 훑으면 **증거를 못 만들수록 요구가 저절로 낮아진다** —
픽스처를 지우는 것만으로 요구가 조용히 내려가고 대장은 초록이다. 그래서 관측을 한 번 뽑아
`harness/phase6-exercised.json`으로 **얼리고**, 산식은 그 파일만 읽는다.

- 다시 얼리는 것은 **사람이 스크립트를 부르는 행위**이고 커밋 diff에 남는다.
- 갈라짐은 `--check`가 **알려만 준다** — 자동 재동결 없음. **게이트에 일부러 걸지 않았다**:
  게이트로 걸면 픽스처를 더할 때마다 빨개지고, 그 불을 끄는 가장 쉬운 길이 「다시 얼리기」라
  그것이 곧 자기충족의 상시 통로가 된다.
- 얼린 파일이 **없거나 비었거나 깨졌으면 fail-closed**(exit 2). 빈 목록도 거부한다(전량 인하 =
  자기충족의 극단).

### 독립 리뷰의 판정

수치를 **자기 스크립트로 다시 세어** 전건 일치를 확인했다 — 인하 62 · 분포 34/48/104 ·
계약 104의 내역(인하 62 + 원래 42) · 얼린 관측 78종(픽스처 19파일 · 131단계) · 30/156 ·
인하 전 92/94 · 착수 시점 80/18. **인하 62종이 전부 인하 전 「증거 대기」 목록 안**임도 확인했다.

**사보타주 7종**으로 각 갈래가 실제로 빨개지는지 확인했고, **요구 급에 닿는 픽스처 스캔 경로가
0개**임을 호출 사슬로 추적했다(`build-plan.mjs` → `ledger/*` → `evidence.ts`).
⚠ 리뷰어의 첫 사보타주는 `renameSync`가 EXDEV로 **조용히 실패**했고 그 상태의 게이트는 전부
초록이었다 — **변형이 실제로 적용됐는지부터 확인한다**는 규칙이 또 한 번 값을 했다.

**회수 둘**(`needs-fix`)을 반영했다:
- **V1** — `harness/replay/coverage.ts`·`replay/README.md`에 **인하 이전 사다리 그대로**의
  서술이 남아 있었다. 두 파일 다 「여기서 정하지 않는다」고 적으면서 규칙만 베껴 두고 있었고,
  그 문장이 하필 이 판이 막으려던 오독이었다. **베끼지 말고 정본을 가리키게** 고쳤다.
- **V2** — 대장의 「재생 픽스처 16종」과 BUILD-PLAN의 「78」이 **단위가 다르다는 설명이 없었다**
  (16 = 재생 수집기가 최상위만 셈 / 78 = 재귀). 대장은 생성물이므로 **생성기를 고쳐** 두 행이
  서로를 가리키게 했다.
- 리뷰의 **정직 유보**도 적었다 — 얼린 목록 안인데 실사용 호출이 0인 도구 4종
  (로컬 인클루드 읽기·쓰기 넷 · **이 판이 새로 태운 자리**)은 사다리 ③에서 끝나 **인하가 아니라
  처음부터 계약 시험**이다.

---

## T13 — 대장 재생성 + 마감 실측

### 마감 실측 — **착수 기준선과 차이 없음**

| 묶음 | 착수 (T1) | 마감 (T13) |
|---|---|---|
| 제품 게이트 9종 | 9/9 exit 0 | **9/9 exit 0** |
| 제품 음성시험 | 9/9 exit 0 | **9/9 exit 0** (+ 신설 `test-attended-guard` 72건은 엔진 쪽) |
| `sapkit-engine` 전종 | 전종 exit 0 | **전종 exit 0** — jest **4192 pass**(4161 → +31) · gates · `test-gates` 44 · `test-attended-guard` **72** · `render-ledger --check` · `build-plan --check` · `phase6-exercised --check` |
| `sapkit-cli` 전종 | 전종 exit 0 | **전종 exit 0** |
| `doctor` | exit 1 · OK 7 · WARN 4 · SKIP 2 · FAIL 1 | **완전히 동일** |

**`doctor`의 FAIL 1은 착수 때와 같은 항목**(Antigravity 설치 1.1.1 ≠ 고정 1.1.4)이고 이 머신의
설치 상태다. **이 판이 만든 차이는 없다.**

### 재번들은 필요 없었다

`check-engine-provenance.mjs`의 `ENGINE_SOURCE_PATHS`는 `src`·`package.json`·
`package-lock.json`·`tsconfig.json`·`tools`뿐이고 `harness/`·`gates/`는 **명시 제외**다.
이 판이 건드린 것은 전부 `harness/`·`gates/`이므로 번들·VERSION·integrity를 **손대지 않았다**.
`verify-engine`·`check-engine-provenance` 둘 다 통과한다.

---

## T15 — 독립 새-컨텍스트 리뷰 (오프라인)

이 프로젝트 품질 모델(1명 작업 + 1명 새-컨텍스트 리뷰 + SAP 기계 확인)의 나머지 절반.
리뷰어는 **읽기 전용**이고 작업자의 결론을 신뢰하지 않는다.

### 리뷰어가 독립으로 확인한 것

- **수치 전건 재계산 일치** — 대장 세 지점(126/60 → 92/94 → 30/156) · 인하 62종(**명단 차이 0**) ·
  분포 34/48/104 · 인하 전 96/48/42 · 얼린 관측 78종(19파일·131단계) · 착수 80/18 ·
  픽스처 9편·107단계·엔진 단일 · 신원 자리표시자 22건/4편 · 묶음 편성표 29행.
  **자기 스크립트로 셌고 레포의 계산기를 쓰지 않았다.**
- **사보타주 22종 전건에서 빨개짐** — 채록 관문(저장 자리 3분기 · 무접속 어휘 · 신원 뒷문 ·
  진입점 배선)과 인하 산식(얼린 파일 부재·빈 목록·JSON 파손·schema 위조)의 각 갈래.
  ⚠ **1차 시도에서 앵커 5개가 CRLF 때문에 조용히 안 물렸고**, 「변형이 실제로 적용됐는가」
  단언이 그것을 잡았다 — 이 레포에서 같은 함정이 **세 번째**다.
- **요구 급에 닿는 픽스처 스캔 경로 0개** — 호출 사슬로 추적(`build-plan.mjs` → `ledger/*` →
  `evidence.ts`). 얼린 관측 종수는 **표시용**으로만 읽히고 판정에 안 쓰인다.
- **기존 플래그가 새 판정을 끄지 못한다** — `--force`·`--allow-all-errors`·`--allow-standard-source`
  전부 자리·무접속·신원 판정과 무관함을 소스로 확인.
- **「불변」 주장 전건 확인** — `src/` · 번들 3자 · `engine/` · `sapkit-cli/` · `usage-census.json` ·
  `DIVERGENCES.md` · `replay/divergences.ts` **전부 diff 0바이트**.
- **게이트 전종 직접 실행** — 제품 9 + 음성시험 9 + 엔진 11종 + cli 4종 **전부 exit 0**
  (`doctor`만 1 — 착수와 동일).

### 회수 — 차단 2건 · 권고 7건

**차단 둘은 수치가 아니라 서술이었다.** 상세와 처리는 **D-099**에 있다.

| 항목 | 내용 | 처리 |
|---|---|---|
| **B1** | 시나리오 README가 11편이 **46종**을 덮는다고 적으나 실제로는 **45종**(`CreateUnitTest`를 뺐다) | **고침** |
| **B2** | 「34종」의 집계 방법을 그대로 돌리면 **36**이 나온다 — 「대상 46종 안에서」라는 필터가 서술에 빠졌다(수치 34는 옳다) | **고침** |
| B2 딸림 | 그 결과 **D-098 정직 유보 ⓑ가 낡았다** — 이 판이 `CreateProgram`·`CreateInclude`를 신 엔진으로 다시 태워 대장이 `attended 통과(2)`로 적는다 | **D-099 ⓐ로 정정 append** |
| A1 | `build-plan.mjs --check`가 CI에 없어 **손으로 고친 계획이 전 게이트를 통과**(사보타주 S26 실측) | **CI에 추가** |
| A2 | 「못 섰다 6종」의 근거 파일이 레포에 없다는 사실이 표에 없다 | **표에 표시** |
| A3 | D8의 관측 가능성 한계가 결정 기록에만 있고 **장부에 없다** | **장부에 append** |
| A4 | 보호 자산 명부가 T1에만 있다 | **세 시점 명부를 기록에 남김** |
| A5 | 부수 발견 셋이 HANDOFF 백로그에 없다 | **HANDOFF에 추가** |
| A6 | 어느 시나리오가 픽스처를 냈는지 표에 없다 | **README에 명시** |
| A7 | attended-only에 **손으로 넣은** 픽스처를 잡는 게이트 없음 | **이월**(기존 자리 · 새 구멍 아님) |

### 리뷰어가 판단하지 못한 것 (그대로 적는다)

**SAP의 현재 상태 전부** — 리뷰는 접속 0회다. 보호 자산이 지금도 무사한지 ·
`ZSAPKIT_63_PKG`의 실제 상태 · 이송요청 미해제 여부 · 연습 잔재 0은 **기록으로만** 확인됐고
**독립 재현이 없다.** 확정은 사용자의 SE80/SE21·SE01에서만 난다.
그 밖에 — 텍스트·화면·GUI 6종의 「같은 서비스를 탄다」 인과(소스 미확인) · P4 픽스처의
사후 정규화 절차 재현 · 신설 CI 스텝의 실 러너 실행.

---

## 후일담 — P4 흔적의 결말 (2026-08-20 · 사용자 SAP 확인)

**판 기록이 틀렸다. 정정한다.**

사용자가 SAP에서 직접 확인했다: **이송요청 `DEVK901065`는 삭제했고, 패키지
`ZSAPKIT_63_PKG`는 애초에 없다.**

### 무엇이 틀렸나

이 문서(§T9)와 D-098 ⓑ는 패키지를 **「반쯤 만들어졌다」**로 판정했다. 근거는
읽기 경로 다섯이 2:3으로 갈렸다는 것이었다 — `CreatePackage` 재시도가 「이미 있다」,
`GetPackageContents`가 빈 목록(오류 아님)으로 **존재**를 가리키고, `GetPackage`(active·inactive)와
`SearchObject`가 **부재**를 가리켰다. 그때 「확정은 사용자가 SE80/SE21에서 해야 한다」고
적은 것은 맞았으나, **판정 자체를 「반쯤 만들어졌다」로 기운 것은 틀렸다.**

**옳은 결론: `CreatePackage`는 세 갈래 모두에서 완전히 실패했고 아무것도 만들지 않았다.**
`GetPackage`·`SearchObject`가 옳았고 나머지 셋이 오도했다.

### 사용자 확인 뒤 다시 뜬 실측 (읽기 전용 · 대상이 **확실히 없는** 패키지)

| 호출 | 응답 | 읽히는 뜻 |
|---|---|---|
| `GetPackage` | **HTTP 400 오류** | 부재 (판 당시에는 `not found`였다 — 문구는 다르나 존재를 주장하지 않는다) |
| `SearchObject ZSAPKIT_63_PKG` | 0건 | 부재 |
| `GetPackageContents` | **`[]`** | ⚠ **성공 모양** — 「있는데 비었다」와 구별되지 않는다 |
| `ReadPackage` | **`success: true` · `metadata: null`** | ⚠ **성공 모양** — 없는 객체에 성공을 찍는다 |
| `GetTransport DEVK901065`(삭제됨) | `SAP Error: 오브젝트가 없기 때문에 태스크/요청을 릴리즈할 수 없습니다 [HTTP 400]` | 부재이나 **릴리즈 오류 문구**로 답한다 |

**이 표가 새 발견이다** — 대상이 없다는 것이 **지상 진실로 확정된 상태**에서 뜬 것이라,
「없는 패키지에 대해 두 읽기 도구가 성공 모양의 응답을 준다」는 것이 재현 가능한 사실로 남는다.

### 그리고 `CreatePackage`의 「이미 있다」는 **거짓 판정이었다**

재시도가 낸 `Package ZSAPKIT_63_PKG already exists. Please delete it first or use a different
name.`는 **사실이 아니었다.** 그 판정을 내는 코드 경로는 `src/tools/write/createPackage.ts:435-448`이고,
**응답 본문에 `already exists`가 들어 있기만 하면**(또는 status 409) 그렇게 접는다 —
그 문자열이 **무엇에 대한 것인지 보지 않는다.**

⚠ **원인을 확정하지는 못한다.** 그 판정을 만든 SAP 응답의 **원문을 보지 못했다** — 녹화 경로의
응답은 마스킹이 막았고(실호스트 포함), 세션 호출은 접힌 문구만 준다. 그러므로 여기서 말할 수
있는 것은 **⑴ 판정이 거짓이었다**(지상 진실로 확정)와 **⑵ 그 판정을 내는 조건이 매우 넓다**
(본문 부분 문자열 하나)까지다. 그 둘이 같은 사건인지는 **미확인**이다.

### 판정의 성격 — 「거짓 성공」의 반대편

이 프로젝트가 반복해 겪은 것은 **「없는 성공을 있다고 보고한다」**였다(`UpdateClass` 활성화 ·
`CreateProgram` 검사 · 활성화 후 inactive 오류 폐기 · 이 판의 `ActivateObjects` BDEF).
이번 것은 **반대 방향**이다 — **없는 객체를 있다고 보고한다.** 결과는 같은 부류의 손해다:
사람이 「지워야 할 것이 남았다」고 믿고 SE80을 열게 만든다. 그리고 그 믿음이 문서에 박히면
다음 사람도 같은 것을 찾는다.

### 그래서 이 판이 남긴 흔적은 **0건이다**

- 이송요청 `DEVK901065`(+태스크 `DEVK901066`) — **사용자가 삭제**했다.
- 패키지 `ZSAPKIT_63_PKG` — **애초에 만들어지지 않았다.**

**「정리까지가 이 판이다」가 성립한다.** `CreatePackage`는 여전히 **못 섰다**(46종 갈림은
불변 — 34/12)이고, 대장 수치도 불변이다. 바뀐 것은 **흔적의 유무**뿐이다.
