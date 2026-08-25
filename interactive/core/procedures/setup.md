---
name: setup
description: Interactive onboarding wizard — SAP connection profile, project context files with tool-surface selection, and a layered self-check, plus optional permission-template and safety-hook switches.
---

# Setup Wizard

Run this once per project (or re-run any single step after a change). Step 0
through Step 6, in order — each depends on the one before it. **Attended
throughout**: before writing a file or running a script, summarize what this
step is about to do and get user confirmation first. Never batch multiple
steps' writes into one unconfirmed action — concretely, that means every
`setup-state.mjs plan` is shown to the user and confirmed before the matching
`apply` runs.

**Hard rule (R-005)**: this wizard never asks for, generates, nor prints a
password or any other secret. Wherever a secret would go, write an empty
placeholder and tell the user to fill it in by hand afterward.
`scripts/setup-state.mjs` enforces this at the tool level too — its input
schema rejects any field whose name looks like a secret (`password`, `token`,
`secret`, ...) before writing anything, and it never writes a non-blank
`SAP_PASSWORD` regardless of what input it is given.

On a re-run over an existing project, Step 1 pulls a full status snapshot
before anything else — see below. Every step from Step 1 onward branches off
that snapshot: verify-and-report what already exists, create only what is
missing or broken, and never rewrite a healthy existing artifact.

## Step 0 — Detect & Verify

1. Detect the harness: on Claude Code, `${CLAUDE_PLUGIN_ROOT}` resolves and the
   `sapkit` skills are visible; on Codex, the plugin was added via
   `codex plugin add sapkit@agentic-sap`; on Antigravity, via
   `agy plugin install`. Report which one you're running under.
2. Call a light MCP tool (`GetSession`) to confirm the `sap` server responds at
   all.
3. If no connection profile exists yet, `GetSession` will report an
   **inspection-only** session (no live SAP connection) — this is the expected
   state before Step 2, not an error. Tell the user this plainly, then continue.
4. **Codex only** — the bundled MCP wrapper may still carry an unresolved
   `{{SAPKIT_PLUGIN_ROOT}}` path token right after a fresh install: skills load
   fine, but the `sap` server itself doesn't start yet (harmless — its
   manifest entry is `required:false`, so the session stays usable). Check
   (implemented and E2E-tested as of 2026-08-02):
   ```
   node "<installed plugin cache>/scripts/codex-wire-mcp.mjs" status --json
   ```
   Read the JSON's `overall` (the worst state across every installation found)
   and per-installation `installations[].state`:

   | state | meaning | action |
   |---|---|---|
   | `WIRED_OK` | already resolved to an absolute path | nothing to do |
   | `TOKEN_PENDING` | fresh install, token not yet resolved | run `apply` below, then carry this into Step 5 |
   | `STALE_PATH` | previously wired, path no longer valid (e.g. after an update) | run `apply` below, then carry this into Step 5 |
   | `NOT_FOUND` | no installation found | treat as Codex not installed — skip the rest of this item |
   | `PARSE_ERROR` | manifest/config could not be parsed | stop and report it — do not auto-proceed; this needs a human look |

   On `TOKEN_PENDING` or `STALE_PATH`, tell the user, then run:
   ```
   node "<installed plugin cache>/scripts/codex-wire-mcp.mjs" apply --json
   ```
   This auto-locates the installed plugin cache and rewrites the token to an
   absolute path (idempotent — a no-op if already wired). Tell the user to
   start a **new Codex session** afterward so the MCP server picks up the
   change. The same command repairs a stale path after a plugin update (see
   [adapters/codex/README.md](../../adapters/codex/README.md)). If a very old
   installed cache predates this script entirely, skip this item and downgrade
   to guidance — same fallback pattern as Step 4's intro below.

## Step 1 — Existing State Summary

1. Run:
   ```
   node "PLUGIN_ROOT/scripts/setup-state.mjs" status --project <project path> --json
   ```
   (`PLUGIN_ROOT` = the plugin root Step 0 resolved.) This is read-only — it
   never writes anything. It reports: this project's runtime directory
   (`.sapkit/`); the active profile alias and how complete its `sap.env` is (which
   canonical keys are present/empty, and whether a password value exists —
   never the values themselves); `config.json`'s known/unknown keys and
   current `toolSurface`; which of Claude/Codex/Antigravity are on `PATH`; and
   a few out-of-scope items (permission-template file, hooks installer) that
   Step 4 owns, plus whether the bundled SAPKIT checker is present.
2. Summarize this in plain language for the user before doing anything else.

## Step 2 — Connection Profile

1. Resolve the profile home conversationally: `$SAPKIT_HOME_DIR` if set on this
   machine, else `~/.sapkit`. Step 1's status output already
   shows which homes exist and which profile aliases live under each
   (`homes[]`) — use that instead of re-scanning the filesystem yourself. If
   any aliases exist, list them and ask the user to pick one for this project,
   or create a new one.
2. If creating a new profile, ask for an alias (`{COMPANY}-{TIER}` convention,
   e.g. `KR-DEV` — never `default`) and walk through the connection keys by
   **name only**: `SAP_URL`, `SAP_CLIENT`, `SAP_USERNAME`, `SAP_PASSWORD`,
   `SAP_TIER`, `SAP_ACTIVE_MODULES`, `MCP_BLOCKLIST_PROFILE`. Meaning, allowed
   values, and defaults are not repeated here — [project-context](../project-context.md)
   is the reference; point the user there for details.
3. Build the plan input as JSON —
   `{"profile": {"alias": "<alias>", "env": {...the fields the user gave you,
   excluding SAP_PASSWORD...}}}` — and write it to a temp file (any scratch
   location outside `.sapkit/` — this input file is not part of the project's
   runtime state) **using your own file-write tool (Write/Edit) or a plain
   Node one-liner — never a PowerShell redirect** (`>`, `Out-File` without
   `-Encoding utf8`): a PowerShell redirect has produced a BOM/UTF-16 file
   this tool cannot parse before (see `setup-state.mjs`'s own header comment
   on the incident). Then run:
   ```
   node "PLUGIN_ROOT/scripts/setup-state.mjs" plan --project <project path> --input <input.json> --out <plan.json> --json
   ```
4. Show the plan to the user — target path, which fields will be written,
   anything preserved or in conflict — and get confirmation. Nothing has been
   written to disk yet.
5. On confirmation, run:
   ```
   node "PLUGIN_ROOT/scripts/setup-state.mjs" apply --project <project path> --plan <plan.json> --json
   ```
   `SAP_PASSWORD` is always left as a blank line (`SAP_PASSWORD=`) no matter
   what — this tool never writes a password. Tell the user: "Open this file
   yourself and fill in the password — this wizard will not ask for it or
   display it." Mention the OS-keyring alternative
   ([credential-handling](../policies/credential-handling.md)) as a safer
   option than plaintext.
6. If disk state changed between `plan` and `apply` (e.g. the user hand-edited
   the file in between), `apply` reports `BLOCKED` and writes nothing —
   rebuild the plan and reconfirm rather than retrying blindly.
7. Confirm the applied result (or the fact that it was already correct — a
   byte-noop) with the user before moving on.

## Step 3 — Project Context & Tool Surface

1. Decide the target `toolSurface`: `readonly` (default, recommended) or
   `development`. `development` only takes effect when the chosen profile's
   `SAP_TIER=DEV` **and** the user explicitly asks for it here — otherwise the
   launcher falls back to `readonly` (fail-closed by design, not a bug). Tell
   the user this plainly before asking. A `toolSurface` change needs an MCP
   restart to take effect (Step 5).
2. Walk through the rest of `config.json`'s fields by **name only**:
   `sapVersion`, `abapRelease`, `activeModules`, `industry`, `country`,
   `blocklistProfile`, and `toolSurface` (decided above). Value lists and what
   each field drives are not repeated here — the table in
   [project-context](../project-context.md) is the reference (`toolSurface` is
   not in that table yet — see design v2 §7-1 in the meantime). Also confirm
   `active-profile.txt` should point at the alias chosen/created in Step 2.

   `blocklistProfile` here is what the `block-forbidden-tables` **hook** reads
   when the user later turns hooks on (Step 4c) — accepted values there are
   `minimal`\|`standard`\|`strict`\|`custom`. This is a **different** setting
   from the server-side `MCP_BLOCKLIST_PROFILE` env key from Step 2 (part of
   `sap.env`), which is what actually gates row-data access in the
   hooks-off default state. Tell the user plainly: the server only accepts
   `minimal`\|`standard`(default)\|`strict`\|`off` for that key — anything
   else falls back to `standard`, so a typo can only land on the default and
   never below it. The three keys
   (`MCP_BLOCKLIST_PROFILE`/`MCP_BLOCKLIST_EXTEND`/`MCP_ALLOW_TABLE`) reach the
   server through **two** channels — the active profile's `sap.env` and the
   server's own process environment (a shell export, or an `env` block in the
   MCP registration) — but **the process environment may only tighten this
   guard, never loosen it**: `MCP_ALLOW_TABLE` is read from the profile file
   alone, a level name from the environment applies only when it is stricter
   than the profile's, and the two `MCP_BLOCKLIST_EXTEND` lists are unioned.
   So the answer to "how do I open something up" is always the same: edit
   `sap.env` (Step 2), not `config.json` and not the environment. (That rule
   covers the file's **contents**; `MCP_ENV_PATH`/`SAPKIT_HOME_DIR` still pick
   **which** profile file is read, so it is a rule about where an opening value
   can be written, not a wall.)

   > Changed on 2026-08-19 (decisions D-095/D-096). Before that release the
   > engine deleted those three keys from its process environment at startup,
   > so `sap.env` was their only working channel at all. If you are reading an
   > older note that says an `env` block is "silently discarded", that was true
   > then and is not true now — what is still true is that it cannot open
   > anything.
3. Optional: if the user has local best-practice knowledge vaults (directories
   of `.md` notes from real implementations), offer to register them as
   `referenceLibraries` — consultant answers will consult them first
   ([project-context](../project-context.md), D-050). Skipping changes nothing.
4. Build the plan input — `{"project": {"activeProfile": "<alias>", "config":
   {...the fields above...}}}` — with the same file-write caution as Step 2.
   Run `plan`, show it to the user, get confirmation, then `apply` — the same
   plan/confirm/apply round-trip as Step 2, kept as its own confirmed action
   rather than folded into Step 2's.

## Step 4 — Optional: Permission Template, SAPKIT Checker, Safety Hooks, and Session Continuity

The switches below — 4a, 4c, and the hook switch inside 4d — are optional and
independent of one another; skip whichever the user doesn't want. 4b installs
nothing; it is one paragraph of orientation. 4d's other two offers are not
switches at all: they write into the user's own project, and are just as
optional as the rest.

On Claude Code (`PLUGIN_ROOT` below = the plugin root the skill wrapper resolved —
the directory containing `core/` and `adapters/`; the shell's working directory
is the user's project, so bare relative paths will NOT find these files). If your
installed plugin cache turns out not to contain `adapters/`, `scripts/`, or
`checker/`, downgrade the affected item (4a, 4b, or 4c) to guidance — point the user at the
matching adapter README section instead of running the command, and say so
plainly rather than failing silently.

### 4a. Permission Template (Claude Code only)

Skip this item entirely on Codex or Antigravity — neither harness has an
equivalent allow-list file to merge. Instead point the user at the matching
section of their adapter README: [adapters/codex/README.md](../../adapters/codex/README.md)
or [adapters/antigravity/README.md](../../adapters/antigravity/README.md).

1. Read `PLUGIN_ROOT/adapters/claude/permissions-template.json` and the project's
   `.claude/settings.local.json` (create the latter with an empty
   `{"permissions":{"allow":[]}}` shape if it doesn't exist yet).
2. Count existing entries in `permissions.allow` — report this count.
3. Merge **additively only**: append every template entry not already present
   (skip duplicates verbatim). Never delete, replace, or reorder an existing
   entry.
4. Count entries after the merge and report both numbers. **If the resulting
   count is lower than the starting count, stop immediately and revert** —
   this must never happen; treat it as a bug in this step, not a valid outcome.
5. Also count `permissions.allow` entries whose `mcp__...` prefix does not
   match the live tool namespace observed this session, and report that count
   as dead entries — do not delete them in this step.
6. Note for the user: `GetTableContents` and `GetSqlQuery` are intentionally
   absent from the template — per-call human approval on those two stays in
   force regardless of this merge.

### 4b. SAPKIT Checker — offline (bundled, any harness)

Nothing to ask and nothing to install here: the **SAPKIT checker** ships inside
the plugin at `PLUGIN_ROOT/checker/sapkit-checker.bundle.cjs`. Tell the user it
is already there, and show one command line (same `PLUGIN_ROOT` substitution):

```
node "PLUGIN_ROOT/checker/sapkit-checker.bundle.cjs" --help
```

It runs entirely on the local machine — no SAP connection, no MCP mode — and
offers `lint` / `parse` / `analyze` / `check`. On the Claude adapter the
optional `offline-code-analysis` hook (Step 4c) calls the `analyze` surface
automatically; on other harnesses the user invokes it directly. Details:
[troubleshooting.md §7](troubleshooting.md#7-sapkit-checker--local-offline-analysis-bundled).

If the user set this machine up on an earlier release, a `vsp` binary may still
sit in the profile home's `bin/` (`~/.sapkit/bin/vsp`, `vsp.exe` on Windows).
Nothing reads it any more — mention it once as safe to delete, and move on.

### 4c. Safety Hooks (optional, Claude Code only)

Skip this item on Codex or Antigravity and point the user at their adapter
README's own defense-layer section instead
([adapters/codex/README.md](../../adapters/codex/README.md) §"실데이터 2종 하드 차단",
[adapters/antigravity/README.md](../../adapters/antigravity/README.md) §"안전 모델 주의") —
Claude is the only harness with a pre-call hook mechanism at all.

Hooks are **not** part of the default path (design v2 §7-4) — the safety floor
now lives in the MCP server itself (tier gate, table blocklist) plus the
Claude permission prompt. Hooks remain a fully supported optional switch for
anyone who wants the extra confirmation dialogs and defense-in-depth; full
detail (what each hook restores, what's already protected without it) is in
[adapters/claude/hooks/README.md](../../adapters/claude/hooks/README.md).

1. Check whether SAPKIT hooks are already wired — read `~/.claude/settings.json`
   and (if present) the project's `.claude/settings.json` / `settings.local.json`
   for the six marker basenames (`block-forbidden-tables.mjs`,
   `tier-readonly-guard.mjs`, `prefer-sqlquery-explicit-fields.mjs`,
   `offline-code-analysis.mjs`, `syntax-checker.mjs`, `transport-validator.mjs`).
2. **Nothing wired (the common case for a new install)**: tell the user hooks
   are optional and, if they want them, point at the one-line install:
   ```
   node "PLUGIN_ROOT/adapters/claude/hooks/install-hooks.mjs" --project .
   ```
   (omit `--project .` to install into the user-level `~/.claude/settings.json`
   instead — see the hooks README for the difference). Only run this after the
   user asks for it — never automatically.
3. **Already wired (a re-run, or a pre-existing user)**: report what's wired
   and where (user settings, project settings, or both) and ask **once**
   whether to remove it. Keeping it is a normal, supported outcome — this is a
   switch, not a deprecated leftover. On approval, run
   `install-hooks.mjs --uninstall` (add `--project .` to target the project
   scope that was found instead of the user scope).

### 4d. Session continuity (optional)

Session continuity is two files at the **project root** — `HANDOFF.md` (where
the work got to) and `RUN-PLAN.md` (the queue) — kept current by the
[handoff](./handoff.md) skill (`/sapkit:handoff` on Claude Code) so the next
session does not start from an empty context. Each file carries the ownership
marker `<!-- sapkit:continuity -->` on line 1, and a read scans the **first 20
lines** for it.

Items 2 and 3 below are Claude Code only — skip them entirely on Codex or
Antigravity (neither has a `CLAUDE.md` to add a line to, nor a pre-call hook
mechanism) and point the user at the matching section of their adapter README
instead: [adapters/codex/README.md](../../adapters/codex/README.md) or
[adapters/antigravity/README.md](../../adapters/antigravity/README.md). Item 1
is harness-neutral — the two files are plain Markdown the user reads themselves.

**Report the verdict before offering anything.** Read both files at the project
root and apply the ownership decision table in
[handoff §1](./handoff.md#1-decide-ownership--fail-closed) — that table is the
authority here, not a copy of it. Its three rows in short:

| Situation | What this step may offer |
|---|---|
| Both absent | The pair (item 1) |
| Any same-named file is unmarked | Nothing for that file — it is out of scope |
| Only marked files (one or both) | Already set up; the absent half alone |

A read failure resolves to **unmarked**. Say what you found, once, then move on.

The three offers below are independent and each needs its own explicit yes. None
is a default, and none of them follows from another being accepted.

1. **Create the resume-point pair** (any harness). Offer this only from the
   table's first row, or for the absent half of a marked pair. Copy
   [HANDOFF-template.md](../../assets/continuity/HANDOFF-template.md) and
   [RUN-PLAN-template.md](../../assets/continuity/RUN-PLAN-template.md) —
   shipped at `PLUGIN_ROOT/assets/continuity/` — to the project root, marker
   line included. State the target paths and one line each on what the file is
   for, get an explicit yes, then write; nothing touches disk before the
   answer. **When a same-named file exists unmarked, this offer is not made at
   all** — say once which file it is and that it carries no sapkit marker, then
   go on to item 2. Never write a template over an existing file, whatever it
   contains. Mention once that the `handoff` skill keeps these readable by size
   caps — `HANDOFF.md` 500 lines, `RUN-PLAN.md` 300 — and that going over
   relocates settled records to `archive/` rather than deleting anything.
2. **Add a one-line pointer to the project's `CLAUDE.md`** (Claude Code only).
   Offer to append exactly this English line:
   ```
   At session start read `HANDOFF.md`, this project's resume point; at session end run the `handoff` skill to bring it and `RUN-PLAN.md` up to date.
   ```
   **Additive and idempotent.** Never rewrite, reorder, or reflow anything
   already in that file — append the line and change nothing else. The
   duplicate check is an **exact-string match**: compare that line, whitespace
   trimmed, against every line of the file; if it is already there, say so and
   write nothing. Naming the check is what makes a re-run predictable — a
   reworded or hand-edited copy will not match, so this step would offer the
   canonical line again; point that out and leave the user's wording alone
   rather than "repairing" it. If `CLAUDE.md` does not exist, offer to create
   it containing just that line — again only on approval. Removing the line
   later is the user's own edit: this is their file, so unlike the hook switch
   in item 3 there is no uninstall counterpart.
   **Do not offer this line while a same-named file is out of scope.** The
   sentence tells every future session to read `HANDOFF.md` and close with the
   `handoff` skill — but against an unmarked file that skill will report "out of
   scope" and stop, every time. A standing instruction that can never be carried
   out is worse than no instruction. Say instead, once, that the resume point is
   available the moment that file carries sapkit's marker, or is moved aside, and
   leave the choice with the user.
3. **Point at the continuity hook switch** (Claude Code only). It is a
   **separate** switch from 4c's six safety hooks — installing either one never
   installs the other — and like them it is **not** part of the default path;
   say that plainly. What it does: at session start it injects a short pointer
   at the resume point, and only when a marked `HANDOFF.md` is present;
   otherwise it stays silent. If the user asks for it, show the one-line
   install (project scope):
   ```
   node "PLUGIN_ROOT/adapters/claude/hooks/continuity/install-continuity-hook.mjs" --project .
   ```
   Omit `--project .` to install into the user-level `~/.claude/settings.json`
   instead; add `--uninstall` to remove it. The installer is
   `install-continuity-hook.mjs`, the hook it registers is
   `session-continuity.mjs`, the event is `SessionStart`, and all of it lives
   under `PLUGIN_ROOT/adapters/claude/hooks/continuity/`. **Run it only after
   the user asks — never automatically.**

If your installed plugin cache turns out not to contain `assets/continuity/` or
`adapters/claude/hooks/continuity/`, downgrade the affected offer to guidance —
name what is missing and say so plainly rather than failing silently, the same
fallback as this step's intro.

## Step 5 — Restart Guidance

Tell the user if the MCP server needs to pick up new state before Step 6 can
give a clean result, and how to do that on their harness. Reasons that trigger
this, and where they were surfaced:

- Step 2 wrote or changed a profile's `sap.env` — `apply`'s JSON response
  carries `restartRequired`/`restartReasons`; surface those verbatim rather
  than re-deriving them.
- Step 2 or Step 3 changed the active-profile pointer.
- Step 3 changed `toolSurface` — the tool surface is decided when the MCP
  server starts, not per call.
- Step 0 ran `codex-wire-mcp.mjs apply` (`TOKEN_PENDING` or `STALE_PATH` state).

How to restart: Claude Code — reload the plugin or start a new session; Codex —
start a new session; Antigravity — no live-reload, reinstall per its README if
the change must take effect immediately. If none of the above happened this
run (e.g. a pure status re-run that changed nothing), say so and go straight
to Step 6.

## Step 6 — Self-Check

1. Run:
   ```
   node "PLUGIN_ROOT/scripts/setup-state.mjs" verify --project <project path> --json
   ```
   and report its `state` against this table (design v2 §8-3):

   | state | meaning |
   |---|---|
   | `READY_INSPECTION` | plugin + MCP OK, profile/password not yet complete |
   | `READY_READONLY` | SAP connected + readonly tool surface OK |
   | `READY_DEVELOPMENT` | DEV connected + user chose development + write surface OK |
   | `RESTART_REQUIRED` | config is correct but MCP/plugin needs a reload |
   | `DEGRADED_SKILLS_ONLY` | skills loaded but the bundled MCP failed to start |
   | `BLOCKED` | bad path, parse error, or an unmet safety condition |

   `verify` checks files and structure only — it never probes the live SAP
   connection (that's the MCP session's job, covered by the checklist below).
   A blank `SAP_PASSWORD` alone is expected to land on `READY_INSPECTION`, not
   a failure.
2. Run the layered checklist in
   [troubleshooting §1](troubleshooting.md#1-mcp-server-connection--diagnostic-checklist)
   and report PASS/FAIL/WARN/SKIP per layer, same format as that document.
3. Additionally verify that every hook registered in `.claude/settings.json`
   (and, if Step 4c found one, `~/.claude/settings.json`) points at a script
   path that actually exists on disk — a dead path means the hook is silently
   inactive (report as FAIL for that hook); a 2026-07-23 dogfood found 2 hooks
   pointing at a vanished `marketplaces/sc4sap/` path and 337 dead-namespace
   permission entries, all silent. The continuity hook from Step 4d is covered
   by that same rule **when it is wired**: a `SessionStart` entry pointing at
   `session-continuity.mjs` gets its script path checked exactly like the six
   safety hooks, and a dead path there is the same FAIL. **Not wired is the
   normal state, not a finding** — every hook here is opt-in, so an absent
   continuity entry (like absent safety-hook entries) is reported as absent and
   nothing more.
4. Also run `node "PLUGIN_ROOT/scripts/doctor.mjs"` for its 3-client sync
   checks (bundle integrity, adapter/compatibility drift, hook-wiring
   script-path check) and fold any FAILs into the report.

Because Step 2 leaves `SAP_PASSWORD` blank, expect `READY_INSPECTION` (and the
SAP-connection layer of the checklist above coming back FAIL/WARN) at this
point — that is expected, not a wizard bug. Tell the user to open the
profile's `sap.env`, fill in the password, then re-run **only this step** to
confirm the connection.
