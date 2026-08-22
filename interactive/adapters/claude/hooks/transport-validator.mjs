#!/usr/bin/env node
/**
 * PreToolUse advisory — a change heading for SAP with no transport named.
 *
 * SAP change control puts every repository object into a transport request, and
 * the MCP `Create…` and `Update…` tools take that request as a plain parameter.
 * When the parameter is absent this hook says so, in the model's own context,
 * before the call goes out.
 *
 * It only ever advises. Nothing here denies, because "no transport" is a
 * legitimate state: objects in the local `$TMP` package never get one, and a
 * system can be configured so that other packages skip it too. Refusing on a
 * guess would block correct work, so the hook hands the model the reminder and
 * steps aside. The gates that do refuse — the tier guard and the row-data
 * blocklist — are separate files.
 *
 * Three narrowing steps decide whether anything is said at all:
 *
 *   1. the call must come from an MCP server whose namespace segment reads as
 *      SAP or ABAP. `CreateClass` on somebody else's MCP server is not a SAP
 *      object and must not collect SAP advice.
 *   2. the base tool name — the part after the last `__` — must be one of the
 *      Create/Update tools listed below. Matching the base name rather than the
 *      whole string keeps this working whatever prefix the host assigns.
 *   3. the target package must not be a local one, and no transport-shaped
 *      parameter may already be present.
 *
 * Anything that goes wrong on the way — no payload, unparsable JSON, a field of
 * an unexpected type — ends in the same silent pass. An advisory hook that
 * starts throwing would turn a cosmetic reminder into a broken tool call.
 */

import { readStdin } from '../lib/stdin.mjs';

// `{ continue: true, suppressOutput: true }` is the "nothing to say" answer:
// the call proceeds and the user sees no hook chatter.
const SILENT = JSON.stringify({ continue: true, suppressOutput: true });

// Base tool names (last `__` segment) that put an object into the repository
// and therefore accept a transport request.
const NEEDS_TRANSPORT = new Set([
  'CreateBehaviorDefinition',
  'CreateBehaviorImplementation',
  'CreateCdsUnitTest',
  'CreateClass',
  'CreateDataElement',
  'CreateDomain',
  'CreateFunctionGroup',
  'CreateFunctionModule',
  'CreateGuiStatus',
  'CreateInclude',
  'CreateInterface',
  'CreateMetadataExtension',
  'CreatePackage',
  'CreateProgram',
  'CreateScreen',
  'CreateServiceBinding',
  'CreateServiceDefinition',
  'CreateStructure',
  'CreateTable',
  'CreateTextElement',
  'CreateUnitTest',
  'CreateView',
  'UpdateBehaviorDefinition',
  'UpdateBehaviorImplementation',
  'UpdateCdsUnitTest',
  'UpdateClass',
  'UpdateDataElement',
  'UpdateDomain',
  'UpdateFunctionGroup',
  'UpdateFunctionModule',
  'UpdateGuiStatus',
  'UpdateInclude',
  'UpdateInterface',
  'UpdateLocalDefinitions',
  'UpdateLocalMacros',
  'UpdateLocalTestClass',
  'UpdateLocalTypes',
  'UpdateMetadataExtension',
  'UpdateProgram',
  'UpdateScreen',
  'UpdateServiceBinding',
  'UpdateServiceDefinition',
  'UpdateStructure',
  'UpdateTable',
  'UpdateTextElement',
  'UpdateUnitTest',
  'UpdateView',
]);

// Packages whose contents are never transported. `$TMP` is compared case-
// insensitively; `LOCAL` is compared as written, upper or lower. That asymmetry
// is the shipped behaviour and is kept deliberately — widening it would silence
// the advisory for package names nobody has confirmed are local.
const LOCAL_PACKAGES = new Set(['$TMP', '$tmp', 'LOCAL', 'local']);

// Every spelling the engine's tool schemas have used for the same three things.
const PACKAGE_KEYS = ['package_name', 'package', 'devclass', 'packageName'];
const TRANSPORT_KEYS = ['transport', 'transportRequest', 'transport_request', 'corrNr'];
const OBJECT_NAME_KEYS = ['name', 'objectName', 'object_name'];

// First truthy value among `keys`, or '' when the payload names none of them.
function pick(input, keys) {
  for (const key of keys) {
    const value = input?.[key];
    if (value) return value;
  }
  return '';
}

// The base tool name when this call belongs to a SAP/ABAP MCP server, '' when
// it belongs to anyone else — including a bare, unprefixed tool name, which
// carries no namespace to judge and so is left alone.
function sapBaseTool(toolName) {
  const sep = toolName.lastIndexOf('__');
  if (!toolName.startsWith('mcp__') || sep <= 5) return '';
  const namespace = toolName.slice(5, sep);
  return /sap|abap/i.test(namespace) ? toolName.slice(sep + 2) : '';
}

function localPackage(toolInput) {
  const pkg = pick(toolInput, PACKAGE_KEYS);
  return pkg.toUpperCase() === '$TMP' || LOCAL_PACKAGES.has(pkg);
}

function advisory(toolName, toolInput) {
  const objectName = pick(toolInput, OBJECT_NAME_KEYS) || 'unknown';
  const action = toolName.includes('Create') ? 'creating' : 'updating';
  return (
    `[SC4SAP TRANSPORT CHECK] No transport request was named for ${action} SAP object "${objectName}". ` +
    `SAP change control expects every repository change to sit in a request, so settle that first: ` +
    `pass a transport parameter, open a request with CreateTransport, or take an open one from ListTransports. ` +
    `Objects in the $TMP package are the exception — they need none.`
  );
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      console.log(SILENT);
      return;
    }

    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      // Unparsable payload: nothing to classify, and advising blindly would be
      // noise. Fall through with the empty object and answer silent below.
    }

    const toolName = data.tool_name || data.toolName || '';
    const toolInput = data.tool_input || data.toolInput || {};

    const baseTool = sapBaseTool(toolName);
    if (!NEEDS_TRANSPORT.has(baseTool) || localPackage(toolInput) || pick(toolInput, TRANSPORT_KEYS)) {
      console.log(SILENT);
      return;
    }

    console.log(
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: advisory(toolName, toolInput),
        },
      }),
    );
  } catch {
    console.log(SILENT);
  }
}

main();
