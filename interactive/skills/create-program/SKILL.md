---
name: create-program
description: End-to-end procedure for creating ABAP programs (Report / CRUD / ALV / Batch / Interface) with Main+Include structure. One agent runs all phases sequentially — SAP version preflight, two-stage Socratic interview, planning with reuse gates, spec writing, human approval gate, implementation, self-QA, fresh-context review gate, debug escalation, completion report.
---

# create-program (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sc4sap/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/create-program.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience. Personas live in `PLUGIN_ROOT/core/personas/` (pick via `INDEX.md`).

Task: {{ARGUMENTS}}
