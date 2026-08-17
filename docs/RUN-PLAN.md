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
| **판3.x** | ⑶-b | copy 지식 치환 (반복 판 — 실전 검증분부터) | 불필요 | **완료** (2026-08-18 · 판3.1~3.6 · 명부 **170/170 소진** · 잔량 **0** — ⑶-b 갈래 완주) |
| 판4 | ⑶-c | ZRSC4SAP 템플릿 20파일 재생성 (집필분) | 불필요 (SAP 확인은 판6) | **다음** |
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

### 판3.x — ⑶-b copy 지식 치환 (반복 판 · **완료 — 판3.1~3.6 · 170/170**)

- **목표**: 차용(copy) 지식을 **실전에서 검증된 것부터** 자체 문장으로 치환. 파일
  단위, 치환 사실은 git 이력이 센다(분류 장부는 은퇴한 역사 — 갱신 금지).
- **완료 기준(판마다)**: 치환분을 소비하는 절차가 여전히 동작 · `check-links` 0 ·
  잔량 단조 감소가 기록됨.
- **갈래 종결 (2026-08-18 · 판3.6)**: 명부 [`reference/copy-baseline.md`](reference/copy-baseline.md)
  **170행 전량 체크 · 잔량 0.** ⑶-b에 남은 미처리 파일은 없다. 셈 밖 소관은 그대로
  열려 있다 — oop 20 = **판4** · 서버 결부 39 = **판7** · keyring 21 = 끝그림 ② ·
  LICENSE = **판8**. 따라서 **판8(⑷) 착수 전제 중 ⑶-b 몫은 성립**했고, 남은 것은
  판4(oop 20 · SAP 확인은 판6) + 판7 소관분 판정이다.

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

#### 판3.4 — 1-A 모듈 전반부 43편 (재저작 30 + 검증 체크 13) — **완료 (2026-08-17)**

**도달점**: D-087 ⑧ **소비 실증** 기준으로 명부 1-A(모듈 91)의 **전반부 43편**을 처리했다 —
`common` 7 + **FI·CO·MM·SD·PP·PM 6모듈 × 6편**. 실증한 소비 표면은 넷이다: **모듈 컨설턴트
페르소나 14편이 자기 모듈 6편을 파일별로 지시 로드**(예 `sap-fi-consultant.md:10` +
MANDATORY 3곳 `:37`·`:64`·`:69`) · **컨설턴트 공통 블록이 `common` 5편**(bapi·tcodes·
tables·spro·enhancements)**을 로드** · **naming 2편의 소비자** = `analyze-code.md:73`·`:82`
(module-aware naming extension) + `create-object.md:77`(내용 요약 인용) +
`sap-bc-consultant.md:10` 글롭 · **모듈 폴더 패턴 로더 6편**(`spro-lookup` ·
`troubleshooting` · `package-to-process` · `customization-lookup` · `create-program:294` ·
`analyze-cbo-obj` — 플레이스홀더 표기는 `{MODULE}`/`<MODULE>` 두 형태가 섞여 있다).
처리 방식이 두 갈래로 갈렸다 — **재저작 30편** + **검증 체크(무변경) 13편**. 후자를 위해
**D-088을 신설**했다(표 지배 참조 파일의 셀 분류 재정의 + 무변경 인정 · **사용자 상시 위임 하
산출자 권고 채택**). **잔량 120 → 77.** **코드 0줄 · 지식 `.md`만.**

- **재저작 30편 · 검증 체크 13편**: 커밋 해시(무변경분은 「검증 체크(무변경)」)와 리뷰 근거는
  명부 [`reference/copy-baseline.md`](reference/copy-baseline.md) §6 **1-A**가 든다. 무변경
  13편 = FI·CO·MM·SD·PP·PM의 `spro`·`tcodes` 각 6편 + `SD/tables`(즉 spro 6 · tcodes 6 ·
  tables 1). 규칙 근거는 **D-088 ②**이고 명부 §2에 보충 1줄로 명문화했다.
- **근거 문장 정정 3건**(선정 근거를 실측으로 바로잡은 것 — 다음 판이 물려받는 정확한 값):
  컨설턴트 공통 블록은 `common` **5편**이다(7편 전부가 아니다 — `naming-conventions` 2편은
  그 블록에 없고 절차·글롭이 따로 부른다) · naming 2편의 소비자는 위 도달점의 4지점이다 ·
  `FI/tcodes.md`는 **실측 81행 중 표가 63행**이다.
- **검증**: 독립 새-컨텍스트 리뷰 **6건** 전부 통과 —
  - **전수 대조 4그룹 43/43 PASS**(누락 0 · 추가 0 양방향 · 셀 **1,356+** · 산문 **445행+** ·
    식별자·수치·한글 다중집합 기계 대조 · **식별자 열 밀림 0**).
  - **무변경 13편 총괄 재검**(RD) — **551셀 전수 분류** · **blob 해시 무변 13/13** · 모듈 spro
    경고 블록이 차용분이 아니라 **자작 신설분(커밋 `5fb1d901`)임을 확정**.
  - **통합 리뷰**(RF) — 구성 독립성 **43/43**(재저작 표면 기준 조정 판정) · **소비 표면 28지점
    유효** · 새로 깨진 것 **0**.
  - **회수 2회**: `88165eeb` **9곳**(규범 voice·과잉 환언·어미체 이탈 — `common/tcodes` ·
    `common/spro` · `CO/enhancements` · `MM/enhancements` · `PM/enhancements`) ·
    `d24e18a4` **3곳**(미재저작 1셀 + 과잉 회수 1행 재환언 — `SD/bapi` · `SD/enhancements` ·
    `MM/enhancements`). 둘 다 후 재확인 정상.
  - 제품 게이트 9종 + doctor 전부 exit 0 · 지식 `.md` **148 유지** · 버전 무변.
  ⚠ **push 직전 설치본 확인 의무 승계**(판2·판3.1~3.3과 동일 — D-060 편승 · 미배포 0.7.0):
  `node interactive/scripts/doctor.mjs`로 확인하고 **이미 0.7.0 설치본이 있는 머신이
  발견되면 패치 범프 후 push**.

**판3.5 재료** (다음 판이 이어받는 것)

- **다음 배치 = 1-A 후반부**: **Ariba·BW·HCM·PS·QM·TM·TR·WM 8모듈 × 6 = 48편.**
  **계약은 판3.4와 같다 — D-088 그대로** 적용하면 되고 새 결정이 필요하지 않다. 이 48편으로
  **1-A 갈래가 소진**된다(43 + 48 = 91).
- **정찰 2건 (판3.4가 실측해 남긴 것 — 무변경 선례를 전제하지 말 것)**:
  ⓐ **`PS/spro.md`는 표 밖 산문이 실재한다**(L82-84 불릿 — Fiori 대체 · Hierarchical
  Projects · ACDOCA). 다른 모듈 spro가 무변경이었다는 사실을 **PS에 그대로 옮기면 틀린다.**
  ⓑ **spro 술어 탐침의 Title-Case 명사 함정** — `Sets`(QM/PM Cycle Sets) · `Means`
  (TM Means of Transport). 동사로 읽으면 문장형 셀로 오분류된다.
- **이월 전량 승계 (판3.4도 손대지 않았다 — 전부 그대로)**: 위 「판3.4 재료」(판3.3 브리프)
  본문의 항목 전부 — 소비자 오인용 4건 · 사실 의심 2건(`MATNR 40 characters (1909+)` ·
  체크리스트의 `GetPackage`) · 제품명 표기 갈림(`SAPKIT` vs `sc4sap`) · **이식 전 참조 보존
  목록 20곳** · 소비자 서술 불일치 4건 · 헤딩 재작성 기록 2건 · 판3.3이 등재한 사실 의심
  (`fr.md` · `in.md` · `kr.md` · `chemical.md` · `food-beverage.md` · `es.md`) · 배치 내 기존
  불일치 5건 · 재저작 구조 기록 2건. ⚠ **이중 계수 금지** — `clean-code.md`의
  `common/abap-release-reference.md`는 「이식 전 참조 20곳」과 「소비자 오인용 ④」에 **겹쳐
  있는 같은 건**이다.
- **낡은 도구명 동결 36곳 (사실 의심 등재)**: 현행 도구 표면에 없는 `GetTable`(16곳) ·
  `GetFunctionModule`(9) · `GetClass`(5) · `GetProgram`(3) · `GetView`(2) · `GetStructure`(1)
  을 **원문 그대로 보존**했다(Read* 현행화 금지 — 판3.2 발견 ④의 `GetPackage`와 동종 ·
  내용 개정 판 소관).
- **사실 의심 신규 등재 (재저작은 원문대로 보존함 — 내용 개정 판 소관)**:
  - `common/naming-conventions.md` — 소비자 `create-object.md:77`이 이 파일의 범위를 잘못
    요약한다(오브젝트별 패턴은 실제로 `naming-conventions-objects` 소관 — 소비자 서술 불일치
    계열).
  - `CO/tcodes.md` — KSU5/KEU5 국문 「배분/분배」 용어 갈림 · OKEON 대역에 '원가 센터' 누락.
  - `SD/spro.md` — `V_TVAPt` 소문자 표기 · Config Name 「Define Item Categories…」 중복 2회 ·
    `V_MTVFP`↔`V_TMVFP` 전치 의심.
  - `SD/tcodes.md` — V/06·V/08 명칭 한 칸 밀림 의심 · VFX3 국문 대역 「전기」 vs Release ·
    `SPRO = SAP Project Reference Object` 역두문자 · VL60·SD70 실재 미확인.
  - `SD/bapi.md` — `AVAILABILITY_CHECK`·`CREDIT_EXPOSURE_CALCULATE` FM 실재 의심 ·
    `BAPI_OUTB_DELIVERY_CONFIRM_DEC`의 Description(Transfer Order)↔Usage(goods issue) 긴장.
  - `PP/bapi.md` — `BAPI_BOM_GETDETAIL`·`BAPI_ROUTING_GET_DETAIL`·`BAPI_WORKCENTER_GET_DETAIL`·
    `BAPI_CAPACITY_REQUIREMENTS`·`MD_MRP_PARAMETERS_MATERIAL` 이름 의심 · PBHI/PBIM 짝
    (통상 PBIM+PBED) 의심 · `BAPI_GOODSMVT_CREATE`의 PP 한정 gloss.
  - `PP/spro.md` — 합성 의심 뷰명 7종: `V_T003O_PP`·`V_MARC_MRP`·`V_MARC_PTF`·`V_MTVFP_PP`·
    `V_TC44_ALT`·`V_T024D_W`·`V_TCO15`.
  - `PP/workflows.md` — WF2의 `PLSC (planned order)` vs Required Tools의 `PLAF`(문서 내부
    불일치).
  - `PP/tcodes.md` — MDVP↔MD09 의심(유력) · OPJN↔OPJH · OP43↔OMD0/OPPU · MD45 라벨 과대 ·
    COOIS 중복 표기 갈림.
  - `PM/bapi.md` — `RIIFLO20`(FM 아닌 리포트 의심) · `MPLAN`(통상 MPLA/MPOS) ·
    `BAPI_MAINTPLAN_CREATE`/`BAPI_MAINTPLAN_GETDETAIL` 실재 의심.
  - `PM/enhancements.md` — `IWP1` 4자 형태 이질 · `IEQM_SERNO_CHECK` 표기 관례 · `ITOB`가
    Table 열에 있는 점.
  - `PM/tcodes.md` — 해석적 라벨 4종(IP10·IW37N·PMSM·IW65) · 코드 의심 9종
    (S_ALR_87012894·IWBK·MCJB·MCIZ·OIOF·OIB2·OIH2·OIYL·OIM0).
  - `PM/tables.md` — IFLO(뷰)·IFLOTX·MMPT·T352T 라벨 사실성 의심.
  - `CO/enhancements.md` — §4.2 표 3열 헤더에 4셀 행(**렌더링 결함** · 이식 시점부터) ·
    MP-variant↔평가 변형 대역 불일치.
  - `FI/bapi.md` — `Post GL Posting…`의 GL→G/L **표기 정규화 1건 인정**(같은 셀 KR이 이미
    G/L이라 리뷰가 정규화로 판단).
  - `FI/bapi.md` KR 「전기」 보유 5셀 중 **4셀이 「계상」으로 전환, 1셀(전기 기간 판별)은
    「전기」 유지** — 파일 내 용어 갈림, **판3.5 일관성 재료**(같은 어휘가 다른 파일에서
    어떻게 처리되는지 함께 볼 것).
  - `MM/tcodes.md`·`FI/tcodes.md`·`common/tcodes.md` 등 — System 열·명칭 의심 소량(각 리뷰
    보고서에 기록).
- **판정 폭 기록 (위반 아님 — 후속 감사가 오독하지 않도록)**: 표 셀 재저작 폭이 파일 간에
  갈렸다 — **광폭**(`common/bapi` Description 62셀 · `common/enhancements` gloss 36셀 ·
  `FI/bapi` Description+Usage 54셀) vs **협폭 수렴선**(`FI/enhancements`·`FI/tables`·
  `CO/tables`·`MM/enhancements`·`MM/tables`·`PP/tables`·`PM/tables` 등 — 명칭·명사구 보존,
  진짜 술어절만. `SD/tables`는 이 계열이 아니라 **무변경 검증 체크 13편**의 하나다).
  D-088 ①의 「저작 gloss냐 공식 명칭이냐」 판정 재량 범위이고, **전 파일에서 식별자·수치
  다중집합 불변이 기계로 증명**돼 사실 무변은 성립한다(D-088 정직 유보 ⓒ). 같은 계열 2건:
  `Internal FM:` 셀은 `SD/bapi` 보존 vs `MM/bapi`·`PP/bapi` 재저작으로 **갈렸고**, 스텝 태
  drift가 `PP/workflows` vs `SD/workflows`에서 갈렸다 — **전 파일 사실 무변은 기계 증명됨**.
- **EN/KR 쌍 규정 적용 기록**: 산문 쌍은 두 언어를 함께 재저작했고(`common/spro`·
  `common/tables`·`common/tcodes`·`MM/enhancements`·`CO/enhancements`·`PP/enhancements`·
  `PM/enhancements` 등) **EN 단독 본문에 KR을 신설한 것은 0**, KR 단독 산문도 재저작했다
  (`MM/bapi.md:19`).
- **배치 내 상호 인용 (판3.5도 같음)**: 14개 모듈 `spro.md:9`가 `common/spro.md`의 헤딩
  **「IMG Activity Verification」**을 인용한다. 재저작으로 그 절의 **행 좌표는 이동했고
  헤딩 문구는 보존**됐다 — 후속 판은 이 인용을 **절 이름으로만** 다루고 행 좌표를 박지 말 것.
- **이월 지적 ③의 좌표 전환**(판3.1 등재분 — 행 좌표를 박지 않도록 절 좌표로 갱신): `sap-executor.md:60`·
  `analyze-code.md:62`가 변수 접두사·상수를 `abap/conventions/naming-conventions.md`에 있다고
  하나 그 내용은 `modules/common/naming-conventions.md` **§ Code-Level Naming의
  Variables·Constants 표**에 있다(구 표기 `:51–71`).
- **이식 전 참조**: 이 배치 본문 **0건**(신규 등재 없음).

#### 판3.5 — 1-A 모듈 후반부 48편 (재저작 35 + 검증 체크 13) — **완료 (2026-08-18)**

**도달점**: D-087 ⑧ **소비 실증** 기준으로 명부 1-A(모듈 91)의 **후반부 48편**을 처리했다 —
**Ariba·BW·HCM·PS·QM·TM·TR·WM 8모듈 × 6편.** 처리는 판3.4와 같이 두 갈래로 갈렸다 —
**재저작 35편** + **검증 체크(무변경) 13편**(spro 7 · tcodes 6). 무변경 13편은 **사양이 미리
지목한 후보 명단과 정확히 일치**하고 **근사-무변경 → 재저작 전환은 0건**이었다(선정 정확도의
실측). 이로써 **1-A 갈래가 소진**됐다(43 + 48 = 91/91) — 명부 1부에 남은 것은 1-E 견본 5뿐이다.
**잔량 77 → 29.** **새 D-결정은 없다** — 이 판의 선택은 전부 **D-087·D-088의 적용**이거나
판3.4 선례의 승계다. **코드 0줄 · 지식 `.md`만.**

- **재저작 35편 · 검증 체크 13편**: 커밋 해시(무변경분은 「검증 체크(무변경)」)와 리뷰 근거는
  명부 [`reference/copy-baseline.md`](reference/copy-baseline.md) §6 **1-A**가 든다. 무변경
  13편 = Ariba·BW·HCM·QM·TM·TR·WM의 `spro` 7 + Ariba·BW·PS·QM·TM·TR의 `tcodes` 6. 규칙
  근거는 **D-088 ②**.
- **판3.4 정찰 2건이 실제로 갈랐다**: ⓐ **`PS/spro.md`는 재저작**(표 밖 불릿 3행) — 다른 모듈
  spro 7편의 무변경 선례를 PS에 옮기면 틀렸다는 판3.4 경고가 맞았다. ⓑ **Title-Case 명사
  함정**도 실증됐다 — `TM/spro.md:18`의 `Means`를 동사로 읽으면 문장형 셀로 오분류되는데,
  RE 총괄 재검이 **명사 확정**으로 닫았다. **`HCM/tcodes`·`WM/tcodes`는 tcodes인데도 재저작**
  이다(경고 blockquote가 있어 표면이 0이 아니다) — tcodes=무변경으로 일반화하지 말 것.
- **검증**: 독립 새-컨텍스트 리뷰 **6건 전원 PASS** · **회수 0건**.
  - **전수 대조 4그룹 48/48 PASS**(RA=Ariba+BW · RB=HCM+PS · RC=QM+TM · RD=TR+WM) —
    누락 0 · 추가 0 양방향 · 식별자·수치·한글 다중집합 **기계** 대조 · Get* 동결 **55곳이 행
    좌표까지 동일** · blockquote·fence·코드스팬 sha256 동일 · 무변경분 diff-빈 이중 확인.
  - **RE 총괄 재검 13/13 CONFIRM** — blob **3중 대조**(보고 해시 = 현재 = base `43ab754a`) ·
    **477 데이터 행 전수** 재분류(잔여 0) · 어휘 전수 덤프(EN 530 · KR 364 토큰 — 계사·조동사·
    산문 주어·국문 종결어미 전부 부재) · 모듈 spro `:4-9` 자작 카브아웃 7파일 sha1 동일 + blame
    확인.
  - **RF 통합 리뷰** — 구성 독립성 표본 6편 · **소비 표면 14지점 유효** · 새로 깨진 것 **0** ·
    **자작 경고 블록 8편 무접촉**.
  - **⚠ 회수 0은 이 판의 특기다** — 판3.1~3.4는 **매 판 회수가 났다**(3회 · 9곳 · 12곳 · 12곳).
    이번 판은 그 **실패 모드와 판정 폭을 재저작 프롬프트에 선재 주입**했고 그 결과 회수가 0이
    됐다. 후속 판은 이 주입을 승계할 것.
  - 제품 게이트 9종 + doctor 전부 exit 0 · 지식 `.md` **148 유지** · 버전 무변 ·
    `interactive/plugin-metadata.json`과 생성물 7종 무접촉.
  - **529 장애 기록**: 배치 4에서 API 혼잡(529 Overloaded)으로 4편(`QM/enhancements` ·
    `QM/tables` · `QM/workflows` · `TM/enhancements`)이 3~4회 중단됐다 — 백오프(150s→420s) +
    동시도 2로 낮춰 재시도해 전원 완료했고, 매 실패마다 워크트리를 리셋해 부분 수정 잔재 0을
    확인했다. **결과물 영향 0.**
  ⚠ **push 직전 설치본 확인 의무 승계**(판2·판3.1~3.4와 동일 — D-060 편승 · **미배포 0.7.0**):
  `node interactive/scripts/doctor.mjs`로 확인하고 **이미 0.7.0 설치본이 있는 머신이 발견되면
  패치 범프 후 push**.

**판3.6 재료** (다음 판이 이어받는 것)

- **남은 갈래 2 = 잔량 29 전부**: **1-E 견본 5** + **2부 24**. ⚠ **둘 다 그 갈래를 여는 판이
  계약을 먼저 정한다**(판3.3 브리프의 명문을 승계) — 산문 재저작 계약(D-088)이 그대로 적용되지
  않기 때문이다.
  - **1-E 견본 5** — `.abap` **코드 파일**이라 재저작이 곧 생성 코드 골격 변경이 되고, 그러면
    판4급 **SAP 확인(판6 이연)** 이 걸린다. D-088의 「표 셀 분류」는 여기 쓸 수 없다.
  - **2부 24** — 갚는 방법이 **미정**이고 성격이 셋으로 갈린다: ⓐ **훅 4 + 사양서 도구 5 +
    조회 도구 2 = 11편은 `.mjs` 실행 코드**이므로 **동작 계약 유지가 필수**다(특히
    `tools/fetch/` 2종은 `core/procedures/help-portal-fetch.md`가 기대하는 계약 · 훅 4종은
    PreToolUse 안전 배선) ⓑ **데이터보호 정책 12는 `.md`**이므로 **D-088 적용이 가능**하다
    (2부 중 유일하게 산문 계약이 그대로 서는 갈래 — 판3.6의 유력 배치 후보) ⓒ **xlsx 1은
    바이너리**로 **재제작 방법 자체가 미정**이다.
- **이월 전량 승계 (판3.5도 손대지 않았다 — 전부 그대로)**: 위 「판3.5 재료」(판3.4 브리프)
  본문의 항목 전부 — 소비자 오인용 4건 · 사실 의심 2건(`MATNR 40 characters (1909+)` ·
  체크리스트의 `GetPackage`) · 제품명 표기 갈림(`SAPKIT` vs `sc4sap`) · **이식 전 참조 보존
  목록**(판3.4까지 20곳 · ⚠ 그중 1곳은 소비자 오인용 ④와 **같은 건**이므로 **이중 계수 금지**) ·
  소비자 서술 불일치 4건 · 헤딩 재작성 기록 2건 · 판3.3·판3.4가 등재한 모듈별 사실 의심 전부 ·
  배치 내 기존 불일치 5건 · 재저작 구조 기록 2건 · 배치 내 상호 인용(모듈 `spro.md:9` →
  `common/spro.md` 헤딩 「IMG Activity Verification」 — **절 이름으로만** 다루고 행 좌표를 박지
  말 것).
- **낡은 도구명 동결 55곳 (사실 의심 등재 — 판3.4의 36곳을 대체하는 1-A 전체 실측치)**: 이 판이
  다룬 **workflows 8편에 55곳**이 있고 전부 **원문 그대로 보존**했다 — `GetTable` **26** ·
  `GetFunctionModule` **15** · `GetClass` **11** · `GetProgram` **2** · `GetView` **1**.
  `GetInclude` 3곳(`Ariba/workflows:40` · `BW/workflows:63` · `PS/workflows:38`)은 **현행
  도구명이라 동결 목록 밖**이다. Read* 현행화는 금지(판3.2 발견 ④의 `GetPackage`와 동종 —
  내용 개정 판 소관).
- **이식 전 참조 신규 1곳 (보존 목록 20 → 21)**: `Ariba/tables.md:43-44`의
  `configs/Ariba/spro.md` 코드스팬 — 이식 전 경로 표기이고 **바이트 보존**했다(재저작은 표현·
  구성만 바꾸므로 경로 현행화는 범위 밖).
- **KR 용어 관찰 (판3.4가 「판3.5 일관성 재료」로 넘긴 `FI/bapi` 「전기→계상」 5셀 갈림의 후속)**:
  이 배치는 KR 산문 표면이 적어(대부분 표 지배 참조 파일) **「전기/계상」 계열 갈림이 재현되지
  않았다.** 그래서 코퍼스 일괄 규칙을 세울 재료가 늘지 않았고, **파일 내 일관 유지**로 처리했다 —
  이 안건은 여전히 **내용 개정 판 소관**으로 열려 있다.
- **⚠ 참조표 사실 의심 밀도 경보 (문장 재저작과 별개 — SAP 접속이 필요한 사실 검증 백로그
  후보 · 판6 이후 소관)**: 이 배치의 참조표는 **의심 밀도가 판3.4 배치보다 뚜렷히 높다.**
  계열로 묶으면 —
  - **BW**: `spro`의 Table/View 열 **34개 중 33개가 자기 레포 `BW/tables.md`와 무대응** +
    **내부 모순 5건** · `tcodes`는 38행 중 **~9행**이 의심(테이블명이 TCode 열에 있는 등).
  - **QM**: `spro` 뷰명이 **계통적으로** 의심스럽다(`V_T161_QM`·`V_T705B`·`V_T708`·`V_MARC_QM`
    계열 — T161=MM · T705/706/708=HR 번호대 정황) + **내부 모순 5건**. `workflows`·`tcodes`가
    교차 확증한다.
  - **TR**: `spro`의 Table/View 열이 **「한 stem + 구분 1글자」 블록을 반복**한다(패턴 생성
    참조 데이터의 특징) · 그중 **`V_T030`은 실재 테이블의 오용**이라 최위험.
  - **TM**: `V_TM*` 설정 뷰 계열이 **27행 규모**로 의심된다(실제 네임스페이스는 `/SCMTMS/` —
    `TM/spro`·`TM/workflows` 교차).
  - **WM**: **`WM/bapi` ↔ `WM/tables`가 TO/TR 테이블 쌍(LTAK/LTAP ↔ LTBK/LTBP)을 서로 반대로
    서술**한다 — **2워커 교차 확증**이고 `tables` 쪽이 실제 SAP 정합이다(원문 대물림) ·
    `WM/tables.md:45`의 `T333` 라벨은 spro·workflows·실제 SAP **3처가 2대1로** 오기재를 가리킨다.
  - 개별 항목은 각 리뷰 보고와 판 진행 대장이 든다. **재저작 계약상 전부 원문 보존**했다.
- **⚠ 판3.4 체크 완료분에 잔존 1건 (다음 판 처리 대상)**: `SD/bapi.md:31`의
  `SD_SALESDOCUMENT_PRICING_GET` 행 — `Internal FM: read pricing procedure results` 셀이
  **미재저작으로 남아 있다**(판3.4 회수 2차 `d24e18a4`가 같은 파일 `:7`은 고치고 이 셀을 누락한
  것으로 추정). 판3.5는 **체크 완료 93편 무접촉 계약**이라 손대지 않았다 — **판3.6이 처리한다**
  (명부 체크는 이미 서 있으므로 회수 성격의 수리 커밋 1건이면 닫힌다).
- **무접촉 등재 권고 1건 (RB 리뷰)**: `PS/workflows.md:82`의 DDLS 행은 이식분이라 재저작이
  정당했으나, **후속 감사가 「자작분을 건드렸다」로 오독할 여지**가 있어 등재해 둔다.
- **오기 등재 1건 (정정은 내용 개정 판 소관 — 재저작은 바이트 보존함)**: `BW/workflows.md:9`의
  `AEDАТ`는 **키릴 동형 이체자**(U+0410 А · U+0422 Т)가 섞여 있다 — 눈으로는 `AEDAT`으로 보이나
  **검색·복붙이 깨지는 오기**다. RA 리뷰가 바이트 보존을 확인했다.
- **배치 실측 특기 2건**: ⓐ `HCM/workflows`·`PS/workflows` 둘 다 **W1 Steps 번호에 6이 결번**
  (5→7 · 서로 다른 파일에서 같은 결함 · **원문 보존**) ⓑ **판정 폭 기록** — 협폭은 **열 단위
  판정**으로 확정됐다(Description 열 보존 / Usage 열 재저작 · Usage 안의 명사구 셀도 재저작
  대상 — 판3.4 회수 2차 `d24e18a4`의 `SD/bapi` 동형 셀 선례 준거). 같은 계열 갈림 2건:
  `QM/enhancements`(표 0셀) ↔ `TM/enhancements`(37셀) 표 정책 · `BW/enhancements` `:11`
  (저작 gloss → 재저작) ↔ `:15`(RSPC 공식 개념명 → 보존) · `PS/tables`의 ACDOCA 셀(정동사가
  있으나 후속객체 태그 계열로 보존). **전 파일 사실 무변은 기계로 증명됐다**(D-088 정직 유보 ⓒ).

#### 판3.6 — 잔량 29편 5갈래 전량 (⑶-b **완주** · D-089 신설) — **완료 (2026-08-18)**

**도달점**: 명부 잔량 **29편을 한 판에 전량** 처리했다 — **견본 `.abap` 5**(1-E) · **안전 훅
`.mjs` 4**(2-A) · **사양서 도구 `.mjs` 5**(2-B) · **조회 도구 `.mjs` 2**(2-C) · **데이터보호
정책 `.md` 12**(2-D) · **xlsx 바이너리 1**(2-E). **잔량 29 → 0 · 체크 누계 170/170 —
⑶-b 갈래가 완주했다.** 산문 재저작 계약(D-087·D-088)이 그대로 서지 않는 갈래들이라 **새 계약을
정했고 그것이 D-089**다(사용자 상시 위임 + 밤샘 위임 하 **산출자 권고 채택**). 이 판은 판3.x 중
**유일하게 코드를 만진 판**이다.

- **D-089 갈래 계약 5종** (원문이 정본 — 여기는 요지):
  - **ⓐ 정책 12 = D-088 변형 + 「구문 층」 신설.** 훅이 정규식으로 읽는 서식(헤딩 구조 ·
    표 헤더 열 이름 · `tier`/`action` 주석 · 식별자 · 구분자 · 와일드카드 · 파일명)을 **재저작
    원천 배제**하고, **게이트 하드코딩 6종**(USR02·BNKA·KNA1·VBRK·BALDAT·PA0008)은 소속
    파일·tier·action이 한 글자도 변하지 않는다. **체크 전제 = 파싱 동치 기계 증명.**
  - **ⓑ 코드류 16편 = 동작 동결 재구현.** 판정·출력·exit·export 동치를 채록·차분으로 증명하고
    표현만 자체 저작. **알려진 동작 갭도 함께 동결**(개선은 별건 — 섞이면 회귀 기준이 사라진다).
  - **ⓒ xlsx = 생성 스크립트 재제작.** `interactive/tools/spec/gen-template-base.mjs` 신설로
    전 구성 자체 산출 + 재현성 기계 증명. theme/metadata 파트는 의도적 미포함.
  - **ⓓ `alv-rules.md` fence 1곳 동기화 예외** — 「체크 완료편 무접촉」의 명시 예외(코드 인용
    fence만 · 산문 무접촉).
  - **ⓔ 훅 판정 채록 러너 신설** `interactive/scripts/test-hook-decisions.mjs`(**74케이스**) —
    안전 계층 L3 판정의 **첫 회귀 기준**. **CI 편입은 판5에서 판단**(이 판은 로컬 러너로 둔다).
- **검증**: 독립 새-컨텍스트 리뷰 **4팀 전원 PASS** · **회수 1건 + 경량 수정 1건**.
  - **R-DP(정책 12) PASS** — 파싱 동치 독립 재검 **11/11**(절취 충실도 기계 대조 + 변이 15종
    음성) + **실훅 바이너리 530회 종단 대조**(5프로파일 · **판정 차이 0** · 종단 하네스도
    음성시험) · 하드코딩 **6/6 바이트 동일** · 구문 층 **12/12 불변**(H3→H2 승격 0 · 링크 11 ·
    fence) · 서문 12/12 재저작 · 숫자 변경 0.
  - **R-CODE(코드) 11 PASS / 1 FAIL → 회수 완료** — FAIL = `element_create_sample.abap:71`
    closing line이 `ecc-ddic-fallback.md` §4 **축자 계약 이탈**(Major) → `378db9c7`로 원문
    문자열 복원 · lint 0. 훅 4종은 **74건 스위트를 원본 훅에도 걸어 동일 통과** + 변이 3종 검출
    실증 + 원·신 payload 문자 대조.
  - **R-SPEC(사양서 체인 6건) PASS** — build-spec **E2E 43/43**(독립 ZIP 파서 + OPC +
    SpreadsheetML 3종 검증기) · `screen-image-renderer` **export 18종 확정**(정찰 17은 오기) ·
    원↔재 77/77 + 엣지 384콜 대조 · 템플릿 신조·**재현성 기계 증명**(재실행 산출물 해시 = 커밋
    자산 해시).
  - **경량 수정 1건**: `core/procedures/program-to-spec.md`의 수치·예시 **5곳**(`a5f5279a`) —
    ⓒ의 템플릿 재제작이 만든 어긋남을 R-SPEC이 특정했고 **같은 판에서 회수**했다.
  - **RF 통합 리뷰** — 제품 게이트 **12종 green**(9종 + doctor + `test-hook-switch` 13/13 +
    신설 `test-hook-decisions` 74/74) · 지식 `.md` **148 유지** · 버전 무변 · 생성물 7종 무접촉.
  ⚠ **push 직전 설치본 확인 의무 승계**(판2·판3.1~3.5와 동일 — D-060 편승 · **미배포 0.7.0**):
  `node interactive/scripts/doctor.mjs`로 설치본 manifest version을 확인하고 **이미 0.7.0
  설치본이 있는 머신이 발견되면 패치 범프 후 push**. (`HANDOFF.md` 재개점에도 있으나 그 블록은
  다음 판이 덮어쓰므로, 판이 넘어가도 남는 자리로 여기에 둔다.)

**판4 재료** (다음 판이 이어받는 것)

- **⚠ 1-E 계약이 판4의 선례다.** 판4가 다시 쓰는 `templates/oop-sample/` 20파일은 이 판이
  처리한 견본 5편과 **같은 성격**(코드 견본 · 소비자가 파일명·구조로 인용)이다. 그러므로
  **D-089 ⓑ**(동작 동결 재구현 — 시연 패턴·FM 흐름·교육 목적 동치 · 주석·메시지·변수명·구현
  스타일은 자체 저작)와 이 판의 실측 관습을 그대로 준용한다:
  - **ecc 트리오가 헤더 라벨 `What` / `How` / `Caution`으로 독립 수렴**했다 — 견본 헤더의
    사실상 표준이다.
  - **`ecc-ddic-fallback.md` §4의 축자 요소는 계약이다** — 이 판의 유일한 리뷰 FAIL이 그
    축자 이탈이었다(`378db9c7`). 판4는 **소비자 문서가 견본 문자열을 축자로 고정한 자리**를
    먼저 찾고 시작할 것.
  - **앵커 문자열 `zrsc4sap_oop_ex`는 개명 게이트가 지킨다** — 20파일 재생성이 이 앵커를
    건드리면 `check-runtime-path-rename.mjs`가 거부한다(명부 §6 앵커 제약).
- **⚠ 소비자 4곳 INCLUDE 순서 정렬 필요 (판4가 함께 정리하는 것이 자연스럽다)**:
  `main-program.abap` 재저작이 헤더 주석의 INCLUDE 순서 오기를 **본문 정본으로 정정**했고, 그
  정정이 **소비자가 인용하는 순서가 본문과 어긋남을 표면화**했다 — `include-structure.md:24`·
  `:32` · `clean-code-procedural.md:13` · `review-checklist.md:208`(MAJOR 게이트). ⚠ **정정
  전에도 완전 일치는 아니었다**(소비자 문자열에 `e`가 포함돼 있었다). 함께 표면화된 자기모순:
  S1 「6필드」 주장 순환 미확정 · S3 소비자 순서 문자열에 Procedural 금지 `e` 포함 · S4 c/a 허용
  여부가 `include-structure` 내부에서 모순 · S5 `review-checklist:208`이 이 파일로는 검증
  불가한 항목 지정(PBO/PAI는 o/i INCLUDE 소재) · S6 `f_` 접두 divergence. **판4가 템플릿을
  다시 쓰며 소비자 문서를 함께 정렬하는 것이 자연스럽다** — 이 판은 소비자 무접촉 계약이라
  손대지 않았다.
- **이월 전량 승계 (판3.5 브리프의 「판3.6 재료」 본문 전부 — 이 판도 손대지 않았다)**:
  소비자 오인용 4건 · 사실 의심 2건 · 제품명 표기 갈림 · 이식 전 참조 보존 목록 21곳(⚠ 그중
  1곳은 소비자 오인용 ④와 같은 건 — **이중 계수 금지**) · 소비자 서술 불일치 4건 · 헤딩 재작성
  기록 2건 · 판3.3~3.5가 등재한 모듈별 사실 의심 전부 · **참조표 사실 의심 밀도 경보
  BW·QM·TR·TM·WM** · 낡은 도구명 동결 55곳 · `BW/workflows:9` `AEDАТ` 키릴 동형 이체자 ·
  `PS/workflows:82` DDLS 행 무접촉 권고 · KR 「전기/계상」 갈림(열린 채) · 배치 내 상호 인용
  (모듈 `spro.md:9` → `common/spro.md` 헤딩 「IMG Activity Verification」 — **절 이름으로만**
  다루고 행 좌표를 박지 말 것).
- **⚠ `SD/bapi.md:31` 잔존 1건은 아직 열려 있다** — 판3.5가 「판3.6이 처리한다」고 넘겼으나
  판3.6 사양이 **범위 밖으로 명시**해 손대지 않았다(이 판의 배치는 잔량 29편 소진이었다).
  명부 체크는 이미 서 있으므로 **수리 커밋 1건**이면 닫힌다 — 내용 개정 판 또는 판4가 편승
  처리 가능.
- **판3.6 신규 등재 (전부 원문·현행 동작 보존 · 수리는 별건)**:
  - **훅 파서 갭 4종** — 패턴 파서가 첫 토큰만 취해 **`Y*` 커버리지 0**(문서 약속과 훅 동작의
    갭 · `ZPA_*`류는 `^Z…`가 우연 커버) · `| View | Wraps | Why |` 헤더 행이 헤더 스킵
    정규식(`Table|Pattern`만)에 안 걸려 **유령 엔트리 `VIEW`로 파싱**(CDS 하위표를 가진 전 파일
    공통 선재 결함 — 훅 정규식 1줄 수정감) · `| Table / Pattern |` 헤더도 미스킵(유령 2종) ·
    **비객체 JSON 입력 시 크래시 = 실질 fail-open**. **별도 D-결정 후보.**
  - **문서↔훅 불일치 5건**(`table_exception.md`) — `scripts/hooks/` 구경로 2곳(문서화된 스모크
    명령이 그대로는 실행 불가 · `data-extraction-policy.md:116`도 동일) · 제외 파일 서술 과소
    (실제 2파일 제외) · H2 리셋 서술이 현 구조와 불일치 · **와일드카드 행 형제 소실 실증**
    (`PA9000` deny ↔ `PB9000`/`PD9000` allow · `ZANYPII` ask ↔ `YANYPII` allow) · GetTable
    구도구명.
  - **브랜드 표기 3갈래 혼재** — 헤더 `SAPKIT` 전환 / 콘솔 접두 `[sapkit]` 전환 / 판정 이유
    `sc4sap policy` 유지(가족 4훅 일관 우선). 동작 위반은 아니고 **통일은 별건**.
  - **`sap-stocker.md:29`·`:48` 구경로 잔존**(`exceptions/custom-patterns.md` — 코드스팬이라
    `check-links` 밖).
  - **`screen-image-renderer` QUIRK 5건 동결 마킹** · **`fetch-sap-help-doc` 전송 실패 경로
    exit 크래시**(Node24/Windows undici — 선재 · 채록대로 동결).
  - **⚠ `md` 블록리스트는 상설 게이트가 읽지 않는다** — `conformance-server-gates.mjs`는 **서버
    번들 문자열**만 대조한다. 정책 12의 파싱 회귀에 대한 유일한 방어가 이 판의 **파싱 동치
    검증**이고 그것은 상설 게이트가 아니다. **상설화는 후속 후보.**
  - **신설 러너 CI 편입 = 판5 소관**(D-089 ⓔ) — `test-hook-decisions.mjs`는 지금 로컬 러너다.
    CI(`.github/workflows/offline-gates.yml`)와 `CLAUDE.md` 게이트 목록 등록을 판5가 판단한다.
- **정직 유보 승계 (D-089)**: Description 열 11셀 재저작(일관성 이탈 **명시 수용** — dead
  field · 사실 이탈 0) · 브랜드 표기 혼재 · 훅 파서 갭 동결 · md 블록리스트 CI 무방비 ·
  채록 74케이스는 **현행 동작의 스냅샷이지 「옳은 동작」의 정의가 아니다**(동작을 고치는 판은
  러너부터 고쳐야 한다).

### 판4 — ⑶-c ZRSC4SAP 템플릿 재생성 (집필분)

- **목표**: `interactive/core/knowledge/abap/templates/oop-sample/`의 `zrsc4sap_*`
  20파일(프로그램 9 + 화면 2 외)을 SAPKIT 이름으로 새로 작성. **레포 템플릿 원본만** —
  SAP 시스템 내 기존 오브젝트는 무접촉.
- **완료 기준**: 새 템플릿 집필 완료 + 개명 게이트(`check-runtime-path-rename.mjs`)
  통과. **실 SAP DEV 생성→활성→기계 확인은 판6으로 이연**, 옛 템플릿 제거는 그 확인
  뒤(판6 완료 전 삭제 금지).
- **재료**: 위 **판3.6 브리프의 「판4 재료」** — 1-E 견본 5편이 판4의 **선례**이고
  (D-089 ⓑ · What/How/Caution 헤더 관습 · `ecc-ddic-fallback.md` §4 축자 요소 ·
  앵커 `zrsc4sap_oop_ex` 보존), **소비자 4곳 INCLUDE 순서 정렬**이 함께 처리할
  후보로 표면화돼 있다.

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
