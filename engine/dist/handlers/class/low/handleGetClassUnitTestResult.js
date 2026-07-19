"use strict";
/**
 * GetClassUnitTestResult Handler - Fetch ABAP Unit run result
 *
 * RunClassUnitTestsLow runs synchronously via the classic Eclipse-ADT endpoint
 * (see ../../../lib/abapUnitClassic.ts) and caches the raw `<aunit:runResult>`
 * XML under a generated run_id. This looks it back up. The vendored
 * getClassUnitTestResult() GET /sap/bc/adt/abapunit/results/{id} is the
 * ABAP-Cloud-only collection that 404s on on-prem, so it is no longer used.
 * JUnit-format conversion is not available for the classic endpoint (no
 * verified live endpoint), so `format: "junit"` is rejected explicitly rather
 * than silently returning ABAP Unit-format data.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITION = void 0;
exports.handleGetClassUnitTestResult = handleGetClassUnitTestResult;
const abapUnitClassic_1 = require("../../../lib/abapUnitClassic");
const utils_1 = require("../../../lib/utils");
exports.TOOL_DEFINITION = {
    name: 'GetClassUnitTestResultLow',
    available_in: ['onprem', 'cloud', 'legacy'],
    description: '[low-level] Retrieve ABAP Unit run result (ABAPUnit or JUnit XML) for a completed run_id.',
    inputSchema: {
        type: 'object',
        properties: {
            run_id: {
                type: 'string',
                description: 'Run identifier returned by RunClassUnitTestsLow.',
            },
            format: {
                type: 'string',
                enum: ['abapunit', 'junit'],
                description: "Preferred response format. Defaults to 'abapunit'.",
            },
            session_id: {
                type: 'string',
                description: 'Session ID from GetSession. If not provided, a new session will be created.',
            },
            session_state: {
                type: 'object',
                description: 'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
                properties: {
                    cookies: { type: 'string' },
                    csrf_token: { type: 'string' },
                    cookie_store: { type: 'object' },
                },
            },
        },
        required: ['run_id'],
    },
};
async function handleGetClassUnitTestResult(context, args) {
    const { connection, logger } = context;
    try {
        const { run_id, format, session_id, session_state } = args;
        if (!run_id) {
            return (0, utils_1.return_error)(new Error('run_id is required'));
        }
        if (format === 'junit') {
            return (0, utils_1.return_error)(new Error('format "junit" is not available for the classic ADT ABAP Unit endpoint (no verified live endpoint for it). Omit format, or use "abapunit", to get the raw result.'));
        }
        if (session_id && session_state) {
            await (0, utils_1.restoreSessionInConnection)(connection, session_id, session_state);
        }
        logger?.info(`Fetching ABAP Unit result for run ${run_id}`);
        const resultXml = (0, abapUnitClassic_1.getUnitTestRun)(connection, run_id);
        if (resultXml === undefined) {
            return (0, utils_1.return_error)(new Error(`Unknown run_id "${run_id}" — no cached result (invalid run_id, or the server process restarted since the run was started).`));
        }
        return (0, utils_1.return_response)({
            data: JSON.stringify({
                success: true,
                run_id,
                run_result: resultXml,
            }, null, 2),
        });
    }
    catch (error) {
        return (0, utils_1.return_error)(error);
    }
}
//# sourceMappingURL=handleGetClassUnitTestResult.js.map