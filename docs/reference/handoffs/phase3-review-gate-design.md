# 핸드오프 — Phase 3 리뷰 게이트 설계 (harness-design 인터뷰 진행 중)

> 상태 스냅샷 (2026-07-17). 재개 = harness-design 스킬 로드 후 **아래 "미결"의
> 질문 ②부터**. 이 파일은 스펙이 기록되면 삭제한다.

## 확정된 결정 (사용자)

- **B1 게이트 형태 = 별도 리뷰 스텝 (엔진 무수정)**: phase 계획에 리뷰 스텝
  추가, 그 스텝의 verify(셸 명령)가 래퍼 스크립트 실행 — 래퍼가 새-컨텍스트
  read-only 세션 기동 → 판정 JSON → exit code 변환. 근거: Fable + Codex 독립
  검토가 동일 결론으로 수렴, 사용자 확정. 기각: 엔진 포크 수정(내장 _run_review
  게이트화 — 동결·D-018 lock 계약 위반, 상태머신 재설계 부담) · 사람 셰퍼딩
  (무인 가치 반감·규율 의존).
- **B2 게이트 시점 = SAP write(deploy) "직전"마다**: 배포 후 검사는 게이트가
  아니라 사후 검토(Codex 지적). 리뷰 PASS는 코드 지문(해시)에 바인딩하고
  deploy 직전 동일성 재검증 (검사 후 코드 변경 틈 = TOCTOU 방지).
- **B4 리뷰어 = 설정값**: 이 프로젝트 기본 Claude(opus급 — 트랙 B·엔진 리뷰
  실적 검증). Codex 드라이버 환경에서 템플릿을 쓸 때는 설정으로 codex 모델
  지정(사용자 언급: 5.5 계열). 스펙에 특정 모델 버전 못박지 않음.
- **B15 = 스펙 초안 완성 후 Codex 교차 리뷰 1회** → 반영 → 사용자 승인 → 기록.
- **기술 7건 위임** (사용자 "맡김" — Fable+Codex 수렴 추천에 위임로 기록):
  1. 내장 비게이트 리뷰(review.md)와 이름·권위 분리 — 게이트 판정만 권위,
     내장은 shadow 참고 신호
  2. 리뷰어 프로세스는 read-only 최소권한 — SAP 쓰기 자격증명·범용 쓰기 명령
     미제공 (ABAP 주석·문서 = 신뢰 불가 입력, 프롬프트 인젝션 대비)
  3. 입력 패키지 = 승인 기준/스펙 + 대상 전체 소스 + 기계검증 결과(테스트·ATC)
     — diff만 금지. read-only vsp source read 허용(allowlist)
  4. 출력 = 트랙 B review-request/result JSON 스키마 이식, 엄격 스키마 검증을
     통과한 PASS만 exit 0 — 빈 출력·파싱 오류·CLI 오류는 전부 비-0
  5. fail-closed — FAIL/TIMEOUT/INFRA_ERROR/MALFORMED 구분하되 write에 대해
     전부 차단. 인프라 재시도와 코드 수정 재시도는 예산 분리
  6. DESIGN.md §13 Phase 3 완료 기준에 "리뷰 게이트가 실제 결함을 차단한 실증
     1회" 추가
  7. 나머지 선결 2건(0b 마커 실측 확장 · §14-2 drift 실측)은 이 설계 스코프 밖

## 미결 (재개 지점)

- **질문 ② (B9·B11) 검사 엄격도** — 추천 제시된 상태, 사용자 답 대기:
  표준안 = MAJOR 1개면 FAIL · MINOR만이면 PASS(기록) · "워커가 실제 수정한
  revision" 기준 3회 후 BLOCKED. (대안: 더 엄격 = MINOR도 FAIL / 더 느슨 = 5회)
- **질문 ③ (B12) BLOCKED 시 사람 개입·알림 방식** — 미질문.
- 이후 순서: 커버리지 표 최종 승인 → challenge probes(contrarian·simplifier)
  → 스펙 초안 → **Codex 교차 리뷰(B15)** → 반영·승인 →
  `docs/reference/designs/2026-07-17-phase3-review-gate.md` 기록 →
  harness-docs Mode B 흡수 제안 → harness-plan (전부 제안만 — 자동 실행 금지).

## Codex 독립 검토 요지 (2026-07-17, codex exec — 스펙 작성 시 반영)

- 결론: **안 1 조건부 추천** (Fable 추천과 독립 수렴).
- 조건: ① 동일 산출물에 리뷰만 재호출 금지 — 비결정성으로 "재시도하다 우연히
  PASS" 방지, 같은 해시의 FAIL은 캐시 반환 ② 3회 한도는 수정 revision 기준
  ③ 판정 정책 명시(MAJOR=FAIL 등) + 발견마다 파일/위치/근거/위반 요구사항 필수
  ④ fail-closed 오류 분류 ⑤ 컨텍스트 충분 공급 ⑥ 리뷰어에 쓰기 자격증명 금지
  ⑦ 내장 리뷰와 권위 분리 ⑧ PASS-해시 바인딩 + deploy 직전 재검증 ⑨ 비용
  계측·동일 입력 캐시.

## 탐사 확정 사실 (질문 불요 — 근거 좌표)

- 엔진 내장 리뷰는 **비게이트**: claude-final execute.py `_run_review`(phase
  완료 직후 자동, 별도 프로세스·쓰기 차단·원복까지 구현, 그러나 FAIL/타임아웃
  생략에도 phase 완료 판정. 끄기 옵션 없음).
- 스텝 verify = 셸 명령 exit code (harness-plan 계약) → 래퍼 방식 성립 근거.
- 무인 스텝 MCP 0 (DESIGN.md §15 F1) — 리뷰어 SAP 접근은 vsp CLI read-only로.
- 트랙 B 이식 자산: interactive/core/procedures/schemas/의
  review-request/result 스키마 · review-checklist.md의 리뷰어 계약(read-only
  기계 격리·3회·BLOCKED).
- 리뷰 게이트 필요성의 실증: 기계 검증 전부 통과한 시맨틱 결함(INNER vs LEFT
  JOIN, HANDOFF §4.1) + 교차 리뷰의 신규 결함 발견(AUTHORITY-CHECK 부재, D-013).
