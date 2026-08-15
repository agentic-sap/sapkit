/**
 * `ReadStructure` — 구조체 하나의 **정의(DDL)와 메타데이터**를 읽는다.
 *
 * `ReadTable`과 같은 흐름이고, 다른 것은 ADT 뿌리 경로와 메타데이터 Accept뿐이다.
 * 그 공통 흐름과 와이어 근거는 `./internal/tableStructureRead.ts` 머리말에 있다
 * (구 핸들러 `engine/src/handlers/structure/readonly/handleReadStructure.ts` +
 * 벤더 `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js`).
 *
 * 같은 구조체를 RFC 통로로 읽는 `GetStructure`와는 **다른 도구**다 — 그쪽은
 * `sets: ['high']`이고 이쪽은 readonly 표면에 있다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { STRUCTURE_READ, readDdicSourceAndMetadata } from './internal/tableStructureRead';

export const readStructure = defineTool(
  {
    name: 'ReadStructure',
    description:
      '[read-only] Read ABAP structure definition and metadata (package, responsible, description, etc.).',
    inputSchema: {
      structure_name: z.string().describe('Structure name (e.g., Z_MY_STRUCTURE).'),
      version: z
        .enum(['active', 'inactive'])
        .describe('Version to read: "active" (default) or "inactive".')
        .default('active'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['structure_name'],
  },
  (context, args) =>
    readDdicSourceAndMetadata(STRUCTURE_READ, context, {
      name: args.structure_name,
      version: args.version,
    }),
);
