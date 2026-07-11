# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

트랙 A Phase 1 — Offline ABAP Harness (DESIGN §13). 무인 엔진(execute.py) 첫 투입
구간 (투입은 proposal-only — 사용자 승인 후).

## Success criteria

- [ ] 객체 유형별(ABAP/CDS/RAP/AMDP) offline lint/parse 커버리지 실측 표가
      `adapters/vsp/VERIFY-PATTERNS.md`에 완성 (유형별 차단/통과 결함 클래스 명시)
- [ ] `domain/abap/RULES.seed.md` + `CHECKLIST.md` 선별 이식 (원천: vsp embedded
      standards + interactive/core/knowledge/abap — 출처 표기, 부정형 위주. §12:
      RULES.seed는 후보 풀이지 자동 주입원 아님)
- [ ] ABAP 프로그램 1건 offline 초안 → lint verify 루프 완주 — **테스트 클래스 소스를
      구현보다 먼저 작성** (§7 관례 강제)
- [ ] 하네스 run-summary에 성공 step 기록 (무인 엔진 첫 가동 — 드라이버는 사용자 선택)
- [ ] 의도적 lint Error 소스가 offline 게이트에서 차단됨 1회 실증 (Phase 1 완료 기준)
- [ ] 게이트 4종 통과 + STATE/HANDOFF 갱신 + 커밋

## Verification method

1. VERIFY-PATTERNS.md 커버리지 표: 4개 유형 행 존재 + 각 유형에 실측 근거(실행 로그)
2. domain/abap/ 파일 2종 존재 + 각 규칙에 출처 라인
3. src/ 아래 테스트 클래스 파일의 git 커밋/작성 시각이 구현보다 선행 (또는 step 순서로 증명)
4. phases/<task>/ run-summary(또는 STATE 기록)에 성공 step ≥ 1
5. quality-gate-sap.ps1에 의도적 Error 파일 → exit 1 → 제거 → exit 0
