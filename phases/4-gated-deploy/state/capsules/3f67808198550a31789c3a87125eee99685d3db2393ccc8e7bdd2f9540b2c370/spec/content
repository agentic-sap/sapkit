# ZSAH4_GL_LIST 스펙 — 승인 기준 (리뷰 캡슐 동봉본)

> 동결: 2026-07-19 계획 승인 시점(스프린트 계획 동결). 이 파일은 리뷰 게이트
> 캡슐의 `spec/content`로 들어가는 판정 기준이며, **런 중 수정 금지**(수정 =
> 새 캡슐 해시 = 재리뷰). CONSULT 근거: `packs/modules/fi/`(FI-004·KR §7·버전
> 게이트) — 영향 기록은 PLANNING.md.

## 목적

지정한 계정과목표(chart of accounts)의 G/L 계정 마스터 목록을 계정명과 함께
출력하는 유틸리티 리포트. 대상 시스템 = S/4HANA 2021(IDES S4H/100), `$TMP`.

## 요구사항 (번호 = 리뷰 대조 기준)

1. `REPORT zsah4_gl_list`. 선택화면: `p_ktopl TYPE ska1-ktopl OBLIGATORY
   DEFAULT 'INT'`.
2. **권한 검사 (필수)**: 데이터 조회 전 `AUTHORITY-CHECK OBJECT 'F_SKA1_KTP'`
   (`ID 'KTOPL' FIELD p_ktopl`, `ID 'ACTVT' FIELD '03'`)를 수행하고 `sy-subrc`
   비0이면 목록 조회·출력 없이 안내 후 종료한다. [근거: FI 팩 RULES.seed
   FI-004 — ABAP SQL은 DB 권한 검사를 우회하므로 명시 검사 없이는 무인가
   조회가 통과한다]
3. **완전성 (데이터 정확성)**: `p_ktopl`에 속한 SKA1의 **전 계정**이 출력에
   나타나야 한다. 로그온 언어(`sy-langu`)의 SKAT 텍스트가 **없는 계정도
   반드시 목록에 포함**하고 텍스트 자리는 공란으로 둔다. [근거: 다국어
   텍스트 유지가 고르지 않은 시스템(KR 로컬라이제이션 환경 포함)에서 결합
   방식에 의한 계정 누락은 조회 리포트의 조용한 데이터 손실이다]
4. 각 행 출력: `SAKNR`(계정번호) · `XBILK`(대차대조표 계정 표시) ·
   `TXT50`(계정명 — `sy-langu` 기준, 없으면 공란).
5. 요약 출력: 총 계정 수 / 대차대조표 계정 수 / 손익 계정 수. 계산은 **순수
   헬퍼 메서드 `summarize`**(DB 접근 없음, 내부테이블 입력 → 카운트 반환)가
   담당한다 — 단위테스트 대상.
6. 출력 형식: classic list(`WRITE`) — 파일럿 스코프. ALV 불요(따라서 S-003
   ALV 규칙 비적용).
7. 테스트: 로컬 테스트 클래스(`RISK LEVEL HARMLESS DURATION SHORT`)가
   `summarize`를 최소 5케이스 검증(혼합 / 전부 BS / 전부 P&L / 빈 입력 /
   텍스트 유무와 무관한 카운트).
8. **파일럿 관용(승인된 완화)**: 메시지·컬럼 헤더 텍스트 요소 외부화는 $TMP
   파일럿에서 면제(리터럴 허용) — S-006의 파일럿 예외. 리뷰에서 이 항목은
   MAJOR로 다루지 않는다(최대 MINOR).
9. 데이터 접근: 프로그램 내 SELECT(SKA1과 SKAT(sy-langu)의 결합 1회)만.
   row-data 도구(GetTableContents/GetSqlQuery) 무관.

## 판정 지침 (리뷰어 명시 앵커)

- 요구 3 위반 — 예: 결합 방식 때문에 로그온 언어 텍스트 없는 계정이 결과에서
  탈락 — 은 **데이터 정확성 결함 = MAJOR (B2)**.
- 요구 2 부재/무력화는 **보안 결함 = MAJOR (B2 또는 B4)**.
- 요구 8의 리터럴은 MAJOR 아님(파일럿 승인 완화).
