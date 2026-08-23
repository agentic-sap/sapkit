<!--
  GENERATED FILE — do not edit by hand.
  Source: the engine tool registry (sapkit-engine/src/tools/registry.ts).
  Regenerate: node harness/render-tool-catalog.mjs   (from sapkit-engine/, after npm run build)
  Gate: the 「카탈로그」 gate inside `npm run gates` (sapkit-engine/gates/catalog.mjs).
        `node harness/render-tool-catalog.mjs --check` makes the same comparison by hand.
-->

# SAP MCP Tool Catalog — Read operations

Get / Read / Check / List / Search / Describe / Grep handlers — DDIC and object
metadata, source retrieval, structure navigation, cross-object search, and
server-side syntax checks. Nothing here changes SAP state.

Part of [sapkit-mcp-tools.md](sapkit-mcp-tools.md).

Tools are listed by **bare capability name**. Each harness maps those names to its
own tool identifiers — see the [capability vocabulary](../../core/vocabulary.md)
(Claude Code, for instance, prefixes `mcp__<plugin-namespace>__`).

**Not listed here (prompt-gated, never auto-approved)**: `GetTableContents`, `GetSqlQuery`.
The index file explains why.

## Get*

- `GetAbapAST`
- `GetAbapSemanticAnalysis`
- `GetAbapSystemSymbols`
- `GetAdtTypes`
- `GetAtcFindings`
- `GetBadiImplementations`
- `GetBehaviorDefinition`
- `GetBehaviorImplementation`
- `GetCallGraph`
- `GetCdsUnitTest`
- `GetCdsUnitTestResult`
- `GetCdsUnitTestStatus`
- `GetClass`
- `GetClassMethod`
- `GetDataElement`
- `GetDomain`
- `GetEnhancementImpl`
- `GetEnhancementSpot`
- `GetEnhancements`
- `GetFunctionGroup`
- `GetFunctionModule`
- `GetGuiStatus`
- `GetGuiStatusList`
- `GetInactiveObjects`
- `GetInclude`
- `GetIncludesList`
- `GetInstalledComponents`
- `GetInterface`
- `GetLocalDefinitions`
- `GetLocalMacros`
- `GetLocalTestClass`
- `GetLocalTypes`
- `GetMetadataExtension`
- `GetNodeStructureLow`
- `GetObjectInfo`
- `GetObjectNodeFromCache`
- `GetObjectStructure`
- `GetObjectStructureLow`
- `GetObjectsByType`
- `GetObjectsList`
- `GetPackage`
- `GetPackageContents`
- `GetPackageTree`
- `GetProgFullCode`
- `GetProgram`
- `GetScreen`
- `GetScreensList`
- `GetServiceBinding`
- `GetServiceDefinition`
- `GetSession`
- `GetSourceDiff`
- `GetStructure`
- `GetSystemInfo`
- `GetTable`
- `GetTextElement`
- `GetTransaction`
- `GetTransport`
- `GetTypeInfo`
- `GetUnitTest`
- `GetUnitTestResult`
- `GetUnitTestStatus`
- `GetView`
- `GetVirtualFoldersLow`
- `GetWhereUsed`

## Read*

- `ReadBehaviorDefinition`
- `ReadBehaviorImplementation`
- `ReadClass`
- `ReadDataElement`
- `ReadDomain`
- `ReadFunctionGroup`
- `ReadFunctionModule`
- `ReadGuiStatus`
- `ReadInterface`
- `ReadMetadataExtension`
- `ReadPackage`
- `ReadProgram`
- `ReadScreen`
- `ReadServiceBinding`
- `ReadServiceDefinition`
- `ReadStructure`
- `ReadTable`
- `ReadTextElementsBulk`
- `ReadView`

## Check* / List* / Search* / Describe* / Grep*

- `CheckSyntax`
- `DescribeByList`
- `GrepObjects`
- `GrepPackages`
- `ListServiceBindingTypes`
- `ListTransports`
- `SearchObject`
