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
| **판3.x** | ⑶-b | copy 지식 치환 (반복 판 — 실전 검증분부터) | 불필요 | **진행** — 판3.1 **완료** (2026-08-17 · `69137bc5` 결정 기록 커밋) · 잔량 **165**/170 · 다음 = 판3.2 |
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

### 판3.x — ⑶-b copy 지식 치환 (반복 판 · 진행 중 — 다음은 판3.2)

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
- **사실 자체가 의심스러운 지점 (재저작이 아니라 내용 개정 소관 — 원문 그대로 보존함)**:
  `sap-version-reference.md`의 `MATNR 40 characters (1909+)` — 외부 확인으로는 40자리
  확장이 S/4HANA **1511**이고 기본 비활성(MFLE 활성화 필요)이다. `abap-release-reference.md`
  체크리스트의 `GetPackage`도 실제 도구 표면은 `GetPackageContents`/`ReadPackage`다.

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
