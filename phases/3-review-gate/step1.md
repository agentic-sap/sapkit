# Step 1: verdict

## Read first

- `phases/3-review-gate/PLANNING.md` §3.1(exit code)·§3.6(심각도·판정 규칙)
- `docs/reference/designs/2026-07-17-phase3-review-gate.md` §4.1-5·§5-6·AC-1·2·3·11
- `interactive/core/procedures/schemas/review-result.schema.json` 와
  `review-request.schema.json` — **읽기만, 원본 무수정** (이식 원천)
- `phases/3-review-gate/index.json` step 0의 `contract` (선행 산출물 확인)

## Task

### 1. 스키마 이식

두 스키마 파일을 `scripts/review-gate/schemas/`로 **복사**한다. 이식본
review-result 스키마에만 additive로 최상위 `insufficient_context`(boolean,
optional) 필드를 허용하도록 확장하고, 파일 상단 `_comment`(또는 description)에
"이식본 — 원본은 interactive/core/procedures/schemas/, insufficient_context는
게이트 전용 additive 확장"을 명기한다.

### 2. `scripts/review-gate/verdict.mjs` (ESM, Node 내장만)

exports:

- `validateResult(obj, schema)` — 자체 최소 검증(외부 라이브러리 금지):
  required 필드 존재·타입·enum(심각도 등) 검사. 위반 목록 반환.
- `evaluate(rawText, schema)` — 파이프라인:
  ① JSON 파싱 실패·빈 입력 → `{ classification: 'MALFORMED' }`
  ② `validateResult` 위반 → MALFORMED
  ③ `insufficient_context === true` → `{ classification: 'INSUFFICIENT_CONTEXT' }`
  ④ **결정적 계산**: findings의 최고 심각도(서열 §3.6). 미지 심각도 값 →
     MALFORMED. MAJOR 이상 ≥1 → FAIL, 그 외(MINOR/INFO/발견 0) → PASS.
  ⑤ 리뷰어의 상위 verdict 필드가 존재하고 ④와 모순(예: verdict=PASS인데
     MAJOR 발견 포함) → MALFORMED (AC-11).
  반환: `{ classification, maxSeverity, findings, violations }`.
- `exitFor(classification)` — §3.1 표의 exit code 매핑
  (PASS 0 / FAIL 1 / MALFORMED 2 / INSUFFICIENT_CONTEXT 3 / TIMEOUT 4 /
  INFRA_ERROR 5 / INTERNAL_ERROR 6 / BLOCKED 7).

### 3. `scripts/review-gate/tests/verdict.test.mjs` (node:test)

픽스처 JSON은 이식 스키마의 실제 required 구조에 맞춰 작성하고 최소 검증:

1. AC-1 — MAJOR 1개 포함 → FAIL, `exitFor` = 1. BLOCKER도 동일 FAIL.
2. AC-2 — MINOR만 → PASS, exit 0 (findings는 반환값에 보존 — 기록은 호출자 몫).
3. AC-3 — 빈 문자열·비JSON·required 누락 각각 → MALFORMED, exit 2.
4. AC-11 — verdict=PASS + findings에 MAJOR → MALFORMED.
5. 미지 심각도(`"CRITICAL-ISH"` 등) → MALFORMED.
6. `insufficient_context: true` → INSUFFICIENT_CONTEXT, exit 3.

## Acceptance Criteria

```
node --test scripts/review-gate/tests/verdict.test.mjs
```

## Verification procedure

1. AC 명령 exit 0.
2. `phases/3-review-gate/index.json` step 1만 갱신 (completed+summary+contract /
   error / blocked — step0.md와 동일 규칙).

## Forbidden

- `interactive/**` 수정 금지 (스키마는 복사만). 이유: 트랙 B 표면 무접촉(PLANNING §2).
- `scripts/review-gate/**`·`phases/3-review-gate/index.json` 밖 수정 금지.
- 외부 패키지(ajv 등) 금지. 이유: PLANNING §1-2.
- 판정에 리뷰어 verdict 필드를 신뢰 금지 — 반드시 발견 목록에서 계산. 이유:
  스펙 §4.1-5 (Codex B15 F9).
- SAP 연결 금지. Do not break existing tests.
