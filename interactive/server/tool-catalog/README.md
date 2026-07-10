# tool-catalog 상태 주의 (2026-07-10 실측)

이 카탈로그(read 81 / write 76 분류)는 원본 sc4sap-custom에서 이식된 문서로,
**현재 번들(4.13.0, live 155 tools)과 어긋난다** — 카탈로그에만 있는 도구 27종
(CreateProgram·UpdateInclude·GetProgram 등 프로그램/화면 계열), live에만 있는 12종
(GrepObjects·GetCallGraph·UpdateSourceByPatch 등).

- **권한 템플릿의 정본은 live tools/list** — `scripts/gen-permissions.mjs`가 서버를
  직접 기동해 생성한다. 이 카탈로그를 권한·노출 정책의 정본으로 쓰지 말 것.
- 카탈로그는 도구의 **분류(read/write/runtime) 참고**로만 사용하고, 서버 갱신 시
  `server/UPDATE-RUNBOOK.md` step 3(capability diff)에 따라 재검토한다.
- 미노출 27종의 실체(연결 시 동적 노출 여부, 프로그램 계열 도구의 4.13 제거 여부)는
  L3 E2E의 연결 상태 tools/list로 판정한다 — 절차 문서(create-program 등)가 참조하는
  도구의 존재 확인 포함.
