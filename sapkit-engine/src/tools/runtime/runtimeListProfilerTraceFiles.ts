/**
 * RuntimeListProfilerTraceFiles — ADT 런타임의 프로파일러 트레이스 파일 목록.
 *
 * 인자가 없는 가장 단순한 한 발이다. 겉 핸들러
 * (`engine/src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts:18-46`)는
 * `listProfilerTraceFiles()` 하나를 부르고, 그 요청은
 * `@babamba2/mcp-abap-adt-clients/dist/runtime/traces/profiler.js:284-294`가 짓는다 —
 * `GET /sap/bc/adt/runtime/traces/abaptraces`, `Accept: application/xml`,
 * 타임아웃 `default`.
 */

import { defineTool } from '../../server/toolDefinition';
import { parseRuntimePayload } from './internal/payload';
import { okJson, returnError } from './internal/results';
import { listTraceFiles } from './internal/traces';

export const runtimeListProfilerTraceFiles = defineTool(
  {
    name: 'RuntimeListProfilerTraceFiles',
    description:
      '[runtime] List ABAP profiler trace files available in ADT runtime. Returns parsed JSON payload.',
    inputSchema: {},
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context) => {
    try {
      const client = await context.getConnection();
      const response = await listTraceFiles(client);

      return okJson({
        success: true,
        status: response.status,
        payload: parseRuntimePayload(response.body),
      });
    } catch (error) {
      context.logger.error(`Error listing profiler trace files: ${String(error)}`);
      return returnError(error);
    }
  },
);
