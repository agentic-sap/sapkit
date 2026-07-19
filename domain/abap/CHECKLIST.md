# ABAP 초안 셀프체크 (offline)

무인 step/워커가 ABAP 소스 초안을 verify(`vsp lint --file` / `vsp parse --file`)에
넘기기 전에 스스로 확인하는 체크리스트. offline에서 확인 가능한 것만 다룬다 — 온라인
전용 항목은 맨 아래 명시.

1. **테스트 클래스를 구현보다 먼저 작성했는가** — 구현 소스보다 테스트 클래스 소스를
   먼저 쓴다(tdd-guard가 ABAP을 인식하지 않으므로 기계 강제가 아니라 관례 강제,
   DESIGN §7). 순서를 건너뛰면 offline에서는 아무도 잡아주지 않는다.
2. **verify가 Error로 막는 규칙 6종을 스스로 피했는가** — 검사기가 둘로 갈린다(실측;
   DESIGN.md의 offline "7종 Warning 위주" 서술 대비 최신 빌드 기준). offline `vsp lint`가
   등록·평가해 비-0 exit로 게이트를 막는 4종:
   - `line_length` — 라인 255자 초과 (120자 초과는 Warning일 뿐 통과함에 주의)
   - `empty_statement` — 빈 `.`만 있는 문장
   - `max_one_statement` — 한 줄에 문장 2개 이상
   - `preferred_compare_operator` — 조건문(`IF`/`ELSEIF`/`WHILE`/`CHECK`)에서 `EQ`/`NE`/`GT`/`LT`/`GE`/`LE`/`><` 사용 (`=`/`!=`/`>`/`<`/`>=`/`<=`로 교체)

   offline `vsp lint`에는 등록되지 않아 offline 게이트는 통과시키고, 연결이 필요한
   ATC(codeanalysis) 채점에서만 Error로 잡히는 2종 — 초안 단계에서 스스로 피할 것:
   - `hardcoded_credentials` — password/secret/key/token류 변수에 리터럴 대입
   - `commit_in_loop` — LOOP 안에서 `COMMIT WORK`
3. **Z/Y 접두사가 모든 신규 오브젝트에 붙었는가** (RULES.seed S-001).
4. **비즈니스 의미 필드에 raw CHAR/NUMC/DEC를 쓰지 않았는가** — 표준 DE 우선, 없으면
   CBO DE, 그래도 없으면 신규 DE (RULES.seed S-002).
5. **매직 리터럴(기능코드·상태값·화면번호·임계치) 대신 CONSTANTS를 선언했는가**
   (RULES.seed S-007).
6. **`SELECT *` 대신 명시적 필드 리스트를 썼는가, LOOP 안에 SELECT를 넣지 않았는가**
   (N+1 회피, RULES.seed S-016 인접).
7. **`FOR ALL ENTRIES` 앞에 원본 테이블 `IS NOT INITIAL` 체크가 있는가** — 없으면
   빈 테이블일 때 풀스캔이 된다 (RULES.seed S-016).
8. **`CATCH cx_root`로 뭉뚱그리지 않고 구체 예외 클래스를 잡았는가** (RULES.seed
   S-018).
9. **필드심볼을 동적 ASSIGN 직후 `sy-subrc`/`IS ASSIGNED` 확인 없이 바로 쓰지
   않았는가** (RULES.seed S-023).
10. **Procedural/OOP 파라다임을 섞지 않았는가** — Procedural인데 `{PROG}E` include를
    만들지 않았는가, PBO/PAI 모듈에 로직을 직접 넣지 않았는가 (RULES.seed S-005,
    S-008).
11. **화면 라벨·MESSAGE에 하드코딩 리터럴이 없는가** — 전부 `TEXT-Txx`/text-symbol을
    참조하는가 (RULES.seed S-006, 실제 text element 생성 여부는 온라인 전용).
12. **대상 시스템의 ABAP 릴리스·SAP 버전(ECC/S4)을 초과하는 문법·오브젝트를 쓰지
    않았는가** — 스펙에 명시된 목표 릴리스와 대조 (RULES.seed S-009, S-010).
13. **권한이 필요한 로직에 `AUTHORITY-CHECK`(또는 RAP 인스턴스/전역 authorization)가
    있는가** — ABAP SQL은 DB 권한 검사를 우회하므로 없으면 무인가 접근이 통과한다
    (RULES.seed S-020).
14. **row-data 조회(GetTableContents/RunQuery) 전 블록 테이블 카테고리를 확인했는가**
    — 확인 없이 호출을 계획에 넣지 않는다 (RULES.seed S-013).

## 오프라인에서 검증 불가 — 반드시 connected 단계로 넘길 것

- **activation(활성화)** — `vsp lint`/`vsp parse`는 문법 토크나이즈·스타일 린트일 뿐
  syntax check가 아니다 (DESIGN §8.1). offline 게이트 통과 ≠ 활성화 성공.
- **ATC(ABAP Test Cockpit)** — `vsp atc <type> <name>`은 연결 필요.
- **ABAP Unit 실행** — `vsp test`는 배포된 오브젝트 대상으로만 동작(연결+write gate
  뒤). offline에서는 테스트 클래스 소스의 존재·구조만 자체 점검 가능하고 red/green
  판정은 못 낸다 (DESIGN §7 2단 구조).
- **drift check(SE80 수동 변경 검출)** — 레포와 SAP 상태 비교는 배포 이후에만 성립
  (DESIGN §6).
- **리뷰 체크리스트(vsp standard "Code Review Checklist") 전체 12항목** — ALV
  필드카탈로그 구성 방식, 텍스트요소 4종 카운트, include 구조 등은 활성화된 오브젝트의
  실제 소스를 MCP로 fetch해야 검증 가능하다. 이 셀프체크는 그 사전 예방일 뿐, 리뷰를
  대체하지 않는다 (RULES.seed S-025).
