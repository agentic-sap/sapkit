# ADR — SAP 수행 작업 결정 기록 (append-only)

> 경계: 하네스 "자체"(레포 구조·플러그인·엔진)의 결정은 docs/DECISIONS.md
> (D-번호). 이 파일은 하네스로 "수행한 SAP 개발 작업"의 결정만 담는다.
> 수정·삭제 금지 — 정정도 새 항목으로.

## ADR-001 | 2026-07-12 | Phase 2 대상 객체: PROG 1개 → CLAS+PROG 2개

- Context: 재사용 시나리오에서 REPORT 로컬 클래스는 외부 호출 불가 (답사에서
  서버 정본으로 확정).
- Decision: 재사용 로직을 글로벌 클래스 zcl_sah2_workdays로 승격, 소비자
  리포트 zsah2_duedate와 분리.
- Consequences: 답사가 계획 결정을 바꾼 첫 실증 (Phase 2 완료 기준 충족).
  상세: phases/2-duedate-reuse/PLANNING.md §4-1.

## ADR-002 | 2026-07-12 | 배포 순서 클래스 먼저 + 테스트는 리포트 로컬 배치

- Context: vsp가 CLAS 테스트 include 배포 미지원(TODO). 리포트가 클래스를
  참조하므로 의존 역순 배포 필요.
- Decision: 클래스 → 리포트 순서 배포, 단위 테스트는 리포트의 로컬 테스트
  클래스에 배치.
- Consequences: vsp test PROG로 5 PASS 채점 가능. 클래스 테스트 include
  지원되면 재배치 재론. 상세: phases/2-duedate-reuse/PLANNING.md §4-2.

## ADR-003 | 2026-07-12 | CLAS 배포 결함 노출 시 GUI 수동 주입으로 완주

- Context: 채점 중 vsp CLAS 배포 3결함 실측 (deploy LOCK 거부·잠금 누수·copy
  거짓 성공).
- Decision: 채점 완주를 위해 클래스 소스는 SE80 수동 주입, 결함은 당일 수리
  (vsp v2.38.1-89)로 해소.
- Consequences: R-006 신설 (배포 후 source read 확인). CLAS 배포 경로 개통 —
  수동 우회 불필요. 상세: phases/2-duedate-reuse/scoring-raw.md.
