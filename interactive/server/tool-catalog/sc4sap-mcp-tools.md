<!--
  GENERATED FILE — do not edit by hand.
  Source: the engine tool registry (sapkit-engine/src/tools/registry.ts).
  Regenerate: node harness/render-tool-catalog.mjs   (from sapkit-engine/, after npm run build)
  Gate: the 「카탈로그」 gate inside `npm run gates` (sapkit-engine/gates/catalog.mjs).
        `node harness/render-tool-catalog.mjs --check` makes the same comparison by hand.
-->

# SAP MCP Tool Catalog

The MCP tool surface the bundled SAP ADT server exposes. Since 2026-08-19 that
server is this repository's own `sapkit-engine` (D-095), and these files are
generated from its tool registry — so the catalog and the shipped surface cannot
drift apart without the gate noticing.

Tools are listed by **bare capability name**. Each harness maps those names to its
own tool identifiers — see the [capability vocabulary](../../core/vocabulary.md)
(Claude Code, for instance, prefixes `mcp__<plugin-namespace>__`).

**Who reads this**: adapter exposure presets (Codex `--exposition`), permission
policy classification ([verification-policy](../../core/policies/verification-policy.md) ·
[vocabulary](../../core/vocabulary.md)), and any procedure that needs to walk the
whole surface by operation class.

## Section files

| File | Categories | Count |
|---|---|---:|
| [sc4sap-mcp-tools-read.md](sc4sap-mcp-tools-read.md) | Get\*, Read\*, Check\*/List\*/Search\*/Describe\*/Grep\* | 90 |
| [sc4sap-mcp-tools-write.md](sc4sap-mcp-tools-write.md) | Create\*, Update\*, Delete\*, Activate\*/Patch\*/Release\*/Write\* | 79 |
| [sc4sap-mcp-tools-runtime.md](sc4sap-mcp-tools-runtime.md) | Runtime\*, execution, session control | 15 |

**Registered tools**: 186. **Listed above**: 184. **Prompt-gated (never
auto-approve)**: 2.

⚠ A running server can report **fewer** than 186. Program and screen tools only
appear once a profile is active, so a bundle started without one answers
`tools/list` with an inspection-only subset. The registry — and therefore this
catalog — always holds the full set.

## Prompt-gated tools — never auto-approve

- `GetTableContents`
- `GetSqlQuery`

These stay callable but need an explicit per-call decision from the user, so they
are **deliberately absent from every section file**: a consumer that pastes a
section list into a permission template must not pick them up by accident.

The line is drawn at row data, not at reading. Metadata calls (`GetTable`,
`GetStructure`, `GetDataElement`) return DDIC schema and are safe to
auto-approve; the two above pull actual table rows, which can carry personal,
financial, or authorization-sensitive records. See
[data-extraction-policy](../../core/policies/data-protection/data-extraction-policy.md).

## Do not grant the namespace with a wildcard

A wildcard such as `mcp__plugin_sapkit_sap__*` silently swallows the two gated
tools above. Enumerate the names instead — that is what
`scripts/gen-permissions.mjs` does from a live `tools/list`.

## Regenerating

```
cd sapkit-engine && npm run build && node harness/render-tool-catalog.mjs
```

`npm run gates` makes the same comparison in its 「카탈로그」 gate and fails if
these files no longer match the registry; `node harness/render-tool-catalog.mjs
--check` runs that comparison by hand.
