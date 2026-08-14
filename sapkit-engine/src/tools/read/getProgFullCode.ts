/**
 * GetProgFullCode — 프로그램(또는 함수그룹) 한 벌 + 딸린 인클루드 전량.
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/program/readonly/handleGetProgFullCode.ts:67-330`
 *    (인클루드 한 벌은 `engine/src/handlers/include/readonly/handleGetInclude.ts:32-39`)
 *  - 한 다리: `@babamba2/mcp-abap-adt-clients/dist/core/program/AdtProgram.js:137-155`
 *    (`read`) · `dist/core/functionGroup/AdtFunctionGroup.js:214-232` (`read`)
 *  - 와이어 정본: 같은 패키지 `dist/core/program/read.js:27-29` →
 *    `dist/core/shared/AdtUtils.js:306-326` · 경로 조립 `:743-779` /
 *    함수그룹은 `dist/core/functionGroup/read.js:14-24`
 *
 * 거기서 확인한 것 넷:
 *  1. **본체 소스에는 질의 인자가 붙지 않는다.** 겉 핸들러가 `read({programName})`
 *     를 version 없이 부르므로 `getObjectSourceUri`의 `versionParam`이 빈
 *     문자열이다(`AdtUtils.js:745`). `GetProgram`이 언제나 `?version=active`를
 *     붙이는 것과 여기서 갈린다.
 *  2. **이름을 대문자로 올리지 않는다.** 겉 핸들러가 `name`을 그대로 넘긴다
 *     (`:121-123`). 이것도 `GetProgram`(`:43`에서 `toUpperCase`)과 갈리는 자리다.
 *  3. 함수그룹은 소스 경로가 아니라 **오브젝트 경로**(`/functions/groups/<NAME>`)를
 *     묻고, Accept로 벤더 기본값인 모든 형식(별표 슬래시 별표)을 싣는다
 *     (`functionGroup/read.js:22`). 그래서 이 갈래의 `code`에는 소스가 아니라
 *     오브젝트 XML이 담긴다 — 구가 그렇게 지었고, 이름과 응답 형태를 바꾸지
 *     않는다는 규약에 따라 그대로 둔다.
 *  4. 같은 인클루드를 **두 번 읽는다** — 한 번은 중첩 탐색(`collectIncludes`),
 *     한 번은 코드 수집. 구의 왕복 수를 줄이지 않는다.
 *
 * ## 구와 다른 것 — 장부 D46 (`harness/DIVERGENCES.md`)
 * 구는 인클루드 응답에서 **`data` 키**를 읽는다(`:93`·`:272`). 그런데
 * `handleGetInclude`가 싣는 키는 `text`다(`handleGetInclude.ts:45-53`). 같은
 * 파일 안에서 PROG/P 갈래만 `'text' in c`로 옳게 읽고(`:196`) 나머지 두 자리는
 * `'data' in c`로 읽는 오타이며, 그 결과가 둘이다:
 *  - **중첩 인클루드 재귀가 죽어 있다** — `collectIncludes`가 코드를 못 읽으니
 *    안쪽 `INCLUDE`를 한 번도 찾지 못한다.
 *  - **FUGR 갈래의 인클루드 `code`가 언제나 `null`이다** — 읽기는 성공했는데
 *    본문을 못 꺼낸다.
 * 여기서는 두 자리 모두 `text`를 읽는다. 「전량 코드 내보내기」라는 이 도구의
 * 목적이 그 오타 하나로 무효가 되기 때문이다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *  - 구는 인클루드 읽기 실패를 `handleGetInclude`가 오류 응답으로 접고, 부르는
 *    쪽이 그 응답의 `text`(=오류 문구)를 그대로 `code` 자리에 실었다. 그 자리를
 *    그대로 둔다 — 실패를 조용히 `null`로 바꾸면 무엇이 없었는지 사라진다.
 */

import * as z from 'zod';

import type { AdtClient, AdtResponse } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import {
  adtStatusOf,
  functionGroupPath,
  includeSourcePath,
  objectSourcePath,
  readSourceText,
} from './internal/adt';
import { failure, messageOf, ok } from './internal/results';

/** 벤더가 함수그룹 조회에 싣던 Accept(`functionGroup/read.js:22`의 기본값). */
const FUNCTION_GROUP_ACCEPT = '*/*';

interface CodeObject {
  OBJECT_TYPE: string;
  OBJECT_NAME: string;
  code: string | null;
}

/** `INCLUDE ZX.` 한 줄. 정규식은 부를 때마다 새로 만든다(`lastIndex` 공유 금지). */
function includeNamesIn(code: string): string[] {
  return [...code.matchAll(/^\s*INCLUDE\s+([A-Z0-9_/]+)\s*\.\s*$/gim)].map((match) => match[1] as string);
}

/** `INCLUDE: ZA, ZB.` 한 줄. 쉼표로 갈라 빈 조각을 버린다. */
function includeListNamesIn(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(/^\s*INCLUDE:\s*([A-Z0-9_/,\s]+)\./gim)) {
    out.push(
      ...(match[1] as string)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    );
  }
  return out;
}

/**
 * 인클루드 한 벌. 실패하면 그 문구가 코드 자리에 실린다 — 구와 같다.
 *
 * 구는 `handleGetInclude`를 그대로 불렀고 그 핸들러는 오류를 `isError:true` +
 * `text: <문구>`로 접었다. 부르는 쪽은 `isError`를 보지 않고 `text`만 꺼냈다.
 */
async function readIncludeCode(client: AdtClient, name: string): Promise<string> {
  try {
    const response = await client.request({
      method: 'GET',
      path: includeSourcePath(name),
      timeout: 'default',
    });
    return response.body;
  } catch (error) {
    return messageOf(error);
  }
}

/**
 * 인클루드 하나와 그 아래를 트리 순회 순서로 늘어놓는다.
 *
 * `collected`가 순환을 끊는다 — 서로를 부르는 인클루드에서도 멈춘다.
 */
async function collectIncludes(
  client: AdtClient,
  objectName: string,
  collected: Set<string>,
): Promise<string[]> {
  if (collected.has(objectName)) return [];
  collected.add(objectName);

  // 장부 D46 — 구는 여기서 `data`를 읽어 언제나 빈손이었다.
  const code = await readIncludeCode(client, objectName);

  const out: string[] = [objectName];
  for (const nested of includeNamesIn(code)) {
    out.push(...(await collectIncludes(client, nested, collected)));
  }
  return out;
}

/** 본체 소스를 읽는다. 404는 벤더가 `undefined`로 접던 자리다. */
async function readMainObject(request: () => Promise<AdtResponse>): Promise<AdtResponse | undefined> {
  try {
    return await request();
  } catch (error) {
    if (adtStatusOf(error) === 404) return undefined;
    throw error;
  }
}

/** 본체 뒤에 인클루드들을 붙인다. 이미 실린 이름은 건너뛴다. */
async function appendIncludes(
  client: AdtClient,
  codeObjects: CodeObject[],
  includes: readonly string[],
): Promise<void> {
  const collected = new Set<string>();
  for (const include of includes) {
    for (const name of await collectIncludes(client, include, collected)) {
      if (codeObjects.some((object) => object.OBJECT_TYPE === 'PROG/I' && object.OBJECT_NAME === name)) {
        continue;
      }
      codeObjects.push({ OBJECT_TYPE: 'PROG/I', OBJECT_NAME: name, code: await readIncludeCode(client, name) });
    }
  }
}

export const getProgFullCode = defineTool(
  {
    name: 'GetProgFullCode',
    description:
      '[read-only] Returns the full code for a program or function group, including all includes, in tree traversal order.',
    inputSchema: {
      name: z
        .string()
        .describe("[read-only] Technical name of the program or function group (e.g., '/CBY/MM_INVENTORY')"),
      type: z
        .enum(['PROG/P', 'FUGR'])
        .describe("[read-only] 'PROG/P' for program or 'FUGR' for function group"),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['name'],
  },
  async (context, args) => {
    const { name, type } = args;
    const typeUpper = type.toUpperCase();

    try {
      const client = await context.getConnection();
      let codeObjects: CodeObject[] = [];

      if (typeUpper === 'PROG/P') {
        // version 인자를 주지 않는다 — 구가 그렇게 부른다.
        const state = await readMainObject(() =>
          readSourceText(client, objectSourcePath('program', name)),
        );
        const progCode = state && state.body ? state.body : null;
        if (typeof progCode !== 'string' || progCode === '') {
          return failure(
            `No program code found for ${name}. Result: ${state ? 'exists but no sourceCode' : 'undefined'}`,
          );
        }

        codeObjects.push({ OBJECT_TYPE: 'PROG/P', OBJECT_NAME: name, code: progCode });
        await appendIncludes(client, codeObjects, [
          ...includeNamesIn(progCode),
          ...includeListNamesIn(progCode),
        ]);
      } else if (typeUpper === 'FUGR') {
        const state = await readMainObject(() =>
          client.request({
            method: 'GET',
            path: functionGroupPath(name),
            accept: FUNCTION_GROUP_ACCEPT,
            timeout: 'default',
          }),
        );
        const fgCode = state && state.body ? state.body : null;
        if (typeof fgCode !== 'string') {
          return failure(
            `No function group code found for ${name}. Result: ${state ? 'exists but no data' : 'undefined'}`,
          );
        }

        codeObjects.push({ OBJECT_TYPE: 'FUGR', OBJECT_NAME: name, code: fgCode });
        // 구는 이 갈래에서 `INCLUDE: …` 어법을 걷지 않는다.
        await appendIncludes(client, codeObjects, includeNamesIn(fgCode));
      } else {
        // 발행 스키마가 enum이라 여기까지 오지 않는다. 구의 갈래를 그대로 둔다.
        return failure('Unsupported type');
      }

      // 구가 일부러 하던 정규화 — 두 칸 이상 이어진 공백을 한 칸으로 접는다.
      codeObjects = codeObjects.map((object) => ({
        ...object,
        code: typeof object.code === 'string' ? object.code.replace(/ {2,}/g, ' ') : object.code,
      }));

      return ok(
        JSON.stringify(
          {
            name,
            type,
            total_code_objects: codeObjects.length,
            code_objects: codeObjects,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return failure(messageOf(error));
    }
  },
);
