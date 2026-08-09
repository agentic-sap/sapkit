# Claude Code 어댑터 (기준 구현)

레포 루트가 곧 플러그인 루트다 — 플러그인 캐시에 core/·server/가 포함되어야 하므로
매니페스트(.claude-plugin/)·스킬 래퍼(skills/)·리뷰 에이전트(agents/)·MCP 등록(.mcp.json)은
루트에 있고, 이 디렉토리는 **패키지 밖 설치물**(안전훅·권한 템플릿)을 담는다.

## 설치

```
/plugin marketplace add D:\claude for SAP\sap-agentic-harness
/plugin install sapkit@agentic-sap
```

배포본은 로컬 경로 대신 `/plugin marketplace add agentic-sap/sapkit`.

재시작 후 확인: `/sapkit:troubleshooting` 스킬 존재 + `sap` MCP 서버 연결
(프로파일 없으면 inspection-only 모드로 뜸 — 정상).

## 빠른 시작 — `/sapkit:setup` (권장)

설치·재시작 후 `/sapkit:setup`을 실행하면 아래 수동 단계 대부분(SAP 연결 프로파일·
`.sapkit/` 파일 2개·권한 템플릿 병합·안전훅 스위치 안내·선택적 vsp 설치)을 대화형
마법사가 대신하고 층별 자가 점검으로 끝난다. 훅 설치는 기본 단계가 아니라 마법사가
안내만 하고 명시 요청 시에만 실행한다(아래 "안전훅 6종" 참고). 아래 절들은 수동 경로
정본이자 마법사 폴백이다. 정본 절차 = `core/procedures/setup.md`.

## SAP 연결 (connected 프로필)

1. `~/.sapkit/profiles/<alias>/sap.env` 작성(`$SAPKIT_HOME_DIR` 설정 시 그 하위) — 키 목록은
   [core/project-context.md](../../core/project-context.md) · **SAP_TIER 필수**
2. 프로젝트에 `.sapkit/active-profile.txt`(별칭 1줄) + `.sapkit/config.json`
   (sapVersion·abapRelease·activeModules·industry·country)

## 로컬 오프라인 검증 — SAPKIT 검사기 (선택)

SAP 반영 전 `.abap` 파일을 로컬에서 미리 점검하고 싶으면 **SAPKIT 검사기**(오프라인
ABAP 검증기 — 현재 설치되는 명령어는 `vsp`)를 설치한다 — 없어도 플러그인 동작에는
지장 없다.

```
node interactive/scripts/get-vsp.mjs   # ~/.sapkit/bin/vsp(.exe) 설치
```

설치 후 `vsp lint <파일>` / `vsp parse <파일>`로 사용. 자세한 내용:
[core/procedures/troubleshooting.md §7](../../core/procedures/troubleshooting.md#7-vsp-local-verification-optional).

## 안전훅 6종 (기본 미설치, 선택 스위치)

2026-08-02 설계 v2부터 `/sapkit:setup`은 훅을 자동 설치하지 않는다 — 안전의 정본은
서버 번들 자체 게이트(QA/PRD write·실행 차단, 테이블 blocklist)이고, 훅은 그 위에
얹는 선택 이중화다. 6종(block-forbidden-tables·tier-readonly-guard·
prefer-sqlquery-explicit-fields·offline-code-analysis·syntax-checker·
transport-validator)의 본질·설치/제거/검증·기존 사용자 마이그레이션은
[hooks/README.md](hooks/README.md)가 정본이다. 최소 설치 명령:

```
node adapters/claude/hooks/install-hooks.mjs --project <프로젝트 경로>
```

## 권한 템플릿 (구 trust-session 대체)

`permissions-template.json`의 allow 목록을 프로젝트 `.claude/settings.local.json`에
병합하면 SAP 도구 승인 프롬프트가 사라진다. **GetTableContents/GetSqlQuery는 의도적으로
빠져 있다** — 매 호출 사람 승인 유지. 네임스페이스 접두어(`mcp__plugin_sapkit_sap__`)는
설치 후 실제 도구명과 대조해 다르면 `SC4SAP_LITE_NS=<실측 접두어> node scripts/gen-permissions.mjs`로 재생성.

## 구현 위임 (execution_owner = delegated)

이 어댑터는 워커(`sapkit:sap-worker` 서브에이전트)를 사용자 개입 없이 호출할 수 있으므로
**create-program(Full)의 기본 소유자는 `delegated`다** — Phase 3.5 프롬프트에 해석 결과가
1줄로 표시되고, 같은 응답에서 "main"이라 답하면 이 대화가 직접 구현한다(explicit로 기록).
메인 대화는 조율·리뷰 배정·검증 관찰을 유지하고, 워커는 배정된 슬라이스만 구현한 뒤 압축
결과(변경 객체·판단·실행한 검증·블로커)를 돌려준다. 계약 정본은 `agents/sap-worker.md`,
경계 정본은 `core/policies/development-loop.md`.

- **기계 차단**(`disallowedTools`): `GetTableContents`·`GetSqlQuery`(P2 실데이터) ·
  `CreateTransport`·`ReleaseTransport`(P4 이송). 정책이 위임 불가로 못 박은 두 축이고,
  이 4줄이 죽으면 `smoke-mcp.mjs`가 실패한다(음성시험 4건).
- **가진 채 위임되는 것**: 나머지 write 도구 — P3 구현이 워커의 일이다. 리뷰어와 달리
  워커는 Create/Update/Activate를 쓴다.
- **절차 차단**(기계 아님): 컨트롤 아티팩트(`state.json`·`approval.json`·
  `verification.json`·`review-*.json`) 쓰기 · 자기 리뷰 · 중첩 워커 스폰.
- 리뷰는 언제나 `sapkit:sap-reviewer`가 별도 컨텍스트에서 한다 — 워커가 자기 변경을
  리뷰하는 경로는 구조적으로 없다.

**미실측 유보**: 위임된 P3 write가 권한 프롬프트를 메인 UI로 올려 attended 요건
(D-025)을 유지하는지는 라이브 미확인이다. 훅·권한 층은 호출자와 무관하게 부모
프로세스에서 돌므로 유지될 것으로 보이지만, 실측 전에는 단정하지 않는다 — 종결
조건은 아래 E2E 체크리스트의 "위임 ③" 항목이다.

## E2E 체크리스트 (L3 완료 기준)

어댑터-코어 동기화 전반 점검: `node interactive/scripts/doctor.mjs` (3사 동기화 점검)

- [ ] 플러그인 설치 + MCP 연결 (inspection-only라도 tools 노출 확인)
- [ ] 네임스페이스 접두어 실측 → 권한 템플릿 재생성 여부 판정
- [ ] install-hooks 경로 재배선 확인 (플러그인 캐시 경로 기준)
- [ ] FI 상담 1건: `/sapkit:ask-consultant` → FI 페르소나 로드 → 프로젝트 컨텍스트 반영 답변
- [ ] `/sapkit:create-program` 1건: 스펙 승인 게이트 → 구현 → **sap-reviewer 새 컨텍스트 리뷰** → 기계 검증 체인
- [ ] 위임 ① owner 해석: Phase 3.5 프롬프트에 execution_owner 줄이 표시되는가 (기본 delegated · selection_source 병기)
- [ ] 위임 ② worker spawn: Phase 4에서 sapkit:sap-worker가 실제로 기동되는가 (메인 대리 구현 0)
- [ ] 위임 ③ P3 권한 라우팅: 워커의 비허용 도구 호출 시 권한 프롬프트가 메인 UI에 뜨는가 (D-051 ⓐ — allowlist 병합 환경에선 비허용 호출이 실제 발생한 런에서만 종결 판정)
- [ ] 위임 ④ reviewer spawn: Phase 6에서 sapkit:sap-reviewer가 새 컨텍스트로 기동되는가 (메인 셀프 체크리스트 0 — 별도 결함으로 판정)
- [ ] 위임 ⑤ resume 호환: owner 없는 구버전 state.json 재개 시 1회 해석·기록되는가

## 활성 스코프 (2026-07-10 실측)

`claude plugin install ... --scope local`로 설치하면 이 프로젝트의
`.claude/settings.local.json`(git 미추적)에만 enabledPlugins가 기록된다 —
**나만 + 이 프로젝트만**. 다른 프로젝트 세션에는 로드되지 않는다.
전 프로젝트 공유가 필요하면 `--scope user`, 팀 공유는 `--scope project`.
