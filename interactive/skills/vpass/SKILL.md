---
name: vpass
description: Run the V-PASS completion-evidence chain (source read-back · active-state · unit · ATC) with tools/vpass/vpass.mjs against an object already applied to SAP, and report the verdict in plain language — the completion stamp behind "V-PASS", "검증해줘", "완료 도장 찍어줘", "완료 확인", "verify object", "completion stamp" requests. An MCP write success alone is only PROVISIONAL_WRITE (D-025); V-PASS is the machine-verified half of COMPLETE, and still needs a separate R-PASS review.
---

# vpass (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sc4sap/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/verify-vpass.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience.

Task: {{ARGUMENTS}}
