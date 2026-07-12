/**
 * GetCdsUnitTestResult Handler - Read CDS unit test run result
 *
 * Reads the classic run-result cache keyed by run_id (see
 * ../../../lib/abapUnitClassic.ts and handleGetCdsUnitTest.ts). The vendored
 * getResult path (/sap/bc/adt/abapunit/results/{id}) is the ABAP-Cloud-only
 * collection that 404s on on-prem. JUnit-format conversion is not available for
 * the classic endpoint, so `format: "junit"` is rejected explicitly.
 */

import { getUnitTestRun } from '../../../lib/abapUnitClassic';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTestResult',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description: 'Retrieve CDS unit test run result for a run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by unit test run.',
      },
      with_navigation_uris: {
        type: 'boolean',
        description: 'Include navigation URIs in result if supported.',
        default: false,
      },
      format: {
        type: 'string',
        description: 'Result format: abapunit or junit.',
        enum: ['abapunit', 'junit'],
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetCdsUnitTestResultArgs {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
}

/**
 * Main handler for GetCdsUnitTestResult MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().getResult()
 */
export async function handleGetCdsUnitTestResult(
  context: HandlerContext,
  args: GetCdsUnitTestResultArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id, format } = args as GetCdsUnitTestResultArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    if (format === 'junit') {
      return return_error(
        new Error(
          'format "junit" is not available for the classic ADT ABAP Unit endpoint (no verified live endpoint for it). Omit format, or use "abapunit", to get the raw result.',
        ),
      );
    }

    logger?.info(`Reading CDS unit test result for run_id: ${run_id}`);

    const resultXml = getUnitTestRun(connection, run_id);
    if (resultXml === undefined) {
      return return_error(
        new Error(
          `Unknown run_id "${run_id}" — no cached CDS unit test result (invalid run_id, or the server process restarted since the run was started via RunUnitTest).`,
        ),
      );
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          run_id,
          run_result: resultXml,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
