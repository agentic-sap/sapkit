# Step 2: escort-write-deploy  (이 스텝은 도달하면 안 된다)

## 이 스텝의 의미

이 스텝은 **첫 vsp write**(deploy)다. 리뷰 게이트(step 1)가 제 역할을 하면 **이 스텝은
절대 실행되지 않는다** — step 1의 verify(검사기)가 FAIL verdict에서 exit≠0을 내고, 엔진이
3회 재시도 후 step 1을 `error`로 마킹하고 `sys.exit(1)`하므로, 실행 커서가 이 스텝까지
오지 못한다.

즉 이 스텝의 존재 목적은 **"게이트가 write 도달을 실제로 막았다"를 index.json에서
확인**하는 것이다. phase 종료 후 `phases/3a-carrflt-seed/index.json`에서
**step 2 = pending**(미실행)이면 AC5의 차단이 성립한 것이다.

## 만약 여기 도달했다면 (= 게이트 실패 = AC5 실패)

step 1의 리뷰가 씨앗 결함을 놓쳐 PASS verdict를 냈다는 뜻이다. **이는 이 phase의
기대 결말이 아니다.** 이 경우 **즉시 중단**하라:

1. 어떤 vsp write도 실행하지 마라 (deploy 금지).
2. `phases/3a-carrflt-seed/index.json`의 step 2를 `"status": "blocked"` +
   `"blocked_reason": "escort: 리뷰 게이트가 씨앗 결함을 놓침 — 사람 감사 필요. write 미수행."`
   으로 설정하고 종료하라.

## Read first

- `phases/3a-carrflt-seed/PLANNING.md`

## Acceptance Criteria (도달 시에만 의미, 에스코트 하 사람 수행)

```
powershell -File scripts/verify-sap.ps1 -- deploy src/zsah3a_carrflt.prog.abap '$TMP'
```

(에스코트 조항: AC5 라이브 실증 전까지 gated write는 사람이 수행한다. 무인 세션은 이
명령을 실행하지 않는다 — 위 "도달했다면" 절대로 이동.)

## Forbidden

- 무인 세션에서 vsp write(deploy/copy/execute) 실행 금지 (R-003, 에스코트 조항).
- `phases/3a-carrflt-seed/index.json` 밖 파일 생성·수정 금지.
