/**
 * DeleteMetadataExtension — 메타데이터 확장(DDLX)을 SAP에서 **지운다.**
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 삭제는 재생 대조가
 * 원리상 불가능하므로 요구 증거 급이 `attended 실기`이고, 이 판이 끝나도
 * **「지음 · 증거 대기」**에 머문다.
 *
 * ## 삭제 서비스를 **쓰지 않는다** — 이 묶음에서 갈리는 자리 (실측)
 *
 * 겉: `engine/src/handlers/metadata_extension/high/handleDeleteMetadataExtension.ts:48-137`.
 * 사슬: `…/dist/core/metadataExtension/AdtMetadataExtension.js`의 `delete()` —
 * 벤더 주석이 못 박는다: **"no lock/unlock, no deletion check for metadata
 * extensions"**. 저수준은 `…/dist/core/metadataExtension/delete.js:24-35` 한 줄짜리다:
 *
 * ```
 * DELETE /sap/bc/adt/ddic/ddlx/sources/{소문자}[?corrNr=<TR>]
 * Accept: application/xml        (Content-Type 없음 · 본문 없음)
 * ```
 *
 * 다른 12종이 `POST /sap/bc/adt/deletion/check` + `POST …/delete`로 가는 것과
 * **메서드부터 다르다.** 이송번호도 전문이 아니라 **질의 인자 `corrNr`**로 실린다.
 * 겉 핸들러의 주석은 "includes deletion check"라고 적지만 **본문에는 그 걸음이
 * 없다** — 주석이 아니라 본문이 계약이다.
 *
 * 그래서 **거짓 성공 판정(`assertDeletionSucceeded`)도 걸리지 않는다.** 응답이
 * `del:deletionResult`가 아니기 때문이다. 구에 없는 판정을 여기서 새로 만들지 않았다.
 *
 * ## 이름은 **소문자 · 인코딩 없음**
 *
 * `name.toLowerCase()`만 하고 `encodeURIComponent`을 거치지 않는다(`delete.js:25`).
 * 이미 지어진 `./internal/metadataExtension.ts`의 `metadataExtensionWriteUri`와 같은
 * 규칙이라 그것을 그대로 쓴다 — 같은 도구 안에서 **구문검사 URI만 인코딩 뒤
 * 소문자**라는 함정이 그 파일에 실측돼 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { deletionFailureMessage } from './internal/deletion';
import { metadataExtensionWriteUri } from './internal/metadataExtension';
import { errorResult, okResult } from './shared';

export const deleteMetadataExtension = defineTool(
  {
    name: 'DeleteMetadataExtension',
    description:
      'Delete an ABAP metadata extension from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.',
    inputSchema: {
      metadata_extension_name: z
        .string()
        .describe('MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['metadata_extension_name'],
  },
  async (context, args) => {
    if (!args.metadata_extension_name) {
      return errorResult('Error: metadata_extension_name is required');
    }

    const metadataExtensionName = args.metadata_extension_name.toUpperCase();
    context.logger.info(`Starting metadata extension deletion: ${metadataExtensionName}`);

    try {
      const client = await context.getConnection();
      await client.request({
        method: 'DELETE',
        path: metadataExtensionWriteUri(metadataExtensionName),
        params: { corrNr: args.transport_request },
        accept: 'application/xml',
        timeout: 'default',
      });

      context.logger.info(
        `DeleteMetadataExtension completed successfully: ${metadataExtensionName}`,
      );
      return okResult({
        success: true,
        metadata_extension_name: metadataExtensionName,
        transport_request: args.transport_request || null,
        message: `MetadataExtension ${metadataExtensionName} deleted successfully.`,
      });
    } catch (error) {
      const message = deletionFailureMessage(error, {
        subject: 'metadata extension',
        label: 'MetadataExtension',
        name: metadataExtensionName,
      });
      context.logger.error(
        `Error deleting metadata extension ${metadataExtensionName}: ${message}`,
      );
      return errorResult(`Error: ${message}`);
    }
  },
);
