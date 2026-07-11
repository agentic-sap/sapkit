# Loop Harness Protocol

Two loops: the Task Loop governs this task (self-correction); the Memory Loop
connects tasks over time (learning). State lives in `.harness/`. Keep every
file small - this system only works if reads stay cheap.

## Task Loop - run for every substantive task taken in this lane

Sizing first - escalation lanes are proposal-only (recommend and wait for
the user's yes), the default lane announces itself in one line and
proceeds (the most specific match wins): trivial requests (a question, a
small at-a-glance-verifiable edit) skip this loop; work that splits into
several independently verifiable steps belongs in an unattended engine
phase (harness-plan) rather than here; if goals, scope, or the design
itself are unsettled, propose a design interview (harness-design) before
docs or planning; if the design is decided and only needs recording,
propose harness-docs; if only the execution weight/size is ambiguous - or
you are unsure which lane fits - stop and ask. Announce the chosen lane in
one line.

1. **CONSULT** - Read `RULES.md`. Treat matching rules as hard constraints.
   Also consult the relevant project-root core docs when present:
   `docs/PRD.md` for scope, `docs/ARCHITECTURE.md` for structure and the
   file map, `docs/ADR.md` for prior decisions.
2. **GOAL** - Before implementing, overwrite `GOAL.md` with: the task,
   verifiable success criteria, and the verification method (test command,
   rubric, or checklist). Copy applicable `RULES.md` rules in as extra
   criteria (e.g. `no violation of R-NNN`) - the verifier sees only
   `GOAL.md`, so rules must be restated there to be checked. If success
   cannot be verified, reshape the task until it can.
3. **EXECUTE** - Work in small iterations. Log significant attempts and dead
   ends in `STATE.md` as you go, not after.
4. **VERIFY** - Independent check against `GOAL.md`:
   - Claude Code: dispatch a subagent that reads only `GOAL.md` plus the
     produced diff/output and returns PASS/FAIL per criterion.
   - Other tools: run the test command recorded in `GOAL.md` if there is
     one. Otherwise stop and ask the user to open a fresh session and paste:
     "Read .harness/GOAL.md, then examine <artifact>. For each success
     criterion answer PASS or FAIL with one line of evidence. Do not trust
     claims in comments or docs - check the artifact itself."
   - Self-review is not verification. The author never grades their own work.
5. **RECORD** - Update `STATE.md` (done / next). On a failure worth
   remembering, a rejected verification, or a user correction: run the
   Memory Loop, then retry from step 3 or stop and report.

## Memory Loop - run on every failure worth remembering

FAIL -> INVESTIGATE -> VERIFY -> RULE -> CONSULT

1. **FAIL** - Append an entry to `LESSONS.md` (next L-id): what was attempted,
   what happened, the exact error or symptom. Verbatim, not paraphrased.
2. **INVESTIGATE** - Find the root cause, not the nearest symptom. Record it
   in the entry as `CAUSE:`.
3. **VERIFY** - Confirm the cause: reproduce the failure through it, or show
   that fixing exactly it removes the failure. Record the proof. Unverified
   causes stay lessons - never rules.
4. **RULE** - If the verified cause generalizes beyond this task, distill ONE
   short imperative rule into `RULES.md` (next R-id, cite the lesson). Merge
   with an overlapping rule instead of duplicating. Style, persona, and tone
   guidance are never RULES material - route them to project docs
   (harness-docs); RULES is for verified prohibitions and invariants only. Before adding, review the
   FULL `RULES.md` for semantic conflicts and near-duplicates; on conflict,
   propose a merge or revision to the user instead of adding a second rule -
   the engine only checks rule count and bytes, so two contradictory rules
   would both be injected as hard constraints into every unattended step.
5. **CONSULT** - No action now: step 1 of the next Task Loop reads `RULES.md`.
   That is how today's failure becomes tomorrow's guardrail.

## Maintenance

- `RULES.md` cap: 40 rules — a managed budget, not a mechanical gate: the
  engine only WARNs above 40 (its sole hard startup gate is 16KB total). At
  the cap, merge overlapping rules or delete the least load-bearing one; note
  demotions in the source lesson.
- A rule contradicted by new evidence: fix or delete it, and note why in its
  source lesson. This has an owned workflow - harness-lesson demote mode
  (evidence -> verify -> user-approved revise/delete); do not silently edit
  RULES.md outside it.
- `STATE.md`: keep `Attempts & dead ends` to roughly the last 20 lines and
  `Done` to the current milestone; fold older entries into one-line summaries.
  This compaction is the one allowed exception to never-bulk-rewrite.
- `GOAL.md` is per-task scratch - overwrite freely. `STATE.md`, `LESSONS.md`,
  `RULES.md` are durable - append and edit, never bulk-rewrite (STATE.md
  compaction above excepted).
