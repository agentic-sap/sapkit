"use strict";
/**
 * GetCdsUnitTest Handler - Read CDS unit test run status/result
 *
 * CDS unit tests are launched through the classic RunUnitTest bridge (there is
 * no dedicated RunCdsUnitTest tool; a CDS test class created by CreateCdsUnitTest
 * is run by passing it to RunUnitTest as the container class). That bridge runs
 * synchronously via the classic Eclipse-ADT endpoint and caches the
 * `<aunit:runResult>` XML under a generated run_id (see
 * ../../../lib/abapUnitClassic.ts). This looks it back up from that same store.
 * The vendored AdtCdsUnitTest.read() reads back from
 * /sap/bc/adt/abapunit/runs/{id} + /results/{id}, the ABAP-Cloud-only
 * collections that 404 on on-prem (S/4HANA 2021, BASIS 7.00).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITION = void 0;
exports.handleGetCdsUnitTest = handleGetCdsUnitTest;
const abapUnitClassic_1 = require("../../../lib/abapUnitClassic");
const utils_1 = require("../../../lib/utils");
exports.TOOL_DEFINITION = {
    name: 'GetCdsUnitTest',
    available_in: ['onprem', 'cloud', 'legacy'],
    description: 'Retrieve CDS unit test run status and result for a previously started run_id.',
    inputSchema: {
        type: 'object',
        properties: {
            run_id: {
                type: 'string',
                description: 'Run identifier returned by unit test run.',
            },
        },
        required: ['run_id'],
    },
};
/**
 * Main handler for GetCdsUnitTest MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().read() - high-level read operation
 */
async function handleGetCdsUnitTest(context, args) {
    const { connection, logger } = context;
    try {
        const { run_id } = args;
        if (!run_id) {
            return (0, utils_1.return_error)(new Error('run_id is required'));
        }
        logger?.info(`Reading CDS unit test run status/result for run_id: ${run_id}`);
        const resultXml = (0, abapUnitClassic_1.getUnitTestRun)(connection, run_id);
        if (resultXml === undefined) {
            return (0, utils_1.return_error)(new Error(`Unknown run_id "${run_id}" — no cached CDS unit test result (invalid run_id, or the server process restarted since the run was started via RunUnitTest).`));
        }
        logger?.info(`✅ GetCdsUnitTest completed successfully for run_id: ${run_id}`);
        return (0, utils_1.return_response)({
            data: JSON.stringify({
                success: true,
                run_id,
                run_status: { status: 'completed' },
                run_result: resultXml,
            }, null, 2),
        });
    }
    catch (error) {
        return (0, utils_1.return_error)(error);
    }
}
//# sourceMappingURL=handleGetCdsUnitTest.js.map