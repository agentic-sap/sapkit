# Phase 2 계획 기록 — Online Read-Only Planning (2-duedate-reuse)

> DESIGN.md §13 Phase 2 완료 기준: "분석 결과가 계획의 결정(대상 객체 선정 또는
> 의존 순서)을 실제로 바꾼 사례 1건이 계획 문서에 기록됨" — 이 문서가 그 기록이다.
> 답사 원로그: `recon-raw.md` (2026-07-11, IDES-DEV S4H/100, read-only 명령만).

## 1. 과제

납기 잔여 영업일 리포트 `ZSAH2_DUEDATE` — 발주일·납기일을 받아 남은 영업일 수를
출력한다. 영업일 계산은 Phase 1 산출물(ZSAH1_WORKDAYS)의 검증된 로직을 재사용한다.

## 2. 답사 전 계획 초안

- 대상 객체: **PROG 1개** (ZSAH2_DUEDATE 단독 신설)
- 재사용 방식: ZSAH1_WORKDAYS의 `calc`를 **직접 호출**
- 분석 스코프: `$TMP` **패키지 단위** health/boundaries로 컨텍스트 확보
- 참조 분석: 전용 where-used 명령이 있을 것으로 가정

## 3. 답사 실측 요약 (전부 read-only, 전 명령 exit 0)

| 명령 | 발견 |
|---|---|
| `vsp source read PROG ZSAH1_WORKDAYS` | 서버 정본 = 레포 `src/zsah1_workdays.prog.abap`과 줄 단위 완전 일치. `lcl_workdays`는 **REPORT 내 로컬 클래스** — 외부 프로그램에서 호출 불가 확정 |
| `vsp --help` + 하위 help 전수 | **전용 where-used 명령 부재**. 대체 = `graph <TYPE> <NAME> --direction callers` (WBCROSSGT 폴백, ZSAH1 대상 동작 실증 — 신생 객체라 참조 0건 정상) |
| `vsp health/api-surface/boundaries '$TMP'` | `$TMP`는 IDES 공유 로컬 패키지 — **커스텀 객체 988개** 노이즈. ZSAH* 는 정확히 5개(0B 3종·1_WORKDAYS·15_BROKEN) |
| `vsp search "ZSAH2*"` | 0건 — 이름 충돌 없음 |
| `vsp deploy --help` / `copy --help` | deploy는 `.clas.abap`(CLAS) 지원 명시. INCLUDE는 어느 목록에도 미명시. 클래스 **테스트 include 배포는 vsp TODO**(DESIGN §14-4) |
| offline `vsp lint --file <골격>.clas.abap` | 글로벌 클래스 파일도 lint 동작(exit 0) — 무인 verify 성립 (로컬 실측) |

## 4. 답사가 계획의 결정을 바꾼 기록 (완료 기준 충족)

1. **대상 객체 선정 변경**: PROG 1개 → **CLAS `zcl_sah2_workdays` + PROG
   `zsah2_duedate` 2개**. 근거: 서버 정본 확인으로 로컬 클래스 직접 호출 불가 확정
   (§3 첫 행) + deploy가 CLAS를 지원해 승격이 실행 가능 판단. 재사용 방식은 사용자
   결정으로 "글로벌 클래스 승격" 확정 (로직 복사안 기각, ZSAH1은 불변 동결).
2. **의존 순서 신설 + 테스트 배치 변경**: connected 채점의 deploy 순서 =
   **클래스 먼저 → 리포트** (리포트가 클래스를 참조하므로 역순이면 활성화 불가).
   테스트는 클래스가 아닌 **리포트 로컬 테스트 클래스에 배치** — 클래스 테스트
   include 배포가 vsp TODO인 반면 REPORT 로컬 테스트는 Phase 1.5에서 `vsp test`
   지원 실증됨.
3. **분석 스코프 변경**: `$TMP` 패키지 단위 분석 → **객체 단위 분석**(source read /
   graph / search)으로 한정. 근거: 공유 패키지 988객체 노이즈가 패키지 단위 신호를
   압도. 부수 확정: 참조처 조회 정본은 `graph --direction callers`.

## 5. connected 채점 계획 (무인 완주 후 — 사람 셰퍼딩, Phase 1.5 전례)

1. `vsp deploy src/zcl_sah2_workdays.clas.abap '$TMP'` (클래스 먼저 — §4-2 순서)
2. `vsp deploy src/zsah2_duedate.prog.abap '$TMP'`
3. `vsp test PROG ZSAH2_DUEDATE` — 5 테스트 PASS 기대 (green 채점)
4. `vsp atc` + 부수 실증: `graph PROG ZSAH2_DUEDATE --direction callees`가
   ZCL 참조를 잡는지 (계획-단계 분석 명령의 실효 확인)

CTS 무관 — `$TMP`는 로컬 객체 패키지라 transport가 생성되지 않는다. write는 전부
DEV tier(IDES-DEV)에서만 (R-003).
