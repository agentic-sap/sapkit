# 설계 초안 — execution_owner 발동 구조 수리 (위임이 기본 경로에서 실제로 돌게)

- 상태: **v2 집행 완료 — D-066 (2026-08-04, 커밋 3분할: 코어 `ccc2f5d` · 리뷰어
  `7fa017d` · 문서·범프)**. canary(§3 0단계 — 사용자 실사용) 대기. (v1 → Codex
  `gpt-5.6-sol`·max 교차 검토 "조건부 OK" → 지적 전건 원문 대조 후 반영. 검토 이력 §11)
- 작성: 2026-08-04 (실사용 제보 세션)
- 선행: D-047/D-048(방법론 흡수) · D-051(위임 배선) · D-052 ⓒ(문서 지시 발동률 미검증
  예고) · D-056(AskUserQuestion 제거 전례) · D-040(무게 척도) · D-025(attended)

## 0. 지배 제약 (사용자 명시, 2026-08-04)

**이 수리로 제품이 더 무거워지면 안 된다. 기능이 그냥 잘 되면 된다.**

- 무게 척도는 D-040 §896 원문 그대로: 1순위 **세션 토큰 = 고정 시작 비용과 작업 1건
  증분 비용을 분리 실측** · 2순위 설치 부담 · 3순위 tool-schema 토큰. 측정 전에는
  합격을 선언하지 않는다.
- 이 초안의 목표선(주장 아님 — canary가 측정): 고정 시작 토큰 **+0 예상**(절차는 스킬
  호출 시에만 로드) · 설치 단계 **+0** · 새 setup 질문 **0** · 새 에이전트 **0** ·
  새 훅 **0** · 런 중 질문 수 **증가 없음**(문서상 질문 1개 삭제·기존 프롬프트에 편승,
  관측 UX 기준 ±0).

## 1. 문제 — 실측과 그 한계 (2026-08-04)

- 사용자 제보: **여러 프로젝트·여러 런에서 개발착수 구간 서브에이전트 관측 spawn
  0회** → 메인 세션 컨텍스트 조기 고갈.
- 세션 실사로 소거한 가설: 이 머신의 플러그인 캐시는
  `~/.claude/plugins/cache/agentic-sap/sapkit/0.5.2/` 단일본이고 그 안에 D-051 배선
  (Step 1b · `agents/sap-worker.md`)이 실재한다 — **파일 부재·버전 분기가 아니다.**
- **정직한 한계(v2 강등)**: 이것은 "원인 판정"이 아니라 **유력 가설**이다. 발동
  퍼널(플러그인 활성 → 절차 로드 → Phase 3.5 도달 → owner 선택 → 디스패치 → spawn)의
  어느 단계가 죽는지 관측된 런이 없고, `--scope local` 활성은 프로젝트별이라
  (adapters/claude/README.md:99-104) 캐시 단일본만으로 각 런의 활성·로드까지 소거되지
  않는다. 분모(적격 Full 런 수)도 미확정. → **§3 0단계 canary가 판별 시험이다.**

## 2. 진단 — 발동을 막는 구조 (가설 우선순위)

① **자가해석 탈출구.** `create-program.md` Step 1b — "a value you resolved yourself
without asking is `auto`". 프롬프트 표시는 "Otherwise display"인데 그 otherwise 판단도
모델 몫. 모델의 기본 중력(자기 실행)이 이 탈출구로 빠지면 **무표시·무고지 main**.

② **디스패치 비강제 + 절차 밖 문법.** owner가 `delegated`로 풀려도 Phase 4 본문은
"Implementation **may** run under execution_owner"(create-program.md:461)일 뿐 "반드시
워커를 부르고 main이 대신 구현하지 마라"가 없다. 스폰 방법 자체도 절차 밖(어댑터
README 링크)이라 링크 추종 → 정독 → spawn의 3단 행동이 라이브에서 일어나지 않는다.
선택 단계가 살아도 디스패치 단계에서 죽을 수 있다 (v2 추가 — Codex 지적).

③ **resume 우회.** state.json에 `execution_mode`만 있으면 Phase 0–3.5를 통째로
건너뛴다(create-program.md:656) — 구버전 state엔 owner가 없으므로 재개 런은 owner
해석 자체가 없다 (v2 추가 — Codex 지적).

④ **여타 진입로는 설계상 침묵 main.** create-object "클 때만 1회 질문"(판단도 모델
재량) · modify-object 무질문 · 절차를 안 태운 자연어 런은 문서 비로드.

⑤ **미발동이 침묵이다.** 위임이 안 떠도 아무 표시가 없어 사용자가 알 길이 없다 —
이번 제보도 로그가 아니라 체감이다.

부수 정합 결함(같은 뿌리에서 발견, 집행 시 동반 수리): `auto`의 의미 혼재 —
Step 1b는 selection_source 값으로, Phase 4(461)는 owner 값으로 쓰는데 state.json
스키마(633)는 "persisted는 main|delegated뿐"이라 한다.

## 3. 결정 제안 (집행 순서 포함)

**0단계 — 선행 canary (코드 변경 0, 현 0.5.2에서).** 사용자의 다음 실사용 Full 런
1건에서 owner를 **명시적으로 "delegated"** 지정한다(사용자가 실사용 중 수행하기로
합의, 2026-08-04). 판별하는 것:
- 선택 실패 vs 디스패치 실패의 구분 — 명시해도 spawn이 안 되면 뿌리는 ②(또는 활성
  문제)이지 ①이 아니다.
- D-051 ⓐ 관찰 — 단, permissions-template 병합 머신에선 P3가 원래 무프롬프트라
  (README:61-64) **비허용 도구 호출이 실제로 발생한 경우에만** "프롬프트가 메인 UI로
  오는가"가 종결된다. 발생하지 않으면 ⓐ는 열린 채 유지하고 관찰을 계속한다.
- D-040 증분 측정 — main-context 소비 · 전체 토큰 · wall time · 표시된 프롬프트 수 ·
  worker/reviewer spawn 성공 여부.

**제안 ① — 결정론 owner 해석 + 기존 프롬프트 편승 (Full 한정).** Step 1b의 별도
질문 블록을 삭제하고, 해석 규칙으로 교체:

1. 이 런에서 사용자가 명시한 owner → `selection_source: explicit`
2. 기본값: **현 어댑터가 사용자 개입 없이 named worker를 실제 호출할 수 있으면
   `delegated`, 아니면 `main`** → `selection_source: default`
   (판정 기준은 파일 존재가 아니라 capability — Claude = 동봉 `sapkit:sap-worker`
   호출 가능 → delegated / Codex·AG = 새 세션 수동 기동 필요 → main)

해석 결과는 **기존 Step 1a(execution_mode) 프롬프트에 1줄로 편승**해 함께 표시한다:
`execution_owner: delegated (default) — 이 응답에서 "main"이라 하면 이 대화가 직접
구현`. **그 사용자 응답 전에는 디스패치하지 않는다** — 기존 대기 턴을 재사용하므로
질문 수는 늘지 않고, "고지 후 같은 턴 즉시 스폰이라 번복 불가"라는 v1 결함을 없앤다.
같은 응답에서 main 지정 시 `explicit`로 기록.

`auto` 정리: **Full에서는 값·출처 양쪽에서 소멸**(state.json은 `main | delegated` ×
`explicit | default`만). development-loop의 `auto`는 Standard/Minimal용 **요청 개념**
으로 존속하되 "Full은 결정론 해석"을 명기. **resume**: persisted owner 존중(재계산
금지), owner 없는 구버전 state는 재개 시점에 위 규칙으로 1회 해석 후 기록.

**제안 ② — 디스패치 의무화 + 실패 시 fail-closed.** Phase 4 본문 교체: owner가
`delegated`면 **MUST dispatch** — main이 대신 구현하는 것은 계약 위반. 실행체는
인라인 명명: "Claude = 동봉 서브에이전트 `sapkit:sap-worker` / Codex·AG = 워커 계약을
든 새 세션(각 README 구현 위임 절이 정확한 기동 문법의 정본 — 코어에 문법 중복 금지)".
도구 호출 문법은 계속 쓰지 않는다(D-056이 제거한 것은 타사에서 죽는 도구 호출 지시,
이것은 폴백이 정의된 이름 명명 — 단 폴백도 Procedural이라 "어디서도 안 죽는다"고
주장하지 않는다). 워커 기동 실패 시:
- `default`-delegated → main 폴백 + 고지(침묵 금지), `effective_owner: main` 기록
  (resolved와 분리).
- `explicit`-delegated → **침묵 폴백 금지** — 중단하고 한계를 설명, 지시를 기다린다
  (development-loop "Harness-neutral fallback"의 기존 조항 준수).
- 스폰 이후의 번복은 "즉시 취소"가 아니라 **중단 + 실제 진행 상태 보존·보고**다 —
  일부 P3 write 후 조용히 main 재구현 금지.

**제안 ③ — Phase 6 리뷰어 동일 수리 (별도 커밋 · 별도 E2E 항목).** 실행체 명명
(Claude = `sapkit:sap-reviewer` / Codex·AG = 새 세션) + 금지 사유를 정확히: "main
컨텍스트는 fresh reviewer context가 아니므로 체크리스트를 스스로 수행하면 Phase 6
계약 미충족"(v1의 "자기 리뷰" 표현은 delegated 런에서 부정확 — main은 구현자가 아닐
수 있다). **동반 수리(원문 확증된 기존 모순)**: `sap-reviewer.md:99·113-115`와
`review-checklist.md:46`이 "worker가 review request 준비·result 기록"이라 쓰는데
정본(development-loop:97-99 · sap-worker.md:36-38)은 **main 전용** — worker 표기를
main으로 교정. + `sap-reviewer.md:95`의 `sc4sap-lite` 잔재 개명. 구현 워커 spawn 0회는
리뷰어 spawn 0회의 증거가 아니므로 별도 결함으로 판정·검증한다.

**제안 ④ — config 슬롯은 1차 범위에서 제외 (후속 이연).** 실측 결과 "README 1줄"이
아니다: `setup-state.mjs`의 `CONFIG_KEYS` allowlist(68행)가 plan 검증(356행)·상태
보고(595행)에서 unknown 키를 거부·보고하고, 정본 필드 표(project-context.md)와 setup
문서·테스트까지 정합해야 한다 — 지배 제약과 충돌. explicit(런별 지정) + default로
당장 충분하고, **재개봉 트리거** = 운영에서 "매 런 main 지정" 마찰이 실제 관찰될 때
(D-051 (c)의 재검토 조건 승계).

**범위 밖(무변경):** create-object·modify-object 기본값(관찰 대상) · Phase 2 탐색
위임(신규 기능 — 후속 후보) · execution_mode 축 · setup 마법사 · unattended.

## 4. 무게 대차대조 (D-040 §896 정합 — 측정 전 합격 주장 없음)

| 항목 | 상태 |
|---|---|
| 고정 시작 토큰 | **+0 예상** — 절차는 스킬 호출 시에만 로드, 파일 순증도 음수 방향(질문 블록 삭제 > 규칙 신설). canary에서 확인 |
| 작업 1건 증분 | **미측정** — 워커가 계약·규칙·컨텍스트를 다시 읽어 전체 토큰·지연은 늘 수 있다. 사용자 요구는 메인 세션 수명이며, 이 교환의 실측이 canary 항목 |
| 설치 부담 | **+0** — 새 에이전트·훅·setup 단계 없음(worker/reviewer 기존 동봉) |
| 런 중 질문 | 문서상 -1(Step 1b 삭제) · **관측 UX 기준 ±0**(안 뜨던 질문이므로) — Step 1a 편승으로 새 대기 턴 없음 |
| update 부담 | 통상 패치 범프 1회분(0.5.2→0.5.3) — 0이라 주장하지 않음 |

## 5. 안전 — 정확한 서술 (v2 교정)

- 워커의 기계 차단은 **정확히 MCP 4이름**(`GetTableContents`·`GetSqlQuery`·
  `CreateTransport`·`ReleaseTransport`, sap-worker.md:4-8)이다. **P2 전체의 기계
  차단이 아니다** — vsp `query`도 P2인데(AGENTS.md) 워커의 Bash 경로는 기계 밖이므로
  절차 규범으로만 막힌다. 집행 시 sap-worker.md 5항에 "Bash로 vsp query 실행 금지
  (P2 main 전용)" 1줄을 명문화한다.
- transport 경계: id는 main이 생성·부여하고 워커는 **참조만**(생성·재할당·해제 금지 —
  sap-worker.md:33-34 기존 조항). 객체를 계약이 준 transport에 등록하는 것(Create*의
  transport 인자)은 P3 구현의 일부로 **명문화**한다 — AGENTS.md P4의 "assignment"와의
  경계를 글로 확정(현재는 해석 여지).
- 잘못된 P3 write 자체는 P2/P4 차단이 완화하지 않는다 — 스펙 승인 게이트·범위 계약·
  기계 검증 체인(CheckSyntax→활성화→리뷰)이 그 층이고, 전부 기존 그대로다.
- attended(D-025): 권한 층은 호출자와 무관하게 부모 세션에서 동작할 것으로 보이나
  **미실측**(D-051 ⓐ) — §3 0단계의 조건부 종결 경로로만 다루고 단정하지 않는다.
  D-051이 이 미실측을 이유로 기본 main을 택했으므로, 이 초안은 그 판단의 **명시적
  번복 제안**이다(안전 불변 주장이 아니라 위험 수용 기록 — 수용 조건: parent-present
  attended 운용 유지·백그라운드 위임 금지·부분 write 실패의 fail-closed 처리).
- 기본값 반전은 Claude 어댑터에서만 실효(조건부 기본) — Codex/AG는 main 유지.
  "3사 회귀 없음"은 canary·게이트 통과 후에만 사실로 기록한다.
- DESIGN §2 "멀티에이전트 자동 디스패치 폐기"와의 효력 관계를 D-066에 명시한다:
  폐기된 것은 8역할 자동 교대이고, **메인이 배정하는 워커 1기의 기본 기동**은 그
  구도(D-051 · DESIGN.md:198-205) 안의 기본값 변경이다 — 품질 모델 불변.

## 6. 유보 (v2 시점)

ⓐ D-051 ⓐ는 **조건부 종결**이다 — canary에서 비허용 도구 호출이 실제 발생해야
프롬프트 라우팅이 확인되며, 미발생 시 열린 채 유지(관찰 지속). 완화 근거는 §5의
수용 조건이지 "안전 불변"이 아니다.
ⓑ 토큰 절감·증분 비용 미측정(D-051 ⓑ + D-040 §896) — canary 측정 항목.
ⓒ 이 수리도 Procedural이다 — 실패 표면을 3단에서 1단(스폰)으로 줄이고 가시성 줄로
미발동을 관찰 가능하게 만들 뿐, 모델이 무시할 가능성은 남는다. 보증 등급표 무변.
ⓓ Codex/AG에서는 위임이 늘지 않는다(수동 새 세션이 현실) — 메커니즘 격차의 정직
반영, 어댑터 README에 병기.
ⓔ §2는 가설 순위다 — canary가 ①/②/활성 문제를 판별하기 전까지 원인 확정 아님.

## 7. 대안·기각

- (a) 문구 강화만("MUST display") — 같은 Procedural 등급 미세조정, 재발. 기각.
- (b) 훅/기계 강제 — 훅 0개 기본 철학 위반 + 3사 격차 확대 + 무게 증가. 기각.
- (c) setup 질문 추가 — 설치 부담 증가로 §0 위반. 기각.
- (d) Phase 2 탐색 위임 동시 도입 — 절감 폭 최대이나 신규 기능·리뷰 표면 증가. 후속
  후보로만. 기각.
- (e) 프롬프트 유지 + 기본만 [2] — 표시 실패가 유력한데 표시를 전제로 한 수리. 기각.
- (f) 3사 전부 delegated 기본 — Codex/AG에 매 런 수동 새 세션 강요 = 더 무거움. 기각.
- (g) config 슬롯 1차 포함 (v1 제안 ⑤) — setup 코드·정본 표·테스트 정합까지 끌려와
  §0과 충돌(실측: CONFIG_KEYS allowlist). 후속 이연으로 대체. 기각.
- (h) canary 없이 즉시 기본값 반전 — 선택 실패/디스패치 실패/활성 문제를 미판별인
  채 수리 지점을 고정하는 도박 + D-051 ⓐ 위험 수용을 무근거로 확대. 기각.

## 8. 변경 파일 (집행 시 — 커밋 분리: ①② / ③ / 문서)

- `interactive/core/procedures/create-program.md` — Step 1b 삭제·해석 규칙, Step 1a
  편승 줄, Phase 4 MUST dispatch·실패 처리, Phase 6 명명, state.json 스키마
  (`selection_source: explicit|default` · `effective_owner`) · Resume Behavior에 owner
  누락 state 처리
- `interactive/core/policies/development-loop.md` — execution_owner 절 개정(Full
  결정론 해석 · auto는 Standard/Minimal 요청 개념 · capability 기준 · fail-closed),
  보증 등급표 무변
- `interactive/agents/sap-worker.md` — vsp query 금지 1줄 · transport 등록=P3 명문화
- `interactive/agents/sap-reviewer.md` — worker→main 소유권 교정(99·113-115) ·
  `sc4sap-lite`→`sapkit`(95)
- `interactive/core/procedures/review-checklist.md` — 46행 worker→main 교정
- `interactive/adapters/{claude,codex,antigravity}/README.md` — 구현 위임 절 기본값
  서술 + Claude E2E 체크리스트를 단계별(owner 결정 / worker spawn / P3 권한 라우팅 /
  reviewer spawn / resume 호환)로 분해
- `interactive/DESIGN.md` — §3 항목 7(198-205) 기본값 변경 반영 + 자동 디스패치
  폐기와의 효력 관계 1줄
- `plugin-metadata.json` 0.5.2→0.5.3 · 매니페스트 5종 재생성 · 이식 스냅샷 재핀 ·
  `DECISIONS.md` D-066 append

## 9. 검증 계획

- 0단계 canary(§3) 선행 — 결과가 §2 가설을 판별하고 ⓐ·ⓑ를 채운다.
- 게이트 전종 green(스냅샷·링크·번들·엔진 provenance·smoke-mcp 계약 무변·서버
  게이트·매니페스트·rename·적합성·doctor).
- 집행 후 반영본 diff의 새-컨텍스트 리뷰.
- 배포 후 실사용 1런: 무질문 자동 위임 발동 · 가시성 줄 출력 · effective_owner 기록 ·
  메인 컨텍스트 소모 전후.

## 10. Codex 검토 요청 포인트 (v1 — 종결)

v1의 6개 포인트는 2026-08-04 Codex 검토(§11)로 판정 완료. v2가 반영한 상태로 D-결정
승인 대기.

## 11. 검토 이력

- **2026-08-04 · Codex `gpt-5.6-sol` · reasoning=max · read-only · 총평 "조건부 OK"**
  (배너 실측 확인). BLOCKING 6 · SHOULD-FIX 5 · NIT 3 — 의뢰 세션이 전건 원문 대조,
  반증 0(전건 확증 또는 타당 판단). v2 반영 내역: §1-2 원인 확정→가설 강등+퍼널,
  진단에 Phase 4 비강제·resume 우회 추가, 0단계 canary 신설, 제안 ① 무질문→Step 1a
  편승(응답 전 디스패치 금지), 제안 ② MUST dispatch+fail-closed+effective_owner,
  제안 ③에 reviewer/checklist worker 소유권 모순 동반 수리, config 1차 제외(→기각
  (g)), §4 무게를 D-040 §896 원문 정합으로 재작성, §5 "P2/P4 기계 차단" 과장 교정
  (MCP 4이름 한정+vsp query 구멍 명문화)·transport 등록 경계·DESIGN §2 효력 관계,
  절대 표현("어디서도 죽지 않는다"·"즉시 번복"·"3사 회귀 없음") 제거.
