---
name: modify-object
description: Minimal-strength procedure for a small, clear edit to an existing ABAP object — read relevant rules, change only within scope via Update*, machine-verify, and stop at PROVISIONAL_WRITE with zero project footprint
source:
  - skills/direct/SKILL.md (aegis v0.21.0 @ 33f61df, D-047)
  - skills/loop/SKILL.md (aegis v0.21.0 @ 33f61df, D-047)
---

# Modify Object

The Minimal-strength operating procedure of the
[development loop](../policies/development-loop.md): a small, clearly-bounded
change to an object that **already exists**, verified in the current session. It
is the SAP adaptation of aegis Direct.

## Use When

- A small edit to an existing ABAP object — a bug fix, one field added to a
  structure, a method body changed — where the change is a clear single unit.
- The object already exists (confirmed via `SearchObject` / `GetObjectInfo`); the
  work is an `Update*`, not a create.
- Success can be objectively verified in the current session.

## Do Not Use When

- A **new** object must be created — use [create-object](./create-object.md), or
  [create-program](./create-program.md) for a program with its include set.
- Requirements are **multi-dimensional or ambiguous** (object scope, package,
  pattern, integration all unsettled) — run [deep-interview](./deep-interview.md)
  first.
- The edit turns out to require creating a new object mid-way — stop and propose
  escalation (see step ②).

## Track A Policy Alignment (attended-only)

This procedure is a Track A mutation path (see `AGENTS.md`). Apply the Policy, not
a one-shot auto-run:

- **Apply is P3 and attended.** `Update*` / `ActivateObjects` run only with a
  present human operator. There is no unattended completion (`unattended` is
  sealed — D-025 §7).
- **MCP success is `PROVISIONAL_WRITE`, not done.** An empty `GetInactiveObjects`
  result proves the object links; it is not a completion stamp.
- **COMPLETE requires a handoff to a Guided run** recording an exact-subject
  review `R-PASS` and a vsp-backed `V-PASS`. Absent both, the state is
  `PROVISIONAL_WRITE`, never "done".

## Procedure

① **Read the relevant rules.** If `.sc4sap/RULES.md` exists, read only the rules
   relevant to this change (if absent, continue silently). Also read the target
   object type's existing Mandatory Rule Reads — the field-typing, naming, and
   function-module rules that [create-object](./create-object.md) lists for that
   type apply to an edit just as they do to a create.

② **Implement only within the requested scope**, using the matching `Update*`
   tool (`UpdateClass`, `UpdateProgram`, `UpdateInclude`, `UpdateFunctionModule`,
   `UpdateStructure`, …). **If the change turns out to need a new object, it has
   left this procedure** — stop and propose escalating to
   [create-object](./create-object.md) or [create-program](./create-program.md);
   do not create the object here.

③ **Machine-verify.** Run `CheckSyntax` → `ActivateObjects`, then unit tests /
   ATC where applicable, and confirm `GetInactiveObjects` is empty for the touched
   objects. **Never claim completion without verification** (see
   [sap-standards](../policies/sap-standards.md) §3).

④ **Report the evidence** — the commands run and their results — not a bare
   "done".

⑤ **State cap is `PROVISIONAL_WRITE`.** Per the Track A model, an MCP success is
   not completion; do not report "done" without a `V-PASS` (see the alignment note
   above).

⑥ **Bounded repair.** Repair → re-verify in **≤ 2 rounds**; if a third round
   would be needed, stop and report the unresolved problem. **Note:** this bound
   is not aegis Direct's original — aegis Direct is unbounded. It is a sapkit
   adaptation borrowed from aegis Guided, to stop repeated SAP writes from
   wandering indefinitely.

⑦ **Zero project footprint.** Do not create run or state files; this is a
   procedural constraint, not a mechanical one. Durable run evidence belongs to
   the Full strength ([create-program](./create-program.md)), not here.
