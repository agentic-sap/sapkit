<!--
  GENERATED FILE — do not edit by hand.
  Source: the engine tool registry (sapkit-engine/src/tools/registry.ts).
  Regenerate: node harness/render-tool-catalog.mjs   (from sapkit-engine/, after npm run build)
  Gate: the 「카탈로그」 gate inside `npm run gates` (sapkit-engine/gates/catalog.mjs).
        `node harness/render-tool-catalog.mjs --check` makes the same comparison by hand.
-->

# SAP MCP Tool Catalog — Runtime operations

Runtime diagnostics (dumps, profiler traces, gateway errors, system messages),
unit test execution, service binding validation, and server session control.

Part of [sapkit-mcp-tools.md](sapkit-mcp-tools.md).

Tools are listed by **bare capability name**. Each harness maps those names to its
own tool identifiers — see the [capability vocabulary](../../core/vocabulary.md)
(Claude Code, for instance, prefixes `mcp__<plugin-namespace>__`).

## Runtime* — Dump / Profiler / Diagnostics

- `RuntimeAnalyzeDump`
- `RuntimeAnalyzeProfilerTrace`
- `RuntimeCreateProfilerTraceParameters`
- `RuntimeGetDumpById`
- `RuntimeGetGatewayErrorLog`
- `RuntimeGetProfilerTraceData`
- `RuntimeListDumps`
- `RuntimeListFeeds`
- `RuntimeListProfilerTraceFiles`
- `RuntimeListSystemMessages`
- `RuntimeRunClassWithProfiling`
- `RuntimeRunProgramWithProfiling`

## Unit Test Execution & Validation

- `RunUnitTest`
- `ValidateServiceBinding`

## Server Session Control

- `ReloadProfile`

`ReloadProfile` re-reads the active profile and drops the cached connection, so
it changes **which SAP system** later calls reach. Treat a profile switch as a
deliberate user action, never a routine auto-approved step. The profile itself
lives outside the repository — see
[project-context](../../core/project-context.md).
