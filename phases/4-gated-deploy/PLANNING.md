# Phase 3 (Gated Deploy) 계획 — phases/4-gated-deploy

> 2026-07-19 동결. DESIGN §13 Phase 3 완료 기준 + 리뷰 게이트 스펙
> (docs/reference/designs/2026-07-17-phase3-review-gate.md) AC-8·14·15 실증이
> 목적. 정찰 원자료 = 계획 정찰 보고(세션 위임)·잔여 스윕
> (docs/reference/audits/2026-07-19-remaining-backlog-sweep.md).

## 0. CONSULT 기록 (packs/modules/fi — Phase 4 "팩 CONSULT 실사용" 실증)

트랙 A CONSULT 단계에서 `packs/modules/fi/CONSULTANT.md`·`TABLES.md`·
`RULES.seed.md`를 사용했고, 계획 결정이 실제로 바뀌었다:

1. **FI-004 [authz] → 스펙 요구 2 편입**: G/L 마스터(SKA1) 조회는
   `AUTHORITY-CHECK OBJECT 'F_SKA1_KTP'` 필수. red/green 모두 처음부터 포함 —
   부수 효과로 "AUTHORITY-CHECK 부재를 ATC 변형이 잡아 AC-8 전제가 깨질 위험
   (정찰 R4)"이 원천 제거됨(예비 시나리오 불필요해짐).
2. **KR §7 + TABLES.md SKAT 언어 처리 → 스펙 요구 3 명문화**: "로그온 언어
   텍스트 없는 계정도 전부 표시"가 업무 요구로 명시됨 — red의 INNER JOIN이
   위반하는 조항이 스펙에 존재하게 됨(AC-8 판정 근거).
3. **버전 게이트(§2)**: 대상 S/4 2021 확정 — SKA1/SKAT 마스터 조회 적정
   (BSEG류 호환 뷰 이슈 무관), ACDOCA 불요 판정.
4. **조사 프로토콜(§3) 정직 기록**: 표준 대체재(FS00·S_ALR 계열 표준 리포트)가
   실무상 존재한다. 본 개발은 게이트 실증용 파일럿 산출물로서 정당화되며, 실무
   요건이었다면 표준 우선 권고가 답이다.

## 1. 대상·구성

- `src/zsah4_gl_list.prog.abap` — REPORT + 순수 헬퍼 `summarize`(단위테스트
  대상) + 데이터 접근 SELECT(JOIN — 테스트 비대상) + 로컬 테스트 클래스
  `ltc_gl_list` 5케이스. 규모 Phase 1·2 수준.
- 스펙 = `spec.md` (**계획 동결 시점 고정** — 정찰안은 S0 워커 작성이었으나,
  스펙은 리뷰어 판정 기준이므로 red 워커가 자기 결함에 맞춰 쓸 수 있는 구멍을
  막기 위해 계획 산출물로 승격. 게이트 무결성 결정).
- 게이트 도구 = scripts/review-gate/(기성, node:test 46) + 신규
  `deploy-shim.mjs`(R1 해소 — deploy-cmd 템플릿이 공백 split이라 인용 인자
  불가 → 무공백 상대경로 shim이 내부에서 verify-sap.ps1 -Write 인용 호출).

## 2. AC-8 red 설계

- red = 스펙 요구 3 위반: `INNER JOIN skat`(로그온 언어 텍스트 없는 계정
  탈락) — 기계 검증 무맹점: lint(스타일만)·활성화(문법)·ATC(시맨틱 규칙
  부재 — 선례 실측 INFO만)·unit(순수 헬퍼만 검증, JOIN 비대상) 전부 green.
  선례 실증 계열(INNER vs LEFT — HANDOFF §4.1·DESIGN §13).
- green = `LEFT OUTER JOIN` 전환(요구 3 충족)이 유일 수정. 단일 결함 원칙 —
  AC-8 인과를 깨끗하게 유지.
- red→green 실현 = **단일 리뷰 스텝(S2) + 엔진 표준 재시도**(스펙 §4.2 그대로,
  red/green 분리 스텝은 exit 의미론 충돌로 기각 — 정찰 판정 수용). 리뷰 스텝
  재시도 예산 5(revision 3 + 인프라 2, 스펙 §4.2 계약).

## 3. AC-15 구현 결정 — (c) 래퍼 서버증거 캡슐 동봉

- 현행 리뷰어 격리(Bash 전면 차단·클린 env·MCP 0)는 스펙 §8 제약이자 AC-7
  실증 완료 상태. Bash 스코프 개방(a안)은 스파이크에서 **판별 불가**(부모
  세션 bypass 권한이 env로 자식에 상속돼 스파이크가 오염됨 — 클린 env
  스폰인 실제 리뷰어와 조건 불일치) + 별도 재검증 사이클 필요라 기각.
- 채택 = **(c)**: S1/S2 재검증 체인(래퍼 신뢰 경로)이 `vsp source read`
  서버 실측을 `verification.json`의 `server_evidence` 블록으로 동봉 →
  캡슐 해시에 포함 → 리뷰어는 캡슐 내 서버 증거로 대조(프롬프트 v1.1에
  대조·IC 선언 의무 명시). "판정에 쓰는 사실 = 서버 실측"이라는 AC-15
  취지를 격리 무변경으로 충족. 대조 불능 시 INSUFFICIENT_CONTEXT(비0).
- config.json prompt_version 1.0→1.1 (캐시 무효화는 해시 설계상 자동).

## 4. drift 실증 (S5)

- out-of-band 채널 = MCP `UpdateProgram`+`ActivateObjects`(SE80 등가 —
  파일·게이트 밖에서 서버 객체 직접 편집, attended 세션 채널). 마커 주석
  1줄 삽입 → `vsp source read` 대조 = 비어있지 않은 diff 검출(성공 조건) →
  게이트 경로(deploy-gate, PASS 캡슐 유효) 재배포로 원복 → 재대조 clean.

## 5. 소품 편입 (스윕 A-19·A-20·A-3)

- S4에서: `transport list`/`get` read-only 1회 실측(A-19) · ATC Error급
  exit 거동 실측 시도(A-20 — IDES 기본 변형에서 Error급 유발 불가 시 정직
  기록) · CLAS 테스트 include 배포 프로브(A-3 — 지원/미지원 실측 기록,
  임시 객체는 정리).

## 6. 리스크 대응 (정찰 R1~R9)

- R1 deploy-cmd 공백 → deploy-shim.mjs(§1). R2 캡슐 해시 런타임 결정 →
  S3 verify가 state.json pass_records에서 해시 판독(compound). R3 → §3.
  R4 → §0-1로 원천 제거. R5 config 현행 opus·600s 유지. R6 프리플라이트
  VERIFY_PASS 실측 완료(2026-07-19). R7 ZSAH4 서버 잔존물 없음 — S1 첫
  배포 전 search 0건 확인 포함. R8 write 게이트 lock v2.38.1-94 실증 기성.
  R9 phase 3-review-gate blocked 상태와 독립(새 디렉터리).

## 7. 스텝 지도

S0 implement-red(오프라인) → S1 스테이징 기계검증+무맹점 증거+서버증거
(verification.json) → S2 리뷰 게이트(1차 FAIL 기대→재시도 수정→PASS, 예산 5)
→ S3 deploy-gate 캡슐본 배포 → S4 배포후 채점+소품 프로브 → S5 drift 실증
→ S6 증거 통합(phase3-evidence.json — AC-8·14·15·drift·완주 체인). 상세 =
각 step*.md.

## 8. 런 중 계획 수정 기록 (2026-07-19, 정지→수정→재개)

- S0~S2는 설계대로 완주(AC-8 red FAIL 862ca3b3…·green PASS 3f678081… 엔진
  기록). **S3 verify 1차 실패 = 코드가 아니라 verify 명령 자체의 결함**:
  엔진이 verify를 `shell=True`(cmd.exe)로 실행하는데 S3에만 있던 이중 중첩
  인용(`\"…\"` 안 node -p)이 cmd 경유에서 PowerShell
  ParserError(TerminatorExpectedAtEndOfString)로 깨짐 — 동일 조건 재현으로
  확정(다른 스텝은 1겹 인용이라 통과, S1 실증). 계획 린트가 verify를 PS
  직실행으로만 검사하고 cmd 경유를 재현하지 않은 공백.
- 절차: harness-run 규약대로 런 정지 → 계획 수정 — 해시 판독+게이트 호출을
  `checks/run-deploy-gate.mjs`(신규, 인용 0)로 이전, S3 verify =
  `node phases/4-gated-deploy/checks/run-deploy-gate.mjs` → 커밋 → 재기동
  (엔진이 completed 스텝 0~2 상태 기반 스킵, S3부터 재개).
- 교훈 후보(스프린트 마감 시 처리): verify 명령은 cmd.exe 경유 실행을
  전제로 작성 — 중첩 인용 금지, 복잡 로직은 스크립트 파일로.
- **동반 발견 2 — 캡슐 경로는 절대여야**: deploy-gate가 {file}을
  `<capsuleDir>/files/<i>/<basename>`로 치환해 spawn cwd=scripts/review-gate
  로 실행하므로, --capsule이 레포 상대면 vsp가 그 cwd 기준으로 파일을 찾다
  실패(재현·실증). run-deploy-gate.mjs가 --capsule·--unit·--state를
  path.resolve 절대화하도록 수정 — 수정 후 엔진 동일 조건(cmd 경유) exit 0
  확인. 진단·검증 과정에서 **엔진 밖 캡슐본 배포 2회 발생**(둘 다 PASS 캡슐
  green 동일본 — 서버 상태 등가·무해, 정직 기록).
- **관찰(후속 후보, 런 중 무수정)**: deploy-gate.mjs:127 spawnSync가 자식
  출력(pipe)을 어디에도 전달하지 않아 배포 실패 사유가 침묵됨 — exit 전파는
  정상이므로 동작 무결, 관찰성 개선(stdio inherit 또는 실패 시 캡처 출력
  방출)은 스프린트 마감 후속 후보로만.
- **동반 발견 3 — S6 체커 필드명 오기(계획 산출물 결함)**: verdict 파일
  실물 스키마는 `classification`(review-gate.mjs writeVerdictFile)인데
  check-phase-evidence.mjs가 존재하지 않는 `verdict` 필드를 읽어 무조건
  "no FAIL verdict" 실패 — S6 워커가 정직 blocked 보고 + 스크래치 패치로
  원인 격리 실증(2줄 교체 시 CHECK_OK). 계획 소유자가 체커 수정(checks/는
  계약 write 범위, 게이트 스크립트 아님) 후 같은 워커 재개로 마무리.
  교훈 후보: 계획이 산출물 스키마를 소비할 땐 소스에서 필드명을 실측 전사.
