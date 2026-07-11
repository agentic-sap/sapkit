# Rules

<!-- Cap: 40 rules (engine warns above; the only hard startup gate is 16KB
     total). Add or merge only via the Memory Loop
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
- R-002 [vsp] vsp를 MCP 서버 모드로 기동하지 않는다 — 트랙 A는 CLI 전용, powerup MCP와 도구 중복·권한 이원화 (from tailor)
- R-003 [sap-safety] QA/PRD tier SAP 시스템에 vsp write(deploy/copy/execute 등)를 실행하지 않는다 — write는 DEV tier에서만 (from tailor)
- R-004 [repo] 동결 레포(sc4sap-custom·sc4sap-lite)를 수정하지 않으며 sc4sap-custom/private/는 읽지도 않는다 (from tailor)
- R-005 [secrets] SAP 접속 정보(호스트·자격증명·.env 내용)를 레포에 커밋하지 않는다 (from tailor)
