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
 * 여기에 **세 필드가 추가**된다 — 구 엔진이 디렉터리 위치와 별도 가드 테이블로
 * 흩어 두었던 것을 선언으로 끌어올린 것이다:
 *
 *  - `sets` — 이 도구를 켜는 핸들러 집합(`--exposition`의 원소). 구 엔진은
 *    `handlers/<group>/readonly|...` 경로로 이것을 암시했다.
 *  - `kind` — 정책 분류. 안전 게이트가 이 축으로 판단한다. 구 엔진은
 *    `readonlyGuard`의 이름 목록으로 판단했고, 그것이 통과시킨 오분류가
 *    GAP-1 계열 사고의 토양이었다.
 *  - `targetNames` — 이 도구가 겨누는 대상 객체의 이름이 **어느 인자에 있는가**.
 *    녹화 사전 검사가 이 선언을 읽는다. 예전에는 그 지식이 녹화 스크립트 안의
 *    하드코딩 목록에 있었고, 목록 밖 도구는 SAP 호출이 나간 뒤에야 걸렸다.
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

/**
 * **대상-이름 인자** 하나를 가리키는 선언.
 *
 * 문자열이면 그 이름의 인자를 그대로 읽고, 객체면 배열 인자(`arg`)의 각
 * 원소에서 `element` 키를 읽는다(원소가 문자열이면 원소 자체). 인자 하나로
 * 끝나지 않는 도구가 있어서 두 모양이 필요하다 — 이름 인자가 둘인 것도
 * (`GetSourceDiff`), 배열을 받는 것도 있고, **배열 원소의 키가 도구마다 다르다**
 * (`GrepObjects.objects[].object_name` vs `ActivateObjects.objects[].name`).
 *
 * 키는 `inputSchema`의 키로 좁혀져 있다 — 인자 이름 오타는 컴파일에서 걸린다.
 */
export type ToolTargetName<Shape extends ToolInputShape = ToolInputShape> =
  | Extract<keyof Shape, string>
  | {
      /** 배열을 받는 인자 이름. */
      readonly arg: Extract<keyof Shape, string>;
      /** 배열 원소에서 이름을 담는 키. */
      readonly element: string;
    };

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
  /**
   * 이 도구가 겨누는 **대상 객체의 이름을 담는 인자들**.
   *
   * 녹화 사전 검사(`harness/targetGuard.ts`)가 이것을 읽어, 대상이 고객
   * 객체(Z·Y)가 아니면 **SAP 호출이 나가기 전에** 막는다. 예전에는 그 목록이
   * 녹화 스크립트 안의 하드코딩 15종이었고, 목록 밖 도구는 호출이 나간 **뒤에야**
   * 사후 백스톱에 걸렸다 — 도구를 지을 때 여기에 한 줄 적으면 사전 검사가
   * 자동으로 따라온다.
   *
   * **`kind`가 SAP을 바꾸는 갈래(`mutation`·`execution`)면 선언이 필수다** —
   * {@link missingTargetNameDeclarations}가 누락을 거부한다. 대상 이름을 아예
   * 받지 않는 도구(예: 이송번호만 받는 것)는 **빈 배열을 명시**한다. 빈 배열은
   * "고객 네임스페이스 대상 인자가 없다"는 선언이지 귀찮음의 도피처가 아니다.
   *
   * 발행 표면에는 실리지 않는다 — 서버는 `description`·`inputSchema`만
   * `registerTool`에 넘긴다.
   */
  readonly targetNames?: readonly ToolTargetName<Shape>[];
}

/**
 * 대상-이름 선언이 **필수인** 정책 분류. SAP 상태를 바꾸거나 실행하는 갈래이며,
 * `AGENTS.md`의 P3(write/execute)와 같은 경계다.
 */
export const TARGET_NAME_REQUIRED_KINDS: readonly ToolPolicyKind[] = ['mutation', 'execution'];

/**
 * 대상-이름 선언이 빠진 도구들의 이름. 비어 있지 않으면 게이트 실패다.
 *
 * 빈 배열(`targetNames: []`)은 명시 선언이므로 통과하고, **없는 것**(undefined)만
 * 걸린다. 강제는 `src/tools/__tests__/targetNames.test.ts`가 한다.
 */
export function missingTargetNameDeclarations(tools: readonly SapTool[]): string[] {
  return tools
    .filter((tool) => TARGET_NAME_REQUIRED_KINDS.includes(tool.definition.kind))
    .filter((tool) => tool.definition.targetNames === undefined)
    .map((tool) => tool.definition.name);
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
