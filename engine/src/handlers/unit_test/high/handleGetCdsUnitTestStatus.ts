/**
 * GetCdsUnitTestStatus Handler - Read CDS unit test run status
 *
 * Reads the classic run-result cache keyed by run_id (see
 * ../../../lib/abapUnitClassic.ts and handleGetCdsUnitTest.ts). The classic
 * endpoint is synchronous, so any cached run_id has already completed. The
 * vendored getStatus path (/sap/bc/adt/abapunit/runs/{id}) is the ABAP-Cloud-only
 * collection that 404s on on-prem.
 */

import { getUnitTestRun } from '../../../lib/abapUnitClassic';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTestStatus',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
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
} as const;

interface GetCdsUnitTestStatusArgs {
  run_id: string;
  with_long_polling?: boolean;
}

/**
 * Main handler for GetCdsUnitTestStatus MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().getStatus()
 */
export async function handleGetCdsUnitTestStatus(
  context: HandlerContext,
  args: GetCdsUnitTestStatusArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id } = args as GetCdsUnitTestStatusArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    logger?.info(`Reading CDS unit test status for run_id: ${run_id}`);

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
          run_status: { status: 'completed' },
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
