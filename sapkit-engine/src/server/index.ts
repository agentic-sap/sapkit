/**
 * 서버 코어의 공개 표면.
 *
 * 도구 모듈과 배선 단계는 여기서만 가져다 쓴다. 내부 모듈 경로를 직접
 * 참조하지 않는다. `./entry`는 여기서 내보내지 않는다 — 그 모듈은 import 자체가
 * 서버를 띄우는 부작용이기 때문이다.
 */

export { SERVER_NAME, createServerCore } from './core';
export type { ServerCore, ServerCoreOptions } from './core';

export { ROW_DATA_ARGS, evaluateToolCall } from './gates';
export type { GateContext, GateDecision, GateDenyCode, GatedTool } from './gates';

export { resolveStartup } from './startup';
export type { Startup, StartupInput } from './startup';

export { startFromProcess } from './bootstrap';
export type { BootstrapOptions, StartedServer } from './bootstrap';

export {
  NOOP_LOGGER,
  TARGET_NAME_REQUIRED_KINDS,
  defineTool,
  missingTargetNameDeclarations,
  toExposableTool,
} from './toolDefinition';
export type {
  SapTool,
  SapToolDefinition,
  ToolArgs,
  ToolContext,
  ToolHandler,
  ToolInputShape,
  ToolLogger,
  ToolResult,
  ToolTargetName,
  ToolTextContent,
} from './toolDefinition';
