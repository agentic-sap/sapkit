# RUN-PLAN — 사다리 완주 판 큐 (판 순서·상태의 단일 정본)

> **지위**: renew 2차(사다리 완주)의 **판 큐 정본**. 전략 결정 = D-084(짓기 우선 ·
> SAP 증거는 최종 테스트 판으로 이연). 계획 근거 = `docs/BLUEPRINT.md`(사다리 ⑴~⑷ ·
> §3 무중단 교체 규칙). 이 문서는 **큐만** 든다 — 도구 증거 수는
> `sapkit-engine/TOOL-LEDGER.md`, 마일스톤 눈금은 BLUEPRINT M-표, 세션 상태는
> `HANDOFF.md`가 정본이다(수치 복제 금지).
>
> **왜 이 문서인가**: 판마다 dryforge `/ready`→`/go`를 돌리면 3-doc은
> `.dryforge/`(머신 로컬 · 비추적)에 아카이브돼 **다음 판이 맥락을 잃는다.**
> 판 사이의 맥락은 아카이브가 아니라 **이 파일(git 정본)** 이 든다 — 어느 머신,
> 어느 세션에서든 이 파일 하나로 "지금 어느 판, 다음 판이 무엇"이 복원된다.

## 사용법 — 판 하나의 수명

1. **시작**: `/dryforge:ready docs/RUN-PLAN.md 판N` — 이 파일과 판 번호를 입력으로
   넘긴다. ready가 해당 브리프를 읽고 그 판의 「열린 결정」을 물은 뒤 3-doc을 만든다.
2. 3-doc 승인 후 같은 세션에서 `/dryforge:go` 실행.
3. **판의 완료 조건에 이 표의 상태 갱신 + `HANDOFF.md` 재개점 갱신이 포함된다**
   (갱신까지가 작업의 일부). 굵직한 결정이 나왔으면 `DECISIONS.md` append.
4. 다음 판 = 표의 다음 `대기` 행. 순서를 바꾸려면 **이 표를 먼저 고치고** 시작한다.
5. 머신 참고: 새 머신에서 첫 판을 열기 전 `.dryforge/status.json` 존재를 확인한다
   (없으면 `{"initialized": true}`로 생성 — 없으면 ready가 신규 프로젝트로 오판한다).

## 불변 레일 (모든 판 공통 — 어기면 중단)

- **교체·고지 은퇴는 검증 뒤에만**(BLUEPRINT §3.2) — 판7·판8은 판6 완료가 전제다.
- **SAP 증거는 파일이 센다**(`sapkit-engine/evidence/` · 대장) — "써보니 됨"은 증거가
  아니다. 기준을 낮추려면 별도 D-항목으로 낮춘다(판6 브리프 참조).
- 증거를 태우는 **순서 M1→M6은 불변**(D-081 · D-082 ④) — 이연됐을 뿐 재배열이 아니다.
- 안전 정책은 일정과 무관한 상시 정책 — P2 건별 승인 · DEV-only write ·
  연습 대상은 반드시 새로 만든다(픽스처는 PUBLIC 레포로 나간다).

## 판 큐

| 판 | 사다리 | 이름 | SAP | 상태 |
|---|---|---|---|---|
| 판1 | ⑵ | 검사기 `sapkit` CLI 자작 + 코퍼스 대조 | 불필요 | **완료** (2026-08-16 · `bd826187` 은퇴 커밋) |
| 판2 | ⑶-a | GPL 빈자리 처리 — **조회** 결정 + 집행 | 불필요 | **완료** (2026-08-16 · `33bcb290` 결정 기록 커밋) |
| **판3.x** | ⑶-b | copy 지식 치환 (반복 판 — 실전 검증분부터) | 불필요 | **진행** — 판3.1·3.2·3.3 **완료** (판3.3: 2026-08-17) · 잔량 **120**/170 · 다음 = 판3.4 |
| 판4 | ⑶-c | ZRSC4SAP 템플릿 20파일 재생성 (집필분) | 불필요 (SAP 확인은 판6) | 대기 |
| 판5 | ⑴ | 엔진 잔여 코드 — M2 인증(UAA·JWT) + 교체 전 필수(D18·keyring CI) | 불필요 | 대기 |
| 판6.x | ⑴·⑶ | **최종 테스트 판** — M1→M6 증거 + 판4 템플릿 SAP 확인 + 실사용 겸 채록 | **필요 (attended)** | 대기 |
| 판7 | ⑴ | 교체(swap) + `engine/` 은퇴 — 고지 2→1건 | 불필요 (전제 = 판6) | 대기 |
| 판8 | ⑷ | `interactive/` 고지 은퇴 — 고지 0건 | 불필요 (전제 = ⑶ 소진) | 대기 |

판1과 판2~4는 병행 가능하다(⑶은 코드 부품과 독립 — BLUEPRINT §2.1). 판5는 판6 전이면
아무 때나. 상태 값: `대기` / `다음` / `진행` / `완료(날짜 · 커밋)`.

## 판별 브리프

### 판1 — ⑵ 검사기 `sapkit` CLI 자작 — **완료 (2026-08-16)**

**도달점**: `sapkit-cli/`(TypeScript · 런타임 외부 의존 0)가 구 `vsp/`의 로컬 검사를
대체했고, 그 번들이 `interactive/checker/`로 제품에 동봉돼 **설치가 완전 오프라인**이
됐다. `vsp/` 서브트리 **570파일**과 배포 경로가 삭제됐고(은퇴 커밋의 총 삭제 577 =
서브트리 570 + `adapters/vsp/` 4 + `interactive/` 3) **고지 3→2**. 결정 기록 = D-085.

- 판정 동등성: 커밋 코퍼스 47파일 × 세 표면(lint·parse·analyze) **갈림 0**, 광역
  대조(구 vsp 내장 샘플 25 + 레포 전체 `.abap` 174)도 **갈림 0**. 독립 리뷰어가 구
  vsp를 **직접 빌드해 기준 파일을 보지 않고** 재도출한 결과도 같았다.
- 구 판정은 이제 다시 뜰 수 없다 — `sapkit-cli/fixtures/baseline/`(141칸)과
  `harness/RECORDING.md`가 그 유일한 잔존 형태이고, 코퍼스 대조 게이트가 상시 지킨다.
- 의도적 차이는 `sapkit-cli/DIVERGENCES.md`(append-only)에 D-001~D-010. **등재 없는
  차이는 결함**이라는 규율은 엔진과 같다.
- 새 게이트 셋: 코퍼스 대조(`sapkit-cli/gates/`) · `verify-checker.mjs`(번들 무결성·
  출처) · 각각의 음성시험. CI에 `sapkit-cli` 잡이 섰다.

**후속 판이 이어받는 것** — `docs/DESIGN.md` 본문(§1 좌표표·§3·§16 등 vsp를 검증
백엔드로 부르는 서술 전반)은 현행성 배너로만 막아 뒀다. 그 문서는 R1 이전 서술이라
이미 부분적으로 역사 취급이므로 전면 재작성은 별도 판단이다. **셈법마다 달라지는
수치를 여기 박지 않는다** — 행 수·출현 수·`vsp-custom` 포함 여부로 값이 흔들린다.

### 판2 — ⑶-a GPL 빈자리 결정 + 집행 — **완료 (2026-08-16)**

**도달점**: 삭제된 GPL 31파일(2026-08-09 커밋 `54fd84de` · 결정 기록은 D-074 · 08-10)
자리를 **자체 집필이 아니라 조회로** 처리하기로 확정하고 집행했다. 문법 사전은 제품에
다시 싣지 않는다 — 제품에 남는 참조 지식은 실전 검증 함정 모음
(`knowledge/abap/conventions/` 21편)이다. 결정 기록 = **D-086**. **코드 0줄 · 문서만.**

- **조회처 = 이미 동봉된 help.sap.com 조회 체계**(`interactive/core/procedures/help-portal-fetch.md`
  + `interactive/tools/fetch/` 2종). 새로 만든 배선이 없고 **소비자만 늘렸다** — 그래서
  판2가 새로 여는 외부 노출은 0이고, 수요 지점에는 **레포 내부 상대 링크만** 남는다.
- **집행 6곳**: `docs/reference/DECISIONS.md`(D-086 append) ·
  `interactive/THIRD_PARTY_NOTICES.md`(§GPL 「향후 경로」 문단) · `docs/BLUEPRINT.md`
  (§⑶-a 검증 기준 + 선택지 블록 → 결정 기록) · `interactive/DESIGN.md`(트리 주석 1곳) ·
  **수요 지점 포인터 2곳 복원**(`…/conventions/rap-odata-rules.md` ·
  `…/procedures/create-object.md` — 삭제 커밋이 지운 자리에 "사전 링크" 대신
  "조회 절차 링크"). 여기에 이 파일과 `HANDOFF.md`(마감·재개점).
- **불변 실측**: 지식 `.md` **148 유지**(신설·삭제 0) · 플러그인 버전 무변(전달은 판1의
  미배포 0.7.0 범프에 **편승** — D-060) · 게이트·훅·서버 번들·검사기 번들·`engine/`·
  `sapkit-engine/`·`sapkit-cli/` 무접촉 · 제품 게이트 9종 전부 exit 0.
  ⚠ **그러므로 push 직전에 설치본 버전을 확인한다** — `node interactive/scripts/doctor.mjs`가
  설치된 플러그인 manifest version을 레포 버전과 병기한다. **이미 0.7.0 설치본이 존재하는
  머신이 발견되면 패치 범프 후 push.** (`HANDOFF.md` 재개점에도 있으나 그 블록은 다음 판이
  덮어쓰므로, 판이 넘어가도 남는 자리로 여기에 둔다.)
- **조회 경로 생존 스모크 1회 통과** — `node interactive/tools/fetch/fetch-abap-keyword-doc.mjs
  abenwhere_all_entries` exit 0(공식 ABAP Keyword Documentation 본문 수신). ⚠ **상설
  게이트가 아니다** — 외부 문서 사이트의 이동·폐쇄는 감시하지 않기로 수용했고(D-086 ⑤ ·
  정직 유보 ⓐ), 발견 경로는 **실사용 중의 조회 실패 보고뿐**이다.

**후속 판이 이어받는 것** — **⑶-a는 닫혔다.** 차용분은 D-074의 삭제로 이미 소진됐고
빈자리 처리까지 결정됐으므로 **판8(⑷)의 ⑶-a 전제가 성립한다.** ⑶에 남은 것은
⑶-b(판3.x)와 ⑶-c(판4)다. BLUEPRINT §⑶-a의 집필 제약 세 불릿은 **폐기가 아니라 보류**다 —
향후 자체 집필이 필요해질 때 그대로 적용된다.

### 판3.x — ⑶-b copy 지식 치환 (반복 판 · 진행 중 — 다음은 판3.4)

- **목표**: 차용(copy) 지식을 **실전에서 검증된 것부터** 자체 문장으로 치환. 파일
  단위, 치환 사실은 git 이력이 센다(분류 장부는 은퇴한 역사 — 갱신 금지).
- **완료 기준(판마다)**: 치환분을 소비하는 절차가 여전히 동작 · `check-links` 0 ·
  잔량 단조 감소가 기록됨.

#### 판3.1 — 계수 방식 확정 + 명부 신설 + 1차 배치 5편 — **완료 (2026-08-17)**

**도달점**: 판3.x 브리프가 첫 판에 배정한 두 공백 — copy **잔량 계수 방식**(장부 은퇴로
생긴 공백)과 **1차 치환 대상 선정 기준** — 을 결정으로 닫고, 그 결정대로 **잔량 명부를
신설**한 뒤 **상시 로드 규약 5편을 실제로 재저작**했다. 결정 기록 = **D-087**.
**코드 0줄 · 문서만.**

- **잔량 명부 정본 = [`reference/copy-baseline.md`](reference/copy-baseline.md)** ·
  **총계 170** = 1부 지식 갈래 146 + 2부 편입분 24. **잔량 = 총계 − 체크 누계**이고,
  체크는 **재저작만** 인정하며(삭제로 갚는 길 없음) **독립 새-컨텍스트 리뷰 통과 후**에만
  찍는다. **이 명부를 게이트·스크립트로 만들지 않는다**(진척은 사람 판단이 센다).
- **편입 24**(지식 폴더 밖 copy — 훅 4 · `tools/spec/` 5 · `tools/fetch/` 2 ·
  `data-protection/` 12 · 사양서 xlsx 1)는 **이번 판이 등재만** 했다. 갚는 방법은 그 파일을
  맡는 후속 판3.x가 정한다.
- **셈 밖 소관**: 서버 결부 copy 39건 → **판7**(⑴ 교체가 은퇴·대체 범위에서 판정) ·
  `runtime-deps/keyring/` 21 → 끝그림 ② · 루트 `LICENSE` 1 → ⑷ 자체.
  **판8(⑷) 착수의 실질 전제 = 명부 170 소진 + 판4(oop 20) + 판7 소관분 판정.**
- **1차 배치 = 상시 로드 규약 5편**(`sap-standards.md`가 직접 로드하는 전부):
  `naming-conventions` · `sap-version-reference` · `cloud-abap-constraints` ·
  `ecc-ddic-fallback` · `abap-release-reference`. **잔량 170 → 165.**
- **검증**: 독립 새-컨텍스트 리뷰 3건(사실 전수 대조 · 구성 독립성 · 소비자 내용 대조 ·
  명부 검산) 전부 통과 — **사실 누락 0**(대조 항목 793 · 표 셀 전수 일치 · 릴리스 번호
  49쌍 양방향 일치), 명부 **170/170 멤버십 일치**, 소비자 정합에 **이번 판이 만든 어긋남 0**.
  제품 게이트 9종 + doctor 전부 exit 0 · 지식 `.md` **148 유지** · 버전 무변.
  ⚠ **push 직전 설치본 확인 의무 승계**(판2와 동일 — D-060 편승): `node
  interactive/scripts/doctor.mjs`로 확인하고 **이미 0.7.0 설치본이 있는 머신이 발견되면
  패치 범프 후 push**.

**판3.2 재료** (다음 판이 이어받는 것)
- **다음 배치 후보**: 1-D 규약 잔여 13편(앵커 3편 `clean-code-oop`·`include-structure`·
  `oop-pattern`은 `zrsc4sap_oop_ex` 보존 필수 — 명부 §6 비고). 선정 기준은 D-087 ⑧
  **소비 실증**을 그대로 적용한다.
- **이월 지적 (이번 판 범위 밖 — 소비자 무수정 원칙 때문에 손대지 않음)**:
  ① `interactive/core/policies/sap-standards.md:56` Cloud Private 행이
  `sap-version-reference.md`를 인용하지만 그 규칙은 실제로
  `core/procedures/create-program.md:117`에 있다(오인용) · ② 같은 파일 :18/:28과
  `sap-executor.md:91`·`clean-code.md:15`가 「Z/Y」를 말하나 `abap/conventions/`의
  명명 규약은 Z 전용이다(Y는 `modules/common/naming-conventions.md`) ·
  ③ `sap-executor.md:60`·`analyze-code.md:62`가 변수 접두사(`LV_`/`LS_`/`LT_`)·상수
  (`GC_`/`LC_`)를 `abap/conventions/naming-conventions.md`에 있다고 하나 그 내용은
  `modules/common/naming-conventions.md:51–71`에 있다 · ④ `clean-code.md:5`의
  `common/abap-release-reference.md`는 이식 전 경로다. **넷 다 이번 판 이전부터 있던
  것**이고(구본 대조 확인), 고치려면 소비자 문서를 여는 별도 결정이 필요하다.
- **재저작이 남긴 규율 하나 (판3.2가 그대로 물려받는다)**: 리뷰 근거는 **양방향**이다 —
  누락 0뿐 아니라 **추가 0**(원문에 없던 단언·지시가 안 들어갔는가)까지 잰다. 판3.1은
  한쪽만 재다가 새 SAP 단언이 5편 전부에 얹혔고 **세 차례에 걸쳐 회수**했다. 명부 §2에
  이 규율을 명문화해 뒀다.
- **제품명 표기 갈림 (이월)**: 재저작 5편 중 `ecc-ddic-fallback.md`만 본문에 `SAPKIT`을
  쓰고, 나머지 4편과 코퍼스 다수는 아직 `sc4sap`이다. 원문 어휘 보존과 제품명 현행화가
  부딪히는 자리라 **코퍼스 일괄 정리로 다루는 편이 낫다** — 파일 단위 재저작 판이 건드릴
  일이 아니다.
- **사실 자체가 의심스러운 지점 (재저작이 아니라 내용 개정 소관 — 원문 그대로 보존함)**:
  `sap-version-reference.md`의 `MATNR 40 characters (1909+)` — 외부 확인으로는 40자리
  확장이 S/4HANA **1511**이고 기본 비활성(MFLE 활성화 필요)이다. `abap-release-reference.md`
  체크리스트의 `GetPackage`도 실제 도구 표면은 `GetPackageContents`/`ReadPackage`다.

#### 판3.2 — 1-D 규약 잔여 13편 재저작 — **완료 (2026-08-17)**

**도달점**: D-087 ⑧ **소비 실증** 기준으로 명부 1-D(규약)의 **잔여 13편을 전량 재저작**했다.
앵커 3편(`clean-code-oop` · `include-structure` · `oop-pattern`)은 `zrsc4sap_oop_ex`를
그대로 보존했고 개명 게이트로 확인했다. 이로써 **1-D 갈래가 소진**됐다(18/18).
**잔량 165 → 152.** **새 D-결정은 없다** — 이 판의 선택은 전부 D-087의 적용이거나 기존
규율의 승계, 또는 사용자 확정 답이었다. **코드 0줄 · 지식 `.md`만.**

- **재저작 13편**: `abap-release-examples` · `alv-rules` · `clean-code-oop` ·
  `clean-code-procedural` · `clean-code` · `constant-rule` · `field-typing-rule` ·
  `function-module-rule` · `include-structure` · `ok-code-pattern` · `oop-pattern` ·
  `procedural-form-naming` · `text-element-rule`. 커밋 해시와 리뷰 근거는 명부
  [`reference/copy-baseline.md`](reference/copy-baseline.md) §6 1-D가 든다.
- **검증**: 독립 새-컨텍스트 리뷰 **4건**(사실 전수 대조 3그룹 + 통합 리뷰) 전부 통과 —
  **사실 대조 13/13 PASS**(누락 0 · 추가 0 · 코드 fence·표·링크·코드스팬 다중집합 기계
  대조) · 리뷰가 지적한 **강도·범위 미세 이탈 9곳**은 회수 커밋 `bcbe36f6`으로 원문 수준
  복원 후 **재확인 9/9 OK** · **구성 독립성 13/13** · **소비자·상호 인용 125곳 전부 유효**
  (새로 깨진 것 0). 제품 게이트 9종 + doctor 전부 exit 0 · 지식 `.md` **148 유지** ·
  버전 무변.
  ⚠ **push 직전 설치본 확인 의무 승계**(판2·판3.1과 동일 — D-060 편승): `node
  interactive/scripts/doctor.mjs`로 확인하고 **이미 0.7.0 설치본이 있는 머신이 발견되면
  패치 범프 후 push**.

**판3.3 재료** (다음 판이 이어받는 것)
- **다음 배치 후보**: 명부 1부의 나머지 갈래 — **1-A 모듈 91 · 1-B 산업 15 · 1-C 국가 17 ·
  1-E 견본 5**. 선정 기준은 D-087 ⑧ **소비 실증**을 그대로 적용한다.
- **이월 승계 (판3.2는 손대지 않았다 — 사용자 확정)**: 위 「판3.2 재료」로 넘어왔던
  **소비자 오인용 4건** · **사실 의심 2건**(`MATNR 40 characters (1909+)` · 체크리스트의
  `GetPackage`) · **제품명 표기 갈림**(`SAPKIT` vs `sc4sap`)을 **전부 그대로 이월**한다.
- **이식 전 참조 보존 목록 (신규 등재 — 일괄 정비 안건)**: 재저작이 **원문 그대로 보존**한
  옛 경로 표기다(재저작은 표현·구성만 바꾸므로 경로 현행화는 범위 밖이었다).
  `clean-code.md` 3곳(`common/abap-release-reference.md` · `configs/{MODULE}/` ·
  `exceptions/*.md`) · `field-typing-rule.md` 5곳(`skills/…` 4 + bare `cbo-context.md`
  유령 참조) · `function-module-rule.md` 4곳(`skills/…` 3 + `agents/sap-executor.md`) ·
  `ok-code-pattern.md` 4곳(`common/…` 2 + `skills/…` 2) · `oop-pattern.md` 3곳
  (`common/oop-sample/…` 2 + `abap/alv-oop-handlers/` 라벨-타깃 불일치) ·
  `alv-rules.md` 1곳(`sc4sap/common/alv-sample/…`). ⚠ 이 중 `clean-code.md`의
  `common/abap-release-reference.md`는 위 이월 승계의 **소비자 오인용 ④와 같은 건**이다 —
  두 목록에 겹쳐 있으니 다음 판이 이중으로 세지 말 것.
- **소비자 서술 불일치 신규 발견 4건** (전부 **재저작 이전부터 존재** — 구본 대조로 확인 ·
  내용 개정 판 소관): ① `analyze-code.md:63`이 `constant-rule`을 "GC_/LC_/CO_ patterns"로
  설명하나 실제 파일에서 `GC_`는 `gc_status` 예시로만 등장하고 `LC_`·`CO_`는 없다 ·
  ② `include-structure.md`가 인용하는
  `clean-code-procedural.md § Mandatory Main Program Header`가 실제 헤딩
  (`… Template (MUST match)`)과 다르다 · ③ `ok-code-pattern.md`가 인용하는
  `§ PBO / PAI Module`은 헤딩이 아니라 불릿이다 · ④ `text-element-rule.md`가 지시하는
  도구 `GetTextElement`·`ReadTextElementsBulk`가 현행 도구 표면에 없다(실재는
  `WriteTextElementsBulk`).
- **기록 2건 (헤딩이 바뀐 파일 — 나머지 11편은 헤딩 집합 불변)**: ⓐ `constant-rule.md`는
  재저작에서 **절 헤딩 4종이 번호부로 재작성**됐다 · ⓑ `field-typing-rule.md`는 h3 1종이
  재작성됐다(`Why this rule exists` → `What each category loses without a DE`). 리뷰
  실측으로 **둘 다 옛 헤딩을 인용하는 문서 0건**이라 실질 피해가 없다 — 스펙의 계약 앵커는
  「소비자가 인용하는 절 제목」에만 걸린다.

#### 판3.3 — 1-B 산업 15 + 1-C 국가 17 재저작 — **완료 (2026-08-17)**

**도달점**: D-087 ⑧ **소비 실증** 기준으로 명부 1-B(산업 15)·1-C(국가 17) **32편을 전량
재저작**했다. 실증한 소비 지점은 **절차 4곳** — `create-program.md:176`(industry만 로드) ·
`ask-consultant.md:44`(industry·country 둘 다) · `package-to-process.md:202-203`(둘 다) ·
`compare-programs.md:370`(**country만** 로드) — 과 **페르소나 18편의 트리거 로드**다.
이로써 **1-B·1-C 두 갈래가 소진**됐다(15/15 · 17/17). **잔량 152 → 120.**
**새 D-결정은 없다** — 이 판의 선택은 전부 D-087의 적용이거나 판3.2 선례의 승계이거나
위임 채택이었다. **배치 선정과 강화 조항 3건은 사용자 상시 위임 하 「산출자 권고 채택」으로
기록한다**(독립 점검 반영). **코드 0줄 · 지식 `.md`만.**

- **재저작 32편**: 커밋 해시와 리뷰 근거는 명부
  [`reference/copy-baseline.md`](reference/copy-baseline.md) §6 **1-B·1-C**가 든다.
- **검증**: 독립 새-컨텍스트 리뷰 **5건**(전수 대조 4그룹 + 통합 리뷰) 전부 통과 —
  **사실 대조 32/32 PASS**(누락 0 · 추가 0 · 헤딩 298행 고유 78종 · 표 64행 중 데이터
  58행 — README 14+16 · eu-common 28 · 코드스팬 · 볼드 · 숫자 · 한자/한글/가나 다중집합
  기계 대조) · **회수 2회**(`05643eda` 10곳 · `41110412` 2곳) 후 재확인 정상 ·
  **구성 독립성 32/32** · **허브 인용 대조 + 외부 로드 표면 22편(절차 4 + 페르소나 18)
  전부 유효**(새로 깨진 것 0). 제품 게이트 9종 + doctor 전부 exit 0 · 지식 `.md`
  **148 유지** · 버전 무변.
  ⚠ **push 직전 설치본 확인 의무 승계**(판2·판3.1·판3.2와 동일 — D-060 편승): `node
  interactive/scripts/doctor.mjs`로 확인하고 **이미 0.7.0 설치본이 있는 머신이 발견되면
  패치 범프 후 push**.

**판3.4 재료** (다음 판이 이어받는 것)
- **남은 갈래 3**: **1-A 모듈 91** · **1-E 견본 5** · **2부 24**.
  - **1-A 모듈 91** — 한 판에 담기엔 분량이 커서 **모듈 묶음 분할을 제안한다**(예:
    `common` 7 + 대형 모듈부터). 선정 기준은 D-087 ⑧ **소비 실증**을 그대로 적용한다.
  - **1-E 견본 5 — 후순위 사유**: 코드 파일이라 재저작이 곧 **생성 코드 골격 변경**이 되고,
    그러면 판4급 **SAP 확인(판6 이연)** 이 필요해진다. **산문 재저작 계약이 그대로
    적용되지 않는다** — 이 갈래를 여는 판은 그 차이를 먼저 정해야 한다.
  - **2부 24** — 갚는 방법이 **미정**이고 **그 판이 정한다**(명부 §7이 등재만 해 뒀다).
- **이월 승계 (판3.3도 손대지 않았다 — 전부 그대로)**: 「판3.3 재료」로 넘어와 있던
  **소비자 오인용 4건** · **사실 의심 2건**(`MATNR 40 characters (1909+)` · 체크리스트의
  `GetPackage`) · **제품명 표기 갈림**(`SAPKIT` vs `sc4sap`) · **이식 전 참조 보존 목록
  20곳**(⚠ `clean-code.md`의 `common/abap-release-reference.md`는 소비자 오인용 ④와 **같은
  건**이므로 **이중으로 세지 말 것**) · **소비자 서술 불일치 4건** · **헤딩 재작성 기록
  2건**(`constant-rule.md` · `field-typing-rule.md`) — 전부 위 판3.2 브리프의 「판3.3 재료」
  본문이 정본이다.
- **사실 의심 신규 등재 (재저작은 원문대로 보존함 — 내용 개정 판 소관)**:
  `fr.md`의 `PDF-A/3`(통용 표기는 `PDF/A-3`) · `in.md`의 「Income Tax return — by July for
  companies audited」(통상 7월은 **비**감사 기한)와 「GSTR-9 (annual reconciliation),
  GSTR-9C (audit)」(주석이 뒤바뀐 의심) · `kr.md`의 「KERIS-certified ASP」(KERIS는
  한국교육학술정보원 — 전자세금계산서 인증 주체가 아니라는 의심)와 「Zengin-like」(일본
  시스템에 댄 비유) · `chemical.md`의 「IS-Chem」 표기 통용도 · `food-beverage.md`의
  catch weight — **특성 절의 `nominal` vs 커스터마이징 절의 `invoiced`** 대비 불일치 ·
  `es.md`의 Cuaderno **43/34/19 vs 68/58/43** 불일치(원문 상태).
- **배치 내 기존 불일치 기록 (재저작 이전부터 존재 — 보존함)**: `industry/README:58`의
  전칭 선언 vs `banking`·`public-sector`의 h2 2절 부재(**12/14**) · README fence의
  「Master Data」 vs 실헤딩 「Master Data Specifics」 · `country/README:32`의
  「DDMMYYYY → actually YYYY.MM.DD」 자기-정정 · `eu-common` **:3**(gb pre-Brexit 안내) ↔
  **:92**(Brexit 경고) 긴장 · 국가별 헤딩 변형(`Tax System — VAT/IVA/GST…` 류 13종)과
  `eu-common`의 상이한 h2 구성(README 선언과 다름).
- **재저작 구조 기록 2건 (계약 위반 아님 — 후속 감사가 오독하지 않도록)**:
  ⓐ `chemical.md`만 행수가 변했다(51→50 — Campaign production 불릿을 첫 불릿에 병합,
  사실 양쪽 잔존 · 32편 중 유일한 구조 이탈) ⓑ `construction.md`의 볼드 라벨 1곳이
  수식어를 볼드 밖으로 뺐다(`**Cost/revenue planning at WBS**` → `**Cost and revenue
  planning**, held at the WBS` — 사실 잔존). 「볼드 라벨도 앵커로 볼 것인가」는 판3.4
  계약 설계의 판단 재료다.
- **이식 전 참조**: 이 배치 본문 **0건**(신규 등재 없음).

### 판4 — ⑶-c ZRSC4SAP 템플릿 재생성 (집필분)

- **목표**: `interactive/core/knowledge/abap/templates/oop-sample/`의 `zrsc4sap_*`
  20파일(프로그램 9 + 화면 2 외)을 SAPKIT 이름으로 새로 작성. **레포 템플릿 원본만** —
  SAP 시스템 내 기존 오브젝트는 무접촉.
- **완료 기준**: 새 템플릿 집필 완료 + 개명 게이트(`check-runtime-path-rename.mjs`)
  통과. **실 SAP DEV 생성→활성→기계 확인은 판6으로 이연**, 옛 템플릿 제거는 그 확인
  뒤(판6 완료 전 삭제 금지).

### 판5 — ⑴ 엔진 잔여 코드

- **목표**: ⓐ M2 인증 확장 코드 — UAA 토큰 취득 + 그 위의 JWT 접속 계층(신 엔진
  `AdtClient`는 Basic만 다룬다 — M-표에서 M2만 `일부`인 이유) ⓑ D18 — 무접속 거부
  어휘를 `conformance-server-gates.mjs`가 구·신 **둘 다** 인식하게 넓히기(신 문구로
  교체 금지 — 구 번들이 현역인 동안 그쪽 판정이 깨진다) ⓒ keyring 폴백 CI 잡
  (`npm ci --omit=optional` — fallback 설계가 아직 어떤 CI로도 입증되지 않았다).
- **완료 기준**: jest·자체 게이트 green · M2가 M-표에서 `짓기 완료`로 · 교체 전 필수
  2건(D15 코드 측·D18)이 코드로 해소됨. 증거(destination 실접속)는 판6 몫.

### 판6.x — 최종 테스트 판 (attended · 유일한 SAP 구간 · 반복 가능)

- **목표**: 미뤄 둔 SAP 증거 전부 + 실사용 확인. **순서 고정 M1→M6**(D-081):
  1. M1 잔여 — 재생 대상 10종(읽기 6종 `GetInclude` `GetFunctionModule` `GetTable`
     `GetStructure` `GrepObjects` `GetSourceDiff`부터 · 대상은 `$TMP`의
     `ZSAPKIT_M1_DEMO`·`ZCL_SAPKIT_M1_DEMO`) · `CreateInclude` 실기 · C3 실기
     (프로그램 생성→활성→기계 확인)
  2. M2 — destination 프로파일 실접속(판5 코드의 증거)
  3. M3 — 전송 3종·RFC 5경로 실증 4. M4·M5 — 도구 증거 5. M6 — 관문(D8 관찰 ·
     D18 확인 · 꼬리 재평가 → 새 D-항목 · 검증 기준 1~4)
  - 추가: **판4 템플릿의 SAP 확인**(생성→활성→기계 확인) → 통과 후 옛 템플릿 제거.
  - 실사용 도그푸딩은 채록과 겸행 — 실제로 쓴 흐름을 그 자리에서 시나리오로 만든다.
- **첫 판(판6.1)의 /ready가 물을 것**: 재생 대상 96종 **전량 채록** vs
  **실사용-우선 채록 + 꼬리 증거 기준 인하**(별도 D-append 필요) — 여기서 결정하고
  기록한다. 이 결정이 판6 전체의 크기를 정한다.
- **재료**: HANDOFF 「이연 재료 — M1 잔여」 절(명령어 블록 포함) ·
  `sapkit-engine/harness/scenarios/README.md` **함정 ⑶**(안정 상태에서 녹화 —
  모르면 재생이 신 엔진 잘못처럼 실패) · `sapkit-engine/TOOL-LEDGER.md`(증거 대기 143).
- **완료 기준**: 대장 증거 대기 0(또는 인하 결정 반영 후 잔여 0) · BLUEPRINT 사다리 ⑴
  검증 기준 1~4 성립 · M1~M6 전부 `증거 완료`.

### 판7 — ⑴ 교체(swap) + `engine/` 은퇴

- **전제**: 판6 완료(§3.2 — 검증 없는 교체 금지).
- **목표**: 제품 번들(`interactive/server/server.bundle.cjs`)을 sapkit-engine
  산출물로 교체 · `UPDATE-RUNBOOK.md` 절차 대체 · `plugin-metadata.json` + 생성물
  7종 재생성 · 기존 제품 게이트의 기대값 갱신(D18 어휘는 판5에서 선반영) ·
  `engine/` 소스 은퇴 + `engine/LICENSE` 은퇴 + 루트 LICENSE 표 갱신. **고지 2→1건.**

### 판8 — ⑷ `interactive/` 고지 은퇴

- **전제**: ⑶ 세 갈래 소진(판2 · 판3.x 전부 · 판4 + 판6의 템플릿 확인).
- **목표**: `interactive/LICENSE` 은퇴 · 루트 LICENSE 표 · `THIRD_PARTY_NOTICES.md`
  갱신. 번들 런타임 의존(정식 npm 패키지) 귀속은 남는다 — 끝그림 ②가 허용하는 형태.
  **고지 0건 = 포크 0 도달.**
