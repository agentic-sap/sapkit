# Step 5: live-spike

## Read first

- `phases/3-review-gate/PLANNING.md` §2(권한 봉투 — 이 스텝의 한계)·§3
- `docs/reference/designs/2026-07-17-phase3-review-gate.md` §10 가정 2·4, AC-10
- `adapters/vsp/VERIFY-PATTERNS.md` — vsp 실행 규약·마커
- `scripts/vsp-env.ps1` — SAP 연결 env 로딩 방식 (**내용을 로그·증거 파일에
  옮기지 말 것** — R-005)
- `phases/3-review-gate/index.json` step 0~4의 `contract`

## Task

라이브 실증 2건을 수행하고 기계 검증 가능한 증거를 남긴다. **이 스텝의 성공
기준은 "실증"이지 "통과 조작"이 아니다** — 실증이 안 되면 blocked로 정직하게
보고하는 것이 올바른 완료다.

### Part A — 실 리뷰어 헤드리스 왕복 (가정 2·4의 리뷰어 절반)

1. claude CLI 헤드리스 호출 형태를 실측으로 확정한다 (비대화형 1회 실행 +
   stdout으로 JSON을 받는 인자 조합). 확정된 command 배열을
   `scripts/review-gate/config.json`의 `reviewer.command`에 기록한다
   (모델은 `reviewer.model` 설정값 사용).
2. 소형 캡슐을 만든다: 대상 = `src/zsah1_workdays.prog.abap`(읽기만) + 초소형
   스펙 텍스트(임시 파일 — "영업일 계산 유틸리티, 시그니처 유지" 수준 2-3줄).
3. `review-gate.mjs`를 이 config로 실행 — **실 리뷰어 세션 1왕복**. 성공 판정:
   exit가 0(PASS)·1(FAIL)·3(INSUFFICIENT_CONTEXT) 중 하나 (= 판정 파이프라인
   완주). 2(MALFORMED)·4·5·6이면 원인 분석 후 프롬프트/파서를 보정해 재시도
   (인프라 예산 2회) — 그래도 안 되면 blocked.
4. 기록: 최종 판정 JSON 파일 경로·소요 시간·사용 모델.

### Part B — vsp write 게이트 거부 실측 (AC-10)

1. `adapters/vsp/VERIFY-PATTERNS.md`·vsp 문서(`D:\Claude for SAP\vsp-custom`
   레포의 README/COMMANDS — 읽기만)에서 **tier/read-only 제어 메커니즘**을
   확인한다 (SAP_TIER env 등).
2. 현행 프로파일 env 파일을 **임시 위치로 복사**해 tier를 비-dev(write 불허
   값)로 바꾼 사본을 만든다 (원본 무수정, 사본은 스텝 종료 시 삭제, 경로만
   기록 — 내용 기록 금지).
3. 그 env로 write성 vsp 명령 1회를 `$TMP` 무해 대상(존재하지 않는
   `ZSAH3_SPIKE` 등)에 시도 → **게이트 수준 거부**(대상 접속·생성 이전의
   tier 거부 마커) 실증. 거부 마커 문자열을 기록.
4. **비상 절차**: 거부되지 않고 write가 실제 수행되면 — 즉시 해당 산출물을
   삭제(vsp delete 또는 GUI 안내)하고, 이 스텝을 `blocked`로 기록하라
   (blocked_reason: "vsp tier 게이트 부재 — 스펙 §5-4 전제 반증, 게이트 설계
   보완 필요"). **이 경우가 조작 없이 보고해야 하는 대표 사례다.**
5. read-only 조회 1회(`vsp` read성 명령)로 사본 프로파일의 연결 자체는 정상임을
   확인 (거부가 연결 실패가 아니라 tier 게이트임을 분리 입증).

### Part C — 증거 파일 + 검증기

1. `phases/3-review-gate/spike-evidence.json` 작성:

```json
{
  "part_a": { "ok": true, "verdict_file": "<판정 JSON 경로>", "exit_code": 0,
              "duration_ms": 0, "model": "<사용 모델>", "command_recorded": true },
  "part_b": { "ok": true, "refusal_marker": "<거부 메시지 발췌>",
              "readonly_read_ok": true, "attempted_target": "ZSAH3_SPIKE" }
}
```

2. `scripts/review-gate/tests/spike.mjs` 작성 — `--check <evidence 경로>` 모드:
   ① 두 part 모두 `ok: true` ② `verdict_file` 실존 + 이식 스키마로
   `validateResult` 통과 ③ `refusal_marker` 비어있지 않음 ④ 증거 파일 전체에
   자격증명 패턴(`passw`·`secret`·`SAP_PASS`·`Authorization`) 부재 — 하나라도
   위반 시 exit 1 + 사유. (기계 검증 — 존재 검사만으로 통과 불가.)

## Acceptance Criteria

```
node scripts/review-gate/tests/spike.mjs --check phases/3-review-gate/spike-evidence.json
```

## Verification procedure

1. AC 명령 exit 0 + `node --test scripts/review-gate/tests/` 전체 회귀 통과.
2. `phases/3-review-gate/index.json` step 5만 갱신 — summary에 Part A 소요
   시간·모델, Part B 거부 마커 요약 포함. Part B 비상 절차 발동 시 blocked.

## Forbidden

- **SAP write 실수행 금지** — Part B는 거부 실증이며, 비상 절차(수행돼버린
  경우 즉시 삭제+blocked) 외 어떤 write도 금지. QA/PRD 시스템 접근 금지(R-003).
- 자격증명(호스트·비밀번호·env 파일 내용)을 증거·로그·index.json·커밋에 기록
  금지 (R-005). 프로파일 원본 수정 금지.
- 실증 실패를 mock·조작으로 통과시키기 금지. 이유: 이 스텝의 존재 이유가
  가정 검증이다 — 반증도 유효한 산출물.
- `scripts/review-gate/**`·`phases/3-review-gate/**`(증거 파일 포함) 밖 수정
  금지. 임시 env 사본은 OS 임시 디렉터리에만·종료 시 삭제.
- Do not break existing tests.
