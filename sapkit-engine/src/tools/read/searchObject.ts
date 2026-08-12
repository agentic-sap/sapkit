/**
 * SearchObject — 이름·마스크로 리포지터리 오브젝트를 찾는다.
 *
 * ADT quickSearch가 돌려주는 `<adtcore:objectReference …/>` 목록을 표로 접고,
 * 원문 XML도 함께 싣는다(구와 같다 — 파싱이 놓친 속성을 호출자가 직접 볼 수
 * 있어야 한다). **찾은 것이 없으면 오류가 아니라 빈 결과**다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName } from './internal/adt';
import { failure, ok, okEmpty } from './internal/results';

/** 참조 하나의 속성 문자열에서 `name="value"`를 꺼낸다. */
function attributeOf(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? '';
}

export const searchObject = defineTool(
  {
    name: 'SearchObject',
    description:
      "[read-only] Find, search, locate, or check if an ABAP repository object exists by name or wildcard pattern (e.g. 'ZOK*'). Use this tool to answer questions like 'is there a program named...', 'find all objects starting with...', 'does this class exist?', 'list objects matching...'. Supports all repository object types — optionally filter by type (PROG, CLAS, INTF, DEVC, TABL, DDLS, DTEL, FUGR, SRVD, SRVB, BDEF, DDLX, etc.).",
    inputSchema: {
      object_name: z.string().describe("[read-only] Object name or mask (e.g. 'MARA*')"),
      object_type: z
        .string()
        .optional()
        .describe("[read-only] Optional ABAP object type (e.g. 'TABL', 'CLAS/OC')"),
      maxResults: z
        .number()
        .default(100)
        .describe('[read-only] Maximum number of results to return'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args.object_name) {
        throw new Error('object_name is required');
      }

      const client = await context.getConnection();
      const maxResults = args.maxResults || 100;

      context.logger.info(
        `Searching objects: query=${args.object_name}${
          args.object_type ? ` type=${args.object_type}` : ''
        }`,
      );

      // 질의 인자는 구와 같은 순서·같은 인코딩으로 경로에 직접 실린다.
      let path =
        `/sap/bc/adt/repository/informationsystem/search` +
        `?operation=quickSearch&query=${encodeObjectName(args.object_name)}&maxResults=${maxResults}`;
      if (args.object_type) {
        path += `&objectType=${encodeObjectName(args.object_type)}`;
      }

      const response = await client.request({
        method: 'GET',
        path,
        accept: 'application/xml',
        timeout: 'default',
      });

      const xmlText = response.body ?? '';
      const matches = [...xmlText.matchAll(/<adtcore:objectReference\s+([^>]*)\/>/g)];
      // ADT가 아무것도 못 찾으면 빈 `<adtcore:objectReferences/>`가 온다.
      if (matches.length === 0) return okEmpty();

      // packageName은 참조 속성에 없을 수 있어, 그때는 문서 수준 요소를 본다.
      const documentPackage = xmlText.match(
        /<adtcore:packageName>([^<]*)<\/adtcore:packageName>/,
      );

      const results = matches.map((match) => {
        const attributes = match[1] ?? '';
        return {
          name: attributeOf(attributes, 'adtcore:name'),
          type: attributeOf(attributes, 'adtcore:type'),
          description: attributeOf(attributes, 'adtcore:description'),
          packageName:
            attributeOf(attributes, 'adtcore:packageName') || (documentPackage?.[1] ?? ''),
        };
      });

      return ok(JSON.stringify({ results, rawXML: xmlText }));
    } catch (error) {
      // 구와 같은 문구다 — 접두사 `ADT error: `가 계약의 일부.
      return failure(`ADT error: ${String(error)}`);
    }
  },
);
