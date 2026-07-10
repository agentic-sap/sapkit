# sc4sap-lite — 3사 하네스 공통 라이트 버전 설계서

> **상태: L0~L5 산출물 구현 완료 + Fable 5 구현 코드리뷰 반영 (2026-07-10). 잔여: L3 E2E(사용자 설치·SAP 프로파일 필요) → L6 교차 검증.**
>
> 이 문서는 컨텍스트 클리어 후 어떤 세션이든 이 문서만 읽고 구현을 시작할 수 있도록 작성된
> 단일 소스다. **정본: 본 파일** — 2026-07-10 Phase L0에서
> `sap-agentic-harness/docs/superpowers/specs/2026-07-10-sc4sap-lite-design.md`로부터 이동했다.

## 0. 한 문장 요약

`sc4sap-lite`는 sc4sap-custom(Claude Code 전용 SAP 플러그인)의 전 자산(모듈 지식 14+BC,
업종 14, 국가 16, ABAP 규약·템플릿, 페르소나 26, 절차 노하우, MCP 서버)을 **하네스 중립
코어 + 얇은 어댑터 3벌(Claude Code / Codex / Antigravity)** 구조로 재편성하되, 멀티에이전트
자동 디스패치·team 협업이라는 무게를 버리고 "1명 작업 + 1명 새-컨텍스트 리뷰 + SAP 기계
검증" 품질 모델로 단순화한 신규 레포다.

## 1. 배경과 확정 결정

### 1-1. 발단 (사용자 요구, 2026-07-10)

- sc4sap-custom은 Claude 전용이라 Codex 버전 변환 비용이 크다 → **Codex와 Antigravity에서도
  사용 가능하게** 발전시키고 싶다.
- 그대로 옮기는 게 아니라 **"다 옮기되 가벼운 버전"**으로 재구성한다.
- sc4sap의 모듈 에이전트·업종별·ABAP 자산을 (sap-agentic-harness packs에서도) 가져올 수
  있는 구조로 설계한다.

### 1-2. 대화에서 확정된 결정 (재논의 불필요)

1. **3사 통일**: Claude Code도 라이트 버전으로 갈아탄다. 기존 sc4sap-custom은 동결
   보존(삭제 안 함, 지식 수정 금지).
2. **전 자산 이식**: 지식 100% + 페르소나 26개 + 절차 노하우 전부. 버리는 것은
   **멀티에이전트 자동 디스패치와 team 협업 두 가지뿐** — 나머지는 형태 변환.
3. **품질 모델**: 1명 작업 + 1명 새-컨텍스트 리뷰 + SAP 기계 검증(CheckSyntax→활성화→
   ABAP Unit→ATC). 리뷰어는 read-only 판정만, 수정은 작업자가(독립성 보존).
4. **안전훅 유지**: 사전 차단 훅(안전 3종)은 Claude 어댑터에 옵션으로 유지.
5. **접근 방식 A 채택**: 신규 레포 sc4sap-lite (B: 인플레이스 개조, C: sap-agentic-harness
   흡수는 기각 — B는 동작 중 플러그인 수술+동결 결정과 충돌, C는 DESIGN.md §2 역할 분리 위반).

### 1-3. 선행 설계와의 관계 (중요)

`sc4sap-custom/private/lightweight-redesign-design.md`(2026-07-06, 구현 상당 부분 완료)의
성과를 **그대로 승계**한다 — 재작업 없음:

- **엔진 번들화 완료**: `engine/server.bundle.cjs`(8.25MB) + npm 채널
  `@hjaewon/abap-mcp-adt-powerup@4.9.x`. vendor 771MB 공정은 이미 제거됨.
- **훅 다이어트 완료**: 편의성 훅 15종은 `SC4SAP_LEAN` 기본 오프. 감사 결과 주입기들은
  run.cjs stdin 버그로 애초에 동작한 적이 없었음이 실측됨.
- **안전 훅 경계 확정**: 안전 3종(block-forbidden-tables, tier-readonly-guard,
  prefer-sqlquery-explicit-fields)은 hooks.json이 아닌 install-hooks.mjs → 프로젝트
  settings 주입 방식으로 분리되어 있고, 서버 자체에 L4 가드(blocklist·SAP_TIER) 내장.
- **지식 성장 규약**(data-only 마크다운 + 인덱스 1줄 + 트리거 로드, 상시 로드 진입 금지)을
  core/knowledge의 로딩 규약으로 채택.

충돌 정리: 선행 설계의 "기능 손실 0" 원칙과 본 설계의 "파이프라인 폐기"는 목적이 다르다 —
선행 설계는 "Claude 안에서의 무게" 문제, 본 설계는 "3사 이식성" 문제이며, **본 설계가
후속 결정으로 우선한다.**

### 1-4. 레포 좌표

| 역할 | 위치 (2026-07 기준) |
|---|---|
| 이식 원천 (동결 예정) | `D:\claude for SAP\sc4sap-custom` — `hjaewon/sc4sap-custom` (MIT, 업스트림 babamba2/superclaude-for-sap) |
| 본 설계 산출 레포 (신규) | `sc4sap-lite` — Phase L0에서 생성 |
| MCP 엔진 업스트림 | `hjaewon/abap-mcp-adt-powerup` (번들 원천, npm `@hjaewon/abap-mcp-adt-powerup`) |
| 무인 하네스 트랙 (별개) | `D:\claude for SAP\sap-agentic-harness` — DESIGN.md v2.1. packs가 lite core를 지식 원천으로 사용 (§5-3) |
| 선행 설계 문서 | `sc4sap-custom/private/lightweight-redesign-design.md` (비공개 유지) |

## 2. 무엇을 버리고 무엇이 남는가

| 자산 | 처리 |
|---|---|
| 지식(모듈·업종·국가·ABAP) | 100% 유지 — 무변환 복사(경로·링크만 갱신) |
| MCP 서버(SAP 실행 능력 ~150 도구) | 100% 유지 — server/로 이관, 3사 공통 등록 |
| 페르소나 26개 | 유지 — 서브에이전트에서 "호출 가능한 중립 문서"로 형태 변환 |
| 스킬 17개 중 10개 | 절차 문서로 변환 (관문·순서 유지, 자동 교대만 제거) |
| 스킬 중 sap-abap | 원래 순수 지식 — `knowledge/abap/reference/`로 편입 |
| 스킬 중 setup·mcp-setup·sap-doctor·sap-option | 설치 스크립트 + doctor + troubleshooting 문서로 변환 |
| **스킬 중 team·trust-session** | **명시 폐기** (team=Claude 전용 개념, trust-session=정적 권한 템플릿으로 대체) |
| hooks.json의 편의성 훅 15종 | 폐기 (선행 설계에서 무동작 실증) |
| 안전 훅 3종 | 유지 — Claude 어댑터에 승계 |
| 멀티에이전트 파이프라인(8역할 자동 교대) | 폐기 — "1+1+기계검증" 모델로 대체 |

파이프라인 폐기로 진짜 잃는 것: 역할별 모델 라우팅(비용 최적화), 병렬 속도, 대형 작업의
컨텍스트 분리. 품질의 본질(교차 검증)은 새-컨텍스트 리뷰 패스로 보존한다.

## 3. 코어 구조 (§1 확정안 — 이중 리뷰 v2)

### 3-1. 원칙

- **코어는 어떤 하네스도 모른다. 하네스를 아는 것은 어댑터뿐이다.**
- 하네스 중립의 기준은 "단어 금지"가 아니라 **"의미 보존 + 표준 동작 어휘집"**이다
  (Codex 리뷰 1.1로 정정 — 지식 파일에 이미 구형 MCP 도구명이 포함되어 있어 단어 금지는
  무변환 복사와 양립 불가). core는 중립 capability명을 쓰고 어댑터가 실제 도구명으로
  매핑하며, 실제 하네스 식별자(`.claude/`, `mcp__` 프리픽스 등)만 CI에서 검사한다.
  구형 도구명(`mcp__mcp-abap-adt__*`)은 이식 시 1회 정규화한다.
- 지식 로딩 규약: data-only + 인덱스 + 트리거 로드 (선행 설계 S6 승계). 상시 주입 금지.

### 3-2. 디렉토리 구조

```text
sc4sap-lite/
  core/
    knowledge/
      modules/{FI,CO,MM,SD,PP,QM,PM,PS,HCM,TR,TM,WM,BW,Ariba}/  ← 14개, 원본 대소문자 보존
      modules/common/                  ← 교차모듈 지식 (configs/common 7파일)
      modules/BC/                      ← agent_details/bc 2파일 기반 특수 모듈 (신규 합성임을 명시)
      industry/  country/              ← 14업종 + 16개국
      abap/
        reference/                     ← skills/sap-abap 레퍼런스 + references/
        conventions/                   ← common/ 규약 (include-structure, oop-pattern, alv-rules,
                                          clean-code 3종, naming, text-element, constant 등)
        templates/                     ← oop/procedural/alv 샘플 + ecc/ (DDIC 헬퍼 템플릿 3종)
    personas/
      INDEX.md                         ← 유일한 발견 표면 (셀렉터). 본문 26개는 온디맨드 로드
      *.md                             ← 최소 헤더(name/description/지식참조/capability 태그
                                          readonly|readwrite) + 역할 본문. Claude 배선 제거
    procedures/
      create-program.md  create-object.md  release.md  analyze-symptom.md
      analyze-code.md  program-to-spec.md  compare-programs.md
      analyze-cbo-obj.md  deep-interview.md  ask-consultant.md  troubleshooting.md
      review-checklist.md              ← 인덱스 + 조건부 참조 구조 (거대 단일문서 금지)
      schemas/                         ← approval·review-request·review-result·verification 스키마
                                          (승인 = spec 해시 + SID/client + transport에 결합)
    policies/
      sap-standards.md                 ← Z/Y 접두어, transport 필수, 활성화 의무, 버전 가드
      verification-policy.md           ← CheckSyntax→활성화→ABAP Unit→ATC 체인, 차단 severity
      approval-gates.md                ← 관문=문서 규약임을 명시 (기계 강제는 Claude 훅 옵션 한정)
      data-protection/                 ← exceptions/ 12파일 이식 + 실데이터 조회 승인 정책
      credential-handling.md
    vocabulary.md                      ← 표준 동작 어휘집 (중립 capability명 ↔ 어댑터 도구명 계약)
    project-context.md                 ← 다섯 번째 요소: .sc4sap/{config.json, active-profile,
                                          sap.env} 프로젝트 런타임 상태 규약
  server/
    server.bundle.cjs  VERSION  integrity.json
    runtime-deps/keyring/              ← NODE_PATH 배선 포함 (keychain 비밀번호 저장)
    tool-catalog/                      ← data/ 4파일 (read 81 / write 76 분류 — 노출 프리셋 원천)
    sap-assets/                        ← abap/ 헬퍼 17파일 + ALV 핸들러 + 설치 manifest
    UPDATE-RUNBOOK.md                  ← 업스트림 재번들·무결성 검증·capability diff 절차
  adapters/                            ← 콘텐츠 복제 없음. manifest·정책 매핑·설치물만
    claude/  codex/  antigravity/  compatibility.json
  scripts/
    build-adapters.mjs                 ← manifest 생성 + 링크 체커 + 이식 커버리지 검증
    install-{claude,codex,antigravity} ← Node 단일 (크로스플랫폼, Windows 우선 실측)
    doctor.mjs                         ← 3사 어댑터 버전/코어 해시 불일치 감지
  MIGRATION-MANIFEST.md                ← 원본 전 경로 5분류 (§5-1)
  LICENSE  THIRD_PARTY_NOTICES.md
```

### 3-3. 핵심 규약

1. **단일 원천 규칙**: 페르소나=역할·관점, 절차=순서·관문, 정책=불변조건만 소유.
   절차가 페르소나 본문을 복사하지 않는다 — 참조만. (이중 보관 드리프트 방지)
2. **프로젝트 컨텍스트**: `.sc4sap/` 규약(sapVersion·abapRelease·activeModules·industry·
   country·active-profile)은 선행 설계의 멀티 프로파일 체계를 유지한다. **"루트 .env
   하나로 통일" 발상은 기각** (서버 tier 가드가 `.sc4sap`을 읽으므로 우회 위험 +
   DEV/QAS/PRD 전환 현실과 충돌 — 이중 리뷰 합의 지적).
3. **설치 프로필 2종**: `knowledge-only`(지식+페르소나, 서버 미설치 — SAP 연결 없는
   컨설팅용)와 `connected`(서버+SAP 연결). 서버 8.25MB+런타임 4.5MB는 후자에서만.
4. **지식 정본 선언**: 이식 완료 시점부터 지식 정본 = sc4sap-lite. 동결된 sc4sap-custom은
   지식 수정 금지. sap-agentic-harness packs는 lite의 스냅샷 버전을 provenance로 명기.

## 4. 어댑터 3벌 (§2 확정안)

### 4-1. 수렴 구조

이중 리뷰로 확인: 3사 모두 현재 공식 배포 표면이 **플러그인(스킬+MCP 동봉)**이다 —
Claude(`.claude-plugin`), Codex 0.144+(`.codex-plugin`, custom prompts는 **deprecated**),
Antigravity(agy CLI 1.0.7 `plugin install/validate`). 어댑터는 동일한 6개 계약을 각사
매니페스트 문법으로 표현한 것이다.

**어댑터 공통 계약 6가지:**

1. **MCP 등록** — `server/server.bundle.cjs` stdio 등록 (NODE_PATH keyring 배선 포함)
2. **페르소나 진입** — INDEX 셀렉터만 발견 표면에 노출, 본문 26개는 온디맨드
3. **절차 진입** — core/procedures를 스킬/워크플로우로 래핑 (본문 복사 금지, 참조만)
4. **정책 주입** — sap-standards 요약본만 상시, 상세는 참조 경로
5. **도구명 매핑** — vocabulary.md의 capability명 → 하네스 실제 도구명 표
6. **안전장치 매핑** — 3층 안전 모델의 L3을 자기 기계 수단으로 구현

### 4-2. 하네스별 실체

**adapters/claude/ (기준 구현 — 기존 자산 최대 재사용):**

```text
.claude-plugin/plugin.json
skills/          ← 절차 11개의 얇은 래퍼 ("core/procedures/X.md를 읽고 수행" 수준)
agents/          ← 최소 1개: sap-reviewer (read-only) — 리뷰 패스용
hooks/           ← 안전훅 3종 승계 (기존 install-hooks 방식 그대로)
permissions/     ← 정적 allowlist 템플릿 (trust-session 대체.
                    GetTableContents/GetSqlQuery 제외 유지 — 매번 승인 프롬프트)
```

**adapters/codex/:**

```text
.codex-plugin/ 매니페스트 + skills/ 래퍼 + MCP 등록 (플러그인 동봉 .mcp.json)
AGENTS.md        ← 인덱스만 (합산 32KiB 한도 준수): 표준 요약 + core 경로 + 셀렉터 안내
exposition 프리셋 ← tool-catalog 기반 도구 노출 축소 — Codex는 지연 로딩이 없어
                    등록된 도구 전부가 컨텍스트에 올라가므로 read 중심 프리셋 필수
```

- 설치는 **전역** (프로젝트 config는 trusted 게이트로 신뢰 불가 — installer가 처리)
- 리뷰 패스: `codex exec` 새 세션 (read-only 샌드박스)

**adapters/antigravity/:**

```text
플러그인(agy) 동봉: rules 1~2개 (안전 규칙 요약 — 파일당 12,000자 한도 준수)
                  + workflows (절차·페르소나 진입점, /create-program 형태)
                  + MCP 설정 (~/.gemini/config/mcp_config.json에 merge-write)
```

- 페르소나는 rules가 아니라 **workflows**로 (rules는 상시 주입이라 컨텍스트 비용)
- 리뷰 패스: Agent Manager에서 리뷰 에이전트 별도 실행
- 주의: Antigravity 문서가 2.0 표면으로 이행 중 — compatibility.json에 검증 버전
  (agy 1.0.7) 고정, L5 착수 시 재검증
- **L5 실측 갱신 (2026-07-10)**: 예상(rules/workflows 신규 제작)보다 단순하게 해결 —
  루트 `plugin.json` 매니페스트 하나 추가로 `agy plugin install <repo>` 직설치가 동작
  (skills 11 + agents 1 임포트, core/server 포함 전체 복사). MCP 번들은 agy 1.0.7
  미지원이라 전역 mcp_config 수동 등록. 상세: `adapters/antigravity/README.md`,
  `docs/research/L0-cli-surface.md`

### 4-3. 안전 모델 — 3층

| 층 | 실체 | Claude | Codex | Antigravity |
|---|---|---|---|---|
| L1 문서 정책 | core/policies | ✅ 동일 | ✅ 동일 | ✅ 동일 |
| **L2 서버 내장 가드** | 번들의 blocklist + SAP_TIER readonly 가드 (`.sc4sap` 프로파일 해석) — **3사 공통 기계 방어선** | ✅ | ✅ | ✅ |
| L3 하네스 기계 장치 | 각사 고유 | 안전훅 3종 + allowlist | approval 모드 + 샌드박스 | 자체 권한 설정 |

- 실데이터 조회 2종(GetTableContents/GetSqlQuery): Claude는 allowlist 제외로 매번 승인.
  Codex/Antigravity는 L2+L1뿐 — **Claude보다 한 겹 약함을 어댑터 README에 정직하게 명시.**
- **connected 설치 수용 기준**: 프로파일 미설정 시 서버가 write 도구를 노출하지 않을 것
  (L2가 최후 방어선이므로 — Phase L2 검증 항목).

### 4-4. 리뷰 패스 인계

작업자가 `schemas/review-request.json`(변경 객체 목록 + spec 해시 + SID/client + transport)을
남기면 → 새 컨텍스트의 리뷰어가 review-checklist.md로 판정 → `review-result.json` 기록.
리뷰어는 read-only 판정만, 수정은 작업자가.

## 5. 이식 매핑 · 로드맵 · 상위 설계 반영 (§3 확정안)

### 5-1. 이식 매핑표 (MIGRATION-MANIFEST 골격 — 미분류 0이 완료 조건)

| 원본 | 분류 | 목적지 / 처리 |
|---|---|---|
| `configs/` 14모듈+common | copy | `core/knowledge/modules/` (대소문자 보존) |
| `industry/` `country/` | copy | `core/knowledge/{industry,country}/` |
| `skills/sap-abap/` | copy | `core/knowledge/abap/reference/` |
| `common/` 50파일 | transform | 규약→`abap/conventions/`, 정책→`policies/`, 절차→`procedures/`, Claude 전용 4종(model-routing-rule·team-consultation-protocol·context-loading-protocol·multi-profile-artifact-resolution)→obsolete |
| `agents/` 26개 | transform | `core/personas/` (배선 제거 + capability 태그) |
| `agents/agent_details/bc/` | transform | `core/knowledge/modules/BC/` |
| `skills/` 10개 | transform | `core/procedures/` (1인 절차화. troubleshooting.md는 sap-doctor 노하우에서 신규 합성) |
| `skills/` setup·mcp-setup·sap-doctor·sap-option | transform | `scripts/install-*` + `doctor.mjs` + troubleshooting.md |
| `skills/` **team·trust-session** | **obsolete** | 명시 폐기 |
| `hooks/hooks.json` + LEAN 훅 15종 | obsolete | 선행 설계에서 무동작 실증 |
| `scripts/hooks/` 안전 3종 + install-hooks.mjs | copy | `adapters/claude/hooks/` |
| `engine/` (번들·VERSION·integrity) | copy | `server/` |
| `runtime-deps/keyring/` | copy | `server/runtime-deps/` |
| `data/` 4파일 | copy | `server/tool-catalog/` |
| `abap/` 17파일 | copy | `server/sap-assets/` + 설치 manifest |
| `asset/template_base.xlsx` + `scripts/spec/` | copy | 스펙 산출 파이프라인 유지 (program-to-spec 의존) |
| `skills/create-object/ecc/` 템플릿 3종 | copy | `core/knowledge/abap/templates/ecc/` |
| `exceptions/` 12파일 | copy | `core/policies/data-protection/` |
| `tests/validation/` | transform | 링크 체커 + 이식 커버리지 테스트로 개조 |
| `docs/` | transform | 선별 (bundle-integrity → UPDATE-RUNBOOK 등) |
| **`private/`** | **exclude-private** | 영구 denylist — 어떤 산출물에도 미포함 |
| `src/` `.omc/` CHANGELOG 등 | obsolete/archive | 구형 stub·기록물 |

### 5-2. 로드맵 (완료 기준 포함)

| Phase | 작업 | 완료 기준 |
|---|---|---|
| **L0 부트스트랩** | 레포 생성, MIGRATION-MANIFEST 전 파일 분류, 링크체커 작성, Codex `.codex-plugin`·agy plugin 표면 실측 스모크 | 미분류 파일 0 + 두 CLI 스모크 로그 존재 |
| **L1 코어 이식** | knowledge→personas→procedures→policies 순 이식, 구형 도구명 정규화, 대소문자 보존 | 커버리지 테스트 통과 + 링크 체커 0 에러 |
| **L2 서버 이관** | server/ 구성, connected 설치 검증 | tools/list 원본 일치 ✅ + 프로파일 미설정 시 write 도구 미노출 — **실측 미충족(목록 노출됨, inspection-only로 완화)**: 엔진 포크 이슈로 이관, `--exposition`으로 노출 축소 가능. 상세 `docs/research/L2-server-verification.md` |
| **L3 Claude 어댑터** (기준 구현) | 플러그인+안전훅+권한 템플릿 | FI 상담 1건 + create-program 절차 1건 E2E (리뷰 패스 포함) |
| **L4 Codex 어댑터** | 플러그인+AGENTS 인덱스+exposition 프리셋 | 동일 상담 + 객체 조회 E2E, AGENTS 32KiB 한도 준수 확인 |
| **L5 Antigravity 어댑터** | 플러그인(rules+workflows)+MCP merge-write | 동일 E2E, rule 12,000자 한도 준수 확인 |
| **L6 교차 검증** | 동일 과제를 3사에서 완주, 리뷰 인계 스키마 검증, doctor 동기화 점검 | 3사 완주 로그 + 인계 스키마 왕복 1회 실증 |

L3까지가 "지금과 동등"의 회복점, L4~L6이 본 프로젝트의 신규 가치다.

### 5-3. sap-agentic-harness DESIGN.md 반영 (소폭 3건 — 구현 계획에 포함)

1. §1 좌표 표에 `sc4sap-lite` 행 추가 — 역할: "지식 정본 + 3사 대화형 트랙"
2. §12 packs 콜드스타트 출처를 sc4sap-custom → **sc4sap-lite core**로 변경 + 스냅샷
   버전 명기(provenance) 규약 추가
3. §2 그림의 대화형 트랙 주석 갱신 — sc4sap-custom은 "동결(지식 수정 금지)" 표기

### 5-4. 미결 사항 (구현 시 결정)

| # | 항목 | 시점 |
|---|---|---|
| 1 | Codex `.codex-plugin` manifest 정확 스키마 실측 | L0 |
| 2 | Antigravity 2.0 표면 이행 여부 재검증 | L0, L5 착수 시 재확인 |
| 3 | 페르소나 INDEX 셀렉터 형식 (표 vs frontmatter 집계) | L1 |
| 4 | review-request/result 스키마 필드 상세 | L3 |
| 5 | Codex exposition 프리셋의 read/write 경계 (tool-catalog 기준) | L4 |

## 6. 검토 이력 (이중 리뷰, 2026-07-10)

Fable 5 서브에이전트(지적 26건)와 Codex CLI 0.144.1(지적 28건)이 동일 브리프로 독립 검토.
v1 → v2(본문 §3·§4) 반영의 결정적 지적:

- **합의 지적 12건 전부 반영**: 모듈 목록 정정(14+common, BC는 합성), 프로젝트 런타임 상태
  계층 신설, exceptions/ 12파일 이식, keyring/VERSION/integrity 동반 이식, 단일 .env 기각,
  abap/ 헬퍼의 server 분리, xlsx 파이프라인·ECC 템플릿 이식, 절차 11개로 확장, 페르소나
  INDEX 셀렉터, 어댑터 콘텐츠 복제 금지, 이식 매니페스트+링크 체커, doctor 동기화 점검.
- **설계 원칙 정정 2건**: "mcp__ 단어 금지" → "의미 보존 + 어휘집"(Codex 1.1 실측 반증),
  Codex 어댑터 표면을 custom prompts → 플러그인+스킬로 교체(공식 문서 근거).
- **단독 채택**: 설치 프로필 2종(Codex 4.3), review-checklist 인덱스+조건부 참조(Codex 4.4),
  승인의 spec 해시+SID 결합(Codex 5.5), capability 태그로 리뷰어 R/O 보존(Fable 4-3),
  서버 L2 가드의 3사 공통 방어선 규정(Fable 2-1).

## 7. 근거 실측 사실 (구현 세션의 재검증 좌표)

검증일 2026-07-10. 경로는 §1-4 기준.

- R1. sc4sap-custom `configs/`는 14개 모듈 + `common/` — BC 디렉토리 없음. BC 지식은
  `agents/agent_details/bc/` 2파일 (diagnostic-flows, transaction-codes).
- R2. 페르소나 26/26이 `.sc4sap/config.json`(sapVersion·abapRelease) 확인을 MUST로 요구.
- R3. 서버 번들은 시작 시 `.sc4sap/active-profile.txt`/`sap.env`에서 tier를 해석하고
  guardTool이 그 tier로 write를 차단 — 루트 `.env`만으로는 tier 가드가 실효 없음.
- R4. `.mcp.json`은 `NODE_PATH=runtime-deps/keyring/node_modules` 주입 — 번들 단독으로는
  keychain 저장 불가. `engine/VERSION`이 node-rfc·keyring의 external을 명시.
- R5. `hooks/hooks.json`은 11~12이벤트/23~30호출이나 편의성 훅은 LEAN 기본 오프이며,
  안전 3종은 `scripts/hooks/` + `install-hooks.mjs` 별도 경로 (선행 설계 M4 실측).
- R6. 지식 파일에 구형 도구명 잔존 — 예: `configs/FI/workflows.md`의
  `mcp__mcp-abap-adt__*` (Codex 리뷰 실측).
- R7. `skills/program-to-spec`은 `asset/template_base.xlsx` + `scripts/spec/*.mjs`에
  실행 의존. `skills/create-object/ecc/`에 DDIC 헬퍼 ABAP 템플릿 3종.
- R8. Codex CLI 0.144.1 로컬 설치 확인. 공식 문서 기준 custom prompts deprecated,
  플러그인(`.codex-plugin`)이 skill·MCP·hook 동봉, AGENTS.md 합산 기본 한도 32KiB,
  프로젝트 config는 trusted 게이트.
- R9. Antigravity 로컬 설치 확인(`~/.gemini/` 하위 antigravity*, config). agy CLI 1.0.7이
  plugin install/import/validate 제공. rules 워크스페이스 경로 `.agents/rules`
  (`.agent/rules` 하위호환), rule/workflow 파일당 12,000자 제한, MCP는
  `~/.gemini/config/mcp_config.json` 전역 관리. 문서가 2.0 표면 병기 중 — L0/L5 재검증.
- R10. sc4sap-custom `tests/validation/` 4종(agents·plugin-structure·skills·spro-configs)
  존재 — 링크/구조 검증 개조 원천.
