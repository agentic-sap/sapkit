/**
 * UpdateClassMethod — 클래스 전체를 보내지 않고 **메서드 한 덩이만** 갈아 끼운다.
 *
 * 부르는 쪽은 `METHOD…ENDMETHOD` 블록 하나만 준다. 이 도구가 현재 소스를 읽어
 * 그 자리를 찾고, 새 블록을 끼운 **전체 클래스**를 만들어 `UpdateClass`에
 * 넘긴다. 그래서 SAP으로 나가는 것은 늘 완전한 클래스 소스다.
 *
 * ## 안전 바닥선 — 깨진 메서드는 착지하지 않는다
 *
 * 이어붙인 전체 클래스가 **쓰기 전에** 구문검사를 받는다(`UpdateClass`의
 * 사슬). 검사가 걸리면 PUT 자체가 나가지 않으므로, 조각만 검사해서는 잡을 수
 * 없는 "메서드 하나 때문에 클래스 전체가 깨지는" 경우도 막힌다.
 *
 * ## 와이어 근거
 *
 * 구 핸들러 `engine/src/handlers/class/high/handleUpdateClassMethod.ts:71-180`.
 * 현재 소스 읽기는 `AdtClass.read({className}, 'active')`이므로 경로가
 * **대문자**다(`…/dist/core/shared/AdtUtils.js:743-749` — `encodeSapObjectName`
 * 은 소문자로 바꾸지 않는다). 잠금·PUT은 소문자 URI를 쓰는데
 * (`…/dist/core/class/lock.js:18` · `update.js`), 그 갈림은 `UpdateClass`가
 * 이미 지고 있다. 읽기만 여기서 대문자로 낸다 — 합치면 슬래시가 든 이름에서
 * 보내는 주소가 달라진다.
 *
 * 쓰기 자체는 구와 같이 `handleUpdateClass`에 위임한다(`:123-128`). 그래서
 * 활성화 응답이 200에 오류를 실어 오는 갈래의 판정도 `UpdateClass` 쪽에 있다.
 *
 * 경계 탐지는 `../read/internal/abapMethods`다. 순수 텍스트 계산이라 접속을
 * 모르고, 읽기 짝인 `GetClassMethod`와 **같은 모듈을 쓴다** — 두 벌로 저작하면
 * 읽을 때와 쓸 때의 경계가 어긋난다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext, ToolResult } from '../../server/toolDefinition';
import { AdtError } from '../../adt';
import {
  findMethodBoundary,
  listMethodImplementations,
  spliceMethodSource,
  validateMethodBlock,
} from '../read/internal/abapMethods';
import { describeFailure, encodeObjectName, errorResult, getSource, okResult } from './shared';
import { updateClass } from './updateClass';

/** 읽기 경로는 대문자다 — 잠금·쓰기의 소문자 URI와 다르다(머리주석 참조). */
function classReadBase(className: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(className)}`;
}

function parsePayload(result: ToolResult): Record<string, unknown> {
  try {
    return JSON.parse(result.content.map((item) => item.text).join('')) as Record<string, unknown>;
  } catch {
    // 위임 결과가 JSON이 아니어도 치명적이지 않다 — 아래에서 요청값으로 메운다.
    return {};
  }
}

export const updateClassMethod = defineTool(
  {
    name: 'UpdateClassMethod',
    description:
      'Update a single method implementation (METHOD...ENDMETHOD block) of an existing ABAP class without sending the entire class source. Splices the replacement into the current class source, then locks, syntax-checks the full reconstructed class, updates, unlocks, and optionally activates — a broken method never lands.',
    inputSchema: {
      class_name: z.string().describe('Class name (e.g., ZCL_MY_CLASS).'),
      method_name: z
        .string()
        .describe(
          "Method name to replace (e.g. 'GET_DATA', or for interface method implementations 'ZIF_FOO~BAR').",
        ),
      source: z
        .string()
        .describe(
          'Full replacement method block. Must start with "METHOD <name>." and end with "ENDMETHOD." (leading/trailing blank lines tolerated); the name must match method_name.',
        ),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      activate: z.boolean().describe('Activate after update. Default: false.').optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['class_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.class_name || !args.method_name || !args.source) {
      return errorResult('class_name, method_name, and source are required');
    }

    const className = args.class_name.toUpperCase();
    logger.info(`Updating method ${args.method_name} of class ${className}`);

    try {
      const client = await context.getConnection();

      let currentSource: string;
      try {
        currentSource = await getSource(client, classReadBase(className), 'active');
      } catch (error) {
        // 구는 벤더 read()가 404를 undefined로 접은 뒤 이 문구를 냈다.
        if (error instanceof AdtError && error.status === 404) {
          return errorResult(`Class ${className} not found`);
        }
        throw error;
      }

      const boundary = findMethodBoundary(currentSource, args.method_name);
      if (!boundary) {
        const available = listMethodImplementations(currentSource).map((entry) => entry.name);
        return errorResult(
          `Method "${args.method_name}" not found in class ${className}. Available methods: ${
            available.length > 0 ? available.join(', ') : '(none found)'
          }`,
        );
      }

      // 이름이 어긋난 블록을 그대로 끼우면 **엉뚱한 메서드의 몸통이 통째로**
      // 바뀐다. 쓰기 전에 여기서 막는다.
      const validation = validateMethodBlock(args.source, args.method_name);
      if (!validation.valid) {
        return errorResult(`Invalid replacement source: ${validation.error}`);
      }

      const newFullSource = spliceMethodSource(currentSource, boundary, args.source);
      const newClassLineCount = newFullSource.split(/\r\n|\r|\n/).length;

      const delegated = await Promise.resolve(
        updateClass.handler(context, {
          class_name: className,
          source_code: newFullSource,
          transport_request: args.transport_request,
          activate: args.activate,
        }),
      );

      // 위임 실패는 **그대로 올린다** — 사전 검사의 줄번호 진단이 여기서 잘리면
      // 부르는 쪽은 어디를 고칠지 모른다.
      if (delegated.isError) return delegated;

      const info = parsePayload(delegated);
      const activated = (info['activated'] as boolean | undefined) ?? args.activate === true;

      logger.info(
        `UpdateClassMethod completed: ${className}.${boundary.name} (lines ${boundary.startLine}-${boundary.endLine})`,
      );

      return okResult({
        success: true,
        class_name: className,
        method_name: boundary.name,
        replaced_start_line: boundary.startLine,
        replaced_end_line: boundary.endLine,
        new_class_line_count: newClassLineCount,
        activated,
        check_warnings: info['check_warnings'],
        message: `Method ${boundary.name} of class ${className} updated${
          activated ? ' and activated' : ''
        } successfully`,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`Error updating method ${args.method_name} of ${className}: ${message}`);
      return errorResult(message);
    }
  },
);
