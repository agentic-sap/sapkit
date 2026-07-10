#!/usr/bin/env node

/**
 * sc4sap Transport Validator Hook (PreToolUse) — SAP-SPECIFIC
 *
 * Validates that a transport request exists before allowing MCP ABAP
 * Create/Update tools to execute. This enforces the SAP transport policy:
 * every change must be assigned to a transport request.
 *
 * Checks:
 * 1. Tool is an MCP ABAP Create* or Update* tool
 * 2. Tool input contains a transport parameter
 * 3. If no transport, injects a reminder to create/specify one
 *
 * This hook is ADVISORY (non-blocking). It injects a reminder but does
 * not deny the tool execution, since some objects (like local $TMP packages)
 * don't require transports.
 */

import { readStdin } from './lib/stdin.mjs';

// MCP ABAP tools that require a transport for non-local objects.
// Matched by base tool name (last __ segment) so the check works regardless
// of the MCP namespace prefix (e.g. mcp__plugin_sc4sap_sap__CreateClass).
const TRANSPORT_REQUIRED_TOOLS = new Set([
  // Create operations
  'CreateClass',
  'CreateInterface',
  'CreateProgram',
  'CreateFunctionGroup',
  'CreateFunctionModule',
  'CreateTable',
  'CreateStructure',
  'CreateDataElement',
  'CreateDomain',
  'CreateView',
  'CreatePackage',
  'CreateInclude',
  'CreateServiceDefinition',
  'CreateServiceBinding',
  'CreateBehaviorDefinition',
  'CreateBehaviorImplementation',
  'CreateMetadataExtension',
  'CreateScreen',
  'CreateGuiStatus',
  'CreateTextElement',
  'CreateUnitTest',
  'CreateCdsUnitTest',
  // Update operations
  'UpdateClass',
  'UpdateInterface',
  'UpdateProgram',
  'UpdateFunctionGroup',
  'UpdateFunctionModule',
  'UpdateTable',
  'UpdateStructure',
  'UpdateDataElement',
  'UpdateDomain',
  'UpdateView',
  'UpdateInclude',
  'UpdateServiceDefinition',
  'UpdateServiceBinding',
  'UpdateBehaviorDefinition',
  'UpdateBehaviorImplementation',
  'UpdateMetadataExtension',
  'UpdateScreen',
  'UpdateGuiStatus',
  'UpdateTextElement',
  'UpdateUnitTest',
  'UpdateCdsUnitTest',
  'UpdateLocalDefinitions',
  'UpdateLocalTypes',
  'UpdateLocalMacros',
  'UpdateLocalTestClass',
]);

// Packages that don't require transports
const LOCAL_PACKAGES = new Set(['$TMP', '$tmp', 'LOCAL', 'local']);

function isLocalPackage(toolInput) {
  const pkg = toolInput?.package || toolInput?.devclass || toolInput?.packageName || '';
  return LOCAL_PACKAGES.has(pkg.toUpperCase() === '$TMP' ? '$TMP' : pkg);
}

async function main() {
  try {
    const input = await readStdin();
    if (!input.trim()) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    let data = {};
    try { data = JSON.parse(input); } catch {}

    const toolName = data.tool_name || data.toolName || '';
    const toolInput = data.tool_input || data.toolInput || {};

    // Only check Create/Update tools from the SAP MCP server — the namespace
    // segment must look like an sc4sap/abap server so same-named tools on
    // unrelated MCP servers don't receive SAP transport advisories.
    const sep = toolName.lastIndexOf('__');
    const fromSapServer = toolName.startsWith('mcp__') && sep > 5 && /sc4sap|abap/i.test(toolName.slice(5, sep));
    const baseTool = fromSapServer ? toolName.slice(sep + 2) : '';
    if (!TRANSPORT_REQUIRED_TOOLS.has(baseTool)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Skip check for local packages ($TMP)
    if (isLocalPackage(toolInput)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Check if transport is specified in the tool input
    const transport = toolInput.transport || toolInput.transportRequest ||
                      toolInput.transport_request || toolInput.corrNr || '';

    if (!transport) {
      const objectName = toolInput.name || toolInput.objectName || toolInput.object_name || 'unknown';
      const action = toolName.includes('Create') ? 'creating' : 'updating';

      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `[SC4SAP TRANSPORT CHECK] You are ${action} SAP object "${objectName}" without specifying a transport request. ` +
            `SAP policy requires all changes to be assigned to a transport. ` +
            `Please either: (1) specify a transport parameter, (2) use CreateTransport to create one first, ` +
            `or (3) use ListTransports to find an existing one. ` +
            `Exception: objects in $TMP package do not require transports.`
        }
      }));
      return;
    }

    // Transport is specified — allow silently
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch (error) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
