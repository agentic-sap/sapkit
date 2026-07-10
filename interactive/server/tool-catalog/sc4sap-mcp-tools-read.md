# SAP MCP Tool Catalog — Read operations

Get / Read / List / Search / Check / Grep handlers — schema, metadata, object
introspection, source search, navigation, and server-side syntax checks.
Part of [sc4sap-mcp-tools.md](sc4sap-mcp-tools.md). Names are bare capability
names (no harness prefix) per [core/vocabulary.md](../../core/vocabulary.md).

**EXCLUDED from this list (prompt-gated, never auto-approved)**:
`GetTableContents`, `GetSqlQuery`. See the index file for the rationale.

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
