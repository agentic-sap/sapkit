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

import { getUnitTestRun } from '../../../lib/abapUnitClassic';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Retrieve CDS unit test run status and result for a previously started run_id.',
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
} as const;

interface GetCdsUnitTestArgs {
  run_id: string;
}

/**
 * Main handler for GetCdsUnitTest MCP tool
 *
 * Uses AdtClient.getCdsUnitTest().read() - high-level read operation
 */
export async function handleGetCdsUnitTest(
  context: HandlerContext,
  args: GetCdsUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id } = args as GetCdsUnitTestArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    logger?.info(
      `Reading CDS unit test run status/result for run_id: ${run_id}`,
    );

    const resultXml = getUnitTestRun(connection, run_id);
    if (resultXml === undefined) {
      return return_error(
        new Error(
          `Unknown run_id "${run_id}" — no cached CDS unit test result (invalid run_id, or the server process restarted since the run was started via RunUnitTest).`,
        ),
      );
    }

    logger?.info(
      `✅ GetCdsUnitTest completed successfully for run_id: ${run_id}`,
    );

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          run_id,
          run_status: { status: 'completed' },
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
