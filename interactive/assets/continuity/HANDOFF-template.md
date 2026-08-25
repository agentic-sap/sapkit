<!-- sapkit:continuity -->
<!-- Marker: sapkit recognises this file as one it set up, and keeps it up to date for you. Delete the line above and sapkit stops reading or writing this file. -->

# HANDOFF — <project name>

Where this project got to, so the next session can pick it up without you re-explaining
it. This is a snapshot, not a log: updating it means rewriting it in place.

**Keep it under 500 lines.** When it grows past that, move the settled parts out to
`archive/HANDOFF-YYYY-MM.md` under this project's root and leave only what is still live
here. Relocate the old records — never delete them.

> **Never write secrets in this file.** No SAP hostnames, system numbers, clients,
> usernames, passwords, tokens, or rows of table data. Name a connection by its profile
> **alias** only: the alias is just a name, and the values behind it stay in the profile,
> outside this project.

## Start here

<One paragraph. What is being built or fixed, what state it is in right now, and the one
thing a reader has to know before touching anything. Replace this paragraph when it goes
stale — do not append to it.>

## SAP work status

| Object | Status | Transport | Profile alias | Note |
|---|---|---|---|---|
| `ZCL_EXAMPLE` (CLAS) | `COMPLETE` | `<transport-id>` | `<alias>` | verified YYYY-MM-DD |
| `Z_EXAMPLE_REPORT` (PROG) | `PROVISIONAL_WRITE` | `<transport-id>` | `<alias>` | write returned OK; not confirmed yet |
| `ZEXAMPLE_TAB` (TABL) | `DRAFT` | — | `<alias>` | designed locally, nothing sent to SAP |

These three words mean specific things. Using them loosely is how a session ends up
believing work is finished when it is not.

- **`DRAFT`** — written or designed outside SAP. Nothing has been sent to the system.
- **`PROVISIONAL_WRITE`** — a write went to SAP and the tool answered success. That is
  all it means. The success response comes from the side that did the writing, so it is
  a claim, not evidence that SAP holds what was intended.
- **`COMPLETE`** — both halves are in:
  1. the **machine confirmation** of the `verify-applied` procedure — read the source
     back out of SAP, compare it against what was sent, then confirm syntax and active
     state; and
  2. an **independent fresh-context review** of the change.

  One half alone is still `PROVISIONAL_WRITE`. So is an activation call that reported
  ACTIVE, and so is an object that "obviously worked".

## Still open

- <What is unfinished, and what makes it unfinished. One line each.>
- <Blocked items: name the blocker, and what or who would clear it.>

## Next (1–3)

1. <The single next action — concrete enough to start without deciding anything first.>
2. <optional>
3. <optional>

Three at most. Anything queued beyond that belongs in `RUN-PLAN.md` beside this file.

## Environment notes

- **Active profile alias:** `<alias>` — tier `DEV` / `QA` / `PRD`. Writes only ever go to
  a `DEV` tier system.
- **SAP release / version in use:** `<as configured for this project>`
- **Local tools or paths this project depends on:** `<...>`
- **What a fresh session would otherwise get wrong:** `<...>`

Aliases and names only. If a value would identify or reach the system, it does not go
in this file.

## What does not belong here

- **Facts this project had to find out** — how a table really behaves, what a business
  rule actually is: those are `knowledge` atoms.
- **Failures worth guarding against next time:** those go through `lesson`.

This file records one thing only: **where we got to.**

---

Maintained by the `handoff` skill (`/sapkit:handoff` on Claude Code). This file and
`RUN-PLAN.md` beside it are yours — sapkit rewrites their contents when you ask it to,
and never deletes or resets them. Remove the marker comment on the first line and sapkit
leaves the file alone from then on.

_updated YYYY-MM-DD HH:MM_
