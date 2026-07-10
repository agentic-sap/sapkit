# SAP MCP Tool Catalog — Runtime operations

Runtime diagnostics (dump / profiler / gateway / system messages), unit test
execution, service binding validation, and server session control.
Part of [sc4sap-mcp-tools.md](sc4sap-mcp-tools.md). Names are bare capability
names (no harness prefix) per [core/vocabulary.md](../../core/vocabulary.md).

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

`ReloadProfile` re-reads `.sc4sap/active-profile.txt` and resets the cached
connection — it changes which SAP system subsequent calls hit. Treat profile
switches as a deliberate user action, not a routine auto-approved step.
