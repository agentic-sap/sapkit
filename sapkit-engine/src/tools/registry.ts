/**
 * 도구 등록점 — **유일한 등록 지점**.
 *
 * 개별 도구 모듈은 이 파일을 건드리지 않는다. 각 모듈은 `defineTool(...)`의
 * 결과를 export 하기만 하고, 등록은 물결 말미의 배선 단계가 일괄로 한다
 * (멱등, 확인-후-추가).
 *
 * ## 도구 하나를 여기에 올리는 방법
 *
 * ```ts
 * import { getInclude } from './include/getInclude';   // SapTool 하나
 *
 * export const TOOL_REGISTRY: readonly SapTool[] = [
 *   getInclude,
 * ];
 * ```
 *
 * 배열 순서는 아무 의미가 없다 — `tools/list`의 순서일 뿐이고 노출·게이트
 * 판정과 무관하다. 같은 이름을 두 번 올리면 SDK가 등록 시점에 거부한다.
 *
 * ## 도구 모듈이 만들어야 하는 것
 *
 * ```ts
 * import * as z from 'zod';
 * import { defineTool } from '../../server/toolDefinition';
 *
 * export const getInclude = defineTool(
 *   {
 *     name: 'GetInclude',
 *     description: '[read-only] Retrieve source code of a specific ABAP include file.',
 *     inputSchema: { include_name: z.string().describe('Name of the ABAP Include') },
 *     available_in: ['onprem', 'cloud', 'legacy'],
 *     sets: ['readonly'],
 *     kind: 'read',
 *   },
 *   async (context, args) => {
 *     const client = await context.getConnection();   // 게이트를 지난 뒤에만 불린다
 *     const response = await client.request({ method: 'GET', path: '...' });
 *     return { isError: false, content: [{ type: 'text', text: response.body }] };
 *   },
 * );
 * ```
 *
 * 계약의 정본은 `src/server/toolDefinition.ts`다. 이름·인자 이름·응답 형태는
 * 구 엔진 그대로 두고, `sets`·`kind`만 새로 선언한다.
 *
 * **M1 물결 3 말미에 19종이 배선됐다.** 프레임 자체가 도는지는
 * `src/server/__tests__/core.test.ts`가 가짜 도구로 확인하고, 발행 계약이
 * 구 엔진과 같은지는 각 도구의 시험과 `gates/`의 표면 대조가 확인한다.
 */

import type { SapTool } from '../server/toolDefinition';

import { getTable, getStructure } from './rfc-read';
import { checkSyntax } from './read/checkSyntax';
import { getClass } from './read/getClass';
import { getFunctionModule } from './read/getFunctionModule';
import { getInactiveObjects } from './read/getInactiveObjects';
import { getInclude } from './read/getInclude';
import { getProgram } from './read/getProgram';
import { getSourceDiff } from './read/getSourceDiff';
import { grepObjects } from './read/grepObjects';
import { searchObject } from './read/searchObject';
import { getSqlQuery } from './row-data';
import {
  activateObjects,
  createInclude,
  createProgram,
  updateClass,
  updateInclude,
  updateProgram,
  updateSourceByPatch,
} from './write';

/** 스캐폴드 앵커. 배선 단계가 이 파일을 찾는 표식이다. */
export const TOOL_REGISTRY_MARKER = 'sapkit-engine/tools/registry' as const;

/**
 * M1 도구 19종. 묶음별로 모아 두었을 뿐 순서에는 의미가 없다.
 *
 * 구성 근거는 spec §3 M1-c — 실사용 상위 15종(실호출의 79%)에 대표 절차
 * ("프로그램 생성 → 활성 → 반영 확인")를 완결시키는 보완 4종을 더한 것이다.
 */
export const TOOL_REGISTRY: readonly SapTool[] = [
  // 읽기·검색·반영확인 9종
  searchObject,
  getInclude,
  getInactiveObjects,
  grepObjects,
  checkSyntax,
  getSourceDiff,
  getClass,
  getProgram,
  getFunctionModule,
  // 쓰기·활성 7종
  createProgram,
  createInclude,
  updateProgram,
  updateInclude,
  updateClass,
  updateSourceByPatch,
  activateObjects,
  // RFC 우회 경로를 가진 DDIC 읽기 2종
  getTable,
  getStructure,
  // 실데이터 1종 — 상시 게이트가 서버 코어에 걸려 있다
  getSqlQuery,
];
