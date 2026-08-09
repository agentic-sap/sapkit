---
name: verify-applied
description: Machine-confirm an object that was already applied to SAP — read its source back out of the system and compare it against what was sent, then confirm syntax and active state — and report the outcome in plain language. The entry point behind "확인해줘", "완료 확인", "반영됐는지 봐줘", "제대로 들어갔나", "verify this program", "did it really apply". A tool's success response is not evidence: an MCP `Create*`/`Update*` returning OK or `ActivateObjects` reporting ACTIVE leaves the object at PROVISIONAL_WRITE. This procedure supplies the machine half of completion; an independent fresh-context review supplies the other.
---

# Verify Applied — 반영 확인 (machine check)

Confirm, against SAP itself, that what was supposed to be applied is actually
there and healthy. This is a reading procedure: it never writes to SAP.

## Purpose

**The applying tool's own success response is not evidence that the change
landed.** An MCP `Create*`/`Update*` call returning OK, an `ActivateObjects`
response saying ACTIVE, or an empty `GetInactiveObjects` are all reports from
the side that did the writing — field use has produced cases where such a
response came back clean while the object in SAP did not hold what was
intended. So a write leaves the object at `PROVISIONAL_WRITE`, not done
(D-025 Track A state model — see `AGENTS.md` and the "Completion state"
sections of [create-program](create-program.md#phase-8--completion-report),
[create-object](create-object.md), [modify-object](modify-object.md)).

This procedure closes that gap the only way it can be closed: by asking SAP
what it actually has, rather than trusting what the writer said it did. It
covers the **machine** half of completion. The other half is an independent
exact-subject fresh-context review (`R-PASS`) — a different concern, and this
procedure never substitutes for it.

## Use When

- User says "확인해줘", "완료 확인", "반영됐는지 봐줘", "제대로 들어갔나",
  "verify this program/class", "did it really apply", "is this done".
- An object was created or modified this session (via MCP, human `vsp deploy`,
  or user-operated abapGit) and needs confirming before anything is reported
  as finished.
- Following up after [create-program](create-program.md) /
  [create-object](create-object.md) / [modify-object](modify-object.md) left an
  object at `PROVISIONAL_WRITE`.

## Do Not Use When

- Nothing has been applied to SAP yet — this procedure only reads back what
  already exists. Route to [create-object](create-object.md),
  [create-program](create-program.md), or [modify-object](modify-object.md)
  first.
- The user wants the independent review of whether the change is *right*
  (`R-PASS`) rather than confirmation that it *landed* — that is a Guided run /
  [review-checklist](review-checklist.md) concern.
- Real row or business data is needed — out of scope. This procedure never
  reads table contents.

## Policy

- **P1 connected-read throughout** (`AGENTS.md`). Source read-back, active-state
  lookup, and `CheckSyntax` inspect and compile but never mutate — no per-call
  approval is needed and an agent may run them for the user.
- **Zero writes to SAP.** There is no write step to add here. If a check reveals
  a problem, that is a finding to report — fixing it is a separate P3 action
  routed back through [modify-object](modify-object.md) or the originating
  procedure.
- **No row data.** `GetTableContents` / `GetSqlQuery` are not part of this
  procedure at any step.
- This procedure produces a report in the conversation, not a stored verdict
  artifact. Nothing here stamps an object as finished on its own.

## Procedure

① **Fix the target — never guess.** If the request names an object (TYPE +
   NAME, or a name whose type can be inferred), use it. Otherwise look for
   candidates, in order: the object created or modified earlier in this
   conversation; `.sapkit/program/{PROG}/state.json` and `review-request.json`
   (`objects[]`). Name what you are about to check and get an explicit
   confirmation before running — this makes a live SAP connection and takes
   real time. If several objects are in scope, check each of them; do not check
   one and generalize to the rest.

② **Read the source back out of SAP and compare it against what was sent.**
   This is the load-bearing step — it is what distinguishes confirmation from
   restating the writer's own claim.
   - Fetch the served source: `GetProgFullCode` (REPS, full source including
     includes) · `ReadClass` (CLAS) · `GetInclude` (includes) ·
     `ReadFunctionGroup` + `ReadFunctionModule` (FUGR) · `ReadInterface`
     (INTF) · `ReadView` (CDS).
   - Compare it against the intended source — the text this session sent, or a
     local copy (an abapGit-style checkout, a workspace folder the user names).
     `GetSourceDiff` does the comparison server-side when a reference version
     exists.
   - **State plainly what the comparison could and could not establish.** If no
     intended-source text is available to compare against — a session that only
     ever issued MCP calls without retaining what it sent has none — say so
     directly: the read-back then shows only that *something* is there, not
     that the *right* thing is. Do not let that case be reported as a clean
     confirmation, and offer the user the option of pointing at a source folder.

③ **Confirm syntax and active state.** `CheckSyntax` on the object (for a
   multi-include program, on the MAIN program) confirms the served source
   actually compiles. `GetInactiveObjects` must return no entries for the
   object set — an inactive remnant means the change is not live for anyone
   else, whatever the activation call reported.

④ **Report the result in plain language, localized to the user's conversation
   language.** For each object:
   - What SAP holds right now: whether the read-back matched, did not match, or
     could not be compared; whether it compiles; whether anything is left
     inactive.
   - One line per check — what it looked at and what came back. No raw dumps.
   - On any mismatch or failure, name it in ordinary terms and give the
     concrete next action: not applied at all · applied but different from what
     was intended · applied but inactive · applied but does not compile ·
     could not be reached (connection or lock — retry later, not a code defect).
   - **Say what this did not establish**, in a line or two: these checks confirm
     that the intended source is present, compiles, and is active — they say
     nothing about whether the logic is correct, complete, or safe for the
     business case, and they are a point-in-time reading rather than a standing
     guarantee.

⑤ **A clean machine check is not completion.** Close by stating what is still
   outstanding: completion additionally requires the independent exact-subject
   fresh-context review (`R-PASS`). Report the object's state exactly — a clean
   result here plus a passing review is what makes it `COMPLETE`; a clean result
   alone leaves it `PROVISIONAL_WRITE`. Never report "완료 / done" on the
   strength of this procedure by itself.

## MCP Tools Used

`GetProgFullCode` / `ReadClass` / `GetInclude` / `ReadFunctionGroup` +
`ReadFunctionModule` / `ReadInterface` / `ReadView` (source read-back per object
type) · `GetSourceDiff` (server-side comparison when a reference version exists)
· `CheckSyntax` (the served source compiles) · `GetInactiveObjects` (nothing
left inactive) · `GetObjectInfo` (existence and metadata, when the target needs
resolving).
