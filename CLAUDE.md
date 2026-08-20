# CLAUDE.md — sapkit

## 프로젝트 정체성 (30초 맥락 — 이걸 모르면 판단하지 말 것)

SAP ABAP 개발을 돕는 AI 플러그인 **SAPKIT**. **단일 레포 · 두 트랙**이며, **제품은
`interactive/` 플러그인 단독**이고 나머지(`engine/`·`sapkit-cli/`·`sapkit-engine/`)는
공방(개발 도구·소스 정본·증거)이다 — 모노레포 유지(D-040). 철학: **차용 후 완전 소유**(sc4sap
지식 이식, 엔진 편입 D-017) · 가볍지만 강력하게(무게의 척도 = 세션 토큰·설치 부담, 레포 바이트
아님 — D-040) · 3사 하네스 중립. 어디까지 자작으로 바꿀 것인가의 **계획 정본**은
`docs/BLUEPRINT.md`(끝그림 = 포크 0 · 교체 사다리 ⑴~⑷ · 무중단 교체 규칙 · 도구 실사).

- **트랙 A — 하네스 트랙** = Direct(기본) + Guided(명시 승격). **지금 트랙 A에 남은 것은
  라우팅 규약뿐이다** — 실행 설비는 renew 1차(R1)에서 레포에서 걷어냈다(`phases/`·`src/`·
  루트 `scripts/`·`.harness/`·`packs/`·`domain/`·`adapters/final-harness*` 삭제). 규약의
  정본은 이 파일이 include 하는 **`AGENTS.md`**(최소 승계본 — 실행 구조 2종 + SAP 정책
  등급 P0~P4)이고, `.harness/RULES.md`에 있던 현행 안전 규칙은 아래 「안전 규칙」 절로
  이관됐다. ENGINE(final-harness 루프)은 D-040으로 이미 template-only였고 R1이 그 설비를
  제거했다 — 재개하려면 실수요 트리거 + 새 D-결정이 필요하다. **제품 원칙 =
  attended-only**, unattended는 비약속 휴면 옵션(U-gate 안전조건은 D-034에 보존, 배선
  우선순위는 D-040이 supersede). 사람 소유 Direct/Guided의 SAP 적용은 트랙 B MCP·사람이
  모는 CLI·사용자 abapGit 모두 허용되며, 어느 길로 넣든 정책 등급과 관문은 같다
  (docs/DESIGN.md §3 — powerup 엔진은 트랙 A에서 쓰지 않음).
- **트랙 B — 대화형 플러그인 (제품, 검증 완료)** = `interactive/` — 하네스 중립 코어(지식
  `.md` 148·페르소나 26·절차 22·스킬 17·정책) + MCP 서버 번들(**자체 저작 엔진
  `sapkit-engine` 1.0.0** — 2026-08-19 판7-b 교체 · D-095 · 도구
  inspection-only 155 / connected 186) + **오프라인 검사기 번들**(`interactive/checker/`)
  + 어댑터 3사(Claude/Codex/Antigravity). 번들의 소스 정본은 레포 내 **`sapkit-engine/`**
  (2026-08-19 판7-b 교체 · 그 전에는 `engine/` 포크 · D-017 편입) — 엔진 수리→재번들→반영은
  `interactive/server/UPDATE-RUNBOOK.md` 절차로만.
- **`sapkit-cli/` — 자체 저작 오프라인 ABAP 검사기 (소스 정본).** 구 `vsp/`(Go 포크)가
  하던 **로컬 검사**를 대체한다 — 명령 `lint`·`parse`·`analyze`·`check`이고 **SAP 접속도
  MCP 모드도 코드에 없다**. 이 소스를 만 번들이 `interactive/checker/`로 제품에 동봉되므로
  **설치가 완전 오프라인**이다(내려받는 단계 없음). 훅
  `adapters/claude/hooks/offline-code-analysis.mjs`가 그 번들을 띄운다. 재번들·핀 갱신은
  `interactive/checker/UPDATE-RUNBOOK.md` 절차로만, 무결성·출처 게이트는
  `interactive/scripts/verify-checker.mjs`. 구 판정과의 **의도적 차이는
  `sapkit-cli/DIVERGENCES.md`(append-only)에 등재**하며 등재 없는 차이는 결함이다.
  **구 `vsp/` 서브트리는 은퇴했다** — 레포에서 삭제됐고 Go 툴체인도 함께 빠졌다.
  그러므로 **구 판정을 다시 뜰 수 없다**: `sapkit-cli/fixtures/baseline/`의 채록본과
  `harness/RECORDING.md`가 「구 vsp가 무엇을 어떻게 판정했는가」의 유일한 잔존
  형태이며, 코퍼스 대조 게이트가 그 기준을 상시 지킨다.
- **`sapkit-engine/` — 자체 저작 엔진 (사다리 ⑴ · **제품**).** D-079가 연 새 경로에서
  병행 제작했고 **2026-08-19 판7-b에서 제품 번들 자리를 넘겨받았다**(D-095). 도구
  **186/186** · 전송 3(stdio·HTTP·SSE) · RFC 5경로 · 인증 4통로. 제품 번들
  `interactive/server/server.bundle.cjs`가 이 소스의 산출물이다(1.0.0 · 3.81MB ·
  구 번들 8.30MB의 46%). **구 `engine/`은 되돌릴 자리로 남는다** — 롤백은 교체 커밋
  revert이고(번들·핀·게이트 기대값이 한 커밋), 소스 은퇴는 **판7.5**다. `engine/`을
  고칠 이유는 롤백 말고 없다.
  - **도구 하나 짓는 절차의 정본** = `sapkit-engine/ADDING-A-TOOL.md`. 도구 1종 =
    모듈+시험+**등록점 배선**+대장 갱신을 **한 커밋**(반쪽 상태는 다음 판이 같은 도구를
    두 번 짓게 만든다).
  - **`sapkit-engine/TOOL-LEDGER.md`는 기계 생성물**이다. 손으로 고치면 게이트가 거부한다.
    도구 상태는 세 칸(`안 지음` / `지음·증거 대기` / `증거 있음`)이고 **`증거 대기`를 완료로
    읽지 않는다**(D-082 — 2026-08-12에 실제로 난 오해다). 지금 **증거 대기 126종**이
    남은 SAP 증거의 총량이다(판6.1에서 143 → 126 · **M1 19종은 전부 「증거 있음」**).
    ⚠ 이 수는 **꼬리 기준 인하가 아직 반영되지 않은 수치**다 — 인하의 집행은 판6
    종료판 몫이다(D-092 ⓐ).
  - **구·신 차이는 두 곳에 등재한다** — 사람용 `harness/DIVERGENCES.md`(**append-only**)와
    재생 러너가 읽는 `harness/replay/divergences.ts`(**재생 대조에 나타나는 것만**).
    등재되지 않은 차이는 **결함**으로 다룬다.
- 품질 모델: **1명 작업 + 1명 새-컨텍스트 리뷰(read-only) + SAP 기계 확인**.
  안전 모델: 3층 방어(도구 단위 권한 allowlist · PreToolUse 훅 · 엔진 tier 게이트) +
  실데이터 2종(GetTableContents/GetSqlQuery) 상시 게이트.

## 세션 시작 (필수)

1. **`HANDOFF.md`를 먼저 읽는다** — 프로젝트 전체 상태·재개 지침·백로그의 정본.
2. **트랙 A를 판단·언급하는 작업이면 착수 전에 `docs/DESIGN.md` §2(구조)·§3(백엔드 결정)을
   읽는다** — HANDOFF 요약만으로 트랙 A를 판단하지 말 것 (실패 사례: vsp-custom을
   "선택적 도구"로 오판). 단 `docs/DESIGN.md`는 **R1 이전에 쓰인 문서**이므로 실행 설비를
   전제한 서술은 현행이 아니다 — 구조·백엔드 판단 근거로만 읽는다.
   트랙 B 설계 정본은 `interactive/DESIGN.md`.
3. 과거 결정의 '왜'는 `docs/reference/DECISIONS.md` (append-only 결정 로그, D-001~). **D-번호를
   인용·재해석하기 전 원문을 확인한다.**

## 판 실행 규약 — **멈추는 자리는 아래 셋뿐이다**

판(ready→go 1사이클)은 여러 시간짜리다. 중간에 멈추면 사용자가 붙어 있어야 하고, 그
시간이 이 프로젝트의 희소 자원이다. **메인 오케스트레이터가 근거로 정할 수 있는 것은
정하고 실행한 뒤 판단과 근거를 보고한다 — 질문으로 바꾸지 않는다.**

**묻는 자리 ①  밖으로 나가는 것** — `git push` · PR 생성 · `main` 병합.

**묻는 자리 ②  안전 정본이 사람 승인을 요구하는 것** (아래 「안전 규칙」이 정본이고
이 규약이 그것을 완화하지 않는다) — P2 실데이터 추출 건별 승인 · 사용자 소유 SAP 객체의
되돌릴 수 없는 변경·삭제 · P4 이송.

**묻는 자리 ③  사용자만 답을 가진 사실** — 외부 계정 개설(BTP)처럼 비용·계약이 걸린 것 ·
제품 방향의 선택.

그 밖은 **전부 정하고 간다.** 특히 자주 틀리는 자리:

- **판 사이의 전환은 묻지 않는다.** `docs/RUN-PLAN.md` 판 큐에서 다음 판이 `다음`으로
  서 있고 전제가 충족돼 있으면 **바로 착수한다.** 「이제 ○○ 할까요?」는 큐가 이미 답한
  질문이다. (2026-08-19 판7-a 종료 시 실제로 그렇게 물어 지적받았다.)
- **설계 선택·기대값 구조·판 범위 판단**은 메인이 정한다. 대안을 기각한 굵직한 것이면
  `docs/reference/DECISIONS.md`에 append하고, 기각 근거와 정직 유보를 함께 적는다.
- **리뷰 회수**는 판정하고 반영한다. 리뷰어가 낸 차단은 고치고, 권고는 채택 여부를
  근거와 함께 기록한다.
- **양자택일에 내 권장안이 있으면** 그건 이미 답을 아는 것이다 — 정하고 근거를 적는다.

**보고는 분모를 붙인다** — 「다음 한 걸음」만 말하면 다 끝난 것으로 읽힌다(2026-08-12
실제 사고). 진척은 전체 대비로, 미뤄 둔 것과 함께 낸다.

**메인 오케스트레이터 모델**: 최상위 모델(Opus 계열)로 돌린다. 판 전체의 판단이 여기에
걸려 있어서, 여기서 아끼면 멈추거나 잘못 정한다. 서브에이전트(구현자·리뷰어)는
`general-purpose`.

## 문서 계약 — 갱신까지가 작업의 일부 (커밋 전 확인)

| 문서 | 갱신 시점 |
|---|---|
| `HANDOFF.md` | **상태가 바뀔 때마다** (설치·검증·백로그 증감·머신 환경) |
| `docs/reference/DECISIONS.md` | 대안을 기각한 굵직한 결정 발생 시 **append** (수정·삭제 금지, 정정도 새 항목) |
| `docs/DESIGN.md` · `interactive/DESIGN.md` | 해당 트랙의 **설계가 변경될 때만** (상태 변화로는 갱신하지 않음) |
| `docs/BLUEPRINT.md` | 재구성 계획(사다리 단계·끝그림·도구 실사)이 바뀔 때만 |
| `docs/RUN-PLAN.md` | 판(ready→go 사이클)이 끝나거나 판 순서가 바뀔 때 — **판 큐의 단일 정본** (D-084) |
| `interactive/plugin-metadata.json` | 버전·자산 계수의 **단일 정본**. 고친 뒤 반드시 `gen-plugin-manifests.mjs`로 생성물 7종 재생성 |

**갱신하지 않는 문서**: `interactive/MIGRATION-MANIFEST.md`와 `interactive/provenance/`의
이식 스냅샷은 **은퇴한 역사**다(이식 완료 기록 · 이후 갱신 의무 없음). 콘텐츠 무결성의
소유자는 이제 git 이력이다.

불변 규칙 전체(동결 레포·private denylist·번들 보호·실데이터 승인 등)는 **HANDOFF §8**.

## 안전 규칙 (작업 전 필독 — 위반이면 중단하고 보고)

옛 `.harness/RULES.md`에서 승계한 현행 안전 규칙이다(R1에서 그 파일은 삭제됐고, 여기가
정본이다). 엔진·트랙 A 실행 구조에 묶여 있던 조항은 함께 폐기했고, 부품 중립적인
것만 남겼다. SAP 정책 등급(P0~P4)의 정의는 `AGENTS.md`.

- **SAP write는 DEV tier에서만** — QA/PRD tier 시스템에 write(`Create*`·`Update*`·
  `Delete*`·활성화·실행)를 실행하지 않는다. **MCP 도구든 로컬 CLI든 사람이 올리는
  abapGit이든 경로를 가리지 않는다** — 금지는 행위에 걸리지 도구 이름에 걸리지 않는다.
  (구 R-003)
- **실데이터 추출은 건별 사람 승인** — `GetTableContents`·`GetSqlQuery`를 비롯해 **SAP
  행 데이터를 끌어오는 모든 경로**(로컬 CLI·스크립트·직접 질의) 실행 **전에** 범위·
  필드·행 상한을 제시하고 승인을 받는다. 배치·서브에이전트·자동승인 금지. 소유자
  머신 예외(D-043)는 이 건별 승인을 서버측 table blocklist 하한으로 대체할 뿐이며,
  배치·서브에이전트 금지는 그대로다. 배포 기본값은 잠긴 채 둔다.
- **write 성공 보고를 그대로 믿지 않는다** — SAP write 뒤에는 소스를 되읽어 실제
  반영을 확인한다. write 성공만으로는 `PROVISIONAL_WRITE`이고 완료가 아니다. 완료는
  **기계 확인**(반영 소스 되읽기 대조 + 구문·활성 확인 — 절차 정본
  `interactive/core/procedures/verify-applied.md`) **+ 독립 새-컨텍스트 리뷰**(R-PASS)
  둘 다일 때 성립한다. **도장을 찍는 옛 완료 의식은 폐지됐다 — 되살리지 말 것**(전용
  러너·전용 도구·`.sapkit/` 하위 판정 기록 파일·그 이름의 스킬 전부 renew 1차에서
  제거됐다). CLAS 거짓 성공 실증 이력이 근거다. (구 R-006)
- **동결 원본 무접촉 · private 금독** — 동결 레포(sc4sap-custom·sc4sap-lite)를
  수정하지 않으며, sc4sap-custom의 `private/` 하위는 **읽지도 않는다**. (구 R-004)
- **비밀정보 커밋 금지** — SAP 접속 정보(호스트·자격증명·`.env` 내용)를 레포에
  커밋하지 않는다. 런타임 프로파일 홈은 `SAPKIT_HOME_DIR`(기본 `~/.sapkit`) — **레포
  밖**이며 `.gitignore`가 레포 내 잔재(`.sapkit/`·`.env`)를 차단한다. (구 R-005)
- **SAP 접점을 이원화하지 않는다** — 같은 ADT 표면을 두 개의 서버·도구가 나눠 갖게
  만들지 않는다. SAP에 닿는 경로를 하나 더 열면 tier 게이트·테이블 blocklist가 한쪽만
  지키게 되어 권한 정책이 갈라진다. 그러므로 **로컬 검사는 SAP에 접속하지 않는
  도구로만** 한다 — 그 자리는 동봉 검사기(`interactive/checker/`, 소스 정본
  `sapkit-cli/`)이고 접속·MCP 모드가 코드에 없다. 로컬 전용(SAP 무접속) 실행은 이 금지
  밖이다. (구 R-002 — 특정 도구를 겨눈 조항이었으나 D-049로 축소된 뒤 원리로 일반화)
- **재개 전 원격 대조** — 재개 세션은 `git fetch` + `main..origin/main` 확인 뒤에
  시작한다. 로컬 문서만 믿으면 다른 머신의 병렬 줄기를 놓친다(두 머신 6일 분기
  실증). 분기를 발견하면 작업 전에 사용자에게 보고한다. (구 R-008)

## 게이트 (구조 변경 시 항상 통과 상태 유지)

```bash
node interactive/scripts/check-links.mjs interactive     # 상대 링크 깨짐 0
node interactive/server/verify-engine.mjs                # 번들 무결성 OK (sapkit-engine 1.0.0)
node interactive/scripts/check-engine-provenance.mjs     # 엔진 소스 커밋 ↔ 번들 (--rebuild면 재현 빌드까지 — npm 불요)
node interactive/scripts/smoke-mcp.mjs                   # 도구 표면 계약 assert
node interactive/scripts/conformance-server-gates.mjs    # 서버 안전 게이트 (tier·blocklist·ask — 훅 0개 기본의 정본)
node interactive/scripts/gen-plugin-manifests.mjs --check # 생성물 7종(매니페스트 5+MCP wrapper 2) ↔ 단일 정본
node interactive/scripts/check-runtime-path-rename.mjs   # 구 세대 경로 토큰 재등장 금지 + 안전 앵커 7종
node interactive/scripts/conformance-runtime-dir.mjs     # 경로 해석 적합성 (fixture 26 · assert 138 · 안전 회귀 5종)
node interactive/scripts/verify-checker.mjs              # 동봉 검사기 번들 무결성·출처 (번들 바이트·버전 3자·소스 커밋·소스 해시)
node interactive/scripts/doctor.mjs                      # 3사 동기화 OK (로컬 전용 — 설치 상태를 읽는다)
```

게이트 자체의 음성시험(게이트가 정말 거부하는지): `test-smoke-mcp.mjs` 30/30 ·
`test-check-runtime-path-rename.mjs` 13/13 · `test-hook-switch.mjs` 13/13 ·
`test-hook-decisions.mjs` 74케이스 ·
`test-setup-state.mjs` 120/120 · `test-launch-toolsurface.mjs` 56/56 ·
`test-codex-wire-mcp.mjs` 51/51 · `test-doctor.mjs` 47/47 ·
`test-verify-checker.mjs` 21/21.
**PowerShell로 실행할 것** — Bash로 돌리면 자식 프로세스 수거에서 블록된다.

**`smoke-mcp.mjs`와 `conformance-server-gates.mjs`는 `--target=bundle|engine`을 받는다**
(판7-a · D-094 ⓐ). **판7-b 교체 뒤 이 인자는 「구 vs 신」이 아니라 「번들 vs 소스」를 가른다** —
`bundle`(기본)은 제품이 싣는 단일 파일 `interactive/server/server.bundle.cjs`이고
`engine`은 그 파일을 만든 소스의 tsc 산출물 `sapkit-engine/dist`다. 둘 다 같은 엔진이므로
**판정이 갈리면 엔진이 아니라 번들러를 의심할 자리**다. CI는 `node-gates` 잡에서 `bundle`,
`sapkit-engine` 잡에서 `engine`을 돌린다(**main 푸시·PR** — 워크플로 트리거가 그 둘이라
feature 브랜치 단독 푸시로는 안 돈다). 로컬에서 `engine`을 돌리려면 `sapkit-engine`에서
`npm ci && npm run build` 선행.

**위 9종(+doctor)은 제품 게이트다. `sapkit-engine/`과 `sapkit-cli/`는 자기 게이트를
따로 갖는다** — 각각 그 안에서 돌린다.

`sapkit-cli/`(동봉 검사기의 소스 정본):

```bash
npm run verify        # build + typecheck + jest
npm run gates         # 자체 게이트 (코퍼스 판정 대조 등)
node harness/test-corpus-gate.mjs      # 게이트 음성시험 (코퍼스 게이트가 정말 거부하는지)
node harness/test-compare-baseline.mjs # 음성시험 (판정 비교기가 갈림을 정말 잡는지)
```

소스를 고쳤으면 **재번들까지가 한 커밋**이다 —
`interactive/checker/UPDATE-RUNBOOK.md`를 따르고 제품 쪽 `verify-checker.mjs`로 닫는다
(반쪽이면 배포되는 번들이 조용히 낡는다).

`sapkit-engine/`:

```bash
npm run verify        # build:bundle + typecheck + jest (번들까지 만든다 — 제품에 실리는 물건)
npm run gates         # 표면(글자 일치·4조건 소속·채록본 밖 이름·대장 대조) · 안전 · 대장 · HTTP/SSE 기동
node gates/stdio-smoke.mjs             # dist 산출물 실기동
node gates/bundle-smoke.mjs            # **제품에 실리는 단일 파일** 실기동 + 판 스탬프 + 표면
node gates/test-gates.mjs              # 게이트 음성시험 (게이트가 정말 거부하는지)
node gates/keyring-fallback-smoke.mjs  # keyring 부재 강등 스모크 (require-seam 차단 — 판5)
node gates/test-refusal-vocab.mjs      # 거부 어휘 구·신 병행 인식 (D18 방어 — 판5)
node gates/test-attended-guard.mjs     # attended 녹화 관문 음성시험 (저장 자리 3분기 · 무접속 어휘 · 신원 가리기 — 판6.3)
node harness/render-ledger.mjs --check # 대장 ↔ 계산 결과
node harness/build-plan.mjs --check    # 제작 계획 ↔ 산식
```

⚠ **`harness/record-attended.mjs`(attended 실기 녹화)는 게이트가 아니다** — 실 SAP에 붙고
P3 write가 실제로 일어나는 **attended 전용 도구**다. 여기 목록에 넣지 말 것.
`--dry-run`만 접속 없이 돈다. 그 관문들이 정말 거부하는지는 위 `test-attended-guard.mjs`가 잰다.

~~**「제품 게이트 전종 여전히 green」이 구 부품 무접촉의 기계 증명이다**~~ — 이 조항은
**판7-b 교체로 소멸했다**. 그 증명의 목적은 병행 제작 기간에 구 부품을 흔들리지 않는
대조군으로 두는 것이었고, 교체가 그 기간을 끝냈다. 지금 제품 게이트는 **신 엔진을
겨눈다** — 그러므로 이제는 「게이트를 고치지 마라」가 아니라 **「게이트를 고치면 그것이
제품 계약의 변경이고, 무엇을·왜 바꿨는지가 커밋에 남아야 한다」**가 규칙이다.
`sapkit-cli/`(사다리 ⑵)에는 같은 논리가 여전히 적용된다 — 그쪽 기준선은 되뜰 수 없는
채록본이다.

CI(`.github/workflows/offline-gates.yml`)는 위 게이트에서 **doctor 본체만 빼고** 전부
돌리고, 음성시험도 **전부** 돌린다(`test-doctor`는 windows 잡).
**`sapkit-engine` 잡**이 제품 엔진의 소관이다 — 자체 게이트 전종 · 대장 `--check` ·
**번들 스모크** · **번들 재현 빌드**(`check-engine-provenance --rebuild`) · 번들↔소스 대조 2종.
**`engine-tests` 잡은 이제 롤백 소스의 건강 확인**이다(구 포크 jest + 번들이 여전히
지어지는지) — 되돌릴 수 없는 롤백 자산은 롤백 자산이 아니기 때문이다.
**`sapkit-cli` 잡**(verify + 게이트 + 그 음성시험 + exit 계약 양극 assert)도 마찬가지고,
`verify-checker`**와 그 음성시험**은 `node-gates` 잡에 있다 — 소스 커밋 대조에 전체
이력(`fetch-depth: 0`)이 필요해서 그 잡만이 자리다. **Go 툴체인은 CI에서 빠졌다**
(vsp 은퇴로 `vsp-build` 잡 제거).

**은퇴한 게이트 — 되살리지 말 것.** 이식 장부 계열(`check-migration-snapshot` ·
그 음성시험 · `build-migration-snapshot` · `report-sc4sap-public-drift`)은 renew 1차에서
로컬·CI 양쪽에서 제거됐다. **이식 시대가 끝났고** 이후 콘텐츠는 원본에서 의도적으로
갈라지므로 "원본 대응이 유지되는가"라는 질문이 존재 이유를 잃었기 때문이다. 그보다 앞선
`check-migration-coverage`는 S3에서 이미 폐기됐다(D-027 §9.2 — 외부 원본을 재귀 순회하며
private 경로 이름을 열거해 R-004 정신에 저촉). 호환층 계열(`migrate-runtime-dir`와 그
음성시험)도 R5에서 함께 은퇴했다.

git push는 사용자 판단 — 커밋까지만 하고 push는 요청 시에만.

@AGENTS.md
