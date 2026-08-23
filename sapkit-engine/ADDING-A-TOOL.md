# ADDING-A-TOOL — 도구 하나 짓는 절차

**설명서가 아니라 절차서다.** 1번부터 9번까지 순서대로 하면 게이트가 통과한다.
각 단계에 **확인 명령**이 붙어 있고, 그 명령이 통과하지 않으면 다음 단계로 가지
않는다.

**전 과정 PowerShell로 실행할 것** — 이 머신에서 Bash로 돌리면 자식 프로세스
수거에서 블록된 실측이 있다. 작업 디렉터리는 `sapkit-engine/`이다.
**SAP에 붙지 않는다** — 아래 어느 명령도 접속하지 않는다.

이 문서는 실제로 지은 도구 **`GetInstalledComponents`** 를 각 단계에서 예로
관통한다. 그 도구의 실물이 이 절차의 증거다.

> **도구 1종의 완성 단위 = 모듈 + 시험 + 등록점 배선 + 대장 갱신, 한 커밋**
> (spec §4.5·§5.3). 배선을 뒤로 미루면 대장이 그 도구를 「안 지음」으로 보고하고,
> 다음 세션이 **같은 도구를 다시 짓는다.**

---

## 1. 무엇을 지을지 고른다 — 대장과 계획이 정한다

순서는 `harness/build-plan.json`이 정한다. 대장의 「안 지음」 절은 그 순서로
정렬돼 있으므로 **맨 위부터** 고른다. 임의로 고르지 않는다.

```powershell
node harness/render-ledger.mjs --check      # 대장이 낡지 않았는지 먼저
Select-String -Path TOOL-LEDGER.md -Pattern '^## 안 지음' -Context 0,8
```

- 확인: 고른 이름이 「안 지음」 절에 있다. 「지음」 쪽에 있으면 이미 지은 것이다.
- 대장이 낡았다고 나오면 먼저 `npm run build; node harness/render-ledger.mjs`로
  다시 만들고 그 변경을 별도로 커밋한다.

> **예시** — 「안 지음」 맨 위 묶음은 「시스템·공통 조회」(순서 1)이고 그중
> `GetInstalledComponents`를 골랐다.

---

## 2. 참조 원본을 읽는다 — **안쪽 패키지까지**

**겉 핸들러만 읽고 지어도 되는 도구는 이 표면에 없다.** 186종 전부가 값으로
`@babamba2`에 닿는다(직접 46 · 간접 140 · 없음 0). 런타임 위임의 무게는 겉이
아니라 `engine/src/lib/`에 있다 — 특히 `lib/clients.ts`(핸들러 246개가 import).

> **⚠ 이 절의 참조 원본 `engine/`은 2026-08-22 판7.5(D-101)에 레포를 떠났다.**
> 아래 절차는 그 시절의 기록이며 **지금 그대로는 실행할 수 없다.** 레포에 남은 것은
> 채록본 둘 — `harness/old-surface/m1-tools.json`(표면)과 `handler-tree.json`(도구
> 339 → 폴더 30 + 위임형 판정)이고, 위임형 열의 뜻은 `TOOL-LEDGER.md` 머리말에 있다.
> 구 소스를 실제로 읽어야 하는 도구가 새로 생기면(지금 「안 지음」은 0이다)
> `2264f89d`에서 그 트리를 되떠 읽는다 — 그 커밋이 `engine/`이 온전한 마지막
> 자리다(`HANDOFF.md` 🔙 절).

읽는 순서는 셋이었다 (역사 기록 — 위 ⚠ 참조):

```powershell
# ① 겉 핸들러 — 선언과 흐름
Select-String -Path ..\engine\src\handlers\*\*\*.ts -Pattern "name: 'GetInstalledComponents'"

# ② 그 핸들러가 부르는 engine/src 안의 공용 헬퍼 (상대 import를 따라간다)
#    예: lib/systemInfoParsers.ts → lib/utils.ts

# ③ 그 헬퍼가 내려가는 안쪽 패키지 — **여기가 와이어의 정본**
Get-ChildItem ..\engine\node_modules\@babamba2 -Recurse -Filter *.js |
  Select-String -Pattern 'async makeAdtRequest'
```

`@babamba2/*`의 `dist`는 주석이 살아 있는 가독 JS다. 거기서 **주소·메서드·헤더·
질의 인자·본문**을 복원한다. 이 판은 재생 대조를 미뤘으므로 **참조 원본의 깊이가
유일한 정확성 근거**다 — 겉만 읽고 지으면 "같은 에이전트가 자기 독해로 쓴 시험이
자기 코드를 통과시키는" 자기확인이 된다.

- 확인: 지으려는 도구가 보내는 요청의 **헤더 한 줄까지** 근거 파일·줄로 댈 수
  있다. 그 근거를 모듈 머리주석에 파일·줄로 적는다.
- **읽기만 한다.** `engine/`·`interactive/server/`는 무접촉이다 — **단 7번의 카탈로그
  재생성은 예외다**(생성기가 `interactive/server/tool-catalog/` 4파일을 쓴다).
- 주의: 대장의 「위임형」 열은 텍스트 검사라 **주석에 `@babamba2`가 적혀 있기만
  해도 「직접」**이 된다. 그 열을 "겉만 읽어도 되는가"의 근거로 쓰지 마라.

> **예시** — `handleGetInstalledComponents.ts` → `lib/systemInfoParsers.ts`의
> `tryAdtGet` → `lib/utils.ts:902`의 `makeAdtRequestWithTimeout` →
> `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-190`.
> 거기서 확인한 것: URL은 `baseUrl + endpoint`, **호출자가 준 `Accept`가 기본값을
> 이긴다**, GET이라 CSRF 취득도 상태유지 헤더도 붙지 않는다.

---

## 3. 선언을 **채록본**에 맞춘다

발행 선언의 정본은 `harness/old-surface/m1-tools.json`의 **`tools` 키(186종
전량)**다. `m1` 키(19종)가 아니다 — 그쪽을 보면 M1 밖 도구는 찾을 수 없다.

```powershell
node -e "const j=require('./harness/old-surface/m1-tools.json');console.log(JSON.stringify(j.tools['GetInstalledComponents'],null,2))"
node -e "const j=require('./harness/old-surface/m1-tools.json');const n='GetInstalledComponents';console.log(Object.entries(j.exposures).filter(([k,v])=>v.names.includes(n)).map(([k])=>k).join(', '))"
```

선언 7항목을 이렇게 채운다(계약 정본 = `src/server/toolDefinition.ts`).

| 항목 | 어디서 오는가 |
|---|---|
| `name` · `description` | 채록본 **글자 그대로**. 오타도 그대로 옮긴다 |
| `inputSchema` | 채록본의 JSON Schema를 **zod raw shape으로 표현**. 인자 이름·`description`·필수 여부·`default`가 전부 일치해야 한다 |
| `available_in` | 구 핸들러 `TOOL_DEFINITION.available_in` 그대로 |
| `sets` | 구 핸들러가 **어느 디렉터리에 있었나** — `handlers/<묶음>/<집합>/`의 집합 이름(`readonly` `high` `low` …). 두 번째 명령의 `*_readonly` 소속으로 교차 확인한다 |
| `kind` | 정책 분류 — `read` · `mutation` · `execution` · `row-data` · `server-control`. 안전 게이트가 이 축으로 판단한다 |
| `targetNames` | 4번 참조 |

- 확인: 두 번째 명령이 낸 조건 목록과 `sets`·`available_in`의 조합이 어긋나지
  않는다(무프로파일 조건에 뜨는 도구는 연결 전용이 아니다).
- `inputSchema`가 없는 도구는 `{}`를 쓴다. 채록본의 `required: []`는 발행 표면에
  나타나지 않으므로 옮기지 않는다.

### 대상-이름 인자(`targetNames`) 선언

녹화 사전 검사(`harness/targetGuard.ts`)가 이 선언을 읽어, 대상이 고객 객체(Z·Y)가
아니면 **SAP 호출이 나가기 전에** 막는다. 세 모양이 있다.

```ts
targetNames: ['include_name']                                  // 인자 하나가 이름
targetNames: ['source_name', 'target_name']                    // 이름 인자가 둘 (GetSourceDiff)
targetNames: [{ arg: 'objects', element: 'object_name' }]      // 배열 인자 (GrepObjects)
targetNames: [{ arg: 'objects', element: 'name' }]             // 원소 키는 도구마다 다르다 (ActivateObjects)
targetNames: []                                                // 대상 이름 인자가 **없다**는 명시 선언
```

- **`kind`가 `mutation`·`execution`이면 선언이 필수다.** 빠뜨리면
  `src/tools/__tests__/targetNames.test.ts`가 거부한다. 대상 이름을 아예 받지 않는
  도구(예: 이송번호만 받는 것)는 **빈 배열을 명시**한다 — 빈 배열은 선언이지
  귀찮음의 도피처가 아니다.
- `read`·`row-data`에는 요구하지 않는다. 그래도 객체 이름을 받는다면 적어 두는
  편이 낫다 — 사전 검사가 그만큼 넓어진다.
- 키는 `inputSchema`의 키로 좁혀져 있다. 인자 이름 오타는 컴파일에서 걸린다.

> **예시** — `GetInstalledComponents`는 인자가 없고 `kind: 'read'`라 선언하지
> 않았다. `sets: ['readonly']`는 구 경로 `handlers/system/readonly/`에서, 4개 노출
> 조건 전부에 뜨는 것으로 교차 확인했다.

---

## 4. 모듈을 짓는다

자리는 **현행 성격별 배치**다. 오브젝트 종류별 폴더로 재편하지 않는다.

```
src/tools/read/      읽기·검색·반영확인
src/tools/write/     쓰기·활성
src/tools/rfc-read/  RFC 경유 읽기
src/tools/row-data/  실데이터 (상시 게이트 결합)
src/tools/runtime/   덤프·프로파일러·시스템 메시지
```

**`runtime/`은 다섯째 자리다** — 이 판의 runtime 묶음을 지으면서 열었다. 그 계열에는
`execution`(SAP에서 ABAP을 실제로 돌린다) 종류가 있는데 위 넷 어디에도 맞지 않고,
제작 계획도 성격 때문에 그 묶음을 따로 떼어 놓았다. **오브젝트 종류별 재편이 아니라
성격 하나가 늘어난 것**이므로 spec §4.3의 금지(오브젝트 종류별 폴더로 재편)에 걸리지
않는다. 기존 19종은 한 파일도 움직이지 않았다 — 그 금지가 지키려던 것이 그것이다.

**여섯째 자리를 열지 마라.** 새 도구가 위 다섯 중 어디에도 안 맞아 보이면, 그건 대개
`kind` 판정을 잘못한 것이다. 정말 새 성격이라면 짓기 전에 보고하라.

파일 이름은 **도구 이름의 소문자시작형**이다 — `GetInstalledComponents` →
`src/tools/read/getInstalledComponents.ts`.

```ts
export const getInstalledComponents = defineTool(
  { name: …, description: …, inputSchema: …, available_in: …, sets: …, kind: … },
  async (context, args) => {
    const client = await context.getConnection();   // 게이트를 지난 뒤에만 불린다
    const response = await client.request({ method: 'GET', path: …, accept: …, timeout: 'default' });
    return ok(response.body);
  },
);
```

지키는 것:

- **이름·인자 이름·응답 형태를 바꾸지 않는다.** 개명도 "개선"도 금지다.
- **복사·붙여넣기 금지.** 구 소스와 `@babamba2`는 읽기 전용 참고서다. 동작을
  이해하고 **다시 저작**한다.
- `context.getConnection()`은 **함수**다. 이것을 부르기 전에는 접속이 만들어지지
  않는다 — 게이트에 막힌 호출이 SAP에 닿지 않는 근거가 이 한 줄이다.
- `client.request()`는 `status >= 400`에서 던진다(`src/adt/client.ts:296`).
  구 엔진이 오류를 데이터로 접던 도구라면 그 갈래를 여기서 다시 만든다.
- 응답 본문은 **문자열**이다(구는 axios가 JSON을 객체로 파싱해 넘겼다). 파싱
  진입점이 다를 뿐 결과가 같으면 차이가 아니다 — 결과가 다르면 부록 A로 간다.
- 머리주석에 **와이어 근거를 파일·줄로** 적는다. 2번에서 읽은 것이 여기 남는다.

- 확인: `npm run typecheck` (exit 0)

---

## 5. 시험을 쓴다

**파일 이름이 규약이다.** 지키지 않으면 그 도구의 계약 시험 증거가 대장에 안
잡힌다(수집기 정본 `harness/contract-evidence.mjs` → `findContractTestFiles`).

```
<모듈 디렉터리>/__tests__/<도구 이름의 소문자시작형>.test.ts
예: src/tools/read/__tests__/getInstalledComponents.test.ts
```

이미 있는 묶음 시험(`publication.test.ts` · `contract.test.ts`)에 한 줄 얹는 것으로는
**안 된다** — 그 파일 이름은 도구 이름이 아니라서 대장이 못 찾는다.

시험이 붙잡을 것 넷:

1. **발행 계약** — 서버를 실제로 세워 `tools/list`를 받고, 채록본과 네 필드
   (`name`·`description`·`inputSchema`·`execution`)를 통째로 견준다.
2. **노출 선언** — `sets`·`available_in`·`kind`가 구 핸들러의 디렉터리·선언과 같다.
3. **와이어** — 도구가 실제로 조립한 URL·메서드·헤더·본문. 전송을 주입해 붙잡는다.
4. **갈래** — 오류·폴백·빈 응답처럼 구 엔진이 특별하게 다루던 길.

공용 장치는 성격별 `__tests__/support.ts`에 있다. **자식 프로세스도 실 SAP도 쓰지
않는다** — MCP 규약은 SDK의 `InMemoryTransport`로 같은 프로세스에서 진짜로 오가고,
SAP 쪽만 전송 주입으로 끊는다.

```ts
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

// 채록본의 전량 선언에서 그 도구 항목을 꺼낸다 (m1 19종이 아니라 tools 186종)
expect(published).toEqual(publishedDeclaration('GetInstalledComponents'));

// 도구가 실제로 보낸 요청만 남긴다 (CSRF 토큰 왕복 제외)
const { outcome, requests } = await runTool(tool, args, (request) => ({ status: 200, body: '…' }));
expect(toolRequests(requests)[0].headers['Accept']).toBe('…');
```

- 확인: `npx jest src/tools/read/__tests__/getInstalledComponents.test.ts` (exit 0)

---

## 6. 등록한다 — **즉시**. 미루지 않는다

`src/tools/registry.ts`가 유일한 등록점이다. import 한 줄 + 배열 한 줄.

```ts
import { getInstalledComponents } from './read/getInstalledComponents';
…
export const TOOL_REGISTRY: readonly SapTool[] = [
  …
  // 시스템·공통 조회 묶음 (build-plan 순서 1)
  getInstalledComponents,
];
```

배열 순서는 아무 의미가 없다(`tools/list`의 순서일 뿐이다). 같은 이름을 두 번
올리면 SDK가 등록 시점에 거부한다.

**등록은 표면을 넓힌다.** 표면을 글자로 적어 둔 시험이 함께 늘어야 한다:

- `src/server/__tests__/entry.test.ts` — `--exposition=readonly` + cloud 축에서
  뜨는 이름 목록. 새 도구가 그 조건에 걸리면 목록에 이름을 더한다. (계산으로
  바꾸지 마라 — 노출 규칙을 시험이 다시 짜면 자기확인이 된다.)

- 확인: `npm test` (exit 0)

---

## 7. 대장과 증거 파일, 그리고 **제품 카탈로그**를 다시 만든다

```powershell
npm run build                        # 대장·카탈로그 생성기는 둘 다 dist/ 를 읽는다
node harness/render-ledger.mjs       # TOOL-LEDGER.md 재생성
node harness/render-tool-catalog.mjs # 제품 카탈로그 4파일 재생성 (등록점이 바뀌었다)
npm run test:report                  # jest --json --outputFile=.jest-report.json
npm run evidence:contract            # evidence/contract/results.json 갱신
node harness/render-ledger.mjs       # 증거 파일이 바뀌었으니 한 번 더
```

- **대장은 손으로 고치지 않는다.** 손으로 고친 대장은 게이트가 거부한다.
- **카탈로그도 같은 지위다** — `interactive/server/tool-catalog/sapkit-mcp-tools*.md`
  4파일은 등록점(`TOOL_REGISTRY`)에서 만드는 **기계 생성물**이고(D-107 ⓐ), 손으로
  고치면 게이트 「카탈로그」가 거부한다. **도구를 하나 지으면 등록점이 바뀌므로
  이 재생성이 같은 커밋에 들어간다** — 미루면 CI가 빨개질 때까지 반쪽 상태다.
  이것이 6번의 등록점 배선과 같은 이유로 「한 커밋」에 편입돼 있다(D-108 ⓑ).
- `evidence/contract/results.json`을 **커밋해야** 대장의 계약 열이 「미기록」에서
  벗어난다. 레포에 없는 것은 없는 것이다 — 그것이 이 대장의 규칙이다.
- 확인: `node harness/render-ledger.mjs --check` (exit 0) ·
  `node harness/render-tool-catalog.mjs --check` (exit 0) ·
  대장에서 그 도구가 「안 지음」에서 「지음」 절로 옮겨 갔다.

```powershell
Select-String -Path TOOL-LEDGER.md -Pattern '^\| GetInstalledComponents '
```

> **카탈로그는 도구 이름으로 인용한다 — 행 번호로 하지 마라**(D-108 ⓒ④). 생성
> 파일이라 도구를 하나 지을 때마다 뒤 행이 전부 밀린다.

---

## 8. 게이트를 전부 돌린다

```powershell
npm run build
npm run typecheck
npm test
npm run gates                        # 표면 · 카탈로그 · 안전 · 대장 · HTTP 기동 · SSE 기동
node gates/test-gates.mjs            # 게이트 자체의 음성시험
node harness/render-ledger.mjs --check
node harness/build-plan.mjs --check
```

전부 exit 0이어야 한다. 표면 게이트가 보는 것 넷:

- ⓐ 등록된 도구의 발행 선언이 채록본과 **글자 일치**
- ⓑ 4개 노출 조건에서의 소속 일치
- ⓒ 채록본에 없는 이름을 발행하지 않음
- ⓓ 대장의 「지음」 집합 = 등록점 집합

---

## 9. 커밋한다 — **한 커밋**

한 커밋에 들어가는 것:

```
src/tools/<성격>/<도구>.ts                       모듈
src/tools/<성격>/__tests__/<도구>.test.ts        시험
src/tools/registry.ts                            등록점 배선
TOOL-LEDGER.md                                   대장 (생성물)
evidence/contract/results.json                   계약 시험 증거 (생성물)
../interactive/server/tool-catalog/
    sapkit-mcp-tools*.md (4파일)                 제품 카탈로그 (생성물 — 7번)
(표면을 글자로 적어 둔 시험이 있으면 그것도)
```

**카탈로그 4파일이 빠진 커밋은 반쪽이다** — 등록점은 넓어졌는데 제품이 싣는 목록은
낡은 상태이고, CI의 `sapkit-engine` 잡이 그것을 잡을 때까지 아무도 모른다.

메시지는 한국어로, **무엇을 지었고 왜 그 모양인지**를 적는다.

```
feat(engine): GetInstalledComponents — 시스템 묶음 1종

와이어는 @babamba2/mcp-abap-connection의 makeAdtRequest까지 읽어 복원했다.
후보 엔드포인트 2종을 차례로 물어보고 둘 다 없으면 오류가 아니라
{ supported: false }로 답한다 — 구 핸들러가 그렇게 지은 이유는 이 답이
플랫폼 자동 판별의 입력이기 때문이다.
```

git push는 사용자 판단이다. 커밋까지만 한다.

---

## 부록 A — 구와 다른 동작을 발견했을 때

**등재되지 않은 차이는 결함이다.** 여기 없는데 동작이 어긋나면 신 엔진을 고친다.
일부러 다르게 지을 때만 장부에 올린다.

올리는 자리는 둘이고, **둘 다** 채워야 한다.

1. `harness/DIVERGENCES.md` — **사람용 정본**. 「제작 중 발견분」에 절을 하나 더한다.
   **모든 차이가 여기 온다.**
2. `harness/replay/divergences.ts` — 기계가 읽는 형태(`DivergenceEntry`).
   재생 러너의 allowlist 기제가 이것을 읽는다.
   **여기 오는 것은 「재생 대조에 실제로 나타나는 차이」뿐이다** — 그 파일 머리주석이
   그 규칙의 정본이다. 접속·기동·프로파일 계층의 차이는 도구 응답 시퀀스에 안 나타나므로
   옮기지 않는다.

> **묶음 과제가 ②를 못 채우는 경우가 있다.** 도구 묶음을 짓는 과제에는 보통
> `harness/replay/**`가 무접촉으로 걸려 있다(여러 묶음이 같은 파일에서 충돌하기 때문).
> 그때는 ①만 채우고 **보고에 "기계 장부 미반영"을 명시하라.** 오케스트레이터가 묶음
> 병합 뒤에 한 번에 옮긴다. **옮기지 않은 채로 재생을 켜면**, 의도한 차이가 결함으로
> 잡히거나(가짜 실패) 그 반대가 된다.
>
> 판정이 애매하면 이렇게 갈라라 — **와이어(요청 주소·전문·헤더)나 도구 응답이 달라지면
> 기계 장부에도 온다.** 진단 문구·내부 캐시·아직 안 지은 기능은 문서에만 남는다.
> 단 **오류 문구 중 `MCP error -32602:` 같은 코드 조각은 기계가 소비한다** —
> `harness/replay/errorSignature.ts`의 `DEFAULT_CODE_RULES`가 `-32\d{3}`을 강한 신호로
> 쓰므로, 그 조각이 달라지면 문구 차이가 아니라 **와이어 차이로 다뤄야 한다.**

등재 규칙 넷(spec §2.4):

| 규칙 | 내용 |
|---|---|
| ① 근거 문서 | 왜 다른지, **어디서 실측했는지 파일·줄** |
| ② 대체 기대 시험 | 다른 쪽이 *옳다*는 것을 증명하는 시험 경로. 비교에서 뺀 것이 곧 무증거가 되지 않게 하는 조건이다 |
| ③ 분류 | `수리`(구의 오답·거짓 성공을 고침) / `강화`(안전 바닥선을 올림) / `축소`(M1에서 아직 안 지음) |
| ④ 해소 마일스톤 | `축소` 항목은 언제 해소되는지 명시. 영구 차이가 아니다 |

- **대체 기대 시험이 산문이면 증거가 아니다.** 대장은 그 경로에 **파일이 실재할
  때만** 센다(`substituteEvidenceFromLedger`).
- 파싱 진입점처럼 **결과가 같은** 구현 차이는 차이가 아니다. 모듈 머리주석에
  "구와 다른 것 (차이가 아니다)"로 적고 넘어간다.
- 확인: `npx jest harness/replay/__tests__` (장부 형식 검사가 여기 있다)

---

## 부록 B — 자주 걸리는 자리

| 증상 | 원인 |
|---|---|
| 계약 시험이 "채록본에 없다"고 던진다 | 채록본의 `m1`(19종)을 읽고 있다. `tools`(186종)를 읽어라 |
| 대장이 그 도구를 「안 지음」이라 한다 | 등록점 배선을 안 했다. 모듈만으로는 지은 것이 아니다 |
| 대장의 계약 열이 「미기록」이다 | 시험 파일 이름이 규약과 다르거나, `evidence:contract`를 안 돌렸다 |
| 표면 게이트 ⓓ가 깨진다 | 대장을 다시 만들지 않았다 (`node harness/render-ledger.mjs`) |
| 표면 게이트 ⓐ가 깨진다 | zod shape이 채록본의 JSON Schema와 다르다. `description`·필수 여부·`default`까지 본다 |
| **표면 게이트 ⓑ가 깨진다** | **`sets`를 구 폴더 이름에서 베꼈다.** 구 트리의 `high`/`low`/`readonly`는 `sets` 값이 **아니다** — 채록본의 `exposures` 네 집합에서 그 도구가 어디에 뜨는지 보고 맞춰라. 실례: `system/high/`에 사는 `GetPackageTree`는 `sets: ['system']`이어야 한다(`readonly`가 `system`도 켜기 때문). **`system/low`의 세 종(`GetNodeStructureLow`·`GetObjectStructureLow`·`GetVirtualFoldersLow`)이 같은 모양이라 `low`로 적으면 똑같이 깨진다** |
| `entry.test.ts`가 목록 불일치로 깨진다 | 등록으로 표면이 넓어졌다. 그 목록에 이름을 더해라 |
| 대장 생성기가 "빌드 산출물이 없다"고 한다 | `npm run build`를 먼저 |
| **대장 신선도 시험 1건이 `test:report`에서 빨갛다** | **정상이다.** 그 시험은 커밋된 대장과 계산 결과를 대조하는데, `test:report`는 대장을 다시 만들기 **전에** 돈다. 재생성 뒤 `npm test`가 전부 통과하는지로 판정하라 |
| XML 값에서 앞자리 0이 사라진다 (`000012` → `12`) | `fast-xml-parser`의 기본값이 숫자처럼 생긴 문자열을 수로 바꾼다. 구가 쓰던 `xml-js` compact 의미에 맞추려면 **`parseTagValue: false`** |
| 한국어 블록 주석 뒤로 TS 오류가 무더기로 난다 | 주석 안에 `*/`가 들어갔다. Accept 헤더 `*/*` 같은 것을 그대로 적으면 주석이 거기서 닫힌다 |

---

## 부록 C — 이 절차가 실현하는 것

- spec §4.2 참조 원본 — 위임형은 안쪽 패키지까지 (2번)
- spec §4.3 파일 배치 — 현행 성격별 유지, 등록점 하나 (4·6번)
- spec §4.5 완성 조건 4개 — 등록·글자 일치·노출 소속·시험 통과 (3·5·6·8번)
- spec §5.2 레시피는 따라 하면 되는 순서로 (이 문서 전체)
- spec §5.3 도구마다 즉시 배선, 한 커밋 (6·9번)
