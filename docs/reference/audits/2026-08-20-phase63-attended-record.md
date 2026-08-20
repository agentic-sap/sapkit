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
