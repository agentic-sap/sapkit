<!-- sapkit:continuity -->
<!-- Marker: sapkit recognises this file as one it set up, and keeps it up to date for you. Delete the line above and sapkit stops reading or writing this file. -->

# RUN-PLAN — <project name>

The work queue for this project: what is in flight, what is waiting, what is finished.
`HANDOFF.md` beside it says where things stand; this file says what happens next.

**Keep it under 300 lines.** When it grows past that, move the finished rows out to
`archive/RUN-PLAN-YYYY-MM.md` under this project's root. Relocate them — never delete
them.

> **Never write secrets in this file.** No SAP hostnames, system numbers, clients,
> credentials, or table rows. Name a connection by its profile **alias** only.

## Queue

**Exactly one row is `next`.** If two items look equally next, one of them is `waiting` —
choosing between them is what this table is for.

| # | State | Item | Waiting for |
|---|---|---|---|
| 1 | `next` | <the one thing being worked on right now> | — |
| 2 | `waiting` | <queued item> | <what must land first, or whose answer is needed> |
| 3 | `waiting` | <queued item> | — |
| 4 | `done` | <finished item> | closed YYYY-MM-DD |

- **`next`** — in flight. One row, always.
- **`waiting`** — accepted but not started. Name the dependency; without one it is a wish,
  not a queue item.
- **`done`** — finished and confirmed. Keep the recent ones for context and archive the
  rest. For SAP objects, "confirmed" is the `COMPLETE` bar defined in `HANDOFF.md` — a
  write that answered success is not a `done` row.

## Current cycle

**Goal:** <one sentence — what is true when this is over that is not true now.>

**Done when:** <the check that settles it. Name the command, the procedure, or the
observation that decides pass or fail. "When it works" decides nothing.>

Checks that actually decide something:

- the `verify-applied` procedure comes back clean for the objects listed in `HANDOFF.md`;
- a named ABAP unit test class runs green in SAP;
- the offline code check reports no finding above `<severity>` for the changed sources;
- a named report produces `<the expected figure>` for `<the agreed input>`.

## Workstreams

When more than one thread of work is live, split **this file** into sections — one per
thread. Do not split it into more files: two queues in one place stay comparable, two
files drift apart and the older one starts lying.

### <workstream name>

**Goal:** <one sentence>
**Done when:** <the check>

| # | State | Item | Waiting for |
|---|---|---|---|
| 1 | `waiting` | <...> | <the other workstream holds the floor> |

**One `next` in the whole file, not one per section.** A section whose lead item is not
the current focus keeps that item at `waiting`. What has the floor right now is a single
decision, and this is where it is written down.

---

Maintained by the `handoff` skill (`/sapkit:handoff` on Claude Code). This file and
`HANDOFF.md` beside it are yours — sapkit rewrites their contents when you ask it to, and
never deletes or resets them. Remove the marker comment on the first line and sapkit
leaves the file alone from then on.

_updated YYYY-MM-DD_
