---
name: develop-abapgit
description: Offline delivery path for ABAP — author and check sources inside a local abapGit mirror seeded from a full package export, build a whole-package ZIP, and hand it to the user, who imports it through the abapGit UI themselves. The agent never connects to SAP; the ZIP is the deliverable, and import, activation, and transport stay with the user.
---

# develop-abapgit (wrapper)

PLUGIN_ROOT = the directory two levels above this SKILL.md (it contains `core/`, `server/`,
`.claude-plugin/`, `.codex-plugin/`; on Claude Code it equals `${CLAUDE_PLUGIN_ROOT}`).

1. Resolve project context first: read `PLUGIN_ROOT/core/project-context.md` and the project's `.sapkit/config.json`.
2. Read `PLUGIN_ROOT/core/procedures/develop-abapgit.md` and follow it exactly, in order, honoring every gate.
3. Policies in `PLUGIN_ROOT/core/policies/` override convenience — especially `development-loop.md` (Full strength at both entry points) and `credential-handling.md` (no connection details, credentials, or secrets in the mirror or the ZIP).

Task: {{ARGUMENTS}}
