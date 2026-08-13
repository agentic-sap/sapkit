# SAPKIT 재구성 청사진

> **이 문서의 지위** — "무엇을 어디까지 자작으로 바꾸는가"의 **계획 정본**이다.
> 설계 정본(`docs/DESIGN.md` = 트랙 A, [`interactive/DESIGN.md`](../interactive/DESIGN.md) = 트랙 B)이
> *지금 무엇인가*를 기술한다면, 이 문서는 *무엇이 될 것인가*와 *어떤 순서로 가는가*를 기술한다.
>
> **이 판에서는 등재만 한다.** 아래 사다리 ⑴~⑷의 제작 행위(엔진 자작, 검사기 재작성,
> 지식 재저작·템플릿 재생성, 릴리스 자산 재발행)는 이 판의 범위 밖이며, 각 단계 착수는
> 별도의 실수요 트리거와 결정 기록을 요구한다.
>
> 결정의 '왜'는 [`docs/reference/DECISIONS.md`](reference/DECISIONS.md)가 정본이다 — 이 문서는
> 결정을 만들지 않고 방향을 그린다. 사다리 각 단계의 착수·완료는 그때 새 D-항목으로 기록한다.

---

## 1. 끝그림 — 포크 0

### 1.1 도달 상태

| # | 조건 | 지금 (2026-08-09) | 끝그림 |
|---|---|---|---|
| ① | **몸통은 전부 자작** | 엔진·검사기·지식 상당량이 차용 포크 | 제품을 이루는 부품이 전부 소유자 저작 |
| ② | **외부는 정식 의존성만** | 상류 코드를 레포에 품고 개작 | 외부 코드는 패키지 매니저로 당겨 쓰는 의존성 형태로만 존재 |
| ③ | **계보성 고지 은퇴** | 잔존 고지 3건(`engine/`·`vsp/`·`interactive/`) | 대체가 끝난 부품의 고지부터 차례로 은퇴, 최종 0건 |
| ④ | **브랜드 단일** | 플러그인만 `sapkit`, 부품은 상류 이름 잔존 | 아래 1.2 |
| ⑤ | **가볍지만 강력하게** | — | 무게의 척도는 **세션 토큰·설치 부담**이지 레포 바이트가 아니다 (D-040) |

②의 뜻: "포크 0"은 남의 코드를 안 쓴다는 뜻이 아니라, **남의 코드를 우리 레포 안에서
개작·유지보수하지 않는다**는 뜻이다. 정식 의존성은 버전으로 당겨 쓰고, 우리는 그 위에
우리 코드만 얹는다. 지금의 `engine/`·`vsp/`는 그 반대 형태(레포 내 개작 소스)이며,
그래서 유지보수 부채와 고지 의무를 동시에 지고 있다.

### 1.2 브랜드 단일화 — SAPKIT

| 부품 | 이름 | 비고 |
|---|---|---|
| 제품 플러그인 | **sapkit** | 이미 개명 완료 (D-041) |
| 검사기 CLI 명령 | **`sapkit`** | 현재 `vsp` — 재작성 시 개명 |
| 새 엔진 | **SAPKIT Engine** / 패키지 **`sapkit-engine`** | 현재 `abap-mcp-adt-powerup` 포크 번들 |

**SAP 시스템 측은 예외**: 이미 SAP에 생성된 `ZRSC4SAP_*` 오브젝트는 **무접촉**이다.
SAP 오브젝트는 개명이 불가하므로 옛 이름이 그대로 남는다. 개명 대상은 레포가 배포하는
**템플릿 원본**뿐이며, 그것도 사다리 ⑶의 재생성 시점에 새 이름으로 새로 만든다
(기존 오브젝트를 고치거나 지우지 않는다).

### 1.3 계보성 고지 원장

루트 [`LICENSE`](../LICENSE)는 MIT(소유자 명의)이고, 그 아래 상류 고지 3건을 승계 보존 중이다.
**각 고지는 해당 부품의 차용분이 소진된 시점에 은퇴한다** — 은퇴는 사다리 단계의 완료 판정과
같은 사건이다.

| 고지 | 대상 서브트리 | 은퇴 조건 | 대응 사다리 |
|---|---|---|---|
| [`engine/LICENSE`](../engine/LICENSE) | `engine/` + `interactive/server/` 번들 | SAPKIT Engine이 번들 자리를 대체하고 `engine/` 소스가 레포를 떠날 때 | ⑴ |
| [`vsp/LICENSE`](../vsp/LICENSE) | `vsp/` | `sapkit` 검사기가 검증 용도를 대체하고 `vsp/` 소스가 레포를 떠날 때 | ⑵ |
| [`interactive/LICENSE`](../interactive/LICENSE) | `interactive/core/**` 차용 지식 | 차용분(지식·페르소나·절차·템플릿)이 전부 자체 집필로 치환될 때 | ⑶·⑷ |

컴포넌트 단위 귀속은 [`interactive/THIRD_PARTY_NOTICES.md`](../interactive/THIRD_PARTY_NOTICES.md)가
정본이며, 고지 은퇴는 그 문서의 갱신을 동반한다.

---

## 2. 교체 사다리

### 2.1 순서와 그 이유

```
⑴ SAPKIT Engine 슬림 자작      ← 먼저: 부채가 가장 크고(348 handler 소스·8.3MB 번들),
   │                              실사가 판단 재료를 이미 갖춰 놓았다
   ▼
⑵ 검사기 재작성 (sapkit CLI)   ← 다음: 용도가 좁고(로컬 구문·정합 검사) 경계가 뚜렷
   │
   ▼
⑶ 지식 재저작                   ← 가장 김: 집필 노동이 실사용 검증 속도에 묶인다
   │                              (⑴·⑵와 병행 가능 — 코드 부품과 독립)
   ▼
⑷ interactive/ 상류 고지 은퇴   ← 마지막: ⑶의 차용분이 소진돼야 성립
```

⑴이 먼저인 이유는 규모가 아니라 **판단 재료가 이미 있다**는 것이다 — §4의 도구 실사가
표면 정본 186종과 **제작 우선순위**의 재료(자산 참조 · 실사용 분포)를 이미 확정했다.
⑶은 코드 부품과 독립이므로 ⑴·⑵와 시간상 병행할 수 있고, 순서상 뒤에 두는 것은 완료가
가장 늦기 때문이다.

---

### ⑴ SAPKIT Engine 슬림 자작

**대상**: 현재 `interactive/server/server.bundle.cjs`(8.3MB, 소스 정본 `engine/` — TS 559파일,
handler 348파일)가 제공하는 SAP ADT MCP 도구 표면.

**승계 범위 — 도구 186종 전량** (2026-08-10 착수 시 확정, D-079): 실측 표면 **186종을 전부**
승계한다. 이름·인자·응답 형태를 그대로 두고 **개명하지 않는다**. 전송 3종(stdio/HTTP/SSE)과
RFC 백엔드 5경로(`odata`·`soap`·`native`·`gateway`·`zrfc`)도 전부 재제작하며, **수요순은
제작 순서에만 적용되고 범위에는 적용되지 않는다** — §4의 실질 참조 110종과 §4.7의 실사용
116종은 *무엇을 먼저 만드는가*의 재료이지 *무엇을 만드는가*의 경계가 아니다.

> **다이어트의 대상은 구조와 소유권이지 도구 표면이 아니다.** 이 절 제목의 "슬림"은 348
> handler·8.3MB 번들의 **구조**를 가리키며, 사용자가 쓰던 기능을 줄인다는 뜻이 아니다.
> 초기 안(시작 후보군 110종대로 좁혀 시작)은 기각됐고, **제작자 권고보다 넓은 범위를
> 사용자가 명시적으로 골랐다**(D-079 ②). D-071 ⑤의 "도구 수 목표치를 사전에 못박지
> 않는다"는 *실사가 수를 정한다*는 뜻이었고, 실사가 끝난 지금 그 수는 **186**이다. 같은
> 오브젝트의 `Get*`/`Read*` 쌍 통합 같은 재편은 **교체 이후의 별건**이며(§3.2 금지 — 개명을
> 자작과 묶지 않는다), 양쪽 증거가 0인 **꼬리 49종**(§4.7)도 계약에는 포함하되 **최종 교체
> 직전 재평가 체크포인트 1회**를 둔다. 그때의 결정은 새 D-항목으로 남긴다.

**설계 방향**
- 도구는 **수요순으로 만들되 표면은 전량 승계한다** — 실사용 상위부터 짓고, 꼬리와 미사용
  전송·RFC 경로까지 계약을 채운 뒤에 교체한다.
- 안전 3층(권한 allowlist · PreToolUse 훅 · tier 게이트)과 실데이터 2종 상시 게이트는
  현행 계약을 그대로 승계한다 — 자작이 안전 바닥선을 낮추는 근거가 되지 않는다.
- 도구 이름은 현행 표면 이름을 유지한다. 이름을 바꾸면 지식·절차·스킬 전체가 동시에
  깨지고, 그 비용이 자작 이득을 상쇄한다.

**검증 기준 (이 단계의 "됐다")**
1. **표면 186종 전량**이 **동일 이름·동일 호출 계약**으로 응답한다 — 기존
   [tool-catalog](../interactive/server/tool-catalog/sc4sap-mcp-tools.md) 대조 diff 0.
2. `interactive/scripts/smoke-mcp.mjs`(도구 표면 계약)와
   `conformance-server-gates.mjs`(tier·blocklist·ask)가 **새 엔진에 대해** 통과한다.
3. 실데이터 2종이 새 엔진에서도 프로파일과 무관하게 게이트된다 (음성시험 포함).
4. 실 SAP 대상 손 검증: 대표 절차 1건(예: 프로그램 생성→활성→기계 확인)이
   구·신 엔진에서 **같은 결과**를 낸다.
5. 위 4가 통과할 때까지 **구 번들이 현역**이다 (§3).

#### 마일스톤 체계 M1 잔여부터 M6까지

**층위를 먼저 분명히 한다.** 바로 위 「검증 기준」 5개는 **사다리 ⑴ 전체의 끝 판정**이다 —
구 번들을 새 엔진으로 갈아끼워도 되는가를 묻는 마지막 관문. 아래 M-표는 **그보다 한 층
아래**로, 그 끝 판정에 이르기까지의 제작을 여섯 구간으로 나눈 것이다. **M 하나가 닫히는 것은
그 구간의 증거가 갖춰졌다는 뜻일 뿐 ⑴이 끝났다는 뜻이 아니다** — M2가 닫혀도 ⑴은 그대로
진행 중이다. ⑴이 끝나는 것은 M6까지 전부 닫히고 위 「검증 기준」 1~4가 성립할 때이며,
기준 5 「구 번들이 현역」은 통과할 항목이 아니라 그때까지 지켜야 할 조건이다.

> **표에 나오는 증거 방식 셋.** **녹화(C1)** = 구 번들을 실 SAP에 붙여 오간 MCP 요청·응답
> 시퀀스를 픽스처로 남긴다. **재생(C2)** = 같은 질문을 새 엔진이 다시 던지게 하고 응답이
> **정규화 후 diff 0**인지 대조한다(잠금 핸들·세션 토큰·타임스탬프처럼 매번 달라지는 값은
> 정규화로 지운 뒤 비교한다). **실기(C3)** = 대표 절차를 사람이 처음부터 끝까지 돌려 결과를
> 확인한다. **셋 다 SAP에 접속하는 attended 단계**이고 소유자 세션에서만 수행한다 —
> 배치·서브에이전트 무인 실행 금지. 장치의 정본은
> [`sapkit-engine/harness/`](../sapkit-engine/harness/README.md).

> **표의 `D8`·`D15`·`D18`은** 새 엔진이 구 엔진과 **의도적으로 다르게 만든(또는 아직 안 지은)
> 지점**에 붙인 일련번호이며, 목록의 정본은
> [`sapkit-engine/harness/DIVERGENCES.md`](../sapkit-engine/harness/DIVERGENCES.md)다.
> 결정 로그의 `D-079` 같은 **D-번호와는 다른 체계**이니 혼동하지 말 것. 이 표에 나오는 셋은
> **D8** = 접속 계층에서 M1이 승계하지 않은 구 기능 3가지, **D15** = destination·service-key
> 통로 미구현, **D18** = 무접속 거부 문구가 구·신 사이에 다름.

| M | 범위 | 완료 판정 (아래 공통 요건에 더해) |
|---|---|---|
| **M1** **(진행 중)** | **잔여 둘.** ⓐ 미증거 도구 **12종**의 C1 녹화 → C2 재생 대조. ⓑ **C3 실기** — 대표 절차(프로그램 생성 → 활성 → 반영 확인) 1건. | ⓐ M1 도구 **19종 전량**이 재생 정규화 diff 0. ⓑ 대표 절차가 구·신 엔진에서 같은 결과. **→ 이 둘이 닫혀야 M2에 착수한다.** |
| **M2** | **접속 방식 확장** — destination · service-key · broker 인증. `--mcp=<destination>` · `--env=<name>` 통로 구현. | ⓐ destination 프로파일로 **실접속 성공**(inspection-only 강등 아님). ⓑ `--mcp` 진단 `MCP_DESTINATION_UNSUPPORTED`가 더 이상 나오지 않는다. ⓒ 기존 Basic 경로 회귀 0. **→ D15 해소** |
| **M3** | **전송 + RFC 완성** — HTTP · SSE 전송 2종. RFC `soap`·`native`·`gateway`·`zrfc` 4경로. | ⓐ 전송 3종(M1의 stdio 포함) 각각으로 기동 → 도구 호출 성공. ⓑ RFC 5경로(M1의 `odata` 포함) 각각 통로 생성이 계약대로. ⓒ `zrfc`가 `backend-unsupported`(미구현 실패)에서 **실동작으로 전환**. **뼈대는 여기서 끝난다.** |
| **M4** | **도구 — 실호출 116종** (§4.7 실사 정본 기준). M1이 이미 지은 것 포함. | 116종 **전량**이 녹화-재생 정규화 diff 0. 의도적 차이 목록에 등재된 분은 diff 대신 **대체 기대 시험** 통과. |
| **M5** | **도구 — 나머지 70종** (자산참조만 21 + 꼬리 49 — 앞은 문서가 부르지만 호출 이력이 0인 것, 뒤는 양쪽 증거가 모두 0인 것. §4.7). | ⓐ 70종 전량 **계약 시험 신규 저작** 통과 + 대표 건 attended 실기. ⓑ **tools/list 186종 전량**이 tool-catalog 대조 **diff 0**. |
| **M6** | **교체 직전 관문** — **판정과 재평가의 자리이며, 원칙적으로 새 기능을 짓지 않는다**(아래 예외 참조). | ⓐ **D8 관찰 판정**. ⓑ **D18 해소** — `conformance-server-gates.mjs`의 무접속 거부 분류 어휘를 **구·신 두 문구를 모두 인식하도록 넓힌다.** 신 문구로 *교체*하면 안 된다 — M6 시점엔 아직 구 번들이 현역이라(위 「검증 기준」 5) 교체하는 순간 그쪽 판정이 깨진다. 안 넓히면 교체 후 신 엔진의 정상 거부가 `OTHER`로 떨어져 게이트 판정이 어긋난다. ⓒ **꼬리 49종 재평가 1회 → 새 D-항목**(D-079 ⑧). ⓓ 위 「검증 기준」 1~4 전건 + 실 SAP 대표 절차 구·신 동일 결과. |

**지금 위치는 M1 한가운데다** — 재생 증거는 M1 도구 19종 중 **7종**이고, 나머지 12종의
녹화-재생과 C3 실기가 남았다. 그 둘이 닫히는 것이 다음 할 일이다.

- **순서는 M1 → M2 → M3 → M4 → M5 → M6으로 고정한다.** M 안에서의 병행 여부는 지금
  정하지 않는다.
- **116/70 분할의 기준은 이 문서 §4.7의 실사 정본이다.** 실사 수치가 갱신되면 경계도 따라
  움직인다 — M4·M5의 정의는 *수치*가 아니라 *증거 방식*이다.

**전 M 공통 완료 요건** (M1 잔여부터 M6까지 전부에 적용)

1. jest 스위트 green + `sapkit-engine` CI 잡 green.
2. **기존 제품 게이트 전종 여전히 green** — 구 부품 무접촉의 기계 증명.
3. 안전 게이트 적합성 + **음성시험** 통과(tier · 블록리스트 · 실데이터 2종).
4. **노출 제어 회귀 0** — 무프로파일 inspection-only / onprem / readonly 세 상태에서
   tools/list가 갈리는 것이 그 M의 표면에 대해 유지된다.
5. 해당 M의 도구·경로 증거 급이 **커버리지 표**에 기록된다.
6. **마일스톤별 실 SAP attended 확인 1건** — 소유자 attended 세션 · 전용 DEV 연습 패키지
   안 · 배치/서브에이전트 무인 실행 금지.

**M6의 제작 금지 원칙과 그 예외**

M6은 **판정하는 자리**이지 짓는 자리가 아니다. 단 D8 관찰이 **양성**이면(= 406/415 재협상 ·
discovery 외 폴백 · `skipSessionType` 중 하나라도 발동이 관찰되면) 그 항목은 **결함으로
승격되고 승계 제작이 필요해진다.**

그 경우 **M6은 판정만 하고, 제작 자체는 뼈대 계층(M3 성격)의 추가 작업으로 다룬다.** 관문이
새 기능을 짓지 않는다는 원칙과 충돌하지 않게 하기 위함이며, 그 분량과 일정은 **관찰 시점의
판단**이다 — 지금 정하지 않는다.

---

### ⑵ 검사기 재작성 — `sapkit` CLI

**대상**: 현재 `vsp/` 포크가 담당하는 **로컬(오프라인) ABAP 구문·정합 검사**.

**용도 한정**: MCP를 붙일 수 없는 환경에서 **abapGit 오프라인 반영 전** 로컬 소스를 미리
검사하는 것. SAP 접속 도구가 아니다. 즉 재작성 범위는 vsp 전체가 아니라 **로컬 검사 최소 기능**이다.

**최소 기능(제안 — 착수 시 확정)**
- 파일 단위 ABAP 구문 검사 (`sapkit lint <file>` / `sapkit parse <file>`)
- 프로젝트 단위 정합 검사(인클루드 해석, 참조 미해결 탐지)
- exit code로 판정 가능한 CLI 계약 — 훅·CI가 소비할 수 있어야 한다

**범위 밖**: SAP 접속, 배포, MCP 모드. vsp의 온라인 MCP 모드는 현재도 사용하지 않는다
(`docs/DESIGN.md` §3). 오프라인 분석기 훅 배선(D-049)은 선택 기능이며, 재작성 후에도
같은 지위를 유지한다.

**검증 기준**
1. 기존 `vsp` 오프라인 검사와 **같은 코퍼스에서 같은 판정** — 실 프로젝트 ABAP 파일
   묶음에 대해 판정 diff 0 (다르면 어느 쪽이 옳은지 근거를 남기고 기준을 갱신).
2. exit code 계약 준수 — 통과 0 / 결함 비-0, CI에서 assert.
3. 훅(`offline-code-analysis` 계열)이 새 CLI로 배선돼도 경고 전용 성격이 유지된다
   (서버 `CheckSyntax`와 완료 판정 권위가 바뀌지 않는다).
4. 통과 시: `vsp/` 소스 은퇴 + [`vsp/LICENSE`](../vsp/LICENSE) 고지 은퇴 + 루트 LICENSE 표 갱신.

---

### ⑶ 지식 재저작

세 갈래가 있고, 각각 완료 조건이 다르다.

#### ⑶-a GPL 주제 자체 집필

`interactive/core/knowledge/abap/reference/`(31파일)는 GPL-3.0 편집 저작물의 바이트 사본이었다.
**2026-08-09 전량 삭제로 해소됐고**(고지는 `THIRD_PARTY_NOTICES.md`에서 「제거로 해소」
기록으로 전환), 지식 `.md` 총수는 179 → 148이 됐다. 청사진이 다루는 것은 그 **빈자리를
무엇으로 채우는가**다.

- 원자료는 `SAP-samples/abap-cheat-sheets`(Apache-2.0)로 공개돼 있다.
- **선별·순서·구성부터 새로 한다.** 항목 배열을 그대로 두고 문장만 바꾸는 것은 재작성이 아니라
  편집 저작물의 파생이다 — 이 구분이 이 갈래의 핵심 제약이다.
- 우선순위는 "빠진 것 전부"가 아니라 **절차·스킬이 실제로 참조하던 주제**부터다.

**검증 기준**: 원자료 인용은 있되 상류 편집 저작물의 목차·선별과 대조해 구성 독립성이
설명 가능할 것 · `check-links` 0 · 참조하던 절차·스킬에서 깨진 참조 0.

> **선택지(미결정) — 집필 대신 조회.** 삭제 직전 실측에서 그 31파일(10,184줄)을 가리키던
> 참조는 제품 전체에 **2곳**뿐이었다(`create-object.md`의 곁다리 한 문장 ·
> `rap-odata-rules.md`의 짝 문서 한 줄). 지식 INDEX에도 없었고 정책이 로드하지도 않았다.
> 그래서 "빈자리를 자체 집필로 채운다" 말고 **원자료를 제품 밖에 두고 필요할 때 조회한다**는
> 길도 있다 — 원자료가 Apache-2.0이라 인용·재배포에 제약이 없고, 무게의 척도가 세션
> 토큰·설치 부담이라는 원칙과도 맞는다. 그 경우 제품에 남는 것은 **실전에서 확인한 함정
> 지식**(현 `knowledge/abap/conventions/`)이고, 문법 사전은 들고 다니지 않는다.
> 걸리는 것: 조회처가 소유자 머신의 로컬 도구라면 **다른 사용자에겐 없다** — 제품이 그것을
> 전제하려면 "있으면 쓰고 없으면 없다고 말하는" 선택적 연결부여야 하고(실패는 닫힌 쪽으로),
> 그 배선 자체가 별도 설계다. **이 판에서는 결정하지 않는다** — 착수 시점에 자체 집필과
> 나란히 놓고 고른다.

#### ⑶-b copy 지식 점진 치환

[`interactive/MIGRATION-MANIFEST.md`](../interactive/MIGRATION-MANIFEST.md)에서 `class: copy`로
분류된 차용분을 자체 집필로 바꾼다.

- **실전 검증 내용이 우선이다.** 실사용에서 맞다고 확인된 지식이 먼저 자기 문장을 얻는다.
- 한 번에 다 바꾸지 않는다 — 파일 단위로 치환하고, 치환 사실은 **git 이력이 센다**
  (분류 장부는 은퇴했다 — 아래 주석).

**검증 기준**: 치환 후 해당 지식을 소비하는 절차가 여전히 동작 · `check-links` 0 ·
`copy` 잔량이 단조 감소.

> **분류 장부는 은퇴한 역사다.** `MIGRATION-MANIFEST.md`와 `interactive/provenance/`는
> 2026-07-10 이식의 완료 기록이며 갱신 의무가 없다. 그것을 검사하던 게이트
> (`check-migration-snapshot`과 그 음성시험, `build-migration-snapshot`,
> `report-sc4sap-public-drift`)도 renew 1차에서 제거됐다 — 이후 콘텐츠는 원본에서
> 의도적으로 갈라지므로 "원본 대응이 유지되는가"라는 질문이 성립하지 않는다. 그래서 이
> 갈래의 진척은 게이트가 아니라 **git 이력과 사람의 판단**이 센다. `copy` 잔량을 계속
> 쓰려면 그 계수 방식을 이 단계 착수 시점에 새로 정해야 한다.

#### ⑶-c ZRSC4SAP_* 템플릿 재생성

`interactive/core/knowledge/abap/templates/oop-sample/`의 `zrsc4sap_*` 템플릿(20파일 =
프로그램 9종 + 화면 2종)을 SAPKIT 이름으로 새로 만든다.

- **SAP 시스템 내 기존 오브젝트는 무접촉** — 재생성 대상은 레포의 템플릿 원본뿐이다.
- 옛 이름 템플릿은 새 템플릿이 검증을 통과할 때까지 남는다.

**검증 기준**: 새 템플릿이 실 SAP DEV에 생성→활성→기계 확인까지 통과 · 개명 게이트
(`check-runtime-path-rename.mjs`) 통과 · 옛 템플릿 제거는 그 다음.

---

### ⑷ interactive/ 상류 고지 은퇴

**착수 조건**: ⑶-a·⑶-b·⑶-c의 차용분이 전부 소진될 때.

**행위**: [`interactive/LICENSE`](../interactive/LICENSE) 은퇴 + 루트 [`LICENSE`](../LICENSE)의
상류 고지 표에서 `interactive/` 행 삭제 + [`THIRD_PARTY_NOTICES.md`](../interactive/THIRD_PARTY_NOTICES.md)에서
해당 항목 삭제. 번들 런타임 의존(외부 npm 패키지) 귀속은 **남는다** — 그것은 정식 의존성이고
끝그림 ②가 허용하는 형태다.

**검증 기준**: `class: copy`로 분류됐던 파일이 전부 자체 집필로 치환됐음을 git 이력으로
확인(스냅샷 게이트는 은퇴 — ⑶-b 주석 참조) · 루트 LICENSE 표와 실제 서브트리 상태가 일치.

---

## 3. 무중단 교체 규칙

### 3.1 4단 절차 (모든 사다리 단계 공통)

```
① 병행 제작 ──▶ ② 검증 통과 ──▶ ③ 교체 ──▶ ④ 구부품·고지 은퇴
   새 부품을        해당 단계의       기본 경로를      구 소스 제거 +
   구 부품 옆에     검증 기준 전부    새 부품으로      LICENSE·NOTICES
   만든다           (기계 증거 필수)   전환            갱신
```

**①에서 구 부품을 건드리지 않는다.** 새 부품은 새 경로에 만들고, 구 부품은 그대로 현역이다.

**②의 "검증 통과"는 도구의 성공 응답이 아니다.** SAP 도구가 success를 반환해도 실제로
반영되지 않은 사례가 실측으로 확인됐다. 통과의 정의는:

> **기계 확인** (반영 후 소스 되읽기 대조 + 구문·활성 확인) **+ 독립 새-컨텍스트 리뷰**

두 축 모두 필요하다. 자기보고·자기리뷰는 어느 쪽도 대체하지 못한다.

**③의 교체는 되돌릴 수 있어야 한다.** 전환 후 최소 1회의 실사용 사이클 동안 구 부품을
남겨 두고, 그 사이클이 무사하면 ④로 간다.

### 3.2 금지

| 금지 | 이유 |
|---|---|
| 빅뱅 교체 (구 부품 제거 후 새 부품 투입) | 되돌릴 곳이 없다 |
| 검증 없는 고지 은퇴 | 고지 은퇴는 "차용분 소진"의 선언이다 — 소진이 사실이어야 한다 |
| SAP 시스템 내 기존 오브젝트 개명·삭제 | SAP 오브젝트는 개명 불가 · 운영 영향 |
| 도구 이름 변경을 자작과 묶기 | 지식·절차·스킬 전체가 동시에 깨진다 |
| 사다리 단계 착수를 이 문서만 근거로 진행 | 착수는 실수요 트리거 + 결정 기록을 요구한다 |

### 3.3 단계별 검증 기준 요약

| 사다리 | 기계 증거 | 사람 증거 | 은퇴 대상 |
|---|---|---|---|
| ⑴ 엔진 | tool-catalog diff 0 · `smoke-mcp` · `conformance-server-gates` · 실데이터 게이트 음성시험 | 대표 절차 1건 구·신 동일 결과 | `engine/` 소스 + 고지 |
| ⑵ 검사기 | 코퍼스 판정 diff 0 · exit code 계약 CI assert | 훅 배선 후 경고 전용 성격 확인 | `vsp/` 소스 + 고지 |
| ⑶ 지식 | `check-links` 0 · `copy` 잔량 단조 감소(계수 방식은 착수 시 결정) | 구성 독립성 설명 가능 · 소비 절차 동작 | 차용 지식 파일 |
| ⑶-c 템플릿 | 개명 게이트 통과 · 새 템플릿 생성→활성→기계 확인 | — | 옛 이름 템플릿 (SAP 오브젝트는 무접촉) |
| ⑷ 고지 | `copy` 잔량 0(git 이력 대조) | LICENSE 표 ↔ 실제 서브트리 일치 | `interactive/LICENSE` |

---

## 4. 도구 실사 (2026-08-09 실행 · 2026-08-10 재대조)

> **재대조 기록 (2026-08-10)**: 최초 실사는 renew 1차의 두 갈래 — V-PASS 의식 제거와
> 호환층 제거 — **이전** 상태를 잰 것이었다. 같은 방법(§4.6)으로 다시 돌린 결과 두 곳이
> 움직였다: ⓐ 새 절차 `proc/verify-applied.md`가 되읽기·구문·활성 확인 도구를 직접
> 부르면서 read 13종의 참조가 늘고 `GetSourceDiff`가 **참조 없음 → 실질 참조**로
> 넘어왔다(109 → 110). ⓑ §4.5의 유령 참조 1건이 **고쳐져 0건**이 됐다. 조사 대상
> 파일 수는 GPL 31파일 삭제로 315 → 284다. 아래 수치는 전부 재대조본이다.

### 4.1 방법

**조사 대상**(제품 자산 전수, 읽기 전용): `interactive/core/`(지식·페르소나·절차·정책) ·
`interactive/skills/` · `interactive/adapters/`(훅 포함) — **284파일**.

**추출 방법**: MCP 엔진 도구명은 PascalCase 식별자이며 문서 안에서 여러 표기로 등장한다
(`mcp__plugin_sapkit_sap__X` 풀네임 · 백틱 인용 · 목록 항목 · 코드 내 문자열). 동사 접두어
19종(`Get|Read|Create|Update|Delete|Activate|Release|Patch|Write|Check|List|Search|Describe|Grep|Run|Runtime|Reload|Validate|Install`)로
시작하는 PascalCase 토큰을 전수 추출한 뒤 실측 표면과 대조했다. **실측 표면 186종 전부가 이
접두어 규칙에 걸리므로 추출 누락은 없다**(규칙 밖 이름 0종 확인).

**대조 정본 2종**
- [`interactive/server/tool-catalog/`](../interactive/server/tool-catalog/sc4sap-mcp-tools.md) —
  **연결 상태(프로파일 활성) `tools/list` 실측 186종**. 이것이 전체 표면의 정본이다.
- `interactive/provenance/mcp-surface.json` — 노출 프로파일별 고정 스냅샷
  (`default` = inspection-only 155종, `readonly` = 65종).

**두 정본의 정합 확인**: `default`(155) ⊂ catalog(186), `readonly`(65) ⊂ catalog(186),
차집합 0종. 즉 카탈로그가 상위 집합이고 스냅샷과 모순이 없다. 차이 31종은 프로파일
활성 시에만 동적 노출되는 프로그램·화면 계열로, 카탈로그 README가 기록한 알려진 사실이다.

### 4.2 결과 요약

| 항목 | 수 |
|---|---:|
| 실측 도구 표면 (연결 상태) | **186** |
| 제품 자산이 **실질 참조**하는 도구 | **110** |
| 실질 참조 없음 (생성 allowlist·훅 분류 열거에만 등장) | **76** |
| **유령 참조** (참조되지만 표면에 없는 이름) | **0** ✅ |
| 표면에 있으나 어디서도 참조되지 않음 | **0** |

> **"실질 참조"의 정의**: 표면 186종은 전부 어딘가에 이름이 나온다 — 그러나
> `interactive/adapters/claude/permissions-template.json`은 live `tools/list`에서 **생성된**
> 권한 allowlist라 186종을 기계적으로 전부 열거한다. `interactive/adapters/claude/hooks/*.mjs`도
> 클래스 단위(트랜스포트 필요 mutation 49종, tier 차단 대상 등)로 열거한다. 이 **열거만**으로
> 등장하는 이름은 "쓰인다"의 증거가 아니다. 따라서 실사는 그 **열거원(allowlist 1 + 훅 7)을
> 제외한 나머지**(절차·스킬·페르소나·지식·정책·어댑터 README)가 이름을 부르는 경우를 실질
> 참조로 센다. 훅만 부르는 이름은 §4.4-B로 따로 분리해 구분을 보존했다.

**클래스별 분포**

| 클래스 | 표면 | 실질 참조 | 참조 없음 |
|---|---:|---:|---:|
| read | 90 | 60 | 30 |
| write | 79 | 37 | 42 |
| runtime | 15 | 11 | 4 |
| row-data (상시 게이트) | 2 | 2 | 0 |
| **계** | **186** | **110** | **76** |

읽어야 할 신호: **write 79종 중 절반 이상(42종)이 어떤 절차도 부르지 않는다.** 그 42종은
대부분 `Delete*` 25종과 세분화된 `Update*` 계열이다 — 사다리 ⑴에서 "무엇을 안 만들 것인가"의
1순위 재료다.

### 4.3 사용 도구 집합 — 실질 참조 110종

참조처 경로 약칭: `proc/` = `interactive/core/procedures/` · `pol/` = `interactive/core/policies/` ·
`persona/` = `interactive/core/personas/` · `know/` = `interactive/core/knowledge/` ·
`skill/` = `interactive/skills/` · `adapter/` = `interactive/adapters/`.
"참조" 열은 `총 등장 횟수 / 파일 수`(열거원 제외).

#### 4.3.1 read — 60종

| 도구 | 용도 | 대표 참조처 | 참조 |
|---|---|---|---:|
| `CheckSyntax` | SAP에 쓰지 않고 구문만 검사 (class/program/include) | proc/create-program.md ; pol/verification-policy.md | 29 / 16 |
| `DescribeByList` | 오브젝트 목록 일괄 설명 조회 | proc/analyze-symptom.md | 1 / 1 |
| `GetAbapAST` | ABAP 소스를 AST(JSON)로 파싱 | proc/analyze-code.md ; proc/analyze-symptom.md | 9 / 4 |
| `GetAbapSemanticAnalysis` | 심볼·타입·스코프·의존 의미 분석 | proc/analyze-code.md ; proc/analyze-symptom.md | 9 / 5 |
| `GetAtcFindings` | ATC 정적검사 실행·발견사항 반환 | proc/create-program.md ; pol/verification-policy.md | 9 / 4 |
| `GetBehaviorImplementation` | RAP 비헤이비어 구현 정의 조회 | proc/troubleshooting.md | 1 / 1 |
| `GetClass` | 클래스 소스 조회 (active/inactive) | know/modules/PS/workflows.md ; know/modules/TM/workflows.md | 22 / 16 |
| `GetDataElement` | 데이터 엘리먼트 정의 조회 | persona/sap-stocker.md ; proc/analyze-symptom.md | 10 / 7 |
| `GetDomain` | 도메인 정의 조회 | proc/analyze-symptom.md ; proc/ask-consultant.md | 7 / 5 |
| `GetEnhancementImpl` | 인핸스먼트 구현 소스 조회 | proc/analyze-symptom.md ; proc/compare-programs.md | 5 / 2 |
| `GetEnhancements` | 오브젝트의 인핸스먼트 목록 | proc/analyze-symptom.md ; proc/compare-programs.md | 7 / 3 |
| `GetEnhancementSpot` | 인핸스먼트 스팟 메타·구현 목록 | proc/analyze-symptom.md ; proc/program-to-spec.md | 7 / 4 |
| `GetFunctionGroup` | 펑션 그룹 정의 조회 | proc/analyze-cbo-obj.md | 1 / 1 |
| `GetFunctionModule` | 펑션 모듈 정의·소스 조회 | know/abap/conventions/function-module-rule.md ; know/modules/Ariba/workflows.md | 38 / 19 |
| `GetGuiStatus` | GUI 상태(CUA) 정의 조회 | proc/review-checklist.md | 2 / 1 |
| `GetGuiStatusList` | 프로그램의 GUI 상태 목록 | proc/program-to-spec.md ; proc/compare-programs.md | 3 / 2 |
| `GetInactiveObjects` | 미활성(활성화 대기) 오브젝트 목록 | proc/create-object.md ; proc/troubleshooting.md | 37 / 15 |
| `GetInclude` | 인클루드 소스 조회 | proc/program-to-spec.md ; know/modules/Ariba/workflows.md | 12 / 10 |
| `GetIncludesList` | 프로그램의 인클루드 재귀 목록 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `GetInterface` | 인터페이스 정의 조회 | proc/analyze-code.md ; proc/analyze-cbo-obj.md | 4 / 3 |
| `GetLocalDefinitions` | 클래스 로컬 정의부 소스 조회 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `GetLocalMacros` | 클래스 로컬 매크로 소스 조회 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `GetLocalTestClass` | 클래스 로컬 테스트 클래스 소스 조회 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `GetLocalTypes` | 클래스 로컬 타입 소스 조회 | proc/program-to-spec.md ; proc/troubleshooting.md | 4 / 2 |
| `GetMetadataExtension` | 메타데이터 익스텐션 정의 조회 | proc/program-to-spec.md ; proc/compare-programs.md | 3 / 2 |
| `GetObjectInfo` | 오브젝트 트리 구조 (DEVC/CLAS/PROG/FUGR) | proc/analyze-symptom.md ; proc/program-to-spec.md | 17 / 11 |
| `GetObjectsByType` | 타입별 오브젝트 일괄 조회 | know/abap/conventions/naming-conventions.md ; proc/analyze-cbo-obj.md | 2 / 2 |
| `GetPackage` | 패키지 메타데이터 조회 | proc/create-object.md ; proc/analyze-cbo-obj.md | 10 / 6 |
| `GetPackageContents` | 패키지 내 오브젝트 평면 목록 | proc/analyze-cbo-obj.md ; persona/sap-stocker.md | 4 / 3 |
| `GetPackageTree` | 하위 패키지 포함 트리 구조 | proc/analyze-cbo-obj.md ; persona/sap-stocker.md | 3 / 2 |
| `GetProgFullCode` | 인클루드 포함 프로그램 전체 코드 | proc/analyze-code.md ; proc/program-to-spec.md | 9 / 6 |
| `GetProgram` | 프로그램 정의·소스 조회 | proc/analyze-code.md ; proc/review-checklist.md | 10 / 8 |
| `GetScreen` | 화면(Dynpro) 정의·플로우 로직 조회 | proc/compare-programs.md ; proc/review-checklist.md | 6 / 3 |
| `GetScreensList` | 프로그램의 화면 목록 | proc/program-to-spec.md ; proc/compare-programs.md | 3 / 2 |
| `GetSession` | ADT 세션 ID·상태 획득 (재사용용) | proc/troubleshooting.md ; proc/analyze-symptom.md | 13 / 3 |
| `GetSourceDiff` | 기준 버전 대비 서버측 소스 비교 | proc/verify-applied.md | 2 / 1 |
| `GetStructure` | 구조 정의 조회 | proc/analyze-symptom.md ; proc/ask-consultant.md | 9 / 7 |
| `GetSystemInfo` | 시스템 SID·클라이언트·접속 사용자 식별 | proc/troubleshooting.md ; adapter/codex/README.md | 2 / 2 |
| `GetTable` | 테이블 DDIC 정의 조회 | know/modules/PS/workflows.md ; know/modules/Ariba/workflows.md | 61 / 28 |
| `GetTextElement` | 텍스트 풀(텍스트 심볼·선택 텍스트) 읽기 | proc/program-to-spec.md ; know/abap/conventions/text-element-rule.md | 6 / 5 |
| `GetTransport` | 트랜스포트 요청 정보·포함 오브젝트 조회 | proc/analyze-symptom.md ; proc/release.md | 6 / 3 |
| `GetUnitTestResult` | ABAP Unit 실행 결과 조회 | proc/create-program.md ; pol/verification-policy.md | 5 / 4 |
| `GetUnitTestStatus` | ABAP Unit 실행 상태 조회 | pol/verification-policy.md | 1 / 1 |
| `GetView` | 뷰 정의 조회 | proc/analyze-code.md ; proc/analyze-symptom.md | 14 / 11 |
| `GetWhereUsed` | where-used (교차 참조·의존) 조회 | proc/analyze-symptom.md ; persona/sap-stocker.md | 21 / 9 |
| `GrepObjects` | 다수 오브젝트 소스 정규식 검색 | proc/troubleshooting.md | 3 / 1 |
| `ListTransports` | 사용자 트랜스포트 요청 목록 | proc/analyze-symptom.md ; proc/create-object.md | 13 / 6 |
| `ReadBehaviorDefinition` | BDEF 소스·메타 읽기 | proc/program-to-spec.md | 2 / 1 |
| `ReadBehaviorImplementation` | 비헤이비어 구현 소스·메타 읽기 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `ReadClass` | 클래스 소스·메타 읽기 | proc/analyze-symptom.md ; proc/program-to-spec.md | 10 / 6 |
| `ReadFunctionGroup` | 펑션 그룹 소스·메타 읽기 | proc/compare-programs.md | 3 / 2 |
| `ReadFunctionModule` | 펑션 모듈 소스·메타 읽기 | proc/analyze-symptom.md ; proc/program-to-spec.md | 7 / 4 |
| `ReadInterface` | 인터페이스 소스·메타 읽기 | proc/analyze-symptom.md ; proc/program-to-spec.md | 4 / 3 |
| `ReadProgram` | 프로그램 소스·메타 읽기 | proc/analyze-symptom.md ; proc/analyze-code.md | 4 / 2 |
| `ReadScreen` | 화면 플로우 로직·필드 읽기 | proc/program-to-spec.md | 1 / 1 |
| `ReadServiceBinding` | 서비스 바인딩 소스·메타 읽기 | proc/program-to-spec.md | 2 / 1 |
| `ReadServiceDefinition` | 서비스 정의 소스·메타 읽기 | proc/program-to-spec.md | 2 / 1 |
| `ReadTextElementsBulk` | 텍스트 요소 전량 1회 읽기 (TPOOL RFC) | proc/review-checklist.md ; know/abap/conventions/text-element-rule.md | 3 / 2 |
| `ReadView` | 뷰(CDS) 소스·메타 읽기 | proc/program-to-spec.md ; proc/compare-programs.md | 5 / 3 |
| `SearchObject` | 이름·와일드카드로 오브젝트 존재·위치 검색 | proc/troubleshooting.md ; proc/install-sap-assets.md | 52 / 18 |

#### 4.3.2 write — 37종

| 도구 | 용도 | 대표 참조처 | 참조 |
|---|---|---|---:|
| `ActivateObjects` | 다건 오브젝트 일괄 활성화 | proc/create-object.md ; pol/verification-policy.md | 24 / 14 |
| `CreateBehaviorDefinition` | RAP 비헤이비어 정의(BDEF) 생성 | proc/create-object.md | 2 / 1 |
| `CreateClass` | 클래스 생성 (초기 상태) | proc/create-object.md ; proc/install-sap-assets.md | 17 / 11 |
| `CreateDataElement` | 데이터 엘리먼트 생성·활성 | proc/create-object.md ; know/abap/conventions/field-typing-rule.md | 11 / 5 |
| `CreateDomain` | 도메인 생성·활성 | proc/create-object.md ; proc/create-program.md | 9 / 4 |
| `CreateFunctionGroup` | 펑션 그룹 생성 | proc/create-object.md ; proc/install-sap-assets.md | 6 / 3 |
| `CreateFunctionModule` | 펑션 모듈 생성 | proc/install-sap-assets.md ; proc/create-object.md | 11 / 6 |
| `CreateGuiStatus` | GUI 상태 생성 | proc/create-object.md ; proc/create-program.md | 5 / 3 |
| `CreateInclude` | 인클루드(Type I) 생성·등록 | proc/create-program.md ; know/abap/conventions/include-structure.md | 4 / 2 |
| `CreateInterface` | 인터페이스 생성 | proc/create-object.md ; proc/install-sap-assets.md | 5 / 3 |
| `CreateProgram` | 프로그램(리포트) 생성 | proc/create-object.md ; know/modules/WM/workflows.md | 34 / 17 |
| `CreateScreen` | 화면(Dynpro) 생성 | proc/create-object.md ; proc/create-program.md | 6 / 4 |
| `CreateServiceBinding` | 서비스 바인딩 생성 | proc/create-object.md | 2 / 1 |
| `CreateServiceDefinition` | OData 서비스 정의 생성 | proc/create-object.md ; know/modules/TM/workflows.md | 3 / 2 |
| `CreateStructure` | 구조 생성·활성 | know/abap/conventions/field-typing-rule.md ; proc/create-object.md | 6 / 4 |
| `CreateTable` | 테이블 생성 | proc/create-object.md ; know/abap/conventions/field-typing-rule.md | 14 / 6 |
| `CreateTextElement` | 텍스트 요소 추가 | know/abap/conventions/text-element-rule.md ; proc/create-program.md | 8 / 3 |
| `CreateTransport` | 트랜스포트 요청 생성 (P4) | pol/transport-client-rule.md ; proc/troubleshooting.md | 23 / 11 |
| `CreateView` | CDS 뷰 / 클래식 뷰 생성 | proc/create-object.md | 3 / 2 |
| `PatchGuiStatus` | GUI 상태 행 단위 병합 | proc/review-checklist.md | 1 / 1 |
| `ReleaseTransport` | 트랜스포트 요청·태스크 릴리스 (P4) | proc/release.md ; proc/review-checklist.md | 9 / 5 |
| `UpdateBehaviorImplementation` | 비헤이비어 구현 소스 갱신 | proc/troubleshooting.md | 1 / 1 |
| `UpdateClass` | 클래스 소스 갱신 (락·체크·활성) | proc/install-sap-assets.md ; proc/analyze-code.md | 14 / 7 |
| `UpdateFunctionModule` | 펑션 모듈 소스 갱신 | know/abap/conventions/function-module-rule.md ; proc/install-sap-assets.md | 15 / 6 |
| `UpdateGuiStatus` | GUI 상태 전면 교체 (FULL REPLACE 주의) | proc/create-program.md ; proc/create-object.md | 3 / 2 |
| `UpdateInclude` | 인클루드 소스 갱신 | know/abap/conventions/include-structure.md ; know/modules/SD/workflows.md | 16 / 12 |
| `UpdateInterface` | 인터페이스 소스 갱신 | proc/install-sap-assets.md | 2 / 1 |
| `UpdateLocalTestClass` | 클래스 로컬 테스트 클래스 갱신 | proc/troubleshooting.md | 1 / 1 |
| `UpdateLocalTypes` | 클래스 로컬 타입 갱신 | proc/troubleshooting.md | 2 / 1 |
| `UpdateProgram` | 프로그램 소스 갱신 | proc/create-object.md ; proc/analyze-code.md | 19 / 12 |
| `UpdateScreen` | 화면(Dynpro) 정의 갱신 | know/abap/conventions/ok-code-pattern.md ; proc/create-program.md | 8 / 4 |
| `UpdateSourceByPatch` | 문자열 치환 방식 국소 소스 수정 | proc/troubleshooting.md | 1 / 1 |
| `UpdateStructure` | 구조 DDL 갱신 | proc/modify-object.md | 1 / 1 |
| `UpdateTable` | 테이블 DDL 갱신 | know/abap/conventions/field-typing-rule.md | 1 / 1 |
| `UpdateTextElement` | 텍스트 요소 갱신 | proc/create-program.md ; know/abap/conventions/text-element-rule.md | 3 / 2 |
| `UpdateView` | 뷰 DDL 갱신 | know/modules/PS/workflows.md | 1 / 1 |
| `WriteTextElementsBulk` | 텍스트 요소 일괄 등록 (TPOOL 1회) | proc/review-checklist.md | 1 / 1 |

#### 4.3.3 runtime — 11종

| 도구 | 용도 | 대표 참조처 | 참조 |
|---|---|---|---:|
| `ReloadProfile` | 활성 SAP 프로파일 재적재 (서버 제어) | proc/troubleshooting.md ; proc/install-sap-assets.md | 7 / 4 |
| `RuntimeAnalyzeDump` | 덤프 요약 분석 | proc/analyze-symptom.md | 3 / 1 |
| `RuntimeAnalyzeProfilerTrace` | 프로파일러 트레이스 요약 분석 | proc/analyze-symptom.md ; know/abap/conventions/clean-code.md | 4 / 2 |
| `RuntimeCreateProfilerTraceParameters` | 프로파일 실행 파라미터 생성 | proc/analyze-symptom.md | 1 / 1 |
| `RuntimeGetDumpById` | 특정 덤프 원문 조회 | proc/analyze-symptom.md | 3 / 1 |
| `RuntimeGetProfilerTraceData` | 트레이스 데이터(히트리스트·구문·DB 접근) 조회 | proc/analyze-symptom.md | 1 / 1 |
| `RuntimeListDumps` | 런타임 덤프 목록 | proc/analyze-symptom.md | 4 / 1 |
| `RuntimeListProfilerTraceFiles` | 프로파일러 트레이스 파일 목록 | proc/analyze-symptom.md | 2 / 1 |
| `RuntimeRunClassWithProfiling` | 클래스를 프로파일러 켜고 실행 | proc/analyze-symptom.md ; know/abap/conventions/clean-code.md | 3 / 2 |
| `RuntimeRunProgramWithProfiling` | 프로그램을 프로파일러 켜고 실행 | proc/analyze-symptom.md | 4 / 1 |
| `RunUnitTest` | ABAP Unit 실행 시작 (run_id 반환) | proc/create-program.md ; proc/troubleshooting.md | 19 / 11 |

#### 4.3.4 row-data — 2종 (상시 게이트)

| 도구 | 용도 | 대표 참조처 | 참조 |
|---|---|---|---:|
| `GetSqlQuery` | ADT Data Preview 경유 SELECT 실행 | pol/data-protection/data-extraction-policy.md ; proc/troubleshooting.md | 53 / 27 |
| `GetTableContents` | 테이블·CDS 뷰 행 데이터 미리보기 | adapter/codex/README.md ; persona/sap-stocker.md | 52 / 24 |

이 2종의 참조 다수는 **호출 지시가 아니라 금지·승인 절차 서술**이다. 자작 엔진에서도
표면에는 남기되 게이트를 승계한다 (§2 ⑴ 검증 기준 3).

### 4.4 실질 참조 없음 — 76종 (사다리 ⑴ 판단 재료)

**아래 목록은 "제거 결정"이 아니라 "검토 대상"이다.** 참조가 없다는 것은 현 자산이 지시하지
않는다는 뜻일 뿐, 필요 없다는 증명이 아니다. 최초 실사가 이 목록에 두었던 `GetSourceDiff`가
그 실례다 — "기계 확인에 유용하지만 아직 아무도 안 부른다"고 적어 뒀는데, 그 뒤 신설된
`proc/verify-applied.md`가 실제로 부르면서 §4.3.1로 넘어갔다. **자산이 바뀌면 이 목록도
바뀐다.**

> **실사용 축과 교차하면 이 76종은 49종으로 줄어든다** — 27종은 제품 문서가 부르지 않을 뿐
> 실제로 호출되고 있었다(§4.7). 사다리 ⑴의 판단 재료는 그 **49종**이다.

**A. 생성된 권한 allowlist에만 등장 — 60종**

`Delete*` 25종: `DeleteBehaviorDefinition` `DeleteBehaviorImplementation` `DeleteCdsUnitTest`
`DeleteClass` `DeleteDataElement` `DeleteDomain` `DeleteFunctionGroup` `DeleteFunctionModule`
`DeleteGuiStatus` `DeleteInclude` `DeleteInterface` `DeleteLocalDefinitions` `DeleteLocalMacros`
`DeleteLocalTestClass` `DeleteLocalTypes` `DeleteMetadataExtension` `DeleteProgram` `DeleteScreen`
`DeleteServiceBinding` `DeleteServiceDefinition` `DeleteStructure` `DeleteTable` `DeleteTextElement`
`DeleteUnitTest` `DeleteView`

read 계열 30종: `GetAbapSystemSymbols` `GetAdtTypes` `GetBadiImplementations` `GetBehaviorDefinition`
`GetCallGraph` `GetCdsUnitTest` `GetCdsUnitTestResult` `GetCdsUnitTestStatus` `GetClassMethod`
`GetInstalledComponents` `GetNodeStructureLow` `GetObjectNodeFromCache` `GetObjectStructure`
`GetObjectStructureLow` `GetObjectsList` `GetServiceBinding` `GetServiceDefinition`
`GetTransaction` `GetTypeInfo` `GetUnitTest` `GetVirtualFoldersLow` `GrepPackages`
`ListServiceBindingTypes` `ReadDataElement` `ReadDomain` `ReadGuiStatus` `ReadMetadataExtension`
`ReadPackage` `ReadStructure` `ReadTable`

write 1종: `UpdateClassMethod`

runtime 4종: `RuntimeGetGatewayErrorLog` `RuntimeListFeeds` `RuntimeListSystemMessages`
`ValidateServiceBinding`

(25 + 30 + 1 + 4 = 60)

**B. allowlist + 훅 클래스 열거에만 등장 — 16종**

`CreateBehaviorImplementation` `CreateCdsUnitTest` `CreateMetadataExtension` `CreatePackage`
`CreateUnitTest` `UpdateBehaviorDefinition` `UpdateCdsUnitTest` `UpdateDataElement` `UpdateDomain`
`UpdateFunctionGroup` `UpdateLocalDefinitions` `UpdateLocalMacros` `UpdateMetadataExtension`
`UpdateServiceBinding` `UpdateServiceDefinition` `UpdateUnitTest`

> B군은 훅(`transport-validator` 등)이 "트랜스포트가 필요한 mutation"으로 분류하고 있으나
> 어떤 절차도 호출을 지시하지 않는다. 자작 시 **분류만 남기고 도구는 안 만들** 수 있는지
> (= 훅 분류표를 실제 표면과 분리할 수 있는지)가 판단 지점이다.

**주목할 쌍**: `ReadDataElement`/`ReadDomain`/`ReadPackage`/`ReadStructure`/`ReadTable`은 참조가 없는데
같은 오브젝트의 `GetDataElement`/`GetDomain`/`GetPackage`/`GetStructure`/`GetTable`은 참조가 많다.
`Get*`/`Read*` 이중 표면이 상류에서 온 중복일 가능성이 높다 — 자작 엔진에서 **합칠 1순위 후보**다.

### 4.5 유령 참조 — 0건 ✅ (해소)

최초 실사가 잡은 1건은 고쳐졌다.

| 참조된 이름 | 위치 | 실제 표면 | 처리 |
|---|---|---|---|
| `CreateCdsView` | `interactive/core/knowledge/modules/PS/workflows.md:80` | 없음 (표면은 `CreateView`) | **2026-08-10 `CreateView`로 정정** — 같은 파일 82행이 이미 `UpdateView`를 정확히 쓰고 있었고 80행만 어긋나 있었다 |

재대조 결과 유령 참조는 **0건**이며, `mcp__*__` 풀네임 표기 중 표면에 없는 이름도 **0건**이다.

### 4.6 실사 재현 방법

1. 표면 정본 집합을 만든다: `interactive/server/tool-catalog/sc4sap-mcp-tools-{read,write,runtime}.md`의
   `- \`Name\`` 목록 + 섹션 파일에서 의도적으로 제외된 `GetTableContents`·`GetSqlQuery` 2종.
2. `interactive/provenance/mcp-surface.json`의 `expositions.default.names`·`readonly.names`가
   1의 부분집합인지 확인한다 (차집합 0이어야 한다).
3. `interactive/core/` · `interactive/skills/` · `interactive/adapters/`를 순회하며 §4.1의
   동사 접두어 PascalCase 토큰을 추출한다.
4. 1에 없는 토큰 = 유령 참조 후보(문맥 확인 필요 — ABAP 컬럼명·글롭 표기가 섞인다).
   1에 있으나 열거원 밖 참조가 0인 이름 = §4.4 목록.

**오탐 2건**(수동 배제): `ReleaseState`(ABAP DDIC 컬럼명) ·
`RuntimeRun`(`RuntimeRun*` 글롭·`RuntimeRun{Program,Class}WithProfiling` 축약 표기).
최초 실사에는 세 번째로 `CreateCdsView`가 걸렸고 그것만 진짜 유령이었다 — 지금은 정정돼
후보 자체가 사라졌다(§4.5).

### 4.7 실사용 축 (2026-07-13 ~ 08-10 · 이 머신의 호출 이력)

§4.1~§4.6은 **자산 참조** 축이다 — *제품 문서가 어떤 도구 이름을 부르는가*. 여기에 두 번째
축을 둔다: **실수요** — *실제로 호출된 적이 있는가*. **두 축은 서로 다른 것을 재므로 합집합으로
본다**(문서가 안 부르는데 사람이 쓴 도구가 있고, 문서만 부르고 아무도 안 쓴 도구가 있다).
꼬리로 분류되는 것은 **양쪽 증거가 모두 0인 도구뿐**이다.

| 항목 | 값 |
|---|---:|
| 측정 기간 | 2026-07-13 ~ 08-10 |
| 세션 | **1,081** |
| 도구 호출 | **7,441** |
| 실제 호출된 도구 | **116** |
| 자산 참조 110종과의 **합집합** | **137** |
| **양쪽 증거 0 — 꼬리** | **49** (`Delete*` 25종 전부 포함) |
| 최다 호출 | `GetSqlQuery` **2,631회 (35%)** |

읽어야 할 신호 셋. ⓐ **호출 3건 중 1건이 행 데이터 조회다**(`GetSqlQuery` 35%) — 실데이터
2종의 상시 게이트가 장식이 아니라 주 경로 위에 있다는 실측이며, 자작 엔진에서도 이 게이트가
1순위 계약이다(§2 ⑴ 검증 기준 3). ⓑ §4.2가 "참조 없음 **76종**"으로 잡았던 집합이 실사용
축과 겹치며 **49종으로 줄었다** — 나머지 27종은 문서가 안 부를 뿐 사람이 쓰고 있었다.
ⓒ 반대 방향도 있다 — 합집합 계산상 **자산이 부르는데 한 번도 호출되지 않은 도구가 21종**
(110 + 116 − 137)이다. 두 축 어느 쪽도 단독으로는 "쓰인다"의 답이 아니라는 뜻이다.

그 49종은 사다리 ⑴에서 **제외 대상이 아니라 재평가 대상**이다 — 표면은 전량 승계하고
(⑴ 절 · D-079 ②), 재평가는 **최종 교체 직전 1회**에 몰아 둔다(D-079 ⑧).

**측정 한계**: 소유자 1인 · 머신 1대 · 1개월의 기록이다. 다른 사용자의 분포는 다를 수 있고,
호출 0이 "필요 없음"의 증명이 아닌 것은 §4.4 서두의 단서와 같다.

---

## 5. 이 판에서 하지 않는 것

| 항목 | 지위 |
|---|---|
| SAPKIT Engine 제작 | 등재만 — 착수는 별도 결정 |
| 검사기 재작성 | 등재만 |
| 지식 재저작 · 템플릿 재생성 | 등재만 |
| 릴리스 자산 재발행 | 등재만 |
| `CreateCdsView` 오탈 수정 (§4.5) | ✅ 완료 — 문서 현행화 작업이 2026-08-10 정정 |
| GPL 31파일 제거 | ✅ 완료 — 이 판의 별도 작업이 2026-08-09 수행 |
| ENGINE(final-harness 루프) 재개 | D-040 template-only 유지 — 이 청사진과 무관 |
