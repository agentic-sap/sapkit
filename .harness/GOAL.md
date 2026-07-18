# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

**백로그 5-13 층3 (2026-07-18, 층2에 이어 같은 세션)** — JNC 교훈 팩 층3
(방법론 8항목, `D:\Claude for SAP\JNC-Dashboard\docs\reference\
sap-adt-lessons-pack.md` 138~160행)을 트랙 A 방법론 시드로 반영. 목적지
후보(HANDOFF §5-13 층3): `domain/abap/RULES.seed.md`(후보 풀 — S-0NN
부정형+출처 형식) · `adapters/vsp/VERIFY-PATTERNS.md`(verify 관례 정본) ·
계획 관례(정본 위치는 감사가 판정) · 층3-1·층3-5는 리뷰 게이트 스펙
`docs/reference/designs/2026-07-17-phase3-review-gate.md` §6 보강 재료
(D-021 정합 — 승인된 설계 결정 자체는 변경 금지, 보강만).

## Success criteria (기계 검증 가능)

- [ ] **감사표**: 팩 층3 8항목 각각 판정(신규/보강/기반영) + 목적지 + 근거
      (기반영 판정은 기존 좌표 제시). 감사 정본 =
      `docs/reference/audits/2026-07-18-5-13-layer3-audit.md`.
- [ ] **반영 완료**: 신규/보강 판정분이 목적지에 실재. RULES.seed 추가분은
      기존 S-0NN 부정형+출처 형식·기존 번호 연속. `.harness/RULES.md`·
      `.harness/LESSONS.md` 무수정(시드/문서 경유 규약). VERIFY-PATTERNS
      수정은 정본(adapters/vsp)에 — `.harness/` 스텁은 포인터 정합만.
- [ ] **리뷰 게이트 스펙 §6 보강**: 층3-1·층3-5 재료 반영 + 승인 결정
      (엄격도·BLOCKED 정책 등 §5 계열) 무변경 — D-021 정합 유지.
- [ ] **게이트 5종 green 유지** (트랙 A 문서 변경이라 interactive 게이트
      비영향이 정상 — 실행으로 확인). CLAUDE.md 수치 비영향(지식 아님) 확인.
- [ ] **새-컨텍스트 독립 리뷰 PASS(BLOCKER/MAJOR 0)** — 리뷰어가 팩 원문 대
      반영본 대조 + 기반영 판정 좌표 재확인.
- [ ] **HANDOFF·STATE 기록 + 커밋** (§5-13 층3 완료 표기 = 5-13 전체 종결).

## Verification method

1. 게이트 5종 exit code 실측 + `.harness/RULES.md`·LESSONS.md 무변경
   (`git diff --stat` 확인).
2. 리뷰어(새 컨텍스트, read-only)가 팩 층3 8항목 커버리지를 반영본 좌표로
   재확인 + 시드 형식(부정형·출처·번호 연속) 검사 + 스펙 §6 보강이 승인
   결정을 침해하지 않는지 D-021·스펙 원문 대조.
3. 동결 레포·JNC-Dashboard 무수정 확인.

## 제약 (전 기간 유효)

- `.harness/RULES.md` 직접 대량 추가 금지(메모리 루프 규약) — 시드/문서 경유
- 동결 레포 sc4sap-custom **읽기만**(R-004) · JNC-Dashboard 읽기만
- 무인 SAP write 금지(5-11) · final-harness 플러그인 업데이트 금지(5-12)
- DESIGN.md는 설계 변경 시에만 갱신(상태 변화로는 갱신하지 않음)
- 부수 후보: RULES.seed.md 표제 불일치("Error 4종" vs 본문 6개 — 층1 부수
  발견, 차기 수리 후보) — 이 파일을 만지는 김에 동반 수리 여부는 감사 판정
