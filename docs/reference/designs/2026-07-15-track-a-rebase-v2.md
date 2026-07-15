# 트랙 A 실행 모델 재기준 설계서 v2 — 실행 구조 × SAP 권한 프로필

> **대체 선언**: 이 문서는 `2026-07-14-track-a-v019-rebase.md` 초안을 **대체한다**.
> 07-14 문서는 이력으로 보존하며 삭제·수정하지 않는다.
>
> 작성 2026-07-15. 상태: **사용자 택일 3건 확정 반영(2026-07-15). D-025로 봉인**.
> 이 문서는 **모드 매핑·SAP 안전 경계의 단일 정본**이며, 후속 문서 연쇄 갱신은 §11
> 표를 그대로 집행한다. 방향 정본은 D-023, 사실·기록 규율 정본은 D-024, 사용자 확정과
> trade-off의 정본은 D-025다.
> 07-14 v0.19.2 분석은 재실행하지 않았고, 허용된 `929685a..6de63ba` 커밋 델타만
> 판독했다.

---

## 0. 결론 — 무엇을 막고 무엇을 막지 않는가

본 재기준이 **금지하는 행위**는 정확히 둘이다.

1. **리뷰어 역할의 mutation** — 판정자가 판정 대상 repo/SAP를 고치면 D-019의 독립성이
   무너진다. repo mutation은 등식형 guard로 검사하지만, SAP mutation은 O1=(가)에 따라
   새 기계 경계를 만들지 않고 리뷰 관례와 사람 에스코트로만 금지한다.
2. **사람 없이 자율 실행되는 unattended 세션** — §7 해제 조건과 별도 사용자 결정을
   통과하기 전에는 실행 구조로 채택하지 않는다.

다음은 차단 대상이 아니다.

- 사람 주도 Direct/Guided 세션의 SAP 연결과 write
- 트랙 B MCP로 소스를 반영하는 것
- 사용자가 abapGit으로 반영하는 것
- 사람 셸의 vsp CLI와 에스코트
- attended Engine에서 승인 계약 아래 worker가 vsp CLI를 실행하는 것

따라서 **실행 구조**(Direct/Guided/Engine attended)와 **SAP 권한 프로필**
(offline/connected-read/실데이터 추출/write/transport)은 직교한다. vsp CLI는
**Engine의 SAP 백엔드이자 트랙 A 완료 증거의 공통 백엔드**이지 사람 주도 mutation
경로의 독점권자가 아니다. `DESIGN.md`도 무인 step에서 MCP가 구조적으로 차단돼 vsp
CLI가 필요하다고 한 뒤, 사람 소유 대화형 세션의 MCP 보완을 명시한다
(`DESIGN.md:94-98`, `:113-121`).

이 구분은 D-001/D-023의 “vsp 일원화”를 다음처럼 좁혀 읽는다.

> **Engine worker·독립 verify = vsp CLI. 사람 주도 적용 경로 = vsp CLI | 트랙 B MCP |
> abapGit. 어떤 경로로 적용했든 Track A 완료 도장은 동일 source에 대한 vsp CLI
> read-back·syntax/activation·unit/ATC 증거로만 찍는다.**

O1의 비용 0 선택은 안전 사실을 바꾸지 않는다. reviewer뿐 아니라 build/review/write를
맡는 **모든 attended child**는 같은 Windows 사용자 아래 profile 파일과 Credential
Manager를 통해 write credential을 다시 얻을 수 있고, D-019가 의도한 **SAP reviewer
기계 격리는 약화된 상태**다. 따라서 본 설계 전체의 봉인값은 다음과 같으며, §7 U-gate
전에는 예외가 없다.

```text
operation_mode                = attended-only
unattended                    = sealed
historical_rv4_classifier     = open
sap_mutation_boundary         = unverified
sap_mutation_boundary_scope   = reviewer + all attended child
```

D-024의 규율대로 어떤 성공적인 리뷰 관례나 에스코트 기록도 RV4를 “닫힘”으로 바꾸지
않는다. reviewer는 transport 조회를 포함해 어떤 P4 동작도 하지 않는다.

## 1. 후보 pin과 상류 델타

### 1.1 선택

**후보 pin = `6de63bac860723ff1bfd50a940a75e46c6e87d99`**.

선택 근거:

- [실측] 로컬 상류 `D:\claude-practice\claude-fable-final`의 HEAD와 로컬
  `origin/master` ref가 모두 `6de63ba`다.
- [실측] `6de63ba` 커밋 blob의 `.claude-plugin/plugin.json` 버전은 **0.19.3**이다.
  현재 워킹트리에 보이는 0.19.4는 같은 파일의 **미커밋 변경**이며, 상류 워킹트리는
  20개 파일이 modified 상태다. SHA로 재현할 수 없으므로 0.19.4를 pin이라고 부르지 않는다.
- [실측] `929685a..6de63ba`는 `ff2c17a`(기본 하네스 오버헤드 축소) → `fd86ba0`
  (v0.19.3 업그레이드 계약 완결) → `6de63ba`(lightweight review 기록) 세 커밋이다.
  `fd86ba0..6de63ba`는 review 문서 1개만 추가하므로 후보 runtime은 `fd86ba0`과 같다.
- [판단] 사용자 요구는 “현재의 final-harness”다. 이미 두 버전 뒤인 929685a를 유지하면
  retired-file 처리와 N7 기본 동작을 일부러 버리는 셈이다. 반대로 미커밋 0.19.4를
  택하면 D-024의 moving-target 금지를 다시 위반한다. 최신 **불변 커밋** 6de63ba가
  두 요구를 동시에 만족한다.

이 선택은 검증 완료 lock 선언이 아니다. §10의 `candidate`에만 기록하고 §12 게이트가
끝날 때까지 현 verified `8f7f13b`는 유지한다.

### 1.2 `929685a → 6de63ba` 영향

| 표면 | 델타 판정 | 설계 영향 |
|---|---|---|
| F1~F7 | 해당 구현 파일의 의미 변경 없음. authority-gate·router·run_contract 본체도 무변경 | 07-14 분석 결론 재사용. 좌표만 6de63ba 기준으로 승격 시 재채록 |
| N1~N6 | 본체와 의미 모두 변경 없음 | N1~N6 그대로 재사용 |
| N8 | 새 계약에서 `--allow-no-verify` 사용을 별도로 거부 (`6de63ba:skills/harness-init/templates/engine/scripts/execute.py:1415-1424`) | N2 강화로 합치지 않고 별도 N8로 추가 |
| N7 | post-run review가 **기본 off**, `--review` 명시 시에만 실행되며 여전히 비게이트 (`6de63ba:skills/harness-init/templates/engine/scripts/execute.py:3442-3447`, `:3524-3533`) | “엔진 review를 품질 게이트로 소비 금지”를 더 강하게 명시 |
| installer runtime | managed runtime에서 제품 테스트 4개가 빠짐 (`6de63ba:skills/harness-init/templates/engine/install_engine.py:31-55`) | retired 처리·테스트 실행 위치를 재설계 |
| retired 삭제 | 이전 manifest가 소유하고 byte가 같은 파일만 삭제하고 `removed_obsolete`로 보고 (`6de63ba:skills/harness-init/templates/engine/install_engine.py:337-385`) | 07-14 분석 §2.3은 낡음. 현재 target에서는 소유·실재하는 `test_execute.py`, `test_hooks.py` 2개만 예상 삭제 |
| learning 파일 | installer는 여전히 learning 파일을 복사하지 않음. 별도 `harness-init`만 없는 RULES/LESSONS/PROTOCOL의 선택 복사를 지시 | MAJOR-1 정정 유지. GOAL/STATE는 어느 경로도 생성하지 않음 |

[실측] 현 target의 `scripts/test_execute.py`, `scripts/test_hooks.py`, `scripts/execute.py`,
`.claude/hooks/session-start-context.py`는 `.claude/engine-manifest.json`의 기존 hash와 모두
일치한다. `test_run_contract.py`, `test_hook_router.py`는 현 target에 없다. 그러므로
staging migration의 예상값은 `removed_obsolete` 정확히 2개이며, 4개 전부가 아니다.

### 1.3 분석 재사용 경계

그대로 재사용한다:

- F1~F7 결론 (`2026-07-14-v019-engine-analysis.md:14-113`)
- N1~N6 (`:115-156`)
- settings 병합·custom hook 보존의 **조건부** 계약 (`:227-261`)
- vsp 미분류와 RV4 (`:315-511`)

낡아서 교체한다:

- Engine managed-file 15개 목록과 retired 없음 판정 (`:167-225`) → 후보는 runtime 11개,
  retired allowlist 4개다.
- N7의 “완료 때 review 실행” 서술 → 후보는 `--review`를 주지 않으면 실행 자체가 없다.
- 후보 version/pin → 929685a(v0.19.2)가 아니라 6de63ba(v0.19.3 blob)다.

재확인 대상으로 남긴다:

- 6de63ba clean detached checkout의 upstream 전체 test 결과
- Windows 주 머신 installer 결과와 Claude/Codex 실제 hook 발화
- 미커밋 0.19.4 내용. 커밋 SHA가 생기기 전에는 분석·pin 대상이 아니다.

## 2. 대상 상태

재기준 완료 후 트랙 A는 다음 상태다.

```text
일상 작업 ───────────── Direct (기본, 프로젝트 흔적 0)
구조가 필요한 사람 작업 ─ Guided (명시 승격, run-scoped 계약/증거)
배치·씨앗 실험 ───────── Engine attended (contract-bound, vsp CLI)
사람 없는 실행 ───────── sealed (대상 모드 아님; §7을 통과해야 별도 결정)

                       ×

SAP Policy ─────────── P0 offline / P1 connected-read / P2 real-data
                       / P3 write / P4 transport
```

- Direct는 기본이다. SAP 코드 초안·로컬 검증뿐 아니라 사람의 Direct-P3 write도
  금지하지 않는다. 다만 Direct-P3의 결과는 즉시 `PROVISIONAL_WRITE`이며 **완료 선언은
  Guided-P3로 승격**한 뒤에만 가능하다. Guided-P0의 R-PASS만으로도 완료할 수 없고,
  Guided-P3의 R-PASS+V-PASS가 있어야 한다.
- Guided는 사람 주도 작업이다. MCP/vsp/abapGit 중 적용 경로를 선택할 수 있고, run별
  review·verification 증거가 완료를 결정한다.
- Engine은 attended 특수 모드다. headless worker의 MCP는 차단되므로 SAP 접점은 vsp
  CLI뿐이다. 사람 parent가 별도로 MCP/abapGit을 수행하면 그 **별도 action**은 Guided로
  분류한다.
- P4는 더 이상 BLOCKED가 아니다. 다만 transport 전체를 자동화한다는 뜻도 아니다.
  Guided가 DEV package/request 생성과 release 준비를 소유하고, Engine worker는 이미
  승인된 package/request에 vsp `deploy --transport`로 할당·검증만 할 수 있다. release와
  QA/PRD import는 언제나 사람 전용이다(§4.2).
- O1=(가) 때문에 reviewer와 모든 attended child의 SAP mutation이 기계 차단됐다고
  주장하지 않는다. 지원 모드는 `attended-only`, 기록값은
  `historical_rv4_classifier=open` 및 `sap_mutation_boundary=unverified`이고 범위는
  `reviewer + all attended child`다.
- 트랙 B `interactive/` 소스는 건드리지 않는다. 공유 `.claude/settings.json`의 훅 3개는
  migration 전후 값·실발화로 검증한다.
- 기존 `phases/`는 역사 자료다. byte를 바꾸지 않고 §8의 지원 진입점에서 거부한다.

## 3. 분류 규칙 — 활동 하나가 정확히 한 칸에 들어가는 법

### 3.1 실행 구조

| 구조 | 소유자 | 흔적 | 선택 기준 |
|---|---|---|---|
| Direct | 현재 사람 소유 대화 세션 | 없음 | 한 세션에서 명확히 끝나고 run 증거가 불필요 |
| Guided | 사람 소유 대화 세션 + 필요 시 fresh reviewer | `.harness/runs/<run-id>/` | SAP 코드 완료, Direct-P3 후 종결, 중단재개, 명시적 review·증거가 필요 |
| Engine attended | contract-bound worker + 사람 operator | run 계약 + 신규 phase | 독립 step·bounded retry·씨앗 실험·배치가 실제 이득 |

### 3.2 SAP 권한 프로필

| 코드 | 프로필 | 가장 강한 효과 |
|---|---|---|
| P0 | offline | SAP 연결 없음. repo/local 계산·lint만 |
| P1 | connected-read | metadata/source/ATC/health 진단. row data·상태 mutation 없음. `vsp test`·임의 ABAP 실행은 제외 |
| P2 | real-data extraction | `GetTableContents`/`GetSqlQuery` 또는 vsp `query`로 실제 row를 읽음 |
| P3 | write | source/create/update/activate/deploy/copy/test 실행 등 SAP 상태·코드를 바꿈/실행 |
| P4 | transport | request 생성·할당·release 또는 transportable package 반영. P3보다 상위 |

분류 알고리즘은 집행자가 바꾸지 않는다.

1. **전체 작업이 아니라 action별**로 분류한다. Engine을 돕는 사람 MCP read는 Guided-P1,
   Engine worker의 deploy는 Engine-P3다.
2. 구조는 그 action을 실행하는 프로세스의 소유권으로 고른다. 현재 대화=Direct/Guided,
   `execute.py` child=Engine.
3. 프로필은 `P4 > P3 > P2 > P1 > P0` 중 그 action의 최고 효과 하나를 고른다.
4. P2 row call과 P3 write를 한 step에 합치지 않는다. P2는 호출별 승인 때문에 별도
   사람 action으로 쪼갠다.
5. vsp/MCP/abapGit은 축이 아니라 **path 속성**이다. path가 달라도 프로필은 효과로
   결정한다.
6. 리뷰어 action은 Guided-P0/P1 또는 Engine-P0/P1만 가능하다. 단 P1이라도
   `transport list/get`, `ListTransports`, `GetTransport`를 포함한 **모든 transport
   동작은 금지**한다. P2/P3/P4가 필요하면 review를 종료하고 owner/worker action을
   별도 run으로 새로 분류한다.

이 규칙으로 “어느 칸에도 없음”과 “두 칸에 걸침”을 동시에 없앤다.

## 4. 실행 구조 × SAP 권한 프로필 정본

`R-PASS`는 §5의 exact-subject fresh-context review 증거, `V-PASS`는 vsp 기반 기계 검증
증거다. “자동화”는 agent가 command를 실행할 수 있는 범위이며 credential owner는 언제나
사람이다.

| 구조 × 프로필 | 정당한 활동·경로 | credential owner | 리뷰·종결조건 | 자동화 |
|---|---|---|---|---|
| **Direct-P0** | 문서/메타, ABAP/CDS 초안, `vsp lint/parse --file` | 없음 | SAP 코드는 **DRAFT**만. Guided-P0 R-PASS 뒤에도 `REVIEWED_DRAFT`; 최종 완료는 Guided-P3 V-PASS 필요 | 현재 세션 로컬 작업만 |
| **Direct-P1** | 일회성 CONSULT, source/metadata read. 트랙 B MCP read 또는 사람 셸 vsp CLI | 사람 세션(read profile 권고) | 분석 자체 review 불요. SAP 코드 완료 증거로 쓰려면 Guided run에 귀속 | 사람 관찰 하 대화형 호출 |
| **Direct-P2** | `GetTableContents`/`GetSqlQuery`, vsp `query` 1회 | 사람 세션 | **매 호출 사람 승인**. 범위·필드·row 상한을 호출 전에 표시 | batch/subagent/자동승인 금지 |
| **Direct-P3** | 사람의 **트랙 B MCP write / vsp CLI / abapGit** | 현재 사람의 DEV write 세션 | 허용하되 즉시 `PROVISIONAL_WRITE`. canonical read-back을 subject로 Guided-P3를 열어 R-PASS+V-PASS 전에는 완료/transport 불가 | 사람 present 1회 action만. subagent·자동 반복 금지 |
| **Direct-P4** | 지원 진입점 없음. package/request 생성·할당·release/import 전에 Guided-P4로 승격 | 사람 transport owner | §4.2 manifest와 exact 승인 없이는 시작 불가. 이미 임의 실행한 irreversible action은 Track A 증거로 소급 승인하지 않음 | 없음 |
| **Guided-P0** | run 계약, repo source 구현, local test/lint | 없음 | SAP 코드는 exact subject `R-PASS` 후 **REVIEWED_DRAFT**, completed 아님. non-SAP는 계약 test로 종결 | attended subagent 허용 |
| **Guided-P1** | CONSULT/where-used/source read. 트랙 B MCP 또는 사람 vsp CLI | **사람 세션(현재 유일)**. §6 (나)/(다) 채택 전에는 격리 read principal 부재 | read만이면 review 불요. code completion의 reviewer는 §6 경계 적용 | attended read만 |
| **Guided-P2** | MCP 두 도구 또는 vsp query | 사람 세션 | 호출별 승인 + 결과 최소화/민감정보 비커밋. reviewer가 직접 호출하지 않음 | 자동 반복·headless 금지 |
| **Guided-P3** | **트랙 B MCP write / 사람 vsp CLI / 사용자 abapGit** 모두 정당 | 사람 write 세션, DEV tier | 완료 전 `R-PASS + V-PASS`. 사전 review가 불가능한 MCP/abapGit 선반영은 `PROVISIONAL_WRITE`; review·수리·재검증 전 완료/transport 불가 | 사람 present. 에스코트는 이 칸의 실행 형태 |
| **Guided-P4** | DEV package/request 생성·조회, MCP/vsp/abapGit 할당, release 준비와 사람 release, 사람/Basis STMS import(§4.2) | 사람이 credential·target·request owner. attended worker는 승인된 DEV pre-release action만 | source `R-PASS+V-PASS`, exact package/request/object inventory, tier=DEV, release 직전 사람 재확인. import는 STMS 증거 | package/request 1회 생성·할당·조회만 bounded 자동화. release/import는 사람 전용 |
| **Engine-P0** | 씨앗/배치의 local 구현·lint | 없음 | new-style run 계약 필수. SAP 코드면 별도 review run `R-PASS` | bounded worker 허용, 사람 present |
| **Engine-P1** | worker의 vsp CLI read/ATC/health. **MCP 없음** | operator는 read principal만 지정하지만, (가)에서는 child의 파일+keychain 재획득이 미차단 | write 예정이면 reviewer run과 write run 분리 | contract 범위 내 bounded read |
| **Engine-P2** | 직접 실행 **금지** | — | Engine pause → Guided-P2 사람 호출 → 최소화한 artifact만 재입력 | 자동화 없음 |
| **Engine-P3** | worker의 vsp CLI deploy/copy/test/verify | operator가 **write run에만** DEV write principal을 주는 관례. 다른 attended child의 재획득은 미차단 | 사전 R-PASS receipt가 exact source와 일치해야 기동. V-PASS 후 완료. native `--review`는 증거 아님 | attended bounded 실행만 |
| **Engine-P4** | 사전 생성·승인된 DEV package/request에 worker가 `vsp deploy <file> <package> --transport <req>`로 할당하고 vsp read-back | operator가 write run에만 DEV principal을 주는 관례. 다른 attended child의 재획득은 미차단 | exact R-PASS, manifest의 package/request, 사람 `GetTransport` inventory와 V-PASS. G14 뒤 vsp inventory 형상이 충분할 때만 `vsp transport get`으로 대체. create/release/import는 이 칸 밖 Guided 사람 action | attended bounded assignment+verify만. request/package 생성·release·import 금지 |

위 credential owner 열은 operator의 **의도된 제공 관례**이지 O1=(가)의 기계 경계가
아니다. 환경변수 필터는 profile 파일·Credential Manager 재조회까지 막지 않으므로,
Guided/Engine의 build·review·write 어느 attended child에도 write credential이 없다고
사실 단언하지 않는다.

P2의 “호출별 승인”은 하네스별로 같은 효과를 내야 한다. Claude는 두 MCP tool을 자동
allowlist에서 제외해 매 호출 permission prompt를 받고 보호-table/SELECT-* 훅을 추가로
발화한다. Codex처럼 prompt가 fail-open으로 실증된 하네스는 두 tool을 기본 hard-disable하고,
사람이 **한 호출에 한해 enable → 호출 확인 → 즉시 disable 복원**한다. approval 설정만으로
통과했다고 보지 않는다. vsp `query`는 agent가 실행하지 않고 사용자가 터미널에서 명령을
직접 입력하는 행위 자체를 그 호출의 승인으로 삼는다.

### 4.1 경로 계약

| 경로 | 정당한 칸 | 정당하지 않은 칸 | Track A 완료 증거 |
|---|---|---|---|
| vsp CLI | 모든 구조의 P0/P1, Direct/Guided-P2의 사람 terminal 1회, Direct/Guided/Engine-P3, Guided/Engine-P4의 `deploy --transport` 할당. `transport list/get` 조회는 G14 실측·계약 등재 뒤에만 | Engine-P2, Direct-P4, vsp **MCP 모드** 전부(R-002), package/request 생성·release·CTS import(`vsp` 표면에 없음), transportable `copy`(`--transport` 없음), G14 전 `transport list/get`을 inventory 계약으로 사용 | 직접 `verify-sap.ps1` + source read; P4 inventory는 현재 Guided 사람 `GetTransport`, G14 뒤 충분한 형상일 때만 vsp로 대체 |
| 트랙 B MCP | Direct/Guided-P1/P2/P3, Guided-P4의 `CreatePackage`·`CreateTransport`·object `transport_request`·List/Get, 사람 전용 `ReleaseTransport` | Direct-P4, Engine child, unattended, reviewer의 모든 transport tool | 적용 후 vsp CLI로 동일 source·기계 chain 재확인; release 결과는 GetTransport로 재확인 |
| abapGit | Direct/Guided-P3의 사용자 action, Guided-P4의 **사람 주도 DEV pull/import와 package/request prompt** | Direct-P4, Engine child, reviewer, request release, QA/PRD ad-hoc pull, CTS/STMS import 대체 | DEV 반영 후 vsp source read/hash + activation/syntax/unit/ATC; request inventory 별도 확인 |
| 에스코트 | Guided-P3/P4 또는 Engine-P3/P4의 credential-owner action | 축 밖 독립 모드가 아님 | 에스코트 로그도 해당 run의 verification evidence에 귀속 |

### 4.2 P4 transport 실계약

#### 4.2.1 확인된 표면과 확인되지 않은 표면

- **vsp CLI [help만 실측, 2026-07-15, SAP 호출 없음]**: 고정 주 머신 바이너리
  `v2.38.1-91-g0b03ef2`의 help에서 `transport` 하위 명령 `list`와 `get`의 **존재만**
  확인했다. 두 명령은 `COMMANDS.md`의 정식 실측 범위 밖이라 실행하지 않았고 출력 형상은
  **미확인**이다(`adapters/vsp/COMMANDS.md:19`, `:429-433`). `vsp.lock.json`의
  `command_contract`에도 transport 조회는 미등재이며 `deploy <file> <package>
  [--transport]`만 있다(`adapters/vsp/vsp.lock.json:57-59`). 반면 `deploy` help의
  `--transport string`과 `copy`의 해당 플래그 부재는 확인됐다
  (`adapters/vsp/COMMANDS.md:313-317`). 따라서 현재 계약상 vsp는 **단일 파일 할당**에는
  정당하지만 request/object/task inventory 조회 계약은 아니다. G14에서 DEV read-only로
  1회 출력 형상을 실측하고 §11의 두 문서를 갱신한 뒤에만 조회 경로로 승격한다. 그 결과가
  inventory를 주지 않으면 Engine-P4는 조회를 중단하고 Guided 사람이 Track B
  `GetTransport`로 inventory를 확보한다. package/request create, release, CTS import는
  어느 경우에도 vsp 경로가 아니다.
- **트랙 B MCP [정적 실측]**: tool catalog에 `CreateTransport`·`ReleaseTransport`
  (`interactive/server/tool-catalog/sc4sap-mcp-tools-write.md:30`, `:100-102`)와
  `GetTransport`·`ListTransports`
  (`interactive/server/tool-catalog/sc4sap-mcp-tools-read.md:69`, `:100-107`)가 있다.
  `CreatePackage`는 transport layer/request/change recording을 입력으로 받으며
  (`engine/src/handlers/package/high/handleCreatePackage.ts:24-67`, `:145-161`), object
  write는 해당 tool schema가 노출할 때만 `transport_request`를 쓴다(예:
  `engine/src/handlers/program/high/handleUpdateProgram.ts:21-44`, `:139-145`). 모든 object
  type이 같은 필드를 가진다고 일반화하지 않는다.
- **MCP release [정적 실측, 라이브 미확인]**: `ReleaseTransport`는 task 또는 request
  하나를 받아 ADT release job을 제출하며 task를 parent request보다 먼저 release해야
  한다(`engine/src/handlers/transport/high/handleReleaseTransport.ts:27-50`,
  `:184-242`). 대상 SAP에서 endpoint가 없으면 HTTP 404/405를 tool error가 아닌
  `supported:false`로 반환한다. 그러므로 `isError=false`나 `success` 문구만으로 release
  완료를 선언하지 않고 `GetTransport` status를 다시 읽는다. 이 시스템에서 endpoint가
  실제 지원되는지는 **미확인**이다.
- **tier 방어 [정적 실측]**: Claude PreToolUse는 `Create/Update/Delete/Activate/Patch/
  Release/Write`를 QA/PRD에서 막고
  (`interactive/adapters/claude/hooks/tier-readonly-guard.mjs:20-32`, `:40-55`), MCP 서버는
  DEV 외 tier에서 read로 양성 분류되지 않은 도구를 fail-closed한다
  (`engine/src/lib/readonlyGuard.ts:1-25`, `:37-56`, `:101-116`). 반면
  `transport-validator.mjs`는 transport 누락을 **advisory**로만 알린다
  (`interactive/adapters/claude/hooks/transport-validator.mjs:4-17`, `:116-135`). request
  존재·정합은 §4.2.3의 manifest/조회 gate가 맡는다. DEV에서는 서버 guard가 즉시
  `null`을 반환하고(`engine/src/lib/readonlyGuard.ts:107`) PreToolUse도 “nothing
  blocked”이므로 DEV allow/pass는 **구조상 no-op인 control-path smoke**일 뿐 차단 게이트
  증거로 세지 않는다. 안전 게이트 증거는 동일 fixture의 unresolved/QA deny 팔이다.
- **abapGit [공식 문서 확인, 로컬 라이브 미실측]**: transportable package를 쓰면
  pull/uninstall 때 해당 request를 prompt하고, 설정에 따라 package를 만들 수 있다
  ([abapGit Packages & Transports](https://docs.abapgit.org/user-guide/reference/packages.html),
  2026-07-15 확인). 따라서 **사람이 화면에서 package 속성과 exact request를 확인하는
  Guided DEV 반영**만 허용한다. 이것은 CTS request release나 STMS import가 아니며,
  이 레포에서 abapGit transport 흐름을 라이브로 실행한 적은 없어 그 이상의 자동 선택·
  task 처리 세부는 **미확인**이다.

#### 4.2.2 행위별 소유권·경로

| 행위 | 실행 구조 × 주체 | 정당한 경로 | 자동화 계약 |
|---|---|---|---|
| package 속성 결정 | Guided-P4 × 사람 | Basis/소유자가 Z/Y 이름, super package, software component, transport layer, target을 승인 | 자동 선택 금지. “첫 transport layer” 추측 금지 |
| DEV package 생성 | Guided-P4 × attended worker 또는 사람 | 트랙 B `CreatePackage`; 사람 abapGit/ADT·SE80 UI. vsp는 부적합 | 승인 manifest의 exact 값으로 1회 가능. `record_changes=true`와 request가 schema에 명시된 경우만 전달 |
| request 생성 | Guided-P4 × attended worker 또는 사람 | 트랙 B `CreateTransport` 또는 사람 SE09/SE10 | exact type(workbench/customizing)·description·target·owner 승인 뒤 1회. vsp/abapGit에 request-create가 있다고 가정 금지 |
| request 선택·조회 | Guided-P4 × worker/사람; Engine-P4는 승인 manifest 소비 후 필요 시 사람에게 조회 handoff | 현재 계약은 사람/Guided `ListTransports`/`GetTransport`. `vsp transport list/get`은 G14 실측·§11 등재 뒤 출력이 충분할 때만 | `modifiable`, owner, target, task와 exact number를 manifest에 고정. “첫 modifiable request” 자동 선택 금지. vsp 형상이 inventory를 주지 않으면 Engine worker가 추측하지 않고 Guided 사람 `GetTransport`로 넘김 |
| DEV object 할당 | Guided-P4 × worker/사람; Engine-P4 × worker | MCP object tool의 확인된 `transport_request`; `vsp deploy ... --transport`; 사람 abapGit prompt | R-PASS 뒤 승인된 object allowlist에 bounded 실행. `vsp copy`는 플래그 부재로 금지 |
| task/request release | **Guided-P4 × 사람만** | exact 번호를 다시 확인한 Track B `ReleaseTransport` 1회씩 또는 SE09/SE10. task→parent 순서 | worker/reviewer/반복 자동화 금지. 매 번호에 즉시 사람 확인. `supported:false`는 BLOCKED, submitted 뒤 GetTransport read-back 필수 |
| QA/PRD import | **Guided-P4 × 사람/Basis만** | DEV에서 release된 CTS request를 target STMS queue로 import | agent·worker 자동화 0. target에서 vsp/MCP/abapGit ad-hoc write 금지 |
| 사후 증거 | Guided-P4 × 사람/worker(리뷰어 아님) | GetTransport/vsp read + STMS log | request/status/object inventory, target, import return code를 기록. 대상 read 권한이 없으면 `미확인`으로 남기고 성공 발명 금지 |

reviewer는 위 표의 어느 행도 수행하지 않는다. `ListTransports`/`GetTransport` 같은 read도
review subject와 transport owner를 한 역할에 섞기 때문에 금지한다. O1=(가)에서 이것은
새 기계 경계가 아니라 명시 규율이다. repo guard 외 SAP 쪽 상태는 reviewer와 모든
attended child에 대해 `sap_mutation_boundary=unverified`다.

#### 4.2.3 상태 전이와 release gate

```text
P4_PLANNED → REQUEST_READY → ASSIGNED → READY_FOR_RELEASE
                                             │ 사람 exact 승인(비가역)
                                             ▼
                                         RELEASED → IMPORTED
```

1. `P4_PLANNED`: tier=DEV, package/request fields, object allowlist, 적용 path, owner,
   target, rollback이 run manifest에 동결돼야 한다.
2. `REQUEST_READY`: package가 transportable 속성을 갖고 request/task가 modifiable이며
   exact number가 조회로 확인돼야 한다. 새 package 자체도 승인 request에 기록됐는지
   확인한다.
3. `ASSIGNED`: R-PASS exact source만 할당하고, Guided 사람의
   `GetTransport(include_objects=true, include_tasks=true)`에서 예상 object/task와 초과 0을
   확인한다. G14 실측 뒤 vsp 출력이 같은 inventory를 제공하고 command contract에
   등재된 경우에만 동등한 vsp 조회로 대체한다. 그렇지 않으면 Engine-P4가 추측하지 않고
   사람 조회로 handoff한다.
4. `READY_FOR_RELEASE`: DEV에서 source read match, check_syntax, activate, unit, ATC의
   §5 V-PASS와 inactive 0을 확보한다. request inventory에 승인 밖 object가 하나라도
   있거나 task status가 불명확하면 BLOCKED다.
5. release 직전 사람은 exact task/request 번호와 inventory hash를 보고 각 번호에 대해
   명시 승인한다. **release는 비가역**이므로 worker는 명령을 만들거나 호출하지 않는다.
   release 뒤 수정이 필요하면 같은 request를 되돌린다고 가정하지 않고 새 request를
   만든다.
6. `ReleaseTransport`의 “submitted”는 `RELEASED`가 아니다. 사람/owner가 GetTransport로
   task→request의 최종 released status를 확인해야 전이한다.
7. `IMPORTED`는 사람/Basis의 STMS import 결과와 target/return code 증거가 있을 때만 쓴다.
   QA/PRD에서 도구로 재생성·pull·activate해 import 실패를 덮지 않는다.

bounded 자동화 허용 범위는 DEV의 package/request **1회 생성**, 승인 source의 **할당**,
read-back **조회**까지다. release/import, target 선택, request 자동 선택, 초과 object 제거,
실패 후 다른 request로 자동 재시도는 사람 전용 또는 BLOCKED다. 에스코트는 이 전 과정의
credential owner 관찰이며 별도 실행 모드가 아니다.

#### 4.2.4 `$TMP` 파일럿에서 새로 생기는 것

기존 모든 파일럿은 `$TMP` local object여서 transport request가 불요였다. `phases/`에는
`transport_request` 사용 0건이고 vsp `--transport` 사용도 0건이다
(`adapters/vsp/SAFETY-PROFILES.md:163-172`). transportable package로 바뀌면 최소한 다음이
추가된다.

- 사람/Basis가 승인한 비-`$TMP` Z/Y package와 super package, software component,
  transport layer, change recording
- DEV workbench/customizing request의 type·owner·target·task와 exact number
- package 생성 자체와 모든 object write의 동일 request binding
- release 전 request/task/object inventory와 초과 0 증거
- task→parent request release 순서와 사람별 exact 승인
- QA/PRD STMS import owner·queue·return-code 증거

package 속성, target route, task 자동 생성 여부는 대상 시스템 설정에 의존한다. 실제 SAP
응답으로 확인되지 않은 값은 `미확인`이며 예시값을 계약값으로 승격하지 않는다.

#### 4.2.5 tier 경계

원본 wizard step 9에서 이식된 현재 절차는 먼저 `SAP_TIER`를 읽고 DEV만 설치를 계속하며,
QA/PRD는 모든 install을 거부하고 DEV CTS request→SE09 release→STMS import를 안내한다
(`interactive/core/procedures/install-sap-assets.md:1-6`, `:41-71`). 이를 P4 전체에 적용한다.

- package/request 생성·object 할당·release는 **DEV에서만** 수행한다.
- QA/PRD에서는 vsp/MCP/abapGit으로 create/update/activate/release/pull하지 않는다.
- QA/PRD 변화의 유일한 정당한 write는 사람/Basis가 표준 CTS/STMS로 수행하는 import다.
- R-003은 QA/PRD vsp write를 무조건 거부한다. Track B hook/server tier gate는 MCP write를
  거부하며, abapGit 사람 경로도 같은 정책을 우회하는 수단으로 쓰지 않는다.

## 5. SAP 코드의 리뷰·완료 계약

### 5.1 review subject와 receipt

SAP 코드 완료에는 run-scoped `review-verdict.json`이 필요하다. 기존 phase-only schema를
다음 subject에 맞게 개정한다.

```json
{
  "verdict": "PASS",
  "run_id": "<run-id>",
  "review_challenge": "<64-hex parent nonce>",
  "review_subject": {
    "base_head": "<40-hex>",
    "head": "<40-hex-or-null>",
    "diff_sha256": "<normalized git diff --binary sha256>",
    "source_files": {"src/example.prog.abap": "<sha256>"}
  },
  "reviewer_boundary": "practice-only",
  "findings": []
}
```

`reviewer_boundary`는 파이프 문자열이 아니라 한 값만 갖는 enum이며 허용값은
`practice-only`, `read-principal`, `os-isolated`, `authority-gate`다.

O1=(가)의 현재 receipt는 **항상 `practice-only`**다. 나머지 enum은 §6 재론 트리거 뒤
새 D-결정과 음성시험 증거가 생긴 경우에만 쓸 수 있다. 이 필드는 역사 사실 필드
`historical_rv4_classifier=open`이나 현재 상태 필드
`sap_mutation_boundary=unverified`(reviewer + all attended child)를 대신하지 않는다.

- checker는 verdict PASS, run_id, 현재 subject의 diff/source hash, MAJOR 0, reviewer가
  허용된 verdict 파일 외 repo를 쓰지 않았음을 **등식형**으로 검사한다.
- `review_challenge`는 구현 context가 종료되고 subject가 동결된 **뒤에 parent가 256-bit
  CSPRNG로 생성**해 review manifest에 byte-freeze한다. worker가 미리 만든 stale/forged
  PASS는 challenge를 알 수 없어 실패한다. reviewer는 값을 복사하고 checker는 manifest와
  exact match한다. Engine의 사후 feat commit SHA 예측불가 성질을 Guided에도 같은 계약으로
  옮긴 것이다.
- subject 정규화는 구현자가 고르지 않는다. path는 repo-relative `/` 형식·ordinal
  오름차순, `source_files` 값은 **파일 raw byte SHA-256**이다. `diff_sha256`은
  `git diff --binary --full-index --no-ext-diff <base_head> -- <정렬된 paths>`의 stdout
  raw byte SHA-256이며 별도 개행 정규화를 하지 않는다. untracked source는 diff에 없어도
  `source_files`와 exact dirty set으로 반드시 포착한다. JSON canonical hash가 필요하면
  UTF-8(no BOM)·key sort·공백 없는 separators를 쓴다.
- 어떤 source byte라도 바뀌면 receipt는 즉시 stale이다. 수정 후 fresh review가 필요하다.
- reviewer는 결함을 고치지 않는다. repo 쓰기 차단은 기존 RV3의 등식형 검사를 run 경로로
  옮겨 유지한다.
- P2 row data가 필요하면 owner가 호출별 승인으로 얻은 최소 artifact를 subject에 포함한다.
  reviewer가 row tool을 직접 호출하지 않는다.

### 5.2 Direct/Guided 종결

1. Direct의 SAP code local 결과는 `DRAFT`다. Direct-P3로 먼저 반영한 결과는
   `PROVISIONAL_WRITE`다. 어느 경우든 Guided-P0에서 R-PASS를 받아도
   `REVIEWED_DRAFT`일 뿐이다. “완료”, “배포 가능”, “검증됨”을 말하려면 Guided-P3로
   가서 exact subject의 R-PASS와 V-PASS를 모두 받아야 한다.
2. Guided-P3 적용 경로는 MCP/vsp/abapGit 중 아무거나 가능하다.
3. 가능하면 R-PASS 뒤 적용한다. 이미 SAP에 먼저 쓴 사람 주도 경로는 상태를
   `PROVISIONAL_WRITE`로 기록한다. 이것은 금지가 아니라 **완료 보류**다.
4. R-PASS 뒤 동일 byte를 적용하고 vsp CLI로 다음 `verification.json`을 만든다.

```text
source_read_match = PASS
check_syntax      = PASS          # SKIPPED 불가
activate          = PASS          # SKIPPED 불가
unit_test         = PASS | SKIPPED(reason)
atc               = PASS | SKIPPED(reason)
```

`source_read_match`는 raw file hash를 SAP 출력에 직접 대지 않는다. 양쪽을 UTF-8(BOM
허용)로 decode → CRLF/CR을 LF로 교체 → EOF의 연속 LF만 제거 → UTF-8(no BOM) SHA-256
순으로 canonicalize한다. 그 밖의 공백·대소문자·본문은 손대지 않는다. 과거 에스코트에서
실측된 EOF 개행 편차만 흡수하고 코드 차이를 숨기지 않는 규칙이다.

5. review 뒤 byte가 바뀌거나 SAP read-back이 다르면 R-PASS와 V-PASS를 모두 무효화한다.
6. 사람은 언제든 도구를 직접 쓸 수 있지만, receipt/checker를 통과하지 않은 작업은 Track A
   상태상 `BLOCKED`, `PROVISIONAL_WRITE`, `DRAFT` 중 하나이며 completed가 아니다.
7. P4는 completed P3 source를 §4.2 manifest에 바인딩한 뒤에만 시작한다. P4가 source를
   바꾸면 R-PASS와 V-PASS가 모두 stale이며 release gate는 다시 닫힌다.

이는 D-019의 1 worker + 1 fresh reviewer + 기계 검증과 syntax/activate SKIPPED 금지를
유지한다. 그러나 확정된 §6 (가)에 따라 **reviewer의 SAP mutation 금지는 규율 의존**이고
D-019의 “SAP reviewer 기계 격리”는 약화됐다. D-025가 이 trade-off를 봉인하며 현재
상태는 attended-only다.

### 5.3 Engine attended 종결 — N7 우회 금지

6de63ba의 post-run review는 `--review`를 주어야만 돌고, 돌아도 verdict를 소비하지 않는다.
따라서 다음 3-run 구조가 유일한 지원 경로다.

```text
build run (P0/P1, operator가 write principal을 주지 않음 — (가)에서는 관례이며
child의 파일+keychain 재획득은 미차단)
   → review run (P0/P1, fresh context, verdict own-verify)
   → write/verify run (P3, exact R-PASS receipt + DEV write credential)
```

- build와 review/write를 한 phase 공통 env에 넣지 않는다.
- review run의 **자기 verify**가 receipt를 검사해 exit≠0이면 write run preflight가 열리지
  않는다. native `--review`의 review.md는 참고자료일 뿐 R-PASS가 아니다.
- write run manifest는 reviewed subject hash를 prerequisite로 갖고, 시작 때 checker를
  다시 실행한다.
- Engine-P3는 vsp CLI만 쓴다. parent가 MCP/abapGit을 택하면 그 적용 action을 Guided-P3로
  분류하고 Engine은 P1/P3 verify만 맡는다.

## 6. reviewer·attended child SAP 경계 확정 — (가) 채택, RV4는 역사적으로 열림

현행 RV4는 리뷰 세션뿐 아니라 어떤 attended child도 같은 Windows 사용자로
`scripts/vsp-env.ps1`을 실행하면 profile과 Credential Manager를 해석할 수 있음을
뜻한다. 스크립트는 `$HOME` 아래 profile을 읽고
(`scripts/vsp-env.ps1:23-44`), Advapi32 `CredRead`로 password를 얻는다(`:51-121`).
authority-gate의 deploy map에는 vsp가 없다
(`6de63ba:skills/harness-init/templates/engine/.claude/hooks/authority-gate.py:306-328`). 과거 실측도 “deploy를 호출하지 않았다”는
관행일 뿐이라고 정직하게 기록했다(`SAFETY-PROFILES.md:200-215`).

| 안 | 기계 경계 | 장점 | 비용·한계 | 판정 |
|---|---|---|---|---|
| **(가) 현행 정직 기록** | 없음. 등식형 repo guard + 리뷰 관례 + 사람 에스코트 | 추가 작업 0, attended 운용 즉시 가능 | reviewer와 모든 attended child가 write credential을 얻을 수 있음. D-019 SAP 격리 약화. unattended 해제 불가 | **채택(D-025)** |
| **(나) 배포 불능 SAP principal** | reviewer가 얻을 수 있는 유일 principal의 SAP 권한이 read-only | 서버가 최종 차단, 1인 프로젝트에 비례 | 같은 OS에서 다른 write credential을 읽을 수 있으면 불성립. write secret은 review 종료 뒤 ephemeral 주입하거나 reviewer context에서 부재해야 함 | 후속 후보 |
| **(다) OS 계정/ACL·credential store 분리** | reviewer process token이 write profile/store를 읽지 못함 | vsp-env 우회까지 차단, child-store 음성시험 가능 | Windows 계정·홈·도구 설치 이중화, 운영비 최고 | 후속 후보 |
| **(라) upstream authority-gate에 vsp 인식** | `deploy=false`에서 vsp write verb를 hook deny | fake-vsp sentinel로 결정론 검증 가능 | alias/간접 script/MCP/abapGit은 별도. classifier 단독은 credential 경계가 아님 | 후속 방어심도 후보 |

사용자는 추천됐던 (나)를 기각하고 비용 0을 우선해 (가)를 택했다. 이는 “위험이 없음”이
아니라 **사람 참관 하 위험 수용**이다. 따라서 모든 지원 실행은 attended-only이고,
reviewer와 build/review/write child가 승인 밖 SAP mutation을 하지 않았다는 관례·에스코트
기록을 남기되 기계 차단 증거로 부르지 않는다.

후속 후보 재론 트리거는 다음처럼 고정한다.

- **(나)**: unattended를 다시 요구하거나, reviewer/attended child가 write
  profile/credential target을 읽은 near-miss·실행 1건이 관찰되거나, 에스코트 비용이
  연속 3회 병목으로 기록될 때.
- **(다)**: (나)를 택하려 해도 같은 OS account의 다른 write credential 부재를 음성시험으로
  증명하지 못하거나, child credential 관찰이 계속 RED일 때.
- **(라)**: upstream이 vsp classifier와 alias/간접-script test를 커밋 SHA로 제공하거나,
  fake-vsp sentinel RED를 줄일 방어심도가 필요할 때. (라) 단독은 unattended 해제 근거가
  아니다.

재론은 새 기계 경계를 실제로 만들고 음성시험을 통과시키는 별도 D-결정이어야 한다.
(가)의 비용 0 판단을 조용히 뒤집거나 receipt enum만 바꾸는 것으로 대체하지 않는다.

(라)를 택할 때 D-018과 migration 합격기준을 지키는 유일한 절차:

1. target의 `.claude/hooks/authority-gate.py`를 직접 고치지 않는다.
2. 상류 별도 레포에 vsp/vsp.exe와 실제 write verb(deploy/copy/source write/edit/execute/
   transport write)를 추가하고 test를 붙여 **커밋 SHA**를 만든다.
3. 그 SHA를 새 candidate로 삼아 §10 재작업 규칙을 전부 수행한다.
4. installer가 pristine old file을 refresh해야 `skipped_modified=[]`가 유지된다. target 직접
   패치는 다음 설치에서 `skipped_modified`가 되어 단계 3을 실패시킨다.

기록 필드는 둘로 분리한다.

- `historical_rv4_classifier = open` — 929685a/6de63ba에 vsp가 없다는 사실. 덮어쓰지 않음.
- `sap_mutation_boundary = unverified` — O1=(가)의 현재 고정값이며 범위는 reviewer와
  **모든 attended child**다. 새 경계를 만든 후 별도 D-결정과 role별 음성시험 증거가
  있어야만 `verified(<mechanism>, <evidence>)`로 바꿀 수 있다. 후자가 되어도 “RV4가
  원래 닫혀 있었다”고 쓰지 않는다(D-024).

## 7. unattended 봉인과 해제

### 7.1 현재 봉인 근거

- N6: 상류도 unattended의 보안 경계를 host flag가 아니라 외부 container/VM으로 둔다
  (`6de63ba:skills/harness-init/templates/engine/scripts/run_contract.py:224-241`).
- RV4: reviewer가 vsp write를 hook에서 통과할 수 있다.
- 같은 OS account는 Credential Manager write secret을 재획득할 수 있다.
- N7: 엔진 native review는 기본 off·비게이트다.
- P2 real-data extraction은 호출별 사람 승인이므로 unattended와 구조적으로 양립하지 않는다.

따라서 candidate migration이나 attended pilot 통과만으로 unattended가 자동 활성화되지
않는다. O1=(가)가 유지되는 동안 §7.2의 3·4번은 구조적으로 미충족이므로 현재 상태는
`attended-only / unattended=sealed`다.

### 7.2 해제 조건 — 전부 충족 + 사용자 새 결정

1. exact verified pin 아래 upstream 전체 test와 staging migration 게이트 통과.
2. 실제 container/VM에서 `supervision=unattended`, `sandbox.kind=container|vm`,
   `HARNESS_ISOLATED=1`을 **외부에서** 증명. host에서 env만 세팅한 것은 실패.
3. reviewer의 repo write 등식형 차단 + SAP mutation 경계가 §6 (나) 또는 (다)로 실증.
4. reviewer와 build/review/write child 전 역할이 write profile 파일·Credential Manager
   target을 읽지 못함을 secret 값을 출력하지 않는 음성시험으로 실증.
5. fake vsp sentinel이 reviewer contract의 write 명령에서 실행되지 않거나, 실행돼도
   deploy 불능 principal이 SAP server에서 전 write verb를 거부함을 실증. 전자는 hook
   경계, 후자는 principal 경계로 따로 기록.
6. N7 씨앗 FAIL receipt가 write sentinel/실 SAP write-run 기동을 막는 실발화 1회.
7. R-003 DEV-only, package/object allowlist, source read-back, D-019 verification matrix 통과.
8. P2는 해제 후에도 unattended 금지. P4의 release/import는 §4.2에 따라 영구 사람
   전용이고, package/request create나 assignment를 unattended로 넓히려면 U-gate 통과 뒤에도
   별도 사용자 D-결정이 필요하다.
9. 위 증거를 검토한 뒤 사용자가 `unattended=enabled`를 새 D-결정으로 명시.

하나라도 없으면 상태는 `sealed`다. 현재 채택된 (가) 또는 (라) 단독으로는 해제할 수 없다.

## 8. Legacy 처분과 기본 비활성 메커니즘

### 8.1 실측 사실

- 현 `.claude/settings.json:73-80`은 `session-start-context.py`를 SessionStart에 직접
  등록한다.
- 훅은 모든 `phases/*/index.json`의 pending을 읽고 정확히
  `python scripts/execute.py <phase>`를 안내한다(`.claude/hooks/session-start-context.py:55-81`).
- `3a-carrflt-seed`, `4a-glopen-seed`는 local index가 전 step pending이고
  `escort-write-deploy`를 갖는다(`phases/3a-carrflt-seed/index.json:4-22`,
  `phases/4a-glopen-seed/index.json:4-22`). 둘은 재실행 금지 씨앗이다.
- 후보 Engine은 run_id 없는 phase를 여전히 WARN 후 실행한다
  (`6de63ba:skills/harness-init/templates/engine/scripts/execute.py:1400-1418`). 문서 표기만으로는 비활성이 아니다.
- 후보 installer는 direct legacy hook basename을 제거한다
  (`6de63ba:skills/harness-init/templates/engine/install_engine.py:76-83`, `:267`)이고 새 hook template에는
  SessionStart가 없다. 현 hook 파일은 manifest hash와 일치하므로 target 직접 수정이
  필요 없다.

### 8.2 처분 계약

1. `phases/` 기존 byte는 전부 보존한다. index status를 “정리”해 역사를 고치지 않는다.
2. `adapters/final-harness/legacy-phase-policy.json`을 신설한다.

```json
{
  "schema_version": 1,
  "default": "deny",
  "phases": {
    "0-example": {"class": "example", "launch": "deny"},
    "1-workdays-util": {"class": "completed-history", "launch": "deny"},
    "2-duedate-reuse": {"class": "completed-history", "launch": "deny"},
    "3a-carrflt-seed": {"class": "sealed-seed", "launch": "deny"},
    "3b-carrflt-gated": {"class": "completed-history", "launch": "deny"},
    "4a-glopen-seed": {"class": "sealed-seed", "launch": "deny"},
    "4b-glopen-gated": {"class": "completed-history", "launch": "deny"}
  }
}
```

3. 프로젝트 소유 wrapper `scripts/run-track-a.ps1`을 유일한 지원 진입점으로 신설한다.
   - phase index에 `run_id`가 없으면 exit 64 + `LEGACY_PHASE_DENY`.
   - policy에 이름이 있고 `launch=deny`면 run_id가 잘못 추가돼도 거부.
   - new run은 contract/manifest hash, `mode=engine`, `supervision=attended`를 검사.
   - candidate pilot 기간에는 `-Candidate` 명시 + lock `candidate.state=staged`일 때만 허용.
     verified 승격 후 flag 없는 기본 경로는 `verified.commit`만 허용.
   - 검사 뒤에만 pinned installer-owned `scripts/execute.py`를 호출.
4. wrapper test는 3a/4a/0-example/임의 no-run_id를 모두 거부하고 new-style fixture만
   실행 sentinel에 도달해야 한다.
5. migration이 direct SessionStart hook을 제거하도록 두고, target의 engine-owned
   `session-start-context.py`나 `scripts/execute.py`를 수정하지 않는다. 이로써
   `skipped_modified=[]`와 “씨앗 실행” 알림 제거를 함께 만족한다.
6. AGENTS/CLAUDE/HANDOFF와 프로젝트 runbook은 raw `python scripts/execute.py`를
   안내하지 않고 wrapper만 안내한다. 상류 `harness-run` 소스는 D-018에 따라 수정하지
   않으며, 이 레포의 상위 지시가 wrapper preflight를 강제한다.
7. 역사 재현이 정말 필요하면 main worktree가 아니라 해당 과거 commit의 disposable clone에서
   사용자가 raw engine을 명시 실행한다. main 정책에는 `--allow-legacy` 탈출구를 두지 않는다.

raw engine 파일은 D-018 때문에 물리적으로 남아 있어 사용자가 의도적으로 직접 실행할 수
있다. 기본 비활성의 보증 범위는 **지원 진입점 fail-closed + UI 알림 제거 + 모든 프로젝트
지시의 wrapper 일원화**다. 이를 OS 보안 경계라고 과장하지 않는다.

## 9. 선택 pin 기준 F/N 불변식

### 9.1 F1~F7

| ID | 6de63ba 계약 | 트랙 A 소비 |
|---|---|---|
| F1 | Claude headless는 strict MCP, Codex는 열거된 named MCP disable. Codex 성공+빈 stdout과 Bridge는 예외 | Engine은 MCP를 SAP 경로로 쓰지 않음. Direct/Guided 사람 MCP는 허용 |
| F2 | Direct/Guided에서 router no-op, Engine에서만 Stop gate. no manifest WARN은 Engine 기동 1회 | Direct zero-footprint와 hook no-op 양 드라이버 실증 |
| F3 | audit `>=30/>=12KB`, Engine `>40 WARN`, `>16KB` hard fail | RULES 예산 문구 교정 |
| F4 | harness-tailor 산출 계약 유지. installer와 learning copy 주체는 분리 | installer가 RULES/LESSONS/PROTOCOL을 복사한다고 쓰지 않음 |
| F5 | repo 내 verify delegation만 감사. 외부 vsp binary는 밖 | vsp lock hash를 별도 검증 |
| F6 | TDD guard는 Engine edit에만, ABAP 미발화 | ABAP review/TDD는 project 계약이 담당 |
| F7 | dangerous-bash와 authority-gate 병렬. vsp 미인지 | RV4 open 기록, 사람 세션 write 금지 근거로 오용 금지 |

상세 예외와 코드 좌표는 보존 분석 `:14-113`을 재사용한다.

### 9.2 N1~N8

| ID | 불변식 | 필요한 project 조치 |
|---|---|---|
| N1 | normalized approval hash와 runtime byte freeze는 별개 | 둘 다 증거에 기록 |
| N2 | authority envelope는 run_id 있는 new-style run만 | wrapper가 no-run_id 기본 거부 |
| N3 | CLI child 권한은 parent가 동결한 authority JSON | credential 이름·network·deploy 범위 최소화 |
| N4 | fresh bridge lease가 있으면 malformed context fail-closed | Bridge는 attended만, write MCP 연결 worker 금지 |
| N5 | 실제 create/modify/delete/rename을 write_paths에 재대조·복구 | 범위밖 파일 gate 실증 |
| N6 | unattended 보안 경계는 외부 container/VM | §7 이전 sealed |
| N7 | native post-run review는 default off·비게이트 | §5 plan-level own-verify만 R-PASS |
| **N8** | `--allow-no-verify`는 legacy 전용, new-style run은 거부 | legacy 허용으로 오해 금지. wrapper는 legacy 자체를 거부 |

## 10. candidate/verified lock 스키마와 승격

현 lock의 단일 `verified_commit`(`adapters/final-harness.lock.json:1-11`)을 다음 v2
스키마로 교체한다. compatibility alias는 두지 않는다. 후속 소비자를 같은 변경에서 모두
고쳐 단일 정본을 유지한다.

```json
{
  "_comment": "D-018 final-harness lock v2; v1 evidence is preserved below",
  "schema_version": 2,
  "locked_at": "2026-07-11",
  "repo": {
    "remote": "https://github.com/hjaewon/claude-fable-final.git",
    "local_path_main": "D:\\claude-practice\\claude-fable-final",
    "local_path_secondary": "D:\\AI PROJECT\\claude-final"
  },
  "safety_state": {
    "historical_rv4_classifier": "open",
    "sap_mutation_boundary": "unverified",
    "sap_mutation_boundary_scope": ["reviewer", "attended-child:*"],
    "operation_mode": "attended-only",
    "unattended": "sealed"
  },
  "verified": {
    "commit": "8f7f13bc977bb686e62dd44651ce78c5250e2e8a",
    "version": "v0.17.3",
    "verified_at": "2026-07-11",
    "evidence": {
      "kind": "legacy-v1-lock",
      "source_lock": {
        "path": "adapters/final-harness.lock.json",
        "repo_commit": "87f908733ee47db2d7c5f161e9f035b851eefce3",
        "sha256": "4bd7c04022b5422287d4ff74e76e9949e01877d83674bffd50454dc768fa6ddf"
      }
    },
    "note": "레포에 git 태그 없음 — lock 앵커는 커밋 sha. F1~F7 근거 행 번호는 cf42b64 기준 실측이며, cf42b64→8f7f13b 델타는 직접 판독으로 전량 유지 재확인(2026-07-11): execute.py codex MCP 형상 fail-closed 강화(F1 안전 방향)+finalize 배너 위치 수리(F 무관), 그 외 F 표면 무접촉.",
    "plugin": {
      "marketplace": "final-harness-marketplace",
      "name": "final-harness",
      "installed": "scope local, D:\\AI PROJECT\\sap-agentic-harness, 2026-07-11 (보조 머신)"
    },
    "invariants_f1_f7": {
      "verified_at": "2026-07-11",
      "verdict": "F1~F7 전량 유지 — 설계 영향 변경 0건 (v0.12.1 실측 대비)",
      "F1": "유지 — 무인 step --strict-mcp-config (execute.py:2332-2333), codex는 서버 열거 후 enabled=false + 열거 실패 시 fail-closed 기동 거부 (execute.py:2747-2786)",
      "F2": "유지 — 매니페스트 미감지 시 Stop 게이트 no-op (stop-quality-gate.py:14-24) + 기동 1회 WARN (execute.py:737-739)",
      "F3": "유지 — RULES 예산 30/40개·12KB/16KB 수치 불변 (execute.py:1899-1900; v0.16.2가 '40개=WARN, 16KB=기동 거부'로 문구만 정정)",
      "F4": "유지 — harness-tailor: quality-gate.json 생성 + VERIFY-PATTERNS.md 기록 + rule seed + Stop 훅 300초 예산 경고 (skills/harness-tailor/SKILL.md)",
      "F5": "유지 — verify 위임 타겟 감사는 리포 내 타겟만, vsp 등 외부 바이너리는 범위 밖 (execute.py:601-695)",
      "F6": "유지 — tdd-guard LANG_RULES 하드코딩 JS/TS·Python·Go·ipynb, ABAP 미발화 (tdd-guard.py:99-105)",
      "F7": "유지 — block-dangerous-bash는 고정 파괴 패턴 denylist뿐, vsp 미인지 (block-dangerous-bash.py:37-60)",
      "skills": "10종 실측 (v0.12.1의 8종 + harness-design v0.14.0 + harness-run v0.17.1 — harness-init·harness-tailor 무변경)"
    }
  },
  "candidate": {
    "commit": "6de63bac860723ff1bfd50a940a75e46c6e87d99",
    "version": "v0.19.3",
    "state": "selected",
    "selected_at": "2026-07-15",
    "prior_analysis": {
      "commit": "929685acc430a2140a7e77508db35bc66badaa82",
      "artifact": "docs/reference/designs/2026-07-14-v019-engine-analysis.md"
    },
    "delta_checked": {
      "from": "929685acc430a2140a7e77508db35bc66badaa82",
      "to": "6de63bac860723ff1bfd50a940a75e46c6e87d99",
      "checked_at": "2026-07-15"
    },
    "source_ref_observed": "HEAD=origin/master",
    "source_worktree_clean": false,
    "source_worktree_note": "20 modified files; uncommitted 0.19.4 excluded",
    "plugin": null,
    "invariants_f1_f7": null,
    "gate_evidence": null
  },
  "history": []
}
```

v1→v2 변환기는 `source_lock`의 path·repo commit·SHA-256을 먼저 검증하고, 현 lock의
`note`·`plugin`·`invariants_f1_f7` 객체를 **재귀적으로 exact 복사**한다. 위 예시는 현
v1 문자열 전문을 포함한다. 필드 누락·내용 차이·`version`의 `v` 접두 손실은 schema
변환 실패다.
candidate의 두 증거 필드는 selected 상태에서는 null일 수 있지만 PROMOTE 전에는 exact
candidate SHA에 대해 새로 채워야 하며 verified의 기존 값을 상속할 수 없다.

상태 전이:

```text
candidate.selected ──→ candidate.staged ──→ [PROMOTE]
        │                     │                   └─→ verified=new, candidate=null,
        │                     │                       history+=superseded(old verified)
        └─→ [REJECT] ←────────┘
                 └─→ candidate=null, history+=rejected(candidate)
```

- `candidate.state`의 허용 enum은 `selected | staged`뿐이다. `PROMOTE`와 `REJECT`는
  저장 상태가 아니라 원자적 전이 event다.
- `selected`: delta만 확인. 설치·완료 주장 금지.
- `staged`: clean detached candidate에서 upstream tests + disposable migration gate 통과.
  `-Candidate` attended pilot만 허용.
- `PROMOTE`: §12의 attended rebase gate와 파일럿 2건 전부 통과했을 때만 허용하는 원자적
  event다. `candidate.gate_evidence`가 G1~G14·파일럿 A/B·P4 T1~T5 각각의
  `status=PASS`, 증거 경로, 증거 SHA-256, exact candidate commit을 모두 갖지 않으면
  거부한다. 기존 `verified`
  snapshot을 `history`의 `outcome=superseded` 항목으로 이동하고 아래 필드 매핑으로 새
  `verified`를 만든 뒤 `candidate=null`로 비운다. 따라서 durable
  `candidate.state=verified`는 존재하지 않는다.

```json
{
  "commit": "candidate.commit",
  "version": "candidate.version",
  "verified_at": "PROMOTE event UTC timestamp",
  "evidence": "candidate.gate_evidence",
  "plugin": "candidate.plugin",
  "invariants_f1_f7": "candidate.invariants_f1_f7",
  "provenance": {
    "selected_at": "candidate.selected_at",
    "prior_analysis": "candidate.prior_analysis",
    "delta_checked": "candidate.delta_checked",
    "selection_source": {
      "ref": "candidate.source_ref_observed",
      "worktree_clean": "candidate.source_worktree_clean",
      "note": "candidate.source_worktree_note"
    }
  }
}
```

위 문자열은 필드 매핑 표기이며 실제 기록에는 우변의 candidate 값과 event timestamp를
넣는다. candidate 전용 `state`와 `gate_evidence` 필드명 자체는 verified에 복사하지 않는다.
PROMOTE와 REJECT는 top-level `safety_state`를 **exact 보존**한다. 이 블록은 O1의 기계적
carrier이며 별도 “run summary”를 요구하지 않는다. 값을 바꾸려면 §7 U-gate와 별도
D-결정에 결박된 safety-state 전이 event가 필요하다.
- `REJECT`: `selected` 또는 `staged` 어느 상태에서도 가능하다. 실패 SHA·직전 상태·증거를
  `history`의 `outcome=rejected` 항목에 남기고 `candidate=null`로 비우며 실행을 금지한다.

`history` 항목은 두 형태만 허용한다. `superseded`는 이전 verified snapshot에
`replacement_commit`, `decided_at`, `evidence`를 붙이고, `rejected`는 candidate snapshot에
`from_state`, `decided_at`, `evidence`를 붙인다. 이전 verified snapshot에는
`note`·`plugin`·`invariants_f1_f7`·원 source-lock hash까지 그대로 포함한다. 필수 필드가
없으면 lock schema 검증은 실패한다.

최종 SHA가 candidate와 한 글자라도 달라지면:

1. 기존 candidate evidence를 새 SHA에 상속하지 않는다.
2. old candidate→new candidate diff를 분류하고 F/N 좌표를 갱신한다.
3. upstream 전체 test, installer migration, 훅 구조+실발화, 양 driver Direct diff 0,
   N7/RV4/credential 음성시험, Guided/Engine 파일럿, P4 T1~T5를 **전부 재실행**한다.
4. 문서-only commit이어도 exact tree가 달라졌으므로 최소 full test와 migration/pilot 증거
   재바인딩을 생략하지 않는다.

## 11. 문서·코드 연쇄 변경 — 문서별 집행 계약

| 대상 | 후속 변경 내용 |
|---|---|
| `AGENTS.md` | Direct 기본, Guided 명시 승격, Engine attended, Policy 직교 라우팅으로 전면 교체. raw execute 금지·wrapper 진입, Direct SAP code=DRAFT, P2 호출별 승인 명시 |
| `CLAUDE.md` | “무인 하네스 미착수/유일 SAP 접점”을 본 문서 §0 의미로 교정. 사람 MCP/abapGit write 허용, Engine backend와 completion evidence=vsp 구분 |
| `docs/PRD.md` | 트랙 A를 3구조×5프로필로 요약. D-019 완료 matrix, reviewer/unattended만 차단, P2 호출 승인 포인터 |
| `docs/ARCHITECTURE.md` | lock v2 schema, wrapper, legacy policy/catalog, run-scoped review evidence 파일 지도. verified/candidate를 한 값처럼 쓰지 않음 |
| `DESIGN.md` §2 | final-harness/vsp 분리(D-018) 유지, 사람 path 다원성·증거 backend 구분 |
| `DESIGN.md` §3 | MCP 불가 근거를 **Engine headless 한정**으로 정밀화. Direct/Guided MCP·abapGit 허용 |
| `DESIGN.md` §5·§15-F | 본 문서 F/N 표로 교체. 6de63ba 좌표, N7 default-off, N8, retired 표면 반영 |
| `DESIGN.md` §8 | 구 Offline/Read/Gated 1축을 3×5 매핑 포인터로 교체. 에스코트를 Guided/Engine-P3/P4 안에 배치 |
| `DESIGN.md` §13 | 재기준 단계를 Phase 5 신판으로 기록. unattended는 완료가 아니라 sealed. 파일럿·gate 완료 기준 연결 |
| `DESIGN.md` §16 | lock v2 후보→승격, wrapper, clean detached test, staging install 순서로 교체 |
| `docs/DECISIONS.md` | D-025는 O1=(가)·O2=P4 실계약·O3=MCP 파일럿과 trade-off를 append-only 봉인. D-001/D-023 문구는 삭제하지 않고 “mutation path vs evidence backend” 정정 추가 |
| `HANDOFF.md` | 헤더 재개점을 본 설계 확정·D-025·6de63ba candidate(v0.19.3 blob)·dirty 0.19.4 제외·O1 attended-only·P4 계약·다음 단계로 갱신. 같은 헤더의 2026-07-13 “무인 전환 가능” 항목은 historical 판정으로 supersede하고 현재 `unattended=sealed`를 병기. 본문 §1의 “vsp-custom=유일한 SAP 접점”은 “Engine 실행 백엔드·적용 경로와 독립인 완료 증거 백엔드”로 교정(적용 완료 2026-07-15). **잔여**: §1 “관련 레포 상태” 표의 vsp-custom 행(`HANDOFF.md:219`)에 같은 “트랙 A의 유일한 SAP 접점” 문구가 남아 있다 — 단계 4에서 동일 문안으로 교정한다(`CLAUDE.md:9`·`DESIGN.md:74`의 같은 문구와 한 묶음) |
| `.harness/PROTOCOL.md` | singleton task loop를 legacy로 표시. Direct에는 미발화, Guided는 run-scoped goal/state/review, Engine은 contract/manifest를 소비. “여러 step=unattended” 제거 |
| `.harness/GOAL.md`·`STATE.md` | migration 시 historical singleton으로 동결. 새 작업이 쓰지 않음. 삭제·과거 내용 재작성 금지 |
| `.harness/RULES.md` | 현 40개 WARN/16KB 기동 거부 문구는 유지. F3의 proactive audit 임계 `>=30 rules`/`>=12KB`를 hard gate와 구분해 기록하고 기존 규칙의 의미는 바꾸지 않음 |
| `2026-07-13-unattended-review-gate.md` | 본문은 역사 증거로 유지하고 헤더에 v0.17 legacy·본 문서 대체 포인터만 추가 |
| `review-step.md` | “무인 phase”를 run-scoped reviewer role로 교체. P0/P1만이되 transport read도 금지, P2/P3/P4 금지, 새 subject schema, `practice-only` 경계, SAP write 금지·고치지 않음 유지 |
| `review-gate-plan-conventions.md` | run_id/contract/manifest 필수, build→review→write run 분리, native `--review` 비게이트, run receipt own-verify, stale subject 재리뷰 규칙 |
| `review-verdict.schema.json` | §5 schema로 개정. run_id·diff/source hashes·boundary 필수. 기존 phase-only schema는 legacy catalog로 연결 |
| `scripts/check-review-verdict.ps1` + test | `-RunId` 소비, exact subject 재계산, exact dirty set, boundary field 검사. legacy `-Phase`는 과거 test에만 두고 wrapper 신규 run에서는 거부 |
| `adapters/vsp/VERIFY-PATTERNS.md` | “호출자는 무조건 vsp-env dot-source”를 owner/role별로 분리. reviewer child는 write profile 금지, 적용 path와 vsp evidence path 구분, V-PASS matrix 추가 |
| `adapters/vsp/COMMANDS.md` | G14 전에는 `transport list/get`을 help 존재·출력 형상 미확인·정식 실측 범위 밖으로 유지. 향후 DEV read-only 1회 실측 뒤 exact 명령·exit·출력의 request/object/task 필드를 기록하고 inventory 불충분 여부를 판정 |
| `adapters/vsp/vsp.lock.json` | G14 실측이 충분한 출력 형상을 확인한 경우에만 `transport list/get`을 `command_contract`에 증거 좌표와 함께 추가. 불충분하면 미등재 유지하고 Engine-P4 inventory를 Guided 사람 `GetTransport` handoff로 고정 |
| `SAFETY-PROFILES.md` §① | 문서 축을 mode별 allowlist에서 role+P0~P4 Policy로 바꾸고 RV4 역사 보존 |
| 동 §② | P0~P4 command/effect allowlist와 MCP/vsp/abapGit 경로 표. 사람 write 금지 문구 제거 |
| 동 §③ | reviewer를 독립 role로 정의, P0/P1만 허용하되 모든 transport 동작 금지. §6 (가)·`practice-only` receipt 연결 |
| 동 §④ | credential owner·read/write principal·store 접근을 분리. `permissions.secrets` 정확 필드명 사용 |
| 동 §⑤ | spec/package allowlist 유지, P3 completion gate와 §4.2 P4 package/request/assign/release/import 책임·state machine 추가 |
| 동 §⑥ | 과거 V/RV 표는 historical. 신규 hook sentinel·child store·O1 RED 정직 기록·P2 approval·P4 tier/release-owner test 추가 |
| 동 §⑦ | “무인 전환 가능” 폐기. 에스코트를 P3/P4 실행 형태로 재정의하고 §7 해제 조건 포인터 |
| 동 §⑧ | classifier·store·wrapper bypass·MCP release 지원 미확인·abapGit 라이브 미실측·unattended sealed를 정직 기록 |
| `adapters/final-harness.lock.json` | §10 schema v2. verified 8f7f13b 유지 + candidate 6de63ba 동시 기록. top-level `safety_state`와 pre-v2 `plugin`·`invariants_f1_f7`·source-lock path/commit/SHA-256를 보존 |
| `adapters/final-harness/legacy-phase-policy.json` | §8 기계 deny 목록 신설 |
| `docs/reference/LEGACY-CATALOG.md` | 각 기존 phase의 역사 상태·branch 증거·top/local index 불일치·재실행 금지 이유 기록 |
| `scripts/run-track-a.ps1` + test | §8 supported entry와 `LEGACY_PHASE_DENY` 구현. engine-owned execute 수정 금지 |
| `.claude/settings.json`·engine manifest | 후보 installer로만 갱신. 트랙 B 3 hook exact 보존, direct SessionStart 제거, summary 배열 봉인 |
| `packs/modules/README.md`, `packs/modules/fi/*` | “무인 step 주입”을 “matching Engine run의 scoped RULES 주입”으로 교정. CONSULT는 사람 Direct/Guided 소유 유지 |
| `domain/abap/CHECKLIST.md`, `RULES.seed.md` | “무인 worker”를 mode-neutral worker/Engine worker로 정밀화; Direct/Guided에도 같은 도메인 규칙 적용 |
| `phases/**` | **변경 0**. migration 전후 byte hash 동일 |
| `interactive/**` | **소스 변경 0**. 공유 settings의 hook 보존만 외부에서 검증 |

`docs/ADR.md`는 만들지 않는다(D-020). 결정 기록은 `docs/DECISIONS.md` append-only다.

## 12. 파일럿과 기술 게이트

### 12.1 attended rebase/verified lock 게이트

| ID | 시험 | 합격 기준 |
|---|---|---|
| G1 | candidate identity | clean detached checkout HEAD=6de63ba, plugin blob=0.19.3. dirty 0.19.4 미혼입 |
| G2 | upstream 전체 test | Windows Python 3.9·3.12 각각 `tests` + `skills/harness-init/templates/engine` 전량 exit 0. 제품 test는 target이 아니라 pinned upstream에서 실행 |
| G3 | disposable migration | `skipped_modified=[]`, `skipped_user_owned=[]`, `removed_obsolete` 정확 `{scripts/test_execute.py,scripts/test_hooks.py}`, `data_created` 정확 `{.harness/runs/example-engine/contract.md,.harness/runs/example-engine/manifest.json}`, phases byte diff 0, interactive diff 0 |
| G4 | 트랙 B hook 구조 | settings의 3 matcher+command 문자열이 migration 전후 exact equal. JSON byte equality는 요구하지 않음 |
| G5 | 트랙 B hook 실발화 | fixture stdin으로 (a) forbidden table=`deny`, (b) unresolved/QA mutation=`deny`, (c) GetSqlQuery `SELECT *`=`ask`를 각각 실제 process에서 관측. SAP 호출은 하지 않음 |
| G6 | Direct no-op 양 driver | Claude/Codex 각각 no-lease Direct task 전후 tracked+untracked tree hash/diff 0, `.harness/runs` 생성 0, router side effect 0 |
| G7 | Guided footprint | Guided 시작 전후 diff가 승인된 `.harness/runs/<id>/`만. 종료 시 R-PASS/V-PASS schema 검증 |
| G8 | N7 음성시험 | native `--review` 미지정 시 review 없음, 지정한 review verdict는 phase gate가 아님을 확인. 별도 plan-level FAIL receipt는 fake write sentinel·실 write run 둘 다 미도달 |
| G9 | RV4 fake-vsp 관찰 | reviewer `deploy=false` context에서 PATH 선두 fake vsp가 sentinel을 쓰는지와 hook deny JSON을 함께 기록. 6de63ba 무패치 예상은 **sentinel 생성=security RED**. 이를 “PASS”라 부르지 않고 lock에 `historical_rv4_classifier=open` 기록 |
| G10 | 모든 attended child credential 관찰 | reviewer와 build/review/write worker child 각각이 write profile 파일·Credential Manager target을 읽을 수 있는지 role별 boolean만 기록(시크릿 값 출력 금지). 어느 하나라도 성공하면 **security RED**, `sap_mutation_boundary=unverified`·attended-only 유지 |
| G11 | legacy default deny | wrapper가 0-example·3a·4a·모든 no-run_id를 exit 64 `LEGACY_PHASE_DENY`; SessionStart 출력에 raw execute 안내 0건 |
| G12 | source/evidence parity | MCP/vsp/abapGit 중 파일럿 적용 경로와 무관하게 §5.2 canonical vsp source read hash가 reviewed source의 canonical hash와 동일, D-019 matrix 통과 |
| G13 | 불변 안전 Policy | QA/PRD vsp write deny(R-003) + MCP Create/Update/Release deny + abapGit ad-hoc write 금지, tracked secret/접속정보 0(R-005), `GetTableContents`·`GetSqlQuery`가 모든 사람 세션에서 매 호출 승인되고 자동/batch 호출이 거부됨. QA/PRD 변화는 사람/Basis STMS import만 |
| G14 | P4 표면·역할·read-only 실측 | 오프라인에서 pinned vsp help의 `transport=list/get`, `deploy --transport`, `copy` transport flag 없음과 Track B registry의 Create/List/Get/Release 및 object별 `transport_request`를 확인한다. 별도 자격증명 세션에서 **DEV read-only 1회** `vsp transport list`와 exact request 대상 `get`을 실행해 exit·출력 형상·request/object/task inventory 제공 여부를 기록한 뒤 §11의 `COMMANDS.md`/`vsp.lock.json`을 갱신한다. 현재는 미실행·미확인이다. inventory가 불충분하면 Engine-P4 조회는 Guided 사람 `GetTransport` handoff로 고정한다. same-payload unresolved/QA fixture가 CreatePackage/CreateTransport/ReleaseTransport를 deny하고 reviewer profile/run transport verb/tool은 0건이어야 한다. 실제 release/import 0건 |

G9/G10은 시험 절차가 명료하게 결과를 가르는지가 rebase gate다. O1=(가)의 예상 결과는
RED이며, 정직 기록하면 **attended-only candidate**는 verified로 승격할 수 있다. lock의
top-level `safety_state`에는 `historical_rv4_classifier=open`,
`sap_mutation_boundary=unverified`, scope=`reviewer + all attended child`를 exact
기록한다. 정의되지 않은 별도 run summary carrier는 요구하지 않는다. RED를 GREEN으로
부르는 것, RV4 closed를 쓰는 것, unattended를 여는 것은 실패다.

### 12.2 파일럿 2건

**파일럿 A — Guided-P3 사람 주도 실작업 1건**

1. run contract와 source subject 동결.
2. fresh review R-PASS.
3. 적용 path는 **트랙 B MCP write로 고정**한다. `$TMP` DEV object 1건에 대해 대상 tool
   schema를 먼저 확인하고 local package라 `transport_request`는 **생략**한다. 일부
   handler의 생략 기본값이 소문자 `"local"`인 것은 로컬 소스/README에서 확인됐지만
   대상 object tool의 정확한 schema/default는 현재 **미확인**이므로 파일럿 직전에
   확인한다. 대문자 `LOCAL`을 계약값으로 보내지 않으며 P4 release와 섞지 않는다.
4. 같은 tool/input이 PreToolUse·transport-validator·서버 guard 경로를 통과하는지는
   control-path smoke로만 기록한다. DEV allow/server pass는 구조상 no-op이므로 게이트
   증거로 세지 않는다. 동일 fixture를 unresolved/QA로 바꿔 SAP에 보내지 않고 deny되는
   팔만 tier 차단 증거로 인정한다.
5. MCP의 success 응답은 완료 증거가 아니다. **어느 경로로 적용했든 완료 도장은 vsp CLI
   source read·syntax/activation·unit/ATC 증거로만** 찍고 D-019 V-PASS를 만든다.
6. run-scoped 파일 외 repo drift 0, tracked secret 0.
7. abapGit은 후속 대안이다. MCP가 대상 object type의 write/`transport_request`를 노출하지
   않거나, hook+tier 동시 관찰이 재현 불가한 경우에만 사용자 새 결정 후 파일럿 A를
   abapGit으로 처음부터 다시 수행한다. 단 vsp V-PASS는 바뀌지 않는다.

**파일럿 B — Engine attended-P3 4b급 1건**

1. new-style build run(P0/P1) → review run → write run 분리. 앞 두 run에 write principal을
   주지 않는 것은 O1=(가)에서 관례이며 child 재획득은 미차단임을 기록.
2. review FAIL seed 변형에서 write sentinel 미도달.
3. 정상 변형에서 exact R-PASS를 consume해 vsp CLI write.
4. deploy/activate → source drift → ATC → unit chain.
5. 사람 operator가 전 과정 present, unattended flag 없음.

### 12.3 P4 lifecycle gate

P4를 지원한다고 증명하기 위해 release를 억지로 만들어 내지는 않는다. rebase lock 승격은
실제 DEV transportable object 1건을 **`READY_FOR_RELEASE`까지** 가져가는 T1~T5를 요구한다.
비가역 T6와 운영 T7은 실제 전달 목표가 있는 run에서만 실행하며, 그 run에서는 생략할 수
없다.

| ID | 주체·시험 | 합격 기준 |
|---|---|---|
| T1 | Guided 사람 manifest 승인 | DEV alias/tier, package 속성, request type/owner/target, object allowlist, 적용 path, release/import owner exact 동결 |
| T2 | Guided worker/사람 package·request 준비 | 승인된 기존 값 소비 또는 MCP 1회 생성. 사람 `ListTransports`/`GetTransport`에서 modifiable request/task 확인. G14 뒤 충분한 vsp 형상만 대체 가능. reviewer transport call 0 |
| T3 | Guided 또는 Engine worker 할당 | exact R-PASS source를 MCP `transport_request`, vsp `deploy --transport`, 또는 사람 abapGit 중 manifest path 하나로만 할당. vsp `copy` 금지 |
| T4 | 사람/worker inventory·기계 검증 | 사람 `GetTransport` 또는 G14 뒤 계약 등재된 동등 vsp 조회로 request의 package/object/task가 allowlist와 exact, 초과 0. vsp source read·syntax/activate·unit/ATC V-PASS, inactive 0. vsp 형상이 불충분하면 Engine worker는 사람 조회로 handoff |
| T5 | 사람 release-readiness 판정 | inventory hash와 evidence를 묶어 `READY_FOR_RELEASE`. release command/sentinel 미도달, request는 modifiable 유지 |
| T6 | 실제 전달 run의 사람 release | task→parent exact 번호별 즉시 승인. `supported:false`는 BLOCKED, submitted 뒤 GetTransport status=released 확인. worker/reviewer call 0 |
| T7 | 실제 전달 run의 사람/Basis import | STMS target queue·request·return code 증거. QA/PRD ad-hoc tool write 0; 실패를 수동 activate/pull로 덮지 않음 |

T1~T5만으로 rebase의 **P4 계약 게이트**는 통과하지만 실제 request를 `RELEASED` 또는
`IMPORTED`라고 쓰지 않는다. 실제 전달 완료를 주장하려면 같은 run의 T6/T7까지 PASS여야
한다.

### 12.4 unattended unlock gate

§7 조건을 별도 U-gate로 반복 실행한다. 특히 G9/G10의 RED가 각각 **hook/principal
deny**와 reviewer·build/review/write child 전 역할의 **write credential store 접근
실패**로 바뀌어야 한다. attended verified lock과 unattended enablement를 같은 상태
비트로 합치지 않는다.

## 13. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 상류가 0.19.4를 곧 커밋 | candidate 즉시 구버전처럼 보임 | exact 6de63ba로 staging 완료. 새 SHA 채택 시 §10 전량 재작업 |
| upstream working tree dirty | “현재 버전”과 SHA blob 혼동 | lock에 dirty fact·20파일·0.19.4 제외를 기록. clean detached만 test |
| reviewer/attended child가 다른 profile명을 찾아 write secret 획득 | 채택 (가)에서 실제 mutation 가능 | role별 G10 RED와 `sap_mutation_boundary=unverified`를 숨기지 않고 사람 에스코트. near-miss/실행 1건이면 §6 (나) 재론 |
| authority classifier alias/간접 script 우회 | (라) 단독 경계 불충분 | principal/store 경계와 병행. fake direct+wrapper 명령 변형 test |
| 사람 MCP/abapGit write가 review보다 먼저 발생 | SAP에 provisional 흔적 | DEV only, `PROVISIONAL_WRITE`, 완료·transport 보류, review 후 vsp 재검증 |
| wrapper raw-engine 우회 | legacy가 물리적으로 실행 가능 | 지원 경로·알림·문서를 wrapper로 일원화. raw 실행은 사용자 명시 역사 재현만; 보안 경계로 과장 금지 |
| MCP release endpoint가 대상 SAP에 없음 | `isError=false/supported=false`를 성공 오판 | BLOCKED로 판정하고 사람 SE09/SE10으로만 전환. GetTransport 최종 status 필수 |
| release 후 오류·초과 object 발견 | 비가역 request를 되돌릴 수 없음 | release 전 T4/T5 exact inventory. release 뒤 수정은 새 request; 자동 rollback 금지 |
| abapGit이 예상과 다른 request/package prompt | 잘못된 CTS 귀속 | 사람 Guided 화면 확인만 허용, 자동화 금지. 라이브 미실측 유지, 불일치 시 해당 path BLOCKED |
| settings JSON 재직렬화 | 트랙 B 훅 조용한 drift | matcher+command exact baseline + 훅 3개 실발화, byte equality는 요구하지 않음 |
| vsp verify가 적용 path 차이를 놓침 | MCP/abapGit 반영과 repo 불일치 | source read hash를 review subject에 bind, 변경 시 review·verify 전부 무효 |

## 14. 확정된 결정 + 재론 트리거

아래 트리거가 실제로 발생하기 전에는 O1/O2/O3를 다시 택일하지 않는다. 발생하면 기존
D-025를 수정하지 않고 새 D-결정으로 계약을 바꾼다.

| 결정 | 사용자 확정·이유 | 보존된 후속 후보 | 재론 트리거 |
|---|---|---|---|
| **O1 reviewer 경계** | **(가) 현행 정직 기록**. 사용자는 추천 (나)를 기각하고 비용 0을 우선했다. 등식형 repo guard + 관례 + 사람 에스코트만 사용. 대가=D-019 SAP reviewer 기계 격리 약화, attended-only, `historical_rv4_classifier=open`, `sap_mutation_boundary=unverified`(reviewer + all attended child) | (나) deploy 불능 principal, (다) OS/ACL/store 분리, (라) upstream vsp classifier. 어느 것도 “기각·삭제”하지 않음 | unattended 재요구; reviewer/child credential near-miss·실행 1건; 에스코트 병목 연속 3회 → (나). secret 부재 음성시험 실패 → (다). upstream classifier 커밋 SHA 또는 fake-vsp 방어심도 수요 → (라) |
| **O2 transport** | **지금 P4 실계약을 채택**. `$TMP`를 벗어날 때의 package/request/assign/release/import 책임을 §4.2와 T-gate로 고정. 종전 “필요할 때까지 BLOCKED” 추천은 사용자 기각 | 대상 SAP의 MCP release가 없을 때 사람 SE09/SE10 fallback; abapGit은 사람 DEV assignment path; vsp는 단일 파일 할당, 조회는 G14 실측·계약 등재 뒤에만 | 고정 vsp에 create/release/import 새 표면이 생김; `transport list/get` 실측 형상이 불충분함; 대상 SAP live가 정적 계약과 다름; Basis route/transport layer가 변경됨; T-gate가 실제 모순을 발견함. 발생한 action만 BLOCKED하고 새 D-결정으로 수정 |
| **O3 파일럿 A path** | **트랙 B MCP write**. 사람 소유 대화형 write가 hook/guard 경로를 통과하는지 관찰하되 DEV allow/pass는 no-op smoke로만 기록하고 unresolved/QA deny만 차단 증거로 삼는다. 완료 도장은 vsp CLI V-PASS만 | 사용자 abapGit | MCP가 대상 object write/transport field를 노출하지 않거나 unresolved/QA deny 관찰이 재현 불가할 때. 사용자 새 결정 뒤 파일럿을 처음부터 재실행 |

## 15. 완료 판정

본 설계의 후속 재기준은 다음을 모두 만족해야 완료다.

- §14 확정 3건과 trade-off가 D-025에 append-only 봉인됨
- lock `candidate=6de63ba,state=staged`에 PROMOTE가 원자적으로 적용돼 새 `verified`가 되고
  `candidate=null`이며 evidence가 exact SHA에 묶임
- §11 문서 연쇄 갱신 완료, 낡은 모드/무인 전환 문구 0건
- §12 G1~G14, 파일럿 A/B, P4 T1~T5(`READY_FOR_RELEASE`, 실제 release 미실행) 완료.
  실제 delivery 완료를 주장한 run은 T6/T7도 PASS
- RV4와 role별 credential RED를 `historical_rv4_classifier=open`,
  `sap_mutation_boundary=unverified`(reviewer + all attended child), `attended-only`로
  정직 기록하고 unattended는 sealed
- `phases/**`·`interactive/**` 소스 diff 0
- R-002/R-003/R-005, D-018, D-019의 기계검증 행렬·새-컨텍스트 리뷰(단 SAP 기계 격리
  약화는 D-025대로 정직 기록), 실데이터 호출별 승인 유지

unattended 해제는 이 완료 판정에 포함되지 않는다. §7 U-gate와 별도 사용자 결정이 필요한
후속 상태다.
