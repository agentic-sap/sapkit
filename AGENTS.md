## Loop Harness

This project uses a learning loop harness. State lives in `.harness/`.

Interactive sessions only: if the prompt says this session runs under the
step engine (unattended execution), skip this loop entirely and do not
write to `.harness/` - the engine verifies, records, and reverts
session-authored memory edits on its own.

Size each request before starting. Escalation lanes are proposal-only -
recommend and wait for the user's yes; the default lane announces itself
in one line and proceeds (the user can always redirect). Most specific
match wins; unsure which lane fits IS weight ambiguity - take the
stop-and-ask lane:

- Trivial (a question, or a small at-a-glance-verifiable edit) -> answer
  directly; skip this loop.
- Work that splits into several independently verifiable steps -> propose
  planning it as an unattended engine phase (harness-plan skill in Claude
  Code) instead of running it through this loop.
- Goals, scope, or the design itself unsettled (a seed idea, not a task
  yet) -> propose crystallizing it first (harness-design skill in Claude
  Code); the approved spec then feeds the docs and planning skills.
- Design already decided, only needs recording in the knowledge docs ->
  propose the harness-docs skill (in Claude Code) instead of this loop.
- Only the execution weight/size is ambiguous -> stop and ask before
  doing anything.
- Otherwise (substantive interactive work) -> say so in one line and run
  the loop below.

For every substantive task taken in this lane:

1. **CONSULT** - read `.harness/RULES.md`; matching rules are hard constraints.
   Also consult the relevant project-root core docs when present:
   `docs/PRD.md` for scope, `docs/ARCHITECTURE.md` for structure and the
   file map, `docs/ADR.md` for prior decisions.
2. **GOAL** - write verifiable success criteria to `.harness/GOAL.md` before implementing.
3. **EXECUTE** - work in small steps; log attempts in `.harness/STATE.md`.
4. **VERIFY** - check the result against GOAL.md with an independent reviewer (subagent or fresh session), never self-review.
5. **RECORD** - update STATE.md; on any failure worth remembering or any user correction, run the memory loop in `.harness/PROTOCOL.md`: FAIL -> INVESTIGATE -> VERIFY -> RULE -> CONSULT.

Full procedure: `.harness/PROTOCOL.md`. Never bulk-rewrite `LESSONS.md` or `RULES.md`.
