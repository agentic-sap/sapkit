# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

엔진 백로그 **11-⑪·11-⑫ 수리 (1 Wave 묶음, 릴리스 4.13.12)** — 사용자 확정 착수 ①
(HANDOFF 헤더 2026-07-13). 스프린트 패턴: 메인이 워커, 역-검증·라이브 red→green·
새-컨텍스트 리뷰. 완료 시 UPSTREAM-FIX-HANDOFF §5·§7 갱신 + Known-remaining #2 제거.

### 대상

- **11-⑪ — UpdateTable 사전 check가 새 DDL이 아닌 저장본만 검사 (§7 structure 동류).**
  vendored `table/AdtTable.js` `check()`가 `runTableCheckRun(…, undefined, version)`로
  `config.ddlCode`를 드랍. **추가 발견(2026-07-13 코드 정독)**: table의
  `runTableCheckRun`은 structure의 `checkStructure`와 달리 응답을 parse/throw하지
  않고 raw 응답만 반환 → `AdtTable.check`가 항상 `errors:[]` 반환 → 핸들러
  `checkNewCodePassed` 항상 true. 즉 ddlCode 전달만으로는 무동작(나쁜 update 여전히
  통과). **honest 수리 = ① check-with-source 전달 + ② parse+throw (structure 미러,
  benign-skip·never-bare 포함).** patch-package 2편집 예상.

- **11-⑫ — 잔여 create 페이로드 EN 하드코딩 (§5 언어 인프라 기계적 확장).**
  vendored create.js EN 하드코딩 9종: Class·Interface·Program·Package·Table·
  Structure·SRVD(serviceDefinition)·DDLX(metadataExtension)·DCL(accessControl).
  비-EN 로그온(KR-DEV=KO)에서 설명이 EN 슬롯에 저장돼 비어 보임(실수요=포크 KO
  핸드핵 19곳). 수리 = 4.13.10 `resolveLogonLanguage` 인프라를 각 핸들러+빌더+
  래퍼+types로 확장. FUGR은 11-⑫ 명시 밖(§5 green 실증)·enhancement/tabletype/
  service는 핸들러 라우팅 없음(죽은 코드) — 제외, 근거 기록.

## Success criteria

- [x] **jest 전량 통과(실패 0)** + 두 수리 각각 회귀 테스트 신설, **역-검증** 실증
      — jest **599/0**(5 skipped), 11-⑪ 두 편집 각각 원복 시 FAIL·11-⑫ 스레딩 원복
      시 FAIL 실측
- [x] **재번들 런북 준수** — dist→interactive 반영, verify-engine OK(4.13.12),
      capability diff **155 no-op**(스키마/도구 무증감), VERSION/integrity 갱신
- [x] **KR-DEV(KO) 라이브 red→green** — 11-⑪ = 나쁜 DDL 구 번들 `success:true`
      (거짓 성공) → 신 번들 정직 에러+write 차단, good DDL 통과(over-block 없음).
      11-⑫ = KO 페이로드 create-수락 확인(class·table). 설명 landing readback은
      도구 한계(SearchObject 클래스 short text 미반환)로 불가 — 페이로드 역-검증
      (unit)+§5 라이브 메커니즘 재사용으로 근거. $TMP 4종 삭제 검증(Z*SAH412* 무결과)
- [x] **새-컨텍스트 read-only 리뷰 PASS** — general-purpose 프레시 컨텍스트,
      BLOCKER/MAJOR 0(MINOR = CheckTableLow parity, 의도됨)
- [x] **게이트 green** — coverage 0·links 0·verify-engine OK·smoke 155; doctor는
      agy 드리프트 1건(1.0.16→1.1.1, 환경·무관·R-001)
- [x] **문서 계약** — CHANGELOG 4.13.12 · UPSTREAM §5·§7 갱신 + Known-remaining #2
      제거 · HANDOFF §6·헤더 · STATE 갱신
- [x] 환경 실패를 코드 결함으로 기록하지 않음(R-001) — agy 드리프트는 환경으로 분류

## Scope guards (CLAUDE.md 준수)

- 11-⑫는 §5가 "관용 실증"으로 의도적으로 남긴 경로 — 확장 근거는 실수요(KO 핸드핵).
  명시 9종만, 죽은 코드·명시 밖(FUGR)은 근거와 함께 제외.
- 각 핸들러의 실제 create 호출 형태를 개별 확인 후 주입(맹목적 일괄 치환 금지).
- 동결 레포(sc4sap-*)·private/ 미접촉. 실데이터 2종 자동승인 금지. KR-DEV=DEV tier
  write만(R-003).

## Verification method

1. jest·게이트 5종 exit code 실측
2. 역-검증: 수리 원복 시 신설 테스트 FAIL 재현 로그
3. 라이브 red→green 증거(구/신 번들 각 실행 결과) 또는 재현 불가 사유(R-001 마커)
4. 독립 리뷰어(새 컨텍스트, read-only)가 diff를 이 GOAL 기준으로 항목별 판정
