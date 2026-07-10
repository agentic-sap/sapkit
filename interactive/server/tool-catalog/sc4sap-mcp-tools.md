# SAP MCP Tool Catalog (abap-mcp-adt-powerup)

Index of MCP handlers exposed by the bundled `abap-mcp-adt-powerup` server
(**connected** tools/list — profile-active state). Tools are listed by **bare
capability name**; each harness maps names to its own tool identifiers per the
[capability vocabulary](../../core/vocabulary.md) (e.g. Claude Code prefixes
`mcp__<plugin-namespace>__`).

**Consumers**: adapter exposure presets (Codex `--exposition`), permission
policy classification ([verification-policy](../../core/policies/verification-policy.md),
[vocabulary](../../core/vocabulary.md)), and any procedure needing to walk the
full tool surface by operation class.

**Regeneration**: connected tools/list via `server/launch.cjs` with an active
profile — see [README.md](README.md). The inspection-only surface (no profile)
is smaller; never regenerate from it.

## Section files

| File | Categories | Count |
|---|---|---:|
| [sc4sap-mcp-tools-read.md](sc4sap-mcp-tools-read.md) | Get* (safe), Read*, Check*/List*/Search*/Describe*/Grep* | 90 |
| [sc4sap-mcp-tools-write.md](sc4sap-mcp-tools-write.md) | Create*, Update*, Delete*, Activate*/Patch*/Release*/Write* | 79 |
| [sc4sap-mcp-tools-runtime.md](sc4sap-mcp-tools-runtime.md) | Runtime*, Execution, Session control | 15 |

**Total exposed (connected)**: 186. Auto-approvable: 184.
**Prompt-gated (never auto-approve)**: 2.

## Exclusion policy — SAFEGUARDED (do NOT auto-approve)

These two tools remain callable but require an explicit per-call user prompt.
They are deliberately OMITTED from every section file:

- `GetTableContents` — row-level table data extraction
- `GetSqlQuery` — arbitrary SQL read

Rationale: metadata operations (`GetTable`, `GetStructure`, `GetDataElement`)
return DDIC schema and are safe to auto-approve. Row-level extraction risks
pulling PII, financial data, or authorization-sensitive records — each call must
remain an explicit user decision, but the tool itself must stay callable (not
denied). See [data-extraction-policy](../../core/policies/data-protection/data-extraction-policy.md).

## Wildcard prohibition

Do NOT allow the server's whole namespace with a wildcard (e.g.
`mcp__plugin_sap-agentic-harness_sap__*` in Claude Code permissions). Wildcards
silently capture the two excluded tools above. Enumerate from the section files
explicitly — that is what `scripts/gen-permissions.mjs` does from live
tools/list.
