# vsp 안전 프로필 정본 — SAFETY-PROFILES.md

## ① 헤더 · 문서 성격

- **최초 작성**: 2026-07-13 (트랙 A Phase 3 착수 산출물). **§⑪ 차단 검증 실측**
  (2026-07-13, IDEA-JNC S4H/100 — V1~V5+RV1~RV4 전건).
- **개정 (2026-07-16, 로드맵 S2-A)**: 축을 **구 3모드(Offline/Read-only/Gated write)**
  에서 **실행 구조(role) × SAP Policy(P0~P4)** 로 교체했다. 근거 = **D-025**(축 확정)·
  재기준 v2 §3~§4·`AGENTS.md`. 동시에 ⓐ 리뷰어의 transport **조회 허용 오류를 제거**
  ⓑ reviewer/worker 자격증명을 분리 서술 ⓒ **"무인 전환 가능" 문구 삭제**
  (`unattended=sealed`) ⓓ RV4의 **역사 판정과 현재 상태를 분리** ⓔ P2/P4 owner·승인
  시점을 exact화했다.
- **개정 (2026-07-19, 스프린트 W1)**: DESIGN.md §8.4가 요구한 "서사가 아니라 실행
  가능한 수준"의 모드별 allowlist(§④)·명령 분류(§③)·기계 강제층 매핑(§⑧)·spec 승인
  게이트(§⑨)·실행 가능한 재현 명령(§⑩)·RULES 정합표(§⑭)를 병합했다. vsp가
  `v2.38.1-91-g0b03ef2` → `v2.38.1-94-g5a8bedb`로 갱신되며 write_profile_gate
  (`SAP_READ_ONLY`/`SAP_TIER` pre-network 거부)가 신설된 것을 반영한다(§① 기준 버전
  갱신 · §⑧ · §⑬ 갱신 근거). §13 Phase 3(Gated Deploy)의 첫 완료 요건 산출물.
- **작성 방식**: 발명 금지. 근거는 `AGENTS.md`·`DESIGN.md`·재기준 v2
  (`docs/reference/designs/2026-07-15-track-a-rebase-v2.md`)·로드맵
  (`docs/reference/designs/2026-07-16-integration-hardening-roadmap.md`)·
  `docs/reference/DECISIONS.md`(D-025·D-027·D-028)·`adapters/vsp/vsp.lock.json`·
  `.harness/RULES.md`에서만 온다.
- **기준 vsp 버전 (2026-07-19 갱신)**: `vsp.lock.json` `verified_commit=5a8bedb`
  (v2.38.1-94-g5a8bedb, 바이너리 sha256 고정) — `--version` 출력 일치를 §⑩ 프로브
  실행 전 재확인했다. 명령 실명은 lock `command_contract` 10건 + `COMMANDS.md` §②
  실측 표면 기준. **§⑤·§⑪·§⑫의 2026-07-13~16 실측(IDEA-JNC 프로파일)은 그 시점의
  기준 커밋 0b03ef2 기록으로 그대로 보존**하며, 버전 차이가 실제 판정에 영향하는
  지점(§⑧·§⑬)에는 갱신 주석을 달아 구분한다.
- **자매 문서**: `COMMANDS.md`=명령 시그니처·실행 로그 실측 / `VERIFY-PATTERNS.md`=
  verify 사다리·실패 마커·role별 credential 운용 / **본 문서**=role×Policy 허용/차단
  프로파일·모드별 allowlist·자격증명 스코핑·package/transport 정책·기계 강제층 매핑·
  실행 가능한 재현 절차·vsp 무결성 한계.

### 현재 안전 상태 (exact — 전 절에서 보존)

```
attended-only
unattended=sealed
historical_rv4_classifier=open
sap_mutation_boundary=unverified     (scope: reviewer + all attended children)
```

### 핵심 명제 — 자격증명 관리가 곧 write 게이트다

무인이 아닌 지금도 이 명제는 유효하다. 근거 사슬:

1. Engine attended child는 MCP 서버 0개(`--strict-mcp-config`)로 기동되나(F1 —
   candidate `d4a0aeb`에서도 실질 생존 확인, D-028), 이 봉쇄는 **MCP에만** 해당한다.
   child는 **Bash로 vsp CLI를 직접 호출할 수 있고** final-harness의
   `block-dangerous-bash`는 vsp를 모른다(F7).
2. vsp는 **CWD `.env`를 자동 로드**하고(V9) `SAP_*` 환경변수를 읽는다. 자격증명이
   세션에 있으면 P0/P1 의도의 작업에서도 SAP에 write할 수 있다.
3. 따라서 write의 **기계적 차단선은 훅이 아니라 자격증명의 부재**(§⑥)이며, 이 문서의
   allowlist·package/transport 정책·에스코트는 그 위에 얹히는 **정책층**이다.

> **vsp에는 "read-only 강제"·"package allowlist" 내장 플래그가 없다**(lock
> `command_contract`·COMMANDS §② 실측). 아래 allowlist는 **vsp 내장 강제가 아니라**
> ⓐ 자격증명 스코핑(§⑥) ⓑ verify 명령 스냅샷(엔진이 기동 시 고정, 세션이 못 바꿈)
> ⓒ RULES(R-002/003/005/006) ⓓ 에스코트(§⑫)의 **합**으로 강제된다. vsp-native
> allowlist 플래그의 포크 추가는 §⑬ 하드닝 후보로 남긴다(발명하지 않음).

> **2026-07-19 갱신 (vsp-custom 5a8bedb)**: 위 명제 3과 바로 위 인용은 **기준 커밋
> 0b03ef2 시점**(read-only 강제 플래그 부재)의 정확한 기록이며 그대로 보존한다.
> vsp-custom `5a8bedb`(현재 lock)는 **write_profile_gate**를 신설해 `SAP_READ_ONLY`/
> `SAP_TIER`가 write 계열 서브커맨드를 **네트워크 dial 이전에 클라이언트측으로
> 거부**한다(§⑧ 기계 강제층 매핑 · §⑩ 프로브 실증). 즉 "read-only 강제 내장 플래그
> 없음" 주장은 더 이상 정확하지 않다 — **package allowlist 내장 강제 부재**는 지금도
> 유효하다(§⑧ 표 — allowlist 밖 package로의 write는 여전히 절차+감사 등급). 자격증명
> 부재는 여전히 **독립적인 방어층**으로 유효하며(주입되지 않으면 §⑪ V1/V2처럼
> ENV_FAIL로 SAP 자체에 닿지 않는다), 새 게이트는 그 위에 얹히는 **두 번째, 자격증명이
> 있어도 작동하는 기계 강제층**이다.

---

## ② 축 정의 — 실행 구조(role) × SAP Policy(P0~P4)

**두 축은 직교한다**(D-025). 구 문서의 "Offline / Read-only online / Gated write
3모드"는 **폐기**한다 — 그 축은 실행 구조와 권한을 뒤섞어, 같은 P1 작업이 누가
수행하느냐에 따라 달라지는 것을 표현하지 못했다.

**실행 구조(role)** — 이 문서가 vsp 관점에서 구분하는 주체:

| role | 정의 | vsp 접근 |
|---|---|---|
| **Human operator** | 사람이 소유한 Direct/Guided 세션의 셸 | 사람 셸의 vsp CLI (적용 경로 선택지 중 하나) |
| **Reviewer** | 새-컨텍스트 read-only 판정자 | **P0/P1 한정, transport 동작 0(조회 포함)** |
| **Engine attended worker** | `run-track-a.ps1` 경유 attended run의 headless child | vsp CLI **전용**(MCP 차단) |

**SAP Policy** — 효과가 가장 큰 것 하나를 고른다(**P4 > P3 > P2 > P1 > P0**).

### role × Policy 허용표 (명령 실명 = lock `command_contract` 기준)

| Policy | Human operator | Reviewer | Engine attended worker |
|---|---|---|---|
| **P0 offline** | `lint --file/--stdin`, `parse --file/--stdin` | 동일 | 동일 |
| **P1 connected-read** | `system info`, `source read`/`source context`, `lint <TYPE> <NAME>`(fetch), `atc <type> <name>`, `health --package`, `search`/`grep`/`graph`/`deps`/`boundaries`/`tr-boundaries`/`api-surface`/`what-package`/`where-used-config` | **동일 — 단 `transport list`/`get` 제외(§⑤)** | 동일 |
| **P2 real-data** | `query` — **호출마다 범위·필드·row cap 제시 + 사람 승인**(§⑦) | **금지** | **금지**(batch·subagent·자동승인 불가) |
| **P3 write/execute** | `deploy <file> <package> [--transport]`, `copy <archive.zip> --to <package>`, `test [type] [name] [--package]`, `source write`/`source edit` — **DEV tier 한정**(R-003) | **금지** | 동일(승인 계약 내), DEV tier 한정 |
| **P4 transport** | `transport list`/`get`(조회) · release는 §⑦ 정책 통과 후 **사람 전용** | **금지 — 조회 포함** | `deploy --transport <req>`(**사전 승인된 request 할당·검증만**) |

**공통 차단(모든 role)**: `execute`(임의 ABAP 실행 — lock "위험, 기본 차단", P3에서도
별도 명시 승인 필요) · `install abapgit`(파일럿 범위 밖, COMMANDS §④).

**`vsp test`의 위치**: 소스를 쓰지 않지만 **ABAP Unit을 실행**(코드 실행)한다. 따라서
**P3**로 분류하며 **리뷰어 프로파일에서 제외**한다(§⑤).

**P0가 가장 강한 이유**: 자격증명이 없으면 atc/health/deploy/copy/execute/test가 전부
`vsp system info` preflight에서 **ENV_FAIL**로 떨어진다(`verify-sap.ps1` 40~43행). 즉
P0의 write 차단은 정책이 아니라 **기계적**이다. lint/parse만 `--file`로 자격증명 없이
동작한다(V2/V4).

---

## ③ 명령 분류 (COMMANDS.md 실물 명령명)

vsp write 게이트가 다루는 경계선이 곧 이 분류다. 근거: vsp.lock.json
write_profile_gate._comment + spike-evidence part_b gate_mechanism.

- **write 계열 (게이트 대상 — dial 이전 거부)**: `deploy` · `copy` · `execute` ·
  `install`(abapgit/zadt-vsp) · `source write` · `source edit` ·
  `recover-failed-create`.
- **read 계열 (게이트 무영향 — 그대로 실행)**: `system info` · `lint`(`--file`
  오프라인 및 `<TYPE> <NAME>` 연결 fetch) · `parse --file` · `atc <type> <name>` ·
  `test [type] [name] [--package]` · `health --package` · `source read` ·
  `source context` · `search` · `grep` · `boundaries`.
- **실데이터 추출 (별도 상시 게이트 — write 게이트 밖)**: `query`(SQL row
  extraction). read op라 write 게이트가 막지 않는다 — 차단은 정책+감사 등급(§⑧).
  DESIGN.md §8.2 "테이블 데이터 row extraction은 별도 승인 없이 금지".
- **transport 계열**: `transport list`/`get`(조회) — read. `transport release`(CTS
  릴리스) — write 게이트 미커버(§⑦·§⑧).

---

## ④ 모드별 프로파일 (3종 + 배포 래퍼)

| # | 프로파일 | env 설정 | 자격증명 소재 | 허용 명령 | 차단 명령 | 사용 경로 |
|---|---|---|---|---|---|---|
| ① | **offline** | SAP_* 부재 | 없음 | `lint --file` · `parse --file` (완전 오프라인) | 그 외 전부 — 연결 필요 명령은 **자격증명 부재로 SAP 미도달**(ENV_FAIL) | 무인 워커 authoring 스텝 · 리뷰어 세션(클린 allowlist env, SAP_* 미전달) |
| ② | **read-only online** | `SAP_READ_ONLY=true` | 프로세스 스코프 주입 | read 계열 전부: `system info`·`lint`·`parse`·`atc`·`test`·`health`·`source read`·`source context`·`search`·`grep`·`boundaries` | write 계열 전부(`deploy`·`copy`·`execute`·`install`·`source write`·`source edit`·`recover-failed-create`) = 게이트 pre-network 거부 · `query`(정책 차단) | `scripts/verify-sap.ps1` 기본 실행 · read-only 계획/분석 세션(DESIGN §8.2) |
| ③ | **gated write** | `SAP_TIER=dev` · `SAP_READ_ONLY` 미설정 | 배포 래퍼 프로세스 스코프만 | read 계열 + write 계열(게이트 통과) — 단 대상 package는 allowlist(§⑦) 한정 | dev 외 tier의 write(R-003, §⑩ 프로브 2) · allowlist 밖 package로의 write · `transport release`(대화형만, §⑦) | 배포 스텝 래퍼 실행 경로 **전용**: `scripts/verify-sap.ps1 -Write` 또는 `. scripts\vsp-env.ps1 -Write` |

**정밀 주석 (오해 방지 — DESIGN §8.4·VERIFY-PATTERNS §④):** 무인 워커의 authoring
서브프로세스 **자신**은 SAP_* 를 갖지 않는다(§8.4 "offline/read-only phase 무인 세션
환경에서는 자격증명 제거"). 즉 워커 스텝의 실제 바닥은 **① offline**(credential-absence
floor)이다. **② read-only online**은 자격증명이 read-only로 조달되는 경로 — 즉
`verify-sap.ps1`가 자기 프로세스 안에서 self-provision하는 verify 스텝과 대화형
read-only 세션 — 의 프로파일이며, 워커 세션 env에 직접 주입되지 않는다. `execute.py`가
`{**os.environ}`로 자식에 부모 env를 전량 상속시키므로, 엔진 기동 셸에 SAP_*가 없어야만
이 분리가 성립한다(§⑥).

---

## ⑤ Reviewer 프로파일 — P0/P1 한정, transport 동작 0

리뷰어 격리 = **조항1(레포 쓰기 차단, 등식형 검사) + 이 프로파일 + package allowlist(§⑦)
+ 자격증명 스코핑(§⑥)** 의 합.

- **허용 (P0/P1 순수 read만)**: `source read`/`source context`, `lint <TYPE> <NAME>`,
  `atc <type> <name>`, `health --package`, `parse`, `search`/`grep`/`graph`/`deps`/
  `boundaries`/`where-used-config`/`what-package`, `system info`. — 리뷰어가 diff·`src/`
  소스·라이브 SAP를 **독립 재도출**로 판정하기 위한 것.
- **차단**: `deploy`·`copy`·`source write`·`source edit`·`install`·`execute`·`query`
  + **`test`(코드 실행이라 제외)** + **`transport` 전 계열 — `list`/`get` 조회를 포함**.

> **2026-07-16 정정 (S2-A)**: 이 문서의 이전 판은 리뷰어에게 `vsp transport list`/`get`
> **조회를 허용**했다. 이는 `AGENTS.md`("Reviewers may use P0/P1 but perform no
> transport operation, **including reads**")와 D-025 O2에 **정면 저촉**하므로 제거한다.
> 리뷰어는 transport 상태를 알 필요가 없다 — 판정 대상은 소스와 spec이지 이송 상태가
> 아니며, 조회 허용은 P4 표면에 리뷰어를 올려두는 불필요한 노출이었다.

### 리뷰 스텝의 기계적 한계 (정직 표기 — 현재 열린 갭)

- 리뷰 스텝은 **일반 step이라 `--disallowedTools` 미부착**(advisory 세션 전용). 레포
  쓰기는 조항1(등식형 dirty 검사)이 기계 차단하지만, **SAP 직접 write는 등식 검사가
  못 본다**(git dirty만 보므로).
- **세션 env는 phase 공통**(execute.py `os.environ` 승계) — step별 자격증명 분리가 엔진
  밖에서 불가하다. 리뷰 스텝이 write 스텝과 **같은 phase**에 있으면 **자격증명이 이미
  주입된 상태**로 실행된다. 즉 리뷰 스텝의 SAP-write 차단은 **§⑥의 자격증명 부재로
  성립하지 않는다**.
- **결론**: 리뷰어의 SAP-write 차단은 이 프로파일(관례) + package allowlist + 에스코트
  (§⑫)가 담당하며, **기계적이지 않다** → 기록 상태 `sap_mutation_boundary=unverified`
  (scope: reviewer + all attended children). 항구 해소는 **§⑥의 role별 credential 분리
  운용**(reviewer 셸에 자격증명 미주입)이 1차 방어이고, 기계 봉쇄는 리뷰/write phase
  분리 또는 엔진 승격에 편입된다(미결 — 발명하지 않음).
- **2026-07-19 보강**: 리뷰어 세션이 클린 allowlist env로 스폰되어 SAP_*를 아예
  전달받지 않음을 스파이크로 재확인했다(§⑥ 자격증명 스코핑 참조) — 위 결론의 **1차
  방어(자격증명 미주입)가 최소 그 시나리오에서는 성립함**을 보여주나, phase-공통 env
  승계의 구조적 갭(위 두 항목) 자체를 닫은 것은 아니다.

---

## ⑥ 자격증명 스코핑 (write 게이트의 실체) — reviewer / worker 분리

vsp가 자격증명을 얻는 **두 채널**을 모두 통제한다:

1. **`SAP_*` 환경변수** — `scripts/vsp-env.ps1`을 **dot-source**하면 프로세스 환경에
   `SAP_URL`/`SAP_CLIENT`/`SAP_USER`/`SAP_PASSWORD`가 주입된다. 출처는
   `<sc4sap home>\profiles\<ProfileName>\sap.env`이고, 비밀번호가 `keychain:<target>`
   이면 Windows Credential Manager에서 해석한다. 스크립트는 시크릿을 출력/기록하지 않고
   프로세스 환경에만 넣는다.
2. **CWD `.env` 자동 로드** — vsp는 작업 디렉토리 `.env`를 자동 로드한다(V9). 레포 CWD에
   `.env`가 상주하면 dot-source 없이도 자격증명이 닿는다.

### role별 credential 규율 (핵심 — 운용 정본은 VERIFY-PATTERNS)

| role | 자격증명 | 운용 |
|---|---|---|
| **Reviewer** | **주입하지 않는다(기본)** | 리뷰는 diff·`src/` 정독으로 수행한다. P1 라이브 재도출이 꼭 필요하면 **read 전용 프로파일을 리뷰어 셸에만** 주입하고, 그 셸에서는 write 계열을 실행하지 않는다. **reviewer 셸과 worker 셸을 같은 프로세스 환경으로 공유하지 않는다** — 공유하는 순간 §⑤의 갭이 열린다. 실측: `phases/3-review-gate/spike-evidence.json` part_a — "reviewer received only the 9 allowlisted vars, no SAP_* connection vars"(2026-07-19) |
| **Engine attended worker** | phase 계약이 요구할 때만 | 엔진 기동 셸의 `os.environ`을 phase 공통 승계하므로, 스코핑은 **엔진 기동 시점의 셸 환경**에서 한다(VERIFY-PATTERNS §④ "엔진 기동 셸 관례"). P0/P1 의도 run은 ⓐ `vsp-env.ps1` dot-source 없이 기동 ⓑ 레포 CWD에 `.env` 부재 보장 → 두 채널이 비면 child가 Bash로 vsp를 호출해도 SAP에 닿지 못한다. gated write phase에서 자격증명이 필요할 때는 **배포 스텝 래퍼의 자기 프로세스에만** 스코프된다(`verify-sap.ps1 -Write`/`vsp-env.ps1 -Write`, `powershell -File` 자식 프로세스 실행이라 부모 셸·다른 워커 스텝에 전파되지 않음 — VERIFY-PATTERNS §④ "배포 스텝 래퍼 관례") |
| **Human operator** | 해당 작업 셸에서만 | P3 수행 세션에서만 `vsp-env.ps1`을 dot-source해 **DEV tier** 프로파일을 로드한다 |

- **DEV tier 한정 (R-003)**: write는 DEV tier에서만. 이 머신 프로파일 홈(`~\.sah`)에는
  `IDEA-JNC`·`KR-DEV`만 존재하며 `IDEA-JNC`(SID S4H/client 100, dev tier)가 유일 실증
  프로파일이다. `IDEA-JNC`에만 `SAP_INSECURE=true`가 붙는다(자체서명 인증서, 사용자 승인
  2026-07-11) — **QA/PRD 프로파일에 재사용 금지**(vsp-env.ps1 129~134행). QA/PRD tier
  시스템에 vsp write(deploy/copy/execute)를 실행하지 않는다(R-003).

### `.gitignore` 실측 (2026-07-13, 유효 · R-005)

레포 루트 `.gitignore`에 자격증명 관련 항목 **이미 등록됨**:

```
.sc4sap/        (line 1)   — 프로파일 홈(sap.env 등)의 레포 내 잔재 차단
.env            (line 2)   — vsp 자동 로드 대상 자격증명 파일 차단
```

프로파일 실체 `sap.env`는 `SC4SAP_HOME_DIR`(기본 `$HOME\.sc4sap`) 하위 — **레포 밖**이라
커밋 표면이 아니다. R-005(접속정보 커밋 금지)는 위 2줄 + 이 배치로 성립.

### write 후 확인 (R-006)

gated write 이후 `vsp source read <TYPE> <NAME>`로 반영을 대조한다(CLAS 거짓 성공 실증
이력 L-001). 현행 lock `v2.38.1-94` ≥ `v2.38.1-89` 이므로 CLAS deploy/copy 허용 조건
충족.

---

## ⑦ 진입 조건 · package allowlist · transport 정책 (owner·승인 시점 exact)

### P3 진입 조건 (순서 — 전부 통과해야 write)

1. **spec 승인** — 사람 승인을 거친 뒤에만 P3 진입.
2. **새-컨텍스트 리뷰 게이트 PASS** — 첫 vsp write 직전 리뷰 스텝의 verify가 verdict를
   검사(필수 3조항: 등식형 변경 검사 · 검사 로직 봉인 · HEAD-sha 바인딩). FAIL이면 write
   스텝에 도달 불가.
3. **package allowlist 통과**(아래).
4. **write 후 독립 verify 체인**: deploy → activate → drift check → ATC → unit test.
   deploy/copy 성공 보고만 믿지 말고 `vsp source read`로 반영 확인(R-006, §⑥).

### package allowlist (현 실증 단계 실체)

| 항목 | 현재 실체 | 강제 방식 |
|---|---|---|
| 허용 패키지 | **`$TMP`** (IDEA-JNC, dev tier) — 파일럿 승인 범위 | verify 명령 스냅샷이 대상 패키지를 명시(예: `vsp deploy … '$TMP'`) + 에스코트 + R-003 |
| 객체 프리픽스 | **`ZSAH*`** — 실측: `ZSAH0B_*`, `ZSAH1_WORKDAYS`, `ZCL_SAH2_WORKDAYS`, `ZSAH2_DUEDATE`, `ZSAH3_CARRFLT`, `ZSAH4_GLOPEN` | 관례(Z 접두사, RULES/CHECKLIST) |
| tier | **DEV 만** (R-003) | 자격증명 프로파일이 DEV로 한정 |

> **표기 확정 (2026-07-20, 사용자 확정 · D-039①)**: `COMMANDS.md` §①·부록의
> **IDES-DEV**와 위 표의 **IDEA-JNC**(2026-07-13 표기)는 **같은 서버의 머신별 프로파일
> 명**이다(S4H/100, dev tier). 2026-07-19 시점엔 추정이었고 이제 확정이다 — 두 원문
> 표기는 역사 보존을 위해 각각 그대로 두되, **같은 대상으로 읽는다**.

> vsp에 package allowlist 내장 강제 플래그가 없으므로(§①), allowlist는 **verify 명령
> 문자열(엔진 스냅샷 고정) + 리뷰/에스코트**로 강제된다. 대상 패키지·프리픽스는 계획
> 시점에 확정해 verify에 박제한다.
>
> **규칙**: allowlist에 명시되지 않은 package를 대상 인자로 하는 write(`deploy <file>
> <package>` / `copy … --to <package>`)를 금지한다 — allowlist에 없는 package = write
> 불가.
>
> **확장 절차**: 대상 package를 이 절 목록에 append + 그 시스템이 dev tier임을 확인
> (R-003). package 화이트리스트는 현재 vsp 게이트가 **기계 강제하지 않는다** — 대상
> package 인자 검사는 배포 래퍼/harness-plan 계획의 책임이므로 **절차+감사 등급**이다
> (§⑧ 기계 강제층 매핑 참조).

### P2 (실데이터 추출) — owner·승인 시점

- **owner**: 사람. **호출마다** 범위·필드·row cap을 제시하고 **사람 승인**을 받는다.
- **승인 시점**: 각 `vsp query` 호출 **직전**. 승인은 **호출 1건에만** 유효하며 테이블·
  세션·후속 호출로 이월되지 않는다.
- **금지**: batch · subagent 대리 · 자동 승인 · 사전 일괄 승인. **Reviewer와 Engine
  worker는 P2 자체가 금지**(§②).
- `query`는 read op라 write 게이트가 막지 않는다 — 위 금지는 **정책+감사 등급**이며
  기계 강제가 아니다(§⑧).
- 트랙 B MCP 쪽 실데이터 2종(`GetTableContents`/`GetSqlQuery`)의 adapter별 지원 상태는
  `interactive/core/policies/data-protection/data-extraction-policy.md`에 분리 기록
  (Claude 지원 / Codex hard-disabled=unsupported / Antigravity 미실측=unsupported).

### P4 (transport) — owner·승인 시점 (D-025 O2)

| 동작 | owner | 승인 시점 | 비고 |
|---|---|---|---|
| package/request **create·assign 준비** | **Guided(사람)** | 준비 전 manifest 승인 | Direct-P4 **진입 경로 없음** |
| request에 객체 **할당·검증** | Engine attended worker | 사전 승인된 request 한정 | `deploy --transport <req>`만 지원. `copy`에 transport flag가 있다고 가정하지 않는다 |
| **release** | **사람 전용** | **task 번호와 parent 번호를 각각 즉시 제시·재확인** | 이전의 "release 하겠다" 확인은 이 승인이 **아니다**. `supported:false`는 **BLOCKED** |
| QA/PRD **import** | **사람/Basis STMS 전용** | — | 이 레포의 어떤 role도 수행하지 않는다 |
| reviewer의 transport 접근 | — | — | **조회 포함 0**(§⑤) |

- **`transport list`/`get` 출력 형상은 미실측** — help 존재만 확인됐고 lock
  `command_contract` **미등재**다(등재된 것은 `deploy --transport`뿐). 따라서 P4
  inventory를 vsp 조회에 의존하는 계약을 지금 확정하지 않는다. 실측은 로드맵 **S5-A**
  (사람 소유 Guided-P1 evidence 작업)가 소유하며, 불충분 판정 시 Engine-P4 inventory는
  **사람 `GetTransport` handoff**로 고정한다. 무인 자동화에는 애초에 불필요하다
  (COMMANDS.md §④ "이번 실측 범위 밖") — 필요 시 대화형 read-only로만.
- **실제 release/import는 전달 목적이 있는 별도 run에서만** 수행한다(T6/T7). 파일럿·
  게이트 run의 목표는 **`READY_FOR_RELEASE`**까지이며 request는 modifiable로 남긴다.
- **현행 `$TMP`는 로컬 오브젝트라 transport 자체가 불요**(COMMANDS.md 부록 — `$TMP`
  잔존 객체는 transport 없이 생성). `transport release`는 vsp write 게이트가 커버하는
  서브커맨드 목록에 **없다**(vsp.lock `write_profile_gate._comment` 열거 밖 ·
  reverification "CTS/transport는 잠금 획득 없음·상태 필드만") — 위 "release=사람
  전용" 행은 **절차+감사 등급**이지 기계 강제가 아니다(§⑧). 무인 런의 계획에는
  release 스텝을 배치하지 않는다.

---

## ⑧ 기계 강제층 매핑 (정직 표기 — 스펙 §2 Non-Goals)

어느 차단이 **기계 강제**(vsp CLI write 게이트 — dial 이전 거부)이고 어느 것이
**절차+감사 등급**(파일시스템/정책 우회 가능)인지 구분한다.

| 차단 대상 | 강제 등급 | 근거 좌표 |
|---|---|---|
| `deploy`·`copy`·`execute`·`install`·`source write`·`source edit`·`recover-failed-create` | **기계 강제** — write 게이트가 `SAP_READ_ONLY` truthy 시 dial 이전 거부 | vsp-custom 5a8bedb · lock v2.38.1-94 write_profile_gate · §⑩ 프로브 1 · spike part_b |
| 위 write를 dev 외 tier에서 시도 | **기계 강제** — `SAP_TIER≠dev`(비어있지 않음) 시 거부 | R-003 · §⑩ 프로브 2 · spike refusal_marker_tier |
| `query` (실데이터 row extraction) | **절차+감사** — write 게이트는 read op를 막지 않음. 무인 워커는 credential-absence floor(§④-① offline)로 실접속 불가하나, 자격증명이 있는 read-only 세션에서는 CLI 실행 가능 → 승인 정책+감사로만 차단 | DESIGN §8.2 · §③ |
| `transport release` | **절차+감사** — 게이트 미커버. `$TMP` local이라 현행 무관, 대화형 절차로만 | §⑦ · vsp.lock reverification |
| allowlist 밖 package로의 write | **절차+감사** — 게이트는 package 화이트리스트 미강제; 래퍼/계획 책임 | §⑦ |
| 파일시스템 우회(워커가 자격증명 파일 직접 read / PASS 레코드 위조) | **절차+감사** — OS 수준 격리 아님(워커·래퍼 동일 FS/OS 계정). run 로그·git 이력·SAP 변경 이력으로 사후 감사 | 스펙 §2 · §5-4 |

---

## ⑨ spec 승인 게이트 (무인 런)

- 무인 런에서 **"spec 승인" = harness-plan 계획 동결(사람 승인)**이 gated write 진입의
  유일 조건이다. 승인된 계획의 배포 스텝 실행 경로에서만 gated write 프로파일(§④)이
  공급된다.
- 리뷰 게이트 스펙 §4.0: 리뷰 캡슐이 **승인 기준/스펙 사본**을 동봉하고, 스펙 버전이
  **캡슐 해시**에 반영된다 — 스펙·정책 변경 = 새 해시 = 재리뷰(낡은 PASS 재사용 불가,
  스펙 §5-8). 즉 스펙 승인은 캡슐 해시 바인딩으로 write 직전까지 전파된다.

---

## ⑩ 검증 절차 (실행 가능한 재현 명령)

### 프로브 방식 (오프라인 — 실 SAP 무접속)

더미 호스트 + `SAP_READ_ONLY`/`SAP_TIER` 조합으로 **write는 dial 이전 거부**되고
**read는 네트워크에 도달**함을 대조한다. write 게이트가 클라이언트측 pre-network이므로
더미 호스트로도 재현되며 실 write가 발생하지 않는다 — AC-10 실증(spike-evidence.json
part_b)이 쓴 방식을 더미 호스트로 축약한 것.

바이너리는 lock 상대 경로: `vsp\build\vsp.exe` (D-030 편입 · 비커밋 · lock `binary.build_command`로 빌드).

```bash
VSP="vsp/build/vsp.exe"   # 레포 루트 기준 상대경로 (D-030 편입, 비커밋)
printf 'REPORT zsah_probe.\nWRITE / 42.\n' > zsah_probe.prog.abap
DUMMY=(SAP_URL="https://dummy.invalid:44300" SAP_CLIENT=100 SAP_USER=DUMMY SAP_PASSWORD=DUMMY)

# 프로브 1: SAP_READ_ONLY 게이트 (write 거부, dial 이전)
env SAP_READ_ONLY=true "${DUMMY[@]}" "$VSP" deploy zsah_probe.prog.abap '$TMP'
# 프로브 2: SAP_TIER 게이트 (dev 외 tier write 거부)
env SAP_TIER=QA        "${DUMMY[@]}" "$VSP" deploy zsah_probe.prog.abap '$TMP'
# 프로브 3: read 분리 (동일 READ_ONLY 하에 system info는 네트워크 도달)
env SAP_READ_ONLY=true "${DUMMY[@]}" "$VSP" system info
```

### 본 문서 작성 시점 실행 결과 (2026-07-19, 상기 명령 직접 실행)

| 프로브 | env | 명령 | 결과(핵심 라인) | exit |
|---|---|---|---|---|
| 1 | `SAP_READ_ONLY=true` | `deploy … $TMP` | `Error: blocked: SAP_READ_ONLY=true — write operations are disabled for this profile …` | 1 |
| 2 | `SAP_TIER=QA` | `deploy … $TMP` | `Error: blocked: SAP_TIER=QA — write operations are only allowed on the dev tier …` | 1 |
| 3 | `SAP_READ_ONLY=true` | `system info` | `Error: failed to get system info: … dial tcp: lookup dummy.invalid: no such host` | 1 |

**대조 결론**: 동일한 `SAP_READ_ONLY=true` 하에서 프로브 1(`deploy`)은 **dial 이전**
거부되고(게이트 마커), 프로브 3(`system info`)은 **네트워크 dial에 도달해** DNS에서
실패한다(연결 실패 마커). 즉 게이트는 **write 한정·기계 강제**이며 read는 무영향임을
1회 재현. `zsah_probe.prog.abap`은 스크래치패드에서 작성·실행(레포 미커밋).

### 이미 실증된 항목 (날짜·좌표 인용)

- **AC-10 라이브 재실증 (2026-07-18)** — `phases/3-review-gate/spike-evidence.json`
  part_b: 실 IDES-DEV 프로파일 복사본 + `SAP_TIER=QA`+`SAP_READ_ONLY=true`(및 tier
  단독) 각각 `vsp deploy … $TMP`가 `created=no·dialed=no`로 클라이언트측 거부, 동일
  env에서 `vsp system info` exit 0(read 분리 입증), 사전/사후 `source read` 404(생성
  無). R-003 준수(tier LABEL만 QA로, 실접속 대상은 DEV 유지). lock
  write_profile_gate.verified.block_live = RESOLVED.
- **오프라인 유닛 테스트 (2026-07-18)** — `cmd/vsp/write_profile_test.go`:
  `enforceWriteProfile` 12케이스 + `getWriteClient`/read-path 4케이스 전부 PASS
  (lock write_profile_gate.verified.offline_unit_tests).
- **passthrough 라이브 (2026-07-18)** — `SAP_READ_ONLY`/`SAP_TIER` 미설정 시 deploy/copy
  정상 진행 = 게이트 통과 분기 확인 (lock write_profile_gate.verified.passthrough_live).

---

## ⑪ 차단 검증 — 역사 실측(2026-07-13)과 현재 상태의 분리

> **읽는 법**: 아래 V1~V5·RV1~RV4는 **2026-07-13 시점의 실측 기록**이며 그대로 보존한다.
> 그러나 **당시의 "무인 전환 가능" 판정은 현재 지원 상태가 아니다** — D-025 이후
> `unattended=sealed`이고 RV4가 확정한 갭 때문에 `historical_rv4_classifier=open` ·
> `sap_mutation_boundary=unverified`가 현재 기록이다. 역사 판정을 현재 권한으로 읽지 말 것.

기대 마커는 `verify-sap.ps1`(VERIFY-PATTERNS ③)의
`CODE_FAIL`/`ENV_FAIL`/`LOCK_FAIL`/`VERIFY_PASS`. 실측 셸: 자격증명 부재 확인 후 V1~V3,
`. .\scripts\vsp-env.ps1 -ProfileName IDEA-JNC` 주입 후 V4(read 계열만).

| # | 전제 | 명령 | 기대 | 실측 (2026-07-13) | 판정 |
|---|---|---|---|---|---|
| V1 | P0 (무자격증명·CWD `.env` 없음, `Get-ChildItem Env:SAP_*` 0건 확인) | `& .\scripts\verify-sap.ps1 -- deploy src/zsah1_workdays.prog.abap '$TMP'` | **ENV_FAIL** | exit 1, `ENV_FAIL: no SAP connectivity (vsp system info exit 1)` | 일치 — P0 write는 **기계적**으로 불가 |
| V2 | P0 | `& .\scripts\verify-sap.ps1 -- atc PROG ZSAH1_WORKDAYS` | **ENV_FAIL** | exit 1, 동일 마커 | 일치 — P1도 자격증명 없이는 불가(완전 결핍 확인) |
| V3 | P0 | `vsp lint --file src/zsah1_workdays.prog.abap` | exit 0/1(lint 판정) | exit 0, `No issues found` | 일치 — P0 draft 게이트는 자격증명 없이 동작 |
| V4 | P1 (자격증명 주입, IDEA-JNC read) | `vsp source read PROG ZSAH1_WORKDAYS`, `vsp health --package '$TMP'`, `verify-sap.ps1 -- atc PROG ZSAH1_WORKDAYS` | 정상 exit 0 | 3건 전부 exit 0 — source read 전문 반환 · health `WARN`(기존 객체 ATC 지적, 명령은 정상 완주) · atc `VERIFY_PASS`, 1 INFO(TTZCU 시간대 캐시, Error 0) | 일치 — P1 허용 성립. read 계열만 실행 |
| V5 | 정적 감사(크리덴셜 불요) | 전 5개 phase의 verify 명령 문자열 전수 추출 | 위반 0건 | 12개 SAP 관련 step verify 중: impl 5개 전부 `vsp lint --file`(P0) · review-gate 2개(3a/3b) 전부 로컬 검사기만(`Get-FileHash` sha256 핀 + `check-review-verdict.ps1`, vsp 인자 0건) — `deploy`/`copy`/`query`/`execute`/`source write` **0건**. 유일한 `deploy` 문자열은 3a step2 `escort-write-deploy`(P3 전용 명명 스텝, §⑫ 스코프 — review-gate 3회 FAIL로 미도달) | 일치 — write/실데이터 verb가 P0/P1 스냅샷에 없음 |

**V5 상세**: `0-example`(템플릿, SAP 무관) 제외 — `1-workdays-util` step0/1: `vsp lint --file` ×2 ·
`2-duedate-reuse` step0/1: `vsp lint --file` 체인 ×2 · `3a-carrflt-seed` step0: `vsp lint --file`,
step1(review-gate): 로컬 검사기, step2(`escort-write-deploy`): `verify-sap.ps1 -- deploy … '$TMP'`
(미도달) · `3b-carrflt-gated` step0: `vsp lint --file`, step1(review-gate): 로컬 검사기.

### 리뷰 스텝 시나리오 (RV1~RV4)

| # | 절차 | 판정 | 실측 (2026-07-13) |
|---|---|---|---|
| RV1 | 3b 리뷰 스텝 산출물에서 SAP 접촉 명령 전수 열거 | write verb **0건** | `step1-output.json` 세션 최종 응답: "No other repo writes; no vsp write; no `src/` edits." 리뷰 방법론 = `git diff main -- src/` + 소스 정독(vsp 호출 0건). **3a·3b 무인 실행은 P0 스코핑**(엔진 phase 셸에 `SAP_*` 미주입 — 에스코트 체인 E1~E4는 `vsp-env.ps1` 로드한 **사람 주도 셸**에서 별도 수행) → SAP 접촉 구조적 0건 |
| RV2 | 리뷰 스텝의 **frozen verify 명령**이 verdict 검사만 하고 SAP write를 포함하지 않음을 감사 | 위반 0건 | 3a/3b 공통 verify: `Get-FileHash … SHA256` 핀 대조 + `check-review-verdict.ps1 -Phase -Verdict`뿐. `check-review-verdict.ps1` 전문을 `vsp.exe|vsp-env|SAP_|deploy|copy|query|execute`로 grep → 매치 1건(120행, git rename/copy **표기 감지** 주석 — SAP `copy`와 무관). SAP verb 0건 |
| RV3 | 조항1(등식형 dirty)이 리뷰어의 **레포 쓰기**를 차단함을 확인 | 차단 성립 | `test-check-review-verdict.ps1` — **13/13 PASS**, `AC1(b) reviewer code edit -> blocked`(verdict+src 동시 dirty → exit 1) 포함 |
| RV4 | **음성 대조**: 리뷰 스텝이 자격증명 present 상태면 `vsp deploy`가 **성공할 수 있음**을 확인 | **갭 확정** | 기실측 인용(`phases/3b-carrflt-gated/scoring-raw.md` E1·D3) — E1: `IDEA-JNC` 주입 셸에서 `verify-sap.ps1 -- deploy src/zsah3_carrflt.prog.abap '$TMP'` → `VERIFY_PASS` 성공. D3: 동일 상태 재배포도 성공. 리뷰 스텝과 에스코트 체인이 **같은 phase의 승계 env**를 공유하므로 리뷰 스텝이 동일 셸에서 `deploy`를 호출했다면 동등하게 성공했을 것 → **SAP-write 차단은 자격증명 부재로 성립하지 않고, 관례(RV1)+allowlist+에스코트의 합으로만 성립** |

### RV4의 현재 상태 (2026-07-16 갱신)

- **RV4는 갭을 없애는 절차가 아니라 드러내는 절차다.** 현재 기록:
  `historical_rv4_classifier=open`.
- **v0.20.x candidate(`d4a0aeb`)로 올려도 닫히지 않는다 (D-028 실측)** —
  `authority-gate.py`(@d4a0aeb)에 **"vsp" 언급 0건**이고 `_deploy()`의 `deploy_actions`
  (`:371-376`)는 helm/vercel/netlify/firebase/flyctl/wrangler/serverless/railway만 커버,
  **vsp 부재**. `:390`의 `head=="deploy" or action in deploy_actions.get(head,…)` 판정상
  `vsp deploy`(head=`vsp`)는 걸리지 않는다 → `deploy=false`여도 vsp deploy 미차단.
  **엔진 업그레이드가 RV4를 닫아줄 것이라는 기대는 배제됐다.**
- 1차 방어는 **§⑥의 role별 credential 분리**(reviewer 셸에 자격증명 미주입)이며, 기계
  봉쇄는 리뷰/write phase 분리 또는 엔진 승격에 편입한다(미결 — 발명하지 않음).
- **2026-07-19 참고 — 별개의 새 기계 강제층**: vsp-custom `5a8bedb`(현재 lock)가 신설한
  write_profile_gate(§⑧·§⑩)는 `SAP_READ_ONLY`/`SAP_TIER` 조건이 맞으면 자격증명
  존재 여부와 무관하게 write를 dial 이전에 거부한다. 이는 RV4가 다루는 **"리뷰 스텝의
  phase-공통 자격증명이 write를 성공시키는가"라는 질문과는 별개의 메커니즘**이다 —
  리뷰 스텝의 실행 env에 `SAP_READ_ONLY=true`가 함께 주입되는지는 이번 통합에서
  확인되지 않았으므로, 새 게이트의 존재가 RV4를 닫는다고 간주하지 않는다.
  **RV4를 "닫힘"으로 기록하는 것을 금지한다**는 아래 원칙은 유지된다.

---

## ⑫ 에스코트 조항 — `unattended=sealed`

- **발효**: P3 write는 **사람 셰퍼딩으로 수행**한다. 이 문서의 allowlist·스코핑은
  **에스코트를 전제로** 적용된다.
- **에스코트가 메우는 것**: ① 리뷰어 판단의 확률성(기계 환원 불가) ② 리뷰어/child의
  SAP-직접-write 갭(§⑤·§⑪-RV4) ③ package allowlist의 관례 강제 부분.
- **2026-07-13 에스코트 해제 3조건은 당시 실측 충족됐다** (역사 기록):
  1. ✅ 리뷰 게이트가 씨앗 결함을 FAIL로 내어 write 도달을 실제 차단 1회 실증
     (`3a-carrflt-seed`, 리뷰 게이트 3회 시도 전부 FAIL, `escort-write-deploy` 미도달).
  2. ✅ §⑪ V1~V5 + RV1~RV4 실측 — 단 RV4는 갭을 **없앤** 것이 아니라 **확정 기록**한 것.
  3. ✅ drift check가 SE80 수동 변경을 실제 검출 1회 실증(D1→D2→D3).
- **그러나 이것이 무인 전환 권한을 주지 않는다 (2026-07-15 supersede, D-025)**:
  RV4가 확정한 **phase-공통 자격증명 · 비기계적 SAP-write 차단** 갭 때문에 현재 상태는
  **`attended-only` · `unattended=sealed`**다. **해제는 재기준 v2 §7의 U-gate + 별도
  사용자 D-결정 없이는 불가**하며, 그 전에는 무인 실행을 실행 구조로 채택하지 않는다.
  **RV4를 "닫힘"으로 기록하는 것을 금지한다.**

---

## ⑬ 알려진 한계 (정직 표기)

- **vsp 바이너리 무결성은 레포 밖**: final-harness의 verify 위임 타겟 감사는 리포 내
  타겟만 커버하고 **vsp 바이너리는 범위 밖**(F5). 무결성은 사람이 `vsp.lock.json`의
  **sha256 핀**으로 관리한다 — verify에 넣는 바이너리가 이 해시와 일치하는지
  부트스트랩/갱신 시 확인하고, vsp 갱신은 lock 재검증 후에만 올린다(D-018). **현행
  핀은 `v2.38.1-94-g5a8bedb`**(2026-07-19 갱신 — §① 기준 버전 참조. 아래 나머지
  항목은 2026-07-13/16 원 기록을 그대로 보존한다).
- **Bash 우회는 기계 봉쇄 밖**: `block-dangerous-bash`가 vsp를 모르므로(F7) child의
  Bash→vsp 경로는 훅으로 못 막는다. 방어는 자격증명 스코핑(§⑥)과 verify다.
- **`authority-gate.py`가 vsp를 모른다 (RV4의 뿌리)**: candidate `d4a0aeb`에서도 동일
  (§⑪ · D-028). `deploy=false` 권한 설정이 `vsp deploy`를 막지 못한다.
- **vsp-native allowlist/read-only 플래그 부재 — 2026-07-19 부분 정정**: `package
  allowlist` 내장 강제 부재는 현재도 유효하다(§⑧). `read-only 강제`는 더 이상
  부재가 아니다 — vsp-custom `5a8bedb`가 신설한 write_profile_gate가 §⑧·§⑩에서
  기계 강제로 실증됐다(상세는 §① 핵심 명제 갱신 주석 참조).
- **리뷰 스텝의 phase-공통 자격증명**: §⑤·§⑪-RV4의 갭. 1차 방어는 §⑥ role별 분리,
  항구 봉쇄는 이연.
- **`transport list`/`get` 출력 형상 미실측**: lock `command_contract` 미등재. P4
  inventory 계약이 여기 의존하므로 S5-A 실측 전까지 확정하지 않는다(§⑦).

---

## ⑭ 규칙 정합 (RULES.md)

- **R-002** — vsp는 CLI 전용(MCP 서버 모드 금지). 본 문서의 3 프로파일 전부 CLI 경로;
  리뷰어의 SAP 읽기도 vsp CLI read-only로만(스펙 §5-10).
- **R-003** — write는 dev tier 한정. gated write 프로파일 `SAP_TIER=dev`; §⑩ 프로브 2가
  QA 거부를 재현.
- **R-005** — SAP 접속 정보·`.env` 레포 커밋 금지. §⑥ + `.gitignore` 확인.
- **R-006** — write 후 `vsp source read`로 반영 확인, v2.38.1-89 미만으로 CLAS
  deploy/copy 금지. §⑥ + 현행 lock v2.38.1-94 충족.
