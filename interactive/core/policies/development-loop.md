---
name: development-loop
description: The one work loop and its three procedure-intensity strengths (Minimal/Standard/Full), the execution_owner ownership boundaries with SAP-policy limits, and the per-capability assurance grades that apply to them
source:
  - skills/using-aegis/SKILL.md (aegis v0.21.0 @ 33f61df, D-047)
  - skills/loop/SKILL.md (aegis v0.21.0 @ 33f61df, D-047)
  - README.md (aegis v0.21.0 @ 33f61df, D-047)
---

# Development Loop

One work loop underlies every sapkit development procedure. This policy states
its invariants: the loop shape, the three procedure-intensity strengths and how
to pick one, the `execution_owner` ownership boundaries, and the assurance grade
each of those carries. It governs *how much procedure* to apply — it does not
decide the Track A execution structure or the SAP Policy profile (see "Orthogonal
to Track A" below).

## The one loop

Every strength runs the same loop, differing only in how much of it is written
down:

> intent → contract → implement → verify → independent review → repair →
> re-verify → judgment → lesson capture.

- **Verify** is objective machine evidence (`CheckSyntax` → `ActivateObjects` →
  unit / ATC where applicable), never a claim. No completion is reported without
  it.
- **Independent review** runs in a fresh context separate from the implementer;
  the implementer of a change can never review its own change.
- **Repair / re-verify is bounded: an initial review plus ≤ 2 repair/reverify
  rounds** — the same bound across every strength. If a third round would be
  needed, stop, preserve the evidence, and report the unresolved problems; never
  silently abandon the work or claim completion.
- **Judgment** records the honest state, and **lesson capture** is proposed, not
  automatic (see [lesson](../procedures/lesson.md)). Lesson capture is an opt-in,
  user-approval-gated procedure of its own, so it does not conflict with Minimal's
  zero-footprint constraint — only an approved lesson is ever written to
  `.sc4sap/LESSONS.md` / `.sc4sap/RULES.md`, and nothing is recorded without that
  approval.

## Strengths — procedure intensity

| Strength | sapkit procedure | Work artifacts | Borrowed from |
|---|---|---|---|
| **Minimal** | [modify-object](../procedures/modify-object.md) — a small edit to an existing object, a clear single change | none (zero project footprint) | aegis direct |
| **Standard** | [create-object](../procedures/create-object.md) | Step outputs (not durable state) | — (existing) |
| **Full** | [create-program](../procedures/create-program.md) | `.sc4sap/program/{PROG}/` artifact set | — (existing) |

**Selection rule — the lightest strength that covers the material risk.** The
task label ("bug", "new report") does not choose the strength. Judge by
ambiguity, blast radius and reversibility, external side effects, whether
pause/resume is likely, and whether several workstreams must be integrated. When
any of those becomes material during the work, **propose** the next strength up
(or the full `create-program` pipeline) and wait for acceptance before switching —
never escalate silently, never escalate on weight alone.

## Orthogonal to Track A

The strengths are a **procedure-intensity** axis only. They do **not** assign or
change the Track A execution structure (Direct / Guided) or the SAP Policy
profile (P0–P4); every action is routed by `AGENTS.md` independently, and file,
step, and verification counts never affect that routing. `.sc4sap/**` outputs are
working material, **not** Track A completion evidence: they do not substitute for
a Guided run's `.harness/runs/` records, an exact-subject review `R-PASS`, or a
vsp-backed `V-PASS`.

## execution_owner

Strength and implementation ownership are separate choices. Any strength may set
`execution_owner = auto | main | delegated`:

- **`main`** — the current conversation implements.
- **`delegated`** — a fresh worker context implements while the main conversation
  coordinates, allocates review, and performs or observes verification.
- **`auto`** (default) — keep small, localized, low-output work in `main`;
  delegate when repository discovery, many relevant files, or verbose output
  would materially consume the main context.

Honor an explicit owner without asking again. Ask one bounded ownership question
only when the choice is materially ambiguous and consequential.

### Ownership boundaries

- An implementation worker can **never** be the independent reviewer of its own
  changes. The main context allocates every worker and reviewer; a worker is not
  expected to spawn nested reviewers.
- A worker receives only the contract, its task slice, the relevant project
  instructions / paths / relevant RULES, and the verification expectations — not
  the full conversation or history.
- **Secrets are never passed to a worker** (credentials, `sap.env`).
- A worker returns a **compact result only** — changed paths, decisions, commands
  and their results, blockers — not its raw transcript or logs.
- The main context checks the final diff boundary and runs or directly observes
  the final verification.
- **Control artifacts are main-only:** `approval.json`, `state.json`,
  `verification.json`, `review-request.json`, `review-result.json`, the spec
  approval record, and `.sc4sap/RULES.md` / `.sc4sap/LESSONS.md`. A worker touches
  only the implementation paths the contract assigns.

### SAP Policy boundary

`execution_owner` is a sapkit-specific overlay on the aegis rules above; these
limits have no aegis analogue:

- It applies **only to the implementation slice after Track A routing and P0–P4
  classification are settled**. Delegation never changes a policy classification.
- **P2 (real-data extraction) is always main-only.** The subagent/batch
  prohibition holds even under the D-043 owner-machine exception (`AGENTS.md` P2).
- **P4 (transport) is never delegable** — the existing human-only ownership gate
  stands. When delegating a Phase 4 implementation, split off mixed transport
  create / assign / release actions and keep them main-owned.
- A **delegated P3** inherits the attended requirement, the DEV-tier gate, and the
  `PROVISIONAL_WRITE` cap unchanged.

### Harness-neutral fallback

Delegation is conditioned on the environment supporting a fresh worker or
subagent. Where it does not, `auto` safely falls back to `main`. An explicit
`delegated` request is never silently ignored — explain the limitation and ask
for direction.

## Assurance grades

Assurance is graded per capability, never claimed in bulk:

| Grade | Meaning |
|---|---|
| **Procedural** | Model instruction — the model may skip or misapply it |
| **Auditable** | Model-authored record — inspectable after the fact, but not proof the step occurred or that its judgment is true |
| **Mechanically enforced** | External code blocks the transition or performs bounded retry |

| Capability | Grade |
|---|---|
| Strength selection · RULES consult · the whole Minimal loop | **Procedural** |
| Full's state / approval / verification / review files · LESSONS / RULES files | **Auditable** |
| Claude-adapter reviewer tool-block · PreToolUse hooks · server blocklist | **Mechanically enforced — that adapter / server only** |

Absorbing this methodology does not raise assurance: most of it is
**procedural**. Auditability exists only for the capabilities that leave a file,
and mechanical enforcement only in the existing adapter / server layers. The
honesty note in [approval-gates](./approval-gates.md) and the reviewer contract in
[review-checklist](../procedures/review-checklist.md) say the same for the gates
and the review; this policy adds no new enforcement.
