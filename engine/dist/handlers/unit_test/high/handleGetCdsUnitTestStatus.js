"use strict";
/**
 * GetCdsUnitTestStatus Handler - Read CDS unit test run status
 *
 * Reads the classic run-result cache keyed by run_id (see
 * ../../../lib/abapUnitClassic.ts and handleGetCdsUnitTest.ts). The classic
 * endpoint is synchronous, so any cached run_id has already completed. The
 * vendored getStatus path (/sap/bc/adt/abapunit/runs/{id}) is the ABAP-Cloud-only
 * collection that 404s on on-prem.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITION = void 0;
exports.handleGetCdsUnitTestStatus = handleGetCdsUnitTestStatus;
const abapUnitClassic_1 = require("../../../lib/abapUnitClassic");
const utils_1 = require("../../../lib/utils");
exports.TOOL_DEFINITION = {
    name: 'GetCdsUnitTestStatus',
    available_in: ['onprem', 'cloud', 'legacy'],
    description: 'Retrieve CDS unit test run status for a run_id.',
    inputSchema: {
        type: 'object',
        properties: {
            run_id: {
                type: 'string',
                description: 'Run identifier returned by unit test run.',
            },
            with_long_polling: {
                type: 'boolean',
                description: 'Enable long polling while waiting for status.',
                default: true,
            },
        },
        required: ['run_id'],
    },
};
/**
 * Main handler for GetCdsUnitTestStatus MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().getStatus()
 */
async function handleGetCdsUnitTestStatus(context, args) {
    const { connection, logger } = context;
    try {
        const { run_id } = args;
        if (!run_id) {
            return (0, utils_1.return_error)(new Error('run_id is required'));
        }
        logger?.info(`Reading CDS unit test status for run_id: ${run_id}`);
        const resultXml = (0, abapUnitClassic_1.getUnitTestRun)(connection, run_id);
        if (resultXml === undefined) {
            return (0, utils_1.return_error)(new Error(`Unknown run_id "${run_id}" — no cached CDS unit test result (invalid run_id, or the server process restarted since the run was started via RunUnitTest).`));
        }
        return (0, utils_1.return_response)({
            data: JSON.stringify({
                success: true,
                run_id,
                run_status: { status: 'completed' },
            }, null, 2),
        });
    }
    catch (error) {
        return (0, utils_1.return_error)(error);
    }
}
//# sourceMappingURL=handleGetCdsUnitTestStatus.js.map