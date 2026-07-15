# Upstream design gap hand-off: `final-harness` docs lifecycle — `ADR.md` is append-only forever *and* injected into every prompt

Paste this whole file into a Claude Code session on the machine that holds the
`final-harness` source (`D:\claude-practice\claude-fable-final`), or hand it to
the maintainer. It is **self-contained**: symptom, evidence coordinates, the
contradiction, why upstream has not seen it, and candidate directions.

**This is a design gap, not a bug.** Nothing is broken today. The report proposes
no fix — the maintainer decides. Same hand-off convention as
`engine/UPSTREAM-FIX-HANDOFF.md` (the MCP engine one).

- **Reported by**: downstream consumer `sap-agentic-harness` (Track A), 2026-07-15
- **Upstream commit examined**: `6de63bac860723ff1bfd50a940a75e46c6e87d99`
  (HEAD = `origin/master`; commit blob `plugin.json` version **0.19.3**).
  Note: the working tree at examination time had **20 modified files** and showed
  `0.19.4` uncommitted — that uncommitted state was **not** examined.
- **All coordinates below are `6de63ba` blobs, verified by direct read.**

---

## 1. Symptom (downstream, live)

Consumer project `sap-agentic-harness` reached **55,136 bytes** of top-level
`docs/*.md`. The engine's own WARN threshold is 48 KB and its hard startup
refusal is 64 KB. The project is at **84% of the refusal threshold** and the
dominant file grows monotonically by contract.

Breakdown at report time:

| file | bytes | share |
|---|---|---|
| `docs/DECISIONS.md` (this project's ADR-equivalent) | 44,676 | **81%** |
| `docs/ARCHITECTURE.md` | 6,860 | 12% |
| `docs/PRD.md` | 3,600 | 7% |
| **total injected** | **55,136** | — |

The decision log grew from ~23 KB (2026-07-13) to 44.7 KB (2026-07-15) — roughly
**2× in two days** of active design work. At that rate the 64 KB refusal is weeks
away, not years.

## 2. Evidence — the two rules that cannot both hold

### 2.1 The engine injects every top-level `docs/*.md`, every step, every retry

- `skills/harness-init/templates/engine/scripts/execute.py:2321-2323` — non-recursive
  glob: `docs_dir = ROOT / "docs"` → `for doc in sorted(docs_dir.glob("*.md"))`.
  Each matched file's **full text** is appended to the guardrails block.
- `:2289` — `DOCS_MAX_BYTES = 64 * 1024` → `:2331` exceeding it prints an ERROR and
  `sys.exit(1)` (**startup refusal**).
- `:2294` — `DOCS_WARN_BYTES = 48 * 1024` → `:2339` WARN only.
- The rationale comment at `:2290-2294` is explicit that this is a *quality* concern,
  not just capacity: long injection degrades instruction-following (context rot),
  worse on weaker models. So the budget is not arbitrary headroom to spend.

### 2.2 `harness-docs` mandates that `ADR.md` grows forever, in that same directory

- `skills/harness-docs/SKILL.md:49` — core doc #3 is
  `docs/ADR.md` — "numbered decision records: `## ADR-001 | date | title` with
  Context / Decision / Consequences, **5-10 lines each. Append-only.**"
- `:77-78` (Mode B, Refresh) — "ADR.md: **one new entry per decision** the phase
  actually made … **Never rewrite or renumber existing entries.**"
- `:52` — "Each core doc stays under **~300 lines**. Details go to `docs/reference/`
  subdirectories — the engine injects only TOP-LEVEL `docs/*.md`, so reference
  material there costs no prompt tokens."
- `:57-58` — before writing, sum top-level `docs/*.md`; if it would exceed 48 KB,
  **warn**.
- `:97` — after writing, "Re-check the 48 KB warning threshold."

### 2.3 The contradiction

`ADR.md` must (a) receive **one new append per decision, forever**, (b) **never**
have entries rewritten or renumbered, and (c) stay **under ~300 lines**.

These are jointly unsatisfiable on any long-lived project. At the prescribed
5-10 lines per entry, ~300 lines caps out at roughly **30-60 decisions total**.
There is no prescribed action for crossing it.

**Searched `skills/harness-docs/SKILL.md` (134 lines) for an escape hatch:**
`archive`, `prune`, `split`, `supersede`, `too large`, `trim`, `grow`, `exceed`
→ **zero hits** other than the `:52` size rule and the `:57`/`:97` warn checks.

So the only prescribed response to crossing 48 KB is "warn" — warn a human, who
is then given no sanctioned move. Meanwhile `:52` says details belong in
`docs/reference/`, but `ADR.md` itself is a core doc, and Mode B forbids rewriting
its entries — so the natural move (relocate old entries to reference) is not
obviously sanctioned either.

## 3. Why upstream has not hit this

**`final-harness` does not dogfood its own engine.** Verified at `6de63ba`
working tree:

- `.harness/` — **absent**
- `scripts/execute.py` — **absent** (the engine exists only as a template under
  `skills/harness-init/templates/engine/`)
- `.claude/engine-manifest.json` — **absent**
- `docs/` top-level — **only `INSTALL.md`, 10,815 bytes**. No PRD/ARCHITECTURE/ADR.

The engine is authored here but run elsewhere. The docs lifecycle it prescribes
has therefore never been executed against this repo's own decision history, and
the growth curve never materialized upstream.

## 4. Why it surfaced downstream first

The consumer project's decision entries run **30-60 lines each** — roughly
**6-10× the prescribed 5-10 lines**. That density is a downstream deviation and it
brought the wall forward. But density only changes *when* the wall is reached, not
*whether*: with perfectly disciplined 5-10 line entries, an append-only injected
log still terminates at ~30-60 decisions.

Secondary downstream note (not upstream's concern, recorded for context): the
consumer named the file `docs/DECISIONS.md` rather than `docs/ADR.md`, and
deliberately did not create `ADR.md` to avoid a dual decision system. The glob is
name-agnostic, so the file was injected regardless — the consumer's own decision
record (`D-020`) had designated `PRD.md`/`ARCHITECTURE.md` as the worker's context
vehicle, and the decision log's injection was incidental to its directory, not
intended.

## 5. Candidate directions (maintainer decides — none prescribed)

Listed with the trade-off that matters, not ranked:

1. **Sanction an archival move in `harness-docs`.** e.g. "when `ADR.md` approaches
   ~300 lines / the 48 KB sum, move the oldest entries verbatim to
   `docs/reference/adr-archive.md` and leave a pointer line; never edit entry text."
   Keeps append-only semantics (entries are moved, not rewritten) and matches the
   existing `:37` precedent ("absorbed content's source moves to `docs/reference/`
   — kept but not injected"). Cost: `ADR-NNN` lookups now span two files; the skill
   must state which one is authoritative.
2. **Two-tier ADR by design.** `docs/ADR.md` holds only *currently binding*
   decisions in one line each (`ADR-007 — <one-line rule> → reference/adr/007.md`);
   full Context/Decision/Consequences live unindexed in `docs/reference/adr/`.
   Cost: an explicit "still binding?" judgement per entry, and drift risk between
   the one-liner and the record.
3. **Make the budget enforceable rather than advisory at author time.** The skill
   already asks the author to sum bytes (`:57`, `:97`); a `harness-audit` check that
   fails on >48 KB would turn a warning nobody acts on into a gate. Cost: does not
   solve the growth itself, only surfaces it earlier.
4. **Narrow what the engine injects.** e.g. an opt-in manifest (`docs/.inject`) or
   an explicit core-three allowlist instead of `glob("*.md")`. Cost: engine change,
   affects every consumer, and silently drops context for projects relying on the
   glob today.
5. **Accept and document the ceiling.** State plainly in `harness-docs` that the
   core three are bounded and that a project exceeding them must relocate material,
   naming the sanctioned target. Cost: none technically; it just makes the human's
   move legal and explicit instead of undefined.

Direction 1 or 5 appear cheapest to adopt because both are pure skill-text changes
and neither touches `execute.py` (so no consumer re-pin, no `skipped_modified`
churn for projects that vendored the engine).

## 6. What the downstream consumer is doing meanwhile

Recorded so upstream knows the workaround exists and can ignore or supersede it:

`sap-agentic-harness` is relocating its full decision log to
`docs/reference/DECISIONS.md` (out of the injected glob), keeping worker-facing
decision content as thin summaries inside `docs/PRD.md` / `docs/ARCHITECTURE.md`.
This follows `SKILL.md:52` ("details go to `docs/reference/` … costs no prompt
tokens") and `:37` ("moves to `docs/reference/` — kept but not injected"). The
file is moved intact; no entry text is edited, so the project's append-only
contract holds. Interactive sessions read the log on demand via a pointer in
`CLAUDE.md` and are unaffected by the relocation; only engine step workers lose
the raw log, which `D-020` had never designated as their context source.

If upstream adopts a different sanctioned pattern, the consumer will re-align.

## 7. Unverified / out of scope

- The **uncommitted 0.19.4 working-tree state** (20 modified files, including
  `install_engine.py` and `execute.py`) was **not** examined. If it already changes
  injection or the docs lifecycle, this report may be stale.
- No other consumer projects were surveyed; the growth-rate claim comes from one
  project's two-day sample.
- Whether `harness-audit` currently checks doc size at all was **not** verified.
