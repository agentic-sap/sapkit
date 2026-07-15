# engine/ — CLAUDE.md

## What this is

Canonical source for the ABAP ADT MCP server bundled into the `interactive/`
plugin as `server/server.bundle.cjs` (incorporated 2026-07-11 into this repo —
see repo-root `docs/reference/DECISIONS.md`, D-017). Fork lineage: mario-andreschak/mcp-abap-adt
→ fr0ster/mcp-abap-adt → babamba2/abap-mcp-adt-powerup → hjaewon/abap-mcp-adt-powerup.

The GitHub repo `hjaewon/abap-mcp-adt-powerup` is kept only as a history archive —
this `engine/` tree is where fixes happen now. Don't edit
`interactive/server/server.bundle.cjs` directly; repair here, then bundle and
reflect the change via `../interactive/server/UPDATE-RUNBOOK.md`.

## Build, test, bundle

```bash
npm test                   # unit tests (jest --passWithNoTests)
npm run test:integration   # against a real SAP system; soft mode by default
                            # (see docs/development/tests/TESTING_GUIDE.md for
                            # tests/test-config.yaml setup)
npm run build               # biome check --write + tsc
npm run bundle               # tools/bundle.mjs → dist/server.bundle.cjs
```

## Versioning

Bump with `npm version <semver> --no-git-tag-version`, then add a matching
entry to `CHANGELOG.md`. Don't git-tag or commit as part of the bump — that's
the caller's responsibility (see UPDATE-RUNBOOK step 1).

## Before/After diffs

Before an Update*/Create*/Delete* tool call changes ABAP source on a live SAP
system, show the user a before/after diff first.
