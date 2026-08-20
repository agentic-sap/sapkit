# scenarios/ — C1 녹화 시나리오

**무엇을 물어볼지**를 사람이 미리 적어 두는 곳이다. 녹화는 대화형 캡처가 아니라
**여기 적힌 호출 목록을 그대로 태우는 것**이므로, 시나리오가 곧 녹화의 정본이다.
태우는 대상은 제품 번들(`interactive/server/server.bundle.cjs`)이고, 판7-b(D-095)
교체 뒤 그 번들은 **신 엔진**이다.

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

- **DEV 연습 자리 안에서만.** write 단계가 가리키는 객체는 전부 **전용 DEV 연습
  패키지** 또는 **`$TMP`(로컬 오브젝트)** 소속이어야 한다. `$TMP`가 기본 권장이다 —
  이송(P4)을 통째로 피하고 `transport_request` 없이 끝나므로, 연습 자리를 여는 데
  패키지 생성·이송 권한이 필요 없다. 구 번들 선언 자신이 이 길을 명시한다
  (`old-surface/m1-tools.json` — `CreateProgram.package_name`은 "`$TMP` for local
  objects", `CreateInclude.transport_request`는 "Optional for local (`$TMP`) objects").
  **러너는 이 축을 검사하지 않는다** — 강제되는 것은 객체 이름의 Z·Y 네임스페이스뿐이다.
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
  P3는 DEV 연습 자리(전용 패키지 또는 `$TMP`) 안에서만이다.

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

**⑶ 시나리오는 **자기가 두 번 돌 것**을 전제해야 한다 — write 계열의 급소.**

C2 재생은 응답을 흉내 내는 것이 아니라 **신 엔진이 같은 질문을 SAP에 다시 던지는
일**이다(`harness/README.md`). 그래서 시나리오가 시스템 상태를 바꾸면, 그 변화가
**다음 재생의 입력**이 된다.

```text
C1 : CreateProgram ZFOO → 성공          (프로그램이 생겼다)
C2 : CreateProgram ZFOO → "이미 있다" 오류 → mismatch → fail
```

신 엔진이 옳게 동작해도 실패한다. **엔진 동등성이 아니라 시나리오의 재실행 횟수가
판정을 결정하는 것**이라, 함정 ⑵와 뿌리가 같다.

판정 기준은 "write가 있느냐"가 아니다. **시퀀스를 한 번 돌린 뒤의 시스템이, 그
시퀀스를 다시 돌렸을 때 같은 응답을 내는 상태인가**이다.

| 부류 | 도구 | 시나리오 설계 |
|---|---|---|
| **재실행 가능** | `Update*` · `CheckSyntax` · `ActivateObjects` · 읽기 전부 | 대상이 미리 존재해야 한다. 그리고 아래 "안정 상태에서 녹화" 규칙을 지켜야 한다 |
| **1회성** | `Create*` | 재생 전에 **사람이 대상 객체를 지워야** 한다. M1 19종에 `Delete*`가 없으므로 SE38·ADT로 수동 |

### 안정 상태에서 녹화하라 — 첫 실행은 전이 상태다 (2026-08-12 실측)

`Update* → ActivateObjects`는 재실행 가능해 **보이지만**, 첫 실행과 그 이후가
다를 수 있다. 클래스에서 실제로 그랬다:

```text
1회차 (갓 만든 빈 클래스에 소스 투입) : activated=true  · checked=true
2회차 (이미 활성 · 같은 소스 재투입)   : activated=false · checked=false
```

**같은 소스를 다시 쓰면 바뀐 것이 없어 활성화할 대상이 없다.** 1회차 응답을
기대값으로 굳히면 재생이 영원히 실패한다 — 신 엔진이 옳아도.

**상태 의존과 엔진 결함을 구별하는 법**: 재생이 어긋나면 **지금 상태에서 다시
녹화**해 본다(`--out`을 엔진 밖으로 돌리고 `--force` — 그 자리는 막히지 않되
「커밋 대상이 아니다」라는 알림이 뜬다). 같은 시퀀스를 연달아 두 번 돌려 응답이
서로 달라지면 그것은 엔진 차이가 아니라 상태 의존이고, 고칠 것은 시나리오다.

⚠ **교체 뒤 「구 엔진을 지금 다시 녹화해 본다」는 성립하지 않는다.** 이 스크립트가
태우는 것은 제품 번들 하드코딩이고 그것은 이제 신 엔진이며, 구 번들 파일은 레포에
없다(롤백 소스 `engine/`에서 따로 지어야 나온다 —
`harness/old-surface/capture.mjs` 머리주석). 구 엔진의 그때 값이 필요하면
**이미 채록된 픽스처**(`../fixtures/`)와 `../DIVERGENCES.md`가 유일한 잔존
형태다. 위 사례가 정확히 그랬다 — 당시 실측에서 구 엔진도 2회차에서
`activated=false`였다(2026-08-12).

**처방**: 대상을 만든 직후가 아니라 **한 번 돌려 안정된 뒤에 녹화한다.**
프로그램은 1회차와 2회차가 같아 이 문제가 없었다 — 객체 종류마다 다르므로
**재생 2회 연속 같은 판정**을 확인하기 전에는 픽스처를 믿지 마라.

**부수 효과(의도적)**: 클래스 픽스처는 이제 활성화의 **no-op 경로**를 담고,
프로그램 픽스처가 **실제 활성화 경로**(`activated=true`)를 담는다. 둘이 합쳐
`ActivateObjects`의 두 갈래를 덮는다.

그래서 **create와 update를 한 시나리오에 묶지 마라.** 묶으면 그 시퀀스 전체가
1회성이 되고, 재실행 가능했을 단계까지 수동 삭제에 인질로 잡힌다. 갈라 두면
update 쪽은 몇 번이든 자유롭게 재생할 수 있다.

`description`에 **전제와 재실행 성격을 반드시 적는다.** 그 문장은 픽스처에
그대로 실려 증거의 일부가 된다 — 나중에 누가 재생 실패를 보고 "신 엔진이
틀렸나"를 묻기 전에 읽을 자리다.

## M1 19종을 덮으려면

| 도구 | 주의 |
|---|---|
| `SearchObject` `CheckSyntax` | 자유 |
| `GetClass` `GetProgram` `GetInclude` `GetFunctionModule` `GetTable` `GetStructure` `GrepObjects` `GetSourceDiff` | **Z·Y 객체만** — 소스를 돌려준다 (함정 ⑴) |
| `GetInactiveObjects` | **가변 상태** — 자기가 만든 객체 맥락에서만 (함정 ⑵) |
| `UpdateProgram` `UpdateInclude` `UpdateClass` `UpdateSourceByPatch` `ActivateObjects` | **Z·Y 객체만** · P3 · 연습 자리(`$TMP` 권장) 안에서만 (함정 ⑴) · 대상이 미리 있어야 한다 (함정 ⑶) |
| `CreateProgram` `CreateInclude` | 위와 같고 **1회성** — 재생 전 수동 삭제 (함정 ⑶) |
| `GetSqlQuery` | P2 · 데모 테이블만 · 재생도 한 건씩 |

어느 도구가 아직 증거가 없는지는 재생 러너의 커버리지 표
(`node harness/replay-attended.mjs …`)가 `toolsWithoutEvidence` 절에 따로 적는다.
그 목록이 비는 것이 C2의 목표다.

## 지금 있는 것

| 시나리오 | 정책 | 재실행 | 쓰임 |
|---|---|---|---|
| `example-read-only` | P1 | 자유 | 배관 확인 — 접속·기동·정규화·마스킹이 실제로 도는지. SAP 무변경 · 소스 미채록 · 가변 상태 미채록 |
| `zsapkit-m1-program-create` | P3 | **1회성** | `$TMP`에 `ZSAPKIT_M1_DEMO` 생성 → 되읽기. 픽스처는 `fixtures/attended-only/`에 있고 기본 재생에서 빠진다 |
| `zsapkit-m1-program-update-activate` | P3 | 자유 | 같은 프로그램에 소스 갱신 → 문법검사 → 활성화 → 되읽기. **위 시나리오가 먼저 돌아야 한다** |
| `zsapkit-m1-class-update-activate` | P3 | 자유 | `ZCL_SAPKIT_M1_DEMO`에 클래스 전문 갱신 → 문법검사 → 활성화 → 되읽기. **안정 상태에서 재녹화된 판**(위 규칙) |
| `zsapkit-m1-include-create` | P3 | **1회성** | `$TMP`에 `ZSAPKIT_M1_INC01` 생성 → 숙주 `ZSAPKIT_M1_INCMAIN`에 삽입 → 되읽기. 픽스처는 `fixtures/attended-only/` |
| `zsapkit-m1-include-update-activate` | P3 | 자유 | 그 인클루드에 소스 갱신 → 활성화 → 되읽기. `main_program`을 넘겨 프로그램 전체 문법검사를 태운다 |
| `zsapkit-m1-ddic-read` | P1 | 자유 | 이 판이 세운 DDIC·함수 자산 읽기 — 테이블·구조·함수모듈 + 두 객체를 가로지르는 소스 검색 |
| `zsapkit-m1-patch-activate` | P3 | 자유 | `ZSAPKIT_M1_DEMO`에 외과적 치환 → 활성화 → 되읽기. **`old_string`과 `new_string`이 같은 글자**다(아래) |
| `zsapkit-m1-inactive-list` | P1 | 자유 | 비활성 객체 목록 한 번 읽기. 시스템 전역 상태에 기댄다(아래) |
| `zsapkit-m1-sql-empty` | **P2** | 자유 | **빈** 연습 테이블에서 두 필드 SELECT(상한 100 · 0행). 재생은 **`--fixture` 단건으로만** — 배치 거부가 정상 동작이다 |

**M1 19종의 증거가 이로써 전부 섰다**(2026-08-18 · KR-DEV · 판6.1). 재생 대조는
`Create*` 둘을 뺀 전건 pass이고, `Create*`는 재생으로 증거를 얻을 수 없어
**`attended` 급으로 닫힌다**(이유는 `fixtures/README.md`). `GetSourceDiff`는 요구
급이 `계약 시험`이라 재생 대상이 아니다 — **M1 19종이 전부 「증거 있음」이라는 것과
19종이 전부 실 SAP을 밟았다는 것은 같은 말이 아니다.**

### 이 묶음이 남긴 설계 메모 셋 (다음 사람이 되밟지 않도록)

- **치환 시나리오는 같은 글자로 친다.** `UpdateSourceByPatch`는 한 번 돌면
  `old_string`이 사라져 두 번째 실행이 대상을 못 찾는다 — 함정 ⑶의 가장 날카로운
  형태다. 그래서 `zsapkit-m1-patch-activate`는 두 인자를 같은 글자로 두어 소스가
  달라지지 않게 했다. 구 엔진으로 두 번 연속 돌려 응답이 같음을 먼저 실측한 뒤
  녹화했다. 대가: 이 픽스처는 **치환 경로가 구·신에서 같게 돈다**를 증명하지,
  **치환이 소스를 실제로 바꾸는 갈래**를 증명하지 않는다.
- **인클루드의 숙주는 따로 세운다.** `ZSAPKIT_M1_DEMO`에 INCLUDE 문을 끼우면
  `zsapkit-m1-program-update-activate`가 그 프로그램 소스를 통째로 다시 쓸 때마다
  인클루드의 집이 사라진다. 그래서 숙주를 `ZSAPKIT_M1_INCMAIN`으로 갈랐다.
- **`GetInactiveObjects`는 인자가 없다.** 「내가 만든 객체만」으로 좁힐 방법이 구
  선언에 존재하지 않으므로, 시나리오를 읽기 전용으로 두어 **자기가 목록을 흔들지
  않는 것**까지가 할 수 있는 전부다. 이 판 밖의 누군가가 무언가를 비활성으로
  남기거나 활성화하면 그 재생은 깨진다 — 어긋나면 신 엔진이 아니라 그 상태를 먼저
  의심하라.

`ZCL_SAPKIT_M1_DEMO`의 셋업(빈 클래스 생성)은 구 번들의 `CreateClass`로 했고
**픽스처를 레포에 두지 않았다** — `CreateClass`는 M1 19종 밖이라 증거가 아니라
준비 작업이기 때문이다. 판6.1이 세운 `ZSAPKIT_M1_TAB`·`ZSAPKIT_M1_STR`·
`ZSAPKIT_M1_FG`/`Z_SAPKIT_M1_FM`·`ZSAPKIT_M1_INCMAIN`도 같은 이유로 **제품 MCP로**
만들었고 그 생성은 채록하지 않았다.
