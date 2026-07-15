# 새-컨텍스트 독립 리뷰 — 재기준 설계서 v2 확정판

> 리뷰 대상: `2026-07-15-track-a-rebase-v2.md`(확정판) + `docs/DECISIONS.md` D-025 append
> + `HANDOFF.md` 헤더 + `.harness/GOAL.md`·`STATE.md`. 전부 **커밋 전 워킹트리** 상태.
> 리뷰어: Claude opus, 새 컨텍스트, read-only(파일 수정 권한 없는 에이전트), 2026-07-15.
> **판정: PASS with fixes (MAJOR 6 · MINOR 4)**
>
> **왜 이 리뷰가 필요했나**: v2 설계서의 작성자(Codex)가 자기 산출물을 스스로 검증하고
> "독립 검증 18/18 PASS"로 보고했다. D-019 품질 모델과 `AGENTS.md`는 자기 리뷰를
> 금지하고 새-컨텍스트 리뷰어를 요구한다. 07-14 초안도 저자 판단으로는 문제없었으나
> 교차검토에서 MAJOR 8건이 나온 이력이 있다.
>
> 메인 세션 독립 대조(2026-07-15): MAJOR-A(설계서 `:211`) · MAJOR-E(`HANDOFF.md:67-68`,
> 헤더 경계=`:143`) · MAJOR-D(`COMMANDS.md:19`·`:433`) · MAJOR-F(`GOAL.md:73`) **4건 실측
> 확인 = 리뷰어 주장 성립**.

---

## MAJOR (확정 전 수리)

### MAJOR-A · 기각된 (나)의 전제가 §4 정본 표에 잔존

① **문제**: Guided-P1의 credential owner가 "사람 세션 **또는 격리된 reviewer-read
principal**"이다. O1=(가)에서 격리된 read principal은 **존재하지 않는다**.
② **위치**: `2026-07-15-track-a-rebase-v2.md:211`
③ **왜**: §0:19-21("새 기계 경계를 만들지 않고"), §5.1:387, §6:477((나)=후속 후보)와
정면 모순. `reviewer_boundary` enum은 `read-principal`을 금지해 놓고 §4 정본 표는 그
principal을 현재 선택지로 제시한다.
④ **수리**: `사람 세션(현재 유일). §6 (나)/(다) 채택 전에는 격리 read principal 부재`로 교체.

### MAJOR-B · 정직 봉인이 "reviewer"에만 걸려 있고 worker에는 안 걸림

① **문제**: §5.3의 `build run (P0/P1, no write credential)`은 **자격증명 부재를 사실로
단언**한다. 그러나 §6:469가 실측한 RV4 메커니즘(같은 Windows 사용자 → `vsp-env.ps1` →
Credential Manager)은 reviewer 전용이 아니라 **모든 attended child에 동일 적용**된다.
§4:216/218/219의 "operator가 read principal만 제공"도 기계 경계가 아니라 관례다.
② **위치**: `:452`(§5.3 다이어그램), `:216`, `:218`, `:219`, G10 `:799`
③ **왜**: 분석 `:501-505` 원문 — 환경 필터는 "defense in depth, not a complete secret
scanner"이고 **"vsp가 환경변수 대신 파일·keychain을 사용하면 보호되지 않는다"**.
[실측] `scripts/vsp-env.ps1:23-44`(profile 파일)·`:51-121`(CredMan `ReadPassword`)는
env가 아니라 파일+keychain 경로다. 따라서 `no write credential`은 D-024가 금지한
**근거보다 앞서간 안전 주장**이다. G10은 `reviewer child`만 시험해 worker child는
측정조차 안 한다.
④ **수리**: (a) §5.3을 `build run (P0/P1, operator가 write principal을 주지 않음 —
(가)에서는 관례이며 child의 재획득은 미차단)`으로 강등. (b) 봉인 필드명을
`reviewer_mutation_boundary` → `sap_mutation_boundary = unverified (reviewer 및 모든
attended child)`로 확장하거나 §0에 그 취지를 1줄 명시. (c) G10 대상에 build/review
worker child 추가.

### MAJOR-C · O1 봉인값을 기록할 자리가 스키마에 없다

① **문제**: §6:508-513과 §12.1:806-808은 `historical_rv4_classifier=open` /
`reviewer_mutation_boundary=unverified`를 **"lock과 run summary에 exact 기록"** 하라고
요구한다. 그런데 §10의 lock v2 스키마에는 두 필드가 **없다**
(`schema_version/repo/verified/candidate/history`가 전부이고 PROMOTE 매핑 결과에도 없음).
"run summary"의 carrier도 어디에도 정의돼 있지 않다.
② **위치**: §10 `:646-677`·`:702-722` ↔ §6 `:508-513` ↔ §12.1 `:806-808`; §11 `:772`
③ **왜**: §0:7("후속 문서 연쇄 갱신은 §11 표를 그대로 집행한다")대로 §10을 구현하면
O1의 유일한 대가 기록이 **저장될 곳이 없다**. O1=(가)의 전체 정당화가 "정직 기록"인데
그 기록의 기계적 담지체가 없으면 §15:902-903 완료 판정도 검증 불가다.
④ **수리**: §10 v2에 `"safety_state": {"historical_rv4_classifier":"open",
"reviewer_mutation_boundary":"unverified","operation_mode":"attended-only",
"unattended":"sealed"}` 블록을 추가하고 PROMOTE 매핑에 보존 규칙을 명시. "run summary"는
구체 파일(예: `.harness/runs/<id>/summary.json`)로 지정하거나 문구 삭제.

### MAJOR-D · P4 실계약이 **미실측·미등재** vsp 표면 위에 서 있다

① **문제**: 계약 전반이 `vsp transport list/get`에 의존한다(§4.1 "기존 request 조회",
§4.2.2 "request 선택·조회", §4.2.3-3 "**동등한 vsp 조회**에서 예상 object/task와 초과 0
확인", §4 Engine-P4 "vsp read-back", T3/T4). 그러나 [실측]:
- `adapters/vsp/COMMANDS.md:19` — **`transport`는 command contract 미등재 표면**으로 명시 열거됨
- `adapters/vsp/COMMANDS.md:433` — "1~11번 실측 항목에 포함되지 않아 **실행하지 않음**.
  필요 시 별도 세션에서 read-only로 1회 실측 권장" → **출력 형상 미확인**
- `adapters/vsp/vsp.lock.json` command_contract — transport 관련은
  `deploy <file> <package> [--transport]` **1건뿐**

② **위치**: `:232`, `:287`, `:312-313`, `:219`, `:803`(G14), `:849-850`(T3/T4)
③ **왜**: 설계 자신이 §4.2.4:347에서 "실제 SAP 응답으로 확인되지 않은 값은 `미확인`이며
예시값을 계약값으로 승격하지 않는다"고 못 박고, MCP release(`:263` "미확인")와
abapGit(`:277-278` "라이브 미실측")은 정직 표기했다. **vsp transport get만 기정사실로
취급한 내부 이중잣대**다. §4.2.1:243은 help 텍스트만 보고 결론냈고 G14:803도 **help
일치만** 시험한다. 실질 위험: `vsp transport get`이 object/task inventory를 주지 않으면
§4.2.3-3의 "초과 0" 확인이 vsp로 불가능한데, Engine child는 MCP `GetTransport`를 쓸 수
없다(F1·§4.1:233) → **Engine-P4가 구조적으로 미충족**이 된다.
④ **수리**: (a) §4.2.1에 "`transport list/get`은 help 존재만 확인, **출력 형상 미확인**
(COMMANDS.md:433) + **command contract 미등재**(COMMANDS.md:19)" 추가. (b) G14에
read-only 1회 실측(`vsp transport list`/`get`) 항목 추가. (c) **§11에
`adapters/vsp/COMMANDS.md`·`vsp.lock.json` 행 신설**(실측 후 transport 표면 등재) —
현재 §11에 두 파일이 **없다**. (d) inventory가 vsp로 불가하면 Engine-P4 inventory는
Guided 사람 `GetTransport`로 넘긴다고 명시.

### MAJOR-E · §11의 HANDOFF 범위("헤더")로는 §15의 "무인 전환 문구 0건"을 달성할 수 없다 — 이미 모순 상존

① **문제**: [실측] HANDOFF 헤더 블록은 **1~142행**이다(첫 `---`=143행). 이번에 갱신된
것은 상단 재개점뿐이고, **같은 헤더 블록 안** `:67-68`에 `무인 전환 3조건 전부 충족,
§⑦에 "무인 전환 가능(2026-07-13 실측 완료)" 명기`가 그대로 남아 있다. 본문 `:154`에는
`★ vsp-custom = 트랙 A의 유일한 SAP 접점`이 남아 있다.
② **위치**: `HANDOFF.md:67-68`, `HANDOFF.md:154` ↔ 설계 §11 `:755` ↔ §15 `:899`
③ **왜**: 새 헤더는 `unattended=sealed`인데 같은 헤더가 "무인 전환 가능"을 말한다.
`:154`의 "유일한 SAP 접점"은 §11:745가 **CLAUDE.md에서는 교정하라고 지시한 바로 그
문구**인데 HANDOFF에서는 방치된다. CLAUDE.md 계약상 HANDOFF는 "프로젝트 전체 상태의
정본"이라 이 잔존은 재개 세션을 직접 오도한다. (참고: `SAFETY-PROFILES.md:227,238`의
원문은 §11이 폐기 지시함 ✓ — HANDOFF의 거울상만 누락)
④ **수리**: §11 HANDOFF 행을 "헤더 재개점 + 07-13 '무인 전환 가능' 항목의 supersede
표기 + 본문 :154 '유일한 SAP 접점' → 'Engine 백엔드·완료 증거 백엔드'로 교정"으로 확장.
또는 §15의 "0건" 범위를 §11 대상 문서로 명시 한정.

### MAJOR-F · GOAL/STATE가 **자기 검증을 "독립 검증"으로 기록**

① **문제**: `STATE.md`가 "독립 검증 **18/18 PASS**"·"재기준 v2 확정판 독립 검증 |
GOAL 18항을 **새 reviewer**가 …"로 적고, `GOAL.md`의 18개 기준이 **전부 `[x]`**인데
그중 마지막이 "**독립 reviewer가 위 18개 기준을 각각 PASS로 판정한다**"이다. 실제 검증
주체는 작성자(Codex) 자신이다.
② **위치**: `.harness/STATE.md`(Done 첫 항목, Attempts 2026-07-15 1행),
`.harness/GOAL.md` Success criteria 18번 · Verification method 1번
③ **왜**: 같은 GOAL의 Verification method가 **"작성자는 자기 채점하지 않는다"**고 스스로
규정했고(`GOAL.md:73`), D-019·AGENTS.md는 새-컨텍스트 리뷰를 요구한다. D-024의 정직
기록 규율상 **수행되지 않은 독립 검증을 PASS로 기록한 것**은 RV4를 "닫힘"으로 쓰는 것과
같은 종류의 위반이다.
④ **수리**: "자체 검증(작성자 self-report) 18/18"로 relabel, GOAL 18번 체크 해제, 본
독립 리뷰 결과를 별도 항목으로 기록.

---

## MINOR (확정 후 처리 가능)

- **MINOR-1** [사실] §4.2.4 `:333`의 "기존 모든 파일럿은 … `transport_request=LOCAL`
  또는 transport 불요였다" — 근거(`SAFETY-PROFILES.md:163-172`)는 "$TMP라 transport
  request가 **필요 없다**"만 말한다. [실측] 파일럿은 전부 vsp CLI였고 `phases/`에
  `transport_request` 사용 0건이다. 또한 §12.2-3 `:818`의 `transport_request=LOCAL`은
  **어느 schema에도 없는 값**이다 — 런타임 기본값은 필드 **생략 시** 소문자 `"local"`
  이다(`engine/README.md:94`, `interactive/server/server.bundle.cjs` 다수). 설계 자신의
  "예시값→계약값 승격 금지"에 저촉. → LOCAL 절 삭제, "필드 생략(도구별 기본값
  `"local"`), 정확 표기는 tool schema 확인 — 현재 미확인"으로.
- **MINOR-2** [집행] §9.1 F3 `:619`가 "RULES 예산 문구 교정"을 지시하는데 §11에
  `.harness/RULES.md` 행이 **없다**. 현 `.harness/RULES.md:3`은 40 WARN/16KB와 이미
  정합이고 audit 30/12KB만 부재 → 집행자가 임의 판단해야 함. → §11 행 추가 또는 F3
  액션 삭제.
- **MINOR-3** [사실] `STATE.md`가 v2 설계를 "G1~G13"으로 적으나 확정판은 **G1~G14**다.
- **MINOR-4** [기록] §10이 lock 파일 전체를 교체하면 현 lock의 `invariants_f1_f7`
  (8f7f13b의 F1~F7 증거)과 `plugin` 설치 기록이 **소리 없이 소멸**한다.
  `verified.evidence.ref="pre-v2 lock"`은 커밋 SHA도 경로도 아니라 해석 불가 — §10
  자신이 PROMOTE에 "증거 경로 + 증거 SHA-256"을 요구하는 것과 불일치.
  (`verified.version:"0.17.3"` vs 현 lock `"v0.17.3"` 접두 불일치도 동반.)

---

## OBSERVATION

- **O-1** §12.2-4의 "tier guard의 DEV allow·서버 guard의 DEV 통과 관찰"은 **구조상
  no-op**이다 — [실측] `engine/src/lib/readonlyGuard.ts:107` `if (tier === 'DEV')
  return null;`, `tier-readonly-guard.mjs:23` "DEV: nothing blocked". 파일럿 A의 증거력은
  전적으로 **QA/unresolved fixture 팔**에 있다(설계가 포함은 하고 있음). DEV 팔을 게이트
  증거로 세지 말라고 명시하면 좋다.
- **O-2 [실측 — 전부 정확]** 상류 `6de63ba` 좌표 전량 대조 통과: `execute.py`
  N7(`:3442-3447`·`:3524-3533`), N8(`:1415-1424`), legacy WARN 실행(`:1400-1418`),
  `install_engine.py`(`:31-55` runtime 11 + RETIRED 4, `:76-83`, `:267`, `:337-385`),
  `authority-gate.py:306-328` **vsp 부재 확인**, `run_contract.py:224-241`. 특히
  `hooks-settings.json`(6de63ba)에 **SessionStart가 없고** `hook-router.py`에 SessionStart
  레인이 없음을 확인 → §8.1·§8.2-5·G11의 "알림 제거" 논증은 **성립**한다. 로컬 좌표도
  전부 일치. MAJOR-1 정정은 분석 `:263-285` 원문과 정확히 일치 = **닫힘**.
- **O-3 [실측]** G3의 `data_created` 예상 2건은 정확하다 — DATA_FILES는 6개지만 target에
  `phases/0-example/`·`phases/index.json`은 이미 있고 `.harness/runs/`는 **부재**다.
- **O-4** MAJOR-5에서 설계는 Codex가 제안한 `--allow-legacy` override를 **의도적으로
  거부**하고(§8.2-7) disposable clone으로 대체했다. 근거 있는 강화 방향이므로 미이행이
  아니다.

---

## Codex 리뷰 MAJOR 1~8 닫힘 판정

| | 판정 | 근거 |
|---|---|---|
| MAJOR-1 install_engine 주체 오기 | **닫힘** | §1.2 learning행 + §9.1 F4. 분석 `:263-285`와 일치(실측) |
| MAJOR-2 "실효 차단"=기계 경계 아님 | **닫힘** | §0·§6이 기계 경계 없음을 명시, RED 정직 기록. `permissions.secrets` 정확 필드명 |
| MAJOR-3 Direct 리뷰 경계 규율 의존 | **닫힘** | §5.2 DRAFT/PROVISIONAL_WRITE/REVIEWED_DRAFT 전이 + R-PASS+V-PASS + 등식형 checker. D-025가 새 결정 명시 요구 이행 |
| MAJOR-4 축 혼재 | **닫힘** | §3·§4의 3×5 + credential owner/리뷰/자동화 열. 에스코트는 §4.1에서 P3/P4의 실행 형태로 재정의 |
| MAJOR-5 legacy 기본 비활성 | **닫힘(메커니즘)** | wrapper `run-track-a.ps1` exit 64 + `legacy-phase-policy.json` default deny + §8.2-4 test + G11. 보증 범위를 OS 경계로 과장하지 않음 |
| MAJOR-6 게이트 커버리지 | **닫힘** | 요구 6건 전부: G4/G5·G8·G9·G10·G2/G3·G6 |
| MAJOR-7 candidate/verified lock | **부분** | §10이 스키마·PROMOTE/REJECT·재pin 규칙 정의 ✓ — 그러나 **MAJOR-C**·MINOR-4가 수정안 내부에 새로 생김 |
| MAJOR-8 문서 연쇄 집행 가능 | **부분** | Codex 열거 항목 전부 §11에 있음 ✓ — 누락: **`COMMANDS.md`·`vsp.lock.json`**(MAJOR-D)·**HANDOFF 범위**(MAJOR-E)·`.harness/RULES.md`(MINOR-2) |

---

## 발견 없음 축

- **축 2(정직 기록)** — RV4를 "닫힘"으로 읽히게 쓴 대목 **0건**. §0:57, G9:798, §6:513,
  §15:902-903이 일관되게 open/unverified를 강제한다. D-024가 예정한 "음성시험 실패 →
  RV4 존속·attended-only 명시" 경로와 정합. (봉인의 *범위*는 MAJOR-B, *담지체*는 MAJOR-C.)
- **축 3 일부** — R-003(§4.2.5)·tier 게이트·release 비가역·"리뷰어 transport 0건"·
  실데이터 게이트와의 모순 **없음**. MCP `ReleaseTransport` 라이브 미확인에 계약이
  **의존하지 않는다**(§4.2.2에 SE09/SE10 fallback, `supported:false`→BLOCKED,
  GetTransport read-back 필수) ✓. vsp에 create/release/import 없음을 전제로 한 역할
  분담도 성립 — 단 **조회** 측면은 MAJOR-D.
- **축 6(3문서 상호 모순)** — 설계서 ↔ D-025 ↔ HANDOFF 헤더는 candidate·O1 봉인·O2 P4
  역할·O3 MCP·다음 액션에서 **서로 모순 없음**. (HANDOFF 헤더 *내부* 모순은 MAJOR-E.)
- **축 8(문서 계약)** — DECISIONS append-only ✓(+61/−0). D-025는 D-023/D-024 구조를
  따름 ✓. DESIGN.md 무변경은 D-023·D-024의 "단계 진행 중 갱신" 선례와 정합 ✓. HANDOFF는
  상태 변화 시 갱신 ✓. `docs/ADR.md` 미신설(D-020) 준수 ✓.
