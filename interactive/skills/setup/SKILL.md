---
name: setup
description: Interactive onboarding wizard — SAP connection profile, project context files, permission template merge, safety hooks, optional vsp install, and a final layered self-check.
---

# setup (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` (the project's `.sc4sap/` files may not exist yet — creating them is this skill's job).
2. Read `PLUGIN_ROOT/core/procedures/setup.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience.

Task: {{ARGUMENTS}}
