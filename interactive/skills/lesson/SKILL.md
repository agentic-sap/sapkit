---
name: lesson
description: Turn a verified, likely-to-recur SAP failure into a consulted guardrail — a five-step LESSONS→RULES loop (plus a Demote mode) writing .sc4sap/LESSONS.md and .sc4sap/RULES.md, never auto-promoting an ordinary failure
---

# lesson (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` (the project's `.sc4sap/LESSONS.md` / `.sc4sap/RULES.md` may not exist yet — creating them is this skill's job).
2. Read `PLUGIN_ROOT/core/procedures/lesson.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience.

Task: {{ARGUMENTS}}
