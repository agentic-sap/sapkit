#!/usr/bin/env node
/**
 * PostToolUseFailure advisory — point a failed ABAP write at CheckSyntax.
 *
 * A repository write that comes back rejected is, most of the time, ABAP that
 * did not compile. The tool's own error text says so only in fragments, and the
 * server-side ADT check (`CheckSyntax`) is what turns those fragments into
 * line-numbered diagnostics. This hook fires after such a failure and puts that
 * next step in front of the model while the failure is still the topic.
 *
 * Nothing is executed here. The hook writes one advisory string and exits; if
 * the check is worth running, the model runs it.
 *
 * Two advisories, picked by reading the error text:
 *
 *   · the text carries an ABAP compiler signature (a syntax or semantic error,
 *     a failed activation, an unknown type or name) — say so, and name the
 *     mistakes that produce it.
 *   · anything else — a lock, a missing object, a rejected authorisation — is
 *     reported as a plain tool failure, with syntax offered as one hypothesis
 *     among several rather than the answer.
 *
 * Scope is the same namespace test the other SAP hooks use: an MCP server whose
 * namespace segment reads as SAP or ABAP, and a base tool name that starts with
 * `Create` or `Update`. A user interrupt is not a failure and is passed over.
 * Every unexpected shape ends in a silent pass — advice is not worth an
 * exception on an already-failing call.
 */

import { readStdin } from '../lib/stdin.mjs';

const SILENT = JSON.stringify({ continue: true, suppressOutput: true });

// Base-name prefixes that mean "this call was writing to the repository".
const WRITE_PREFIXES = ['Create', 'Update'];

// Error texts an ABAP compiler produces. Matching any one of these flips the
// advisory from "the call failed" to "the code did not compile".
const ABAP_COMPILER_SIGNATURES = [
  /syntax\s+error/i,
  /semantic\s+error/i,
  /activation\s+failed/i,
  /type\s+conflict/i,
  /unknown\s+type/i,
  /(?:field|method|class|interface)\s+"[^"]+"\s+is\s+unknown/i,
  /variable\s+"[^"]+"\s+is\s+already\s+defined/i,
  /statement\s+is\s+not\s+accessible/i,
  /\bABAP\b.*\berror\b/i,
];

// True only for a Create/Update tool published by a SAP/ABAP MCP server. The
// namespace segment is checked so that a same-named tool on an unrelated
// server never collects ABAP advice.
function isAbapWrite(toolName) {
  const sep = toolName.lastIndexOf('__');
  if (!toolName.startsWith('mcp__') || sep <= 5) return false;
  if (!/sap|abap/i.test(toolName.slice(5, sep))) return false;
  const baseTool = toolName.slice(sep + 2);
  return WRITE_PREFIXES.some((prefix) => baseTool.startsWith(prefix));
}

// The object the failed call was working on, for a ` for "ZCL_X"` suffix. The
// tools spell the field three ways; an unnamed object simply drops the suffix.
function objectLabel(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  const name = toolInput.name || toolInput.objectName || toolInput.object_name || '';
  return name ? ` for "${name}"` : '';
}

function compilerAdvisory(label) {
  return (
    `[SAPKIT SYNTAX CHECK] ABAP error detected${label}. ` +
    `Run CheckSyntax (server-side ADT check) for the line-level diagnostics behind it. ` +
    `The usual causes are a mistyped type or variable, an interface whose methods are not all implemented, ` +
    `and a referenced object that is missing or still inactive. ` +
    `Fix what it reports, then send the call again.`
  );
}

function genericAdvisory(toolName, label) {
  return (
    `[SAPKIT ERROR] MCP ABAP tool "${toolName}" failed${label}. ` +
    `CheckSyntax is worth running in case the cause is in the source itself. ` +
    `Otherwise check the four that fail this way without a syntax error: ` +
    `the object does not exist, your user lacks the authorisation, the transport request is not usable, ` +
    `or another user holds the lock.`
  );
}

async function main() {
  try {
    const data = JSON.parse(await readStdin());

    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};
    const error = data.error || '';

    // A user interrupt is a decision, not a defect — nothing to diagnose.
    if (data.is_interrupt || false) {
      console.log(SILENT);
      return;
    }

    if (!isAbapWrite(toolName)) {
      console.log(SILENT);
      return;
    }

    const label = objectLabel(toolInput);
    const looksLikeAbap = ABAP_COMPILER_SIGNATURES.some((signature) => signature.test(error));

    console.log(
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PostToolUseFailure',
          additionalContext: looksLikeAbap ? compilerAdvisory(label) : genericAdvisory(toolName, label),
        },
      }),
    );
  } catch {
    console.log(SILENT);
  }
}

main();
