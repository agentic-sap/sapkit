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
