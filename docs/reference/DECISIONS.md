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
