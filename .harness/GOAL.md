# Current Goal

<!-- Overwritten at the start of each task (Task Loop step 2).
     The verifier reads ONLY this file plus the produced artifact. -->

## Task

엔진 백로그 **11-⑪·⑫ 수리 — 1 Wave 묶음** (사용자 확정 착수 순서 ①, 2026-07-13.
스프린트 패턴: opus 위임 · 역-검증 · 라이브 red→green · 새-컨텍스트 리뷰).
목표 버전 **4.13.12**. — **✅ 완료 (2026-07-17)**

- **11-⑪ AdtTable.check의 ddlCode 드랍** (4.13.11 리뷰 발굴, 11-⑤ 동류):
  runTableCheckRun에 ddlCode를 안 넘겨 UpdateTable 사전 check가 새 DDL이 아닌
  저장본만 검사. 수리 = 11-⑤(Structure)와 동일한 check-with-source 전달.
- **11-⑫ Create 페이로드 EN 하드코딩 잔여 ~16곳**: Class·Interface·Program·
  Package·Table·Structure·SRVD·DDLX·DCL 생성부의 language/masterLanguage EN
  하드코딩 → 4.13.10 `resolveLogonLanguage()` 인프라를 기계적 확장
  (확장 지점 문서: engine/UPSTREAM-FIX-HANDOFF.md §5). 비영어 로그온(IDES=CS)
  에서 설명이 EN 슬롯에 저장돼 비어 보이는 실수요 실증 결함.

## Success criteria

- [x] **jest 전량 통과(실패 0**, 기준선 580 passed/5 skipped) + 수리별 회귀
      테스트 신설 + **역-검증**(수리 원복 시 신설 테스트 FAIL) 실증 로그
      — **599/0/5 (+19)**, 11-⑪ 두 계층(vendored 원복 3/3 FAIL·핸들러 무력화
      2/3 FAIL)·11-⑫ 두 계층(빌더·핸들러) 각각 역-검증 실측
- [x] **UPDATE-RUNBOOK 준수 재번들** — verify-engine **OK @4.13.12**
      (sha256 5cb5a69eeff2…), capability diff **155 유지**(disallowedTools
      동기화 불요)
- [x] **IDES 라이브 red→green** — 11-⑪ 충족: red(오류 DDL success:true,
      activation_warnings에만) → green(PUT 전 표면화 + 정상 DDL update·활성화
      완주). **11-⑫는 문자 기준 PARTIAL(환경 제약, 리뷰 수용)**: CS IDES가 EN
      페이로드를 관용해 설명-슬롯 델타 관측 불가 — 대체 정본 증거 = 역-검증
      jest 패밀리 16케이스 + 4.13.10 비관용 표면(DOMA/DTEL) 라이브 실증, 신
      번들 Class·Program·Table 생성·read-back 무회귀 확인. $TMP 생성 8·삭제 8
      read-back 확인 + 고아 잠금 0
- [x] **새-컨텍스트 read-only 리뷰 PASS** — **BLOCKER 0 · MAJOR 0** (MINOR 4:
      보고서 자기-집계 오기[핸들러 10→실측 9, 보고서 삭제로 소멸]·11-⑫ 라이브
      PARTIAL·checkruns 캐시 관찰·parse-error fail-open 관찰)
- [x] **문서 계약** — engine/CHANGELOG.md 4.13.12 + UPSTREAM-FIX-HANDOFF
      §5·§10·§11·Known-remaining 갱신 + HANDOFF §6 11-⑪·⑫ 마감 + STATE 기록
- [x] **게이트 5종 green** + 커밋 (fix(engine): 4.13.12)

## Verification method

1. jest·게이트 5종 exit code 실측 ✓
2. 역-검증: 수리 원복 시 신설 테스트 FAIL 재현 로그 ✓ (작업자 실측 + 리뷰어
   정적 결합 판정)
3. 라이브 red→green 증거(구 4.13.11 번들 vs 신 4.13.12 번들 각 실행 결과) ✓
   (11-⑫는 관측 불가 사유 명시)
4. 독립 리뷰어(새 컨텍스트, read-only)가 Wave diff를 이 GOAL 기준으로 항목별
   판정 ✓ — 총평 PASS
