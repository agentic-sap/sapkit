/**
 * 도구 등록점 — **유일한 등록 지점**.
 *
 * ## 배선은 도구마다 즉시 한다 (옛 규약을 뒤집었다)
 *
 * 예전 규약은 "모듈은 이 파일을 건드리지 않고, 등록은 물결 말미의 배선 단계가
 * 일괄로 한다"였다. **더는 아니다.** 도구 1종의 완성 단위는 **모듈 + 시험 +
 * 등록점 배선 + 대장 갱신**이고, 그 넷이 **한 커밋**으로 묶인다(spec §4.5·§5.3).
 *
 * 일괄 배선을 버린 이유는 반쪽 상태 때문이다. 모듈은 있는데 등록되지 않은 도구는
 * `tools/list`에 뜨지 않으므로 표면 게이트에도 잡히지 않고, 진척 대장은 등록점을
 * 「지음」의 유일한 기준으로 삼으므로 그 도구를 **「안 지음」으로 보고한다** —
 * 다음 세션이 이미 지은 도구를 다시 짓는다. 절차의 정본은 `ADDING-A-TOOL.md`.
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
 * 프레임 자체가 도는지는 `src/server/__tests__/core.test.ts`가 가짜 도구로
 * 확인하고, 발행 계약이 구 엔진과 같은지는 각 도구의 시험과 `gates/`의 표면
 * 대조가 확인한다.
 */

import type { SapTool } from '../server/toolDefinition';

import { getTable, getStructure } from './rfc-read';
import { checkSyntax } from './read/checkSyntax';
import { getClass } from './read/getClass';
import { getFunctionModule } from './read/getFunctionModule';
import { getInactiveObjects } from './read/getInactiveObjects';
import { getInclude } from './read/getInclude';
import { getInstalledComponents } from './read/getInstalledComponents';
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

// ── 묶음별 import 구획 ──────────────────────────────────────────────────
// 아래 배열의 「묶음 구획」과 짝을 이룬다. **새 도구는 배럴(`./write` 같은
// 재수출)이 아니라 파일 경로로 직접 가져온다** — 배럴을 거치면 여러 묶음이
// 같은 배럴 파일에서 충돌한다. 자기 구획 안에만 더할 것.

// 묶음: system
import { describeByList } from './read/describeByList';
import { getAbapAST } from './read/getAbapAST';
import { getAbapSemanticAnalysis } from './read/getAbapSemanticAnalysis';
import { getAbapSystemSymbols } from './read/getAbapSystemSymbols';
import { getObjectInfo } from './read/getObjectInfo';
import { getObjectStructure } from './read/getObjectStructure';
import { getPackageTree } from './read/getPackageTree';
import { getSession } from './read/getSession';
import { getSystemInfo } from './read/getSystemInfo';
import { getTransaction } from './read/getTransaction';
import { getTypeInfo } from './read/getTypeInfo';
import { getWhereUsed } from './read/getWhereUsed';

// 묶음: search
import { getObjectsByType } from './read/getObjectsByType';
import { grepPackages } from './read/grepPackages';

// 묶음: common

// 묶음: runtime
import { runtimeAnalyzeDump } from './runtime/runtimeAnalyzeDump';
import { runtimeAnalyzeProfilerTrace } from './runtime/runtimeAnalyzeProfilerTrace';
import { runtimeCreateProfilerTraceParameters } from './runtime/runtimeCreateProfilerTraceParameters';
import { runtimeGetDumpById } from './runtime/runtimeGetDumpById';
import { runtimeGetGatewayErrorLog } from './runtime/runtimeGetGatewayErrorLog';
import { runtimeGetProfilerTraceData } from './runtime/runtimeGetProfilerTraceData';
import { runtimeListDumps } from './runtime/runtimeListDumps';
import { runtimeListProfilerTraceFiles } from './runtime/runtimeListProfilerTraceFiles';
import { runtimeRunClassWithProfiling } from './runtime/runtimeRunClassWithProfiling';
import { runtimeRunProgramWithProfiling } from './runtime/runtimeRunProgramWithProfiling';
import { reloadProfile } from './runtime/reloadProfile';

// 묶음: include
import { getIncludesList } from './read/getIncludesList';

// 묶음: class
import { createClass } from './write/createClass';
import { updateClassMethod } from './write/updateClassMethod';
import { updateLocalTestClass } from './write/updateLocalTestClass';
import { updateLocalTypes } from './write/updateLocalTypes';
import { getClassMethod } from './read/getClassMethod';
import { getLocalDefinitions } from './read/getLocalDefinitions';
import { getLocalMacros } from './read/getLocalMacros';
import { getLocalTestClass } from './read/getLocalTestClass';
import { getLocalTypes } from './read/getLocalTypes';
import { readClass } from './read/readClass';

// 묶음: table
import { readTable } from './read/readTable';
import { getTableContents } from './row-data/getTableContents';
import { createTable } from './write/createTable';
import { updateTable } from './write/updateTable';

// 묶음: program
import { getProgFullCode } from './read/getProgFullCode';
import { readProgram } from './read/readProgram';

// 묶음: function-module
import { readFunctionModule } from './read/readFunctionModule';
import { createFunctionModule } from './write/createFunctionModule';
import { updateFunctionModule } from './write/updateFunctionModule';

// 묶음: structure
import { readStructure } from './read/readStructure';
import { createStructure } from './write/createStructure';
import { updateStructure } from './write/updateStructure';

// 묶음: view
import { getView } from './read/getView';
import { readView } from './read/readView';
import { createView } from './write/createView';
import { updateView } from './write/updateView';

// 묶음: unit-test
import { getUnitTest } from './runtime/getUnitTest';
import { getUnitTestResult } from './runtime/getUnitTestResult';
import { getUnitTestStatus } from './runtime/getUnitTestStatus';
import { runUnitTest } from './runtime/runUnitTest';

// 묶음: behavior-definition
import { getBehaviorDefinition } from './read/getBehaviorDefinition';
import { readBehaviorDefinition } from './read/readBehaviorDefinition';
import { createBehaviorDefinition } from './write/createBehaviorDefinition';
import { updateBehaviorDefinition } from './write/updateBehaviorDefinition';

// 묶음: data-element
import { createDataElement } from './write/createDataElement';
import { getDataElement } from './read/getDataElement';
import { readDataElement } from './read/readDataElement';

// 묶음: service-binding
import { getServiceBinding } from './read/getServiceBinding';
import { listServiceBindingTypes } from './read/listServiceBindingTypes';
import { readServiceBinding } from './read/readServiceBinding';
import { validateServiceBinding } from './read/validateServiceBinding';
import { createServiceBinding } from './write/createServiceBinding';
import { updateServiceBinding } from './write/updateServiceBinding';

// 묶음: domain
import { createDomain } from './write/createDomain';
import { getDomain } from './read/getDomain';
import { readDomain } from './read/readDomain';

// 묶음: transport
import { getTransport } from './read/getTransport';
import { listTransports } from './read/listTransports';
import { createTransport } from './write/createTransport';
import { releaseTransport } from './write/releaseTransport';

// 묶음: metadata-extension
import { getMetadataExtension } from './read/getMetadataExtension';
import { readMetadataExtension } from './read/readMetadataExtension';
import { createMetadataExtension } from './write/createMetadataExtension';
import { updateMetadataExtension } from './write/updateMetadataExtension';

// 묶음: gui-status
import { getGuiStatusList } from './read/getGuiStatusList';
import { readGuiStatus } from './rfc-read/readGuiStatus';
import { getGuiStatus } from './rfc-read/getGuiStatus';
import { createGuiStatus } from './write/createGuiStatus';
import { updateGuiStatus } from './write/updateGuiStatus';
import { patchGuiStatus } from './write/patchGuiStatus';

// 묶음: text-element
import { getTextElement } from './rfc-read/getTextElement';
import { readTextElementsBulk } from './rfc-read/readTextElementsBulk';
import { createTextElement } from './write/createTextElement';
import { updateTextElement } from './write/updateTextElement';
import { writeTextElementsBulk } from './write/writeTextElementsBulk';

// 묶음: atc
import { getAtcFindings } from './read/getAtcFindings';

// 묶음: package
import { getPackage } from './read/getPackage';
import { getPackageContents } from './read/getPackageContents';

// 묶음: screen
import { getScreensList } from './read/getScreensList';
import { readScreen } from './rfc-read/readScreen';
import { getScreen } from './rfc-read/getScreen';
import { createScreen } from './write/createScreen';
import { updateScreen } from './write/updateScreen';

// 묶음: service-definition
import { getServiceDefinition } from './read/getServiceDefinition';
import { readServiceDefinition } from './read/readServiceDefinition';
import { createServiceDefinition } from './write/createServiceDefinition';
import { updateServiceDefinition } from './write/updateServiceDefinition';

// 묶음: behavior-implementation
import { getBehaviorImplementation } from './read/getBehaviorImplementation';
import { readBehaviorImplementation } from './read/readBehaviorImplementation';
import { createBehaviorImplementation } from './write/createBehaviorImplementation';
import { updateBehaviorImplementation } from './write/updateBehaviorImplementation';

// 묶음: function-group
import { getFunctionGroup } from './read/getFunctionGroup';
import { readFunctionGroup } from './read/readFunctionGroup';
import { createFunctionGroup } from './write/createFunctionGroup';

// 묶음: interface
import { getInterface } from './read/getInterface';
import { readInterface } from './read/readInterface';
import { createInterface } from './write/createInterface';
import { updateInterface } from './write/updateInterface';

// 묶음: enhancement
import { getEnhancementImpl } from './read/getEnhancementImpl';
import { getEnhancementSpot } from './read/getEnhancementSpot';
import { getEnhancements } from './read/getEnhancements';

// 묶음: tail-delete
import { deleteBehaviorDefinition } from './write/deleteBehaviorDefinition';
import { deleteBehaviorImplementation } from './write/deleteBehaviorImplementation';
import { deleteCdsUnitTest } from './write/deleteCdsUnitTest';
import { deleteClass } from './write/deleteClass';
import { deleteGuiStatus } from './write/deleteGuiStatus';
import { deleteInterface } from './write/deleteInterface';
import { deleteLocalDefinitions } from './write/deleteLocalDefinitions';
import { deleteLocalMacros } from './write/deleteLocalMacros';
import { deleteLocalTestClass } from './write/deleteLocalTestClass';
import { deleteLocalTypes } from './write/deleteLocalTypes';
import { deleteMetadataExtension } from './write/deleteMetadataExtension';
import { deleteProgram } from './write/deleteProgram';
import { deleteDataElement } from './write/deleteDataElement';
import { deleteFunctionGroup } from './write/deleteFunctionGroup';
import { deleteFunctionModule } from './write/deleteFunctionModule';
import { deleteScreen } from './write/deleteScreen';
import { deleteServiceDefinition } from './write/deleteServiceDefinition';
import { deleteDomain } from './write/deleteDomain';
import { deleteStructure } from './write/deleteStructure';
import { deleteTable } from './write/deleteTable';
import { deleteUnitTest } from './write/deleteUnitTest';
import { deleteView } from './write/deleteView';

// 묶음: tail-test

// 묶음: tail-read

/** 스캐폴드 앵커. 배선 단계가 이 파일을 찾는 표식이다. */
export const TOOL_REGISTRY_MARKER = 'sapkit-engine/tools/registry' as const;

/**
 * 등록된 도구. 묶음별로 모아 두었을 뿐 순서에는 의미가 없다.
 *
 * M1 19종의 구성 근거는 spec §3 M1-c — 실사용 상위 15종(실호출의 79%)에 대표
 * 절차("프로그램 생성 → 활성 → 반영 확인")를 완결시키는 보완 4종을 더한 것이다.
 * 그 뒤로는 `harness/build-plan.json`의 묶음 순서대로 한 종씩 더해 간다.
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

  // ── 묶음 구획 ────────────────────────────────────────────────────────
  // 아래 구획은 `harness/build-plan.json`의 묶음 하나씩에 대응한다.
  // **자기 구획 안에만 더하고 남의 구획은 손대지 않는다** — 여러 묶음이 동시에
  // 지어질 때 이 파일에서 나는 충돌을 줄이려고 미리 갈라 둔 자리다.
  // 새 묶음을 시작할 때는 여기에 구획을 하나 더 연다.

  // 묶음: system — 시스템·공통 조회 (순서 1)
  getInstalledComponents,
  describeByList,
  getAbapAST,
  getAbapSemanticAnalysis,
  getAbapSystemSymbols,
  getObjectInfo,
  getObjectStructure,
  getPackageTree,
  getSession,
  getSystemInfo,
  getTransaction,
  getTypeInfo,
  getWhereUsed,

  // 묶음: search — 검색 (순서 2)
  getObjectsByType,
  grepPackages,

  // 묶음: common — 공통 편집·활성 (순서 3)

  // 묶음: runtime — 덤프·프로파일러·시스템 메시지 (순서 4)
  runtimeListDumps,
  runtimeGetDumpById,
  runtimeAnalyzeDump,
  runtimeListProfilerTraceFiles,
  runtimeGetProfilerTraceData,
  runtimeAnalyzeProfilerTrace,
  runtimeCreateProfilerTraceParameters,
  runtimeGetGatewayErrorLog,
  runtimeRunProgramWithProfiling,
  runtimeRunClassWithProfiling,
  // 이 묶음의 유일한 비(非) SAP 도구 — 서버 자신의 프로파일을 다시 읽는다.
  reloadProfile,

  // 묶음: include — 인클루드 (순서 5)
  getIncludesList,

  // 묶음: class — 클래스 (순서 6)
  readClass,
  getClassMethod,
  getLocalDefinitions,
  getLocalMacros,
  getLocalTestClass,
  getLocalTypes,
  createClass,
  updateClassMethod,
  updateLocalTestClass,
  updateLocalTypes,

  // 묶음: table — 테이블 (순서 7)
  // 실데이터 2종의 나머지 한 짝 — 상시 게이트가 이 이름을 이미 알고 있다
  // (`src/safety/rowData.ts`의 ROW_DATA_TOOLS).
  getTableContents,
  readTable,
  createTable,
  updateTable,

  // 묶음: program — 프로그램 (순서 8)
  getProgFullCode,
  readProgram,

  // 묶음: function-module — 함수모듈 (순서 9)
  readFunctionModule,
  createFunctionModule,
  updateFunctionModule,

  // 묶음: structure — 구조체 (순서 10)
  readStructure,
  createStructure,
  updateStructure,

  // 묶음: view — 뷰 (순서 11)
  createView,
  getView,
  readView,
  updateView,

  // 묶음: unit-test — 단위시험 (순서 12)
  runUnitTest,
  getUnitTestStatus,
  getUnitTestResult,
  getUnitTest,

  // 묶음: behavior-definition — 동작 정의 (BDEF) (순서 13)
  createBehaviorDefinition,
  getBehaviorDefinition,
  readBehaviorDefinition,
  updateBehaviorDefinition,

  // 묶음: data-element — 데이터 엘리먼트 (순서 14)
  createDataElement,
  getDataElement,
  readDataElement,

  // 묶음: service-binding — 서비스 바인딩 (순서 15)
  readServiceBinding,
  getServiceBinding,
  listServiceBindingTypes,
  validateServiceBinding,
  updateServiceBinding,
  createServiceBinding,

  // 묶음: domain — 도메인 (순서 16)
  createDomain,
  getDomain,
  readDomain,

  // 묶음: transport — 트랜스포트 (순서 17)
  getTransport,
  listTransports,
  createTransport,
  releaseTransport,

  // 묶음: metadata-extension — 메타데이터 확장 (DDLX) (순서 18)
  readMetadataExtension,
  getMetadataExtension,
  updateMetadataExtension,
  createMetadataExtension,

  // 묶음: gui-status — GUI 상태 (순서 19)
  getGuiStatusList,
  readGuiStatus,
  getGuiStatus,
  createGuiStatus,
  updateGuiStatus,
  patchGuiStatus,

  // 묶음: text-element — 텍스트 엘리먼트 (순서 20)
  getTextElement,
  readTextElementsBulk,
  createTextElement,
  updateTextElement,
  writeTextElementsBulk,

  // 묶음: atc — ATC (순서 21)
  getAtcFindings,

  // 묶음: package — 패키지 (순서 22)
  getPackage,
  getPackageContents,

  // 묶음: screen — 화면 (순서 23)
  getScreensList,
  readScreen,
  getScreen,
  createScreen,
  updateScreen,

  // 묶음: service-definition — 서비스 정의 (순서 24)
  readServiceDefinition,
  getServiceDefinition,
  updateServiceDefinition,
  createServiceDefinition,

  // 묶음: behavior-implementation — 동작 구현 (BIMP) (순서 25)
  createBehaviorImplementation,
  getBehaviorImplementation,
  readBehaviorImplementation,
  updateBehaviorImplementation,

  // 묶음: function-group — 함수그룹 (순서 26)
  getFunctionGroup,
  readFunctionGroup,
  createFunctionGroup,

  // 묶음: interface — 인터페이스 (순서 27)
  createInterface,
  getInterface,
  readInterface,
  updateInterface,

  // 묶음: enhancement — 인핸스먼트 (순서 28)
  getEnhancements,
  getEnhancementSpot,
  getEnhancementImpl,

  // 묶음: tail-delete — 꼬리 — 삭제 계열 25종 (순서 29)
  deleteClass,
  deleteInterface,
  deleteProgram,
  deleteTable,
  deleteStructure,
  deleteView,
  deleteDomain,
  deleteDataElement,
  deleteFunctionGroup,
  deleteFunctionModule,
  deleteServiceDefinition,
  deleteBehaviorDefinition,
  deleteBehaviorImplementation,
  deleteCdsUnitTest,
  deleteUnitTest,
  deleteMetadataExtension,
  deleteLocalTestClass,
  deleteLocalDefinitions,
  deleteLocalMacros,
  deleteLocalTypes,
  deleteGuiStatus,
  deleteScreen,

  // 묶음: tail-test — 꼬리 — 단위시험·CDS 단위시험·Update 계열 12종 (순서 29)

  // 묶음: tail-read — 꼬리 — 조회 계열 + CreatePackage 12종 (순서 29)
];
