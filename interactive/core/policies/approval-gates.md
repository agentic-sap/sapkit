---
name: approval-gates
description: Human approval gates — explicit spec approval bound to spec hash + system + transport, and per-call approval for row-level data reads (distribution default; owner-machine exception per D-043)
source:
  - sc4sap-custom/skills/create-program/spec-approval-gate.md
  - sc4sap-custom/CLAUDE.md
  - core/policies/data-protection/data-extraction-policy.md
---

# Approval Gates

This harness gates two points, and procedure intensity never weakens a gate
that applies to it. Gate A requires an explicit human decision on `spec.md`
before implementation; it applies to flows that own a spec/approval artifact —
the [create-program](../procedures/create-program.md) Full pipeline. Minimal
([modify-object](../procedures/modify-object.md)) and Standard
([create-object](../procedures/create-object.md)) carry no spec-approval step
and sit outside Gate A's scope. Gate B applies to the row-data action itself
regardless of procedure intensity in
[development-loop](./development-loop.md) — Minimal/Standard/Full does not
change when it fires. Its enforcement layer varies: a per-call human decision
under the distribution default (a), or the server-side blocklist floor under
the owner-machine exception (b). An agent never crosses either gate on its own
initiative — for Gate B, that means never substituting its own judgment for
whichever layer is active.

## Gate A — Spec approval (before any implementation)

No SAP write tool may be called for a program until its `spec.md` has been
displayed to the user and explicitly approved.

**What counts as approval — a clearly affirmative answer.** There is no fixed
keyword list to match against. An answer whose meaning is plainly "yes, build
this" is approval, in whatever language and phrasing the user chose. The
approval answer is itself the explicit go-ahead into implementation: it is the
place where the human permits entry into the SAP-writing steps, and no second
"shall I proceed?" follows it.

There is accordingly no canonical list to keep in sync any more. What
`../procedures/schemas/approval.schema.json` records is the user's actual
phrase (`approval_phrase`, verbatim) — the record says what was said, not which
listed word was matched.

**When the answer is ambiguous, ask back exactly once.** Enthusiasm or
impatience without a decision ("음… 일단 해봐", "빨리", "sounds good") is not yet
approval. Ask back **once** — render the question in the user's language and in
plain words, carrying these two elements:

1. that you are asking whether to start building from this design, now;
2. that an affirmative answer starts the build.

(Illustrative only, not a fixed string: *"Shall I start building from this
design? If you say yes, I start."*) Then wait for the answer, and judge that
answer by the same standard. One ask-back, not a loop.

**A change request is a design edit, not a verdict on the gate.** Revise
`spec.md`, re-display it, and ask again — never silently merge comments and
continue.

**Silence, or moving on to another topic, is not approval.**

**Approval record.** On approval, write a record conforming to
`../procedures/schemas/approval.schema.json` into `.sapkit/program/{PROG}/`
(field summary below; the schema is authoritative):

- the **spec hash** (content hash of `spec.md` at the moment of approval)
- the target **SID/client** (from the active profile)
- the assigned **transport** number
- approver, timestamp, and the **approval phrase** — the user's own words,
  recorded verbatim

The approval is bound to that exact triple (spec hash + system + transport).

**Re-approval.** Any change to `spec.md` after approval changes the hash and
voids the approval — the implementation phase MUST refuse to run against a
spec whose current hash does not match the recorded one, and the gate is run
again. The same applies if the target system/client or transport changes.

**Outside this policy's scope.** The fixed approval-phrase rule of the
[release](../procedures/release.md) procedure is untouched by the above and
stays exactly as it is — an irreversible action keeps its second layer of
defence; only the wording that explains it gets easier.

## Gate B — Row-level data reads (per call)

**(a) Distribution default.** `GetTableContents` and `GetSqlQuery` are
**never** auto-approved. Every single call requires human approval for that
call — approval does not carry over between calls, tables, or sessions.
Blocklist categories, deny/warn actions, and the refusal template are defined
in [data-extraction-policy](./data-protection/data-extraction-policy.md).

**(b) Owner-machine exception (D-043).** On machines where the owner has made
an explicit decision to adopt the server-side table-blocklist floor
(`MCP_ALLOW_TABLE` opt-ins per profile), the per-call approval layer in (a) is
replaced by that server-side guard. Distribution defaults elsewhere stay
locked.

**(c) Invariant under both (a) and (b).** Subagent and batch use are
prohibited regardless of which layer is active — no exception path removes
this.

Schema/DDIC reads (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`,
`GetDomain`) are metadata, not row data, and are not gated by this rule.

## Honesty note — what actually enforces these gates

These gates are **documented conventions (L1)**, not physics. Machine
enforcement exists only where the harness provides it:

- **Claude adapter**: PreToolUse hooks and permission settings can hard-block
  tool calls, so both gates get machine backing.
- **Codex / Antigravity**: no equivalent hook layer. The defense there is the
  MCP server's built-in guards (**L2**: table blocklist + `SAP_TIER` readonly
  guard — see [credential-handling](./credential-handling.md)) plus this
  convention followed by the agent.

An agent must therefore treat this document as binding even when nothing would
technically stop it — on non-Claude harnesses this text and L2 are the only
defense lines.
