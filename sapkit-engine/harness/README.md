# harness/ — 동등성 검증 하네스

구 엔진과 신 엔진이 **같은 요청에 정규화 후 같은 응답**을 내는지 증명하는 장치.

## 라이브러리 (판정의 소유자)

- `recorder/` — **제품 번들**(`interactive/server/server.bundle.cjs`)을 자식
  프로세스로 구동해 MCP 요청/응답 **시퀀스**를 채록한다. 정규화 필터(잠금 핸들·
  세션/CSRF 토큰·타임스탬프·서버 생성 URI)와 **마스킹 검사기**(자격증명·호스트·
  접속정보·실데이터 패턴이 0인지)를 통과한 것만 픽스처로 저장한다. 번들은
  **실행만** 하고 수정하지 않는다.
  ⚠ 판7-b(D-095) 뒤 그 번들은 **신 엔진**이다. 그러므로 지금의 채록은 「구 엔진이
  무엇을 냈는가」를 남기는 대조 채록이 아니라 **attended 실기 증거**이고, 저장
  자리도 `../fixtures/attended-only/`로 갈린다(`attended-guard.mjs`).
- `replay/` — 픽스처를 신 엔진에 먹여 정규화 diff 0을 판정한다. **의도적 차이
  목록(divergence allowlist)**에 등재된 항목은 diff 비교 대신 **대체 기대 시험**
  으로 판정하며, 각 항목은 근거 문서 경로를 가진다. 도구 × 증거 급을 기록한
  **커버리지 표**를 산출한다.
- `ledger/` — 등록점·표면 채록본·제작 계획·증거 파일에서 **진척 대장**
  (`../TOOL-LEDGER.md`)을 계산하고, 커밋본과 대조한다. 상태 3칸의 계산은
  `replay/coverage.ts`가 소유하고 여기서 다시 짜지 않는다. 증거는 **레포 안의
  파일**에서만 온다 — 문서 서술과 옛 콘솔 출력은 입력이 아니다(`../evidence/README.md`).

## 진입점 (조립기 — 판정 규칙을 다시 구현하지 않는다)

| 파일 | 구간 | 하는 일 |
|---|---|---|
| `record-attended.mjs` | **C1** | 시나리오를 **제품 번들**에 태워 픽스처로 저장 (기본 자리 `../fixtures/attended-only/`) |
| `replay-attended.mjs` | **C2** | 픽스처를 신 엔진에 먹여 판정 + 커버리지 표 + **판정 파일**(`../evidence/replay/`) |
| `render-ledger.mjs` | 오프라인 | 진척 대장(`../TOOL-LEDGER.md`)을 계산해 쓰거나 `--check`로 대조 |
| `contract-evidence.mjs` | 오프라인 | jest `--json` 보고서를 도구별 통과로 접어 `../evidence/contract/results.json` |
| `auth-guard.mjs` | 공용 | 401 계열 첫 건에서 전송을 끊는다 |
| `attended-guard.mjs` | C1 판정 | 저장 자리 3분기·무접속 어휘·강등 판정 (부작용 없음 — `gates/test-attended-guard.mjs`가 겨눈다) |
| `scenarios/` | C1 입력 | 무엇을 물어볼지 적어 두는 곳 (형식은 그 README) |
| `fixtures/attended-only/` | C1 산출 | 채록된 시퀀스. 마스킹 통과분만 |
| `fixtures/` (`../fixtures/`) | 재생 기준선 | **구 엔진 채록분.** 여기에 새로 저장하는 것은 거부된다 (교체 뒤에는 자기 대조라 증거가 아니다) |
| `old-surface/` | 기준선 | 구 번들 `tools/list` 오프라인 채록본 |
| `build-plan.mjs` | 오프라인 | 묶음·제작 순서·요구 증거 급을 **계산해** `build-plan.json`을 쓰거나 `--check`로 대조 |
| `build-plan.json` | 계획 | 묶음 29 · 도구 186종의 묶음·제작 순서·요구 증거 급. 사람이 읽을 근거는 `BUILD-PLAN.md` |

```powershell
node harness/record-attended.mjs --scenario=<id> --dry-run          # SAP 불필요
node harness/record-attended.mjs --scenario=<id> --env-path=<sap.env>
node harness/replay-attended.mjs --env-path=<sap.env>
node harness/render-ledger.mjs                                      # SAP 불필요
node harness/render-ledger.mjs --check                              # SAP 불필요
node harness/build-plan.mjs                                         # SAP 불필요
node harness/build-plan.mjs --check                                 # SAP 불필요
```

**C1·C2는 SAP에 접속한다.** 재생은 응답을 흉내 내는 것이 아니라 신 엔진이 같은
질문을 다시 던지는 일이라, C1뿐 아니라 **C2도 attended 구간**이다. 대장·계획 계열
(`render-ledger.mjs`·`contract-evidence.mjs`·`build-plan.mjs`)은 레포 안의 파일만
읽는 오프라인 도구다.

## 진입점이 지키는 것 (라이브러리가 안 보는 축)

- **강등 감지** — 무접속 거부가 섞였거나 · 전 단계가 오류이거나 · **저장 자리에
  맞지 않는 엔진**을 채록했으면 **저장하지 않는다.** 반쪽 증거를 커밋하면 대장이
  거짓을 센다. 무접속 어휘는 상수를 복제하지 않고 제품 게이트
  (`interactive/scripts/conformance-server-gates.mjs`의 `verdictOf`)에서 **긁어온다** —
  못 찾으면 판정 없이 죽는다. 저장 자리 규칙은 셋으로 갈린다:
  `../fixtures/attended-only/`는 **제품 엔진 이름을 요구**하고, 재생 기준선
  `../fixtures/`는 **무조건 거부**하며, 그 밖의 자리는 막지 않되 커밋 대상이
  아님을 알린다. ⚠ 이 판정은 시퀀스가 **다 나간 뒤**에 돈다 — 「저장이 안 됐다」는
  「SAP이 안 바뀌었다」가 아니다(자리 거부만은 태우기 전에도 한 번 돈다).
- **고객 네임스페이스 제한** — **대상이 고객 객체(Z·Y)여야 하는 도구**를 태우기
  **전에** 판정한다. 무엇을 검사할지는 **도구 선언**에서 온다:
  `SapToolDefinition.targetNames`가 그 도구의 대상-이름 인자를 밝히고,
  `harness/targetGuard.ts`가 그 선언을 읽어 검사기를 만든다 — 녹화 스크립트에
  이름 표를 두지 않는다. 도구를 지으면 사전 검사가 자동으로 따라오고, **SAP을
  바꾸는 도구(`mutation`·`execution`)는 선언 없이는 게이트를 통과하지 못한다**
  (`src/tools/__tests__/targetNames.test.ts`).
  둘이 같은 제약을 진다: 원본 소스를 돌려주는 것(마스킹 검사기는 제3자
  소스코드를 보지 않으므로 표준 소스가 공개 레포에 박히는 것을 여기서 막는다)
  과 SAP을 바꾸는 것(P3는 DEV 연습 자리(전용 패키지 또는 `$TMP`) 안에서만이고,
  사후에 걸러 봐야 write는 이미 일어난 뒤다). **연습 자리 축은 러너가 검사하지
  않는다** — 강제되는 것은 Z·Y 네임스페이스뿐이고, 패키지는 시나리오 작성자의
  책임이다. **선언이 없는 도구는 막지 않는다** — 신 엔진이 아직 짓지 않은 구
  번들 도구가 대다수라 여기서 fail-closed로 뒤집으면 녹화가 통째로 막힌다.
  그쪽은 지금처럼 인자·응답의 ABAP 원본 표지로 **사후** 차단한다.
  (`--allow-standard-source`로 풀 수 있으나 그 픽스처는 커밋하지 말 것.)
- **인증 실패 중단** — 오류 응답도 대조 대상이라 러너는 다음 단계를 계속
  태우는 것이 옳지만, **인증 실패만은 반복이 계정 잠금을 부른다**(2026-08-11
  실측 · D-080). 401 계열은 첫 건에서 끊고, 404·문법 오류·게이트 거부는 그대로
  통과시킨다. 재생 러너는 예외를 `transportError` 문자열로 접으므로
  `replay-attended.mjs`가 그 문자열에서 중단을 되알아보고 **다음 픽스처로
  넘어가지 않는다.**
- **무증거는 통과가 아니다** — 픽스처 0건, 이연된 등재 항목은 종료 코드 1이다.
- **실데이터는 배치로 돌지 않는다** — 행 데이터 도구가 섞인 픽스처가 있으면
  `--fixture`로 한 건씩 명시하게 한다(P2).

녹화 실행(C1)과 재생 판정(C2), 실기 확인(C3)은 SAP에 접속하는 **attended
단계**로, 소유자 세션에서만 수행한다 — 배치·서브에이전트 무인 실행 금지.
