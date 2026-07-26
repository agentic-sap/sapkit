# Rules

<!-- Cap: 40 rules (engine warns above; the only hard startup gate is 16KB
     total). F3 proactive audit starts at >=30 rules or >=12KB; this is a
     maintenance trigger, not a hard gate. Engine behavior remains >40 rules
     WARN and >16KB hard startup refusal. Add or merge only via the Memory Loop
     (.harness/PROTOCOL.md). One line each:

- R-NNN [area] short imperative rule (from L-NNN)

     Prefer negative constraints ("do not X - it causes Y") over positive
     style guidance ("write clean X"). Prohibitions tied to a concrete
     failure steer sessions of any model strength; aspirational wording
     does not, and dilutes the rules that matter.

     Style, persona, and tone guidance are not RULES material at all -
     route them to project docs (harness-docs). RULES is reserved for
     verified prohibitions and invariants.
-->

- R-001 [verify] ENV_FAIL/LOCK_FAIL 마커가 찍힌 verify 실패를 코드 결함으로 기록하거나 규칙 승격 후보로 올리지 않는다 — 환경 실패는 LESSONS 오염원 (from tailor)
- R-002 [vsp] vsp를 온라인(SAP 접속) MCP 서버 모드로 기동하지 않는다 — 트랙 A는 CLI 전용, powerup MCP와 ADT 도구 중복·권한 이원화. 로컬 전용 `--offline` 모드(SAP 무접속·ADT 무접촉, AnalyzeABAPCode 등 4종)는 이 금지 밖 (from tailor; D-049로 축소)
- R-003 [sap-safety] QA/PRD tier SAP 시스템에 vsp write(deploy/copy/execute 등)를 실행하지 않는다 — write는 DEV tier에서만 (from tailor)
- R-004 [repo] 동결 레포(sc4sap-custom·sc4sap-lite)를 수정하지 않으며 sc4sap-custom/private/는 읽지도 않는다 (from tailor)
- R-005 [secrets] SAP 접속 정보(호스트·자격증명·.env 내용)를 레포에 커밋하지 않는다 (from tailor)
- R-006 [vsp] SAP write(deploy/copy) 후 성공 보고만 믿지 말고 `vsp source read`로 반영을 확인한다 — CLAS 거짓 성공 실증 이력(L-001; v2.38.1-89에서 수리 완료·라이브 검증). v2.38.1-89 미만 빌드로 CLAS deploy/copy를 실행하지 않는다 (from L-001)
- R-007 [sql] 마스터 데이터 조회에서 텍스트·속성 테이블을 INNER JOIN으로 결합해 "전체 표시"를 의도하지 마라 — 텍스트 행이 없는(로그온 언어 미유지) 레코드가 결과에서 조용히 빠진다, 완전성이 필요하면 LEFT OUTER JOIN을 쓴다. 기계 검증(문법·활성화·단위·ATC)은 이 누락을 못 잡고 검토만 잡는다 (from L-002)
- R-008 [repo] 원격 대조(git fetch + main..origin/main 확인) 없이 재개 세션의 작업을 시작하지 마라 — 로컬 HANDOFF만 믿으면 다른 머신의 병렬 줄기를 감지 못 한다. 주/보조 머신 6일 분기(각 65커밋, D-번호·엔진 버전 충돌) 실증. 분기 발견 시 작업 전 사용자에게 보고 (from L-003)
<!-- R-009: 원격(주 머신) 줄기의 R-007에서 재번호 — 분기 통합 2026-07-19. 규칙 문구는 불변이며 참조만 정합: 원격 L-002(fi-amount-source)가 L-004로 재번호되어 (from L-002)→(from L-004). -->
- R-009 [fi-version] S/4HANA 대상에서 전표 라인아이템 금액을 BSEG에서 SELECT하지 않는다 — 금액 소스는 ACDOCA(Universal Journal)+리딩원장 한정(rldnr = '0L'). BSEG은 rldnr가 없어 원장 한정이 구조적으로 불가하며, lint·유닛테스트를 전부 통과해 리뷰에서만 드러난다(4a 씨앗 차단 실증) (from L-004)
