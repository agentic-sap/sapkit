"use strict";
/**
 * RunClassUnitTests Handler - Start ABAP Unit run for class-based tests
 *
 * Runs synchronously via the classic Eclipse-ADT endpoint
 * (POST /sap/bc/adt/abapunit/testruns — see ../../../lib/abapUnitClassic.ts),
 * the same bridge the high-level RunUnitTest uses. The vendored
 * AdtClient.getUnitTest().run() posts to /sap/bc/adt/abapunit/runs, the
 * ABAP-Cloud-only async collection that returns HTTP 404 on on-prem releases
 * (S/4HANA 2021, BASIS 7.00) — so this low-level path 404'd there just like
 * the high-level one did before 4.13.1. The classic endpoint is synchronous;
 * the result is cached under a generated run_id (connection-scoped, TTL-bounded)
 * that GetClassUnitTestStatusLow / GetClassUnitTestResultLow read back — the
 * SAME store the high-level readers use, so run_ids interoperate across both.
 * The low-level caller contract (tests in → run_id out; optional
 * session_id/session_state) is preserved; unit-test runs never lock, so there
 * is no lock_handle contract to keep.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITION = void 0;
exports.handleRunClassUnitTests = handleRunClassUnitTests;
const abapUnitClassic_1 = require("../../../lib/abapUnitClassic");
const utils_1 = require("../../../lib/utils");
exports.TOOL_DEFINITION = {
    name: 'RunClassUnitTestsLow',
    available_in: ['onprem', 'cloud', 'legacy'],
    description: '[low-level] Start an ABAP Unit test run for provided class test definitions. Returns run_id extracted from SAP response headers.',
    inputSchema: {
        type: 'object',
        properties: {
            tests: {
                type: 'array',
                description: 'List of container/test class pairs to execute.',
                items: {
                    type: 'object',
                    properties: {
                        container_class: {
                            type: 'string',
                            description: 'Class that owns the test include (e.g., ZCL_MAIN_CLASS).',
                        },
                        test_class: {
                            type: 'string',
                            description: 'Test class name inside the include (e.g., LTCL_MAIN_CLASS).',
                        },
                    },
                    required: ['container_class', 'test_class'],
                },
            },
            scope: {
                type: 'object',
                properties: {
                    own_tests: { type: 'boolean' },
                    foreign_tests: { type: 'boolean' },
                    add_foreign_tests_as_preview: { type: 'boolean' },
                },
            },
            risk_level: {
                type: 'object',
                properties: {
                    harmless: { type: 'boolean' },
                    dangerous: { type: 'boolean' },
                    critical: { type: 'boolean' },
                },
            },
            duration: {
                type: 'object',
                properties: {
                    short: { type: 'boolean' },
                    medium: { type: 'boolean' },
                    long: { type: 'boolean' },
                },
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
        required: ['tests'],
    },
};
async function handleRunClassUnitTests(context, args) {
    const { connection, logger } = context;
    try {
        const { tests, scope, risk_level, duration, session_id, session_state } = args;
        if (!Array.isArray(tests) || tests.length === 0) {
            return (0, utils_1.return_error)(new Error('tests array with at least one entry is required'));
        }
        const formattedTests = tests.map((test, index) => {
            if (!test?.container_class || !test?.test_class) {
                throw new Error(`tests[${index}] must include container_class and test_class`);
            }
            return {
                containerClass: test.container_class.toUpperCase(),
                testClass: test.test_class.toUpperCase(),
            };
        });
        if (session_id && session_state) {
            await (0, utils_1.restoreSessionInConnection)(connection, session_id, session_state);
        }
        const mappedScope = scope
            ? {
                ownTests: scope.own_tests,
                foreignTests: scope.foreign_tests,
                addForeignTestsAsPreview: scope.add_foreign_tests_as_preview,
            }
            : undefined;
        logger?.info(`Starting ABAP Unit run for ${formattedTests.length} definitions`);
        try {
            // Run synchronously via the classic ADT endpoint and cache the result
            // under a generated run_id (see ../../../lib/abapUnitClassic.ts). Same
            // bridge the high-level RunUnitTest uses.
            const resultXml = await (0, abapUnitClassic_1.runClassicUnitTest)(connection, formattedTests, {
                scope: mappedScope,
                riskLevel: risk_level,
                duration,
            });
            const runId = (0, abapUnitClassic_1.storeUnitTestRun)(connection, resultXml);
            logger?.info(`✅ RunClassUnitTests started. Run ID: ${runId}`);
            return (0, utils_1.return_response)({
                data: JSON.stringify({
                    success: true,
                    run_id: runId,
                    // The classic endpoint is synchronous — the full result is already
                    // cached under run_id, so there is no async status_code/location to
                    // poll (kept for response-shape compatibility).
                    status_code: 200,
                    location: null,
                    session_id: session_id || null,
                    session_state: null, // Session state management is now handled by auth-broker,
                    message: `ABAP Unit run completed. Use GetClassUnitTestStatusLow and GetClassUnitTestResultLow with run_id ${runId}. Note: the classic ADT endpoint runs all local test classes of each container class — per-test_class sub-selection is not supported by the protocol.`,
                }, null, 2),
            });
        }
        catch (error) {
            logger?.error(`Error starting ABAP Unit run: ${error?.message || error}`);
            return (0, utils_1.return_error)(new Error(error?.message || String(error)));
        }
    }
    catch (error) {
        return (0, utils_1.return_error)(error);
    }
}
//# sourceMappingURL=handleRunClassUnitTests.js.map