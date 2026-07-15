# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact/diff. -->

## Task

새-컨텍스트 독립 리뷰 정본
`docs/reference/designs/2026-07-15-fresh-review-of-rebase-v2.md`의 MAJOR 6건·MINOR
4건을 근거 문서와 코드 실측에 맞춰 같은 v2 설계서와 `HANDOFF.md`, 본 GOAL 및
`STATE.md`에 수리한다. `docs/DECISIONS.md`는 수정하지 않고, D-025가 수리 결과와
어긋나는 지점은 D-026 정정 후보로만 보고한다. SAP 접속과 v0.19.2 분석 재실행,
커밋·push는 하지 않는다. 작업 시작 시 `docs/DECISIONS.md`는 이미 D-025 추가분
`+61/-0` 상태였으며 이번 작업은 그 diff를 그대로 보존한다.

## Success criteria — current repair

- [ ] MAJOR-A — Guided-P1 credential owner를 현재 유일한 사람 세션으로 한정하고,
      기각된 격리 reviewer-read principal을 현재 선택지에서 제거한다.
- [ ] MAJOR-B — 모든 attended child의 파일+keychain 재획득 가능성을 숨기지 않는다.
      `sap_mutation_boundary=unverified (reviewer 및 모든 attended child)`로 범위를
      확장하고 G10에 build/review worker child를 포함한다.
- [ ] MAJOR-C — lock v2에 O1 safety state의 기계적 carrier를 추가하고 PROMOTE가 이를
      보존하게 한다. 정의되지 않은 run summary 표현은 제거하거나 구체 경로로 정의한다.
- [ ] MAJOR-D — `vsp transport list/get`은 help만 확인됐고 출력 형상 미확인·command
      contract 미등재임을 표시한다. G14에 향후 read-only SAP 실측을 두고, §11에
      `COMMANDS.md`와 `vsp.lock.json` 갱신 행 및 vsp inventory 불가 시 사람
      `GetTransport` fallback을 넣는다. 이번 작업에서는 SAP에 접속하지 않는다.
- [ ] MAJOR-E — 설계 §11의 HANDOFF 범위를 확장하고, HANDOFF 헤더의 07-13
      “무인 전환 가능”을 supersede하며 본문 “유일한 SAP 접점”을 Engine/completion
      evidence backend 의미로 교정한다. 그 외 HANDOFF 본문은 변경하지 않는다.
- [ ] MAJOR-F — 종전 18/18 기록을 작성자 자체 확인(self-check)으로 relabel하고,
      종전 GOAL 18번을 체크 해제하며 새-컨텍스트 독립 리뷰의 실제 판정
      `PASS with fixes — MAJOR 6 · MINOR 4`를 별도 기록한다.
- [ ] MINOR-1 — 존재하지 않는 `transport_request=LOCAL` 계약을 제거하고 필드 생략 시
      도구별 기본값 `local`, 정확 표기는 tool schema 기준이며 현재 대상 표면은
      미확인이라고 쓴다.
- [ ] MINOR-2 — §11에 `.harness/RULES.md` 집행 행을 추가한다.
- [ ] MINOR-3 — STATE의 `G1~G13` 오기를 `G1~G14`로 고친다.
- [ ] MINOR-4 — lock 교체 때 현 `invariants_f1_f7`와 `plugin` 증거를 exact 경로·SHA-256과
      함께 보존하고 `v0.17.3` 표기를 일관되게 유지하도록 schema/PROMOTE를 고친다.
- [ ] OBSERVATION O-1 — DEV allow가 구조상 no-op이므로 파일럿 A 게이트 증거로 세지
      않고 QA/unresolved deny 팔만 차단 증거로 인정한다고 명시한다.
- [ ] 금지 경로(`phases/`, `interactive/`, 상류 엔진, 07-14 초안, v0.19.2 분석,
      두 Codex/새-context 리뷰 원문)는 diff 0이며 `docs/DECISIONS.md`도 이번 수리로
      변하지 않는다. R-002/R-003/R-004/R-005를 위반하지 않는다.
- [ ] 자체 확인(self-check)은 문면·포인터·diff·금지 경로만 검사하며 “독립 검증”이라
      부르지 않는다. 별도 새-컨텍스트 reviewer가 이 GOAL과 diff를 기준별 PASS/FAIL로
      판정한다.

## Previous v2 record — author self-check, not independent verification

아래 `[x]` 17건은 당시 작성자 자체 확인(self-check) 표시일 뿐 독립 검증 결과가 아니다.
새-컨텍스트 독립 리뷰는 별도 정본에서 `PASS with fixes — MAJOR 6 · MINOR 4`를 판정했다.
종전 18번인 마지막 항목은 실제로 충족되지 않았으므로 `[ ]`로 정정한다.

- [x] 설계서 헤더가 07-14 초안 대체 선언을 유지하고 상태를 정확히
      `사용자 택일 3건 확정 반영(2026-07-15). D-025로 봉인`으로 바꾼다.
- [x] O1=(가)를 채택안으로 일관되게 집행한다. 새 reviewer 기계 경계를 만들지 않고
      등식형 repo guard + 리뷰 관례 + 사람 에스코트만 남기며, reviewer가 write
      credential을 얻을 수 있음을 숨기지 않는다.
- [x] O1의 대가를 `D-019의 SAP reviewer 기계 격리 약화`, `attended-only`, §7
      U-gate 전 unattended 봉인, `historical_rv4_classifier = open`,
      당시 `reviewer_mutation_boundary = unverified`로 기록했다. 이 reviewer 전용
      필드는 본 수리에서 `sap_mutation_boundary = unverified`(reviewer + 모든 attended
      child)로 supersede한다. D-024의 RV4 닫힘 기록 금지를 유지한다.
- [x] §6의 (가)~(라) 표를 보존하되 (가)=채택, (나)/(다)/(라)=후속 후보로 표시하고
      각 후보를 다시 논의할 객관적 트리거를 쓴다. §14는 삭제하지 않고 `확정된 결정 +
      재론 트리거`만으로 미래 세션이 판단 가능한 표로 다시 쓴다.
- [x] P4를 BLOCKED/OPEN/별도 설계 상태에서 실행 가능한 실계약으로 바꾼다. DEV
      transportable package/request의 생성·할당·release·import를 실행 구조
      (Direct/Guided/Engine attended) × 주체(사람/worker/reviewer) × 경로(vsp CLI/
      트랙 B MCP/abapGit/필요한 사람 CTS UI)별로 빠짐없이 매핑한다.
- [x] transport 계약은 실제 표면에 근거한다: 고정 vsp의 `transport list/get`와
      `deploy --transport`(create/release/import 부재), 트랙 B의 CreateTransport/
      ListTransports/GetTransport/ReleaseTransport 및 package/object
      `transport_request`, abapGit 공식 package/transport 동작을 구분한다. 미실측 SAP
      동작·지원 여부·abapGit 세부는 `미확인`으로 쓰고 가정을 발명하지 않는다.
- [x] 기존 파일럿이 전부 `$TMP`/LOCAL이라 transport 불요·`--transport` 실사용 0건이었던
      사실과, transportable package에서 새로 필요한 package 속성/transport layer/change
      recording/request binding/release/import 증거를 명확히 대비한다.
- [x] R-003 및 tier gate를 지킨다: package/request 생성·할당·release는 DEV에서만,
      QA/PRD에는 vsp/MCP/abapGit ad-hoc write를 하지 않고 사람/Basis가 DEV에서 release된
      CTS request를 STMS로 import한다. 원본 step 9에서 이식된
      `install-sap-assets.md` Step 0 게이트와 SAFETY-PROFILES 계약을 왜곡하지 않는다.
- [x] reviewer는 조회를 포함한 transport 동작을 전혀 하지 않는다. Engine worker는
      vsp CLI로 사전 생성·승인된 package/request에 bounded assignment/verify만 하며,
      release는 비가역이므로 exact request/task 확인 뒤 사람만 수행하고 import도
      사람/Basis 전용이다. 에스코트 관례를 유지한다.
- [x] §4의 Direct/Guided/Engine P4 세 칸과 §4.1 경로 표가 실계약으로 바뀌고,
      §12에 P4 전용 게이트/증거가 추가되며, §15 완료 판정이 그 게이트를 요구한다.
- [x] O3를 집행해 §12.2 파일럿 A의 적용 경로를 트랙 B MCP write로 고정하고, 채택 이유를
      안전훅+DEV tier gate 동시 관찰로 쓴다. 완료 도장은 적용 경로와 무관하게 vsp CLI
      source read·syntax/activation·unit/ATC 증거만 인정한다. abapGit은 객관적 재론
      트리거가 있는 후속 대안으로 보존한다.
- [x] D-025가 D-023/D-024의 문체·구조를 따라 O1/O2/O3, O1의 D-019 약화·attended-only·
      unattended 봉인, candidate 6de63ba(v0.19.3 blob)와 미커밋 0.19.4 제외 근거,
      07-14 초안 대체, 기각/후속 후보와 재론 트리거를 숨김없이 기록한다.
- [x] `docs/DECISIONS.md`는 기존 byte/line을 수정·삭제하지 않고 EOF에 D-025만 추가한다.
      `git diff docs/DECISIONS.md`가 추가 라인만 보인다.
- [x] `HANDOFF.md`는 기존 헤더 규약·밀도로 설계 확정, D-025, candidate pin, O1 안전 상태,
      P4 실계약, 다음 액션을 반영하며 첫 `---` 이전 헤더 블록 밖 본문은 변경하지 않는다.
- [x] 설계서·D-025·HANDOFF 헤더가 candidate/안전 상태/transport/O3/다음 액션에 대해 서로
      모순되지 않는다. 코드 좌표는 `파일:줄`, 실측·판단·미확인을 구분한다.
- [x] D-018, R-002(vsp MCP 금지), R-003(DEV-only write), R-005(비밀 비커밋), D-019의
      남은 품질 행렬, 실데이터 2종 호출별 사람 승인, 트랙 B 소스 무변경을 위반하지 않는다.
- [x] `phases/`, `interactive/`, 상류 엔진 레포, 07-14 초안, v0.19.2 분석,
      Codex 교차검토 문서를 수정하지 않고 커밋·push하지 않는다. 허용된 산출물은 설계서,
      DECISIONS append, HANDOFF 헤더 및 정확한 이번 작업의 GOAL/STATE 기록뿐이다.
- [ ] Markdown/diff 검사가 깨끗하고 모든 로컬 파일 포인터·절 참조가 존재한다. 독립
      reviewer가 위 18개 기준을 각각 PASS로 판정한다.

## Verification method

1. 작성자는 `git diff --check`, 대상/금지 경로 diff, 필수·금지 용어 검색, 로컬 포인터
   존재 검사를 실행하고 결과를 **자체 확인(self-check)**으로만 기록한다.
2. 별도 새-컨텍스트 reviewer는 이 GOAL과 최종 diff/산출물만 읽고 current repair 기준을
   각각 PASS/FAIL로 판정한다. 작성자는 자기 채점하지 않는다.
3. `COMMANDS.md`, 두 lock의 현재 schema/evidence, `readonlyGuard.ts`의 DEV 동작 등은
   로컬 정본을 대조한다. `vsp transport` 실제 출력은 SAP 자격증명이 필요하므로 실행하지
   않고 **미확인**으로 남긴다.
4. reviewer FAIL이 있으면 해당 기준을 수리한 뒤 같은 rubric으로 재검토한다.

## Independent review result — separate reviewer

- 2026-07-15 새-컨텍스트 read-only reviewer가 current repair 기준 전부를 실제 파일·diff·
  로컬 근거에 대조해 **overall PASS, BLOCKER/MAJOR/MINOR 잔여 0**으로 판정했다.
- 작성자의 자체 확인(self-check) 결과와 별도 기록이다. 위 current repair checkbox를
  작성자가 자기 채점해 바꾸지 않았고, Previous v2 record의 종전 18번도 `[ ]`로 유지한다.
- 한계: 두 review 원문은 작업 시작부터 untracked여서 Git만으로 pre-task byte baseline을
  재구성할 수 없다. 이번 세션에서 해당 파일에 write를 수행하지 않았고 반대 증거는 없다.
