# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

**§5-4 보완 세션 (2026-07-18, HANDOFF "▶ 다음 착수 확정" ①)** — 스파이크 Part B
반증("vsp CLI가 read-only 설정을 안 읽는다") 보완 = ①vsp CLI 배선 + ②무인 워커
자격증명 미공급 병행 + 리뷰 게이트 MINOR 5건 + Part B 재실증(AC-10) → step 5 해소.

## Success criteria (기계 검증 가능)

- [x] **vsp-custom 수리** (기준 HEAD 731b871, 그 레포에서만 — D-018 편입 금지):
      CLI write 경로(deploy/copy/execute/install)가 SAP_READ_ONLY=true 및 비-dev
      SAP_TIER를 **네트워크 이전 클라이언트측 거부**. `go test ./...` green +
      오프라인 더미 호스트 프로브로 거부 마커 실측(스파이크와 동일 방법,
      SAP write 0). read 경로 무영향. build/vsp.exe 재빌드.
- [x] **lock 재검증(D-018)**: 명령 계약 10종 + JNC 델타(ActivateGroup·활성화
      거짓성공 4곳·TotalRows/Truncated·FUGR 그룹 진단·UXX 제외) 재검증 후
      `adapters/vsp/vsp.lock.json` 갱신(새 커밋 sha·바이너리 sha256·버전 출력).
      write 검증은 DEV $TMP만(R-003), 반영 확인은 source read(R-006).
- [x] **리뷰 게이트 MINOR 5건**: ①infra_retry_limit 소비(or 주석 명시)
      ②prompt_version 해시 편입 ③PASS 레코드 프롬프트 버전·토큰 ④캡슐 파일명
      vsp deploy 호환(파일명→객체 식별 실측 후 수리) ⑤리뷰어 spawn cwd 분리.
      `node --test 'scripts/review-gate/tests/*.test.mjs'` 전체 green.
- [x] **② 자격증명 미공급 구조**: 무인 워커 스텝 env에 SAP 자격증명 미공급 +
      write 프로파일은 배포 래퍼 경로에만 — 구조 배선·문서화.
- [x] **Part B 재실증(AC-10)**: 새 바이너리로 spike-evidence.json part_b.ok=true,
      `node scripts/review-gate/tests/spike.mjs --check …` exit 0,
      phases/3-review-gate step 5 completed(정식 절차로 해소).
- [x] **정합·기록**: 스펙 §5-4 문구 정합, HANDOFF 갱신, 게이트 5종 green,
      새-컨텍스트 독립 리뷰 PASS(BLOCKER/MAJOR 0).

## Verification method

1. go test·node --test·spike.mjs·게이트 5종 exit code 실측.
2. 오프라인 프로브: SAP_READ_ONLY=true → 네트워크 이전 거부 마커 / env 부재 →
   기존 동작(dial 도달) 대조 — write 실수행 0.
3. lock 재검증 기록(명령별 실측 결과)과 vsp.lock.json 갱신 내용 대조.
4. 독립 리뷰어(새 컨텍스트, read-only)가 두 레포 diff를 이 GOAL 기준으로
   항목별 판정.

## 제약 (전 기간 유효)

- 무인 SAP write 금지(5-11) · final-harness 플러그인 업데이트 금지(5-12)
- Go 수리는 `D:\Claude for SAP\vsp-custom`에서만 · 자격증명 기록 금지(R-005)
- QA/PRD write 금지(R-003) · vsp MCP 서버 모드 금지(R-002)
