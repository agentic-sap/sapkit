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

## D-025 · 2026-07-15 · 트랙 A 재기준 v2 확정 — O1 현행 정직 기록 + P4 transport 실계약 + Guided MCP 파일럿

- **결정**:
  ① **O1=(가) 현행 정직 기록 채택** — 사용자는 메인 세션의 추천 (나)(배포 불능 reviewer
     principal + write secret 부재)를 기각하고 비용 0을 우선했다. reviewer mutation
     경계에 새 기계 장치를 만들지 않으며, 등식형 repo guard + 리뷰 관례 + 사람
     에스코트로 운용한다. 그 결과 reviewer가 같은 Windows 사용자에서 write credential을
     얻을 수 있고 **D-019의 SAP reviewer 기계 격리는 약화된 상태**다. 지원 모드는
     attended-only, unattended는 §7 U-gate 전까지 sealed, 기록값은
     `historical_rv4_classifier=open` / `reviewer_mutation_boundary=unverified`다.
     reviewer는 조회를 포함해 어떤 transport 동작도 하지 않는다.
  ② **O2=P4 transport를 지금 설계** — 종전 “수요가 생길 때까지 P4 BLOCKED” 추천을
     기각하고, DEV transportable package/request의 create·assign·release·import 책임을
     설계서 §4.2로 확정한다. Guided 사람은 package/target/request를 소유하고 attended
     worker는 승인된 DEV pre-release create/assign/read만 bounded 실행할 수 있다. Engine
     worker는 사전 생성·승인된 package/request에 vsp `deploy --transport`로 할당·검증만
     한다. release는 exact task/request를 재확인한 사람만, QA/PRD import는 사람/Basis가
     STMS로만 수행한다. reviewer·unattended release/import는 금지한다.
  ③ **O3=Guided 파일럿 A의 비-vsp 적용 경로는 트랙 B MCP write** — 사람 소유 대화형
     write에서 transport-validator·tier-readonly guard·서버 tier gate가 함께 동작하는지
     관찰하기 위해 채택한다. 적용 성공 응답은 완료 증거가 아니며, 어느 경로로 적용했든
     완료 도장은 vsp CLI source read·syntax/activation·unit/ATC 증거로만 찍는다.
  ④ v2 설계서가 `2026-07-14-track-a-v019-rebase.md` 초안을 대체한다. candidate pin은
     `6de63bac860723ff1bfd50a940a75e46c6e87d99`(커밋 blob v0.19.3)이며, 상류 워킹트리의
     미커밋 0.19.4(20 modified)는 재현 가능한 SHA가 없어 제외한다. candidate는 staging·
     파일럿·기술/P4 gate 전까지 verified lock이 아니다.
- **근거**: ① O1은 기계 격리보다 1인 attended 운용 비용 0을 우선한 사용자의 명시적
  trade-off다. 위험이 사라졌다는 판단이 아니라 참관 하 수용이며 D-024의 “RV4 닫힘 기록
  금지”와 정합한다. ② 고정 vsp v2.38.1-91 help/lock 실측상 transport 표면은
  list/get + `deploy --transport`이고 create/release/import는 없다. 트랙 B tool catalog와
  소스에는 CreateTransport/ListTransports/GetTransport/ReleaseTransport,
  CreatePackage·object `transport_request`, QA/PRD fail-closed tier guard가 있다. 단 대상
  SAP의 ADT release endpoint 지원은 라이브 미확인이고 404/405면 `supported:false`다.
  abapGit 공식 계약은 transportable package pull/import 때 request를 prompt하지만 이
  레포에서는 라이브 미실측이므로 사람 DEV 경로로만 한정했다. ③ 기존 파일럿은 전부
  `$TMP`/LOCAL이고 `--transport` 사용 0건이라, transportable package부터 package layer·
  change recording·request/task inventory·release/import 증거가 새로 필요하다. ④
  6de63ba는 `929685a..6de63ba` 허용 델타에서 확인된 최신 불변 커밋이고 보이는 0.19.4는
  미커밋이라 D-024의 moving-target 금지를 만족하지 못한다.
- **기각·후속 후보 및 재론 트리거**:
  O1의 (나)·(다)·(라)는 삭제하지 않고 후속 후보로 보존한다. unattended 재요구,
  reviewer credential near-miss/실행 1건, 에스코트 병목 연속 3회면 (나)를 재론한다.
  같은 OS에서 write secret 부재 음성시험이 실패하면 (다), upstream vsp classifier가
  커밋 SHA/test로 제공되거나 fake-vsp 방어심도가 필요하면 (라)를 재론한다. (라) 단독은
  unattended 해제 근거가 아니다. O2는 고정 vsp에 create/release/import 표면이 생기거나,
  대상 SAP live 결과·Basis route가 계약과 다르거나 P4 T-gate가 모순을 찾을 때 재론한다.
  O3의 abapGit 대안은 MCP가 대상 object write/transport field를 노출하지 않거나 안전훅+
  tier gate 동시 관찰이 재현 불가할 때만 사용자 새 결정 후 재론한다.
- **불변(재확인)**: D-018(상류 분리+pin), R-002(vsp CLI 전용), R-003(DEV tier만 vsp
  write), R-005(비밀 비커밋), D-019의 1 worker+1 fresh reviewer+기계검증 행렬 및
  syntax/activate SKIPPED 금지는 유지한다. 단 O1에 따라 D-019의 SAP reviewer 기계
  격리만 약화됐음을 숨기지 않는다. GetTableContents/GetSqlQuery 호출별 사람 승인,
  트랙 B 소스 무변경, QA/PRD ad-hoc write 금지·DEV CTS→사람/Basis STMS import,
  D-024의 RV4 닫힘 기록 금지를 유지한다.
- **영향**: `docs/reference/designs/2026-07-15-track-a-rebase-v2.md`는 사용자 택일 3건이
  반영된 확정판이며 §14는 “확정된 결정 + 재론 트리거” 정본이다. §4 P4 칸은 BLOCKED에서
  역할·경로·자동화 한계가 있는 실계약으로 바뀌고 §12 G14·P4 T1~T7·파일럿 A MCP 계약,
  §15 완료 판정이 이를 소비한다. HANDOFF 헤더는 이 재개점으로 갱신한다. 실제 migration·
  lock 승격·SAP transport 실행은 아직 시작하지 않았으며 다음 액션은 §11 연쇄 변경과
  §12 staging/파일럿/gate 집행이다.

## D-026 · 2026-07-15 · 이 결정 로그를 `docs/` 밖(`docs/reference/`)으로 이전 — 엔진 주입 예산 회수 (D-020 조건 변화에 따른 후속, 내용·규약 무변경)

- **결정**: 이 파일을 **`docs/DECISIONS.md` → `docs/reference/DECISIONS.md`로 이전**한다.
  파일 내용은 **한 줄도 바꾸지 않는다**(`git mv` — append-only 규약 무손상). 살아있는
  포인터 12곳(CLAUDE·AGENTS·HANDOFF·docs/PRD·docs/ARCHITECTURE·.harness/GOAL·
  .harness/PROTOCOL·engine/CLAUDE·lock 2종·check-review-verdict.ps1·재기준 v2 §11)의
  경로만 갱신한다. **`docs/ADR.md`는 여전히 만들지 않는다** — D-012·D-020의 "이중 체계
  금지"는 그대로 유효하다(본 결정은 위치 변경일 뿐 체계 변경이 아니다).
- **근거 (D-020 이후 바뀐 조건)**:
  ① **주입 예산 초과 실측** — 엔진은 top-level `docs/*.md` 전량을 매 스텝·매 재시도
     프롬프트에 전문 주입한다(비재귀 glob, `scripts/execute.py:2321-2323` @6de63ba;
     WARN 48KB `:2294` · **기동 거부 64KB** `:2289`). 2026-07-15 실측 합계 **57,747
     bytes = 거부선의 88%**, 그중 이 파일이 **44,676 bytes(77%)**. D-020 시점 합계는
     ~32.7KB(이 파일 ~23KB)로 예산 내였으나 **이틀 만에 2배**가 됐다(D-021~D-025).
     append-only라 감소는 구조적으로 불가능하다.
  ② **주입은 용량이 아니라 품질 문제** — 엔진 저자 주석이 명시한다(`:2290-2294`):
     "상한 아래라도 주입이 길수록 step 세션의 지시 준수가 떨어진다(context rot —
     약한 모델일수록 심함)". 즉 예산 잔여는 써도 되는 여유가 아니다.
  ③ **D-020이 이미 워커 맥락의 담지체를 지정했다** — D-020 원문: "이 두 문서(PRD·
     ARCHITECTURE)가 무인 세션의 **유일한 상시 컨텍스트**가 되므로". 이 로그의 주입은
     설계가 아니라 **디렉토리 동거로 인한 부수 효과**였다. D-020은 "하위 디렉토리는
     glob 밖이라 미주입"도 이미 인지하고 있었다.
  ④ **상류가 지시한 패턴 그대로** — `harness-docs` SKILL.md(@6de63ba): `:52` "Details
     go to `docs/reference/` subdirectories — the engine injects only TOP-LEVEL
     `docs/*.md`, so reference material there costs no prompt tokens" · `:37` "moves to
     `docs/reference/` (kept but not injected)".
  ⑤ **소비자별 영향 분리** — 대화형 세션은 이 로그를 자동 주입이 아니라 CLAUDE.md
     포인터로 **필요할 때 읽는다**(경로 무관, 이번 갱신으로 계속 작동). Engine step
     워커만 원문을 잃는데, 워커용 결정 요약은 §11 덩어리 2가 `docs/PRD.md`에 이미 넣었다
     (3구조×5프로필·D-019 완료 matrix·차단 범위·P2 승인·`sap_mutation_boundary`).
- **대안·기각**: (a) **현행 유지** — 기각: 잔여 7,789 bytes로 결정 2~3개면 기동 거부.
  근본 해결 아님. (b) **활성+아카이브 분리**(얇은 활성 인덱스만 `docs/`에 잔류) —
  기각: "활성" 판정 규칙·앵커 변경·append-only 의미를 새로 정해야 하고, 활성분도 결국
  자란다. 사용자 초기 선호였으나 ⑤(대화형은 경로 무관, 워커 요약은 이미 PRD에 존재)
  확인 후 철회. (c) **얇은 `docs/ADR.md` 신설 + 전문은 reference** — 기각: D-012·D-020의
  이중 체계 금지에 정면 저촉, 요약↔원문 드리프트 표면 신설. (d) **엔진 glob 수정**
  (allowlist·`docs/.inject`) — 기각: D-018 분리 유지 위반이자 `skipped_modified=[]`
  (D-024 단계 3 합격기준) 파괴. 상류 기여로 별건 처리(§ 아래).
- **상류 설계 결함 보고 (별건)**: 이 문제의 뿌리는 우리 것이 아니라 **엔진 설계**다 —
  `harness-docs`가 `docs/ADR.md`에 ① 결정마다 영구 append(`SKILL.md:77-78` "Never
  rewrite or renumber") ② ~300줄 상한(`:52`)을 **동시에** 요구하는데, 초과 시 처분이
  **없다**(전문 134줄에 archive/split/prune/supersede 0건). 항목당 5~10줄 기준이면
  결정 30~60개가 한계다. 상류가 미검출인 이유는 **자기 엔진을 도그푸딩하지 않기 때문**
  (@6de63ba: `.harness/`·`scripts/execute.py`·`engine-manifest.json` 부재, `docs/`엔
  `INSTALL.md` 10.8KB뿐). 우리 항목 밀도가 30~60줄로 의도의 6~10배라 벽에 **일찍**
  도착했을 뿐, 밀도는 "언제"를 바꿀 뿐 "여부"를 바꾸지 않는다. 자립형 보고서 =
  `adapters/final-harness/UPSTREAM-DOCS-LIFECYCLE-GAP.md`(사용자가 상류에서 확인 예정).
  상류가 다른 정식 패턴을 채택하면 재정렬한다.
- **미변경 (의도)**: `phases/**` 3건·`interactive/**` 2건·2026-07-15 리뷰 기록 2건의
  구 경로 인용은 **갱신하지 않는다** — 재기준 v2 §11이 `phases/**`·`interactive/**`
  diff 0을 요구하고, 리뷰 기록은 작성 시점 사실의 증거다. 트랙 B의 2건은 설치 대상
  머신에 이 레포가 없으므로 원래부터 레포-내부 경로 누수였다(별건 관찰).
- **불변(재확인)**: append-only(수정·삭제 금지, 정정도 새 항목) · D-012·D-020의 ADR
  이중 체계 금지 · D-018 상류 분리 유지 · 대화형 세션의 "D-번호 인용 전 원문 확인"
  (CLAUDE.md, 경로만 갱신) · `phases/**`·`interactive/**` diff 0.
- **영향**: 주입 합계 57,747 → **약 13,071 bytes**(거부선의 20%, WARN선 아래로 복귀).
  `docs/` 최상위는 PRD·ARCHITECTURE 2종만 남는다. CLAUDE.md 문서 계약 표의 경로 갱신.
  재기준 v2 §11의 `docs/DECISIONS.md` 행 경로 갱신(내용 계약은 무변경). 이 항목 이후
  모든 결정은 새 경로에 append한다.

## D-027 · 2026-07-16 · 통합 보강 순서 재배치 — Track B 안전 봉인 → clean v0.20.x candidate → Track A Phase 5

- **결정**: D-025의 실행 구조×SAP Policy, P4 소유권과 아래 안전 상태는 변경하지 않는다.
  `attended-only`, `unattended=sealed`, `historical_rv4_classifier=open`,
  `sap_mutation_boundary=unverified`(scope: reviewer + all attended children). 대신 기존
  `candidate=6de63ba`와 “§11 덩어리 3→4→5부터 진행” 순서를 중단하고 다음 순서로
  재배치한다. ① Track B의 create-program/create-object/release/reviewer 절차에 남은
  auto/unattended 및 범용 기계경계 표현을 현재 Policy에 맞게 먼저 봉인한다. ② dirty
  ownership 확인과 전체 release check를 통과한 clean final-harness v0.20.x exact SHA를
  새 candidate로 선정한다. ③ 그 candidate 계약에 맞춰 lock v2, 리뷰 계약·검사기,
  `scripts/run-track-a.ps1`, legacy deny와 단방향 `.sc4sap`→`.harness` bridge를 구현한다.
  ④ sc4sap provenance·migration checker·CI assertion·vsp 테스트 이식성을 보강한다.
  ⑤ 새-컨텍스트 독립 리뷰와 disposable staging을 통과한 뒤에만 attended connected
  gate와 파일럿을 수행하고, 마지막에 기능·Domain Pack을 확장한다. 단계별 파일·명령·
  합격·중단 조건의 정본은
  `docs/reference/designs/2026-07-16-integration-hardening-roadmap.md`다.
- **근거**: ① upstream v0.20 계열은 Direct zero-footprint와 전역 hook no-op 등 이
  프로젝트가 별도로 보강하려던 표면을 이미 진전시켰으므로 v0.19.3에 새 코드를 쌓기 전
  clean 후보 재선정이 필요하다. ② Track B의 과거 auto/unattended write·release 절차는
  현재 P3/P4 사람 승인·DEV-only·소유권 계약과 충돌한다. ③ Track A와 Track B가 각각
  `.harness`와 `.sc4sap` 상태·승인·리뷰 체계를 가지므로, 동기화 없이 기능부터 늘리면
  동일 작업에 두 개의 완료 판정이 생긴다. ④ 현 migration coverage는 source commit을
  고정하지 않고 private 경로를 순회하며, 일부 CI는 안전 계약을 출력만 하고 assert하지
  않는다. 이 상태에서 connected pilot은 결함을 증폭한다.
- **기각**: (a) 기존 6de63ba 덩어리 3부터 곧바로 계속 — 최신 상류 계약을 다시 덮어쓸
  위험 때문에 기각. 6de63ba는 “당시 검토된 candidate, 미-staged·미-verified”라는 역사
  사실만 보존한다. (b) 기능·팩부터 확장 — 완료 계약과 SAP 안전경계가 먼저다. (c)
  `.sc4sap`↔`.harness` 양방향 동기화 — 충돌·재개 불일치 표면이 늘어나므로 기각하고
  `.sc4sap` 기록을 입력 증거로 소비하는 단방향 bridge만 허용한다. (d) 두 트랙을 단순히
  계속 분리 — 사용자에게 두 개의 승인·상태·완료 의미를 노출하므로 통합 목표에 맞지 않는다.
- **영향**: HANDOFF의 2026-07-15 “다음 액션”은 역사 기록으로만 남고 실행 권위가 없다.
  DESIGN v2.4는 기존 Phase 5·§16에 supersede 경고를 둔다. 당장 허용되는 첫 구현은
  Direct/P0의 S0뿐이며 SAP 연결·쓰기·release/import와 `.harness/runs/**` 생성은 없다.
  S0~S4의 오프라인 게이트가 모두 PASS하기 전 S5 connected 작업을 시작하지 않는다.

## D-028 · 2026-07-16 · S1 — clean final-harness v0.20.x candidate 확정: `d4a0aeb` (6de63ba 폐기, verified는 v0.17.3 유지)

- **결정**: 트랙 A의 새 candidate를 **`d4a0aeb0bdbcea008dbe2926006ee2e06eac2fc3`**
  (final-harness, plugin v0.20.0, "fix: harden engine git and installer boundaries")로
  확정한다. 상태는 **`selected`**이며 staged도 verified도 아니다.
  `adapters/final-harness.lock.json`의 **verified는 v0.17.3(8f7f13b) 그대로 유지**한다 —
  이 결정은 lock 파일을 바꾸지 않는다(lock v2는 S2-C 소관). 이전 candidate `6de63ba`는
  D-027대로 "당시 검토된 candidate, 미-staged·미-verified" 역사 사실로만 남는다.
  재기준 v2 §7.5가 명시를 요구한 "현재 dirty Git/install trust fixes 포함 여부"는
  **포함**으로 확정한다.
- **근거 (전부 실측)**:
  ① **§7.3 선결 해소** — 상류 워킹트리의 미커밋 ~20파일을 사용자가 직접 커밋·푸시
     (2026-07-16). 실측: HEAD=d4a0aeb, `git status --porcelain` 0줄,
     `master...origin/master` 동기. D-024의 moving-target/dirty-pin 금지를 위반하지 않고
     clean SHA를 고정할 수 있게 됐다.
  ② **authoritative release check success=true** — `scripts/release_check.py`를
     `--allow-missing-codex` 없이 기본 실행. 리포트: `authoritative:true`,
     `codex_required:true`(실제 codex-cli **0.144.4** 탐지 → 플러그인 수명주기 E2E가
     조용히 skip 불가), `python_versions:[3.9,3.12]`, `bridge_repeat:3`,
     **`success:true`**, 9/9 run exit 0(`git-diff-check` 포함 = §7.4 7단계 동시 충족).
     증거 sha256 = `85cda0a606d6ae7402acc3be8e7c29cd4cc3eb9c8d795548689dd95eb4efbfe8`.
  ③ **clean detached 재현(§7.6)** — 별도 클론에서 `--detach d4a0aeb`(dirty 0)로 재실행 →
     동일하게 `success:true`, 784 passed/3 skipped. **`secret.env` 부재 상태에서 통과** =
     릴리스 게이트가 로컬 secret에 의존하지 않음이 실증됐다.
  ④ **§7.5 구성 요건 기계 확인** — `git merge-base --is-ancestor`로 `5cd63ec`
     (v0.20.0 Engine hook lifecycle)·`1209553`(bounded docs lifecycle) **둘 다 조상 YES**.
  ⑤ **버전·changelog 정합(§7.4 3단계)** — plugin.json blob `e2bb26f2…` =
     `"version":"0.20.0"`, CHANGELOG v0.20.0 항목 1~7이 이 트리를 서술(항목 7 =
     d4a0aeb가 추가한 "Engine Git·설치 신뢰 경계 후속 봉합").
  ⑥ **F1 실질 생존 확인** — DESIGN §3 백엔드 결정의 근거인 F1(headless child의 MCP
     차단)이 candidate에서도 성립: Claude `--strict-mcp-config`(`execute.py:3008`·`:3566`),
     Codex `mcp_servers.{key}.enabled=false`(`:3526`), 열거 실패 시 fail-closed
     (`:760`·`:784`). v0.17.3 기준 좌표(2332-2333 등)는 무효이나 **실질은 유지** →
     "Engine=vsp CLI만"의 근거가 흔들리지 않는다.
- **정직 기록 (미검증·열린 항목 — 숨기지 않는다)**:
  ① **RV4는 이 candidate에서도 열려 있다** — `authority-gate.py`(@d4a0aeb)에 **"vsp"
     언급 0건**, `_deploy()`의 `deploy_actions`(`:371-376`)는 helm/vercel/netlify/
     firebase/flyctl/wrangler/serverless/railway만 커버하고 vsp 부재. `:390`의
     `head=="deploy" or action in deploy_actions.get(head,…)` 판정상 `vsp deploy`
     (head=`vsp`)는 걸리지 않는다 → `deploy=false`여도 vsp deploy 미차단.
     **v0.20 업그레이드는 RV4를 닫지 않는다.** 안전 문자열 4종(`attended-only`·
     `unattended=sealed`·`historical_rv4_classifier=open`·`sap_mutation_boundary=unverified`,
     scope: reviewer + all attended children)을 그대로 유지한다.
  ② **symlink 탈출 차단은 이 머신에서 미검증** — 두 파이썬 모두 3건 skip, 전부
     WinError 1314(심볼릭링크 권한 부족): `test_run_contract.py:223`·
     `test_install_engine.py:454`·`:466`. 하필 installer/run_contract의 **symlink 탈출
     거부** 테스트다(release_check는 환경 skip으로 판정해 success=true). S4 staging의
     installer 경계 검사에서 재확인 대상.
  ③ **Track B hook 보존·Direct zero router process는 계약 수준만 확인** — CHANGELOG
     v0.20.0 항목 1·2가 선언하고 상류 자체 테스트가 커버하나, **우리 트랙 B 훅 3종에
     대한 실증은 S4 disposable staging**이 소유한다. S1은 이를 판정하지 않았다.
  ④ **F1~F7/N1~N8 전량 재측정은 아직** — F1만 실질 확인했다. lock `_comment`("엔진
     갱신 시 F1~F7 재검증 후에만 lock을 올린다")대로 **lock 승격 전 전량 재측정 +
     좌표 갱신**이 선결이다(S2-C lock v2 / S4).
- **기각**: (a) **`1209553`으로 되감아 dirty 수정 제외** — 기각: d4a0aeb는 clean tip이고
  강화 대상이 하필 **engine git + installer 경계**인데, 이는 S4 staging이 검사할 표면
  그 자체다. 구 installer를 검증하는 것은 무의미하고 재작업을 부른다. (b) **`6de63ba`
  유지** — D-027에서 이미 기각(최신 상류 계약 덮어쓰기 위험). (c) **`--allow-missing-codex`
  로 통과** — 기각: 리포트가 `authoritative:false`가 되어 §7.7 중단 조건("비권위 또는
  일부 lane SKIP")에 정면 저촉. (d) **candidate를 곧바로 staged/verified로 승격** —
  기각: §7.6·§10.6대로 staged는 S4(독립 리뷰 + disposable staging) 통과 후, verified는
  S5 파일럿·게이트 후 PROMOTE에서만.
- **영향**: S2는 이 SHA 계약에 맞춰 lock v2·`scripts/run-track-a.ps1` wrapper·run-scoped
  리뷰 계약·bridge를 구현한다. lock의 candidate/safety_state 필드 도입도 S2-C 소관이다.
  주 머신에 새 Engine 설치는 **S4 전까지 금지**(로드맵 §5). SAP 연결은 S5 전까지 금지 —
  이 결정 과정에서 **SAP 접속·write 0건**, 상류 레포 **수정 0건**(검사만; 리포트는
  스크래치패드에 기록).

## D-029 — S3: 이식 provenance를 live walk에서 pinned snapshot으로, 게이트를 관찰에서 assertion으로 (2026-07-16)

- **맥락**: D-027 로드맵 §9. S3는 기능 추가가 아니라 **부품 사이 계약**을 닫는 단계다.
  실측한 결함 넷: ① `check-migration-coverage`가 동결 원본 전체를 파일시스템 재귀
  순회하며 `private/` 엔트리 이름을 열거(R-004 정신 저촉) + 러너엔 절대경로가 없어 CI
  실행 불가(이식 검증이 CI 사각지대) ② `integrity.json.sourceCommit`이 상류 fork 약식
  SHA `1964959`를 **우리 엔진 소스 커밋인 양** 기록 + VERSION이 "working tree,
  uncommitted"로 끝남(재현 불가 선언) ③ `smoke-mcp`가 도구 수를 출력만 하고 **언제나
  exit 0** — 안전 표면이 회귀해도 CI는 초록 ④ plugin version이 매니페스트 5곳에 복제.

- **결정**:
  ① **이식 검증 = pinned snapshot**. 원본 커밋 `a95eb0f`(이식일 2026-07-10 시점 원본
     HEAD, `git rev-list -1 --until=... HEAD`로 재현) + 명시 public root allowlist 36 +
     tracked public 인벤토리 487 + 목적지 내용 해시를 `interactive/provenance/`에 고정.
     게이트는 **원본에 접근하지 않는다** → CI에서 실행된다. 구 게이트의 실질(미분류 0·
     죽은 규칙 0·목적지 실재)은 pinned inventory에 대해 오프라인 재현하고, **목적지
     내용 해시 드리프트**를 새로 추가했다. 원본 접근은 생성기/드리프트 리포터 2종에만
     격리하고 둘 다 allowlist pathspec만 써서 `private/`를 **질의조차 하지 않는다**.
  ② **분류 정의의 정본은 코드**, 스냅샷은 그 기록. 게이트가 둘의 일치를 assert한다.
     정본을 JSON에 두면 mutation 도구를 execution 목록에 숨겨 "readonly mutation 0"을
     통과시킬 수 있다 — 분류 변경은 리뷰에 보이는 코드 변경을 거치게 한다.
  ③ **게이트마다 음성시험을 동반**한다(17/17 · 16/16). 통과만 하는 게이트는 없느니만
     못하다(로드맵 §15).
  ④ **핀은 재검증한 뒤에만 올린다**(compatibility). 설치 버전을 확인한 것만으로 핀을
     따라 올리면 근거 없이 동작을 주장하게 된다. 잰 것과 재지 않은 것을 함께 적는다.

- **기각**: (a) **구 게이트 유지 + private 예외 처리** — 기각: 순회 자체가 private 이름을
  열거하므로 사후 필터는 무의미하고, CI 사각지대도 남는다. (b) **원본 현재 HEAD를 핀으로**
  — 기각: 이식은 2026-07-10에 했고 원본 public 영역은 그 뒤 45건 변경됐다. 현재 HEAD를
  핀하면 이식하지 않은 지점에서 이식했다고 주장하게 된다. (c) **드리프트 45건을 S3에서
  판정** — 기각: S3 범위는 기계를 만드는 것이다. 판정 없이 전부 `pending`으로 두는 쪽이
  정직하다(`pending` = 아직 안 봤다, ≠ 이식 불필요). (d) **자산 수를 순진하게 계수** —
  기각: 실측 결과 순진한 계수가 **틀렸다**(industry/country의 README.md, modules/common은
  팩이 아님). 구 설명의 "14+BC · 14 industries · 16 countries"가 오히려 정확했고 실제
  오류는 "11 procedures" 하나(절차 16 중 11만 스킬 노출)였다. → 기계로 세되 **무엇을
  세는지는 사람이 정한다**. (e) **deferred 목적지도 해시** — 기각: 게이트가 건너뛰는
  해시라 churn만 낳고, 하필 `scripts/`(게이트 도구 자신의 디렉터리)를 가리켜 스크립트
  한 줄 고칠 때마다 동결 원본 있는 머신에서만 재생성 가능해진다(자기참조).

- **실측 정직 기록**:
  ① **번들은 재현된다** — `0b304de7`에서 재빌드 시 sha256 `53ac1ac5…`·8275580 bytes로
     배포본과 바이트 동일, tracked `dist/` 변경 0. §9.3의 "재현 불가 시 build env를 별도
     lock에 기록"은 **불발동**.
  ② **readonly는 실행 무풍지대가 아니다** — `RuntimeRunClassWithProfiling`(ABAP 실행)과
     `RuntimeCreateProfilerTraceParameters`가 readonly exposition에 노출된다. 리뷰어는
     P0/P1만 해야 하는데(AGENTS) exposition이 그것을 강제하지 않으며 차단은 에이전트/
     어댑터 층에만 있다. `sap_mutation_boundary=unverified`와 정합. 게이트는 이 2종을
     등재 고정해 **새 실행 도구의 유입만** 잡는다(현 상태를 고친 것이 아니다).
  ③ **row-data는 default·readonly 양쪽 모두 노출** → P2는 exposition으로 막히지 않는다.
     기계 차단면은 어댑터 deny(Codex `disabled_tools` / AG `excludeTools` / Claude
     allow-list 제외)뿐이고 그 위에 호출별 사람 승인이 있다.
  ④ **파일 수 508/494/487은 서로 다른 계약**(walk+untracked / 원본 변동 후 walk / pin의
     tracked public). 487만 재현 가능하다.
  ⑤ **EOL이 게이트를 깨뜨릴 뻔했다** — 이 레포엔 `.gitattributes`가 없고
     `core.autocrlf=true`라 Windows는 CRLF·Linux(CI)는 LF로 체크아웃된다. 원시 바이트를
     해시하면 같은 내용이 러너에서 다른 해시가 된다(실측 `8d2abc86…` vs `98ce9943…`).
     → 해시 계약을 `lib/target-hash.mjs` 한 곳에 두고 **바이트 수준** CRLF→LF 정규화
     (`toString('utf8')` 왕복은 잘못된 UTF-8을 U+FFFD로 바꿔 해시가 거짓말을 한다).
  ⑥ **vsp**: HEAD `0b03ef2`·binary sha256·크기 전부 lock과 일치. `go test ./...`는 4개
     패키지 FAIL이나 전부 캐시/레코딩/jseval 영역이라 lock의 command_contract 밖이다
     (로드맵 §3.5가 예고한 3원인과 정확히 일치). 계약의 오프라인 명령 2종은 lock
     binary로 **직접 실측**해 PASS(lint→Warning/exit 0 · parse→exit 0 · execute→gated).
     나머지는 SAP 접속 필요라 S5 전까지 미판정. 분리 기록은 `vsp.lock.json.test_status`.
  ⑦ **RV4는 여전히 열림**, `unattended=sealed` 유지. 안전 문자열 4종 무변경.

- **영향**: CI가 3게이트 → 3잡(node-gates 9단계 · engine-tests 599 · ps-gate 3스위트)로.
  `check-migration-coverage` 폐기. 엔진 provenance/매니페스트/표면 스냅샷은 이제 **의도된
  변경일 때만** 각자의 `--update`/`--refresh`/재생성으로 갱신하며 사유를 커밋에 남긴다.
  **vsp-custom 수리 착수는 사용자 결정 사항**이라 S3에서 하지 않았다(§9.6 — /tmp→t.TempDir·
  recording ID·CGO0 SQLite·Windows lane). 이 단계에서 SAP 접속·write **0건**, 동결 원본
  **수정 0건**(읽기만), private 경로 열거 **0건**.

## D-030 · 2026-07-19 · vsp-custom 편입 확정 — 분리 유지(D-018) supersede, 분기 통합 직후 편입

- **결정**: vsp-custom을 sah 레포로 편입한다(engine/ 편입 D-017에 준하는 "차용 후 완전 소유"). D-018의 "분리 유지 + 버전 lock 계약"을 supersede한다. 편입 방식(subtree 등)·경로·lock 재바인딩은 편입 실행 단계의 별도 소규모 설계로 확정한다.
- **타이밍**: **분기 통합 완료 직후** 별도 단계로 실행한다(이 통합 세션은 결정 기록까지). subtree 편입은 레포 구조 변경이라 48개 충돌 파일 병합이 끝난 뒤에 수행해야 이력이 깨끗하다.
- **근거 (D-018 이후 바뀐 조건)**: D-018이 분리 유지를 정당화한 두 기둥 중 **"업스트림 결별 비용"**(oisee/vibing-steampunk와의 결별 기회비용) 논거가 붕괴했다 — vsp는 이미 로컬 하드포크로 상당히 diverged 한 상태이고(계보 v2.38.1-91-g0b03ef2에 로컬 write 게이트·재검증을 얹어 v2.38.1-94), 업스트림과의 실질 동기 경로가 이미 끊겨 "편입=결별"이 성립하지 않는다. 사용자가 "다 녹이려던 것"이라는 편입 의사를 재확인했다(2026-07-19). 남은 기둥("소비 형태=바이너리 CLI")은 편입의 마찰 해소 이득을 낮출 뿐 편입을 막지 못하며, engine/이 같은 논리로 이미 편입된 선례(D-017)가 있다. 정본 근거 = 통합 평가 문서 `docs/reference/audits/2026-07-19-branch-divergence-assessment.md` §5-4·§4(vsp lock·write 게이트 로컬 우월분).
- **대안·기각**: (a) 분리 유지 현상 지속(D-018 그대로) — 기각: 업스트림 결별 비용 논거 붕괴 + 사용자 편입 의사 재확인. (b) 통합 보강 로드맵 S5 선행 후 편입 — 기각: subtree는 레포 구조 작업이라 통합 직후가 가장 깨끗하고 S5에 종속되지 않는다. (c) 미니 설계서부터 착수 — 기각: 편입 여부 자체는 확정이므로 설계는 편입 실행 단계에 흡수한다.
- **불변(재확인)**: R-002(vsp CLI 전용 SAP 접점)·R-003(DEV tier write)·실데이터 2종 호출별 승인은 편입과 무관하게 유지. 편입은 소스 소유 위치만 바꾼다.
- **영향**: 편입 실행 단계에서 `adapters/vsp/`의 lock·write 게이트·SAFETY-PROFILES를 레포-내부 경로로 재정합하고 DESIGN.md §2 분리 근거·§16 lock 절차를 갱신한다(이 세션 무변경). D-018의 재론 트리거("2-레포 분산 마찰 3회 실증")는 불발동 상태로 supersede — 근거가 마찰 실증이 아니라 하드포크 기정사실 + 사용자 의사이기 때문이다.

## D-031 · 2026-07-17 · 트랙 A 수행 레벨 문서 3종 신설 (보조 머신 D-020 재번호)

- **재번호 경위**: 보조(로컬) 머신 줄기에서 `D-020`으로 기록됐던 결정이다. 주(원격) 머신이 같은 번호 D-020을 다른 결정(docs 2종 신설·ADR 미신설)에 이미 사용해 D-020~023 4중 번호 충돌이 생겼고, 통합 정본이 원격 구조를 채택(D-035·⑶)하므로 로컬 4건을 **D-031~034로 재기술**하고 원 로컬 D-020은 이 항목으로 supersede한다(원격 D-020은 무변경). append-only 규약의 "정정도 새 항목" 원칙에 따른 재번호다.
- **원 결정 전문 (보조 머신 D-020, 무수정 인용)**:
> ## D-020 · 2026-07-17 · 트랙 A 수행 레벨 문서 3종 신설 (D-012 부분 갱신)
> - **결정**: docs/PRD.md·ARCHITECTURE.md·ADR.md를 "하네스로 수행하는 SAP 개발
>   작업"(수행 레벨) 스코프로 신설. DECISIONS.md는 하네스 자체(메타 레벨) 결정
>   로그로 존속.
> - **근거**: D-012(2026-07-10)는 부트스트랩 전 결정 — 메타/수행 레벨 구분이
>   드러나기 전이라 "중복"으로 판단했다. 부트스트랩 후 실측: 스텝 프롬프트에
>   주입되는 최상위 docs가 메타 결정 로그(21KB)뿐이고, 수행 작업장 지도·검증
>   계약·수행 결정(PLANNING.md에 산개)이 스텝에 전달되지 않는 빈틈 확인.
>   두 레벨은 주제가 달라 D-012가 우려한 중복이 아니다 (사용자 판단 2026-07-17).
> - **대안 기각**: ① 현상 유지 — 빈틈 지속. ② 얇은 ARCHITECTURE 1종만 — 수행
>   결정(ADR)의 집이 없어 산개 지속.
> - **영향**: 3종은 수행 레벨만 담고 메타는 포인터로 위임 (각 300줄 이하, 최상위
>   docs 합산 48KB 이하 유지 — 신설 후 합산 약 34KB). D-012의 "DECISIONS.md
>   1종" 조항은 메타 레벨에 한해 유지.
- **통합 반영**: 로컬이 신설한 3종 중 PRD·ARCHITECTURE는 원격 재기준본과 손실 0으로 통합해 `docs/` 최상위 정본으로 유지한다. **ADR.md는 원격 D-020·D-026의 "이중 체계 금지" 논거와의 긴장 때문에 top-level 활성 로그가 아니라 `docs/reference/ADR.md`로 이동해 보조 줄기 산출물의 이력으로 보존한다**(폐기 아님 — D-035·⑶). 로컬이 도입한 "메타 레벨(하네스 자체) vs 수행 레벨(SAP 작업)" 구분은 원격의 단일 로그 구조(`docs/reference/DECISIONS.md` 1종 = 레포 수준 결정 + ADR 역할 겸)로 흡수되며, 수행-레벨 ADR 항목(ADR-001~003)은 위 이력본에 남는다.

## D-032 · 2026-07-17 · Phase 3 리뷰 게이트 = 별도 리뷰 스텝(캡슐 해시 바인딩) (보조 머신 D-021 재번호)

- **재번호 경위**: 보조(로컬) 머신 줄기의 `D-021`. 원격이 같은 번호 D-021을 다른 결정(plan-레벨 리뷰 스텝)에 사용한 충돌을 D-035·⑶의 원격 구조 채택으로 해소 — 로컬 D-021을 이 항목으로 재번호한다(원격 D-021은 무변경).
- **원 결정 전문 (보조 머신 D-021, 무수정 인용)**:
> ## D-021 · 2026-07-17 · Phase 3 리뷰 게이트 = 별도 리뷰 스텝 (엔진 무수정) — 캡슐 해시 바인딩 + fail-closed (5-11 설계 종결)
> - **결정**: 무인 SAP write 직전마다 새-컨텍스트 read-only AI 리뷰어 게이트를 별도
>   리뷰 스텝(verify=래퍼 exit code)으로 편입. 판정 = MAJOR 이상 1개 FAIL · MINOR만
>   PASS+기록 · 수정 revision 3회 BLOCKED(런 종료+보고서, 산출물 보존). PASS는 리뷰
>   캡슐(소스+manifest+스펙+기계검증 결과+정책·모델·스키마 버전+대상 시스템) 해시에
>   바인딩하고 배포는 캡슐본에서(TOCTOU 제거). 수정 루프는 엔진 표준 스텝 재시도로
>   실현(리뷰 스텝 재시도 예산 ≥ 5). 워커 스텝 vsp 프로파일 = read-only tier, write
>   프로파일은 배포 래퍼 경로만. 스펙 정본 =
>   `docs/reference/designs/2026-07-17-phase3-review-gate.md` (Codex B15 반영 v2).
> - **근거**: 기계 검증(문법·ATC·활성화) 전부 통과한 시맨틱 결함은 리뷰만
>   차단(INNER vs LEFT JOIN — HANDOFF §4.1 실증). 무인 체인의 완료 판정이 기계
>   verify뿐이라는 5-11 공백 해소. Fable+Codex 독립 수렴 + 사용자 확정(엄격도·
>   BLOCKED) + Codex 교차 리뷰 B15(MAJOR 11·MINOR 4) 반영.
> - **대안 기각**: ① 엔진 포크 수정(내장 _run_review 게이트화) — D-018 lock 위반·
>   상태머신 재설계 부담 ② 사람 셰퍼딩 유지 — 무인 가치 반감 ③ MINOR도 FAIL —
>   BLOCKED 빈발로 무인 가치 반감 ④ 재시도 5회 — 3회 초과 반복 실패는 구조 문제
>   ⑤ 능동 알림·대기-질의 — 장치 과잉·엔진 수정 필요 ⑥ vsp 서버측 조건부
>   write(CAS) — 현 위협 모델 대비 과잉(스펙 Deferred).
> - **영향**: DESIGN §13 Phase 3 완료 기준에 "리뷰 게이트가 실제 결함을 차단한
>   실증 1회" 추가(반영 완료). 구현은 harness-plan 계획 후 — 구현·실증 전까지
>   무인 write 금지(5-11)는 그대로 유효. OS 수준 위조 방지는 스코프 밖(절차+감사
>   등급) — 다중 사용자·QA 이상 tier 확장 시 재론.
- **통합 반영(⑵ 역할 분담)**: 로컬의 캡슐 해시 방식과 원격의 run-scoped verdict 방식은 같은 문제를 다른 아키텍처로 각자 완주한 이중 구현이다. 통합은 **원격 run-scoped 골격을 공통 베이스**로 두고 **무인 경로의 SAP write에만 이 캡슐 밀봉을 관문 부품으로 편입**한다(무인 시 배포물 봉인 보증 — ⑴ 절충과 정합, D-035 ③). 양쪽 phase 산출물은 이력 보존(폐기 없음), 배선 설계는 통합 직후 소규모 설계로 반영한다.

## D-033 · 2026-07-19 · drift 실증기의 비-vsp MCP 채널 사용 정당화 (보조 머신 D-022 재번호)

- **재번호 경위**: 보조(로컬) 머신 줄기의 `D-022`. 원격이 같은 번호 D-022를 다른 결정(Phase 4 완주 + 대화형 재기준)에 사용한 충돌을 D-035·⑶으로 해소 — 로컬 D-022를 이 항목으로 재번호한다(원격 D-022는 무변경). 이 결정의 내용(vsp 단일 접점 원칙의 적용 범위 고정)은 통합으로 바뀌지 않는다.
- **원 결정 전문 (보조 머신 D-022, 무수정 인용)**:
> ## D-022 · 2026-07-19 · drift 실증기의 비-vsp MCP 채널 사용 정당화 (vsp 단일 접점 원칙과의 긴장 고정)
> - **결정**: drift 실증기(하네스 밖 서버 변경을 모사하는 도구)는 비-vsp 채널(MCP
>   `UpdateProgram`+`ActivateObjects`)을 정당하게 쓴다. PRD 비목표("MCP 서버 백엔드
>   사용 안 함 — SAP 접점은 vsp CLI 단독", D-001·R-002)와의 긴장은 그 원칙이 **하네스
>   자신의 작업·검증 경로**에 한정된다는 점으로 고정한다 — out-of-band 모사는 정의상
>   그 경로 밖이어야 실증이 성립하므로 자기모순이 아니다.
> - **근거**: Phase 3 완주(merge eca4d717)의 drift 실증(phases/4-gated-deploy step 5)이
>   이 채널로 $TMP 서버 `ZSAH4_GL_LIST`에 마커 변경을 만들고 drift check가 검출·게이트
>   경유로 원복함을 실증(state/drift-evidence.json) + 스프린트 독립 리뷰의 비차단 후속
>   권고(phases/4-gated-deploy/review.md ②) + HANDOFF「잔여 소진 스프린트」블록 W5
>   마감 항목 2 기록(HANDOFF.md:328-332).
> - **대안 기각**: vsp 채널로 실증 — drift 실증은 "하네스 밖" 변경을 모사해야 하는데
>   vsp는 하네스 자신의 경로이므로 그 경로로 만든 변경은 out-of-band가 성립하지 않는다
>   (자기모순).
> - **영향**: DESIGN.md §13 Phase 3 완료 기준에 한 줄 명시(위 결정 취지). PRD.md 비목표
>   문구는 무수정 유지(원칙 자체는 그대로, 적용 범위 해석만 고정).

## D-034 · 2026-07-19 · 무인(headless) SAP write = 대화형 재기준 틀 안의 U-gate 조건부 개방 (보조 머신 D-023 재번호 + ⑴ 절충으로 재기술)

- **재번호 경위**: 보조(로컬) 머신 줄기의 `D-023`("무인 상시 write 개방"). 원격이 같은 번호 D-023을 다른 결정(v0.19 3축 재기준)에 사용한 충돌을 D-035·⑶으로 해소하고, 나아가 **이 항목만은 번호뿐 아니라 내용 자체를 ⑴ 방향 절충으로 재기술**한다. 로컬 D-023은 원격 재기준(attended 중심·`unattended=sealed`)의 존재를 모르는 채 내려진 승인이었기 때문이다(통합 평가 §3-1).
- **원 결정(보조 머신 D-023) 전문, 무수정 인용**:
> ## D-023 · 2026-07-19 · 무인 상시(headless) SAP write 개방 — DEV tier·$TMP 한정 + 리뷰 게이트 경유 (5-11 종결)
> - **결정**: 무인(headless) 엔진 런의 SAP write를 상시 허용한다. 범위·조건 불변항:
>   DEV tier·$TMP 한정(R-003) · 리뷰 게이트 경유 필수(캡슐 해시 바인딩 PASS → 캡슐본
>   배포, D-021) · 계획 동결은 여전히 사람 승인(SAFETY-PROFILES §⑥ — 개방되는 것은
>   런 "실행 중" 감독 요건뿐) · 실데이터 2종 상시 게이트 유지. attended bridge 감독
>   요건(구 5-11 금지)은 해제.
> - **근거**: Phase 3 Gated Deploy 완주 실증(merge eca4d717) — AC-8(기계 4층 green인
>   시맨틱 결함을 게이트가 미통과 처리 → 수정본 통과)·AC-14·15·drift 검출·원복까지
>   기계 체커 확인 + 스프린트 종합 독립 리뷰 PASS. 사용자 승인 2026-07-19("연습
>   공간에만" — $TMP 한정 조건부).
> - **대안 기각**: attended 한정 유지 — 게이트 실증 완료로 안전 근거가 성립했고
>   사람 상주 요건은 무인 가치(사람 개입 없는 완주)를 반감시킴.
> - **영향**: HANDOFF 상시 문구 "무인 SAP write 금지(5-11)" 해제(이 결정으로 대체).
>   SAFETY-PROFILES.md는 모드 구조 기술이라 무수정(모드 정의는 개방 여부와 독립).
>   QA/PRD tier 금지(R-003)는 RULES 불변.
- **재기술(⑴ 절충 확정, 2026-07-19)**: 위 로컬 D-023의 "무인 상시(무조건) write 개방"을 supersede하고, **대화형(attended) 중심 틀(원격 재기준)을 정본으로 채택한 위에서, 무인은 그 틀 안의 관문(U-gate)을 통과할 때만 사용 가능한 조건부 개방**으로 재정의한다. 원격 로드맵이 `unattended=sealed`의 해제 조건으로 명문화한 "별도 U-gate + 사용자 D-결정"을 이 항목(+ D-035)이 충족한다.
- **관문(U-gate) 통과 재료**: ① 로컬 Phase 3 Gated Deploy 검토 게이트 실증(merge eca4d717) ② **AC-8** — 기계 4층(문법·ATC·활성화 등)이 green인 시맨틱 결함을 게이트가 **미통과 처리**하고 수정본이 통과함을 기계 체커로 실증 ③ drift 검출·원복 실증 ④ 스프린트 종합 독립 리뷰 PASS ⑤ 2026-07-19 사용자 승인("연습 공간에만" — $TMP 한정 조건부).
- **잔여 조건 (정직 기록)**: U-gate의 정확한 정의·기계 배선(어떤 관문 검사를 무인 write 경로에 어떻게 거는지)은 **후속 소규모 설계**다. 따라서 이 항목은 무인 조건부 개방을 **승인하는 결정**이며, U-gate가 정의·배선되기 전까지 무인 SAP write의 운영 개방은 그 배선 완료에 종속된다. 불변 조건: DEV tier·$TMP 한정(R-003) · 리뷰 게이트(캡슐 밀봉 부품, D-032) 경유 필수 · 계획 동결은 사람 승인 · 실데이터 2종 호출별 승인.
- **영향**: 로컬 D-023이 해제하려던 "attended bridge 상주 요건"은 U-gate 틀 안에서만 해제된다. SAFETY-PROFILES의 `unattended=sealed` 안전 문자열은 U-gate 배선·검증 후에 갱신한다(그 전까지 봉인 기록 유지). 배선 설계는 통합 직후 후속 단계.

## D-035 · 2026-07-19 · 주/보조 머신 6일 분기 통합 방식 확정 (사용자 5건 + 방향 절충)

- **맥락**: git push 거부로 발견된 6일 병렬 분기 — 공통 조상 `8d09e571`(2026-07-13), 로컬(보조) 67커밋·224경로 vs 원격(주) 65커밋·145경로, 공유 커밋 0, 실제 충돌 파일 48. 결정 로그가 두 벌로 갈라져 D-020~023이 양쪽에서 다른 결정을 가리키는 4중 충돌이 핵심이었다. 전수 조사·충돌 지도·대차대조표의 정본 = `docs/reference/audits/2026-07-19-branch-divergence-assessment.md`. 그 §5 선결 결정 4건 + §7 베이스 권고에 대한 사용자 답변을 여기 고정한다.
- **결정 (사용자 2026-07-19, 5건)**:
  ① **병합 베이스 = 원격(주) main** — 구조 개편(로그 이전 D-026·게이트 신형 D-029·CI·재기준)을 역방향으로 옮기는 비용이 커서 원격을 베이스로 삼고 로컬 우월 자산을 얹는다(평가 §7).
  ② **엔진 = 로컬 4.13.15 채택 후 4.13.16으로 재채번** — 원격 추가분 0(4.13.12는 양쪽 병렬 중복), 로컬이 strict superset(평가 §3-2·§4). CHANGELOG 통합·provenance 재바인딩 동반.
  ③ **검토 게이트 = 역할 분담(⑵)** — 원격 run-scoped 골격이 공통 베이스, 무인 경로 SAP write에만 로컬 캡슐 밀봉을 관문 부품으로 편입(D-032). 양쪽 phase 산출물 이력 보존.
  ④ **결정 로그 단일화(⑶)** — 정본 = `docs/reference/DECISIONS.md` 1종(원격 구조). top-level `docs/DECISIONS.md`는 원격 D-026 방식대로 완전 제거(포인터 스텁 없음), 로컬 단독 4건은 D-031~034로 재기술, 로컬 `docs/ADR.md`는 `docs/reference/ADR.md`로 이력 이동.
  ⑤ **vsp 편입 타이밍 = 통합 직후(⑷)** — subtree 편입은 레포 구조 작업이라 통합 완료 후 별도 단계(D-030).
- **방향 절충 (⑴, 상위 결정)**: 위 5건의 상위에 실행 모델 방향이 있다 — 대화형(attended) 중심 틀(원격 재기준)을 정본으로, 무인은 틀 안 U-gate 관문 경유 조건부 개방(D-034). 로컬 D-023의 "무조건 상시 개방"과 원격 `unattended=sealed`의 정면 상충을 이 절충이 해소한다.
- **대안·기각**: 로컬을 베이스로(구조 역이식 비용 큼) · 두 로그 병존(4중 번호 충돌 영속) · vsp를 통합 도중 편입(레포 구조 작업이 병합에 혼입). 정본 근거 = 통합 평가 문서 §1~§7.
- **영향**: 이 통합 세션이 48개 충돌 파일 병합·엔진 재채번·로그 단일화·PRD/ARCHITECTURE 통합을 집행한다. 잔여 후속 단계(통합 직후) = vsp 편입(D-030)·U-gate 정의/배선(D-034)·검토 게이트 캡슐 배선(⑵·D-032). git push는 사용자 판단.

---

## D-036 · 2026-07-19 · vsp 편입 범위 = 통째 편입 + 검증 중심 사용 계약 (D-030 실행 설계 1차 확정)

- **결정**: D-030이 실행 단계로 미뤘던 편입 **범위**를 확정한다 — vsp-custom 소스 **전체**를 편입하되(코드 분할 없음), 하네스가 보증·사용하는 표면은 **검증 중심**(파서·lint·check·test·source read)으로 문서화한다. write 계열(deploy/copy/execute)은 기존 안전 장치(write 프로파일 게이트·SAFETY-PROFILES·R-003)를 그대로 유지하고, 편입 후 실사용 없는 표면의 가지치기는 후속 후보로만 둔다.
- **배경**: 사용자 확인(2026-07-19) — 편입 동기는 "엔진(무인 verify 루프)을 돌리는 데 필요한 파서류 검증 기능의 자립"이지 전 기능 소유 자체가 아님. 원격 브리핑의 편입 논거(이 스택의 유일한 오프라인 ABAP 검증기 실측)와 동일 지점. 분기 통합 세션에서 외부 바이너리 의존의 실증 사례(품질 게이트가 머신별 vsp.exe 경로 부재로 fail-closed 정지) 직후 내려진 결정.
- **대안·기각**: 검사기(파서·lint)만 추출 편입 — 기각: 한 Go 모듈에 얽힌 코드의 분할 수술 비용 + 편입된 검사기와 외부 잔류 배포기가 두 정본이 되는 드리프트 위험 + lock 계약이 절반 잔존. 배포기(deploy/copy)는 트랙 A 배포 백엔드로 이미 실사용 중이라 제외 실익 없음.
- **잔여(편입 실행 세션으로)**: 방식(subtree 등)·레포 내 경로·in-repo 빌드·CI Go 잡·lock/게이트 경로 재정합(D-030 영향 조항)은 실행 세션의 소규모 설계로 확정.
- **불변(재확인)**: R-002(MCP 모드 금지)·R-003(DEV tier write)·실데이터 2종 호출별 승인·무인 write 봉인(D-034 관문 전) 유지 — 편입 범위와 무관.

## D-037 · 2026-07-19 · vsp 편입 실행 설계 — git archive 스냅샷 · 경로 vsp/ · 세션 기록류 제외 (D-030·D-036 실행 완결)

- **결정**: D-030·D-036이 실행 세션으로 미룬 편입 방식·경로·빌드·CI·lock 재정합을 확정·집행한다.
  ① **방식** = 원천(`hjaewon/vsp-custom`) HEAD `5a8bedb`(v2.38.1-94-g5a8bedb)의 **git archive 스냅샷**을 최상위 `vsp/`로 전개하고 **히스토리는 비이식**한다(tracked 파일만 편입, 커밋 이력 미이식).
  ② **경로** = 레포 최상위 `vsp/`. 소스 정본이 in-repo 서브트리로 이동한다(외부 레포 pin 종료).
  ③ **제외** = 세션 기록류 **178파일**(reports/ 155 · contexts/ 22 · 최상위 터미널 세션 로그 1). 제품 코드가 아니라 원 레포의 작업 일지·핸드오프·콘솔 캡처다. 편입 tracked 파일 = 745 중 **567**.
  ④ **빌드** = in-repo `CGO_ENABLED=0 go build -trimpath` + BuildDate를 원천 커밋 시각(`2026-07-18T11:53:07+09:00`, 커밋 committer date)으로 **고정** → 경로·벽시계 독립 **재현 빌드 실측**(동일 build_command 2회, sha256 = `fb5680a4052ae131c70d6a4cfcaf37a47b5486cc8c5e308fbc0b7919ee67f9d9` 동일, size 18115584). **바이너리·빌드 캐시는 비커밋**(HANDOFF 설계 제약 1 — `vsp/.gitignore`의 `/build/`·`*.exe`가 ignore, 빌드는 머신/CI 몫).
  ⑤ **오프라인 계약 스모크 3종 통과** (in-repo 빌드 산출물, SAP 미접속): `vsp lint --file <sample>` → "No issues found" exit 0 · `vsp parse --file <sample>` → 파스트리 exit 0 · `vsp execute --help` → "Requires write permissions" gated 문구 확인(sample = `vsp/embedded/abap/zadt_test_simple_report.prog.abap`).
  ⑥ **lock 성격 전환** = `adapters/vsp/vsp.lock.json`을 외부 버전 lock에서 **빌드·명령 계약·provenance 기록**으로 전환한다(`source_provenance` 신설 — imported_commit·method·excluded_paths·privacy_recheck; 머신별 binary 블록 제거; `binary`는 레포 상대 경로+비커밋; `in_repo_smoke` 기록). `scripts/quality-gate-sap.ps1`·`scripts/verify-sap.ps1`은 머신별 폴백 경로를 버리고 **레포 상대 단일 경로**(`$PSScriptRoot\..\vsp\build\vsp.exe`)만 본다.
  ⑦ **CI** = `.github/workflows/offline-gates.yml`에 `vsp-build` 잡(ubuntu) 신설 — `setup-go@v5`(go-version-file `vsp/go.mod`) → in-repo 빌드 → 오프라인 계약 스모크 3종 + 검증 중심 계약 핵심 패키지 테스트 `go test ./pkg/abaplint/...`(CGO0 green 로컬 실측 후 포함). 전체 `go test ./...`는 기지 실패 4패키지(캐시/레코딩/jseval — lock `unrelated_known_failures`)가 있어 CI 미포함.
- **근거**: 편입 전 실사에서 원 레포 세션 기록 영역에 비공개 접속 식별 정보 잔존을 실측(HEAD 평문 1건 + git 히스토리에 정리 전 기록 다수 — 과거 정리 커밋이 히스토리 재작성을 생략) → 히스토리 이식은 그 기록을 새 레포 이력으로 전파하므로 기각. 편입 트리(`vsp/`) 재점검 실측 = 잔존 실값 **0건**(전량 placeholder·문서 더미·테스트 픽스처). 세션 기록류 제외는 Go 코드 분할이 아니므로 D-036 "통째 편입(코드 분할 없음)"의 취지(파서류 검증 자립·두 정본 드리프트 방지) 훼손 없음. 재현 빌드 고정은 분기 통합 세션에서 실증된 외부 바이너리 의존 마찰(품질 게이트가 머신별 vsp.exe 부재로 fail-closed 정지)의 근본 해소.
- **대안·기각**: (a) **git subtree 히스토리 포함** — 위 잔존 세션 기록이 새 레포 이력으로 전파되어 기각. (b) **subtree --squash** — 스냅샷과 실질 등가이나 HEAD의 잔존 세션 기록이 그대로 들어오고 merge 구조만 추가돼 이득 없음. (c) **검사기만 추출** — D-036에서 기각 확정(코드 분할 수술 비용·두 정본 드리프트·lock 절반 잔존), 재확인. (d) **바이너리 커밋** — 18MB 산출물 + 재현 가능(-trimpath·BuildDate 고정)이라 커밋 불요, HANDOFF 설계 제약 1로 비커밋 확정.
- **불변(재확인)**: R-002(MCP 모드 금지)·R-003(DEV tier write)·실데이터 2종 호출별 승인·write_profile_gate·무인 write 봉인(D-034 관문 전) 유지 — 편입 방식과 무관. 원천 레포는 무수정 보존(처분은 사용자 몫).
- **영향**: 주 머신은 다음 pull 후 **in-repo 빌드 1회 필요**(quality-gate·verify가 in-repo 경로만 봄). D-018의 vsp 조항 **완전 종결**(final-harness 분리만 존속). DESIGN.md §1 좌표표·§2 소유 서술·§10 구조도, docs/ARCHITECTURE.md, CLAUDE.md, COMMANDS.md·SAFETY-PROFILES.md·review-step.md 경로를 편입 후 사실로 재정합(이 세션). 원천 레포의 origin 미푸시 1커밋(5a8bedb)은 원천 레포 사정으로 편입과 무관(스냅샷은 로컬 HEAD 기준) — 사용자 인지 항목.

## D-038 · 2026-07-20 · final-harness v0.20 승격 중단 — verified v0.17.3 동결·상류 공급선 휴면 (로드맵 S5·S6 불집행)

- **결정**: verified lock = **v0.17.3 유지·동결**한다. candidate `d4a0aeb`(final-harness plugin v0.20.0, `adapters/final-harness.lock.json`의 state=staged)는 **"검증됨·미승격"으로 봉인**한다 — S5(attended 파일럿)·S6(PROMOTE 이후 기능 확장)을 **불집행**한다. 상류 공급선(외부 final-harness repo·lock의 상류 좌표)은 **절단하지 않고 휴면**한다 — 보안 수정 등 필요가 생길 때만 재개하며, 재개 시 §16 승격 절차와 로드맵 S5~S6은 **그대로 유효**하다(supersede 아님 · 휴면일 뿐). lock 파일은 **무변경**한다(state=staged가 사실 그대로이며, 승격 진행 여부는 이 결정이 소유한다).
- **근거**: ① **사용자 판단(2026-07-20)** — v0.18 이후 상류 방향(실행 계약 중간층·무인 container/VM 필수화 등)이 프로젝트 모토 "가볍지만 강력하게" 대비 무게 증가다. ② **실전 실증 전부가 v0.17.3에서 성립** — Phase 2 무인 완주(verify 실패 0·채점 5/5), Phase 3·4 씨앗 결함 라이브 차단 각 3/3 + 정상 경로 배포·에스코트 완주가 모두 verified 버전에서 나왔다. v0.20은 입고 검사(S1~S4: release check·staging·독립 리뷰)만 통과했고 **파일럿(실전 루프) 0회**다. ③ **무인 관문은 자체 설계**(D-034 U-gate)라 상류의 무거운 무인 체계(container/VM 필수화)에 **비의존**이다 — 상류 승격이 무인 개방의 선결이 아니다.
- **대안·기각**: (b) **공급선 완전 절단**(외부 레포·상류 좌표 제거) — 외부 레포 방치 비용이 0이라 절단의 실익이 없고 비가역성만 추가하므로 기각. (c) **S5 파일럿 계속 진행** — 파일럿 비용 + 무거운 상류 방향 수용을 함께 지므로 사용자 기각.
- **영향**: 로드맵 S5·S6은 **불집행으로 종결**(역사 보존 — 로드맵 문서 무수정). S1~S4 산출물(증거 sha·독립 리뷰·disposable staging 결과)은 기록 보존되며, 훗날 공급선 재개 시에도 **§16 원칙(SHA가 다르면 evidence 상속 없이 전량 재실행)**이 적용되므로 재사용 여부는 그 시점 판단이다. staged candidate의 **매 호출 명시 `-Candidate` opt-in 요구는 불변**이다(오늘의 실행 경로는 verified v0.17.3). HANDOFF 다음 착수 후보에서 v0.20 파일럿 관련 항목을 내리고, vsp `transport list/get` read-only 실측은 **엔진 버전 무관 항목**(P4 계약이 출력 형상에 의존)으로 존치한다. `adapters/final-harness.lock.json` 무변경(state=staged는 사실 그대로 — run-track-a.ps1의 lock 변조 exit 67 게이트와 정합).

## D-039 · 2026-07-20 · 사용자 대기 항목 4건 정리 — 프로파일 동일 확정 · symlink/상류기여/원천처분 불추진

- **결정**: 장기 계류 중이던 "사용자 대기 항목"을 사용자 확정(2026-07-20)으로 종결한다.
  ① **SAP 프로파일 명** `IDEA-JNC`(주) · `IDES-DEV`(보조) = **같은 서버의 머신별 프로파일**로 확정한다(그간 SAFETY-PROFILES §⑦에 "추정" 병기 상태였던 것을 사실로 확정).
  ② **symlink 탈출 차단 3건 검증 = 불추진.** Windows 개발자 모드/관리자 셸 확보를 하지 않으며, lock의 `known_unverified`는 **열린 채 정직 유지**한다(검증됐다고 기록하지 않는다).
  ③ **상류(final-harness) 기여 2건 = 불추진.** raw execute 안내의 durable 제거(HANDOFF 대기 ③)와 `harness-docs` ADR 수명주기 결함(대기 ⑥) 모두 상류에 전달하지 않는다. `adapters/final-harness/UPSTREAM-DOCS-LIFECYCLE-GAP.md`는 **문서로 보존만** 한다.
  ④ **vsp 원천 레포 처분 = 하지 않음.** `D:\Claude for SAP\vsp-custom`을 현 위치에 무수정 보존하며 동결·삭제·git 이력 정리를 모두 하지 않는다.
- **근거**: ② 대상이 D-038로 봉인된 candidate(v0.20) 계열이라 검증의 실효 가치가 낮다 — 오늘의 실행 경로는 verified v0.17.3이다. ③ D-038이 상류 공급선을 **휴면**으로 둔 것과 정합한다: 받아먹지 않을 공급선에 기여만 하는 것은 비대칭이고, raw execute 재유입은 우리 쪽 차단(AGENTS.md 금지 + 래퍼 exit 64 deny)으로 이미 실효 봉쇄돼 있다. ④ 편입 트리(`vsp/`)의 비공개 정보 0건이 실측으로 확인돼 **하네스 레포 쪽 위험은 이미 0**이며, 원천 레포는 로컬 비공개 보관물이라 방치 비용이 0이다.
- **대안·기각**: ②의 "개발자 모드 켜고 3건 검증" — 봉인된 버전 대상이라 기각(재론 재료는 `test_install_engine.py:454/:466` · `test_run_contract.py:223`로 보존). ③의 "상류 PR/이슈 제출" — 공급선 휴면과 불정합이라 기각. ④의 "원천 레포 git 이력 재작성(filter-repo 등)으로 비공개 기록 제거" — 편입이 끝나 참조가 끊긴 로컬 보관물에 비가역 수술을 하는 비용이 이득을 넘어 기각.
- **정직 기록(유지되는 열린 사실)**: ⓐ symlink 탈출 차단 3건은 **미검증 상태 그대로**다. ⓑ 원천 vsp 레포의 **git 이력에 비공개 접속 식별 정보가 잔존**한다 — 그 레포를 외부 공유·푸시하는 시점에 ④는 자동으로 재론 대상이 된다. ⓒ 상류 `session-start-context.py`의 legacy phase 안내는 **계속 재유입**되며 운영상 무시로 대응한다.
- **영향**: HANDOFF "사용자 대기 항목" ②③⑥ 및 vsp 원천 처분 조항이 종결 표시된다. 잔여 사용자 판단은 상류 sc4sap public 드리프트(측정 시점마다 변동 — 2026-07-16 55건 → 2026-07-20 58건 실측)의 판정 방침 1건뿐이다. R-002·R-003·실데이터 2종 승인·무인 write 봉인은 무관·불변.

## D-040 · 2026-07-20 · 프로젝트 방향 확정 — 제품=interactive · 경량화 KPI 재정의 · 트랙 A ENGINE template-only · sc4sap 휴면형 미추종 (07-20 방향성 진단 검토 종결)

- **맥락**: 방향성 진단(`docs/reference/audits/2026-07-20-project-direction-assessment.md`, 커밋 `57757cc`)이 §12 질문 14건·§14 결정표 7행을 남겼다. 예정일(07-21)을 당겨 07-20 밤 보조 머신에서 검토를 수행했고, 결정 초안에 **Codex 교차 리뷰 1회**(read-only 독립 컨텍스트, verdict "수정 후 기록", BLOCKER 1·MAJOR 6·MINOR 1)를 받아 전 지적을 반영했다. 결정 재료 = 사용자 입력 3건: ⑴ 실전 과제 존재 — 주 머신 `D:\claude for SAP` 경로의 ZUNIWHT(원천세)·ZUNIVAT_MODI(공동 최우선)·ZUNIVAT_RAP(병행 가능) ⑵ 트랙 A ENGINE 판단 원문 — "SAP처럼 외부 시스템에다 개발하는 거엔 꼭 필요해 보이지 않는 게 커" ⑶ 경량화 고통의 정의 — sc4sap는 프로젝트마다 설치가 오래 걸리고 토큰 소모가 많아 전역 설치가 부담스러웠으나, 기능 자체는 발전시키고 싶은 모습이었다.
- **용어(이 항목 한정)**: **ENGINE** = 트랙 A의 final-harness 루프 실행기(D-038의 대상). **`engine/`** = 트랙 B MCP 서버의 TypeScript 소스(D-017의 대상). 서로 다른 물건이다.
- **결정 (진단 §14 결정표 7행 + ⑧)**:
  ① **제품 경계** = `interactive/` 단독이 설치 제품이다. `engine/`·`vsp/`·`scripts/`·`phases/`·`docs/`는 공방(개발 도구·소스 정본·증거·기록)이며 모노레포는 유지한다("차용 후 완전 소유"의 의도된 형태). 진단 §14의 "interactive-only vs monorepo"는 배포 단위와 저장소 단위를 혼동한 이분법으로 판정한다.
  ② **경량화 KPI** = 1순위 세션 토큰 비용 — **고정 시작 비용과 작업 1건 증분 비용을 분리 실측**(하네스·모델·프리셋 고정) · 2순위 설치 부담 — cold install/업데이트/프로젝트별 bootstrap의 시간과 수동 단계 수(Claude 안전훅은 전역이 아니라 프로젝트별 설치임을 반영) · 3순위 도구 노출 — 개수가 아니라 **tool-schema 토큰 실측**(개당 크기가 다르므로 개수는 proxy일 뿐). 레포 바이트는 주 KPI가 아니다(설치 원천이 로컬 모노레포인 동안 취득·업데이트 보조 지표로만 유지). **baseline·합격선이 생기기 전에는 "경량화 달성"을 선언하지 않는다** — 첫 실측 세션이 산출한다.
  ③ **첫 실전 워크플로** = ABAP/RAP 개발 루프 + FI·KR 상담 보조. 도그푸딩 = ZUNIWHT·ZUNIVAT_MODI 공동 최우선, ZUNIVAT_RAP 병행 가능(주 머신, Direct/Guided + 트랙 B MCP — ENGINE 불사용). 이로써 FI+KR은 "실전 검증 완료"가 아니라 **첫 실전 검증 대상을 확보**한 상태다.
  ④ **모듈 지원** = persona 유지 + 위임 실익 구간만 thin agent 신설. thin agent는 **P0/P1 한정**(교차 모듈 fan-out 2~3 상한·오프라인/읽기 조사·독립 리뷰), **P2 이상 금지**(실데이터 호출별 승인·subagent 금지 계약과 충돌 — AGENTS.md P2 조항). 상세 호출 계약(입력 캡슐·출력 스키마·토큰 예산·기존 sap-reviewer와의 역할 구분)은 구현 시 별도 확정한다. 검증 1순위 = FI + KR. 용어 정직화: persona를 "agent"라 부르지 않는다(진단 §11 P0 수용). **지식 provenance 기본값**: 출처·버전 메타데이터가 없는 모듈 지식은 `provenance=unknown`으로 취급하며 도그푸딩 성공만으로 정본 승격하지 않는다(94파일 일괄 보강은 이연).
  ⑤ **트랙 A ENGINE = template-only** — 계약·체크리스트·리뷰 스키마 자산은 보존하되 "실행 가능한 엔진" 표현을 제거하고, wrapper의 fail-closed(exit 65)를 **새 D-결정 전까지 기한 없는 지원 중단 상태**로 정의한다. 지원 소유자는 현재 없다. HANDOFF 07-20 재개점의 harness-worker 조달 질문(ㄱ 이식/ㄴ 전역 설치)은 보류한다. **재개 트리거 = 재검토 조건이지 자동 실행 권한이 아니다**: 반복 배치·bounded retry의 실수요가 확인되면 ㄱ/ㄴ 질문을 재개봉하되, 지원 재개 자체에 새 D-결정이 필요하다(배선 재료 = HANDOFF §5-14 조사·07-20 재개점). **제품 원칙 = attended-only**, unattended는 비약속 휴면 옵션이다(U-gate 조건은 안전조건으로 보존).
  ⑥ **vsp** = D-036/D-037 유지 재확인. 진단 §8.3의 외부 CLI/최소 추출 권고는 불채택 — 전일 사용자 확정을 번복할 새 근거가 진단에 없다. ENGINE 지원 중단 뒤에도 vsp는 Direct/Guided의 오프라인 검증·완료 증거(V-PASS) 백엔드로 소유 이유가 남는다.
  ⑦ **MCP source** = in-repo `engine/` 정본 추인(D-017 + 자체 수리 4.13.16으로 상류와 분기 — 외부 정본 복귀는 자체 수리 소실). 이중 번들 8MiB(engine/dist ↔ interactive/server 동일 sha256)는 소형 후속 후보로만 둔다.
  ⑧ **sc4sap 상류 = 휴면형 미추종** — 자동 동기화·정기 대조를 하지 않는다(지식 정본 = 본 레포). 드리프트 리포터(`interactive/scripts/report-sc4sap-public-drift.mjs`)는 보존하며, 필요가 생길 때만 개선분을 선별 이식하고 disposition을 기록한다. D-038의 final-harness 공급선 휴면과 동일 자세 — 이로써 원천 4개 전부 태도 통일(sc4sap 휴면형 미추종 · `engine/` in-repo 정본 · vsp in-repo 정본 · final-harness 휴면). HANDOFF 대기 ⑧(드리프트 58건 판정 방침) 종결 — transform 36건 대조 작업은 백로그에 올리지 않는다.
- **선행 결정과의 효력 관계 (Codex BLOCKER 반영)**: **D-025**의 Direct/Guided 라우팅과 P0~P4 안전 계약은 유지하되, Engine-P3/P4 지원 경로와 관련 후속 집행은 본 결정으로 **휴면**한다. **D-034**의 U-gate 조건은 재개 시 필요한 안전조건으로 **보존**하되, U-gate 배선·운영 개방의 현재 우선순위는 본 결정이 supersede한다. **D-038**의 verified v0.17.3 동결·candidate 봉인·공급선 휴면 사실은 유지하되, "오늘의 실행 경로는 verified v0.17.3"이 지원되는 ENGINE 실행 경로의 존재를 뜻한다는 효력은 supersede한다 — v0.17.3은 **재개 시 기준 버전**이다. D-017·D-030·D-036·D-037·D-039와는 충돌 없음(Codex 교차 확인).
- **근거**: ⑤는 "구조적 불가능"이 아니라 **현재 수요 대비 비용**이다 — SAP가 외부 시스템이라는 사실 자체가 자율 루프를 부적합하게 만들지는 않으며, 과거 Phase 2~4가 제한 범위에서 효용을 실증했다(Phase 2 무인 완주·Phase 3/4 씨앗 결함 라이브 차단 — D-038 근거 ②). 다만 현 과제 구성(맞춤 단건 개발)엔 반복 배치·bounded retry의 실수요가 확인되지 않았고, 실행 경로 복구·유지 비용(워커 계약 조달·래퍼 배선·E2E 3종·관측 보강)이 예상 한계효용을 넘는다. 완전 unattended는 P2 호출별 승인·P4 사람 전용 게이트 때문에 적용 범위가 원래 좁다. ②는 사용자 고통의 직접 정의를 채택했다. ⑧은 "기능 자체는 내가 발전시키고 싶은 모습"(사용자) — 정본은 본 레포이며, 상류를 정기 대조하는 비용을 제거하되 리포터 보존으로 문은 닫지 않는다.
- **대안·기각**: (a) 진단 §13.2의 15개 thin agent 전면 전환 — 단일 모듈 상담은 persona가 대화 연속성(후속 질문 왕복)에서 우위라 기각. (b) ENGINE 즉시 배선(ㄱ 이식, §5-14 기준 1~2세션) — 배선 지식이 신선한 지금이 가장 싸다는 반론은 인정하나, 수요 없는 배선은 후속 메타작업을 불러 진단 §11 P2 위험(검증 증거가 제품 코드보다 빠르게 성장)의 재생산이라 기각. (c) vsp 재분리/최소 추출 — D-036 기각 사유 유효. (d) 레포 분할(제품 레포 별도) — 프로비넌스 게이트 재설계 비용 대비 실익 없음. (e) sc4sap 선별 이식 즉시 착수 — 도그푸딩보다 먼저 할 백로그를 늘려 기각(리포터 보존으로 재개 가능). (f) sc4sap 현상 유지(방침 없음) — 측정 때마다 "판정 대기 N건"이 쌓여 보이는 상태의 지속이라 기각.
- **정직 기록**: ⓐ HANDOFF 07-20 상단의 "§5-5 fetch 스크립트 2종 = 미이식 깨진 표면"은 **사실 오류였다** — 두 파일은 `interactive/tools/fetch/`에 이식·실동작 검증 완료 상태다(MIGRATION-MANIFEST 5-5, Codex 리뷰가 검출·본 세션 실측 확인). 남는 것은 상류 delta의 disposition뿐이며 ⑧에 흡수된다(HANDOFF 정정 동반). ⓑ 경량화 KPI의 baseline·합격선은 아직 없다 — 첫 실측 전 "달성" 선언 금지. ⓒ 로컬 검사와 SAP 서버 검증의 권위 경계는 기존 계약 재확인이다: 완료 도장은 exact-subject R-PASS + vsp 기계 증거 V-PASS이며 서버측 CheckSyntax·활성화·ATC 권위는 불변.
- **영향**: HANDOFF 재개점 갱신(harness-worker 질문 보류 표시 · fetch 사실 오류 정정 · 새 착수 = 주 머신 도그푸딩 + 보조 머신 경량화 실측). 진단 문서는 무수정 보존(audit = 역사 기록, §14 표의 정본 답 = 본 결정). ENGINE 표현 수리·persona 용어 정직화는 후속 문서 작업. **불변 재확인**: unattended=sealed(제품 원칙 attended-only) · R-002 · R-003 · 실데이터 2종 호출별 승인 · R-PASS+V-PASS 완료 계약 — 유지.

## D-041 · 2026-07-21 · 제품명 개편 Phase 1 집행 — 플러그인 `sapkit` · 마켓플레이스 `agentic-sap` · GitHub 조직 이전 (DESIGN §8-5 일부 supersede)

- **맥락**: D-040 ①로 제품 경계가 `interactive/` 단독으로 확정되면서 `sap-agentic-harness`는 옛 정체성(하네스) 이름이 됐다. `interactive/DESIGN.md` §8-5가 Phase 1 확정안(플러그인·마켓플레이스·레포명 = `sapkit`)과 Phase 2 보류(`.sc4sap/`·`~/.sah/`·`SC4SAP_*`)를 남겼고, 본 세션에서 Phase 1을 집행했다. 집행 중 사용자 요구가 추가됐다 — **배포 계획이 있으므로 개인 계정이 아니라 조직 소유로 전환**한다.
- **결정**:
  ① **플러그인 이름 = `sapkit`.** 스킬 접두어(`/sapkit:*`)와 MCP 도구 네임스페이스(`mcp__plugin_sapkit_sap__*`)에 매 호출 등장하므로 짧게 유지한다 — 이름 길이가 도구 수(155~186)만큼 곱해져 세션 고정 토큰이 되며, 이는 D-040 ② KPI 3순위(tool-schema 토큰)에 직접 잡히는 항목이다.
  ② **마켓플레이스 이름 = `agentic-sap`** — §8-5의 "마켓플레이스명 = sapkit"을 **supersede**한다. 설치 명령이 `플러그인@마켓` 형태라 동명이면 §8-5가 문제로 지목한 `이름@이름` 중복이 그대로 남는다(`sapkit@sapkit`). 마켓 이름을 조직명과 맞춰 `sapkit@agentic-sap`으로 해소했다.
  ③ **GitHub 조직 `agentic-sap` 신설 + 레포 이전.** `hjaewon/sap-agentic-harness` → 개명(`sapkit`) → 조직 전송 = `agentic-sap/sapkit`. 옛 경로 2종 모두 301 리다이렉트 실측. 로컬 remote 갱신 완료.
  ④ **`owner`(마켓, 표시 전용) = `AgenticSAP` / `author`(플러그인) = `hjaewon`으로 분리.** 종전에는 정본의 `author` 하나가 양쪽에 복사돼 조직/개인을 구분할 수 없었다. `plugin-metadata.json`에 `marketplace` 블록을 신설하고 생성기를 그에 맞게 고쳤다.
  ⑤ **`renames` 배선** — `marketplace.json` 최상위에 `{"sap-agentic-harness": "sapkit"}`. 기존 설치가 세션 시작 시 자동 이관되며(Claude Code v2.1.193+, `enabledPlugins`·`pluginConfigs` 자동 재작성) **append-only**로 영구 보존한다(다음 개명 시 기존 항목 수정 금지 — 연쇄 추적).
  ⑥ **하드코딩 네임스페이스 2곳을 정본 파생으로 수리** — `gen-permissions.mjs`(권한 템플릿 생성)와 `smoke-mcp.mjs`(실데이터 2종 부정 단언). 후자는 안전 관련이다: 구 접두어를 그대로 뒀다면 **존재할 수 없는 문자열을 검사하게 되어 부정 단언이 조용히 공허해졌다**.
  ⑦ **로컬 폴더명·서버 npm 패키지명·`server/VERSION`은 미변경** 유지.
- **근거**: ②는 §8-5가 스스로 제기한 "설치 명령 중복" 문제를 §8-5의 해법(전부 동명)이 해소하지 못한다는 발견에 따른 정정이다 — 조직 도입으로 중복 없는 선택지가 생겼다. ④는 배포 시 브랜드(조직)와 저작자(개인)가 갈리는 통상 형태이며, `owner`는 문서상 **순수 표시 메타데이터**(기능·신뢰·해석에 영향 0)라 자유롭게 정할 수 있다. ⑦은 **기능 이득 0에 파손 위험만 있는 항목**들이다: 로컬 폴더명은 `.codex/hooks.json` 절대경로 3곳과 3사 README 설치 경로가 물려 있고, `server/package.json`은 npm devdeps 이름이라 플러그인 정체성이 아니며 lockfile 재생성을 부르고, `server/VERSION`은 `verify-engine`이 파싱하는 줄이다.
- **대안·기각**: (a) **마켓 이름도 `sapkit`**(§8-5 원안) — 중복이 남아 기각. (b) **조직명 `sapkit`** — GitHub 계정이 이미 선점됐고, 설사 가능해도 `sapkit@sapkit`으로 되돌아가 기각. (c) **조직명에 `agenticsap`(붙임)** — `agentic`과 `sap`이 시각적으로 안 갈린다는 사용자 지적으로 하이픈안 채택. (d) **`ag4sap`류 약자** — `ag`가 본 레포에서 이미 Antigravity를 가리켜(어댑터 3사) 혼동 위험으로 기각. (e) **레포를 개인 계정에 유지** — 배포 계획이 확인돼 기각(단 마켓 이름과 GitHub 경로는 독립이라 기술적으로는 가능했다). (f) **로컬 폴더까지 rename** — ⑦ 근거로 기각.
- **정직 기록**: ⓐ **마켓플레이스 `name` 변경에는 이관 경로가 없다** — `renames`는 플러그인 이름 전용이고 마켓 이름 개명의 마이그레이션 수단은 문서에 없다. 따라서 기존 로컬 등록(`source: directory`, 마켓명 `sap-agentic-harness`)은 **수동 재등록**이 필요하며, 이 결정으로 마켓 이름은 사실상 되돌리기 비싼 값이 됐다. ⓑ **MCP 도구 접두어가 플러그인 이름에서 오는지 마켓 이름에서 오는지 공식 문서에 명시가 없다** — 개명 전에는 두 값이 동일해 관측으로 구분할 수 없었다. 이제 값이 갈렸으므로 **재설치 시 실측으로 확정**된다(그 전까지 `mcp__plugin_sapkit_sap__*`는 예상값이다). ⓒ **Codex·Antigravity는 재설치·재실측하지 않았다** — 두 어댑터 README의 캐시/임포트 경로(`cache/agentic-sap/sapkit/`, `~/.gemini/config/plugins/sapkit/`)는 개명에서 파생한 **예상 경로**이며 실측 문구가 아니다. ⓓ `doctor` FAIL 1건(agy 설치 1.1.1 ≠ 핀 1.1.4)은 **개명과 무관한 선행 환경 드리프트**다(주 머신 CLI가 보조 머신 검증 시점보다 낮음 — agy 버전 핀은 본 세션에서 건드리지 않았다). ⓔ Phase 2(`.sc4sap/`·`~/.sah/`·`SC4SAP_*`)는 §8-5대로 **보류 유지** — 서버 번들이 `.sc4sap`을 읽어 엔진 소스 수정 + 재번들 + 이식 스냅샷 재생성이 걸리는 중수술이다. ⓕ `interactive/server/VERSION`·`engine/UPSTREAM-FIX-HANDOFF.md`·`adapters/final-harness.lock.json` 등에 남은 구 레포명은 **역사 서술 또는 리다이렉트로 유효한 URL**이며 의도적 미변경이다.
- **영향**: 게이트 전량 재실행 결과 — 코어 6종(snapshot·links 599/깨짐 0·verify-engine 4.13.16·engine-provenance·smoke-mcp·manifests --check) exit 0, 음성시험 2종 **16/16 · 17/17**, PS 3종 **23/16/17** 전부 PASS. 이식 스냅샷은 선례(`7664faf5`)대로 재생성했고 **diff 22/22가 전부 목적지 sha256 필드**이며 pin `a95eb0f`·public roots 36·inventory 487·private 열거 0은 불변이다. `doctor`만 위 ⓓ로 FAIL 1. **재설치 필요**: 로컬 마켓 재등록 + 3사 재설치는 후속 작업이며, 그 시점에 ⓑ가 확정되고 ⓒ가 해소된다. HANDOFF 재개점·`interactive/DESIGN.md` §8-5·`DESIGN.md` 원격 좌표 갱신 동반. **불변**: unattended=sealed · RV4 열림 · verified v0.17.3 동결 · 실데이터 2종 호출별 승인 · R-PASS+V-PASS 완료 계약 — 전부 무관·유지.

## D-042 · 2026-07-21 · D-041 독립 리뷰 수리 — 권한 템플릿 회귀 복구 · 계약 게이트 2종 신설 · D-041 정직 기록 정정

- **맥락**: D-041 커밋(`2684223`) 직후 프로젝트 품질 모델대로 **새-컨텍스트 read-only 독립 리뷰**를 붙였고 verdict **NEEDS-FIX**(BLOCKER 0 · MAJOR 4 · MINOR 5)를 받았다. 리뷰어는 게이트를 독립 재실행하고 스냅샷 diff·append-only 여부·세 이름의 배치를 직접 재구성했다. DECISIONS는 append-only이므로 D-041 본문은 수정하지 않고 본 항목이 정정·보완한다.
- **결정·수리**:
  ① **권한 템플릿 회귀 복구 (MAJOR-1 — 리뷰의 최대 수확)**. D-041에서 `gen-permissions.mjs`를 그대로 돌린 것이 **inspection-only 기동**이라 `189 → 158`로 줄며 **프로그램/화면 계열 write 31종**(CreateProgram·CreateInclude·CreateScreen·CreateTextElement 등)을 잃었다 — 과거 수리 `9727dc7`의 무고지 되돌림이고, 그 위험을 적어두었던 `_comment` 경고 줄까지 덮어썼다. 수리 = **개명 직전 189건을 오프라인 네임스페이스 치환으로 복원** + 경고 문구 복원. 방향이 fail-safe(허용 감소 → 프롬프트 증가)라 보안 사고는 아니나 주력 절차 `create-program`의 실사용 회귀였다.
  ② **축소 거부 가드 신설**(`gen-permissions.mjs`) — 기존 템플릿보다 도구가 적게 생성되면 **거부(exit 1)**하고 `--force`를 요구한다. 음성시험 실측: `184 → 153` 거부·파일 무변경.
  ③ **부정 단언 교차검사 신설**(`smoke-mcp.mjs`). D-041 ⑥의 "정본 파생으로 차단" 주장은 **과장이었다** — 파생값 `NS`가 `--update` 기록 경로에서만 쓰이고 실제 단언(`checkAdapterDeny`)은 고정 스냅샷을 그대로 신뢰했다. 이제 스냅샷의 `must_not_mention` 접두어를 코드 정본 `NS`와 대조해 어긋나면 실패시킨다(기존 `classes` 교차검사와 동일 원리). 음성시험: 낡은 접두어 주입 → exit 1.
  ④ **리뷰어 차단 계약 게이트 신설 (MAJOR-2)**. `agents/sap-reviewer.md`의 `disallowedTools` 84종은 손으로 유지되는데 **어떤 게이트도 보지 않았고 실패 방향이 fail-open**이다 — 접두어가 낡으면 차단이 전부 죽은 문자열이 되어 리뷰어가 Create/Update/Delete/Activate/**ReleaseTransport**를 되찾는다(AGENTS "reviewers perform no transport operation" 저촉). 권한 템플릿 오류가 프롬프트만 늘리는 것과 **비대칭**이다. 이제 접두어 일치 + 핵심 차단 5종 생존을 assert한다. 음성시험 2종(접두어 변조·ReleaseTransport 삭제) 각각 exit 1.
  ⑤ **`displayName` = `SAPKit`** (구 `SAP Agentic Harness`) — Codex·Antigravity UI의 사람이 읽는 이름이며 D-041 ⑦ "미변경" 목록에 없어 누락이었다.
  ⑥ **doctor Codex 오탐 수리** — `codex plugin list`는 등록 마켓의 플러그인을 **미설치까지 전부** 열거하므로 이름 substring만 보면 항상 "설치됨"이 된다. 실측(`sapkit@agentic-sap  not installed`)에서 OK로 보고하던 것을 줄 단위 미설치 표기 확인으로 교정 — 현재 정확히 "미설치"로 보고한다(Codex엔 실제로 미설치).
- **D-041 정직 기록 정정 (MAJOR-4)**: D-041 ⓐ·커밋 메시지의 **"재설치 미수행"은 그 뒤 무효가 됐다** — 같은 날 사용자 지시로 재설치를 실행했다. 그 과정에서 두 가지가 **실증**됐다: ⓐ **마켓 이름은 자동 이관되지 않아 수동 재등록이 실제로 필요했다**(문서상 "이관 경로 없음"의 실물 확인) ⓑ **플러그인 이름은 `renames`가 자동 이관했다** — 매니페스트 재생성만으로 Claude Code가 `enabledPlugins` 키를 스스로 고쳐 썼다. 또한 Claude 캐시가 `cache/<마켓>/<플러그인>/<버전>` 구조임을 실측했다(D-041 ⓒ가 Codex 경로를 "예상값"으로 둔 근거가 한 단계 보강됨 — 단 Codex 자체는 여전히 미실측). **D-041 ⓑ(MCP 접두어의 출처)는 여전히 열려 있다** — 재설치는 했으나 현 세션은 개명 전에 해석돼 옛 접두어를 노출하므로 **세션 재시작 후에 판정**된다.
- **대안·기각**: (a) **connected 상태에서 권한 템플릿 재생성**(근본 수리) — SAP 접속(P1)과 프로파일 활성이 필요해 오프라인 세션에서 불가. 오프라인 치환으로 **검증된 과거 상태를 정확히 복원**하는 편이 새 증거 없이 새 값을 만드는 것보다 안전하므로 채택하고, 근본 수리는 SAP 접속 작업으로 이연. (b) **MAJOR-2를 기록만 하고 게이트는 안 만듦**(리뷰어 권고의 최소안) — 유일한 fail-open 표면이고 대상이 transport 경계라 기록만으로는 불충분해 기각. (c) **Codex 고아 설정 즉시 정리** — 사용자 판단으로 보류(무해·Codex 재설치 시 일괄 정리).
- **정직 기록**: ⓐ **근본 결함 미해소** — `gen-permissions.mjs`는 여전히 inspection-only로 기동한다(구 HANDOFF 결함 (b)). ②의 가드는 **사고를 막을 뿐 결함을 고치지 않는다**. ⓑ `~/.codex/config.toml`에 개명 전 마켓·플러그인 항목이 **고아로 잔존**한다(`enabled=false`라 무해). Codex/Antigravity에는 `renames` 등가물이 없어 이 부류의 고아는 **구조적**이다. ⓒ 리뷰어는 PowerShell 3종(23/16/17)을 **실행하지 않았다**(Track A 무접촉 판단) — 그 수치는 작업자 실측만 있다. ⓓ `doctor` FAIL 1(agy 1.1.1 ≠ 핀 1.1.4)은 개명과 무관한 선행 환경 드리프트로 **리뷰어가 독립 확인**했다(compatibility.json diff가 `install:` 문자열 2줄뿐임을 대조). ⓔ 프로젝트 `.claude/settings.local.json`의 기존 allow 목록은 **구 네임스페이스라 재설치 후 매칭되지 않는다** — 접두어 확정 후 189건 템플릿 병합 필요.
- **영향**: 게이트 재실행 전량 통과(코어 6종 + 음성시험 2종) · 이식 스냅샷 재생성(diff **6/6 전부 목적지 sha256**, `sc4sap-public-source.json` 무변경, pin·roots 36·inventory 487 불변) · `doctor`만 ⓓ로 FAIL 1. 신설 게이트 2종은 **음성시험을 동반**한다(통과만 하는 게이트를 만들지 않는다는 §9 원칙). D-041의 결정 ①~⑦은 **전부 유효**하며 본 항목은 그 집행 품질과 기록 정확성만 정정한다. **불변**: unattended=sealed · RV4 열림 · 실데이터 2종 호출별 승인 · R-PASS+V-PASS — 무관·유지.

## D-043 · 2026-07-21 · 실데이터 접근 모델 전환(소유자 머신) — 호출별 승인 → 서버 바닥선(blocklist) · 배포 기본값은 잠금 유지

- **맥락**: ZUNIWHT 도그푸딩 준비 중 소유자가 두 가지를 요구했다 — ⑴ Codex도 Claude와 동일 작동(실데이터 2종 하드 차단 거부: "최소한 코덱스까지는 무조건 되야지") ⑵ 호출별 승인 자체를 원치 않음("읽는 게 뭔 승인이야"). 검토에서 서버 내장 테이블 blocklist(`engine/src/lib/policy/tableBlocklist.ts` — deny: 계좌·거래처/고객 마스터 PII·주소·인증정보·급여·세금ID / ask: BSEG·BKPF·ACDOCA 등 전표류, 기본 프로파일 standard)가 **하네스와 무관하게 서버 프로세스 안에서 집행되는 바닥선**임을 확인했다. Codex의 도구별 승인 fail-open(0.144.1 실측, adapters/codex/README.md)은 재확인 — 승인 층으로 신뢰 불가.
- **결정**:
  ① **소유자 머신 = 서버 바닥선 모델.** 실데이터 2종의 "묻는 층"(Claude 승인창 allowlist 제외 효과 · 훅 ask · Codex `disabled_tools`)을 소유자 머신에서 제거·비적용하고, 보호 책임을 서버 blocklist 단일층으로 이관한다. 3사(Claude/Codex/AG) 동일 작동이 이것으로 달성된다.
  ② **Codex `disabled_tools` = 이 머신에 원래부터 부재였음을 실측 추인** (`codex mcp get sap --json` → `disabled_tools: null`). 결함(§8-4 필수 미적용)이 아니라 의도된 상태로 재해석한다. README의 "실 SAP 사용 전 필수"는 배포 권장으로 존치.
  ③ **배포 기본값 = 잠금 유지.** permissions-template의 2종 제외 · README 하드차단 권장 · 훅 동작 · compatibility.json p2 서술은 전부 불변. 여는 쪽이 옵트인이다(향후 "프로파일 개방 선언" 정식 기능화는 백로그).
  ④ **원천세 작업 테이블은 프로파일 예외 등록으로 통과** — LFA1·LFB1(deny층)·BSEG·BKPF(ask층)는 ZUNIWHT 프로파일 sap.env에 `MCP_ALLOW_TABLE=LFA1,LFB1,BSEG,BKPF`(사용자가 도그푸딩 중 직접 작성, 3사 공통 적용·stderr 감사로그 동반). WITH_ITEM·T059* 등 원천세 핵심 테이블은 목록에 없어 원래 자유 통과.
- **대안·기각**: (a) **서버 OS 승인창 브로커**(호출 시 서버가 대화상자를 띄워 사람 승인) — 소유자가 승인 자체를 원치 않아 소유자 머신용으로는 기각. 배포용 P2 지원 기능 후보로만 백로그 보존. (b) **Codex 0.144.6 승인 재실측 후 승인 모드 복원** — 같은 이유로 목적 자체가 소멸해 기각. (c) **`MCP_BLOCKLIST_PROFILE=off` 전면 개방** — 비밀번호 해시(USR02)·급여(PA*)·주민번호류는 원천세 업무에 불필요하고 바닥선 유지 비용이 0이라 기각.
- **정직 기록**: ⓐ 서버 blocklist는 표준 테이블 명단이라 **고객 Z-테이블의 민감 데이터는 모른다** — 필요 시 `MCP_BLOCKLIST_EXTEND`로 사용자가 직접 등록한다. ⓑ ask층의 acknowledged 플래그는 AI 자기신고 + stderr 감사로그이지 **하드 게이트가 아니다**. ⓒ 개방된 테이블의 행 데이터는 그대로 AI 벤더 서버(Anthropic/OpenAI/Google)로 전송된다 — 반출 의미를 고지했고 소유자가 인지 후 결정했다. ⓓ Claude 쪽 "묻는 층" 해제는 아직 실행 전이다 — ZUNIWHT 프로젝트에서 첫 호출 시 사용자가 "항상 허용"을 누르거나 설정에 2종을 추가하는 시점에 완성된다.
- **영향**: HANDOFF §8-4 재정의(배포 기본값 원칙으로 한정) · HANDOFF 상단 재개점에 본 모델 반영 · AGENTS.md P2 조항에 소유자 머신 예외 부기. 실기계 변경 0건(Codex는 이미 열려 있었고 Claude는 사용자 실행 대기). **불변**: unattended=sealed · R-002 · R-003 · 트랜스포트/쓰기 게이트 · 리뷰어 차단 84종 — 전부 무관·유지.

## D-044 · 2026-07-21 · 제품 구성 변경 — vsp를 sapkit의 선택적 로컬 검증기로 동봉(②) · 릴리스 자산 배포 · MCP 병합(③) 기각

- **맥락**: 배포 제품(sapkit) 관점에서 로컬 검증기가 빠져 있었다 — 설치자는 지식+번들 MCP만 받고 "SAP에 던지기 전 로컬에서 잡는" 루프의 반쪽(vsp `lint`/`parse` 오프라인 검증)이 없었다. vsp는 이 스택의 유일한 오프라인 ABAP 검증기이며 D-030/D-037로 이미 레포 내 `vsp/`에 소스 정본이 편입돼 있으나(바이너리 비커밋), 그 바이너리를 설치자에게 전달하는 경로가 없었다. 형태 세 갈래 — ①(배선만·사용자 직접 다운로드) ②(동봉 = 릴리스 자산 자동 다운로드, ① 포함) ③(vsp를 제품 MCP 서버로 병합) — 중 사용자 확정(2026-07-21 "2로 가자").
- **결정**:
  ① **형태 ② 채택** — vsp를 sapkit의 **선택적 로컬 검증기**로 동봉한다. 설치 스크립트가 릴리스 자산을 다운로드하는 방식이며 형태 ①(배선만)을 포함한다. 선택 사항이므로 미설치 상태에서도 하네스는 정상 동작하고, 있으면 SAP 반영 전 오프라인 lint/parse를 붙인다.
  ② **형태 ③(MCP 병합) 기각** — vsp를 제품 MCP 서버로 편입하는 안은 기존 번들 MCP 서버 155도구와 파서·검증 표면이 정면 중복이라 기각한다. vsp는 CLI 검증기로 남고, MCP 서버는 SAP 실행 표면을 소유한다.
  ③ **배포 = GitHub 릴리스 자산** — D-037 "바이너리 비커밋"과 정합하게 git이 아니라 릴리스 자산으로 배포한다. 태그 `vsp-v2.38.1-94-g5a8bedb`(코드 태그와 구분되는 `vsp-` 접두어) @ `agentic-sap/sapkit`, 자산 7개(플랫폼 6 + SHA256SUMS.txt), latest는 미표시(--latest=false 지정했으나 유일 릴리스라 GitHub API상 latest로 해석됨, 기능 영향 0 — 설치는 태그 핀 고정).
  ④ **플랫폼별 sha256 정본 = 핀 파일** `interactive/provenance/vsp-release.lock.json`(신설) — version · source(repo·commit `3e3f7235`·path `vsp/`) · release(tag·asset_url_pattern) · install_dir `~/.sc4sap/bin` · 플랫폼 6종 sha256 실측. 설치 = `interactive/scripts/get-vsp.mjs`(OS/arch 감지 → 핀 URL 다운로드 → **sha256 일치 시에만** `~/.sc4sap/bin/` 설치, 불일치 = 임시파일 삭제 + exit 1 · idempotent), 음성시험 `test-get-vsp.mjs` 21어서션 동반.
  ⑤ **법적 근거 = MIT** — `vsp/LICENSE` + README 포크 고지(upstream `oisee/vibing-steampunk`)를 유지하고, 릴리스 노트에도 MIT 포크 고지를 병기한다.
- **집행 실측 (2026-07-21, 주 머신)**: 6플랫폼(win/darwin/linux × amd64/arm64) 재현 빌드(go1.26.4 · CGO 0 · `-trimpath` · `-buildvcs=false` · 고정 BuildDate) 동일 명령 2회 → sha256 6/6 동일 확증 · 버전 표기 `-X main.Version=v2.38.1-94-g5a8bedb+sapkit.3e3f7235`(07-20 vsp 수리를 정직 병기) · 릴리스 생성은 사용자 직접(gh CLI 이 머신 신규 설치 winget v2.96.0·인증 hjaewon) · E2E = 실다운로드 설치 sha 핀 일치·`--version` 일치·재실행 no-op · 배선 = `core/procedures/troubleshooting.md` §7 신설 + create-program·create-object 각 1줄 + 3사 어댑터 README.
- **대안·기각**: (a) **형태 ①만**(배선만·사용자가 직접 빌드/다운로드) — 설치 부담을 사용자에게 전가해 "동봉 제품" 취지에 미달, 기각(②가 ①을 포함하므로 손실 없음). (b) **형태 ③(MCP 병합)** — 위 결정 ②의 155도구 표면 중복으로 기각. (c) **바이너리 git 커밋** — D-037이 이미 기각(18MB×6 · 재현 빌드로 불요), 릴리스 자산으로 대체.
- **정직 기록**: ⓐ **vsp 파서 커버리지(구문 91종·린트 8룰)의 실전 실효는 미실측** — ZUNIWHT 도그푸딩이 관찰 자리다(troubleshooting §7에도 미실측으로 정직 표기). ⓑ **릴리스 자산 방식이라 완전 오프라인 설치는 불가** — 최초 1회 다운로드가 필요하다(설치 후에는 오프라인 검증). ⓒ **`adapters/vsp/vsp.lock.json`의 sha(`1fe843c8…`, 07-19 스냅샷 기준)와 릴리스 sha 불일치는 예상된 사실** — 릴리스 정본은 새 핀 파일 `vsp-release.lock.json`이고, 구 lock은 D-037의 빌드·명령 계약 정본으로 존속한다(두 파일의 역할이 다르다). ⓓ Codex·Antigravity 어댑터의 get-vsp 안내는 문서 배선이며 각사 재설치·재실측은 별도다.
- **영향**: 신설 = `interactive/provenance/vsp-release.lock.json` · `interactive/scripts/get-vsp.mjs` · `interactive/scripts/test-get-vsp.mjs`. 수정 = `core/procedures/troubleshooting.md`(§7) · `create-program.md` · `create-object.md` · 3사 어댑터 README. `interactive/` 파일 추가라 이식 스냅샷 재생성 필요. HANDOFF 재개점의 vsp 동봉 블록 완료 전환 · `interactive/DESIGN.md` §3 제품 구성 갱신 동반. **불변**: unattended=sealed · R-002 · R-003 · 실데이터 2종 호출별 승인(소유자 머신은 D-043 서버 바닥선) · R-PASS+V-PASS 완료 계약 · D-037 vsp in-repo 정본 — 전부 무관·유지.

## D-045 · 2026-07-22 · 백로그 5-15 보류 해제 — `/sapkit:setup` 대화형 설치 마법사 즉시 신설 (12번째 스킬 · 17번째 절차)

- **맥락**: 원본 sc4sap의 `/setup`(12단계 마법사)·`/sap-doctor` 대화형 온보딩이 이식 때 transform으로 해체돼(MIGRATION-MANIFEST 40~42행) 내용은 보존됐으나(troubleshooting 12문서 흡수·README 3벌·install 스크립트) "한 명령이 순서대로 물어보며 세팅해주는" 경험은 소실됐다. 5-15 등재(07-22 오전) 시점엔 "ZUNIWHT 도그푸딩 후 설계"로 보류했다.
- **결정**: ① **보류 해제·당일 집행** — 같은 날 소유자 실수요 발화 2회("원본은 setup으로 설치했는데 없나" · "배포용으론 너무 불편") = 실수요 트리거 충족 + JNC 설치가 첫 실전 검증장으로 즉시 가용(설치 자체가 도그푸딩이 됨). ② **방식 = 기존 11스킬 패턴** — `core/procedures/setup.md`(정본) + `skills/setup/SKILL.md`(래퍼), 신규 코드 0(기존 install-hooks.mjs·get-vsp.mjs·gen-plugin-manifests.mjs 재사용). `skills/`는 `.claude-plugin`·`.codex-plugin` 공유라 3사 자동 노출. ③ **비밀번호 = 뼈대 전용**(사용자 확정) — 마법사는 비밀을 묻지도 출력하지도 않는다(R-005), SAP_PASSWORD 빈칸 생성 + 직접 기입 안내. ④ **권한 병합 = 추가-전용 명문**(D-042 교훈 — 개수 보고·축소 시 중단·되돌림).
- **대안·기각**: (a) **도그푸딩 후 설계**(당초 5-15 원안) — 트리거가 이미 충족돼 대기 이득이 소멸했고, JNC 설치를 수동으로 하면 첫 실전 검증 기회도 소실, 기각. (b) **원커맨드 스크립트(setup.mjs)** — config.json 내용(SAP 버전·모듈·국가)이 문답 대상이라 비대화형으로는 원본 경험 재현 불가, 기각.
- **집행 실측 (2026-07-22, 주 머신)**: 설계 정본 = `docs/reference/designs/2026-07-22-sapkit-setup-skill.md`(2ade2a9). 신설 2파일 + 배선(매니페스트 5종 재생성 — 스킬 12·절차 17 자동 계수 · 루트 CLAUDE.md 헤드라인 · 어댑터 README 3벌 병기[권한·훅 자동은 Claude 전용 정직 표기·Codex "래퍼 11개"→12 동반 수리] · 스냅샷 재생성 roots 36·inventory 487 불변). 게이트 6종 green · check-links 612링크 깨짐 0. **새-컨텍스트 독립 리뷰 PASS(BLOCKER/MAJOR/MINOR 0 · INFO 3)** — 리뷰어가 계수·재핀·게이트를 독립 재현, INFO-1(캐시 미포함 시 안내형 강등 문구 미승계)은 당일 수리. 부수 재핀: 040cdd1(engine package-lock 버전 필드 동기화)이 provenance 게이트 ENGINE_SOURCE_PATHS에 걸림 → 재번들 실측(번들 바이트 불변 fa5698d351c7…) 후 VERSION·integrity sourceCommit 재핀(4877f36).
- **정직 유보**: ⓐ **JNC 실전 설치 E2E 미수행** — 5-15의 완료 판정은 그 후. ⓑ **배포 캐시에 adapters/·scripts/ 포함 여부는 로컬 Directory 마켓에서만 실측** — GitHub 마켓 설치본·Codex/AG 캐시는 미실측이며, 미포함 시 해당 단계는 안내형 강등(절차문에 명문). ⓒ Codex/AG에서의 스킬 실행은 미실측(3사 노출은 매니페스트 구조상 자동이나 실연결 검증은 각사 재설치 때).
- **영향**: 신설 = `interactive/core/procedures/setup.md` · `interactive/skills/setup/SKILL.md` · 설계 문서. 수정 = 매니페스트 5종(생성기) · 루트 CLAUDE.md · 어댑터 README 3벌 · migration-map.json(재생성) · interactive/server/VERSION·integrity.json(재핀). **불변**: 실데이터 2종 템플릿 제외(호출별 승인 유지) · MIGRATION-MANIFEST 분류 · interactive/DESIGN.md · unattended=sealed — 전부 무관·유지.

## D-046 · 2026-07-23 · setup 도그푸딩 발견 수리 — 프로필 홈 정본 = 코드 기본값(`SC4SAP_HOME_DIR || ~/.sc4sap`) · 훅 표기 5→3 정정 · `SAP_USERNAME` 정합

- **맥락**: `/sapkit:setup` 0.2.0 첫 실전 재실행(기존 프로젝트, 07-23)이 결함 6건을 노출. 최대는 프로필 홈 — 문서 7파일(setup.md·troubleshooting.md·install-sap-assets.md·project-context.md·credential-handling.md·adapters/claude/README.md·tier-readonly-guard 힌트)이 `~/.sah/profiles/`를 기본값처럼 표기했으나, 코드 리졸버 3곳(`engine/src/lib/profile.ts` · `adapters/claude/hooks/tier-readonly-guard.mjs` · `adapters/claude/lib/profile-resolve.mjs`)의 실제 기본값은 `SC4SAP_HOME_DIR || ~/.sc4sap`. `~/.sah`는 소유자 머신의 env var 값일 뿐이다. env var 미설정 신규 사용자는 마법사를 따를수록 코드가 안 읽는 곳에 프로필을 쓰고, tier 가드 fail-closed(쓰기 전면 차단)에 도달한다 — 마법사가 완주될수록 더 망가지는 구조.
- **결정**: ① **문서를 코드에 정렬**한다(코드를 문서에 정렬하는 개명이 아님) — 제품 트리(`interactive/`)에서 `.sah` 전면 제거, `$SC4SAP_HOME_DIR` 우선 + `~/.sc4sap` 기본으로 통일. tier-readonly-guard의 힌트 문자열 자기모순(58행 `.sah` vs 63행 `.sc4sap`)은 문자열만 수리(로직 무접촉). ② **훅 표기 정정 5→3** — install-hooks.mjs HOOKS 배열 실물 기준(block-forbidden-tables · tier-readonly-guard · prefer-sqlquery-explicit-fields). transport-validator(PreToolUse 자문형)·syntax-checker(PostToolUseFailure — 설치기가 다루지 않는 이벤트)는 동봉-미등록으로 명문, **등록 여부는 별도 결정으로 이연**. ③ **bare `SAP_USER`는 죽은 키** — 엔진 소스·번들 어디서도 읽지 않음(번들 grep = `SAP_USERNAME` 21회뿐), 문서 3곳(setup.md 키 목록 · project-context.md "exact list" · transport-client-rule.md `env()` 의사코드) `SAP_USERNAME`으로 정정. ④ 부수 3건 명문 — 재실행 분기(있으면 검증·없으면 생성) · 죽은 배선 감지(Step 3 죽은 네임스페이스 계수 + Step 6 훅 스크립트 경로 실재 검사) · troubleshooting §3 curl 프로브의 R-005 대체(MCP 도구 검증, 예: odata는 GetTextElement).
- **대안·기각**: (a) **코드를 `.sah`로 개명** — interactive/DESIGN.md Phase 2(보류)의 중수술(엔진 수정+재번들+스냅샷 재생성)이고 기능 이득 0, 기각(Phase 2 보류 그대로 유지 — 이 수리는 기능 버그 제거라 분리 가능). (b) **미등록 훅 2종 즉시 등록** — syntax-checker는 설치기에 PostToolUseFailure 지원 신설이 필요한 코드 변경이라 문서 수리 범위를 넘음, 이연.
- **집행 실측 (2026-07-23, 주 머신)**: 편집 = 서브에이전트 3(sonnet, 파일 분할) + 메인(README 잔재·P5). migration-map 목적지 재핀 2회(16+8건 — 전부 sha256만, 파일 수 11/21/18/6/16 불변). 게이트 6종 green(snapshot·links 612/0·engine-provenance·smoke-mcp·verify-engine·manifests). **새-컨텍스트 독립 리뷰 PASS(BLOCKER/MAJOR/MINOR 0 · INFO 2)** — 리뷰어가 리졸버 3곳·계수·재핀 토큰을 독립 재현, INFO-2(`SAP_USER`)는 당일 P5로 승격 수리, INFO-1(재실행 문단이 Step 0 본문과 분산 서술)은 문체 응집성이라 유보. doctor FAIL 1 = agy 1.1.1 ≠ 핀 1.1.4 — 선행 머신 드리프트(D-041 때부터 관측), 이번 변경 무관.
- **정직 유보**: ⓐ **신규 사용자 경로(env var 미설정 머신) E2E 미재검증** — JNC 설치가 검증장(D-045 ⓐ와 동일 창구). ⓑ 훅 2종 등록 여부 = 열린 결정. ⓒ INFO-1 문체 응집성 미수리(정확성 무영향).
- **영향**: 수정 = core 문서 6(setup·troubleshooting·install-sap-assets·project-context·credential-handling·transport-client-rule) + adapters 2(claude/README.md · tier-readonly-guard 문자열) + migration-map.json(재핀). **불변** = 코드 로직 전부 · 엔진 · 번들 · MIGRATION-MANIFEST 분류 · 실데이터 2종 템플릿 제외 · unattended=sealed.

## D-047 · 2026-07-23 · 개발방법론 최신화 — aegis v0.20 대화형 방법론(엔진 제외)을 sapkit에 보완 흡수 · 도그푸딩에 선행

- **맥락**: 트랙 B는 sc4sap 이식으로 지식·페르소나·절차와 함께 **개발방법론까지 sc4sap 세대의 것**을 승계했다(create-program 파이프라인 등). 상위 DESIGN.md §2의 원목표(계획→실행→검증→실패학습 루프 · LESSONS→RULES 축적)는 final-harness 계열이 담당할 예정이었으나 D-040 ENGINE template-only로 통로가 동면하며 방법론 최신화가 표류했다. 사용자 확인(07-23): "sc4sap 개발방법론 대신 최신화된 개발방법론을 만들고 싶었다 — 꼭 대체가 아니라 보완이라도, 엔진을 버린 만큼 다른 부분은 흡수됐으면 했다." 원천 실사: `D:\claude-practice\claude-fable-final`(aegis v0.20, "한 루프 세 강도") — Direct(`skills/direct`, 67줄)·Guided(`skills/loop`)·라우터(`skills/using-aegis`)·Memory(`skills/lesson`)가 순수 마크다운 절차 스킬로 존재하며 보증 등급은 절차적+감사가능(기계 강제는 Engine 전용). Direct 스킬·Guided 강화는 해당 레포에서 외부 독립 리뷰 게이트 통과·도그푸딩 완료 상태(README `9b23601` 참조).
- **결정**: ① **보완 흡수** — sc4sap 유산(소크라테스 인터뷰·스펙 승인 게이트·페르소나·도메인 지식)은 유지하고, sapkit에 없는 방법론 조각 6종을 흡수한다: ⑴ 강도 선택(같은 루프의 최경량 강도 원칙 — 소수정에 풀 파이프라인을 강제하지 않음) ⑵ run-scoped 증거+중단재개 ⑶ bounded 수정→재검증(최대 2회) ⑷ execution_owner(main/delegated) ⑸ LESSONS→RULES 환류(§2 목표 2의 미집행분) ⑹ 보증 등급 명문(절차적/감사가능 라벨). ② **형태 = 패턴 주입** — 기존 12스킬 명시 호출 모델을 유지하고 절차 본문에 조각을 녹인다(라우터 스킬 통이식 아님). ③ **순서 = 흡수 → ZUNIWHT 도그푸딩**(사용자 선택 — 도그푸딩이 새 방법론의 시험장이 되도록). ④ **공급선 구분**: 이 차용은 D-038이 동결한 ENGINE 공급선(verified v0.17.3)과 별개의 새 차용이다 — v0.20 절차 텍스트 차용은 ENGINE 재개가 아니며 D-040 template-only·D-018 소스 비혼합과 충돌하지 않는다(절차 텍스트만, 엔진 코드 무접촉).
- **대안·기각**: (a) **도그푸딩 먼저, 마찰 로그로 흡수 우선순위 결정**(직전 세션 권고) — 옛 방법론을 시험하는 셈이 되어 사용자 원목적과 어긋남, 기각(사용자 선택). (b) **핵심 조각(run 증거·bounded 2회)만 최소 이식 후 도그푸딩** — 동상, 기각(전체 흡수 선택). (c) **A안: using-aegis 라우터 포함 통이식** — 명시 호출 모델과 라우팅 이중화 + 세션 토큰 증가(D-040 무게 척도 저촉), 기각. (d) **ENGINE 재개** — 실수요 트리거 미충족, D-040 유지.
- **정직 유보 / 후속**: 설계·집행 미착수 — run 경로(`.sc4sap/runs/` 후보)·LESSONS/RULES 파일 위치·절차별 적용 범위·provenance 기록 방식(이식 스냅샷 게이트는 sc4sap-custom 전용이라 별도 방식 필요)·버전 범프는 설계 문서에서 확정한다. 흡수 후 완료 판정은 기존 계약(게이트 전종 green + 새-컨텍스트 독립 리뷰 + 버전 범프)대로.
- **영향**: 예정 수정 = `interactive/core/procedures/*`(주입) · `interactive/DESIGN.md`(설계 변경 시) · HANDOFF.md. **불변** = ENGINE template-only(D-040) · verified v0.17.3 동결(D-038) · unattended=sealed · 실데이터 게이트 · MIGRATION-MANIFEST 분류.

## D-048 · 2026-07-23 · D-047 집행 — aegis v0.21.0 방법론 흡수 완료 (v0.3.0 · 스킬 14 · 절차 19)

- **맥락**: D-047(보완 흡수·도그푸딩 선행) 집행. 설계 초안 v1 → Codex 독립 리뷰(`gpt-5.6-sol`+`reasoning=max`, read-only, verdict "수정 후 기록" — BLOCKER 0·MAJOR 9·MINOR 3) → 전건 반영 v2 확정(`047e9f1`). 핵심 정정: 원천 스냅샷 = **aegis v0.21.0 @ `33f61df`**(v0.20은 방법론 계보명) · 갭 재측정(최소 경로 = "부분 존재 — 포인터만 있고 절차·발견 표면 없음" · bounded 리뷰 = 현행이 aegis Guided와 이미 동일[초기 1+수리 ≤2=iteration ≤3] — "3 vs 2"는 단위 혼동의 거짓 선택지) · 강도 축(Minimal/Standard/Full)은 Track A 라우팅·P0~P4와 **직교** 명문.
- **집행 (설계 §3-6·§6)**: 신설 5 = `core/policies/development-loop.md`(강도 축·execution_owner·보증 매트릭스) · `core/procedures/modify-object.md`(Minimal 절차 — 이름은 Track A Direct 충돌 회피) · `core/procedures/lesson.md`(LESSONS→RULES, Triage 제외·기계 매칭 강등) · 스킬 래퍼 2. 주입 = create-program 6 hunk(인트로 완화·modify-object 안내·RULES CONSULT·Phase 4 execution_owner[P2 main-only·P4 비위임·control artifact main 전용·비밀 미전달]·lesson 제안 2) · create-object 4(안내·RULES·재진입 규칙·위임 참조) · approval-gates **Gate B 분리**(배포 기본 호출별 승인 vs 소유자 D-043 서버 바닥선 — 양층 모두 subagent/batch 금지 불변, 기존 D-043 문서 불정합의 뒤늦은 해소) · project-context(RULES/LESSONS 등록·로컬 전용) · plugin-metadata(0.2.1→**0.3.0**·single-agent 문구 조정) · 루트 CLAUDE.md 계수 · interactive/DESIGN.md §3-2/3-3 · codex README 12→14 · antigravity README 샘플 계수 11→14(선행 stale의 편승 수리).
- **집행 실측**: 메인 = 오케스트레이션 전용(사용자 지시), 편집 = 에이전트 3기(opus 1·sonnet 2, 파일 비중첩) + 후속 2건. 매니페스트 5종 재생성(자동 계수 14/19) · 스냅샷 재핀(절차 21→23·정책 18→19, pin·roots 36·inventory 487 불변). 게이트 6종 green · doctor OK4/FAIL1(기지 agy 1.1.1≠1.1.4, 무관) · 음성시험 smoke-mcp **16/16**(메인 실측)·snapshot **17/17**(최종 리뷰어 실측; 메인 완주 1회는 16/17 — 원인 = 재핀 후 1줄 편집이 기준선을 깬 순서 위반, 재핀으로 해소). fresh-context behavioral smoke **5/5 PASS**(발견 가능성·참조 체인·모순 검사). **최종 diff 새-컨텍스트 독립 리뷰 PASS**(MINOR 1 = antigravity 샘플 계수, 당일 수리 · INFO 3).
- **교훈 2건**: ⑴ **스냅샷 재핀은 언제나 마지막 편집 뒤** — 재핀 후 1줄이라도 편집하면 음성시험 기준선(무변조 통과)이 깨진다(이번 실측). ⑵ 이 머신 bash 경유 음성시험 러너는 spawn 수거 블록이 재현된다(07-21 완주는 예외였음) — **PowerShell 경유로 완주 가능**.
- **D-047 정정 부기 (append-only 원칙)**: D-047 맥락문의 "Direct·Guided … 보증 등급은 절차적+감사가능"은 원천 등급표보다 반 단계 높았다 — 원천 README는 **Direct = 절차적만**, Guided = 절차적+감사가능. 정본은 development-loop.md의 기능별 매트릭스다(강도 선택·RULES consult·Minimal = 절차적 / Full 상태·리뷰 파일 = 감사 가능 / 훅·blocklist·리뷰어 차단 = 해당 어댑터/서버 한정 기계 강제).
- **정직 유보**: ⓐ 실전 실효 미실측 — ZUNIWHT 도그푸딩이 관찰 자리(modify-object 발견·사용률, RULES CONSULT 실사용률, execution_owner 3사 격차). ⓑ 토큰 전후 실측 미수행 — 이 머신 plugin update+재시작 후 측정(D-040 합격선 전 "달성" 선언 금지). ⓒ INFO-1: create-object의 SearchObject 충돌 메시지가 raw `Update*` 안내로 잔존(스코프 밖 기존 텍스트) — 후속 정합 후보. ⓓ Codex/AG 실연결 검증 미실측(D-045 ⓒ 동일 유보). ⓔ 리뷰 후 코드 수정 재리뷰/reviewed-source 해시 결합은 백로그(설계 §3-5 — 도그푸딩 관찰 후 결정).
- **영향**: 신설 5파일 + 수정 = create-program·create-object·approval-gates·project-context·plugin-metadata·루트 CLAUDE.md·interactive/DESIGN.md·README 2벌·매니페스트 5종(재생성)·migration-map(재핀)·HANDOFF. **불변** = 엔진·번들·vsp·MIGRATION-MANIFEST 분류·실데이터 게이트(Gate B 분리는 D-043 기결정의 문서 정합)·unattended=sealed·ENGINE template-only.

## D-049 · 2026-07-26 · R-002 축소(온라인 MCP 한정) + vsp `--offline` 13종 분석기를 트랙 B에 훅 자동 배선

- **맥락**: 사용자 요청 "vsp의 정확한 기능을 직접 딥하게 파악하고 진짜 쓸모가 있는지 확인"의 실사 결과. **실측 3건**: ⑴ 절차가 지시하던 `vsp lint --file`(CLI)은 **6종 스타일 규칙만** 등록(`cmd/vsp/cli_extra.go:533`) — 하드코딩 자격증명·`SELECT *`·루프 내 `COMMIT WORK`·`CATCH cx_root`·동적 호출 TRY 누락이 든 probe 파일을 **"No issues found" exit 0**으로 통과시킴. ⑵ `vsp parse --file`은 문법 검증기가 아니라 토크나이저 수준 — 비ABAP 쓰레기 입력을 Move 문으로 분류하고 exit 0(period 누락도 미검출). ⑶ MCP 모드의 `AnalyzeABAPCode`는 **13종 규칙**(`pkg/adt/codeanalysis.go` allRules — security 2·performance 2·robustness 2·quality 7)을 돌리며 같은 probe에서 **10건 검출**(high 3: hardcoded_credentials ×2·commit_in_loop). 이 도구는 `--offline` 플래그로 **SAP 무접속·ADT 무접촉** 기동이 가능하고, `cmd/vsp/main.go:96`이 명시적으로 "for abapGit-based offline ABAP development" 용도로 문서화(로컬 도구 4종: ListStandards·GetStandard·CheckBoundaries·AnalyzeABAPCode). 즉 vsp 편입 논거 3종(D-030·HANDOFF) 중 ①Engine 백엔드는 D-040으로 휴면, ③V-PASS는 실행 배선 부재(문서만), **②오프라인 검증만 실체가 있는데 절차가 잘못된 경로(CLI 6종)를 보고 있었다**.
- **결정**: ① **R-002 축소** — "vsp MCP 서버 모드 금지"를 "**온라인(SAP 접속) MCP 서버 모드 금지**"로 좁힌다. 원 근거(같은 ADT에 MCP 2개 공존 → 도구 중복·권한 이원화, DESIGN §3)는 `--offline`에 성립하지 않음: ADT 무접촉이라 중복 대상 자체가 없고, SAP 권한을 요구하지 않아 이원화가 불가. ② **트랙 B 자동 배선** — Claude 어댑터 PostToolUse 훅(`offline-code-analysis.mjs`) 신설: ⓐ `Edit|Write`로 쓴 `.abap` 파일 ⓑ MCP 소스 쓰기 도구(`source_code` 인자)의 소스를 `vsp --offline` AnalyzeABAPCode로 검사해 findings를 additionalContext로 모델에 피드백. **경고 전용·차단 아님** — 13종 어느 것도 SAP 실행 불가를 뜻하지 않는다(사용자 기준: "SAP에서 안 도는 것만 차단"). vsp 미설치 시 침묵 통과(선택적 의존성 불변). ③ 훅당 vsp 프로세스 1회 기동(stdio JSON-RPC) — 상시 서버 아님.
- **대안·기각**: (a) **CLI `lint` 훅** — 실측상 실질 결함 검출 0(6종 스타일뿐), 기각. (b) **차단형 훅** — 사용자 기준(실행 가능하면 경고) 위배 + 오탐 시 작업 정지, 기각. (c) **vsp `--offline`을 플러그인 MCP 서버로 상시 등록** — 도구 표면 +4·smoke-mcp 계약 변경·세션 토큰 증가(D-040 무게 척도) 대비 훅 1회 기동으로 충분, 기각(후속 후보로만 보존). (d) **R-002 전면 폐지** — 온라인 모드 금지 근거(ADT 중복)는 여전히 유효, 기각.
- **정직 유보**: ⓐ 오프라인 **문법** 검증은 여전히 부재(실측 ⑵) — 서버 `CheckSyntax`가 유일 권위이며 V-PASS 완료 계약 불변. ⓑ 훅은 Claude 어댑터 한정(Codex/AG 미배선 — execution_owner 3사 격차와 동일 계열). ⓒ 13종의 실전 적중률 미측정(도그푸딩 관찰 대상). ⓓ syntax-checker.mjs는 깨진 import(`hooks/lib/stdin.mjs` 부재)의 미배선 파일로 확인 — 본 결정 스코프 밖, 후속 정리 후보.
- **영향**: `.harness/RULES.md` R-002 문구 · `DESIGN.md` §3 주의문 · `adapters/vsp/SAFETY-PROFILES.md` R-002 항 · 신설 `interactive/adapters/claude/hooks/offline-code-analysis.mjs` + `install-hooks.mjs` 4번째 훅 등록(PostToolUse 지원 확장) · `troubleshooting.md` §7(CLI/MCP 규칙 격차 명시) · `create-program.md`·`create-object.md` 사전검사 지시 교체 · 버전 0.3.4→**0.3.5** · 매니페스트 재생성 · 스냅샷 재핀. **불변** = R-003·실데이터 게이트·write_profile_gate·ENGINE template-only(D-040)·V-PASS 완료 계약·vsp CLI = 트랙 A verify 백엔드(D-001).

## D-050 · 2026-07-26 · referenceLibraries — 개인 노하우 볼트를 컨설턴트 참조 슬롯으로 (슬롯만 배포·내용물 로컬)

- **맥락**: 사용자 구상 — "그 회사 IMG가 아니더라도, 개개인이 가진 실서버 best-practice 자료(예: `D:/Claude for SAP/JNC/e2e-ontology` — Wiki 93문서 실측)를 컨설턴트 페르소나가 참조하면 답 품질이 오르는 구조". 기존 구조가 이미 **옵션 캐시 패턴**이다: 페르소나 참조 규약(spro-lookup·customization-lookup)이 `.sc4sap/spro-config.json`·`.sc4sap/customizations/`를 "있으면 최우선·없으면 침묵 폴백"으로 소비한다(소비층 배선 완료, 생성기 2종은 MIGRATION-MANIFEST deferred(L6+) — 이 결정과 별개의 백로그). 신설 슬롯은 이 패턴의 세 번째 자리다.
- **결정**: ① `.sc4sap/config.json`에 **옵션 필드 `referenceLibraries`** `[{name, path, note}]` 신설 — 로컬 지식 볼트(md 디렉터리) 등록. ② **ask-consultant에 참조 단계** 추가: 등록돼 있으면 질문 키워드로 파일명·grep 매칭해 **볼트당 최대 2~3문서만** 읽고(전량 로드 금지 — D-040 토큰 무게 척도), 답변에 출처(`{name}/{file}`)를 표기. 부재·불일치 시 침묵 폴백. ③ setup Step 2에 선택 등록 안내 1줄. ④ **배포 원칙 = 슬롯만 배포** — 볼트 내용은 어떤 산출물·커밋에도 미포함(연결 프로필과 동일 원칙: 슬롯은 배포, 값은 로컬).
- **대안·기각**: (a) **qmd(세컨드브레인) 연동** — 하네스 중립 위반(qmd는 사용자 개인 전역 설정) + 플러그인이 특정 개인 도구에 의존, 기각(사용자도 "qmd 말고" 명시). (b) **볼트 내용 번들** — 개인·고객 자료라 배포 불가, 기각. (c) **전 절차 배선(create-program 계획 단계 등)** — 무게 대비 실효 미검증, ask-consultant 한정 후 도그푸딩 관찰로 유보.
- **정직 유보**: ⓐ 검색은 파일명+grep 수준(시맨틱 검색 아님 — 볼트가 크면 매칭 품질 한계). ⓑ 실전 실효 미측정(도그푸딩 관찰 대상). ⓒ 생성기 2종(extract-spro·extract-customizations) deferred는 이 결정이 해소하지 않음 — HANDOFF 백로그 승격으로 가시화만.
- **영향**: `project-context.md`(스키마) · `ask-consultant.md`(참조 단계) · `setup.md` Step 2 · 버전 0.3.5→**0.3.6** · 매니페스트·스냅샷 재핀. **불변** = 번들 지식 177·페르소나 26·실데이터 게이트·R-004(동결 레포)·privacy 원칙(로컬 경로는 커밋 안 됨 — config.json은 프로젝트 로컬 파일).

## D-051 · 2026-07-27 · execution_owner 실행체 배선 — 위임 워커 1기(sap-worker) + Phase 3.5 소유권 프롬프트 (v0.4.0)

- **맥락**: 사용자 관찰 "개발이 계속 메인 세션에서만 돈다"의 실사 결과 — **정책만 있고 실행체·선택 UX가 없었다**. D-047/D-048이 흡수한 `execution_owner`(auto|main|delegated)는 `core/policies/development-loop.md`에 경계(P2 main 전용·P4 비위임·컨트롤 아티팩트 메인 전용·자기 리뷰 금지·비밀 미전달)까지 완비돼 있고 절차 3종이 이를 참조하는데, ⑴ `agents/`에 워커가 없고(리뷰어 1기뿐) ⑵ 소유권을 묻는 자리가 없고(`execution_mode`는 Phase 3.5에 [1][2][3] 메뉴가 있는데 owner는 "결정된 값을 기록하라"만 있었다) ⑶ 어댑터 3사에 디스패치 안내 0건(L1 이식 계약이 중립성 때문에 `Agent(...)` 문법을 제거 — `docs/research/L1-transform-contract.md`) ⑷ `.sc4sap/config.json`에 선호 슬롯 없음. 결과: 정책의 폴백 조항("환경이 워커를 지원하지 않으면 auto→main")이 **상시** 발동. 뿌리는 DESIGN §2 — 이식 때 페르소나 26을 서브에이전트에서 문서로 변환하고 8역할 파이프라인을 폐기하며 "진짜 잃는 것"으로 적어둔 셋(모델 라우팅·병렬 속도·**대형 작업의 컨텍스트 분리**) 중 셋째가 방치된 자리다. `core/personas/sap-executor.md`의 `source: sc4sap-custom/agents/sap-executor.md`가 그 흔적. 배포 문구(marketplace_long·claude_long)는 이미 "implementation may be delegated to a single fresh worker"라고 약속하고 있었다 — 기록-실물 불일치.
- **결정**: ① **워커 1기 신설** `interactive/agents/sap-worker.md` — 받는 것(계약·슬라이스·규칙·이송 id)·못 하는 것·반환 형식(압축 결과)의 정본. ② **기계 차단은 정책이 위임 불가로 못 박은 두 축만** — `disallowedTools` 4줄(`GetTableContents`·`GetSqlQuery` = P2 / `CreateTransport`·`ReleaseTransport` = P4). 나머지 write 도구는 **가진 채** 위임한다(P3 구현이 워커의 일 — 리뷰어와 정반대 설계이며, 목록을 넓히면 워커가 일을 못하고 좁히면 development-loop의 P2/P4 조항이 문서에만 남는다). ③ **선택 UX** = create-program Phase 3.5 **Step 1b** 소유권 프롬프트(`[1] main` / `[2] delegated`, 기본 `main`, 답하면 `selection_source: explicit`) + create-object는 규모가 클 때 1회 질문. modify-object(Minimal)는 무질문 `main` 유지 — auto의 정의상 소규모·국소 작업은 메인이 맞다. ④ **게이트** — smoke-mcp의 리뷰어 차단 계약 검사를 `checkAgentDeny()`로 일반화해 워커에 적용(부재·목록 소실·네임스페이스 노후 3방향), 음성시험 **16→20건**. 실물 파일 변조 없이 시험하려 `SC4SAP_AGENTS_DIR` 오버라이드 신설. ⑤ 어댑터 3사 "구현 위임" 절 신설 — 집행 강도 격차를 정직 병기(Claude = 기계 차단 / Codex = P2만 `disabled_tools` / AG = P2조차 미작동 실측(2026-07-19)이라 실데이터 불요 슬라이스로 한정 권고).
- **대안·기각**: (a) **선택 UX만 추가하고 에이전트 미신설**(하네스 중립 극대화) — 위임 시 P2/P4 차단이 3사 모두 절차 규범으로만 남아 위임이 정책 경계를 실제로 약화시킨다, 기각. (b) **8역할 파이프라인 부활** — DESIGN §2의 폐기 근거(품질 모델 단순화·세션 토큰 무게) 불변, 기각. 되돌리는 것은 "메인이 배정하는 워커 1기"뿐이고 품질 모델(1작업+1리뷰+기계검증)은 무변경. (c) **`.sc4sap/config.json`에 세션 선호 필드 신설** — 매 런 보이는 프롬프트로 충분하고 필드가 늘면 setup 대화가 길어진다, 기각(재요청 시 재검토). (d) **워커에 중첩 스폰(Task/Agent) 기계 차단 추가** — 도구명 미실측이라 죽은 문자열이 될 위험(리뷰어 fail-open 교훈과 동종), 절차 규범으로 유지.
- **정직 유보**: ⓐ **위임된 P3 write가 권한 프롬프트를 메인 UI로 올려 attended(D-025)를 유지하는지 라이브 미확인** — 훅·권한 층은 호출자와 무관하게 부모 프로세스에서 돌므로 유지될 것으로 보이나 단정하지 않는다. 그래서 Phase 3.5 기본값 = `main`이고, Claude README E2E 체크리스트에 종결 조건을 1줄 등재했다(HANDOFF 활성 백로그 ⑤). ⓑ 위임의 실제 토큰 절감 미측정 — ZUNIWTH 도그푸딩이 관찰 자리. ⓒ Codex/AG 위임 경로 실연결 미실측(D-048 ⓓ와 동일 계열). ⓓ 컨트롤 아티팩트·자기 리뷰·중첩 워커 금지는 기계 집행 없음(절차) — development-loop 보증 등급표에 명문화했다. ⓔ 이 변경 자체는 새-컨텍스트 독립 리뷰 미수행(사용자 판단 대기).
- **영향**: 신설 `interactive/agents/sap-worker.md` · 수정 = `scripts/smoke-mcp.mjs`·`scripts/test-smoke-mcp.mjs`(20건)·`core/procedures/create-program.md`(Step 1b·state.json 스키마 `execution_owner` 필수화)·`core/procedures/create-object.md`·`core/policies/development-loop.md`(폴백 절 어댑터 격차·보증 등급표)·어댑터 3사 README·`interactive/DESIGN.md`(§4-2 구조도·§3 항목 7)·`plugin-metadata.json` 0.3.9→**0.4.0**·매니페스트 5종 재생성·이식 스냅샷 재핀(목적지 해시 7줄, pin·roots 36·inventory 487 불변). **불변** = 품질 모델·리뷰어 독립성·실데이터 게이트(P2 main 전용은 오히려 기계 강화)·unattended=sealed·ENGINE template-only(D-040)·번들/엔진/vsp 무접촉·MIGRATION-MANIFEST 분류.

## D-052 · 2026-07-31 · knowledge 절차 — lesson의 대칭짝(몰랐던 사실 누적) + 인터뷰 계열 읽기 배선 (v0.4.1)

- **맥락**: 사용자 요구 — "프로젝트가 **몰라서 채운** 도메인(업무 도메인 + 이 솔루션 자체의 도메인)을 프로젝트 자체에 누적하고 싶다. 이미 아는 것은 누적 대상 아니고, 나중에 딴 데서 활용하는 건 제품 사용자가 알아서 할 일." 실사 결과 세 가지가 확인됐다. ⑴ **`lesson`을 참조하는 절차는 `create-program` 한 본뿐**이다(RULES 읽기 1 + 쓰기 제안 2 = 3건). 나머지 **19본은 0건** — 특히 사실이 실제로 확정되는 `deep-interview`·`ask-consultant`·`analyze-symptom`이 전부 0이다. ⑵ `deep-interview`에는 기록·누적 언급이 **0건**이고, 산출물 `.sc4sap/deep-interviews/`는 그 절차의 **출력**이지만 **자동으로 읽는 downstream 소비자가 레포 전체에 0건**이라 실질은 일회성 인계물이다. `create-program` Phase 1A 차원 4(회사 고유 업무 규칙)·차원 5(참조 자산)가 정확히 "몰라서 채우는" 자리인데 채운 결과가 남지 않는다 — 같은 시스템 두 번째 인터뷰가 첫 번째와 같은 비용을 낸다. ⑶ 반면 **본보기는 이미 레포 안에 있다**: `analyze-cbo-obj` → `.sc4sap/cbo/<MOD>/<PKG>/` → `create-program`이 읽음. 쌓고-읽는 왕복이 CBO 재고에만 있고 도메인 지식엔 없다. 더해 `lesson.md`는 실패 전용인데 그 경계가 글로 없어, "실패가 아니라 그냥 몰랐던 사실"의 목적지가 부재했다.
- **결정**: ① **절차 신설** `core/procedures/knowledge.md` + 스킬 `skills/knowledge/` — `lesson`의 대칭짝. 산출 = `.sc4sap/knowledge/domain.md`(**KD-id** · 이 프로그램보다 오래 사는 업무 사실) · `system.md`(**KS-id** · 특정 시스템 한정). ② **접두는 파일당 1개 고정 + 제품 네임스페이스와 분리** — 인용 규약이 맨몸(`KD-007`)이라 접두가 겹치면 모든 인용이 모호해지고 **사후 탐지가 불가능**하다(외부 프로젝트 ZUNIVAT_RAP 실측: 한 파일 안에서 `S-001`이 두 뜻으로 쓰였다). 초안은 `D-`/`S-`였으나 **이 제품이 이미 `D-0xx`를 결정 ID로 쓰고 배포 코어 16파일에 `D-025`·`D-043`·`D-050` 등이 노출된다** — 초안 예시 `D-007`이 실재 결정번호와 정면 충돌했다(교차검토 지적, 실측 확인). `KD`/`KS`는 미사용이라 이를 회피한다. 다만 접두 분리는 **같은 파일 안의 번호 중복**(동시 발급·수동 편집)은 막지 못하므로, 발급 전 기존 id를 읽도록 명시했다. ③ **불변식 4** — 근거 없는 문장은 원자로 기록 거부(**id 없는 `## Pending` 절로 격리**하고 인용 금지) · **정정은 삭제 아님**(무엇이 틀렸나/왜 그래 보였나/무엇이 뒤집었나 3줄, 가운데가 비면 미완) · 주장 범위 ≤ 증거 범위 · **실데이터 원값 저장 금지(MANDATORY)** — 범주는 `policies/data-protection/`이 다루는 전부(가격·급여·인사 포함, 열거는 예시일 뿐)이며 **조회 승인은 영구 저장 승인이 아니다**. `.sc4sap/`가 git-ignored라는 사실은 낭독·붙여넣기·복사를 막지 못한다. ④ **읽기는 인터뷰 계열 2곳만 자동** — `deep-interview` 첫 질문 전 · `create-program` Phase 1A 프리플라이트(industry/country 옆). 소비 규칙 셋: id 있는 `KD-`는 확정 문맥이라 재질문 금지 · **`KS-`는 `scope:`(profile/SID/client)가 현재 런과 일치할 때만** 확정(프로필 전환으로 시스템이 바뀌므로) · **`## Pending`은 질문 대상**. 사용자 반박 시 **`KD-` 업무 규칙은 사용자가 이기고 `KS-` 시스템 사실은 검증 후 정정**(사람 기억보다 DDIC/MCP가 강할 수 있다) — 어느 쪽도 침묵 덮어쓰기는 없다. ⑤ **쓰기는 4곳에서 제안만** — `deep-interview` 종료 · **`create-program` Phase 1B 종료**(사실이 확정되는 자리이고, Phase 8은 hard gate가 Phase 6으로 되돌릴 수 있으며 구현 중단 시 유실된다) · `ask-consultant` 답변 후 · `analyze-symptom` 가설 **확정 후**. 제안 전 **두 파일 bounded grep으로 중복 확인**(쓰기 전용 2절차는 지식 파일을 읽지 않으므로 이게 없으면 기록된 사실을 다시 묻는다). 새로 확정된 게 없거나 이미 기록됐으면 프롬프트를 내지 않는다. ⑥ **경계는 사건이 아니라 기록 단위** — `lesson.md`에 1문단 신설: 한 사건이 두 기록을 낳을 수 있고(상태 `C`의 실제 의미 = knowledge / 그걸 Closed로 가정해 누락한 배치 = lesson) 서로를 대체하지 않는다. 실패 없이 알게 된 **일반 SAP 사실**은 셋 중 어디도 아니며 배포 지식 갱신 후보로만 남긴다.
- **대안·기각**: (a) **볼트 수확·역반영 경로**(프로젝트 지식을 외부 볼트/세컨드브레인으로 올려보내기) — 사용자가 "재활용은 제품 사용자가 알아서"로 범위 밖을 명시, 기각. 읽기 슬롯은 D-050 `referenceLibraries`가 이미 갖고 있어 필요한 사용자는 자기 볼트를 등록하면 된다. (b) **`.sc4sap/config.json` 경로 override 슬롯**(팀 공유용 커밋 경로) — 업무 지식이 실데이터를 끌어당기므로 **기본이 git-ignored인 편이 안전**하고, 공유 경로로 옮기는 것은 제품 사용자 판단이다. 필드가 늘면 setup 대화가 길어진다(D-051 (c)와 동종), 기각 — 실수요 발생 시 재검토. (c) **도메인 판단 절차 전부 자동 읽기** — 매 런 고정 토큰이 붙는다(D-040 무게 척도 = 세션 토큰). 재질문 비용이 실제로 발생하는 곳은 인터뷰 계열뿐이라 거기만, 기각. (d) **`lesson` 확장(성공·실패 겸용)** — 5단계는 FAIL/CAUSE/VERIFY 축인데 "몰랐던 사실"에는 FAIL도 CAUSE도 없다. 겸용하면 VERIFY 게이트가 무의미해지고 RULES 승격 경로가 흐려진다, 기각. (e) **파일 스코프 접두**(`CBO-S-002` 꼴) — 기존 인용 전량을 무효화한다. 파일당 고유 접두가 같은 목적을 인용 비용 0으로 달성, 기각.
- **정직 유보**: ⓐ **실효 미측정** — "같은 시스템 두 번째 인터뷰가 더 짧다"는 이 결정의 근거이지 실측이 아니다. 도그푸딩(ZUNIWTH·ZUNIVAT 계열) 관찰 대상. ⓑ **기계 집행 0** — 접두 충돌·근거 누락·실데이터 혼입·역링크 편도는 전부 절차 규범이며 `lesson`과 동급 보증이다. 결정론적인 것(ID 충돌·깨진 역링크)은 스크립트로 뺄 후보로만 남긴다. ⓒ **쓰기 제안의 발동률 미검증** — 이 배선은 "제안하라"는 **문서 지시**이고, 같은 양식의 `lesson` 쓰기 제안이 `create-program`에 **이미 2건 존재하는데 실제로 발동해 왔는지에 대한 증거가 없다**(초안은 이를 "lesson 호출 0건"으로 잘못 적었다 — 교차검토가 반증). 즉 이 결정은 검증된 양식을 복제한 것이 아니라 **미검증 양식을 하나 더 얹은 것**이며, 발동률이 진짜 검증 대상이다. ⓓ **자동 읽기 비용은 고정이 아니다** — 두 파일 전체를 읽으므로 누적량에 비례해 커진다. cap·index·archive 규칙을 두지 않았고(아직 한계에 닿은 프로젝트가 없다), 커지면 헤더 index 기반 선택 읽기로 전환하라고만 적었다. ⓔ 어댑터 3사 격차 미실측 — 절차 문서 기반이라 3사 동일할 것으로 보이나 확인하지 않았다. ⓕ **독립 리뷰 = Codex(`gpt-5.6-sol`·reasoning=max) 교차검토 1회 수행**, blocking 4·should-fix 6·nit 1 전량 반영. 다만 **반영본 자체는 재리뷰되지 않았다**.
- **영향**: 신설 = `interactive/core/procedures/knowledge.md` · `interactive/skills/knowledge/SKILL.md`. 수정 = `core/project-context.md`(산출물 등재 + 규칙 4에 `knowledge/**` 편입 + 경로 override 미배포 명시) · `core/procedures/deep-interview.md`(프리플라이트 + 출력 4단계) · `core/procedures/create-program.md`(Phase 1A 프리플라이트 · **Phase 1B 종료 제안**) · `core/procedures/ask-consultant.md`(Step 6) · `core/procedures/analyze-symptom.md`(Step 6 라우팅) · `core/procedures/lesson.md`(경계 1문단) · `interactive/DESIGN.md` §3-2 · `CLAUDE.md`(절차 20→21·스킬 15→16, 그리고 D-051이 20건으로 올린 `test-smoke-mcp` 수가 16으로 남아 있던 **기록-실물 불일치** 정정) · `plugin-metadata.json` 0.4.0→**0.4.1** · 매니페스트 5종 재생성 · 이식 스냅샷 재핀(목적지 해시 2건 — `core/project-context.md`·`core/procedures/`; pin `a95eb0f`·roots 36·inventory 487 불변). **불변** = 품질 모델 · 실데이터 게이트(P2) · unattended=sealed · ENGINE template-only(D-040) · 번들/엔진/vsp 무접촉 · MIGRATION-MANIFEST 분류 · 도구 표면(155/186) · `.sc4sap/` git-ignored 원칙.

## D-053 · 2026-07-31 · 상류 PR #46 `package-to-process` 이식 범위 확정 — 프로세스 계층 채택 · BPML 유보 · trust-session 미신설

- **맥락**: 활성 백로그 ⑥. 07-31 예비 판정은 **8파일 중 5본만 읽고**(SKILL.md 앞 70줄 + dispatch-stocker 전문) 4덩어리로 나눴고, 공유 파일은 한 번도 diff하지 않았다. 이번 세션이 전문 정독 + `interactive/tools/spec/` 5종 실측 대조. **PR 규모 정정**: `cfcc320..78b5c2f` = **31파일 +3866/-1866**(예비 기록 "24파일 +2706/-48"은 오기). 내역 = 0.6.15분 28파일 +2804/-1866(작성 **2026-06-06~06-09**) + 0.6.16분 10파일 +1099/-37(07-19). **07-20은 머지일이지 작성일이 아니다** — 프로세스 계층은 두 달 가까이 상류에 있었고 우리가 못 본 것이다(⑦ = D-054). **예비 판정 정정 3건**: ⓐ 렌더러는 2종이 아니라 **3종**(`renderFlowchartSVG`/`flowchartMetrics` 누락)이고 **순수 증분이 아니다** — 기존 export 4건의 동작이 바뀐다(`renderSelectionScreenSVG`의 한국어 하드코딩 기본값 → 언어별 기본값 = **실재 버그 수정**, 현행 sapkit은 EN/JA 스펙에 "조회 조건"이 박힌다 · `renderProcessFlowSVG`·`…HorizontalSVG`의 `heading` 기본값 `'Process Flow Chart'`→`null` · `renderScreenImages`가 `processFlow`의 `{nodes,edges}` 그래프형 수용 · Selection/ALV 목업 v13 재스타일). ⓒ 실행 골격은 440줄이 아니라 **579줄**(140+179+140+81+39). ⓓ `build-bpml.mjs`는 "별건"이 아니다 — `renderFlowchartSVG`·`flowchartMetrics`·`renderSequenceDiagramSVG`·`sequenceDiagramMetrics`를 **직접 import**하므로 ⓐ가 **하드 선행조건**이다. **예비 판정이 아예 못 본 4건**: ⑴ `render-process-images.mjs`(75줄 신규 — document-template이 요구하는 Step 6 CLI, 어느 덩어리에도 없었다) ⑵ `render-md-images.mjs`(68줄 신규 — **package-to-process와 무관한 program-to-spec 개선**, 현행 sapkit MD 스펙은 ASCII 와이어프레임+Mermaid다: `program-to-spec.md:123,201-203`) ⑶ `build-spec.mjs` +75줄 = **한/영 혼용 검출 가드**(역시 program-to-spec 개선) ⑷ `image-swap`·`template-clone`·`xlsx-zip`·`asset/template_base.xlsx`는 sapkit 것과 **동일**(앞 3종 CRLF 정규화 후 diff 0 · 템플릿 sha256 `143d7cfc…` 일치) = 할 일 0. **새 위험(예비 판정 부재)**: `build-bpml` xlsx 모드는 **L2~L5 행마다 헤드리스 Edge를 1회씩 스폰**한다(4병렬·각 30초 타임아웃). 실 패키지면 50~200회이며 이 PR에서 가장 무겁고 깨지기 쉬운 지점이다(내용주소 캐시·2시트 폴백은 있음). **프로세스 계층이 비어 있다는 판정은 측정으로 확증**: `core/knowledge/` 177본 중 문서흐름 체인을 담은 파일 **0건**(grep 실측).
- **결정**: ① **범위 = 도구층 4건 + 프로세스 계층 3건**. 도구층 = `tools/spec/screen-image-renderer.mjs` 1180→1732(렌더러 3쌍 + 언어 기본값 수정 + v13 재스타일) · `tools/spec/render-process-images.mjs`(신규) · `tools/spec/build-spec.mjs` +75(언어 혼용 가드) · `tools/spec/render-md-images.mjs`(신규). 프로세스 계층 = `core/knowledge/modules/common/document-flows.md`(모듈별 문서흐름 사전 + 군집 알고리즘) · `core/procedures/package-to-process.md`(재작성) · `skills/package-to-process/SKILL.md`(15줄 래퍼). ② **BPML(`build-bpml.mjs` 827줄 + `bpml-render.md` 137줄)은 이번 범위 밖 — 재검토 트리거 2개를 못박는다**(HANDOFF가 지적한 "유보 영구화" 실패 모드 회피): ⓐ 프로세스 문서 첫 실전 산출 후 수령자가 엑셀 표를 요구할 때 ⓑ 그와 무관하게 **도그푸딩 1회 완주 시점에 무조건 재판정**. ③ **`trust-session`은 신설하지 않는다 — 최대 장벽이 아니라 오판이었다**(근거는 아래). ④ **골격 재작성 규범**: 메인 컨텍스트가 전 단계 소유(sapkit 절차 관례) · `Agent(...)` 디스패치 0 · 모델 배너 2종(`[Model: …]` 접두 · `Opus 4.7|Sonnet 4.6|Haiku 4.5` phase banner) 제거 = 3사 중립 · `level`/`model` frontmatter 제거. **살리는 것** = 7단계 순서 · 소크라테스 인테이크 · 진입점 탐지법(TRAN 검색 × `key_programs[]`) · Step 4 사용자 승인 루프(병합/분할/개명, 3회 캡) · Step 7 검증 체크리스트 · 실패 처리 규칙 · `<Data_Extraction_Safety>`(행 데이터 요청을 거부하고 Open Questions에 기록 — sapkit 정책과 정합하므로 경로만 교체). 진행바(20자)는 sc4sap 하우스 스타일이라 선택. ⑤ **P0/P1 절차다** — SAP 쓰기·전송이 없고 `GetTableContents`/`GetSqlQuery`를 스스로 금지한다. ⑥ **provenance 전제 변경을 명시**: 이 파일들의 출처는 sc4sap-custom이 아니라 **babamba2**다. 현재 `migration-map.json`의 `scripts/spec/** → tools/spec/ (class: copy)`는 **실측상 정확**하나(5파일 전부 CRLF 정규화 후 diff 0), 이식 후에는 `tools/spec/`이 sc4sap-custom의 바이트 사본이 아니게 된다 — 집행 시 `MIGRATION-MANIFEST.md` + 그 규칙 `note`에 제2출처를 기록하고 목적지 트리를 재핀한다.
- **`trust-session` 재판정 (⑥의 "최대 장벽"이 아님 — 근거 3)**: ⑴ **Layer 1은 이미 다른 기계로 구현돼 있다.** trust-session Layer 1 = "MCP 도구를 *열거*(와일드카드 금지)해 `.claude/settings.local.json`에 넣되 실데이터 2종 제외". sapkit은 `adapters/claude/permissions-template.json`으로 같은 결과를 **정적으로** 얻는다 — 실측 **allow 187건 · `GetTableContents`/`GetSqlQuery` 0건**, `/sapkit:setup`이 사용자 승인 하 1회 병합, 축소 거부 가드 동반(D-042). sapkit이 거부한 것은 "런타임에 세션 도중 사용자 설정 파일을 고쳐 쓰는 행위"이지 그것이 사려던 결과가 아니다. ⑵ **이 스킬은 이미 허용된 것 외를 쓰지 않는다** — `<MCP_Tools_Used>`의 26개 도구를 템플릿과 대조해 **누락 0건**. 즉 trust-session의 존재 이유인 프롬프트 피로가 이 스킬에서는 발생하지 않는다. 남는 프롬프트는 `.sc4sap/` 밖 `Write`와 `Bash(node …)`뿐이고 그것은 attended-only가 **일부러 남기는** 프롬프트다. ⑶ **Layer 2(`mode:"dontAsk"`)는 디스패치 구조의 부산물이다** — 5개 사이트 전부 `Agent(...)` 호출이며, DESIGN §2가 폐기한 8역할 파이프라인을 되살리지 않으면 침묵시킬 디스패치 자체가 없다. **따라서 진짜 장벽은 설계 충돌이 아니라, 골격이 sapkit에 없는 서브에이전트 3종(`sap-stocker`·`sap-analyst`·`sap-writer`)을 전제한다는 사실이며 이는 재작성으로 해소된다**(sapkit 보유 = `sap-reviewer`·`sap-worker` 2기).
- **대안·기각**: (a) **BPML 포함 전량 이식** — 작업량 약 2배에 더해 행당 브라우저 스폰(50~200회)의 무게·고장 위험을 지금 같이 떠안는다. 프로세스 계층의 구멍은 `.md`+PNG 산출물로 이미 메워지고 BPML은 다른 독자(PMO/Fit-Gap)를 위한 **두 번째 산출 형식**이다, 기각(트리거 2개로 재검토 보장). (b) **골격 통이식 후 trust-session만 제거** — `sap-stocker`/`sap-analyst`/`sap-writer` 부재로 기동 자체가 불가하고, 모델 배너·`level`/`model` frontmatter도 3사 중립 위반이라 어차피 전면 손질이다, 기각. (c) **지식 3본만 뽑고 도구는 미이식** — `document-template.md`의 Renderer Constraints #3이 `render-process-images.mjs`를 명시적으로 요구하고, 그것은 다시 ⓐ 렌더러에 의존한다. 지식만 가져오면 Mermaid 텍스트로 퇴화해 "품질이 뷰어에 달린" 상류 이전 상태가 된다, 기각. (d) **서브에이전트 3기 신설로 원형 보존** — D-051 (b)와 동일 근거(DESIGN §2의 폐기 근거 = 품질 모델 단순화·세션 토큰 무게 불변), 기각. (e) **BPML을 md 모드만 부분 이식** — md 모드도 같은 렌더러 4함수에 의존하고, 계약서(`bpml-render.md`)를 반쪽만 가져오면 xlsx 절이 죽은 문서가 된다, 기각. (f) **`trust-session`을 attended 호환형으로 축소 이식**(실데이터 2종 제외 열거만) — 그것이 곧 현행 권한 템플릿이며 런타임 설정 변조만 추가된다, 기각.
- **정직 유보**: ⓐ **이번 세션은 범위 결정뿐 — 코드 0줄 이식했다.** 아래 영향은 문서 2건이 전부다. ⓑ **렌더러 이식이 program-to-spec 출력 겉모습을 바꾼다**(v13 재스타일 + `heading` 기본값 변화). 현행본/신규본 PNG를 **육안 대조하지 않았다** — 집행 세션의 첫 검증 자리다. ⓒ **3렌더러의 실전 품질 미검증** — 상류에서도 실 패키지 산출물을 본 적이 없고, 우리는 소스만 읽었다. ⓓ **문서흐름 사전의 앵커 테이블 정확성 미검증** — 14모듈 × 정규흐름의 테이블·TCode는 상류 주장 그대로이며 SAP 실물 대조를 하지 않았다(sapkit 모듈은 15 + common이라 BC가 사전에 없다). ⓔ **babamba2 코드 정적 검토 수준** — `build-spec`·렌더러·CLI 2종을 읽었으나 감사는 아니다. 다만 `rasterizeSvgToPng`의 시스템 헤드리스 브라우저 `spawn`은 sapkit이 **이미 program-to-spec에서 쓰는 기존 경로**다(신규 위험 아님). ⓕ **독립 리뷰 미수행** — 이 범위 판정 자체가 새-컨텍스트 검증을 받지 않았다. ⓖ 진행바·Step 6b 등 UX 요소의 채택 여부는 집행 세션 판단으로 남긴다.
- **영향**: 수정 = `docs/reference/DECISIONS.md`(이 항목) · `HANDOFF.md`(백로그 ⑥ 갱신). **코드·번들·매니페스트·스냅샷 전부 무접촉**이며 버전 범프 없음. **불변** = 품질 모델 · attended-only(D-025) · 실데이터 게이트(P2) · unattended=sealed · ENGINE template-only(D-040) · 번들/엔진/vsp 무접촉 · MIGRATION-MANIFEST 분류 · 도구 표면(155/186). **다음 착수점** = 도구층 4건 이식(ⓑ 육안 대조 포함) → 프로세스 계층 3건.

## D-054 · 2026-07-31 · 상류 감시선 — 진짜 상류는 `babamba2`임을 기록하고, 두 번째 감시선 배선은 유보

- **맥락**: 활성 백로그 ⑦. `report-sc4sap-public-drift.mjs`가 보는 원본은 로컬 `sc4sap-custom`인데 거기엔 `package-to-process`가 없어 PR #46이 리포트에 뜨지 않았고, 사용자가 육안으로 발견했다. 이번 세션 실측 4건. ⑴ **"포크를 올린다"는 불필요하다** — 이 머신에 `D:\claude for SAP\superclaude-for-sap`가 이미 있고 **origin이 곧바로 `babamba2/superclaude-for-sap`**다(hjaewon 포크가 아니다). 낡아 있었을 뿐이며 이번 세션 `git fetch`로 PR #46까지 받았다(HANDOFF ⑦의 "포크가 뒤처져"는 `sc4sap-custom`의 `release` 리모트를 본 것이고, 별도 직결 클론의 존재를 못 봤다). ⑵ **두 레포는 객체 그래프가 분리돼 있다** — 핀 `a95eb0fe`가 babamba2 클론에 없고(`git cat-file` 실패), 역으로 babamba2 HEAD `78b5c2f`도 sc4sap-custom에 없다. `--src`를 babamba2로 돌리면 **exit 4**(핀 부재 메시지)로 정확히 실패한다 = 도구는 정상, 핀이 안 맞는 것. ⑶ **날짜로 과거 핀을 복원할 수 없다** — 현 `pin_method`는 `rev-list -1 --until`인데 babamba2는 장수 `active` 브랜치를 병합하는 히스토리라 `--until=2026-07-10`이 **그날 main의 끝이 아니었던 커밋**(`211555c`, 커밋일 06-09)을 돌려준다. ⑷ **루트 집합이 다르다** — babamba2엔 `bridge/`·`rules.md`가 있고 `engine/`이 없다(현 allowlist 36 roots는 sc4sap-custom 기준). 더해 **현 감시선의 원본은 07-16 이후 정지**했고(sc4sap-custom HEAD `5e087ed`, 2026-07-16) **미분류 pending이 58건**이다(이번 세션 실행 실측, 상류 HEAD 기준).
- **결정**: ① **이번엔 사실만 기록하고 배선은 하지 않는다.** 지금 보고 있는 원본만으로도 아무도 안 읽은 변경이 58건 쌓여 있어, 감시 대상을 늘리면 안 읽는 목록을 하나 더 만든다. ② **정본 사실 3건을 여기 못박는다**: 진짜 상류 = `babamba2/superclaude-for-sap` · 이 머신 직결 클론 경로 = `D:\claude for SAP\superclaude-for-sap` · sc4sap-custom은 **이식 정본 출처로 계속 유효**하다(핀 계보가 거기 있다). ③ **배선할 때의 설계 제약을 미리 확정한다** — 두 번째 감시선은 과거 핀 복원이 아니라 **`watch_from` = 배선 시점 HEAD**로 시작한다(제약 ⑵⑶ 때문에 다른 방법이 없다). 자체 root allowlist가 필요하고(제약 ⑷), dispositions는 `<source>:<path>` 키로 단일 파일 유지. 도구는 이미 `--src`를 받으므로 빠진 것은 제2 출처 레코드 + `--source` 선택지뿐이다. ④ **재검토 트리거** = ⓐ 기존 58건 pending을 사람이 한 번 훑은 뒤 ⓑ 또는 상류를 또 놓쳤다는 사례가 1건 더 발생할 때. 둘 중 먼저 오는 쪽.
- **대안·기각**: (a) **hjaewon 포크를 상류에 맞춰 push** — 직결 클론이 이미 있어 목적을 달성하지 못하는 우회다(포크는 `release` 경로용). 기각. (b) **두 번째 감시선 즉시 배선** — 도구 변경 자체는 작지만 58건 미분류 위에 새 목록을 얹는다. 감시는 읽는 사람이 있을 때만 감시다, 기각(트리거로 보장). (c) **감시 대상을 babamba2로 교체** — sc4sap-custom이 이식 스냅샷의 핀 계보(`a95eb0f`·roots 36·inventory 487)를 쥐고 있어 교체하면 provenance 게이트의 기준점을 잃는다, 기각. (d) **자동 이식 채널 신설** — R-004·D-027 §9.2의 "자동 이식 0" 원칙 불변, 기각.
- **정직 유보**: ⓐ **"상류 변경을 계속 놓친다"는 사실은 이 결정으로 해소되지 않는다** — 유보를 선택했으므로 다음 상류 변경도 같은 방식(사용자 육안)으로 발견될 공산이 크다. 그 비용을 알고 미룬 것이다. ⓑ 이번 PR #46 발견도 도구가 아니라 사용자 육안이었다(재발 1회 = 트리거 ⓑ 발동 조건이다). ⓒ babamba2 클론의 신선도 유지 방법(수동 `git fetch`)은 아무 데도 자동화돼 있지 않다. ⓓ `upstream-drift-dispositions.json`은 PR #46에 대해 여전히 무기록 = `pending` — D-053이 범위를 정했으므로 집행 시 `adopted`/`intentionally-diverged`를 기록할 자리가 생긴다.
- **영향**: 수정 = `docs/reference/DECISIONS.md`(이 항목) · `HANDOFF.md`(백로그 ⑦ 갱신). **코드·provenance 파일 전부 무접촉**. **불변** = R-004(private 무질의) · 자동 이식 0 · 이식 스냅샷 핀(`a95eb0f`·roots 36·inventory 487) · CI 대상 아님.

## D-055 · 2026-07-31 · 백로그 ⑥ 1단계 집행 — 도구층 4건 이식 + template-clone 경로 결함 수리(제2출처 기록)

- **맥락**: D-053이 정한 범위의 1단계. 상류 `babamba2/superclaude-for-sap` 직결 클론(D-054 ②)에서 `git show 78b5c2f:scripts/spec/*`로 4파일을 꺼내 EOL만 레포 관례(CRLF)로 맞춰 이식했다. **D-053의 예측이 전부 실측과 일치**: 줄 수 1180→1732 · 92→167(+75) · 신규 75·68, 렌더러는 3쌍(`renderFlowchartSVG`/`flowchartMetrics` · `renderSequenceDiagramSVG`/`sequenceDiagramMetrics` · `renderProcessMapSVG`/`processMapMetrics`). **집행 중 발견한 별건 결함 1건**: `template-clone.mjs`의 기본 템플릿 경로가 상류 레이아웃 `asset/`을 그대로 물려받았는데 이식 때 목적지가 `assets/spec/`로 개명돼 있어 **`build-spec.mjs` CLI가 전건 실패**하고 있었다(`template not found` 실측). 즉 program-to-spec의 엑셀 산출 경로는 이식 시점부터 레포에서 한 번도 돌지 않았고, `program-to-spec.md:149`가 안내하는 명령이 그 상태였다. 이번에 이식한 언어 혼용 가드가 `buildSpec` 안에만 있어 이 결함을 고치지 않으면 **검증조차 불가능**했다(실제로 1차 검증은 스크래치패드에 상류 레이아웃을 흉내 내 통과시켰다).
- **결정**: ① **도구층 4건 이식** — `tools/spec/screen-image-renderer.mjs`(1732) · `build-spec.mjs`(167) · `render-process-images.mjs`(신규) · `render-md-images.mjs`(신규). 상류 바이트를 EOL 정규화 후 **sha256 4/4 동일**로 이식(전사 오류 0). ② **`template-clone.mjs` 기본 경로를 `assets/spec/`으로 수리**(사용자 승인 하 — 대안 2종 제시 후 "지금 한 줄 고친다" 선택). 이로써 이 파일은 핀 커밋의 무변환 사본이 아니게 되므로 **매니페스트 note에 명시**했다. ③ **`MIGRATION-MANIFEST.md`의 `scripts/spec/**` 행에 제2출처를 기록**하고 스냅샷을 재생성했다 — `tools/spec/` 트리 핀이 파일 5→7 · sha `784ea20a…`→`511e83a2…`로 이동. note를 매니페스트에만 쓴 이유 = `migration-map.json`은 생성물이고 규칙·note의 정본은 매니페스트 표다(백틱은 목적지 토큰으로 파싱되므로 제2출처 표기에 백틱을 쓰지 않았다). ④ **`upstream-drift-dispositions.json`은 손대지 않는다** — D-053 ⓓ가 "기록할 자리가 생긴다"고 봤으나 **실측 결과 자리가 없다**: `scripts/spec/**` 5파일은 핀 `a95eb0f`와 sc4sap-custom HEAD `5e087ed` 사이에 **blob이 전부 동일**해 감시선이 애초에 보고하지 않는 경로다. 보고되지 않는 경로에 `adopted`를 박으면 **나중에 그 경로가 진짜로 드리프트할 때 이미 처리된 것으로 가려진다**(fail-open). 대신 이 사실을 여기 기록한다. ⑤ **버전 0.4.1 → 0.4.2**.
- **검증 (전건 이 세션 실측)**: ⓐ **육안 대조(D-053 ⓑ가 남긴 첫 검증 자리) 완료** — 동일 image-spec으로 이식 전/후 PNG를 렌더해 비교: 치수 4종 **전부 불변**(1035×377 · 1035×212 · 1328×175 · 1035×267), 변경은 스타일뿐(둥근 모서리·드롭섀도·ALV 헤더 반전). ⓑ **언어 기본값 버그 재현 후 수리 확인** — `lang:'en'` + blockLabel 미지정 시 **이식 전에는 "조회 조건"/"옵션"이 영문 명세서에 박혔고**, 이식 후 "Selection Criteria"/"Options"로 나온다. 선형 흐름도 heading도 하드코딩 `Process Flow Chart` → 언어별(`처리 흐름도`). ⓒ **신규 렌더러 3종 실물 산출** — 분기 flowchart(920×1056, 예외 side-path·loop-back·범례), 시퀀스 다이어그램(747×644, alt/else 프레임·self-message·note·actor 구분), 프로세스 맵(1040×313, snake wrap 실동작). ⓓ **CLI 2종 정상**(manifest JSON 출력·graceful degrade 문구 확인). ⓔ **언어 혼용 가드 정확도** — ko 스펙에 영문 4건을 심어 **4건 전건 검출**, SAP 식별자(`S_BUKRS`·`BUKRS`·`1000`)와 한글은 오검출 0. ⓕ **엑셀 파이프라인 E2E** — 수리 후 레포에서 직접 `build-spec` 실행 성공(87,311 B · PNG 3종 swap). ⓖ **게이트 6종 exit 0**(provenance·링크 701·번들·엔진 provenance·도구표면 155/186·매니페스트 5종).
- **대안·기각**: (a) **결함을 백로그로만 남긴다** — 이번에 이식한 가드가 도달 불가 코드로 남고 엑셀 경로도 계속 죽는다, 기각(사용자 선택). (b) **호출부(build-spec)에서 경로를 계산해 넘긴다** — 사본 분류는 지키지만 이식한 build-spec이 상류와 갈라져 다음 이식 때 diff가 더러워진다, 기각. (c) **BPML까지 함께** — D-053 ②가 이미 기각(트리거 2개 유지). (d) **dispositions에 `adopted` 4건 기록** — ④의 fail-open 근거로 기각.
- **정직 유보**: ⓐ **음성시험 2종(17/17·20/20)은 이 머신에서 또 완주하지 못했다** — 백그라운드 120초 초과로 첫 항목에서 멈췄다(기지 spawn 블록, CI가 담당). ⓑ **시퀀스 다이어그램에 경미한 겹침 1건** — note 박스 직후 메시지 라벨("결과 통보")이 박스 하단 테두리를 몇 px 침범한다. 상류 레이아웃 상수(`SQ_NOTE` 진행량)의 성질이며 이식 결함이 아니다, 미수정. ⓒ **ALV 목업의 sampleRows가 두 버전 모두 빈칸**으로 렌더된다(이식 전후 동일 = 회귀 아님). 원인 미조사. ⓓ **`render-md-images.mjs`는 아직 어느 절차도 호출하지 않는다** — 상류의 program-to-spec 절차 개편(`workflow-steps.md` +125 · `spec-templates.md` +187)은 D-053 범위 밖이라 미이식이고, 배선은 2단계 이후 판단으로 남는다. ⓔ 새 렌더러 3종의 **실 패키지 산출물은 여전히 미검증**(D-053 ⓒ 유지) — 이번 검증은 합성 probe다. ⓕ **독립 리뷰 미수행**.
- **영향**: 수정 = `interactive/tools/spec/`(4파일 이식 + template-clone 1줄) · `MIGRATION-MANIFEST.md` · `provenance/{migration-map,sc4sap-public-source}.json`(재생성) · `plugin-metadata.json`+매니페스트 5종(0.4.2) · `HANDOFF.md` · 이 항목. **불변** = 엔진·번들·vsp 무접촉 · 도구 표면 155/186 · 실데이터 게이트 · attended-only · unattended=sealed · ENGINE template-only · 이식 스냅샷 핀(`a95eb0f`·roots 36·inventory 487) · `upstream-drift-dispositions.json` 무접촉. **다음 착수점** = 백로그 ⑥ 2단계(프로세스 계층 3건).

## D-056 · 2026-07-31 · 백로그 ⑥ 2단계 집행 — 프로세스 계층 3건 신설(골격 재작성) · 백로그 ⑥ 종결

- **맥락**: D-053 ①이 정한 2단계. 상류 골격 579줄(SKILL 140 + workflow 179 + dispatch-analyst 140 + dispatch-writer 81 + dispatch-stocker 39)은 **sapkit에 없는 서브에이전트 3종**(`sap-stocker`·`sap-analyst`·`sap-writer`)을 `Agent(...)`로 부르는 구조였다. **집행 중 확인한 해소 경로**: 그 3종은 sapkit에 **페르소나로 전부 실재**한다(`core/personas/sap-{stocker,analyst,writer}.md`) — 즉 없는 것은 실행체이지 지식이 아니었고, [analyze-cbo-obj](../../interactive/core/procedures/analyze-cbo-obj.md)가 이미 쓰는 관용구("Adopt the sap-stocker persona … and perform the full inventory pass yourself")를 그대로 적용하면 디스패치 5곳이 전부 사라진다. **집행 중 발견한 중립성 위반 1건(D-053 ④ 목록에 없던 것)**: 상류 골격은 사용자 질문을 **`AskUserQuestion` 도구 호출**로 지시하는데, 이는 Claude 전용 표면이다 — sapkit 절차 21본 실측 결과 **그 도구를 부르는 절차는 0건**이고 관용구는 "(exactly one question)" + 인용문이다. 그대로 옮겼으면 Codex·Antigravity에서 죽는 절차가 됐다. **집행 중 발견한 게이트 충돌 1건**: `check-links.mjs`는 **fenced code block을 무시하지 않는다**(LINK_RE를 파일 전문에 적용). 문서 골격 예시 안의 `![alt](path)`·TOC 링크가 실링크로 검사돼 깨짐 8건이 났다 — core/ 전체에서 `![`를 쓰는 파일이 이 파일뿐이었던 것이 그 증거다.
- **결정**: ① **3파일 신설** — `core/knowledge/modules/common/document-flows.md`(171줄: 군집 알고리즘 7단계 + 14모듈 문서흐름 사전 + 엣지케이스 4) · `core/procedures/package-to-process.md`(440줄: 7단계 + 문서 골격 + 렌더러 제약 10 + 실패 처리 + 안전 레일) · `skills/package-to-process/SKILL.md`(15줄 래퍼, 형제 스킬과 동형). ② **골격 재작성 규범 집행(D-053 ④)** — 메인이 7단계 전부 소유 · `Agent(...)` 0 · 페르소나 채택으로 대체 · 모델 배너/`level`·`model` frontmatter 제거. ③ **상류 Step 0(trust-session)을 삭제**해 단계가 0~7(8개)에서 **1~7(정확히 7개)**로 정합됐다 — D-053 ③의 귀결이다. ④ **진행바(20자 ASCII)는 채택하지 않는다**(D-053 ⓖ가 집행 세션에 남긴 판단) — sapkit 절차 21본 어디에도 없는 상류 하우스 스타일이고, 메인이 직접 실행하는 구조에서는 도구 호출이 그대로 보여 "긴 침묵"이라는 원래 근거가 성립하지 않는다. 대신 **단계 진입 시 한 줄 헤더**를 요구한다(스킵도 사유와 함께 출력). ⑤ **`AskUserQuestion` 전량 제거** — 3사 중립이 도구 표면에도 적용된다는 것을 이 절차가 실증한다. ⑥ **문서 골격에 자리표시 표기법 도입** — `TOC{title}{#anchor}` · `IMG{alt}{path}` · `FALLBACK{…}`. 링크 게이트가 코드펜스를 구분하지 못하는 현실에 절차 문서가 맞춘 것이며, 게이트를 고치는 대신 표기를 바꾼 이유는 게이트 변경이 이번 범위 밖이고 **오탐이 아니라 설계 한계**이기 때문이다(추가 이득: 예시가 실링크가 아니라는 것이 독자에게도 분명해진다). ⑦ **BPML은 계속 범위 밖**이되 Step 6 말미에 재검토 트리거 2개를 문서에 못박았다(D-053 ② 보존). ⑧ **버전 0.4.2 → 0.4.3** · 자산 계수 지식 178·절차 22·스킬 17.
- **검증 (이 세션 실측)**: ⓐ **게이트 6종 exit 0**(provenance · 링크 738 깨짐 0 · 번들 · 엔진 provenance · 도구표면 155/186 · 매니페스트 5종·계수 일치). ⓑ **절차의 다이어그램 spec 계약을 실물로 검증** — 절차에 적어둔 예시 JSON을 그대로 `render-process-images.mjs`에 먹여 `macro.png`(676×170)·`seq-1.png`(389×432) 산출 확인. 문서가 말하는 계약과 도구가 받는 계약이 일치한다. ⓒ **상류 잔재 정적 검사 0건**(`Agent(` · `dontAsk` · `trust-session` · 모델 배너 3종 · `[Model:` · `sc4sap:` 접두 · `configs/` · `scripts/spec` · `AskUserQuestion`). ⓓ 스냅샷 재핀(지식 트리 94→95 · 절차 트리 25→26).
- **대안·기각**: (a) **서브에이전트 3기 신설로 원형 보존** — D-053 (d)/D-051 (b)와 동일 근거(품질 모델 단순화·세션 토큰 무게), 기각. (b) **companion 파일 6본 구조를 그대로 옮긴다** — sapkit 절차는 1파일 자족이 관례이고(형제 21본 전부), 6본으로 쪼개면 로드 지시가 절차 본문보다 길어진다. 골격·템플릿·제약을 한 파일에 합치고 사전만 지식으로 분리했다, 기각. (c) **문서 골격을 별도 파일로** — 지식이 아니라 이 절차 전용 산출 규격이라 절차 안이 제자리다, 기각. (d) **`check-links.mjs`에 코드펜스 인식을 추가** — 게이트 변경은 이번 범위 밖이며 음성시험 자산도 함께 손봐야 한다. 백로그로도 올리지 않는다: 현 관례(펜스 안에 링크를 쓰지 않는다)가 core/ 22본에서 이미 성립해 실수요가 없다, 기각. (e) **진행바 채택** — ④ 근거로 기각.
- **정직 유보**: ⓐ **실 SAP 패키지로 완주한 적이 없다** — 이 절차는 이번 세션에서 단 한 번도 라이브 실행되지 않았다. 검증한 것은 문서 정합·게이트·도구 계약이지 **절차의 실효가 아니다**. 첫 도그푸딩이 진짜 시험대다. ⓑ **문서흐름 사전의 SAP 실물 대조 미수행**(D-053 ⓓ 승계) — 14모듈 앵커 테이블·TCode는 상류 주장 그대로이며, 그래서 지식 파일 머리에 "dictionary match = 이름 힌트이지 증거가 아니다"를 명문화했다. ⓒ **군집 임계값 2종(Jaccard 0.35 · 사전 중첩 60%)과 신뢰도 가중치(0.3/0.4/0.3)는 상류 튜닝값을 그대로 옮긴 것**이며 우리가 측정한 적이 없다. ⓓ **`render-md-images.mjs`는 여전히 미배선**(D-055 ⓓ 그대로) — program-to-spec 절차 개편은 D-053 범위 밖이다. ⓔ **독립 리뷰 미수행** — 1단계와 동일. 이 레포의 품질 모델(1명 작업 + 1명 새-컨텍스트 리뷰)의 절반이 비어 있다. ⓕ **음성시험 2종은 이번에도 이 머신에서 완주 실패**(기지 spawn 블록, CI 담당) · doctor FAIL 2 = 기지 CLI 핀 드리프트(Codex 0.145.0·agy 1.1.1), 무관.
- **영향**: 신설 = `core/knowledge/modules/common/document-flows.md` · `core/procedures/package-to-process.md` · `skills/package-to-process/SKILL.md`. 수정 = `analyze-cbo-obj`·`program-to-spec`·`compare-programs`의 Related 절(상호참조 3줄) · `interactive/DESIGN.md`(절차 트리) · 루트 `CLAUDE.md`(계수 178/22/17) · `plugin-metadata.json`+매니페스트 5종(0.4.3) · `provenance/{migration-map,sc4sap-public-source}.json`(재생성) · `HANDOFF.md` · 이 항목. **불변** = 엔진·번들·vsp 무접촉 · 도구 표면 155/186 · 실데이터 게이트(이 절차는 P0/P1이며 로우데이터 2종을 스스로 금지) · attended-only · unattended=sealed · ENGINE template-only · 이식 스냅샷 핀(`a95eb0f`·roots 36·inventory 487) · MIGRATION-MANIFEST 분류. **백로그 ⑥ 종결** — 다음 착수점은 ⑥이 아니라 도그푸딩(ZUNIWTH)이다.

## D-057 · 2026-08-02 · 런타임 경로 `.sc4sap` → `.sapkit` 개명 집행 완료 (D-041 Phase 2 개봉 · D-004 선행조건 이행)

- **맥락**: 설계 v4(`docs/reference/designs/2026-08-01-runtime-path-rename-sapkit.md`, 교차 리뷰 4회로 BLOCKER 8건 봉쇄 — 50a96fb3~34a207a4)가 확정한 대원칙 **R-PRESERVE**(개명은 legacy-only 입력의 결과와 각 소비자의 채택 기준을 보존하고 `.sapkit`을 후보로만 추가한다) + 규칙 3개(R-TIE·R-NEW·R-ENV, R-E)를 이 세션에서 집행했다. **§9 선행조건 중 ①(CheckSyntax #12 라이브 red→green 종결)·②(ZUNIWHT/ZUNIVAT 도그푸딩 checkpoint)는 미충족 상태로 착수**했다 — 충족 근거는 조건 ③(사용자 명시 지시)이며, 그 판단의 실질 근거는 두 조건 모두 **라이브 SAP 세션 의존**인데 본 작업은 **레포 내부(git 상태 + 로컬 런타임 디렉터리) 한정**이고 R-PRESERVE가 기존 프로젝트 무접촉을 보장한다는 것이다(설계 문서 헤더에 착수 시점부터 기록됨).
- **결정**:
  ① **설계 v4를 그대로 채택·집행** — 원칙·규칙 원문은 설계 §4, 기각한 대안(탐색기 통일·`config.json` state 제외·clean break)과 그 이유는 설계 §10에 있고 이 항목은 그 위에 집행 사실만 얹는다. **커밋 체인 7개**: `e18ba324`(§8-1 설계 상태 갱신) → `af24950c`(§8-2 엔진 소스 이중화 — `profile.ts`의 `resolveProjectRuntimeDir`/`resolveHomeDir`이 `.sapkit`을 `.sc4sap`과 나란히 후보로 인식, engine **4.13.19→4.14.0**, jest 677→719 green, **R-TIE 역검증**: tie-break를 채택 기준보다 먼저 두도록 순서를 뒤집으면 7케이스가 red로 재현) → `8030d052`(§8-3 번들 재핀 — sourceCommit·integrity·바이트 3자 일치, 능력 표면 무변화 155도구) → `58707496`(§8-4 런타임 층 24파일 + 문서 층 101파일 개명 — `.sapkit` 우선·`.sc4sap` 폴백) → `dffe4137`(§8-5 마이그레이터·rename 게이트·적합성 러너 신설 + 각 음성시험 + CI 배선) → `7057b0c2`(§8-6~7 **v0.4.4** 버전 범프·매니페스트 5종 재생성·이식 스냅샷 재핀) → `de2d2db6`(§8-11 1차 이종 리뷰 반영 17파일).
  ② **이종 교차 리뷰 2라운드**(Codex `gpt-5.6-sol`·read-only, 매회 새 컨텍스트) — 1차 **NEEDS-FIX**(**BLOCKER 1**: `--revert`가 이행 후 목적지에 새로 쌓인 산출물(제외·미분류 항목)을 "정상 divergence"로 보지 않고 journal 이후 목적지가 있으면 **무조건 지워버려** 실데이터 손실 경로가 됨 · MAJOR 5 · MINOR 2) → 전건 원문 확증 후 수리(`de2d2db6` — divergence 판정에 이행 후 생긴 비이행 산출물까지 포함하도록 로직 자체를 교정 + 회귀 음성시험 2건 추가, 그 외 ENV_INVALID terminal화·목적지 lstat no-follow·mkdir 원자 예약·Windows DACL icacls 검증·게이트/러너 역할 분담 명문화·cwd 도구 3종 기대값 11케이스) → 2차 **SHIP-WITH-NITS**(8건 전부 RESOLVED · 신규 결함 0 · R-PRESERVE/blocklist 회귀 0 · NIT 2). **1차 리뷰가 확인해준 것**: R-PRESERVE 대원칙과 R-TIE 적용 순서 자체는 전 소비자 결함 0 — 즉 설계는 안전했고, 신설 코드(`--revert`)의 가장자리 처리가 별도 결함을 냈다. **교훈**: 원칙만으로는 부족하다. 이종 리뷰가 신설 코드의 가장자리(happy path 밖 — 이행 후 상태 변화)에서 실데이터 손실로 이어지는 결함을 잡았고, 이는 설계 §10이 이미 남긴 "원칙 서술만으로는 재발을 막지 못한다"는 결론을 구현 단계에서 재확인한 사례다.
  ③ **NIT-1 수리(이 세션)** — `.github/workflows/offline-gates.yml`에 `win-migrate-gate`(windows-latest) 잡 1개 신설, `node interactive/scripts/test-migrate-runtime-dir.mjs` 1스텝. `test-migrate-runtime-dir.mjs`의 win32 전용 자격증명 DACL 검증 블록(설계 §5 ⑼, `process.platform === 'win32'` 조건부)은 기존 `node-gates`가 `ubuntu-latest`라 CI에서 한 번도 실행된 적이 없었다 — 이제 CI에서 통과 경로를 확인한다(로컬 재실행 62/62 PASS, DACL 블록 포함).
- **검증(이 세션 실측 — 최종 수치)**: 엔진 jest **720 green/0 fail** · 적합성 러너(`conformance-runtime-dir.mjs`) **183 assert/0 실패**(안전 회귀 9종 PASS — tier fail-open·blocklist 약화·tie-break 순서 회귀를 기계적으로 봉쇄) · 마이그레이터 음성(`test-migrate-runtime-dir.mjs`) **62/62** · rename 게이트 음성(`test-check-runtime-path-rename.mjs`) **16/16** · 게이트 코어 전종 green(스냅샷·links **742/0**·rename·매니페스트·smoke-mcp·verify-engine·engine-provenance — 이번 종결 세션에서 링크·매니페스트 독립 재확인). **canary**(스크래치 시험 프로젝트 실측): dry-run 무변경(포함 6·제외 logs·미분류 열거만) → apply 0.19초·journal 목적지 동봉·원본 무손상 → 실소비자(`vpass --resolve-only`)가 `.sapkit`을 실제로 선택 → `--status`가 `COEXIST_OK` 보고 → `--revert` 무변경 대조 후 원상 복귀 → 홈 스코프(`profiles/` 이행·`bin/` 제외)까지 전부 green. **D-040 KPI 측정치**(합격 주장 없음 — §9 처분대로 "baseline 달성 선언 금지"만 지키고 측정만 한다): 이행 후 필요한 수동 단계 수 = **프로젝트 스코프 3건**(vsp 재설치·훅 재배선·원본 정리) / **홈 스코프 4건**(+env 재등록).
- **대안·기각**: 설계 v4가 4회 리뷰로 원칙 차원의 대안은 이미 소진했다(v0 4문장 반증·v1 R-B 철회·v2 `config.json` 일반화 철회·v3초판 R-TIE 선순위 철회 — 설계 §10). 이 항목은 v4 확정 이후 **구현·집행 단계**에서 나온 대안만 기록한다. (a) 1차 리뷰 BLOCKER를 "문서 경고만 추가"로 봉합 — 실데이터 손실 경로가 코드에 남으므로 기각, divergence 판정 로직 자체를 고쳤다. (b) `ENV_INVALID`를 tier 판정까지 전파 — 연결 해석만 중단하고 `config.json`의 `blocklistProfile`은 그대로 유지하는 편이 R-PRESERVE(하위 strict가 상위 minimal로 약화되지 않는다)에 더 부합해 채택, 전파안은 기각. (c) NIT-1을 기존 `node-gates`(ubuntu) 잡에 조건부로 끼워 넣기 — win32 DACL 블록은 플랫폼 자체가 다르므로 별도 `windows-latest` 잡이 필요하다(기존 `ps-gate`와 동일 이유), 기각.
- **정직 유보 (8건, 전부 기록)**: ⑴ **3사(Claude/Codex/Antigravity) 실연결 재기동 미실측** — §7-4대로 "3사 호환" 주장은 유보한다(launch shim 자체는 적합성 러너로 검증 완료). ⑵ **permissions-template는 수동 정합 확인**(도구 184 바이트 동일 + `.sapkit` 3줄 추가)에 그쳤다 — **접속 머신에서 1회 재생성이 빚으로 남는다**(이 머신에서 재생성하면 D-042의 축소 거부 가드와 충돌한다). ⑶ **NIT-2** — 마이그레이터 `mkdir` 원자 예약은 회귀시험으로 고정되지 않았다(2차 리뷰가 구현 결함이 없음을 확인했을 뿐, 재발 방지 시험은 없다). ⑷ 적합성 러너의 `tier-guard.runtimeDir` 21건은 출하 인터페이스로는 관측 불가라 `unobservable`로 분리 집계했고 decision/tier로 간접 고정했다. ⑸ **케이스 #9(R-NEW 생성 위치)의 실제 생성·중복은 미고정** — 계산값만 있다(설계 §4-3 비유일성 고지의 실태 기록 성격이지, 계약으로 굳힌 것이 아니다). ⑹ `test-smoke-mcp` 18/20·doctor Codex CLI 0.146.0≠0.144.6은 **이 머신 선행 기저**이며 이번 변경과 무관하다. ⑺ **§9 선행조건 ①②는 개명과 무관하게 여전히 열려 있다** — 도그푸딩 자리는 이 작업으로 채워지지 않는다. ⑻ **기존 프로젝트·실사용 머신 이행은 사용자 판단**(설계 §8-13) — 마이그레이터는 사람이 직접 실행한다(에이전트 대행 금지, 설계 §5-2).
- **영향**: 신설 = `interactive/scripts/migrate-runtime-dir.mjs` · `check-runtime-path-rename.mjs` · `conformance-runtime-dir.mjs` · `test-migrate-runtime-dir.mjs` · `test-check-runtime-path-rename.mjs` · `__tests__/fixtures/runtime-dir-selection.json`. 수정 = 엔진 소스(`lib/profile.ts` 등, R-TIE·R-NEW·R-ENV) · 번들(`server.bundle.cjs` 등) · 런타임 층 24파일 + 문서 층 101파일(`.sapkit` 우선·`.sc4sap` 폴백) · `.github/workflows/offline-gates.yml`(`win-migrate-gate` 잡 신설 = NIT-1) · `plugin-metadata.json`+매니페스트 5종 · 이식 스냅샷 재핀. **버전** = engine `4.13.19→4.14.0` · plugin `v0.4.3→v0.4.4`. **불변** = 품질 모델 · attended-only(D-025) · 실데이터 게이트(P2) · unattended=sealed · ENGINE template-only(D-040) · MIGRATION-MANIFEST 분류 · 도구 표면(155/186 — 개명으로 신규·삭제 0). **다음 착수점** = §9 선행조건 재론이 아니라 ① 이 머신 플러그인 재설치(v0.4.4 반영) ② 도그푸딩(ZUNIWTH) ③ 실사용 머신·기존 프로젝트 이행은 사용자가 원할 때 마이그레이터 직접 실행.

## D-058 · 2026-08-02 · 실사용 프로젝트 교훈층의 제품 지식 승격 — 선별 기준 확립 및 1차 반영(2묶음)

- **맥락**: 사용자의 실사용 프로젝트 2곳(`D:\Claude for SAP\JNC` · `JNC-Dashboard`)의 `.sc4sap/` 교훈층(LESSONS 14건 · RULES 12건 · knowledge KS 6건, 2026-07-28~08-02 축적)에 제품으로 되먹일 것이 있는지 확인 요청. 이 방향(사용 현장 → 제품)은 지금까지 D-결정이 다룬 적이 없다 — 종전 지식 유입은 전부 상류 이식(D-053/055/056) 또는 설계 산물이었다. **대조 결과 가장 무거운 발견**: JNC L-001의 IMG 오기재는 우연이 아니라 **`spro-lookup.md`가 그 실패로 안내하고 있었다** — 결정 흐름이 `question is "what is the … IMG path?" ──► answer from static doc, done`으로 정적 문서에서 종결시키는데, 정적 지식만으로 IMG 경로를 답하면 ⑴ IMG 노드가 없는 응용 T-code(`KS01`·`KP26`·`KO88`·`KSV5`·`KB21N`·`KB31N`·`KSB1`·`KOB1`·`KE5Z`·`FB50` — `CUS_IMGACH` 부재 실측)에 없는 경로를 지어내고 ⑵ 액티비티 ID가 `SIMG_CFMENU<메뉴영역><TCODE>` 패턴이라 T-code로 검색되는 동명이인 노드(`SIMG_CFMENUORKSKO01` = "Create **Accrual** Orders")를 단다. 레포 전체 grep에서 `CUS_IMGACT|CUS_IMGACH|SIMG_CFMENU` **0건** = 검증 경로가 제품에 아예 없었다.
- **결정**: ① **승격 선별 기준 3개를 세운다** — ⓐ **일반 참만 승격**: `scope:` 가 특정 시스템에 묶인 사실(JNC KS-001~004: IDES-DEV·S4H/100의 `AUFTRAG` 그룹 20 공실, `CA90` 인터벌 실재 등)은 배포 제품에 넣지 않는다. 그 관찰에서 **시스템 독립적인 층만 추출**한다(번호범위 **그룹 ≠ 인터벌**, 표준 배송 그룹의 존재). ⓑ **도구 표면 안만 승격**: sapkit MCP 도구의 응답을 오독하게 만드는 함정은 제품 문제이므로 승격하고, JCo `RFC_READ_TABLE` 직호출 경로의 함정(JNC-D L-012/L-013 — `OPTIONS` CHAR72, `TABLE_WITHOUT_DATA`의 진짜 의미)은 sapkit이 제공하지 않는 경로라 제외한다. ⓒ **이미 있는 것은 보강 판단을 분리**: L-004(RFC Remote-Enabled 수동 단계)·L-009(클래식 시그니처 거부)는 `function-module-rule.md`에 이미 있어 이번 범위에서 뺐다. ② **묶음 1 — 도구 응답 오독 방지**를 `troubleshooting.md`에 §8 신설로 반영: `GetSqlQuery`의 행 축약 질의(`SUM`/`COUNT`/`AVG`/**`DISTINCT`**)에서 `truncated: true`는 결과 절단이 아니라 **기저 매치 행수 > 반환 행수**의 산물이라는 것 · `OR` 6~7개 초과 시 HTTP 400(그리고 400은 미존재 테이블·필드·부적합 집계와 구별되지 않는다) · `GrepObjects` FUGR 검색이 FM include에 미도달해 실재해도 0 매치 · `$` 접두 로컬 패키지는 `transport_request: "local"` 리터럴 우선 시도(도구는 `$TMP`만 자동 인식) · `CreateTransport` description 비-ASCII 손상. 추가로 `Basic authentication requires SAP_CLIENT to be provided`를 **§1 실패표 + §4 신설 소절**에 배치했다 — 증상이 "MCP 장애"로 읽히지만 실제로는 `active-profile.txt`가 이름만 갖고 프로필 실체는 유저 홈(git-ignored)에 있어 **다른 머신 클론 시 조용히 재현**되는 것이다. ③ **묶음 2 — IMG 검증**을 `spro-lookup.md` § 2a 신설 + 결정 흐름 분기 수정 + `modules/common/spro.md`의 *IMG Activity Verification* 절로 반영(`CUS_IMGACH`/`CUS_IMGACT` `SPRAS='E'`, 메뉴영역 6종, **풀패스는 DDIC 조회 불가**라는 경계 명시). ④ **버전은 범프하지 않는다** — 신설 파일 0, 자산 계수 178/22/17 불변, 기존 문서 19본 보강뿐이다. ⑤ **배치는 "호출 직전에 읽히는 문서"를 기준으로 정한다** — 사용자 질문("실제 도움이 되는 자리에 들어간 것이 맞나")을 받아 로딩 경로를 실측한 결과, **묶음 1의 절반이 헛놓여 있었다**: `troubleshooting.md`를 참조하는 문서는 전수 조사 결과 전부 "프로필 설정하러 가라" 맥락(`transport-client-rule` · `setup` · 페르소나 3종 · 지식 4본)이라 §8은 **`/sapkit:troubleshooting` 호출 시에만** 로드되는데, `GetSqlQuery` 응답을 오독하는 순간은 진단 요청 **이전**이다. 따라서 §8은 상세 설명 자리로 남기고 **호출 직전 문서에 요지 + 역참조를 심었다**: ⓐ `data-extraction-policy.md`(P2 도구 호출 전 필독 계약 — `clean-code.md:122` · `table_exception.md:22` · `sap-executor.md:72`가 "before any … call"로 지목)에 truncated·400 소절. **이 정책이 권장하는 우회로(`COUNT`/`SUM` only)가 정확히 그 함정이 상시 발화하는 형태**라는 것이 배치 근거다. ⓑ `transport-client-rule.md`(`sap-executor`가 "Any `CreateTransport` MCP call" 전에 읽는 정책)에 description ASCII + `transport_request: "local"` 우선. ⓒ **묶음 2에도 구멍이 하나 있었다** — 페르소나의 `<Reference_Data>`는 `spro-lookup.md`(캐시 항목)와 `modules/common/spro.md`(공통 참조, 컨설턴트 **14종**에 명시)를 모두 걸고 있어 두 편집분은 도달하지만, 같은 블록의 `SPRO Configuration (fallback): Refer to ../knowledge/modules/{MOD}/spro.md`는 **spro-lookup을 건너뛰고 모듈별 파일로 직행**한다. 그런데 모듈별 `spro.md` 14본은 전부 `Config Name | Table/View | Description` 구조로 **IMG 경로 열이 아예 없다** — 재료가 없는 상태에서 IMG 경로를 요구받으면 일반 지식으로 지어내게 되고, 그것이 정확히 JNC L-001의 발생 형태다. 그래서 **모듈별 `spro.md` 14본 머리에 경고 블록 1개씩**을 넣었다(이 표에는 IMG 경로가 없다 · T-code가 액티비티 ID에 있다고 그 노드가 아니다 · 아예 노드가 없는 T-code가 많다 + §2a·common 역참조). 일괄 삽입은 스크래치 스크립트로 수행했고 EOL(CRLF)·본문 무손상을 확인했다. ⑥ **연결해둔 참조 볼트(D-050 `referenceLibraries`)를 한 절차 전용에서 전 진입점 계약으로 승격** — 사용자 지적("세팅에서 연결해둔 곳은 컨설턴트든 누구든 참고하게 해야 한다, 참고 안 하면 의미가 없다")을 받아 실측하니 **소비자가 `ask-consultant.md` 단 1건**이고 페르소나 26종·나머지 절차 21본에서 **0건**이었다. 즉 사용자가 볼트를 등록해도 `/sapkit:ask-consultant`로 물을 때만 반영되는 사실상 휴면 슬롯이었다. 처방 2단: ⓐ 컨설턴트 페르소나 **14종**(`<Reference_Data>` 보유분)에 **최우선 항목**으로 삽입 — 어느 절차에서 페르소나를 채택하든 볼트를 먼저 본다. ⓑ **`project-context.md`에 소비 계약을 명문화** — 이 파일은 **스킬 래퍼 17/17이 1단계에서 읽는**(실측) 사실상 유일한 always-on 지점이라, 여기 적힌 의무가 전 절차에 걸린다. 함께 **우선순위 경계**를 못박았다: 볼트는 관행 질문에서 번들 일반지식을 이기지만 **SAP 표준 동작·라이브 판독·이 프로젝트 정책(데이터 보호·승인 게이트)을 넘지 못한다**. 매칭·예산 규칙(볼트당 2–3본·키워드+grep·무단 복사 금지)은 `ask-consultant` § Reference Libraries에 **한 곳만 두고 참조**시켜 중복 드리프트를 피했다.
- **검증(이 세션 실측)**: 게이트 **8종 exit 0** — 이식 스냅샷(재핀 후 무드리프트) · 링크 **746/깨짐 0** · rename 게이트 · 적합성 러너 **183 assert/0 실패** · smoke-mcp(155/65) · verify-engine(4.14.0) · 엔진 provenance · 매니페스트 5종·계수 일치. **rename 게이트가 이번 편집을 실제로 잡았다** — 새 문장에 `~/.sc4sap/profiles/`를 쓰자 구역 A 캡 초과(10 > 9)로 exit 1. 캡을 올리지 않고 **문장에서 구 이름을 제거**해 40/40으로 복귀시켰다(§4 앞부분이 이미 홈 해석 순서를 설명하므로 재언급이 불필요했다). 스냅샷 재핀 diff는 목적지 sha256 6곳뿐이고 pin(`a95eb0f`)·roots 36·inventory 487·파일 수(95/26)는 불변 = 원본 무접촉. **배포 반영은 아직 0이다(실측)** — 이 머신의 플러그인 캐시 `~/.claude/plugins/cache/sap-agentic-harness/sapkit/0.4.4/core/procedures/troubleshooting.md`는 2026-08-02 09:43 스냅샷 **29,730 B**이고 레포본은 **35,275 B**, 캐시에서 `Tool Response Pitfalls`·`IMG node existence`를 grep하면 **0건**이다. 커밋·푸시 후 `claude plugin update sapkit` 재설치까지 가야 세션이 이 문서를 읽는다. 재배치 후 게이트 재확인: 링크 **776/0**(모듈별 경고 블록 14×2 링크 증가분 포함) · rename · 스냅샷 · 매니페스트 전부 exit 0.
- **대안·기각**: (a) **신규 지식 파일로 분리**(예: `knowledge/.../mcp-tool-pitfalls.md`) — 계수·매니페스트 재생성을 유발하고, 내용이 "진단 중 만나는 오독"이라 `troubleshooting.md`(harness-neutral diagnostics)가 이미 제자리다, 기각. (b) **JNC KS 원자를 그대로 이식** — ⓐ 기준 위반(IDES 특정). 특히 "그룹 20이 비어 있다"는 다른 시스템에서 거짓이 될 수 있고, 거짓이 되는 순간 사용자를 화면 앞에서 막는다(L-002가 정확히 그 실패였다), 기각. (c) **`RFC_READ_TABLE` 함정까지 수록** — ⓑ 기준 위반. 다만 프로필 부재 소절에서 우회 경로의 존재 자체는 언급하지 않았다(제품이 지원하지 않는 경로를 처방으로 읽히게 하지 않기 위해), 기각. (d) **묶음 3(FM 시그니처 비대칭·RFC 플래그 확인 쿼리)까지 이번에 함께** — 사용자가 1+2로 범위를 지정했다, 이번 범위에서 제외(아래 유보 ⓐ).
- **정직 유보**: ⓐ **묶음 3 미반영** — abapGit 미러(클래식 `*"` 블록) ↔ ADT(모던 인라인) **FM 시그니처 표현 비대칭**은 `abapgit-roundtrip-rule.md`에 여전히 없고(그 파일은 EOL·미러 완전성·SUSH만 다룬다), `function-module-rule.md`의 RFC 플래그 절에는 확인 쿼리(`TFDIR` `FMODE='R'`)와 "활성화 성공·구문 0/0이 이 결함을 못 잡는다"는 관측이 없다. 다음 세션 후보로 남긴다. ⓑ **승격한 사실 중 이 세션에서 재측정한 것은 0건** — 전부 실사용 프로젝트의 기록(2026-07-28~08-02, S/4 2계통)을 근거로 옮겼고, 원 기록의 verified 문구를 신뢰한 것이다. 특히 `GetSqlQuery` `OR` 6~7 한계는 **정확한 임계값이 아니라 관측 구간**이다(OR 9 → 400, OR 6 이하 → 정상). ⓒ **`CreateTransport` 한글 손상의 발생 지점 미확정**(클라이언트 인코딩인지 백엔드 코드페이지인지) — 문서에도 그대로 미확정으로 적었다. ⓓ **엔진 수리는 하지 않았다** — 묶음 1의 절반(`$TMP`만 인식하는 로컬 판별, `GrepObjects`의 FUGR 미도달, description 인코딩)은 **문서 우회로 덮은 도구 결함**이다. 지식으로 회피하는 것과 고치는 것은 다르며, 후자는 `UPDATE-RUNBOOK` 경로의 별건이다. ⓔ **독립 리뷰 미수행**. ⓕ 원 교훈층 문서(`D:\Claude for SAP\*/.sc4sap/`)는 **읽기만 했다** — 승격했다는 표시를 그쪽에 남기지 않았으므로, 같은 교훈이 다음 세션에 다시 후보로 올라올 수 있다. ⓖ **`GrepObjects` FUGR 함정은 배치처가 없다** — core 문서 전수 grep 결과 이 도구의 호출을 지시하는 절차·정책이 **0건**이다(에이전트가 자율적으로 고르는 도구). §8에만 남겼고, 따라서 이 항목은 진단 요청 전에는 읽히지 않는다는 ⑤의 문제를 그대로 안고 있다. ⓗ **재배치의 실효 역시 미측정** — 정책 문서에 넣었다는 것은 로드 경로에 올렸다는 뜻이지, 에이전트가 그 문장을 읽고 실제로 오독을 피한다는 증거가 아니다. 첫 실사용이 시험대다. ⓘ **`<Reference_Data>`가 없는 페르소나 12종**(`sap-analyst`·`sap-stocker`·`sap-writer`·`sap-critic`·`sap-planner`·`sap-architect` 등)에는 볼트 항목을 개별 삽입하지 않았다 — `project-context.md` 계약(⑥ⓑ)으로만 커버된다. 특히 `package-to-process`가 채택하는 3종이 여기 속하는데, 그 절차는 사용자의 E2E 볼트와 주제가 정확히 겹친다. 계약이 실제로 그 자리에서 작동하는지는 미측정이다. ⓙ **볼트 소비의 실효도 미측정** — 등록된 볼트로 답이 달라지는지 이번 세션에서 확인하지 않았다(이 머신 `config.json`의 `referenceLibraries` 설정 여부조차 조회하지 않았다 — 사용자 런타임 상태라 읽지 않았다).
- **영향**: 수정 = `interactive/core/procedures/troubleshooting.md`(§1 표 1행 · §4 소절 신설 · §8 신설) · `interactive/core/procedures/spro-lookup.md`(§2a 신설 · 결정 흐름 분기) · `interactive/core/knowledge/modules/common/spro.md`(번호범위 그룹 주석 · IMG Activity Verification 절) · `interactive/core/policies/data-protection/data-extraction-policy.md`(응답 해석 소절 — ⑤ⓐ) · `interactive/core/policies/transport-client-rule.md`(호출 경로 함정 2건 — ⑤ⓑ) · `interactive/core/knowledge/modules/{Ariba,BW,CO,FI,HCM,MM,PM,PP,PS,QM,SD,TM,TR,WM}/spro.md` **14본**(머리 경고 블록 — ⑤ⓒ) · `interactive/core/personas/sap-{ariba,bw,co,fi,hcm,mm,pm,pp,ps,qm,sd,tm,tr,wm}-consultant.md` **14본**(`<Reference_Data>` 볼트 항목 — ⑥ⓐ) · `interactive/core/project-context.md`(볼트 소비 계약·우선순위 경계 — ⑥ⓑ) · `provenance/migration-map.json`(목적지 재핀) · `HANDOFF.md` · 이 항목. **불변** = 엔진·번들·vsp 무접촉 · 도구 표면 155/186 · 자산 계수 178/22/17 · 플러그인 v0.4.4 · 실데이터 게이트(P2) · attended-only · unattended=sealed · ENGINE template-only · 이식 스냅샷 핀(`a95eb0f`·roots 36·inventory 487) · MIGRATION-MANIFEST 분류 · 사용자 프로젝트 무접촉(읽기 전용).

## D-059 · 2026-08-02 · 성숙층 소비 아키텍처 — knowledge-sourcing 사다리 신설(L0~L5) · 3겹 그물 배선

- **맥락**: D-058이 볼트(D-050)·IMG 검증을 점 단위로 배선하자, 사용자가 방향을 일반화했다 — *"세컨드브레인과 spro-lookup 등 학습되서 점점 성숙해지는 부분들이 플러그인 전반에서 잘 이용될 수 있게 제대로 설계해달라"*. **소비자 전수 실측 결과, 성숙층 5계열의 읽기 배선이 절차군별로 불균질했다**: ⓐ 학습 가드레일(`.sapkit/RULES.md`) — modify-object·create-object·create-program(계획 전)만 읽고 **진단 계열(analyze-symptom·troubleshooting)과 컨설팅(ask-consultant)·페르소나 전체가 안 읽음**. JNC-D 실사례: L-011의 `SAP_CLIENT` 오진은 그 원인이 이미 R-009로 적혀 있는 상태에서 재발했다 — 규칙이 있는데 진단 절차가 그걸 조회하지 않는 구조. ⓑ 학습 원자(`knowledge/` KD/KS) — deep-interview·create-program은 모범적으로 읽고(preflight 패턴), analyze-symptom·ask-consultant는 **쓰기 dedup에만** 쓰며 읽기는 없음. `knowledge.md` §Read points가 "인터뷰 계열 한정이 의도"라고 명시하고 있었다. ⓒ 추출 스냅샷(spro-config·customizations·cbo) — 프로토콜 2본 + 페르소나 priority-1 + create-program A/B/C 게이트로 **가장 잘 배선된 계열**(추가 불요 판정). ⓓ 볼트 — D-058 ⑥이 1차 배선(페르소나 14 + 계약), **절차 앵커는 여전히 0**. ⓔ 이 전부를 **한 문서가 서열화한 적이 없다** — 층간 우선순위·충돌 규칙·인용 의무가 산재하거나 부재.
- **결정**: ① **`core/policies/knowledge-sourcing.md` 신설(정본)** — 사다리 L0(RULES, 구속력=정책급)→L1(KD/KS 원자)→L2(스냅샷)→L3(볼트)→L4(번들)→L5(모델 일반지식, unverified 플래그 의무). 사다리 밖 2요소를 명시: **라이브 MCP 판독은 현재상태 사실에서 저장층 전부를 이기고**(tier·P2 게이트 내에서), **정책은 지식이 아니라 법이라 볼트 포함 어느 층도 못 넘는다**. 질문 유형별 우선순위(이 시스템의 사실 vs 관행), 충돌 규칙(상위 승·볼트가 이 시스템 사실과 충돌하면 divergence를 사용자에게 표면화·하위층이 상위층의 낡음을 드러내면 Correct 경로), 예산(RULES 캡 40·볼트 2–3본·캐시 targeted only), 인용 규약(R-/KD-/KS- id·스냅샷 타임스탬프·`참조:`·L5 플래그), **write-back 표**(lesson/knowledge 제안 트리거 + 스냅샷 신선도 90d/30d — 전부 제안이지 자동 기록 아님, 볼트는 플러그인에 읽기 전용). 정책 위치 선택 이유 = 계수 비대상(매니페스트 불변) + 래퍼 3단계("Policies override convenience")의 기존 지위. ② **3겹 그물 배선** — ⓐ **always-on**: `project-context.md`에 컴팩트 사다리 표(래퍼 17/17이 1단계에서 읽음 — D-058 ⑥ 실측 재사용). D-058이 넣은 볼트 문단 2개는 사다리로 흡수해 **순감**(항상 로드되는 파일이라 토큰 절약). ⓑ **페르소나**: 컨설턴트 14종 `<Reference_Data>`에 **priority 0** 라인(RULES 구속 + KD/KS 인용, 볼트 라인 위) — 어느 절차가 채택하든 상속. ⓒ **현장 앵커(증거 기반 최소주의)**: analyze-symptom Step 1(증상 키워드 bounded grep — L-011/R-009 증거) · troubleshooting §1 진입부(동일) · ask-consultant Step 4(사다리 순서로 답변 소싱) · deep-interview preflight(볼트 추가 — KD/KS는 기존) · create-program 인터뷰 preflight(볼트 추가 — RULES:262·KD:164 기존) · package-to-process Step 1-5 신설(KD/KS+볼트 — 사용자 E2E 볼트와 주제 정합이 최대인 절차). ③ **read-points 조문 정합** — `knowledge.md` §Read points에 신규 독자 3+페르소나 상속을 등재하고 "인터뷰 계열 한정이 의도" 문장을 "측정된 비용이 있는 곳(인터뷰=재질문 비용·진단=기록된 실패 재유도 비용)"으로 개정. `lesson.md`에 CONSULT 측 우산 역참조. ④ `interactive/DESIGN.md` 정책 트리에 1항목(설계 정본 갱신). ⑤ 버전 불변(신설 1파일이 정책이라 계수 비대상 — manifests --check 통과로 확인).
- **검증(이 세션 실측)**: 게이트 전종 exit 0 — 링크 **807/깨짐 0**(md 286→**287** = 정책 신설분) · rename · 이식 스냅샷(재핀 후 무드리프트, pin `a95eb0f`·roots 36·inventory 487 불변) · 매니페스트 5종·계수 일치(정책 비계수 확인) · smoke-mcp 155/65 · verify-engine 4.14.0. 페르소나 삽입 14/14 성공(멱등 가드 포함), CO 육안 확인 — Reference_Data 서열이 `학습층(P0) → 볼트(P1) → SPRO 캐시(P1) → 커스터마이징 캐시 → 번들` 순으로 정렬됨.
- **대안·기각**: (a) **사다리를 project-context.md 안에 전부 넣고 정책 파일 없이** — 래퍼가 매 호출 로드하는 파일에 ~100줄을 얹으면 세션 토큰 무게(D-040)가 상시 증가. 컴팩트 표(always-on ~15줄) + 상세(on-demand 정책)로 분리 채택, 기각. (b) **절차 22본 전부에 앵커** — program-to-spec·compare-programs·analyze-code·release 등은 실패 사례 증거가 없고 always-on 계약이 커버. 증거 없는 앵커는 절차 본문 무게만 늘린다, 기각(아래 유보 ⓑ). (c) **`<Reference_Data>` 없는 페르소나 12종에 블록 신설** — 구조가 이질적(analyst/stocker/writer/critic 등은 참조 섹션 자체가 없음)이라 강제 삽입은 드리프트 위험. 절차 앵커+always-on으로 커버하고 관찰 후 판단, 기각. (d) **기계 강제(PreToolUse 훅으로 RULES 미조회 시 경고)** — 3사 중립 위반(훅은 Claude 어댑터 한정) + approval-gates.md의 기존 결정("관문=문서 규약, 기계 강제는 Claude 훅 옵션 한정")과 정합하려면 별도 설계 필요. 문서 계약으로 시작하고 실패가 관측되면 훅을 재론, 기각. (e) **새 절차(knowledge-ladder.md)로 신설** — 절차 계수 22→23 + 스킬 노출 판단 유발. 규범이지 실행 절차가 아니므로 정책이 제자리, 기각.
- **정직 유보**: ⓐ **이 설계 전체가 문서 계약이다** — 어떤 층도 기계적으로 강제되지 않는다(훅 0). 에이전트가 사다리를 실제로 오르는지는 다음 실사용에서만 관측된다. ⓑ **앵커 없는 절차 6본**(program-to-spec·compare-programs·analyze-code·analyze-cbo-obj·release·vpass) — always-on 계약만으로 커버되는지 미검증. ⓒ **`<Reference_Data>` 없는 페르소나 12종**은 여전히 개별 라인이 없다(대안 c 참조) — package-to-process가 채택하는 stocker/analyst/writer는 절차 앵커(Step 1-5)로 커버했으나 다른 절차가 그 페르소나들을 채택할 때는 always-on 그물뿐이다. ⓓ **L2 신선도 임계(90d/30d)는 기존 프로토콜 값의 승계**이지 재측정이 아니다. ⓔ **볼트 실효 미측정**(D-058 ⓙ 승계) — 이 머신 config.json의 referenceLibraries 설정 여부도 여전히 미조회(사용자 런타임 상태). ⓕ **배포 반영 0** — D-058과 동일: 커밋→push→플러그인 재설치 전이며, 이 세션의 캐시본에는 이 설계가 없다. ⓖ knowledge.md의 "파일이 커지면 헤더 인덱스" 항목은 손대지 않았다 — 캡 미도입 상태 유지.
- **영향**: 신설 = `interactive/core/policies/knowledge-sourcing.md`. 수정 = `interactive/core/project-context.md`(사다리 신설 + D-058 볼트 문단 흡수·순감) · 페르소나 14본(priority 0 라인) · `analyze-symptom.md`(Step 1 선조회) · `troubleshooting.md`(§1 진입부) · `ask-consultant.md`(Step 4 소싱 서열) · `deep-interview.md`(볼트 preflight) · `create-program.md`(볼트 preflight) · `package-to-process.md`(Step 1-5 신설) · `knowledge.md`(§Read points 개정) · `lesson.md`(우산 역참조) · `interactive/DESIGN.md`(정책 트리 1항목) · `provenance/migration-map.json`(재핀) · `HANDOFF.md` · 이 항목. **불변** = 엔진·번들·vsp 무접촉 · 도구 표면 155/186 · 자산 계수 178/22/17(정책 비계수) · 플러그인 v0.4.4 · 실데이터 게이트(P2) · attended-only · unattended=sealed · ENGINE template-only · 이식 스냅샷 핀 · MIGRATION-MANIFEST 분류.

## D-060 · 2026-08-02 · CI 적색 수리(엔진 리더 probe의 dotenv 공급) + v0.4.5 배포 범프(업데이터 버전 게이트 실측)

- **맥락**: push run #62(`f7dab6e5` — D-057 체인 최초 CI)·#63(`5fb1d901` — D-058/059) **연속 실패**를 사용자가 보고. 실측: 실패 스텝은 양 런 모두 단 하나 — 신설 '마이그레이터 음성시험'(`test-migrate-runtime-dir.mjs`)이 **ubuntu(node-gates)·windows(win-migrate-gate) 양쪽**에서 red. 로그 판독: 음성 케이스 자체(⑴~⑺)는 전부 ✅였고, journal 계약을 **엔진 리더**(`engine/dist/lib/profile.js`)로 확증하는 probe 서브프로세스가 `Cannot find module 'dotenv'`로 죽었다. 원인 삼각측량: dist의 외부 require는 dotenv 하나(profile.js:78 — `./secrets`의 keyring은 함수 내 지연 require라 probe 경로 밖)인데, **dotenv는 engine `dependencies`가 아니다** — prod dep은 pino 2종뿐이고 라이브러리는 전부 devDeps(번들이 esbuild 내장이라). 로컬은 `engine/node_modules`(풀 설치)가 있어 62/62, 무설치 CI 러너는 MODULE_NOT_FOUND. 따라서 **win-migrate-gate는 신설(D-057 ③ NIT-1) 이후 CI에서 한 번도 green인 적이 없다** — D-057 ③의 "이제 CI에서 실제로 돈다"는 '돌긴 하나 red'였다(정정 — append-only 원칙대로 새 항목으로 남긴다). 이 커밋 이전 마지막 green(#61)은 이 시험이 CI에 없던 시점이다.
- **결정**: ① **시험 약화 기각** — 시험 주석이 명시한 설계 의도("dist 부재 시 skip이 아니라 **실패** — '리더로 검증했다'가 핵심 주장")는 D-057 이종 리뷰로 굳은 계약이다. ② **전체 `npm ci` 기각** — dotenv 하나 때문에 devDep 수백 개(±1분×2잡·매 push)를 깔고, `--omit=dev`는 정작 dotenv를 안 깔며(devDep 트리 소속) postinstall(patch-package)·optional native(node-rfc) 리스크만 든다. ③ **채택 = lockfile 핀 버전(`dotenv@17.3.1`)만 스크래치 설치 + `NODE_PATH` 공급** — `npm install --prefix $RUNNER_TEMP/probe-deps --ignore-scripts`(트리 재해석 0·3~5초) 후 `NODE_PATH`를 `GITHUB_ENV`로 후속 스텝에 전파. CJS require의 최종 폴백이 NODE_PATH라 probe의 `require('dotenv')`에 정확히 닿는다(ESM bare import엔 안 먹지만 이 경로는 CJS다 — 레포 밖 cwd에서 resolve+load 실증). 두 잡에 각 셸 문법(bash·pwsh)으로 동일 스텝. **실패 양식 보존**: 향후 dist가 외부 require를 늘리면 게이트가 그 모듈명으로 다시 크게 실패한다 — 조용한 우회가 아니다. ④ **v0.4.4→v0.4.5 범프** — push 직후 사용자의 `claude plugin update sapkit`이 **"already at the latest version (0.4.4)"로 no-op**(실측): 업데이터는 버전 게이트라 내용 해시를 보지 않는다. D-058/059의 "버전 불변" 판단(계수 불변 근거)은 매니페스트 정합으로는 옳았으나 **배포 전달을 막았다** — 이후 규칙: **설치본 내용이 바뀌는 커밋은 패치 범프가 배포의 일부다.**
- **검증(이 세션 실측)**: NODE_PATH 메커니즘 로컬 실증(스크래치 설치 → 레포 밖 cwd에서 `require.resolve`+load OK) · 마이그레이터 음성 **62/62** 로컬 재확인 · 매니페스트 재생성 후 `--check` OK(5종·계수 일치) · 스냅샷·links 재확인 green · **push 후 CI green은 다음 런에서 확인**(이 항목 작성 시점엔 미착지 — 결과는 HANDOFF 재개점에 기록). **집행 중 별건 사고 1건(자기 기록)**: 버전 치환에 PS 5.1 `Get-Content -Raw`/`Set-Content`를 썼다가 BOM 삽입 + CP949 오독으로 `plugin-metadata.json` 한글 주석이 깨졌다 — git checkout 복원 후 **Node 전용 스크립트**(파싱 검증 동반)로 재실행. 교훈: 이 레포의 UTF-8 무BOM 파일에 PS 텍스트 I/O를 쓰지 말 것(CLAUDE.md의 PS 인코딩 경고가 실물로 확인된 사례).
- **정직 유보**: ⓐ probe 의존 목록을 일반화하지 않았다(단일 모듈 전제) — dist의 외부 require가 늘면 워크플로 스텝도 같이 늘려야 한다. ⓑ **근본 해법은 엔진 수리다**(dist가 dotenv를 안 쓰게 하거나 dependencies로 승격) — UPDATE-RUNBOOK 경로의 별건으로 남긴다. ⓒ 사용자의 `/reload-plugins`가 보고한 "1 error during load"는 이번 세션 미조사(사용자 로컬 상태 — CI와 무관). ⓓ CI green 실측 전에 이 항목을 쓴다 — 결과가 red면 새 항목으로 잇는다.
- **영향**: 수정 = `.github/workflows/offline-gates.yml`(2잡 probe 의존성 스텝) · `interactive/plugin-metadata.json`(0.4.5) + 매니페스트 5종 재생성 · `HANDOFF.md` · 이 항목. **불변** = 시험·마이그레이터·엔진 코드 무접촉 · 자산 계수 178/22/17 · 도구 표면 155/186.

## D-061 · 2026-08-02 · CI 적색 2차 수리 — DACL 음성 케이스의 전제를 실측 분기로 (D-060 ⓓ의 후속)

- **맥락**: D-060 수리 push 후 run 재확인 — **dotenv 공급은 작동**(ubuntu node-gates green · win 잡에서 "엔진 리더가 신 세대를 고른다 ✅ COEXIST_OK ✅"), engine-tests·ps-gate·vsp-build 전부 green. 남은 적색은 win-migrate-gate **62건 중 59 PASS / 3 FAIL** — 전부 `dacl-strict` 음성 케이스("소스 DACL이 사본과 다르면 거부한다")다. 판독: 이 케이스는 dotenv 크래시에 가려 **러너에서 이번에 처음 실행**됐고, 시험의 전제 — *"`/inheritance:r`로 보호한 소스를 복사하면 사본은 부모 상속만 받아 더 느슨해진다"* — 가 러너에서 성립하지 않았다. 러너의 `fs.copyFileSync`는 보호 DACL(상속 차단 + 명시 ACE)을 **그대로 보존**해 소스·사본이 동일했고, migrator는 계약("보호가 약화된 사본이면 거부")대로 **동일 보호를 확인하고 정상 이행**했다(exit 0 · journal 동봉). 즉 **migrator 결함이 아니라 시험 전제의 환경 의존성**이다 — 로컬(이 머신)에서는 복사가 보호를 잃어 거부 분기가 관측되고, 러너에서는 관측 자체가 불가능하다.
- **결정**: 시험을 **전제 실측 분기**로 개정 — 케이스가 자신의 전제를 같은 API(`fs.copyFileSync` + icacls 대조, migrator와 독립 구현한 `aclOf`)로 먼저 재고: ⑴ 복사가 보호를 잃는 환경(로컬) → 기존 3검사(거부·사유 DACL·목적지 미생성) 그대로. ⑵ 보존하는 환경(러너) → 거부 대신 **안전 속성 자체를 확증**: 이행 성공 + **사본 자격증명 DACL이 소스 보호와 동일** + journal 존재(3검사). 어느 분기든 검사 수 3으로 시험이 침묵하지 않으며, 안전 속성("자격증명 보호가 약화된 채 복제되지 않는다")은 양쪽에서 동일하게 assert된다. 기각: (a) 러너 분기를 skip 처리 — 관측 불가를 무검증으로 바꾸는 것이라 기각(보존 확증이 가능한데 버릴 이유 없음). (b) 부모에 상속 ACE를 심어 차이를 강제 — 보호 DACL이 상속 차단이라 부모 ACE가 적용되지 않아 불안정, 기각. (c) migrator를 "환경 무관 거부"로 변경 — 보호가 보존된 이행을 거부하는 것은 계약 후퇴, 기각.
- **검증**: 로컬 재실행 **62/62 PASS**(거부 분기 실측 — "소스 DACL이 사본과 다르면 거부한다 ✅") · push 후 CI green은 다음 런에서 확인(결과는 HANDOFF).
- **정직 유보**: ⓐ 러너의 copyFileSync가 보호 DACL을 보존하는 **정확한 기전**(CopyFileW의 SD 복사 조건 · node 버전 차이 여부)은 특정하지 않았다 — 실측 분기는 기전 규명 없이도 안전하게 동작한다. ⓑ 보존 분기가 러너에서 green이 되는 것은 push 후에야 확인된다.
- **영향**: 수정 = `interactive/scripts/test-migrate-runtime-dir.mjs`(aclOf 헬퍼 + dacl-strict 분기) · `HANDOFF.md` · 이 항목. **불변** = migrator·엔진·워크플로 무접촉.

## D-062 · 2026-08-02 · 배포 온보딩·Codex 동등 v2 집행 — 방식 ④(설치 후 재작성) · 훅 기본 미설치 · 서버 게이트 수리(engine 4.14.1) · v0.5.0

- **맥락**: 설계 v2(`docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md`) §13 P0~P4를 당일 집행. 실행 구조 = 메인 오케스트레이션 + 모델 지정 서브에이전트 8기(파일 비중첩 분할: P0 probe sonnet · P1 opus 2 · P2 opus/sonnet · P3 sonnet/opus · 엔진 수리 opus · 문서 정합 sonnet), 판정·문서 계약·게이트·커밋은 메인 전용.
- **결정**:
  - ① **Codex bundled MCP = 방식 ④ 채택 — §6-2의 세 방식 전부 실측 기각·"모두 불가 시 출시 중단+npm 폴백" 조항 supersede.** P0 clean-home probe(0.146.0): Codex는 wrapper 내부 command/args/env를 **일절 치환·재기준화하지 않고**(상대경로는 세션 cwd 기준 → 기동 실패, `${…ROOT}`류 변수 전무), cwd는 사용자 프로젝트로 보존, env는 그대로 전달, 캐시 경로는 `<CODEX_HOME>/plugins/cache/<마켓>/<플러그인>/<버전>/`으로 결정적. 채택 형태 = 커밋 생성물 wrapper(`adapters/codex/.mcp.json`)에 `{{SAPKIT_PLUGIN_ROOT}}` 토큰 + 신설 `scripts/codex-wire-mcp.mjs`(status/apply·멱등·파일시스템 전용)가 설치 후 캐시 절대경로로 재작성. E2E 실측 = 임시 CODEX_HOME에서 marketplace add(로컬) → plugin add → wire apply → `codex mcp list` 등재 → 서버 기동 tools/list 65(readonly)·cwd 보존. 토큰 미배선 상태는 `required:false`라 스킬·세션 생존이 정상 경로(setup·doctor가 안내). §14-3 1번("Codex MCP가 절대 캐시경로를 요구")의 독해: 방식 ④에서 절대경로는 wrapper에 물리적으로 들어가되 **사람이 아니라 스크립트가 쓴다** — 그 조건의 정신(§2-1: 사용자에게 캐시 절대경로 탐색·복사를 시키지 않는다)은 충족되며, 이 독해를 판정 기준으로 확정한다(v0.5.0 독립 리뷰 MINOR 5 반영).
  - ② **Codex 서버 id `sap` 유지**: 전역 `[mcp_servers.sap]`는 bundled를 **조용히 완전히 가린다**(동시 기동·오류 없음 — 실측). §14-3 "동시 기동" 위반이 아니므로 id 개명(네임스페이스 전면 교체) 대신 doctor ⑦ 그림자 탐지 + 사용자 확인 후 제거 안내로 완화.
  - ③ **실데이터 2종 Codex 기본 = `disabled_tools` 하드 차단 유지**: per-tool `approval_mode`는 **사용자 config.toml 전용 — 플러그인이 선언·배포할 수 없다**(0.146.0 스키마 실측)라 §7-3 1번 전제가 불성립. 0.146.0 plugin-scoped 경로의 `codex exec`는 기본·prompt 모두 fail-closed(자동 취소) 실측이나, TUI 미실측 + 구판(0.144.1) 전역 경로 fail-open 이력으로 하드 차단 기본 유지. plugin enable/disable 명령 부재 실측(add/list/marketplace/remove뿐) → `toggle-plugin.mjs` 존치(§12-2 ④ 조건 미충족).
  - ④ **훅 6종 = 기본 미설치 + 스위치 보존 집행 — §7-5 supersede 4건**: ⑴ HANDOFF §8(불변 규칙 4)의 "훅 유지" → "훅 = 선택 기능(기본 미설치·스위치 보존)" ⑵ D-043③ 중 배포 기본 훅 배선 부분(템플릿 2종 제외·Codex 하드차단·서버 바닥선은 유지) ⑶ D-049의 offline-code-analysis 기본 배선 → 선택 기능화 ⑷ D-046②가 이연한 "동봉-미등록 훅 2종 등록 여부" → 전 훅 기본 미등록·스위치 보존으로 종결. setup Step 4 자동 설치 제거, 선택 기능 문서 신설(`adapters/claude/hooks/README.md`), 기존 배선은 setup 재실행 시 1회 질문(유지도 정상).
  - ⑤ **BLOCKER-1 — 서버 tier 게이트가 전 transport에서 미배선이었고, 당일 엔진 수리(4.14.1)로 봉쇄**: 신설 conformance가 발견 — `guardTool()`이 어떤 배포 transport도 쓰지 않는 등록 경로(BaseHandlerGroup)에만 걸려, stdio에서 QA/PRD/tier-미해석 write·실행이 SAP로 디스패치됐다(가짜 호스트 실측). 훅이 유일 실효 방어였으므로 "훅 기본 미설치"는 이 수리 없이는 §14-3 위반. 설계 §7-2 지시("런타임을 수리한 뒤 출시")대로 `BaseMcpServer.registerHandlers`의 wrappedHandler 머리에 guardTool 배선(연결 전 거부·기존 분류 재사용·신규 정책 0). jest 729/0(신규 9·역검증 red 확인), `conformance-server-gates.mjs` 22단언 = PASS 21·GAP 1·FAIL 0, DEV 통과(A5) 무회귀, smoke 155/65 불변.
  - ⑥ **BLOCKER-2 기록 — blocklist env 노브의 유효 경로는 프로파일 sap.env뿐**: 기동 시 `applyProfile()`이 `MCP_BLOCKLIST_PROFILE`·`MCP_BLOCKLIST_EXTEND`·`MCP_ALLOW_TABLE`을 process.env에서 지우고 sap.env 값만 재주입 — 셸 export·MCP env 블록 값은 조용히 무시된다(실측·conformance B2p GAP로 박제). 수리는 별건 백로그(엔진 UPDATE-RUNBOOK 경로), 이번엔 문서 정직화(설정 위치 = sap.env 안 키). 서버 지원 프로파일 = minimal/standard(기본)/strict/off, 그 외 standard 폴백 — 훅의 custom은 서버에 없음(재확인). **소유자 머신 후속**: D-043 노브가 sap.env 밖에 설정돼 있다면 현재 무효일 수 있다 — 프로파일 파일 확인 필요.
  - ⑦ **toolSurface 도입**: `.mcp.json`류 고정 `--exposition` 인자 제거(생성물화), 런처가 프로젝트 `.sapkit/config.json`의 `toolSurface`로 결정 — readonly(기본) / development는 활성 프로파일 `SAP_TIER=DEV`일 때만 `readonly,high`, QA·PRD·미해석·오타·부재는 전부 readonly fail-closed(stderr 1회 고지). 명시 CLI 인자는 검증 없이 우선(기존 수동 등록 경로 호환). launcher는 적합성 진리표 소비자로 등재(tool-surface 축 5케이스 신설·assert 230). **기존 사용자 영향**: toolSurface 미설정 프로젝트는 업데이트 후 write 도구가 축소된다(155→65) — 의도된 안전 축소, 릴리스 노트·setup repair가 development 선택 절차 안내.
  - ⑧ **marketplace version 중복 = 유지**(§11-1 실측 종결): `claude plugin validate` 플러그인·마켓 양쪽 PASS(경고는 `_generated` 무시 고지뿐), 중복은 생성기+`--check`가 동기화 관리 — 제거 이득 0·스키마 위험만.
  - ⑨ **업데이트 UX 실측(§11-2 종결)**: Codex 재`add` = **완전 교체**(0.5.0 캐시 신설 + 0.4.5 구캐시 제거 실측 — 잔존 없음) · `marketplace upgrade`는 Git 마켓 전용(로컬 참조형 마켓은 "not configured as a Git marketplace" — 소스가 항상 최신이라 불필요) · 업데이트 후 새 캐시는 TOKEN_PENDING → wire apply 1회로 재배선(멱등 실측). **v0.4.5→v0.5.0 범프**(설치본 내용 변경 = 범프가 배포의 일부, D-060 ④).
- **검증(전부 당일 실측)**: 신설 시험 = launch-toolsurface **53/53** · setup-state **121/121** · codex-wire **51/51** · doctor **43/43** · server-gates **22(PASS 21·GAP 1)** · hook-switch **13/13**. 기존 = 적합성 러너 assert 230/0 · rename 게이트 음성 16/16 · smoke 155/65 불변 · 매니페스트 7종 `--check` 0 · engine jest **729/0**. 수리 = test-smoke-mcp CRLF 오탐 2건(`\n`→`\r?\n`, 20/20 복귀 — D-057 유보 ⑹의 "18/20 선행 기저" 원인 규명·종결). CI 등재 = conformance-server-gates·test-hook-switch·setup-state·launch-toolsurface·codex-wire(node-gates), test-doctor(win-migrate-gate — .cmd 스텁이라 win 전용). **push 후 CI green은 다음 런에서 확인**(D-060 교훈 — 로컬 green만으로 CI green을 주장하지 않는다).
- **정직 유보**: ⓐ Codex TUI approval 흐름·IDE/app 시나리오 미실측(§14-2 RC 항목으로 잔존) ⓑ compatibility.json codex의 minimumSupported/lastVerified는 RC 통과 후에만 채움(지금 doctor는 WARN(미검증)이 정상) ⓒ `codex exec` 1턴 도구 가시성 레이스 실측 — RC 시험은 2턴 확인으로 설계할 것 ⓓ B2p(env 노브) GAP 유지 — 엔진 수리 별건 ⓔ 이 레포 자체도 reload 후 65도구가 된다(toolSurface 미설정) — write 작업 재개 전 `.sapkit/config.json`에 development 선택 필요 ⓕ 새-컨텍스트 독립 리뷰는 커밋 후 최종 diff 대상으로 수행(결과는 HANDOFF).
- **영향**: 신설 = setup-state·codex-wire-mcp·conformance-server-gates·test-hook-switch + 각 시험 4본 · `adapters/claude/hooks/README.md` · codex wrapper 생성물. 수정 = launch.cjs(toolSurface) · gen-plugin-manifests(7종) · doctor(capability 9검사) · compatibility.json(codex capability) · setup.md(§8-1 흐름) · codex/AG README · engine 4.14.0→**4.14.1**(BaseMcpServer 가드 배선) + 번들 재핀 · offline-gates.yml · rename 게이트 등재(ZONE_B 2·ZONE_C 1·ALLOWLIST 1) · **v0.5.0**. 불변 = 계수 178/22/17 · 실데이터 2종 배포 기본(Claude 템플릿 제외·Codex 하드차단) · `engine/` 소스 유지(§10) · 트랙 A 무접촉.

## D-063 · 2026-08-02 · 실사용자 제보 3건 판정 — ①은 실측 기각, ②③ 수리(launch 진단 · engine 4.14.3) · v0.5.1

- **맥락**: 다른 프로젝트에서 sapkit 0.4.4를 쓰는 사용자가 이슈 3건을 제보했다(요지: "쓰기가 원천 불가인데 그 사실이 드러나지 않는다"). 제보는 원인 진단까지 담고 있었고, 그 진단을 그대로 반영하면 잘못된 방향으로 고치게 되므로 **레포 실물 대조와 실측을 먼저** 했다.
- **결정**:
  - ① **이슈 1(쓰기 도구 미노출 — "`--exposition`에 `low` 누락이 원인") = 기각.** 제보와 같은 0.4.4 배포 캐시를 같은 인자로 직접 기동해 `tools/list`를 실측: `readonly`=74(write 0) · **`readonly,high`(0.4.4 배포 기본값)=186(write 79)** · `readonly,high,low`=311(write 141). 쓰기 핸들러는 `high` 그룹에 있고(`HighLevelHandlersGroup`), `low`는 `*Low` 저수준 변종을 더할 뿐이라 제보대로 고치면 도구가 311개로 폭증하면서 원인은 그대로 남는다. tier 게이트도 원인이 아니다 — `guardTool`은 목록을 거르지 않고 호출 시점에 throw하며 DEV는 무조건 통과. **레포 고정 스냅샷(mcp-surface.json)도 default 155 중 write 62로 같은 사실을 박제하고 있다.** → 엔진·인자 변경 없음.
  - ② **다만 제보가 겨냥한 상태는 v0.5.0부터 전 사용자 기본값이 된다**(D-062 ⑦ toolSurface — 미설정 프로젝트는 readonly). 즉 이 제보는 "지금 고쳐라"가 아니라 **릴리스 노트·안내의 우선순위 근거**로 읽는다. 제보자가 요청한 "쓰기 절차 스킬의 도구 선검사"는 채택 가치가 있으나 이번 범위 밖(백로그).
  - ③ **이슈 2(alias 불일치의 오류가 원인을 가린다) = 수리.** 인과는 실물이다 — 포인터만 프로젝트를 따라 이동하고 프로필 실체는 홈에 남아, 어긋나면 `MCP_ENV_PATH`가 안 잡히고 번들이 inspection-only로 떨어져 모든 호출이 `Basic authentication requires SAP_CLIENT to be provided`로 실패한다. 기존 `PROFILE_NOT_FOUND` 경고는 이름만 알렸다 → **실재 alias 목록 + 조치 위치 + "SAP_CLIENT는 헛다리"** 명시를 더했다(`launch.cjs`, 해석 로직 무접촉·readdir는 try/catch). 없는 alias 재현으로 실측.
  - ④ **이슈 3(ReloadProfile이 복구하지 못한다) = 수리, 단 "진짜 복구"는 불가로 판정.** 연결 파라미터가 없으면 launcher가 mock broker를 만들어 `new StdioServer(handlersRegistry, broker)`에 넘기고 프로세스 수명 동안 교체 경로가 없다 → in-process 복구는 아키텍처 변경이라 범위 밖. 제보자의 대안(재시작 필요를 명시)을 채택해 `restartRequired`+`note`를 반환한다(engine 4.14.2).
  - ⑤ **그런데 ④만으로는 실효가 0이었고 E2E가 그것을 잡았다 → 4.14.3이 진짜 뿌리.** `BaseMcpServer`의 wrappedHandler는 **전 도구**에 대해 `getConnection()`을 먼저 부르는데, 프로필이 틀린 상태에서 던지는 예외가 바로 그 인증 오류다 — 즉 **고쳐진 프로필을 읽어 들이라고 만든 도구가 핸들러 실행 전에 죽었고**, 4.14.2의 새 필드는 사용자에게 닿지 않았다. 제보자가 관찰한 "같은 오류 반복"의 실제 기전이다. ReloadProfile은 `context.connection`을 전혀 읽지 않으므로 이 도구에 한해 연결 열기를 건너뛴다(readonlyGuard가 같은 이유로 이미 둔 예외의 나머지 절반).
  - ⑥ **번들 반영 함정 박제**: `npm run bundle`의 엔트리는 `dist/server/launcher.js`(tsc 산출물)이라 `npm run build` 없이는 소스 변경이 번들에 들어가지 않는다. 4.14.2가 이 함정에 빠졌고 **jest는 소스를 보므로 green이었다.** UPDATE-RUNBOOK 절차 1을 `npm run build:bundle`로 고치고 "번들 grep이 가장 싼 검증"을 명문화했다.
- **검증**: E2E로 제보 시나리오 재현(없는 alias로 기동 → 서버 살아있는 동안 포인터 수정 → ReloadProfile) — **수리 전 인증 오류 / 수리 후 `ok:true · alias:IDES-DEV · restartRequired:true · note` 전문**. jest 729→**733 green/0 fail**(신규 4: 핸들러 양방향 2 + 연결 0회/1회 2, 기존 "DEV 전 도구 통과"의 연결 계수 −1 갱신 = 그 단언이 변경을 실제로 잡음). 게이트 전종 exit 0(스냅샷 재핀·links 817/0·rename·적합성 230·server-gates·smoke 155/65 불변·매니페스트 7종·verify-engine·provenance).
- **정직 유보**: ⓐ **제보자 환경에서 쓰기 도구가 실제로 안 보였다는 증상 자체는 재현하지 못했다** — 0.4.4는 이 머신에서 write 79개를 정상 노출한다. 그쪽 세션의 실제 기동 인자를 확인하지 않으면 원인 미상으로 남는다(관찰 불완전 가능성 포함). ⓑ in-process broker 교체 불가는 **코드 구조 판독**으로 결론냈다 — 교체 API를 신설하는 설계는 검토하지 않았다. ⓒ 제보자 부수 관찰(stderr 로그가 프로젝트/홈 두 곳·타임스탬프 부재)은 미수리 — 이 레포 `.sc4sap/state/mcp-stderr.log`도 07-12에 멈춰 있어 재현된다. ⓓ push 후 CI green은 다음 런에서 확인.
- **영향**: 수정 = `interactive/server/launch.cjs`(진단) · `engine/src/handlers/system/readonly/handleReloadProfile.ts` · `engine/src/server/launcher.ts` · `engine/src/server/BaseMcpServer.ts` · 시험 2본 · UPDATE-RUNBOOK · 번들 재핀(4.14.1→**4.14.3**) · **v0.5.1**. 불변 = 도구 표면 155/65 · 계수 178/22/17 · 연결된 서버의 ReloadProfile 출력(불필요한 세션 열기만 사라짐) · 트랙 A 무접촉.

## D-064 · 2026-08-03 · 실사용 교훈 승격 2차 — 4프로젝트 대조 · 엔진 백로그 13 등재(7건) + RAP 함정 지식 신설 · v0.5.2

- **맥락**: 사용자 요청 — 실사용 4곳(`JNC-DashBoard`·`ZUNIVAT_RAP`·`ZUNIVAT-MODI`·`ZUNIWTH`)의 `.sc4sap/` 교훈층(LESSONS·RULES)에 제품 반영분이 있는지 대조. D-058(1차)은 JNC 2곳만 소비했고 승격 표시를 원본에 남기지 않아(유보 ⓕ) 재대조가 전제였다. 대조 결과: **JNC-DashBoard는 대부분 반영 완료**(troubleshooting §8·정책 2본 실측 — 잔여는 묶음 3 그대로), **나머지 3곳(합계 L 36·R 36)은 첫 대조**. 가장 무거운 발견 2건 — ⑴ 교훈층에 **엔진층 결함 후보 7건**이 verified 상태로 축적돼 있는데 `UPSTREAM-FIX-HANDOFF` Known-remaining·HANDOFF §6 어디에도 없었다. ⑵ 제품이 RAP 도구군(Behavior/ServiceDefinition/ServiceBinding/MDE 계열)을 배포하면서 **RAP 함정 지식이 0**이었다 — `rap-eml.md`(549줄)는 문법 레퍼런스고, `use etag`·`facet`·`Edm.Boolean`·`IWBEP` 레포 grep 전부 0건. ZUNIVAT_RAP에서 그 공백의 실비용이 실측돼 있다(캐시를 모르고 멀쩡한 바인딩을 삭제·재생성, A2X URL을 보고 어노테이션 부재 오진 등 판정 3연속 오류).
- **결정**: 사용자 지정 범위 = **버그 등재 + RAP 반영**(전량 승격 아님). ① **HANDOFF §6에 엔진 백로그 13 신설** — 7건을 등재만 하고 전건 "판정 대기"로 명시(원 기록의 verified를 신뢰해 옮겼을 뿐 이 세션 재현 0건 · 판정→기각/수리는 UPDATE-RUNBOOK 별건 — D-058 유보 ⓓ의 "문서 우회와 수리는 별건" 원칙 + D-063 선례(제보 3건 중 ① 실측 기각). 판정 최우선 = RuntimeRunClassWithProfiling 스테일 로드(잘못된 쓰기 실행이 승인 절차를 사실상 우회 — P3 안전 모델 직결). ② **`core/knowledge/abap/conventions/rap-odata-rules.md` 신설**(신규 sapkit-native 파일 · 지식 178→179): ZUNIVAT_RAP R 17건에서 D-058 기준 ⓐ(일반 참만 — `T000-CCCATEGORY='C'` 메커니즘은 일반이라 수록, "이 시스템 클라이언트 700이 C" 류 시스템층은 제외)·ⓑ(도구 표면 함정은 지식 파일이 아니라 백로그로 — 지식 파일은 SAP 일반 사실만)를 적용해 BDEF 작성(마스터 조합·투영 etag 미상속·트리거 제약·additional save 후크 제한)·CDS 산물(SRVD 주석·DDLX facet 위치·변환 exit)·OData 표면(Edm.Boolean 도메인 매핑·백엔드 캐시 진단 순서·srvd/srvd_a2x 이중 저장소·계약별 표면차)·온프레미스 V4 발행(ADT 전용 차단 vs `/IWFND/V4_ADMIN` 정공법, Note 3101976)을 수록. 실측 기반 방법론 경고 2건 포함(부재 표본으로 금지 증명 불가 · "관측 도구가 맞는가"를 소거 후보에 넣을 것). ③ **배선(D-058 ⑤ — 호출 직전 문서 기준)**: `create-object.md` Mandatory Rule Reads에 RAP/OData 항목(modify-object는 이 목록을 명시 승계하므로 자동 커버) + `analyze-code.md` 규칙 표 1행. ④ **v0.5.2 범프**(신규 자산 1 — D-056 선례: 파일 신설은 범프, D-058 선례: 기존 보강만이면 유지).
- **검증(이 세션 실측)**: 게이트 9종 exit 0 — 이식 스냅샷 **재핀 후 통과**(conventions tree 20→21, pin·roots 36·inventory 487 불변 = 원본 무접촉 · 이 머신은 원본 보유 머신이라 재핀 가능) · links **821/0**(289 md) · rename · conformance-runtime-dir · smoke **155/65 불변** · conformance-server-gates · verify-engine **4.14.3 불변** · engine provenance · manifests 7종·자산 수 일치. doctor: FAIL 1 = Antigravity 설치 1.1.1 ≠ 고정 1.1.4 — **이 변경과 무관한 기존 로컬 상태**(compatibility 재검증 별건), WARN = 캐시 0.5.1 vs 레포 0.5.2(재설치 전 정상).
- **대안·기각**: (a) RAP 함정을 `rap-eml.md`에 병합 — 이식 트리(`reference/` 31파일) 내부 수정 + 문법서에 함정 편 혼입으로 정체성이 섞인다, 신규 파일 분리 채택. (b) 도구 함정(패치 소실·RunUnitTest 무결과 등)을 지식 파일에 수록 — 기준 ⓑ 위반(엔진을 고치면 사라질 내용이 SAP 지식으로 박제됨), 백로그로만. (c) troubleshooting §8 확장·ZUNIWTH ABAP 작법층(CURR 100배 등)·묶음 3 동시 처리 — 사용자가 범위를 "버그 등재 + RAP"로 지정, 다음 후보로 유보. (d) UPSTREAM-FIX-HANDOFF Known-remaining에 직접 등재 — 그 절은 "reference HANDOFF §6 대조로 확정된" 결함 목록이라 미판정 제보를 섞으면 성격이 흐려진다, HANDOFF §6 백로그(판정 대기 명시)로.
- **정직 유보**: ⓐ **백로그 13은 재현 0건** — 전부 원 프로젝트 기록(2026-07-27~31, S/4 757 계통)의 verified 문구를 신뢰한 이전이다. 특히 ②(RunUnitTest)는 4.13.1/4.13.11의 IDES 라이브 green 이력과 상충하므로 시스템 조건 분리가 판정 쟁점이다. ⓑ **RAP 지식의 실효 미측정** — 로드 경로에 올렸다는 것이지 에이전트가 함정을 실제로 피한다는 증거가 아니다(D-058 ⓗ 동일). 첫 RAP 실사용이 시험대. ⓒ **승격 표시를 원본 프로젝트에 남기지 않았다**(D-058 ⓕ 동일 — 읽기 전용 원칙 유지). 이 D-064가 대조 기록이므로 다음 대조는 여기서 시작하면 된다. ⓓ **미승격 잔여를 명시한다**: ZUNIWTH ABAP 작법층(CURR 100배·EXCEPTIONS 트랩·xlsx·CUA/ALV — R-013 ①은 wave24 검증 대기) · 묶음 3 · ZUNIVAT-MODI 소소분(RAWSTRING NOT NULL·CheckSyntax source_code 패턴·abapGit zip 전체 상태) · troubleshooting §8 도구 함정 확장. ⓔ **배포 반영 0** — push + 재설치 전이며 이 세션의 캐시본(0.5.1)에는 이 지식이 없다. ⓕ 독립 리뷰 미수행.
- **영향**: 신설 = `interactive/core/knowledge/abap/conventions/rap-odata-rules.md`. 수정 = `HANDOFF.md`(§6 백로그 13 + 재개점) · `interactive/core/procedures/create-object.md`(RAP 규칙 read 1항) · `interactive/core/procedures/analyze-code.md`(표 1행) · `interactive/plugin-metadata.json`(v0.5.2) · 생성물 7종 · `provenance/migration-map.json`(재핀) · 이 항목. **불변** = 엔진·번들 무접촉(4.14.3) · 도구 표면 155/65 · vsp 무접촉 · 실데이터 게이트(P2) · attended-only · unattended=sealed · ENGINE template-only · 이식 pin · MIGRATION-MANIFEST 분류 · 사용자 프로젝트 무접촉(읽기 전용).

## D-065 · 2026-08-03 · 실사용 v0.5.1 제보 3건 판정 — ②수리(안내문 경로) · ①문서 반영+백로그 · ③기각·재분류(도구는 실재, 이정표가 부재)

- **맥락**: `ZUNIVAT_RAP\output\escalations\sapkit-v0.5.1-feedback.md` — v0.3.9→v0.5.1 업그레이드 직후 세션 1회 전손 보고(쓰기 도구 전부 소실 → 가설 3회 실패 → BIL 수리 착수 불가). D-063 원칙 그대로 **제보 진단을 그대로 반영하지 않고 실물 대조 먼저** — 그 판단이 이번에도 셋 중 하나(③)를 뒤집었다. 부수 실증: 같은 원인으로 소유자 머신의 **전 프로젝트가 업그레이드 후 일제히 74도구**(연결된 readonly = 65+연결시 read 9)가 됐고, 이 판정 세션 자체도 74도구로 돌고 있었다.
- **판정**: **① toolSurface 조용한 잠금 = 증상 사실, 기본값은 의도 설계, 공백 3건 실재.** readonly 기본은 D-062가 명문으로 예견·선택한 것("조용한 write 유지보다 안전한 축소를 택한다" — 설계 §7-1). 실재하는 공백 = ⓐ 기존 프로젝트 이관 부재(설문은 setup Step 3 안에만 있어 업그레이드 사용자는 질문 자체를 못 받음) ⓑ 경고가 stderr 전용(에이전트 불가시 — 제보자가 "도구 목록에 없다" 하나로 설치 파손·권한·tier와 구분 불가) ⓒ troubleshooting에 toolSurface 항목 부재(§4는 tier만). 처방: ⓒ는 이번에 반영(§1 실패표 1행 + §4 *Tool surface* 절 신설 — tier 가드와의 감별법 명시), ⓐⓑ는 **플러그인 백로그**(§6 말미 신설 — 자동 이관은 D-062 원칙과 긴장 관계라 별도 D-결정 필요). 제보 각주의 "D-063 ① 재검토" 제안은 **불성립** — 그 제보자는 0.4.4였고 toolSurface는 v0.5.0 신설이라 시점이 안 맞는다(D-063이 "미래에는 맞는 말"로 이미 예견, 이번 제보가 그 미래의 첫 실증). **② TOOLSURFACE_DEFAULT 안내문 오지시 = 사실, 수리.** `launch.cjs:331`이 `<project>/.sapkit/config.json`을 하드코딩하는데 `readToolSurface`(:223)는 selectedDir가 있으면 그 세대만 읽는다 — 레거시 `.sc4sap` 프로젝트가 안내를 따르면 아무 효과가 없는 죽은 지시. 수리 = 지시 대상을 `surface.file`(키만 없는 기존 config) > `selectedDir/config.json`(선택된 세대) > 양쪽 후보 병기(세대 미해석) 순으로 렌더. 제보의 부속 주장 "안내를 따르면 `.sapkit/` 생성으로 세대가 뒤집힐 위험"은 **과잉 우려로 판정** — `candidateFrom`(:145)은 `active-profile.txt`/`sap.env`만 보고 config.json은 세대 판정에 관여하지 않는다. **③ BIL 구현부 read-back 부재 = 기각, 발견가능성 결함으로 재분류.** 판독 도구는 실재한다 — `GetLocalTypes`가 implementations include(CCIMP)를 읽는다(설명문 명시). 3중 확인: 소스 핸들러 존재+엔진 편입 커밋 이후 무수정(파일 이력 1커밋) · 현행 번들 포함(grep 13) · 기본 155 표면 등재(`mcp-surface.json`) — 제보자가 v0.3.9로 일하던 내내 사용 가능했다. 제보자가 시험한 직관적 이름 6종이 전부 빈 껍데기/500/무결과를 주면서 정답을 안내하지 않은 것이 실체(제보문 스스로 "GetLocalTestClass·GetLocalDefinitions 패턴이 이미 있다"고 쓰고도 세 번째 형제를 못 봄 — 이름 함정의 강도를 방증). 처방 = troubleshooting §8 이정표 항목(이번 반영) + 엔진 백로그 13-8(도구 설명문 역참조·`GetInclude` CCIMP 500 정직화·`GrepObjects` main-only 명시 — 재번들 동반 별건).
- **검증(이 세션 실측)**: `test-launch-toolsurface.mjs` **58/58**(신규 단언 5 — 레거시 세대 지시·`.sapkit` 미지시·기존 config 파일 지시·세대 미해석 양쪽 병기) · 게이트 전종 exit 0(이식 스냅샷 재핀 — procedures tree 내 troubleshooting.md 편집분 · links · rename · 적합성 · smoke 155/65 불변 · server-gates · verify-engine 4.14.3 불변 · provenance · manifests).
- **대안·기각**: (a) 안내문에 항상 양쪽 세대 경로 병기 — 세대가 확정된 프로젝트에 오답 후보를 남긴다, 세대 미해석일 때만 병기로 한정. (b) ①ⓐ 자동 이관을 이번에 집행 — "업그레이드가 조용히 잠근 것"을 "업그레이드가 조용히 여는 것"으로 뒤집는 셈이라 D-062 원칙과 정면 긴장, 설계 검토 없이 불가, 백로그. (c) ③ 엔진 설명문 수리 동시 집행 — 도구 표면 문자열 변경 = 재번들·smoke 스냅샷 갱신 동반, UPDATE-RUNBOOK 경로 별건으로 분리.
- **정직 유보**: ⓐ **`GetLocalTypes`의 실동작은 미실측** — 존재·표면·설명문·이력 확인까지다. 제보자 시스템의 BIL 대상 read-back 성공은 회신 시 실측을 요청할 것. ⓑ ①ⓐⓑ 미해결 상태로 다음 업그레이드 사용자도 같은 함정을 밟는다 — 회신·릴리스 노트가 유일한 완화. ⓒ 이 세션에서 ENGINE 잔재 훅(`tdd-guard.py`)이 launch.cjs Edit에 ask를 걸어 수리 흐름이 한 번 끊겼다 — 제거 편집은 분류기가 차단(가드레일 자가 해제 방지 — 올바른 차단)해 사용자 손에 넘겼다, 별건. ⓓ 버전 v0.5.2 유지 — 미배포 누적분이라 범프 불요(설치본 0.5.1 대비 업데이트 게이트는 충족, D-060). ⓔ 제보 회신은 미발송 — ③의 "GetLocalTypes를 쓰라" + ①의 열쇠 절차가 회신 골자.
- **영향**: 수정 = `interactive/server/launch.cjs`(안내 target 렌더) · `interactive/scripts/test-launch-toolsurface.mjs`(+5 단언) · `interactive/core/procedures/troubleshooting.md`(§1 표 1행 · §4 Tool surface 절 · §8 이정표 항목) · `HANDOFF.md`(백로그 13-8 · 플러그인 백로그 신설 · 재개점) · `provenance/migration-map.json`(재핀) · 이 항목. **불변** = 엔진·번들 무접촉(4.14.3) · 도구 표면 155/65 · 자산 계수(지식 179) · v0.5.2 · 실데이터 게이트 · attended-only · 사용자 프로젝트 무접촉(제보 파일은 읽기만).

## D-066 · 2026-08-04 · execution_owner 발동 구조 수리 — 결정론 해석·기본 위임(Claude)·디스패치 의무화 + 리뷰어 소유권 정합 (v0.5.3)

- **맥락**: 사용자 실사용 제보 "여러 프로젝트에서 개발착수 때 서브에이전트 호출이 전혀 없다 — 메인 컨텍스트 조기 고갈". 실사로 소거: 설치본은 0.5.2 단일 캐시(전 프로젝트 공유)이고 D-051 배선(Step 1b·sap-worker) 실재 — 버전·파일 부재가 아니다. 원인은 확정이 아니라 유력 가설 3겹(발동 퍼널 미관측 — Codex 검토 지적): ⑴ Step 1b 자가해석 탈출구("a value you resolved yourself without asking is auto") + 모델의 자기실행 중력 → 무표시·무고지 main ⑵ owner가 delegated로 풀려도 Phase 4는 "may run"(비강제)이고 스폰 문법이 절차 밖(README 링크 — 라이브에서 링크 추종이 안 일어남) ⑶ resume이 Phase 0–3.5를 우회해 owner 미해석. 보증 등급표("Procedural — the model may skip or misapply it")·D-052 ⓒ(문서 지시 발동률 미검증)가 예고한 실패 모드의 첫 실측. 설계 = 초안 v1 → **Codex(gpt-5.6-sol·reasoning=max·read-only) 교차 검토 "조건부 OK"(BLOCKING 6·SHOULD-FIX 5·NIT 3)** → 전건 원문 대조(반증 0) 후 v2 반영(`docs/reference/designs/2026-08-04-execution-owner-activation.md`). 검토가 잡은 v1 결함: 원인 확정 과잉 · P2/P4 "기계 차단" 과장(실제는 MCP 4이름 — vsp query 셸 경로는 기계 밖) · config "README 1줄" 오판(setup-state CONFIG_KEYS allowlist 정합 필요 실측) · 고지 후 같은 턴 스폰이면 번복 불가 · **리뷰어 계약의 실재 모순 발굴**(sap-reviewer.md·review-checklist.md가 "worker가 request 준비·result 기록" ↔ 정본 development-loop은 main 전용). 지배 제약(사용자 명시) = **더 무거워지지 않을 것 — 기능만 잘 되게**.
- **결정**: ① **Full(create-program) 소유자 해석 결정론화** — explicit(사용자 명시) > default(**워커를 무개입 호출 가능한 어댑터 = delegated**(Claude, 동봉 `sapkit:sap-worker`) / 수동 새 세션 어댑터 = main(Codex·AG)). 판정 기준은 capability(지금 호출 가능한가)이지 파일 존재가 아니다. 별도 질문 삭제 — 해석 결과를 기존 Phase 3.5 Step 1(mode) 프롬프트에 1줄 편승, 같은 응답에서 번복(explicit 기록), **응답 전 디스패치 금지**. owner-`auto`는 Full에서 값·출처 양쪽 소멸(Standard/Minimal의 요청값으로만 존속 — development-loop 개정). resume: persisted owner 존중(재계산 금지), owner 없는 구 state는 재개 시 1회 해석·고지·기록. ② **delegated면 Phase 4 MUST dispatch** — 메인 대리 구현은 계약 위반. 실행체 인라인 명명("README 가서 읽어야 아는" 구조 제거 — 기동 문법 정본은 어댑터 README 유지, 코어 중복 금지). 기동 실패 fail-closed: default→main 폴백+고지+`effective_owner` 기록 / explicit→침묵 폴백 금지·중단·지시 대기. 시작 후 번복 = 취소가 아니라 중단+실상태(PROVISIONAL_WRITE 포함) 보존·보고. ③ **Phase 6 리뷰어 동일 수리** — 실행체 명명(`sapkit:sap-reviewer`/새 세션) + "main이 체크리스트를 직접 수행 = fresh reviewer context 아님 = 게이트 미충족" 명문(v1의 "자기 리뷰" 표현은 delegated 런에서 부정확 — 교정) + 컨트롤 아티팩트 소유 모순 교정(worker→main, 수정 적용 주체는 "implementation owner"로 중립화) + sc4sap-lite 잔재 개명. ④ **경계 정밀화** — 기계 차단의 정확 범위 명문(MCP 4이름 한정), sap-worker 절차 경계 3→4(셸 `vsp query` 금지 = P2 main 전용), transport 등록(Create*의 transport 인자)=P3 워커 몫 / 라이프사이클(생성·패키지 할당·릴리스·임포트)=main 확정. ⑤ **config 슬롯 이연** — setup 정합 비용(CONFIG_KEYS·정본 필드 표·테스트)이 지배 제약과 충돌. 재개봉 트리거 = "매 런 main 지정" 마찰 실관찰(D-051 (c) 재검토 조건 승계). ⑥ **선행 canary(코드와 별개, 사용자 실사용)** — 첫 Full 런에서 explicit delegated 1회: 가설 판별(선택 실패 vs 디스패치 실패) + D-051 ⓐ 조건부 종결(**비허용 도구 호출이 실제 발생한 런에서만** 프롬프트 라우팅 확인 — permissions-template 병합 환경에선 P3가 원래 무프롬프트) + D-040 증분 측정(main 소비·전체 토큰·wall time·프롬프트 수·spawn 성공률). Claude README E2E 체크리스트를 위임 ①~⑤ 단계로 분해해 실패를 단계 귀속 가능하게 했다.
- **대안·기각**: (a) 문구 강화만("MUST display") — 같은 Procedural 등급 미세조정, 재발. (b) 훅 기계 강제 — 훅 0개 기본(안전 정본=서버 게이트) 위반 + 3사 격차 확대 + 무게 증가. (c) setup 질문 추가 — 설치 부담 증가(지배 제약 위반). (d) Phase 2 탐색 위임 동시 도입 — 절감 폭 최대이나 신규 기능·리뷰 표면 증가, 후속 후보로만. (e) 프롬프트 유지 + 기본만 [2] — "표시가 안 된다"가 실측인데 표시를 전제로 한 수리. (f) 3사 전부 delegated 기본 — Codex/AG에 매 런 수동 새 세션 강요 = 오히려 무거움. (g) config 슬롯 1차 포함 — (⑤ 근거). (h) canary 없이 즉시 반전만 — 선택/디스패치/활성 미판별 채 수리 지점 고정 + ⓐ 위험 수용 무근거 확대 → canary를 결정에 편입해 회피.
- **정직 유보**: ⓐ **D-051 ⓐ 미종결 상태의 기본값 반전** — D-051이 그 미실측을 이유로 기본 main을 택했으므로 이는 명시적 번복이다(수용 조건: attended parent 유지·백그라운드 위임 금지·기동 실패 fail-closed). canary가 조건부 종결. ⓑ 토큰 절감·작업 1건 증분 미측정(D-040 §896 — baseline 전 합격 선언 금지 준수, "고정 +0"도 예상치일 뿐). ⓒ **이 수리도 Procedural이다** — 실패 표면 3단(표시→선택→README 추종→스폰)→1단(스폰) 축소 + 가시성 1줄(미발동의 관찰가능화)이 전부이며 모델 무시 가능성은 남는다, 보증 등급표 무변. ⓓ Codex/AG 위임은 이 수리로 늘지 않는다(수동 세션 현실 — 어댑터 README에 격차 정직 병기). ⓔ 발동률 개선의 실증은 canary·도그푸딩 몫 — "관측 spawn 0회"의 분모(적격 Full 런 수)도 미확정이었다. ⓕ **반영본(집행 diff)의 새-컨텍스트 독립 리뷰 미수행** — 설계 단계 Codex 검토(BLOCKING 6 전건 반영)는 수행했으나 집행 diff 자체는 미리뷰.
- **영향**: 수정 = `core/procedures/create-program.md`(Step 1b 결정론·Step 1 편승·Phase 4 의무화·Phase 6 명명·state 스키마 `selection_source: explicit|default`+`effective_owner`·Resume 구 state 조항) · `core/policies/development-loop.md`(Full/Standard·Minimal 해석 분리·vsp query·transport 경계·폴백 개정) · `agents/sap-worker.md`(절차 경계 4·transport 등록=P3) · `agents/sap-reviewer.md`·`core/procedures/review-checklist.md`(worker→main·sapkit) · 어댑터 README 3본(기본값 서술·Claude E2E 위임 ①~⑤ 분해) · `interactive/DESIGN.md` §3-7(D-066 현행화 + §2 "자동 디스패치 폐기"와의 효력 관계 명시) · `plugin-metadata.json` 0.5.2→**0.5.3** + 매니페스트 재생성 · 이식 스냅샷 재핀 · 신설 = `docs/reference/designs/2026-08-04-execution-owner-activation.md`. 커밋 3분할 = 코어 `ccc2f5d` · 리뷰어 `7fa017d` · 문서·범프(이 커밋). **불변** = 품질 모델(1작업+1새컨텍스트리뷰+기계검증) · 실데이터 게이트(P2) · attended-only(D-025) · unattended=sealed · ENGINE template-only(D-040) · 번들/엔진/vsp 무접촉(4.14.3) · 도구 표면 155/186 · 보증 등급표 · MIGRATION-MANIFEST 분류.

## D-067 · 2026-08-04 · 루트 라이선스 정본화 — 대문 LICENSE 신설(MIT·상류 고지 승계) + GPL-3.0 31파일 미규명 등재

- **맥락**: 사용자 질문 "루트 README에 라이선스 MIT라고 되어 있는데 내가 별도로 요청한 기억이 없다". 실사 4건. ⑴ **루트에 `LICENSE` 파일이 없다** — `README.md:42`가 "라이선스 MIT."라고 주장하는데 근거 파일이 대문에 없었다(주장-실물 불일치). 그 문장의 출처는 루트 README 신설 커밋 계열(`1a59d341` 2026-08-02 신설 → `7834d4cb` 제거 → `cd17f94f` 08-03 재신설)이며, **라이선스 선택 자체를 결정한 세션은 없다** — MIT는 고른 것이 아니라 차용한 상류 전부가 MIT여서 따라온 것이다. ⑵ **LICENSE 3종 전부 상류 저작권자**이고 사용자 명의 표기가 레포 어디에도 없었다: `interactive/LICENSE`(paek seunghyun · 2026.04.14) · `engine/LICENSE`(백승현 Paek Seunghyun) · `vsp/LICENSE`(Alice Vinogradova and contributors · `oisee/vibing-steampunk` 포크). ⑶ **MIT의 유일한 의무가 고지 유지**이므로 이 3파일은 제거 대상이 아니라 **보존 대상**이다 — `interactive/README.md:46`의 "MIT(LICENSE) (업스트림 `babamba2/superclaude-for-sap` 고지 승계)"는 근거 파일이 옆에 있어 정확하다. ⑷ **별건 발견 — 배포물 안에 GPL-3.0 선언이 있다**: `core/knowledge/abap/reference/SKILL.md:10` frontmatter `license: GPL-3.0` + 같은 디렉터리 `README.md:214`("GPL-3.0 License - See LICENSE file in repository root", 출처는 `SAP-samples/abap-cheat-sheets`로 기재). 해당 디렉터리 추적 파일 **31건**이며 `interactive/THIRD_PARTY_NOTICES.md`는 GPL을 **한 줄도 언급하지 않고** 지식 원천 전체를 "MIT 승계"로 서술한다 = MIT로 마켓플레이스 배포 중인 v0.5.3 안의 고지 공백.
- **결정**: ① **루트 `LICENSE` 신설** — MIT 표준 전문 + 저작권자 `Copyright (c) 2026 Hong Jaewon`. 하단에 **`## Upstream notices (retained, not superseded)`** 절을 붙여 3서브트리(`interactive/`·`engine/`·`vsp/`)의 상류 고지 파일을 표로 지시하고 "위 고지가 그것들을 대체하지 않는다"를 명문화 — 대문 저작권 라인이 상류 고지를 삼키는 오독을 막는다. 컴포넌트 단위 귀속은 기존 `interactive/THIRD_PARTY_NOTICES.md`로 위임(중복 정본 금지). ② **`README.md:42`는 유지하되 링크화** — `라이선스 [MIT](LICENSE) — 상류 고지 승계.` 주장과 파일이 같은 자리에서 맞물린다. ③ **하위 LICENSE 3종·`interactive/README.md`·THIRD_PARTY_NOTICES 본문 무접촉** — MIT 고지 의무 대상이므로 손대지 않는다. ④ **GPL-3.0 31파일은 이번에 판정하지 않는다** — 출처 규명이 선행이며(상류가 무심코 복사한 오기인지, 실제 GPL 저작물인지) 미규명 상태의 어느 판정도 잘못된 고지를 고착시킨다. HANDOFF 백로그에 등재만 한다.
- **대안·기각**: (a) **README 한 줄 제거만**(사용자 제시 B안) — 부정확한 주장은 사라지나 공개 배포물의 사용 권한 근거가 하위 디렉터리에만 남아 대문에는 허가증이 없는 상태가 된다(저작권 기본값 = 전권 유보). 사용자가 A안 선택, 기각. (b) **루트 LICENSE에 GPL 예외를 즉시 명기** — 결정 ④의 미규명 상태에서 선언하면 오기일 가능성을 정본에 박는다, 기각(규명 후). (c) **`interactive/LICENSE`를 사용자 명의로 교체** — MIT 고지 의무 위반, 기각. (d) **GPL 31파일 즉시 제거로 충돌 선제거** — 지식 코어 31파일의 실효를 미규명 근거로 버리는 과잉 대응이고 되돌리기 비싸다, 기각.
- **정직 유보**: ⓐ **GPL-3.0 31파일 충돌 소지는 이 결정으로 해소되지 않는다** — MIT 배포는 계속되며 고지 공백도 그대로다. 알고 미룬 것이다(백로그). ⓑ **저작권자를 개인 명의 `Hong Jaewon`으로 적었다** — git 설정 이름 기준이며, 고용 저작물(회사 귀속) 여부는 확인하지 않았다. 회사 귀속이면 정정 대상이다. ⓒ **`engine/LICENSE`(백승현 단독)와 `engine/README.md:774`(백승현 & Oleksii Kyslytsia) 저작권자 불일치** 실측 — 어느 쪽이 맞는지 미규명, 이번 범위 밖으로 무접촉. ⓓ **법률 검토가 아니다** — 파일 실측과 라이선스 문면에 근거한 문서 정비이며 변호사 판단을 대체하지 않는다. ⓔ 독립 리뷰 미수행(P0 문서 작업).
- **영향**: 신설 = `LICENSE`(루트). 수정 = `README.md`(42행 링크화) · `docs/reference/DECISIONS.md`(이 항목) · `HANDOFF.md`(GPL 백로그 등재). **코드·번들·매니페스트·이식 스냅샷·버전 전부 무접촉**(범프 없음 — v0.5.3 유지). **불변** = 하위 LICENSE 3종 · `interactive/THIRD_PARTY_NOTICES.md` · MIT 고지 승계 구조 · 품질 모델 · 실데이터 게이트 · ENGINE template-only(D-040) · MIGRATION-MANIFEST 분류.

## D-068 · 2026-08-04 · GPL-3.0 31파일 규명 — 오기 아님(실제 GPL 저작물) · 고지 정직화 집행 · 재작성은 백로그 (D-067 ⑷ 정정)

- **맥락**: D-067이 백로그로 넘긴 건을 사용자 요청("해줘")으로 즉시 규명. **결과는 D-067의 전제를 뒤집는다 — 이 항목은 그 정정이다.** D-067 맥락 ⑷·유보 ⓐ와 HANDOFF 블록은 "출처로 기재된 `SAP-samples/abap-cheat-sheets`가 Apache-2.0 계열이니 GPL-3.0 표기는 **상류 오기일 가능성**이 있다"를 유력 가설로 적었다. 실측 결과 **원자료가 Apache-2.0인 것은 사실이지만 그것이 GPL 표기를 오기로 만들지 않았다** — 실제 GPL-3.0 저작물을 경유해 들어왔다. 규명 체인 5건: ⑴ 이식 출처 = `migration-map.json:178` `skills/sap-abap/**` → `core/knowledge/abap/reference/`, **`class: copy`**(개작 없는 바이트 사본), `source_matches: 31` + `MIGRATION-MANIFEST.md:36` 동일 기재. ⑵ 우리 `SKILL.md` frontmatter = `name: sap-abap` · `license: GPL-3.0` · `mcpmarket-version: 1.0.0`. ⑶ **실질 원천 = `secondsky/sap-skills`** — README 원문 "Open source under GPL-3.0", 40플러그인 중 `sap-abap` 실재(웹 확인). ⑷ **결정적 지문** — 우리 `SKILL.md:20-24` Related Skills 5개(`sap-abap-cds`·`sap-btp-cloud-platform`·`sap-cap-capire`·`sap-fiori-tools`·`sap-api-style`)가 **전부 secondsky 플러그인 목록의 이름과 일치**(다른 출처에서 이 조합은 나오지 않는다). ⑸ 내용 원자료는 확인대로 Apache-2.0(각 파일 3행 `**Source**:` 링크, 예 `internal-tables.md:3` → `01_Internal_Tables.md`). **사용자 제공 사실**: "sc4sap-custom 자체가 babamba2 걸 그대로 가져와서 약간 손봤을 뿐" — 즉 이 31파일에 사용자 개작이 없고 `class: copy`와 정합한다. 따라서 **성격은 우리가 만든 결함이 아니라 상류 고지 오류의 승계**다(MIT 레포 `babamba2/superclaude-for-sap`가 GPL 저작물을 담고 있었고, `THIRD_PARTY_NOTICES.md:7`의 "지식 원천 전체 = MIT 승계"는 그 MIT 선언을 근거로 쓰였다). **다만 승계는 면책이 아니다 — 현재 배포 주체는 sapkit이다.**
- **결정**: ① **고지 정직화만 지금 집행**(4옵션 중 1) — `interactive/THIRD_PARTY_NOTICES.md` 표에 GPL 서브트리 행 신설 + 기존 지식 원천 행에 "아래 GPL 서브트리 제외" 단서 + **`## GPL` 절 신설**(계보 도식·확정 근거·미확정·해소 경로). 절 첫 문단에 **"이 절은 사실을 은닉하지 않기 위한 기록이며 충돌의 해소가 아니다. 처분은 미정이다"**를 명문화 — 고지가 해결로 오독되는 것을 막는다. ② **`SKILL.md:10`의 `license: GPL-3.0`은 유지** — 사실이므로 그것이 정확한 고지다(제거가 곧 은닉). ③ **재작성(옵션 2)은 백로그** — 해소 경로는 확인됐다(GPL은 secondsky의 편집·구성 **표현**에만 미치고 ABAP 문법 사실에는 미치지 않으며, 원자료가 Apache-2.0으로 공개돼 있어 원자료에서 재구성하면 Apache-2.0 파생 = MIT와 무충돌). **함정을 백로그에 못박는다: 항목 선별·순서·구성을 그대로 두고 문장만 고치는 것은 재작성이 아니다**(여전히 편집 저작물의 파생 — 작업을 다 하고 문제가 남는 실패 모드). 규모 = 31파일 · 지식 코어 178의 17% · 원본 34문서 대조 = 별도 세션.
- **대안·기각**: (a) **31파일 즉시 제거** — 충돌은 즉시 해소되나 해소 경로가 확인된 상태에서 지식 17%를 버리는 과잉이고 되돌리기 비싸다, 기각(재작성 실패 시 후보로 존속). (b) **전체 GPL-3.0 전환** — 나머지 상류가 MIT라 편입은 합법이나 제품 라이선스 정책 대전환이며 31파일이 그 대가를 정당화하지 않는다, 기각. (c) **고지 없이 배포 계속**(백로그만 유지) — 잘못된 고지("MIT 승계")를 알면서 유지하는 것이라 은닉에 해당, 기각 — 이것이 이번 집행의 직접 근거다. (d) **secondsky에 MIT 재라이선스 요청** — 타인 의사에 의존해 처분이 무기한 미정이 된다, 기각(병행은 가능). (e) **`SKILL.md`의 GPL frontmatter 삭제로 표면 정리** — 사실 은닉이며 상황을 악화시킨다, 기각.
- **정직 유보**: ⓐ **충돌은 해소되지 않았다** — MIT 선언과 GPL 저작물이 같은 배포물에 병존하는 상태는 그대로이며, 이 결정은 그것을 문서로 정확히 기술한 것뿐이다. 배포는 계속된다. ⓑ **법률 검토가 아니다** — 라이선스 문면·파일 실측·웹 원문에 근거한 공학적 판정이며 변호사 판단을 대체하지 않는다. 배포 규모가 커지면 실제 검토가 필요하다. ⓒ **문서 저작물에 대한 GPL 전염 범위는 코드보다 불확실하다** — 31파일은 마크다운이고 링크·컴파일 개념이 없어 "결합물" 판정이 애매하다. 이 불확실성에 기대어 무해하다고 결론내지 않았다(그래서 고지를 적었다). ⓓ **babamba2의 수령 경로 미확정**(secondsky 직접 vs `mcpmarket` 경유) — 처분 무영향으로 판단해 추적을 중단했다. ⓔ **babamba2·secondsky에 이 사실을 통보하지 않았다** — 상류 고지 오류 제보는 별건이며 사용자 판단 사항. ⓕ 31파일 전수의 내용-원자료 대응은 표본 1건(`internal-tables.md`)만 확인했다 — 전수 대조는 재작성 세션의 첫 단계다. ⓖ 독립 리뷰 미수행(P0 문서 작업).
- **영향**: 수정 = `interactive/THIRD_PARTY_NOTICES.md`(표 2행 + `## GPL` 절 신설) · `docs/reference/DECISIONS.md`(이 항목) · `HANDOFF.md`(D-067 블록의 "오기 가능성" 서술 → 규명 결과로 갱신 + 재작성 백로그 등재). **코드·번들·매니페스트·이식 스냅샷·버전 무접촉**(v0.5.3 유지 — `THIRD_PARTY_NOTICES.md`는 이식 목적지가 아니라 sapkit 자체 문서이므로 provenance 게이트 무관, 실측 확인). **불변** = `SKILL.md` frontmatter 포함 31파일 **전량 무접촉**(고지만 추가) · 루트 LICENSE(D-067) · 하위 LICENSE 3종 · MIGRATION-MANIFEST 분류 · 품질 모델 · 실데이터 게이트. **알려진 잔재**(범위 밖·무접촉): `THIRD_PARTY_NOTICES.md` 3행의 구 이름 `sc4sap-lite` — D-066 ③ 개명 누락분.

## D-069 · 2026-08-06 · 실사용 교훈 승격 3차 — 5프로젝트 대조 · 엔진 백로그 7건 등재+5건 보강 · ABAP 작법 지식 이관(기존 6곳 보강·신설 0) · troubleshooting §8 확장

- **맥락**: D-064(2차)가 유보 ⓓ로 명시한 미승격 잔여(ZUNIWTH ABAP 작법층 — CURR 100배·EXCEPTIONS 트랩 · 묶음 3 — FM 시그니처 비대칭·TFDIR 확인 · ZUNIVAT-MODI 소소분 — RAWSTRING NOT NULL·CheckSyntax source_code·abapGit zip 전체 상태 · troubleshooting §8 도구 함정 확장)의 소비 + D-064 대조 이후 축적분의 첫 승격(ZUNIVAT_RAP L-026~L-034(2026-08-03~04) · ZUNIWTH L-011(2026-08-05) · **JNC는 5번째 프로젝트로 첫 대조** — L-001~L-004, S4H/client 100 = 두 번째 시스템 교차 재현원). 원칙은 전부 승계: **등재/이관만**(판정·수리는 UPDATE-RUNBOOK 별건 — D-063 선례), 원본 프로젝트 **읽기 전용**(승격 표시 없음 — D-058 ⓕ·D-064 ⓒ), 승격 기준 3개(D-058 — ⓐ 일반 참만·시스템 종속 사실 제외 ⓑ 도구 표면 함정은 지식이 아니라 백로그로 ⓒ 기존 항목은 보강 분리), 배치 = **호출 직전에 읽히는 문서**(D-058 ⑤).
- **결정**: ① **HANDOFF §6 엔진 백로그 13에 13-9~13-15 신규 7건 등재** — ⑨ `GetSqlQuery` wide-SELECT(경계 18~28컬럼 사이)에서 WHERE 통째 무시·무관 앞 N행이 success로 반환(징후 3종: 술어 불만족 행·truncated+정확히 row_number개·execution_time 0.8s 붕괴) — 침묵 실패가 아니라 **그럴듯한 오답**이라 P2 판단·쓰기 게이트 승인 문서 오염 가능, **13-1과 동급 판정 최우선 후보로 명기** ⑩ `UpdateBehaviorImplementation` 실패 스테이징본 교착(탈출 = `UpdateLocalTypes` → BDEF 먼저 활성 → `ActivateObjects`) ⑪ `UpdateLocalTypes(activate_on_update:true)` 거짓 성공(판정 = `GetInactiveObjects` 잔류 0 + read-back) ⑫ `UpdateBehaviorDefinition` 백틱 ×4 증식(`UpdateView`는 정상 — BDEF 쓰기 경로 고유) ⑬ `GetIncludesList`가 `INCLUDE ... IF FOUND` 비실재 객체명 반환 ⑭ `UpdateLocalTypes` 전문 재전송 한계(1490줄/67KB/~40k 토큰 실측 — 대상이 크면 조용히 사용 불가, 패치 경로 부재) ⑮ CLAS 쓰기 `transport_request` 누락 시 CTS 잠금 메시지로 오도(PROG의 corrNr 400 명시 실패와 비대칭). ② **기존 5건 교차 보강** — 13-2(해소 방향 증거: 2026-08-03 v0.5.1/engine 4.13.11 `/testruns` bridge에서 KR-DEV 17/17 = 사용자 ADT 일치, ZUNIVAT_RAP R-011 같은 날 취소선 폐기 — 판정 시 해소 확인부터) · 13-3 ⓐ항(매 건 `activate:true`+`GrepObjects`면 CLAS 연속 패치 안전 — 6건 연속 실증, "전체교체" 처방 완화 + 메커니즘 확정: 패치는 비활성본 기록·다음 패치가 활성본 fetch) · 13-4(JNC L-004 두 번째 시스템 재현 + L-003 신규 세부: `CreateServiceDefinition` preCheck가 정상 DDL도 거부·동일 바이트가 Update로 즉시 성공) · 13-5(JNC L-001 — V4에서도 category 1 고정·Preview 부재·`ListServiceBindingTypes`는 0/1 양쪽 반환) · 13-6(JNC L-002 — ADT 수동 publish 즉시 성공, 2시스템 판정 일치). ③ **ABAP 작법 지식 이관 — 전부 기존 파일 보강, 신설 0**: `clean-code.md`(CURR 이중단위 — `TCURX CURRDEC=0` 통화의 DB 내부값 = 표시값 1/100, 임계값 비교 금지·외부 입력 무환산 대입 금지·화면 육안 검수 불가) · `function-module-rule.md`(표준 FM 호출 전 시그니처 확인 의무 + **EXCEPTIONS 없는 FM에 `OTHERS = 1` 금지**(sy-subrc 항상 0 → 실패가 성공으로) · RFC 예정 FM의 `TFDIR FMODE='R'` 확인 쿼리(활성·구문 0/0이 못 잡음) · FM 시그니처 양방향 비대칭(ADT 모던 인라인 ↔ abapGit 클래식, 신규 작성 시 같은 시스템 기존 FM 형식 모사) — **D-058 유보 ⓐ의 묶음 3 소비**) · `field-typing-rule.md`(RAWSTRING/STRING >255byte NOT NULL 금지 — SAP 표준 25건 전수 예외 0) · `abapgit-roundtrip-rule.md`(오프라인 zip = 원격 전체 상태 — 변경분만 담으면 나머지가 삭제 후보, 전체를 담아 구조적 방지 + FM 시그니처 미러 측 역참조 2줄) · `create-object.md` Step 4(`CheckSyntax` `source_code` 사전검증 1문 앵커 — 서버 무접촉 사전 컴파일, class/program/interface 한정). ④ **troubleshooting §8 확장 3항** — `UpdateSourceByPatch` 3종(13-3 짝: activate:false 연속 유실·CRLF 다중행·CLAS 메인만 — 증상→감별(diff_preview에 직전 패치 부재)→처방) · `GetSqlQuery` wide-SELECT(13-9 짝 — **징후 3종을 감별법으로** 수록, ~15컬럼 상한 처방) · `RunUnitTest` 빈 결과(해소 이력 — 엔진 버전 확인 먼저, junit 거부·컨테이너 전 로컬 테스트 실행은 정상). ⑤ **버전 불변(v0.5.3)** — 신설 파일 0·자산 계수 불변(지식 179·절차 22·스킬 17)이라 D-058 ④ 선례로 비범프. 단 아래 유보 ⓓ — 전달 조건이 D-058 때와 다르다.
- **검증(이 세션 실측)**: 게이트 전종 exit 0 — 이식 스냅샷 **재핀 후 통과**(pin `a95eb0f`·roots 36·inventory 487 불변 = 원본 무접촉) · links **826/0**(289 md — md 계수 불변 = 신설 0 확인) · verify-engine **4.14.3 불변** · engine provenance · smoke **155/65 불변** · conformance-server-gates · manifests **7종·자산 수 일치**(비범프 정합) · rename(구역 A 41건/캡 42 — HANDOFF·DECISIONS는 구역 B 제외 확인 후 편집) · conformance-runtime-dir **230 assert/0 실패**. doctor: FAIL 1 = Antigravity 1.1.1 ≠ 1.1.4(기존 로컬 상태 — 이 변경과 무관, D-064 선례 판정) · WARN 2(Codex pre-conformance·legacy 전역 sap)도 기존.
- **대안·기각·보류**: (a) CURR 함정을 `field-typing-rule.md` Amount 행에 — 함정의 발화 시점이 테이블 필드 타이핑이 아니라 **금액 비교·파일 파싱 코드 작성 시점**이라 구현 공유 기준(`clean-code.md`)이 호출 직전 문서다, 기각. (b) FM 시그니처 비대칭을 abapgit 파일 단독 수록 — 서버 쓰기 방향이 FM 파일의 기존 HARD RULE(인라인 전용)과 연속이라 **FM 파일 정본 + 미러 파일 역참조 2줄**로 분리 채택. (c) 신규 지식 파일 신설(currency-rules.md 류) — 내용이 기존 파일 절 하나 분량인데 계수·매니페스트·버전 범프를 유발한다(D-040 무게), 기각. (**보류 2건 — 건드리지 않음**) CUA/ALV(ZUNIWTH R-013 ①) — 원 프로젝트 스스로 wave24 검증 대기·가설 미확정 표기(HANDOFF 미승격 잔여에도 보류 명시돼 있었음), 검증 전 승격 금지 · openpyxl→xlsxwriter(ZUNIWTH R-007) — 처방이 Python 라이브러리 선택이라 ABAP 지식 트리에 호출 직전 문서가 없다(SAP 측 일반 참 = `CL_FDT_XL_SPREADSHEET`는 sharedStrings 방식만 읽는다 — 배치처가 생기면 그 형태로 재론).
- **정직 유보**: ⓐ **이 세션 재현 0건** — 등재·보강·이관 전부 원 프로젝트 기록(2026-07-27~08-05, S/4 2계통)의 verified 문구를 신뢰한 이전이다. 특히 13-9의 경계(18~28컬럼)는 이분탐색 미실시 관측 구간이고, 13-12의 "07-31 전역 피드백 ③과 동일 뿌리"는 추정이다(관측 배율 4→8 vs 4→16 상이). ⓑ **독립 리뷰 미수행**. ⓒ **원본 무접촉 유지** — 5프로젝트 `.sc4sap/`는 읽기만 했고 승격 표시를 남기지 않았다(D-064 ⓒ 동일). 다음 대조는 이 항목에서 시작하면 된다. ⓓ **배포 반영 0 — 그리고 이번엔 전달 조건이 다르다**: doctor 실측으로 이 머신 설치 캐시가 **이미 0.5.3(레포와 동일)**이라, 이 커밋분이 사용자에게 전달되려면 push 시점에 패치 범프가 필요하다(D-060 규칙 — 설치본 내용이 바뀌는 커밋은 패치 범프가 배포의 일부. D-065의 비범프는 설치본 0.5.1 < 레포 0.5.2로 게이트가 이미 충족된 경우였다). 이 세션은 지시 범위(신설 0 = 비범프)대로 집행하고 **범프 판단을 push 세션에 명시적으로 넘긴다**(HANDOFF 재개점에 기재). ⓔ **이관 지식의 실효 미측정** — 로드 경로에 올렸다는 것이지 에이전트가 함정을 실제로 피한다는 증거가 아니다(D-058 ⓗ·D-064 ⓑ 동일).
- **영향**: 수정 = `HANDOFF.md`(§6 백로그 13 헤더·서문 5프로젝트화 + 13-9~15 등재 + 13-2·3·4·5·6 보강 + 재개점 + 미승격 잔여 갱신) · `interactive/core/procedures/troubleshooting.md`(§8 서문 기간 + 신규 3항) · `interactive/core/procedures/create-object.md`(Step 4 IMPLEMENT에 CheckSyntax 사전검증 1문) · `interactive/core/knowledge/abap/conventions/clean-code.md`(CURR 절 신설) · `…/function-module-rule.md`(표준 FM 호출 절 · TFDIR 확인 문단 · 시그니처 방향성 절) · `…/field-typing-rule.md`(NOT NULL >255byte 절) · `…/abapgit-roundtrip-rule.md`(전체 상태 절 · FM 역참조 절) · `interactive/provenance/`(스냅샷 재핀) · 이 항목. **불변** = 엔진·번들·vsp 무접촉(4.14.3) · 도구 표면 155/65 · 자산 계수(지식 179·절차 22·스킬 17) · 플러그인 v0.5.3 · 실데이터 게이트(P2) · attended-only · unattended=sealed · ENGINE template-only(D-040) · 이식 pin(`a95eb0f`) · MIGRATION-MANIFEST 분류 · 사용자 프로젝트 무접촉(읽기 전용).

## D-070 · 2026-08-06 · 설계 입구 3형태 — create-program Intake Resolution 신설(spec-provided·deep-interview 산출물 소비) + deep-interview 소비 배선 (v0.5.4)

- **맥락**: 2026-08-06 실사용 분석 발원(백로그 등재 = 직전 커밋 `a0c0fdd`, 이 항목이 그 집행). 정식공정(create-program)의 앞문이 인터뷰뿐이라 **설계서 지참자(도메인 전문가)는 입구가 없다** — 공식 경로대로면 이미 문서로 답한 13차원을 처음부터 재질문받거나, 공정 밖으로 직행해 뒤 장치 3개(독립 리뷰·기계 검증·위임)를 통째로 우회하게 된다. 실증(ZUNIWTH, 읽기 전용 확인): 정식공정 런 2건이 각기 다른 수동 편법으로 진입했다 — ZUNIWR2020(2026-06-24 승인)은 프로젝트 CLAUDE.md "derive-don't-ask" 지시로 설계서(`구현설계.md`)를 정본 스펙화, ZUNIWR2030(2026-07)은 1a/1b를 state.json note **"설계서 도출로 대체(사용자 결정)"**로 완료 처리. 동근 실측 = deep-interview 산출물(`.sapkit/deep-interviews/*.md`)의 자동 downstream 소비자 **레포 전체 0건**(D-052 ⑵ 기실측 — 실질 일회성 인계물). 원칙(사용자 확정): **입구가 셋이어도 뒤 공정은 동일** — 입구는 "스펙을 만드는 방법"만 다르고, 스펙 승인(해시 동결)→구현→검증→독립 리뷰는 불변.
- **결정**: ① **create-program에 Intake Resolution 절 신설**(Phase 0 직후·Phase 1 앞 + 파이프라인 도식 1줄 병기) — 런 시작 시 세 신호를 순서대로 검사해 인터뷰 범위를 해석: ⓐ **spec-provided**(사용자가 지목·첨부한 설계서/스펙 문서 = 1차 입력) ⓑ **deep-interview 산출물**(`.sapkit/deep-interviews/`에 이 요구와 매칭되는 brief — 매칭은 사용자 1줄 확인 후 소비) ⓒ 둘 다 없으면 표준 2단 인터뷰(현행 그대로, 기본값 불변). ② **문서 입력 경로 규칙 5개** — Phase 0 플랫폼 preflight는 어떤 입구에서든 전량 수행(지참 문서가 품는 플랫폼 오가정 — S/4에서 XK02류 폐기 T-code 안내 실패(ZUNIWTH L-003 실증) — 를 스펙에 굳기 전에 잡는 자리) · 13차원(1A 6+1B 7) **대조표(coverage map)**를 만들어 문서가 답하는 차원 = 재질문 금지·정확 출처 인용 확인 재진술만(Phase 1A knowledge preflight의 KD 소비 규칙 준용 명시), 결손 차원만 One-Question-Per-Turn 그대로 질문(일괄 제안 금지·Recovery clause 결손 차원에 전부 존속) · **1A-⑥ 표준 SAP 대안 제안 의무 무면제**(문서에 표준 대안 검토 근거가 있으면 확인 재진술로 갈음, 없으면 여전히 제안 의무) · **산출물 계약 불변** — `module-interview.md`·`interview.md` 생성 + 각 차원 출처 명기(`source: user-spec §x | deep-interview <file> | interview`), Phase 2 enforcement(두 파일 없으면 거부) 그대로 · **Phase 3·승인 게이트 불변** — 스펙은 지참 문서를 1차 입력으로 작성하되 지참 문서가 spec.md를 대체하지 않고 승인·SHA-256 해시 동결은 현행 그대로. ③ **MANDATORY 문구 정밀화** — "never skip"의 보호 대상은 **13차원이 닫히는 것**이지 질문 행위 자체가 아님을 Phase 1 도입부에 명문: 설계서 지참 = 사용자가 답을 문서로 미리 준 것 = 우회("just build it") 아님; 단 **문서가 없는데, 또는 문서가 실제로 답하지 않는 차원까지 커버리지를 주장하는 것**은 여전히 프로토콜 위반. One-Question-Per-Turn 절에도 결손 차원 한정 1문 배선(문서 기재 답의 재진술은 bulk proposal이 아님). ④ **deep-interview 소비 배선 명시** — Output 절에 standing input 선언: 이후 create-program 런의 Intake Resolution이 이 디렉터리를 읽어 이미 답한 차원을 재질문하지 않는 데 쓰인다, create-object 후속이면 freeze 입력으로 동일 소비(D-052 소비자 0 해소). ⑤ 코어 문서에 `.sc4sap` 리터럴 불사용 — 미이행 프로젝트의 구 디렉터리 해석은 project-context.md 포괄 조항 참조로 표현(rename 게이트 구역 A 무누출 유지; `deep-interviews/`는 migrate-runtime-dir 이행 목록에 기존재).
- **대안·기각**: (a) **인터뷰 폐지**(설계서 요구로 일원화) — 타깃 사용자(요구가 막연한 층)의 유일한 입구를 제거한다, 기각. (b) **deep-interview 폐지**(create-program 인터뷰로 흡수) — create-object 경로의 유일한 앞문이자 절차 선택 전 탐색 단계다, 기각.
- **정직 유보**: ⓐ **실사용 미검증** — spec-provided·deep-interview 입구는 이 세션에서 실행된 적이 없다. canary·도그푸딩(ZUNIWTH)이 관찰 자리. ⓑ **이 수리도 Procedural** — 기계 강제 없음(모델이 무시할 가능성은 남는다 — D-066 ⓒ와 같은 등급). ⓒ **새-컨텍스트 독립 리뷰 미수행** — 커밋 후 별도 에이전트가 수행 예정. ⓓ **배포 반영 0** — push·CI green·재설치 후에야 설치본이 이 문서를 읽는다.
- **영향**: 수정 = `interactive/core/procedures/create-program.md`(도식 1줄 + Intake Resolution 절 신설 + Phase 1 도입부·One-Question-Per-Turn 정밀화) · `interactive/core/procedures/deep-interview.md`(Output 소비 배선 1문단) · `interactive/provenance/`(이식 스냅샷 재핀 — pin 불변) · `HANDOFF.md`(재개점 D-070 블록 + §6 백로그 집행 완료 전환) · 이 항목. **불변** = 플러그인 **v0.5.4 유지**(`a0c0fdd`와 같은 전달 묶음 — 재범프 금지) · 엔진·번들·vsp 무접촉(4.14.3) · 도구 표면 155/65 · 자산 계수(지식 179·절차 22·스킬 17 — 신설 파일 0) · 스펙 승인 해시 동결·Phase 2 enforcement·Phase 6 리뷰 게이트·완료 상태 모델(DRAFT/PROVISIONAL_WRITE/COMPLETE) 전부 현행 · 실데이터 게이트(P2) · attended-only · unattended=sealed · ENGINE template-only(D-040) · MIGRATION-MANIFEST 분류 · 사용자 프로젝트 무접촉(읽기 전용).

## D-071 · 2026-08-10 · SAPKIT renew 다판 착수 — 끝그림 「포크 0」 · 브랜드 SAPKIT 단일 · 무중단 교체 원칙 · 청사진 신설

- **맥락**: 사용자 발화 원문 — "이 프로젝트 저 프로젝트 짜깁기가 아니라 내걸로", "지금은 뭔가 걍 짬뽕느낌이라 짜깁기한 기능들이 제대로 사용되고 있는질 모르겟어", "원작자 고지도 없애는 진짜 나만의 제품". 차용 후 완전 소유(D-017)의 다음 단계를 **명시적 다판(多版) 작업**으로 세운다. 고지의 즉시 삭제가 법적으로 불가함을 설명했고 **"부품 교체 완료 시마다 은퇴"**로 합의됐다. 이 항목은 renew **1차 판(기반 공사)**의 상위 결정이고, D-072~D-077이 그 집행이다.
- **결정**: ① **끝그림 = 포크 0** — 몸통 전부 자작, 외부는 정식 의존성으로만, 계보성 고지는 부품 교체 완료 시마다 은퇴. ② **브랜드 SAPKIT 단일** — 이름 슬롯이 달라 충돌하지 않는다(플러그인 `sapkit` · 검사기 명령 `sapkit` · 새 엔진 SAPKIT Engine/패키지 `sapkit-engine`). 옛것은 교체와 함께 이름을 물려준다. 후보 `skit`은 사용자가 기각("그럴듯한 네이밍 다시하고 싶다"). ③ **무중단 교체 규칙** — 병행 제작 → 검증 통과 → 교체 → 구부품·고지 은퇴. 빅뱅 교체 금지. 쓰던 부품은 새 부품이 검증을 통과할 때까지 현역. ④ **`docs/BLUEPRINT.md` 신설** — 끝그림 · 교체 사다리(⑴ SAPKIT Engine 슬림 자작 ⑵ 검사기 재작성 ⑶ 지식 재저작 ⑷ interactive/ 상류 고지 은퇴) · 단계별 검증 기준 · **엔진 도구 실사 표**(정적 전수조사 315파일 — 실측 표면 186종 / 제품 자산 실질 참조 109종 / 훅 전용 16종 / 미참조 61종). ⑤ **도구 수 목표치 사전 고정 금지** — 사용자 반문 "50종으로 추려도 되는거야?"에 "숫자는 실사가 정한다"로 답했고 사용자가 수용. 청사진에 수치를 못박지 않는다.
- **대안·기각**: (a) **새 레포에서 처음부터** — git 이력이 곧 "어떻게 내 것이 됐는지"의 증거다, 히스토리 리셋 기각(기존 모노레포 위에 쌓는다). (b) **이번 판에서 부품 교체까지** — 무중단 원칙과 충돌하고 1판에 담기지 않는다, 청사진 등재만. (c) **고지 즉시 삭제** — 유지되는 차용 코드의 원저작자 고지 삭제는 법적으로 불가, 기각(제거된 것의 고지만 "해소 기록"으로 전환 — D-074).
- **정직 유보**: ⓐ 사다리 ⑴~⑷는 **미착수**(이번 판 범위 밖 명시). ⓑ 실사 표의 **"실질 참조"** 판정 기준(권한 allowlist·훅의 기계 열거를 사용에서 제외)은 이번 판이 도입한 것이라 재론 여지가 있다 — 청사진에 기준을 명시해 두었다. ⓒ 미참조 61종은 "제거 결정"이 아니라 사다리 ⑴의 검토 재료다.
- **영향**: 신설 = `docs/BLUEPRINT.md`. 이 항목은 D-072~D-077의 상위 근거이고, 다음 판의 착수점은 청사진 사다리 ⑴이다.

## D-072 · 2026-08-10 · 이식 장부 은퇴 — 원본 대응 검증의 존재 이유 소멸 (D-039 ⑧ 정정)

- **맥락**: `check-migration-snapshot`은 sc4sap-custom 이식분의 원본 대응을 고정 스냅샷으로 검증했다(D-027 §9.2 — 원본 무접촉·CI 실행 가능이 그 게이트의 설계 목표였다). renew 1차 판부터 **콘텐츠는 의도적으로 원본에서 갈라진다**(D-074 GPL 제거·D-075 V-PASS 재저작이 첫 사례). 게이트를 남겨두면 그 정당한 편집이 전부 red가 된다 — 그래서 이 항목이 이번 판의 맨 앞이다.
- **결정**: ① 게이트 `check-migration-snapshot.mjs`·그 음성시험·공급 도구 `build-migration-snapshot.mjs`·`report-sc4sap-public-drift.mjs`를 **실행 경로에서 삭제**(로컬 게이트 목록 + `.github/workflows/offline-gates.yml` 양쪽 — 어중간한 잔존 금지). ② `interactive/provenance/`의 이식 스냅샷 3종과 `interactive/MIGRATION-MANIFEST.md`는 **"이식 완료 기록 — 이후 갱신 의무 없음"** 헤더를 달아 **보존**한다. ③ 근거를 그 헤더에 남긴다: 이식 시대는 끝났고, 콘텐츠 무결성은 이제 **git 이력**이 담당한다.
- **대안·기각**: (a) 게이트 유지 + 편집 때마다 스냅샷 재핀 — 갈라짐이 의도인 상태에서 매번 재핀은 의식일 뿐 아무것도 assert하지 않는다, 기각. (b) provenance 스냅샷까지 삭제 — `interactive/THIRD_PARTY_NOTICES.md`가 `migration-map.json`의 `class: copy`를 GPL-3.0 계보의 근거로 인용한다. 지우면 고지의 증거가 사라진다, 기각.
- **정직 유보**: ⓐ **D-039 ⑧이 드리프트 리포터를 "보존"으로 기록했는데 이 항목이 그것을 supersede한다**(append-only 규칙에 따라 원 항목은 고치지 않는다). ⓑ 동결된 스냅샷 안의 산문에는 실행 불가가 된 절차 서술이 남아 있다(`_how_to_record` 등) — `_retired` 헤더가 그 절차를 더는 실행할 수 없다고 명시한다.
- **영향**: 삭제 = `interactive/scripts/{check-migration-snapshot,test-check-migration-snapshot,build-migration-snapshot,report-sc4sap-public-drift}.mjs`. 수정 = CI node-gates 스텝 21→19 · `interactive/provenance/{migration-map,sc4sap-public-source,upstream-drift-dispositions}.json`(`_retired` 헤더, 내용 바이트 보존) · `MIGRATION-MANIFEST.md` · `interactive/README.md`. **불변** = 이식 pin·inventory·원본 무접촉.

## D-073 · 2026-08-10 · 옛 실험 설비 전면 제거 — 안전 규칙 CLAUDE.md 이관 · AGENTS.md 최소 승계 (이 로그 머리말 「역할 한정」 무효화)

- **맥락**: D-040이 ENGINE(final-harness 무인 루프)을 template-only로 내린 뒤 실수요 트리거가 없었다. 레포에는 **실행되지 않는 실험 설비**가 계속 남아 있었고, 문서·CI가 그것을 계속 가리켰다. 사용자 동기("짜깁기한 기능들이 제대로 사용되고 있는질 모르겟어")의 직접 대상.
- **결정**: ① 삭제 — `phases/` · `src/` · 루트 `scripts/` · `.harness/` · `packs/` · `domain/` · `adapters/final-harness/`+lock · git 추적 중이던 `.claude/quality-gate.json`(합계 194파일). **`adapters/vsp/`는 유지**(검사기 계약·안전 문서). ② **순서 고정: 이관 → 삭제.** `.harness/RULES.md`의 현행 유효 안전 규칙을 먼저 `CLAUDE.md` 안전 절로 옮긴 뒤 삭제했다 — 승계 6건(R-002 vsp 오프라인 한정 · R-003 DEV tier write · R-004 동결 원본 무접촉/private 금독 · R-005 비밀정보 커밋 금지 · R-006 write 성공 불신 · R-008 재개 전 원격 대조) + AGENTS.md P2에 있던 실데이터 건별 승인. ③ **`AGENTS.md`는 삭제하지 않고 최소 승계본**으로 — SAP 정책 등급 P0~P4를 제품 코어 9파일이 인용하므로 삭제하면 무중단 불변식이 깨진다. 엔진·`.harness` 의존 실행 구조 서술만 걷어냈다. ④ CI에서 `ps-gate` 잡 제거(잡 5→4). ⑤ 삭제로 고아가 된 게이트 항목(개명 게이트의 `scripts/vsp-env.ps1` 폴백 의무·앵커·ALLOWLIST, `phases/`·`.harness/` 제외 항목)과 `adapters/vsp/` 문서의 dot-source 안내를 함께 정리.
- **대안·기각**: **AGENTS.md 통째 삭제**(사양이 허용한 선택지) — 제품 코어 9파일(`development-loop.md`·write 절차 3본·리뷰·extract 2본 등)이 P0~P4를 인용해 깨진 참조가 생긴다, 기각. 결과 기준("깨진 참조 0")을 지키는 쪽이 최소 승계본이었다.
- **정직 유보**: ⓐ **승계하지 않은 3건** — R-001(엔진 LESSONS→RULES 승격 루프 종속이라 대상 소멸) · **R-007**(마스터데이터 텍스트 테이블 INNER JOIN 행 누락) · **R-009**(S/4 금액 원천 = ACDOCA, BSEG 아님). 뒤 둘은 ABAP 작법이라 배치처가 제품 지식층인데 **이번 판에서 이관하지 않았다** — 실질 공백이다(`rldnr`/선도원장 `'0L'`은 `interactive/` grep 0건). 백로그. ⓑ **이 로그 머리말의 「역할 한정」 조항**("부트스트랩 후에는 final-harness의 harness-docs가 그 프로젝트 결정의 정본")은 final-harness 소멸로 **무효**다. append-only라 머리말을 고치지 않고 이 항목으로 정정한다 — 이 로그가 레포 결정의 유일 정본이다. ⓒ 삭제 대상은 git 이력으로 복구 가능하다는 것을 사용자에게 고지했고, 그것이 선택의 전제였다. ⓓ 디스크에 남은 비추적 잔여(`phases/…/.sc4sap/logs/*.jsonl` 1건)는 git 밖이라 지우지 않았다 — 사용자 몫.
- **영향**: 삭제 194파일(-23,927줄) · 수정 = `CLAUDE.md`(안전 절 신설) · `AGENTS.md`(최소 승계본) · CI · `.gitignore` · `interactive/scripts/{check-runtime-path-rename,test-check-runtime-path-rename}.mjs` · `adapters/vsp/{SAFETY-PROFILES,VERIFY-PATTERNS,COMMANDS}.md`. **불변** = 제품(`interactive/`) 기능·도구 표면·설치 경로 · `engine/` · `vsp/`.

## D-074 · 2026-08-10 · GPL-3.0 참조 지식 31파일 제거 — 고지를 「제거로 해소」 기록으로 전환 (D-068 집행)

- **맥락**: D-067 ⑷가 미규명으로 등재하고 D-068이 "오기 아님, 실제 GPL 저작물"로 규명한 31파일(`interactive/core/knowledge/abap/reference/`)이 그대로 배포되고 있었다. MIT 대문 아래 GPL-3.0 저작물이 섞여 있는 상태가 renew의 "법적 꼬리"다.
- **결정**: ① 디렉터리 **전량 삭제**(31파일 · -10,198줄). 부분 인용·사본 잔존 금지. ② `interactive/THIRD_PARTY_NOTICES.md`의 GPL 절을 **"제거로 해소(2026-08-09)"** 기록으로 전환 — 일자·경위·향후 자체 집필 경로(청사진 사다리 ⑶: SAP 공식 Apache-2.0 원자료 기반으로 선별·구성부터 새로)를 남긴다. 유지되는 차용 고지(engine/·vsp/·interactive/ 상류)는 그대로. ③ 지식 계수 실측 재계산 **179 → 148**.
- **검증(실측)**: 디렉터리 부재 · `check-links interactive` 0(md 258 · 링크 772 · 깨짐 0) · **묶음 고유 문구 3개 레포 전역 grep 0건**("ABAP Entity Manipulation Language (EML)" · "91% (31 of 34 source files)" · "Common Table Expressions can declare SQL hierarchies") · notices 정합.
- **대안·기각**: (a) 재저작을 먼저 하고 그 다음 삭제 — 재저작은 판 규모의 작업이고 그동안 법적 꼬리가 배포된 채 남는다, 기각(선삭제·후집필). (b) 고지 절 삭제 — 무엇이 왜 사라졌는지의 기록이 없어진다, 기각.
- **정직 유보**: ⓐ **삭제로 실제 지식 공백이 생긴다** — 같은 주제(ABAP SQL·내부 테이블·RAP/EML·성능 등)를 다루던 참조층이 없어졌고 대체 집필은 사다리 ⑶이다. ⓑ 삭제 시점에 `domain/abap/RULES.seed.md`의 S-016~S-024가 그 묶음의 앵커를 인용하고 있었는데, 같은 판의 D-073이 `domain/`을 통째로 삭제해 자연 해소됐다. ⓒ git 이력에는 남는다(워킹 트리 0).
- **영향**: 삭제 = `interactive/core/knowledge/abap/reference/`(31). 수정 = `interactive/THIRD_PARTY_NOTICES.md` · `…/knowledge/abap/conventions/rap-odata-rules.md` · `…/procedures/create-object.md`(깨진 링크 1문장). **불변** = 나머지 지식 148 · 절차 22 · 페르소나 26 · 도구 표면.

## D-075 · 2026-08-10 · V-PASS 의식 폐지 + 기계 확인 유지 — 「반영 확인」 절차로 개명·재저작, 진입점 스킬은 사용자 결정으로 복원

- **맥락**: 완료의 절반을 "V-PASS"라는 **도장 의식**(전용 러너 `tools/vpass/vpass.mjs`가 증거 체인을 돌리고 `.sapkit/vpass/`에 verdict 산출물을 남김)이 담당했다. 사용자가 **제거를 결정**했다(작성자 권고는 유지였고, 사용자가 그것을 넘어섰다). 동시에 사용자는 **"기계 확인 단계 유지"를 별도로 선택**했다 — 근거는 사용자 실측: **SAP 도구의 성공 응답이 거짓인 사례가 있었다**(CLAS 거짓 성공). 즉 죽일 것은 **이름과 의식**이고, 살릴 것은 **기계로 확인하는 단계**다.
- **결정**: ① `interactive/skills/vpass/`·`interactive/tools/vpass/` **삭제**. ② 전용 절차를 `core/procedures/verify-vpass.md` → **`verify-applied.md`("반영 확인 — machine check")**로 **개명·재저작**(절차 계수 22 유지). 옛 본문은 러너 명령줄을 조립하고 verdict를 번역하는 래퍼였고, 러너가 사라져 지시 대상이 없어졌다 — **MCP 기반 절차로 다시 썼다**: ⓐ 반영된 소스 되읽기 대조(`GetProgFullCode`/`ReadClass`/`GetInclude`/`ReadFunctionGroup`+`ReadFunctionModule`/`ReadInterface`/`ReadView`, 참조본이 있으면 `GetSourceDiff`) ⓑ 문법·활성 확인(`CheckSyntax` + `GetInactiveObjects` 0건). P1 읽기 전용이고 산출물을 남기지 않는다. ③ **완료 의미론 재기술** — `create-program`·`create-object`·`modify-object`·`policies/development-loop.md`·`agents/sap-worker.md`의 완료 조건을 **"기계 확인 + 독립 새-컨텍스트 리뷰(R-PASS)"** 양쪽 필수로. 도구 성공 응답만으로 완료 처리하는 문구는 새로 만들지 않는다(절차 Purpose가 `Create*`/`Update*` OK · `ActivateObjects` ACTIVE · 빈 `GetInactiveObjects`를 모두 "쓴 쪽의 자기 보고"로 규정한다). 상태 이름 `PROVISIONAL_WRITE`·`R-PASS`·`COMPLETE`(D-025)는 V-PASS 명칭이 아니므로 유지. ④ 두 런타임 경로 게이트에서 vpass 항목 제거. ⑤ **진입점 스킬 복원(사용자 결정)** — 사양 초안은 "스킬 17→16"이었고 구현도 그대로 갔으나, 독립 사양 리뷰가 **"「확인해줘」의 유일한 상시 로드 진입 표면이 사라진다"**(호스트에 노출되는 것은 `skills/`뿐, `core/procedures/`는 아니다)를 지적했다. 사양 자체가 "진입점 역할 유지"와 "17→16"을 동시에 요구해 **자기모순**이었으므로 사용자에게 올렸고, 사용자가 **"이름만 바꿔 살린다"**를 선택했다 → `interactive/skills/verify-applied/SKILL.md` 신설, **스킬 계수 17 유지**로 사양 정정.
- **검증(실측)**: `smoke-mcp` 0(도구 표면 **155/65 불변**) · `test-smoke-mcp` 20/20 · `check-links` 0 · 개명 게이트·경로 적합성 게이트 0 · 절차 `.md` **22 불변** · 스킬 디렉터리 17(vpass 삭제로 16 → verify-applied 신설로 17) · `interactive/` 안 `vpass` 잔존 2건(해소 기록 주석 1 + 이행 목록 1, 후자는 D-076에서 소멸).
- **대안·기각**: (a) **V-PASS 유지**(작성자 권고) — 사용자 결정으로 기각. (b) **전용 절차 삭제** — 확인 기능 자체가 소실된다, 기각(개명·재저작). (c) **스킬 없이 절차만 유지**(사양 문면) — 새 대화에서 "확인해줘"가 어디로도 라우팅되지 않는다(무중단 불변식과 충돌), 사용자 결정으로 기각.
- **정직 유보**: ⓐ 재저작 절차는 **실사용 미검증** — 이 세션에서 SAP에 실행된 적이 없다. ⓑ 옛 체인이 포함하던 **unit·ATC는 빠졌다** — 사양이 유지 대상을 ①되읽기 ②문법·활성으로 **재정의**했기 때문이고, 그만큼 기계 확인의 폭은 좁아졌다. ⓒ 다운스트림 작업자는 이 결정을 "개선"이라며 되돌리지 말 것 — **도장 제도의 부활 금지, 확인 기능의 소실도 금지**가 사용자 지시다.
- **영향**: 삭제 = `interactive/skills/vpass/` · `interactive/tools/vpass/`. 개명·재저작 = `core/procedures/verify-applied.md`. 신설 = `interactive/skills/verify-applied/SKILL.md`. 수정 = 절차 3본 · `policies/development-loop.md` · `core/project-context.md` · `agents/sap-worker.md` · 게이트 2종+음성시험 · `scripts/get-vsp.mjs`(주석). **불변** = 도구 표면 155/65 · 절차 22 · 페르소나 26 · 스킬 17.

## D-076 · 2026-08-10 · 호환층(`.sc4sap` 시대) 제거 — 사람 선행 게이트 통과 후 폴백 삭제 · 엔진 5.0.0 · 개명 게이트 재작성

- **맥락**: D-057이 런타임 경로를 `.sc4sap` → `.sapkit`으로 개명하면서 4.14.0이 **이행 기간용 병존**(R-TIE/R-NEW/R-ENV/R-PRESERVE)을 넣었다. 확인된 실사용자는 소유자 본인뿐이므로(1인 사용 확정) 병존을 영구 유지할 이유가 없다. 단 **자격증명이 구 디렉터리에 있는 채로 폴백을 지우면 접속이 끊긴다** — 그래서 사양이 **사람 선행 게이트**를 걸었다.
- **결정(선행 게이트 결과 포함)**: ① **사람 선행 게이트 통과** — 검사 결과 `~/.sc4sap`(profiles·work·bin)과 프로젝트-로컬 `.sc4sap`이 살아 있었고 `.sapkit`은 없었다. 사용자에게 보여주고 승인을 받아 **사용자가 직접** 마이그레이터를 실행했다(도구가 "에이전트 대행 금지"를 명시). 홈 스코프는 자격증명 DACL 대조에서 한 번 거부됐다 — 구 디렉터리에 Codex 샌드박스 그룹 읽기 ACE가 명시로 걸려 있어 사본(부모 상속만 받음)과 달랐다. **사용자가 그 ACE를 떼고 → 이행하고 → 새 디렉터리에 같은 ACE를 다시 붙이는** 경로로 통과. 이어 검사기 재설치(`SAPKIT_HOME_DIR` 지정)·훅 재배선까지 사용자가 수행. 재검사 실측: 두 스코프 **COEXIST_OK** · profiles 3 · `~/.sapkit/bin/vsp.exe` 존재 · `SC4SAP_*` 환경변수 프로세스·User·Machine **어느 범위에도 없음**. ② **폴백 제거** — `SC4SAP_HOME_DIR` 읽기 중단(`SAPKIT_HOME_DIR`이 유일 override, 설정됐는데 경로가 없으면 하드 `ENV_INVALID` — 조용한 폴백 없음) · `<cwd>/.sc4sap` 후보 제거 · R-TIE 타이브레이크·journal COEXIST_OK 판정·폐기 경고 제거 · `LoadedProfile`에서 `runtimeDirGeneration`/`homeGeneration` 제거, `PathReason` 5종→3종. ③ **마이그레이터와 그 음성시험 삭제**(제 역할을 마쳤다). ④ **`check-runtime-path-rename.mjs` 재작성** — 폐기 대신 **"구 세대 토큰 재등장 금지" 단순 게이트**로. 3구역·ALLOWLIST·캡·폴백 의무는 전부 소멸, **안전 앵커는 유지**(`keychain:sc4sap/` · `zrsc4sap_oop_ex` — 런타임 경로가 아니라 SAP 안에 실재하는 이름이라 개명하면 예제가 깨진다). ⑤ `conformance-runtime-dir` legacy 축소(케이스 43→26 · 안전 회귀 9군→5군 · assert 138). ⑥ **엔진 5.0.0**(4.14.3에서 major) — 문서화된 해석 경로와 공개 형태를 제거하는 파괴적 변경이고, 4.14.0이 그 병존을 minor로 **추가**했으므로 제거는 대칭으로 major. UPDATE-RUNBOOK 절차로 재번들·재핀.
- **검증(실측)**: 존속 게이트 전종 exit 0 · 음성시험 8종 exit 0(`test-setup-state` 118/118 · `test-launch-toolsurface` 56/56 · `test-doctor` 47/47 · `test-get-vsp` 21/21 · 개명 게이트 음성시험 15/15) · `cd engine && npm test` **717 passed / 9 skipped / 0 failed**(103 suites) · **번들 반영 실측**: `interactive/server/server.bundle.cjs`에서 `SC4SAP_HOME_DIR` **0건**(구 번들 2건) · **capability diff 0**(readonly 65→65 · readonly,high 155→155, 목록 동일) · `.gitattributes` `-text` 보호 온전 · `SC4SAP_`·`.sc4sap` 잔존 27파일 전부 역사·시험 자산(활성 코드 0).
- **대안·기각**: (a) **폴백 유지**(배포 사용자 보호) — 확인된 실사용자가 소유자 1인이고 이행이 끝났다, 기각. (b) **게이트 폐기** — CLAUDE.md·CI가 이름으로 참조하고, 안전 앵커(SAP 실재 이름)를 지킬 주체가 사라진다, 기각(재작성 선택). (c) **5.0.0 대신 4.15.0** — 공개 형태와 지원 경로를 없애는 변경이라 minor로 감추면 정직하지 않다, 기각.
- **정직 유보**: ⓐ **엔진 시험 733/11 → 717/9**. −18은 **은퇴한 주제**의 시험이지 커버리지 손실이 아니다(fixture 43→26에서 −17, helper −1; 5건은 "구 세대가 이제 무시되는지"를 확인하는 쪽으로 **재조준**). 그래도 절대 수가 줄었다는 사실은 남는다. ⓑ **`check-engine-provenance --rebuild`(재현 빌드) 미실행** — 이 머신(Windows+Node 24)의 `spawnSync npm.cmd` 제약. 기계 판정의 정본은 CI(Linux) 잡이고, 이 판은 **CI 미확인 상태로 커밋**된다. ⓒ 새 게이트에 **`PENDING`(인계) 경고 목록**을 두었다 — 쓰기 경계 밖 파일이라 못 고친 낡은 서술을 실패시키지 않고 경고만 한다. 목록이 비면 상수째 지워야 한다. ⓓ **구 디렉터리는 사용자 머신에 그대로 남아 있다**(copy-not-move). 이제 아무도 읽지 않으므로 사용자가 직접 지우면 된다 — 에이전트는 손대지 않았다. ⓔ 4개 `.gitignore`에서 `.sc4sap/`가 빠졌으므로 레포 루트의 잔여 구 디렉터리는 `git status`에 미추적으로 뜬다(자격증명 없음 확인 — `sap.env` 부재).
- **영향**: 삭제 = `interactive/scripts/{migrate-runtime-dir,test-migrate-runtime-dir}.mjs`. 수정 = `engine/src/`(리졸버 코어 외 6) · 엔진 시험·fixture · `interactive/server/launch.cjs` · `adapters/claude/lib/profile-resolve.mjs` · 훅 3본 · `permissions-template.json` · `tools/extract/` 2본 · `scripts/` 6본 · 게이트·음성시험 6본 · 절차 2본 · `project-context.md` · `.gitignore` 4 · CI(`win-migrate-gate` 잡 · dotenv probe 제거) · **번들 재핀 5.0.0**(sourceCommit `ace43db6`). **불변** = 도구 표면 155/65 · 자산 계수 · 설치/업데이트 경로 동작.

## D-077 · 2026-08-10 · 겉면 이름 정리 + 브랜드 표기 SAPKIT 통일 + 플러그인 v0.6.0

- **맥락**: 마켓·플러그인 설명문이 여전히 **상류 제품 서술**("Lite, harness-portable edition of SuperClaude for SAP" 등)로 자기를 소개하고 있었다. 사용자 동기의 직접 대상("원작자 고지도 없애는 진짜 나만의 제품")이되, **법적 고지와 겉면 서술은 다른 층**이다 — 전자는 유지, 후자만 정리한다.
- **결정**: ① `interactive/plugin-metadata.json` 설명문(마켓 long/short · Claude long · Codex long)을 **SAPKIT 자체 서술로 재작성** → 생성물 7종 재생성. 상류 제품명 0. ② **법적 고지 무접촉** — `LICENSE` 3종·`THIRD_PARTY_NOTICES.md`의 원저작자 고지, `interactive/README.md`의 라이선스 승계 1줄, `procedures/package-to-process.md`의 `source:` frontmatter(이식 원본 파일·커밋 핀)는 **그대로 둔다**(귀속 흔적). ③ **검사기 표기 전환** — 사용자-facing 문서·설치 안내에서 제품 호칭을 **"SAPKIT 검사기(현재 명령어 `vsp`)"**로. 명령어 `sapkit`은 재작성 판(사다리 ⑵)의 산출물이므로 **존재하지 않는 명령을 안내하지 않는다**. 설치명 변경·`get-vsp` 수정·`vsp/` 디렉터리명·릴리스 자산 재발행은 이번 판 범위 밖. ④ 문서-실체 어긋남 정정(`verify-engine.mjs` 헤더의 편입 이전 서술 등). ⑤ **브랜드 표기 `SAPKIT`으로 통일** — 실측 `SAPKIT` 124 vs `SAPKit` 40이었고, 사양·청사진·인계 문서가 쓰는 형태가 `SAPKIT`이다. `displayName`도 `"SAPKIT"`. 식별자(`sapkit`·`sapkit-engine`·`.sapkit`·`SAPKIT_HOME_DIR`)와 고지 원문·역사 인용은 예외. ⑥ **플러그인 v0.5.4 → v0.6.0** — 기능 변경(지식 감량 179→148 · 스킬 개편 · 호환층 제거 · 엔진 major)이라 마이너 범프.
- **대안·기각**: (a) 라이선스 승계 1줄까지 제거 — 귀속 흔적을 끊는다, 기각(불변식 2). (b) 설치 명령을 `sapkit`으로 먼저 바꾸기 — 오늘 설치되는 명령은 `vsp`가 사실이고, 없는 명령을 안내하는 문서가 된다, 기각. (c) 표기를 `SAPKit`으로 통일 — 소수 표기이고 사용자가 읽은 문서(사양·청사진)가 `SAPKIT`이다, 기각.
- **정직 유보**: ⓐ **마켓 문구는 사용자 최종 확인 전이다** — 최종 보고에 전문을 실어 확인받는다. ⓑ **표기 통일은 되돌리기 쉬운 결정**(`displayName` 1필드 + 산문)이고, 사용자가 `SAPKit`을 원하면 그쪽으로 되돌리면 된다. ⓒ **배포 반영 0** — push·CI green·재설치 후에야 설치본이 v0.6.0을 읽는다.
- **영향**: 수정 = `interactive/plugin-metadata.json`(설명문·`displayName`·version) · 생성물 7종 · `interactive/server/verify-engine.mjs`(헤더) · `interactive/README.md`·어댑터 README 3 · `core/procedures/{setup,troubleshooting}.md` · `skills/setup/SKILL.md` 외 표기 통일분. **불변** = `LICENSE` 3종·`THIRD_PARTY_NOTICES.md` 고지 · 도구 표면 · 기능 동작.

## D-078 · 2026-08-10 · 도구 실사 수치 정정 — D-071 ④의 109/16/61은 재대조 전 값 (BLUEPRINT §4가 정본)

- **맥락**: D-071 ④는 청사진의 엔진 도구 실사 결과를 **표면 186 / 실질 참조 109 / 훅 전용 16 / 미참조 61**(조사 315파일)로 기록했다. 그 값은 **V-PASS 제거(D-075) 이전** 트리에서 측정된 것이고, 사양 R8은 실사 표를 "R2 재기술 이후 상태와 **재대조**"하도록 요구했다. 재대조는 실제로 수행돼 `docs/BLUEPRINT.md` §4가 갱신됐지만, append-only인 D-071 본문은 고칠 수 없어 두 수치가 병존하게 됐다. 최종 리뷰가 이 불일치를 지적했다.
- **결정**: **`docs/BLUEPRINT.md` §4의 값이 정본이다** — 표면 **186** / 실질 참조 **110** / 참조 없음 **76**(권한 allowlist 전용 60 + 훅 열거 전용 16), 조사 284파일, 유령 참조 0. 110 + 76 = 186으로 카탈로그와 정합한다. D-071 ④의 109/16/61/315는 **재대조 전 값**이며, 인용하지 말 것. 차이의 원인은 `verify-applied.md` 신설(참조 +1)과 조사 대상 파일 집합의 변동(vpass 자산 삭제)이다.
- **대안·기각**: D-071 본문 수정 — append-only 규칙 위반, 기각(정정도 새 항목으로).
- **정직 유보**: ⓐ 두 측정이 같은 방법론을 썼는지 완전히 대조하지는 않았다 — 조사 파일 수가 315 → 284로 줄어든 것은 삭제 자산 때문으로 보이나 그 자체를 기계로 확인하지는 않았다. 다음에 실사를 돌릴 때는 **방법(추출 정규식·제외 규칙)을 청사진에 박아** 재현 가능하게 만들 것. ⓑ 이 항목은 수치 정정만 하고 실사 자체를 다시 돌리지 않았다.
- **영향**: 수정 = `HANDOFF.md` 재개점의 실사 수치 1줄. **불변** = `docs/BLUEPRINT.md` §4(이미 정본) · D-071 본문(무접촉).

## D-079 · 2026-08-10 · 청사진 사다리 ⑴ 착수 — SAPKIT Engine 자작 개시 · 도구 표면 186종 전량 승계 · 참조-재저작 · 증거 계층

- **맥락**: D-071이 등재만 해 둔 사다리 ⑴(SAPKIT Engine 슬림 자작)의 **착수 판**이다. 실수요 트리거 3종이 동시에 섰다. ⓐ **소유권** — renew 재구성의 출발 동기("이 프로젝트 저 프로젝트 짜깁기가 아니라 내걸로" · D-071 맥락)가 그대로 남아 있는데, 제품으로 실려 나가는 MCP 서버 번들의 소스 정본은 여전히 남의 포크다(`engine/` — TS 559파일 · handler 348파일 · 번들 8.3MB). ⓑ **포크 유지보수 부채** — 엔진 백로그 13(HANDOFF §6, 하위 13-1~13-15 · 전건 판정 대기)의 수리도, 브랜드 통일의 남은 꼬리(엔진 사용자 노출 문구 3곳의 옛 제품명 `sc4sap` — `launcher.ts:232`·`:237` · `nativeRfc.ts:55`)의 수정도 **전부 남의 구조 위에서** 해야 하고, 그때마다 재번들·재핀(UPDATE-RUNBOOK)이 따라붙는다. ⓒ **상류 리스크 재발 방지** — 상류에서 흘러든 저작물이 법적 꼬리가 되는 사태를 이미 실증으로 겪었다(GPL-3.0 31파일: D-067 등재 → D-068 규명 → D-074 전량 제거). 판단 재료도 갖춰졌다 — `docs/BLUEPRINT.md` §4의 자산 참조 실사(정본 확정은 D-078)에 이번 판이 **실사용 실사 축**(§4.7)을 더했다.
- **결정**:
  ① **착수 = 병행 제작(M1).** 새 엔진은 새 경로 `sapkit-engine/`에 짓는다. 무중단 4단(청사진 §3.1)의 ① 단계이며 구 부품(`engine/` · `interactive/server/` 번들 · 기존 게이트)에 **무접촉**이다. 제품은 이 판 내내 **구 번들로 동작한다**. 교체(③)·게이트 이관·계보 고지 은퇴(④)는 전량 검증 후 **교체 판**의 안건이다.
  ② **표면 = 도구 186종 전량 승계.** 이름·인자·응답 형태를 완전히 동일하게 두고 **개명하지 않는다**. 전송 3종(stdio/HTTP/SSE)과 RFC 백엔드 5경로(`odata`·`soap`·`native`·`gateway`·`zrfc`)도 **전부 재제작**하며, 수요순은 **제작 순서에만** 적용되고 범위에는 적용되지 않는다. **다이어트의 대상은 구조와 소유권이지 도구 표면이 아니다** — 도구·기능을 깎는 방향의 후속 제안은 이 결정을 뒤집는 것이고 새 D-항목을 요구한다. 이 범위는 제작자가 권고한 것(시작 후보군 110종대)보다 **넓은 쪽을 사용자가 명시적으로 고른 결과**다.
  ③ **저작 규칙 = 참조-재저작.** `engine/` 소스 · 번들에 구워지는 `@babamba2/*` 외부 패키지 8종(`mcp-abap-connection` · `mcp-abap-adt-clients` · auth 3종(`broker`·`providers`·`stores`) · `interfaces` · `logger` · `header-validator` — 접속·인증·클라이언트 계층 포함) · 구 엔진 jest 시험(717 passed / 9 skipped, D-076 실측)은 **읽기 전용 참고서**다. **읽는 것은 허용, 복사·붙여넣기는 금지.** 목적은 `engine/LICENSE` 계보 고지의 깔끔한 은퇴이며, **상류가 MIT이므로 이것은 법적 의무가 아니라 소유권 선택**임을 명시해 둔다. **예외 1건 — MCP 규약 계층은 공식 `@modelcontextprotocol/sdk`를 그대로 쓴다**(사용자 결정 2026-08-10): 포크가 아니라 평범한 공용 부품이고, 응답 형태가 구 엔진과 자동으로 일치해 동등성 대조가 쉬워지며, 계보 고지 은퇴에도 걸림돌이 되지 않는다. `@babamba2/*` 8종은 어느 쪽이든 **전면 금지**다.
  ④ **증거 계층 = 표면의 실사용 여부로 갈린다.** ⓐ **실사용 표면**(실호출 이력이 있는 도구·경로) = **녹화-재생 대조**(오프라인 · CI). ⓑ **미사용 표면**(꼬리 49종 · HTTP/SSE 전송 · 잔여 RFC 경로) = **도구별 계약 시험 신규 저작 + 대표 건 attended 실기**. ⓒ **전 표면 공통** = tool-catalog 대조 **diff 0** · `smoke-mcp`·`conformance-server-gates` 통과 · 마일스톤별 **실 SAP attended 확인**. 도구 × 증거 급을 추적하는 **커버리지 표**를 둔다.
  ⑤ **버그 처리 = "그럴듯한 오답·거짓 성공"은 수리하며 짓는다.** 엔진 백로그 13의 하위 항목 중 그 계열은 신 엔진에서 고쳐진 채로 태어난다. **의도적 차이 목록(divergence allowlist) 사전 등재 3건** — **13-9**(`GetSqlQuery` wide-SELECT의 WHERE 통째 무시) · **13-11**(`UpdateLocalTypes(activate_on_update:true)` 거짓 성공) · **13-13**(`GetIncludesList`가 `INCLUDE … IF FOUND`의 비실재 객체명 반환). 등재 항목은 동등성 비교에서 **제외**되되 **각각 근거 문서 + 대체 기대 시험**을 반드시 동반한다 — 제외가 곧 무증거가 되지 않게 하는 조건이다. 성능·한계·UX류 결함은 **동일 재현 후 별건 수리**. 미분류 항목은 이 기준(오답·거짓 성공 = 수리, 그 외 = 재현)으로 제작 중 분류한다.
  ⑥ **ZMCP 유지 — SAP 측 보조 오브젝트는 예외.** 신 엔진도 기설치된 `ZMCP_ADT_*`(`interactive/server/sap-assets/`의 dispatch·textpool·DDIC 계열)를 **그대로 호출한다**. SAP 오브젝트 무접촉 원칙 · 기설치본 재사용 · **추가 SAP 작업 0**.
  ⑦ **배포 정체성은 명시적 미결.** npm/MCP 레지스트리 발행 정체성(패키지명·발행 주체·범위)은 **교체 판의 안건**이며, 착수 판에서 발행 관련 작업을 벌이지 않는다.
  ⑧ **꼬리 49종은 계약에 포함하되 재평가 체크포인트 1회.** 한 달 실측에서 양쪽 증거(자산 참조 · 실호출)가 모두 0인 49종(`Delete*` 25종 전부 포함)도 ②의 전량 승계 대상이다. 다만 **최종 교체 직전에 한 번 재평가**하고, 그때의 결정은 **새 D-항목**으로 남긴다 — 지금 결정된 것이 아니다.
- **대안·기각**: (a) **시작 후보군 110종대로 좁혀 시작**(청사진 ⑴의 초기 안) — 사용자가 전량 승계를 명시 선택, 기각. 좁히면 제품 표면이 조용히 줄고 ④ⓒ의 "tool-catalog diff 0" 계약 자체가 성립하지 않는다. (b) **`Get*`/`Read*` 쌍 통합·개명을 자작과 묶기** — 지식·절차·스킬이 동시에 깨진다(청사진 §3.2 금지), 기각. 표면 재편은 교체 이후의 별건이다. (c) **상류 코드 부분 재사용(포크 후 정리)** — 계보 고지를 은퇴시킬 수 없고 유지보수 부채가 그대로 넘어온다, 기각. (d) **MCP 규약 계층까지 자작** — 규약 재구현은 소유권 이득이 없고 응답 형태 표류 위험만 는다, 기각(사용자 결정). (e) **엔진 백로그 13 전건을 신 엔진에서 동시 수리** — 동등성 대조의 기준선이 흔들린다, 기각(오답·거짓 성공 계열만 allowlist로 분리). (f) **발행 정체성 선결** — 착수 작업량과 무관하고 되돌리기 비싼 결정이라 이연(⑦).
- **정직 유보**: ⓐ **186종 전량 재제작의 공수는 미측정**이다 — 이 결정은 범위를 정했을 뿐 완주 근거를 갖고 있지 않다. ⓑ **녹화-재생 대조는 녹화 원본에 의존한다** — 실호출이 없는 표면에는 녹화가 없고, 그래서 ④ⓑ의 계약 시험 신규 저작이 짝으로 붙는다. ⓒ **divergence allowlist 3건은 등재만이고 재현 판정은 미수행**이다 — 엔진 백로그 13은 전건이 "등재만 · 판정 대기" 상태 그대로다(D-064·D-069). 신 엔진이 다르게 동작하는 것과 구 엔진이 실제로 그 결함을 갖고 있는 것은 별개이며, 판정은 제작 중에 붙는다. ⓓ **"복사가 아님"을 기계로 증명하는 게이트는 없다** — 참조-재저작의 경계는 사람 판단이다. ⓔ **실사용 실사는 소유자 1인 · 머신 1대 · 1개월의 기록**이다(2026-07-13~08-10) — 꼬리 49종 판단이 이 표본에 묶여 있고, 그래서 ⑧의 재평가 체크포인트를 뒀다. ⓕ **이 항목은 착수 기록이다** — 아래 「영향」의 신설·수정은 문서와 새 경로에 한정되고 제품 동작 변화는 0이다.
- **영향**: 신설 = `sapkit-engine/`(새 경로 · 병행 제작 · 선행 커밋의 스캐폴드). 수정 = `docs/BLUEPRINT.md`(사다리 ⑴ 승계 범위를 전량으로 전환 · §4.7 실사용 실사 축 등재). **불변** = `engine/` · `interactive/` 제품 트리 · `interactive/server/` 번들(엔진 5.0.0 현역) · 기존 게이트·CI · 도구 표면 155/186 · `LICENSE` 3종·`THIRD_PARTY_NOTICES.md` 고지 · unattended=sealed · ENGINE template-only(D-040).

## D-080 · 2026-08-11 · M1에 자격증명 참조 해석 편입 (fail-closed) + attended 진입 스크립트 신설 — 실 SAP 계정 잠금 사고에서 나온 결정

- **맥락**: D-079가 지은 M1은 오프라인 증거만 갖고 있었고(jest 793 · 게이트 37 · 픽스처 0건), attended 3구간(C1 녹화 · C2 재생 판정 · C3 실기)은 **부를 진입점이 없어** 착수 자체가 불가능했다 — `recordSequence`/`replaySequence`의 호출부가 `__tests__/` 안에만 있었다. 진입점을 짓고 첫 attended 실행을 하자 **사고가 났다**. 배포 프로파일의 `sap.env`는 `SAP_PASSWORD`에 비밀번호가 아니라 **`keychain:<service>/<account>` 참조**를 담는데(구 엔진 `engine/src/lib/secrets.ts`가 정한 형식), 신 엔진에는 그 해석 계층이 **통째로 없었다**. 참조 문자열이 그대로 비밀번호로 SAP에 날아가 401이 났고, 시퀀스 러너가 "오류 응답도 대조 대상"이라는 **올바른 이유로** 다음 단계를 계속 태워 실패 로그온이 6~7건 쌓였다. `login/fails_to_user_lock` 문턱을 넘겨 **실 계정이 잠겼다**(사용자가 SU01로 해제). 오프라인 시험 793건이 전부 놓친 결함이며, 하네스의 첫 실전 실행이 잡아냈다.
- **결정**:
  ① **자격증명 참조 해석을 M1 범위에 편입한다.** `sapkit-engine/src/profile/secrets.ts`를 **참조-재저작**(D-079 ③)으로 신설하고 `resolve.ts`에 배선한다. 스킴은 구 형식 `keychain:<service>/<account>` 그대로 — 형식을 바꾸면 기존 프로파일이 전부 깨진다. **읽기만** 구현한다(쓰기·삭제는 프로파일 관리인 `sapkit:setup`의 일이지 서버의 일이 아니다).
  ② **성질은 fail-closed다.** 해석에 실패하는 **모든** 갈래(스킴 오타 · 키체인 모듈 부재 · 항목 없음 · 빈 값 · 조회 예외)에서 **접속 객체를 만들지 않고** 이름 있는 진단(`KEYCHAIN_REF_INVALID`·`KEYCHAIN_UNAVAILABLE`·`KEYCHAIN_ENTRY_NOT_FOUND`)만 남긴다. **해석하지 못한 참조가 비밀번호 자리로 나가는 갈래는 코드에 존재하지 않는다.** 이것이 이 결정의 핵심이며, 회귀 시험이 두 갈래로 못박는다.
  ③ **`@napi-rs/keyring@1.3.0`을 `optionalDependencies`로 선언한다.** 레포에 이미 있던 것(`interactive/server/runtime-deps/keyring/`)과 같은 판이다. 늦은 `require` — 이 모듈이 없는 환경(CI·컨테이너)에서도 서버는 뜨고, **참조를 실제로 만났을 때만** 오류가 된다. (불러오기 결과를 캐시하지 않는다. 첫 판은 캐시했으나 그 캐시를 비우는 시험 전용 표면이 호출부 없이 남는 문제가 리뷰에서 드러나 함께 걷어냈다 — Node 모듈 캐시가 이미 받아 주고 호출 빈도는 접속 생성당 1회다.)
  ④ **인증 실패는 시퀀스를 중단시킨다** — `harness/auth-guard.mjs`. 401 계열 첫 건에서 전송을 끊고, 404·문법 오류·게이트 거부는 그대로 통과시킨다. **오류를 대조하는 것과 같은 자격증명으로 실패를 반복하는 것은 다른 일이다** — 후자는 계정을 잠근다. 이 가드가 처음부터 있었다면 실패 로그온은 1건에서 끝났다.
  ⑤ **attended 진입 스크립트 2종을 신설한다** — `harness/record-attended.mjs`(C1) · `harness/replay-attended.mjs`(C2). 판정 규칙은 새로 쓰지 않고 기존 라이브러리를 조립하며, 라이브러리가 보지 않는 축만 얹는다 — **강등 감지**(무접속 문구 · 전 단계 오류 · 신 엔진 오채록) · 덮어쓰기 보호 · **고객 네임스페이스 제한**(대상이 고객 객체여야 하는 **15종** — 소스를 돌려주는 8 + SAP을 바꾸는 7 — 을 **실 SAP 호출 전에** 판정하고, 목록 밖 도구는 인자·응답의 ABAP 원본 표지로 사후 차단) · 인증 실패 중단 · **P2 배치 금지**(행 데이터 픽스처는 한 건씩) · 신 엔진 진단 수집. 뒤의 넷은 리뷰 3회가 끌어낸 것이다. 픽스처 0건은 **통과가 아니라 무증거**로 종료 코드 1이다.
- **대안·기각**: (a) **임시 평문 프로파일로 C1/C2를 진행하고 keychain은 교체 판으로** — 지금 당장 움직일 수 있지만 **아무도 쓰지 않는 설정으로 동등성을 증명**하게 되고, 평문 비밀번호 파일이 디스크에 남는다. 사용자 선택으로 기각. (b) **장부(DIVERGENCES)에 축소로 등재** — 등재는 "의도적 차이"의 자리이고 이것은 결함이다(장부 규칙: 미등재 차이 = 결함). 등재하면 결함이 합법화된다, 기각. (c) **`SAP_PASSWORD_STORAGE=file` 암호화 파일 폴백도 함께 구현** — 구 엔진에서 그 폴백은 **오류 문구에만 있고 구현이 없다**(HANDOFF §6 백로그 14 신설). 없는 기능을 승계할 이유가 없다, 기각. (d) **해석 실패 시 원문을 평문 비밀번호로 되돌리기** — 오타 난 참조가 곧 비밀번호가 되어 SAP로 날아간다. 이번 사고의 재현 경로 그 자체, 기각.
- **정직 유보**: ⓐ **계정 잠금은 원인을 기계로 확정하지 못했다** — ADT/HTTP는 잘못된 비밀번호와 잠긴 계정을 똑같이 401로 돌려준다. "몇 분 전 성공한 자격증명이 실패 로그온 누적 직후 거부됐다"는 정황과 사용자의 SU01 해제로 확인했을 뿐, SAP 측 잠금 카운터를 읽지는 않았다. ⓑ **키체인 계층의 시험은 `reader` 교체점으로 돈다** — 네이티브 모듈 자체의 동작은 실 프로파일 1건으로 확인했고(접속 생성 · 참조 아님), 플랫폼 3종(Windows/macOS/Linux) 중 **Windows만 실측**이다. ⓒ **auth-guard의 판정은 문자열 정규식이다** — 401 계열을 텍스트로 알아본다. SAP이 다른 어휘로 인증 실패를 알리는 경로가 있으면 놓친다. ⓓ **재생 대조 첫 통과는 읽기 2종뿐이다**(`SearchObject`·`CheckSyntax`) — 증거 없는 도구가 **17종** 남았고 write·실데이터 계열은 전부 그 안이다. 배관 확인 시나리오에서 `GetClass`는 **표준 객체의 원본 소스를 커밋하게 되므로**, `GetInactiveObjects`는 **공유 시스템의 가변 상태를 기대값으로 굳히므로** 각각 빠졌다(리뷰 1차·2차). ⓔ **이 판의 attended 실행은 P1(읽기)에 한정됐다** — P3 write와 P2 실데이터는 아직 한 번도 태우지 않았다.
- **영향**: 신설 = `sapkit-engine/src/profile/secrets.ts` · 그 시험 · `harness/auth-guard.mjs` · `harness/record-attended.mjs` · `harness/replay-attended.mjs` · `harness/scenarios/`(형식 문서 + 읽기 전용 예시) · `fixtures/example-read-only.json`(첫 실증거). 수정 = `sapkit-engine/src/profile/resolve.ts`(fail-closed 배선) · 그 시험 · `package.json`(optionalDependencies) · `harness/README.md` · `harness/DIVERGENCES.md`(**D19·D20 등재** — 빈 문자열 처리 · 해석 실패 시 강등) · `HANDOFF.md`. **불변** = `engine/` · `interactive/` 제품 트리 · 번들(엔진 5.0.0 현역) · 기존 게이트·CI · 도구 표면 · D-079의 범위 결정 전부.

## D-081 · 2026-08-13 · 사다리 ⑴ 마일스톤 체계 확정 (M1 잔여 ~ M6) — 뼈대 먼저 · 도구는 증거 방식으로 · D8→M6 · D15→M2

- **맥락**: D-079가 사다리 ⑴(SAPKIT Engine 자작)을 착수하며 정의한 마일스톤은 **`M1` 하나뿐**이었다. M1의 오프라인 구간은 끝나 PR #1로 main에 머지됐지만 **M1은 아직 열려 있다** — 완료 판정 8항목 중 둘이 미충족이다: **재생 대조 전건 통과**(M1 도구 19종 중 **7종만** 증거가 있고 12종이 미증거) · **실 SAP 대표 절차 실기**(미수행). 그리고 **M2 이후가 어디에도 정의돼 있지 않았다.** 그 공백이 이미 실해를 냈다 — `sapkit-engine/harness/DIVERGENCES.md`의 두 항목이 **존재하지 않는 번호**를 해소 시점으로 적어 두고 있었다(**D8** 잔존 축소 3건 = "M2 이후, 늦어도 교체 판 이전" · **D15** destination·broker 인증 미구현 = "인증 확장(Basic 외) 마일스톤"). 여기서의 `D8`·`D15`·`D18`은 의도적 차이 장부의 일련번호이며 이 결정 로그의 `D-0xx`와는 다른 체계다. **이 항목은 코드를 짓지 않는다** — 남은 작업의 덩어리 경계와 각 덩어리의 완료 판정을 문서로 확정하고, 위 두 참조를 실재하는 번호에 거는 것이 전부다.
- **결정**:
  ① **경계의 축 = 뼈대를 앞에 몰아 닫고, 도구는 증거 방식으로 둘로 가른다.** 남은 일을 **뼈대**(접속 방식 · 전송 · RFC 경로)와 **도구 물량**으로 나누고 뼈대를 앞에 둔다. 근거 둘. **상태 정합** — 진짜 남은 뼈대는 전송 2종 · RFC 4경로 · 인증 확장 셋뿐이고 위험이 거기 몰려 있으므로 앞에서 닫는다. **증거 계층과 1:1** — D-079 ④가 증거 방식을 표면의 실사용 여부로 이미 갈라 놓았으므로(실사용 = 녹화-재생 대조 / 미사용 = 계약 시험 신규 저작), 도구를 그 경계로 자르면 **한 마일스톤 안에서 증거 방식이 하나로 통일된다.**
  ② **M1 잔여 ~ M6.** **M1(진행 중)** = 잔여 둘 — 미증거 도구 12종의 녹화·재생 대조 + 대표 절차 실기 1건. **M2** = 접속 방식 확장(destination · service-key · broker 인증, `--mcp=<destination>`·`--env=<name>` 통로). **M3** = 전송 2종(HTTP·SSE) + RFC 4경로(`soap`·`native`·`gateway`·`zrfc`) — **뼈대는 여기서 끝난다.** **M4** = 도구 실호출 116종(녹화-재생 대조). **M5** = 나머지 70종(자산참조만 21 + 꼬리 49 — 계약 시험 신규 저작). **M6** = 교체 직전 관문. **순서는 M1 → M2 → M3 → M4 → M5 → M6으로 고정**하고, M 안에서의 병행 여부는 정하지 않는다. 각 M의 완료 판정 전문은 `docs/BLUEPRINT.md` 사다리 ⑴ 절의 마일스톤 체계 표가 정본이다. **116/70 분할의 기준은 같은 문서 §4.7의 실사 정본**이며, 실사 수치가 갱신되면 경계도 따라 움직인다 — M4·M5의 정의는 *수치*가 아니라 *증거 방식*이다.
  ③ **전 M 공통 완료 요건 6개** (M1 잔여부터 M6까지 전부에 적용, M1 완료 판정 8항목의 형을 승계): jest 스위트 + `sapkit-engine` CI 잡 green · **기존 제품 게이트 전종 여전히 green**(구 부품 무접촉의 기계 증명) · 안전 게이트 적합성 + 음성시험 통과(tier · 블록리스트 · 실데이터 2종) · **노출 제어 회귀 0**(무프로파일 inspection-only / onprem / readonly 세 상태의 tools/list 분기가 그 M의 표면에 대해 유지) · 그 M의 증거 급이 커버리지 표에 기록 · **마일스톤별 실 SAP attended 확인 1건**(소유자 attended 세션 · 전용 DEV 연습 패키지 안 · 배치/서브에이전트 무인 실행 금지).
  ④ **교체 전 필수 2건 + D8 + 꼬리 49종의 자리를 지정한다.** **D15 → M2** — D15가 스스로 "인증 확장(Basic 외) 마일스톤"이라 적었고 M2가 정확히 그것이다. 미해소 교체 시 destination 인증 등록은 접속을 잃는다. **D18 → M6** — D18 본문이 "교체 판에서 적합성 러너의 분류 어휘를 갱신"이라 적었다. 단 **M6 시점엔 아직 구 번들이 현역이므로 갱신은 '교체'가 아니라 '확장'이다** — 신 문구로 바꾸면 그 순간 구 번들 판정이 깨지고, 안 넓히면 교체 후 신 엔진의 정상 거부가 `OTHER`로 떨어진다. **두 문구를 다 인식하도록 넓히는 것**이 맞다. **D8 → M6** — D8의 판정 자리는 마일스톤이 아니라 **관찰 조건**이다("C1 녹화에서 발동이 관찰되면 그때 승계"). 관찰이 다 모이는 시점이 관문이며, 원래 문구의 실질 제약("늦어도 교체 판 이전")과 어긋나지 않는다 — "M2 이후"는 하한이었다. **꼬리 49종 재평가 → M6** — D-079 ⑧이 이미 "최종 교체 직전 1회 + 새 D-항목"으로 못박아 뒀고, 이 항목은 그 자리에 **번호만 붙인다.**
  ⑤ **정본 위치 = `docs/BLUEPRINT.md`의 사다리 ⑴ 절.** 이 문서가 CLAUDE.md 문서 계약에서 이미 "재구성 계획(사다리 단계 · 끝그림 · 도구 실사)의 정본"으로 선언돼 있고, ⑴의 「검증 기준」이 바로 옆이라 한 화면에서 읽힌다. **다만 「검증 기준」 5개는 사다리 ⑴ 전체의 끝 판정이고 M-표는 그 아래 단계다** — M 하나가 닫히는 것은 ⑴이 끝났다는 뜻이 아니며, 새 절의 도입 문장이 이 층위 차이를 명시한다.
  ⑥ **M6은 판정하는 자리이지 짓는 자리가 아니다 — 예외 하나.** D8 관찰이 **양성**이면(406/415 재협상 · discovery 외 폴백 · `skipSessionType` 중 하나라도 발동이 관찰되면) 그 항목은 결함으로 승격되고 승계 제작이 필요해진다. 그 경우 **M6은 판정만 하고 제작은 뼈대 계층(M3 성격)의 추가 작업으로 다룬다.** 관문이 새 기능을 짓지 않는다는 원칙과 충돌하지 않게 하기 위함이며, 분량과 일정은 관찰 시점의 판단이다.
  ⑦ **이 항목은 D-079를 뒤집지 않는다 — 그 안에서 순서만 정한다.** 도구 표면 **186종 전량 승계** · **개명 금지** · 참조-재저작 · MCP 규약 계층의 공식 SDK 예외 · ZMCP 유지는 전부 **불변**이다. M-체계는 *무엇을 만드는가*가 아니라 *무엇을 먼저 만드는가*를 정한 것이다. 범위를 깎는 방향의 후속 제안은 이 항목이 아니라 **D-079를 뒤집는 것**이고 별도 D-항목을 요구한다.
- **대안·기각**: (a) **뼈대 셋을 각각 한 M으로 두고 도구 167종을 통짜 한 M으로** — 마지막 M 하나가 전체 노동의 대부분이 되어 그 안에서 진도를 볼 눈금이 없다, 기각. (b) **도구 개수로 자른다**(60 → 116 → 137 → 186) — 진도가 숫자로 보이는 이점이 있으나 뼈대 셋이 여러 M에 쪼개져 들어가 **위험이 뒤로 밀리고** D15가 어느 M인지도 흐려진다, 기각. (c) **증거 방식만으로 자른다**(실호출 → 자산참조만 → 꼬리) — 증거 방식이 M마다 하나로 통일되는 이점은 채택안과 같으나 **접속 방식 확장(D15)이 도구 M 안에 묻혀** 뼈대가 끝난 시점이 관측되지 않는다, 기각. (d) **M1 잔여를 뒤로 흡수한다**(재생 12종 → M4 · 실기 → 각 M 공통 요건) — 빨리 M2로 갈 수 있으나 **증거가 빈 채로 뼈대 작업이 앞선다.** M1이 자기 검증 절차를 못 돈 상태에서 그 위에 쌓는 것이 된다, 기각. (e) **M1 잔여를 별도 번호로**(M1.5 등) — 장부는 정확해지나 번호 체계가 느슨해진다. **M1을 열어 두는 것**으로 같은 효과를 얻는다, 기각.
- **정직 유보**: ⓐ **M1의 19종 중 몇 종이 실호출 116에 속하는지 실측하지 않았다** — 보완 4종(`GetProgram`·`CreateProgram`·`CreateInclude`·`GetSourceDiff`)의 소속이 미확인이다. M4·M5의 완료 판정을 **집합 전량**으로 쓴 것이 이 미확인을 우회한다 — 겹침을 계산할 필요가 없다. ⓑ **M 안에서의 병행 가능 여부는 정하지 않았다** — 도구 작업 일부는 뼈대 완성 전에도 가능하지만 그 판단은 각 M 착수 시점의 일로 남긴다. ⓒ **116/70 분할은 소유자 1인 · 머신 1대 · 1개월(2026-07-13~08-10) 표본에 묶여 있다**(D-079 정직 유보 ⓔ) — 그래서 M4·M5를 수치가 아니라 증거 방식으로 정의했다. ⓓ **각 M의 공수는 미측정이다** — D-079 정직 유보 ⓐ가 그대로 유효하다. 이 항목도 범위와 순서를 정했을 뿐 완주 근거를 갖고 있지 않다. ⓔ **이 판은 작업 가지 `dryforge/tmp-practice-scenarios`에 커밋된다**(사용자 결정) — 그 가지에는 PR #2가 열려 있으므로 **PR #2가 머지돼야 M-표가 main에 도달한다.** 머지하지 않기로 하면 계획표도 함께 사라진다. ⓕ **공유 문서 4개가 끝난 사이클의 일회용 작업 문서를 각주로 인용하는 곳이 13곳 있다** — `sapkit-engine/harness/DIVERGENCES.md` 9 · `harness/replay/README.md` 2 · `harness/old-surface/README.md` 1 · `harness/scenarios/README.md` 1. 그 작업 문서는 커밋되지 않는 폴더(`.dryforge/001/`)에 있어 **다른 머신에서는 가리킬 대상이 없다.** 영구 문서가 일회용 문서를 가리킨 흠이며, **이 항목은 13곳 중 하나도 고치지 않았다** — 백로그. ⓖ **의도적 차이 장부의 커버리지 공백 3건도 배정하지 않았다** — 「채록하지 않기로 한 경로」의 `transport_request` 계열 6종과, 「C1에서 확인할 것」 중 D8에 속하지 않는 둘(잠금 보유 중 CSRF 재취득이 stateless인지 · 클라이언트 쿠키 고정이 write 403을 막는지). **차이가 아니라 관찰·커버리지 항목**이라 M-표에 넣지 않았다. 실질 자리는 M6으로 보이나 **이 항목이 배정하지 않는다** — 백로그.
- **영향**: 수정 = `docs/BLUEPRINT.md`(사다리 ⑴ 절에 마일스톤 체계 표 + 공통 요건 + M6 예외 신설) · `sapkit-engine/harness/DIVERGENCES.md`(D8·D15의 해소 마일스톤을 실재 번호로 결선하고 정의 위치를 함께 가리킴 — 두 항목의 나머지 본문 무수정) · `docs/reference/DECISIONS.md`(이 항목 append) · `HANDOFF.md`(재개점). **코드 0줄.** **불변** = D-079의 범위 결정 전부(186종 전량 승계 · 개명 금지 · 참조-재저작 · MCP SDK 예외 · ZMCP 유지 · 배포 정체성 미결) · `engine/` · `interactive/` 제품 트리 · `sapkit-engine/src/` · 번들(엔진 5.0.0 현역) · 기존 게이트 · CI · 안전 바닥선(3층 방어 · 실데이터 2종 상시 게이트 · attended-only · unattended=sealed).

## D-082 · 2026-08-13 · 마일스톤 완료를 「짓기 완료 / 증거 완료」 두 단계로 분리 — 오프라인 대량 제작 판의 근거 (D-081의 순서 고정은 증거 축으로 존속)

- **맥락**: D-081이 사다리 ⑴의 마일스톤 체계를 확정하며 **제작 순서를 M1 → M2 → M3 → M4 → M5 → M6으로 고정**했고, 그 ③(전 M 공통 완료 요건 6개 · 전문은 `docs/BLUEPRINT.md` 사다리 ⑴ 절의 M-표)은 **마일스톤마다 실 SAP attended 확인 1건**을 요구한다. 그런데 **M1은 아직 열려 있고 그 잔여가 전부 SAP 접속을 요구한다** — 재생 대상 10종의 녹화·재생 대조 · `CreateInclude` 실기 · 대표 절차 실기(C3). 이 셋은 소유자 attended 세션이 잡혀야만 움직인다. 그 결과 **세션이 잡히기 전까지는 오프라인으로 지을 수 있는 것까지 전부 멈춘다** — 도구 물량(M4·M5)도, 뼈대(M2·M3)도, 접속 없이 지을 수 있는 부분이 남아 있는데 순서 고정이 그것을 막는다. 이 항목은 그 교착을 푸는 판(`dryforge/offline-bulk-build` · 과제 34개 · **오프라인 전용**)의 근거이며, 그 판이 위 두 규칙과 정면으로 부딪힌다는 사실을 **조용히 어기지 않고 결정으로 해소**한다. **이 항목은 코드를 짓지 않는다** — 완료의 눈금을 둘로 나누고, 이 판이 어디까지 가는지를 못박는 것이 전부다.
- **결정**:
  ① **마일스톤 완료를 두 단계로 나눈다.** **`짓기 완료`** = 그 M의 제작물이 **오프라인 증거까지 초록**인 상태. 구체적으로 D-081 ③의 공통 요건 6개 중 SAP 접속을 요구하지 않는 것 전부 — jest 스위트 + `sapkit-engine` CI 잡 green · **기존 제품 게이트 전종 여전히 green**(구 부품 무접촉의 기계 증명) · 안전 게이트 적합성 + 음성시험 통과(tier · 블록리스트 · 실데이터 2종) · **노출 제어 회귀 0**(무프로파일 inspection-only / onprem / readonly 세 상태의 `tools/list` 분기) · 그 M의 증거 급이 커버리지 표에 기록. **`증거 완료`** = 거기에 **SAP 접속을 요구하는 증거**가 붙은 상태 — 실사용 표면의 녹화-재생 대조 실물 픽스처 · 미사용 표면의 대표 건 attended 실기 · **마일스톤별 실 SAP attended 확인 1건**(소유자 attended 세션 · 전용 DEV 연습 패키지 안 · 배치/서브에이전트 무인 실행 금지). **`증거 완료`가 되기 전에는 그 M이 "닫혔다"고 말하지 않는다** — 진척 보고·`HANDOFF.md`·대장 어디에서도 `짓기 완료`를 완료로 쓰지 않는다.
  ② **이 판이 도달하는 지점 = M2·M3·M4·M5의 `짓기 완료`.** 네 M 모두 **`증거 완료`는 열려 있다.** 이 판이 끝나도 사다리 ⑴은 닫히지 않고, M 하나도 닫히지 않는다.
  ③ **M1은 이 판의 범위 밖이다.** 위 맥락의 잔여 셋은 전부 SAP 접속을 요구하므로 **나중의 attended 세션에 속한다.** 예외 하나 — **커버리지 배선**(`sapkit-engine/harness/replay-attended.mjs`가 커버리지 표에 `attended`·`contractTests` 급을 넘기지 않는 것)은 오프라인 결함이므로 **이 판이 처리한다.** 이것은 M1을 닫는 작업이 아니라 M1이 닫힐 때 쓰일 계기를 고치는 작업이다.
  ④ **D-081을 뒤집지 않는다 — 순서 고정은 `증거 완료`의 순서로 살아남는다.** 증거를 태우는 순서는 여전히 **M1 → M2 → M3 → M4 → M5 → M6**이다. 이 판이 앞당기는 것은 **`짓기` 축 하나**뿐이다. D-081 ②의 M 정의와 경계(뼈대 먼저 · 도구는 증거 방식으로 둘) · ③의 공통 요건 6개 · ④의 D8→M6 · D15→M2 · D18→M6 · 꼬리 49종 재평가→M6 배정 · ⑤의 정본 위치(`docs/BLUEPRINT.md` 사다리 ⑴ 절) · ⑥의 M6 예외는 **전부 불변**이다.
  ⑤ **D-079도 뒤집지 않는다.** 도구 표면 **186종 전량 승계** · **개명 금지** · 참조-재저작(`@babamba2/*` 8종 전면 금지) · MCP 규약 계층의 공식 SDK 예외 · ZMCP 유지 · 배포 정체성 미결 · **안전 바닥선**(3층 방어 · 실데이터 2종 상시 게이트 · attended-only · `unattended=sealed`)은 전부 그대로다. 이 판은 *무엇을 만드는가*도 *언제 증거를 다는가*도 바꾸지 않고, **오프라인으로 지을 수 있는 것을 언제 짓는가**만 바꾼다.
  ⑥ **판 단위 순차로 확정한다 — 한 번에 한 판.** 도구를 올리는 모든 과제가 `sapkit-engine/src/tools/registry.ts` **한 파일**에 붙는다(그 파일이 스스로 "**유일한 등록 지점**"이라 선언한다). 판을 겹쳐 돌리면 **매 판마다 그 한 파일에서 충돌**하고, 충돌 해소가 곧 등록 누락의 통로가 된다. D-081 정직 유보 ⓑ는 "M 안에서의 병행 여부"를 각 M 착수 시점의 일로 열어 두었는데, **이 항목이 그 미결을 판 단위 순차로 닫는다.** 한 판 **안**의 과제 병행은 그대로 허용된다 — 닫는 것은 판과 판의 겹침이다.
  ⑦ **문서 반영.** 이 항목을 `docs/reference/DECISIONS.md`에 **append**하고(기존 항목 무수정), `docs/BLUEPRINT.md`의 M-표에 **`짓기 완료`/`증거 완료` 두 칸**을 반영한다. 후자는 같은 판의 별도 과제 몫이다.
- **대안·기각**: (a) **D-081대로 M1의 SAP 증거를 다 채우고 M2로 간다** — 원칙상 가장 깔끔하고 "증거 없는 것 위에 쌓지 않는다"(D-081 대안 (d) 기각 사유)를 그대로 지킨다. 그러나 M1 잔여가 **전부 attended 세션에 묶여 있어** 세션이 잡히기 전까지 오프라인으로 지을 수 있는 것이 전부 멈춘다. 기각 — 다만 그 원칙은 버려지지 않고 **`증거 완료` 축에 그대로 보존**된다. (b) **완료 정의를 그대로 두고 조용히 어긴다**(순서만 섞고 로그는 손대지 않음) — 34개 과제가 도는 동안 결정 로그는 **이 판이 대놓고 어기는 순서 고정을 현행으로** 들고 있게 되고, 다음 세션이 로그를 믿으면 실제 상태를 오독한다. 기각. (c) **D-081을 폐기하고 순서 고정을 없앤다** — 순서 고정의 근거(위험이 뼈대에 몰려 있음 · 한 M 안에서 증거 방식이 하나로 통일됨)는 **증거 축에서 여전히 유효**하다. 축 하나가 걸린다고 항목 전체를 버릴 이유가 없다. 기각. (d) **`짓기 완료`를 새 마일스톤 번호로 쪼갠다**(M2a/M2b …) — 장부는 정확해지나 번호가 두 배가 되고 D-081 ④의 D8·D15·D18 배정이 어느 쪽 번호를 가리키는지 흐려진다. **같은 M에 칸을 둘로 두는 것**으로 같은 효과를 얻는다. 기각(D-081 대안 (e)와 같은 사유). (e) **판을 여럿 동시에 돌려 총 시간을 줄인다** — 등록점 한 파일 충돌이 매 판 반복되고, 그 해소 과정이 도구 등록 누락의 통로가 된다. 기각(⑥).
- **정직 유보**: ⓐ **이 판은 SAP 접속 증거를 하나도 얻지 않는다** — 녹화 0 · 재생 0 · 실기 0 · 실접속 0. 이 판에서 태어나는 도구는 전부 **오프라인 증거만** 갖는다. 그 부채는 사라지지 않고 대장 `sapkit-engine/TOOL-LEDGER.md`가 **수로 보고한다** — 증거 급별 개수가 곧 남아 있는 attended 노동량이다. **부채를 눈에 보이게 두는 것이 이 분리의 값**이며, 대장이 그 값을 잃으면 분리도 함께 무의미해진다. ⓑ **오프라인 계약 시험은 신 엔진이 스스로 정한 기대값을 통과한 것**이지 구 엔진·실 SAP과 같다는 증거가 아니다. `짓기 완료`를 완료로 읽는 순간 그 차이가 지워진다 — 두 칸을 나눈 이유가 정확히 이것이다. ⓒ **`짓기 완료`에서 `증거 완료`까지의 공수는 미측정이다** — D-079 정직 유보 ⓐ와 D-081 ⓓ가 그대로 유효하다. 이 항목도 눈금과 순서를 정했을 뿐 완주 근거를 갖고 있지 않다. ⓓ **이 항목이 append되는 시점에 D-081은 `main`에 없다.** D-081 정직 유보 ⓔ가 경고한 상황("PR #2가 머지돼야 M-표가 main에 도달한다")이 **실제로 어긋난 방향으로 일어났다** — PR #2는 D-081 커밋들보다 **먼저** 머지됐고(`b52afc5`), D-081과 `docs/BLUEPRINT.md`의 M-표는 미머지 가지 `dryforge/tmp-practice-scenarios`(head `c5088d3`)에만 남아 있다. 이 판의 가지도 `b52afc5`에서 갈라졌으므로 **이 파일에서는 D-080 다음에 D-082가 온다.** 번호를 D-081로 쓰지 않은 것은 **충돌을 피하려고 자리를 비워 둔 것**이고, 그 가지가 합류하면 순서가 메워진다. **합류하지 않으면 이 항목이 인용하는 D-081과 M-표는 실재하지 않는 문서가 된다** — 판을 닫기 전에 합류 여부를 결정해야 한다. ⓔ **판 단위 순차(⑥)는 등록점이 한 파일이라는 *지금의* 구조에서 나온 판단이다** — 등록점을 쪼개면 근거가 사라지고 재검토 대상이 된다. 등록점 분할 자체는 표면을 건드리지 않으므로 D-079 ②(개명 금지)와 무관한 별건이다. ⓕ **`짓기 완료`의 요건 목록(①)은 D-081 ③의 6개를 접속 요구 여부로 가른 것**이고, 그 6개가 접속 요구/비요구로 깨끗이 갈리는지는 **M-표 전문과 대조하지 않았다** — 대조와 표 반영은 같은 판의 BLUEPRINT 과제 몫이며, 어긋나면 그 과제가 이 항목을 정정하는 새 항목을 요구한다.
- **영향**: 수정 = `docs/reference/DECISIONS.md`(이 항목 append) · `docs/BLUEPRINT.md`(M-표에 `짓기 완료`/`증거 완료` 두 칸 — 같은 판의 별도 과제) · `HANDOFF.md`(재개점 · 진척 표 — 같은 판의 별도 과제). **이 항목 자체는 코드 0줄.** **불변** = D-079의 범위 결정 전부(186종 전량 승계 · 개명 금지 · 참조-재저작 · MCP SDK 예외 · ZMCP 유지 · 배포 정체성 미결) · D-081의 M 정의·경계 · 공통 요건 6개 · D8/D15/D18·꼬리 49종 배정 · M6 예외 · 정본 위치 · `engine/` · `interactive/` 제품 트리 · 번들(엔진 5.0.0 현역) · 기존 제품 게이트 전종 · CI · 안전 바닥선(3층 방어 · 실데이터 2종 상시 게이트 · attended-only · `unattended=sealed`).

## D-083 · 2026-08-14 · 꼬리 49종 재평가 관문 결과 = **전량 유지** — 짓기 직전에 물었고, 사용자가 전량 제작을 택했다

- **맥락**: D-079 ⑧이 **"교체 직전 재평가 1회"**를 예약했고, D-081 ④가 그 자리를 **M6**에 배정했다. 그런데 오프라인 대량 제작 판이 **꼬리를 맨 마지막 묶음으로 모으면서** 문제가 드러났다 — 그 예약을 그대로 M6까지 두면, 재평가 시점에 꼬리 49종은 **이미 다 지어져 있다.** 다 지어 버린 뒤의 재평가는 판단이 아니라 **추인 절차**다(`spec.md` §4.4.2 · §12). 그래서 이 판은 재평가를 **짓기 직전**으로 앞당겨 관문 하나를 세웠고, 이 항목이 그 관문의 결과다.
  같은 판의 실사용 축 재측정(`docs/BLUEPRINT.md` §4.7 재측정본)이 **꼬리 49종의 이름을 처음으로 레포 안에 확정**했다는 사실도 이 관문의 전제다 — 그전에는 총계(`꼬리 49`)만 있었고 **이름 목록이 레포 어디에도 없어** 재평가 자체가 실행 불가능한 규칙이었다.
- **결정**:
  ① **꼬리 49종을 전량 유지한다 — 이 판에서 전부 짓는다.** 제외 0종.
  ② **관문은 실제로 열렸다.** 목록(삭제 계열 25종 + 그 밖 24종)과 그 성질(호출 0 · 자산 참조 0 · 삭제 계열은 오프라인 검증 원리상 불가)을 **짓기 전에** 사용자에게 보고했고, 제시된 선택지는 셋이었다 — 전량 유지 / 삭제 계열 25종만 미룸 / 꼬리 49종 전부 미룸. **사용자가 전량 유지를 택했다.**
  ③ **`spec.md` §11-4의 합격 조건(대장의 `안 지음` = 0)이 그대로 유지된다.** ②의 다른 두 선택지는 그 조건을 고쳐야 했으므로, 전량 유지는 이 판을 원래 정의대로 닫는 유일한 길이기도 하다.
  ④ **D-079 ②(표면 186종 전량 승계)는 이 관문으로 흔들리지 않는다.** 관문이 물은 것은 *범위*가 아니라 *이 판에서 지을지*다 — 범위 자체는 D-079 ②로 이미 정해져 있고 이 항목은 그것을 뒤집지 않는다(`spec.md` §12).
  ⑤ **삭제 계열 25종의 요구 증거 급은 `attended 실기`로 대장에 남는다.** 재생 대조가 원리상 불가능하기 때문이다 — 생성은 두 번째 실행에서 "이미 있다"로, 삭제는 "없다"로 실패한다(`spec.md` §3.3 사다리 1). 지어도 이 판에서는 **`지음 · 증거 대기`**이며, 그 25종이 곧 나중 attended 세션의 작업량이다.
- **대안·기각**: (a) **삭제 계열 25종만 미룬다** — "위험한 것부터 미룬다"는 직관에 맞고 attended 부채도 25종만큼 줄어든다. 그러나 그 25종은 **구 엔진에 이미 있는 기능**이라, 미루면 새 엔진이 그만큼 덜 갖춘 채로 남고 교체 판이 그 구멍을 다시 계산해야 한다. 또한 삭제 도구를 **짓는 것**과 **실행하는 것**은 다른 일이다 — tier 게이트·녹화 사전 검사가 실행 쪽을 막고 있고, 그 방어는 이 판에서 이미 기계로 확인됐다. 기각(사용자 판단). (b) **꼬리 49종 전부 미루고 137종에서 멈춘다** — 지금까지 지은 것에 SAP 증거를 붙이는 쪽으로 힘을 먼저 쓰겠다는 선택. 합리적이나 `안 지음`이 49로 남아 이 판의 합격 조건을 고쳐야 하고, **"다음 판이 무엇부터 하는가"가 다시 열린다** — 이 판이 없애려던 상태다. 기각(사용자 판단). (c) **관문 없이 그냥 전량 짓는다** — 결과는 같지만 D-079 ⑧이 예약한 판단 기회가 조용히 사라진다. 결과가 같더라도 **물어본 것과 안 물어본 것은 다르다.** 기각.
- **정직 유보**: ⓐ **재평가의 근거 데이터는 소유자 1인 · 머신 1대 · 1개월이다**(`docs/BLUEPRINT.md` §4.7 측정 한계). 다른 사용자의 분포는 다를 수 있고, **호출 0이 "필요 없음"의 증명이 아니다.** 전량 유지는 그 불확실성 위에서 **보수적인 쪽**을 택한 것이기도 하다. ⓑ **이 관문이 D-079 ⑧의 예약을 소진하지 않는다.** D-079 ⑧이 예약한 것은 **교체 직전**의 재평가 — *구 번들을 새 엔진으로 갈아끼울 때 무엇을 표면에 남길 것인가* — 이고, 이 관문이 물은 것은 **짓기 직전** — *이 판에서 지을 것인가* — 다. 묻는 시점도 대상도 다르므로 M6의 자리는 그대로 남는다. 다만 그때는 49종이 이미 지어져 있으므로, **교체 판의 재평가는 "짓지 말자"가 아니라 "표면에서 뺄 것인가"를 묻게 된다.** ⓒ **이 판이 끝나도 49종 중 어느 것도 SAP에서 한 번도 돌지 않았다** — 삭제 계열 25종은 특히, 오프라인 계약 시험이 통과했다는 사실이 **실제로 지운다**는 증거가 아니다. 대장이 그것을 `증거 대기`로 세는 것이 그 사실의 유일한 기록이다. ⓓ **이 항목은 코드 0줄이다.** 제작은 별도 과제(`T34`)가 하고, 그 결과는 대장이 보고한다.
- **영향**: 수정 = `docs/reference/DECISIONS.md`(이 항목 append). **불변** = D-079 전부(186종 전량 승계 · 개명 금지 · 참조-재저작 · 안전 바닥선) · D-081의 M 정의·경계·공통 요건 · D-082의 두 단계 완료 정의 · `spec.md` §11의 합격 조건 11개 · `engine/` · `interactive/` 제품 트리 · 번들(엔진 5.0.0 현역) · 기존 제품 게이트 전종.

## D-084 · 2026-08-15 · 사다리 완주를 「짓기 우선」으로 재배열 — SAP 증거는 최종 테스트 판으로 이연 · 판 큐 정본 `docs/RUN-PLAN.md` 신설

- **맥락**: 직전 재개점(2026-08-14)은 다음 작업을 **M1의 SAP 증거 태우기**로 고정했고, 「막힌 것 ⓑ」는 "오프라인으로 더 밀 수 있는 것이 없다"고 적었다. 그런데 그 문장은 **⑴(엔진)에 한한 사실**이다 — 사다리 전체로 보면 ⑵ 검사기는 검증 기준까지 오프라인(코퍼스 판정 diff 0 · exit code 계약)이라 **은퇴까지 SAP 없이 완주 가능**하고, ⑶ 지식 재저작은 코드 부품과 독립(BLUEPRINT §2.1 — "가장 김 · 병행 가능")이며, ⑴에도 잔여 코드(M2 UAA·JWT, D18 어휘, keyring `--omit=optional` CI)가 남아 있다. 사용자가 "⑶~⑷까지 전부 짓고 테스트는 최종으로 뺀다"는 방향을 명시했고, 아울러 판(dryforge ready→go 사이클)마다 3-doc이 머신 로컬 `.dryforge/`에 아카이브돼 **판 사이 맥락이 소실되는 문제**(git 밖 · 타 머신 불가시 — D-081 정직 신고 ⑥이 실증)를 함께 해소하기로 했다.
- **결정**:
  ① **다음 작업을 M1 증거에서 「사다리 ⑵·⑶·⑴ 잔여 코드의 오프라인 완주」로 바꾼다.** attended SAP 증거는 **최종 테스트 판(판6)** 하나로 모아 M1→M6 순서 그대로 태운다. D-082가 판 단위로 세운 「짓기 완료/증거 완료」 분리를 사다리 전체로 확장한 것이며 재정의가 아니다.
  ② **판 큐의 정본으로 `docs/RUN-PLAN.md`를 신설한다** — 판1(⑵ 검사기) → 판2(⑶-a 결정+집행) → 판3.x(⑶-b 반복) → 판4(⑶-c 집필) → 판5(⑴ 잔여 코드) → 판6.x(최종 테스트 판 · attended) → 판7(교체+`engine/` 은퇴) → 판8(⑷ 은퇴). 판1↔판2~4 병행 허용. 판 하나 = ready→go 1사이클이고, **판 완료 조건에 큐 갱신이 포함된다.** 판 사이 맥락은 `.dryforge/` 아카이브가 아니라 이 git 정본이 든다.
  ③ **판6이 열릴 때 결정할 것을 미리 등재한다** — 재생 대상 96종 전량 채록 vs 실사용-우선 채록 + 꼬리 증거 기준 인하(별도 D-append). 지금 정하지 않는다 — 판1~5의 결과와 실사용 분포를 본 뒤가 판단 시점이다.
- **대안·기각**: (a) **M1 증거부터(직전 재개점 그대로)** — 순서는 자연스러우나 크리티컬 패스가 아니다. ⑶이 최장 극(청사진 명시)이고 제품은 그동안 구 번들이라 증거 이연의 사용자 리스크가 0이다. 증거 노동을 먼저 태우면 끝그림 도달이 그만큼 늦어진다. 기각(사용자 판단). (b) **실사용(도그푸딩)으로 검증을 대체** — 대장은 판정 파일만 입력으로 받고(D-082 ①) §3.2가 검증 없는 교체·은퇴를 금지한다. 대신 판6에서 실사용과 채록을 겸행하고, 기준 인하는 그때 별도 D-항목으로 명시한다. 기각(부분 수용 — 판6 설계로 흡수). (c) **큐를 HANDOFF 재개점에만 둔다** — HANDOFF는 317KB라 ready의 입력으로 부적합하고, 재개점은 판마다 다시 쓰여 큐의 이력이 흐려진다. 전용 소형 정본이 낫다. 기각.
- **정직 유보**: ⓐ 엔진 결함이 판6에서야 드러날 수 있다 — 완충은 구 번들 현역(사용자 피해 0)과 차이 장부 D1~D132다. ⓑ ⑶-b의 "실전 검증분부터"(BLUEPRINT) 원칙은 대량 집필과 긴장이 있다 — 판3.x가 치환 순서를 그 원칙대로 지키는 것으로 푼다. ⓒ 판 구획은 시작점이지 약속이 아니다 — 판3.x·판6.x의 실제 횟수는 열려 있다.
- **영향**: 신설 = `docs/RUN-PLAN.md`. 수정 = `HANDOFF.md`(재개점 교체 · 막힌 것 ⓑ 범위 정정) · `CLAUDE.md`(문서 계약 표에 RUN-PLAN 행 추가) · `docs/reference/DECISIONS.md`(이 항목 append). **코드 0줄.** **불변** = D-079 전부 · D-081의 M 정의·경계·증거 순서 · D-082의 두 단계 완료 정의 · D-083 · §3.1 4단 절차·§3.2 금지 · 안전 정책(P2 건별 승인 · DEV-only · 연습 대상 신규) · `engine/`·`interactive/` 제품 트리 · 번들(엔진 5.0.0 현역) · 기존 제품 게이트 전종.

## D-085 · 2026-08-16 · 사다리 ⑵ 완주 — 검사기 `sapkit-cli` 자작 + 번들 동봉 + `vsp/` 은퇴 (고지 3→2)

- **맥락**: `vsp/`(Go 포크 · 상류 oisee/vibing-steampunk · MIT)는 로컬 오프라인 ABAP 검사만 쓰였는데(D-049로 온라인 MCP 모드는 이미 금지), 그 한 용도를 위해 **Go 툴체인 · 570파일 서브트리 · 상류 고지 1건 · 설치 시 바이너리 다운로드 단계**를 레포와 제품이 함께 졌다. 청사진 §⑵는 이 칸을 「검증 기준까지 오프라인이라 SAP 없이 은퇴까지 완주 가능한 유일한 칸」으로 지목했고, D-084가 그것을 판1로 큐에 올렸다. 판 실행 = dryforge ready→go 1사이클(3-doc은 머신 로컬 `.dryforge/` 아카이브 · 이 항목이 git 정본이다).
- **결정**:
  ① **언어·꼴 = TypeScript · 런타임 외부 의존 0 · `sapkit-cli/` 새 최상위.** 레포 도구줄(`sapkit-engine/`)의 관례를 미러한다(빌드 tsc · 시험 jest · `npm run verify` · `gates/`). CLI 인자 파서도 자작 소형 — 의존을 늘리는 것은 설계 변경이므로 묻는다.
  ② **전면 교체 · 부분 승계 아님.** 명령 4종 `lint`(규칙 7) · `parse`(문장 유형 93) · `analyze`(규칙 13 · JSON) · `check`(프로젝트 INCLUDE 정합 — **신설**, 구 대응물 없음). **SAP 접속도 MCP 모드도 코드에 없다** — 구 vsp의 SAP-fetch 경로 3곳은 의도적으로 미승계(장부 D-003).
  ③ **저작 규율 = D-079 ③ 준용(참조-재저작).** vsp 소스는 **읽기 전용 참고서 — 읽기 허용, 복사 금지**. MIT라 법적 의무가 아니라 **계보 고지를 깨끗이 은퇴시키기 위한 소유권 선택**이다. **계약 표면(명령 이름 · 규칙 키 · 심각도 · 플래그 · 판정 형식 · JSON 형태 · 문장 유형명)은 그대로 승계**하고 **메시지·설명 문구는 새로 쓴다**.
  ④ **완료 기준 = 판정 동등성 diff 0.** 코퍼스는 ⓐ 신작 합성 픽스처(규칙 13종 양·음성 + 문장 분류 커버리지) ⓑ oop-sample 템플릿 11파일의 **판1 시점 동결 사본**(판4 재작성·판6 후 삭제가 판1 CI를 깨지 못하게) ⓒ 구 내장 샘플(비커밋 · 광역 1회). 기준은 세 표면의 판정을 전부 담는다 — parse를 exit만 대조하면 새 분류기가 무검증 통과하기 때문이다.
  ⑤ **구 판정을 채록해 파일로 고정한다.** 은퇴하면 구 vsp도 Go도 없으므로 `sapkit-cli/fixtures/baseline/`(47파일 × 세 표면 = 141칸)과 `harness/RECORDING.md`가 **「구 vsp가 무엇을 어떻게 판정했는가」의 유일한 잔존 형태**가 된다. parse의 행 번호는 구 CLI가 내주지 않아 분류기 패키지를 직접 부르는 **일회용 비커밋 Go 셈**으로 떴다(실행이지 복사가 아니고 커밋하지 않는다 — 사용자 확정).
  ⑥ **판정을 조이지 않는다.** 구 구현의 이상 동작을 **그대로 승계**했다 — FIELD-SYMBOLS 이름을 늘 리터럴 `SYMBOLS`에서 읽어 규약을 지켜도 울리는 것 · 분류기가 만들지 않는 사문 유형(`Check`) · 파일당 10건 조기 중단 · analyze 구성의 `local_variable_names` 무동작 · 되돌림 `Move`가 넓어 `Unknown`이 도달 불가인 것. 고치는 것은 갈림 장부를 거친 후속 판이다. **출력·플랫폼 결함은 다르다** — 윈도우 `--stdin` 미작동(구 `parse`는 그때 빈 답을 exit 0으로 돌려줬다) · json 이스케이프 깨짐 · summary 순서 비결정성은 승계하지 않고 등재했다(D-004·005·006).
  ⑦ **의도적 차이는 등재하고, 등재 없는 차이는 결함이다**(엔진과 같은 규율) — `sapkit-cli/DIVERGENCES.md`(append-only) **D-001~D-010**. 비커밋 코퍼스에서 난 갈림은 원본 경로·코드 대신 **최소 합성 재현 조각**으로 적는다(공개 레포 유출 차단).
  ⑧ **번들을 제품에 동봉한다** — `interactive/checker/`(58KB 단일 파일). **설치 시 다운로드 단계가 사라져 설치가 완전 오프라인**이 됐다(D-044 유보 ⓑ 해소). 훅 `offline-code-analysis.mjs`는 **파일명·훅 이벤트를 유지한 채 내부만** 번들 spawn으로 바꿨다 — 개명하면 기설치 `settings.json`의 제자리 참조가 끊기고 fail-open이라 고장이 보이지 않는다. **경고 전용·무음 통과 성격 불변**(D-049 지위 불변 — 구문·활성의 권위는 서버 `CheckSyntax` + 반영 확인 절차).
  ⑨ **게이트 없는 동봉은 하지 않는다** — `verify-checker.mjs` 신설(번들 해시 ↔ integrity + **소스가 번들보다 새로우면 표류로 실패**). 새 게이트에는 음성시험을 붙였다(`test-verify-checker` 21/21 · `test-corpus-gate` 14/14). 제품 게이트 8종 → **9종**, 음성시험은 `test-get-vsp`가 빠지고 `test-verify-checker`가 들어와 8종.
  ⑩ **은퇴는 검증 뒤 · 별도 커밋**(`bd826187`) — `vsp/` **570파일**(커밋의 총 삭제 577 = 서브트리 570 + `adapters/vsp/` 4 + `interactive/` 3) · 배포 경로(`get-vsp` 계열) · `adapters/vsp/` · CI `vsp-build` 잡(setup-go 포함) 제거, 루트 LICENSE 표 갱신. **가역성이 분리의 이유다** — 문제가 나면 revert가 되돌림 수단이고 판2~판6이 실사용 구간이 된다. **GitHub 릴리스 자산은 삭제하지 않는다**(야생의 구버전 플러그인이 그 자산을 가리키므로 방치가 하위호환) · 기설치 `~/.sapkit/bin/vsp(.exe)`도 무접촉.
  ⑪ **안전 문구는 삭제가 아니라 일반화한다** — 「vsp `query` 우회 금지」류는 「SAP 행 데이터를 끌어오는 **모든 경로** 금지」로, R-002는 「**SAP 접점을 이원화하지 않는다**」로 넓혔다. **금지는 행위에 걸리지 도구 이름에 걸리지 않으므로**, 도구가 은퇴한다고 규칙에 구멍이 나면 안 된다. `AGENTS.md`의 `adapters/vsp/SAFETY-PROFILES.md` 포인터는 원 근거(rebase-v2 · D-025)로 재기술했고, **그 파일에만 있던 RV1~RV4 분류·V1~V5 측정표는 삭제 전에 `docs/reference/audits/2026-08-15-rv-classification-record.md`로 한 글자도 고치지 않고 옮겼다.**
- **대안·기각**: (a) **Go 재작성** — 툴체인이 레포·CI에 남고 동일 언어 이식은 파생물 위험이 크다. 기각(사용자). (b) **기존 npm ABAP 린터를 의존성으로** — 판정이 구 vsp와 달라 「diff 0」이라는 완료 기준 자체가 무너진다. 기각(사용자). (c) **실프로젝트 파일을 코퍼스에** — 공개 레포이고 마스킹 검사기가 고객 소스를 보지 않는다. 이번 판 제외, 후속 판에서 로컬 전용으로 가능. 기각(사용자). (d) **템플릿을 제자리 참조** — 판4가 재작성하고 판6 뒤 삭제할 파일이라 그때 판1 CI가 깨진다. 동결 사본으로 대체. 기각. (e) **은퇴를 같은 커밋에** — 되돌림 단위가 커진다. 별도 커밋으로 분리. 기각.
- **정직 유보**: ⓐ **CRLF 갈래를 상설 게이트가 영영 밟지 못한다** — 코퍼스가 `.gitattributes`로 LF 고정이기 때문이다(CI ubuntu ↔ 로컬 Windows 판정 동일성의 대가). 구·신이 CRLF에서 **똑같이** 판정이 바뀌는 것은 1회 실측으로만 확인됐고 그 기록은 `harness/RECORDING.md` §9다. BOM · 홀로 선 CR · 500KB 초과도 같은 성격(실측 완료 · 상설 아님). ⓑ **비-UTF-8(Latin-1/CP1252) 원문에서 열이 밀린다**(D-001) — 바이트를 그대로 나르려면 코어 표면이 `Buffer`를 받아야 하고 규칙·CLI가 함께 바뀐다. 표면을 지키고 등재했다. ⓒ **`check`는 `Z*·Y*·$*`만 결함으로 본다** — 네임스페이스 고객명(`/ABC/ZFOO`)은 정보 수준이다. spec 문언 그대로이고 넓히려면 새 결정이 필요하다(D-009). ⓓ **`docs/DESIGN.md` 본문(vsp를 검증 백엔드로 부르는 74곳)은 현행성 배너로만 막았다** — 그 문서는 R1 이전 서술이라 이미 부분적으로 역사 취급이고, 전면 재작성은 별도 판단이다. ⓔ **spec §6과 §7.6이 문언상 순환한다** — §6은 문서 재배선을 §7 관문 뒤로 두는데 §7.6(독립 리뷰)이 그 재배선을 심사 대상으로 삼는다. **되돌리기 어려운 삭제만 관문 뒤**라는 취지로 해석해 집행했고, 실제로 삭제는 리뷰 PASS 뒤에만 나갔다. ⓕ **상류 abaplint 계보가 조용히 사라졌다** — `vsp/pkg/abaplint`는 상류 abaplint(Lars Hvam Petersen · MIT)의 기계 번역이었고 그 고지는 Go 헤더에만 있어 `vsp/LICENSE`와 함께 떠났다. `sapkit-cli`는 abaplint 유래 **이름**(문장 유형명 · 규칙 키)을 계약 표면으로 승계하되 **표현 복제는 없다**(독립 리뷰가 Go 원본과 나란히 놓고 확인). MIT상 의무는 없으나 계보를 정직하게 남기기 위해 여기 적는다. ⓖ **광역 대조는 다시 못 돌린다** — 구 vsp가 떠났으므로 `RECORDING.md` §9가 그 실측의 유일한 기록이다.
- **영향**: 신설 = `sapkit-cli/**`(소스·픽스처·기준·하네스·게이트·장부) · `interactive/checker/**`(동봉 번들) · `interactive/scripts/verify-checker.mjs` + `test-verify-checker.mjs` · `docs/reference/audits/2026-08-15-rv-classification-record.md` · CI `sapkit-cli` 잡. 삭제 = `vsp/`(**570파일**) · `adapters/vsp/`(4) · `get-vsp.mjs`/`test-get-vsp.mjs` · `provenance/vsp-release.lock.json` · CI `vsp-build` 잡. 수정 = 훅 1종(내부만) · `plugin-metadata.json` 0.6.0→**0.7.0** + 생성물 7종 · 절차·정책·어댑터 README·`CLAUDE.md`·`AGENTS.md`·`docs/{DESIGN,ARCHITECTURE,PRD,RUN-PLAN,BLUEPRINT}.md`·`HANDOFF.md`·`LICENSE`·`interactive/scripts/setup-state.mjs`와 그 음성시험(은퇴한 `vspInstaller` 항목의 재등장을 막는 assert 신설 — 118/118 → **120/120**). **불변** = `sapkit-engine/**` 무접촉(구 부품 무접촉의 기계 증명) · 기존 게이트 **진입점 8종의 스크립트** 무수정(신설만 허용 — 위 보조 스크립트는 게이트 진입점이 아니다) · `engine/`·`interactive/server/` 번들(엔진 5.0.0 현역) · 역사 문서(designs·audits 기존분·DECISIONS 기존 항목·MIGRATION-MANIFEST·provenance 이식 스냅샷) · 안전 정책(P2 건별 승인 · DEV-only write) · D-049의 훅 지위 · D-079·D-081~D-084 전부.

## D-086 · 2026-08-16 · 사다리 ⑶-a 빈자리 처리 = **조회** 확정 (자체 집필 기각) — 조회처는 동봉 help-portal 체계 · ⑶-a 갈래 종결

- **맥락**: `interactive/core/knowledge/abap/reference/`의 GPL-3.0 지식 31파일(ABAP 문법 사전 · 10,184줄)은 **2026-08-09 커밋 `54fd84de`로 삭제**됐고, 그 처분의 결정 기록은 **D-074(2026-08-10)**다 — 삭제일과 기록일은 다르다. 삭제로 라이선스 충돌은 해소됐지만 **빈자리를 무엇으로 채우는가**는 열린 채였고, `docs/BLUEPRINT.md` §⑶-a가 그것을 「선택지(미결정) — 집필 대신 조회」로 예약하며 "착수 시점에 자체 집필과 나란히 놓고 고른다"고 적었다. D-084가 세운 판 큐에서 **판2가 그 착수 시점**이다.
- **결정** (2026-08-16 사용자 확정):
  ① **조회를 택한다** — 자체 집필과 절충(RAP 1편만 집필)은 기각. **문법 사전을 제품에 다시 싣지 않는다.** 제품에 남는 참조 지식은 실전 검증 함정 모음(`knowledge/abap/conventions/` 21편)이다.
  ② **조회처 = 이미 동봉된 help.sap.com 조회 체계.** 정본은 `interactive/core/procedures/help-portal-fetch.md`(+ 그것이 부르는 `interactive/tools/fetch/fetch-abap-keyword-doc.mjs` · `fetch-sap-help-doc.mjs`). ABAP 문법·키워드는 **공식 ABAP Keyword Documentation을 필요할 때 가져와** 출처와 함께 답한다. 이 조회처 선택은 **사용자 제안**이며(외부 저장소 링크 방식을 대체) 근거는 넷이다 — 이미 제품에 있고 실동작 검증됨(이식 장부 5-5) · Node 전용에 수동 폴백까지 문서화돼 **3사 하네스 중립** · 공식 문서라 권위가 높음 · 수요 지점에는 **레포 내부 상대 링크만** 남아 외부 URL 노출이 늘지 않음.
  ③ **`SAP-samples/abap-cheat-sheets`(Apache-2.0)는 고지 문서에 기록만 남긴다** — 「향후 자체 집필이 필요해질 때의 인용 가능 원자료」. **제품의 수요 지점에서는 가리키지 않는다.**
  ④ **전달은 편승** — 이 판의 콘텐츠 수정은 판1이 이미 올려 둔 **미배포 0.7.0 범프에 편승**해 전달된다(D-060의 전달 계약: 설치본 내용이 바뀌는 커밋은 버전이 올라야 기설치자에게 닿는다). **판2는 버전을 올리지 않는다.**
  ⑤ **외부 의존 무감시를 수용한다** — help.sap.com 등 외부 문서 사이트의 이동·폐쇄를 감시하는 게이트는 세우지 않는다. 방어는 **폐쇄 실패**(조회 불가 시 그렇게 말한다)뿐이다. 단 판2가 **새로 여는** 외부 노출은 0이다(기존 체계 재사용).
- **대안·기각**: (a) **자체 집필**(⑶-a 원안 — `abap-cheat-sheets`를 원자료로 선별·순서·구성부터 새로) — **실측 수요가 사실상 0이다**: 31파일을 가리키던 곳이 곁다리 2문장뿐이었고, 지식 INDEX에도 없었으며 정책이 로드하지도 않았고, 삭제 후 깨진 참조도 0이었다. 무게의 척도는 세션 토큰·설치 부담이고(D-040) 문법 사전은 그 척도에서 가장 무겁다. 게다가 집필은 **파생물 함정**(선별·순서·구성을 재창작할 의무)의 관리 노동을 상시 수반하는 "가장 긴 갈래"다. 미래 수요는 판3.x의 "실전 검증분부터 자체 문장" 흐름이 흡수한다. 기각(사용자). (b) **절충 — RAP 1편만 집필** — (a)의 비용 구조를 축소했을 뿐 파생물 관리 의무는 그대로 남고, 1편으로는 수요를 메우지도 못한다. 기각(사용자). (c) **외부 저장소를 링크로 가리키기** — 수요 지점마다 외부 URL이 늘고 상류 이동에 그대로 노출된다. 동봉 조회 체계가 같은 목적을 **레포 내부 상대 링크만으로** 달성한다. 기각(사용자 제안이 대체).
- **정직 유보**: ⓐ **외부 의존을 감시하지 않는다** — help.sap.com의 페이지 이동·폐쇄를 잡는 게이트가 없으므로 **발견 경로는 실사용 중의 조회 실패 보고뿐**이다. 이 수용을 여기 남긴다. ⓑ **전달이 판1의 범프에 편승한다** — 그래서 **push 직전 설치본 버전 확인**이 의무가 된다(재개점에 명기). 이미 0.7.0 설치본이 존재하는 머신이 발견되면 **패치 범프 후 push**. ⓒ **조회처의 실동작은 이 판에서 스모크 1회 수준**으로만 확인했다 — 상설 게이트가 아니다(ⓐ와 같은 성격).
- **영향**: 수정(판2 전체 범위) = `docs/reference/DECISIONS.md`(이 항목 append) · `interactive/THIRD_PARTY_NOTICES.md`(§GPL 「향후 경로」 문단만 — 계보·확정 근거·미확정 절과 표는 무수정) · `docs/BLUEPRINT.md`(§⑶-a의 검증 기준 + 「선택지(미결정)」 블록) · `interactive/DESIGN.md`(디렉토리 트리 주석 1곳) · 수요 지점 포인터 2곳(`…/knowledge/abap/conventions/rap-odata-rules.md` · `…/procedures/create-object.md`) · `docs/RUN-PLAN.md`·`HANDOFF.md`(판 마감·재개점). **⑶-a 갈래 종결** — 차용분은 D-074의 삭제로 이미 소진됐고 이 결정으로 빈자리 처리까지 닫혔으므로 **판8(⑷)의 ⑶-a 전제가 성립한다.** **코드 0줄.** **불변** = 지식 `.md` **148**(신설·삭제 0) · `interactive/plugin-metadata.json`·생성물 7종·플러그인 버전 · 게이트 스크립트·훅·서버 번들·검사기 번들·`engine/`·`sapkit-engine/`·`sapkit-cli/` · `help-portal-fetch.md`와 fetcher 2종 · 역사 문서(DECISIONS 기존 항목 · `MIGRATION-MANIFEST.md` · `interactive/provenance/` · `docs/superpowers/`) · D-074·D-085 전부.
