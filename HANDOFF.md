# HANDOFF — 프로젝트 전체 상태와 재개 지침

> **목적: 컨텍스트/세션이 클리어돼도 이 문서 하나로 전부 복원.**
> 작성 2026-07-10 · 최종 갱신 2026-07-12. 새 세션은 ① 이 문서 → ② 필요 시 해당 트랙
> DESIGN.md 순으로 읽는다. 상태가 바뀌면 이 문서를 갱신하는 것까지가 작업의 일부다.
> **트랙 A Phase 2 완료 (2026-07-12)** — 답사→계획 변경 기록(§13 완료 기준 충족) +
> 무인 완주(2 steps, verify 실패 0, 리뷰 위반 0) + connected 채점 **5 PASS/0 FAIL**.
> 채점 중 CLAS 배포 결함 3건 실측(vsp deploy/copy + 엔진 UpdateClass —
> COMMANDS.md ⑤-6/7 · §6 백로그 4 · R-006). **다음 착수 = 백로그 5-7**(설치 절차
> 이식) — Phase 3(Gated Deploy)은 선결 3조건(5-11 리뷰 게이트 편입 등) 후.

---

## 1. 프로젝트 지도 — 레포 하나, 트랙 둘

```
D:\claude for SAP\sap-agentic-harness   ← 단일 레포 (원격: hjaewon/sap-agentic-harness)
│
├── [트랙 A] 하네스 트랙 (무인 step + 대화형 레인 겸용) — ★ Phase 1.5까지 완료 (red/green 서버 실증)
│     설계: DESIGN.md (v2.1, 2026-07-09 확정 + 2026-07-10 엔진 델타 주)
│     내용: final-harness(D:\claude-practice\claude-fable-final) 엔진 + vsp-custom CLI로
│           ABAP 개발을 계획→실행→verify→LESSONS/RULES 학습 루프로 관리.
│           ★ vsp-custom = 트랙 A의 유일한 SAP 접점·검증/배포 백엔드 — 없으면 verify
│           루프 불성립 (DESIGN.md §3, powerup 엔진은 이 트랙에서 미사용).
│           소유 전략 = **D-018 확정: 분리 유지 + 부트스트랩 시 버전 lock** (5-9 종결)
│           설계는 원래부터 대화형 세션(Phase 0a/0b·CONSULT) + 무인 step 겸용 —
│           "무인"은 실행 모드 하나이지 트랙 전체가 아님.
│     §15-F 불변식: v0.17.1(cf42b64) 전면 재검증 + v0.17.3(8f7f13b) 델타 재확인
│           (2026-07-11) — 전량 유지. 두 의존의 검증 lock = adapters/vsp/vsp.lock.json ·
│           adapters/final-harness.lock.json (D-018)
│     현황: **Phase 0a·0b·1 완료(2026-07-11)** — 0a: init+tailor+게이트 차단 실증.
│           0b: §16-2 연결(vsp-env.ps1) + COMMANDS.md 전수 실측 + 마커 3종 실재현 완성
│           + VERIFY-PATTERNS 정본 + §14-2/3/9 판정(1.5는 ATC/health 기반 재정의).
│           1: 유형별 offline 커버리지 표(ABAP만 부분 실효 — CDS/BDEF 무의미 실측) +
│           domain/abap 시드(S-001~025+CHECKLIST) + **무인 엔진 첫 완주**: 1-workdays-util
│           (bridge, 2 steps 각 1회 시도·verify 실패 0, opus 사후 리뷰 하드 위반 0) →
│           src/zsah1_workdays.prog.abap (테스트 클래스 먼저를 스텝 경계로 기계 증명).
│           1.5: **red/green 서버 실증** — 스텁 5 FAIL → 최종본 **5 PASS**(무인 산출물
│           정확성 실채점 확인) + ATC(INFO 1, exit 0) + 완료 기준 충족(ENDIF 소스:
│           offline lint 0 → connected CODE_FAIL 1). vsp test의 REPORT 로컬 테스트
│           지원 확인(Phase 3 근거). 엔진 lock = v0.17.3(8f7f13b) 동기, 저자 동결 선언.
│           상세 = .harness/STATE.md·phases/1-workdays-util/·VERIFY-PATTERNS §1.5절.
│           $TMP 잔존: ZSAH0B_ 3 + ZSAH1_WORKDAYS + ZSAH15_BROKEN +
│           ZCL_SAH2_WORKDAYS + ZSAH2_DUEDATE (전부 무해, COMMANDS.md 부록).
│           **Phase 2 완료(2026-07-12)**: ① 계획 — read-only 답사(sonnet 위임)가
│           결정 3건 변경(대상 객체 CLAS+PROG 2개로 / 테스트 리포트 배치+배포 순서
│           클래스 먼저 / 분석 스코프 객체 단위, where-used 정본=graph --direction
│           callers) → PLANNING.md 기록(§13 완료 기준). ② 무인 완주(2 steps, verify
│           실패 0, 사후 리뷰 위반 0). ③ connected 채점 — vsp test **5 PASS/0 FAIL**
│           + ATC INFO만 + graph가 ZCL 참조 포착. 채점 중 실측: **CLAS 배포 3결함**
│           (deploy LOCK 거부+잠금 누수 · copy 거짓 성공 — COMMANDS.md ⑤-6/7 ·
│           R-006, 엔진 UpdateClass 423 계열 — §6 백로그 4). 클래스는 GUI 수동 주입.
│           다음: 백로그 5-7. Phase 3(Gated Deploy) 선결 3조건 중 리뷰 게이트
│           편입은 백로그 5-11
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
| `hjaewon/abap-mcp-adt-powerup` | **→ `engine/`으로 편입 (2026-07-11, D-017)** — 엔진 소스 정본은 이제 레포 내 `engine/`(재현 빌드 바이트 일치 검증). GitHub 포크·로컬 클론은 히스토리 아카이브. 엔진 이슈는 §6 — engine/에서 수리 |
| `D:\claude for SAP\vsp\vsp-custom` (주) / `D:\Claude for SAP\vsp-custom` (보조) | **트랙 A의 유일한 SAP 접점·검증/배포 백엔드** (핵심 의존 — 업스트림 oisee/vibing-steampunk 차용). **소유 전략 D-018 확정: 분리 유지 + 부트스트랩 시 버전 lock** (편입 기각 — 소비 계약=CLI 바이너리, 업스트림 활발). 보조 머신에서 검증 lock 생성 완료(2026-07-11, `adapters/vsp/vsp.lock.json` — aab1275, build/vsp.exe sha256 고정), 주 머신은 미빌드 (Go 1.26.4 설치됨) |
| final-harness: `D:\claude-practice\claude-fable-final` (주) / `D:\AI PROJECT\claude-final` (보조) | 트랙 A 하네스 엔진 — **자체 제작 독립 제품**(fable-harness 후속, sah 밖 사용처 가능). **D-018: 분리 유지 확정** — 버전은 여기 박제하지 않음(부패 실증). §15-F 재검증·lock **완료(2026-07-11)**: v0.17.3(8f7f13b)까지 전량 유지, `adapters/final-harness.lock.json`. 저자 당분간 동결 선언 |

## 2. 지금까지의 타임라인 (2026-07-10~11, 커밋은 본 레포 main)

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
6. **(2026-07-11) 검증 종결 + 이중 검토 후속**: 백로그 5-1~5-4·5-6 소화, 엔진 수리
   4.13.1(RunUnitTest·CreateFunctionGroup) + 소스 편입(D-017), **새-컨텍스트 프로젝트
   전반 이중 검토(Fable 5 + Codex 독립 교차)** → D-018(트랙 A 의존 분리 유지+lock,
   5-9 종결)·D-019(품질 계약 봉인)·**5-10 안전·진실성 수리 스프린트**(엔진 4.13.2
   tier fail-closed·L3 훅 fail-closed·리뷰어 기계 격리·표면 동기화) 완료, 전량 push

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
- **final-harness 플러그인 설치 완료(2026-07-11)**: `final-harness@final-harness-marketplace`
  v0.17.1, scope **local**(이 레포만) — `.claude/settings.local.json` enabledPlugins에 기록
  (git 미추적). **세션 재시작 후 harness-init 등 스킬 10종 로드됨.** 주 머신은 미설치.
- **트랙 A 소스 2종도 이 머신에 실재 확인(2026-07-11)**: vsp-custom =
  `D:\Claude for SAP\vsp-custom`(Go 286파일 소스 완비 + vsp.exe 빌드본, 업스트림 대비
  +10커밋/behind 0), final-harness = `D:\AI PROJECT\claude-final`. 버전은 여기 기록하지
  않는다 — 같은 날 두 번 낡은 것이 실증됨(v0.16.0→v0.16.2→v0.17.0). 부트스트랩 시
  현행 실측 + lock (D-018). → 트랙 A 부트스트랩 이 머신에서 가능.
- IDES-DEV 프로파일 참고: sap.env가 `SAP_RFC_BACKEND=odata`인데 URL 미설정 —
  RFC 디스패치 3계열(Screen·GUI Status·Text Element)은 이 프로파일에서 env 에러.
  해소하려면 ① soap 전환(추가 env 불요, ICF `/sap/bc/soap/rfc` 활성 확인됨 — 무인증 401)
  + ② ZMCP_ADT_UTILS/ZMCP_ADT_TEXTPOOL FM 설치(서버측 부재 확인 — 단 CreateFunctionGroup이
  이 릴리스에서 결함이라 MCP 설치 불가, SAP GUI 수동 생성 필요. §6 엔진 백로그 3).
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
  → **2026-07-11 판정 정정(D-015)**: RunUnitTest 404는 표준 S/4HANA 2021 IDES에서도 동일 재현 —
  박스 장애가 아니라 **엔진 결함 유력**, §6 엔진 백로그 3으로 이관. Textpool 500은 기존 판정 유지(KR-DEV 복구 대기)
  → **RunUnitTest 해소(2026-07-11, 엔진 4.13.1)**: 근본 원인은 Cloud 전용 API 호출 —
  클래식 testruns 전환 수리 후 배포 형태(launch.cjs+새 번들)로 IDES 완주, 4개 테스트
  메서드 전부 PASS. **E2E 잔여는 WriteTextElementsBulk 1건만 남음**(KR-DEV 복구 또는 5-7)

## 5. E2E 이후 남은 백로그 (상세 — 새 세션이 이 절만 읽고 착수 가능하게 기록)

**5-1~5-4·5-6·5-9·5-10 완료 (2026-07-11)** — 남은 항목과 순서 (새-컨텍스트 이중 검토
2026-07-11이 재배열, 근거: "안전 주장-실체 격차가 열린 채 편의를 쌓지 않는다"):
**트랙 A: Phase 2 — Read-Only Planning(1.5까지 완료 2026-07-11 보조 머신 — 무인 첫
완주 + red/green 실증, 파일럿 = IDES-DEV $TMP, 상세 §1 현황·STATE.md)** → 5-7(설치 절차 이식)
→ 5-8(잔여 축소 — row-data 승인 실증은 Codex 실사용 전 필수로 상향, compact-readonly
스파이크는 폐기) → 5-5(축소 — 아래). 공통 완료 조건: §9의 게이트 4종 통과 유지 +
상태 변경 시 이 문서 갱신.

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

### 5-4. 검증도구 개선 3건 — ✅ 완료 (2026-07-11, L5 리뷰 보류분 2-3/2-4/2-5)

- `check-links.mjs`: 앵커(#섹션) 존재 검증 — GitHub 슬러그 규칙(유니코드 보존·중복 -N·
  fence 내 # 제외), 순수 `#앵커`(자기 파일)와 `file.md#앵커` 모두. 도입 즉시 실검출:
  string-processing.md 목차 5건(원본부터 낡은 목차 → 실제 15섹션 구조로 수리).
- `check-migration-coverage.mjs`: copy/transform 규칙의 목적지(3열 backtick 토큰) 실재
  검사 — deferred 행·와일드카드 토큰·프로즈만 있는 행은 skip, 부재 = exit 1. 도입 즉시
  실검출: INSTALLATION 행의 구 계획 목적지 docs/installation/ 미채택 → 실제 이식처
  (adapters/ README 3벌)로 매니페스트 정정. **주의: 3열에 backtick 경로를 쓰면 실재
  검사 대상이 된다 — 존재하지 않는 경로 언급은 backtick 없이 쓸 것.**
- `smoke-mcp.mjs`: `--exposition` 지원(무인자 시 기존 동작 동일). readonly 실측:
  **tools 65 / write 0** (row-data 2종은 readonly에도 노출 — 정책층 커버, 기존 문서와 일치).

### 5-5. deferred 스크립트 (원천은 동결 레포 sc4sap-custom/scripts/ — 읽기만) [2026-07-11 축소]

| 원천 | 목적지 | 상태 |
|---|---|---|
| extract-spro.mjs · extract-customizations.mjs | `tools/extract/` | deferred 유지 (수동 대체: spro-lookup.md · customization-lookup.md) |
| fetch-abap-keyword-doc.mjs · fetch-sap-help-doc.mjs | `tools/fetch/` | **우선 검토로 상향** — 코어 페르소나(sap-doc-specialist.md)가 이미 "bundled"로 참조 중이라 deferred가 아니라 깨진 표면. 구현하거나 참조를 제거해야 함 (Codex 교차검토 발견) |
| sap-profile-cli.mjs | `scripts/` | deferred 유지 (수동 대체: troubleshooting.md) |
| sap-option-tui.mjs | — | **폐기 확정 (2026-07-11)** — config.json 직접 편집으로 충분함이 장기 실증. 훅 안내도 troubleshooting 절차로 교체 완료(5-10) |

### 5-7. sap-assets 설치 절차 + FM 부재 시 제외 규칙 [이식 갭 — 2026-07-11 발견]

- **근거**: 원본 setup의 **wizard-step-09**(동결 레포 — 읽기만)는 ZMCP_ADT_UTILS 번들을
  MCP 도구로 자동 설치하는 절차를 가짐 — tier 게이트(QA/PRD 거부 + CTS 안내) ·
  시스템 dedup(sentinel 파일) · 기존재 skip · 부분 실패 시 사용자 판단 ·
  **RFC-enabled는 SE37 수동**(TFDIR.FMODE는 ADT REST로 불가 — 원본도 수동).
  라이트에는 소스(server/sap-assets/)와 진단(troubleshooting §1 FM 존재 확인)만 이식되고
  설치 절차와 부재 시 제외 규칙은 미이식 — E2E 잔여 IDES 이전 시도에서 발견(D-015 세션).
- **작업**: ① 설치 절차를 `core/procedures/`로 이식(원본 스텝 9의 게이트 로직 유지,
  SAP_VERSION별 소스 선택 S4/ECC, RFC-enabled 수동 단계 명시) ② 절차들에 "textpool FM
  부재/RFC 백엔드 미구성 시 Screen·GUI Status·Text Element 3계열 SKIPPED 처리 +
  `environment_context.known_outages` 기입"(5-3 필드 활용) 명시.
- **선결**: ~~CreateFunctionGroup 엔진 수리~~ → ✅ **4.13.1로 해소(2026-07-11)** —
  FUGR 생성·삭제 IDES 라이브 검증 완료, 설치 절차 착수 가능. 단 RFC-enabled 속성은
  ADT로 불가(TFDIR.FMODE)라 SE37 수동 단계가 여전히 필요(원본 스텝 9와 동일).

### 5-8. 노출 정책 실행 항목 [D-016 후속 — 2026-07-11 이중 검토로 우선순위 재조정]

- **Codex config-level 도구 제어 실증** [**상향: Codex 실사용 전 필수** — readonly
  프리셋에도 row-data 2종이 노출되고 Codex엔 L3 훅이 없어 정책 의존]: 공식 설정의
  `enabled_tools`/`disabled_tools`/도구별 `approval_mode`로 row-data 2종을 `prompt` 고정
  가능한지 현행 설치 버전에서 1회 실증 → 되면 어댑터 README 정본화. Antigravity의 대응
  기능도 실측(없으면 launch.cjs 앞 이름 보존형 tools/list 필터 검토).
- **절차별 required_capabilities** [낮음]: 절차 문서에 필요 capability 선언 + 프리셋
  tools/list가 이를 전부 포함하는지 자동 검사(스크립트).
- ~~compact-readonly 스파이크~~ → **폐기 (2026-07-11)** — D-016이 기각한 raw compact의
  잔영. 실수요 실증 전 착수 금지 (재론 시 합격 기준은 D-016 원문 참조).
- smoke-mcp의 write 판정을 이름 추정 대신 카탈로그 operation class 기반으로 [낮음 —
  접두어 분류의 구조 한계는 RuntimeCreateProfilerTraceParameters 미커버(5-10에서 수리)로
  재확인됨].

### 5-9. 트랙 A 선결 결정 — ✅ 완료 (2026-07-11, D-018): 분리 유지 + 버전 lock

- **결정**: vsp-custom·final-harness 모두 **편입하지 않는다** — 분리 유지 + 부트스트랩
  시 버전 lock(커밋 sha·바이너리 해시·명령 계약). 근거·대안·기각 사유·재론 트리거는
  **D-018 원문**, 설계 반영은 DESIGN.md §2(분리 근거 교체)·§16-1(vsp.lock)·§16-3
  (final-harness 재기준). Fable 5 + Codex 독립 이중 검토가 동일 결론으로 수렴한 결정.
- 핵심 논거 요약: 트랙 A가 소비하는 것은 vsp *CLI 바이너리*뿐(engine/과 달리 수리→
  재번들→동봉 루프 없음) + 업스트림 oisee 활발(별 411, 2026-06 push — engine 업스트림
  babamba2 별 5·정체와 정량 대조) + 수리 마찰 실증 0건.

### 5-10. 안전·진실성 수리 스프린트 — ✅ 완료 (2026-07-11, 이중 검토 후속)

새-컨텍스트 이중 검토(Fable 5 + Codex 교차, 검토 전문은 세션 기록)가 확정한 공백을
일괄 수리. 결정 기록: D-018(소유 전략)·D-019(품질 계약 봉인). 수리 내역:

1. **엔진 4.13.2** (커밋: engine/ + interactive/server 반영): ① tier fail-closed —
   연결정보 존재 + SAP_TIER 미해석/이상값이면 `UNKNOWN` 센티널로 readonly 강제(명시
   `dev`만 write 개방), env 파일 hydrate에 SAP_TIER 편입(--env-path/MCP_ENV_PATH/cwd
   .env 경로 전부 커버) ② GetSqlQuery 테이블 추출 강화(주석 제거·콤마 목록·별칭 스킵)
   + 추출 불능 시 쿼리 거부(fail-closed). jest **512 통과(+30, 실패 0)**, 번들 반영,
   verify-engine OK, smoke 155 유지(도구 증감 없음).
2. **L3 훅 fail-closed 전환**: block-forbidden-tables — INDEX_FILE 사망 경로 제거,
   블록리스트 로드 0건·stdin/JSON 파싱 실패 시 deny, SQL 추출 강화 + 식별 불능 시 ask.
   tier-readonly-guard — **DEV 기본값 폐기**(tier 미해석 = mutation deny, 명시 dev만
   통과), RuntimeCreateProfilerTraceParameters 커버(훅 + install-hooks matcher), 죽은
   `/sc4sap:sap-option` 안내를 프로파일 설정 절차로 교체. install-hooks findGroup의
   중복 삽입 버그 동반 수리. 격리 테스트 9케이스 통과, **이 머신 재배선 완료**.
3. **품질 계약 봉인 (D-019)**: verification.schema — check_syntax/activate SKIPPED
   불허(step-strict 분리). create-program — Phase 6 진입·Phase 8 완료에 행렬 검사
   (check_syntax=PASS ∧ activate=PASS ∧ unit/atc∈{PASS,SKIPPED}), 리뷰 후 수정은 전
   체인 재실행. sap-reviewer — disallowedTools 88종(Write/Edit/Bash/NotebookEdit +
   mutation MCP 84종, 카탈로그 대조 누락 0)으로 기계 격리, 판정은 응답 JSON 반환·기록은
   워커. UPDATE-RUNBOOK capability diff에 disallowedTools 동기화 스텝.
4. **표면 동기화**: engine/CLAUDE.md 재작성(**업스트림 Notion DB 기록 지시 제거** —
   외부 유출 벡터, 88→35줄), plugin.json 2벌(도구 수·구명 정정), compatibility.json
   (Claude smoke E2E 완료 반영), interactive/DESIGN.md 헤더(상태 정본=HANDOFF 포인터화).

**잔여 (후속 착수 조건 포함):**
- 엔진: `--mcp` 서비스키 연결의 tier 기본값은 미수리(env 파일이 없어 tier 소스 부재 —
  보수적 유지). §6 백로그 1 잔여로 이관, 서비스키 운용 시작 전 재검토.
- sap-reviewer 88종 disallowedTools의 라이브 기동 실증 1회 — 다음 create-program 완주 시.
- review-result.schema.json 최상위 description이 구 계약("리뷰어가 기록") 서술 잔존 —
  기능 무영향, 다음 스키마 수정 시 정정.
- **주 머신 재개 시 `node interactive/adapters/claude/hooks/install-hooks.mjs --project`
  재실행 필수** (fail-closed 훅 + matcher 갱신 배선).

### 5-11. 트랙 A 무인 gated write 선결 — 새-컨텍스트 리뷰 게이트 편입 [2026-07-11 이중 판단 수렴]

- **근거**: "execute.py가 ABAP에 맞나" 검토에서 메인 + Fable 5 새-컨텍스트 리뷰가 독립
  수렴한 공백 — 트랙 B E2E가 실증했듯 문법·ATC·활성화 전부 통과한 시맨틱 결함(INNER vs
  LEFT JOIN)은 기계 verify가 못 잡고 리뷰만 잡는다(§4.1). 무인 엔진의 완료 판정은 기계
  verify뿐이라 gated write 체인(DESIGN §8.3)에 이 구멍이 열려 있음.
- **작업**: 무인 gated write(Phase 3) 투입 전에 새-컨텍스트 리뷰 게이트를 무인 체인에
  편입(방식은 그때 설계 — 엔진 verifier 프롬프트 강화 vs 별도 리뷰 스텝 vs 사람 셰퍼딩
  유지 중 택1). **그 전까지 무인 write는 켜지 않는다** — 나머지 선결 2건(0b 마커 실측,
  §14-2 drift 실측)과 함께 Phase 3의 3대 선결.
- 엔진 유지 판단 자체의 반증 조건 5종(마커 분류 실패·CDS/RAP lint 차단력 0·drift 불성립·
  BLOCKED 과반 지속·수요 부재)은 로드맵 Phase 완료 기준과 일대일 — 별도 결정 불요,
  로드맵 완주가 곧 판정 (검토 전문은 세션 기록).

### 5-6. 다국어 README — ✅ 결정 완료 (2026-07-11): 재작성 안 함

- 개인 도구라 다국어 README 소비자 없음 + 코어(영어)·운영 문서(한국어) 역할 분담으로
  충분 + 원본 archive 보존이라 수요 발생 시 언제든 재론 가능(가역). 매니페스트
  `README.*.md` 행에 확정 기록 (분류는 archive 그대로).

### 머신별 가능 범위 (2026-07-11 기준)

| 작업 | 주 머신 | 보조 머신(D:\AI PROJECT) |
|---|---|---|
| **트랙 A: Phase 2 Read-Only Planning (다음 착수)** | vsp 빌드 + 플러그인 설치부터 (§16-1·3, lock 대조) | ✅ Phase 1.5까지 완료 — Phase 2부터 (§1 현황) |
| 5-10 잔여: install-hooks 재배선 | **재개 시 필수** (`--project` 재실행) | ✅ 완료 (2026-07-11) |
| E2E 잔여: WriteTextElementsBulk | KR-DEV 백엔드 복구 후 | △ IDES에 ZMCP FM 수동 설치(GUI) 시 soap로 가능 (§3) |
| 엔진 백로그 (§6) | ✅ 레포 내 `engine/` (D-017) | ✅ 동일 — 4.13.1·4.13.2 수리·재번들 실증 |

## 6. 엔진 백로그 (`engine/` — 2026-07-11 D-017로 편입, 그 전엔 별도 포크)

**엔진 백로그 1 — tier 기본값**: 연결정보 존재 + `SAP_TIER` 미설정이면 tier가 DEV로
기본되어 write 가드가 열림 (L2 실측). 요구: "SAP_TIER 미설정 + 연결정보 존재 시 기동
거부(또는 write 미등록)".
→ ✅ **대부분 해소 (4.13.2, 2026-07-11, 5-10)**: env 파일 기반 연결(프로파일·--env-path·
MCP_ENV_PATH·cwd .env)은 tier 미해석 시 `UNKNOWN`=readonly 강제로 fail-closed. L3 훅도
동일 방향 전환(DEV 기본 폐기). **잔여**: `--mcp` 서비스키 연결은 tier 소스(env 파일)가
없어 DEV 기본 유지 — 서비스키 운용을 시작하기 전에 재검토할 것.

**엔진 백로그 3 — 2026-07-11 IDES(S/4HANA 2021) 실측** (재번들 절차는 UPDATE-RUNBOOK):

1. ~~**RunUnitTest 404**~~ → ✅ **해소 (4.13.1, 포크 커밋 d0ed3ba)**: 원인 = vendored 클라이언트가
   ABAP Cloud 전용 `/sap/bc/adt/abapunit/runs`를 온프레미스에 호출(discovery 실측으로 컬렉션
   부재 확정 — 2시스템 404의 정체). 클래식 `POST /abapunit/testruns`(runConfiguration v1,
   options 블록 포함) 전환 + 동기 결과를 connection 귀속 TTL 스토어로 run_id 계약에 브리지.
   Codex 교차 리뷰 MAJOR 6건 중 5건 반영(URI 인코딩·5분 타임아웃·스토어 격리·응답 검증·
   href 관대화). IDES 라이브 4메서드 PASS + jest 343 통과.
2. ~~**CreateFunctionGroup 400**~~ → ✅ **해소 (4.13.1)**: 원인 = CT `groups.v3+xml` 하드코딩
   vs 시스템은 v2만 광고(A/B 프로브 확정). discovery 협상(최고 광고 버전, per-connection
   캐시, 실패 시 현행 폴백, legacy 분기는 협상 스킵). 생성→활성화→삭제 라이브 검증.
3. **CreateProgram(program_type=function_group) 거짓 성공**: 타입 무시하고 PROG/P 생성
   (응답 `"type":"PROG/P"`, URI `programs/programs`) — (d)의 거짓 성공 계열.
4. **CreateClass 잠금 미해제**: 생성 직후 Update 계열이 "locked by another user"
   (같은 세션 즉시 호출 포함 4회 재현, ReloadProfile·GetSession(force_new) 무효, 세션 만료로만
   해제). UpdateClass는 stale 잠금 핸들 재사용("ungültiges Sperr-Handle") + 실패 경로 잠금
   누수 의심 — (c) DeleteInclude enqueue 누수와 같은 계열.
   → **병명 규명 (2026-07-12 Phase 2 채점)**: UpdateClass의 "ungültiges Sperr-Handle"은
   stale 캐시가 아니라 **lock(성공)→중간 stateless 요청이 stateful 세션 롤백→PUT 시점
   잠금 증발** — vsp issue #88(HTTP 423)과 동일 메커니즘. IDES(커넥션 재활용 환경)에서
   결정적 재현(핸들이 매번 갱신됨), KR-DEV(직결)에서 정상인 것과 정합. 수리 방향 =
   vsp 642c03c와 동일(lock~write 체인의 중간 요청 stateful화). 이 실패 유형은 고아
   잠금을 남기지 않음(SM12 확인). 상세: phases/2-duedate-reuse/scoring-raw.md
   → ✅ **UpdateClass 해소 (4.13.3, 2026-07-12)**: handleUpdateClass lock 직후
   `setSessionType('stateful')` 1줄(체인 전체 세션 유지, include 핸들러 선례와 동일
   패턴) + 회귀 테스트(세션타입 헤더 핀, 역-검증 완료). jest 439 통과, 번들 반영,
   **IDES 라이브 red→green**: 당일 2회 실패했던 동일 호출이 updated+activated 완주.
   **잔여(신규 백로그 9)**: UpdateInterface·UpdateProgram이 구조 동일(lock→check→
   PUT, stateful 미설정)한 잠복 버그 — 각 파일 인라인이라 이번 최소 수리에서 제외,
   동일 1줄 수리 가능. CreateClass 생성 직후 잠금 건은 별개로 잔존.
5. **DeleteFunctionGroup 조용한 실패** (4.13.1 검증 중 3회 실측): deletion 서비스가 실패를
   HTTP 200 + `del:isDeleted="false"` + E-메시지로 반환하는데 vendored delete가 하드코딩
   `success:true`로 대체 — 잠금 등 삭제 실패가 성공으로 보고됨.
6. **low/CDS unit test 경로 동일 결함**: `RunClassUnitTestsLow`·CDS unit test 실행/조회가
   여전히 Cloud 전용 `/abapunit/runs` 사용 — 온프레미스에서 동일 404 예상 (high만 4.13.1로 수리됨).
7. **vendored 상수 비대칭**: `ACCEPT_FUNCTION_GROUP`(v2,v1) vs `CT_FUNCTION_GROUP`(v3) — 업스트림 결함.
8. **abapunit 엔드포인트 discovery 협상**(Cloud `/api/abapunit/runs` 병행 지원) — Codex 리뷰
   제안, 온프레미스 포크라 보류.

**안전훅 L3 확장 (2026-07-11)**: tier-readonly-guard의 MUTATION_PREFIXES에
Activate·Patch·Release·Write 추가 (Codex 설계 리뷰가 지적한 공백 — ActivateObjects·
PatchGuiStatus·ReleaseTransport·WriteTextElementsBulk가 L3를 통과했음. 엔진 L2는 4.12.0부터
fail-closed allowlist라 실위험은 없었음). install-hooks matcher + 이 머신 settings 갱신,
격리 테스트(QA 4계열 DENIED·RunUnitTest/ReloadProfile 허용·DEV 무차단) 통과.
**주 머신 재개 시 `node interactive/adapters/claude/hooks/install-hooks.mjs --project` 재실행 필요.**

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
engine/                         ← MCP 엔진 소스 정본 (D-017 편입 — TS 소스·테스트·번들 도구.
                                   수리→bundle→interactive/server 반영은 UPDATE-RUNBOOK)
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
git log --oneline | head                                 # 최근: 트랙 A 부트스트랩 lock 2종(§16-1·3) ← 726f5ebe(D-018/019·5-10 문서)
```

push는 사용자 판단 — 커밋까지만 하고 push는 요청 시에만 (원격: hjaewon/sap-agentic-harness).
아카이브용 엔진 포크 hjaewon/abap-mcp-adt-powerup은 **4.13.1에서 동결** — 4.13.2부터의
수리는 레포 내 `engine/`에만 존재한다 (D-017: 포크는 히스토리 아카이브).
