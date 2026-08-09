---
name: verify-applied
description: Machine-confirm an object already applied to SAP — read its source back out of the system and compare it against what was sent, then confirm syntax and active state — and report the outcome in plain language. The entry point behind "확인해줘", "완료 확인", "반영됐는지 봐줘", "제대로 들어갔나", "verify this program", "did it really apply". A tool's success response is not evidence: an MCP `Create*`/`Update*` returning OK, or `ActivateObjects` reporting ACTIVE, leaves the object at PROVISIONAL_WRITE. This procedure supplies the machine half of completion; an independent fresh-context review (R-PASS) supplies the other.
---

# verify-applied (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sapkit/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/verify-applied.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience.

Task: {{ARGUMENTS}}
