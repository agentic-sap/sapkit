---
name: interview-sweep
description: The dig-out stage — a shared sub-procedure that surfaces the decisions an interview leaves tacit before any planning or creation starts. Called by create-program (after the technical interview, before planning), deep-interview (after its own dimensions close), and create-object (a short variant inside the confirm step). Draw the program map, enumerate the blanks, ask all of them with a recommendation attached, record the answers into the artifact the run already owns under a fixed section marker. No skill wrapper — it has no entry point of its own.
---

# Interview Sweep — the Dig-Out Stage

An interview closes the slots someone thought to put on a list. This stage closes
the ones nobody thought to put on a list — and those are the decisions that, left
unasked, end up being made silently by whoever writes the code.

This is a **shared sub-procedure**. It carries no skill wrapper and no entry point
of its own: three procedures call it, and it only ever runs inside one of their
runs.

> **The rule behind every question here**: a decision the user would have an
> opinion about is not yours to make. The interview slots collect what the
> procedure knew to ask; the dig-out collects what this particular program turns
> out to need. Finishing the slots is not the same as knowing what to build.

## Language — this file vs. the conversation

This file is written in English because it is product instruction. **Nothing in it
is a script to paste.** Every element list below names *what to cover*; you render
it as sentences in the user's language, in plain words, at the moment you say it.
If an element list reaches the user as a table of internal terms, it has been
mis-rendered.

How many questions ride in one message, how a recommendation is attached, how a
confirmation restatement is phrased, and what a decision question may not look
like are all set by the plain-language policy at
`interactive/core/policies/plain-language.md`. Follow it. Those rules are
deliberately **not** restated here, so that the two cannot drift apart.

## Callers and entry conditions

| Caller | Where the dig-out runs | Variant |
|---|---|---|
| [create-program](./create-program.md) | After the technical interview (Phase 1B) closes, **before** planning (Phase 2) starts | Full |
| [deep-interview](./deep-interview.md) | After its own dimensions close, before the brief is written | Full |
| [create-object](./create-object.md) | Inside the confirm step, before anything is created | Short — see below |

**The dig-out always runs.** A design document the user brought in, a
specification they pasted, a [deep-interview](./deep-interview.md) brief, or a
recorded `KD-`/`KS-` knowledge atom does not cancel it — it changes the *form* of
the individual question. A blank the document already answers is closed by
**confirmation restatement**: say back what the document says and let the user
correct it. Never re-ask it as though the document did not exist, and never let it
pass as a silent assumption. A blank the document does not reach is asked
normally.

A document that looks complete is the most common way a decision goes unmade: it
answers what its author happened to think of, which is a different set from what
this build needs.

## Step ① — Show the program map

Before asking anything, draw what you believe you are about to build, out of the
interview answers you already hold — for [create-program](./create-program.md)
that is the Phase 1A business slots together with the Phase 1B technical slots;
for [deep-interview](./deep-interview.md) it is its own dimensions.

One screen. In the user's language, in plain words: someone on the business side
who has never opened SE38 has to be able to spot a mistake in it.

Cover these elements:

- **What it reads** — which business documents and which tables, named the way the
  user names them and not only by technical name
- **What it writes or changes** — and what it deliberately leaves alone
- **Who runs it, when, and how** — which role, on what occasion, on demand or
  scheduled
- **What comes out** — the result the user actually receives
- **Where the result goes** — screen, file, mail, another system, the next step of
  the process

Then hand it back and invite a correction. Take the correction into the map before
Step ② — a wrong map enumerates wrong blanks, and every question after it is spent
on the wrong program.

This is a drawing to be corrected, not a plan to be signed. Do not turn it into an
approval gate, and do not attach the rest of the stage to a single "looks good?".

## Step ② — Enumerate the blanks

For each actor on the corrected map — each document, each table, each role, each
run, each output — generate the "what should happen in this case?" candidates.

The kinds below are a **floor, not a ceiling**. Where the program touches
something none of them names, add the kind that fits it; the list is there to stop
you forgetting, not to bound what you may ask.

- **Exception situations** — nothing in scope · a closed period · a partially
  processed set · duplicates
- **Error handling** — skip, stop, log, or message; and who is the one who sees it
- **Authorization** — who is allowed to run it, and which authorization object
  that check goes through
- **Data volume and performance** — what a normal run holds, and what the worst
  case holds
- **Run mode** — run in dialog or as a background job · what happens when the same
  run goes twice · what happens when it is re-run after an abort
- **Locking and concurrent runs** — two people at once, or the run colliding with
  the business transaction it reads
- **Currency, unit, language, text** — conversion and rounding, which unit the
  figures are in, which language the output speaks
- **Output detail** — sort order, totals and subtotals, download to a spreadsheet,
  which messages appear and where
- **Log and audit** — what is kept, for how long, and who reads it afterwards
- **Acceptance criteria** — one or two worked examples in the shape "given this
  input, this result"

A kind drops off the list only where this program raises **no candidate under it at
all** — a program that moves no amount anywhere raises no currency blank. That is
the whole of the exemption. It is not an exemption for a candidate whose answer you
believe you already know:

- **You are confident of the answer** → it is still enumerated and still asked,
  with your recommendation attached (Step ③). Confidence is not a reason to drop
  the question; it is the reason the recommendation exists.
- **The corrected map already states it** → it is still enumerated, and it closes
  as a **confirmation restatement**, the same form a brought-in document's answer
  takes. The map is a drawing the user corrected, not a decision record they
  signed — nothing closes on it silently.

A candidate removed here never reaches Step ③ and never reaches the stopping
criterion, which is scoped to what this step enumerated. Removal is the one move
this stage cannot take back, so it is reserved for the kind that has nothing to ask
about.

## Step ③ — Ask

**Ask all of them** — including the ones you are confident about. Confidence is
exactly the case where a silent decision is most likely, and the user is the one
who lives with the consequence. What confidence earns you is the right to
**attach a recommendation**, not the right to skip the question.

- **Wording and bundling** follow `interactive/core/policies/plain-language.md` —
  how many blanks travel in one message, how the recommendation is phrased, and
  what a bulk-approval block may not look like. Do not invent a second cadence
  here.
- **Persona.** A blank on the business side — exception rules, who may run it,
  acceptance criteria, what a currency or unit means in this process — is asked in
  the matching module consultant persona (see the [personas INDEX](../personas/INDEX.md)).
  A blank on the technical side — run mode, locking, volume, output mechanics, log
  retention — is asked as [sap-analyst](../personas/sap-analyst.md) /
  [sap-architect](../personas/sap-architect.md). A blank that is genuinely both is
  asked once, from the business side, with the technical consequence stated inside
  that same question.
- **Already answered.** A blank that a brought-in document, a
  [deep-interview](./deep-interview.md) brief, or a recorded `KD-`/`KS-` atom
  already answers is a **confirmation restatement**: state the answer and where it
  came from, and let the user correct it. A `KD-` atom counts as established
  context; a `KS-` atom counts only where its `scope:` matches this run's
  profile/SID/client, and otherwise it is a hint to confirm rather than a fact
  (see [knowledge](./knowledge.md)).
- **There is no cap on the number of questions.** The stopping criterion below is
  what ends this stage — not a budget, not fatigue, not the turn count. Where the
  bundles run past five, tell the user how many bundles remain after the one on
  screen, so that the end is visible from inside.
- A user who asks you to decide the rest still gets the questions, each carrying
  your recommendation. What you may compress is the effort of answering; never the
  fact of being asked.

## Step ④ — Record

Everything answered in this stage goes into **the artifact the run already owns**,
as its own section. **No new file** — this stage never creates an artifact of its
own. Which artifact that is depends on the caller:

| Caller | Where the record goes |
|---|---|
| [create-program](./create-program.md) | `interview.md`, alongside the slot answers |
| [deep-interview](./deep-interview.md) | the brief it is about to write — the marked section sits *beside* the front matter described at the end of this file, not instead of it |
| [create-object](./create-object.md) | see the short variant below |

The section opens with this exact marker, alone on its line:

```
<!-- SAPKIT:DIG-OUT -->
```

**Do not translate this marker, do not reword it, do not drop it.** It is the
machine handle on this section — a later step greps for it to establish that the
dig-out actually ran, and a translated or reworded marker reads to that check as
a dig-out that never happened. It is an HTML comment, so it stays invisible in the
rendered document: the user never sees it and never needs to.

A visible heading follows on the next line, rendered in the user's language like
the rest of the artifact. Under it, one entry per blank, carrying:

- **Question** — as it was actually asked
- **Answer** — as the user actually gave it
- **Recommendation?** — whether the answer taken was the one you recommended
- **Source** — `user` (asked and answered in this run) · the brought-in document
  and its section · the [deep-interview](./deep-interview.md) brief file · the
  `KD-`/`KS-` id

The marker is fixed; the body is in the user's language.

Where a dug-out answer contradicts a slot recorded earlier in `interview.md`,
correct the earlier slot as well and say so in the entry. Two answers left
standing in one artifact is precisely the defect this stage exists to prevent.

## Stopping criterion

The dig-out is over when **nothing is left that you would otherwise decide on the
user's behalf**. Observably, both of these hold:

1. Every blank enumerated in Step ② has been closed by the user — by an answer, or
   by confirming a restatement. A blank you closed yourself is not closed.
2. What remains is only technical detail the user holds no preference about —
   variable naming, how the logic splits across includes, and the like.

Both, or the stage is not over. Question count, elapsed turns, and user impatience
move neither condition.

**Nothing downstream starts without this record.** In
[create-program](./create-program.md), planning refuses to run where `interview.md`
carries no dig-out section. In [deep-interview](./deep-interview.md), the brief is
not written until both conditions hold — the marked section goes in as part of
writing it, so a brief carrying no dig-out section is a brief that went out early.
In [create-object](./create-object.md), nothing is created before it.

### Ways this stage gets faked

Each of these has the shape of a finished dig-out and is not one. Treat any of
them as "not yet closed":

- **The map was never corrected.** It went out, the user said "yes", and the
  blanks were enumerated off your own assumptions rather than theirs.
- **The confident blanks were dropped.** Only the ones you were unsure about got
  asked; the rest were "obvious". Those are the ones that surface at go-live.
- **A brought-in document was treated as closure.** The document's silence on a
  blank was read as agreement instead of as a question still open.
- **The section exists but records only what was asked.** Answers, recommendation
  flags, or sources are missing, so nobody downstream can tell a user decision
  from yours.
- **A bulk block stood in for the questions.** Every remaining blank arrived in one
  table under a single approval — see `interactive/core/policies/plain-language.md`,
  which forbids it.

## The `create-object` short variant

[create-object](./create-object.md) has no design document and no approval gate.
Its confirm step is where this stage lives, and the dig-out scales to the object
rather than to the ceremony.

- **Scale by the object.** For a single table the dig-out is about: the key fields
  and their order · client dependency (`MANDT` or not) · the delivery class, and
  what it implies for transport and for the customer's own data · the rationale
  behind each field's type, following the priority in
  [field-typing-rule](../knowledge/abap/conventions/field-typing-rule.md) (standard
  data element → existing CBO data element → new CBO data element → a primitive
  type and length as the last resort). A class, a function module, or a CDS view
  gets the blanks its own shape raises; the kinds in Step ② still name where to
  look.
- **Steps ① and ② compress but do not vanish.** The map is a sentence or two —
  what this object is for, who or what uses it, what it holds or does — and the
  blanks come off it the same way.
- **The stopping criterion is unchanged.** It is the one above.
- **One confirmation, at the end.** The rules you dug out are shown *together
  with* the pre-create confirmation — name, package, transport, description, the
  confirmed module integration fields — and confirmed in a single pass. That
  confirmation is the only gate this procedure has, so do not split it into a
  second approval, and create nothing before it clears.
- **Where the record goes.** A `create-object` run that keeps an `interview.md` —
  one reached from a [deep-interview](./deep-interview.md) brief, or running inside
  a larger run that owns one — records the four fields there under the marker
  above, exactly as in Step ④. A standalone `create-object` run writes no
  `interview.md` and none is created for this stage; there, the confirmation
  message itself is the record, and the marker does not apply. An existence check
  aimed at the marker therefore belongs to the runs that own an `interview.md`, not
  to every `create-object` run.

## How a `deep-interview` brief carries this result

When [deep-interview](./deep-interview.md) writes its brief, the dig-out result
does not sit in an appendix. The brief opens with **human-readable front matter**
— the part a business reader can read on its own, before any object list,
package, or transport strategy appears. In the user's language, in plain words,
four parts in this order:

1. **At a glance** — what this is, who it is for, when it runs, and input →
   output. Around five lines; short enough that someone can read it standing up.
2. **What was decided, and why** — the decisions in plain words, each with the
   reason behind it, including the standard SAP alternatives that were put on the
   table and turned down and why they were turned down.
3. **Business rules and exceptions** — the dig-out result itself: the "in this
   case, do this" list, one line per rule, drawn from the Step ④ entries.
4. **Acceptance criteria** — the worked examples in the shape "given this input,
   this result", so the finished program can be checked against something the user
   wrote rather than against the code.

The technical body of the brief follows unchanged underneath. The front matter is
not a summary written afterwards — it is the narrative face of what the dig-out
established, and it is what a later [create-program](./create-program.md) or
[create-object](./create-object.md) run restates for confirmation instead of
re-asking.

**The front matter does not stand in for the record.** The same brief also carries
the `<!-- SAPKIT:DIG-OUT -->` marker and the four-field entries of Step ④. The
front matter says *what was decided*; the marked section says *what was asked, what
was answered, whether the answer taken was the one recommended, and where it came
from*. A later run restating a rule needs the second to tell the user's decision
from yours, and the marker is what lets a check find the section at all. Neither
stands in for the other.

## Related

- [create-program](./create-program.md) · [deep-interview](./deep-interview.md) ·
  [create-object](./create-object.md) — the three callers
- [knowledge](./knowledge.md) — how `KD-`/`KS-` atoms count as already answered,
  and how a user's contradiction of one is routed
- `interactive/core/policies/plain-language.md` — the wording, bundling, and
  recommendation rules this stage asks under
