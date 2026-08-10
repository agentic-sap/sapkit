/**
 * 도구 정의 계약 — 도구 하나가 무엇을 선언하고 무엇을 받는가.
 *
 * 물결 2의 도구 묶음들이 전부 이 모양을 따른다. 필드 넷(`name` ·
 * `available_in` · `description` · `inputSchema`)은 **구 엔진의 실측 선언 그대로**다
 * (`engine/src/handlers/include/readonly/handleGetInclude.ts:16-24`):
 *
 * ```ts
 * export const TOOL_DEFINITION = {
 *   name: 'GetInclude',
 *   available_in: ['onprem', 'cloud', 'legacy'] as const,
 *   description: '[read-only] Retrieve source code of a specific ABAP include file.',
 *   inputSchema: { include_name: z.string().describe('Name of the ABAP Include') },
 * } as const;
 * ```
 *
 * 여기에 **두 필드가 추가**된다 — 구 엔진이 디렉터리 위치와 별도 가드 테이블로
 * 흩어 두었던 것을 선언으로 끌어올린 것이다:
 *
 *  - `sets` — 이 도구를 켜는 핸들러 집합(`--exposition`의 원소). 구 엔진은
 *    `handlers/<group>/readonly|...` 경로로 이것을 암시했다.
 *  - `kind` — 정책 분류. 안전 게이트가 이 축으로 판단한다. 구 엔진은
 *    `readonlyGuard`의 이름 목록으로 판단했고, 그것이 통과시킨 오분류가
 *    GAP-1 계열 사고의 토양이었다.
 *
 * `inputSchema`는 **zod raw shape**(zod 검증자들의 평범한 객체)다. SDK가 이것을
 * JSON Schema로 변환해 `tools/list`에 싣기 때문에, 같은 SDK + 같은 shape이면
 * 발행되는 스키마가 자동으로 같아진다. 구 핸들러 일부는 `inputSchema` 자리에
 * JSON Schema 객체를 직접 넣었는데(예: `handleGetSqlQuery.ts:19-39`), 그쪽은
 * 구 서버가 `jsonSchemaToZod`로 되돌려 등록했다. 신 엔진은 통로를 하나로 좁혀
 * **zod shape만** 받는다 — 도구 저자가 같은 스키마를 zod로 표현한다.
 *
 * **이름·인자 이름·응답 형태를 바꾸지 않는다.** 개명도 "개선"도 금지다.
 */

import type * as z from 'zod';

import type { AdtClient } from '../adt';
import type {
  DeploymentType,
  HandlerSet,
  ResolvedProfile,
  ToolPolicyKind,
} from '../contracts';
import type { ExposableTool } from '../safety';

/** zod 검증자들의 평범한 객체. SDK가 그대로 JSON Schema로 바꾼다. */
export type ToolInputShape = Record<string, z.ZodType>;

/** shape 하나가 만들어 내는 인자 객체 타입. */
export type ToolArgs<Shape extends ToolInputShape> = {
  [K in keyof Shape]: z.infer<Shape[K]>;
};

export interface ToolTextContent {
  readonly type: 'text';
  readonly text: string;
}

/**
 * 핸들러 반환 형태 — 구 엔진과 같다.
 * `isError: true`면 서버가 이것을 프로토콜 오류로 올린다(구 `BaseMcpServer`
 * :428-444와 같은 처리).
 */
export interface ToolResult {
  readonly isError: boolean;
  readonly content: readonly ToolTextContent[];
}

export interface ToolLogger {
  info(message: string): void;
  debug(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * 기본 로거는 아무 일도 하지 않는다 — 구 번들도 로거 패키지 없이 실려 나가며
 * noop으로 떨어진다(`BaseMcpServer.ts:516-531`). stdio에서 stdout은 프로토콜
 * 채널이므로, 말을 하려면 서버가 소유한 stderr 통로로 해야 한다.
 */
export const NOOP_LOGGER: ToolLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * 핸들러가 받는 컨텍스트.
 *
 * `getConnection()`이 **함수**인 것이 요점이다. 접속은 이것을 부를 때 비로소
 * 만들어지므로, 게이트에 막힌 호출은 핸들러에 닿지 않고 따라서 접속도 얻지
 * 않는다 — 구 엔진 GAP-1("게이트가 배선되지 않아 QA·PRD에서도 SAP까지
 * 도달했다")의 재발 방지가 이 한 줄에 걸려 있다.
 *
 * 무프로파일 기동에서는 이 호출이 `ERR_NO_CONNECTION`으로 **던진다**. 조용히
 * 성공하거나 모의 접속을 돌려주지 않는다.
 */
export interface ToolContext {
  getConnection(): Promise<AdtClient>;
  readonly profile: ResolvedProfile;
  readonly logger: ToolLogger;
  /** 프로파일 값이 얹힌 환경. 도구가 자기 노브를 읽어야 할 때 쓴다. */
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface SapToolDefinition<Shape extends ToolInputShape = ToolInputShape> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Shape;
  /** 이 도구가 존재하는 배포 축. 구 엔진의 `available_in`과 같은 값. */
  readonly available_in: readonly DeploymentType[];
  /** 이 도구를 켜는 핸들러 집합. 하나라도 활성이면 목록에 오른다. */
  readonly sets: readonly HandlerSet[];
  /** 정책 분류. 안전 게이트가 이 축으로 판단한다. */
  readonly kind: ToolPolicyKind;
}

export type ToolHandler<Shape extends ToolInputShape> = (
  context: ToolContext,
  args: ToolArgs<Shape>,
) => ToolResult | Promise<ToolResult>;

/**
 * 레지스트리에 담기는 형태 — shape 제네릭이 지워진 도구 하나.
 *
 * 서로 다른 shape을 가진 도구들을 한 배열에 담기 위한 소거이며, 정의 자리의
 * 타입 안전은 {@link defineTool}이 지킨다.
 */
export interface SapTool {
  readonly definition: SapToolDefinition;
  readonly handler: (
    context: ToolContext,
    args: Record<string, unknown>,
  ) => ToolResult | Promise<ToolResult>;
}

/**
 * 도구 하나를 만든다. 도구 모듈은 이 함수의 결과를 export 하고, 등록은 물결
 * 말미의 배선 단계가 `src/tools/registry.ts`에서 일괄로 한다.
 */
export function defineTool<Shape extends ToolInputShape>(
  definition: SapToolDefinition<Shape>,
  handler: ToolHandler<Shape>,
): SapTool {
  return {
    definition: definition as unknown as SapToolDefinition,
    handler: handler as unknown as SapTool['handler'],
  };
}

/** 노출 판정기가 읽는 최소 형태로 접는다. */
export function toExposableTool(definition: SapToolDefinition): ExposableTool {
  return {
    name: definition.name,
    kind: definition.kind,
    exposure: { sets: definition.sets, availableIn: definition.available_in },
  };
}
