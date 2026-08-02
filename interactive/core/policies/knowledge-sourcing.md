# Knowledge Sourcing — The Maturing Layers

**MANDATORY umbrella for every persona and procedure.** The plugin's answers draw
on layers that grow at different speeds. The shipped knowledge (`core/knowledge/`)
never changes at runtime; everything else accumulates as the project is worked —
failures distill into rules, verified facts become citable atoms, extractions
snapshot the customer system, and the user may register their own distilled
vaults. **A layer that is written but never read is dead weight.** This policy
defines who reads what, when, and in which order, so the plugin actually gets
better with use instead of merely storing evidence that it could have.

Per-layer mechanics stay in their home documents ([lesson](../procedures/lesson.md),
[knowledge](../procedures/knowledge.md), [spro-lookup](../procedures/spro-lookup.md),
[customization-lookup](../procedures/customization-lookup.md),
[ask-consultant](../procedures/ask-consultant.md) § Reference Libraries). This
policy is the one place that ranks them and names the read obligations.

## The Ladder

| # | Layer | Where | Grows by |
|---|---|---|---|
| L0 | Learned guardrails | `.sapkit/RULES.md` (evidence: `LESSONS.md`) | [lesson](../procedures/lesson.md) — user-approved only |
| L1 | Learned facts | `.sapkit/knowledge/domain.md` (KD) · `system.md` (KS) | [knowledge](../procedures/knowledge.md) — user-approved only |
| L2 | System snapshots | `.sapkit/spro-config*.json` · `.sapkit/customizations/` · `.sapkit/cbo/` | user-run extractors (P2) · [analyze-cbo-obj](../procedures/analyze-cbo-obj.md) |
| L3 | User vaults | `config.json` → `referenceLibraries[]` (paths outside the repo) | the user curates them outside sapkit — read-only to the plugin |
| L4 | Bundled knowledge | `core/knowledge/` (modules · industry · country · abap) | plugin releases |
| L5 | Model general knowledge | — | — |

Two things sit beside the ladder, not on it:

- **Live MCP readings.** For a current-state fact about the connected system, a
  live reading (within tier and P2 gates) outranks every stored layer. Stored
  layers exist to make live reads rarer and cheaper, not to replace them where
  truth matters.
- **Policies.** Data protection, approval gates, tier rules, and transport rules
  bind **above** all layers. No layer — vault included — ever loosens them.

## Precedence by question type

**"What is true on THIS system?"** (configuration, existence, behavior):
live reading > scope-matched KS atom ≈ L2 snapshot (both carry timestamps —
prefer the fresher, and confirm live before a risky action) > L4. L4 never
answers "what is configured here"; it answers "which table to look at"
([spro-lookup](../procedures/spro-lookup.md) Step 2, including the § 2a rule
that an IMG path is never answered from static knowledge alone).

**"How is this actually done?"** (practice, process shape, design choice):
L0 matching rules first — they veto approaches — then KD/KS atoms, then L3
vaults, then L4, then L5 **flagged as unverified**.

**On conflict** the higher layer wins. When a vault practice contradicts a
live/KS fact of this system, this system wins — surface the divergence to the
user instead of silently picking either side. When a lower layer reveals a
higher one is stale (a live reading contradicts a KS atom), route the
correction back ([knowledge](../procedures/knowledge.md) `Correct`), never
silently overwrite.

## Read triggers — when consultation is mandatory

| About to … | Consult first |
|---|---|
| take any SAP-facing action (write, diagnosis, advice) | **L0** — a rule whose scope tags (`[module-*]`, `[action:*]`, `[domain:*]`, `[mcp]`) match the work is a hard constraint, same force as a policy |
| state a fact about this business or this system | **L1** — a KD atom is established context; a KS atom only when its `scope:` matches the active profile/SID/client |
| answer a customizing / enhancement / reuse question | **L2** via its protocol ([spro-lookup](../procedures/spro-lookup.md) / [customization-lookup](../procedures/customization-lookup.md) / `cbo/` inventory) |
| answer a practice question — "how is this actually done" | **L3** — every entry point, not only ask-consultant; a registered vault is a standing instruction |
| diagnose a symptom / troubleshoot | **L0 + L1** — a recorded failure mode matching the symptom short-circuits the hypothesis space before any new investigation |

Absent file, directory, or field → skip silently, never block. The layers are
optional accelerators; their absence changes nothing except how much must be
re-derived.

## Budgets

- **L0/L1** are small by construction (`RULES.md` capped at 40; atoms are
  one-fact entries). Read the matching entries; do not do archaeology over
  `LESSONS.md` history unless a matched rule cites it.
- **L2**: targeted keys only — never dump a cache into context.
- **L3**: at most 2–3 matching docs per vault per question (filename keyword
  match + grep); never bulk-load a vault; never copy vault content into a
  committed or distributed artifact.

## Citation

Say which layer shaped the answer when one materially did: `R-###` / `KD-###` /
`KS-###` ids, snapshot timestamps ("config snapshot: 2026-04-13"), vault
provenance (`참조: {name}/{file}`), or an explicit "unverified — general
knowledge" for L5. An uncited claim reads as shipped-knowledge-only, and an L5
claim presented without its flag is the failure mode this ladder exists to
prevent.

## Write-back — the loop that makes it mature

Reading is half the loop. When work **establishes** something, offer to route it
back (offer, never auto-write — both procedures are user-approval-gated):

| The work produced … | Offer |
|---|---|
| a verified failure + cause, likely to recur | [lesson](../procedures/lesson.md) → L-id (R-id only on user approval) |
| a verified business / this-system fact the shipped knowledge lacks | [knowledge](../procedures/knowledge.md) → KD-/KS-id |
| evidence that a recorded rule or atom is wrong | the same procedure's correction path — amend with history, never delete |
| work against a stale L2 snapshot (> 90d SPRO / > 30d customizations) | suggest the user re-run the extractor (P2 — user-run, never on their behalf) |

Vaults are **read-only to the plugin**: new vault content is the user's own
curation, outside sapkit.

## Wiring

Three nets keep this policy from being aspirational — (1) the always-on compact
ladder in [project-context](../project-context.md), read by every skill wrapper
at step 1; (2) the consultant personas' `<Reference_Data>` blocks, which list
L0/L1 and L3 above the bundled references; (3) point-of-action anchors inside
the procedures where a missed layer has already caused real damage (symptom
triage, object writes, interviews, process reconstruction). When adding a new
procedure or persona, wire it to the matching net rather than restating this
policy.
