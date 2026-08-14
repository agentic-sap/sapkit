/**
 * `GetMetadataExtension` — 메타데이터 확장(DDLX)의 소스 한 벌.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `GetMetadataExtension` · 구 소스
 * `engine/src/handlers/metadata_extension/high/handleGetMetadataExtension.ts:16-38`).
 * 몸통의 대조 원본은 같은 파일 `:50-126`.
 *
 * 와이어는 `./internal/metadataExtensionRead`에 파일·줄로 모아 두었다. 요점 셋:
 *  - **GET은 한 번뿐이다** — `read()`만 부른다. 짝인 `ReadMetadataExtension`은
 *    `readMetadata()`까지 불러 두 번 보낸다.
 *  - `GET /sap/bc/adt/ddic/ddlx/sources/{소문자}/source/main[?version=inactive]` ·
 *    `Accept: text/plain`. `active`는 질의 인자로 나가지 않는다.
 *  - 못 읽으면 **오류로 올린다**(짝은 삼킨다).
 *
 * ## 404가 마침표 있는 문구에 닿지 않는다 (구도 그렇다)
 *
 * 벤더 감싸개는 404에서 `readResult` 없는 상태를 돌려준다(던지지 않는다 —
 * `AdtMetadataExtension.js:127-131`). 구 핸들러는 그 빈손을 보고
 * `«MetadataExtension X not found»`를 **자기가 던지고**, 자기 catch가 HTTP 상태를
 * 못 찾아 `Failed to read metadata extension: ` 접두사 갈래로 떨어진다. 구 소스에
 * 적힌 마침표 있는 `X not found.` 갈래는 그래서 read 경로에서 도달하지 않는다.
 * 423은 감싸개가 그대로 던지므로 살아 있다.
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
import {
  type MetadataExtensionVersion,
  readMetadataExtensionSource,
} from './internal/metadataExtensionRead';
import { messageOf, ok, returnError } from './internal/results';

export const getMetadataExtension = defineTool(
  {
    name: 'GetMetadataExtension',
    description:
      'Retrieve ABAP metadata extension definition. Supports reading active or inactive version.',
    inputSchema: {
      metadata_extension_name: z
        .string()
        .describe('MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe(
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        ),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/metadata_extension/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'read',
    targetNames: ['metadata_extension_name'],
  },
  async (context: ToolContext, args) => {
    try {
      const raw = args.metadata_extension_name ?? '';
      if (!raw) return returnError(new Error('metadata_extension_name is required'));

      const name = raw.toUpperCase();
      const version: MetadataExtensionVersion =
        args.version === 'inactive' ? 'inactive' : 'active';

      const client = await context.getConnection();
      context.logger.info(`Reading metadata extension ${name}, version: ${version}`);

      try {
        const response = await readMetadataExtensionSource(client, name, version);
        if (!response) throw new Error(`MetadataExtension ${name} not found`);

        context.logger.info(`GetMetadataExtension completed successfully: ${name}`);
        return ok(
          JSON.stringify(
            {
              success: true,
              metadata_extension_name: name,
              version,
              metadata_extension_data: response.body,
              status: response.status,
              status_text: statusTextFor(response.status),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        context.logger.error(`Error reading metadata extension ${name}: ${messageOf(error)}`);

        const status = adtStatusOf(error);
        const message =
          status === 404
            ? `MetadataExtension ${name} not found.`
            : status === 423
              ? `MetadataExtension ${name} is locked by another user.`
              : `Failed to read metadata extension: ${messageOf(error)}`;
        return returnError(new Error(message));
      }
    } catch (error) {
      return returnError(error);
    }
  },
);
