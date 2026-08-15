/**
 * `CreatePackage` — 개발 오브젝트를 담을 그릇을 만든다. 이 묶음의 **유일한 mutation**이다.
 *
 * 구 핸들러: `engine/src/handlers/package/high/handleCreatePackage.ts`.
 *
 * ## 요청 순서 (구 그대로 — 여섯 발)
 *
 * ```
 * ① 이름 검증        POST /sap/bc/adt/packages/validation?…&checkmode=basic
 * ② 로그온 언어      GET  /sap/bc/adt/core/http/systeminformation
 * ③ 이름 검증 (다시) POST /sap/bc/adt/packages/validation?…&checkmode=basic
 * ④ 생성             POST /sap/bc/adt/packages[?corrNr=…]
 * ⑤ 준비 대기 읽기   GET  /sap/bc/adt/packages/{NAME}?version=active&withLongPolling=true
 * ⑥ 생성 후 검사     POST /sap/bc/adt/checkruns
 * ```
 *
 * **①과 ③은 같은 요청이 두 번 나가는 것이다.** 겉 핸들러가
 * `client.getPackage().validate(...)`를 직접 한 번 부르고(`:127-135`), 이어 부르는
 * `create()`의 첫 단계가 **같은 검증을 다시** 한다
 * (`@babamba2/…/dist/core/package/AdtPackage.js:88-101`). `CreateFunctionGroup`이
 * 같은 모양이다 — 하나로 접으면 와이어의 요청 수가 구와 달라진다.
 *
 * **⚠ ①과 ③의 `packagetype`이 다를 수 있다.** 겉 핸들러의 직접 호출은
 * `packageType`을 **넘기지 않으므로**(`:127-135`에 그 키가 없다) 벤더가
 * `'development'`로 채우고(`validation.js:20`), ③은 `config.packageType`을 그대로
 * 쓴다. 그래서 `package_type: 'structure'`를 주면 ①은 `development`, ③은
 * `structure`로 나간다. 구의 실측이라 그대로 뒀다.
 *
 * ⑤는 응답을 **아무도 읽지 않는다**(`AdtPackage.js:120-131`이 실패를 삼킨다).
 * 클라우드의 최종 일관성 때문에 "준비될 때까지 기다리는" 왕복이며, 그래도
 * 와이어에는 나가므로 지운다는 선택지가 없다.
 *
 * ⑥의 `chkrun:version`은 **`inactive`**다 — 겉 핸들러가 `check({packageName,
 * superPackage})`를 status 없이 부르고(`:182-185`), 벤더가
 * `status === 'active' ? 'active' : 'inactive'`로 접기 때문이다
 * (`AdtPackage.js:440`). 오브젝트 URI는 **소문자**다(`check.js:29`).
 *
 * ## ⚠ `software_component`는 선언상 선택이지만 벤더가 **필수로 던진다**
 *
 * 발행 설명문은 "안 주면 SAP이 기본값(보통 ZLOCAL)을 넣는다"고 말하지만,
 * `AdtPackage.create()`가 `if (!config.softwareComponent) throw`로 먼저 막는다
 * (`AdtPackage.js:80-82`). 그 자리는 ①·②가 이미 나간 **뒤**다 — 그래서 인자를
 * 빠뜨리면 두 발이 나가고 나서 실패한다. 설명문은 채록본과 글자 일치해야 하므로
 * 고치지 않고, 동작도 구 그대로 둔다.
 *
 * ## 오류 분류 (구의 사다리 그대로 — `:207-315`)
 *
 * 토큰 만료 → 이미 있음(409·문구 넷) → 401/403 → **404 + "Error while importing
 * object"면 되읽어 살아 있으면 성공으로 접는다** → 그 밖은 InternalError.
 * 넷째 갈래가 요점이다: 생성은 됐는데 임포트 경고로 404가 오는 시스템이 있어,
 * 구는 되읽기로 실물을 확인한 뒤에만 성공이라고 말한다. **되읽기가 실패하면
 * 성공이라 하지 않는다** — 거짓 성공이 아니다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 *  - 인자 검증 실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다(장부 D34).
 *    문장 자체는 글자 그대로다.
 *  - `masterSystem`·`responsible`을 env에서만 읽는다 — 이미 등재된 축소분(D62·D82).
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext, ToolResult } from '../../server/toolDefinition';
import { resolveMasterLanguage } from './dataElementDomainCreate';

const PACKAGES_PATH = '/sap/bc/adt/packages';
const VALIDATION_PATH = '/sap/bc/adt/packages/validation';
const CHECKRUNS_PATH = '/sap/bc/adt/checkruns';

/** `dist/constants/contentTypes.js:34`·`:97`·`:98`. */
const ACCEPT_VALIDATION = 'application/vnd.sap.as+xml';
const ACCEPT_PACKAGE =
  'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml';
const CT_PACKAGE = 'application/vnd.sap.adt.packages.v2+xml';
/** `checkPackage`가 싣는 두 줄(`check.js:50-53` → `contentTypes.js`). */
const ACCEPT_CHECK_MESSAGES = 'application/vnd.sap.adt.checkmessages+xml';
const CT_CHECK_OBJECTS = 'application/vnd.sap.adt.checkobjects+xml';

/** `create.js:18-23` — 다섯 글자, `&`가 맨 먼저다. */
function escapeXml(value: string | undefined): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `dist/utils/internalUtils.js`의 `limitDescription` — SAP ADT 상한 60자. */
function limitDescription(description: string): string {
  return description.length > 60 ? description.substring(0, 60) : description;
}

/** `validatePackageBasic`(`validation.js:14-31`). */
function validatePackage(
  client: AdtClient,
  input: {
    packageName: string;
    superPackage: string;
    description: string;
    packageType: string | undefined;
  },
): Promise<unknown> {
  return client.request({
    method: 'POST',
    path: VALIDATION_PATH,
    params: {
      objname: input.packageName,
      packagename: input.superPackage,
      description: input.description || input.packageName,
      packagetype: input.packageType || 'development',
      checkmode: 'basic',
    },
    accept: ACCEPT_VALIDATION,
    timeout: 'default',
  });
}

export interface PackagePayloadInput {
  readonly packageName: string;
  readonly superPackage: string;
  readonly description: string;
  readonly packageType: string;
  readonly softwareComponent: string;
  readonly transportLayer?: string | undefined;
  readonly applicationComponent?: string | undefined;
  readonly recordChanges: boolean;
  readonly masterLanguage: string;
  readonly masterSystem?: string | undefined;
  readonly responsible?: string | undefined;
}

/**
 * `create.js:25-70` — 줄바꿈·들여쓰기까지 구 그대로다. 본문 한 글자가 달라지면
 * 재생 대조에서 와이어 차이로 잡힌다.
 */
export function buildPackagePayload(input: PackagePayloadInput): string {
  const description = escapeXml(limitDescription(input.description || input.packageName));
  const softwareComponentXml = `<pak:softwareComponent pak:name="${escapeXml(input.softwareComponent)}"/>`;
  const transportLayerXml = input.transportLayer
    ? `<pak:transportLayer pak:name="${escapeXml(input.transportLayer)}"/>`
    : '<pak:transportLayer/>';
  const applicationComponentXml = input.applicationComponent
    ? `<pak:applicationComponent pak:name="${escapeXml(input.applicationComponent)}"/>`
    : '<pak:applicationComponent/>';
  const superPackageXml = input.superPackage
    ? `<pak:superPackage adtcore:name="${escapeXml(input.superPackage)}"/>`
    : '<pak:superPackage/>';
  const responsibleAttr = input.responsible
    ? ` adtcore:responsible="${escapeXml(input.responsible)}"`
    : '';
  const masterSystemAttr = input.masterSystem
    ? ` adtcore:masterSystem="${escapeXml(input.masterSystem)}"`
    : '';
  const masterLanguage = (input.masterLanguage || 'EN').toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="${masterLanguage}" adtcore:name="${input.packageName}" adtcore:type="DEVC/K" adtcore:version="active" adtcore:masterLanguage="${masterLanguage}"${masterSystemAttr}${responsibleAttr}>
  <adtcore:packageRef adtcore:name="${input.packageName}"/>
  <pak:attributes pak:isEncapsulated="false" pak:packageType="${input.packageType}" pak:recordChanges="${input.recordChanges ? 'true' : 'false'}"/>
  ${superPackageXml}
  ${applicationComponentXml}
  <pak:transport>
    ${softwareComponentXml}
    ${transportLayerXml}
  </pak:transport>
  <pak:translation/>
  <pak:useAccesses/>
  <pak:packageInterfaces/>
  <pak:subPackages/>
</pak:package>`;
}

/** `checkPackage`(`check.js:24-48`) — 오브젝트 URI가 소문자이고 version은 inactive다. */
export function buildCheckPayload(packageName: string): string {
  const objectUri = `${PACKAGES_PATH}/${encodeURIComponent(packageName).toLowerCase()}`;
  return `<?xml version="1.0" encoding="UTF-8"?><chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">

  <chkrun:checkObject adtcore:uri="${objectUri}" chkrun:version="inactive"/>

</chkrun:checkObjectList>`;
}

const ok = (payload: Record<string, unknown>): ToolResult => ({
  isError: false,
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

const fail = (message: string): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

/** 구가 `error.response?.data`로 읽던 자리. 신 접속 계층에서는 `rawBody`다. */
function responseBodyOf(error: unknown): string {
  return error instanceof AdtError && typeof error.rawBody === 'string' ? error.rawBody : '';
}

function statusOf(error: unknown): number | undefined {
  return error instanceof AdtError ? error.status : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const createPackage = defineTool(
  {
    name: 'CreatePackage',
    description:
      'Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.',
    inputSchema: {
      package_name: z
        .string()
        .describe(
          'Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions (start with Z or Y for customer namespace).',
        ),
      description: z
        .string()
        .optional()
        .describe('Package description. If not provided, package_name will be used.'),
      super_package: z
        .string()
        .describe('Parent package name (e.g., ZOK_PACKAGE). Required for structure packages.'),
      package_type: z
        .enum(['development', 'structure'])
        .default('development')
        .describe("Package type: 'development' (default) or 'structure'"),
      software_component: z
        .string()
        .optional()
        .describe(
          'Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages).',
        ),
      transport_layer: z
        .string()
        .optional()
        .describe('Transport layer (e.g., ZE19). Required for transportable packages.'),
      transport_request: z
        .string()
        .optional()
        .describe(
          'Transport request number (e.g., E19K905635). Required if package is transportable.',
        ),
      record_changes: z
        .boolean()
        .optional()
        .describe(
          'Enable change recording for the package. Required for transportable packages. Default: false.',
        ),
      application_component: z
        .string()
        .optional()
        .describe('Application component (optional, e.g., BC-ABA)'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/package/high/`이고 `HighLevelHandlersGroup`에 등록됐다
    // (`engine/src/lib/handlers/groups/HighLevelHandlersGroup.ts:476`). 채록본에서도
    // `--exposition=readonly` 두 조건에는 **뜨지 않는다** — `GetPackage`와 같은 집합.
    sets: ['high'],
    kind: 'mutation',
    // 만들어지는 대상은 `package_name` 하나다. `super_package`는 **부모**이고
    // 표준 구조 패키지(`$TMP`·`HOME` 등)가 정상적으로 올 수 있어 선언하지 않는다 —
    // 걸면 정당한 생성이 사전 검사에서 막힌다.
    targetNames: ['package_name'],
  },
  async (context, args) => {
    // 구는 여기서 McpError를 던져 바깥 catch가 다시 던졌다. 신 엔진에는 도구가
    // 프로토콜 오류 코드를 고르는 통로가 없어 문구만 보존한다(장부 D34).
    if (!args?.package_name) return fail('Package name is required');
    if (!args?.super_package) return fail('Super package (parent package) is required');

    const packageName = args.package_name.toUpperCase();
    const description = args.description || packageName;
    const packageType = args.package_type || 'development';

    context.logger.info(`Starting package creation: ${packageName}`);

    const client = await context.getConnection();

    try {
      // ① 겉 핸들러의 직접 검증 — `packageType`을 넘기지 않아 언제나 development다.
      await validatePackage(client, {
        packageName,
        superPackage: args.super_package,
        description,
        packageType: undefined,
      });

      // ② 로그온 언어. 조회 실패는 생성 실패가 아니다 — EN으로 떨어진다.
      const masterLanguage = await resolveMasterLanguage(client);

      // 벤더 `create()`가 **자기 첫 요청보다 먼저** 막는 자리다
      // (`AdtPackage.js:74-82` — 네 가드가 step 1 위에 있다). 선언상 선택이지만
      // 없으면 던지므로, ③이 나가기 전에 걸린다.
      if (!args.software_component) throw new Error('Software component is required');

      // ③ `create()`의 첫 단계 — 같은 검증을 다시. 이쪽은 준 packageType을 쓴다.
      await validatePackage(client, {
        packageName,
        superPackage: args.super_package,
        description,
        packageType: args.package_type,
      });

      // ④ 생성.
      await client.request({
        method: 'POST',
        path: PACKAGES_PATH,
        ...(args.transport_request ? { params: { corrNr: args.transport_request } } : {}),
        body: buildPackagePayload({
          packageName,
          superPackage: args.super_package,
          description,
          packageType,
          softwareComponent: args.software_component,
          transportLayer: args.transport_layer,
          applicationComponent: args.application_component,
          recordChanges: args.record_changes ?? false,
          masterLanguage,
          masterSystem: context.env.SAP_MASTER_SYSTEM || undefined,
          responsible: context.env.SAP_RESPONSIBLE || context.env.SAP_USERNAME || undefined,
        }),
        accept: ACCEPT_PACKAGE,
        contentType: CT_PACKAGE,
        timeout: 'default',
      });

      // ⑤ 준비 대기 읽기. 응답을 아무도 읽지 않고 실패도 삼킨다.
      try {
        await readPackageForReadiness(client, packageName);
      } catch (readError) {
        context.logger.warn(
          `read with long polling failed (object may not be ready yet): ${messageOf(readError)}`,
        );
      }

      // ⑥ 생성 후 검사 — version은 inactive다.
      await client.request({
        method: 'POST',
        path: CHECKRUNS_PATH,
        body: buildCheckPayload(packageName),
        accept: ACCEPT_CHECK_MESSAGES,
        contentType: CT_CHECK_OBJECTS,
        timeout: 'default',
      });

      context.logger.info(`✅ CreatePackage completed successfully: ${packageName}`);

      return ok(successPayload(args, packageName, description, packageType));
    } catch (error) {
      return await classifyFailure(context, client, error, args, packageName, description, packageType);
    }
  },
);

function readPackageForReadiness(client: AdtClient, packageName: string): Promise<unknown> {
  return client.request({
    method: 'GET',
    path: `${PACKAGES_PATH}/${encodeURIComponent(packageName)}`,
    params: { version: 'active', withLongPolling: 'true' },
    accept: ACCEPT_PACKAGE,
    timeout: 'default',
  });
}

interface CreateArgs {
  readonly description?: string | undefined;
  readonly super_package: string;
  readonly software_component?: string | undefined;
  readonly transport_layer?: string | undefined;
  readonly transport_request?: string | undefined;
}

/**
 * 구 `:189-206`(성공)과 `:286-305`(임포트 경고). `|| null`이라 빈 문자열도 null로
 * 접힌다. **키 순서가 계약이다** — 경고판은 `uri` 다음에 `warning`, 그 뒤가
 * `message`다. `message` 문구도 두 판이 다르다.
 */
function successPayload(
  args: CreateArgs,
  packageName: string,
  description: string,
  packageType: string,
  importWarning = false,
): Record<string, unknown> {
  return {
    success: true,
    package_name: packageName,
    description,
    super_package: args.super_package,
    package_type: packageType,
    software_component: args.software_component || null,
    transport_layer: args.transport_layer || null,
    transport_request: args.transport_request || null,
    uri: `${PACKAGES_PATH}/${packageName.toLowerCase()}`,
    ...(importWarning
      ? {
          warning: 'Import warning during create (404). Object verified by read.',
          message: `Package ${packageName} created successfully (import warning ignored).`,
        }
      : { message: `Package ${packageName} created successfully` }),
  };
}

/** 구 `:207-315`의 분류 사다리. 순서가 계약이다. */
async function classifyFailure(
  context: ToolContext,
  client: AdtClient,
  error: unknown,
  args: CreateArgs,
  packageName: string,
  description: string,
  packageType: string,
): Promise<ToolResult> {
  context.logger.error(`CreatePackage ${packageName}: ${messageOf(error)}`);

  const message = messageOf(error);
  const body = responseBodyOf(error);
  const status = statusOf(error);

  if (
    message.includes('Refresh token has expired') ||
    message.includes('JWT token has expired') ||
    message.includes('Please re-authenticate')
  ) {
    return fail(
      `Authentication failed: ${message}. Please re-authenticate using the authentication tool or update your credentials.`,
    );
  }

  const loweredMessage = message.toLowerCase();
  const loweredBody = body.toLowerCase();
  if (
    loweredMessage.includes('already exists') ||
    loweredMessage.includes('does already exist') ||
    loweredBody.includes('already exists') ||
    loweredBody.includes('does already exist') ||
    loweredBody.includes('exceptionresourcealreadyexists') ||
    status === 409
  ) {
    return fail(
      `Package ${packageName} already exists. Please delete it first or use a different name.`,
    );
  }

  if (status === 401 || status === 403) {
    return fail(
      status === 401
        ? 'Unauthorized: Authentication failed. Please check your credentials and re-authenticate.'
        : 'Forbidden: Access denied. Please check your permissions.',
    );
  }

  const errorMessage = body || message;

  // 생성은 됐는데 임포트 경고로 404가 오는 시스템이 있다. **되읽어 확인한 뒤에만**
  // 성공이라고 말한다 — 되읽기가 실패하면 아래 InternalError로 떨어진다.
  if (status === 404 && errorMessage.includes('Error while importing object')) {
    try {
      await readPackageForReadiness(client, packageName);
      context.logger.warn(
        `CreatePackage returned import error, but ${packageName} is readable; continuing as success`,
      );
      return ok(successPayload(args, packageName, description, packageType, true));
    } catch {
      // 아래 표준 오류 처리로 떨어진다.
    }
  }

  return fail(`Failed to create package ${packageName}: ${errorMessage}`);
}
