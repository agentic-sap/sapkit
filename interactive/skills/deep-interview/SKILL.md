---
name: deep-interview
description: Socratic deep interview to crystallize ambiguous SAP requirements before build work. Use when scope, business rules, or data sources are still unsettled ahead of create-program or other build/spec procedures — staged questions narrow options and produce an approved requirements brief that the downstream run consumes.
---

# deep-interview (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sc4sap/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/deep-interview.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience. Personas live in `PLUGIN_ROOT/core/personas/` (pick via `INDEX.md`).

Task: {{ARGUMENTS}}
