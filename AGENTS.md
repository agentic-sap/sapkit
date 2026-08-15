## Track A Routing

Assign each action one **execution structure** and one orthogonal **SAP Policy
profile**; split mixed actions. Source:
`docs/reference/designs/2026-07-15-track-a-rebase-v2.md` §§3-8 and D-025, as
amended by D-040 (ENGINE template-only) and R1 (engine apparatus removed).

### Execution structure

Apply this order. File, step, and verification counts never affect routing.

- **Guided** — only for explicit elevation or durable evidence: SAP-code
  completion, closing Direct-P3, pause/resume, or explicit fresh review. Its
  goal, state, and review evidence stay within that one run's own scope.
- **Direct** — the default for other current-session questions, code, docs/meta
  maintenance, and local checks. Already-decided multi-file or multi-step docs
  remain Direct. Ask only for missing scope/authority; never escalate by weight.

Direct creates no run artifacts. `unattended=sealed` and is not a routing
option. The **engine-attended** structure was already template-only under D-040
and its execution apparatus was removed from this repo in R1; reopening it
requires a real demand trigger (repeated batches, bounded-retry loops) plus a
new D-decision.

### SAP Policy profile

Choose the highest effect: **P4 > P3 > P2 > P1 > P0**.

- **P0 offline** — local/repo work; no SAP connection.
- **P1 connected-read** — metadata/source/ATC/health; no row data or mutation.
- **P2 real-data extraction** — before each `GetTableContents`, `GetSqlQuery`,
  or **any other route that pulls SAP row data** (a local CLI, a script, a
  direct query), show scope, fields, and row cap; get human approval. The rule
  binds the act, not a tool name — retiring a tool never narrows it. No
  batch, subagent, or auto-approval. **Owner-machine exception (D-043)**: on
  the owner's machines the per-call approval step is replaced by the server-side
  table-blocklist floor (`MCP_ALLOW_TABLE` opt-ins per profile); distribution
  defaults stay locked, and subagent/batch prohibitions still apply.
- **P3 write/execute** — SAP state/code change or execution; DEV-only gates.
- **P4 transport** — package/request create, assignment, release, or import.
  Direct-P4 has no supported entry; follow v2 §4.2 ownership.

Tools are paths, not axes. Human Direct/Guided P3 may use Track B MCP, a
human-operated CLI, or user-operated abapGit; whichever path applies the change,
the profile and its gates are the same. Reviewers may use P0/P1 but perform no
transport operation, including reads.

Direct SAP code is `DRAFT`; Direct-P3 is `PROVISIONAL_WRITE`. `COMPLETE` needs
both halves: the **machine confirmation** of
`interactive/core/procedures/verify-applied.md` (read the source back out of SAP
and compare it against what was sent, then confirm syntax and active state) plus
an **independent fresh-context review** — a Guided-P3 exact-subject `R-PASS`. A
tool's success response is neither half. Non-SAP documents and metadata can
still finish in Direct.

### Mode-independent constraints

Before substantive work in any structure, read the **safety rules in
`CLAUDE.md`**; matching rules are hard constraints. Consult `docs/PRD.md`,
`docs/ARCHITECTURE.md`, and `docs/reference/DECISIONS.md` when relevant.
Real-data, tier, and escort gates are Policy, not modes.

Record exactly: `attended-only`, `unattended=sealed`,
`historical_rv4_classifier=open`, `sap_mutation_boundary=unverified` (scope:
reviewer + all attended children). Practice/escort does not close RV4. These
four values and the RV1~RV4 classification behind them are defined by the two
sources this section already cites — `docs/reference/designs/2026-07-15-track-a-rebase-v2.md`
(§6 and its state block) and D-025 in `docs/reference/DECISIONS.md` — and those
control directly. Only new evidence recorded there can move a value; no
downstream profile document may restate or relax them.
