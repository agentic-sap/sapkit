---
name: package-to-process
description: Reverse-engineer one CBO package into an End-to-End Business Process document — walk its programs and FMs, recover the business-document flow (PR→PO→GR→IR style), and emit a consultant-facing Markdown narrative with rendered process-map and sequence-diagram images plus per-step tables.
---

# package-to-process (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sapkit/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/package-to-process.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience. Personas live in `PLUGIN_ROOT/core/personas/` (pick via `INDEX.md`).

Task: {{ARGUMENTS}}
