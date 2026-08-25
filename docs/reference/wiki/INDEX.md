# 콜드 층 마스터 색인

> **재생성 가능한 파생물** — 이 색인은 위키 7편과 `docs/reference/` 콜드 층 파일들을
> 훑어 만든 지도이지, 그 자체로 사실의 정본이 아니다. 결정의 '왜'는
> [`../DECISIONS.md`](../DECISIONS.md)(append-only)가, 변경 이력은 git이 갖는다. 서술이
> 정본과 갈리면 **정본이 이긴다**. 합성 일자 **2026-08-25**.

이 문서는 `docs/reference/` 아래에 쌓인 콜드 층 기록을 찾아 들어오는 **입구**다. 네
부분으로 되어 있다 — ① 위키 페이지 7편(주제별로 엮은 서사) ② 콜드 층 전수 지도(파일
단위 포인터) ③ 아카이브 2종(디렉터리 단위 포인터) ④ 원본 층 안내.

## ① 위키 페이지 7편

주제별로 결정 로그·보관소를 엮어 서사로 합성한 페이지들이다. 사실이 아니라 **맥락**을
얻으려는 사람을 위한 것이고, 각 페이지 머리의 정본 포인터가 사실의 출처다.

- [엔진 교체의 전 역사](engine-replacement-history.md) — 제품 MCP 서버가 남의 포크였다가
  자체 저작 `sapkit-engine`으로 갈아탄 40여 일(편입 → 병행 제작 → 교체 → 구 포크 은퇴)의
  연대기. 「왜 갈아탔나」와 「그 대가로 무엇을 잃었나」에 답한다.
- [브랜드 단일화 전말](brand-unification-history.md) — 제품명이 `sc4sap`에서 `sapkit`으로
  바뀌기까지, 겉이름·속이름·SAP 오브젝트명 등 여섯 갈래에 걸쳐 열 번 넘게 이어진 개명
  작업과 「도달」 공표 뒤 세 번의 회수를 다룬다.
- [트랙 A의 일생](track-a-lifecycle.md) — 하네스 트랙이 vsp CLI 백엔드 확정 → 무인 실행
  리뷰 게이트 설계 → 3축 재기준 → `unattended=sealed` 봉인 → 실행 설비 철거(renew 1차)를
  거쳐 오늘 「라우팅 규약 한 장」만 남기까지의 경위.
- [검사기 계보](checker-lineage.md) — 로컬 ABAP 검사기가 외부 Go 포크(`vsp`) 편입 →
  제품 동봉 → 역할 축소(오프라인 분석 전용) → 자작 TypeScript 검사기 교체 → 서브트리
  은퇴로 「되뜰 수 없는 채록본」이 된 경위.
- [문서 기관의 역사](docs-organ-history.md) — 이 프로젝트가 결정 로그·상태 문서·판 큐를
  세우고 옮기고 잘라 온 방식. 로그 1종 신설 → 2종 확장 → 디렉터리 이전 → 규칙 이관 →
  이 위키 신설까지.
- [ABAP 자산 재저작사](abap-assets-reauthoring.md) — 제품이 사용자 SAP에 심는 ABAP 자산이
  상류 코드 무접촉에서 참조-재저작·개명 대상으로 뒤집힌 경위와, 그 뒤 실 SAP 검증이
  오프라인 검사기가 못 보던 결함을 두 번 잡아낸 기록.
- [배포·설치의 변천사](distribution-install-history.md) — 완전 오프라인 설치 · 안전 훅
  기본 미설치(서버 게이트로 무게 이전) · 제품을 단일 번들 파일로 묶는 세 가지 불변
  결정이 왜 지금 모양이 됐는가.

## ② 콜드 층 전수 지도

`docs/reference/` 직속 문서와 `designs/`·`audits/`·`templates/`의 파일 단위 포인터다.
날짜 접두 파일명은 작성일(YYYY-MM-DD)이다.

### 직속 (4)

- [ADR.md](../ADR.md) — 보조(로컬) 머신 줄기가 트랙 A "수행 레벨"(SAP 개발 작업) 결정을
  담던 ADR 로그. 분기 통합 후 활성 정본 자리를 `DECISIONS.md`에 넘기고 이력으로 보존됨
  (append-only, 무수정).
- [DECISIONS.md](../DECISIONS.md) — 레포 결정 로그의 **단일 정본**(append-only). 굵직한
  결정 1건 = 항목 1개, D-001부터 번호로 누적되며 정정도 새 항목으로 붙는다.
- [LEGACY-CATALOG.md](../LEGACY-CATALOG.md) — 옛 `phases/**`류 레거시 아티팩트가 "작업
  대기열"이 아니라 "증거 보관소"임을 사람이 읽는 분류표로 못박은 문서.
- [copy-baseline.md](../copy-baseline.md) — 차용(`class: copy`)으로 들어온 것을 자체
  문장·구현으로 재저작하는 사다리 ⑶-b의 진척 장부. 170/170 완주 기록으로 마감됨.

### designs/ (14)

- [2026-07-13-unattended-review-gate.md](../designs/2026-07-13-unattended-review-gate.md)
  — 무인 gated write 체인의 plan-레벨 리뷰 게이트 초기 설계(v0.17 legacy — v2 rebase가
  대체, 역사 증거로 보존).
- [2026-07-14-track-a-v019-rebase.md](../designs/2026-07-14-track-a-v019-rebase.md) —
  트랙 A 실행 모델을 상류 v0.19 3축(Direct/Guided/Engine attended)으로 재기준하는 초안
  설계서(v2가 대체).
- [2026-07-14-v019-engine-analysis.md](../designs/2026-07-14-v019-engine-analysis.md) —
  재기준 단계 1 산출물. v0.19 엔진 커밋을 Codex가 read-only로 정밀 분석한 파일:행 좌표
  근거 자료.
- [2026-07-15-codex-review-of-rebase-draft.md](../designs/2026-07-15-codex-review-of-rebase-draft.md)
  — 07-14 재기준 초안에 대한 Codex 교차검토 결과("PASS with fixes", MAJOR 8건).
- [2026-07-15-fresh-review-of-rebase-v2.md](../designs/2026-07-15-fresh-review-of-rebase-v2.md)
  — 재기준 v2 확정판에 대한 새-컨텍스트 독립 리뷰(Claude opus, read-only, "PASS with
  fixes").
- [2026-07-15-track-a-rebase-v2.md](../designs/2026-07-15-track-a-rebase-v2.md) — 트랙 A
  실행 모델 재기준 설계서 v2. 실행 구조 × SAP 권한 프로필 직교 모델의 확정판(D-025
  봉인) — 라우팅 규약의 원 정본.
- [2026-07-16-integration-hardening-roadmap.md](../designs/2026-07-16-integration-hardening-roadmap.md)
  — sap-agentic-harness·claude-fable-final·vsp-custom 통합 경계를 잇는 보강 실행
  설계(진행 순서 재정렬).
- [2026-07-17-phase3-review-gate.md](../designs/2026-07-17-phase3-review-gate.md) — 무인
  SAP write 직전 새-컨텍스트 리뷰를 강제하는 Phase 3 게이트 설계 스펙(harness-design
  인터뷰 산출물).
- [2026-07-22-sapkit-setup-skill.md](../designs/2026-07-22-sapkit-setup-skill.md) —
  `/sapkit:setup` 대화형 온보딩 설치 마법사 설계(원본 sc4sap `/setup` 하네스 중립
  복원).
- [2026-07-23-aegis-methodology-absorption.md](../designs/2026-07-23-aegis-methodology-absorption.md)
  — aegis "한 루프 세 강도" 방법론 흡수 설계 v2(Codex 교차 리뷰 반영, BLOCKER 0).
- [2026-08-01-runtime-path-rename-sapkit.md](../designs/2026-08-01-runtime-path-rename-sapkit.md)
  — 런타임 프로파일 경로 개명(`.sc4sap` → `.sapkit`) 설계. R-PRESERVE 방식(병존 후
  이행)의 구현 사양.
- [2026-08-02-claude-onboarding-codex-parity-no-engine.md](../designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md)
  — 배포 온보딩·Codex 동등 UX 최종 구현 설계 v2. 훅 기본 미설치·엔진 소스 유지 등 사용자
  결정 3건 반영.
- [2026-08-04-execution-owner-activation.md](../designs/2026-08-04-execution-owner-activation.md)
  — `execution_owner` 위임이 기본 경로에서 실제로 발동하도록 하는 구조 수리 설계(실사용
  제보 대응).
- [2026-08-23-project-brain-design.md](../designs/2026-08-23-project-brain-design.md) —
  문서를 웜(핫 경로)/콜드(정본) 층으로 가르는 "프로젝트 두뇌" 설계. 다른 레포 원본에서
  편입된 문서(판B).

### audits/ (9)

- [2026-07-18-5-13-layer1-audit.md](../audits/2026-07-18-5-13-layer1-audit.md) — JNC
  교훈 팩 층1(엔진 표면 12항목)을 실코드 동작으로 대조한 감사·수리 기록.
- [2026-07-18-5-13-layer2-audit.md](../audits/2026-07-18-5-13-layer2-audit.md) — 같은
  팩 층2(지식, 8항목)를 `conventions/` 이식 목적지와 대조한 선결 판정 감사.
- [2026-07-18-5-13-layer3-audit.md](../audits/2026-07-18-5-13-layer3-audit.md) — 같은
  팩 층3(방법론, 8항목)을 트랙 A 시드와 대조하고 반영 목적지를 정한 감사.
- [2026-07-19-branch-divergence-assessment.md](../audits/2026-07-19-branch-divergence-assessment.md)
  — push 거부로 발견된 주/보조 머신 6일 분기의 전수 조사와 통합 작업 계획(정본).
- [2026-07-19-remaining-backlog-sweep.md](../audits/2026-07-19-remaining-backlog-sweep.md)
  — 잔여 백로그 전수 조사와 스프린트 웨이브 배치(소진 스프린트 W0 정찰 산출물).
- [2026-07-20-project-direction-assessment.md](../audits/2026-07-20-project-direction-assessment.md)
  — 저장소가 실제로 무엇을 담고 있는지 코드·구성·테스트 결과로 짚은 설계 전 객관 진단.
- [2026-08-15-rv-classification-record.md](../audits/2026-08-15-rv-classification-record.md)
  — RV1~RV4 분류와 V1~V5 블로킹 실측표를 은퇴하는 vsp 프로필 문서에서 한 글자도 고치지
  않고 옮긴 보존본.
- [2026-08-20-phase63-attended-record.md](../audits/2026-08-20-phase63-attended-record.md)
  — 판6.3의 attended 실기 46종 실측과 대장 요구 기준 인하 집행의 실행 기록(판단이 아니라
  기록).
- [2026-08-23-btp-abap-trial-grant-probe.md](../audits/2026-08-23-btp-abap-trial-grant-probe.md)
  — BTP ABAP trial 시스템에서 그랜트별 ADT 개방 범위를 실측한 채록(판M2-b, 재현 수단
  포함).

### templates/ (2)

- [review-gate-plan-conventions.md](../templates/review-gate-plan-conventions.md) —
  harness-plan이 phase를 계획할 때 리뷰 스텝을 실제 게이트로 성립시키는 배선 규약.
- [review-step.md](../templates/review-step.md) — attended P3 write 직전 새-컨텍스트
  리뷰 게이트의 스텝 템플릿. run 계획 시 플레이스홀더를 채워 복사해 쓴다.

## ③ 아카이브 2종

두 디렉터리는 **의도적 고아**다 — 웜 문서(`HANDOFF.md`·`docs/RUN-PLAN.md`)가 비대해질 때
살아있는 재개점만 남기고 내린 과거 기록이 § 번호·블록인용 접두어를 보존한 채 여기로
옮겨졌다. 파일을 낱개로 열거하지 않고 디렉터리 단위로만 가리킨다 — 회수 경로는 이
포인터 하나다.

- `docs/reference/handoff-archive/` — `HANDOFF.md`에서 살아있는 재개점만 남기고 내린
  과거 판 기록 전량(판별 완료 블록·롤백 좌표·구 본문 절 포함).
- `docs/reference/run-archive/` — `docs/RUN-PLAN.md`의 판별 브리프 절 이하 전량(판1~판11
  시대의 판 브리프).

## ④ 원본 층 안내

이 위키와 색인은 파생물이다. 결정의 '왜'는 [`../DECISIONS.md`](../DECISIONS.md)
(append-only)가 유일 정본이고, 무엇이 실제로 바뀌었는지는 git 이력이 정본이다. 현행
상태·수치·게이트 목록은 이 콜드 층이 아니라 레포 루트 `HANDOFF.md`·`CLAUDE.md`가 가지며,
이 색인은 그것을 복제하지 않는다.
