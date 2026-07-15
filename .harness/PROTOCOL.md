# Loop Harness Protocol

The former repo-wide singleton Task Loop is **legacy**. Its historical files,
`.harness/GOAL.md` and `.harness/STATE.md`, are frozen and are not inputs or
scratchpads for new work. Routing now follows `AGENTS.md` and the v2 design.

## Supported routing

Classify each action on the execution-structure axis and the orthogonal SAP
Policy axis. File count, step count, and the number of verification commands do
not trigger escalation. In particular, multi-step document or metadata work
that executes an already decided design is Direct; it is never routed to an
unattended phase. `unattended=sealed`.

### CONSULT — all structures

Before substantive work, read `RULES.md` and treat every matching rule as a
hard constraint. Also consult the relevant project-root core documents when
present: `docs/PRD.md` for scope, `docs/ARCHITECTURE.md` for structure and the
file map, and `docs/reference/DECISIONS.md` for prior decisions. This obligation does not
activate a task loop or permit writes to the frozen singleton files.

### Direct — default, no task-loop activation

Direct is the default current-session path when run-scoped evidence is not
required. It creates no `.harness/runs/` record and does not write singleton
GOAL/STATE. Perform the work and label author-run checks as **self-check**, not
independent verification. Questions, code, documents, metadata, maintenance,
and multiple independently checkable edits may all remain Direct.

Direct SAP code remains `DRAFT`; Direct-P3 is `PROVISIONAL_WRITE`. Completion
of SAP code requires Guided-P3 under the v2 R-PASS/V-PASS contract. This does
not impose Guided review on ordinary non-SAP documentation or metadata work.

### Guided — explicit, run-scoped

Guided is an explicit elevation for SAP-code completion, closing Direct-P3,
pause/resume, or work that requires a fresh reviewer or durable run evidence.
Keep its goal, state, contract/manifest, and review evidence under exactly one
`.harness/runs/<run-id>/` scope; never mirror them into singleton GOAL/STATE.

Set verifiable success criteria before implementation, record material attempts
in the run scope, and review the exact frozen subject. The author may self-check
but never grades that as independent review. SAP completion needs the v2
run-scoped `review-verdict.json` R-PASS and vsp-backed V-PASS; byte changes make
the receipt stale.

### Engine — attended, contract-bound

Engine is a special mode for an explicitly selected bounded batch, independent
steps/retries, or seed experiment. The worker consumes an approved new-style
contract and manifest; it does not derive work from singleton GOAL/STATE or a
legacy phase. `supervision=attended` is mandatory.

Enter only through `scripts/run-track-a.ps1`. Raw
`python scripts/execute.py <phase>` is unsupported and prohibited. If the
wrapper, run id, contract, or manifest is absent or invalid, stop that Engine
action; do not bypass or downgrade the preflight. Native Engine `--review` is
not R-PASS; use the separate build → review → write/verify contract from v2 §5.

## Memory Loop — durable learning only

The Memory Loop is not a router and never reactivates singleton GOAL/STATE. Use
it when a failure worth preserving or a user correction is being recorded in
scope:

FAIL → INVESTIGATE → VERIFY → RULE → CONSULT

1. **FAIL** — Append the exact error or symptom to `LESSONS.md` under the next
   L-id; do not paraphrase away the evidence.
2. **INVESTIGATE** — Find and record the root cause, not the nearest symptom.
3. **VERIFY** — Reproduce the failure through that cause or show that fixing
   exactly it removes the failure. An unverified cause remains a lesson.
4. **RULE** — If the verified cause generalizes, distill one short imperative
   into `RULES.md` under the next R-id and cite the lesson. Before adding it,
   read the full rules file and merge overlap; propose any semantic conflict
   instead of adding a contradictory rule. Style, persona, and tone belong in
   project docs, not RULES.
5. **CONSULT** — The next supported action reads RULES before work, carrying the
   verified constraint forward.

## Maintenance

- `RULES.md` keeps separate proactive-audit and Engine startup thresholds; its
  header is the numeric contract.
- `LESSONS.md` and `RULES.md` are durable. Append or surgically edit them; never
  bulk-rewrite them.
- Singleton `GOAL.md` and `STATE.md` are frozen historical records. Do not
  overwrite, compact, delete, or rewrite their past contents. New Guided state
  belongs under `.harness/runs/<run-id>/`; Engine state belongs to its approved
  contract/manifest and run outputs.
