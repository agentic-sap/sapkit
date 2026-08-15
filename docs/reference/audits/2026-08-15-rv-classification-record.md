# RV 분류·차단 검증 실측 보존 — `adapters/vsp/SAFETY-PROFILES.md` §⑪ 이관본

> **성격**: 새 감사가 아니라 **기록의 이사**다(2026-08-15, vsp 은퇴 판). 아래 본문은
> 은퇴하는 `adapters/vsp/SAFETY-PROFILES.md`의 §⑪을 **한 글자도 고치지 않고** 그대로
> 옮긴 것이다. 측정값·판정·날짜를 재해석하거나 요약하지 않았다.
>
> **왜 옮겼나**: 루트 `AGENTS.md`는 상태값 넷(`attended-only` · `unattended=sealed` ·
> `historical_rv4_classifier=open` · `sap_mutation_boundary=unverified`)과 **그 뒤의
> RV1~RV4 분류**를 기록하라고 지시한다. 상태값 넷과 RV4 풀이는
> `docs/reference/designs/2026-07-15-track-a-rebase-v2.md`(§6·상태 블록)와
> `docs/reference/DECISIONS.md` D-025에도 살아 있으나, **RV1·RV2·RV3의 정의와 V1~V5
> 실측 표는 레포에서 §⑪에만 있었다.** 이 판에서 그 파일이 삭제되므로 삭제 **전에**
> 살아남는 자리로 옮긴다 — 옮기지 않으면 `AGENTS.md`가 가리키는 분류의 근거가
> 레포에서 사라진다.
>
> **권위는 옮겨오지 않았다**: 상태값 넷을 움직일 수 있는 것은 여전히 재기준 v2와
> D-025뿐이다(`AGENTS.md` 말미). 이 파일은 **그 분류가 무엇을 재서 나온 말인지**를
> 보존하는 실측 기록이며, 하위 문서가 상태값을 고쳐 쓰거나 완화하는 자리가 아니다.
> **RV4를 "닫힘"으로 기록하는 것을 금지한다**는 본문의 원칙도 그대로 승계된다.
>
> **재현 불가**: 본문이 인용하는 phase 아티팩트·verify 래퍼·`src/` 표본은 R1에서,
> vsp 자체와 그 lock·프로파일 문서는 이 판에서 레포를 떠났다. 아래 명령 문자열은
> **당시 실행된 것의 기록**이지 지금 실행할 절차가 아니다.

---

## ⑪ 차단 검증 — 역사 실측(2026-07-13)과 현재 상태의 분리

> **읽는 법**: 아래 V1~V5·RV1~RV4는 **2026-07-13 시점의 실측 기록**이며 그대로 보존한다.
> 그러나 **당시의 "무인 전환 가능" 판정은 현재 지원 상태가 아니다** — D-025 이후
> `unattended=sealed`이고 RV4가 확정한 갭 때문에 `historical_rv4_classifier=open` ·
> `sap_mutation_boundary=unverified`가 현재 기록이다. 역사 판정을 현재 권한으로 읽지 말 것.
>
> **재현 불가 (R1)**: 이 절이 인용하는 verify/env 래퍼·phase 아티팩트·`src/` 표본은
> R1에서 레포에서 걷어냈다. 아래 명령 문자열은 **당시 실행된 것의 기록**이지 지금
> 실행할 절차가 아니다 — 그대로 실행하려 하지 말 것.

당시 기대 마커는 verify 래퍼(VERIFY-PATTERNS ③)의
`CODE_FAIL`/`ENV_FAIL`/`LOCK_FAIL`/`VERIFY_PASS`였다. 실측 셸: 자격증명 부재 확인 후
V1~V3, `IDEA-JNC` 프로파일 주입 후 V4(read 계열만).

| # | 전제 | 명령 | 기대 | 실측 (2026-07-13) | 판정 |
|---|---|---|---|---|---|
| V1 | P0 (무자격증명·CWD `.env` 없음, `Get-ChildItem Env:SAP_*` 0건 확인) | `& .\scripts\verify-sap.ps1 -- deploy src/zsah1_workdays.prog.abap '$TMP'` | **ENV_FAIL** | exit 1, `ENV_FAIL: no SAP connectivity (vsp system info exit 1)` | 일치 — P0 write는 **기계적**으로 불가 |
| V2 | P0 | `& .\scripts\verify-sap.ps1 -- atc PROG ZSAH1_WORKDAYS` | **ENV_FAIL** | exit 1, 동일 마커 | 일치 — P1도 자격증명 없이는 불가(완전 결핍 확인) |
| V3 | P0 | `vsp lint --file src/zsah1_workdays.prog.abap` | exit 0/1(lint 판정) | exit 0, `No issues found` | 일치 — P0 draft 게이트는 자격증명 없이 동작 |
| V4 | P1 (자격증명 주입, IDEA-JNC read) | `vsp source read PROG ZSAH1_WORKDAYS`, `vsp health --package '$TMP'`, `verify-sap.ps1 -- atc PROG ZSAH1_WORKDAYS` | 정상 exit 0 | 3건 전부 exit 0 — source read 전문 반환 · health `WARN`(기존 객체 ATC 지적, 명령은 정상 완주) · atc `VERIFY_PASS`, 1 INFO(TTZCU 시간대 캐시, Error 0) | 일치 — P1 허용 성립. read 계열만 실행 |
| V5 | 정적 감사(크리덴셜 불요) | 전 5개 phase의 verify 명령 문자열 전수 추출 | 위반 0건 | 12개 SAP 관련 step verify 중: impl 5개 전부 `vsp lint --file`(P0) · review-gate 2개(3a/3b) 전부 로컬 검사기만(`Get-FileHash` sha256 핀 + `check-review-verdict.ps1`, vsp 인자 0건) — `deploy`/`copy`/`query`/`execute`/`source write` **0건**. 유일한 `deploy` 문자열은 3a step2 `escort-write-deploy`(P3 전용 명명 스텝, §⑫ 스코프 — review-gate 3회 FAIL로 미도달) | 일치 — write/실데이터 verb가 P0/P1 스냅샷에 없음 |

**V5 상세**: `0-example`(템플릿, SAP 무관) 제외 — `1-workdays-util` step0/1: `vsp lint --file` ×2 ·
`2-duedate-reuse` step0/1: `vsp lint --file` 체인 ×2 · `3a-carrflt-seed` step0: `vsp lint --file`,
step1(review-gate): 로컬 검사기, step2(`escort-write-deploy`): `verify-sap.ps1 -- deploy … '$TMP'`
(미도달) · `3b-carrflt-gated` step0: `vsp lint --file`, step1(review-gate): 로컬 검사기.

### 리뷰 스텝 시나리오 (RV1~RV4)

| # | 절차 | 판정 | 실측 (2026-07-13) |
|---|---|---|---|
| RV1 | 3b 리뷰 스텝 산출물에서 SAP 접촉 명령 전수 열거 | write verb **0건** | `step1-output.json` 세션 최종 응답: "No other repo writes; no vsp write; no `src/` edits." 리뷰 방법론 = `git diff main -- src/` + 소스 정독(vsp 호출 0건). **3a·3b 무인 실행은 P0 스코핑**(엔진 phase 셸에 `SAP_*` 미주입 — 에스코트 체인 E1~E4는 `vsp-env.ps1` 로드한 **사람 주도 셸**에서 별도 수행) → SAP 접촉 구조적 0건 |
| RV2 | 리뷰 스텝의 **frozen verify 명령**이 verdict 검사만 하고 SAP write를 포함하지 않음을 감사 | 위반 0건 | 3a/3b 공통 verify: `Get-FileHash … SHA256` 핀 대조 + `check-review-verdict.ps1 -Phase -Verdict`뿐. `check-review-verdict.ps1` 전문을 `vsp.exe|vsp-env|SAP_|deploy|copy|query|execute`로 grep → 매치 1건(120행, git rename/copy **표기 감지** 주석 — SAP `copy`와 무관). SAP verb 0건 |
| RV3 | 조항1(등식형 dirty)이 리뷰어의 **레포 쓰기**를 차단함을 확인 | 차단 성립 | `test-check-review-verdict.ps1` — **13/13 PASS**, `AC1(b) reviewer code edit -> blocked`(verdict+src 동시 dirty → exit 1) 포함 |
| RV4 | **음성 대조**: 리뷰 스텝이 자격증명 present 상태면 `vsp deploy`가 **성공할 수 있음**을 확인 | **갭 확정** | 기실측 인용(`phases/3b-carrflt-gated/scoring-raw.md` E1·D3) — E1: `IDEA-JNC` 주입 셸에서 `verify-sap.ps1 -- deploy src/zsah3_carrflt.prog.abap '$TMP'` → `VERIFY_PASS` 성공. D3: 동일 상태 재배포도 성공. 리뷰 스텝과 에스코트 체인이 **같은 phase의 승계 env**를 공유하므로 리뷰 스텝이 동일 셸에서 `deploy`를 호출했다면 동등하게 성공했을 것 → **SAP-write 차단은 자격증명 부재로 성립하지 않고, 관례(RV1)+allowlist+에스코트의 합으로만 성립** |

### RV4의 현재 상태 (2026-07-16 갱신)

- **RV4는 갭을 없애는 절차가 아니라 드러내는 절차다.** 현재 기록:
  `historical_rv4_classifier=open`.
- **v0.20.x candidate(`d4a0aeb`)로 올려도 닫히지 않는다 (D-028 실측)** —
  `authority-gate.py`(@d4a0aeb)에 **"vsp" 언급 0건**이고 `_deploy()`의 `deploy_actions`
  (`:371-376`)는 helm/vercel/netlify/firebase/flyctl/wrangler/serverless/railway만 커버,
  **vsp 부재**. `:390`의 `head=="deploy" or action in deploy_actions.get(head,…)` 판정상
  `vsp deploy`(head=`vsp`)는 걸리지 않는다 → `deploy=false`여도 vsp deploy 미차단.
  **엔진 업그레이드가 RV4를 닫아줄 것이라는 기대는 배제됐다.**
- 1차 방어는 **§⑥의 role별 credential 분리**(reviewer 셸에 자격증명 미주입)이며, 기계
  봉쇄는 리뷰/write phase 분리 또는 엔진 승격에 편입한다(미결 — 발명하지 않음).
- **2026-07-19 참고 — 별개의 새 기계 강제층**: vsp-custom `5a8bedb`(현재 lock)가 신설한
  write_profile_gate(§⑧·§⑩)는 `SAP_READ_ONLY`/`SAP_TIER` 조건이 맞으면 자격증명
  존재 여부와 무관하게 write를 dial 이전에 거부한다. 이는 RV4가 다루는 **"리뷰 스텝의
  phase-공통 자격증명이 write를 성공시키는가"라는 질문과는 별개의 메커니즘**이다 —
  리뷰 스텝의 실행 env에 `SAP_READ_ONLY=true`가 함께 주입되는지는 이번 통합에서
  확인되지 않았으므로, 새 게이트의 존재가 RV4를 닫는다고 간주하지 않는다.
  **RV4를 "닫힘"으로 기록하는 것을 금지한다**는 아래 원칙은 유지된다.
