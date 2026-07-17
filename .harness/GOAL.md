# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

2026-07-17 객관 감사가 등재한 불일치 2건 보완 (HANDOFF 헤더 "다음 세션 보완" —
확정 착수 순서 11-⑪·⑫ Wave 앞의 워밍업).

1. **doctor FAIL 해소** — Codex CLI 실측 0.144.3 ≠ compatibility.json 고정 0.144.1.
   정본 절차(compatibility.json `_comment`, 5-2 agy 선례): 0.144.3에서 설치 스모크
   재실행 → 고정값 갱신 → doctor exit 0. 스모크 후 평시 상태(플러그인 OFF) 복원.
2. **CLAUDE.md 헤드라인 수치 정정** — "지식 217" → 실측 175(knowledge `.md`),
   "절차 15" → 실측 16(install-sap-assets 5-7 추가분 반영).

## Success criteria

- [ ] Codex 0.144.3 설치 스모크 재실행 증거(플러그인 installed+enabled 실측) +
      스모크 후 평시 OFF 복원 확인
- [ ] `interactive/adapters/compatibility.json` codex.version=0.144.3 + smoke
      서술에 재검증 날짜 반영
- [ ] `node interactive/scripts/doctor.mjs` **exit 0** (FAIL 0)
- [ ] CLAUDE.md 트랙 B 헤드라인 수치가 실측과 일치 (지식 175 · 절차 16 ·
      페르소나 26 유지)
- [ ] 게이트 5종 green 유지 + HANDOFF 갱신(보완 2건 해소 기록) + 커밋

## Verification method

1. doctor.mjs·게이트 5종 exit code 실측
2. 수치 실측 명령: `find interactive/core/knowledge -name "*.md" | wc -l` = 175,
   `ls interactive/core/procedures/*.md | wc -l` = 16
3. 독립 리뷰어(새 컨텍스트, read-only)가 diff를 이 GOAL 기준으로 판정
