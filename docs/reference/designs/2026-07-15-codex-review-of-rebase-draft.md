# Codex 교차검토 결과 — 재기준 설계서 초안 (2026-07-14 draft)

> 리뷰 대상: `2026-07-14-track-a-v019-rebase.md`(초안). 리뷰어: Codex CLI 0.144.4,
> `gpt-5.6-sol`, `model_reasoning_effort=max`, `--sandbox read-only`, 2026-07-15.
> 세션 id 019f6374-9249-79e1-b669-ea0f45d08deb. 레포 무변경·분석 재실행 없음(리뷰어 명시).
> **판정: PASS with fixes (MAJOR 8 · MINOR 0)** — 아래는 리뷰어 최종 응답 원문.
>
> 메인 세션 독립 대조(2026-07-15): MAJOR-1(install_engine.py 주체 오기 — 분석 :265와
> 불일치) · `permissions.secrets` 필드명(분석 :501) · MAJOR-7(lock에 `verified_commit`
> 단일 필드뿐) **3건 실측 확인 = 리뷰어 주장 성립**.
>
> 후속 사용자 정정(2026-07-15): "배포를 사람만 하게 하려던 게 아니다 — MCP로 소스 반영도
> 가능하고 abapGit으로 직접 할 수도 있다." → 초안 §4의 credential-free 범위(Direct/Guided
> 포함)가 과대 설정이라는 MAJOR-4와 같은 지점. 차단 대상은 **리뷰어 역할 + unattended**로
> 좁혀야 한다는 것이 사용자 의도(DESIGN §3 "대화형 세션은 사람 소유라 MCP 사용이 하네스
> 보증과 충돌하지 않는다"와 정합).

---

**PASS with fixes** — 3축 방향 자체는 D-023/D-024 및 보존 분석과 맞지만, attended 안전 경계·Direct 리뷰 종결조건·legacy 비활성화·마이그레이션 게이트가 아직 기계 계약으로 닫히지 않았으므로 아래 MAJOR 수리 후에만 확정 가능하다.

## MAJOR

### MAJOR-1 — `install_engine.py` 동작 설명이 분석과 직접 어긋난다

① **문제:** 설계서는 `install_engine.py`가 `RULES/LESSONS/PROTOCOL`을 없을 때 복사한다고 서술한다. 실제로 설치기는 다섯 learning 파일 모두를 순회하거나 복사하지 않는다. 세 파일의 copy-if-missing은 별도 `harness-init` 운영 계약이다.

② **위치:** `docs/reference/designs/2026-07-14-track-a-v019-rebase.md:119-121` (§5).

③ **근거:** `docs/reference/designs/2026-07-14-v019-engine-analysis.md:263-285`, 특히 265-283. 이는 분석 문서와의 직접 사실 불일치다.

④ **수리:** 다음처럼 주체를 분리한다: “`install_engine.py`는 다섯 파일 모두를 건드리지 않는다. 별도 `harness-init`만 `RULES/LESSONS/PROTOCOL`이 없을 때 선택적으로 복사한다. `GOAL/STATE`는 어느 경로에서도 생성하지 않는다.”

### MAJOR-2 — “attended에서 실효 차단”은 기계 경계로 성립하지 않는다

① **문제:** §4-3이 자식의 `vsp-env.ps1` 직접 호출 우회를 인정하면서도 §4-1·기록 규율·R4에서 “견고/실효 차단”이라고 결론낸다. 같은 Windows 사용자 권한으로 프로파일 파일과 Credential Manager에 접근할 수 있다면 이는 자격증명 분리가 아니라 단순한 환경변수 미상속이다. 또한 `manifest.secrets`라는 필드 표기도 부정확하며 정확한 경로는 manifest의 `permissions.secrets`다.

② **위치:** 설계서 `:97-115` (§4-1~3·기록 규율), `:181-182`(R4).

③ **근거:** 분석 `:493-505`는 환경 필터를 불완전한 defense-in-depth로 규정하고, 파일/keychain 사용 시 credential store 분리 또는 deploy 불능 principal을 요구한다. `scripts/vsp-env.ps1:23-24,32,47-125`는 같은 사용자로 프로파일과 Credential Manager를 실제 해석한다. D-024 원문 `docs/DECISIONS.md:396-404`도 RV4를 열린 갭으로 확정한다. 특정 Codex sandbox가 홈 디렉터리 접근을 별도로 막는지는 **미확인**이지만, Claude/Bridge/Guided까지 포괄한 현재 결론은 성립하지 않는다.

④ **수리:** 다음 중 하나를 기계 경계로 채택해야 한다.

- worker/reviewer와 escort를 별도 OS 계정·프로세스·ACL·credential store로 분리
- worker/reviewer에는 SAP 배포 권한이 없는 principal만 제공
- 또는 upstream classifier에 `vsp`/`vsp.exe`를 추가

기록 문구도 “RV4는 열림; attended는 사람 참관과 규율로 위험을 수용하며 기계 차단은 아님”으로 낮춰야 한다. 온라인 리뷰가 필요하면 credential-free가 아니라 **read-only principal**을 정의해야 한다.

### MAJOR-3 — Direct의 SAP 코드 리뷰 경계는 현재 규율에만 의존한다

① **문제:** ABAP/CDS 초안은 Direct로 허용하고 Direct에는 리뷰 강제가 없다고 한 뒤, SAP 코드는 새-컨텍스트 리뷰 대상이라고만 선언한다. 완료를 막는 전이 조건·증거 파일·도구 제한이 없다. Guided도 검사기를 선택사항으로 두므로 D-019의 reviewer 기계 격리가 보존되지 않는다.

② **위치:** 설계서 `:39-45`, `:51-57`, `:68-83`.

③ **근거:** D-019 원문 `docs/DECISIONS.md:224-242`는 reviewer의 Bash·SAP mutation 도구를 기계 차단하는 결정을 포함한다. D-024 `:419-423`은 SAP 코드/write에 새-컨텍스트 리뷰 적용을 불변으로 둔다. Direct/Guided는 router no-op이고 설계서에 별도 verdict 소비자가 없으므로 현재 경계는 **실측상 규율 의존**이다.

④ **수리:** “Direct에서 초안 작성은 가능하나 SAP 코드 작업은 독립 리뷰 증거 없이는 완료 선언·SAP write 불가”를 종결조건으로 추가한다. 권장안은 코드 산출 시 Guided로 필수 승격하고, read-only reviewer 프로필과 PASS 산출물·reviewed SHA를 의무화하는 것이다. 의도적으로 규율만 사용할 경우에는 D-019의 기계 보증을 약화하는 새 결정으로 명시해야 한다.

### MAJOR-4 — 모드 축과 SAP 접근 프로필이 혼재되어 활동 매핑이 완결되지 않았다

① **문제:** 에스코트 배포를 명시적으로 “축 밖”에 두었고, Direct/Guided를 credential-free라 하면서 online read·vsp verify를 같은 축에 배치했다. 실데이터 추출, connected verify, transport create/release, write가 포함된 배치의 소속도 빠져 있다. Guided 행의 “MCP 탐색”이 트랙 B의 사람 소유 보조 경로인지 트랙 A 접점인지도 불명확하다.

② **위치:** 설계서 `:37-45`, `:79-83`, `:97-106`; `adapters/vsp/SAFETY-PROFILES.md:47-55,163-173`; `HANDOFF.md:923`.

③ **근거:** online read와 vsp verify에는 자격증명이 필요하다. transport 정책은 현재 OPEN이며, GetTableContents/GetSqlQuery는 모드와 무관한 호출별 사람 승인 대상이다. D-023 `docs/DECISIONS.md:349-352`는 MCP를 사람 소유 보조 경로로만 유지하고 verify/write 도장은 vsp로 한정한다.

④ **수리:** 단일 표를 다음 두 차원으로 재작성한다.

- 실행 구조: Direct / Guided / Engine attended
- SAP 권한 프로필: offline / connected-read / real-data extraction / write-escort / transport

각 조합에 credential owner, 리뷰 필요 여부, 자동화 허용 여부를 명시한다. 에스코트는 “축 밖”이 아니라 해당 Guided/Engine run의 **parent-only terminal action**으로 정의한다. MCP는 트랙 B 보조 컨텍스트이며 트랙 A 완료 증거가 될 수 없다고 명시하거나 행에서 제거한다.

### MAJOR-5 — legacy “기본 비활성”은 문서 표기뿐이며 실행은 그대로 열린다

① **문제:** legacy catalog가 기존 phase를 재실행 금지로 분류해도 `run_id` 없는 phase는 `execute.py`로 정상 기동되며 authority context 없이 gate를 통과한다. “신규 실행 대상 아님”이라는 문구는 비활성화 메커니즘이 아니다.

② **위치:** 설계서 `:123-131` (§5).

③ **근거:** 분석 `:122-130`은 legacy phase에서 authority gate가 즉시 통과한다고 확정한다. 기존 `phases/3a-carrflt-seed/index.json`과 `4a-glopen-seed/index.json`에는 실제 `escort-write-deploy` step도 남아 있다.

④ **수리:** 프로젝트 실행 진입점에서 `run_id`·`mode=engine`·contract/manifest가 없으면 기본 거부하도록 한다. 과거 재현이 필요하면 사람의 명시적 `--allow-legacy` 같은 별도 override와 감사 기록을 요구한다. 보존 파일 자체는 변경하지 않아도 된다.

### MAJOR-6 — 기술 게이트가 R1·R3·R4와 N7을 충분히 덮지 않는다

① **문제:** 

- 게이트 ④는 vsp가 차단되지 않는 결과를 “통과”라 부르며 자격증명 스코핑의 실효성을 입증한다고 하지만, 이는 classifier 누락만 확인할 뿐 자식의 credential 취득을 시험하지 않는다.
- 게이트 ⑤의 “트랙 B MCP 훅 3개 smoke”는 검사 방법이 정의되지 않았다.
- Engine 자체 review가 비게이트라는 N7에 대응하는 실패 경로 시험이 없다.
- v0.19.3 선택 시 retired test의 재유도·실행이 완료 게이트에 없다.

② **위치:** 설계서 `:162-169`, `:173-182`.

③ **근거:** D-024 `docs/DECISIONS.md:424-427`은 미차단을 음성시험 **실패**로 처리하고 RV4 존속 또는 재pin을 요구한다. 분석 `:157-161`은 Engine review 비게이트를 확정한다. 현재 `interactive/scripts/smoke-mcp.mjs`에는 루트 훅 검사 참조가 없고, `doctor.mjs:99-147`은 command 대상 파일의 존재만 검사해 matcher/command 문자열 보존을 증명하지 못한다. 별도의 신규 smoke를 의도했는지는 **미확인**이다.

④ **수리:** 완료 게이트에 최소한 다음을 명시한다.

- Track B 세 matcher·command의 migration 전후 구조적 동등성 + 세 훅 각각의 실제 발화
- 씨앗/FAIL verdict가 write 도달을 막는 N7 음성시험
- credential-free fake `vsp` sentinel로 “hook deny”와 “프로세스 실행됨”을 구분하는 RV4 시험
- 자식의 `vsp-env.ps1`·credential store 접근 실패 시험
- 선택 SHA의 upstream test 전체 실행 및 retired test 실행 위치 확인
- Claude/Codex 양 드라이버의 Direct diff 0

R2의 정확 SHA 고정 자체는 충분히 커버된다.

### MAJOR-7 — 후보 pin과 검증 lock의 기록 방식이 정의되지 않았다

① **문제:** 929685a를 후보로 고정하라고 하지만 어디에 어떤 필드로 기록할지 없다. 현재 lock에는 `verified_commit`만 있어 이를 929685a로 덮어쓰면 D-024의 “검증 전 verified 선언 금지”를 위반한다. 최종 최신 버전 재대조 후 stay/repin 판정 기준도 없다.

② **위치:** 설계서 `:157-160,169`; `adapters/final-harness.lock.json:2-10`; D-024 `docs/DECISIONS.md:389-395`.

③ **근거:** 현재 `verified_commit`은 v0.17.3의 검증 완료 SHA다. 후보와 검증 완료 상태를 동시에 표현할 스키마가 없다.

④ **수리:** 기존 `verified_commit`은 유지하고 `candidate_commit`, `candidate_version`, `analyzed_blob`, `candidate_pinned_at` 등을 추가하거나 후보 파일을 분리한다. 게이트 통과 후에만 후보를 `verified_commit`으로 승격한다. 최종 SHA가 929685a와 달라지면 delta 분석과 전체 migration/pilot gate를 다시 수행한다는 규칙도 명시한다.

### MAJOR-8 — §6 문서 연쇄 목록만으로 단계 4를 집행할 수 없다

① **문제:** 실제로 낡은 singleton·legacy phase·credential 규약을 소비하는 활성 문서가 표에서 빠졌다. 특히 SAFETY-PROFILES는 §⑥·§⑦뿐 아니라 §①~⑤ 전체가 구 Offline/Read-only/Gated 모드와 구 자격증명 모델을 사용한다.

② **위치:** 설계서 `:145-153`, 그리고 exact AGENTS 문안을 외부 확인으로 미룬 `:86`.

③ **근거:**

- `.harness/PROTOCOL.md:7-44` — 모든 실질 작업에 singleton GOAL/STATE 강제
- `docs/reference/templates/review-gate-plan-conventions.md:14-44,84-89` — `run_id` 없는 legacy phase 생성 및 “실증 후 무인 전환”
- `docs/reference/templates/review-step.md:57-73` — credentialed vsp read 허용
- `adapters/vsp/VERIFY-PATTERNS.md:191-196` — 호출자 구분 없이 `vsp-env.ps1` dot-source 지시
- `adapters/vsp/SAFETY-PROFILES.md:40-121,219-243` — 구 모드와 “무인 전환 가능” 서술
- 기존 리뷰 게이트 설계서도 v0.17 좌표와 phase-공통 env를 전제로 한다.

이 상태에서 신규 Engine phase를 계획하면 N2 권한 봉투가 없는 legacy 경로로 되돌아갈 수 있다.

④ **수리:** §6 표에 다음 처분을 추가한다.

- `.harness/PROTOCOL.md`: legacy 명시 또는 run 계약형으로 교체
- 리뷰 게이트 설계·`review-step.md`·`review-gate-plan-conventions.md`: v0.19 contract/manifest/permission envelope로 개정
- `VERIFY-PATTERNS.md`: parent-only credential 호출 규약 추가
- `SAFETY-PROFILES.md`: §①~⑧ 전체를 모드와 직교하는 Policy 프로필로 재작성
- `HANDOFF.md`: 단계 상태 갱신
- `adapters/final-harness.lock.json`: 후보/검증 상태 분리
- domain/packs의 “무인 step” 표현 감사

과거 `phases/` 산출물은 수정하지 말고 LEGACY-CATALOG가 역사 자료로 봉인하면 된다.

## MINOR

없음. 발견된 수정 필요 사항은 모두 확정 전에 닫아야 하는 사실·안전·집행 계약으로 판단했다.

## OBSERVATION

- **[실측]** §4의 authority-gate 코드 좌표, §6의 F1~F7/N1~N7 요약, §7의 `929685a=v0.19.2` 후보 사실은 보존 분석과 대체로 일치한다. 직접 사실 불일치는 MAJOR-1과 `permissions.secrets` 필드 표기다.
- **[실측]** R2의 moving-master 방지는 정확 SHA 고정으로 충분하다. 트랙 B 훅 basename 비충돌도 보존 분석 헤더/HANDOFF의 재확인과 맞는다. 다만 설치 후 보존은 별도 실측 대상이다.
- **[판단]** 문제는 3축 방향 자체가 아니라 안전 경계와 실행 계약의 미완성이다. 따라서 전면 재설계가 필요한 FAIL은 아니며, 위 MAJOR를 반영한 뒤 확정 가능한 `PASS with fixes`가 적절하다.
- 저장소 변경은 하지 않았고, v0.19.2 코드 분석도 재실행하지 않았다.
