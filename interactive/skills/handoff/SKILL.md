---
name: handoff
description: Close a session by bringing this project's root HANDOFF.md and RUN-PLAN.md up to date — what the work got to, each SAP object's status (DRAFT / PROVISIONAL_WRITE / COMPLETE), and what happens next — creating the pair only on approval and never writing over a same-named file sapkit did not set up. Behind "마감해줘", "재개점 갱신", "다음 세션한테 넘겨줘", "정리하고 끝내자", "wrap up the session", "update the handoff", "hand this over to the next session". Not for facts the project had to find out (use knowledge) and not for failures worth guarding against (use lesson).
---

# handoff (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` (the project's `HANDOFF.md` / `RUN-PLAN.md` sit at the project root, not under `.sapkit/`, and may not exist yet — creating them, on approval, is this skill's job).
2. Read `PLUGIN_ROOT/core/procedures/handoff.md` and follow it exactly, in order, honoring every gate — especially the fail-closed ownership check before any write, the approval gate on every write, and the marker-preservation invariant.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience.

Task: {{ARGUMENTS}}
