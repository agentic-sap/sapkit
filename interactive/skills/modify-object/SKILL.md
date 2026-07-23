---
name: modify-object
description: Minimal-strength procedure for a small, clear edit to an existing ABAP object — read relevant rules, change only within scope via Update*, machine-verify, and stop at PROVISIONAL_WRITE with zero project footprint
---

# modify-object (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sc4sap/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/modify-object.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience — especially `development-loop.md` (strength + execution_owner) and `sap-standards.md`.

Task: {{ARGUMENTS}}
