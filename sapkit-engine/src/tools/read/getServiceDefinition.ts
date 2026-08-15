/**
 * `GetServiceDefinition` — 서비스 정의(SRVD)의 소스 한 벌.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetServiceDefinition` · 구 소스
 * `engine/src/handlers/service_definition/high/handleGetServiceDefinition.ts:16-38`).
 * 몸통의 대조 원본은 같은 파일 `:50-126`.
 *
 * 와이어는 `./internal/serviceDefinitionRead`에 파일·줄로 모아 두었다. 요점 셋:
 *  - **GET은 한 번뿐이다** — `read()`만 부르고 `readMetadata()`는 부르지 않는다.
 *    짝인 `ReadServiceDefinition`은 둘 다 부른다.
 *  - `GET /sap/bc/adt/ddic/srvd/sources/{소문자}/source/main?version={준 값}` ·
 *    `Accept: text/plain`.
 *  - 못 읽으면 **오류로 올린다**(짝은 삼킨다).
 *
 * ## 404가 마침표 있는 문구에 닿지 않는다 (구도 그렇다)
 *
 * 벤더 감싸개는 404에서 `undefined`를 돌려준다(던지지 않는다 —
 * `AdtServiceDefinition.js:123-129`). 구 핸들러는 그 빈손을 보고
 * `«ServiceDefinition X not found»`를 **자기가 던지고**, 자기 catch가 HTTP 상태를
 * 못 찾아 `Failed to read service definition: ` 접두사 갈래로 떨어진다. 그래서
 * 구 소스에 적힌 마침표 있는 `X not found.` 갈래는 read 경로에서 도달하지 않는다.
 * 반대로 423은 감싸개가 그대로 던지므로 그 갈래는 살아 있다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * `status_text`를 표준 사유 구절로 되세운다(`statusTextFor`). 구는 axios의
 * `statusText`를 그대로 실었다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { adtStatusOf, statusTextFor } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';
import {
  type ServiceDefinitionVersion,
  readServiceDefinitionSource,
} from './internal/serviceDefinitionRead';

export const getServiceDefinition = defineTool(
  {
    name: 'GetServiceDefinition',
    description:
      'Retrieve ABAP service definition definition. Supports reading active or inactive version.',
    inputSchema: {
      service_definition_name: z
        .string()
        .describe('ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_definition/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'read',
    targetNames: ['service_definition_name'],
  },
  async (context: ToolContext, args) => {
    try {
      const raw = args.service_definition_name ?? '';
      if (!raw) return returnError(new Error('service_definition_name is required'));

      const name = raw.toUpperCase();
      const version: ServiceDefinitionVersion =
        args.version === 'inactive' ? 'inactive' : 'active';

      // 접속 획득은 안쪽 try 밖이다 — 구도 그렇고, 접속 실패에 "읽기 실패"
      // 접두사를 붙이면 원인이 바뀐다.
      const client = await context.getConnection();
      context.logger.info(`Reading service definition ${name}, version: ${version}`);

      try {
        const response = await readServiceDefinitionSource(client, name, version);
        // 감싸개가 404를 삼켜 빈손으로 돌아온 자리. 구는 여기서 던진다.
        if (!response) throw new Error(`ServiceDefinition ${name} not found`);

        context.logger.info(`GetServiceDefinition completed successfully: ${name}`);
        return ok(
          JSON.stringify(
            {
              success: true,
              service_definition_name: name,
              version,
              service_definition_data: response.body,
              status: response.status,
              status_text: statusTextFor(response.status),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(
          `Error reading service definition ${name}: ${messageOf(error)}`,
        );

        const status = adtStatusOf(error);
        const message =
          status === 404
            ? `ServiceDefinition ${name} not found.`
            : status === 423
              ? `ServiceDefinition ${name} is locked by another user.`
              : `Failed to read service definition: ${messageOf(error)}`;
        return returnError(new Error(message));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
