/**
 * GetScreensList — 프로그램에 딸린 화면(dynpro) 번호를 늘어놓는다.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/screen/readonly/handleGetScreensList.ts:35-131`
 *  - 한 다리: `engine/src/lib/clients.ts`의 `createAdtClient` → `getUtils()`
 *  - 와이어 정본: `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:560-562`
 *    → `dist/core/shared/objectStructure.js:27-45`
 *
 * 몸통은 `./internal/programNodeList`에 있다 — `GetGuiStatusList`와 같은 요청,
 * 같은 걸러 내기이고 마디 타입과 필드 이름만 다르다.
 *
 * ## 구와 다른 것 — 장부 D91 (`harness/DIVERGENCES.md`)
 * `isCloudConnection()`(JWT 전용) 갈래는 신 엔진에 인증 종류가 하나뿐이라
 * 도달 불가능하므로 짓지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { type ProgramNodeKind, listProgramNodes } from './internal/programNodeList';

const SCREENS: ProgramNodeKind = {
  toolName: 'GetScreensList',
  nodeType: 'PROG/PS',
  itemField: 'screen_number',
  totalField: 'total_screens',
  listField: 'screens',
  noun: 'screens',
  unit: 'screens',
};

export const getScreensList = defineTool(
  {
    name: 'GetScreensList',
    description: '[read-only] List all screens (dynpros) belonging to an ABAP program.',
    inputSchema: {
      program_name: z.string().describe('Program name (e.g., SAPMV45A).'),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => listProgramNodes(SCREENS, context, args.program_name),
);
