---
name: handoff
description: Close a session by bringing this project's HANDOFF.md and RUN-PLAN.md up to date — what the work got to, each SAP object's status, and what happens next — under a fail-closed ownership check that never writes over a same-named file sapkit did not set up
---

# Handoff — where this project got to

The next session starts with none of this one's context. This procedure leaves it two
files at the project root, so nobody has to re-explain the project from memory:

    HANDOFF.md    where the work got to — a snapshot, rewritten in place
    RUN-PLAN.md   the queue — what is next, what is waiting, what is finished

They sit beside each other at the **project root**, not under `.sapkit/`: they are
written for the person, not for the tooling. From the moment they exist they are the
**user's data**. sapkit rewrites their contents when asked, and never deletes, resets,
or truncates them.

The two templates — [HANDOFF-template.md](../../assets/continuity/HANDOFF-template.md)
and [RUN-PLAN-template.md](../../assets/continuity/RUN-PLAN-template.md), shipped under
`PLUGIN_ROOT/assets/continuity/` — are copied into an empty seat only (step 2), never
over a file that already exists.

## Scope — this file records one thing

**Where we got to.** That is the whole subject, and the reason the file stays short
enough to be read every session.

| The record is… | Goes to |
|---|---|
| where the work stands, what is unfinished, what happens next | `HANDOFF.md` / `RUN-PLAN.md` — here |
| a fact this project had to find out | [knowledge](./knowledge.md) |
| a verified failure and the rule that prevents its recurrence | [lesson](./lesson.md) |

Never copy a knowledge atom or a lesson entry into these files. If a resume point
needs one, **point at it by id** (`KS-003`, `R-009`) in one clause and stop there. A
duplicated paragraph drifts from its original, and the copy is the one the next
session happens to read.

When the fact was written down somewhere outside sapkit and so has no id, name where
it lives in one clause instead — a pointer with an address is still a pointer. What
is not allowed is the paragraph itself. And when a fact also *changes the state* —
a rule the business finally settled, which unblocks the work — the unblocking
belongs here and the rule itself belongs to `knowledge`: say that the blocker is
gone and point at the fact, do not restate it.

## The ownership marker

    <!-- sapkit:continuity -->

Line 1 of each file, followed by the one-line comment that explains to the user what
it means. When **reading**, scan the **first 20 lines** for it — a file that picked up
a leading blank line or an editor banner is still recognised. Anything past line 20
does not count as a marker.

**Invariant: every sapkit write preserves the marker.** Rewrite the body freely; the
marker line goes back on line 1, with its explanatory comment. Losing it is not
cosmetic — the next session reads an unmarked file, judges it to be someone else's,
and locks itself out of a file sapkit itself wrote. Removing that line is how the
**user** says "leave this file alone", so it must never happen by accident from our
side.

## 1. Decide ownership — fail closed

Read both files before anything else. Each is in exactly one of three states:
**absent**, **marked**, **unmarked**.

| Situation | What to do |
|---|---|
| Both absent | Propose creating the pair, marker included — create only on approval (step 2) |
| **Any same-named file is unmarked** | **Neither create nor update — nothing at all.** Report once which file is out of scope and why, then stop. Do not even measure sizes |
| Only marked files (one or both) | These are the update targets (step 3). If the other half is absent, offer to regenerate that one alone |

Two rules hold across every row:

- **Never write a template over an existing file**, whatever it contains. An empty
  `HANDOFF.md` and a 900-line one get the same treatment: hands off.
- **A read failure is an unmarked file.** Permission denied, an encoding that will
  not decode, an ambiguous result — anything that leaves the state undecided
  resolves to "unmarked" and ends the run. The cost of a wrong *"it's ours"* is
  overwriting work nobody can get back; the cost of a wrong *"it's theirs"* is one
  sentence of explanation.

When stepping back, say it plainly and once: which file, and that it carries no
sapkit marker, so it is out of scope. Then stop. **Do not** offer to force it,
rename it out of the way, back it up, merge into it, or put the pair somewhere else
instead. The user can add the marker or move the file; that is their decision, not a
menu to push at them.

## 2. Create the pair — on approval only

Only from the "both absent" row, or for the missing half of a marked pair.

1. **State what will be written and where** — the paths, and one line each on what
   the file is for. Nothing in the project changes before the user answers.
2. **Get an explicit yes.** Silence, "sure, whatever", and a yes to a different
   question are not it.
3. **Copy the template verbatim, line 1 included**, then replace the placeholder text
   with this project's reality. Placeholders left standing (`<project name>`,
   `ZCL_EXAMPLE`) are worse than an empty section, because they read as content.
   For `<project name>`, use whatever the user calls this project; nothing on disk
   is authoritative for it, so take the project directory's own name as the default
   and say once that you did, so a better name can replace it.
   One kind of placeholder is not a blank to fill: a template list offered as
   *examples of the sort of thing that goes here* (the RUN-PLAN template's list of
   checks that decide something) is guidance. Replace it with the project's real
   items, or delete it — never invent a project fact to fill an example.

Never create these files as a side effect of doing something else, and never because
a project "ought to have them". They are proposed when a session is being closed and
the user asked for that.

## 3. Update — HANDOFF is a snapshot, RUN-PLAN is a queue

Same approval shape as step 2: say what will change in each file, get a yes, then
write. One file at a time. No batch write, and nothing written "while we are in there
anyway".

### `HANDOFF.md` — rewrite in place, do not append

Rewrite it from **what this session actually did**, not from what it set out to do. A
snapshot that gets appended to becomes a log, and a log is where the live state goes
to hide.

- **Start here** — one paragraph: what is being built or fixed, the state it is in
  right now, and the one thing a reader must know before touching anything. Replace
  the stale sentences; do not stack new ones under them.
- **SAP work status** — one row per object this project has in flight or has
  settled recently: object and type, `DRAFT` / `PROVISIONAL_WRITE` / `COMPLETE`
  (below), the transport id, the profile **alias** it was worked against, and a
  short note. **The table is the project's standing state, not this session's
  diary** — an object left untouched this session keeps its row. Dropping it would
  erase the only record that it reached `COMPLETE`, and nothing here reconstructs
  that. A row leaves only when the object stops mattering to the current work, and
  then it leaves by moving to the archive with the rest of the settled record.
- **Still open** — what is unfinished and what makes it unfinished, one line each.
  For a blocked item, name the blocker and what or who would clear it.
- **Next (1–3)** — at most three, each concrete enough to start without deciding
  anything first. A fourth item belongs in the queue, not here.
- **Environment notes** — active profile alias and its tier, the SAP release in use,
  local tools or paths the project depends on, and what a fresh session would
  otherwise get wrong. Aliases and names only.
- Refresh the `_updated_` stamp, **date and time**. Two closes on one day are
  indistinguishable without the clock, and "has this been updated since?" is the
  first question a returning session asks.

### `RUN-PLAN.md` — move the queue to its true state

- What finished becomes `done` with its closing date; what is being worked on is
  `next`; what is accepted but not begun is `waiting` **with its dependency named**.
  A `waiting` row without a dependency is a wish, not a queue item.
- **Exactly one row in the whole file is `next`**, including across workstream
  sections. If two look equally next, one of them is `waiting` — choosing between
  them is what the queue is for.
- Update the current cycle's **Done when** if the check that settles it has changed.
  Name a command, a procedure, or an observation; "when it works" decides nothing.
- Refresh the `_updated_` date.

### The three status words are not synonyms

Using them loosely is how a session ends up believing work is finished when it is not.

- **`DRAFT`** — designed or written outside SAP. Nothing has been sent to the system.
- **`PROVISIONAL_WRITE`** — a write went to SAP and the tool answered success. That
  is all it means. The success response comes from the side that did the writing, so
  it is a claim, not evidence. An activation call reporting ACTIVE is also a claim.
- **`COMPLETE`** — both halves are in: the **machine confirmation** of
  [verify-applied](./verify-applied.md) — read the source back out of SAP, compare it
  against what was sent, then confirm syntax and active state — **and** an
  **independent fresh-context review** of the change. One half alone is still
  `PROVISIONAL_WRITE`, and so is an object that "obviously worked".

Record the status the evidence supports. Writing `COMPLETE` because the run felt
finished is the one entry in these files that causes real damage: the next session
trusts it and builds on an object nobody ever checked.

## Never record secrets

These files get read aloud, pasted into chats, mailed around, and copied out. They
carry no connection values, ever:

- nothing that identifies or reaches a system — hostnames, system or instance
  numbers, clients, SIDs;
- no usernames, passwords, tokens, or certificate material;
- no rows of table data, and none of the categories
  [data-protection](../policies/data-protection/) covers — customer and vendor names,
  tax and registration numbers, addresses, personal names, account numbers,
  customer-specific pricing, payroll values. That list is examples, not a limit.

Name a system by its profile **alias** and nothing more. The alias is just a name; the
values behind it live in the machine-level profile, outside the project — see
[credential-handling](../policies/credential-handling.md). Approval to *read* a row
was never approval to *write it down*.

## Never assume this project uses git

Plenty of SAP projects are not a repository at all, and plenty of the ones that are do
not track these two files. So the resume point is reconstructed from **this
session** — what was done, what the tools returned, what the user said — and never
from a commit range, a diff against an earlier commit, or a history read. When nothing
about this session is recorded anywhere else, that is precisely why these two files
exist.

## 4. Check the size — name the targets explicitly

A resume point that outgrows a comfortable read stops being read, and the live rules
end up buried under finished records. The caps are **`HANDOFF.md` 500 lines** and
**`RUN-PLAN.md` 300 lines**, counted as physical lines (the `wc -l` count).

Run the shipped gate after writing:

    node "PLUGIN_ROOT/scripts/check-doc-size.mjs" --root "<project root>" --file HANDOFF.md:500:archive/ --file RUN-PLAN.md:300:archive/

**Name only the files that actually exist.** A named target that is missing counts as a
violation by that gate's own rule, so naming a legitimately absent half turns a clean
run red. With only `HANDOFF.md` in place, name only it:

    node "PLUGIN_ROOT/scripts/check-doc-size.mjs" --root "<project root>" --file HANDOFF.md:500:archive/

Exit codes:

| Exit | Meaning |
|---|---|
| `0` | every named file is within its cap |
| `1` | a named file is over its cap, or a named file is missing |
| `2` | usage error — no targets were given; nothing was measured, so this is not a verdict |

⚠ **The exit-2 usage text goes to stderr.** A caller that captures stdout alone sees an
empty result and can read it as "nothing wrong". Capture both streams — append `2>&1` —
and judge on the exit code, not on what came back on stdout.

## 5. Over the cap — relocate, never delete

Exit `1` on an oversize file means the settled records have to **move out**, not go
away:

1. Create `archive/HANDOFF-YYYY-MM.md` or `archive/RUN-PLAN-YYYY-MM.md` under the
   project root, `YYYY-MM` being the period the moved records belong to.
2. Move the settled parts across **whole** — section headings, table rows, and any
   `>` block-quote prefixes intact — so the relocated text still reads as what it was.
3. Leave one pointer line behind naming the archive file, so the trail is followed in
   a single hop.
4. Keep in the live file only what is still live: the current state, the open items,
   the next steps, the `next` and `waiting` rows, and enough recent `done` rows for
   context.
5. Re-run step 4 and confirm exit `0`.

The archive file is the user's data as well: the same approval applies before writing
it, and **nothing is ever deleted to satisfy a line count** — deleting the history
defeats the reason the file exists. If the live remainder is still over cap once the
settled records have moved, the project is genuinely that busy: say so and leave it,
rather than trimming content that is still in force.

## What this procedure never does

- Write over a same-named file that carries no marker — for any reason, at any size.
- Write anything into the project without an explicit yes to that specific write.
- Drop the marker from a file it updates.
- Delete, reset, or empty `HANDOFF.md`, `RUN-PLAN.md`, or an archive file.
- Put a hostname, a credential, or a row of real data into any of them.
- Duplicate what belongs to [knowledge](./knowledge.md) or [lesson](./lesson.md).
