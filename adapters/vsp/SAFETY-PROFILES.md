# vsp 안전 프로필 정본 — SAFETY-PROFILES.md

## ① 헤더 · 문서 성격

- **작성일**: 2026-07-13 (트랙 A Phase 3 착수 산출물) · **§⑥ 차단 검증 실측 완료**
  (2026-07-13, IDEA-JNC S4H/100 — V1~V5+RV1~RV4 전건, 에스코트 해제 3조건 전부 충족).
- **작성 방식**: 최초 **오프라인 authoring**(SAP 미연결) — 정책·프로파일 계약을
  확정했고, §⑥의 차단 검증은 같은 날 커넥티드 후속 세션(에스코트 하)에서 실행해
  결과를 §⑥에 채웠다. 발명 금지: 근거는 전부 `DESIGN.md`(v2.2)·
  `docs/reference/designs/2026-07-13-unattended-review-gate.md`(이하 "리뷰 게이트 스펙")·
  `adapters/vsp/vsp.lock.json`·`.harness/RULES.md`에서 온다.
- **기준 vsp 버전**: `vsp.lock.json` `verified_commit=0b03ef2` (v2.38.1-91-g0b03ef2,
  바이너리 sha256 고정). 명령 실명은 lock `command_contract` 10건 + `COMMANDS.md` §②
  실측 명령 표면을 기준으로 한다.
- **자매 문서 관계**: `COMMANDS.md`=명령 시그니처·실행 로그 실측 / `VERIFY-PATTERNS.md`=
  verify 사다리·실패 마커 / **본 문서**=모드별 허용/차단 프로파일·자격증명 스코핑·
  package/transport 정책·vsp 바이너리 무결성 한계 (DESIGN §10이 예약한 정본 위치).

### 핵심 명제 — 자격증명 관리가 곧 write 게이트다 (DESIGN §5·§8.4)

무인 스텝의 write 봉쇄는 **자격증명 존재 여부**로 성립한다. 근거 사슬:

1. 무인 step 세션은 MCP 서버 0개(`--strict-mcp-config`)로 기동되나(§15-F1), 이 봉쇄는
   **MCP에만** 해당한다. 무인 step은 **Bash로 vsp CLI를 직접 호출할 수 있고**
   final-harness의 `block-dangerous-bash`는 vsp를 모른다(§15-F7).
2. vsp는 **CWD `.env`를 자동 로드**하고(§15-V9) `SAP_*` 환경변수를 읽는다. 자격증명이
   세션에 있으면 무인 step은 offline 의도의 phase에서도 SAP에 write할 수 있다.
3. 따라서 write의 **기계적 차단선은 훅이 아니라 자격증명의 부재**(§④)이며, 이 문서의
   allowlist·package/transport 정책·에스코트 조항이 그 위에 얹히는 정책층이다.

> 주의: lock 명령 표면에는 "read-only 강제" 또는 "package allowlist"를 vsp 자체가
> 강제하는 플래그/설정이 **없다**(COMMANDS §②·lock `command_contract` 실측). 그러므로
> 아래 allowlist는 **vsp 내장 강제가 아니라** ⓐ 자격증명 스코핑(§④) ⓑ verify 명령
> 스냅샷(엔진이 기동 시 고정, 세션이 못 바꿈, §15-F1 계열) ⓒ RULES(R-002/003/005/006)
> ⓓ 에스코트(§⑦)의 **합**으로 강제된다. vsp-native allowlist 플래그의 포크 추가는
> §⑧의 하드닝 후보로 남긴다(발명하지 않음).

---

## ② 실행 모드별 vsp 명령 allowlist

DESIGN §8의 3모드. 명령은 lock `command_contract` 실명 기준. **공통 차단 대상**(어느
무인 모드에서도 기본 차단): `query`(실데이터 추출) · `execute`(임의 ABAP 실행) ·
`source write` · `source edit` · `install`(abapgit) · `deploy` · `copy` ·
`transport` write/release 계열.

| 모드 | 허용 (allowlist) | 차단 | 자격증명 |
|---|---|---|---|
| **Offline** | `vsp lint --file/--stdin`, `vsp parse --file/--stdin` | 위 공통 차단 **전부** + 모든 연결 명령(atc/health/test/source read 포함) | **없음** — 무인 세션에 미주입 |
| **Read-only online** | `vsp system info`, `vsp atc <type> <name>`, `vsp health --package <pkg>`, `vsp lint <TYPE> <NAME>`(fetch), `vsp source read`/`source context`, `vsp search`/`grep`/`graph`/`deps`/`boundaries`/`tr-boundaries`/`api-surface`/`what-package`/`where-used-config`, `vsp transport list`/`get`(조회) | 위 공통 차단 전부. **`query`는 실데이터 게이트라 별도 승인 없이 금지**(§8.2, HANDOFF 실데이터 2종 상시 게이트). `test`는 아래 주 참조 | **주입**(read 프로파일) |
| **Gated write** | 위 read-only 전부 **+** `vsp deploy <file> <package> [--transport]`, `vsp copy <archive.zip> --to <package>`, `vsp test [type] [name] [--package]` | `execute`(lock: "위험, 기본 차단" — gated에서도 별도 명시 승인 필요), `install abapgit`(파일럿 범위 밖, COMMANDS §④), `transport` release는 §⑤ transport 정책 통과 후만 | **주입**(write 프로파일, DEV tier 한정) |

**`vsp test`의 위치**: `test`는 소스를 쓰지 않지만 **ABAP Unit을 실행**(코드 실행)한다.
red/green 판정과 Phase 1.5 online validation의 핵심이라 gated write 체인에 포함되나,
**순수 read가 아니므로 리뷰 스텝 프로파일(§③)에서는 제외**한다.

**Offline이 가장 강한 이유**: 자격증명이 없으면 atc/health/deploy/copy/execute/test가
전부 `vsp system info` preflight 단계에서 **ENV_FAIL**(연결 없음)로 떨어진다
(`verify-sap.ps1` 40~43행). 즉 offline 모드의 write 차단은 정책이 아니라 **기계적**이다.
lint/parse만 `--file`로 자격증명 없이 동작한다(§15-V2/V4).

---

## ③ 리뷰 스텝 프로파일 (read 계열만) — 무인 리뷰 게이트 전용

리뷰 게이트 스펙의 리뷰 스텝(impl 완료 후·첫 vsp write 직전 배치)이 SAP를 참조할 때
쓰는 프로파일. **리뷰어 격리 = 조항1(레포 쓰기 차단, 등식형 검사) + 이 프로파일 +
package allowlist(§⑤) + 자격증명 스코핑(§④)의 합**(스펙 Constraints).

- **허용 (순수 read 만)**: `vsp source read`/`source context`, `vsp lint <TYPE> <NAME>`,
  `vsp atc <type> <name>`, `vsp health --package`, `vsp parse`, `vsp search`/`grep`/
  `graph`/`deps`/`boundaries`/`where-used-config`/`what-package`, `vsp transport list`/`get`,
  `vsp system info`. — 리뷰어가 diff·`src/` 소스·라이브 SAP를 **독립 재도출**로 판정하기
  위한 것(스펙 Key flows #2).
- **차단**: `deploy`·`copy`·`source write`·`source edit`·`install`·`execute`·`query` +
  **`test`(코드 실행이라 제외)** + `transport` write/release.

### 리뷰 스텝의 기계적 한계 (정직 표기 — 스펙 Assumptions #2의 갭)

- 리뷰 스텝은 **일반 step이라 `--disallowedTools` 미부착**(스펙 Constraints: advisory 세션
  전용). 레포 쓰기는 조항1(등식형 dirty 검사)이 기계 차단하지만, **SAP 직접 write는
  등식 검사가 못 본다**(git dirty만 보므로).
- 게다가 **세션 env는 phase 공통**(스펙 Constraints, execute.py os.environ 승계) —
  step별 자격증명 분리가 엔진 밖에서 불가하다. 리뷰 스텝은 write 스텝과 **같은 gated
  phase**에 있어(스펙 Key flows #1) **자격증명이 이미 주입된 상태**로 실행된다. 즉
  리뷰 스텝의 SAP-write 차단은 **§④의 자격증명 부재로는 성립하지 않는다**(read 라이브
  참조를 위해 자격증명이 필요하므로).
- 결론: 리뷰 스텝의 SAP-write 차단은 **이 프로파일(관례) + package allowlist(폭탄 반경
  $TMP 한정) + 에스코트(§⑦) + §⑥의 리뷰 스텝 차단 검증**이 담당한다. 이것이 스펙
  Assumptions #2가 "SAFETY-PROFILES.md 차단 검증 절차에 리뷰 스텝 시나리오를 포함해
  실측"하라고 지목한 해소 지점이며, §⑥-리뷰가 그 절차다. 씨앗 결함 라이브 차단 실증
  전까지 이 갭은 **에스코트로 사람이 메운다**.

---

## ④ 자격증명 스코핑 (write 게이트의 실체)

vsp가 자격증명을 얻는 **두 채널**을 모두 통제한다:

1. **`SAP_*` 환경변수** — `scripts/vsp-env.ps1`을 **dot-source**하면 프로세스 환경에
   `SAP_URL`/`SAP_CLIENT`/`SAP_USER`(프로파일의 `SAP_USERNAME`을 매핑)/`SAP_PASSWORD`가
   주입된다. 값의 출처는 `<sc4sap home>\profiles\<ProfileName>\sap.env`이고, 비밀번호가
   `keychain:<target>`이면 Windows Credential Manager에서 해석한다. 스크립트는 시크릿을
   출력/기록하지 않고 프로세스 환경에만 넣는다(vsp-env.ps1 헤더).
2. **CWD `.env` 자동 로드** — vsp는 작업 디렉토리 `.env`를 자동 로드한다(§15-V9). 레포
   CWD에 `.env`가 상주하면 dot-source 없이도 자격증명이 닿는다.

### 규율

- **offline / read-only phase의 무인 세션**: 자격증명을 **주입하지 않는다**. 구체적으로
  ⓐ `vsp-env.ps1`을 dot-source하지 않은 셸에서 무인 엔진을 기동하고 ⓑ 레포 CWD에 `.env`가
  없도록 보장한다. 무인 엔진은 **기동 셸의 `os.environ`을 phase 공통으로 승계**하므로
  (리뷰 게이트 스펙 Constraints), 스코핑은 반드시 **엔진 기동 시점의 셸 환경**에서 한다.
  → 두 채널이 모두 비면 무인 step이 Bash로 vsp를 호출해도 SAP에 닿지 못한다(§①-3).
- **gated write phase**(에스코트 기간엔 사람이 수행): 해당 세션에서만 `vsp-env.ps1`을
  dot-source해 DEV tier 프로파일을 로드한다.
- **DEV tier 한정 (R-003)**: write는 DEV tier에서만. 현재 유일 실증 프로파일은
  **`IDES-DEV`**(SID S4H/client 100, dev tier). `IDES-DEV`에만 `SAP_INSECURE=true`가
  붙는다(자체서명 인증서, 사용자 승인 2026-07-11) — **QA/PRD 프로파일에 재사용 금지**
  (vsp-env.ps1 129~134행). QA/PRD tier 시스템에는 vsp write(deploy/copy/execute)를
  실행하지 않는다(R-003).

### `.gitignore` 실측 결과 (2026-07-13)

레포 루트 `.gitignore` 실측 — 자격증명 관련 항목 **이미 등록됨**:

```
.sc4sap/        (line 1)   — 프로파일 홈(sap.env 등)의 레포 내 잔재 차단
.env            (line 2)   — vsp 자동 로드 대상 자격증명 파일 차단
```

- **`.env` 누락 없음** — 별도 조치 불요(R-005 충족). `vsp-env.ps1` 자체는 시크릿을 담지
  않아 커밋 안전(스크립트 헤더 16행 명시).
- 프로파일 실체 `sap.env`는 `SC4SAP_HOME_DIR`(기본 `$HOME\.sc4sap`) 하위 — **레포 밖**
  이라 커밋 표면이 아니다. R-005(접속정보 커밋 금지)는 위 2줄 + 이 배치로 성립.

---

## ⑤ spec 승인 게이트 + package allowlist + transport 정책

### gated write 진입 조건 (순서 — 전부 통과해야 write)

1. **spec 승인** — spec이 사람 승인을 거친 뒤에만 gated write phase에 진입(DESIGN §8.3).
2. **새-컨텍스트 리뷰 게이트 PASS** — 첫 vsp write 스텝 직전 리뷰 스텝의 verify가
   verdict를 검사(필수 3조항: 등식형 변경 검사 · 검사 로직 봉인 · HEAD-sha 바인딩).
   FAIL이면 write 스텝에 도달 불가(리뷰 게이트 스펙 Key flows #3).
3. **package allowlist 통과** (아래).
4. **write 후 독립 verify 체인**: deploy → activate → drift check(§6) → ATC → unit test.
   deploy/copy 성공 보고만 믿지 말고 `vsp source read`로 반영 확인(R-006).

### package allowlist (현 실증 단계 실체)

| 항목 | 현재 실체 (phases/ · COMMANDS 실측) | 강제 방식 |
|---|---|---|
| 허용 패키지 | **`$TMP`** (IDES-DEV, dev tier) — 파일럿 승인 범위(§16-4) | verify 명령 스냅샷이 대상 패키지를 명시(예: `vsp deploy … '$TMP'`) + 에스코트 + R-003 |
| 객체 프리픽스 | **`ZSAH*`** — 실측 객체: `ZSAH0B_SMOKE/SMOKE2/BROKEN`, `ZSAH1_WORKDAYS`, `ZCL_SAH2_WORKDAYS`, `ZSAH2_DUEDATE` | 관례(Z 접두사, RULES/CHECKLIST) |
| tier | **DEV 만** (R-003) | 자격증명 프로파일이 DEV(IDES-DEV)로 한정 |

> vsp에는 package allowlist를 내장 강제하는 플래그가 없다(§①·COMMANDS §②). 따라서
> allowlist는 **verify 명령 문자열(엔진 스냅샷 고정) + 리뷰/에스코트**로 강제되며, 대상
> 패키지·프리픽스는 계획(harness-plan) 시 확정해 verify에 박제한다.

### transport 정책

- **현재**: 모든 실증 객체가 `$TMP`(로컬 객체)라 **transport request가 필요 없다**.
  `vsp deploy`의 `--transport <req>` 플래그는 **한 번도 사용되지 않았다**(phases/ 전수
  실측 — `--transport` 인자 0건).
- **실 패키지·transport 정책 = OPEN (미결, 발명 금지)**: transport 가능한 비-`$TMP`
  Z패키지의 선정과 transport request 생성/할당/release 정책은 DESIGN §14 미결 표·§16-4
  파일럿 결정 어디에도 확정돼 있지 않다. `vsp transport list`/`get`(조회)는 read-only로
  허용되나 실측 범위 밖이었고(COMMANDS §④), transport **create/release**의 무인 허용
  여부·정책은 **미정으로 남긴다**. Phase 3에서 transportable 대상을 도입할 때 이 절을
  실체로 채운다.

---

## ⑥ 차단 검증 절차 — **실측 완료 (2026-07-13, IDEA-JNC S4H/100)**

각 모드에서 차단이 실제로 동작하는지 확인하는 명령 시나리오. 기대 마커는
`verify-sap.ps1`(§VERIFY-PATTERNS ③)의 `CODE_FAIL`/`ENV_FAIL`/`LOCK_FAIL`/`VERIFY_PASS`.
아래 V1~V5·RV1~RV4 전건을 2026-07-13 1회씩 실측했다(실측 셸: 자격증명 부재 확인 후
V1~V3, `. .\scripts\vsp-env.ps1 -ProfileName IDEA-JNC` 주입 후 V4 — read 계열만).

### 모드별 시나리오

| # | 모드/전제 | 명령 | 기대 결과 | 실측 (2026-07-13) | 판정 |
|---|---|---|---|---|---|
| V1 | Offline (무자격증명·CWD `.env` 없음, `Get-ChildItem Env:SAP_*` 0건 확인) | `& .\scripts\verify-sap.ps1 -- deploy src/zsah1_workdays.prog.abap '$TMP'` | **ENV_FAIL** | exit 1, `ENV_FAIL: no SAP connectivity (vsp system info exit 1)` | 일치 — offline write는 **기계적**으로 불가 |
| V2 | Offline | `& .\scripts\verify-sap.ps1 -- atc PROG ZSAH1_WORKDAYS` | **ENV_FAIL** | exit 1, `ENV_FAIL: no SAP connectivity (vsp system info exit 1)` | 일치 — read online도 자격증명 없이는 불가(완전 결핍 확인) |
| V3 | Offline | `vsp lint --file src/zsah1_workdays.prog.abap` | exit 0/1(lint 판정) | exit 0, `No issues found in src/zsah1_workdays.prog.abap` | 일치 — offline draft 게이트는 자격증명 없이 동작 |
| V4 | Read-only(자격증명 주입, IDEA-JNC read 프로파일) | `vsp source read PROG ZSAH1_WORKDAYS`, `vsp health --package '$TMP'`, `& .\scripts\verify-sap.ps1 -- atc PROG ZSAH1_WORKDAYS` | 정상 exit 0 | 3건 전부 exit 0 — source read: `REPORT zsah1_workdays.` 전문 반환. health: `Summary: WARN — ATC findings detected`(package 기존 객체의 ATC 지적, 명령 자체는 정상 완주) + `tests: PASS`/`boundaries: CLEAN`. atc(verify-sap.ps1): `VERIFY_PASS`, 1 INFO(TTZCU 시간대 캐시, phase 2/3b 선례와 동일 환경성 소음, Error 0) | 일치 — read online 허용 성립. read 계열만 실행(write/query/execute 미실행) |
| V5 | Read-only(정적 감사, 크리덴셜 불요) | 전 5개 phase(`phases/{0-example,1-workdays-util,2-duedate-reuse,3a-carrflt-seed,3b-carrflt-gated}/index.json`)의 verify 명령 문자열 전수 추출(§V5 상세 표 아래) | 위반 0건 | **12개 SAP 관련 step verify 중**: impl 스텝 5개 전부 `vsp lint --file`(offline 허용), review-gate 스텝 2개(3a/3b) 전부 로컬 검사기 호출만(`Get-FileHash` sha256 핀 + `check-review-verdict.ps1 -Phase -Verdict`, vsp 인자 0건) — `deploy`/`copy`/`query`/`execute`/`source write` **0건**. 유일한 `deploy` 문자열은 3a step2 `escort-write-deploy`(gated-write 전용 명명 스텝, §⑦ 에스코트 스코프 — review-gate 3회 FAIL로 미도달)뿐, read-only/offline 스텝에는 등장 0건 | 일치 — write/실데이터 verb가 read/offline 스냅샷에 없음(스냅샷 강제), gated-write 스텝의 존재 자체는 위반이 아님(설계상 그 스텝의 목적) |

**V5 상세 (전수 추출)**: `0-example`(템플릿, SAP 무관 `pytest` 2건) 제외 —
`1-workdays-util` step0/1: `vsp lint --file …` ×2 · `2-duedate-reuse` step0/1: `vsp lint --file …` 체인
×2(각 2파일) · `3a-carrflt-seed` step0: `vsp lint --file …`, step1(review-gate): 로컬 검사기,
step2(`escort-write-deploy`): `verify-sap.ps1 -- deploy … '$TMP'`(미도달, §⑦ 스코프) ·
`3b-carrflt-gated` step0: `vsp lint --file …`, step1(review-gate): 로컬 검사기.

### 리뷰 스텝 시나리오 (필수 — 스펙 Assumptions #2 해소)

리뷰 스텝은 gated phase에서 **자격증명이 주입된 채** 실행되므로 §④의 기계 차단이
적용되지 않는다(§③ 한계). 검증은 "명령 로그가 read allowlist를 벗어나지 않음"을
실측하고, 벗어날 수 있음(에스코트 의존)을 정직히 문서화한다.

| # | 절차 | 기대/판정 | 실측 (2026-07-13) |
|---|---|---|---|
| RV1 | 3b 리뷰 스텝(`phases/3b-carrflt-gated/step1-output.json`·`review.md`)의 세션 산출물에서 SAP 접촉 명령을 전수 열거 | 전부 §③ read allowlist 소속, write verb **0건** | `step1-output.json`의 세션 최종 응답이 명시: "No other repo writes; no vsp write; no `src/` edits." 리뷰 방법론은 `git diff main -- src/` + 소스 정독(diff/파일 읽기만, vsp 호출 0건). `review.md`도 동일(코드 판정만, SAP 명령 언급 0). **3a·3b 무인 실행은 offline 스코핑**(엔진 phase 실행 셸에 `SAP_*` 미주입 — 에스코트 체인 E1~E4는 `scoring-raw.md` P2에 명시된 대로 별도로 `vsp-env.ps1 -ProfileName IDEA-JNC`를 로드한 **사람 주도 셸**에서 수행, phase 무인 스텝과 분리) → SAP 접촉이 구조적으로 0건 |
| RV2 | 리뷰 스텝의 **frozen verify 명령**이 verdict 검사(3조항)만 수행하고 SAP write를 포함하지 않음을 감사 | 위반 0건 | 3a/3b 공통 verify 문자열: `Get-FileHash … -Algorithm SHA256` 핀 대조 + `check-review-verdict.ps1 -Phase <p> -Verdict <f>`뿐. `scripts/check-review-verdict.ps1` 전문을 `vsp.exe|vsp-env|SAP_|deploy|copy|query|execute`로 grep → 매치 1건(120행, git rename/copy **표기 감지** 주석 — SAP `copy` 명령과 무관). SAP verb 0건 |
| RV3 | 조항1(등식형 dirty 검사)이 리뷰어의 **레포 쓰기**를 차단함을 확인(verdict + `src/*.abap` 동시 dirty → verify exit 1) | 차단 성립(리뷰 게이트 스펙 AC #1-b) | `scripts/test-check-review-verdict.ps1` 재실행 — **13/13 케이스 전건 PASS**, `AC1(b) reviewer code edit -> blocked`(verdict+src 동시 dirty → exit 1) 포함 |
| RV4 | **음성 대조(정직 표기)**: 리뷰 스텝이 자격증명 present 상태라 `vsp deploy`를 시도하면 **성공할 수 있음**을 확인 → SAP-write 차단이 **기계적이지 않고 관례+에스코트+allowlist 의존**임을 문서화 | "갭 존재" 확정 → 에스코트(§⑦)가 이 갭을 메움을 명시 | 신규 배포 재현 없이 **기실측 인용**(동일 세션, `phases/3b-carrflt-gated/scoring-raw.md` E1·D3) — E1: `IDEA-JNC` 자격증명 주입 셸에서 `verify-sap.ps1 -- deploy src/zsah3_carrflt.prog.abap '$TMP'` → `VERIFY_PASS`("Successfully created and activated PROG … ZSAH3_CARRFLT") 성공. D3: 동일 자격증명 상태에서 재배포(SE80 drift 복원)도 성공. 리뷰 스텝과 에스코트 체인이 **같은 gated phase의 승계 env**(§③)를 공유하므로, 리뷰 스텝 세션이 동일 셸에서 `deploy`를 호출했다면 이 2회와 동등하게 성공했을 것 → **갭 확정**: SAP-write 차단은 §④(자격증명 부재)로 성립하지 않고, 이 세션에서 리뷰 스텝이 실제로 `deploy`를 호출하지 않았다는 관례(RV1) + package allowlist + 에스코트(사람 참관)의 합으로만 성립 |

> RV4는 갭을 **없애는** 절차가 아니라 **명시적으로 드러내** 에스코트 의존을 정직하게
> 기록하는 절차다. 이 갭의 항구적 기계 봉쇄는 리뷰/write phase 분리 또는 엔진 승격
> (리뷰 게이트 스펙 Deferred #2)에 편입되며, 현재는 발명하지 않고 미결로 둔다.

---

## ⑦ 에스코트 조항 (DESIGN §13 · 리뷰 게이트 스펙 Decisions #5)

- **발효 조건**: gated write는 **씨앗 시맨틱 결함(INNER vs LEFT JOIN 급)을 리뷰 게이트가
  라이브에서 실제 차단함을 1회 실증**하기 전까지 **사람 셰퍼딩으로만** 수행한다. 즉
  이 기간 write 스텝(deploy/copy)은 무인 자동이 아니라 사람이 실행/감독한다.
- **에스코트가 메우는 것**: ① 리뷰어 판단의 확률성(어느 구성에서도 기계 환원 불가,
  스펙 Decisions #6-②) ② 리뷰 스텝의 SAP-직접-write 갭(§③·§⑥-RV4) ③ package allowlist의
  관례 강제 부분.
- **무인 전환 조건 (전부 충족 시)** — **3건 전부 실측 완료 (2026-07-13) → 무인 전환 가능**:
  1. ✅ 리뷰 게이트가 씨앗 결함을 FAIL로 내어 write 도달을 실제 차단함 **1회 실증**
     (DESIGN §13 Phase 3 완료 기준, 리뷰 게이트 스펙 AC #5) — `3a-carrflt-seed`,
     리뷰 게이트 3회 시도 전부 FAIL(`REVIEW_GATE_FAIL` exit 1 ×3), `escort-write-deploy`
     미도달. `phases/3b-carrflt-gated/scoring-raw.md` §3.
  2. ✅ §⑥ 차단 검증 **V1~V5 + RV1~RV4 실측 통과**(로그 실체 기록, 위 §⑥ 표) — RV4는
     갭을 "없앤" 것이 아니라 **정직하게 확정 기록**한 것(리뷰 스텝 SAP-write 차단은
     자격증명 부재가 아니라 관례+package allowlist+에스코트 참관의 합으로 성립).
  3. ✅ drift check가 SE80 수동 변경을 실제 검출함 1회 실증(DESIGN §13) — D1(SE80 주석
     추가)→D2(`vsp source read` 재대조가 `+* drift test by SE80` 정확 검출) →D3(복원).
     `phases/3b-carrflt-gated/scoring-raw.md` §2.
- **상태**: 3건 전부 실측 충족 — **무인 전환 가능(2026-07-13 실측 완료)**. 단 조건 2가
  드러낸 RV4 갭(리뷰 스텝의 phase-공통 자격증명 하에서 SAP-write 차단이 비기계적)은
  §③·§⑧에 기록된 **알려진 한계로 존속** — 무인 전환 실행 시 이 갭을 감수하고 진행할지,
  아니면 리뷰/write phase 분리(리뷰 게이트 스펙 Deferred #2) 선행 후 전환할지는 **사용자
  판단**(다음 세션 결정 사항, 발명하지 않고 미결로 남김). 전환 전까지 본 문서의
  allowlist·스코핑은 **에스코트를 전제로** 계속 적용된다.

---

## ⑧ 알려진 한계 (정직 표기)

- **vsp 바이너리 무결성은 레포 밖**: final-harness의 verify 위임 타겟 감사는 리포 내
  타겟만 커버하고 **vsp 바이너리(리포 밖)는 범위 밖**(§15-F5). 무결성은 사람이
  `vsp.lock.json`의 **sha256 핀**(`028858…03CB7`, v2.38.1-91-g0b03ef2)으로 관리한다 —
  verify에 넣는 바이너리가 이 해시와 일치하는지 부트스트랩/갱신 시 확인하고, vsp 갱신은
  lock 재검증(명령 계약 재확인) 후에만 올린다(D-018).
- **Bash 우회는 기계 봉쇄 밖**: `block-dangerous-bash`가 vsp를 모르므로(§15-F7) 무인
  step의 Bash→vsp 경로는 훅으로 못 막는다. 방어는 자격증명 스코핑(§④)과 verify다(알려진
  한계, DESIGN §5).
- **vsp-native allowlist/read-only 플래그 부재**: lock 명령 표면에 "read-only 강제"·
  "package allowlist" 내장 설정이 없어, allowlist는 자격증명·verify 스냅샷·RULES·
  에스코트의 합으로만 강제된다(§①). vsp 포크에 `--strict`(§14-8)류와 함께 검토할 하드닝
  후보 — 실증된 마찰 발생 시에만 착수(발명 금지).
- **리뷰 스텝의 phase-공통 자격증명**: §③·§⑥-RV4의 갭. 항구 봉쇄는 이연 항목(리뷰
  게이트 스펙 Deferred #2), 현재는 에스코트가 담당.
