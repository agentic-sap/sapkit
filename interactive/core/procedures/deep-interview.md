---
name: deep-interview
description: A step-by-step deep interview that pins down unclear SAP requirements before build work. Use when scope, business rules, or data sources are still unsettled ahead of create-program or other build/spec procedures — questions arrive in small bundles, every one of them gets asked, and the run produces a confirmed requirements brief that the downstream run consumes.
source:
  - sc4sap-custom/skills/deep-interview/SKILL.md
---

# Deep Interview

Run a staged interview so that SAP development requirements harden before any code is written. What it buys back is the execution cycles otherwise burned on an underspecified ABAP task.

## Purpose

Aim each question at something the SAP requirement still leaves open. The stage ends
only when every dimension below has been closed by the user's own confirmation **and**
the dig-out has run — and only then does the interview write the requirements brief
and offer to move on to a build procedure (`create-program` / `create-object`).

## When to Use

- The requirement is still vague — no object names, no package, no transport, no system details
- The user says "deep interview", "ask me questions", "help me spec this", or "I'm not sure what I need"
- The task lands in a complex SAP scenario (RAP, BAdI, enhancement framework) where a wrong assumption is expensive
- The user does not know the SAP object types well enough to choose the right approach unaided

## When NOT to Use

- The requirements are already concrete (a specific class name, method signature, package) — go straight to `create-object`
- The user has a full program spec and wants it executed now — use `create-program`
- The task is a one-line fix — skip the interview entirely

## Knowledge Preflight (runs before the first question)

Read `.sapkit/knowledge/domain.md` and `.sapkit/knowledge/system.md` if they exist.
Absent directory → continue silently. See [knowledge](knowledge.md).

- A **`KD-` atom** is established context — restate it citing the id instead of
  re-asking, and spend the interview on what it does not cover.
- A **`KS-` atom** counts as established only when its `scope:` matches this run's
  profile/SID/client. A non-matching one is a hint to confirm, not a fact.
- Anything under **`## Pending`** has no evidence behind it — ask it as a normal
  question. Never treat a pending line as settled.
- If the user **contradicts** a recorded atom: a `KD-` business rule is theirs to
  overrule, so take the correction; a `KS-` system fact opens a correction
  candidate to check against the system. Either way route it to
  [knowledge](knowledge.md) `Correct` — never silently overwrite, and never let
  the contradiction pass unrecorded.

If `config.json` registers `referenceLibraries` vaults, keyword-match the topic
against them too (2–3 docs per vault max — mechanics in
[ask-consultant](ask-consultant.md) § Reference Libraries): the user's own
distilled practices shape which options you offer and which defaults you
propose. Cite `참조: {name}/{file}` when a vault doc shapes a question or a
proposed answer.

This is the point of accumulating: a second interview on the same system should be
shorter than the first.

## SAP Interview Dimensions

Work these dimensions until every one of them is resolved. **All six are covered —
none is skipped**, whatever you already believe the answer to be.

**How they are asked.** Related dimensions travel together, two to four of them in
one message, each carrying what the choice means, the recommended answer first, and
one line of why. Bundle size, the option limits, the open slot on a business
question, and the line saying where the user is are all set by the
[plain-language policy](../policies/plain-language.md) — follow it there rather than
setting a second cadence here.

- **A dimension something already answers** — an imported design document, a
  specification the user pasted, a recorded `KD-`/`KS-` atom — is neither re-asked
  nor quietly dropped. Restate it with where it came from and let the user correct
  it, **inside the same bundle** as the open dimensions. It is a confirmation, not
  an extra question.
- **"Just decide for me"** applies to the bundle on screen: fill its remaining
  dimensions with the recommended answers, show them, and confirm that bundle once.
  It does not settle the dimensions still to come.

**Object scope**: Which ABAP objects does this need? (class, interface, program, function module, BAdI implementation, CDS view, RAP business object)

**Package and transport**: Which development package? A new transport or an existing one? Which system landscape (DEV → QAS → PRD)?

**Technical pattern**: An OO class hierarchy? Procedural? RAP/OData? An enhancement spot/BAdI? Which release (ECC vs S/4HANA)?

**Integration points**: Which SAP modules does it touch? (FI, MM, SD, HCM, etc.) Are any BAPIs, RFCs, or IDocs in play?

**Data model**: Which tables get read and written? Custom Z-tables or standard SAP tables? Which authorization objects does it need?

**Testing requirements**: Are unit tests wanted? In which test classes? What test data strategy?

## The Dig-Out — after the dimensions close, before the brief

Once every dimension above is closed, run the full
[interview-sweep](interview-sweep.md) stage — after the dimensions, **before the
brief is written**. The dimensions close what this procedure knew to ask; the
dig-out closes what this particular requirement turns out to need, which is where
the decisions live that otherwise get made silently by whoever writes the code.

That file owns the stage: the map, the blanks, how they are asked, and where the
answers are recorded. It is not optional, and a document the user brought in does
not cancel it.

## When this stage is over

Both of these hold, or the stage is not over:

1. Every dimension above has been closed **by the user** — by an answer, or by
   confirming a restatement. A dimension you closed on your own is not closed.
2. The dig-out has reached its own stopping criterion
   ([interview-sweep](interview-sweep.md) § Stopping criterion).

Turn count, elapsed time, and the user's impatience move neither condition. The
brief is not written until both hold.

## Output

Once both conditions above hold:

1. Write the brief to `.sapkit/deep-interviews/sap-{timestamp}.md`.
2. **Open it with the human-readable front matter** that
   [interview-sweep](interview-sweep.md) defines at its end — at a glance · what was
   decided and why · business rules and exceptions · acceptance criteria — in that
   order, before any object list, package, or transport strategy appears. What each
   part holds is set there and is not restated here.
3. **Carry the dig-out record in the same brief**, under the fixed section marker
   and with the four fields per entry that [interview-sweep](interview-sweep.md)
   § Step ④ sets out. The front matter does not stand in for it: the front matter
   says *what was decided*, the marked section says *what was asked, what was
   answered, whether the answer taken was the one recommended, and where it came
   from*. A brief carrying no dig-out section is a brief that went out early.
4. The technical body follows underneath: object list, package, transport strategy, technical pattern, integration points, test requirements
5. **Write the brief in the language the user has been talking in**, in plain words —
   the front matter above all, since a business reader has to be able to read it on
   its own. The section marker is the one thing that stays exactly as
   [interview-sweep](interview-sweep.md) writes it.
6. Offer: "Spec ready. Proceed with `create-program` (full program) or `create-object` (single object)?"
7. If the interview established a business or system fact — a company-specific rule, a non-obvious status meaning, a legacy table's real grain — grep the two knowledge files for its key terms first, and only if it is **not** already recorded offer one line: *"Record `<fact>` to project knowledge? (yes/no)"*. On `yes`, follow [knowledge](knowledge.md). Nothing newly established, or already recorded → no prompt.

The brief is standing input, not a one-shot handoff: a later `create-program` run reads `.sapkit/deep-interviews/` at its [Intake Resolution](create-program.md#intake-resolution--spec-entry-forms) step (right after Phase 0) and closes every dimension this brief already answers by confirmation restatement instead of re-asking — only the deficit dimensions get interviewed. A follow-on `create-object` run consumes the brief the same way, as the input to its freeze step.

## Related Procedures

- [interview-sweep](interview-sweep.md) — the dig-out stage this procedure runs once its dimensions close, and the definition of the brief's front matter and record section
- [ask-consultant](ask-consultant.md) — when the question is operational Q&A rather than build-requirement clarification
- [program-to-spec](program-to-spec.md) — the reverse direction: existing program → spec
