# recorder/ — 구 엔진 채록기

구 번들(`interactive/server/server.bundle.cjs`)을 자식 프로세스로 띄워 MCP 요청/
응답 **시퀀스**를 채록하고, 정규화·마스킹을 통과한 것만 픽스처로 저장한다.
구 번들은 **실행만** 하고 수정하지 않는다.

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
  "recordedAt": "<<TIMESTAMP_4>>", // 채록 시각 — 정규화 대상이므로 자리표시자다
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
| `NormalizationKind` | `lock-handle` `csrf-token` `session-id` `timestamp` `server-id` `uri` |

`recordedAt`이 자리표시자인 이유: 실제 시각을 남기면 같은 시퀀스를 다시 채록할
때마다 파일이 흔들려 대조가 흐려진다. 실제 채록 시각의 정본은 git 커밋 이력이다.

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

순회 순서가 곧 번호 순서다 — **단계를 먼저**(0번부터, 인자 → 응답) 훑고
마지막에 `recordedAt`을 훑는다. 메타데이터가 `<<TIMESTAMP_1>>`을 먼저 가져가면
단계 안의 번호가 메타데이터에 딸려 흔들리기 때문이다. 이미 정규화된 픽스처를
다시 정규화해도 결과는 같다(멱등).

## 마스킹 — 경고가 아니라 거부

픽스처는 git에 커밋된다. 그래서 `saveSequenceFixture`는 쓰기 **직전**에
`assertMasked`를 돌리고, 위반이 하나라도 있으면 `MaskingRejection`을 던지며
**파일에 손대지 않는다**. 중간 지대(경고 후 저장)는 두지 않는다.

| 규칙 id | 잡는 것 |
|---|---|
| `basic-auth` | `Basic <base64>` 헤더, `authorization` 키 |
| `base64-credential` | `사용자:비밀번호`로 복호되는 base64 (접두어 없어도) |
| `password-like` | 비밀번호·시크릿·API 키 키/env 값, URL userinfo |
| `real-host` | 실제 호스트명·IP·포트·접속 URL·접속정보 키 |
| `cookie` | 쿠키 헤더, `SAP_SESSIONID_*`·`MYSAPSSO2`·`sap-usercontext` |
| `jwt` | JWT 형태 토큰 |
| `bulk-row-data` | 실데이터 행처럼 보이는 대량 결과 |

허용하는 호스트는 **명백한 가짜**(`*.example` `*.test` `*.invalid` `*.localhost`
`example.com|net|org`, 루프백)와 **접속처가 아닌 것이 확실한 것**(XML 네임스페이스
호스트 `www.w3.org`·`www.sap.com` 등)뿐이다. 판 번호 오탐 같은 것은
`MaskingOptions.allowedHosts`로 건별로 푼다 — 규칙을 넓히지 않는다.

`bulk-row-data`는 두 갈래다. ⓐ **도구 기준** — `GetTableContents`·`GetSqlQuery`의
응답에서 원소 `maxRows`(기본 20)를 넘는 배열. ⓑ **형태 기준** — 도구와 무관하게
반복 `<row>`/`<item>` 태그나 구분자 행이 `maxRows`를 넘을 때. 도구가 아닌 큰
목록 응답(`GetPackageContents` 등)은 실데이터가 아니므로 통과시킨다.

위반 보고는 **규칙 id·경로·정적 안내문**만 담는다. 걸린 원문은 어디에도 싣지
않는다 — 보고서 자체가 새면 안 된다.

## 전송 — 주입 가능한 이유

이 머신에서 jest가 자식 프로세스 수거에서 비결정적으로 블록된 실측 기록이
있다(`HANDOFF.md`). 그래서 코어는 `RecorderTransport`(열기·도구 호출·닫기,
셋뿐)에만 의존한다.

- `ScriptedTransport` — 가짜 전송. **단위 시험은 전부 이걸로 돈다**(프로세스 0개).
- `ChildProcessTransport` — 구 번들을 실제로 띄우는 구현. 기동 계약은
  `interactive/server/launch.cjs`가 정본이다: `--exposition=...` **하나**를 argv로,
  접속은 `MCP_ENV_PATH`로. 주변 셸의 `SAP_*`/`MCP_*`는 걷어낸 뒤 명시한 것만 넣는다.

프레이밍은 MCP stdio 규약 그대로(줄바꿈으로 끊은 JSON-RPC)를 직접 다룬다.
클라이언트 라이브러리를 끼우지 않는 이유는 하나 — 채록기는 구 엔진이 **실제로
뱉은 것**을 그대로 남겨야 한다. 라이브러리가 스키마로 다듬은 값을 저장하면
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
시퀀스는 계속한다(오류 응답도 구 엔진의 계약이고 대조 대상이다). 전송 자체가
끊기면 거기서 멈추되 전송은 반드시 닫는다.

## 이 디렉터리 밖의 일

실제 녹화 실행(C1)은 SAP에 접속하는 **attended 단계**로 소유자 세션에서만 한다 —
배치·서브에이전트 무인 실행 금지. `fixtures/`에 파일이 쌓이는 것은 그때부터다.
