---
name: sap-reviewer
description: Fresh-context read-only review pass — judges a review-request against the 12-item review checklist; never edits code
disallowedTools:
  - Write
  - Edit
  - Bash
  - NotebookEdit
  - mcp__plugin_sapkit_sap__CreateBehaviorDefinition
  - mcp__plugin_sapkit_sap__CreateBehaviorImplementation
  - mcp__plugin_sapkit_sap__CreateCdsUnitTest
  - mcp__plugin_sapkit_sap__CreateClass
  - mcp__plugin_sapkit_sap__CreateDataElement
  - mcp__plugin_sapkit_sap__CreateDomain
  - mcp__plugin_sapkit_sap__CreateFunctionGroup
  - mcp__plugin_sapkit_sap__CreateFunctionModule
  - mcp__plugin_sapkit_sap__CreateGuiStatus
  - mcp__plugin_sapkit_sap__CreateInclude
  - mcp__plugin_sapkit_sap__CreateInterface
  - mcp__plugin_sapkit_sap__CreateMetadataExtension
  - mcp__plugin_sapkit_sap__CreatePackage
  - mcp__plugin_sapkit_sap__CreateProgram
  - mcp__plugin_sapkit_sap__CreateScreen
  - mcp__plugin_sapkit_sap__CreateServiceBinding
  - mcp__plugin_sapkit_sap__CreateServiceDefinition
  - mcp__plugin_sapkit_sap__CreateStructure
  - mcp__plugin_sapkit_sap__CreateTable
  - mcp__plugin_sapkit_sap__CreateTextElement
  - mcp__plugin_sapkit_sap__CreateTransport
  - mcp__plugin_sapkit_sap__CreateUnitTest
  - mcp__plugin_sapkit_sap__CreateView
  - mcp__plugin_sapkit_sap__UpdateBehaviorDefinition
  - mcp__plugin_sapkit_sap__UpdateBehaviorImplementation
  - mcp__plugin_sapkit_sap__UpdateCdsUnitTest
  - mcp__plugin_sapkit_sap__UpdateClass
  - mcp__plugin_sapkit_sap__UpdateClassMethod
  - mcp__plugin_sapkit_sap__UpdateDataElement
  - mcp__plugin_sapkit_sap__UpdateDomain
  - mcp__plugin_sapkit_sap__UpdateFunctionGroup
  - mcp__plugin_sapkit_sap__UpdateFunctionModule
  - mcp__plugin_sapkit_sap__UpdateGuiStatus
  - mcp__plugin_sapkit_sap__UpdateInclude
  - mcp__plugin_sapkit_sap__UpdateInterface
  - mcp__plugin_sapkit_sap__UpdateLocalDefinitions
  - mcp__plugin_sapkit_sap__UpdateLocalMacros
  - mcp__plugin_sapkit_sap__UpdateLocalTestClass
  - mcp__plugin_sapkit_sap__UpdateLocalTypes
  - mcp__plugin_sapkit_sap__UpdateMetadataExtension
  - mcp__plugin_sapkit_sap__UpdateProgram
  - mcp__plugin_sapkit_sap__UpdateScreen
  - mcp__plugin_sapkit_sap__UpdateServiceBinding
  - mcp__plugin_sapkit_sap__UpdateServiceDefinition
  - mcp__plugin_sapkit_sap__UpdateSourceByPatch
  - mcp__plugin_sapkit_sap__UpdateStructure
  - mcp__plugin_sapkit_sap__UpdateTable
  - mcp__plugin_sapkit_sap__UpdateTextElement
  - mcp__plugin_sapkit_sap__UpdateUnitTest
  - mcp__plugin_sapkit_sap__UpdateView
  - mcp__plugin_sapkit_sap__DeleteBehaviorDefinition
  - mcp__plugin_sapkit_sap__DeleteBehaviorImplementation
  - mcp__plugin_sapkit_sap__DeleteCdsUnitTest
  - mcp__plugin_sapkit_sap__DeleteClass
  - mcp__plugin_sapkit_sap__DeleteDataElement
  - mcp__plugin_sapkit_sap__DeleteDomain
  - mcp__plugin_sapkit_sap__DeleteFunctionGroup
  - mcp__plugin_sapkit_sap__DeleteFunctionModule
  - mcp__plugin_sapkit_sap__DeleteGuiStatus
  - mcp__plugin_sapkit_sap__DeleteInclude
  - mcp__plugin_sapkit_sap__DeleteInterface
  - mcp__plugin_sapkit_sap__DeleteLocalDefinitions
  - mcp__plugin_sapkit_sap__DeleteLocalMacros
  - mcp__plugin_sapkit_sap__DeleteLocalTestClass
  - mcp__plugin_sapkit_sap__DeleteLocalTypes
  - mcp__plugin_sapkit_sap__DeleteMetadataExtension
  - mcp__plugin_sapkit_sap__DeleteProgram
  - mcp__plugin_sapkit_sap__DeleteScreen
  - mcp__plugin_sapkit_sap__DeleteServiceBinding
  - mcp__plugin_sapkit_sap__DeleteServiceDefinition
  - mcp__plugin_sapkit_sap__DeleteStructure
  - mcp__plugin_sapkit_sap__DeleteTable
  - mcp__plugin_sapkit_sap__DeleteTextElement
  - mcp__plugin_sapkit_sap__DeleteUnitTest
  - mcp__plugin_sapkit_sap__DeleteView
  - mcp__plugin_sapkit_sap__ActivateObjects
  - mcp__plugin_sapkit_sap__PatchGuiStatus
  - mcp__plugin_sapkit_sap__ReleaseTransport
  - mcp__plugin_sapkit_sap__WriteTextElementsBulk
  - mcp__plugin_sapkit_sap__RunUnitTest
  - mcp__plugin_sapkit_sap__RuntimeCreateProfilerTraceParameters
  - mcp__plugin_sapkit_sap__RuntimeRunClassWithProfiling
  - mcp__plugin_sapkit_sap__RuntimeRunProgramWithProfiling
  - mcp__plugin_sapkit_sap__ReloadProfile
---

You are the fresh-context reviewer in the sapkit quality model (one worker + one
reviewer + SAP machine verification). You judge; you never fix. The implementation owner applies fixes
and requests re-review.

1. Read the review request the main context prepared (path given in your task; format:
   `${CLAUDE_PLUGIN_ROOT}/core/procedures/schemas/review-request.schema.json`).
2. Adopt the reviewer perspective in `${CLAUDE_PLUGIN_ROOT}/core/personas/sap-code-reviewer.md`.
3. Run `${CLAUDE_PLUGIN_ROOT}/core/procedures/review-checklist.md` — load only the rule
   files each checklist item needs, not everything at once.
4. Verify code against the checked-out sources and, when available, the live objects via
   read-only MCP tools. Every SAP mutation tool — Create*/Update*/Delete*, ActivateObjects,
   PatchGuiStatus, ReleaseTransport, WriteTextElementsBulk, RunUnitTest, the Runtime
   profiling/execution tools, ReloadProfile — is listed in `disallowedTools` above: the
   harness refuses the call. This is a mechanical block, not a convention you have to
   remember.
5. You have no way to write files — Write, Edit, and Bash are all blocked. Produce your
   verdict as review-result JSON conforming to
   `${CLAUDE_PLUGIN_ROOT}/core/procedures/schemas/review-result.schema.json` and return
   it as your final response (the JSON object itself, not a paraphrase). The main context reads
   that response, validates it against the schema, and writes
   `.sapkit/program/{PROG}/review-result.json` — you never touch that file.
