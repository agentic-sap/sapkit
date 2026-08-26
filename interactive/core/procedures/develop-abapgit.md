---
name: develop-abapgit
description: Offline delivery path for ABAP — author and check sources inside a local abapGit mirror seeded from a full package export, build a whole-package ZIP, and hand it to the user, who imports it through the abapGit UI themselves. The agent never connects to SAP; the ZIP is the deliverable, and import, activation, and transport stay with the user.
---

# Develop via abapGit — offline ZIP delivery

sapkit's usual path applies ABAP to SAP over a live ADT connection. This procedure is the
second path, and **nothing the agent does here touches SAP.** The agent writes and checks
ABAP inside a local abapGit mirror, packs the whole package into a ZIP, and hands that ZIP
over. The **user** imports it through the abapGit UI on their own system.

It exists because the product has to be able to finish the job in environments where MCP
cannot be used — a closed network, no ADT reachability, a system where the abapGit UI is
the only way in. For some users this is not a fallback but the only path, so it is not
narrowed for safety: the risks below are handled by seeding from the server's own export
and by warning up front, never by refusing object types.

`AGENTS.md` already permits user-operated abapGit as a P3 route, and
[source-repair-protocol](../knowledge/abap/conventions/source-repair-protocol.md) already
sends bulk multi-FM repair down it. This procedure is the wiring both of them assumed.

## Use When

- MCP is unavailable, unreliable, or not permitted on the target system, and ABAP still has
  to be delivered.
- A repair spans many function modules at once — writing them one by one triggers the
  whole-group postcheck churn that
  [source-repair-protocol](../knowledge/abap/conventions/source-repair-protocol.md)
  § Sibling-Defect False Failure describes.
- [create-program](./create-program.md) reaches implementation and the user wants the
  result delivered as a ZIP rather than written through MCP (see Entry A below).
- The user asks for an abapGit ZIP by name.

## Do Not Use When

- The change is one small edit to one existing object **and** MCP is live —
  [modify-object](./modify-object.md) gets there in fewer steps. Offer that; do not impose
  it. If the user wants the ZIP anyway, this procedure is the answer.
- **No full export of the target package can be produced.** That is not a slow start, it is
  a stop — see Step 2.
- The user wants the agent to drive abapGit itself. It does not, ever (Safety Rails).

## Out of Scope

- **Online abapGit** — repository-connected pull/push, background sync, any flow where
  abapGit talks to a Git host. This procedure is offline-ZIP only, in both directions.
- **RAP / CDS-family objects and conversion objects.** Not promised in v1. If the seed
  happens to contain an example of one, an attempt may be made — say plainly, at that
  moment, that it sits outside this procedure's contract and that the round trip is the
  only thing that will settle whether it worked.
- **Any code change.** This procedure adds no engine, checker, or hook behaviour and
  changes no MCP tool surface; it composes what already ships.

## Track A Policy Alignment

- **Every step the agent performs is P0 offline.** No SAP connection is opened at any point
  between Step 1 and Step 6.
- **The act that changes SAP is P3 and it belongs to the user.** `AGENTS.md` binds the act,
  not the tool: importing this ZIP is a P3 write, and its DEV-only rule holds exactly as it
  does for `Update*`. What differs is who performs it and what can be checked mechanically —
  see Step 1.
- **P2 is not implicated.** No step in this procedure pulls SAP row data; an abapGit export
  carries source and object metadata, not table contents. If a task genuinely needs row
  data, that is a separate P2 action with its own per-call approval, run elsewhere.
- **P4 is untouched.** Transport assignment, release, and import belong to the user.
- **The state cap is `DRAFT` until the user reports back**, and `PROVISIONAL_WRITE` after —
  never `COMPLETE` on the strength of a report. Step 7 is the whole of it.

## Entry Points

**A — delegated from [create-program](./create-program.md).** The approved spec and the
`.sapkit/program/{PROG}/` artifacts come with it: the spec is already approved, its hash is
already recorded in `approval.json`, and the review gate binds to that hash as it always
does. This entry needs no scope record of its own — Step 1's kickoff gate still runs. It runs
at **Full strength** on the [development-loop](../policies/development-loop.md) intensity
axis, inherited from create-program along with everything else.

**B — standalone invocation** (bulk repair, adding objects to an existing package). There is
no spec and no spec hash here, so the entry gate is a **user confirmation of the target
object list plus a summary of the intended change**, written to
`.sapkit/abapgit/<work-name>/scope.md` before any source is touched. Because there is no
hash to bind to, the independent review (`R-PASS`) binds instead to **`scope.md` plus the
mirror diff** — what was agreed, and what actually changed in the mirror. State that binding
in the review request; a reviewer given neither has nothing to judge against.

**Entry B runs at Full strength too — that is a decision made here**, not something inherited,
because [development-loop](../policies/development-loop.md) leaves this entry open. Its
selection rule is the lightest strength that covers the material risk, judged by blast radius
and reversibility: on this path the blast radius is a whole-package ZIP whose mis-import
**deletes objects**, and the headline case is bulk multi-FM repair. Minimal is ruled out by
definition — that row is *zero* project footprint, and `scope.md` is mandatory here. Note
where the artifacts land: **Entry B's durable set is `.sapkit/abapgit/<work-name>/`**, standing
where the Full row names `.sapkit/program/{PROG}/`. That column describes create-program; this
is the same intensity reached by a different entry, not a lighter one. The repair bound Full
strength carries is stated at Step 7, where the round trip actually happens.

## Step 1 — Kickoff gate

Three things are settled before anything is written, and all three are recorded (Entry B: in
`scope.md`; Entry A: in the run's own artifacts).

1. **DEV-tier affirmation.** Ask the user to confirm explicitly that the system this ZIP is
   destined for is a DEV tier, and record the answer. **This is a procedural norm, not a
   machine gate** — the same grade as the out-of-tool ECC DDIC path
   ([ecc-ddic-fallback](../knowledge/abap/conventions/ecc-ddic-fallback.md)), where the
   agent's deliverable is handed to the user to run. Nothing is connected here, so the
   server-side tier gate that protects the MCP path cannot fire; the affirmation is what
   stands in its place. Say so when asking, rather than implying a check happened.
2. **Rework warning, when new screens (DYNPRO) or GUI statuses (CUA) are in scope.** Newly
   authored screen and CUA XML is the highest-rework-risk area of this path: an import error,
   a repair, and a re-ZIP may go round more than once. Say this at kickoff, before the work
   starts, so the round trips are expected rather than alarming. **This is a warning, not a
   gate** — do not decline the work on it.
3. **Scope confirmation** (Entry B) — the object list and the intended change, in the user's
   own terms, confirmed and written to `scope.md`.

## Step 2 — Seed the mirror (fail-closed)

**The user must supply an abapGit full export of the target package** — a ZIP or a checkout.
**Without it, do not proceed.** Not a partial reconstruction, not "we will fill in the rest",
not authoring from a blank page. Say what is needed and stop until it arrives.

The seed is the format authority. Serialization belongs to the abapGit build installed on
*that* server, and
[abapgit-roundtrip-rule](../knowledge/abap/conventions/abapgit-roundtrip-rule.md) § Caveat
says so explicitly: the rule documents are the starting point, the seed is what governs.
That includes **whether a BOM is present** — do not add or strip one on the basis of a
document; match what the seed's own files show.

If an object type that must be **newly authored** has no example in the seed, ask for **one
additional exported example object of that type from the same server** as a format
reference. One example is enough, and one is the ask — do not request the package again.

## Step 3 — Mirror discipline

These rules bind every later step.

- **Mirror home**: `.sapkit/abapgit/<SID>/<PACKAGE>/`. **Confirm `.sapkit/` is actually ignored
  in this project before writing into it.** Nothing sapkit ships writes that entry into a user
  project's `.gitignore`, and [credential-handling](../policies/credential-handling.md) states
  it as an obligation the repository has to meet rather than a fact already true. Once it is
  ignored, no git checkout conversion can reach these bytes.
- **If the user designates their own git-tracked tree instead**, tell them to pin
  `* text eol=lf` in that tree's `.gitattributes` before anything is written into it —
  [abapgit-roundtrip-rule](../knowledge/abap/conventions/abapgit-roundtrip-rule.md)
  § Line Endings. In a tracked tree that pin is the first half of the fix; Step 6's archive
  check is the second, and both are required.
- **Force LF on every write** ([abapgit-roundtrip-rule](../knowledge/abap/conventions/abapgit-roundtrip-rule.md)
  § Line Endings). This is the agent's own responsibility and the Windows CRLF trap is the
  reason: a trailing CR lands where ABAP expects the statement terminator, and activation
  fails with "period missing" while the `.xml` files come back parser-normalized and
  asymptomatic — so the symptom reads as "structures fine, FMs broken" and points away from
  the cause.
- **Editing touches no XML, as a principle.** For an object that already exists in the seed,
  edit the source `.abap` and nothing else. Only a **newly created** object needs XML
  authored, and that XML **mimics the seed's** corresponding file — same element order, same
  attributes, same conventions — rather than being composed from a specification.
- **Function modules use the mirror's classic representation** — the `*"` interface comment
  block plus `TABLES ... STRUCTURE`. This is direction-specific and deliberate: that form is
  what abapGit serializes and what the ADT write path rejects, and the modern inline form is
  the exact reverse
  ([function-module-rule](../knowledge/abap/conventions/function-module-rule.md)
  § FM Signature Representation Is Direction-Specific). A newly authored FM copies the form
  of an FM already in the seed. Never carry a signature verbatim between the two worlds.
- **What licenses this path at all is the freshness of the seed.** Every cycle starts from an
  export taken now (Mirror Freshness below), so what gets written back is the server's own
  current state plus this cycle's edits. Outside that guarantee the rule is flat: **never
  re-author an object out of a mirror that has been allowed to trail the server** — somebody
  may have edited straight through ADT, and pushing the repo copy over it destroys their work
  without a trace ([source-repair-protocol](../knowledge/abap/conventions/source-repair-protocol.md)
  § Read Before Edit).

## Step 4 — Object scope (v1)

Supporting every type is the principle; this is what v1 promises.

| Type | Notes |
|---|---|
| PROG | Including **screens (DYNPRO)**, **GUI status (CUA)**, and **text pool (TPOOL)** |
| INCLUDE | |
| FUGR / FM | Classic signature form per Step 3; a FUGR pull is delete-and-recreate, so the mirror must carry every member |
| CLAS | |
| INTF | |
| DDIC — TABL / DTEL / DOMA | Apply [abapgit-roundtrip-rule](../knowledge/abap/conventions/abapgit-roundtrip-rule.md) § Structure Serialization Fields when hand-checking or hand-authoring a serialized structure: `ROLLNAME` + `COMPTYPE E` for data-element-typed fields, `DATATYPE` / `LENG` / `DECIMALS` for built-ins, and `REFTABLE` / `REFFIELD` on top for `CURR` |

Screens and CUA are **in scope by owner decision.** Their risk is handled by Step 2's seed
mimicry and Step 1's up-front warning — not by leaving them out. Excluding them would trap
the users who have no other path, which is the whole reason this procedure exists.

**Side effect worth knowing**: on ECC, DDIC objects arriving through an abapGit import make
the MCP path's ECC DDIC fallback — the generated SE38 helper report of
[ecc-ddic-fallback](../knowledge/abap/conventions/ecc-ddic-fallback.md) — unnecessary for
that delivery. The fallback still governs the MCP path; it simply is not on this one.

Anything outside the table (RAP, CDS, conversion objects) is **not promised** — see
Out of Scope.

## Step 5 — Write, then check (offline)

Write the sources into the mirror under Step 3's discipline, then run the checks. There is no
server-side `CheckSyntax` on this path, so these checks are **run explicitly, as a gate** —
and they are run by this procedure itself. **Do not rely on a hook**: hooks are opt-in and
are not installed by default, so a hook that happens to fire is a convenience, never the
evidence.

1. **Per source** — run the bundled checker's 13-rule offline analysis
   (`node "<plugin root>/checker/sapkit-checker.bundle.cjs" analyze <file> --format json`);
   on the Claude adapter the `offline-code-analysis` hook also runs it after each source
   write ([troubleshooting §7](./troubleshooting.md#7-sapkit-checker--local-offline-analysis-bundled)).
   **Judge from the JSON, not the exit code** — `analyze` exits `0` whenever it could run at
   all, findings included. **The gate trips on any finding at `severity: "high"`** —
   equivalently, on `summary.score` coming back `"warning"`. Those are the tops of their
   scales: `high` is the most severe level these 13 rules emit and `"warning"` the highest
   score, so **there is no `critical` to hold out for**, and a reader waiting for one would
   never fire the gate at all. On a `high` finding: repair and re-check, **maximum 3 rounds**
   (the same bound Phase 4 of [create-program](./create-program.md) puts on its fix-and-retry
   loop). A fourth round is a stop-and-report, not another attempt. This bound counts offline
   re-checks inside one cycle and is **not** the repair bound at Step 7.
2. **At the end, across the mirror** —
   `node "<plugin root>/checker/sapkit-checker.bundle.cjs" check <dir>` for INCLUDE
   resolution; unresolved `Z*` / `Y*` / `$*` includes are defects and this surface exits `1`
   on them.
   ⚠ **Known limitation — settle its output against the seed before acting on it.** Resolution
   indexes basenames as `<name>.prog.abap`, `<name>.fugr.abap`, or `<name>.abap` and nothing
   else, so abapGit's function-group member form `<fugr>.fugr.<include>.abap` is never indexed
   at all. On a FUGR mirror whose files are complete and correct, **both** outcomes have been
   measured as artifacts of that gap: an `I [unresolved_include]` line at **exit 0** — reads
   clean while a real include went unseen — and an `E [unresolved_include]` line at **exit 1**,
   a false defect that would send a repair round trip chasing nothing. A program-style mirror
   (`*.prog.abap`) resolves normally. FUGR/FM is a named v1 supported type and bulk multi-FM
   repair is this procedure's headline case, so this is precisely the shape that needs the
   care: for every `unresolved_include` on a FUGR mirror, go look — is that file actually in
   the seed? — before reading the result as either a pass or a defect.
3. **XML** — well-formedness, plus a structural comparison against the seed's corresponding
   file (element order, attribute set, conventions). **State plainly that no machine verifier
   exists for this step**: it is the agent's own review, and it is the weakest link in the
   chain. Say so in the handover rather than letting it read as a passed check.

None of these three is a syntax check. Syntax and activation authority stays with the server,
and on this path the server is reached only when the user imports.

## Step 6 — Build the whole-package ZIP

- **Whole-package ZIPs only. Partial ZIPs are forbidden.** An offline abapGit import reads
  the ZIP as the complete remote state, so every package object the ZIP omits shows up in the
  pull list as a delete candidate. With a complete ZIP that list is **structurally empty** and
  the accident becomes impossible; with a partial one it is one mis-click away. A FUGR pull is
  delete-and-recreate rather than a merge, which makes this sharpest of all for function
  groups — a missing member is a deleted member
  ([abapgit-roundtrip-rule](../knowledge/abap/conventions/abapgit-roundtrip-rule.md)
  § Offline ZIP Is the Entire Remote State, § FUGR Pull Is Delete-and-Recreate).
- **Verify the archive**: every `.abap` entry inside the built ZIP holds **zero CRLF bytes**.
  Forcing LF on write is the first half and this is the second; neither substitutes for the
  other, because what matters is the bytes that actually landed in the archive.
- **No mirror-management files in the ZIP** — `.gitattributes`, `.gitignore`, editor
  scratch, and anything else that manages the mirror rather than describing an object.
- Write the ZIP beside the mirror as `.sapkit/abapgit/<SID>/<PACKAGE>-<YYYYMMDD-HHMM>.zip`.
  The stamp is not decoration: a repair round trip produces a second ZIP, and overwriting the
  first would leave the user importing a file that no longer matches what was described.

## Step 7 — Hand over, then read the report back into a status

The agent stops at the ZIP. Hand it over with the path, what it contains, and import
guidance covering at least these two, **by reference — do not copy the rule text in**:

- **Overwrite-all on pull is normal** after direct ADT edits, and harmless against a
  full same-source mirror.
- **Skip SUSH delete proposals** — auto-generated start-authorization defaults, managed
  outside the repo.

Both are [abapgit-roundtrip-rule](../knowledge/abap/conventions/abapgit-roundtrip-rule.md)
§ Overwrite-All on Pull Is Normal and § Skip SUSH Delete Proposals. Point at them.

Then the status, and it is the part most easily got wrong:

| What has happened | Status |
|---|---|
| Mirror written, checks passed, review done — SAP unchanged | **`DRAFT`** |
| The user reports the import and activation succeeded | **`PROVISIONAL_WRITE`** |
| A read-back confirms it *and* an independent review passes | **`COMPLETE`** |
| The user reports the import **failed** | **`PROVISIONAL_WRITE`**, with an unknown-state note |

- The user's report is **an affirmation on record, not a machine PASS.** It is the same
  principle that makes an MCP success `PROVISIONAL_WRITE` — the claim comes from the side
  that did the writing. Do not upgrade it because it was a person who said it.
- **`COMPLETE` is reachable only where an MCP read is available**: the machine confirmation
  of [verify-applied](./verify-applied.md) — read the source back out of SAP and compare it
  against what was sent — plus `CheckSyntax`, plus `GetInactiveObjects` returning zero, plus
  the independent fresh-context `R-PASS` ([review-checklist](./review-checklist.md)).
  ⚠ **For function modules, substitute the signature representation before comparing the
  body bytes.** The mirror's classic form and the server's modern inline form are mismatched
  *by definition*, so a raw comparison reports a false mismatch every time. Compare the body
  bytes; compare the signature by meaning.
- **Where no MCP read is available, stop at `PROVISIONAL_WRITE` and record it as such.**
  There is no path from here to `COMPLETE` on that system, and saying otherwise is
  over-reporting.
- **A reported failure never regresses to `DRAFT`.** A failed import means the server is in
  an **unknown** state — partial application is entirely possible. Record
  `PROVISIONAL_WRITE` with the unknown-state note, take the errors, repair the mirror,
  **rebuild the WHOLE ZIP** (Step 6 — never a patch ZIP of "just the fix"), and re-import.
  Where an MCP read is available, use `GetInactiveObjects` to find out what the system
  actually holds before repairing blind.
- **The round trip is bounded: an initial review plus at most 2 repair/re-verify rounds**
  ([development-loop](../policies/development-loop.md) — the same bound at every strength).
  One round here is a whole cycle: repair the mirror, rebuild the ZIP, the user re-imports,
  the user reports back. If a third would be needed, stop, preserve the evidence, and report
  what is unresolved — never a quiet further attempt, and never a completion claim to close
  it out. ⚠ Do not read this as Step 5's maximum-3: that one counts offline re-checks against
  the checker inside a single cycle, before any ZIP exists.

## Mirror Freshness

**Every cycle works from a fresh export.** One cycle is one repair round trip: export →
write → check → ZIP → the user's import → the user's report. The next cycle starts by asking
for the export again.

- **Reusing a mirror across sessions is forbidden.** The server is allowed to have moved
  ahead of the mirror — somebody may have edited straight through ADT — and re-authoring
  from a stale mirror silently overwrites those edits
  ([source-repair-protocol](../knowledge/abap/conventions/source-repair-protocol.md)
  § Read Before Edit — Never Re-Author From the Repo).
- **Immediately before the user imports**, ask once: were there direct edits on the server
  since this export was taken? If yes, re-export, re-apply the changes onto the new seed, and
  rebuild the ZIP. Asking costs a sentence; skipping it costs somebody's work.

## Safety Rails

- **DEV tier only.** The import is a P3 write and DEV-only holds. Offline means the machine
  gate cannot fire, which raises the bar on the affirmation rather than lowering it (Step 1).
- **Import and transport are entirely the user's.** The agent stops at the ZIP. **Wiring the
  agent to drive abapGit automatically is forbidden** — not deferred, not "future work".
  Doing it would put a second, ungated route into SAP beside the MCP one, and the gates would
  then guard only one of them.
- **No connection details, credentials, or secrets** in the mirror, in `scope.md`, or in the
  ZIP. Name a system by its profile alias and nothing more
  ([credential-handling](../policies/credential-handling.md)).
- **No row data anywhere in this path.** An export ZIP is source plus object metadata; if
  something in the mirror looks like table contents, stop and check what is being packed
  ([data-protection](../policies/data-protection/)).
- **Partial ZIPs are forbidden** (Step 6). This is the one rail whose violation deletes
  objects rather than merely failing.
- **Never report `COMPLETE` from a user's success report alone** (Step 7).

## State Files

Entry A inherits [create-program](./create-program.md)'s `.sapkit/program/{PROG}/`
artifacts unchanged — see its own State Files section. This procedure adds three, and no
more:

- `.sapkit/abapgit/<work-name>/scope.md` — **Entry B only.** The confirmed object list, the
  summary of the intended change, the DEV-tier affirmation, and which export the mirror was
  seeded from. It is the review's binding subject in the absence of a spec hash, so it is
  written **before** any source is touched. When the user reports back, append the outcome
  and the resulting status here rather than opening another file. `<work-name>` is the user's
  label for the work and **must be kept distinct from a bare three-character system id** —
  it sits at the same level as `<SID>` below, so a SID-shaped label would collide with a
  mirror root.
- `.sapkit/abapgit/<SID>/<PACKAGE>/` — the mirror. A working tree for **one cycle**, not a
  kept artifact: the next cycle re-seeds it from a fresh export (Mirror Freshness).
- `.sapkit/abapgit/<SID>/<PACKAGE>-<YYYYMMDD-HHMM>.zip` — the deliverable. Timestamped so a
  repair round trip's rebuild never overwrites the ZIP the user may still be importing.
