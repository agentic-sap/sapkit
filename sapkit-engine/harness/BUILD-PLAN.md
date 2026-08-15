# 제작 계획 — 묶음 편성표와 산식

기계가 읽는 정본은 **`harness/build-plan.json`**이다. 이 문서는 그 파일이 **왜 그 모양인지**를
적는다. 둘이 어긋나면 JSON이 맞다 — 그리고 그때는 이 문서가 낡은 것이니 고쳐라.

계획은 손으로 적지 않는다. 손으로 적은 편성은 다음 판이 재현하지 못하고, 재현하지 못하는
편성은 매번 처음부터 다시 유도된다. 그래서 산식을 **`harness/build-plan.mjs`**에 넣고 JSON을
거기서 낸다.

```bash
node harness/build-plan.mjs           # 계산해 build-plan.json 을 쓴다
node harness/build-plan.mjs --check   # 커밋본이 산식과 같은지 대조 (다르면 exit 1)
node harness/build-plan.mjs --stdout  # 파일을 건드리지 않고 화면에 낸다
```

**SAP에 붙지 않는다.** 입력은 셋 다 레포 안에 있다.

| 무엇 | 어디 |
|---|---|
| 도구 186종 정본 | `harness/old-surface/m1-tools.json` 의 `tools` |
| 호출 횟수 · 꼬리 49종 · 클래스 | `harness/usage-census.json` |
| 오브젝트 종류(묶음의 단위) | `../engine/src/handlers/**` 의 `TOOL_DEFINITION` 이름 — **읽기만 한다** |

실사용 축(`usage-census.json`)은 **다시 잴 수 없다** — 원본 대화 기록이 30일 만에 지워진다
(`docs/BLUEPRINT.md` §4.7). 커밋된 그 JSON이 이 창의 유일한 항구 기록이고, 이 계획의 순서와
꼬리는 전부 거기서 나온다.

## 1. 묶음의 단위 — 오브젝트 종류

spec §4.4가 못 박은 단위는 **오브젝트 종류**(클래스 · 프로그램 · 테이블 · 함수모듈 …)다. 구
핸들러 트리가 이미 그 모양이라 참조할 원본이 한군데 모인다. 그래서 기본 규칙은 하나다 —
**도구가 선언된 구 핸들러 최상위 폴더가 곧 묶음이다.**

사람이 고쳐 잡은 곳은 아래 넷뿐이고, 이유는 전부 "그 폴더가 오브젝트 종류가 아니다"이다.

### 1.1 꼬리는 원래 묶음에서 빼낸다 (규칙 ①, 다른 모든 배정보다 앞선다)

실사용 축의 꼬리 49종 — **자산 참조도 0이고 호출도 0인 도구** — 은 각 묶음에서 빼내 맨 뒤
`tail` 묶음으로 모은다(spec §4.4.2). `Delete*` 25종이 전부 여기 들어온다. 빼내지 않으면
아무도 안 쓰는 도구가 수요 큰 묶음에 얹혀 함께 앞순위로 올라간다.

### 1.2 runtime 은 `system` 에서 뗀다 (규칙 ②)

덤프·프로파일러·시스템 메시지 계열은 구 트리에서 **독립 폴더가 아니라 `system/` 안에 산다.**
그러나 실행 계열이라 tier 게이트가 걸리고 성격이 다르므로 `runtime` 묶음으로 뗀다(spec §4.4).
판정은 기계적이다 — **폴더가 `system` 이고 실사(census)의 클래스가 `runtime`** 인 도구.

- 그 결과 `system` 35종은 `system` 16 + `runtime` 11 + 꼬리 8로 갈린다.
- `ReloadProfile`도 여기 들어온다. 덤프·프로파일러는 아니지만 실사가 runtime 클래스로 분류한
  도구이고, 판정을 이름 모양이 아니라 실사 데이터로 하는 편이 재현 가능하기 때문이다.
- **실사 클래스가 runtime 인 도구는 15종**이고 그중 `RunUnitTest`·`ValidateServiceBinding`은
  `system/` 밖(각각 `unit_test`·`service_binding`)에 산다. spec이 떼라고 한 것은 *system 묶음
  안의* runtime이므로 이 둘은 제 오브젝트 묶음에 남는다.

### 1.3 동사로 갈린 폴더는 오브젝트로 다시 붙인다 (규칙 ③)

구 트리에서 두 곳이 오브젝트가 아니라 **동사**로 갈려 있다. 그대로 두면 한 오브젝트를 서로
다른 순서에 걸쳐 두 번 짓게 되고, 그것은 "묶음의 단위는 오브젝트 종류"를 배반한다.

| 구 폴더 | 담긴 것 | 묶음 |
|---|---|---|
| `ddlx` | `CreateMetadataExtension` · `UpdateMetadataExtension` | `metadata-extension` |
| `metadata_extension` | `Get…` · `Read…` · `Delete…` | `metadata-extension` (+꼬리) |
| `function` | 함수그룹·함수모듈 **양쪽의 쓰기** 4종 | 도구 이름으로 갈라 `function-group` / `function-module` |
| `function_group` · `function_module` | 각 오브젝트의 읽기·삭제 | 같은 이름의 묶음 |

`function` 폴더의 분기는 도구 이름 접미사(`…FunctionGroup` / `…FunctionModule`)로 하므로
기계가 다시 낼 수 있다.

### 1.4 `compact` 묶음은 세우지 않았다 — 이 표면에 도구가 0종이다

spec §4.4는 횡단 폴더를 넷(`system` `common` `compact` `search`)으로 적었다. 그중 **`compact`만은
이 표면 186종에 도구를 하나도 내지 않는다.** `engine/src/handlers/compact/high/` 가 선언하는
것은 `HandlerActivate` · `HandlerCreate` · `HandlerGet` … 처럼 **`Handler*`로 시작하는 22종**이고,
이는 compact 표면(라우터형 축약 표면)이지 connected 186종이 아니다.

그래서 빈 묶음을 세우지 않았다. 제작 순서에 아무것도 짓지 않는 칸을 끼워 넣으면 그 칸이
"아직 안 지은 묶음"으로 읽힌다. 횡단 묶음은 **넷**(`system` · `search` · `common` · `runtime`)이고,
검증 기준 「횡단 묶음이 오브젝트 묶음보다 앞」은 그 넷에 대해 성립한다.

> 재현: `engine/src/handlers/compact/**` 의 `TOOL_DEFINITION` 이름 22종과
> `harness/old-surface/m1-tools.json` 의 `tools` 키 186종의 교집합은 0이다.

## 2. 순서 — 수요순, 단 두 제약이 산식보다 앞선다

spec은 「수요순」이라고만 적었다. 여기서 쓴 산식은 이것이다.

> **묶음에 속한 도구들의 실사용 호출 횟수 합**의 내림차순.
> 같으면 도구 수 내림차순, 그래도 같으면 묶음 id 오름차순.

호출 횟수는 `usage-census.json` 의 `counts`(2026-07-13 ~ 08-10 · Claude Code + Codex CLI)다.
합을 쓰는 이유는 묶음이 배정 단위이기 때문이다 — 최댓값을 쓰면 도구 하나가 큰 묶음을 통째로
끌어올리고, 평균을 쓰면 도구 하나짜리 묶음이 과대평가된다.

**두 제약이 산식보다 앞선다** (spec이 못 박은 것이다):

1. **횡단 묶음이 오브젝트 묶음보다 앞** — 오브젝트 묶음이 이들을 참조하기 때문이다. 그래서
   `runtime`(호출 107)이 `include`(546)보다 앞에 온다. 산식만 따랐다면 반대였다.
2. **`tail`이 맨 뒤** — 꼬리는 전량 호출 0이라 산식으로도 맨 뒤지만, 규칙으로 못 박는다.

동률 처리 실제 사례: `structure`(122) = `view`(122) → 도구 수도 4로 같음 → id 오름차순으로
`structure` 먼저. `ddlx`와 `function_group`의 동률(11)은 §1.3의 병합으로 사라졌다.

**읽을 때 주의** — `system`이 1등(3,390)인 것은 대부분 `GetSqlQuery` 한 종(2,690 · 전체 호출의
35.5%) 때문이다. 실사 클래스로는 row-data이고 상시 게이트가 걸리는 도구인데, 구 트리에서
`system/`에 살아 이 묶음에 들어왔다. 묶음 순서가 곧 도구 하나하나의 우선순위는 아니다.

## 3. 요구 증거 급 — 주 급 하나

spec §3.3의 사다리를 그대로 옮겼다. **높은 것이 이긴다.**

| # | 조건 | 주 급 | 왜 |
|---|---|---|---|
| ① | 이름이 `Create*` · `Delete*` | `attended` | 재생이 **원리상 불가**하다 — 생성은 두 번째 실행에서 "이미 있다"로, 삭제는 "없다"로 실패한다 |
| ② | 실사용 호출 횟수 > 0 | `replay` | 실호출 기록이 있으니 재생 diff 0을 요구할 수 있다 |
| ③ | 그 밖 | `contract` | 호출 이력도 자산 참조도 없는 꼬리를 포함한다 |

사다리가 겹치는 일은 실제로 생긴다. **호출 이력이 있는 `Create*` 19종**(`CreateInclude` 85 ·
`CreateProgram` 58 · `CreateClass` 30 …)은 ①과 ②에 함께 걸리고, 높은 ①이 이겨 전부 `attended`다.
이 19종을 `replay`로 내리면 대장의 「증거 있음」은 당장 올라가지만 **그 증거는 만들 수 없다.**

`substitute`(대체 기대 시험)는 **여기 적지 않는다.** 급이 아니라 부가 요건이고, 차이 장부
(`harness/DIVERGENCES.md` · `harness/replay/divergences.ts`) 등재분에 대해 대장이 자동으로
붙인다. 지금 등재된 도구는 셋 — `GetSqlQuery` · `UpdateLocalTypes` · `GetIncludesList`.

**분포: `replay` 96 · `attended` 48 · `contract` 42 = 186.**
`attended` 48 = `Create*` 23 + `Delete*` 25.

> 이 배정의 값은 대장에 바로 나타난다. 요구 급이 `replay`·`attended`인 도구는 계약 시험을
> 아무리 통과해도 **「증거 대기」에 머문다** — 그것이 사실이다. 이 판에서 계약 증거를 처음
> 커밋한 뒤 「증거 있음」이 0 → 2로만 오른 것이 그 증거다(`CreateProgram` = attended 실기 기록
> 보유 · `GetSourceDiff` = 요구 급이 `contract`인 유일한 등록 도구).

## 4. 묶음 편성표 (29묶음 · 186종)

`급`은 `replay / attended / contract` 순이다.

| 순서 | id | 제목 | 도구 | 호출 | 급 |
|---:|---|---|---:|---:|---|
| 1 | `system` | 시스템·공통 조회 | 16 | 3,390 | 12 / 0 / 4 |
| 2 | `search` | 검색 | 4 | 742 | 3 / 0 / 1 |
| 3 | `common` | 공통 편집·활성 | 3 | 713 | 2 / 0 / 1 |
| 4 | `runtime` | 런타임 — 덤프·프로파일러·시스템 메시지 | 11 | 107 | 8 / 0 / 3 |
| 5 | `include` | 인클루드 | 4 | 546 | 3 / 1 / 0 |
| 6 | `class` | 클래스 | 12 | 400 | 9 / 1 / 2 |
| 7 | `table` | 테이블 | 5 | 345 | 4 / 1 / 0 |
| 8 | `program` | 프로그램 | 5 | 299 | 4 / 1 / 0 |
| 9 | `function-module` | 함수모듈 | 4 | 252 | 3 / 1 / 0 |
| 10 | `structure` | 구조체 | 4 | 122 | 3 / 1 / 0 |
| 11 | `view` | 뷰 | 4 | 122 | 3 / 1 / 0 |
| 12 | `unit-test` | 단위시험 | 4 | 96 | 4 / 0 / 0 |
| 13 | `behavior-definition` | 동작 정의 (BDEF) | 4 | 67 | 3 / 1 / 0 |
| 14 | `data-element` | 데이터 엘리먼트 | 3 | 55 | 2 / 1 / 0 |
| 15 | `service-binding` | 서비스 바인딩 | 6 | 52 | 5 / 1 / 0 |
| 16 | `domain` | 도메인 | 3 | 39 | 2 / 1 / 0 |
| 17 | `transport` | 트랜스포트 | 4 | 31 | 2 / 1 / 1 |
| 18 | `metadata-extension` | 메타데이터 확장 (DDLX) | 4 | 28 | 3 / 1 / 0 |
| 19 | `gui-status` | GUI 상태 | 6 | 27 | 4 / 1 / 1 |
| 20 | `text-element` | 텍스트 엘리먼트 | 5 | 25 | 3 / 1 / 1 |
| 21 | `atc` | ATC | 1 | 24 | 1 / 0 / 0 |
| 22 | `package` | 패키지 | 2 | 22 | 2 / 0 / 0 |
| 23 | `screen` | 화면 | 5 | 21 | 3 / 1 / 1 |
| 24 | `service-definition` | 서비스 정의 | 4 | 19 | 3 / 1 / 0 |
| 25 | `behavior-implementation` | 동작 구현 (BIMP) | 4 | 18 | 3 / 1 / 0 |
| 26 | `function-group` | 함수그룹 | 3 | 12 | 1 / 1 / 1 |
| 27 | `interface` | 인터페이스 | 4 | 1 | 1 / 1 / 2 |
| 28 | `enhancement` | 인핸스먼트 | 3 | 0 | 0 / 0 / 3 |
| 29 | `tail` | 꼬리 — 호출·참조 양쪽 0 | 49 | 0 | 0 / 28 / 21 |

도구별 배정은 `build-plan.json` 이 갖는다. 대장(`TOOL-LEDGER.md`)은 이 배정을 읽어 도구마다
묶음·순서·요구 급을 표시한다.

## 5. 검증 기준 — 계획서가 못 박은 넷

`node harness/build-plan.mjs`(쓰기·`--check` 양쪽)가 아래 넷을 매번 확인하고, 하나라도
어긋나면 파일을 쓰지 않고 exit 1이다.

1. 186종이 빠짐없이 **정확히 한 묶음**에 속한다 — 중복 0 · 누락 0 · 표면에 없는 이름 0.
2. **꼬리 49종이 마지막 묶음**(`tail` · order 29)에 전부 모여 있고 `Delete*` 25종이 그 안에 있다.
3. 횡단 묶음의 `order`(≤ 4)가 모든 오브젝트 묶음(≥ 5)보다 **작다**.
4. 요구 급이 사다리대로 하나씩 붙고, `substitute`를 주 급으로 쓴 도구가 0종이다.

## 6. 이 계획이 정하지 않는 것

- **무엇을 지을지의 승인** — 이 파일은 순서와 요구 급을 정할 뿐, 어느 묶음을 이번 판에 지을지는
  마일스톤이 정한다(D-082 — 짓기 완료와 증거 완료는 별개다).
- **증거 자체** — 요구 급을 적는 것과 그 급의 증거를 만드는 것은 다른 일이다. 요구 급이
  `replay`·`attended`인 도구는 이 계획이 생겨도 「증거 대기」에 머문다.
- **꼬리를 지을지 말지** — 꼬리는 맨 뒤로 밀렸을 뿐 표면에서 빠지지 않았다. 뺄지 말지는 별도
  결정이다.
