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

| # | 조건 | 지금 (2026-08-19 갱신) | 끝그림 |
|---|---|---|---|
| ① | **몸통은 전부 자작** | ~~엔진·검사기·지식 상당량이 차용 포크~~ → **검사기 ✅(2026-08-16) · 엔진 ✅(2026-08-19) · 지식 갈래 소진 ✅** · 남은 것은 `interactive/server/` 결부 36파일 | 제품을 이루는 부품이 전부 소유자 저작 |
| ② | **외부는 정식 의존성만** | 상류 코드를 레포에 품고 개작 | 외부 코드는 패키지 매니저로 당겨 쓰는 의존성 형태로만 존재 |
| ③ | **계보성 고지 은퇴** | 잔존 고지 **2건**(`engine/`·`interactive/` — `vsp/`는 2026-08-16 은퇴) | 대체가 끝난 부품의 고지부터 차례로 은퇴, 최종 0건 |
| ④ | **브랜드 단일** | 플러그인만 `sapkit`, 부품은 상류 이름 잔존 | 아래 1.2 |
| ⑤ | **가볍지만 강력하게** | — | 무게의 척도는 **세션 토큰·설치 부담**이지 레포 바이트가 아니다 (D-040) |

②의 뜻: "포크 0"은 남의 코드를 안 쓴다는 뜻이 아니라, **남의 코드를 우리 레포 안에서
개작·유지보수하지 않는다**는 뜻이다. 정식 의존성은 버전으로 당겨 쓰고, 우리는 그 위에
우리 코드만 얹는다. 지금의 `engine/`은 그 반대 형태(레포 내 개작 소스)이며(`vsp/`도
그랬으나 판1에서 은퇴했다),
그래서 유지보수 부채와 고지 의무를 동시에 지고 있다.

### 1.2 브랜드 단일화 — SAPKIT

| 부품 | 이름 | 비고 |
|---|---|---|
| 제품 플러그인 | **sapkit** | 이미 개명 완료 (D-041) |
| 검사기 CLI 명령 | **`sapkit`** | ✅ 개명 완료 (판1 · 소스 정본 `sapkit-cli/`) |
| 새 엔진 | **SAPKIT Engine** / 패키지 **`sapkit-engine`** | 현재 `abap-mcp-adt-powerup` 포크 번들 |

**SAP 시스템 측은 예외**: 이미 SAP에 생성된 `ZRSC4SAP_*` 오브젝트는 **무접촉**이다.
SAP 오브젝트는 개명이 불가하므로 옛 이름이 그대로 남는다. 개명 대상은 레포가 배포하는
**템플릿 원본**뿐이며, 그것도 사다리 ⑶의 재생성 시점에 새 이름으로 새로 만든다
(기존 오브젝트를 고치거나 지우지 않는다).

### 1.3 계보성 고지 원장

루트 [`LICENSE`](../LICENSE)는 MIT(소유자 명의)이고, 그 아래 상류 고지 **2건**을 승계 보존
중이다(판1에서 3→2). **각 고지는 해당 부품의 차용분이 소진된 시점에 은퇴한다** — 은퇴는
사다리 단계의 완료 판정과 같은 사건이다.

| 고지 | 대상 서브트리 | 은퇴 조건 | 대응 사다리 |
|---|---|---|---|
| [`engine/LICENSE`](../engine/LICENSE) | `engine/` (~~+ `interactive/server/` 번들~~ — **2026-08-19 교체로 번들은 빠졌다**) | SAPKIT Engine이 번들 자리를 대체하고 `engine/` 소스가 레포를 떠날 때. **앞 절반은 섰다**(D-095) — 남은 것은 소스 은퇴이고 그 판이 **판7.5**다 | ⑴ |
| ~~`vsp/LICENSE`~~ | ~~`vsp/`~~ | **은퇴 완료 (2026-08-16 · 판1 · D-085)** — `sapkit-cli/`가 로컬 검사를 대체하고 `vsp/` 서브트리가 레포를 떠났다 | ⑵ |
| [`interactive/LICENSE`](../interactive/LICENSE) | **`interactive/` 서브트리 전체** (루트 `LICENSE` 표의 표기 그대로 — 이 칸의 옛 표기 `interactive/core/**`는 실제보다 좁았다) | 차용분이 전부 자체 집필로 치환될 때. ⚠ **지식 갈래는 소진됐으나 `interactive/server/` 아래 차용 36파일이 남는다**(판7-b 판정 — `reference/copy-baseline.md` §3.2). 그 36을 어떻게 할지가 ⑷의 실제 질문이 됐다 | ⑶·⑷ |

컴포넌트 단위 귀속은 [`interactive/THIRD_PARTY_NOTICES.md`](../interactive/THIRD_PARTY_NOTICES.md)가
정본이며, 고지 은퇴는 그 문서의 갱신을 동반한다.

---

## 2. 교체 사다리

### 2.1 순서와 그 이유

```
⑴ SAPKIT Engine 슬림 자작      ← 먼저: 부채가 가장 크고(348 handler 소스·8.3MB 번들),
   │                              실사가 판단 재료를 이미 갖춰 놓았다
   ▼
⑵ 검사기 재작성 (sapkit CLI)   ← ✅ 완료 (2026-08-16 · 판1 · 고지 3→2)
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

**대상**: `interactive/server/server.bundle.cjs`가 제공하는 SAP ADT MCP 도구 표면.
착수 시점의 그 파일은 8.3MB · 소스 정본 `engine/`(TS 559파일 · handler 348파일)이었다.

> **✅ 교체 완료 — 2026-08-19 · 판7-b · D-095.** 그 자리는 이제 자체 저작
> `sapkit-engine` 1.0.0의 번들(3.81MB · 46%)이다. 검증 기준 1~4가 선 뒤에 갈아끼웠고,
> 기준 5(구 번들 현역)의 유지 기간은 **교체 이후로 연장**됐다(D-093 ⓐ) — `engine/`은
> 되돌릴 자리로 남고 은퇴는 **판7.5**다. 아래 기준표는 그 판정의 기록으로 보존한다.

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

**꼬리 재평가 — 짓기 직전 관문의 결과 = 전량 유지** (D-083, 2026-08-14). 위 체크포인트를
그대로 최종 교체 직전까지 두면, 재평가 시점에 꼬리 49종은 **이미 다 지어져 있다** — 그 재평가는
판단이 아니라 추인이 된다. 그래서 오프라인 대량 제작 판이 **짓기 직전**에 관문을 하나 더
세워 목록(삭제 계열 25종 + 그 밖 24종)과 성질을 보고하고 물었고, 사용자가 **전량 제작**을
택했다 — **제외 0종**. 삭제 계열 25종은 재생 대조가 원리상 불가능하므로 요구 증거 급이
`attended 실기`로 대장에 남는다. **「최종 교체 직전 1회」의 자리는 소진되지 않고 그대로
남는다** — 다만 그때 묻는 것은 "짓지 말자"가 아니라 **"표면에서 뺄 것인가"**다(D-083 ⓑ).

**설계 방향**
- 도구는 **수요순으로 만들되 표면은 전량 승계한다** — 실사용 상위부터 짓고, 꼬리와 미사용
  전송·RFC 경로까지 계약을 채운 뒤에 교체한다.
- 안전 3층(권한 allowlist · PreToolUse 훅 · tier 게이트)과 실데이터 2종 상시 게이트는
  현행 계약을 그대로 승계한다 — 자작이 안전 바닥선을 낮추는 근거가 되지 않는다.
- 도구 이름은 현행 표면 이름을 유지한다. 이름을 바꾸면 지식·절차·스킬 전체가 동시에
  깨지고, 그 비용이 자작 이득을 상쇄한다.

**검증 기준 (이 단계의 "됐다") — 2026-08-19 판7-b에서 넷 다 서서 교체했다**
1. **표면 186종 전량**이 **동일 이름·동일 호출 계약**으로 응답한다 — 기존
   [tool-catalog](../interactive/server/tool-catalog/sc4sap-mcp-tools.md) 대조 diff 0.
2. `interactive/scripts/smoke-mcp.mjs`(도구 표면 계약)와
   `conformance-server-gates.mjs`(tier·blocklist·ask)가 **새 엔진에 대해** 통과한다.
3. 실데이터 2종이 새 엔진에서도 프로파일과 무관하게 게이트된다 (음성시험 포함).
4. 실 SAP 대상 손 검증: 대표 절차 1건(예: 프로그램 생성→활성→기계 확인)이
   구·신 엔진에서 **같은 결과**를 낸다.
5. 위 4가 통과할 때까지 **구 번들이 현역**이다 (§3). — **D-093 ⓐ로 유지 기간이 교체
   이후까지 연장됐다**: 현역 자리는 넘겼으나 소스 `engine/`은 롤백 자산으로 남는다.
   되돌리는 법은 **교체 커밋 revert**이고(번들·핀·게이트 기대값이 한 커밋), CI가
   「롤백 번들이 여전히 지어진다」를 매 푸시 확인한다.

#### 마일스톤 체계 M1 잔여부터 M6까지

**층위를 먼저 분명히 한다.** 바로 위 「검증 기준」 5개는 **사다리 ⑴ 전체의 끝 판정**이다 —
구 번들을 새 엔진으로 갈아끼워도 되는가를 묻는 마지막 관문. 아래 M-표는 **그보다 한 층
아래**로, 그 끝 판정에 이르기까지의 제작을 여섯 구간으로 나눈 것이다. **M 하나가 닫히는 것은
그 구간의 증거가 갖춰졌다는 뜻일 뿐 ⑴이 끝났다는 뜻이 아니다** — M2가 닫혀도 ⑴은 그대로
진행 중이다.

> **교체의 관문은 「검증 기준」 1~4다 — M-표는 제작 진도표이지 교체 조건이 아니다**
> (**D-093 ⓐ**, 2026-08-19). 이 문단은 원래 「⑴이 끝나는 것은 **M6까지 전부 닫히고**
> 위 「검증 기준」 1~4가 성립할 때」라고 적었고, 그 읽기를 **D-093 ⓐ가 supersede한다.**
> 이유: M2가 BTP 부재로 봉쇄돼 있고(D-092 ⓑ) 증거 순서가 M1→M6으로 고정돼 있어
> (D-081), M-표를 교체 조건으로 읽으면 **사다리 ⑴이 사용자의 외부 계약 행위에 무기한
> 인질이 된다** — 정작 검증 기준 1~4는 M2 실접속을 요구하지 않는데도 그렇다.
> 그러므로 **⑴의 교체 판정은 검증 기준 1~4만으로 선다.** 꼬리 도구의 증거는 교체 뒤
> 실사용으로 쌓이고, M-표는 제작이 어디까지 왔는지를 재는 진도표로 남는다.
> 기준 5 「구 번들이 현역」은 통과할 항목이 아니라 지켜야 할 조건이며, **D-093 ⓐ가 그
> 유지 기간을 교체 이후로 연장한다** — `engine/` 은퇴는 교체와 **같은 판에 하지 않는다**
> (§3.3의 ⑴ 행과 판7 정의가 그렇게 갈렸다 — 그 판7은 재명명 뒤 **판7-b**다 · D-094 ⓕ).

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

| M | 범위 | 완료 판정 (아래 공통 요건에 더해) | `짓기 완료` | `증거 완료` |
|---|---|---|---|---|
| **M1** | **증거는 판6.1(2026-08-18)에서 전부 섰다.** ⓐ 증거 없던 **12종**이 닫혔다 — 재생 **9종**(`GetInclude` `GetFunctionModule` `GetTable` `GetStructure` `GrepObjects` `UpdateInclude` `UpdateSourceByPatch` `GetInactiveObjects` `GetSqlQuery`) C1 녹화 → C2 재생 대조 · `Create*` **2종** 실기 기록(`CreateProgram`·`CreateInclude`) · **`GetSourceDiff` 1종**은 재생 대상이 아니다(요구 급 `계약 시험` · 기충족 — `build-plan.json`이 기계 정본. 전에 이 셀이 「재생 대상 10종」으로 적은 것이 오기였다). 9+2+1=12. ⓑ **C3 실기** — 대표 절차(프로그램 생성 → 활성 → 반영 확인) 1건 닫힘. | ⓐ M1 도구 **19종 전량**이 **각자의 증거 급**을 갖는다(아래 「증거 급」 참조) — 재생 가능한 것은 정규화 diff 0, `Create*`처럼 재생이 원리상 불가한 것은 attended 실기 기록. ⓑ 대표 절차가 구·신 엔진에서 같은 결과. **→ 이 둘이 닫혀야 M2에 착수한다.** | ✅ (2026-08-12) | **✅ (2026-08-18 · 판6.1 · D-092)** ³ |
| **M2** | **접속 방식 확장** — destination · service-key · broker 인증. `--mcp=<destination>` · `--env=<name>` 통로 구현. | ⓐ destination 프로파일로 **실접속 성공**(inspection-only 강등 아님). ⓑ `--mcp` 진단 `MCP_DESTINATION_UNSUPPORTED`가 더 이상 나오지 않는다. ⓒ 기존 Basic 경로 회귀 0. **→ D15 해소** | **일부** ¹ | ⬜ **열려 있다** |
| **M3** | **전송 + RFC 완성** — HTTP · SSE 전송 2종. RFC `soap`·`native`·`gateway`·`zrfc` 4경로. | **완료 = 전송 3종**(**D-093 ⓑ**, 2026-08-19): ⓐ stdio·HTTP·SSE 각각으로 기동 → 도구 호출 성공 + 전 M 공통 요건. ⓑ RFC 5경로 각각 통로 생성이 계약대로(이미 ✅). — **이월**: `native`·`gateway`·`zrfc` **3경로의 실동작 확인**(옛 ⓒ 포함)은 M3에서 떼어 **교체 판정 시점의 재평가**로 옮겼다. 셋 다 장비·비용·SAP 측 설치가 선행돼야 밟히므로(유료 RFC SDK · 중계 미들웨어 호스트 · SAP 측 핸들러+SICF+FM 설치=P3/P4) M3에 묶어 두면 **M3가 어느 판에서도 닫히지 않는다**. **교체를 막는 조건은 아니다** — 관문은 검증 기준 1~4이고(D-093 ⓐ) 그 넷은 RFC 경로를 요구하지 않는다. 등재는 `sapkit-engine/harness/DIVERGENCES.md` D21·D22 + **`gateway` 신규 등재**. **뼈대는 여기서 끝난다.** | ✅ (2026-08-14) | ⬜ **열려 있다** |
| **M4** | **도구 — 실호출 116종** (§4.7 실사 정본 기준). M1이 이미 지은 것 포함. | 116종 **전량**이 증거 급을 갖는다(아래 「증거 급」 참조) — 원칙은 녹화-재생 정규화 diff 0, `Create*`·`Delete*`는 attended 실기 기록, 의도적 차이 목록 등재분은 **대체 기대 시험** 통과. | ✅ (2026-08-14) | ⬜ **열려 있다** |
| **M5** | **도구 — 나머지 70종** (자산참조만 21 + 꼬리 49 — 앞은 문서가 부르지만 호출 이력이 0인 것, 뒤는 양쪽 증거가 모두 0인 것. §4.7). | ⓐ 70종 전량 **계약 시험 신규 저작** 통과 + 대표 건 attended 실기(증거 급은 아래 「증거 급」 참조 — 이 구간의 주 증거는 재생이 아니라 계약 시험이다). ⓑ **tools/list 186종 전량**이 tool-catalog 대조 **diff 0**. | ✅ (2026-08-14) | ⬜ **열려 있다** |
| **M6** | **교체 직전 관문** — **판정과 재평가의 자리이며, 원칙적으로 새 기능을 짓지 않는다**(아래 예외 참조). | ⓐ **D8 관찰 판정**. ⓑ **D18 해소** — `conformance-server-gates.mjs`의 무접속 거부 분류 어휘를 **구·신 두 문구를 모두 인식하도록 넓힌다.** 신 문구로 *교체*하면 안 된다 — M6 시점엔 아직 구 번들이 현역이라(위 「검증 기준」 5) 교체하는 순간 그쪽 판정이 깨진다. 안 넓히면 교체 후 신 엔진의 정상 거부가 `OTHER`로 떨어져 게이트 판정이 어긋난다. ⓒ **꼬리 49종 재평가 1회 → 새 D-항목**(D-079 ⑧). ⓓ 위 「검증 기준」 1~4 전건 + 실 SAP 대표 절차 구·신 동일 결과. | — ² | — ² |

**`짓기 완료` / `증거 완료` 두 칸은 D-082 ①이 나눈 눈금이다** — 위 정의를 그대로 옮긴 것이고,
`증거 완료`가 서기 전에는 그 M이 닫히지 않는다. **여섯 중 M1 하나가 닫혔다**(판6.1 ·
2026-08-18). 나머지 다섯은 열려 있고, **M2가 BTP 부재로 봉쇄돼 있어 순서 고정(D-081)상
그 뒤 전부가 그 앞에 묶여 있다**(D-092 ⓑ).

> ¹ **M2가 `일부`인 이유.** 오프라인 대량 제작 판이 `--env=<name>`은 **접속까지** 세웠고
> `--mcp=<destination>`은 service key를 읽어 **설정 조립까지**, 브로커는 **저장소 재료까지**
> 갔다. 남은 것은 실접속 미룸이 아니라 **안 지은 코드**다 — UAA 토큰 취득(브라우저 OAuth2
> 왕복)과 그 위의 JWT 접속 계층이 없다(신 엔진 `AdtClient`는 Basic만 다룬다). 그래서 D15는
> 장부에 남아 있고, M2는 `짓기 완료`로도 아직 서지 않았다. 실측 근거는
> [`sapkit-engine/harness/DIVERGENCES.md`](../sapkit-engine/harness/DIVERGENCES.md)의 D15 상태 갱신 절.
>
> **⚠ 갱신 (판5 · 2026-08-18)**: 위 「안 지은 코드」는 **판5에서 지어졌다** — auth 모듈
> 6종 · `ConnectionConfig` 선택 4필드 · `AdtClient`의 Bearer 계층(**D-091 ⓑ** · 세부는
> DIVERGENCES **D116**·**D15 상태 갱신 2차**). **그럼에도 이 행은 `일부`를 유지한다** —
> `짓기 완료` 기준 ⓐ가 실접속 성공이므로 **실접속 검증도 `짓기 완료` 판정도 판6 몫**이다.
>
> ³ **M1 `증거 완료`의 근거.** 판6.1(2026-08-18 · 첫 attended SAP 판)이 세웠다 —
> 재생 판정 파일 **9건**(`sapkit-engine/evidence/replay/`) · `Create*` 2종의 attended 실기
> 기록 · **C3 대표 절차**(사람이 대상 삭제 → 신 엔진이 같은 생성 절차 수행 → 제품 MCP로
> 되읽기·구문 확인). 대장이 **증거 대기 143 → 126 · 증거 있음 43 → 60**으로 움직였고 M1
> 19종이 전부 「증거 있음」이다. **전 M 공통 요건인 CI green도 확인했다** — 커밋 `0495017`
> push 뒤 run `32109411892`가 **5잡 전부 success**. 남은 유보 하나: `GetSourceDiff`는 요구
> 급이 `계약 시험`이라 **실 SAP을 밟지 않았다** — 「19종 증거 있음」과 「19종이 실 SAP을
> 밟았다」는 같은 말이 아니다(D-092 정직 유보 ⓓ).
>
> ² **M6은 판정의 자리라 두 칸이 성립하지 않는다.** 다만 그 안의 「꼬리 49종 재평가 1회」는
> **이미 수행됐다** — 다 지어 버린 뒤의 재평가는 추인이 되므로 짓기 직전으로 앞당겼고,
> 결과는 **전량 유지**다(D-083). D-079 ⑧이 예약한 *교체 직전* 재평가의 자리는 그대로 남는다.

**M1의 증거는 판6.1(2026-08-18)에서 전부 섰다** — 신규 재생 **9종**(`GetInclude`
`GetFunctionModule` `GetTable` `GetStructure` `GrepObjects` `UpdateInclude`
`UpdateSourceByPatch` `GetInactiveObjects` `GetSqlQuery`) 채록·재생 · `CreateInclude`
실기 기록 · C3 실기가 닫혔고, 대장은 **증거 대기 143 → 126 · 증거 있음 43 → 60**이다.
`GetSourceDiff`는 요구 급이 `계약 시험`이라 재생 대상이 아니었다(전에 「재생 대상 10종」으로
적혀 있던 것이 오기다). **다음은 M2인데 그 앞이 막혀 있다** — 아래 M2 각주와 D-092 ⓑ.

- **순서는 M1 → M2 → M3 → M4 → M5 → M6으로 고정한다.** M 안에서의 병행 여부는 지금
  정하지 않는다.
- **116/70 분할의 기준은 이 문서 §4.7의 실사 정본이다.** 실사 수치가 갱신되면 경계도 따라
  움직인다 — M4·M5의 정의는 *수치*가 아니라 *증거 방식*이다.
- **「증거 급」 — 전 M 공통.** 완료 판정의 "전량 재생 diff 0"은 **재생이 가능한 도구에 대한
  것**이다. **`Create*`·`Delete*` 계열은 재생 대상이 아니다** — 재생은 신 엔진이 같은 요청을
  SAP에 다시 던지는 일이라, 생성 시퀀스는 두 번째 실행에서 "이미 있다"로, 삭제 시퀀스는
  "없다"로 실패한다(신 엔진이 옳아도 실패한다). 그래서 그 계열의 증거 급은 **재생이 아니라
  attended 실기 기록**이며, 규칙과 실측 근거의 정본은
  [`sapkit-engine/fixtures/README.md`](../sapkit-engine/fixtures/README.md)다.
  **M1·M4·M5의 "전량"은 이 급 구분을 포함한 전량**이다 — 도구마다 **넷 중 하나**를 갖고
  있으면 된다: ⓐ 재생 정규화 diff 0 · ⓑ **계약 시험** 통과(M5의 주 증거) · ⓒ attended 실기
  기록 · ⓓ 의도적 차이 목록 등재분의 대체 기대 시험. **넷 중 하나도 없는 도구가 있으면 그
  M은 닫히지 않는다.** 급의 정의는 하네스가 기계로 들고 있다(`replay | contract | attended`).

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

**완료 눈금은 두 단계다 — `짓기 완료` / `증거 완료`** (D-082 ①, 2026-08-13). `짓기 완료`는
위 검증 기준 중 **SAP 접속을 요구하지 않는 것이 전부 초록**인 상태(1·2·3 + 기존 제품 게이트
무접촉 + 노출 제어 회귀 0)이고, `증거 완료`는 거기에 **접속을 요구하는 증거**가 붙은
상태다(실사용 표면의 녹화-재생 대조 · 미사용 표면의 대표 건 attended 실기 · 마일스톤별 실 SAP
확인 1건 = 위 검증 기준 4). **`증거 완료`가 되기 전에는 그 마일스톤을 "닫혔다"고 말하지
않는다** — `짓기 완료`를 완료로 쓰는 것이 D-082가 막으려는 오독이며, 오프라인 계약 시험은
**신 엔진이 스스로 정한 기대값을 통과한 것**이지 구 엔진·실 SAP과 같다는 증거가 아니다.
증거를 태우는 **순서**는 여전히 M1 → M2 → … 로 고정돼 있다(D-081 · D-082 ④).

**지금 어디까지 왔나** (2026-08-14 · 오프라인 대량 제작 판 종료 시점 · 병행 제작 경로
`sapkit-engine/` 0.1.0 · **구 부품 무접촉이고 제품은 계속 구 번들로 동작한다**)

| 축 | 현재 | 목표 |
|---|---|---|
| 도구 등록 | **186** | 186 (전량 승계) |
| 전송 | stdio · HTTP · SSE — **3** | 3 |
| RFC 백엔드 | `odata`·`soap`·`native`·`gateway`·`zrfc` — **5** | 5 |
| 인증 통로 | Basic **접속까지** · `--env=<name>` 세션 **접속까지** · `--mcp=<destination>` service-key **설정 조립까지**(UAA 토큰 취득 미구현) · 브로커 **저장소 재료 조립까지** | 4통로 전부 접속 |

- **오프라인 증거**: jest **4,001 통과 / 1 skip**(당시 수 — 판6.1이 시험을 더해 **지금은
  4,153**이다) · 신 엔진 자체 게이트 전종 통과 · 게이트
  음성시험 **44건** · **기존 제품 게이트 8종 무접촉이고 전부 exit 0**(doctor 제외 —
  당시 8종이고 판1에서 `verify-checker`가 더해져 **지금은 9종**이다).
  의도적 차이 장부 `sapkit-engine/harness/DIVERGENCES.md`는 **D1~D132**(예약 결번을 뺀
  실등재 82건).
- **SAP 증거는 이 판에서 하나도 얻지 않았다.** 대장 `sapkit-engine/TOOL-LEDGER.md` 기준
  **안 지음 0 · 지음·증거 대기 143 · 증거 있음 43**이고, 그 **143이 그대로 나중에 태울
  attended 노동량**이다(요구 급 내역: 재생 대조 96 · attended 실기 47). 「증거 있음 43」의
  42종은 요구 급이 `계약 시험`이라 오프라인으로 찬 것이고, 실 SAP을 한 번이라도 밟은 것은
  `CreateProgram` **1종**뿐이다.
- **이 판이 도달한 것은 M2·M3·M4·M5의 `짓기 완료`이고, 네 M 모두 `증거 완료`는 열려 있다.
  M1도 여전히 열려 있다** — 재생 대상 **9종**의 녹화·재생 대조 · `CreateInclude` 실기 · 대표
  절차 실기(C3)가 남았고 **전부 SAP 접속을 요구한다**(D-082 ②·③). 사다리 ⑴은 닫히지
  않았고, 마일스톤 하나도 닫히지 않았다.
  *(정정 — 판6.1: 이 줄은 「재생 대상 10종」으로 적혀 있었다. `GetSourceDiff`는 요구 급이
  `계약 시험`이라 재생 대상이 아니고, 실제 재생 대상은 9종이었다. 이 판의 상태 서술 자체는
  그 시점의 기록으로 그대로 둔다 — M1이 닫힌 것은 판6.1이다.)*

---

### ⑵ 검사기 재작성 — `sapkit` CLI  ✅ **완료 (2026-08-16 · 판1 · D-085)**

> **도달 지점**: `sapkit-cli/`(TypeScript · 런타임 외부 의존 0)가 명령 4종
> (`lint`·`parse`·`analyze`·`check`)으로 구 vsp의 로컬 검사를 대체했고, 그 단일 파일
> 번들이 `interactive/checker/`로 제품에 동봉돼 **설치가 완전 오프라인**이 됐다
> (D-044 유보 ⓑ 해소). `vsp/` 서브트리 **570파일**·배포 경로·CI의 Go 툴체인이 전부
> 떠났고 **고지 3→2**. 아래 검증 기준 1~4는 전부 성립했다 — 근거는 각 항목에.
>
> **되돌릴 수 없는 것**: 구 판정은 이제 다시 뜰 수 없다.
> `sapkit-cli/fixtures/baseline/`(47파일 × 세 표면 = 141칸)과 `harness/RECORDING.md`가
> 「구 vsp가 무엇을 어떻게 판정했는가」의 **유일한 잔존 형태**이며, 코퍼스 대조
> 게이트가 그 기준을 상시 지킨다. 판정을 바꾸는 변경은 그 채록본과
> `sapkit-cli/DIVERGENCES.md`로만 정당화된다.

**대상**: `vsp/` 포크가 담당하던 **로컬(오프라인) ABAP 구문·정합 검사**.

**용도 한정**: MCP를 붙일 수 없는 환경에서 **abapGit 오프라인 반영 전** 로컬 소스를 미리
검사하는 것. SAP 접속 도구가 아니다. 즉 재작성 범위는 vsp 전체가 아니라 **로컬 검사 최소 기능**이다.

**최소 기능(제안 — 착수 시 확정)**
- 파일 단위 ABAP 구문 검사 (`sapkit lint <file>` / `sapkit parse <file>`)
- 프로젝트 단위 정합 검사(인클루드 해석, 참조 미해결 탐지)
- exit code로 판정 가능한 CLI 계약 — 훅·CI가 소비할 수 있어야 한다

**범위 밖**: SAP 접속, 배포, MCP 모드. vsp의 온라인 MCP 모드는 현재도 사용하지 않는다
(`docs/DESIGN.md` §3). 오프라인 분석기 훅 배선(D-049)은 선택 기능이며, 재작성 후에도
같은 지위를 유지한다.

**검증 기준 — 전건 성립 (2026-08-16)**
1. ✅ 같은 코퍼스에서 같은 판정 — 커밋 코퍼스 47파일 × 세 표면 **갈림 0**, 광역 대조
   (구 vsp 내장 샘플 25 + 레포 전체 `.abap` 174)도 **갈림 0**. 독립 리뷰어가 구 vsp를
   직접 빌드해 기준 파일을 보지 않고 재도출한 결과도 같았다. 실 프로젝트 파일은
   이 판에서 코퍼스에 넣지 않았다(공개 레포 · 사용자 확정) — 후속 판에서 로컬 전용 가능.
2. ✅ exit code 계약 — 통과 0 / lint는 Error 심각도만 비-0 / analyze는 수행되면 0 /
   사용·입력 오류 비-0. CI `sapkit-cli` 잡이 **양극**으로 assert한다(통과만 확인하면
   늘 0을 돌려주는 CLI도 통과하므로).
3. ✅ 훅 경고 전용 유지 — 파일명·훅 이벤트를 그대로 둔 채 내부만 번들 spawn으로
   바꿨고, 실제 Edit/Write 흐름 4종으로 「경고는 나오고 차단은 없음」을 실측했다.
   구문·활성의 권위는 서버 `CheckSyntax` + 반영 확인 절차 그대로다.
4. ✅ 은퇴 집행 — `vsp/` 소스·`vsp/LICENSE`·배포 경로(`get-vsp` 계열)·`adapters/vsp/`·
   CI `vsp-build` 잡 제거, 루트 LICENSE 표 갱신. **GitHub 릴리스 자산은 남겼다**
   (야생의 구버전 플러그인이 그 자산을 가리키므로 방치가 하위호환이다).
   사라질 파일에만 있던 RV1~RV4 분류·측정 기록은 삭제 전에
   `docs/reference/audits/`로 옮겼다.

**새로 선 게이트**: 코퍼스 대조(`sapkit-cli/gates/`) · `verify-checker.mjs`(번들 해시 ↔
integrity + 소스 커밋 표류) · 각각의 음성시험. 「통과만 하는 게이트를 만들지 않는다」는
이 레포의 자기 원칙을 새 게이트에도 적용했다.

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

**검증 기준 (2026-08-16 결정 반영 — 조회형)**: 삭제로 끊겼던 **포인터 2곳**이 동봉 조회
체계를 가리키도록 복원될 것 · 그 포인터가 **레포 내부 상대 링크**일 것(외부 URL 신규 노출
0) · `check-links` 0 · 참조하던 절차·지식에서 깨진 참조 0 ·
`interactive/THIRD_PARTY_NOTICES.md` §GPL의 「향후 경로」와 정합.
*(위 세 불릿의 집필 제약은 폐기가 아니라 **보류**다 — 향후 자체 집필이 필요해질 때 그대로
적용된다.)*

> **결정 — 조회를 택했다 (2026-08-16 · `docs/reference/DECISIONS.md` D-086).** 삭제 직전
> 실측에서 그 31파일(10,184줄)을 가리키던 참조는 제품 전체에 **2곳**뿐이었다
> (`create-object.md`의 곁다리 한 문장 · `rap-odata-rules.md`의 짝 문서 한 줄). 지식
> INDEX에도 없었고 정책이 로드하지도 않았으며, 삭제 후 깨진 참조도 0이었다. 실측 수요가
> 사실상 0인 층을 자체 집필로 되싣는 것은 무게의 척도가 세션 토큰·설치 부담이라는
> 원칙(D-040)에 어긋난다. 그래서 **문법 사전을 제품에 다시 싣지 않는다** — 빈자리는
> **조회**로 처리한다.
> **조회처는 이미 동봉된 help.sap.com 조회 체계**다 — 정본
> `interactive/core/procedures/help-portal-fetch.md`(+ 그것이 부르는
> `interactive/tools/fetch/fetch-abap-keyword-doc.mjs` · `fetch-sap-help-doc.mjs`). ABAP
> 문법·키워드는 공식 ABAP Keyword Documentation을 필요할 때 가져와 출처와 함께 답한다.
> 제품에 이미 있고 실동작 검증됐으며, Node 전용에 수동 폴백까지 문서화돼 **3사 하네스
> 중립**이고, 공식 문서라 권위가 높다. 수요 지점에는 **레포 내부 상대 링크만** 남으므로
> 외부 URL 노출도 늘지 않는다 — 앞선 판이 걱정하던 "조회처가 소유자 머신의 로컬 도구라
> 다른 사용자에겐 없다"는 문제가 여기서는 발생하지 않는다.
> 제품에 남는 참조 지식은 **실전에서 확인한 함정 모음**(`knowledge/abap/conventions/`
> 21편)이고, `SAP-samples/abap-cheat-sheets`(Apache-2.0)는 **향후 자체 집필이 필요해질
> 때의 인용 가능 원자료**로 고지 문서에 기록만 남는다(제품 수요 지점에서는 가리키지
> 않는다). 자체 집필과 절충(RAP 1편만 집필)은 기각됐다.
> **이로써 ⑶-a는 닫힌다** — 차용분은 D-074의 삭제로 이미 소진됐고 빈자리 처리까지
> 결정됐으므로, ⑷ 착수 조건의 ⑶-a 전제가 성립한다.

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
>
> **계수 방식 확정 — 2026-08-17 · `docs/reference/DECISIONS.md` D-087.** 위 숙제는 판3.1이
> 닫았다. 잔량 명부의 정본은 [`docs/reference/copy-baseline.md`](reference/copy-baseline.md)
> (총 **170** = 지식 갈래 146 + 지식 폴더 밖 편입분 24 · oop 템플릿 20은 ⑶-c 눈금이라 제외)
> 이고, **잔량 = 명부 총계 − 체크 누계**다. 체크는 **재저작한 파일에만** 찍는다(파일을
> 지워서 갚는 길은 이 규칙에 없다). 찍는 시점은 **독립 새-컨텍스트 리뷰를 통과한 뒤**이고,
> 체크 옆에 재저작 커밋 해시와 리뷰 근거를 병기한다. **명부는 게이트가 아니다** — 위 문단의
> 원칙 그대로 진척은 git 이력과 사람의 판단이 세고, 명부는 그 요약이다.

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
| ⑴ 엔진 **✅ 교체 완료 2026-08-19** | tool-catalog diff 0 · `smoke-mcp` · `conformance-server-gates` · 실데이터 게이트 음성시험 | 대표 절차 1건 구·신 동일 결과 | **교체 판(판7-b)에서는 은퇴 없음** — `engine/` 소스 + 고지의 은퇴는 **교체 이후 별도 판**(D-093 ⓐ · 되돌아갈 자리를 남긴다). 판7-b의 소관분 판정 결과: 서버 결부 copy 39 중 **3만 대체 · 36 잔존**(D-095 ⓔ) |
| ⑵ 검사기 ✅ | 코퍼스 판정 diff 0 · exit code 계약 CI assert **양극** | 훅 배선 후 경고 전용 성격 확인 | ~~`vsp/` 소스 + 고지~~ **은퇴 완료 2026-08-16** |
| ⑶ 지식 | `check-links` 0 · `copy` 잔량 단조 감소(계수 방식 = **D-087** · 명부 [`reference/copy-baseline.md`](reference/copy-baseline.md)) | 구성 독립성 설명 가능 · 소비 절차 동작 | 차용 지식 파일 |
| ⑶-c 템플릿 | 개명 게이트 통과 · 새 템플릿 생성→활성→기계 확인 | — | 옛 이름 템플릿 (SAP 오브젝트는 무접촉) |
| ⑷ 고지 | 명부 잔량 0(증명은 git 이력) **+ 판4(oop 20) + 판7-b 소관분 판정** — 명부는 그 셋을 세지 않는다(**D-087 ③**). **셋 다 섰다(2026-08-19)** | LICENSE 표 ↔ 실제 서브트리 일치 | `interactive/LICENSE` — ⚠ **그 일치 조건이 지금은 성립하지 않는다**: `interactive/server/` 아래 차용 36파일이 남아 판8의 질문이 「은퇴」에서 「36을 어떻게 할 것인가」로 바뀌었다(D-095 ⓔ) |

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

> **재측정 기록 (2026-08-14)**: 최초 기재(2026-08-10)는 **총계 일곱 줄만** 실었다 — 도구별
> 호출 횟수도, 꼬리 49종의 이름도 없었고, §4.6의 재현 방법은 자산 참조 축(§4.1~4.6)만
> 덮었다. 그래서 이 판의 「수요순으로 정렬한다」와 「꼬리를 맨 뒤로 모은다」가 **둘 다 실행
> 불가능**했다. 이번에 **원 창 그대로** 다시 재고 재현 스크립트와 전량 데이터 파일을 함께
> 남긴다. 판단의 뼈대인 두 수(**합집합 137 · 꼬리 49**)는 원 기재와 정확히 같고, 총계 계열은
> 원인이 밝혀진 만큼 어긋난다(§4.7.6). 아래 수치는 전부 재측정본이다.

#### 4.7.1 원본과 측정 방법

**원본**은 이 머신의 하네스 세션 기록 2종이다. SAP MCP 호출은 하네스마다 자기 형식으로 남는다.

| 하네스 | 기록 형식 | jsonl | 창 안 호출 | 호출된 도구 |
|---|---|---:|---:|---:|
| Claude Code | `~/.claude/projects/**/*.jsonl` — assistant 메시지의 `tool_use` 블록 | 619 | 7,541 | 115 |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` — `payload.type = function_call` | 399 | 34 | 4 |
| **계** | | **1,018** | **7,575** | **115** |

- **Codex는 포함한다.** 이 판의 원칙이 3사 하네스 중립이고, 실사용 축이 묻는 것은 *어느
  하네스에서든 실제로 불렸는가*이기 때문이다. 34건은 전부 2026-07-31 하루에 몰려 있고 도구는
  4종(`GetSqlQuery` 30 · `ReadFunctionModule` 2 · `ReadTable` 1 · `GetTypeInfo` 1)뿐이라
  **꼬리와 합집합은 바꾸지 않고 총계만 0.45% 올린다**.
- **Antigravity는 제외한다.** `~/.gemini/antigravity*` 아래에 대화 기록 파일이 **없다**.
  `mcp/sap/*.json`이 있지만 그것은 도구 **스키마 캐시**이지 호출 기록이 아니다.
- **서버 접두어는 시기에 따라 셋이다** — `plugin_sapkit_sap` 6,893 · `plugin_sc4sap_sap` 648 ·
  `sap`(Codex) 34. 하나로 단정하면 9%를 잃는다. 표면 186종에 대응하지 않는 SAP 계열 이름은
  **0건**이었다 — §4.5의 유령 참조에 대응하는 "유령 호출"도 없다는 뜻이다.
- 서브에이전트가 낸 호출 **1,494건을 포함**한다 — 사람이 시킨 일의 일부다. 재개·분기로 두
  파일에 복사된 중복 호출 10건은 호출 id로 뺐고, 깨진 줄 3개는 건너뛰었다. 날짜는 로컬(KST).

#### 4.7.2 재현 방법 (§4.6과 같은 결)

1. 표면 정본 186종 집합을 만든다 — §4.6 1번과 같다.
2. **자산 참조 축을 이 문서에서 파싱한다** — §4.3 표 첫 열(실질 참조 110종)과 §4.4의 A·B
   열거 블록(참조 없음 76종). 둘이 **교집합 0 · 합 186**인지 검산한다(어긋나면 중단).
   §4.4 끝의 「주목할 쌍」 문단은 §4.3 쪽 이름을 인용하므로 잘라내야 한다.
3. 위 기록 원본 2종을 순회하며 창 안의 SAP 호출을 도구별로 센다. 표면 186종에 **대응하는
   이름만** 세고, 대응하지 않는 SAP 계열 이름은 따로 보고한다.
4. **꼬리 = 「참조 없음 76종」 ∩ 「호출 0」**. 합집합 = 186 − 꼬리.

```bash
node sapkit-engine/harness/usage-census.mjs                    # 원 창으로 재측정
node sapkit-engine/harness/usage-census.mjs --from=… --to=…    # 창 변경
```

스크립트는 **완전 오프라인**이며 SAP에 접속하지 않는다. 186종 전량 수치·꼬리 목록·하네스별
내역은 **`sapkit-engine/harness/usage-census.json`** 이 갖는다 — 아래 표는 그 파일의 발췌이고,
기계로 읽을 것은 그 파일이다. 스크립트는 자기검증(186종 누락·중복 0 · 꼬리+합집합=186 ·
`Delete*` 25종 꼬리 포함)에 실패하면 exit 1이다.

> **이 축은 시간이 지나면 다시 잴 수 없다.** Claude Code는 트랜스크립트를 기본 30일만
> 보관한다(`cleanupPeriodDays` 미설정). 재측정 도중에도 정리가 돌아 대상 파일이 661 → 619로
> 줄었다. **커밋된 JSON이 이 창의 유일한 항구 기록이다** — 다음 판은 다시 재는 대신 그 파일을
> 읽어라.

#### 4.7.3 요약 — 재측정본 대 원 기재

| 항목 | 재측정 (2026-08-14) | 원 기재 (2026-08-10) | 차 |
|---|---:|---:|---:|
| 측정 기간 | 2026-07-13 ~ 08-10 | 같음 | — |
| 도구 호출 | **7,575** | 7,441 | +134 |
| — Claude Code 몫 | 7,541 | (구분 없음) | — |
| — Codex CLI 몫 | 34 | (구분 없음) | — |
| 실제 호출된 도구 | **115** | 116 | −1 |
| 자산 참조 110종과의 **합집합** | **137** | 137 | **0** ✅ |
| **양쪽 증거 0 — 꼬리** | **49** | 49 | **0** ✅ |
| — 그중 `Delete*` | **25 / 25** | 25 | 0 |
| 문서는 안 부르는데 호출됨 | **27** | 27 | **0** ✅ |
| 자산은 부르는데 호출 0 | 22 | 21 | +1 |
| 최다 호출 | `GetSqlQuery` **2,690 (35.5%)** | 2,631 (35%) | +59 |
| 세션 — SAP 호출 1회 이상 | **126** | (원 산출법 미상) | — |
| (참고) 창 안에 기록이 남은 대화 | 307 | — | — |
| 원 기재의 「세션 1,081」 | — | 1,081 | **재현 불가** |

#### 4.7.4 클래스별 분포

| 클래스 | 표면 | 호출된 도구 | 호출 | 비중 | 꼬리 |
|---|---:|---:|---:|---:|---:|
| read | 90 | 65 | 3,118 | 41.2% | 12 |
| write | 79 | 38 | 1,581 | 20.9% | 35 |
| runtime | 15 | 10 | 147 | 1.9% | 2 |
| row-data (상시 게이트) | 2 | 2 | **2,729** | **36.0%** | 0 |
| **계** | **186** | **115** | **7,575** | 100% | **49** |

#### 4.7.5 도구별 호출 — 수요순

**상위 40종** — 여기까지가 전체 호출의 **92.8%**다.

| # | 도구 | 클래스 | 호출 | 비중 | 누적 |
|---:|---|---|---:|---:|---:|
| 1 | `GetSqlQuery` | row-data | 2,690 | 35.5% | 35.5% |
| 2 | `GrepObjects` | read | 630 | 8.3% | 43.8% |
| 3 | `UpdateSourceByPatch` | write | 500 | 6.6% | 50.4% |
| 4 | `GetInactiveObjects` | read | 321 | 4.2% | 54.7% |
| 5 | `CheckSyntax` | read | 288 | 3.8% | 58.5% |
| 6 | `GetInclude` | read | 268 | 3.5% | 62.0% |
| 7 | `GetTable` | read | 250 | 3.3% | 65.3% |
| 8 | `ActivateObjects` | write | 213 | 2.8% | 68.1% |
| 9 | `GetFunctionModule` | read | 167 | 2.2% | 70.3% |
| 10 | `UpdateInclude` | write | 154 | 2.0% | 72.4% |
| 11 | `UpdateProgram` | write | 134 | 1.8% | 74.1% |
| 12 | `GetStructure` | read | 108 | 1.4% | 75.6% |
| 13 | `UpdateClass` | write | 101 | 1.3% | 76.9% |
| 14 | `GetClass` | read | 87 | 1.1% | 78.0% |
| 15 | `CreateInclude` | write | 85 | 1.1% | 79.2% |
| 16 | `RuntimeRunProgramWithProfiling` | runtime | 82 | 1.1% | 80.2% |
| 17 | `SearchObject` | read | 74 | 1.0% | 81.2% |
| 18 | `GetProgram` | read | 65 | 0.9% | 82.1% |
| 19 | `UpdateFunctionModule` | write | 60 | 0.8% | 82.9% |
| 20 | `CreateProgram` | write | 58 | 0.8% | 83.6% |
| 21 | `GetDataElement` | read | 49 | 0.6% | 84.3% |
| 22 | `GetUnitTestResult` | read | 44 | 0.6% | 84.9% |
| 23 | `GetClassMethod` | read | 43 | 0.6% | 85.4% |
| 24 | `GetIncludesList` | read | 39 | 0.5% | 85.9% |
| 25 | `GetTableContents` | row-data | 39 | 0.5% | 86.5% |
| 26 | `ReadView` | read | 39 | 0.5% | 87.0% |
| 27 | `RunUnitTest` | runtime | 39 | 0.5% | 87.5% |
| 28 | `GrepPackages` | read | 38 | 0.5% | 88.0% |
| 29 | `GetServiceBinding` | read | 37 | 0.5% | 88.5% |
| 30 | `GetView` | read | 35 | 0.5% | 88.9% |
| 31 | `UpdateView` | write | 35 | 0.5% | 89.4% |
| 32 | `ReadClass` | read | 31 | 0.4% | 89.8% |
| 33 | `CreateClass` | write | 30 | 0.4% | 90.2% |
| 34 | `GetLocalTypes` | read | 30 | 0.4% | 90.6% |
| 35 | `UpdateLocalTestClass` | write | 30 | 0.4% | 91.0% |
| 36 | `GetDomain` | read | 29 | 0.4% | 91.4% |
| 37 | `GetSystemInfo` | read | 29 | 0.4% | 91.8% |
| 38 | `GetBehaviorDefinition` | read | 27 | 0.4% | 92.1% |
| 39 | `GetTypeInfo` | read | 27 | 0.4% | 92.5% |
| 40 | `UpdateTable` | write | 27 | 0.4% | 92.8% |

**나머지 호출 75종** — 수요순, 합쳐서 **543회(7.2%)**다.

`GetLocalTestClass` 26 · `ReadTable` 25 · `GetAtcFindings` 24 · `UpdateBehaviorDefinition` 23 ·
`ReadProgram` 22 · `GetProgFullCode` 20 · `GetGuiStatusList` 19 · `GetPackageContents` 18 ·
`GetScreensList` 14 · `GetTransport` 14 · `ReadBehaviorDefinition` 14 · `ReadFunctionModule` 14 ·
`ReadTextElementsBulk` 14 · `CreateView` 13 · `ListTransports` 13 · `GetMetadataExtension` 12 ·
`GetWhereUsed` 12 · `RuntimeListDumps` 12 · `UpdateLocalTypes` 12 · `CreateFunctionModule` 11 ·
`GetFunctionGroup` 11 · `UpdateBehaviorImplementation` 10 · `UpdateClassMethod` 10 ·
`UpdateMetadataExtension` 9 · `CreateStructure` 8 · `GetUnitTest` 8 · `ReadServiceDefinition` 8 ·
`GetTextElement` 6 · `GetTransaction` 6 · `RuntimeRunClassWithProfiling` 6 · `CreateDataElement` 5 ·
`CreateDomain` 5 · `CreateServiceBinding` 5 · `GetObjectStructure` 5 · `GetSession` 5 ·
`GetUnitTestStatus` 5 · `ReadDomain` 5 · `ReadMetadataExtension` 5 · `UpdateServiceBinding` 5 ·
`UpdateServiceDefinition` 5 · `UpdateStructure` 5 · `CreateServiceDefinition` 4 · `CreateTable` 4 ·
`CreateTransport` 4 · `GetGuiStatus` 4 · `GetPackage` 4 · `GetScreen` 4 ·
`ReadBehaviorImplementation` 4 · `WriteTextElementsBulk` 4 · `CreateBehaviorDefinition` 3 ·
`DescribeByList` 3 · `GetInstalledComponents` 3 · `ListServiceBindingTypes` 3 · `ReloadProfile` 3 ·
`CreateBehaviorImplementation` 2 · `CreateMetadataExtension` 2 · `GetBehaviorImplementation` 2 ·
`GetServiceDefinition` 2 · `ReadGuiStatus` 2 · `ReadScreen` 2 · `CreateFunctionGroup` 1 ·
`CreateGuiStatus` 1 · `CreateScreen` 1 · `CreateTextElement` 1 · `GetAbapSystemSymbols` 1 ·
`GetInterface` 1 · `PatchGuiStatus` 1 · `ReadDataElement` 1 · `ReadServiceBinding` 1 ·
`ReadStructure` 1 · `RuntimeAnalyzeProfilerTrace` 1 · `RuntimeGetGatewayErrorLog` 1 ·
`RuntimeGetProfilerTraceData` 1 · `RuntimeListProfilerTraceFiles` 1 · `ValidateServiceBinding` 1

**호출 0 — 71종.** 두 무리로 갈린다.

**⒜ 꼬리 49종 — 자산 참조도 0 · 호출도 0** (사다리 ⑴의 판단 재료)

- *write 35종* — `Delete*` 25종 전부: `DeleteBehaviorDefinition` `DeleteBehaviorImplementation`
  `DeleteCdsUnitTest` `DeleteClass` `DeleteDataElement` `DeleteDomain` `DeleteFunctionGroup`
  `DeleteFunctionModule` `DeleteGuiStatus` `DeleteInclude` `DeleteInterface`
  `DeleteLocalDefinitions` `DeleteLocalMacros` `DeleteLocalTestClass` `DeleteLocalTypes`
  `DeleteMetadataExtension` `DeleteProgram` `DeleteScreen` `DeleteServiceBinding`
  `DeleteServiceDefinition` `DeleteStructure` `DeleteTable` `DeleteTextElement` `DeleteUnitTest`
  `DeleteView` — 그리고 `CreateCdsUnitTest` `CreatePackage` `CreateUnitTest` `UpdateCdsUnitTest`
  `UpdateDataElement` `UpdateDomain` `UpdateFunctionGroup` `UpdateLocalDefinitions`
  `UpdateLocalMacros` `UpdateUnitTest`
- *read 12종* — `GetAdtTypes` `GetBadiImplementations` `GetCallGraph` `GetCdsUnitTest`
  `GetCdsUnitTestResult` `GetCdsUnitTestStatus` `GetNodeStructureLow` `GetObjectNodeFromCache`
  `GetObjectStructureLow` `GetObjectsList` `GetVirtualFoldersLow` `ReadPackage`
- *runtime 2종* — `RuntimeListFeeds` `RuntimeListSystemMessages`

**⒝ 자산은 부르는데 호출 0 — 22종** (꼬리가 **아니다** — 한쪽 증거가 있다)

`CreateInterface` `GetAbapAST` `GetAbapSemanticAnalysis` `GetEnhancementImpl` `GetEnhancementSpot`
`GetEnhancements` `GetLocalDefinitions` `GetLocalMacros` `GetObjectInfo` `GetObjectsByType`
`GetPackageTree` `GetSourceDiff` `ReadFunctionGroup` `ReadInterface` `ReleaseTransport`
`RuntimeAnalyzeDump` `RuntimeCreateProfilerTraceParameters` `RuntimeGetDumpById` `UpdateGuiStatus`
`UpdateInterface` `UpdateScreen` `UpdateTextElement`

#### 4.7.6 원 기재와 어긋난 곳 — 확인된 원인

**총계 +134**는 두 갈래다.

- **Codex 34건** — 원 기재에는 하네스 구분이 없어 세지 않은 것으로 보인다(§4.7.1).
- **Claude 쪽 +100** — 원 §4.7이 실린 커밋은 2026-08-10 15:40(KST)이고, **그 시각 이후 같은
  날 발생한 호출이 125건**이다(08-10 총 184건 중 15:40 이전은 59건). 반대 방향으로, 창 앞
  이틀(07-13·07-14)의 기록은 30일 보존 정책에 걸려 **이미 지워졌다** — 생존 최초 호출이
  2026-07-15 11:36(KST)이다. 7,541 − 125 = 7,416이므로 **소실된 이틀 몫은 약 25건**으로
  추정된다(125 − 25 = 100).

**호출된 도구 −1**의 정체는 `GetObjectInfo` **한 종**이다. 창을 08-13까지 넓히면 이 도구가
1회 호출로 다시 나타나 116종이 된다 — 원 기재 시점에는 소실된 이틀에 호출 기록이 있었던
것으로 보인다. 같은 이유로 「자산은 부르는데 호출 0」이 21 → 22가 됐다. **꼬리는 영향받지
않는다** — `GetObjectInfo`는 자산 참조가 있어 애초에 꼬리 후보가 아니다.

**세션 1,081은 재현하지 못했다.** 원 산출법이 남아 있지 않다. 재측정이 셀 수 있는 것은 창
안에서 SAP 도구를 부른 대화 **126개**와 창 안에 기록이 남은 대화 **307개**이며, 어느 쪽도
1,081과 자릿수가 맞지 않는다. 세션 파일 총수를 센 것으로 짐작되나(그 수는 보존 정리로 계속
줄어든다) 확인할 길이 없다. **이 행의 정본은 재측정본으로 옮긴다.**

읽어야 할 신호 넷. ⓐ **호출 3건 중 1건이 행 데이터 조회다**(row-data 2종 36.0%) — 실데이터
2종의 상시 게이트가 장식이 아니라 주 경로 위에 있다는 실측이며, 자작 엔진에서도 이 게이트가
1순위 계약이다(§2 ⑴ 검증 기준 3). ⓑ **수요는 극단적으로 앞에 쏠려 있다** — 상위 20종이
83.6%, 상위 40종이 92.8%이고 나머지 75종이 나눠 갖는 것은 543회(7.2%)뿐이다. 「수요순으로
만든다」가 말장난이 아니라는 근거가 이 분포다. ⓒ §4.2가 "참조 없음 **76종**"으로 잡았던
집합이 실사용 축과 겹치며 **49종으로 줄었다** — 나머지 27종은 문서가 안 부를 뿐 사람이 쓰고
있었다. 반대 방향도 있다 — **자산이 부르는데 한 번도 호출되지 않은 도구가 22종**이다. 두 축
어느 쪽도 단독으로는 "쓰인다"의 답이 아니라는 뜻이다. ⓓ **write 79종 중 38종만 불렸고, 꼬리
49종의 71%(35종)가 write다** — §4.2가 자산 참조만으로 잡았던 신호를 실사용 축이 같은 방향으로
확인한다. `Delete*` 25종은 **양쪽 축 모두 0**이다.

그 49종은 사다리 ⑴에서 **제외 대상이 아니라 재평가 대상이다** — 표면은 전량 승계하고
(⑴ 절 · D-079 ②), 재평가는 **최종 교체 직전 1회**에 몰아 둔다(D-079 ⑧).

**측정 한계**: 소유자 1인 · 머신 1대 · 4주의 기록이다. 다른 사용자의 분포는 다를 수 있고,
호출 0이 "필요 없음"의 증명이 아닌 것은 §4.4 서두의 단서와 같다. 여기에 둘을 더한다 —
ⓐ 창 앞 이틀은 보존 정책으로 이미 소실됐고, ⓑ 원 기재 시점 이후 발생분이 포함돼 있어
**원 기재와 총계를 1:1로 맞출 수는 없다**. 일치를 요구할 수 있는 것은 두 축의 교차 결과
(합집합 137 · 꼬리 49)이며, 그것은 일치한다.

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
