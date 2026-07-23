---
name: lesson
description: Turn a verified, likely-to-recur SAP failure into a consulted guardrail — a five-step LESSONS→RULES loop (plus a Demote mode) writing .sc4sap/LESSONS.md and .sc4sap/RULES.md, never auto-promoting an ordinary failure
source:
  - skills/lesson/SKILL.md (aegis v0.21.0 @ 33f61df, D-047)
---

# Lesson — LESSONS → RULES

Turn a failure into a guardrail. Five steps, in order. Never skip VERIFY — an
unverified guess must not become a rule.

Do not start this loop merely because a test or an activation failed during
ordinary work. Most failures are local execution feedback. Persist only a
user-selected failure whose **verified** cause is **likely to recur**. This is the
LESSONS→RULES piece of the project's methodology goal (a standing goal in the
project DESIGN.md §2); it is opt-in and adds zero install cost — procedures that
CONSULT rules simply continue silently when the files are absent.

## Files

- `.sc4sap/LESSONS.md` — the append-only failure log (L-ids).
- `.sc4sap/RULES.md` — the distilled prohibitions (R-ids), capped at 40.

Both are **local-only working state**: not shared across machines, and `setup`
does not overwrite them. They live under `.sc4sap/**`, already covered by the
standard Read / Edit permission template — no new permission is needed. See
[project-context](../project-context.md).

## 1. FAIL — record it

Append to `.sc4sap/LESSONS.md` with the next sequential L-id. The third header
field is a short SAP area tag (`abap`, `cds`, `transport`, `mcp`, `atc`,
`module-FI`, …):

    ## L-014 | 2026-07-23 | transport
    FAIL: <what was attempted, what happened, exact error/symptom>

Quote the real error text verbatim — a paraphrase hides the signal you will need
later (a dump ID, an ATC message text, a `sy-subrc` value).

## 2. INVESTIGATE — find the root cause

Find the actual cause, not the nearest symptom. Add to the same entry:

    CAUSE: <root cause>

## 3. VERIFY — confirm the cause

Prove it: reproduce the failure through the cause, or show that fixing exactly
this cause removes it. Edit the CAUSE line to carry the proof (do not add a second
CAUSE line):

    CAUSE: <root cause> (verified: <how>)

If you cannot verify the cause, finish the entry with `RULE: unverified` and stop.
The lesson is still recorded; it just cannot become a rule yet.

## 4. RULE — distill

Ask: would this bite again in a different task? **Propose the rule to the user and
get explicit approval before writing it.** A rule is read by the CONSULT step of
every later related task, so a bad rule silently misguides future work, not just
the current one — that approval is the gate that keeps a wrong rule out. If
approved, add ONE line to `.sc4sap/RULES.md` with the next sequential R-id:

    - R-009 [transport] <short imperative rule> (from L-014)

Keep truly universal invariants short and unscoped. Narrow a rule with any
combination of scope metadata (all declared dimensions must be relevant):

    - R-010 [cds] [path:src/**] [action:activate] [domain:module-FI] do not ... (from L-015)

**Scope is a filter hint, not a mechanical matcher.** sapkit has no engine that
matches paths or actions to inject a rule automatically; the
`[path:] [action:] [domain:]` dimensions exist so the CONSULT step can read them
and judge which rules are relevant to the task at hand. Do not use scope to hide a
globally important safety invariant behind a narrow label.

Word the rule as a **negative constraint** tied to the failure ("do not X — it
causes Y"), never as positive style guidance ("always write clean X").
Prohibitions steer sessions; aspirational wording does not, and it dilutes the
list. **Style, persona, and tone are never RULES material** — route them to the
project knowledge docs; RULES holds verified prohibitions and invariants only.

**Before proposing, read the FULL `.sc4sap/RULES.md`** for semantic conflicts and
near-duplicates. Nothing mechanical detects a semantic contradiction. If the new
rule contradicts an existing one, present the conflict to the user with a merge or
revision proposal instead of adding a second rule. If an existing rule overlaps,
merge into it and append the new lesson id rather than adding a near-duplicate.
`RULES.md` is capped at **40 rules**; at the cap, merge overlapping rules or delete
the least load-bearing one, noting the demotion in its source lesson.

Then finish the lesson entry with `RULE: -> R-009`, or
`RULE: not generalizable: <why>` if it would not recur.

## 5. CONSULT — close the loop

Nothing to write now: the next task's CONSULT step reads `.sc4sap/RULES.md`, which
is how this failure becomes a guardrail. The CONSULT points are the start of
[create-program](./create-program.md) (Phase 2), the Mandatory Rule Reads of
[create-object](./create-object.md), and step ① of
[modify-object](./modify-object.md); each continues silently when the file is
absent. If the current task continues, re-read the new rule before retrying.

## Demote mode — wrong or stale rules

Promotion has the five-step gate above; demotion deserves the same rigor in
reverse. A rule is consulted at the start of every related task, so a rule
contradicted by new evidence is not a stale suggestion — it actively misguides
sessions until it is fixed. Nothing mechanical detects a wrong rule, so this is
the owned workflow that closes the loop.

Trigger this mode when:

- the user or a reviewer overrides a rule ("this rule is wrong here"),
- a rule blocks correct work in two unrelated tasks, or
- an audit surfaces stale-rule candidates, or the 40-rule cap is reached.

1. **EVIDENCE** — record the contradiction in `.sc4sap/LESSONS.md` as a normal
   entry (next L-id) citing the rule id: what the rule prescribed, what actually
   happened, and why the rule is wrong or no longer applies.
2. **VERIFY** — confirm it the same way causes are verified: reproduce a case
   where following the rule produces the wrong result, or show the failure it was
   distilled from can no longer occur (table replaced, API changed, …). Unverified
   suspicion does not demote a rule — finish the entry with
   `RULE: kept (unverified contradiction)` and stop.
3. **PROPOSE** — with explicit user approval (the same gate as promotion): revise
   the rule's wording, narrow its scope, or delete it. Note the demotion in the
   rule's source lesson (`RULE: R-009 demoted -> L-021`) so the history survives,
   and finish the new entry with what was done.
