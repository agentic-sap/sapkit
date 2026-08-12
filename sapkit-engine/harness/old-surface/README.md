# old-surface/ — 구 엔진이 실제로 발행하는 도구 계약 (오프라인 채록)

`m1-tools.json`은 **구 번들이 `tools/list`로 내보내는 선언 그대로**다. M1 19종의
이름·설명·`inputSchema`(JSON Schema)·`execution` 필드가 들어 있다. 신 엔진이 맞춰야
할 **표면 계약의 기계 판독 정본**이며, 자체 게이트가 이것에 대해 대조한다.

## 왜 이게 가능한가 (SAP 접속 없이)

`tools/list`는 **등록된 선언을 돌려줄 뿐** 실제 접속을 요구하지 않는다. 그래서
가짜 프로파일(존재하지 않는 호스트)만 물려도 전체 표면을 채록할 수 있다. 이
채록은 attended 단계가 아니다 — SAP에 한 바이트도 나가지 않는다.

## 재현

```
node sapkit-engine/harness/old-surface/capture.mjs
```
`capture.mjs`는 가짜 `sap.env`를 **실행 시점에 임시 디렉터리로 직접 써서**
`MCP_ENV_PATH`로 물리고, 구 번들을 자식 프로세스로 띄워 `initialize` →
`tools/list`를 한 번 주고받는다. 가짜 프로파일에는
`SAP_URL=https://sap.example.test:44300`처럼 **명백히 존재하지 않는 값**만 쓴다.

> **왜 파일로 커밋하지 않는가.** `*.env`는 무시 규칙에 걸려 신선한 체크아웃에
> 존재하지 않는다. 그러면 이 스크립트가 **조용히 무프로파일 채록으로 강등**된다
> — 연결 시에만 뜨는 31종이 통째로 빠진 채 정상 종료한다. 그래서 자족화했고,
> 그 위에 **강등 감지**를 뒀다: M1 도구가 하나라도 빠지거나 프로파일 유무로
> 표면이 갈리지 않으면 **기존 채록본을 덮어쓰지 않고 exit 1**로 끝난다.

> **PowerShell로 실행할 것.** 이 채록은 자식 프로세스를 띄운다 — jest 안에서는
> 이 머신의 수거 함정에 걸린다(그래서 채록기의 실기동 시험도 기본 skip이다).

## 채록에서 드러난 사실 (설계에 반영됨)

1. **노출 이름 집합은 프로파일에 딸려 움직인다.**

   | 조건 | `readonly,high` | `readonly` |
   |---|---|---|
   | 프로파일 없음 (배포 축 기본 `cloud`) | **155** | **65** |
   | 프로파일 `SAP_SYSTEM_TYPE=onprem` | **186** | **74** |

   `interactive/provenance/mcp-surface.json`의 155/65는 **프로파일 미설정** 실측
   이고(그 파일의 `_measured`가 그렇게 적고 있다), spec §2.1이 말하는 "연결 186"은
   **onprem 프로파일이 물렸을 때**의 수다. 두 수는 모순이 아니라 조건이 다르다.

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
   이름·설명·`inputSchema` 말고도 이 필드가 표면 계약의 일부다. 신 엔진이 같은
   SDK를 쓰므로 자동으로 따라오는지, 아니면 명시해야 하는지는 게이트가 대조한다.

## 이 파일을 손으로 고치지 마라

구 엔진의 실측 기록이다. 구 번들이 바뀌면 `capture.mjs`를 다시 돌려 갱신하고,
**무엇이 왜 바뀌었는지 커밋 메시지에 남긴다.**
