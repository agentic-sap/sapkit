# HANDOFF — 프로젝트 전체 상태와 재개 지침

> **목적: 컨텍스트/세션이 클리어돼도 이 문서 하나로 전부 복원.**
> 작성 2026-07-10. 새 세션은 ① 이 문서 → ② 필요 시 해당 트랙 DESIGN.md 순으로 읽는다.
> 상태가 바뀌면 이 문서를 갱신하는 것까지가 작업의 일부다.

---

## 1. 프로젝트 지도 — 레포 하나, 트랙 둘

```
D:\claude for SAP\sap-agentic-harness   ← 단일 레포 (원격: hjaewon/sap-agentic-harness, 미푸시 커밋 있음)
│
├── [트랙 A] 무인 하네스 트랙 — ★ 구현 미착수
│     설계: DESIGN.md (v2.1, 2026-07-09 확정)
│     내용: final-harness(D:\claude-practice\claude-fable-final) 엔진 + vsp-custom CLI로
│           ABAP 개발을 계획→실행→verify→LESSONS/RULES 학습 루프로 관리
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

## 4. 다음 작업: L3 E2E (여기서 재개)

**E2E = 실사용 시나리오를 처음부터 끝까지 1회 완주하는 검증.** 부품 검증(스모크·링크체커·훅
테스트)은 끝났고, 조립 검증이 남았다.

**선행 조건 (사용자 액션):**

1. Claude Code 세션 재시작 → `/sap-agentic-harness:troubleshooting` 등 스킬 11개 +
   `sap` MCP 서버 보이는지 확인
2. SAP DEV 프로파일: `~/.sc4sap/profiles/<별칭>/sap.env` (**SAP_TIER=dev 필수**) +
   본 레포 또는 작업 폴더에 `.sc4sap/active-profile.txt`(별칭 1줄) + `.sc4sap/config.json`
   (sapVersion·abapRelease·activeModules·industry·country). 기존 sc4sap-custom 프로파일 재사용 가능

**E2E 체크리스트** (상세: `interactive/adapters/claude/README.md`):

- [ ] MCP 연결 확인 (프로파일 있으면 connected, 없으면 inspection-only)
- [ ] **연결 상태 tools/list 실측** → 미노출 27종(CreateProgram·GetProgram 등 프로그램/화면
      계열)의 실체 판정 → `interactive/server/tool-catalog/README.md`의 보류 해소.
      **create-program 절차가 참조하는 도구 존재 확인이 E2E 선결**
- [ ] 실제 도구 네임스페이스 접두어 확인 → 다르면
      `SC4SAP_LITE_NS=<접두어> node interactive/scripts/gen-permissions.mjs` 재생성
- [ ] 안전훅 설치: `node interactive/adapters/claude/hooks/install-hooks.mjs --project <경로>` → 재배선 동작 확인
- [ ] FI 상담 1건: `/sap-agentic-harness:ask-consultant` — 페르소나 로드 + 컨텍스트 반영
- [ ] create-program 1건 완주: 인터뷰 → 스펙 → **사람 승인 게이트** → 구현 →
      **sap-reviewer 새-컨텍스트 리뷰(read-only)** → CheckSyntax→활성화→Unit→ATC.
      대상: 부담 없는 $TMP 또는 전용 Z패키지

**E2E 후 → L6 교차 검증**: 동일 과제(상담+조회 수준)를 Codex(`toggle on` + MCP 등록)와
Antigravity(가능한 선까지)에서 반복. 리뷰 인계 스키마(review-request/result) 왕복 1회 실증.

## 5. E2E 이후 남은 백로그

| 항목 | 내용 | 근거 |
|---|---|---|
| doctor.mjs | 3사 어댑터-코어 버전/해시 불일치 감지 | interactive/DESIGN.md §3-2 (L6) |
| tool-catalog 재생성 | 연결 실측 후 4.13 기준으로 갱신 | server/tool-catalog/README.md |
| deferred 스크립트 6종 | extract-spro/customizations, fetch 2종, profile-cli, option-tui | MIGRATION-MANIFEST의 deferred(L6+) 행 |
| 검증도구 개선 3건(낮음) | 링크체커 앵커 검증, 커버리지 목적지 존재 검사, 스모크 exposition 인자 | L5-review-response.md 보류 절 |
| 다국어 README | 재작성 여부 결정 | 매니페스트 archive 행 |

## 6. 별도 레포로 이관된 이슈 (엔진 포크)

**hjaewon/abap-mcp-adt-powerup**: 연결정보 존재 + `SAP_TIER` 미설정이면 tier가 DEV로
기본되어 write 가드가 열림 (L2 실측). 요구: "SAP_TIER 미설정 + 연결정보 존재 시 기동
거부(또는 write 미등록)". 수정 후 재번들 절차는 `interactive/server/UPDATE-RUNBOOK.md`.
현재는 정책층(`interactive/core/policies/credential-handling.md`)이 커버 — E2E 비차단.

## 7. 핵심 파일 지도

```
HANDOFF.md                      ← 이 문서 (상태 바뀌면 갱신)
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
