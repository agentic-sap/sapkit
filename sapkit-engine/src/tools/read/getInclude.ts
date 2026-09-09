/**
 * GetInclude — 독립 인클루드 한 벌의 소스.
 *
 * 응답은 소스 텍스트 **그대로**다(JSON으로 싸지 않는다 — 구와 같다). 이름을
 * 대문자로 올리지도 않는다: 구가 받은 문자열을 그대로 인코딩해 보냈고, ADT
 * 경로는 대소문자를 가리지 않는다.
 *
 * ## 클래스 인클루드는 이 경로가 아니다 (차이 — `harness/DIVERGENCES.md` D148 · 백로그 13-8 ⓑ)
 *
 * `ZCL_X=====…=CCIMP`처럼 `=`로 채운 클래스 인클루드 이름을 주면 독립 인클루드
 * 경로(`/sap/bc/adt/programs/includes/`)가 **HTTP 500**을 낸다(ZUNIVAT_RAP 실측). 구는
 * 그 500을 그대로 올려 제보자가 「접근 경로 0」으로 결론내고 BIL을 손으로 재구성했다.
 * 지금은 요청을 보내기 **전에** 그 이름을 알아보고, 어느 도구가 그 인클루드를 읽는지
 * 이름으로 말하는 오류를 낸다(CCIMP → `GetLocalTypes` · CCDEF → `GetLocalDefinitions` ·
 * CCMAC → `GetLocalMacros` · CCAU → `GetLocalTestClass`). 실기 미검증 — 500이 나는 정확한
 * 응답 본문은 채록되지 않았다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { includeSourcePath } from './internal/adt';
import { failure, messageOf, ok } from './internal/results';

/** 클래스 인클루드 이름 — `<클래스>` + `=` 채움 + 접미사. 접미사 → 읽는 도구. */
const CLASS_INCLUDE_NAME = /^([A-Z0-9_/]+?)=+(CCIMP|CCDEF|CCMAC|CCAU|CU|CO|CI|CP|CT|CM\d{3}|CL)$/i;

const CLASS_INCLUDE_READERS: Readonly<Record<string, string>> = {
  CCIMP: 'GetLocalTypes (local types and the implementations include — where behavior-pool handler classes live)',
  CCDEF: 'GetLocalDefinitions (local class definitions include)',
  CCMAC: 'GetLocalMacros (local macros include)',
  CCAU: 'GetLocalTestClass (local test classes include)',
};

/** D148 — 클래스 인클루드면 요청을 보내기 전에 낼 오류 문구, 아니면 null. */
export function classIncludeRefusal(includeName: string): string | null {
  const match = CLASS_INCLUDE_NAME.exec(includeName.trim());
  if (!match) return null;
  const className = (match[1] as string).toUpperCase();
  const suffix = (match[2] as string).toUpperCase();
  const reader =
    CLASS_INCLUDE_READERS[suffix] ??
    'ReadClass or GetClass (the class main source — sections and methods are not separate includes here)';
  return (
    `Include "${includeName}" is a class include of ${className} (${suffix}), not a standalone include — ` +
    'the standalone-include path (/sap/bc/adt/programs/includes/) answers HTTP 500 for it. ' +
    `Read it with ${reader}.`
  );
}

export const getInclude = defineTool(
  {
    name: 'GetInclude',
    // 원문(채록본) + 덧말(`harness/old-surface/amendments.json`) — D148.
    description:
      '[read-only] Retrieve source code of a specific ABAP include file.' +
      " Class includes — names padded with '=' and ending in CCIMP, CCDEF, CCMAC or CCAU — are not standalone includes; this path answers HTTP 500 for them and the tool now refuses them up front. Read local types and the implementations include with GetLocalTypes, local definitions with GetLocalDefinitions, macros with GetLocalMacros, the test include with GetLocalTestClass.",
    inputSchema: {
      include_name: z.string().describe('Name of the ABAP Include'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['include_name'],
  },
  async (context, args) => {
    try {
      if (!args.include_name) {
        throw new Error('Include name is required');
      }
      // D148 — 클래스 인클루드는 접속을 얻기 전에 거절한다(500이 나는 요청을 보내지 않는다).
      const refusal = classIncludeRefusal(args.include_name);
      if (refusal !== null) throw new Error(refusal);

      const client = await context.getConnection();
      context.logger.info(`Fetching include: ${args.include_name}`);

      const response = await client.request({
        method: 'GET',
        path: includeSourcePath(args.include_name),
        timeout: 'default',
      });

      context.logger.info(`GetInclude completed: ${args.include_name}`);
      return ok(response.body);
    } catch (error) {
      context.logger.error(
        `Error getting include ${args.include_name ?? ''}: ${messageOf(error)}`,
      );
      return failure(messageOf(error));
    }
  },
);
