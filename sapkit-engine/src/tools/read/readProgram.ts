/**
 * ReadProgram — 프로그램 소스 **와 메타데이터**를 한 번에.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/program/readonly/handleReadProgram.ts:32-91`
 *  - 한 다리: `@babamba2/mcp-abap-adt-clients/dist/core/program/AdtProgram.js:137-186`
 *    (`read` · `readMetadata`) → 같은 패키지 `dist/core/program/read.js:21-29`
 *  - 와이어 정본: 같은 패키지 `dist/core/shared/AdtUtils.js:269-326`
 *    (`readObjectMetadata` · `readObjectSource`) → 경로 조립은 `:652-698`
 *    (`getObjectMetadataUri`) · `:743-779` (`getObjectSourceUri`) ·
 *    Accept 표는 `:700-742` (`getMetadataAcceptHeader`)
 *  - Accept 상수: 같은 패키지 `dist/constants/contentTypes.js:69` (`ACCEPT_PROGRAM`)
 *
 * 거기서 확인한 것 넷:
 *  1. **요청이 둘이다.** 소스 `GET /sap/bc/adt/programs/programs/<NAME>/source/main`
 *     과 메타데이터 `GET /sap/bc/adt/programs/programs/<NAME>` — 겉 핸들러만
 *     읽으면 `obj.read` · `obj.readMetadata` 두 줄로만 보인다.
 *  2. **`version`은 소스에만 붙는다.** 겉 핸들러가 `readMetadata`에 options를
 *     주지 않으므로 메타데이터 URI에는 질의 인자가 하나도 붙지 않는다
 *     (`AdtUtils.js:271-280`은 options가 있을 때만 인자를 만든다).
 *  3. 소스의 Accept는 `text/plain`(`AdtUtils.js:315`), 메타데이터의 Accept는
 *     `ACCEPT_PROGRAM` 두 판을 쉼표로 이은 한 줄이다.
 *  4. **읽기 실패가 오류가 아니다.** 404는 벤더가 `undefined`로 접고
 *     (`AdtProgram.js:150-152`), 나머지 실패는 겉 핸들러가 `logger.warn`으로
 *     삼킨다(`handleReadProgram.ts:58-60`·`:71-73`). 그래서 이 도구는 언제나
 *     `success: true`로 답하고, 못 읽은 자리만 `null`이다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *  - 구는 axios가 파싱해 둔 `data`가 문자열이 아닐 수 있어 `safeStringify`로
 *    접었다. 신 접속 계층의 `body`는 언제나 문자열이라 그 갈래가 사라진다 —
 *    파싱 진입점이 다를 뿐 결과가 같다.
 *  - 빈 본문의 취급은 구 그대로다: `if (data)`가 빈 문자열을 거짓으로 보므로
 *    `''`는 `null`이 된다.
 *
 * ## `GetProgram`과 헷갈리지 말 것
 * 같은 소스를 읽지만 **다른 도구다.** `GetProgram`은 요청이 하나이고
 * `program_data`·`status`·`status_text`를 싣고 404를 오류로 올린다. 이쪽은
 * 요청이 둘이고 `source_code`·`metadata`를 싣고 404를 성공으로 접는다. 그 차이는
 * `__tests__/readProgram.test.ts`의 마지막 절이 못박는다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { encodeObjectName, objectSourcePath, readSourceText } from './internal/adt';
import { messageOf, ok, returnError } from './internal/results';

/** 벤더 `ACCEPT_PROGRAM` — 두 판을 쉼표로 이은 한 줄 그대로다. */
const PROGRAM_METADATA_ACCEPT =
  'application/vnd.sap.adt.programs.programs.v2+xml, application/vnd.sap.adt.programs.programs.v1+xml';

/** 메타데이터 URI — 소스 경로에서 `/source/main`을 뗀 자리다. */
function programMetadataPath(name: string): string {
  return `/sap/bc/adt/programs/programs/${encodeObjectName(name)}`;
}

export const readProgram = defineTool(
  {
    name: 'ReadProgram',
    description:
      '[read-only] Read ABAP program source code and metadata (package, responsible, description, etc.).',
    inputSchema: {
      program_name: z.string().describe('Program name (e.g., Z_MY_PROGRAM).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['program_name'],
  },
  async (context, args) => {
    try {
      const { program_name, version = 'active' } = args;
      if (!program_name) return returnError(new Error('program_name is required'));

      const client = await context.getConnection();
      const programName = program_name.toUpperCase();

      let source_code: string | null = null;
      try {
        const response = await readSourceText(
          client,
          objectSourcePath('program', programName),
          version,
        );
        if (response.body) source_code = response.body;
      } catch (error) {
        context.logger.warn(`Could not read source for ${programName}: ${messageOf(error)}`);
      }

      let metadata: string | null = null;
      try {
        const response = await client.request({
          method: 'GET',
          path: programMetadataPath(programName),
          accept: PROGRAM_METADATA_ACCEPT,
          timeout: 'default',
        });
        if (response.body) metadata = response.body;
      } catch (error) {
        context.logger.warn(`Could not read metadata for ${programName}: ${messageOf(error)}`);
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            program_name: programName,
            version,
            source_code,
            metadata,
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
