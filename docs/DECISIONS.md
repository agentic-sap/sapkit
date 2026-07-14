# DECISIONS — 결정 로그 (append-only)

> **규칙**: 굵직한 결정 1건 = 항목 1개. `날짜 / 결정 / 검토한 대안 / 기각 사유 / 영향` 형식.
> **추가만 하고 수정·삭제하지 않는다** (정정도 새 항목으로). HANDOFF는 살아있는 문서라
> 갱신 시 과거가 압축되므로, 결정의 '왜'는 여기에 영구 보존한다.
>
> **역할 한정**: 이 로그는 트랙 A 부트스트랩 **전**의 결정 보존소다. 부트스트랩 후에는
> final-harness의 harness-docs(Mode B — 결정을 대안과 함께 스펙에 흡수)가 그 프로젝트
> 결정의 정본이 되고, 이 파일은 레포 수준 결정만 계속 받는다.

---

## D-001 · 2026-07-09 · 트랙 A 백엔드 = vsp CLI 확정
- **결정**: 하네스 트랙의 SAP 검증/배포 백엔드는 vsp-custom **CLI 전용**.
- **대안**: abap-mcp-adt-powerup(MCP) / vsp MCP 모드.
- **기각 사유**: final-harness 무인 step이 `--strict-mcp-config`로 MCP 서버 0개 기동 —
  MCP 전용 백엔드는 구조적으로 불가. vsp MCP 모드도 같은 이유로 미사용.
- **영향**: DESIGN.md §3·§15-F1. MCP는 사람 소유 대화형 세션에서만.

## D-002 · 2026-07-10 · 3사 통일 라이트 (Claude도 갈아탐)
- **결정**: sc4sap-custom을 Claude/Codex/Antigravity 공통 라이트 플러그인으로 재편.
  Claude+Codex 필수, Antigravity는 가능한 선까지. 전 자산 이식.
- **대안**: Claude는 풀버전 유지 + 2사만 라이트.
- **기각 사유**: 이중 유지보수 비용. 버리는 것은 멀티에이전트 자동 디스패치 + team 협업뿐.
- **영향**: 품질 모델 = 1명 작업 + 1명 새-컨텍스트 리뷰(read-only) + SAP 기계 검증.
  sc4sap-custom·sc4sap-lite 동결.

## D-003 · 2026-07-10 · 레포 통합 (sc4sap-lite → interactive/)
- **결정**: 별도 레포 sc4sap-lite를 폐기하고 git subtree로 본 레포 `interactive/`에 병합,
  플러그인명 `sap-agentic-harness`로 개명.
- **대안**: 별도 레포 유지 (트랙 분리).
- **기각 사유**: 사용자 결정 "하나의 레포가 목적". 같은 레포면 커밋 이력이 곧 provenance
  (트랙 A packs가 core/knowledge에서 선별 이식할 때).
- **영향**: 마켓플레이스 = 레포 루트, 13커밋 히스토리 보존 (038085c+8959b73).

## D-004 · 2026-07-10 · 머신 홈 `~/.sah` 개명 (프로젝트 폴더 `.sc4sap/`은 유지)
- **결정**: 머신 레벨 프로파일 홈을 `SC4SAP_HOME_DIR=~/.sah`로 영구 등록, 프로파일 2개
  (KR-DEV, IDEA-JNC) 마이그레이션. 구 `~/.sc4sap`은 백업 보존.
- **대안**: 프로젝트 레벨 `.sc4sap/`까지 개명.
- **기각 사유**: 프로젝트 폴더명은 번들에 하드코딩 — 엔진 소스 configurable화가 선행돼야
  함 (엔진 백로그, tier 이슈와 같은 사이클).
- **영향**: env는 새 프로세스부터 유효. 동결된 sc4sap-custom을 켜면 구 경로를 읽어
  갈라질 수 있음 — 정본은 새 경로.

## D-005 · 2026-07-10 · 플러그인 활성 스코프 = local (이 프로젝트만)
- **결정**: `claude plugin install --scope local` — 본 레포의 `.claude/settings.local.json`
  에만 enabledPlugins 기록.
- **대안**: `--scope user`(전 프로젝트) / `--scope project`(팀 공유).
- **기각 사유**: 사용자 결정 "이 프로젝트만". 다른 프로젝트 세션 오염 방지.
- **영향**: 다른 폴더에서는 스킬/MCP 미노출이 정상.

## D-006 · 2026-07-10 · keyring 바이너리를 git으로 추적 (E2E 발견 수리)
- **결정**: `interactive/server/runtime-deps/keyring/node_modules/`를 .gitignore
  네거이션(`!/server/runtime-deps/keyring/node_modules/`)으로 추적, 4플랫폼 바이너리 커밋.
- **대안**: 설치 시 populate 스크립트 / 문서로 수동 npm install 안내.
- **기각 사유**: Claude 플러그인 인스톨러는 npm install을 돌리지 않음 — git clone만으로
  동작해야 fresh install이 성립. blanket `node_modules/` ignore가 바이너리를 삼켜
  "설치했는데 연결 불가"가 재발함 (L3 E2E가 발굴).
- **영향**: bundle-keyring.mjs ROOT 교정 + server/package.json 신설 동반. 커밋 bd36084.

## D-007 · 2026-07-10 · 연결 배선 = launch.cjs shim (엔진 무수정)
- **결정**: 어댑터 런처 shim(`interactive/server/launch.cjs`)이
  `.sc4sap/active-profile.txt` → 프로파일 sap.env 경로를 `MCP_ENV_PATH`로 주입한 뒤
  번들을 require. `.mcp.json`은 shim을 호출.
- **대안**: 엔진(abap-mcp-adt-powerup)에서 activateProfile의 sourcePath를 connection
  브로커에 직접 공급하는 근본 수리.
- **기각 사유**: 엔진 수리는 별도 사이클(§6 tier 이슈와 함께) — E2E 세션에서 번들
  무수정 원칙(.gitattributes 보호) 유지가 우선. shim은 프로파일 없으면 기존
  inspection-only 그대로라 무해.
- **영향**: 4.13 번들의 "activateProfile ≠ 연결" 회귀는 엔진 백로그. 커밋 58179b8.

## D-008 · 2026-07-10 · 권한 병합 189 allow — 단 실데이터 2종은 영구 제외
- **결정**: `settings.local.json`에 SAP 도구 184종 자동 승인 병합(파일op 5종 포함 189).
  `GetTableContents`/`GetSqlQuery`는 **의도적 제외** — 매 호출 사람 승인 유지.
- **대안**: 병합 없이 write마다 수동 승인 (서브에이전트 포기).
- **기각 사유**: 서브에이전트 executor는 실행 중 승인 프롬프트에 답할 수 없음 —
  "구현은 서브에이전트로" 지시와 양립 불가. 진짜 통제점(스펙 승인 게이트·리뷰)은
  권한과 무관하게 유지.
- **영향**: 자기-권한 확대는 auto-mode가 차단하므로 **사용자가 직접 실행**(!node
  merge-perms)으로 적용 — 이 절차 자체가 올바른 패턴.

## D-009 · 2026-07-10 · 권한 템플릿은 연결 상태(186 tools) 기준으로 생성
- **결정**: permissions-template.json을 연결 상태 tools/list(186) 기준 184 allow로 재생성.
- **대안**: 기존 inspection-only(155) 기준 유지.
- **기각 사유**: 도구가 프로파일 활성 시 155→186으로 **동적 노출**됨을 실측 —
  inspection-only 기준으로는 프로그램/화면 계열 write가 통째로 빠져 create-program이
  프롬프트 폭탄을 맞음. (tool-catalog "미노출 27종" 보류도 이것으로 해소)
- **영향**: gen-permissions.mjs의 연결 상태 기동 수리는 백로그. 커밋 9727dc7.

## D-010 · 2026-07-10 · ZR_FI_GL_LIST LCL_ALV 배치 편차 수용 (리뷰 MINOR)
- **결정**: LCL_ALV를 전용 `{PROG}A` include가 아닌 `ZR_FI_GL_LISTC`(c-include)에 유지.
- **대안**: oop-pattern.md 원칙대로 ZR_FI_GL_LISTA 분리.
- **기각 사유**: 승인 스펙 §4 오브젝트 목록이 통합 배치를 명시(사람 승인 범위 내) +
  LISTA 이름은 DeleteInclude enqueue 누수 사고 전력 — 분리 시 결함 재발 위험만 큼.
  리뷰어도 "문서화된 편차, MINOR·비차단" 판정.
- **영향**: 엔진 enqueue 결함 수리 후 선택 과제로 이동 (report.md §8).

## D-011 · 2026-07-10 · 트랙 A는 무인 전용이 아님 — 라벨 교정 + v0.16 델타 주
- **결정**: HANDOFF의 "무인 하네스 트랙" 라벨을 "하네스 트랙(무인 step + 대화형 레인
  겸용)"으로 교정. final-harness v0.12.1→v0.16.0 델타(라우팅 4갈래·인터뷰 루프)는
  설계에 유리 — 구조 변경 없이 DESIGN.md §1 델타 주로 기록.
- **대안**: DESIGN.md를 v0.16 기준으로 전면 개정.
- **기각 사유**: 설계는 원래부터 대화형(Phase 0a/0b·CONSULT)+무인 겸용 — 라벨 문제였지
  구조 문제가 아님. 전면 개정은 §15 실측 근거(파일:라인)를 통째로 재작성하는 비용 대비
  이득 없음. 대신 **§15-F1~F7은 부트스트랩 시 v0.16.0으로 재검증** 조건 명시.
- **영향**: 커밋 50d9206. 문서 3종(ADR/ARCHITECTURE/PRD) 신설은 기각 — 기존 문서와
  중복(드리프트 위험), 결정 로그 갭만 본 파일로 해소 (D-012).

## D-012 · 2026-07-10 · 표준 문서 3종 대신 DECISIONS.md 1종
- **결정**: ADR.md·ARCHITECTURE.md·PRD.md를 만들지 않고 append-only 결정 로그
  (본 파일) 1종만 신설.
- **대안**: 표준 3종 세트 신설.
- **기각 사유**: ARCHITECTURE는 HANDOFF §1/§7 + DESIGN.md 2벌과 3중 중복(드리프트 위험),
  PRD는 설계 확정·반구현된 내부 도구에 사후 요식. ADR 역할만 진짜 갭 — HANDOFF가
  살아있는 문서라 갱신 시 결정의 '왜'가 압축·소실됨. 또한 트랙 A 부트스트랩 후에는
  harness-docs가 자체 ADR 흡수 체계를 제공하므로 별도 ADR.md는 이중 체계가 됨.
- **영향**: HANDOFF §7 파일 지도 + §8 불변 규칙에 본 파일 등록.

## D-013 · 2026-07-10 · L6 리뷰 인계는 컨텍스트 동봉이 필요 (관찰 → 백로그)
- **결정**: 교차 리뷰(다른 하네스의 리뷰어) 시 review-request에 환경 컨텍스트(백엔드
  장애, 문서화된 편차, 스펙이 승인한 예외)를 동봉하는 스키마 확장을 백로그로 채택.
- **근거 관찰**: 동일 대상(ZR_FI_GL_LIST)에 Claude 리뷰어 PASS vs Codex 리뷰어
  FAIL(MAJOR 7) — 대부분 컨텍스트 미전달(Textpool 장애를 코드 결함으로 계상, 스펙 승인
  편차를 위반으로 계상)과 심각도 캘리브레이션 차이. 단 **실질 신규 발견 1건**
  (G/L 마스터 조회 전 AUTHORITY-CHECK 부재)은 교차 리뷰의 순가치 입증.
- **대안**: 리뷰어 프롬프트에만 컨텍스트 기입(스키마 무변경).
- **기각 사유**: 프롬프트는 하네스마다 다르게 작성됨 — 스키마 필드면 어느 하네스든 동일
  계약으로 소비. (당장은 프롬프트 기입으로 운용, 스키마 확장은 백로그)
- **영향**: AUTHORITY-CHECK는 ZR_FI_GL_LIST 후속 개선 후보로 기록.

## D-014 · 2026-07-10 · migration-coverage는 원본의 node_modules를 계상하지 않는다
- **결정**: `check-migration-coverage.mjs`의 원본 walk에서 `node_modules`를 `.git`과
  동일하게 스킵 (보조 머신에서 원본 사본에 npm 산출물 7,425파일이 생겨 게이트가 깨진 것을 수리).
- **대안**: ① MIGRATION-MANIFEST에 `node_modules/**` 분류 규칙 추가 ② 원본 사본에서
  node_modules 삭제.
- **기각 사유**: ①은 npm 산출물을 이식 분류 체계에 편입시켜 매니페스트의 의미(원본
  **자산** 5분류)를 오염. ②는 동결 원칙(원본 수정 금지) 위반이고 다른 머신에서 재발.
- **영향**: 커밋 2570205. `.omc/**` 매칭 0 경고는 머신별 사본 차이로 남음(정보성·비차단).

## D-015 · 2026-07-11 · RunUnitTest 404는 백엔드 장애가 아니라 엔진 결함 유력 (판정 정정)
- **결정**: HANDOFF §4-(e)의 "ABAP Unit ADT 실행 404 = 사용자 DEV 박스 서비스 다운
  (엔진 무관)" 판정을 정정 — **엔진 결함 유력**으로 재분류, 엔진 백로그 이관.
- **근거 관찰**: 표준 S/4HANA 2021 IDES(S4H/100)에서 실존 표준 테스트
  (SABP_UNIT_SAMPLE의 CL_AU_SAMPLE_TEST_SEAMS — TC_AUTHORIZATION·TC_PROPOSE,
  GetLocalTestClass로 소스 확인)를 대상으로 하네스 경유 RunUnitTest 호출 →
  KR-DEV와 **동일한 404**. 표준 릴리스에 ADT ABAP Unit이 부재할 수 없으므로
  2시스템 동일 재현은 엔진 호출(경로/페이로드) 측 결함을 가리킴.
  번들 실측 경로: `/sap/bc/adt/abapunit/{runs,testruns,results}`.
- **대안**: KR-DEV 복구 대기 후 재실행(기존 계획 유지).
- **기각 사유**: 두 번째 시스템 재현으로 "박스 장애" 단독 가설 기각 — 복구를
  기다려도 해소되지 않을 가능성이 높음. (완전 확정에는 ADT discovery 교차 프로브가
  필요하나 자격증명 직접 접근이라 중단 — 사용자 판단 영역)
- **영향**: E2E 잔여 "RunUnitTest 재실행"은 백엔드 복구 대기 → 엔진 수리 후로 이동.
  WriteTextElementsBulk(ZMCP_ADT_SRV 500)는 서비스 실재 + 장애 응답이므로 기존 판정
  유지(KR-DEV 복구 대기). 같은 세션에서 엔진 이슈 3건 추가 발견(§6 엔진 백로그 3).

## D-016 · 2026-07-11 · MCP 표면 경량화는 엔진 트리밍이 아니라 하네스별 노출 정책으로
- **결정**: "가볍지만 강력하게" 대비 MCP 도구 수(연결 시 186) 우려에 대한 답은
  ① Claude Code = full 유지(deferred 로딩이라 세션 시작 비용 ~0 — 본 세션 실증)
  ② Codex/AG = 태스크별 프리셋(상담·리뷰 `readonly` 65 기본, 개발은 `high` 95 검증 후
  부족 시에만 full 승격) ③ raw `compact`(22~27)는 기본값 **기각**, `compact-readonly`
  검증 스파이크만 후보로 남김 ④ 엔진에서 도구 삭제는 하지 않음.
- **근거 실측**: 프리셋별 도구 수 full 155/186 · readonly 65 · high 95 · low 110 ·
  compact 22~27. 절차 문서 참조 도구 ~96종(상한). compact의 Handler* 라우터명은
  Claude tier 훅 정규식과 미매칭(L3 우회)이나 엔진 L2가 4.12.0부터 fail-closed
  allowlist로 compact까지 커버. 행데이터 2종은 compact에 아예 미노출.
- **대안**: ① 엔진 도구 패밀리 삭제(RAP/CDS/프로파일러 등 미사용분) ② raw compact 기본화.
- **기각 사유**: ①은 Claude에서 이득 0(deferred) + 포크 수술·업스트림 드리프트 영구 비용 +
  미래 절차의 강력함 훼손. ②는 안전 모델(도구명 단위 훅·권한·감사)의 최소 단위 과대화 +
  코어 vocabulary의 bare capability name 계약과 비호환 + union 스키마가 실제로 더 가볍다는
  보장 없음(토큰 실측 필요).
- **교차 검증**: Fable 분석과 Codex exec read-only 설계 리뷰가 독립적으로 동일 결론(A+B 조합).
  Codex 신규 기여: L3 훅 matcher 공백 4종(즉시 수리 — HANDOFF §6), Codex config의
  enabled_tools/per-tool approval 존재(실증 백로그), 절차별 required_capabilities 선언 제안.
- **영향**: 실행 항목은 HANDOFF §5-8. 훅 L3는 Activate·Patch·Release·Write 확장 완료.

## D-017 · 2026-07-11 · 엔진 소스를 sah 레포 engine/으로 편입 (차용 후 완전 소유)
- **결정**: `hjaewon/abap-mcp-adt-powerup`(업스트림 계보: mario-andreschak → fr0ster →
  babamba2 → hjaewon)의 소스를 `git subtree add --prefix=engine --squash`로 본 레포에
  편입. 엔진 소스 정본 = `engine/`. GitHub 포크·로컬 클론은 히스토리 아카이브로 보존.
- **근거**: ① 사용자 의도 — "차용해온 것도 내거화, 별도 연결보다 레포 안에" (sc4sap-lite
  병합 때의 "하나의 레포가 목적" 원칙과 동일) ② 오늘 실증된 마찰 — 엔진 수리 1건이
  포크 3커밋 + 라이트 1커밋으로 분산 ③ 실측 — 워킹트리 26MB·히스토리 24MB로 편입 부담
  없음 ④ 편입 직후 재현 빌드가 배포 번들과 **바이트 일치**(sha256 698b3b28e2c6…) 검증.
- **대안**: ① 별도 레포 유지(명의는 이미 hjaewon — 4.12.0에서 identity 이관 완료)
  ② 신규 레포로 재탄생(포크 링크 절단) ③ 풀 히스토리(793커밋) subtree.
- **기각 사유**: ①②는 2-레포 커밋 분산이 지속. ③은 대부분 업스트림 타인 커밋으로
  sah 로그가 오염 — 스쿼시+아카이브가 보존과 청결을 양립.
- **영향**: UPDATE-RUNBOOK 1단계가 "포크 클론" → "레포 내 engine/"로 단순화, 엔진
  백로그(§6)를 어느 머신에서든 수리 가능. VERSION source 표기 in-repo화(imported at
  fork commit 1964959). engine/은 플러그인 표면(interactive/) 밖이라 3사 패키징 무영향.
  LICENSE(업스트림 계보)는 engine/LICENSE로 동반 보존.

## D-018 · 2026-07-11 · vsp-custom·final-harness는 편입하지 않는다 — 분리 유지 + 버전 lock 계약 (5-9 종결)
- **결정**: vsp-custom은 별도 레포로 유지한다. sah는 트랙 A 부트스트랩 시 ① `adapters/vsp/`에
  검증 버전 lock(레포 URL·커밋 sha·바이너리 sha256·`vsp version` 출력·사용 명령 계약)
  ② 부트스트랩 체크(바이너리 실재+버전 일치) ③ 업스트림 동기 절차(반기 fetch→분기 검토→
  리베이스 판단)만 둔다. final-harness도 분리 유지 — 자체 제작 독립 제품(sah 밖 사용처
  가능)이라 "차용 후 소유" 철학의 적용 대상 자체가 아니며, 부트스트랩 시 현행 버전
  (2026-07-11 실측 v0.17.0)으로 §15-F1~F7을 재검증한 뒤 lock한다.
- **근거** (Fable 5 + Codex 0.144.1 read-only 독립 이중 검토가 동일 결론으로 수렴):
  ① **소비 형태** — 트랙 B는 엔진 *번들을 플러그인에 동봉*하므로 수리→재번들→반영 루프가
  레포 내부 계약이지만, 트랙 A가 소비하는 vsp는 *CLI 바이너리*뿐이다. verify는 PATH의
  exe를 호출하고(DESIGN.md §5 — vsp 바이너리는 감사 범위 밖), sah의 어떤 게이트도 vsp
  소스를 읽지 않는다. 편입의 마찰 해소 이득이 0에 가깝다.
  ② **업스트림 생존성** — oisee/vibing-steampunk는 활발(별 411·오픈 이슈 51·2026-06-15
  push 실측). 편입=사실상 결별의 기회비용이 크다. engine 업스트림(babamba2, 별 5,
  2026-04-29 이후 정체 실측)과 정량적으로 다른 조건.
  ③ **마찰 실증 부재** — D-017의 결정 근거 ②는 "실증된 커밋 분산 마찰"이었으나 vsp는
  트랙 A 미착수로 수리 이력 0건. 문제가 생기기 전에 103k LOC Go(286파일 실측)의 무게부터
  지는 순서 역전이다.
- **대안**: ① subtree 편입(D-017 준용) — 기각: 위 ①②③ + SAP 연결 필요 릴리스 타겟
  (Makefile sync-embedded/refresh-deps)·debugger 등 트랙 A 계약 밖 실험 영역까지 소유하게
  됨. engine/CLAUDE.md의 외부 Notion 지시 잔재가 실증했듯 편입은 업스트림 governance까지
  들여온다. ② git submodule — 기각: clone/update 마찰이 1인 프로젝트에서도 반복.
  ③ 바이너리만 보관 — 기각: 소스 재현성·라이선스 provenance 약화.
- **재론 트리거**: 트랙 A 착수 후 vsp 수리의 2-레포 분산 마찰이 3회 실증되면 그때 D-017
  논리로 재론한다.
- **영향**: DESIGN.md §2의 분리 근거를 "스택 상이"(D-017이 이미 반박한 배치 논거)에서
  "소비 계약=바이너리 + 업스트림 생존"으로 갱신, §16에 lock 절차 추가. vsp의 go.mod
  identity(현재 oisee 명의)는 vsp-custom 레포의 별도 정리 작업(편입 여부와 무관).
  HANDOFF 백로그 5-9 종결.

## D-019 · 2026-07-11 · 완료의 최소 기계 증거 확정 + 리뷰어 기계 격리 (품질 계약 봉인)
- **결정**: ① `verification.json`의 check_syntax·activate는 SKIPPED 불허(PASS/FAIL만) —
  unit_test·atc만 사유 있는 SKIPPED 허용. Phase 6 진입과 Phase 8 완료 게이트에 행렬 검사
  (check_syntax=PASS ∧ activate=PASS ∧ unit/atc∈{PASS,SKIPPED}) 편입. 리뷰 후 수정은 전
  기계검증 체인 재실행(verification-policy 재실행 규칙과 정합). ② sap-reviewer는
  Write/Edit에 더해 Bash·NotebookEdit·SAP mutation MCP 전체를 disallowedTools로 기계
  차단하고, 판정은 응답 JSON으로 반환하며 파일 기록은 워커가 스키마 검증 후 수행한다.
- **근거 관찰** (Codex 교차검토 신규 발견 → Fable 실물 재검증으로 확정): 기존 계약은
  "4단계 전부 SKIPPED → 리뷰어 N/A(outage) → PASS → 완료 보고"가 스키마·절차상 유효 —
  기계 검증 0으로 완료가 성립하는 우회 경로였다. 리뷰어 read-only는 Write/Edit만 기계
  차단이라 allowlist(D-008) 상속 하에 MCP write를 무프롬프트 호출 가능했고, 정작 자기
  산출물 기록은 막혀 Bash 우회를 유도하는 모순이 있었다.
- **대안**: 현행 유지(프롬프트 규율 신뢰) — 기각: 품질 모델의 두 다리(기계 검증·리뷰
  독립성)가 규율 의존이면 "기계 검증" 주장이 과장이 된다. environment_context로
  syntax/activate까지 면제 — 기각: 백엔드 장애 시 올바른 종착 상태는 완료가 아니라
  차단(BLOCKED)이다.
- **영향**: verification.schema.json·create-program.md·review-checklist.md·
  sap-reviewer.md·UPDATE-RUNBOOK(capability diff 시 disallowedTools 동기화 스텝). 기존
  E2E 산출물은 git-ignored 로컬 상태 파일이라 소급 무영향.

## D-020 · 2026-07-13 · docs/PRD.md·ARCHITECTURE.md 신설 (D-012 PRD·ARCHITECTURE 기각분 갱신, ADR.md 미신설 유지)
- **결정**: D-012가 기각했던 표준 문서 3종 중 **PRD.md·ARCHITECTURE.md 2종만 신설**한다
  (docs/, 한국어, thin+pointer). **ADR.md는 계속 만들지 않는다** — ADR 역할은 이 파일
  (DECISIONS.md)이 겸하며 이중 체계를 금한다(D-012 유지).
- **근거 (D-012 이후 바뀐 조건)**:
  ① **엔진 주입 수요 발생** — 트랙 A 무인 엔진(final-harness scripts/execute.py)이
     top-level docs/*.md 전량을 매 스텝 프롬프트에 주입한다(비재귀 glob "*.md",
     48KB 경고·64KB 기동 거부 — lock 커밋 8f7f13b 실측). 이 두 문서가 무인 세션의
     **유일한 상시 컨텍스트**가 되므로, D-012 당시엔 없던 구체적 소비자가 생겼다.
     (docs/superpowers/ 등 하위 디렉토리는 glob 밖이라 미주입.)
  ② **리뷰 게이트가 부재를 지적** — Phase 1 새-컨텍스트 리뷰(phases/1-workdays-util/
     review.md)가 리뷰 체크리스트의 docs/ARCHITECTURE.md·docs/ADR.md 참조를 부재로
     판정 불가 처리하며 "harness-docs로 생성하는 것이 정합적"이라 명시했고, Phase 2
     리뷰(phases/2-duedate-reuse/review.md)도 동일 부재를 확인하고 DESIGN.md/HANDOFF
     §7로 대체 판정했다.
  ③ **사용자 선택** — 사용자가 다음 착수로 ② 트랙 A 지식 문서 갱신(harness-docs)을
     지정(HANDOFF 머리말, "알림 3회째").
- **대안**: (a) D-012 그대로 유지(3종 미신설) — 기각: 무인 주입 수요가 실재하고 리뷰가
  부재를 반복 지적. (b) ADR.md까지 3종 전부 신설 — 기각: DECISIONS.md와 이중 체계
  (D-012 ADR 논거 유효). (c) HANDOFF/DESIGN을 그대로 주입 — 기각: HANDOFF는 단독
  ~68KB로 64KB 상한 초과, DESIGN도 ~40KB로 기존 주입분과 합산 시 초과이며, 둘 다
  상태 변동 문서라 매 스텝 노이즈.
- **D-012 기각 사유의 해소**: D-012가 ARCHITECTURE를 기각한 근거 "HANDOFF §1/§7 + DESIGN
  2벌과 3중 중복(드리프트 위험)"은 **thin+pointer 구조로 해소** — 신설 2종은 의도/계약/
  불변식/파일 지도만 얇게 담고(합계 ~9.7KB) 상세는 전부 정본으로 포인터. 사실을 복제하지
  않으므로 드리프트 표면이 최소. PRD의 "사후 요식" 기각 근거도, 무인 주입이라는 실사용
  소비자가 생겨 요식이 아닌 가드레일이 됐다.
- **영향**: docs/PRD.md·docs/ARCHITECTURE.md 신설. HANDOFF §7 파일 지도에 두 파일 등록
  + 헤더 ② 완료 반영(후속). 부트스트랩 후 트랙 A 프로젝트 결정은 harness-docs가 스펙에
  흡수하고, 이 파일(DECISIONS.md)은 레포 수준 결정 + ADR 역할을 계속 맡는다(머리말 유지).

## D-021 · 2026-07-13 · 무인 gated write 리뷰 게이트 = plan-레벨 리뷰 스텝(자기-verify 게이트) + 필수 3조항 (백로그 5-11 해소)
- **결정**: Phase 3 무인 gated write 체인의 새-컨텍스트 리뷰 게이트를 **(b′) plan-레벨
  리뷰 스텝**으로 편입한다 — impl 스텝 뒤에 독립 세션 리뷰 스텝을 두고, **리뷰 스텝
  자신의 verify**가 verdict 파일을 기계 검사(FAIL→exit 1→체인 정지, write 스텝 미시작).
  필수 3조항: ① 등식형 변경 검사(bookkeeping 제외 dirty == 정확히 {verdict}) ② 검사
  로직 verify 명령 인라인 또는 sha256 핀 ③ verdict에 reviewed_head(HEAD sha) 바인딩
  (선제 위조를 예측 불가능성으로 원천 차단). 에스코트 조항: 씨앗 시맨틱 결함을 게이트가
  라이브에서 실제 차단함을 1회 실증하기 전까지 gated write는 사람 셰퍼딩 유지.
  상세 스펙 = docs/reference/designs/2026-07-13-unattended-review-gate.md.
- **근거**: 트랙 B E2E 실증 — 문법·ATC·활성화 전부 통과한 시맨틱 결함(INNER vs LEFT
  JOIN)은 기계 verify가 못 잡고 새-컨텍스트 리뷰만 잡음(§4.1, D-013 관찰과 동근).
  엔진 실측(lock 8f7f13b): 기존 `_run_review`는 완료 마킹 *후* 실행되고 verdict를
  되읽는 코드가 없어 **비게이트**(execute.py:2989-2992) — 체인을 멈추는 유일한 것은
  verify exit code(:2632). 스텝·리뷰 세션은 독립 OS 프로세스라 새-컨텍스트 격리는
  이미 기계적. 분석·독립 검증·정정 재검증 3회의 서브에이전트 왕복으로 확정, 택1은
  사용자(2026-07-13).
- **대안과 기각/이연 사유**:
  (a) 리뷰 프롬프트 강화 단독 — 기각: 차단력 0(잡아도 못 막음). 단 체크리스트
  이식(트랙 B 12항목→vsp CLI 치환+시맨틱 항목 추가)은 (b′)의 구성 요소로 흡수.
  (b) 원안(다음-스텝-verify가 verdict 검사) — 기각: 다음 스텝 세션이 verify 전에
  실행되어 verdict 위조 창 실재(독립 검증 BLOCKER). 일반 step 세션은 full-write에
  원복 없음(_revert_unexpected_changes는 advisory 전용 :2915).
  (A) 엔진 승격(_run_review를 게이트로) — **이연**: 보안은 엄격히 우세(메모리 채널·
  사전 read-only)하나, 초과분의 실질 = 이탈 writer 1건(엔진 전역이 이미 수용 중인
  잔여와 동급)이고 대가 = 당일 최종 완료 선언된 자체 제품 재개봉 + F1~F7 재검증 +
  lock 갱신. D-018이 vsp 편입을 기각한 논리(마찰 실증 전 선제 무게)와 동일. **재론
  트리거 = (b′) 잔여(이탈 writer·정직 실패 소음)의 실전 실증**.
  (c) 사람 셰퍼딩 영구 유지 — 기각: 트랙 A 자동화 목표 무기한 유예. 단 에스코트
  조항으로 첫 실증까지 한시 유지.
- **잔존 표면 (정직 기록)**: ① 이탈(detached) 프로세스 writer — 엔진 전역 수용
  잔여("격리는 컨테이너 몫")와 동급 ② 리뷰어 판단 자체 — 어느 구성(A 포함)에서도
  환원 불가.
- **영향**: DESIGN.md §8.3(리뷰 게이트 문단)·§13 Phase 3(선결 3건 전부 해소 — 0b
  마커·§14-2 drift 기완료 + 본 설계, 완료 기준에 씨앗 결함 차단 1회 실증 추가) 갱신.
  HANDOFF §5-11 종결. Phase 3 착수 가능 상태로 전환.

## D-022 · 2026-07-14 · Phase 4는 현행 lock(v0.17.3)으로 완주 — 완주 후 대화형(Guided) 중심 재기준을 정식 결정으로 (무인=특수 모드 방향)

- **결정**: 상류 final-harness가 lock(v0.17.3, 8f7f13b) 이후 **v0.18.0(대화형 마찰
  축소)·v0.19.0/1(Direct 기본값 + Guided run-계약 중간층 + Engine 격리, 무인 headless는
  container/VM attestation 필수)**로 이동한 것을 실측 확인. 그럼에도 **Phase 4(Domain
  Packs)는 현행 lock v0.17.3으로 완주**하고, 재lock·트랙 A 실행 모드 재기준(대화형
  Guided 중심, 무인은 배치·기계-강제-실증용 특수 모드로 강등)은 **Phase 4 완주 후
  별도 정식 결정**으로 다룬다. 방향 합의는 사용자 택1(2026-07-14), 확정은 후속 D.
- **근거**: ① Phase 4는 v0.17.3 기준으로 계획·커밋 완료 — 잔여 = 엔진 실행 2회
  (4a/4b)+정리뿐이고, 완료 기준 ②(FI-002 씨앗 차단→R-007 승격)는 "팩 지식의 기계
  강제"라는 트랙 A의 마지막 미실증 증거. ② v0.19 재기준은 델타 확인이 아니라 전면
  재검증 — GOAL/STATE 폐기·run 계약·router 훅 근본 재설계 → §15-F 재검증 +
  `.harness/`·AGENTS.md·리뷰 게이트 템플릿·SAFETY-PROFILES·docs(D-020이 lock 커밋
  절차문을 직접 소비) 연쇄 갱신 = 별도 Phase급. ③ 상류가 당일에도 릴리스 중
  (v0.19.1, 07-14 HEAD 088bcb6) — 지금 lock하면 당일 부패 재연 위험(07-11 실증 패턴).
  ④ 무인 실사용 평가: 배포는 에스코트(사람 동반)이고 1인 운영에서 야간/병렬 수요
  실증 0건 + RV4 갭(리뷰 스텝 SAP-write 차단 비기계적) 존속 + v0.19 스스로 무인에
  격리를 필수화 — Windows 직결 무인의 천장은 이미 도달. 무인의 실증된 고유 가치는
  리뷰 게이트 기계 강제(3a)와 배치 규모 작업 둘뿐.
- **대안과 기각 사유**: (a) 지금 바로 대화형 전환(4a/4b 엔진 실행 생략) — 기각:
  준비물 폐기 + 완료 기준 ② 미실증 + 이동 표적에 재lock. (b) 보류(안정화 대기,
  방향 미정) — 기각: Phase 4 잔여가 실행 2회뿐이라 완주가 보류보다 싸고 증거를 남김.
- **영향**: HANDOFF 재개점에 Phase 4 이후 최우선 후보로 "대화형 재기준 정식 결정"
  등재 + §1 표 final-harness 행의 "최종 완료 선언(07-13)" 낡음 정정.
  `adapters/final-harness.lock.json` 무변경(v0.17.3 유지). DESIGN.md 무변경(설계는
  재기준 확정 시 갱신). 후속 결정 트리거 = Phase 4 완료 + 상류 안정화 확인.

## D-023 · 2026-07-14 · 트랙 A 실행 모델 재기준 확정 — v0.19 3축(Direct/Guided/Engine) 채택 + 재lock 대상 v0.19.2 (D-022 후속 정식 결정)

- **결정**: ① 트랙 A 실행 모델을 상류 final-harness **v0.19 3축**으로 재정렬 —
  일상 작업=**Direct**(하네스 흔적 0), 구조 필요 작업(모호한 성공 기준·중단재개·
  강화 리뷰)=**Guided**(작업별 `.harness/runs/<run-id>/` 계약: contract+manifest),
  씨앗 주입 규칙-승격 실험·배치 규모=**Engine attended**(신규 phase는 run 계약+
  권한 봉투 필수, unattended는 container/VM 격리 없인 기동 거부라 사실상 봉인).
  ② AGENTS.md의 "모든 실질 작업 루프 강제"를 v0.19 라우팅으로 재작성(사용자 확정,
  2026-07-14) — RULES 하드 제약(CONSULT)은 유지, GOAL/STATE 싱글톤은 legacy 봉인.
  ③ 재lock 대상 = **v0.19.2(929685a**, 2026-07-14 스탬프, HEAD=origin 클린**)** —
  F1~F7은 재검증이 아니라 **재정의**(v0.17.3 좌표 전면 무효 + 신규 불변식 후보:
  계약 SHA 동결·권한 봉투 authority-gate·router fail-closed). ④ 대화형 MCP 병용은
  **신규 결정 없음** — DESIGN §3 기존 원칙(대화형 세션=사람 소유, MCP 보완 허용,
  verify·write 도장은 vsp CLI) 유지, 문구만 트랙 B 플러그인(sap-agentic-harness)
  기준으로 갱신(원문의 sc4sap-custom은 대체됨).
- **근거**: D-022 선결(상류 안정화) 해소 — 저자 확인 "거의 완성본" + v0.19.2 스탬프
  실측 + 상류가 공식 마이그레이션 표 제공(docs/reference/architecture-v0.19-direct-
  guided-engine.md — 우리 자산 구성과 1:1 대응: GOAL/STATE→legacy 보존, RULES/
  LESSONS→보존+scope 선택, installer 소유 훅→router 교체, run_id 없는 기존 phase→
  legacy 호환, AGENTS 루프 절→사용자 선택 마이그레이션). 부수 관찰: v0.19
  authority-gate(권한 봉투 deploy=false→실행 전 deny)가 RV4 갭(리뷰 스텝 SAP-write
  차단 비기계적)을 기계 봉합할 가능성 — 단 vsp는 "새 CLI"라 advisory 분류 가능성이
  있어 단계 1 재lock 때 실측 확인.
- **실행 5단계**: 1) 재lock v0.19.2 + F-불변식 재정의 2) 주 머신 final-harness
  플러그인 설치(현재 보조 머신만 — Guided/harness-loop의 선결) 3) Engine 업그레이드
  (install_engine.py --target, owned 파일만 교체 계약 — **트랙 B MCP 훅 3개 보존
  검증 필수**, phases/ 히스토리 보존) 4) 문서 연쇄 갱신(AGENTS.md 라우팅 재작성 ·
  DESIGN §8 실행 모드·§13 Phase 5 재편 · SAFETY-PROFILES §⑦에 v0.19 격리 필수 조건
  · D-020 docs 재유도 — lock 커밋 절차문 직접 소비 구조) 5) 파일럿 2건 = 완료 기준
  (① Guided 실작업 1건: contract→구현→새-컨텍스트 리뷰→에스코트 ② Engine 신형
  계약 phase 1건: 권한 봉투 하 4b급 재현).
- **Phase 5(Hardening) 관계**: 원래 4항목을 본 재기준이 흡수·재편 — 반복 실패
  RULES 승격(모드 무관 존속+scope 문법 도입), verify 품질 감사(단계 5 파일럿),
  write 안전성 리뷰(SAFETY-PROFILES 개정), 대화형 MCP 허용 범위(④로 종결). 본
  재기준 완료 = 원 로드맵 Phase 5의 신판 완료.
- **불변(재확인)**: vsp CLI=유일 SAP 접점·verify 백엔드(D-001·R-002) · 품질 모델
  (1워커+1새-컨텍스트 리뷰+기계 검증, D-019) · R-003 DEV-only write·에스코트
  기본값·실데이터 게이트 · packs/ 학습 루프 · 트랙 B 무접촉.
- **영향**: DESIGN.md·lock 파일은 단계 진행 중 갱신(지금 무변경). HANDOFF 재개점
  갱신. 다음 액션 = 단계 1 착수.

## D-024 · 2026-07-14 · D-023 정정 — Codex 교차검토 실측 반영: v0.19.2는 "후보 pin", RV4 미봉합, "Direct 기본" 명칭 (재기준 방향은 유지)

- **정정 배경**: D-023 방향을 Codex(0.144.3, read-only)가 독립 교차검토 →
  **방향(대화형 중심·무인 강등)은 조건부 동의로 수렴**하되, D-023 기록의 앞서간
  표현 4건을 코드 실측으로 반박. 반박분을 Fable/메인이 재검증(authority-gate·
  install_engine 직접 grep)해 확정. D-018·D-019와 같은 Fable+Codex 이중검토 관례.
- **정정 1 — 명칭**: "Guided(대화형) 중심 기본"은 부정확 → 상류 정확 모델은
  **"Direct 기본(흔적 0) + Guided 명시적 승격 + Engine 별도"**. 상류가 "Guided
  always-on"을 명시적으로 기각(architecture-v0.19…md §Rejected). 재기준 문구는
  "Direct 기본, 필요 시 Guided 승격, Engine attended 특수 모드"로 통일한다.
- **정정 2 — 재lock 시점**: v0.19.2(929685a)는 **"검증 완료 lock"이 아니라 "후보
  pin"**. 근거: ① v0.19.0/.1/.2 전부 당일(2026-07-14) 릴리스 + 상류 CI가
  workflow_dispatch 수동 전용이라 스탬프는 재현성 증거지 안정성(soak) 증거 아님
  ② 통합검증 전 재lock은 역순. `verified_commit` 선언과 "Phase 5 완료"는 **staging
  마이그레이션 + 파일럿 2건 + 기술 게이트 통과 후에만**. 그 전까지 lock 파일은
  후보 pin으로만 취급(929685a를 moving master 아닌 정확 SHA로 고정, 이후 상류
  추가 커밋 반영 정책 별도 결정).
- **정정 3 — RV4 미봉합 (안전 관련·확정)**: D-023의 "authority-gate가 RV4 봉합
  가능성"은 **현 v0.19.2에서 성립하지 않음**. authority-gate.py의 deploy 분류
  목록(terraform/pulumi/kubectl/vercel/netlify/firebase/flyctl/wrangler/serverless/
  railway)에 **vsp 부재**(grep 0건 실측) → `permissions.deploy=false`에서도 정확한
  `vsp deploy`는 deploy로 분류되지 않아 차단 안 됨. 상류 README도 "새 CLI·간접
  스크립트는 advisory"라 명시. **결론: RV4(자격증명 있는 리뷰 세션이 vsp deploy
  실행 가능, SAFETY-PROFILES §⑥ RV4)는 열린 채 존속. "닫혔다" 기록 금지, unattended
  SAP write 계속 금지.** 봉합하려면 vsp 인식 upstream 패치 후 새 SHA 재lock 또는
  리뷰/write 자격증명 분리 같은 별도 기계 경계 필요.
- **정정 4 — 트랙 B "무접촉" → "소스 무변경이나 무영향은 검증 전 미성립"**:
  `.claude/settings.json`을 트랙 B MCP 훅 3개와 Engine 훅이 공유. install_engine.py가
  그 파일을 재작성(custom hook 보존 의도이나 실제 파일 재작성) → 훅 3개 matcher·
  command 불변은 **설치 후 검증 대상**이지 자동 보장 아님. 부수: 상류가 Engine
  bridge worker에 write MCP 연결 금지를 명시(README) — 트랙 B MCP 세션을 worker로
  쓰지 않는다.
- **실행 5단계 개정 (D-023 대체)**: 1) **후보 SHA 동결 + 기준선·롤백 확보** —
  929685a 정확 고정(moving master 금지)·현 settings/manifest/phases/트랙 B 훅 해시
  보존·rollback commit 확보·상류 전체 테스트 Windows Py3.9/3.12 실행·F-불변식 후보
  코드 좌표 검증. 2) **주 머신 플러그인 설치 + 격리 smoke**(정확 SHA snapshot,
  빈 레포에서 Direct=diff 0·Guided=해당 run 파일만). 3) **복제본(disposable clone)
  마이그레이션 후 실제 Engine 업그레이드** — 합격: skipped_modified=[]·
  skipped_user_owned=[]·트랙 B MCP 훅 3개 불변·phases/ byte 불변·예상된 retired
  Engine test(test_execute.py·test_hooks.py) 제거만·Direct/Guided router no-op·
  interactive/ diff 0. 4) **문서·Policy·legacy 연쇄 갱신** — 모드 문구 통일 +
  SAP 안전규칙=모드독립 Policy 명시 + 품질모델 적용범위(SAP 코드/write는 새-컨텍스트
  리뷰, 사소한 문서는 비강제) + GOAL/STATE·run_id 없는 phase는 legacy catalog 봉인
  (완료·씨앗봉인·예제·재실행금지 명시, 기본 비활성). 문서 범위는 AGENTS.md만이
  아니라 **CLAUDE.md·docs/PRD·docs/ARCHITECTURE·DESIGN §2/§3/§5/§8/§13/§15/§16**.
  5) **파일럿 2건(Guided 1 + Engine attended 1) + 기술 합격 게이트 후 최종 lock** —
  게이트: Direct 무개입·계약/manifest 변조 시 Engine 중단·범위밖 파일 차단·
  **deploy=false에서 정확한 vsp deploy 음성시험(현 v0.19.2에선 실패 예상 → 실패 시
  RV4 존속·attended-only 명시 또는 upstream 패치 후 재pin)**·트랙 B MCP 훅 3개 smoke.
  이 판정+파일럿 후에만 verified_commit·"신판 Phase 5 완료" 선언.
- **불변(재확인)**: 재기준 방향 자체(대화형 중심·무인 강등)는 D-023 유지 — 본 항목은
  방향이 아니라 표현·시점·안전기록·범위의 정정. vsp=유일 SAP 접점(D-001·R-002),
  품질모델(D-019), R-003 DEV-only, 에스코트 기본값, 트랙 B 소스 무변경은 불변.
- **영향**: HANDOFF 재개점을 "후보 pin·RV4 존속·개정 5단계"로 갱신. lock 파일·
  DESIGN 무변경(단계 진행 중 갱신). 다음 액션 = 개정 단계 1.
