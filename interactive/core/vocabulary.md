---
name: vocabulary
description: Standard capability vocabulary — neutral tool names in core ↔ harness-specific tool identifiers in adapters
---

# Capability Vocabulary

Core documents (knowledge, personas, procedures, policies) refer to SAP operations by
**bare capability name** in backticks — e.g. `GetTable`, `CreateProgram`, `CheckSyntax`,
`RunUnitTest`, `GetAtcFindings`. They never carry a harness prefix.

## Adapter mapping contract

Each adapter maps capability names to its harness's actual tool identifiers:

| Harness | Mapping rule |
|---|---|
| Claude Code | `mcp__<plugin-namespace>__<Capability>` (namespace fixed by the adapter's plugin name) |
| Codex | MCP tool name as registered in `config.toml` / plugin `.mcp.json` |
| Antigravity | MCP tool name as registered in the global MCP config |

Because all three harnesses talk to the **same MCP server**
([server/](../server/)), the capability name equals the server's tool name —
adapters only add or strip their namespace prefix.

## Canonical catalog

The authoritative capability list, split by operation class, lives in
[server/tool-catalog/](../server/tool-catalog/):

- `sc4sap-mcp-tools-read.md` — read/search/describe (safe to allow broadly)
- `sc4sap-mcp-tools-write.md` — create/update/delete/activate/transport (gated write)
- `sc4sap-mcp-tools-runtime.md` — dumps, profiling, runtime diagnostics

Two capabilities are **always human-gated per call** regardless of harness:
`GetTableContents`, `GetSqlQuery` — see
[data-extraction-policy](policies/data-protection/data-extraction-policy.md).

## Verification chain (referenced by policies/verification-policy.md)

`CheckSyntax` → `ActivateObjects` → `RunUnitTest` → `GetAtcFindings`
