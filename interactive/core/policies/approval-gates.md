---
name: approval-gates
description: Human approval gates — explicit-keyword spec approval bound to spec hash + system + transport, and per-call approval for row-level data reads
source:
  - sc4sap-custom/skills/create-program/spec-approval-gate.md
  - sc4sap-custom/CLAUDE.md
  - core/policies/data-protection/data-extraction-policy.md
---

# Approval Gates

Two points in every workflow require an explicit human decision. An agent never
crosses either gate on its own initiative, regardless of execution mode.

## Gate A — Spec approval (before any implementation)

No SAP write tool may be called for a program until its `spec.md` has been
displayed to the user and explicitly approved.

**Accepted approval keywords** (exact, explicit):

- `승인` / `approve` / `approved` / `ok` / `proceed` / `go ahead` / `confirmed`
  (the canonical list lives in `../procedures/schemas/approval.schema.json` — keep both in sync)

**NOT accepted**: `yes`, "sounds good",
enthusiasm ("빨리", "해봐"), silence, or moving on to another topic. If the
response is a change request, revise `spec.md`, re-display it, and wait again —
never silently merge comments and continue.

**Approval record.** On approval, write a record conforming to
`../procedures/schemas/approval.schema.json` into `.sc4sap/program/{PROG}/`
(field summary below; the schema is authoritative):

- the **spec hash** (content hash of `spec.md` at the moment of approval)
- the target **SID/client** (from the active profile)
- the assigned **transport** number
- approver, timestamp, and the keyword used

The approval is bound to that exact triple (spec hash + system + transport).

**Re-approval.** Any change to `spec.md` after approval changes the hash and
voids the approval — the implementation phase MUST refuse to run against a
spec whose current hash does not match the recorded one, and the gate is run
again. The same applies if the target system/client or transport changes.

## Gate B — Row-level data reads (per call)

`GetTableContents` and `GetSqlQuery` are **never** auto-approved. Every single
call requires human approval for that call — approval does not carry over
between calls, tables, or sessions. Blocklist categories, deny/warn actions,
and the refusal template are defined in
[data-extraction-policy](./data-protection/data-extraction-policy.md).

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
