---
name: deep-interview
description: Socratic deep interview to crystallize SAP requirements before autonomous execution
source:
  - sc4sap-custom/skills/deep-interview/SKILL.md
---

# Deep Interview

Conduct a structured Socratic interview to crystallize SAP development requirements before any code is written. Prevents wasted execution cycles on underspecified ABAP tasks.

## Purpose

Ask targeted questions to resolve ambiguity in SAP requirements. Gate on a mathematical ambiguity threshold: only when requirements are sufficiently specified does the interview produce a validated spec file and offer to proceed to a build procedure (`create-program` / `create-object`).

## When to Use

- Requirement is vague (no object names, package, transport, or system details)
- User says "deep interview", "ask me questions", "help me spec this", or "I'm not sure what I need"
- Task involves complex SAP scenarios (RAP, BAdI, enhancement framework) where wrong assumptions are costly
- User is unfamiliar with SAP object types and needs guidance on the right approach

## When NOT to Use

- Requirements are concrete (specific class name, method signature, package) — proceed directly to `create-object`
- User wants immediate execution on a full program spec — use `create-program`
- Task is a one-line fix — skip interview entirely

## SAP Interview Dimensions

The interview covers these dimensions until each is resolved:

**Object scope**: What ABAP objects are needed? (class, interface, program, function module, BAdI implementation, CDS view, RAP business object)

**Package and transport**: Which development package? New transport or existing? Which system landscape (DEV → QAS → PRD)?

**Technical pattern**: OO class hierarchy? Procedural? RAP/OData? Enhancement spot/BAdI? Which release (ECC vs S/4HANA)?

**Integration points**: Which SAP modules does this touch? (FI, MM, SD, HCM, etc.) Any BAPIs, RFCs, or IDocs involved?

**Data model**: Which tables are read/written? Custom Z-tables or standard SAP tables? Authorization objects needed?

**Testing requirements**: Unit tests needed? Which test classes? Test data strategy?

## Ambiguity Gating

After each round of questions, score ambiguity 0–10:
- 8+: too vague, continue interview
- 5–7: borderline, ask 1–2 clarifying questions
- Below 5: sufficient, generate spec

Do not proceed to spec generation until score is below 5.

## Output

When the ambiguity threshold is met:
1. Write the validated spec to `.sc4sap/deep-interviews/sap-{timestamp}.md`
2. Spec includes: object list, package, transport strategy, technical pattern, integration points, test requirements
3. Offer: "Spec ready. Proceed with `create-program` (full program) or `create-object` (single object)?"

## Related Procedures

- [ask-consultant](ask-consultant.md) — for operational Q&A rather than build-requirement clarification
- [program-to-spec](program-to-spec.md) — reverse direction: existing program → spec
