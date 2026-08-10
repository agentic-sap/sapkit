/**
 * GetInactiveObjects — 활성화를 기다리는 오브젝트 목록.
 *
 * ADT의 `ioc:inactiveObjects` 문서에서 각 항목의 오브젝트 참조만 뽑아 `{type,
 * name}` 표로 접는다. 원문 XML은 싣지 않는다(구도 싣지 않았다 — 그 통로는
 * `includeRawXml` 옵션이었고 이 도구는 켜지 않는다).
 */

import { XMLParser } from 'fast-xml-parser';

import { defineTool } from '../../server/toolDefinition';
import { failure, messageOf, ok } from './internal/results';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
});

function asArray(node: unknown): unknown[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

export const getInactiveObjects = defineTool(
  {
    name: 'GetInactiveObjects',
    description:
      '[read-only] Get a list of inactive ABAP objects — modified but not yet activated, pending activation. Shows classes, tables, CDS views, and other objects awaiting activation.',
    inputSchema: {},
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context) => {
    try {
      const client = await context.getConnection();
      context.logger.info('Retrieving inactive objects...');

      const response = await client.request({
        method: 'GET',
        path: '/sap/bc/adt/activation/inactiveobjects',
        accept:
          'application/vnd.sap.adt.inactivectsobjects.v1+xml, application/xml;q=0.8',
        timeout: 'default',
      });

      const document = parser.parse(response.body) as Record<string, any>;
      const root = document['ioc:inactiveObjects'];

      const objects: Array<{ type: string; name: string }> = [];
      for (const entry of asArray(root?.['ioc:entry'])) {
        const reference = (entry as Record<string, any>)?.['ioc:object']?.['ioc:ref'];
        if (!reference) continue;
        objects.push({
          type: reference['@_adtcore:type'] || '',
          name: reference['@_adtcore:name'] || '',
        });
      }

      return ok(
        JSON.stringify({ success: true, count: objects.length, objects }, null, 2),
      );
    } catch (error) {
      context.logger.error(`Error retrieving inactive objects: ${messageOf(error)}`);
      return failure(`Error: ${messageOf(error)}`);
    }
  },
);
