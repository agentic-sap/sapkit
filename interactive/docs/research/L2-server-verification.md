# L2 실측: 서버 이관 검증 (2026-07-10)

`scripts/smoke-mcp.mjs`로 무프로파일 기동 스모크 수행. 환경: Windows 11, Node,
SAP_*/MCP_* env 제거 상태, `.sc4sap/` 부재.

## 결과

- 번들: `@hjaewon/abap-mcp-adt-powerup` **4.13.0** (commit a4baadc). 커밋본 SHA-256이
  원본 sc4sap-custom `engine/server.bundle.cjs`와 **일치** (c073672f…).
- 기동: `[MCP] Starting in inspection-only mode (no connection parameters.)` —
  연결정보 없이는 검사 전용 모드.
- `tools/list`: **155개** 노출. write 계열 62개(Create/Update/Delete/Activate/Release/
  Install), row-data 2종(GetTableContents, GetSqlQuery) **포함 전부 목록에 노출됨**.

## 수용 기준 판정 (DESIGN.md §4-3 "프로파일 미설정 시 write 도구 미노출")

**목록 수준에서는 불합격, 기능 수준에서는 완화됨**:

- 불합격: 도구 목록에는 write가 그대로 노출된다 — 노출 억제는 `--exposition` 플래그로
  가능(번들에 실재, 프리셋 값은 L4 실측).
- 완화: 연결정보가 없으면 inspection-only 모드라 write 호출이 SAP에 닿을 수 없다.
- **실질 갭 (엔진 수정 필요)**: 연결정보는 있으나 `SAP_TIER` 미설정이면 tier가 DEV로
  기본되어 write 가드가 열린다 (설계 시 Codex 리뷰 5.1 실측과 일치). 대응:
  1. 정책층은 이미 커버 — `core/policies/credential-handling.md`가 "tier 미설정 시
     connected 금지"를 규정.
  2. 기계층 보완은 **엔진 포크 이슈로 이관**: "SAP_TIER 미설정 + 연결정보 존재 시 기동
     거부(또는 write 미등록)" — hjaewon/abap-mcp-adt-powerup에 반영 후 번들 갱신
     (UPDATE-RUNBOOK 절차). L3 진행을 막지 않음.

## L2 잔여

- 연결 스모크(실 SAP 대상 read 왕복)는 사용자 프로파일 준비 후 — L3 E2E에 편입.
- `--exposition` 프리셋 값 실측 → L4 (Codex 어댑터).
