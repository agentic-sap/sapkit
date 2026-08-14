/**
 * CreateFunctionGroup — 함수모듈을 담을 컨테이너를 만든다.
 *
 * 함수그룹은 **소스가 없는 그릇**이다. 그래서 이 도구는 소스를 쓰지 않고, 만들고
 * 나서 곧바로 활성화까지 갈 수 있다(기본값 `activate: true`).
 *
 * ## 요청 순서 (구 그대로)
 *
 * ```
 * ① 콘텐츠 타입 협상   GET  /sap/bc/adt/discovery        (레거시면 건너뛴다)
 * ② 이름 검증          POST /sap/bc/adt/functions/validation
 * ③ 이름 검증 (다시)   POST /sap/bc/adt/functions/validation
 * ④ 생성               POST /sap/bc/adt/functions/groups
 * ⑤ 준비 대기 읽기     GET  /sap/bc/adt/functions/groups/{FG}?withLongPolling=true
 * ⑥ 생성 후 구문검사   POST /sap/bc/adt/checkruns?reporters=abapCheckRun
 * ⑦ 마무리 읽기        GET  /sap/bc/adt/functions/groups/{FG}
 * ⑧ 활성화            POST /sap/bc/adt/activation                (activate!==false)
 * ```
 *
 * **②와 ③은 같은 요청이 두 번 나가는 것이다.** 구 핸들러가
 * `client.getFunctionGroup().validate(...)`를 직접 한 번 부르고
 * (`engine/src/handlers/function/high/handleCreateFunctionGroup.ts:118-122`),
 * 이어 부르는 `create()`의 첫 단계가 **같은 검증을 다시** 한다
 * (`AdtFunctionGroup.js:77-105`). 둘은 응답을 읽는 방식까지 다르다 — ②는
 * `parseValidationResponse`로 `CHECK_RESULT`/`SEVERITY`를 보고, ③은 본문에서
 * `<SEVERITY>ERROR</SEVERITY>`를 찾아 `<SHORT_TEXT>`로 던진다. 하나로 접으면
 * 와이어의 요청 수가 구와 달라진다.
 *
 * ⑤와 ⑦은 응답을 **아무도 읽지 않는다**(핸들러가 `create()`의 반환값을 버린다).
 * 클라우드의 최종 일관성 때문에 "준비될 때까지 기다리는" 왕복이며, 실패해도
 * 삼킨다. 그래도 와이어에는 나가므로 지운다는 선택지가 없다.
 *
 * ## Kerberos 관용 — 세 자리에 흩어져 있다
 *
 * 시험용 클라우드가 "Kerberos library not loaded"를 돌려주면서도 오브젝트는 실제로
 * 만든다. 구는 그 문구를 ②③(검증) · ④(생성 400) · ⑥(검사) 전부에서 실패로 보지
 * 않는다. 관용을 빼면 그 시스템에서 정상 생성이 실패로 보고된다.
 *
 * ## 콘텐츠 타입 협상 — 실측이 근거인 자리
 *
 * 벤더 기본값은 `...groups.v3+xml`인데, S/4HANA 2021 온프렘의 ADT discovery는
 * 함수그룹 컬렉션에 **v2까지만 광고**하고 v3로 POST하면 HTTP 400
 * ("Daten sind ungültig und konnten nicht konvertiert werden")으로 거절한다.
 * 그래서 discovery가 광고하는 미디어 타입 중 가장 높은 판을 골라 쓴다. 근거와
 * 실측 기록의 정본은 `engine/src/lib/adtFunctionGroupContentTypes.ts:1-23`이다.
 * discovery가 없거나 알아볼 값이 없으면 벤더 기본값으로 떨어진다.
 *
 * 레거시 시스템에서는 협상을 **하지 않는다** — 구 `createAdtClient`가 레거시일 때
 * 주입된 콘텐츠 타입을 무시하고 판 없는 타입을 쓰기 때문이다
 * (`engine/src/lib/clients.ts:25-29` · `clients/AdtClientLegacy.js:41-46`).
 *
 * ## 와이어 근거 (전부 읽기 전용 참고)
 *
 *  - 구 핸들러 — 위 파일 `:93-262`
 *  - 생성 체인 — `AdtFunctionGroup.js:63-210`
 *  - 저수준 — `core/functionGroup/{validation,create,read,check,activation}.js`
 *
 * ## 구와 다른 것 — 등재됨
 *
 * 생성 뒤 마무리 읽기(⑦)가 404를 받았을 때의 **5초 대기 후 1회 재시도**를
 * 승계하지 않는다. 장부 D52.
 */

import * as z from 'zod';

import { XMLParser } from 'fast-xml-parser';

import type { AdtClient } from '../../adt';
import { AdtError } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext, ToolLogger } from '../../server/toolDefinition';
import {
  CT_FUNCTION_GROUP,
  CT_FUNCTION_GROUP_LEGACY,
  FUNCTION_VALIDATION_PATH,
  functionErrorResult,
  functionGroupUri,
  isKerberosNoise,
  isLegacySystem,
  ownerAttributeXml,
  ownerAttributes,
  parseFunctionValidation,
} from './functions';
import {
  ACCEPT_VALIDATION,
  CT_ACTIVATION,
  activateOne,
  checkStored,
  describeFailure,
  limitDescription,
  okResult,
} from './shared';
import { functionGroupPath } from '../read/internal/adt';

const DISCOVERY_PATH = '/sap/bc/adt/discovery';
const DISCOVERY_ACCEPT = 'application/atomsvc+xml';
const FG_COLLECTION_HREF = '/sap/bc/adt/functions/groups';
const FG_MEDIA_TYPE_RE =
  /^application\/vnd\.sap\.adt\.functions\.groups(?:\.v(\d+))?\+xml$/;

/** 함수그룹 읽기의 Accept — 구 `core/functionGroup/read.js:22`의 와일드카드 기본값. */
const ACCEPT_FUNCTION_GROUP_READ = '*/*';

const exceptionParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
});

/**
 * discovery 문서에서 컬렉션 하나의 `<app:accept>` 값들을 뽑는다.
 *
 * 네임스페이스 접두사를 가리지 않는다(문서가 200KB쯤이고 필요한 것은 블록 하나라
 * 전체 파싱 대신 정규식을 쓴다 — 구도 같은 이유로 같은 방법을 쓴다). `href`는
 * 따옴표 두 종류 · 뒤 슬래시 유무 · 절대 URL을 모두 받아들인다.
 */
export function extractCollectionAccepts(
  discoveryXml: string,
  collectionHref: string,
): string[] {
  const escaped = collectionHref.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const collectionRe = new RegExp(
    `<(?:[\\w.-]+:)?collection\\b[^>]*href=(["'])(?:[^"']*)?${escaped}/?\\1[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?collection>`,
  );
  const block = discoveryXml.match(collectionRe)?.[2];
  if (!block) return [];
  const accepts: string[] = [];
  const acceptRe = /<(?:[\w.-]+:)?accept>([^<]+)<\/(?:[\w.-]+:)?accept>/g;
  let match = acceptRe.exec(block);
  while (match !== null) {
    accepts.push((match[1] ?? '').trim());
    match = acceptRe.exec(block);
  }
  return accepts;
}

/** 광고된 것 중 가장 높은 판. 판 없는 `...groups+xml`은 v1로 센다. */
export function pickFunctionGroupContentType(accepts: readonly string[]): string | undefined {
  let best: { version: number; mediaType: string } | undefined;
  for (const accept of accepts) {
    const match = accept.match(FG_MEDIA_TYPE_RE);
    if (!match) continue;
    const version = match[1] ? Number(match[1]) : 1;
    if (!best || version > best.version) best = { version, mediaType: accept };
  }
  return best?.mediaType;
}

/**
 * 협상 결과는 접속마다 한 번만 구한다 — 구도 접속을 키로 캐시한다
 * (`adtFunctionGroupContentTypes.ts:112`). **실패는 캐시하지 않는다**: 일시적인
 * discovery 장애가 세션 내내 폴백을 고정하지 않게 하려는 것이고, 그 규칙도 구의
 * 주석이 명시한다.
 */
const negotiated = new WeakMap<AdtClient, string>();

async function negotiateContentType(client: AdtClient, logger: ToolLogger): Promise<string> {
  const cached = negotiated.get(client);
  if (cached) return cached;

  let body: string;
  try {
    const response = await client.request({
      method: 'GET',
      path: DISCOVERY_PATH,
      accept: DISCOVERY_ACCEPT,
      timeout: 'default',
    });
    body = response.body;
  } catch {
    logger.debug(
      'FunctionGroup content-type negotiation: discovery unavailable, keeping defaults',
    );
    return CT_FUNCTION_GROUP;
  }

  const mediaType = pickFunctionGroupContentType(
    extractCollectionAccepts(body, FG_COLLECTION_HREF),
  );
  if (!mediaType) {
    logger.debug(
      'FunctionGroup content-type negotiation: no groups media type advertised, keeping defaults',
    );
    return CT_FUNCTION_GROUP;
  }

  logger.info(`FunctionGroup content-type negotiated from discovery: ${mediaType}`);
  negotiated.set(client, mediaType);
  return mediaType;
}

/** 구 400 갈래가 `exc:exception`에서 문구를 꺼내던 자리. */
function exceptionMessage(body: string): string | undefined {
  try {
    const parsed = exceptionParser.parse(body ?? '') as Record<string, unknown>;
    const exception = parsed['exc:exception'] as Record<string, unknown> | undefined;
    if (!exception) return undefined;
    const message = exception['message'];
    const text =
      typeof message === 'string'
        ? message
        : ((message as Record<string, unknown> | undefined)?.['#text'] ??
          exception['localizedMessage']);
    return typeof text === 'string' && text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function statusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}

/** 오류가 실어 온 SAP 원문 — Kerberos·Business partner 판정의 입력. */
function rawBodyOf(error: unknown): string {
  return error instanceof AdtError ? (error.rawBody ?? error.message) : describeFailure(error);
}

export const createFunctionGroup = defineTool(
  {
    name: 'CreateFunctionGroup',
    description:
      'Create a new ABAP function group in SAP system. Function groups serve as containers for function modules. Uses stateful session for proper lock management.',
    inputSchema: {
      function_group_name: z
        .string()
        .describe(
          'Function group name (e.g., ZTEST_FG_001). Must follow SAP naming conventions (start with Z or Y, max 26 chars).',
        ),
      description: z
        .string()
        .describe('Function group description. If not provided, function_group_name will be used.')
        .optional(),
      package_name: z.string().describe('Package name (e.g., ZOK_LAB, $TMP for local objects)'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
        )
        .optional(),
      activate: z
        .boolean()
        .describe(
          'Activate function group after creation. Default: true. Set to false for batch operations.',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['function_group_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.function_group_name) {
      return functionErrorResult('function_group_name is required');
    }
    if (!args.package_name) {
      return functionErrorResult('package_name is required');
    }

    const functionGroupName = args.function_group_name.toUpperCase();
    const packageName = args.package_name;
    const rawDescription = args.description || functionGroupName;
    const shouldActivate = args.activate !== false;

    logger.info(`Starting function group creation: ${functionGroupName}`);

    const validate = (client: AdtClient) =>
      client.request({
        method: 'POST',
        path: FUNCTION_VALIDATION_PATH,
        params: {
          objtype: 'FUGR/F',
          objname: functionGroupName,
          packagename: packageName,
          description: limitDescription(rawDescription),
        },
        accept: ACCEPT_VALIDATION,
        timeout: 'default',
      });

    /** ⑤·⑦ — 응답을 쓰지 않는 준비 대기 읽기. 실패는 삼킨다. */
    const settleRead = async (client: AdtClient, longPolling: boolean): Promise<void> => {
      try {
        await client.request({
          method: 'GET',
          path: functionGroupPath(functionGroupName),
          params: longPolling ? { withLongPolling: 'true' } : undefined,
          accept: ACCEPT_FUNCTION_GROUP_READ,
          timeout: 'default',
        });
      } catch (error) {
        logger.warn(
          `read after create failed (object may not be ready yet): ${describeFailure(error)}`,
        );
      }
    };

    try {
      const client = await context.getConnection();

      // ① 콘텐츠 타입. 레거시는 협상 결과를 어차피 쓰지 않으므로 왕복을 아낀다.
      const contentType = isLegacySystem(context)
        ? CT_FUNCTION_GROUP_LEGACY
        : await negotiateContentType(client, logger);

      // ② 핸들러가 직접 하는 검증 — `CHECK_RESULT`/`SEVERITY`를 읽는다.
      const first = await validate(client);
      const verdict = parseFunctionValidation(first.body);
      if (!verdict.valid && !isKerberosNoise(`${verdict.message ?? ''}${first.body}`)) {
        return functionErrorResult(
          `Function group validation failed: ${verdict.message || 'Unknown validation error'}`,
        );
      }

      // ③ 생성 체인 첫 단계의 같은 검증 — 이쪽은 본문에서 SEVERITY를 찾는다.
      const second = await validate(client);
      if (/<SEVERITY>ERROR<\/SEVERITY>/.test(second.body) && !isKerberosNoise(second.body)) {
        const shortText = second.body.match(/<SHORT_TEXT>([^<]+)<\/SHORT_TEXT>/)?.[1];
        throw new Error(shortText || 'Function group validation failed');
      }
      logger.info(`Function group validation passed: ${functionGroupName}`);

      // ④ 생성. Accept는 싣지 않는다 — 구 `create.js:66-74`가 Content-Type만 넘긴다.
      const metadata =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<group:abapFunctionGroup xmlns:group="http://www.sap.com/adt/functions/groups" ` +
        `xmlns:adtcore="http://www.sap.com/adt/core" ` +
        `adtcore:description="${limitDescription(rawDescription)}" ` +
        `adtcore:language="EN" adtcore:name="${functionGroupName}" ` +
        `adtcore:type="FUGR/F" ` +
        `adtcore:masterLanguage="EN"${ownerAttributeXml(ownerAttributes(context))}>\n` +
        `  <adtcore:packageRef adtcore:name="${packageName}"/>\n` +
        `</group:abapFunctionGroup>`;

      try {
        await client.request({
          method: 'POST',
          path: FG_COLLECTION_HREF,
          params: { corrNr: args.transport_request },
          body: metadata,
          contentType,
          timeout: 'default',
        });
      } catch (error) {
        // 구는 400 + Kerberos를 **가짜 201로 바꿔** 체인을 계속한다.
        if (statusOf(error) === 400 && isKerberosNoise(rawBodyOf(error))) {
          logger.warn(
            'FunctionGroup create returned Kerberos error, but object may have been created - ignoring error',
          );
        } else {
          throw error;
        }
      }
      logger.info(`Function group created: ${functionGroupName}`);

      // ⑤ 준비 대기.
      await settleRead(client, true);

      // ⑥ 생성 후 검사. 빈 함수그룹이 내는 잡음과 Kerberos는 오류로 보지 않는다.
      const check = await checkStored(client, functionGroupUri(functionGroupName), 'inactive');
      const realErrors = check.errors.filter(
        (entry) => !isKerberosNoise(entry.text) && !isEmptyGroupNoise(entry.text),
      );
      if (realErrors.length > 0) {
        throw new Error(
          `Function group check failed: ${realErrors.map((entry) => entry.text).join('; ')}`,
        );
      }

      // ⑦ 마무리 읽기 (D52 — 404 재시도는 승계하지 않는다).
      await settleRead(client, false);

      // ⑧ 활성화.
      if (shouldActivate) {
        await activateOne(client, functionGroupUri(functionGroupName), functionGroupName, {
          contentType: CT_ACTIVATION,
        });
      }

      logger.info(`CreateFunctionGroup completed successfully: ${functionGroupName}`);

      return okResult({
        success: true,
        function_group_name: functionGroupName,
        package_name: packageName,
        transport_request: args.transport_request || 'local',
        activated: shouldActivate,
        message: `Function group ${functionGroupName} created successfully${
          shouldActivate ? ' and activated' : ''
        }`,
      });
    } catch (error) {
      const detail = describeFailure(error);
      logger.error(`Error creating function group ${functionGroupName}: ${detail}`);

      const status = statusOf(error);
      if (status === 409) {
        return functionErrorResult(
          `Function group ${functionGroupName} already exists. Please delete it first or use a different name.`,
        );
      }

      if (status === 400) {
        const raw = rawBodyOf(error);
        // SAP이 이 둘을 돌려주고도 오브젝트를 만들어 두는 일이 있다. 구는 그때
        // **성공으로 답한다** — 문구가 "만들어졌을 수도 있다"라고 말하는 이유다.
        if (isKerberosNoise(raw) || raw.includes('Business partner')) {
          logger.warn(
            `Function group creation returned known SAP error, but object may have been created: ${functionGroupName}`,
          );
          return okResult({
            success: true,
            function_group_name: functionGroupName,
            package_name: packageName,
            transport_request: args.transport_request || 'local',
            activated: shouldActivate,
            message: `Function group ${functionGroupName} may have been created successfully (SAP returned error but object exists)`,
          });
        }
        const message = exceptionMessage(raw);
        return functionErrorResult(
          message
            ? `Bad request: ${message}`
            : 'Bad request. Check if function group name is valid and package exists.',
        );
      }

      return functionErrorResult(
        `Failed to create function group ${functionGroupName}: ${detail}`,
      );
    }
  },
);

/**
 * 아직 함수모듈이 하나도 없는 새 함수그룹에서 **정상적으로** 나오는 검사 오류.
 * 구 `core/functionGroup/check.js`의 `isEmptyFunctionGroupError`와 같은 판정이다.
 */
function isEmptyGroupNoise(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    (lower.includes('report') && lower.includes('program statement is missing')) ||
    lower.includes('program type is include')
  );
}
