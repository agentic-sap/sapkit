# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

**트랙 A Phase 4(Domain Packs) 커넥티드 청크 — 완료 기준 ①·② 실증으로 Phase 4 종결.**
정본 = DESIGN §13 Phase 4(완료 기준 2건) · `phases/4-glopen-recon/recon-raw.md`(CONSULT
답사·결정 정본) · `phases/4a-glopen-seed/`·`phases/4b-glopen-gated/`(계획, 커밋 6ff695e).
사용자 확정: 규칙 승격=씨앗 결함 주입 · 배포=에스코트 · 객체명 ZSAH4A_GLOPEN(씨앗)/
ZSAH4_GLOPEN(정상), $TMP, IDEA-JNC(S4H/100). 오프라인 1단계(팩 3파일+DESIGN v2.3,
c2def6d)와 완료 기준 ① 증거(recon §2 팩 전/후 결정 델타 5건)는 확보 상태에서 시작.

### 남은 실행 순서

1. [사용자 터미널] `python scripts/execute.py 4a-glopen-seed` (자격증명 없는 셸, opus)
2. [메인 세션] 4a 결과 판독 → LESSONS 기록 → FI-002 → R-007 승격 + 4a 잔존물 정리
3. [사용자 터미널] `python scripts/execute.py 4b-glopen-gated`
4. [사람+메인] 에스코트 런북(4b PLANNING §6): deploy → drift → atc → unit
5. [메인 세션] 문서 계약(HANDOFF·STATE·GOAL) + Phase 4 완료 판정 + 커밋

## Success criteria

- [ ] ① 팩 CONSULT 실사용 — recon §2 결정 델타가 4b PLANNING에 연결돼 있고, 실제
      산출물(ZSAH4_GLOPEN)이 그 결정(ACDOCA·원장 필터·파라미터화)대로 구현됨
- [ ] 4a 씨앗 차단 — 리뷰 게이트 FAIL(§16/FI-002 적중, B2/MAJOR)로 error 종료,
      step2(escort-write) 미도달, 엔진 로그·index.json status로 실측
- [ ] ② 규칙 승격 — 4a 실패에서 LESSONS 엔트리(코드 결함 근거, ENV/LOCK 마커 아님 —
      R-001) → `.harness/RULES.md`에 R-007(FI-002 유래) 등재, 예산(30/40·12/16KB) 내
- [ ] 4b 정상 경로 — 리뷰 PASS → completed → main 병합, 에스코트 체인 4단
      (deploy+activate·drift clean·ATC 비악화·unit green) 실측
- [ ] 리뷰어 블라인드 유지 — 4a 리뷰 세션이 읽은 파일에 씨앗 메타 노출 없음(사후 확인)
- [ ] 문서 계약 갱신(HANDOFF 헤더·STATE·ARCHITECTURE 필요시) + 게이트 유지 + 커밋

## Verification method

1. 4a/4b는 엔진 콘솔 로그 + `phases/*/index.json` status + review-verdict.json 직접
   판독 (자기보고 불신)
2. 규칙 승격은 RULES.md diff + 대응 LESSONS 엔트리 대조 (PROTOCOL.md 메모리 루프 준수)
3. 에스코트 체인은 명령별 exit/출력 실측 기록 (3b scoring-raw 선례 포맷)
4. Phase 4 종결 판정은 DESIGN §13 완료 기준 2건 문면 대조
