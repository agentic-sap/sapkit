# Step 0: implement-red

## Read first

- `phases/4-gated-deploy/spec.md` — **동결된 승인 스펙** (판정 기준)
- `phases/4-gated-deploy/PLANNING.md` §2 (AC-8 red 설계)
- `src/zsah2_duedate.prog.abap` — 로컬 테스트 클래스 형식 선례 (읽기만)
- `domain/abap/CHECKLIST.md` · `domain/abap/RULES.seed.md` S-016~S-025

## Task

`src/zsah4_gl_list.prog.abap`을 **신규 작성**하라 — 스펙의 요구 1·2·4·5·6·7·8·9를
전부 충족하되, **요구 3만 의도적으로 위반하는 red 상태**로 만든다(AC-8 실증용
계획 산출물 — PLANNING §2가 승인한 구성):

- 데이터 접근 SELECT에서 `SKAT`를 **`INNER JOIN`**으로 결합한다(`skat~spras =
  @sy-langu`, `skat~ktopl`·`skat~saknr` 키 결합). 이로써 로그온 언어 텍스트가
  없는 계정이 조용히 탈락한다 — 이것이 이 스텝의 유일한 의도 결함이다.
- `AUTHORITY-CHECK OBJECT 'F_SKA1_KTP'` (`ID 'KTOPL' FIELD p_ktopl`,
  `ID 'ACTVT' FIELD '03'`)를 SELECT **이전에** 배치하고 `sy-subrc <> 0`이면
  안내 후 `RETURN`. (스펙 요구 2 — red에도 반드시 포함)
- 순수 헬퍼 `summarize`: 조회 결과 내부테이블을 받아 `총 계정 수 / XBILK = 'X'
  수 / 나머지 수`를 반환하는 DB 무접근 메서드(로컬 클래스 `lcl_gl_list`의
  CLASS-METHODS 권장 — 시그니처는 자유이되 테스트와 정합).
- 로컬 테스트 클래스 `ltc_gl_list`(`RISK LEVEL HARMLESS DURATION SHORT`) —
  `summarize`만 검증하는 5케이스(혼합/전부 BS/전부 P&L/빈 입력/텍스트 유무
  무관 카운트). 픽스처는 코드 내 구성(DB 미접근) — JOIN 방식이 테스트에
  보이지 않아야 한다(기계 무맹점 전제).
- 소스 규칙: `EQ`/`NE` 금지, 255자 이하, 한 줄 한 문장, 빈 문장 금지, 자격증명
  하드코딩·루프 내 COMMIT 금지, 주석 영어. 리터럴 텍스트는 스펙 요구 8의
  파일럿 관용 범위.

## Acceptance Criteria

```powershell
powershell -Command "& 'D:\Claude for SAP\vsp-custom\build\vsp.exe' lint --file src/zsah4_gl_list.prog.abap; exit $LASTEXITCODE"
```

## Verification procedure

1. AC 명령 exit 0 확인.
2. 스펙 요구 1~9를 조목 대조해 "요구 3만 위반"임을 `summary`에 명시(다른 요구
   위반이 섞이면 AC-8 인과가 오염된다).
3. `domain/abap/CHECKLIST.md` 셀프점검.
4. `phases/4-gated-deploy/index.json` step 0 갱신: 통과 → `"status":
   "completed"` + `summary` + `contract`(summarize 시그니처·테스트 기대값·red
   결함 위치 1줄) / 실패 → `error` / 스펙 결함 발견 → `blocked`.

## Forbidden

- `phases/4-gated-deploy/spec.md` 수정 금지 — 동결 스펙(캡슐 판정 기준).
- SAP 연결 금지(이 스텝은 offline — vsp-env dot-source·연결 명령 전부).
- `src/zsah4_gl_list.prog.abap`·`phases/4-gated-deploy/index.json` 외 파일
  생성·수정 금지.
- 요구 3 외의 스펙 위반 금지(단일 결함 원칙).
