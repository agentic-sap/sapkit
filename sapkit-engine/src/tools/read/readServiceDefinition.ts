/**
 * `ReadServiceDefinition` — 서비스 정의(SRVD)의 소스와 오브젝트 메타데이터.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `ReadServiceDefinition` · 구 소스
 * `engine/src/handlers/service_definition/readonly/handleReadServiceDefinition.ts:9-30`).
 * 몸통의 대조 원본은 같은 파일 `:32-98`.
 *
 * 짝인 `GetServiceDefinition`과 **같은 오브젝트를 읽지만 같은 도구가 아니다.**
 * 구 트리에서 이쪽은 `readonly/`에 살고(그래서 `sets: ['readonly']`), GET을 **두
 * 번** 보내며(소스 + 메타데이터), 어느 쪽이 실패해도 `success: true`로 답한다.
 * 두 GET의 주소·Accept·`version` 취급이 서로 다르다는 실측은
 * `./internal/serviceDefinitionRead`의 머리주석에 파일·줄로 있다.
 *
 * ## 접속 획득은 두 try 밖이다
 *
 * 구도 그렇다(`handleReadServiceDefinition.ts:45`). 안쪽에 넣으면 **접속이 아예
 * 없는 기동에서도 `success:true`가 나간다** — 삼키는 갈래가 삼켜서는 안 될
 * 것까지 삼키게 된다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { messageOf, ok, returnError } from './internal/results';
import {
  type ServiceDefinitionVersion,
  readServiceDefinitionMetadata,
  readServiceDefinitionSource,
} from './internal/serviceDefinitionRead';

export const readServiceDefinition = defineTool(
  {
    name: 'ReadServiceDefinition',
    description:
      '[read-only] Read ABAP service definition source code and metadata (package, responsible, description, etc.).',
    inputSchema: {
      service_definition_name: z
        .string()
        .describe('Service definition name (e.g., Z_MY_SRVD).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_definition/readonly/`이고, 채록본 `exposures`의
    // 네 조건 전부에 뜬다.
    sets: ['readonly'],
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

      const client = await context.getConnection();

      let sourceCode: string | null = null;
      try {
        const response = await readServiceDefinitionSource(client, name, version);
        if (response && response.body) sourceCode = response.body;
      } catch (error) {
        context.logger.warn(`Could not read source for ${name}: ${messageOf(error)}`);
      }

      let metadata: string | null = null;
      try {
        const response = await readServiceDefinitionMetadata(client, name);
        if (response.body) metadata = response.body;
      } catch (error) {
        context.logger.warn(`Could not read metadata for ${name}: ${messageOf(error)}`);
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            service_definition_name: name,
            version,
            source_code: sourceCode,
            metadata,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return returnError(error);
    }
  },
);
