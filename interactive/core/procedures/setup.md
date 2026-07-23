---
name: setup
description: Interactive onboarding wizard — SAP connection profile, project context files, permission template merge, safety hooks, optional vsp install, and a final layered self-check.
---

# Setup Wizard

Run this once per project (or re-run any single step after a change). Six steps,
in order — each depends on the one before it. **Attended throughout**: before
writing a file or running a script, summarize what this step is about to do and
get user confirmation first. Never batch multiple steps' writes into one
unconfirmed action.

On a re-run over an existing project, Step 0 must first detect which
artifacts already exist (profile dir, `.sc4sap/active-profile.txt`,
`.sc4sap/config.json`, permission entries, registered hooks). Each subsequent
step then branches per artifact: verify-and-report if it exists, create only
what is missing or broken — never rewrite a healthy existing artifact.

**Hard rule (R-005)**: this wizard never asks for, generates, nor prints a
password or any other secret. Wherever a secret would go, write an empty
placeholder and tell the user to fill it in by hand afterward.

## Step 0 — Detect & Verify

1. Detect the harness: on Claude Code, `${CLAUDE_PLUGIN_ROOT}` resolves and the
   `sapkit` skills are visible; on Codex, the plugin was added via
   `codex plugin add sapkit@agentic-sap`; on Antigravity, via
   `agy plugin install`. Report which one you're running under.
2. Call a light MCP tool (`GetSession`) to confirm the `sap` server responds at
   all.
3. If no connection profile exists yet, `GetSession` will report an
   **inspection-only** session (no live SAP connection) — this is the expected
   state before Step 1, not an error. Tell the user this plainly, then continue.

## Step 1 — Connection Profile

1. Scan `$SC4SAP_HOME_DIR/profiles/` for existing profile aliases if that env
   var is set on this machine, otherwise `~/.sc4sap/profiles/` (the engine's
   built-in default). If any exist, list them and ask the user to pick one
   for this project, or create a new one.
2. If creating a new profile, ask for an alias (`{COMPANY}-{TIER}` convention,
   e.g. `KR-DEV` — never `default`) and walk through the connection keys by
   **name only**: `SAP_URL`, `SAP_CLIENT`, `SAP_USERNAME`, `SAP_PASSWORD`,
   `SAP_TIER`, `SAP_ACTIVE_MODULES`, `MCP_BLOCKLIST_PROFILE`. Meaning, allowed
   values, and defaults are not repeated here — [project-context](../project-context.md)
   is the reference; point the user there for details.
3. Write `<alias>/sap.env` under the resolved profile home (see item 1) with
   every field the user gave you **except** `SAP_PASSWORD` — leave that line
   blank (`SAP_PASSWORD=`) and tell the user: "Open this file yourself and
   fill in the password — this wizard will not ask for it or display it."
   Mention the OS-keyring alternative
   ([credential-handling](../policies/credential-handling.md)) as a safer option
   than plaintext.
4. Confirm the written file's non-secret fields with the user before moving on.

## Step 2 — Project Context Files

1. Write `.sc4sap/active-profile.txt` — one line, the chosen alias.
2. Walk through `.sc4sap/config.json` fields by name: `sapVersion`,
   `abapRelease`, `activeModules`, `industry`, `country`, `blocklistProfile`.
   Value lists and what each field drives are not repeated here — the table in
   [project-context](../project-context.md) is the reference.
3. Show the two files' final content and get confirmation before writing.

## Step 3 — Permission Template (Claude Code only)

Skip this step entirely on Codex or Antigravity — neither harness has an
equivalent allow-list file to merge. Instead point the user at the matching
section of their adapter README: [adapters/codex/README.md](../../adapters/codex/README.md)
or [adapters/antigravity/README.md](../../adapters/antigravity/README.md).

On Claude Code (`PLUGIN_ROOT` below = the plugin root the skill wrapper resolved —
the directory containing `core/` and `adapters/`; the shell's working directory
is the user's project, so bare relative paths will NOT find these files). If your
installed plugin cache turns out not to contain `adapters/` or `scripts/`,
downgrade the affected step (3, 4, or 5) to guidance — point the user at the
matching adapter README section instead of running the command, and say so
plainly rather than failing silently:

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

## Step 4 — Safety Hooks (Claude Code only)

Skip this step on Codex or Antigravity and point the user at their adapter
README's own defense-layer section instead
([adapters/codex/README.md](../../adapters/codex/README.md) §"실데이터 2종 하드 차단",
[adapters/antigravity/README.md](../../adapters/antigravity/README.md) §"안전 모델 주의").

On Claude Code, after user confirmation, run (substitute `PLUGIN_ROOT` with the
resolved plugin root — the working directory is the user's project):

```
node "PLUGIN_ROOT/adapters/claude/hooks/install-hooks.mjs" --project .
```

Report the hooks it registered (block-forbidden-tables, tier-readonly-guard,
prefer-sqlquery-explicit-fields). `transport-validator.mjs` and
`syntax-checker.mjs` ship in the same hooks directory but are NOT
auto-registered by the installer (syntax-checker is a PostToolUseFailure hook
the installer does not manage) — report them as present-but-unregistered,
not installed.

## Step 5 — Optional: vsp Offline Verifier

Ask whether the user wants `vsp` — an optional offline ABAP lint/parse tool
that runs with no SAP connection. Skipping it does not limit anything else in
this plugin. If yes, after confirmation run (same `PLUGIN_ROOT` substitution):

```
node "PLUGIN_ROOT/scripts/get-vsp.mjs"
```

This detects OS/arch, downloads the matching release asset, verifies its
sha256, and installs to `~/.sc4sap/bin/vsp` (`vsp.exe` on Windows) only on a
hash match.

## Step 6 — Self-Check

Run the layered checklist in
[troubleshooting §1](troubleshooting.md#1-mcp-server-connection--diagnostic-checklist)
and report PASS/FAIL/WARN/SKIP per layer, same format as that document.
Additionally verify that every hook registered in `.claude/settings.json`
points at a script path that actually exists on disk — a dead path means the
hook is silently inactive (report as FAIL for that hook); a 2026-07-23
dogfood found 2 hooks pointing at a vanished `marketplaces/sc4sap/` path and
337 dead-namespace permission entries, all silent.

Because Step 1 left `SAP_PASSWORD` blank, expect the SAP-connection layer to
come back FAIL/WARN at this point — that is expected, not a wizard bug. Tell
the user to open the profile's `sap.env`, fill in the password, then re-run
**only this step** to confirm the connection.
