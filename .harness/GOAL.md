# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

harness-tailor 승인 산출물 배치 (2026-07-11 사용자 승인: 검사대=달자, 규칙 카드
1·2·4 + 3은 QA/PRD 경계로 정정, tdd-guard=관례 유지, profile=안 만듦)

## Success criteria

- [ ] `scripts/quality-gate-sap.ps1` 존재 — clean tree에서 exit 0 (GATE_PASS 출력)
- [ ] 의도적 lint Error `.abap` 파일 1개를 두면 gate가 exit 1 (GATE_FAIL) —
      파일 제거 후 재실행 시 다시 exit 0 (Phase 0a 완료 기준의 차단 실증)
- [ ] `scripts/verify-sap.ps1` 존재 — 마커 3종(CODE_FAIL/ENV_FAIL/LOCK_FAIL) 출력
      경로 보유, vsp 부재·미연결 시 ENV_FAIL 조기 종료 (패턴 정밀화는 Phase 0b TODO)
- [ ] `.claude/quality-gate.json`이 래퍼 1줄만 등록 + 유효 JSON + git 추적됨
      (.gitignore가 .claude/를 제외 중이면 네거이션 추가)
- [ ] `.harness/VERIFY-PATTERNS.md` 스텁 존재 (정본 adapters/vsp/ 포인터 + 안티패턴)
- [ ] `.harness/RULES.md`에 R-001~R-005 append (형식: `- R-NNN [area] ... (from tailor)`)
- [ ] 게이트 4종(coverage·links·verify-engine·smoke) 통과 유지

## Verification method

1. `powershell -File scripts/quality-gate-sap.ps1; $LASTEXITCODE` → 0 (clean tree)
2. lint Error 내용의 `src/_gate-smoke.abap` 생성 → 같은 명령 → 1, 삭제 후 → 0
3. `Get-Content .claude/quality-gate.json -Raw | ConvertFrom-Json` 성공 +
   `git check-ignore .claude/quality-gate.json` → 미매칭(추적 가능)
4. `.harness/RULES.md` tail에 R-001~R-005 5줄 존재
5. HANDOFF §9 게이트 4종 exit code 확인 (coverage의 2는 비차단)
