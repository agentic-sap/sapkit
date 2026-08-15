/**
 * `GetVirtualFoldersLow` — 정보시스템의 가상 폴더(패키지·그룹·종류 축)로 훑기.
 *
 * 구 핸들러: `engine/src/handlers/system/low/handleGetVirtualFolders.ts`.
 *
 * ## 와이어를 어디서 복원했나
 *
 * 겉 핸들러는 `client.getUtils().getVirtualFoldersContents(params)` 한 줄이고
 * (`:101`), 조립은 안쪽 패키지에 있다:
 *
 *  `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:86-88`
 *   → `dist/core/shared/virtualFolders.js:40-73`
 *
 * ```
 * POST /sap/bc/adt/repository/informationsystem/virtualfolders/contents
 *      [?withVersions=…][&ignoreShortDescriptions=…]
 *      Accept:       application/vnd.sap.adt.repository.virtualfolders.result.v1+xml
 *      Content-Type: application/vnd.sap.adt.repository.virtualfolders.request.v1+xml
 *      timeout: getTimeout('default')
 * ```
 *
 * 본문은 `vfs:virtualFoldersRequest` 한 덩이다(`virtualFolders.js:29-45`):
 * `objectSearchPattern` 속성 → `vfs:preselection`들 → `vfs:facetorder`, 이 순서다.
 *
 * ## 질의 인자는 **준 것만** 실린다
 *
 * `withVersions`·`ignoreShortDescriptions`는 `!== undefined`일 때만 붙고
 * (`virtualFolders.js:57-62`), 값은 `String(...)`이라 `false`도 `"false"`로
 * 실린다. 발행 스키마의 `default: false`는 **선언에만 있고 코드에는 없다** —
 * 겉 핸들러가 `args.with_versions`를 그대로 넘기므로(`:97-98`) 주지 않으면
 * `undefined`고, 그러면 인자가 아예 안 나간다. 채록본에도 이 두 인자의 `default`가
 * 실려 있지 않다.
 *
 * ## 이스케이프는 다섯 글자다
 *
 * `&` `<` `>` `"` `'` → `&amp;` `&lt;` `&gt;` `&quot;` `&apos;`
 * (`virtualFolders.js:10-16`). 순서가 중요하다 — `&`가 맨 먼저라야 두 번 escape
 * 되지 않는다.
 *
 * ## 인자 검증이 없다 (구 그대로)
 *
 * 필수 인자가 없는 도구라 겉 핸들러도 검증하지 않는다. `object_search_pattern`이
 * 비면 `|| '*'`가 받고, `facet_order`가 비면 `|| ['package','group','type']`이
 * 받는다(`:94-96`). **빈 배열도 falsy가 아니므로 그대로 나간다** — 그러면
 * `buildFacetOrderXml`이 빈 문자열을 돌려주어 `vfs:facetorder` 요소 자체가
 * 사라진다(`virtualFolders.js:31-33`).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { ok, returnError } from './internal/results';

export const VIRTUAL_FOLDERS_PATH =
  '/sap/bc/adt/repository/informationsystem/virtualfolders/contents';

/** `dist/constants/contentTypes.js:50-51` 글자 그대로. */
export const ACCEPT_VIRTUAL_FOLDERS =
  'application/vnd.sap.adt.repository.virtualfolders.result.v1+xml';
export const CT_VIRTUAL_FOLDERS =
  'application/vnd.sap.adt.repository.virtualfolders.request.v1+xml';

const VIRTUAL_FOLDERS_NAMESPACE = 'http://www.sap.com/adt/ris/virtualFolders';

/** 겉 핸들러의 `|| ['package','group','type']`(`handleGetVirtualFolders.ts:96`). */
export const DEFAULT_FACET_ORDER: readonly string[] = ['package', 'group', 'type'];

export interface VirtualFolderPreselection {
  readonly facet: string;
  readonly values: readonly string[];
}

/** `virtualFolders.js:10-16` — `&`를 맨 먼저 바꾼다. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface VirtualFoldersRequest {
  readonly objectSearchPattern?: string;
  readonly preselection?: readonly VirtualFolderPreselection[];
  readonly facetOrder?: readonly string[];
}

/** `virtualFolders.js:17-45` — preselection 먼저, facetorder가 뒤다. */
export function buildVirtualFoldersRequestXml(request: VirtualFoldersRequest): string {
  const pattern = escapeXml(request.objectSearchPattern ?? '*');

  const preselection = request.preselection;
  const preselectionXml =
    !preselection || preselection.length === 0
      ? ''
      : preselection
          .map((entry) => {
            const values = (entry.values ?? [])
              .map((value) => `<vfs:value>${escapeXml(value)}</vfs:value>`)
              .join('');
            return `<vfs:preselection facet="${escapeXml(entry.facet)}">${values}</vfs:preselection>`;
          })
          .join('');

  const facetOrder = request.facetOrder ?? DEFAULT_FACET_ORDER;
  const facetOrderXml =
    facetOrder.length === 0
      ? ''
      : `<vfs:facetorder>${facetOrder
          .map((facet) => `<vfs:facet>${escapeXml(facet)}</vfs:facet>`)
          .join('')}</vfs:facetorder>`;

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<vfs:virtualFoldersRequest xmlns:vfs="${VIRTUAL_FOLDERS_NAMESPACE}" ` +
    `objectSearchPattern="${pattern}">${preselectionXml}${facetOrderXml}` +
    '</vfs:virtualFoldersRequest>'
  );
}

export const getVirtualFoldersLow = defineTool(
  {
    name: 'GetVirtualFoldersLow',
    description:
      '[low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.',
    inputSchema: {
      object_search_pattern: z
        .string()
        .default('*')
        .describe('Object search pattern (e.g., "*", "Z*", "ZCL_*"). Default: "*"'),
      preselection: z
        .array(
          z.object({
            facet: z.string().describe('Facet name (e.g., "package", "group", "type")'),
            values: z.unknown().describe('Array of facet values to filter by'),
          }),
        )
        .optional()
        .describe('Optional preselection filters (facet-value pairs for filtering)'),
      facet_order: z
        .array(z.string())
        .default([...DEFAULT_FACET_ORDER])
        .describe(
          'Order of facets in response (e.g., ["package", "group", "type"]). Default: ["package", "group", "type"]',
        ),
      with_versions: z.boolean().optional().describe('Include version information in response'),
      ignore_short_descriptions: z
        .boolean()
        .optional()
        .describe('Ignore short descriptions in response'),
    },
    available_in: ['onprem', 'cloud'],
    // `handlers/system/low/`에 살지만 구 서버는 `SystemHandlersGroup`에 등록했다
    // (`SystemHandlersGroup.ts:325-327`) — `sets: ['low']`가 아니다.
    sets: ['system'],
    kind: 'read',
    // 대상이 오브젝트 이름이 아니라 **검색 패턴**이다. 표준 마스크를 받는 것이
    // 정상 사용이므로 선언하지 않는다 — `SearchObject`와 같은 자리다.
    targetNames: [],
  },
  async (context, args) => {
    try {
      const client = await context.getConnection();
      context.logger.info('Fetching virtual folders contents');

      const preselection = args.preselection as
        | ReadonlyArray<{ facet: string; values: readonly string[] }>
        | undefined;

      const response = await client.request({
        method: 'POST',
        path: VIRTUAL_FOLDERS_PATH,
        params: {
          ...(args.with_versions !== undefined
            ? { withVersions: String(args.with_versions) }
            : {}),
          ...(args.ignore_short_descriptions !== undefined
            ? { ignoreShortDescriptions: String(args.ignore_short_descriptions) }
            : {}),
        },
        body: buildVirtualFoldersRequestXml({
          objectSearchPattern: args.object_search_pattern || '*',
          ...(preselection ? { preselection } : {}),
          facetOrder: args.facet_order || [...DEFAULT_FACET_ORDER],
        }),
        accept: ACCEPT_VIRTUAL_FOLDERS,
        contentType: CT_VIRTUAL_FOLDERS,
        timeout: 'default',
      });

      context.logger.debug('Virtual folders contents fetched successfully');

      return ok(response.body);
    } catch (error) {
      context.logger.error('Failed to fetch virtual folders contents');
      return returnError(error);
    }
  },
);
