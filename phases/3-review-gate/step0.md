# Step 0: capsule

## Read first

- `phases/3-review-gate/PLANNING.md` — **§3 공유 계약이 이 phase의 인터페이스 정본**
  (exit code·파일 배치·config·manifest·해시 정의). 이 스텝은 §3.3·§3.4를 구현한다.
- `docs/reference/designs/2026-07-17-phase3-review-gate.md` §4.0(리뷰 캡슐)·§6 AC-12

## Task

`scripts/review-gate/` 디렉터리를 신설하고 3개 파일을 작성하라:

### 1. `scripts/review-gate/config.json`

PLANNING §3.3의 초기값 그대로.

### 2. `scripts/review-gate/capsule.mjs` (ESM, Node 내장만)

exports:

- `createCapsule(unit, capsuleDir)` — `unit` = `{ unit_id, files: [경로...],
  spec_path, verification_path|null, policy_version, schema_version,
  reviewer_model, target_system }`. 동작: ① 대상 파일·spec·verification 실물을
  `capsuleDir`로 **복사**(불변 사본) ② PLANNING §3.4 형태의 `manifest.json`
  작성(파일별 sha256) ③ **캡슐 해시** = manifest canonical JSON(키 정렬·LF)의
  sha256 hex 계산 → `{ capsuleDir, capsuleHash, manifest }` 반환.
  파일 누락·빈 파일(0바이트)·읽기 실패 → `CapsuleError` throw
  (`err.code === 'INCOMPLETE'`, 어떤 파일인지 메시지에 포함).
- `verifyCapsule(capsuleDir)` — manifest 재읽기 + 사본 파일들 해시 재계산 +
  캡슐 해시 재계산 → `{ ok: boolean, capsuleHash, mismatches: [] }`. 사본
  변조·파일 소실 시 `ok: false`와 원인 목록.

### 3. `scripts/review-gate/tests/capsule.test.mjs` (node:test)

임시 디렉터리(`fs.mkdtempSync(os.tmpdir())`)에 픽스처를 만들어 최소 다음을
검증 (무의미 단언 금지):

1. **결정성** — 같은 입력 2회 → 같은 capsuleHash.
2. **변경 감지** — 소스 파일 1바이트 변경 → 다른 capsuleHash.
3. **메타 감지** — policy_version만 변경 → 다른 capsuleHash (스펙 §4.0:
   정책·모델 변경도 무효화).
4. **AC-12** — files에 존재하지 않는 경로 포함 → `CapsuleError`(INCOMPLETE).
   빈 파일도 동일.
5. **변조 감지** — createCapsule 후 캡슐 사본 1개 수정 → `verifyCapsule().ok === false`.
6. manifest 필수 필드 전부 존재 (§3.4 나열 필드).

## Acceptance Criteria

```
node --test scripts/review-gate/tests/capsule.test.mjs
```

## Verification procedure

1. AC 명령 실행 — exit 0 (전 테스트 pass).
2. `phases/3-review-gate/index.json`의 step 0만 갱신:
   - 통과 → `"status": "completed"` + `"summary"` + `"contract"`(다음 스텝을 위한
     export 시그니처·해시 정의 1-3줄)
   - 3회 수정에도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 조치 필요 → `"status": "blocked"` + `"blocked_reason"`, 즉시 중단

## Forbidden

- `scripts/review-gate/**`·`phases/3-review-gate/index.json` 밖 파일 생성·수정
  금지. 이유: 권한 봉투(PLANNING §2).
- npm install·외부 패키지 금지. 이유: 의존성 0 결정(PLANNING §1-1).
- SAP 연결·vsp 실행 금지. 이유: 스텝 0~4는 offline(PLANNING §1-3).
- `Date.now()` 등 시간을 해시 입력에 포함 금지. 이유: 결정성 계약이 깨진다
  (기록용 타임스탬프는 manifest 밖 별도 필드·상태 파일에만).
- Do not break existing tests.
