## Track A Routing

Assign each action one **execution structure** and one orthogonal **SAP Policy
profile**; split mixed actions. Source:
`docs/reference/designs/2026-07-15-track-a-rebase-v2.md` §§3-8 and D-025, as
amended by D-040 (ENGINE template-only).

### Execution structure

Apply this order. File, step, and verification counts never affect routing.

- **Engine attended** — **template-only per D-040 (2026-07-20): not a currently
  supported execution structure.** The wrapper `scripts/run-track-a.ps1`
  fail-closes (exit 65) by design and has no support owner; contract,
  checklist, and review-schema assets are preserved as templates. Raw
  `scripts/execute.py` invocation remains prohibited. Reopening requires a real
  demand trigger (repeated batches, bounded-retry loops) plus a new D-decision.
  Route all current work to Guided or Direct.
- **Guided** — only for explicit elevation or durable evidence: SAP-code
  completion, closing Direct-P3, pause/resume, or explicit fresh review.
  Goal/state/review stay under `.harness/runs/<run-id>/` only.
- **Direct** — the default for other current-session questions, code, docs/meta
  maintenance, and local checks. Already-decided multi-file or multi-step docs
  remain Direct. Ask only for missing scope/authority; never escalate by weight.

Direct creates no harness run artifacts. No new mode writes the frozen singleton
`.harness/GOAL.md` or `.harness/STATE.md`. `unattended=sealed` and is not a
routing option.

### SAP Policy profile

Choose the highest effect: **P4 > P3 > P2 > P1 > P0**.

- **P0 offline** — local/repo work; no SAP connection.
- **P1 connected-read** — metadata/source/ATC/health; no row data or mutation.
- **P2 real-data extraction** — before each `GetTableContents`, `GetSqlQuery`,
  or vsp `query`, show scope, fields, and row cap; get human approval. No
  batch, subagent, or auto-approval. **Owner-machine exception (D-043)**: on
  the owner's machines the per-call approval step is replaced by the server-side
  table-blocklist floor (`MCP_ALLOW_TABLE` opt-ins per profile); distribution
  defaults stay locked, and subagent/batch prohibitions still apply.
- **P3 write/execute** — SAP state/code change or execution; DEV-only gates.
- **P4 transport** — package/request create, assignment, release, or import.
  Direct-P4 has no supported entry; follow v2 §4.2 ownership.

Tools are paths, not axes. Human Direct/Guided P3 may use Track B MCP, human vsp
CLI, or user-operated abapGit; Engine workers use vsp CLI only. Reviewers may
use P0/P1 but perform no transport operation, including reads.

Direct SAP code is `DRAFT`; Direct-P3 is `PROVISIONAL_WRITE`. Completion needs
a Guided-P3 exact-subject `R-PASS` plus vsp-backed `V-PASS`. Non-SAP documents
and metadata can still finish in Direct.

### Mode-independent constraints

Before substantive work in any structure, read `.harness/RULES.md`; matching
rules are hard constraints. Consult `docs/PRD.md`, `docs/ARCHITECTURE.md`, and
`docs/reference/DECISIONS.md` when relevant. Real-data, tier, and escort gates are Policy,
not modes.

Record exactly: `attended-only`, `unattended=sealed`,
`historical_rv4_classifier=open`, `sap_mutation_boundary=unverified` (scope:
reviewer + all attended children). Practice/escort does not close RV4. Details:
`adapters/vsp/SAFETY-PROFILES.md`; until its §11 migration, v2/D-025 controls.
