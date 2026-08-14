/**
 * GetGuiStatusList — 프로그램에 딸린 GUI 상태 이름을 늘어놓는다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/gui_status/readonly/handleGetGuiStatusList.ts:35-134`
 *  - 와이어 정본: `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:560-562`
 *    → `dist/core/shared/objectStructure.js:27-45`
 *
 * 몸통은 `./internal/programNodeList`에 있다 — `GetScreensList`와 **같은 요청**을
 * 보내고, 걷는 마디 타입(`PROG/PC` vs `PROG/PS`)과 응답 필드 이름만 다르다.
 *
 * ## 구와 다른 것 — 장부 D91 (`harness/DIVERGENCES.md`)
 * `isCloudConnection()`(JWT 전용) 갈래는 도달 불가능해 짓지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { type ProgramNodeKind, listProgramNodes } from './internal/programNodeList';

const GUI_STATUSES: ProgramNodeKind = {
  toolName: 'GetGuiStatusList',
  nodeType: 'PROG/PC',
  itemField: 'status_name',
  totalField: 'total_statuses',
  listField: 'statuses',
  noun: 'GUI statuses',
  unit: 'statuses',
};

export const getGuiStatusList = defineTool(
  {
    name: 'GetGuiStatusList',
    description: '[read-only] List all GUI statuses belonging to an ABAP program.',
    inputSchema: {
      program_name: z.string().describe('Program name (e.g., SAPMV45A).'),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => listProgramNodes(GUI_STATUSES, context, args.program_name),
);
