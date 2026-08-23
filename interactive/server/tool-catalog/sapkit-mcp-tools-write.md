<!--
  GENERATED FILE — do not edit by hand.
  Source: the engine tool registry (sapkit-engine/src/tools/registry.ts).
  Regenerate: node harness/render-tool-catalog.mjs   (from sapkit-engine/, after npm run build)
  Gate: the 「카탈로그」 gate inside `npm run gates` (sapkit-engine/gates/catalog.mjs).
        `node harness/render-tool-catalog.mjs --check` makes the same comparison by hand.
-->

# SAP MCP Tool Catalog — Write operations

Create / Update / Delete / Activate / Patch / Release / Write handlers covering
the ABAP object lifecycle. Every tool here changes SAP state and is therefore
DEV-tier only.

Part of [sapkit-mcp-tools.md](sapkit-mcp-tools.md).

Tools are listed by **bare capability name**. Each harness maps those names to its
own tool identifiers — see the [capability vocabulary](../../core/vocabulary.md)
(Claude Code, for instance, prefixes `mcp__<plugin-namespace>__`).

## Create*

- `CreateBehaviorDefinition`
- `CreateBehaviorImplementation`
- `CreateCdsUnitTest`
- `CreateClass`
- `CreateDataElement`
- `CreateDomain`
- `CreateFunctionGroup`
- `CreateFunctionModule`
- `CreateGuiStatus`
- `CreateInclude`
- `CreateInterface`
- `CreateMetadataExtension`
- `CreatePackage`
- `CreateProgram`
- `CreateScreen`
- `CreateServiceBinding`
- `CreateServiceDefinition`
- `CreateStructure`
- `CreateTable`
- `CreateTextElement`
- `CreateTransport`
- `CreateUnitTest`
- `CreateView`

## Update*

- `UpdateBehaviorDefinition`
- `UpdateBehaviorImplementation`
- `UpdateCdsUnitTest`
- `UpdateClass`
- `UpdateClassMethod`
- `UpdateDataElement`
- `UpdateDomain`
- `UpdateFunctionGroup`
- `UpdateFunctionModule`
- `UpdateGuiStatus`
- `UpdateInclude`
- `UpdateInterface`
- `UpdateLocalDefinitions`
- `UpdateLocalMacros`
- `UpdateLocalTestClass`
- `UpdateLocalTypes`
- `UpdateMetadataExtension`
- `UpdateProgram`
- `UpdateScreen`
- `UpdateServiceBinding`
- `UpdateServiceDefinition`
- `UpdateSourceByPatch`
- `UpdateStructure`
- `UpdateTable`
- `UpdateTextElement`
- `UpdateUnitTest`
- `UpdateView`

## Delete*

- `DeleteBehaviorDefinition`
- `DeleteBehaviorImplementation`
- `DeleteCdsUnitTest`
- `DeleteClass`
- `DeleteDataElement`
- `DeleteDomain`
- `DeleteFunctionGroup`
- `DeleteFunctionModule`
- `DeleteGuiStatus`
- `DeleteInclude`
- `DeleteInterface`
- `DeleteLocalDefinitions`
- `DeleteLocalMacros`
- `DeleteLocalTestClass`
- `DeleteLocalTypes`
- `DeleteMetadataExtension`
- `DeleteProgram`
- `DeleteScreen`
- `DeleteServiceBinding`
- `DeleteServiceDefinition`
- `DeleteStructure`
- `DeleteTable`
- `DeleteTextElement`
- `DeleteUnitTest`
- `DeleteView`

## Activate*

- `ActivateObjects`

## Patch*

- `PatchGuiStatus`

## Release*

- `ReleaseTransport`

## Write*

- `WriteTextElementsBulk`
