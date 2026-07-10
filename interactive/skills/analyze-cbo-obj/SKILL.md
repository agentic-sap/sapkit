---
name: analyze-cbo-obj
description: Analyze a CBO (Customer Business Object) package — discover frequently-used Z tables / function modules / data elements / classes / structures / table types — and save a per-module / per-package reference file so later program / program-to-spec runs prefer existing CBO elements over new ones.
---

# analyze-cbo-obj (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sc4sap/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/analyze-cbo-obj.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience. Personas live in `PLUGIN_ROOT/core/personas/` (pick via `INDEX.md`).

Task: {{ARGUMENTS}}
