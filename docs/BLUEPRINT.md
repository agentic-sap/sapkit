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
   │                              실사 결과가 이미 범위를 좁혀 놓았다
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
"무엇을 자작해야 하는가"의 시작 후보군을 이미 확정했다. ⑶은 코드 부품과 독립이므로
⑴·⑵와 시간상 병행할 수 있고, 순서상 뒤에 두는 것은 완료가 가장 늦기 때문이다.

---

### ⑴ SAPKIT Engine 슬림 자작

**대상**: 현재 `interactive/server/server.bundle.cjs`(8.3MB, 소스 정본 `engine/` — TS 559파일,
handler 348파일)가 제공하는 SAP ADT MCP 도구 표면.

**시작 후보군**: **§4 도구 실사 결과가 결정한다.** 실측 표면 186종 중 제품 자산이 실제로
지시하는 것은 **109종**이고, 나머지 77종은 생성된 권한 allowlist와 훅 분류 열거에만 등장한다
(§4.4). 그 109종이 자작 엔진의 **시작 후보군**이다.

> **도구 수 목표치를 사전에 못박지 않는다.** 109는 "현 자산이 지시하는 도구"의 실측치이지
> 자작 엔진의 목표 규모가 아니다. 최종 수는 착수 시점의 재실사와 통합·분해 판단이 정한다
> (예: 같은 오브젝트의 `Get*`/`Read*` 쌍은 하나로 합쳐질 수 있고, 반대로 절차가 요구하는
> 조합이 새 도구를 부를 수도 있다).

**설계 방향(제안 — 착수 시 확정)**
- 도구 표면은 **절차가 부르는 것부터** 만든다. 표면 전체를 이식하지 않는다.
- 안전 3층(권한 allowlist · PreToolUse 훅 · tier 게이트)과 실데이터 2종 상시 게이트는
  현행 계약을 그대로 승계한다 — 자작이 안전 바닥선을 낮추는 근거가 되지 않는다.
- 도구 이름은 현행 표면 이름을 유지한다. 이름을 바꾸면 지식·절차·스킬 전체가 동시에
  깨지고, 그 비용이 자작 이득을 상쇄한다.

**검증 기준 (이 단계의 "됐다")**
1. 시작 후보군에 든 도구가 **동일 이름·동일 호출 계약**으로 응답한다 — 기존
   [tool-catalog](../interactive/server/tool-catalog/sc4sap-mcp-tools.md) 대조 diff 0.
2. `interactive/scripts/smoke-mcp.mjs`(도구 표면 계약)와
   `conformance-server-gates.mjs`(tier·blocklist·ask)가 **새 엔진에 대해** 통과한다.
3. 실데이터 2종이 새 엔진에서도 프로파일과 무관하게 게이트된다 (음성시험 포함).
4. 실 SAP 대상 손 검증: 대표 절차 1건(예: 프로그램 생성→활성→기계 확인)이
   구·신 엔진에서 **같은 결과**를 낸다.
5. 위 4가 통과할 때까지 **구 번들이 현역**이다 (§3).

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
**이 판의 별도 작업이 제거로 해소한다** — 청사진이 다루는 것은 그 **빈자리를 무엇으로 채우는가**다.

- 원자료는 `SAP-samples/abap-cheat-sheets`(Apache-2.0)로 공개돼 있다.
- **선별·순서·구성부터 새로 한다.** 항목 배열을 그대로 두고 문장만 바꾸는 것은 재작성이 아니라
  편집 저작물의 파생이다 — 이 구분이 이 갈래의 핵심 제약이다.
- 우선순위는 "빠진 것 전부"가 아니라 **절차·스킬이 실제로 참조하던 주제**부터다.

**검증 기준**: 원자료 인용은 있되 상류 편집 저작물의 목차·선별과 대조해 구성 독립성이
설명 가능할 것 · `check-links` 0 · 참조하던 절차·스킬에서 깨진 참조 0.

#### ⑶-b copy 지식 점진 치환

[`interactive/MIGRATION-MANIFEST.md`](../interactive/MIGRATION-MANIFEST.md)에서 `class: copy`로
분류된 차용분을 자체 집필로 바꾼다.

- **실전 검증 내용이 우선이다.** 실사용에서 맞다고 확인된 지식이 먼저 자기 문장을 얻는다.
- 한 번에 다 바꾸지 않는다 — 파일 단위로 치환하고, 치환된 파일은 분류를 갱신한다
  (분류 변경은 `MIGRATION-MANIFEST.md` 수정으로만).

**검증 기준**: 파일 단위로 `check-migration-snapshot` 통과 유지 · 치환 후 해당 지식을
소비하는 절차가 여전히 동작 · `copy` 잔량이 단조 감소.

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

**검증 기준**: `MIGRATION-MANIFEST.md`에 `class: copy` 잔량 0 · 스냅샷 게이트 통과 ·
루트 LICENSE 표와 실제 서브트리 상태가 일치.

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
| ⑶ 지식 | `check-links` 0 · `check-migration-snapshot` 통과 · `copy` 잔량 단조 감소 | 구성 독립성 설명 가능 · 소비 절차 동작 | 차용 지식 파일 |
| ⑶-c 템플릿 | 개명 게이트 통과 · 새 템플릿 생성→활성→기계 확인 | — | 옛 이름 템플릿 (SAP 오브젝트는 무접촉) |
| ⑷ 고지 | `copy` 잔량 0 · 스냅샷 게이트 | LICENSE 표 ↔ 실제 서브트리 일치 | `interactive/LICENSE` |

---

## 4. 도구 실사 (2026-08-09 실행)

### 4.1 방법

**조사 대상**(제품 자산 전수, 읽기 전용): `interactive/core/`(지식·페르소나·절차·정책) ·
`interactive/skills/` · `interactive/adapters/`(훅 포함) — **315파일**.

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
| 제품 자산이 **실질 참조**하는 도구 | **109** |
| 실질 참조 없음 (생성 allowlist·훅 분류 열거에만 등장) | **77** |
| **유령 참조** (참조되지만 표면에 없는 이름) | **1** ⚠ |
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
| read | 90 | 59 | 31 |
| write | 79 | 37 | 42 |
| runtime | 15 | 11 | 4 |
| row-data (상시 게이트) | 2 | 2 | 0 |
| **계** | **186** | **109** | **77** |

읽어야 할 신호: **write 79종 중 절반 이상(42종)이 어떤 절차도 부르지 않는다.** 그 42종은
대부분 `Delete*` 25종과 세분화된 `Update*` 계열이다 — 사다리 ⑴에서 "무엇을 안 만들 것인가"의
1순위 재료다.

### 4.3 사용 도구 집합 — 실질 참조 109종

참조처 경로 약칭: `proc/` = `interactive/core/procedures/` · `pol/` = `interactive/core/policies/` ·
`persona/` = `interactive/core/personas/` · `know/` = `interactive/core/knowledge/` ·
`skill/` = `interactive/skills/` · `adapter/` = `interactive/adapters/`.
"참조" 열은 `총 등장 횟수 / 파일 수`(열거원 제외).

#### 4.3.1 read — 59종

| 도구 | 용도 | 대표 참조처 | 참조 |
|---|---|---|---:|
| `CheckSyntax` | SAP에 쓰지 않고 구문만 검사 (class/program/include) | proc/create-program.md ; pol/verification-policy.md | 26 / 15 |
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
| `GetInactiveObjects` | 미활성(활성화 대기) 오브젝트 목록 | proc/create-object.md ; proc/troubleshooting.md | 35 / 15 |
| `GetInclude` | 인클루드 소스 조회 | proc/program-to-spec.md ; know/modules/Ariba/workflows.md | 10 / 9 |
| `GetIncludesList` | 프로그램의 인클루드 재귀 목록 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `GetInterface` | 인터페이스 정의 조회 | proc/analyze-code.md ; proc/analyze-cbo-obj.md | 4 / 3 |
| `GetLocalDefinitions` | 클래스 로컬 정의부 소스 조회 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `GetLocalMacros` | 클래스 로컬 매크로 소스 조회 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `GetLocalTestClass` | 클래스 로컬 테스트 클래스 소스 조회 | proc/program-to-spec.md ; proc/troubleshooting.md | 3 / 2 |
| `GetLocalTypes` | 클래스 로컬 타입 소스 조회 | proc/program-to-spec.md ; proc/troubleshooting.md | 4 / 2 |
| `GetMetadataExtension` | 메타데이터 익스텐션 정의 조회 | proc/program-to-spec.md ; proc/compare-programs.md | 3 / 2 |
| `GetObjectInfo` | 오브젝트 트리 구조 (DEVC/CLAS/PROG/FUGR) | proc/analyze-symptom.md ; proc/program-to-spec.md | 16 / 10 |
| `GetObjectsByType` | 타입별 오브젝트 일괄 조회 | know/abap/conventions/naming-conventions.md ; proc/analyze-cbo-obj.md | 2 / 2 |
| `GetPackage` | 패키지 메타데이터 조회 | proc/create-object.md ; proc/analyze-cbo-obj.md | 10 / 6 |
| `GetPackageContents` | 패키지 내 오브젝트 평면 목록 | proc/analyze-cbo-obj.md ; persona/sap-stocker.md | 4 / 3 |
| `GetPackageTree` | 하위 패키지 포함 트리 구조 | proc/analyze-cbo-obj.md ; persona/sap-stocker.md | 3 / 2 |
| `GetProgFullCode` | 인클루드 포함 프로그램 전체 코드 | proc/analyze-code.md ; proc/program-to-spec.md | 7 / 5 |
| `GetProgram` | 프로그램 정의·소스 조회 | proc/analyze-code.md ; proc/review-checklist.md | 10 / 8 |
| `GetScreen` | 화면(Dynpro) 정의·플로우 로직 조회 | proc/compare-programs.md ; proc/review-checklist.md | 6 / 3 |
| `GetScreensList` | 프로그램의 화면 목록 | proc/program-to-spec.md ; proc/compare-programs.md | 3 / 2 |
| `GetSession` | ADT 세션 ID·상태 획득 (재사용용) | proc/troubleshooting.md ; proc/analyze-symptom.md | 13 / 3 |
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
| `ReadClass` | 클래스 소스·메타 읽기 | proc/analyze-symptom.md ; proc/program-to-spec.md | 8 / 5 |
| `ReadFunctionGroup` | 펑션 그룹 소스·메타 읽기 | proc/compare-programs.md | 1 / 1 |
| `ReadFunctionModule` | 펑션 모듈 소스·메타 읽기 | proc/analyze-symptom.md ; proc/program-to-spec.md | 5 / 3 |
| `ReadInterface` | 인터페이스 소스·메타 읽기 | proc/analyze-symptom.md ; proc/program-to-spec.md | 2 / 2 |
| `ReadProgram` | 프로그램 소스·메타 읽기 | proc/analyze-symptom.md ; proc/analyze-code.md | 4 / 2 |
| `ReadScreen` | 화면 플로우 로직·필드 읽기 | proc/program-to-spec.md | 1 / 1 |
| `ReadServiceBinding` | 서비스 바인딩 소스·메타 읽기 | proc/program-to-spec.md | 2 / 1 |
| `ReadServiceDefinition` | 서비스 정의 소스·메타 읽기 | proc/program-to-spec.md | 2 / 1 |
| `ReadTextElementsBulk` | 텍스트 요소 전량 1회 읽기 (TPOOL RFC) | proc/review-checklist.md ; know/abap/conventions/text-element-rule.md | 3 / 2 |
| `ReadView` | 뷰(CDS) 소스·메타 읽기 | proc/program-to-spec.md ; proc/compare-programs.md | 3 / 2 |
| `SearchObject` | 이름·와일드카드로 오브젝트 존재·위치 검색 | proc/troubleshooting.md ; proc/install-sap-assets.md | 52 / 18 |

#### 4.3.2 write — 37종

| 도구 | 용도 | 대표 참조처 | 참조 |
|---|---|---|---:|
| `ActivateObjects` | 다건 오브젝트 일괄 활성화 | proc/create-object.md ; pol/verification-policy.md | 22 / 13 |
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
| `CreateView` | CDS 뷰 / 클래식 뷰 생성 | proc/create-object.md | 2 / 1 |
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
| `GetSqlQuery` | ADT Data Preview 경유 SELECT 실행 | pol/data-protection/data-extraction-policy.md ; proc/troubleshooting.md | 52 / 26 |
| `GetTableContents` | 테이블·CDS 뷰 행 데이터 미리보기 | adapter/codex/README.md ; persona/sap-stocker.md | 51 / 23 |

이 2종의 참조 다수는 **호출 지시가 아니라 금지·승인 절차 서술**이다. 자작 엔진에서도
표면에는 남기되 게이트를 승계한다 (§2 ⑴ 검증 기준 3).

### 4.4 실질 참조 없음 — 77종 (사다리 ⑴ 판단 재료)

**아래 목록은 "제거 결정"이 아니라 "검토 대상"이다.** 참조가 없다는 것은 현 자산이 지시하지
않는다는 뜻일 뿐, 필요 없다는 증명이 아니다 (예: `GetSourceDiff`는 기계 확인에 유용하지만
아직 어떤 절차도 부르지 않는다 — 자작 시 **넣을** 후보일 수 있다).

**A. 생성된 권한 allowlist에만 등장 — 61종**

`Delete*` 25종: `DeleteBehaviorDefinition` `DeleteBehaviorImplementation` `DeleteCdsUnitTest`
`DeleteClass` `DeleteDataElement` `DeleteDomain` `DeleteFunctionGroup` `DeleteFunctionModule`
`DeleteGuiStatus` `DeleteInclude` `DeleteInterface` `DeleteLocalDefinitions` `DeleteLocalMacros`
`DeleteLocalTestClass` `DeleteLocalTypes` `DeleteMetadataExtension` `DeleteProgram` `DeleteScreen`
`DeleteServiceBinding` `DeleteServiceDefinition` `DeleteStructure` `DeleteTable` `DeleteTextElement`
`DeleteUnitTest` `DeleteView`

read 계열 31종: `GetAbapSystemSymbols` `GetAdtTypes` `GetBadiImplementations` `GetBehaviorDefinition`
`GetCallGraph` `GetCdsUnitTest` `GetCdsUnitTestResult` `GetCdsUnitTestStatus` `GetClassMethod`
`GetInstalledComponents` `GetNodeStructureLow` `GetObjectNodeFromCache` `GetObjectStructure`
`GetObjectStructureLow` `GetObjectsList` `GetServiceBinding` `GetServiceDefinition` `GetSourceDiff`
`GetTransaction` `GetTypeInfo` `GetUnitTest` `GetVirtualFoldersLow` `GrepPackages`
`ListServiceBindingTypes` `ReadDataElement` `ReadDomain` `ReadGuiStatus` `ReadMetadataExtension`
`ReadPackage` `ReadStructure` `ReadTable`

write 1종: `UpdateClassMethod`

runtime 4종: `RuntimeGetGatewayErrorLog` `RuntimeListFeeds` `RuntimeListSystemMessages`
`ValidateServiceBinding`

(25 + 31 + 1 + 4 = 61)

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

### 4.5 유령 참조 — 1건 ⚠

| 참조된 이름 | 위치 | 실제 표면 | 성격 |
|---|---|---|---|
| `CreateCdsView` | `interactive/core/knowledge/modules/PS/workflows.md:80` | 없음 (표면은 `CreateView`) | 오탈 |

같은 파일 82행은 `UpdateView`를 정확히 쓰고 있어 80행만 어긋난다. **이 문서는 실사 기록이므로
고치지 않고 등재만 한다** — 수정은 문서를 소유한 작업의 몫이다.

이 1건을 제외하면 유령 참조 0건이며, `mcp__*__` 풀네임 표기 중 표면에 없는 이름은 **0건**이다.

### 4.6 실사 재현 방법

1. 표면 정본 집합을 만든다: `interactive/server/tool-catalog/sc4sap-mcp-tools-{read,write,runtime}.md`의
   `- \`Name\`` 목록 + 섹션 파일에서 의도적으로 제외된 `GetTableContents`·`GetSqlQuery` 2종.
2. `interactive/provenance/mcp-surface.json`의 `expositions.default.names`·`readonly.names`가
   1의 부분집합인지 확인한다 (차집합 0이어야 한다).
3. `interactive/core/` · `interactive/skills/` · `interactive/adapters/`를 순회하며 §4.1의
   동사 접두어 PascalCase 토큰을 추출한다.
4. 1에 없는 토큰 = 유령 참조 후보(문맥 확인 필요 — ABAP 컬럼명·글롭 표기가 섞인다).
   1에 있으나 열거원 밖 참조가 0인 이름 = §4.4 목록.

**이번 실사의 오탐 3건**(수동 배제): `ReleaseState`(ABAP DDIC 컬럼명) ·
`RuntimeRun`(`RuntimeRun*` 글롭·`RuntimeRun{Program,Class}WithProfiling` 축약 표기) ·
`CreateCdsView`(이것만 진짜 유령 — §4.5).

---

## 5. 이 판에서 하지 않는 것

| 항목 | 지위 |
|---|---|
| SAPKIT Engine 제작 | 등재만 — 착수는 별도 결정 |
| 검사기 재작성 | 등재만 |
| 지식 재저작 · 템플릿 재생성 | 등재만 |
| 릴리스 자산 재발행 | 등재만 |
| `CreateCdsView` 오탈 수정 (§4.5) | 이 문서 소유 아님 — 문서 현행화 작업의 몫 |
| GPL 31파일 제거 | 이 판의 **별도 작업**이 수행 |
| ENGINE(final-harness 루프) 재개 | D-040 template-only 유지 — 이 청사진과 무관 |
