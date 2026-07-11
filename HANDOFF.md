# HANDOFF — 프로젝트 전체 상태와 재개 지침

> **목적: 컨텍스트/세션이 클리어돼도 이 문서 하나로 전부 복원.**
> 작성 2026-07-10. 새 세션은 ① 이 문서 → ② 필요 시 해당 트랙 DESIGN.md 순으로 읽는다.
> 상태가 바뀌면 이 문서를 갱신하는 것까지가 작업의 일부다.

---

## 1. 프로젝트 지도 — 레포 하나, 트랙 둘

```
D:\claude for SAP\sap-agentic-harness   ← 단일 레포 (원격: hjaewon/sap-agentic-harness, 미푸시 커밋 있음)
│
├── [트랙 A] 하네스 트랙 (무인 step + 대화형 레인 겸용) — ★ 구현 미착수
│     설계: DESIGN.md (v2.1, 2026-07-09 확정 + 2026-07-10 엔진 델타 주)
│     내용: final-harness(D:\claude-practice\claude-fable-final) 엔진 + vsp-custom CLI로
│           ABAP 개발을 계획→실행→verify→LESSONS/RULES 학습 루프로 관리.
│           설계는 원래부터 대화형 세션(Phase 0a/0b·CONSULT) + 무인 step 겸용 —
│           "무인"은 실행 모드 하나이지 트랙 전체가 아님.
│     엔진 현행: v0.16.0 (2026-07-10) — 라우팅 4갈래·request-weight triage·
│           harness-design 인터뷰 루프 추가(설계에 유리, 구조 변경 불요).
│           단 DESIGN.md §15-F 불변식은 v0.12.1 실측 → 부트스트랩 시 재검증 (§1 델타 주)
│     시작점: DESIGN.md §16 부트스트랩 (vsp 빌드 → final-harness 플러그인 설치 → harness-init)
│
└── [트랙 B] 대화형 트랙 — ★ L0~L5 구현 완료, E2E 대기  ←←← 현재 작업 지점
      위치: interactive/ (= 3사 공통 플러그인 루트)
      설계: interactive/DESIGN.md
      내용: sc4sap-custom의 전 자산(지식·페르소나 26·절차·MCP 서버)을 하네스 중립
            코어로 재편한 라이트 플러그인. 플러그인명 sap-agentic-harness
```

두 트랙의 유일한 접점: 트랙 A의 packs(모듈 지식팩)가 `interactive/core/knowledge`에서
선별 이식한다 (같은 레포라 커밋 이력이 곧 provenance).

**관련 레포 상태:**

| 레포 | 상태 |
|---|---|
| `D:\claude for SAP\sc4sap-custom` | **동결** (지식 수정 금지) — 이식 원천. Claude 풀버전 플러그인이지만 lite가 대체 |
| `D:\claude for SAP\sc4sap-lite` | **동결·이관됨** — interactive/로 subtree 병합 완료. README에 이관 표기. 삭제해도 무방(사용자 판단) |
| `hjaewon/abap-mcp-adt-powerup` | MCP 엔진 포크 — interactive/server의 번들 원천. **미해결 이슈 1건 이관됨** (§6) |
| `D:\claude for SAP\vsp\vsp-custom` | 트랙 A 백엔드 — 아직 빌드 안 함 (Go 1.26.4 설치됨) |

## 2. 지금까지의 타임라인 (전부 2026-07-10, 커밋은 본 레포 main)

1. **설계**: sc4sap-custom을 3사(Claude/Codex/Antigravity)에서 쓰는 라이트 버전으로
   재설계. Fable 5 + Codex CLI 이중 리뷰 반영해 확정. 사용자 확정 결정:
   - 3사 통일 라이트 (Claude도 갈아탐). **Claude+Codex 필수, Antigravity는 가능한 선까지**
   - 전 자산 이식. 버리는 것은 멀티에이전트 자동 디스패치 + team 협업 뿐
   - 품질 모델: **1명 작업 + 1명 새-컨텍스트 리뷰(read-only) + SAP 기계 검증**
   - 안전 차단 훅 유지 (Claude 어댑터)
2. **L0~L5 구현** (별도 레포 sc4sap-lite에서 → 이후 병합):
   - L0: MIGRATION-MANIFEST(원본 508파일 5분류) + 검증 스크립트 + CLI 표면 실측
   - L1: 코어 이식 — 지식 217, 페르소나 26 변환, 절차 15, 정책 6, 스키마 4, 앵커 2
   - L2: 서버 검증 — 번들 SHA 일치, 155 tools 실측, 무프로파일=inspection-only
   - L3: Claude 어댑터 — 스킬 래퍼 11, sap-reviewer, 안전훅 5종, 권한 템플릿
   - L4: Codex 어댑터 — 설치 스모크 통과, exposition 프리셋(readonly) 확정
   - L5: Antigravity — 루트 plugin.json으로 agy 직설치 통과
3. **Fable 5 구현 코드리뷰** (지적 26건) → 필수 9건 전부 반영 (review-fix 1~6):
   치명 2건(안전훅 fail-open, install-hooks 죽은 경로) 해소 + 기능 실증(PA0008 차단),
   페르소나 재생성(잔재 0), 권한 live 기반(153), 승인 키워드 통일, verify-engine 교정,
   LICENSE. 대응 기록: `interactive/docs/research/L5-review-response.md`
4. **레포 통합 + 개명** (사용자 결정 "하나의 레포가 목적"): sc4sap-lite를 git subtree로
   `interactive/`에 병합(13커밋 보존, 커밋 038085c+8959b73), 플러그인명
   `sap-agentic-harness`로 개명, 마켓플레이스를 레포 루트로(.claude-plugin/.agents,
   source `./interactive`), Codex·agy 재등록 스모크 통과
5. **활성 스코프 설정** (사용자 결정 "이 프로젝트만"): §3 참조 (커밋 5e529fc)

## 3. 현재 설치·활성 상태 (2026-07-10 실측)

| 하네스 | 상태 | 메커니즘 |
|---|---|---|
| **Claude Code** | 이 프로젝트만 ON | 마켓플레이스 등록 완료(사용자 실행) + `claude plugin install --scope local` → 본 레포 `.claude/settings.local.json`의 enabledPlugins (git 미추적). **세션 재시작해야 로드됨** |
| **Codex** | OFF (기본) | 플러그인 활성화는 **전역 전용**(실측 — 프로젝트 오버레이·`-c` 무효). SAP 작업 시: `node interactive/adapters/codex/toggle-plugin.mjs on`, 종료 시 `off` |
| **Antigravity** | OFF | `agy plugin enable/disable sap-agentic-harness` (전역 토글, agy 1.0.7) |

- Codex의 구 sc4sap-lite 잔재(전 세션 스킬 노출)는 캐시까지 완전 제거 완료.
- MCP 서버는 Claude만 플러그인에 동봉 등록(.mcp.json). Codex/AG는 수동 등록 필요
  (각 어댑터 README의 명령 — exposition=readonly 기본).

**보조 머신 (2026-07-10, 레포 위치 `D:\AI PROJECT\sap-agentic-harness`):**

- Claude 플러그인 scope local ON + 안전훅 3종 프로젝트 settings 등록(PA0008 차단 실증)
  + 권한 병합 allow 189(사용자 직접 실행, D-008 패턴 — 실데이터 2종 제외 유지). **셋업 완료.**
- 프로파일 홈은 기본 `~/.sc4sap`(SC4SAP_HOME_DIR 미설정 — `.sah` 개명은 주 머신만).
  활성 프로파일 **IDES-DEV**(S4H/100 실연결 확인). KR-DEV(192.168.1.225)는 사내망
  전용이라 이 머신에서 도달 불가 — 사내망 복귀 시 active-profile.txt 한 줄 교체.
- 구 sc4sap 플러그인 2종(sc4sap@sc4sap·sc4sap@sc4sap-custom)은 disabled 확인.
- 3사 CLI 전부 존재 실측(2026-07-11 doctor): claude 2.1.206(플러그인 설치+훅 3종 배선) ·
  codex 0.144.1(플러그인 미설치 = 평시 OFF) · agy 1.0.16(임포트 + **disabled** = 평시 OFF,
  5-2 스모크 재검증 때 임포트됨).
- 원본 sc4sap-custom 사본에 npm 산출물(node_modules)이 있어 migration-coverage
  게이트가 깨졌던 것을 스크립트 수리(node_modules 스킵)로 해소. `.omc/**` 규칙
  매칭 0 경고는 이 머신 사본에 세션 기록물이 없어서 나는 정보성 경고(비차단).

## 4. L3 E2E + L6 교차 검증 — ✅ 전부 완료 (2026-07-10)

**E2E = 실사용 시나리오를 처음부터 끝까지 1회 완주하는 검증.** 조립 검증까지 완료 —
트랙 B는 설계→구현→검증이 닫혔다. 아래 체크리스트·설치 조건은 재현 절차 기록으로 보존.

**설치/연결 조건 (재현 시):**

1. Claude Code 세션 재시작 → `/sap-agentic-harness:troubleshooting` 등 스킬 11개 +
   `sap` MCP 서버 보이는지 확인
2. SAP DEV 프로파일: `~/.sah/profiles/<별칭>/sap.env` (**SAP_TIER=dev 필수**) +
   본 레포 또는 작업 폴더에 `.sc4sap/active-profile.txt`(별칭 1줄) + `.sc4sap/config.json`
   (sapVersion·abapRelease·activeModules·industry·country)

**E2E 체크리스트** (상세: `interactive/adapters/claude/README.md`):

- [x] MCP 연결 확인 — launch.cjs shim 경유 connected (system_id=DEV/700)
- [x] **연결 상태 tools/list 실측** → 미노출 27종은 프로파일 활성 시 **동적 노출**로 판정
      (155→186) → tool-catalog README 보류 해소. create-program 참조 도구 전부 실재
- [x] 도구 네임스페이스 접두어 일치 확인 (`mcp__plugin_sap-agentic-harness_sap__`)
- [x] 안전훅 설치 + 재배선 확인 (PA0008 차단 실증)
- [x] FI 상담 1건 — 페르소나 + 라이브 컨텍스트(ACDOCA/SKA1) + KR 로컬라이제이션
- [x] create-program 1건 완주 — ZR_FI_GL_LIST (승인 게이트 → 구현 → 리뷰 FAIL→수정→PASS
      → CheckSyntax→활성화→ATC; Unit은 백엔드 404로 SKIPPED). 상세 §4.1

**E2E 후 → L6 교차 검증: ✅ 완료 (2026-07-10)** — 3사 전부 라이브 SAP 연결 실증:

- **Codex** (0.144.1, gpt-5.6): `toggle on` + `codex mcp add sap`(launch.cjs·readonly) →
  GetSystemInfo 실데이터(DEV/700) → ask-consultant 상담 과제 통과(🧭/🌐 형식·환경 로드·
  라이브 SKA1 조회·Claude와 정합적 답변).
- **Antigravity** (agy 1.0.7): `agy --print` 비대화형으로 동일 과제 통과 — "가능한 선"을
  넘어 CLI 전 플로우 동작. **실측**: agy CLI의 MCP 정본은 `~/.gemini/config/mcp_config.json`
  (`antigravity/mcp_config.json`은 IDE용) — 어댑터 README에 반영.
- **리뷰 인계 왕복 실증**: Claude 워커의 review-request.json(ZR_FI_GL_LIST)을 Codex
  리뷰어가 소비 → 스키마 적합 `review-result-codex.json` 반환(read-only 준수, 원본 무손상).
  **관찰**: 판정 편차 Claude PASS vs Codex FAIL(MAJOR 7) — 원인은 ① 환경 컨텍스트(백엔드
  장애·문서화된 편차) 미전달 ② 심각도 캘리브레이션 차이 ③ **실질 신규 발견 1건
  (AUTHORITY-CHECK 부재 — F_SKA1_* 권한 검사, 후속 개선 후보)**. 교훈: review-request
  스키마에 환경 컨텍스트 필드 추가 검토(백로그).
- 종료 상태: Codex toggle off·AG disable (평시 기본). 어댑터 README 2벌에 launch.cjs
  경유 등록 명령 반영(구 경로·번들 직접 호출은 mock 연결이라 무효).

### 4.1 L3 E2E — ✅ 완료 (2026-07-10)

**E2E 전 구간 완주.** 연결을 막던 조립 결함 2건(keyring·연결 미배선)을 수리·실증했고,
재시작 후 하네스 통합 경로로 실연결(system_id=DEV) → 안전훅 재배선 → FI 상담 →
**create-program 풀 파이프라인 완주**(스펙 승인 게이트[사람] → Sonnet executor 구현 →
Opus sap-reviewer 새-컨텍스트 리뷰 FAIL→수정→**PASS** → CheckSyntax/활성화/ATC).
산출물: DEV `$TMP`의 `ZR_FI_GL_LIST` 5오브젝트 ACTIVE v1.1, 전 게이트 기록은
`.sc4sap/program/ZR_FI_GL_LIST/`(report.md 포함). **리뷰 게이트 가치 실증**: 문법·ATC·활성화를
전부 통과한 의미 결함(INNER vs LEFT JOIN)을 리뷰만 잡아냄.
잔여(백엔드 복구 후): RunUnitTest 재실행, WriteTextElementsBulk 1회. 다음 단계 = **L6 교차 검증**.

**확정 발견 & 수리:**

1. **keyring 바이너리 번들 누락** → keychain 비번 해석 불가 → 연결 불가.
   수리: `interactive/server/package.json`(+lock) 추가, `npm install`로 4플랫폼(win32/darwin×2/linux)
   populate, `bundle-keyring.mjs`의 `ROOT`를 `__dirname`으로 교정(마이그레이션 후 한 단계 어긋나 있었음),
   `interactive/.gitignore`에 `!/server/runtime-deps/keyring/node_modules/` 네거이션(블랭킷 `node_modules/`가
   바이너리를 삼켜 미커밋됐던 것이 근본원인). 검증: 모듈 로드 + Credential Manager `sc4sap/KR-DEV/HJAEWON` 읽힘.
2. **연결 env 미배선** → `.mcp.json`이 `--env-path`/`MCP_ENV_PATH`를 서버에 안 넘겨 4.13 번들이 **항상 mock**
   (username/password="mock", client 없음 → "Basic authentication requires SAP_CLIENT" 에러의 정체).
   active-profile은 tier/도구노출만 설정하지 그 자체로 연결을 만들지 않음(설계 문서는 "activateProfile이 연결 전
   실행되어 연결이 env를 상속" 가정이나 4.13 브로커는 env-**파일** 경로를 요구 — 엔진 회귀).
   수리(어댑터, 번들 무수정): 런처 shim `interactive/server/launch.cjs` — `.sc4sap/active-profile.txt`를 읽어
   프로파일 `sap.env` 경로를 `process.env.MCP_ENV_PATH`로 세팅 후 번들 require. `.mcp.json` args를 shim으로 변경.
   검증: launch.cjs 경유 `GetSystemInfo` → **실데이터 `system_id=DEV, client=700, user=HJAEWON(홍재원), adt=modern`**.
3. **"미노출 27종" 판정 정정** → 프로그램/화면 계열(CreateProgram·CreateInclude·CreateScreen·CreateGuiStatus·
   CreateTextElement 등)은 **부재가 아니라 프로파일 활성 시 동적 노출**. inspection-only 155 → connected **186 tools**.
   → **create-program 실행 가능** (앞선 "부재" 결론은 inspection-only 아티팩트였음). tool-catalog 보류 해소.
4. **권한 템플릿 재생성** → 기존 템플릿은 inspection-only(155)로 생성돼 프로그램 계열 write 누락(153 entries).
   connected(186)로 재생성 → `permissions-template.json` 184 tools(+파일op 5 = 189). `gen-permissions.mjs`는
   여전히 inspection-only 기동이라 **연결 상태 생성으로 고쳐야 함(엔진/스크립트 백로그)**.

**스테이징(미커밋) 변경:** `interactive/.gitignore`·`.mcp.json`·`server/bundle-keyring.mjs`·
`server/runtime-deps/keyring/integrity.json`·`adapters/claude/permissions-template.json`(수정) +
`server/launch.cjs`·`server/package.json`·`server/package-lock.json`·`server/runtime-deps/keyring/node_modules/`(신규).
프로젝트 상태 `.sc4sap/active-profile.txt`(=KR-DEV)+`config.json`은 git-ignored(정상).

**E2E 체크리스트 결과 (전 항목 완료):**
1. ✅ 실연결 — 하네스 `GetSystemInfo` → `DEV/700/HJAEWON/modern`
2. ✅ 권한 병합 — `settings.local.json` allow 189 (사용자 `!node merge-perms` 실행; 실데이터 2종 제외 유지)
3. ✅ 안전훅 재배선 — 3종 프로젝트 settings 등록(라이트 경로), PA0008 차단 standalone 실증
4. ✅ FI 상담 — 페르소나 로드 + 라이브 컨텍스트(ACDOCA/SKA1 실조회) + KR 로컬라이제이션 반영
5. ✅ create-program 완주 — 승인 게이트(SHA 바인딩) → 구현 → 리뷰 FAIL→수정→PASS → 기계검증 체인
6. ✅ 일괄 커밋 (push는 사용자 판단)

**E2E가 발굴한 엔진/백엔드 이슈 (§6 백로그 이관):**
- (a) **연결 미배선** — activateProfile이 connection 브로커에 미공급(4.13 회귀). adapter shim(launch.cjs)으로 우회 중 — 엔진 근본수리 필요
- (b) **gen-permissions가 inspection-only 기동** — 프로그램 계열 write 미포함 템플릿 생성. 연결 상태 생성으로 수정 필요
- (c) **DeleteInclude enqueue 누수** — 잠금→삭제 후 미해제, 고아 잠금이 재생성 차단(5회 재현). SM12 수동 정리로만 해소
- (d) **활성화/갱신 상태 플래그 신뢰 불가** — failed+에러0 모순, `activate=true` 거짓 성공, GUI 비가시 유령 inactive 레이어. 검증은 소스 읽기로만 가능
- (e) 사용자 DEV 박스 서비스 2종 다운(엔진 무관): ABAP Unit ADT 실행 404 · ZMCP_ADT_SRV Textpool 500 — 복구 후 RunUnitTest/WriteTextElementsBulk 재실행

## 5. E2E 이후 남은 백로그 (상세 — 새 세션이 이 절만 읽고 착수 가능하게 기록)

**5-1~5-3 완료 (2026-07-11)** — 남은 항목은 5-4~5-6(전부 낮음). 전 항목 보조 머신에서 가능.
공통 완료 조건: §9의 게이트 4종 통과 유지 + 상태 변경 시 이 문서 갱신.

### 5-1. tool-catalog 재생성 — ✅ 완료 (2026-07-11, 보조 머신)

- 연결 상태(IDES-DEV, launch.cjs 경유) tools/list 186종 실측 → 4파일 재생성.
  **read 90 / write 79 / runtime 15 / prompt-gated 2 = 186, 카탈로그↔live diff 0** 검증.
  구 카탈로그 170종은 전부 live에 실재(부재 없음 재확인), 신규 16종 편입
  (Grep 2·GetCallGraph·GetSourceDiff·UpdateSourceByPatch·WriteTextElementsBulk 등).
- 표기를 `mcp__plugin_sc4sap_sap__` 풀네임 → **bare capability name**으로 전환
  (vocabulary.md 어댑터 매핑 계약에 정합). ReloadProfile은 runtime의 신설
  "Server Session Control" 절로 — 자동승인 비권장 주석 포함.
- 재생성 절차(launch.cjs 함정 포함)는 `tool-catalog/README.md`에 영구 기록.
  check-links·coverage 게이트 통과.

### 5-2. doctor.mjs — 3사 어댑터-코어 동기화 점검 도구 — ✅ 완료 (2026-07-11)

- `interactive/scripts/doctor.mjs` 신설: ① 번들 무결성(verify-engine.mjs spawn 위임)
  ② compatibility.json 고정 버전 vs CLI 실측 + 플러그인 설치 여부(CLI 부재 = SKIP,
  버전 불일치 = FAIL, 플러그인 미설치는 정보성 — 평시 OFF도 정상) ③ Claude 훅 배선
  경로 실재(.claude/settings*.json의 command에서 경로 추출 → existsSync).
  전 항목 OK/SKIP → exit 0, FAIL ≥1 → exit 1. README 3벌에 사용법 1줄.
- **가치 즉시 실증**: 첫 실행이 실제 불일치 검출 — agy 설치 1.0.16 ≠ 고정 1.0.7 →
  정본 절차(compatibility.json _comment)대로 1.0.16 설치 스모크 재실행(skills 11 +
  agents 1 processed, 설치 후 disable로 평시 OFF 복귀) → 고정값 1.0.16 갱신 →
  doctor exit 0. FAIL·OK 경로 모두 실환경 실증.

### 5-3. review-request 스키마 확장 — 환경 컨텍스트 동봉 (D-013) — ✅ 완료 (2026-07-11)

- `review-request.schema.json`에 optional `environment_context` additive 추가 —
  `known_outages[]`(component/affected_step/observed_at) · `approved_deviations[]`
  (description/approver/approved_at/reason) · `notes`. **required 무변경**(하위호환),
  review-result 스키마 무변경.
- 생산측+소비측 짝으로 반영: `create-program.md` Phase 6 스텝 3에 기입 지침(서브불릿 3),
  `review-checklist.md`에 "Environment context" 소비 규칙 신설(장애로 SKIPPED된 단계는
  `N/A (environment outage)` 처리, 승인 편차는 재계상 금지, 미기재 편차는 정상 판정 —
  D-013 "동일 계약으로 소비" 취지 완결). 스키마 유효 + check-links·coverage 통과.
- 실증은 다음 create-program 완주 시 교차 리뷰 1회로.

### 5-4. 검증도구 개선 3건 [낮음] (L5 리뷰 보류분 2-3/2-4/2-5)

- `check-links.mjs`: 앵커(#섹션) 존재 검증 추가
- `check-migration-coverage.mjs`: transform/copy 규칙의 목적지 경로 실재 검사 추가
- `smoke-mcp.mjs`: `--exposition` 인자 지원(노출 프리셋별 스모크)

### 5-5. deferred 스크립트 6종 (L6+, 원천은 동결 레포 sc4sap-custom/scripts/ — 읽기만)

| 원천 | 목적지 | 현행 수동 대체 |
|---|---|---|
| extract-spro.mjs · extract-customizations.mjs | `tools/extract/` | spro-lookup.md · customization-lookup.md |
| fetch-abap-keyword-doc.mjs · fetch-sap-help-doc.mjs | `tools/fetch/` | help-portal-fetch.md |
| sap-profile-cli.mjs | `scripts/` | troubleshooting.md 수동 절차 |
| sap-option-tui.mjs | 재심사 | config.json 직접 편집으로 대체 중 |

### 5-6. 다국어 README — ✅ 결정 완료 (2026-07-11): 재작성 안 함

- 개인 도구라 다국어 README 소비자 없음 + 코어(영어)·운영 문서(한국어) 역할 분담으로
  충분 + 원본 archive 보존이라 수요 발생 시 언제든 재론 가능(가역). 매니페스트
  `README.*.md` 행에 확정 기록 (분류는 archive 그대로).

### 머신별 가능 범위 (2026-07-10 기준)

| 작업 | 주 머신 | 보조 머신(D:\AI PROJECT) |
|---|---|---|
| 위 5-1~5-6 | ✅ | ✅ (5-1은 IDES-DEV 연결로) |
| 트랙 A 부트스트랩 (DESIGN.md §16) | ✅ | ❌ vsp-custom·final-harness 소스 없음 |
| E2E 잔여 2건(RunUnitTest·WriteTextElementsBulk) | KR-DEV 백엔드 복구 후 | ❌ 사내망 전용 |
| 엔진 백로그 (§6) | 포크 소스 필요 | 포크 소스 필요 |

## 6. 별도 레포로 이관된 이슈 (엔진 포크)

**hjaewon/abap-mcp-adt-powerup**: 연결정보 존재 + `SAP_TIER` 미설정이면 tier가 DEV로
기본되어 write 가드가 열림 (L2 실측). 요구: "SAP_TIER 미설정 + 연결정보 존재 시 기동
거부(또는 write 미등록)". 수정 후 재번들 절차는 `interactive/server/UPDATE-RUNBOOK.md`.
현재는 정책층(`interactive/core/policies/credential-handling.md`)이 커버 — E2E 비차단.

**엔진 백로그 2 — `.sc4sap/` 프로젝트 폴더명**: 번들에 하드코딩(`path.join(cwd, ".sc4sap", …)`
실측) — 개명하려면 엔진 소스 configurable화 필요, tier 이슈와 같은 사이클에 처리 권장.
**머신 레벨 홈은 개명 완료(2026-07-10)**: `SC4SAP_HOME_DIR=C:\Users\hjaew\.sah`
사용자 env 영구 등록(번들·훅·lib 모두 이 오버라이드 지원 실측), 기존 프로파일 2개
(IDEA-JNC, KR-DEV) 마이그레이션 완료. 구 `~/.sc4sap`은 백업 보존 — 동결된 sc4sap-custom을
다시 켜면 그쪽을 읽어 갈라질 수 있으니 **정본은 새 경로**. env는 새 프로세스부터 유효
(실행 중 세션은 재시작 필요).

## 7. 핵심 파일 지도

```
HANDOFF.md                      ← 이 문서 (상태 바뀌면 갱신)
docs/DECISIONS.md               ← 결정 로그 (append-only — 결정의 '왜'는 여기 영구 보존)
DESIGN.md                       ← 트랙 A(무인 하네스) 설계 v2.1 — §16 부트스트랩부터 시작
interactive/
  DESIGN.md                     ← 트랙 B 설계 정본 (이중 리뷰·L5 실측 갱신 반영)
  MIGRATION-MANIFEST.md         ← 원본 508파일 5분류 (분류 변경은 이 파일 수정으로만)
  core/                         ← 하네스 중립: knowledge(모듈14+BC·업종·국가·ABAP) ·
                                   personas(26+INDEX) · procedures(15+schemas) · policies ·
                                   vocabulary.md · project-context.md
  server/                       ← MCP 번들 4.13.0 + keyring + tool-catalog + sap-assets + UPDATE-RUNBOOK
  adapters/{claude,codex,antigravity}/  ← 어댑터별 README = 설치·스코프·안전모델 가이드
  adapters/compatibility.json   ← 3사 검증 버전 고정
  skills/ agents/ plugin.json .codex-plugin/ .claude-plugin/(plugin.json)  ← 플러그인 표면
  scripts/                      ← check-links · check-migration-coverage · smoke-mcp ·
                                   gen-permissions · transform-personas (전부 실행 가능 게이트)
  docs/research/                ← 실측 기록 (L0-cli-surface, L2-server-verification,
                                   L1-transform-contract, L5-review-response)
.claude-plugin/ .agents/        ← 레포 루트 마켓플레이스 (source: ./interactive)
docs/superpowers/specs/…lite-design.md  ← 설계 스냅샷 (정본은 interactive/DESIGN.md)
```

## 8. 불변 규칙 (모든 세션이 지킬 것)

1. **지식 정본 = `interactive/core/`**. sc4sap-custom·sc4sap-lite 폴더는 동결 — 수정 금지.
2. **sc4sap-custom의 `private/`는 영구 denylist** — 읽지도, 어떤 산출물에도 포함하지도 않는다.
3. `interactive/server/server.bundle.cjs`는 `.gitattributes` `-text` 보호 유지 (EOL 변환 = 파손).
   갱신은 UPDATE-RUNBOOK 절차로만, 갱신 시 capability diff + gen-permissions 재생성 필수.
4. 실데이터 조회 2종(GetTableContents/GetSqlQuery)은 어떤 하네스에서도 자동 승인 금지.
5. 매니페스트·게이트 우선: 구조 변경 시 `node interactive/scripts/check-links.mjs interactive`와
   `node interactive/scripts/check-migration-coverage.mjs`가 항상 통과 상태여야 한다.
6. superpowers 플러그인은 사용자가 의도적으로 비활성화함 — 재활성화 제안 불필요.
7. **굵직한 결정(대안을 기각한 선택)은 `docs/DECISIONS.md`에 append** — 수정·삭제 금지,
   정정도 새 항목으로. 이 문서(HANDOFF)를 재작성할 때 결정의 '왜'가 소실되지 않게 하는 장치다.

## 9. 검증 명령 모음 (재개 시 상태 점검용)

```bash
cd "D:/claude for SAP/sap-agentic-harness"
node interactive/scripts/check-migration-coverage.mjs   # 미분류 0 이어야 함
node interactive/scripts/check-links.mjs interactive     # 깨짐 0 이어야 함
node interactive/server/verify-engine.mjs                # 번들 무결성 OK
node interactive/scripts/smoke-mcp.mjs                   # tools 155 (무프로파일)
node interactive/adapters/codex/toggle-plugin.mjs status # Codex 활성 상태
codex plugin list | grep sap-agentic                     # Codex 설치 상태
agy plugin list                                          # AG 임포트 상태
git log --oneline | head                                 # 최근: 5e529fc(스코프) ← 8959b73(병합)
```

git 미푸시 커밋 다수 — push는 사용자 판단 (원격: hjaewon/sap-agentic-harness).
