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
