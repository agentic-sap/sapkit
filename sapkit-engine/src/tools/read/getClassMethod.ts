/**
 * GetClassMethod — 클래스 전체를 받지 않고 **메서드 한 덩이만** 읽는다.
 *
 * 클래스 소스는 한 벌이 수천 줄이 되기도 한다. 한 메서드만 보려고 그 전부를
 * 세션에 실어 나르지 않으려는 것이 이 도구의 존재 이유다 — 읽는 왕복은
 * 그대로 한 번이고, **잘라 내는 일은 여기서 한다.**
 *
 * ## 와이어 근거 (겉 핸들러 → 안쪽 패키지)
 *
 * 구 핸들러 `engine/src/handlers/class/readonly/handleGetClassMethod.ts:41-106`.
 * 소스 읽기는 `AdtClass.read({className}, 'active')`
 * (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtClass.js:176-213`)
 * → `dist/core/class/read.js:37-39` `getClassSource` →
 * `dist/core/shared/AdtUtils.js:306-326` `readObjectSource` → 같은 파일
 * `:743-749` `getObjectSourceUri` =
 * `/sap/bc/adt/oo/classes/{encodeURIComponent(NAME)}/source/main?version=active`,
 * Accept는 `AdtUtils.js:315`의 기본값 `'text/plain'`.
 *
 * **버전 인자가 없는 것은 실수가 아니다.** 구 핸들러가 `'active'`를 못 박아
 * 부르므로 발행 스키마에도 `version`이 없다. 인자에 없는 값을 여기서 지어
 * 내면 표면이 갈라진다.
 *
 * ## 경계 탐지
 *
 * `internal/abapMethods.ts` — 구 엔진이 스스로 저작한
 * `engine/src/lib/abapMethodBoundaries.ts`를 다시 저작한 것이고, 기대값의
 * 정본은 구 엔진의 단위 시험이다(그 모듈 머리주석 참조).
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { adtStatusOf, objectSourcePath, readSourceText } from './internal/adt';
import {
  extractMethodSource,
  findMethodBoundary,
  listMethodImplementations,
} from './internal/abapMethods';
import { ok, returnError } from './internal/results';

export const getClassMethod = defineTool(
  {
    name: 'GetClassMethod',
    description:
      '[read-only] Read the source of a single method implementation (the METHOD...ENDMETHOD block) from an ABAP class, without fetching the entire class source. Use this instead of GetClass/ReadClass when only one method needs inspecting — dramatically smaller than reading the whole class.',
    inputSchema: {
      class_name: z.string().describe('Class name (e.g., ZCL_MY_CLASS).'),
      method_name: z
        .string()
        .describe(
          "Method name to extract (e.g. 'GET_DATA', or for interface method implementations 'ZIF_FOO~BAR').",
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['class_name'],
  },
  async (context, args) => {
    try {
      const { class_name, method_name } = args;
      if (!class_name || !method_name) {
        return returnError(new Error('class_name and method_name are required'));
      }

      const client = await context.getConnection();
      const className = class_name.toUpperCase();

      context.logger.info(`Reading method ${method_name} of class ${className}`);

      let sourceCode: string;
      try {
        const response = await readSourceText(
          client,
          objectSourcePath('class', className),
          'active',
        );
        sourceCode = response.body;
      } catch (error) {
        // 구는 벤더 `read()`가 404를 `undefined`로 접은 뒤 이 문구를 냈다
        // (`AdtClass.js:199-201` → `handleGetClassMethod.ts:58-60`).
        if (adtStatusOf(error) === 404) {
          return returnError(new Error(`Class ${className} not found`));
        }
        throw error;
      }

      const totalClassLines = sourceCode.split(/\r\n|\r|\n/).length;
      const boundary = findMethodBoundary(sourceCode, method_name);

      if (!boundary) {
        // 못 찾았다는 말만으로는 손쓸 곳이 없다 — 있는 이름을 함께 준다.
        const available = listMethodImplementations(sourceCode).map((entry) => entry.name);
        return returnError(
          new Error(
            `Method "${method_name}" not found in class ${className}. Available methods: ${
              available.length > 0 ? available.join(', ') : '(none found)'
            }`,
          ),
        );
      }

      context.logger.info(
        `GetClassMethod completed: ${className}.${boundary.name} (lines ${boundary.startLine}-${boundary.endLine})`,
      );

      return ok(
        JSON.stringify(
          {
            class_name: className,
            // 인자의 대문자가 아니라 **소스에 선언된 대로**의 이름이다.
            method_name: boundary.name,
            start_line: boundary.startLine,
            end_line: boundary.endLine,
            total_class_lines: totalClassLines,
            source: extractMethodSource(sourceCode, boundary),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return returnError(error);
    }
  },
);
