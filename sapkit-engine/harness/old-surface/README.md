# old-surface/ — 구 엔진이 실제로 발행하는 도구 계약 (오프라인 채록)

`m1-tools.json`은 **구 번들이 `tools/list`로 내보내는 선언 그대로**다. 신 엔진이
맞춰야 할 **표면 계약의 기계 판독 정본**이며, 자체 게이트가 이것에 대해 대조한다.

담는 것은 두 가지다:

| 키 | 내용 |
|---|---|
| `tools` | **186종 전량의 발행 선언** — 이름·설명·`inputSchema`(JSON Schema)·`execution` |
| `exposures` | **4개 노출 조건 각각의 이름 집합** — 조건·프로파일·수·이름 목록 |
| `counts` | 위 네 조건의 수만 추린 것 (옛 키, 한눈에 보라고 남긴다) |
| `connectedOnly` | 연결 시에만 뜨는 31종 = `connected_default` − `noProfile_default` |
| `m1` | 전량 중 M1 19종만 추린 것 — **소비자 호환용**이며 `tools`의 해당 항목과 글자 그대로 같다 |
| `m1Missing` | M1인데 표면에 없는 것. 정상이면 빈 배열 |

## 파일명이 내용보다 좁다 — 그래도 안 바꾼다

이름은 `m1-tools.json`인데 담는 것은 M1 19종이 아니라 186종 전량이다. 어긋난 줄
알면서 두는 이유는 **이 경로를 직접 지목하는 곳이 이미 여럿**이기 때문이다:

- `.github/workflows/offline-gates.yml` — 표류 확인이
  `git diff --exit-code -- harness/old-surface/m1-tools.json`으로 본다
- `gates/surface.mjs`(`CAPTURED_PATH`) · `gates/test-gates.mjs`(음성시험 사본)
- `harness/replay/coverage.ts`(`loadM1ToolNames`) · `harness/replay-attended.mjs`(`CATALOG`)
- 계약 시험 넷 — `src/tools/read/__tests__/support.ts` ·
  `src/tools/rfc-read/__tests__/contract.test.ts` ·
  `src/tools/row-data/__tests__/getSqlQuery.test.ts` ·
  `src/tools/write/__tests__/contract.test.ts`

이름을 바꾸면 이들이 **조용히 헛돈다.** 특히 CI가 그렇다 — 채록기가 새 이름으로
쓰고 나면 옛 경로의 파일은 그대로 남아 `git diff`가 아무 차이도 못 보고 초록으로
지나간다. 표류 확인이 죽었다는 사실조차 드러나지 않는다. 그래서 **이름은 고정**
이고, 어긋남은 이 문서와 `capture.mjs` 머리주석, 산출물 첫 키(`_`)로 처리한다.

## 왜 이게 가능한가 (SAP 접속 없이)

`tools/list`는 **등록된 선언을 돌려줄 뿐** 실제 접속을 요구하지 않는다. 그래서
가짜 프로파일(존재하지 않는 호스트)만 물려도 전체 표면을 채록할 수 있다. 이
채록은 attended 단계가 아니다 — SAP에 한 바이트도 나가지 않는다.

## 재현

```
node sapkit-engine/harness/old-surface/capture.mjs
```
`capture.mjs`는 가짜 `sap.env`를 **실행 시점에 임시 디렉터리로 직접 써서**
`MCP_ENV_PATH`로 물리고, 구 번들을 자식 프로세스로 **네 번**(노출 조건별로 한 번씩)
띄워 `initialize` → `tools/list`를 주고받는다. 가짜 프로파일에는
`SAP_URL=https://sap.example.test:44300`처럼 **명백히 존재하지 않는 값**만 쓴다.

> **왜 파일로 커밋하지 않는가.** `*.env`는 무시 규칙에 걸려 신선한 체크아웃에
> 존재하지 않는다. 그러면 이 스크립트가 **조용히 무프로파일 채록으로 강등**된다
> — 연결 시에만 뜨는 31종이 통째로 빠진 채 정상 종료한다. 그래서 자족화했다.

> **PowerShell로 실행할 것.** 이 채록은 자식 프로세스를 띄운다 — jest 안에서는
> 이 머신의 수거 함정에 걸린다. 그래서 `__tests__/capture-shape.test.ts`는
> 채록기를 돌리지 않고 **커밋된 산출물만 읽어** 검사한다.

## 강등 감지 — 반쪽 채록이면 덮어쓰지 않는다

채록이 반쪽이면 `capture.mjs`는 **기존 채록본을 건드리지 않고 `exit 1`**로 끝난다.
조용히 줄어든 채록본을 커밋하면 신 엔진이 맞추는 기준 자체가 틀어지기 때문이다.
막는 것은 여섯 가지다:

1. 4개 조건 중 하나라도 **기대 수**(186 / 155 / 74 / 65)와 다르다
2. M1 19종 중 하나라도 표면에 없다
3. 프로파일 유무로 표면이 갈리지 않는다(`connectedOnly`가 0종)
4. 좁은 조건에만 있고 가장 넓은 조건에는 없는 이름이 있다 — 그러면 `tools`가 전량이 아니다
5. 선언이 네 필드(`name`·`description`·`inputSchema`·`execution`)를 못 갖췄다
6. 응답에 `tools` 배열이 아예 없다(기동 실패·프로토콜 오류)

기대 수는 `capture.mjs`의 `RUNS`에 못 박혀 있다. 구 번들이 **의도적으로** 바뀌어
수가 달라졌다면 그 상수를 사람이 고치고, 무엇이 왜 바뀌었는지 커밋 메시지에
남긴다 — 자동으로 따라가지 않는다.

같은 기준을 `npm test`에서 한 번 더 건다(`__tests__/capture-shape.test.ts`).
강등 감지는 **채록을 새로 뜰 때만** 돌기 때문에, 이미 커밋된 파일이 반쪽으로
줄어들어 들어오는 경로(손으로 고치기·잘못된 병합·옛 판 되살리기)는 그것만으로
막히지 않는다.

## 채록에서 드러난 사실 (설계에 반영됨)

1. **노출 이름 집합은 프로파일에 딸려 움직인다.**

   | 조건 | `readonly,high` | `readonly` |
   |---|---|---|
   | 프로파일 없음 (배포 축 기본 `cloud`) | **155** | **65** |
   | 프로파일 `SAP_SYSTEM_TYPE=onprem` | **186** | **74** |

   `interactive/provenance/mcp-surface.json`의 155/65는 **프로파일 미설정** 실측
   이고(그 파일의 `_measured`가 그렇게 적고 있다), spec §2.1이 말하는 "연결 186"은
   **onprem 프로파일이 물렸을 때**의 수다. 두 수는 모순이 아니라 조건이 다르다.

   네 칸 모두 이제 **수만이 아니라 이름 집합**으로 남는다. 수만 있을 때는 새 도구
   하나가 어느 칸에 들어가야 하는지를 기계가 판정할 수 없었다 — 「전 M 공통 완료
   요건 4(노출 제어 회귀 0)」가 사람 눈에 기대던 지점이 거기였다.

2. **`SAP_SYSTEM_TYPE`을 서버 프로세스 env로 주면 먹지 않는다.** 기동 시
   프로파일 적용이 이 키를 `process.env`에서 지우고 프로파일 파일의 값만 채우기
   때문이다(`interactive/scripts/conformance-server-gates.mjs`의 GAP-2와 같은
   기제, 키 목록은 `engine/src/lib/profile.ts:108`). 채록 1차에서 process env로
   `onprem`을 줬을 때 155가 그대로 나온 것이 그 실측이다. **그래서 신 엔진의
   프로파일 계층도 이 키를 `sap.env`에서만 읽는다** — 우연이 아니라 승계다.

3. **M1 19종은 전부 186 표면 안에 있다.** 그중 5종(`GetProgram`·`CreateProgram`·
   `CreateInclude`·`UpdateProgram`·`UpdateInclude`)은 `available_in`이 `onprem`
   (일부는 `legacy` 포함)이라 cloud 축에서는 보이지 않는다 — spec이 "연결 시 동적
   노출 31종"이라 부른 것의 정체다.

4. **발행되는 도구 객체에는 `execution: { taskSupport: 'forbidden' }`이 붙는다.**
   이름·설명·`inputSchema` 말고도 이 필드가 표면 계약의 일부다. 186종 **전부**가
   이 네 필드를 갖추고 있다(채록기가 매번 확인한다). 신 엔진이 같은 SDK를 쓰므로
   자동으로 따라오는지, 아니면 명시해야 하는지는 게이트가 대조한다.

## 이 파일을 손으로 고치지 마라

구 엔진의 실측 기록이다. 구 번들이 바뀌면 `capture.mjs`를 다시 돌려 갱신하고,
**무엇이 왜 바뀌었는지 커밋 메시지에 남긴다.**
