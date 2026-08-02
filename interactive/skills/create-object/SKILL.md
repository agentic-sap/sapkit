---
name: create-object
description: ABAP object creation procedure — freeze package and transport intent, then create, write the initial implementation, and activate under attended P3 (MCP success = PROVISIONAL_WRITE, not completion)
---

# create-object (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sapkit/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/create-object.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience. Personas live in `PLUGIN_ROOT/core/personas/` (pick via `INDEX.md`).

Task: {{ARGUMENTS}}
