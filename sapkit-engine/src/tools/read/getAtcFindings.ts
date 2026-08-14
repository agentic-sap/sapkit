/**
 * GetAtcFindings — ABAP Test Cockpit(ATC) 정적 검사를 돌리고 소견을 돌려준다.
 *
 * ## 왜 `read`인가 (`execution`이 아니다)
 *
 * ATC는 **정적 검사**다. 리포지터리 오브젝트를 바꾸지도 실행하지도 않는다(발행
 * 설명 첫 줄이 `[read-only]`이고 마지막 문장이 "Does not modify or execute
 * repository objects."다). 구 가드에서도 이 이름은 `Get` 접두사라 읽기로 통과했고
 * (`engine/src/lib/readonlyGuard.ts:42-54, 118`), 실행 목록 둘
 * (`UNIT_TEST_EXECUTION_TOOLS` `RUNTIME_EXECUTION_TOOLS`) 어디에도 없다. 같은
 * 「돌린다」는 낱말을 쓰지만 `RunUnitTest`와는 계열이 다르다.
 *
 * ## 와이어 — 네 발 (구 `engine/src/handlers/atc/readonly/handleGetAtcFindings.ts:80-203`)
 *
 * ```
 * ① GET  /sap/bc/adt/atc/customizing              (check_variant를 안 준 경우에만)
 *        Accept: application/xml, application/vnd.sap.atc.customizing-v1+xml
 *        → properties/property[@name="systemCheckVariant"]/@value
 * ② POST /sap/bc/adt/atc/worklists?checkVariant=…  Accept: text/plain  (본문 없음)
 *        → worklistId (평문)
 * ③ POST /sap/bc/adt/atc/runs?worklistId=…         Accept·Content-Type: application/xml
 *        본문 <atc:run maximumVerdicts=…> + 대상 objectReference
 *        → worklistRun/worklistId (없으면 ②의 값을 그대로 재사용)
 * ④ GET  /sap/bc/adt/atc/worklists/{runResultId}?includeExemptedFindings=false
 *        Accept: application/atc.worklist.v1+xml → 소견 XML
 * ```
 *
 * ADT-REST 계약의 출처는 marcellourbani/abap-adt-api(MIT, (c) 2019 Marcello
 * Urbani)이며 구 핸들러가 거기서 옮겨 왔다. `②`가 본문을 싣지 않는 것이 중요하다 —
 * 구는 `makeAdtRequestWithTimeout(connection, url, method, timeoutType, data,
 * params, headers)`(`engine/src/lib/utils.ts:902-920`)에서 `data`·`params`를
 * `undefined`로 건너뛰고 헤더만 일곱째에 놓는다. 인핸스먼트 묶음이 그 자리를
 * 헷갈려 GET에 본문을 실었던 것(장부 D76)과 달리 이 호출들은 자리를 지켰다.
 *
 * 타임아웃도 구 그대로다 — ①은 `default`, ③·④는 `long`.
 *
 * ## 대상 URI 해석
 *
 * `object_uri`를 주면 그것이 이긴다. 없으면 `object_name` + `object_type`을
 * 표로 옮긴다 — 구 `engine/src/lib/resolveAdtUri.ts:38-146`의 표를 이 도구가 실제로
 * 닿는 범위(`uri`도 `parentName`도 넘기지 않는 호출)로 다시 저작한 것이다. 모르는
 * 타입에서 **소리 내어 실패하는 것**이 그 함수의 요점이라 문구도 그대로 옮겼다.
 * 문구 안의 `resolveAdtUri.ts`는 신 엔진에 없는 파일 이름이지만, 오류 문구는
 * 응답의 일부라 바꾸지 않는다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구 핸들러는 성공 응답을 `{ type: 'json', json: … }`로 냈고, 구 서버가 등록
 * 시점에 그것을 `{ type: 'text', text: JSON.stringify(json) }`로 접었다
 * (`engine/src/lib/handlers/base/BaseHandlerGroup.ts:99-111`). 즉 **밖으로 나간
 * 바이트는 들여쓰기 없는 한 줄 JSON**이다. 신 엔진의 도구 반환 계약에는 `text`밖에
 * 없으므로 여기서 곧장 같은 문자열을 만든다 — 필드 이름·순서·값이 같고 나간
 * 바이트도 같으므로 장부에 올릴 차이가 아니다(장부 D36·D77이 다룬 것과 같은
 * 「그릇」이지만, 그 둘과 달리 여기서는 응답 바이트가 구와 동일하다).
 *
 * XML 파서 설정도 구와 **같은 값**으로 둔다(`removeNSPrefix` · `ignoreAttributes:
 * false` · `attributeNamePrefix: '@_'`). 구도 `fast-xml-parser`를 썼으므로
 * `parseTagValue`를 여기서 끄면 그것이야말로 동작 변경이 된다.
 */

import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import { failure, messageOf, ok } from './internal/results';

const ATC_BASE = '/sap/bc/adt/atc';

/** 구 `newParser()`(`handleGetAtcFindings.ts:72-78`)와 같은 설정. */
function newParser(): XMLParser {
  return new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
}

/**
 * 구 `McpError(ErrorCode.InvalidParams, …)` 자리.
 *
 * 구는 SDK의 `McpError`를 던져 자기 catch에서 `error.message`로 접었고, 그
 * `message`에는 SDK가 붙인 `MCP error -32602: ` 접두사가 들어 있다. 그 조각은
 * 기계가 소비하는 신호이므로(`harness/replay/errorSignature.ts`) 문구 그대로 낸다.
 */
function invalidParams(message: string): string {
  return `MCP error -32602: ${message}`;
}

class AtcArgumentError extends Error {}

/**
 * 구 `resolveAdtUri({ name, type })` — 이 도구가 닿는 갈래만 옮겼다.
 *
 * `uri`와 `parentName`은 이 호출자가 넘기지 않으므로 그 두 갈래(FUGR/FF · FUGR/I)는
 * 언제나 "parentName이 필요하다"로 끝난다. 표는 구의 것을 그대로 유지한다.
 */
export function resolveAtcTargetUri(name: string, type: string | undefined): string {
  if (!name) throw new Error('resolveAdtUri: name is required when uri is not given');
  const normalized = (type ?? '').toUpperCase();
  const lower = encodeURIComponent(name).toLowerCase();

  switch (normalized) {
    case 'PROG':
    case 'PROG/P':
      return `/sap/bc/adt/programs/programs/${lower}`;
    case 'PROG/I':
    case 'PROGI':
      return `/sap/bc/adt/programs/includes/${lower}`;

    case 'FUGR':
    case 'FUGR/F':
    case 'FUNC':
      return `/sap/bc/adt/functions/groups/${lower}`;
    case 'FUGR/FF':
      throw new Error(
        `resolveAdtUri: FUGR/FF for ${name} requires parentName (function-group name)`,
      );
    case 'FUGR/I':
      throw new Error(
        `resolveAdtUri: FUGR/I for ${name} requires parentName (function-group name)`,
      );

    case 'CLAS':
    case 'CLAS/OC':
      return `/sap/bc/adt/oo/classes/${lower}`;
    case 'INTF':
    case 'INTF/OI':
      return `/sap/bc/adt/oo/interfaces/${lower}`;

    case 'TABL':
    case 'TABL/DT':
      return `/sap/bc/adt/ddic/tables/${lower}`;
    case 'STRU':
    case 'STRU/DS':
    case 'TABL/DS':
      return `/sap/bc/adt/ddic/structures/${lower}`;
    case 'VIEW':
    case 'VIEW/DV':
      return `/sap/bc/adt/ddic/views/${lower}`;
    case 'DTEL':
    case 'DTEL/DE':
      return `/sap/bc/adt/ddic/dataelements/${lower}`;
    case 'DOMA':
    case 'DOMA/DD':
      return `/sap/bc/adt/ddic/domains/${lower}`;
    case 'TTYP':
    case 'TTYP/DF':
    case 'TTYP/TT':
      return `/sap/bc/adt/ddic/tabletypes/${lower}`;

    case 'DDLS':
    case 'DDLS/DF':
      return `/sap/bc/adt/ddic/ddl/sources/${lower}`;
    case 'DDLX':
    case 'DDLX/EX':
      return `/sap/bc/adt/ddic/ddlx/sources/${lower}`;
    case 'BDEF':
    case 'BDEF/BDO':
      return `/sap/bc/adt/ddic/bdef/sources/${lower}`;
    case 'DCLS':
    case 'DCLS/DL':
      return `/sap/bc/adt/acm/dcl/sources/${lower}`;
    case 'SRVD':
    case 'SRVD/SRV':
      return `/sap/bc/adt/ddic/srvd/sources/${lower}`;
    case 'SRVB':
    case 'SRVB/SVB':
      return `/sap/bc/adt/businessservices/bindings/${lower}`;

    case 'ENHO':
    case 'ENHO/ENH':
      return `/sap/bc/adt/enhancements/${lower}`;

    case 'DEVC':
    case 'DEVC/K':
      return `/sap/bc/adt/packages/${lower}`;

    default:
      // 소리 내어 실패한다 — 이름 휴리스틱 폴백은 SAP에서 404로만 드러나는 잘못된
      // URI를 조용히 만든다.
      throw new Error(
        `resolveAdtUri: no URI mapping for type="${type}" (object="${name}"). ` +
          `Supply an explicit "uri" in the tool input, or add this type to resolveAdtUri.ts.`,
      );
  }
}

export interface AtcFinding {
  readonly objectName: string;
  readonly objectType: string;
  readonly packageName: string;
  readonly objectUri: string;
  /** 1 = 오류 · 2 = 경고 · 3 이상 = 정보. */
  readonly priority: number;
  readonly checkId: string;
  readonly checkTitle: string;
  readonly messageId: string;
  readonly messageTitle: string;
  readonly location: string;
  readonly exemptionKind: string;
}

export interface ParsedAtcWorklist {
  readonly worklistId: string;
  readonly timestamp: string;
  readonly total: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  readonly findings: AtcFinding[];
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** 파서가 빈 요소를 `''`로 주기도 한다 — 객체일 때만 키를 읽는다. */
function child(node: unknown, key: string): unknown {
  return typeof node === 'object' && node !== null
    ? (node as Record<string, unknown>)[key]
    : undefined;
}

function attr(node: unknown, key: string): unknown {
  return typeof node === 'object' && node !== null
    ? (node as Record<string, unknown>)[`@_${key}`]
    : undefined;
}

function text(node: unknown, key: string): string {
  const value = attr(node, key);
  return value === undefined || value === null ? '' : String(value);
}

/** 구 `parseAtcWorklist`(`engine/src/lib/atcWorklistParser.ts:44-90`)를 다시 저작. */
export function parseAtcWorklist(xml: string): ParsedAtcWorklist {
  const raw = newParser().parse(xml) as Record<string, unknown>;
  const worklist = raw?.['worklist'] ?? {};

  const findings: AtcFinding[] = [];
  for (const object of asArray(child(child(worklist, 'objects'), 'object'))) {
    const objectName = text(object, 'name');
    const objectType = text(object, 'type');
    const packageName = text(object, 'packageName');
    const objectUri = text(object, 'uri');
    for (const finding of asArray(child(child(object, 'findings'), 'finding'))) {
      const priorityRaw = attr(finding, 'priority');
      findings.push({
        objectName,
        objectType,
        packageName,
        objectUri,
        priority: priorityRaw !== undefined ? Number(priorityRaw) : 0,
        checkId: text(finding, 'checkId'),
        checkTitle: text(finding, 'checkTitle'),
        // 구는 템플릿 문자열로 접었다 — 숫자로 읽힌 값도 문자열로 남는다.
        messageId: text(finding, 'messageId'),
        messageTitle: text(finding, 'messageTitle'),
        location: text(finding, 'location'),
        exemptionKind: text(finding, 'exemptionKind'),
      });
    }
  }

  const errors = findings.filter((finding) => finding.priority === 1).length;
  const warnings = findings.filter((finding) => finding.priority === 2).length;

  return {
    worklistId: text(worklist, 'id'),
    timestamp: text(worklist, 'timestamp'),
    total: findings.length,
    errors,
    warnings,
    infos: findings.length - errors - warnings,
    findings,
  };
}

/** ①의 갈래 — 시스템 기본 변형을 `/atc/customizing`에서 꺼낸다. */
async function resolveSystemVariant(client: AdtClient): Promise<string> {
  const response = await client.request({
    method: 'GET',
    path: `${ATC_BASE}/customizing`,
    accept: 'application/xml, application/vnd.sap.atc.customizing-v1+xml',
    timeout: 'default',
  });

  const parsed = newParser().parse(response.body) as Record<string, unknown>;
  const properties = child(child(child(parsed, 'customizing'), 'properties'), 'property');
  const hit = asArray(properties).find(
    (property) => text(property, 'name').toLowerCase() === 'systemcheckvariant',
  );
  const value = hit === undefined ? '' : text(hit, 'value');
  if (!value) {
    throw new AtcArgumentError(
      'No check_variant given and could not resolve the system default from /atc/customizing — pass check_variant explicitly.',
    );
  }
  return value;
}

function runRequestBody(maxResults: number, targetUri: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<atc:run maximumVerdicts="${maxResults}" xmlns:atc="http://www.sap.com/adt/atc">
  <objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference adtcore:uri="${targetUri}"/>
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>`;
}

export const getAtcFindings = defineTool(
  {
    name: 'GetAtcFindings',
    description:
      '[read-only] Run ABAP Test Cockpit (ATC) static checks on an object or package and return findings (priority 1=error/2=warning/3+=info, check title, message, object, location). Does not modify or execute repository objects.',
    inputSchema: {
      object_uri: z
        .string()
        .describe(
          'Explicit ADT URI of the target (e.g. /sap/bc/adt/oo/classes/zcl_x). If given, object_name/object_type are ignored.',
        )
        .optional(),
      object_name: z
        .string()
        .describe('Object name (used with object_type when object_uri is absent).')
        .optional(),
      object_type: z
        .string()
        .describe(
          'SAP object type code for URI resolution: CLAS, INTF, PROG, FUGR, TABL, STRU, VIEW, DTEL, DOMA, DDLS, BDEF, SRVD, SRVB, DEVC (package).',
        )
        .optional(),
      check_variant: z
        .string()
        .describe(
          'ATC check variant name. If omitted, the system default variant is resolved from /atc/customizing.',
        )
        .optional(),
      max_results: z
        .number()
        .default(100)
        .describe('Maximum findings (maps to ATC maximumVerdicts).'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      // ── 대상 URI (요청보다 앞이다 — 여기서 실패하면 한 발도 나가지 않는다)
      let targetUri: string;
      if (args.object_uri && args.object_uri.trim().length > 0) {
        targetUri = args.object_uri.trim();
      } else if (args.object_name) {
        targetUri = resolveAtcTargetUri(args.object_name, args.object_type);
      } else {
        throw new AtcArgumentError('Provide object_uri, or object_name + object_type.');
      }

      const maxResults = args.max_results ?? 100;
      const client = await context.getConnection();

      // ① 검사 변형 — 명시 인자가 이기고, 없으면 시스템 기본값.
      const explicit = args.check_variant?.trim();
      const variant = explicit ? explicit : await resolveSystemVariant(client);

      context.logger.info(`ATC: variant=${variant} target=${targetUri} max=${maxResults}`);

      // ② 변형으로 워크리스트를 만든다 → worklistId (평문)
      const worklist = await client.request({
        method: 'POST',
        path: `${ATC_BASE}/worklists`,
        params: { checkVariant: variant },
        accept: 'text/plain',
        timeout: 'csrf',
      });
      const worklistId = worklist.body.trim();

      // ③ 실행. 응답에 결과 워크리스트 id가 실린다.
      const run = await client.request({
        method: 'POST',
        path: `${ATC_BASE}/runs`,
        params: { worklistId },
        body: runRequestBody(maxResults, targetUri),
        accept: 'application/xml',
        contentType: 'application/xml',
        timeout: 'long',
      });
      const runParsed = newParser().parse(run.body) as Record<string, unknown>;
      const runResultRaw = child(child(runParsed, 'worklistRun'), 'worklistId');
      const runResultId =
        runResultRaw === undefined || runResultRaw === null || runResultRaw === ''
          ? worklistId
          : String(runResultRaw);

      // ④ 소견 워크리스트를 읽는다.
      const findings = await client.request({
        method: 'GET',
        path: `${ATC_BASE}/worklists/${encodeURIComponent(runResultId)}`,
        params: { includeExemptedFindings: false },
        accept: 'application/atc.worklist.v1+xml',
        timeout: 'long',
      });
      const parsed = parseAtcWorklist(findings.body);

      context.logger.info(
        `ATC done: ${parsed.total} findings (E:${parsed.errors} W:${parsed.warnings} I:${parsed.infos})`,
      );

      return ok(
        JSON.stringify({
          target: targetUri,
          check_variant: variant,
          ...parsed,
        }),
      );
    } catch (error) {
      context.logger.error(`GetAtcFindings failed: ${String(error)}`);
      // 구는 `McpError`의 `message`를 그대로 실었다 — `Error: ` 접두사가 붙지 않는다.
      return failure(
        error instanceof AtcArgumentError ? invalidParams(error.message) : messageOf(error),
      );
    }
  },
);
