---
name: deep-interview
description: Socratic deep interview to crystallize ambiguous SAP requirements before build work. Use when scope, business rules, or data sources are still unsettled ahead of create-program or other build/spec procedures — staged questions narrow options and produce an approved requirements brief that the downstream run consumes.
source:
  - sc4sap-custom/skills/deep-interview/SKILL.md
---

# Deep Interview

Run a staged Socratic interview so that SAP development requirements harden before any code is written. What it buys back is the execution cycles otherwise burned on an underspecified ABAP task.

## Purpose

Aim each question at a specific piece of ambiguity in the SAP requirement. A scored ambiguity threshold gates the exit: only once the requirements are specified enough does the interview write a validated spec file and offer to move on to a build procedure (`create-program` / `create-object`).

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

Work these dimensions until every one of them is resolved:

**Object scope**: Which ABAP objects does this need? (class, interface, program, function module, BAdI implementation, CDS view, RAP business object)

**Package and transport**: Which development package? A new transport or an existing one? Which system landscape (DEV → QAS → PRD)?

**Technical pattern**: An OO class hierarchy? Procedural? RAP/OData? An enhancement spot/BAdI? Which release (ECC vs S/4HANA)?

**Integration points**: Which SAP modules does it touch? (FI, MM, SD, HCM, etc.) Are any BAPIs, RFCs, or IDocs in play?

**Data model**: Which tables get read and written? Custom Z-tables or standard SAP tables? Which authorization objects does it need?

**Testing requirements**: Are unit tests wanted? In which test classes? What test data strategy?

## Ambiguity Gating

Close each round of questions by scoring the remaining ambiguity 0–10:
- 8+: still too vague, keep interviewing
- 5–7: borderline, ask 1–2 clarifying questions
- Below 5: specified enough, generate the spec

Do not move on to spec generation until the score is below 5.

## Output

Once the ambiguity threshold is met:
1. Write the validated spec to `.sapkit/deep-interviews/sap-{timestamp}.md`
2. The spec carries: object list, package, transport strategy, technical pattern, integration points, test requirements
3. Offer: "Spec ready. Proceed with `create-program` (full program) or `create-object` (single object)?"
4. If the interview established a business or system fact — a company-specific rule, a non-obvious status meaning, a legacy table's real grain — grep the two knowledge files for its key terms first, and only if it is **not** already recorded offer one line: *"Record `<fact>` to project knowledge? (yes/no)"*. On `yes`, follow [knowledge](knowledge.md). Nothing newly established, or already recorded → no prompt.

The brief is standing input, not a one-shot handoff: a later `create-program` run reads `.sapkit/deep-interviews/` at its [Intake Resolution](create-program.md#intake-resolution--spec-entry-forms) step (right after Phase 0) and closes every dimension this brief already answers by confirmation restatement instead of re-asking — only the deficit dimensions get interviewed. A follow-on `create-object` run consumes the brief the same way, as the input to its freeze step.

## Related Procedures

- [ask-consultant](ask-consultant.md) — when the question is operational Q&A rather than build-requirement clarification
- [program-to-spec](program-to-spec.md) — the reverse direction: existing program → spec
