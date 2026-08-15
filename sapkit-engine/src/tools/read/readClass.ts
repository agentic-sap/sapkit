/**
 * ReadClass — 클래스 소스 한 벌 **+ 메타데이터**를 한 응답에 담는다.
 *
 * `GetClass`와 이름이 비슷하지만 다른 도구다. `GetClass`는 소스만 읽고 의존
 * 문맥을 덧붙일 수 있고, 이쪽은 **소스와 오브젝트 메타데이터(패키지·담당자·
 * 설명)를 두 왕복으로 함께** 가져온다.
 *
 * ## 와이어 근거 (겉 핸들러 → engine/src/lib → 안쪽 패키지)
 *
 * 구 핸들러 `engine/src/handlers/class/readonly/handleReadClass.ts:32-90`은
 * `engine/src/lib/clients.ts:15-32`의 `createAdtClient`로 벤더 클라이언트를
 * 만들어 두 메서드를 부른다. 그 아래는 전부 `@babamba2/mcp-abap-adt-clients`다.
 *
 *  - **소스** — `AdtClass.read()`
 *    (`dist/core/class/AdtClass.js:176-213`) → `dist/core/class/read.js:37-39`
 *    `getClassSource` → `dist/core/shared/AdtUtils.js:306-326`
 *    `readObjectSource` → 같은 파일 `:743-749`
 *    `getObjectSourceUri('class', …)` =
 *    `/sap/bc/adt/oo/classes/{encodeURIComponent(NAME)}/source/main?version=…`.
 *    Accept는 `AdtUtils.js:315`의 기본값 `'text/plain'`이다.
 *  - **메타데이터** — `AdtClass.readMetadata()` (`AdtClass.js:217-247`) →
 *    `read.js:28-30` `getClassMetadata` → `AdtUtils.js:269-292`
 *    `readObjectMetadata` → 같은 파일 `:652-657`
 *    `/sap/bc/adt/oo/classes/{encodeURIComponent(NAME)}` (질의 인자 없음).
 *    Accept는 `:700-705`가 고르는 `ACCEPT_CLASS`
 *    (`dist/constants/contentTypes.js:63` — v4·v3·v2·v1 네 개를 한 줄에).
 *
 * `readMetadata`는 `this.contentTypes`가 있으면 Accept를 그것으로 덮어쓰지만
 * (`AdtClass.js:229-231`), 엔진의 `createAdtClient`는 그 옵션을 넘기지 않으므로
 * (`clients.ts:30-31`) 위 기본 Accept가 그대로 나간다.
 *
 * ## 두 읽기는 서로를 무너뜨리지 않는다
 *
 * 구는 두 호출을 **각각** try/catch로 감싸 실패하면 그 자리에 `null`을 넣고
 * 계속했다(`handleReadClass.ts:45-72`). 메타데이터가 막힌 시스템에서도 소스는
 * 돌려주려는 것이다. 그래서 **둘 다 실패해도 `isError:false`에 null 둘**이다 —
 * 조용한 성공처럼 보이지만 구가 고른 갈래이고, 응답이 그 사실을 값으로 말한다.
 *
 * 빈 본문이 `null`이 되는 것도 구 그대로다: 구는 `if (readResult?.readResult?.data)`
 * 라는 **falsy 판정**으로 걸렀으므로 빈 문자열도 null이 된다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 axios가 파싱해 둔 `data`가 문자열이 아닐 때 `JSON.stringify`로 접었다.
 * 신 접속 계층의 `body`는 언제나 문자열이라 그 갈래가 사라진다 — 진입점만
 * 다르고 결과가 같다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { objectSourcePath, readSourceText } from './internal/adt';
import { encodeObjectName } from './internal/adt';
import { ok, returnError } from './internal/results';

/** 구 `ACCEPT_CLASS` (`dist/constants/contentTypes.js:63`) 그대로. */
const ACCEPT_CLASS =
  'application/vnd.sap.adt.oo.classes.v4+xml, application/vnd.sap.adt.oo.classes.v3+xml, ' +
  'application/vnd.sap.adt.oo.classes.v2+xml, application/vnd.sap.adt.oo.classes.v1+xml';

/** 클래스 메타데이터 경로 — 소스와 달리 `/source/main`도 질의 인자도 없다. */
function classMetadataPath(name: string): string {
  return `/sap/bc/adt/oo/classes/${encodeObjectName(name)}`;
}

export const readClass = defineTool(
  {
    name: 'ReadClass',
    description:
      '[read-only] Read ABAP class source code and metadata (package, responsible, description, etc.).',
    inputSchema: {
      class_name: z.string().describe('Class name (e.g., ZCL_MY_CLASS).'),
      version: z
        .enum(['active', 'inactive'])
        .default('active')
        .describe('Version to read: "active" (default) or "inactive".'),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['class_name'],
  },
  async (context, args) => {
    try {
      const { class_name, version = 'active' } = args;
      if (!class_name) return returnError(new Error('class_name is required'));

      const client = await context.getConnection();
      const className = class_name.toUpperCase();

      let sourceCode: string | null = null;
      try {
        const response = await readSourceText(
          client,
          objectSourcePath('class', className),
          version,
        );
        // 구의 falsy 판정 그대로 — 빈 본문은 "없음"이다.
        sourceCode = response.body ? response.body : null;
      } catch (error) {
        context.logger.warn(
          `Could not read source for ${className}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let metadata: string | null = null;
      try {
        const response = await client.request({
          method: 'GET',
          path: classMetadataPath(className),
          accept: ACCEPT_CLASS,
          timeout: 'default',
        });
        metadata = response.body ? response.body : null;
      } catch (error) {
        context.logger.warn(
          `Could not read metadata for ${className}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            class_name: className,
            version,
            source_code: sourceCode,
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
