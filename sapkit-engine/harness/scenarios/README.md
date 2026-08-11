# scenarios/ — C1 녹화 시나리오

**무엇을 구 엔진에 물어볼지**를 사람이 미리 적어 두는 곳이다. 녹화는 대화형
캡처가 아니라 **여기 적힌 호출 목록을 그대로 태우는 것**이므로, 시나리오가
곧 녹화의 정본이다.

```powershell
node harness/record-attended.mjs --scenario=example-read-only --dry-run   # 형식만 검사 (SAP 불필요)
node harness/record-attended.mjs --scenario=example-read-only --env-path=<sap.env>
```

## 형식

```jsonc
{
  "sequenceId": "zdemo-program-create-activate",   // ^[a-z0-9][a-z0-9-]*$ — 픽스처 파일 이름이 된다
  "description": "연습 패키지에 프로그램 생성 → 수정 → 문법검사 → 활성화",
  "steps": [
    { "tool": "CreateProgram", "args": { "…": "…" }, "note": "왜 이 단계가 있는지" }
  ]
}
```

`args`는 그 도구의 `inputSchema` 그대로다. 실측 정본은
`harness/old-surface/m1-tools.json`(구 번들이 발행한 선언 그대로) — 인자 이름을
추측하지 말고 거기서 확인해라.

## 앞 단계 응답을 뒤 단계 인자에 넣는 자리는 **없다**

M1 19종 중 앞 단계의 응답값을 인자로 요구하는 도구는 없다. 잠금 핸들은 도구
**안에서** 잡고 쓰고 푼다(`src/tools/write/shared.ts`) — 인자로 나오지 않는다.
그래서 시나리오는 전부 정적으로 적힌다. 응답 안에 나타나는 잠금 핸들·세션
토큰은 채록기의 정규화기가 자리표시자로 바꾼다.

## 왜 낱개가 아니라 시퀀스인가

쓰기 흐름은 호출 **순서**와 그 사이의 상태 전달이 의미를 갖는다. 낱개로 쪼개면
정규화가 호출마다 독립 수행돼 "같은 원본 토큰 → 같은 자리표시자"가 성립하지
않는다. 하나의 업무 흐름은 하나의 시나리오로 묶어라.

## 지켜야 할 것 (spec §2.6 — 협상 불가)

- **전용 DEV 연습 패키지 안에서만.** write 단계가 가리키는 객체는 전부 그 패키지 소속이어야 한다.
- **실데이터 2종(`GetSqlQuery`)은 데모 테이블만.** 실테이블을 가리키면 마스킹 검사가 저장을 거부한다.
- **소유자 attended 세션에서만.** 배치·서브에이전트 무인 실행 금지.
- 픽스처는 git에 커밋된다. 자격증명·호스트·접속정보·실데이터가 하나라도 있으면
  `saveSequenceFixture`가 **저장 자체를 거부**한다 — 경고 후 저장 같은 중간
  지대는 없다.

## 두 가지 함정 (러너가 막아 주지만 이유를 알고 쓰는 게 낫다)

**⑴ 대상은 고객 객체(Z·Y)여야 한다 — 15종.**

두 부류가 같은 제약을 진다.

- **소스를 돌려주는 8종** `GetClass` `GetProgram` `GetInclude`
  `GetFunctionModule` `GetTable` `GetStructure` `GrepObjects` `GetSourceDiff` —
  마스킹 검사기는 자격증명·호스트·실데이터를 보지만 **제3자 소스코드는 보지
  않으므로**, 표준 객체를 가리키면 이 레포가 재배포권을 갖지 않은 자산이 공개
  레포에 박힌다.
- **SAP을 바꾸는 7종** `CreateProgram` `CreateInclude` `UpdateProgram`
  `UpdateInclude` `UpdateClass` `UpdateSourceByPatch` `ActivateObjects` —
  P3는 전용 DEV 연습 패키지 안에서만이다(spec §2.6).

`record-attended.mjs`가 **태우기 전에** 거부한다 — 사후에 걸러 봐야 write는
이미 일어난 뒤다. (`--allow-standard-source`로 풀 수 있으나 그 픽스처는 커밋하지
말 것.)

**⑵ 시스템의 가변 상태를 기대값으로 굳히지 마라.**

픽스처는 응답을 **원문 그대로** 기대값으로 삼는다(정규화 대상은 잠금 핸들·
세션/CSRF 토큰·타임스탬프·UUID·hex뿐이다). 그래서 "지금 그 시스템이 어떤
상태인가"에 따라 달라지는 응답을 담으면, 재생 판정이 **엔진 동등성이 아니라
그 사이 누가 무슨 작업을 했는지**로 결정된다.

대표적으로 `GetInactiveObjects`가 그렇다 — 비활성 객체 목록은 누가 무엇을
활성화했는지에 따라 바뀌고, **write 시나리오 자신이 그 목록을 바꾼다.**
`ListTransports`·`GetTransport` 계열도 같은 성질이다. 이런 도구는 시나리오
안에서 **자기가 방금 만든 객체**를 겨눌 때만 안정적이다.

## M1 19종을 덮으려면

| 도구 | 주의 |
|---|---|
| `SearchObject` `CheckSyntax` | 자유 |
| `GetClass` `GetProgram` `GetInclude` `GetFunctionModule` `GetTable` `GetStructure` `GrepObjects` `GetSourceDiff` | **Z·Y 객체만** — 소스를 돌려준다 (함정 ⑴) |
| `GetInactiveObjects` | **가변 상태** — 자기가 만든 객체 맥락에서만 (함정 ⑵) |
| `CreateProgram` `CreateInclude` `UpdateProgram` `UpdateInclude` `UpdateClass` `UpdateSourceByPatch` `ActivateObjects` | **Z·Y 객체만** · P3 · 연습 패키지 안에서만 (함정 ⑴) |
| `GetSqlQuery` | P2 · 데모 테이블만 · 재생도 한 건씩 |

어느 도구가 아직 증거가 없는지는 재생 러너의 커버리지 표
(`node harness/replay-attended.mjs …`)가 `toolsWithoutEvidence` 절에 따로 적는다.
그 목록이 비는 것이 C2의 목표다.

## 지금 있는 것

| 시나리오 | 정책 | 쓰임 |
|---|---|---|
| `example-read-only` | P1 | 배관 확인 — 접속·기동·정규화·마스킹이 실제로 도는지. SAP 무변경 · 소스 미채록 · 가변 상태 미채록 |

나머지는 연습 패키지가 정해진 뒤 C1에서 채운다.
