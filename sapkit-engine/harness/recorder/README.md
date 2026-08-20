# recorder/ — MCP 채록기

**제품 번들**(`interactive/server/server.bundle.cjs`)을 자식 프로세스로 띄워 MCP
요청/응답 **시퀀스**를 채록하고, 정규화·마스킹을 통과한 것만 픽스처로 저장한다.
번들은 **실행만** 하고 수정하지 않는다.

판7-b(D-095) 전에는 그 번들이 구 포크였고 채록의 목적이 「구 엔진이 무엇을
냈는가」를 대조 기준으로 남기는 것이었다. 교체 뒤 태우는 것은 **신 엔진**이고,
그래서 지금의 채록은 대조 채록이 아니라 **attended 실기 증거**다 — 저장 자리
규칙은 `harness/attended-guard.mjs`가 소유한다.

재생·대조는 `harness/replay/` 소관이다. 여기는 증거를 **만드는** 쪽이다.

## 왜 낱개 호출이 아니라 시퀀스인가

쓰기 흐름(잠금 → 수정 → 활성화)은 호출 **순서**와 그 사이의 **상태 전달**이
의미를 갖는다. 1단계가 받은 잠금 핸들을 2단계가 쓴다. 낱개로 쪼개면 그
상관관계가 사라지고, 정규화도 호출마다 독립 수행돼 "같은 원본 토큰 → 같은
자리표시자"가 성립할 수 없다.

## 픽스처 형식 (`types.ts`가 정본)

```jsonc
{
  "formatVersion": 1,
  "sequenceId": "demo-lock-modify-activate",   // ^[a-z0-9][a-z0-9-]*$ — 파일 이름으로 안전
  "description": "데모 클래스 잠금 → 수정 → 활성화",
  "engine": {
    "name": "mcp-abap-adt",       // MCP serverInfo.name
    "version": "5.0.0",           // MCP serverInfo.version
    "protocolVersion": "2024-11-05",
    "exposition": "readonly,high" // 기동 시 넘긴 --exposition 값 그대로
  },
  "recordedAt": "2026-08-10T06:52:17.331Z", // 채록 시각 — 실제 ISO 시각 그대로 (대조 제외)
  "steps": [
    {
      "index": 0,                  // 배열 위치와 반드시 같다 (형식 불변식)
      "tool": "LockObject",
      "args": { "object_name": "ZCL_DEMO" },
      "response": { "content": [{ "type": "text", "text": "…<<LOCK_HANDLE_1>>…" }] },
      "isError": false,
      "note": "잠금 핸들을 받는다"   // 없으면 null
    }
  ],
  "placeholders": [                 // 자리표시자 대장 — 원본 토큰은 절대 담지 않는다
    { "placeholder": "<<LOCK_HANDLE_1>>", "kind": "lock-handle", "occurrences": 3 }
  ]
}
```

| 타입 | 역할 |
|---|---|
| `SequenceFixture` | 파일 하나의 전체 내용 |
| `SequenceStep` | 도구 호출 1회 + 그 응답 |
| `EngineIdentity` | 채록 대상 엔진의 신원 (다르면 대조 자체가 무의미) |
| `PlaceholderBinding` | 자리표시자 대장 한 줄 |
| `NormalizationKind` | `lock-handle` `csrf-token` `session-id` `timestamp` `server-id` `uri` `duration` `principal` |

`recordedAt`은 **실제 시각을 그대로 보존한다**. 증거 계층과 커버리지 표가
"무엇이 언제 어느 엔진에서 딴 증거인가"를 묻기 때문에 이 출처가 사라지면 안 된다.
재채록마다 파일이 흔들리는 문제는 값을 지워서가 아니라 **대조에서 빼서** 푼다 —
`types.ts`의 `REPLAY_METADATA_POINTERS`(현재 `/recordedAt` 하나)가 재생 러너가
비교하지 않는 필드의 정본이고, `comparableFixture()`가 그 필드를 뺀 투영을 준다.
응답 **안**의 타임스탬프는 여전히 비결정 토큰이므로 정규화 대상이다.

## 정규화 — 되돌릴 수 있는 규칙이 아니라 판정용 사상

지키는 성질은 하나다.

> 같은 원본 토큰 → 같은 자리표시자, 다른 원본 토큰 → 다른 자리표시자

`Normalizer` 인스턴스 하나가 곧 하나의 사상이고, **시퀀스 전체에 걸쳐 상태를
이어 간다**. 잡는 경로는 둘 — 값이 놓인 **키 이름**(`lockHandle`·`location`…)과
자유 텍스트 안의 **패턴**(XML `<LOCK_HANDLE>`, `x-csrf-token:`, ISO 타임스탬프,
UUID, 32자리 hex). 두 경로가 같은 원본을 잡아도 사상의 키는 원본 토큰뿐이라
결과는 같은 자리표시자다.

**건드리지 않는 것**: 결정적인 객체 URI(`/sap/bc/adt/oo/classes/zcl_demo`),
숫자·불리언·null. 결정적인 값이야말로 대조가 봐야 할 신호다.

순회 순서가 곧 번호 순서다 — **단계만**(0번부터, 인자 → 응답) 훑는다.
`recordedAt`은 정규화에서 빠지므로 자리표시자 번호를 하나도 소비하지 않고, 단계
안의 번호가 메타데이터에 딸려 흔들리는 일도 없다. 이미 정규화된 픽스처를 다시
정규화해도 결과는 같다(멱등).

## 신원 가리기 — 가리되 증거는 남긴다 (`principal`)

픽스처는 커밋되고 **레포는 PUBLIC**인데, SAP은 객체 메타데이터에 작성자를 **반드시**
박는다 — `adtcore:responsible` · `adtcore:changedBy` · `adtcore:createdBy`, 그리고
`CreateTransport` 응답의 `owner`. 2026-08-20 실기에서 픽스처 9편 중 **4편에 접속
사용자의 SAP 로그인 아이디가 22군데** 들어갔다.

**왜 마스킹이 아니라 정규화인가.** 마스킹은 거부다 — 걸리면 저장하지 않는다. 작성자를
박는 도구는 `Create*`와 대부분의 `Read*`이라, 거부로 다루면 **그 도구들의 증거를 영영
남길 수 없다.** 가려야 하지만 증거는 남아야 하므로 **거부가 아니라 치환**이고, 그래서
자리를 정규화기에 둔다.

**앞의 일곱과 성격이 갈린다.** 저것들은 부를 때마다 값이 달라져 대조를 방해하니 치우는
**비결정 토큰**이다. `principal`은 **값이 안정적인데도** 치운다 — 이유가 대조가 아니라
공개다. 그래서 이것만 패턴이 아니라 **목록으로** 온다(사람 이름·계정 아이디는 모양으로
알아볼 수 없다). 그 밖의 계약은 그대로다: 같은 원본 → 같은 자리표시자.

```ts
normalizeFixture(fixture, { redact: ['TESTUSER'] });   // 또는 recordSequence(spec, transport, { redact })
```

| 정한 것 | 값 | 근거 |
|---|---|---|
| 대소문자 | **무시** | SAP이 같은 이름을 두 꼴로 낸다 — ADT URI는 소문자, 메타데이터 속성은 대문자. **같은 신원이므로 같은 자리표시자**를 준다(사상의 키를 대문자로 접는다). 갈라 놓으면 「이 객체의 작성자가 곧 접속자」라는 상관이 사라진다 |
| 경계 | 앞뒤가 **영숫자면 매치하지 않는다**(`_`는 경계) | SAP 이름은 `[A-Z0-9_]`다. 영숫자가 이어지면 `TESTUSER2`처럼 **다른 계정**이라 건드리면 안 되고, `_`로 끊기면 `ZCL_TESTUSER_DEMO`처럼 **이름을 품은 객체명**이라 그것도 신원 유출이다 |
| 최소 길이 | **3자** (`REDACT_MIN_LENGTH`) | 빈 문자열을 가리면 문자 사이 모든 자리가 자리표시자가 된다. 두 글자는 `ZCL_AB_DEMO`·`SET AB` 같은 흔한 SAP 토큰 안에서 끝없이 걸려 픽스처가 대조 불가능한 잡음이 된다. 하한보다 짧은 항목은 **목록에서 조용히 버리고**, 그런 프로파일로 채록하려 하면 진입점이 사람에게 돌려준다 |
| 훑는 자리 | 단계의 **인자와 응답** | 시나리오가 소유한 자리(`description`·`note`·`sequenceId`)는 **일부러 손대지 않는다** — 거기 신원이 있으면 고칠 자리는 픽스처가 아니라 **시나리오 파일**이고(그 파일도 커밋된다), 저장 뒷문이 그 경우를 거부해 사람에게 돌려준다 |

### 목록은 접속 프로파일에서 온다

`harness/record-attended.mjs`가 `--env-path`의 `sap.env`에서 `SAP_USERNAME`과
`SAP_RESPONSIBLE`을 읽어 넘긴다. 둘 다 보는 이유는 이 엔진 자신이 세션 사용자를
`SAP_RESPONSIBLE || SAP_USERNAME`으로 정하기 때문이다(`src/tools/read/getTransport.ts`) —
하나만 가리면 나머지로 같은 사람이 샌다. 파싱 규칙은 제품이 같은 파일을 읽는 정본
(`src/profile/envFile.ts`)과 같다.

⚠ **읽은 값은 어디에도 출력하지 않는다** — 로그는 「가릴 이름 N건을 읽었다」까지다.

**없거나 너무 짧으면 태우기 전에 죽는다.** 조용히 빈 목록으로 넘어가면 그 다음에
일어나는 일은 「아이디가 실린 픽스처가 PUBLIC 레포에 커밋되는 것」이고, 저장 뒤에는
되돌릴 수 없다. 그러므로 이 판정은 자리 판정·무접속 판정과 같은 줄에 선다 — **미리
세울 수 있는 것은 미리 세운다.**

### fail-closed 뒷문 (`attended-guard.mjs`)

정규화가 놓쳐도 저장은 막힌다. `detectRedactionLeak(fixture, names)`가 정규화가 끝난
픽스처를 훑어 이름이 남아 있으면 문제를 낸다 — **객체의 키 이름까지** 본다.

- **정규화기의 경계 규칙을 다시 구현하지 않는다.** 베낀 뒷문은 그 규칙과 **함께
  틀린다**. 그래서 뒷문은 대소문자만 무시하는 **맨 부분 문자열** 검사로 의도적으로
  더 넓다 — 넓은 쪽으로만 틀리므로 새지 않는다(`masking.ts`의 「오탐이 조금 있는 편이
  누락보다 낫다」와 같은 방향).
- **거부문에 원본 이름을 싣지 않는다.** 위치만 말한다 — 보고서 자체가 새면 안 된다
  (`masking.ts`의 `HINTS`가 같은 이유로 걸린 원문을 안 담는다).
- 이 판정은 **SAP 호출이 전부 나간 뒤**에 돈다. 그래서 거부문에 `SAP_ALREADY_RAN`이
  함께 나간다 — 「저장이 안 됐다」는 「SAP이 안 바뀌었다」가 아니다.

### 아직 닫히지 않은 자리

재생(`harness/replay/`)은 살아 있는 응답을 `normalizeFixture(...)`로 정규화할 때 **가릴
목록을 넘기지 않는다.** 그래서 `<<PRINCIPAL_n>>`이 든 픽스처를 재생 대조에 쓰면 그
자리가 갈림으로 잡힌다. 지금은 문제가 되지 않는다 — `replay-attended.mjs`는
`fixtures/` 바로 아래만 수집하고 그 픽스처들은 가리기 이전 채록분이며, 가리기가 붙는
`attended-only/`는 애초에 재생 자산이 아니다. **가려진 픽스처를 재생 기준선으로 쓰려면
그때 이 배선을 이어야 한다.**

## 마스킹 — 경고가 아니라 거부

픽스처는 git에 커밋된다. 그래서 `saveSequenceFixture`는 쓰기 **직전**에
`assertMasked`를 돌리고, 위반이 하나라도 있으면 `MaskingRejection`을 던지며
**파일에 손대지 않는다**. 중간 지대(경고 후 저장)는 두지 않는다.

| 규칙 id | 잡는 것 |
|---|---|
| `basic-auth` | `Basic <base64>` 헤더, `authorization` 키 |
| `bearer-token` | 불투명 `Bearer <토큰>` (Basic도 JWT도 아니라 사이로 샌다) |
| `base64-credential` | `사용자:비밀번호`로 복호되는 base64 (접두어 없어도) |
| `password-like` | 비밀번호·시크릿·API 키 키/env 값, URL userinfo |
| `real-host` | 실제 호스트명·IPv4/IPv6·포트·접속 URL·접속정보 키 |
| `cookie` | 쿠키 헤더, `SAP_SESSIONID_*`·`MYSAPSSO2`·`sap-usercontext` |
| `jwt` | JWT 형태 토큰 |
| `bulk-row-data` | 실데이터 행처럼 보이는 대량 결과 |

훑는 자리는 값**과** 객체의 **키 이름** 둘 다다. 호스트별 맵처럼 접속정보가 키
자리에 실리는 응답이 있고, 값만 보면 그대로 통과한다. 비밀이 키 이름일 때는
보고서가 그 비밀을 되싣지 않도록 경로에 키 대신 `<key#N>`을 쓴다.

`real-host`가 보는 호스트 모양은 넷이다 — 접속 URL의 오리티, `host:port`(점 있는
이름 **과 단일 라벨** 둘 다 — SAP 온프렘 호스트는 `sapdev01:44300` 같은 단일
라벨이 흔하다), IPv4 리터럴, IPv6 리터럴(`::` 압축형이거나 8그룹 완전형일 때만 —
그래야 `09:15:22` 같은 시각 표기를 주소로 읽지 않는다), 그리고 맨 이름 FQDN.
허용하는 호스트는 **명백한 가짜**(`*.example` `*.test` `*.invalid` `*.localhost`
`example.com|net|org`, 루프백 `localhost`·`127.0.0.0/8`·`::1`)와 **접속처가 아닌
것이 확실한 것**(XML 네임스페이스 호스트 `www.w3.org`·`www.sap.com` 등)뿐이다.
판 번호 오탐 같은 것은 `MaskingOptions.allowedHosts`로 건별로 푼다 — 규칙을
넓히지 않는다.

`bulk-row-data`는 세 갈래다. ⓐ **도구 기준** — `GetTableContents`·`GetSqlQuery`의
응답에서 원소 `maxRows`(기본 20)를 넘는 배열. ⓑ **형태 기준** — 도구와 무관하게
반복 `<row>`/`<item>` 태그나 구분자 행이 `maxRows`를 넘을 때. ⓒ **text 콘텐츠 안** —
실데이터 도구일 때 문자열 안을 JSON으로 읽어 `rows` 계열 키 아래 배열의 원소를
센다. 구 엔진은 행을 배열 노드가 아니라 `JSON.stringify(parsedData, null, 2)`
**문자열**로 싣기 때문에 ⓐ·ⓑ만으로는 실테이블 수십 행이 그대로 통과한다.
JSON으로 안 읽히면 반복 레코드 모양을 세는 보수적 폴백을 쓴다 — 여기서는 오탐이
누락보다 낫다. 열 목록(`columns`)은 행으로 세지 않는다(넓은 테이블의 데모 세 줄이
거부되면 안 된다). 도구가 아닌 큰 목록 응답(`GetPackageContents` 등)은 실데이터가
아니므로 통과시킨다.

위반 보고는 **규칙 id·경로·정적 안내문**만 담는다. 걸린 원문은 어디에도 싣지
않는다 — 보고서 자체가 새면 안 된다.

## 전송 — 주입 가능한 이유

이 머신에서 jest가 자식 프로세스 수거에서 비결정적으로 블록된 실측 기록이
있다(`HANDOFF.md`). 그래서 코어는 `RecorderTransport`(열기·도구 호출·닫기,
셋뿐)에만 의존한다.

- `ScriptedTransport` — 가짜 전송. **단위 시험은 전부 이걸로 돈다**(프로세스 0개).
- `ChildProcessTransport` — 제품 번들을 실제로 띄우는 구현. 기동 계약은
  `interactive/server/launch.cjs`가 정본이다: `--exposition=...` **하나**를 argv로,
  접속은 `MCP_ENV_PATH`로. 주변 셸의 `SAP_*`/`MCP_*`는 걷어낸 뒤 명시한 것만 넣는다.

프레이밍은 MCP stdio 규약 그대로(줄바꿈으로 끊은 JSON-RPC)를 직접 다룬다.
클라이언트 라이브러리를 끼우지 않는 이유는 하나 — 채록기는 채록 대상 엔진이
**실제로 뱉은 것**을 그대로 남겨야 한다. 라이브러리가 스키마로 다듬은 값을 저장하면
그건 엔진이 아니라 라이브러리를 기록한 것이 된다.

실기동 확인 시험(`__tests__/child-process.live.test.ts`)은 **기본 skip**이고
`SAPKIT_RECORDER_LIVE=1`일 때만 돈다. 켜도 SAP에는 접속하지 않는다 —
inspection-only로 띄워 `tools/list`만 본다.

```powershell
$env:SAPKIT_RECORDER_LIVE=1; npx jest child-process.live --forceExit
```

`--forceExit`가 필요하다는 것 자체가 기본 skip의 근거다. 시험이 통과해도 jest는
자식 프로세스 핸들 때문에 스스로 빠져나오지 않는다.

## 쓰는 법

```ts
import { ChildProcessTransport, recordSequence, saveSequenceFixture } from './harness/recorder';

const fixture = await recordSequence(
  {
    sequenceId: 'demo-lock-modify-activate',
    description: '데모 클래스 잠금 → 수정 → 활성화',
    steps: [
      { tool: 'LockObject', args: { object_name: 'ZCL_DEMO' }, note: '잠금 핸들을 받는다' },
      { tool: 'UpdateClass', args: { object_name: 'ZCL_DEMO', source: '…' } },
      { tool: 'ActivateObjects', args: { object_name: 'ZCL_DEMO' } },
    ],
  },
  new ChildProcessTransport({ bundlePath, exposition: 'readonly,high', envPath }),
);

saveSequenceFixture(fixture, 'fixtures/demo-lock-modify-activate.json'); // 마스킹 통과분만 저장
```

`recordSequence`는 **정규화까지 끝낸** 픽스처를 돌려준다. 도구가 오류를 돌려줘도
시퀀스는 계속한다(오류 응답도 그 엔진의 계약이고 대조 대상이다). 전송 자체가
끊기면 거기서 멈추되 전송은 반드시 닫는다.

## 이 디렉터리 밖의 일

실제 녹화 실행(C1)은 SAP에 접속하는 **attended 단계**로 소유자 세션에서만 한다 —
배치·서브에이전트 무인 실행 금지. `fixtures/`에 파일이 쌓이는 것은 그때부터다.
