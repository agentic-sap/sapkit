/**
 * ActivateObjects — 여러 오브젝트를 **한 번의 활성화 실행**으로 올린다.
 *
 * 서로를 참조하는 형제들(메인 프로그램 + 교차 참조 인클루드, 함수그룹 일가)은
 * 하나씩 활성화하면 반드시 실패한다 — 각 활성화가 아직 비활성인 형제를 찾지
 * 못하기 때문이다. `/sap/bc/adt/activation/runs`는 전부를 한 컴파일 범위에
 * 넣어 그 고리를 푼다. `/runs`가 없는 구형(NetWeaver)에서는 동기
 * `/sap/bc/adt/activation`으로 떨어진다.
 *
 * **성공 플래그는 증거가 아니다.** 실행 응답의 `activationExecuted` 류 플래그는
 * 실제로 활성화되지 않은 오브젝트에도 붙을 수 있다. 그래서 실행이 끝난 뒤
 * 비활성 목록(`/activation/inactiveobjects`)을 되물어, 우리가 올리려던 것이
 * 아직 거기 있으면 **성공을 실패로 뒤집는다**. 되묻기 자체가 실패했을 때는
 * 결과를 건드리지 않는다 — 불확실한 관측이 확실한 결과를 뒤집어서는 안 된다.
 *
 * 구 구현: `engine/src/lib/localGroupActivation.ts` + 그 핸들러.
 */

import * as z from 'zod';

import { XMLParser } from 'fast-xml-parser';

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  ACCEPT_INACTIVE_OBJECTS,
  CT_ACTIVATION_REQUEST,
  type CheckMessage,
  buildObjectReferences,
  describeFailure,
  encodeObjectName,
  errorResult,
  okResult,
} from './shared';

const DEFAULT_RUN_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1000;

const runParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

/**
 * 이름+타입 → ADT URI. 명시 `uri`가 있으면 그쪽이 이긴다.
 *
 * 매핑에 없는 타입은 **지어내지 않고 실패한다**. 이름 휴리스틱으로 만든 URI는
 * SAP에서 의미 없는 404로만 드러나며, 그때는 무엇이 잘못됐는지 알 수 없다.
 */
export function resolveActivationUri(input: {
  readonly name: string;
  readonly type?: string;
  readonly uri?: string;
  readonly parentName?: string;
}): string {
  if (input.uri && input.uri.trim().length > 0) return input.uri;
  if (!input.name) throw new Error('resolveActivationUri: name is required when uri is not given');

  const lower = encodeObjectName(input.name).toLowerCase();
  const parent = input.parentName ? encodeObjectName(input.parentName).toLowerCase() : undefined;

  switch ((input.type ?? '').toUpperCase()) {
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
      if (!parent) {
        throw new Error(
          `resolveActivationUri: FUGR/FF for ${input.name} requires parent_name (function-group name)`,
        );
      }
      return `/sap/bc/adt/functions/groups/${parent}/fmodules/${lower}`;
    case 'FUGR/I':
      if (!parent) {
        throw new Error(
          `resolveActivationUri: FUGR/I for ${input.name} requires parent_name (function-group name)`,
        );
      }
      return `/sap/bc/adt/functions/groups/${parent}/includes/${lower}`;
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
      throw new Error(
        `resolveActivationUri: no URI mapping for type="${input.type ?? ''}" (object="${input.name}"). ` +
          'Supply an explicit "uri" in the tool input.',
      );
  }
}

interface ResolvedObject {
  readonly name: string;
  readonly type: string;
  readonly uri: string;
}

interface ObjectOutcome {
  name: string;
  type: string;
  uri: string;
  status: 'activated' | 'failed';
  errors: CheckMessage[];
  warnings: CheckMessage[];
}

interface RunOutcome {
  readonly activated: boolean;
  readonly checked: boolean;
  readonly generated: boolean;
  readonly objects: ObjectOutcome[];
  readonly errors: CheckMessage[];
  readonly warnings: CheckMessage[];
}

function textOfNode(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const text = record['#text'] ?? record['txt'];
    if (text !== undefined) return textOfNode(text);
  }
  return '';
}

function asArray(node: unknown): unknown[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

/** 활성화 응답(runs 결과 / sync 응답)을 오브젝트별 판정으로 가른다. */
export function parseActivationResults(
  body: string,
  inputs: readonly ResolvedObject[],
): RunOutcome {
  let document: Record<string, unknown> = {};
  try {
    document = runParser.parse(body ?? '') as Record<string, unknown>;
  } catch {
    document = {};
  }
  const root = ((document['messages'] as Record<string, unknown> | undefined) ??
    document ??
    {}) as Record<string, unknown>;
  const properties = (root['properties'] ?? {}) as Record<string, unknown>;
  const flag = (key: string): boolean => properties[key] === 'true' || properties[key] === true;
  const activated = flag('@_activationExecuted');
  const checked = flag('@_checkExecuted');
  const generated = flag('@_generationExecuted');

  const errors: CheckMessage[] = [];
  const warnings: CheckMessage[] = [];
  const perObjectErrors = new Map<string, CheckMessage[]>();
  const perObjectWarnings = new Map<string, CheckMessage[]>();
  for (const input of inputs) {
    perObjectErrors.set(input.uri, []);
    perObjectWarnings.set(input.uri, []);
  }

  for (const raw of asArray(root['msg'])) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const href = entry['@_href'];
    let line: string | number | undefined =
      typeof entry['@_line'] === 'string' ? (entry['@_line'] as string) : undefined;
    if (typeof href === 'string') {
      const match = href.match(/#start=(\d+),/);
      if (match?.[1]) line = match[1];
    }
    const owner =
      typeof href === 'string'
        ? inputs.find((input) => href.startsWith(input.uri) || href.includes(input.uri))
        : undefined;
    const message: CheckMessage & { objectName?: string; objectUri?: string } = {
      type: textOfNode(entry['@_type']).toUpperCase(),
      text: textOfNode(entry['shortText'] ?? entry['@_shortText']),
      line,
      href: typeof href === 'string' ? href : undefined,
      ...(owner ? { objectName: owner.name, objectUri: owner.uri } : {}),
    };

    if (message.type === 'E' || message.type === 'A' || message.type === 'X') {
      errors.push(message);
      if (owner) perObjectErrors.get(owner.uri)?.push(message);
    } else if (message.type === 'W') {
      warnings.push(message);
      if (owner) perObjectWarnings.get(owner.uri)?.push(message);
    }
  }

  // 실행 여부의 판정에 `generated`를 포함하는 것은 실측 때문이다: 성공한 실행이
  // `generationExecuted="true"`만 달고 `activationExecuted`는 달지 않은 사례가
  // 있다. 생성은 활성화 뒤에 오므로 생성이 됐다면 활성화도 돈 것이다.
  const runExecuted = activated || generated;
  const objects: ObjectOutcome[] = inputs.map((input) => {
    const objectErrors = perObjectErrors.get(input.uri) ?? [];
    return {
      name: input.name,
      type: input.type,
      uri: input.uri,
      status: objectErrors.length === 0 && runExecuted ? 'activated' : 'failed',
      errors: objectErrors,
      warnings: perObjectWarnings.get(input.uri) ?? [],
    };
  });

  return { activated, checked, generated, objects, errors, warnings };
}

/**
 * 활성화 실행이 정말 먹었는지 서버에 되묻는다. 아직 비활성이면 그 오브젝트는
 * 활성화되지 않은 것이다 — 응답이 뭐라고 했든.
 */
async function confirmViaInactiveWorklist(
  client: AdtClient,
  objects: ObjectOutcome[],
): Promise<CheckMessage[]> {
  const found: CheckMessage[] = [];
  try {
    const response = await client.request({
      method: 'GET',
      path: '/sap/bc/adt/activation/inactiveobjects',
      accept: ACCEPT_INACTIVE_OBJECTS,
    });
    const parsed = runParser.parse(response.body ?? '') as Record<string, unknown>;
    const root = parsed['inactiveObjects'] as Record<string, unknown> | undefined;
    const entries = asArray(root?.['entry']);
    const inactive: Array<{ type: string; name: string }> = [];
    for (const raw of entries) {
      const object = (raw as Record<string, unknown> | undefined)?.['object'] as
        | Record<string, unknown>
        | undefined;
      const ref = object?.['ref'] as Record<string, unknown> | undefined;
      if (!ref) continue;
      // 이 파서는 이름공간 접두를 떼므로 `adtcore:type`이 `type`으로 온다.
      // 접두가 남아 오는 응답도 있어 두 자리를 모두 본다.
      inactive.push({
        type: textOfNode(ref['@_adtcore:type'] ?? ref['@_type']),
        name: textOfNode(ref['@_adtcore:name'] ?? ref['@_name']),
      });
    }

    const baseOf = (type: string): string => (type ?? '').split('/')[0]?.toUpperCase() ?? '';
    const keys = new Set(inactive.map((entry) => `${baseOf(entry.type)}|${entry.name.toUpperCase()}`));
    const names = new Set(inactive.map((entry) => entry.name.toUpperCase()));

    for (const object of objects) {
      if (object.status !== 'activated') continue;
      const base = baseOf(object.type);
      // 타입 없이 {name, uri}로 들어온 오브젝트는 base가 비어 매칭이 영원히
      // 빗나간다 — 그 경우에만 이름으로 맞춘다. 되묻기가 조용히 꺼지는 쪽이
      // 위험한 방향이기 때문이다.
      const stillInactive = base
        ? keys.has(`${base}|${object.name.toUpperCase()}`)
        : names.has(object.name.toUpperCase());
      if (!stillInactive) continue;
      const message: CheckMessage = {
        type: 'E',
        text: `Object ${object.name} is still inactive after the activation run (re-queried via the inactive-object worklist) — activation did not take, despite the run response.`,
      };
      object.status = 'failed';
      object.errors.push(message);
      found.push(message);
    }
  } catch {
    // 최선 노력. 되묻기 실패가 실제 결과를 뒤집어서는 안 된다.
  }
  return found;
}

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function waitForRun(client: AdtClient, runId: string, maxWaitMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const response = await client.request({
      method: 'GET',
      path: `/sap/bc/adt/activation/runs/${runId}`,
      params: { withLongPolling: 'true' },
      accept: 'application/xml, application/vnd.sap.adt.backgroundrun.v1+xml',
    });
    const parsed = runParser.parse(response.body ?? '') as Record<string, unknown>;
    const run = parsed['run'] as Record<string, unknown> | undefined;
    if (!run) throw new Error('Invalid activation run response — missing <run> element');
    const status = textOfNode(run['@_status']);
    if (status === 'finished') return;
    if (status === 'error' || status === 'failed') {
      throw new Error(`Activation run ${runId} terminated with status ${status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Activation run ${runId} did not finish within ${maxWaitMs}ms`);
}

function extractRunId(location: string | undefined): string | null {
  if (!location) return null;
  const match = location.match(/\/activation\/runs\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export const activateObjects = defineTool(
  {
    name: 'ActivateObjects',
    description:
      "[high-level] Activate a set of ABAP objects in a single call. Uses the ADT mass-activation endpoint (/sap/bc/adt/activation/runs) so cyclic references between siblings (e.g. main program + multiple cross-referencing includes) resolve in one compilation scope. Returns per-object status, errors, warnings. Falls back to /sap/bc/adt/activation on legacy systems. FUGR recipe: activating function modules alone fails with 'FUNCTION ... cannot be used outside a FUNCTION-POOL' — pass the whole family in ONE run: the function group (type FUGR), its TOP include (FUGR/I with parent_name), every function module (FUGR/FF with parent_name), and the SAPL<group> main program (PROG/P) when present. Do NOT include the system include L<group>UXX. Never mix unrelated objects into the same activation run — activate only the object family being worked. The returned success/activated flags mirror the activation-run response and are NOT proof of activation on their own — confirm by re-querying GetInactiveObjects (your objects absent from the list = actually activated).",
    inputSchema: {
      objects: z
        .array(
          z.object({
            name: z.string().describe('Object name (will be uppercased).'),
            type: z
              .string()
              .describe(
                "ADT object type code, e.g. 'PROG/P' (program), 'PROG/I' (include), 'CLAS/OC' (class), 'FUGR/FF' (function module).",
              )
              .optional(),
            uri: z
              .string()
              .describe(
                'Explicit ADT URI. When provided, overrides name-based URI resolution.',
              )
              .optional(),
            parent_name: z
              .string()
              .describe(
                'Parent name — required for FUGR/FF (function group) and FUGR/I (function-group include).',
              )
              .optional(),
          }),
        )
        .describe(
          'Objects to activate in one batch. Supply either explicit uri, or name+type (and parent_name for FUGR/FF, FUGR/I).',
        ),
      preaudit: z.boolean().describe('Request pre-audit before activation. Default true.').optional(),
      run_timeout_ms: z
        .number()
        .describe(
          'Max time to wait for the activation run to finish (runs endpoint only). Default 120000.',
        )
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
    // `uri`는 선언하지 않는다 — URI는 이름 해석을 덮으므로 네임스페이스 검사를
    // 우회하는 통로다. 녹화 시나리오는 name+type으로 준다(harness/scenarios).
    targetNames: [{ arg: 'objects', element: 'name' }],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;
    try {
      const requested = args.objects;
      if (!Array.isArray(requested) || requested.length === 0) {
        return errorResult('Missing required parameter: objects (must be a non-empty array)');
      }
      for (const object of requested) {
        if (!object?.name && !object?.uri) {
          return errorResult('Each object must carry at least "name" (or "uri")');
        }
      }

      const resolved: ResolvedObject[] = requested.map((object) => ({
        name: String(object.name).toUpperCase(),
        type: object.type ?? '',
        uri: resolveActivationUri({
          name: object.name,
          type: object.type,
          uri: object.uri,
          parentName: object.parent_name,
        }),
      }));

      const client = await context.getConnection();
      const preauditRequested = args.preaudit !== false;
      const runTimeoutMs = args.run_timeout_ms ?? DEFAULT_RUN_TIMEOUT_MS;
      const body = buildObjectReferences(resolved);
      logger.info(`ActivateObjects: ${resolved.length} object(s) → /sap/bc/adt/activation/runs`);

      let endpoint: 'runs' | 'sync' = 'runs';
      let runId: string | undefined;
      let responseBody: string | undefined;

      try {
        const start = await client.request({
          method: 'POST',
          path: '/sap/bc/adt/activation/runs',
          params: { method: 'activate', preauditRequested: String(preauditRequested) },
          body,
          contentType: 'application/xml',
          accept: 'application/xml',
          timeout: 'long',
        });
        const location =
          start.headers['location'] ??
          start.headers['content-location'] ??
          start.headers['Location'];
        const found = extractRunId(location);
        if (found) {
          runId = found;
          await waitForRun(client, found, runTimeoutMs);
          const results = await client.request({
            method: 'GET',
            path: `/sap/bc/adt/activation/results/${found}`,
            accept: 'application/xml',
          });
          responseBody = results.body;
        }
        // Location이 없으면 이 시스템에 실행 기반 활성화가 없다고 보고 폴백한다.
      } catch (error) {
        // "엔드포인트가 없다"만 폴백 신호다. 권한·타임아웃까지 삼키면 진짜
        // 원인이 사라진 채 다른 경로로 한 번 더 쓰기를 시도하게 된다.
        const status = error instanceof AdtError ? error.status : undefined;
        if (status !== 404 && status !== 501) throw error;
      }

      if (responseBody === undefined) {
        endpoint = 'sync';
        runId = undefined;
        const sync = await client.request({
          method: 'POST',
          path: '/sap/bc/adt/activation',
          params: { method: 'activate', preauditRequested: String(preauditRequested) },
          body,
          contentType: CT_ACTIVATION_REQUEST,
          accept: 'application/xml',
          timeout: 'long',
        });
        responseBody = sync.body;
      }

      const parsed = parseActivationResults(responseBody, resolved);
      const oracleErrors = await confirmViaInactiveWorklist(client, parsed.objects);
      const errors = [...parsed.errors, ...oracleErrors];
      const failed = parsed.objects.filter((object) => object.status === 'failed').length;
      const success = (parsed.activated || parsed.generated) && errors.length === 0;

      return okResult({
        success,
        endpoint,
        run_id: runId,
        activated: parsed.activated,
        checked: parsed.checked,
        generated: parsed.generated,
        objects_count: parsed.objects.length,
        failed_count: failed,
        objects: parsed.objects,
        errors,
        warnings: parsed.warnings,
        message: success
          ? `Activated ${parsed.objects.length} object(s) via ${endpoint} endpoint`
          : `Activation finished with ${errors.length} error(s) across ${failed} object(s)`,
      });
    } catch (error) {
      const message = describeFailure(error);
      logger.error(`ActivateObjects failed: ${message}`);
      return errorResult(`ActivateObjects failed: ${message}`);
    }
  },
);
