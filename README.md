# SAPKIT

SAP ABAP 개발·컨설팅 플러그인 — 지식 코어 + 페르소나 + 절차 + ADT MCP 서버.

## 설치

**Claude Code**

```text
claude plugin marketplace add agentic-sap/sapkit
claude plugin install sapkit@agentic-sap --scope user
# 새 세션 또는 /reload-plugins
/sapkit:setup
```

**Codex CLI**

```text
codex plugin marketplace add agentic-sap/sapkit
codex plugin add sapkit@agentic-sap
# 새 세션
$sapkit:setup
```

`setup`이 SAP 접속 프로파일(비밀번호는 직접 입력), 프로젝트 설정, Codex MCP 배선을
대화로 안내한다. 프로파일 없이도 지식·상담 스킬은 바로 동작한다.

## 업데이트

```text
claude plugin update sapkit@agentic-sap        # Claude Code
codex plugin marketplace upgrade agentic-sap   # Codex — 이후 codex plugin add 재실행
```

## 더 보기

[interactive/README.md](interactive/README.md) · 어댑터별 안내:
[Claude Code](interactive/adapters/claude/README.md) ·
[Codex](interactive/adapters/codex/README.md) ·
[Antigravity](interactive/adapters/antigravity/README.md)

라이선스 [MIT](LICENSE) — 상류 고지 승계.
