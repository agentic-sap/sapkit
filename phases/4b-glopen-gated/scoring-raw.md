# Phase 4b 에스코트 체인 원로그 (2026-07-14, IDEA-JNC S4H/100)

에스코트 조항 수행(DESIGN §13·conventions §5): Claude 실행 + 사용자 참관, write는
사용자가 IDEA-JNC 연결 셸에서 직접 실행. PLANNING.md §6 런북 수행. 목적: 팩(FI)
지식으로 유도된 **정상 경로** 객체(ZSAH4_GLOPEN, ACDOCA·리딩원장 한정)가 리뷰 게이트
PASS 후 SAP 전체 write 체인을 통과함을 3b(phases/3b-carrflt-gated/scoring-raw.md)
선례 형식으로 실증한다.

> **Phase 4 완료 기준과의 관계**: DESIGN §13 Phase 4 완료 기준은 ①팩 1개가 CONSULT
> 단계에서 실사용(= recon 팩 전/후 결정 델타 5건, phases/4-glopen-recon/recon-raw.md
> §2) + ②LESSONS 유래 규칙 1건 RULES 승격(= 4a 씨앗→L-002→R-007) 두 가지이며,
> **둘 다 이미 충족**됐다. 본 에스코트는 그 위에 정상 경로가 실배포까지 닫힘을 더하는
> 보강 증거다(3a/3b 대칭 — 씨앗 차단 + 정상 배포).

## 0. 선결

- **P0** — `scripts/verify-sap.ps1`의 `$VSP` = `D:\claude for SAP\vsp\vsp-custom\build\vsp.exe`
  (주 머신 0b03ef2 재현 빌드, binary_main_machine). 실측상 이미 올바름.
- **P1** — `phases/4b-glopen-gated/index.json` 두 스텝 모두 `completed`(step1 리뷰
  verdict PASS, `reviewed_head=b2fa101`, findings 0). main 병합(55b4ea3, --no-ff).
- **P2** — 자격증명 로드: `. .\scripts\vsp-env.ps1 -ProfileName IDEA-JNC`
  → "profile 'IDEA-JNC' loaded ... set SAP_URL, SAP_CLIENT, SAP_USER, SAP_PASSWORD".
  (S4H/100, DEV tier — write는 `$TMP`에만, R-003·SAFETY-PROFILES §⑤. IDEA-JNC는
  `http://sap2.remoteides.com:8021` 평문이라 SAP_INSECURE 불요 — 인증서 검증 없음.)

## 1. 런북 형태 정정 (실측 함정 2건 — 재사용 주의)

3b 선례의 `powershell -File scripts/verify-sap.ps1 -- <args>` 형태는 **bash/cmd에서
새 powershell을 띄우는** 상황용이다. 이번엔 P2 dot-source 때문에 **PowerShell 세션
안에서** 수행했는데, 그 안에서 위 형태는 `PositionalParameterNotFound`로 실패한다
(부모 PS가 `--`/자식 `-File` 인자 파싱을 오분해). **PS 세션 내에서는 호출 연산자로
직접**:

```
& .\scripts\verify-sap.ps1 deploy src/zsah4_glopen.prog.abap '$TMP'
```

자격증명이 이미 세션 env에 있으므로 자식 프로세스 불요. 나머지 E2~E4도 `&` 직접 호출.

두 번째 함정(E2에서 후술): PowerShell `>` 리다이렉트는 PS 5.1 기본 **UTF-16 LE**로
파일을 써서 `git diff --no-index`가 "Binary files differ"로 오인한다 — 내용 대조는
인코딩 정규화 후 수행하거나 `Out-File -Encoding utf8`을 쓴다.

## 2. 체인 (E) — deploy → activate → drift → ATC → unit

### E1 — deploy(+activate)

- 명령: `& .\scripts\verify-sap.ps1 deploy src/zsah4_glopen.prog.abap '$TMP'`
- 결과: **VERIFY_PASS** — "Created PROG/P ZSAH4_GLOPEN" + "Successfully created and
  activated PROG/P ZSAH4_GLOPEN from src/zsah4_glopen.prog.abap" (deploy가 활성화를
  겸함, COMMANDS §8 일치). **주의점이던 ACDOCA 필드 철자(특히 `rclnt` 클라이언트 키 —
  recon §5 확정 목록에 없던 유일한 컬럼)가 서버 활성화를 통과 = 철자 정합 확인.**

### E2 — drift(clean)

- 명령:
  ```
  & "D:\claude for SAP\vsp\vsp-custom\build\vsp.exe" source read PROG ZSAH4_GLOPEN > "$env:TEMP\zsah4_live.abap"
  git diff --no-index src/zsah4_glopen.prog.abap "$env:TEMP\zsah4_live.abap"
  ```
- 1차 판정: git이 **"Binary files ... differ"** 보고 — 원인은 위 §1 두 번째 함정
  (PS `>`가 라이브 소스를 UTF-16 LE로 기록: live 첫 바이트 `255,254`=BOM, 7718B ≈
  repo UTF-8 3858B의 2배). 실 내용 차이가 아니다.
- 확정 대조(인코딩·개행 정규화 후 `-ceq`): **normalized-content-identical = True**
  — 레포==SAP 바이트 동일(말미 개행/인코딩만 서버·리다이렉트 정규화). **clean 판정**
  (DESIGN §6 정규화 규칙, 3b E2 선례와 동일 결).

### E3 — ATC

- 명령: `& .\scripts\verify-sap.ps1 atc PROG ZSAH4_GLOPEN`  (객체는 `$TMP` 확인)
- 결과: **VERIFY_PASS**. findings = **INFO 2건만**, Error 0건:
  - INFO[line 1] SLIN 시간대 result cache 비일관(TTZCU/SAP Note 481835) — 3b·phase2와
    동일 계열 환경성, 코드 결함 아님.
  - INFO[line 47] "Use the CURRENCY addition when specifying LS_ROW-AMOUNT after
    WRITE [TO]" — WRITE 시 통화 addition 권고(스타일 힌트, INFO). 리포트 출력의
    표시 관례 제안이며 로직·정합 결함 아님. 필요 시 후속 개선 후보로만 기록.

### E4 — unit (green)

- 명령: `& .\scripts\verify-sap.ps1 test PROG ZSAH4_GLOPEN`
- 결과: **Total: 1 passed, 0 failed**, `VERIFY_PASS`. Test Class LTC_REPORT →
  `OPEN_AND_LEADING_LEDGER_ONLY` PASS(0.280s). ACDOCA double 픽스처에서 **리딩원장
  0L 미결 라인만** 집계(racct 0000400000=150·0000113100=200)되고 **2L 원장 행
  (777.00)·청산 라인(augbl≠공백, 999.00)은 제외**됨을 서버 ABAP Unit이 기계로 증명
  = R-007(ACDOCA·rldnr='0L' 한정)이 실코드에서 정확히 성립. 픽스처는
  `cl_osql_test_environment` 결정론 double(라이브 데이터 무관).

→ **E1~E4 전부 통과** = 리뷰 게이트 PASS 객체(ZSAH4_GLOPEN)가 deploy→activate→
drift→ATC→unit 전체 write 체인을 통과해 SAP `$TMP`에 존재. 팩 지식(FI/R-007)으로
유도된 정상 경로가 실배포까지 닫힘.

## 3. 확정 결과 요약

1. **Phase 4 완료 기준 ①** (팩 CONSULT 실사용) — recon 팩 전/후 결정 델타 5건으로
   충족(별도 로그 phases/4-glopen-recon/recon-raw.md §2).
2. **Phase 4 완료 기준 ②** (LESSONS 유래 규칙 RULES 승격) — 4a 씨앗 차단→L-002→
   **R-007** 승격으로 충족(의도적 실패 주입 경로, DESIGN §13 허용).
3. **에스코트 보강** (씨앗 대칭) — 4a 씨앗 INNER경로 결함은 리뷰 3회 FAIL로 차단
   (feat-4a-glopen-seed 봉인), 4b 정상 ACDOCA경로는 리뷰 PASS→에스코트 E1~E4 전부
   통과. 팩 규칙이 결함은 막고 정합은 통과시킴을 양방향 실증.

→ **DESIGN §13 Phase 4 완료 기준 ①②를 이미 충족 + 에스코트 보강 완료 = Phase 4
완료.** 다음: 트랙 A **대화형(Guided) 재기준 정식 결정(D-022)**.
