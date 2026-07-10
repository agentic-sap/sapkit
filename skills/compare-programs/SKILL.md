---
name: compare-programs
description: Business-angle comparison of 2–5 ABAP programs that share the same business scenario but diverge by module (MM vs CO), country (KR vs EU), persona (controller vs warehouse), or time horizon. Reader = functional consultant.
---

# compare-programs (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sc4sap/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/compare-programs.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience. Personas live in `PLUGIN_ROOT/core/personas/` (pick via `INDEX.md`).

Task: {{ARGUMENTS}}
