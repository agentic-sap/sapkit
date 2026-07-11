# VERIFY-PATTERNS (포인터 스텁)

정본은 `adapters/vsp/VERIFY-PATTERNS.md` (Phase 0b에서 실측 완성 — DESIGN.md §10 정본
규약). 이 파일은 harness-plan이 참조하는 `.harness/` 위치용 포인터 스텁이다.

## 확정 패턴 (Phase 0a 실측 기준)

1. `vsp lint --file <f>` — 오프라인 스타일 린트 7종. **Error 심각도만 exit≠0,
   Warning은 exit 0으로 게이트를 통과한다.** 초안 품질 게이트로만 사용.
2. `vsp parse --file <f>` — 파일 미존재 외 **항상 exit 0**. 게이트가 아니라 구조 출력
   도구이므로 verify에는 파일 존재감시용으로만 의미가 있다.
3. 살아있는 SAP 대상 verify는 반드시 래퍼 경유:
   `powershell -File scripts/verify-sap.ps1 -- <vsp args>`
   — 마커 3종(CODE_FAIL/ENV_FAIL/LOCK_FAIL)을 남기고, `vsp system info` 사전 점검으로
   ENV_FAIL을 조기 분리한다.
   주의(실측 2026-07-11): vsp args에 `--file` 등 대시 인자가 있으면 `-File` 호출은 PS
   5.1 바인딩 오류 — 그 경우 `powershell -Command "& 'scripts/verify-sap.ps1' -- <vsp args>"` 형태로.

## 안티패턴

- `Test-Path`/`test -f` 존재 확인은 verify가 아니다 — 내용 검증 없는 존재감시는
  통과가 무의미하다.
- vsp를 직접 호출한 연결 verify 금지 — 마커 없는 실패는 환경 실패가 코드 결함으로
  둔갑해 LESSONS를 오염시킨다 (DESIGN.md §9).
