---
name: knowledge
description: Accumulate what this project had to find out — business-domain facts and this-system facts — as evidence-backed, citable atoms under .sapkit/knowledge/, so later interviews stop re-asking what is already known
---

# Knowledge — what this project had to find out

`sapkit` ships generic SAP knowledge (module packs, industry, country). This
procedure holds the other half: the facts **this** project did not know and had to
establish. A business rule the customer explained in an interview, the real grain
of a legacy Z table, why a status code means something non-obvious here.

Record only what was **unknown and is now established**. If the shipped knowledge
already covers it, there is nothing to accumulate — say so and move on. Volume is
not the goal; the next interview not re-asking is.

## Files

    .sapkit/knowledge/domain.md   KD-ids — business facts (survive this program)
    .sapkit/knowledge/system.md   KS-ids — facts true only of a named system

One prefix per file, fixed, and **`KD`/`KS` deliberately avoid the bare-letter
space**: sapkit's own decision log uses `D-0xx` ids that appear throughout the
shipped core (`D-025`, `D-043`, `D-050`, …), so a knowledge atom numbered `D-007`
would collide with a real decision id inside the same product. An atom is cited
bare (`KD-007`), so a prefix shared with anything else makes every bare citation
ambiguous — and the ambiguity is not detectable after the fact.

Prefix separation does not prevent a duplicate number **inside** one file
(concurrent issue, hand editing). Before issuing an id, read the file's existing
ids rather than assuming the last one is the highest.

Both files are **local-only working state** under `.sapkit/**` — already covered by
the standard Read / Edit permission template, not shared across machines, and
`setup` does not overwrite them. See [project-context](../project-context.md).

## Routing — by record unit, not by incident

One incident can produce two records. *"Status `C` here means Credit Review, not
Closed — the batch treated it as Closed and dropped the orders"* is **both** a
system fact and a repeatable failure. Split it: the fact goes to `system.md`, the
failure and its guardrail go to [lesson](./lesson.md). Neither swallows the other.

| The record is… | Goes to |
|---|---|
| a business fact true beyond this program | `domain.md` (KD-id) |
| a fact true only of a named system/landscape | `system.md` (KS-id) |
| a **verified failure** and the rule that prevents its recurrence | [lesson](./lesson.md) → `.sapkit/RULES.md` |

`lesson` owns failure records — it has the VERIFY gate and the user-approval gate
that promotion requires. This procedure never records a failure; it records the
fact the failure exposed.

A generally-true SAP fact learned **without** any failure (a standard transaction's
behavior, a release's syntax rule) belongs to none of the three: it is not
project-specific, so accumulating it here only makes the project file noisier.
Note it as a candidate for the shipped `core/knowledge/` docs and move on.

## Add

1. **State it in one sentence.** If it needs two, it is two atoms. An atom that
   bundles facts cannot be cited — the citation would drag in the parts that do
   not apply.
2. **Check it is not already recorded.** Grep both files for the candidate's key
   terms before offering or writing (a bounded grep, not a full read). A re-offer
   of a known fact trains the user to dismiss the prompt unread.
3. **Attach evidence.** `table:field`, an MCP tool name and what it returned, a
   source coordinate (`ZPROG:340`), an SPRO path, or *"the user stated it in the
   Phase 1A interview"* — a named human source is valid evidence **for a business
   rule**. For a system fact, prefer machine evidence (DDIC, MCP read, ATC); a
   person's recollection of a system is a starting point, not proof.
4. **No evidence → do not record it as a fact.** If it is worth keeping anyway,
   put it under a `## Pending` heading at the end of the file with what would
   settle it. Pending entries get **no id** and are never cited — they are open
   questions, and the read points below re-ask them rather than assuming them.
5. **Scrub real data (MANDATORY).** Business facts attract live values. Replace
   them with a characterization (*"a domestic vendor with two tax codes"*), never
   the value. The categories are **whatever
   [data-protection](../policies/data-protection/) covers** — customer/vendor
   names, tax and registration numbers, addresses, personal names, account
   numbers, customer-specific pricing and discounts, payroll and HR values — and
   that list is examples, not a limit. Approval to *read* a row is not approval to
   *persist* it: row-level identifiers and sensitive values must not be stored
   here in original form regardless of how they were obtained, and `.sapkit/`
   being git-ignored does not change this (the file gets read aloud, pasted, and
   copied out).
6. **Issue the id.** Next unused number for that file's prefix. Header carries the
   date and a short tag (module code, `legacy`, `process`, …). A `KS-` atom
   additionally carries the **system it was established against** — profile alias
   and SID/client — because a project switches systems by switching
   `active-profile.txt`:

       ## KD-007 | 2026-07-31 | FI
       Period closing is reversible — a reopened period is a normal operating state, not an error.
       EVIDENCE: user, Phase 1A dimension 4 (2026-07-31); confirmed against T001B for company code <redacted>

       ## KS-003 | 2026-07-31 | legacy | scope: dev-main · S4D/100
       ZUNIVT_BSET is one row per tax line, not per document — document-level counts double-count.
       EVIDENCE: GetTableContents key inspection + ZUNIVR5120:212 aggregation

7. **Cross-link.** Reference related atoms, `R-ids`, and spec files by id. A
   one-way link is a dead end for the session that finds the other side first.

## Correct

An atom that turns out wrong is **not deleted**. What was believed, and why it was
wrong, is the material the next session needs — a deleted mistake gets made again.

1. Keep the original atom and its id.
2. Mark the heading: `## KD-007 | ~~superseded~~ → KD-012`.
3. Under it, add three lines: **what was wrong**, **why it looked right**, **what
   overturned it**. If the middle line is empty the correction is not finished —
   that line is the one that prevents the repeat.
4. Issue the new fact as a **new id** and link both ways.

Never edit an atom's claim in place. Widening a claim silently (`"holds for FI"` →
`"holds"`) is the failure this rule exists to stop.

**When the user contradicts an atom**: a `KD-` business rule is theirs to
overrule — take the correction. A `KS-` system fact is different: their
recollection may be older than the system. Open it as a correction candidate,
check it against DDIC/MCP, and correct on what the check shows. Either way the
atom is never silently overwritten.

## Claim no wider than the evidence

Write what the evidence supports and say what it does not. *"Holds for domestic
postings; cross-border untested"* is a usable atom. *"Holds"* — from the same
evidence — is a false one, and it is false in the direction that gets trusted.

## Read points

Accumulating without reading is just a folder. These procedures read
`.sapkit/knowledge/` **before** they start asking, and continue silently when the
directory is absent:

- [deep-interview](./deep-interview.md) — before the first question
- [create-program](./create-program.md) — Phase 1A preflight, next to industry/country
- [analyze-symptom](./analyze-symptom.md) — Step 1 triage (bounded grep for the
  symptom's terms; a matching `KS-` atom or rule short-circuits the hypothesis space)
- [ask-consultant](./ask-consultant.md) — Step 4, before answering (atoms are
  established context the consultant cites instead of re-deriving)
- the module-consultant personas list the files in `<Reference_Data>` (priority 0),
  so any procedure that adopts one inherits the read

Consumption rules, every reader:

- An atom with an id is **established context** — state it back citing the id
  instead of re-asking.
- A `KS-` atom counts as established only when its `scope:` matches the run's
  current profile/SID/client. A non-matching one is a hint to verify, not a fact.
- Everything under `## Pending` is an **open question** — ask it.

Other procedures read on request. The automatic reads sit where not-reading has
a measured cost: the interview family (re-asking costs the user) and the
diagnosis/consulting family (re-deriving a recorded failure mode costs more —
a 2026-08 field case re-diagnosed an authentication error whose verified cause
was already written as a rule). The full ranking across all layers is
[knowledge-sourcing](../policies/knowledge-sourcing.md). Note that
this cost is not fixed — it grows with the file. If a project's knowledge files
outgrow a comfortable read, add a header index and read selectively rather than
loading everything; no cap is imposed today because no project has hit one.

## Write points

Offer — do not assume — at the close of
[deep-interview](./deep-interview.md), [create-program](./create-program.md)
Phase 1B, [ask-consultant](./ask-consultant.md), and
[analyze-symptom](./analyze-symptom.md):

> *"New business/system fact worth keeping: <one line>. Record it? (yes/no)"*

One offer, one line, dismissible, and only after step 2's duplicate check. If
nothing was learned, say nothing — a prompt that fires on every run gets answered
"no" reflexively and stops being read.
