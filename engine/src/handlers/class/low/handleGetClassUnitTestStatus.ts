/**
 * GetClassUnitTestStatus Handler - Fetch ABAP Unit run status
 *
 * RunClassUnitTestsLow runs synchronously via the classic Eclipse-ADT endpoint
 * (see ../../../lib/abapUnitClassic.ts) and caches the result under a generated
 * run_id — there is no server-side async run to poll (the vendored
 * getClassUnitTestRunStatus() GET /sap/bc/adt/abapunit/runs/{id} is the
 * ABAP-Cloud-only collection that 404s on on-prem). This reports "completed"
 * for any run_id present in that cache — the SAME store the high-level readers
 * use, so run_ids from RunUnitTest and RunClassUnitTestsLow both resolve here.
 */

import { getUnitTestRun } from '../../../lib/abapUnitClassic';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetClassUnitTestStatusLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Retrieve ABAP Unit run status XML for a previously started run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by RunClassUnitTestsLow.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetStatusArgs {
  run_id: string;
  with_long_polling?: boolean;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleGetClassUnitTestStatus(
  context: HandlerContext,
  args: GetStatusArgs,
) {
  const { connection, logger } = context;
  try {
    const { run_id, session_id, session_state } = args as GetStatusArgs;

    if (!run_id) {
      return return_error(new Error('run_id is required'));
    }

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    logger?.info(`Fetching ABAP Unit status for run ${run_id}`);

    const resultXml = getUnitTestRun(connection, run_id);
    if (resultXml === undefined) {
      return return_error(
        new Error(
          `Unknown run_id "${run_id}" — no cached result (invalid run_id, or the server process restarted since the run was started).`,
        ),
      );
    }

    // The classic ADT endpoint is synchronous (see abapUnitClassic.ts), so by
    // the time a run_id exists in the cache, the run has already finished.
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
