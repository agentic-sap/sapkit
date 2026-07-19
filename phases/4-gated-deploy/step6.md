# Step 6: evidence-consolidation (AC-8·14·15 + 완주 체인 증거)

## Read first

- `phases/4-gated-deploy/state/` 전체 산출물(state.json·verdict-*.json·
  verification.json·probes-evidence.json·drift-evidence.json·서버 read 3종)
- `phases/4-gated-deploy/checks/check-phase-evidence.mjs` (**증거 파일의 기계
  계약 — 이대로 만들어야 verify가 통과**)
- 리뷰 게이트 스펙 §6 AC-8·AC-14·AC-15 원문
  (`docs/reference/designs/2026-07-17-phase3-review-gate.md`)

## Task

`state/phase3-evidence.json`을 작성하라 — **전 필드가 실측 산출물에서만
전사**되어야 한다(주장 금지):

```json
{
  "ac8": {"red_capsule_hash": "<FAIL verdict의 해시>",
           "green_capsule_hash": "<pass_records의 해시>",
           "red_findings_summary": "<MAJOR/B2 발견 1줄>"},
  "ac14": {"uncovered_count": <verification.json uncovered_by_machine 길이>,
            "capsule_embedded": true},
  "ac15": {"server_evidence_embedded": true,
            "mechanism": "wrapper vsp source read → capsule verification block (prompt v1.1)"},
  "drift": {"drift_detected": true, "marker": "<step5 마커>"},
  "probes": {"transport_readonly": "<요지>", "atc_error_exit": "<요지>",
              "clas_include_deploy": "<요지>"},
  "chain": {"full_chain_green": true,
             "chain": "deploy(capsule)→activate→drift-clean→ATC→unit"}
}
```

`full_chain_green`은 step 3(캡슐 배포)·step 4(채점: drift-clean·ATC·test)의
verify green을 근거로만 true로 둔다.

## Acceptance Criteria

index.json step 6의 verify(`check-phase-evidence.mjs`) exit 0.

## Verification procedure

1. `summary`에 AC-8(red FAIL→green PASS 해시쌍)·AC-14(미검증 목록 수)·
   AC-15(메커니즘)·drift·프로브 3건을 각 1줄로 요약 — 이 summary가 HANDOFF
   기록의 원천이 된다.
2. `phases/4-gated-deploy/index.json` step 6 갱신.

## Forbidden

- 실측에 없는 값 창작 금지(모든 해시·수치는 state 산출물 원문 전사).
- SAP 연결 불요 — 이 스텝은 로컬 취합만(연결 명령 금지).
- `state/` 밖 파일 수정 금지(index.json 제외).
