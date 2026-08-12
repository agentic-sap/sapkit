/**
 * `GetTable`·`GetStructure`의 공통 몸통 — **두 경로 전부**.
 *
 * 두 도구는 갈림도, 응답 조립도, 오류 문구의 짜임도 같다. 다른 것은 낱말
 * 넷뿐이라(인자 이름·데이터 필드 이름·ADT 경로 조각·문구의 명사) 여기 한 벌로
 * 두고 도구 모듈이 그 넷을 준다.
 *
 * ## 갈림 — 기본은 ADT 직통이고 ECC만 우회한다
 *
 * 구 엔진의 갈림은 `process.env.SAP_VERSION?.toUpperCase() === 'ECC'` 하나다
 * (`engine/src/handlers/table/high/handleGetTable.ts:69` ·
 * `engine/src/handlers/structure/high/handleGetStructure.ts:60`). ECC 커널에는
 * `/sap/bc/adt/ddic/tables` 엔드포인트가 아예 없어서(BASIS < 7.50) 표준 ADT
 * 경로가 닿지 않고, 그때만 OData 브리지로 돌아간다. **trim은 하지 않는다** —
 * 구가 하지 않으므로 여기서도 하지 않는다.
 *
 * 우회로가 부르는 것은 `ZMCP_ADT_DISPATCH`가 **아니다**. FunctionImport
 * `DdicTablRead` → 함수모듈 `ZMCP_ADT_DDIC_TABL_READ`이고, 투명 테이블과 구조를
 * **같은 FM 하나**가 TABCLASS로 갈라 처리한다.
 *
 * ## 왜 여기서 공용 소스 읽기 도우미를 만들지 않는가
 *
 * 다른 도구 묶음도 같은 종류의 `…/source/main` 읽기를 필요로 하지만, 그 묶음들이
 * 지금 병렬로 지어지고 있어 소유자가 정해지지 않았다. 여기서는 이 두 도구가
 * 쓰는 만큼만 쓰고, 통합은 뒤로 미룬다.
 */

import { STATUS_CODES } from 'node:http';

import { AdtError } from '../../adt';
import type { ConnectionConfig } from '../../contracts';
import { createDdicReadChannel, mergeRfcEnv } from '../../rfc';
import type { DdicReadChannel } from '../../rfc';
import type { ToolContext, ToolResult } from '../../server/toolDefinition';

/** 두 도구가 갈리는 낱말 전부. */
export interface DdicObjectKind {
  /** 발행된 도구 이름. 로그 문구에만 쓴다. */
  readonly toolName: string;
  /** 인자 이름이자 응답 필드 이름 — `table_name` | `structure_name`. */
  readonly nameField: string;
  /** 응답의 데이터 필드 — `table_data` | `structure_data`. */
  readonly dataField: string;
  /** ADT 경로 조각 — `tables` | `structures`. */
  readonly adtSegment: string;
  /** 오류 문구의 소문자 명사 — `table` | `structure`. */
  readonly noun: string;
  /** 오류 문구의 대문자 명사 — `Table` | `Structure`. */
  readonly label: string;
}

export interface DdicReadArgs {
  readonly name: string;
  readonly version: 'active' | 'inactive';
}

/**
 * ECC 브리지 통로는 컨텍스트 하나당 하나만 만든다.
 *
 * 구 엔진은 CSRF 세션을 **모듈 전역**에 캐시해 프로세스당 한 번만 `$metadata`를
 * 친다(`engine/src/lib/odataRfc.ts`의 `cachedSession`). 호출마다 통로를 새로
 * 세우면 호출마다 악수가 한 번씩 더 붙는다. 컨텍스트는 서버 하나당 하나이므로
 * 이 WeakMap이 구의 전역 캐시와 같은 수명을 준다 — 전역 상태는 만들지 않으면서.
 */
const bridges = new WeakMap<ToolContext, DdicReadChannel>();

/** 구 게이트와 같은 판정 — 대문자화만 하고 trim 하지 않는다. */
function isEcc(sapVersion: string | null): boolean {
  return sapVersion?.toUpperCase() === 'ECC';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ok(payload: Record<string, unknown>): ToolResult {
  return { isError: false, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * ECC 우회로가 쓸 접속 설정.
 *
 * 무프로파일 기동에서는 `getConnection()`이 **정본 오류**(`ERR_NO_CONNECTION`)로
 * 던진다. 그 문구는 서버 코어가 소유하므로 여기서 다시 지어내지 않는다 — 뒤의
 * throw는 그 계약이 깨졌을 때를 위한 방어이고, 조용히 성공하지 않기 위한 것이다.
 */
async function requireConnection(context: ToolContext): Promise<ConnectionConfig> {
  const connection = context.profile.connection;
  if (connection) return connection;
  await context.getConnection();
  throw new Error('ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured.');
}

function bridgeFor(context: ToolContext, connection: ConnectionConfig): DdicReadChannel {
  const cached = bridges.get(context);
  if (cached) return cached;
  // 통로 선택·필수 env 확인은 여기서 끝난다. 실패하면 캐시하지 않는다.
  const channel = createDdicReadChannel({
    connection,
    env: mergeRfcEnv({}, context.env),
  });
  bridges.set(context, channel);
  return channel;
}

async function readViaBridge(
  kind: DdicObjectKind,
  context: ToolContext,
  name: string,
  version: 'active' | 'inactive',
): Promise<ToolResult> {
  const connection = await requireConnection(context);
  context.logger.info(`[ECC bridge] ${kind.toolName} ${name}, version: ${version}`);

  const bridge = bridgeFor(context, connection);
  const result = await bridge.callDdicTablRead({
    name,
    version: version === 'inactive' ? 'I' : 'A',
  });

  // subrc 4는 통로가 던지지 않고 여기까지 온다(문턱은 8) — 그 판정이 이 문구다.
  // 구 엔진이 조립해 도구 응답에 실어 보내던 계약성 문자열이므로 글자 그대로다.
  if (result.subrc !== 0) {
    return fail(`ZMCP_ADT_DDIC_TABL_READ subrc=${result.subrc}: ${result.message}`);
  }

  return ok({
    success: true,
    [kind.nameField]: name,
    version,
    [kind.dataField]: JSON.stringify(result.result),
    status: 200,
    status_text: 'OK',
    path: 'ecc-odata-rfc',
  });
}

/**
 * ADT 실패를 구와 같은 문구로 접는다.
 *
 * 404가 "`Failed to read …: … not found`"가 되는 것은 구의 두 층을 합친
 * 결과다: 접속 클라이언트가 404를 삼켜 빈 결과를 돌려주고
 * (`@babamba2/mcp-abap-adt-clients` `AdtTable.read` — `readResult: undefined`),
 * 핸들러가 그 빈 결과를 보고 `Table X not found`로 던지면 안쪽 catch가
 * `Failed to read table: ` 접두사를 붙인다. 구 핸들러에 적힌 마침표 있는
 * `Table X not found.` 갈래는 그래서 read 경로에서는 도달하지 않는다.
 */
function adtFailureMessage(kind: DdicObjectKind, name: string, error: unknown): string {
  const status = error instanceof AdtError ? error.status : undefined;
  if (status === 404) return `Failed to read ${kind.noun}: ${kind.label} ${name} not found`;
  if (status === 423) return `${kind.label} ${name} is locked by another user.`;
  return `Failed to read ${kind.noun}: ${messageOf(error)}`;
}

async function readViaAdt(
  kind: DdicObjectKind,
  context: ToolContext,
  name: string,
  version: 'active' | 'inactive',
): Promise<ToolResult> {
  // 접속 획득은 안쪽 try 밖이다 — 구도 그렇고, 접속 실패에 "읽기 실패" 접두사를
  // 붙이면 원인이 바뀐다.
  const client = await context.getConnection();
  context.logger.info(`Reading ${kind.noun} ${name}, version: ${version}`);

  try {
    const response = await client.request({
      method: 'GET',
      path: `/sap/bc/adt/ddic/${kind.adtSegment}/${encodeURIComponent(name)}/source/main`,
      params: { version },
      accept: 'text/plain',
    });

    return ok({
      success: true,
      [kind.nameField]: name,
      version,
      [kind.dataField]: response.body,
      status: response.status,
      // 접속 계층은 상태 문구를 올려 주지 않는다. 표준 사유 구절로 되세운다.
      status_text: STATUS_CODES[response.status] ?? '',
    });
  } catch (error) {
    context.logger.error(`Error reading ${kind.noun} ${name}: ${messageOf(error)}`);
    return fail(adtFailureMessage(kind, name, error));
  }
}

/** 두 도구의 몸통. 어떤 실패도 밖으로 던지지 않는다 — 구와 같은 계약이다. */
export async function readDdicObject(
  kind: DdicObjectKind,
  context: ToolContext,
  args: Partial<DdicReadArgs>,
): Promise<ToolResult> {
  try {
    const raw = args.name ?? '';
    if (!raw) return fail(`${kind.nameField} is required`);

    const name = raw.toUpperCase();
    const version = args.version === 'inactive' ? 'inactive' : 'active';

    return isEcc(context.profile.sapVersion)
      ? await readViaBridge(kind, context, name, version)
      : await readViaAdt(kind, context, name, version);
  } catch (error) {
    return fail(messageOf(error));
  }
}
