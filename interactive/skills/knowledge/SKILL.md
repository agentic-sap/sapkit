---
name: knowledge
description: Record what this project had to find out — a business-domain or this-system fact — as an evidence-backed, citable atom under .sapkit/knowledge/, or correct one that turned out wrong without deleting it. Behind "지식으로 남겨줘", "도메인 지식 정리", "이거 기록해둬", "record this fact", "keep this for next time". Not for failures (use lesson) and not for facts the shipped SAP knowledge already covers.
---

# knowledge (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` (the project's `.sapkit/knowledge/domain.md` / `system.md` may not exist yet — creating them is this skill's job).
2. Read `PLUGIN_ROOT/core/procedures/knowledge.md` and follow it exactly, in order, honoring every gate — especially the evidence requirement and the real-data scrub.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience.

Task: {{ARGUMENTS}}
