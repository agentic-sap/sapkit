/**
 * 서비스 바인딩(SRVB) 쓰기의 ADT 조각 — `CreateServiceBinding`·`UpdateServiceBinding`이
 * 함께 쓴다.
 *
 * ## 와이어 근거 (파일·줄)
 *
 * 구 핸들러 `engine/src/handlers/service_binding/high/handleCreateServiceBinding.ts:92-187`
 * · `.../handleUpdateServiceBinding.ts:67-123`
 * → 벤더 `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js`의
 *   `create()`(:190-266) · `updateServiceBinding()`(:535-580) ·
 *   `createServiceBinding`(:479-518) · `checkServiceBinding`(:594-612) ·
 *   `activateServiceBinding`(:613-635) · `generateServiceBinding`(:636-666) ·
 *   `transportCheckServiceBinding`(:463-478) · `publishByServiceType`(:122-136) ·
 *   `unpublishByServiceType`(:137-151) · `parseServiceBindingState`(:85-110) ·
 *   `extractAvailableBindingTypes`(:64-84)
 * → 시스템 정보는 `.../utils/systemInfo.js:16-60`.
 *
 * ## 활성(activate)과 발행(publish)은 **다른 개념이고 도구도 다르다** (실측)
 *
 * 이 계열에서 둘은 서로 다른 엔드포인트이며 한 도구가 둘 다 하지 않는다.
 *
 * | | 활성화 | 발행/발행취소 |
 * |---|---|---|
 * | 도구 | `CreateServiceBinding`(생성 사슬 안) | `UpdateServiceBinding` |
 * | 주소 | `POST /sap/bc/adt/activation?method=activate&preauditRequested=true` | `POST /sap/bc/adt/businessservices/{odatav2\|odatav4}/{publish\|unpublish}jobs` |
 * | 타임아웃 | 기본 | **long** |
 * | 전제 | 없음 | 활성 판을 먼저 읽어 `allowedAction`을 본다 |
 *
 * **`UpdateServiceBinding`은 활성화를 하지 않는다.** 이름이 `Update*`지만 소스를
 * 갈아 끼우지도, 활성화하지도 않고 **발행 상태만** 바꾼다(구 도구 설명도
 * "Update publication state for ABAP service binding"이라고 적는다). 다른 계열의
 * `Update*`와 같은 모양일 것이라고 넘겨짚으면 안 되는 자리다.
 *
 * ## 잠금이 없다 — 벤더가 **막아 둔다**
 *
 * `AdtService.js:425-432`의 `lock()`/`unlock()`은 곧바로
 * `«Lock is not supported for service bindings via ADT API»`를 던진다. 그래서 이
 * 계열의 두 쓰기 도구는 잠금 창 자체를 갖지 않는다.
 *
 * ## 이름 인코딩은 SRVD와 같은 규칙이다
 *
 * `encodeURIComponent(name.toLowerCase())`(`AdtService.js:23-25`). 읽기 쪽과 같은
 * 함수를 쓰므로 `../read/internal/serviceBindingRead`의 것을 그대로 가져다 쓴다 —
 * 메타데이터 확장(DDLX)의 「인코딩 없음」과 갈리는 자리다.
 *
 * ## XML 조립을 공용 `buildObjectReferences`로 하지 않는다
 *
 * 발행·발행취소·활성화의 본문은 벤더가 **한 줄로** 짓는다(`:124`·`:624`). 공용
 * 조립기는 줄바꿈과 들여쓰기를 넣으므로 여기서는 쓰지 않고 직접 짓는다.
 */

import { XMLParser } from 'fast-xml-parser';

import { AdtError } from '../../../adt';
import type { AdtClient } from '../../../adt';
import { serviceBindingUri } from '../../read/internal/serviceBindingRead';

/**
 * 구 `return_error(error)`가 ADT 실패에서 문구를 뽑던 순서
 * (`engine/src/lib/utils.ts:317-333`): 예외 XML이면 `SAP Error: … [HTTP n]`,
 * 그냥 본문이면 원문(2000자 상한), 응답 본문이 없으면 오류 메시지.
 *
 * `./metadataExtension.ts`에 같은 함수가 있다. 구에서 이것은 **여러 계열이 함께
 * 쓰던 한 함수**이므로 언젠가 `../shared.ts`로 올라가야 하지만, 이 판에서는 여러
 * 묶음이 그 파일을 동시에 건드리므로 각 묶음 안에 둔다.
 */
export function returnErrorText(error: unknown): string {
  if (error instanceof AdtError) {
    if (error.adtMessage && error.adtMessage.trim().length > 0) {
      const head = `SAP Error: ${error.adtMessage.trim()}`;
      return error.status ? `${head} [HTTP ${error.status}]` : head;
    }
    const raw = error.rawBody;
    if (raw && raw.length > 0) return raw.slice(0, 2000);
  }
  return error instanceof Error ? error.message : String(error);
}

/** `ACCEPT_VALIDATION` — `constants/contentTypes.js:34`. 발행 작업의 Accept다. */
export const ACCEPT_VALIDATION = 'application/vnd.sap.as+xml';

/**
 * 이송 검사의 Accept와 Content-Type — `constants/contentTypes.js:38-39`.
 * **세미콜론 뒤 공백이 서로 다르다.** 벤더가 그렇게 적어 두었고 접으면 안 된다.
 */
export const ACCEPT_TRANSPORT_CHECK =
  'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.transport.service.checkData';
export const CT_TRANSPORT_CHECK =
  'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData';

/** 생성 POST의 Content-Type — `AdtService.js:513`. Accept는 읽기와 같은 v1+v2 협상값이다. */
export const CT_SERVICE_BINDING_V2 =
  'application/vnd.sap.adt.businessservices.servicebinding.v2+xml';

/** 생성 뒤 조회의 Accept — `AdtService.js:665`. 종류마다 다르다. */
export const ACCEPT_ODATA_V2 =
  'application/vnd.sap.adt.businessservices.odatav2.v2+xml, application/vnd.sap.adt.businessservices.odatav2.v3+xml';
export const ACCEPT_ODATA_V4 =
  'application/vnd.sap.adt.businessservices.odatav4.v1+xml, application/vnd.sap.adt.businessservices.odatav4.v2+xml';

/** 시스템 정보 — `utils/systemInfo.js:18-21`. */
export const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
export const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';

export type ServiceBindingServiceType = 'odatav2' | 'odatav4';

/** 벤더가 한 줄로 짓는 오브젝트 참조 본문(`AdtService.js:124`·`:624`). */
export function bindingObjectReferences(name: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">` +
    `<adtcore:objectReference adtcore:uri="${serviceBindingUri(name)}" ` +
    `adtcore:name="${name.toUpperCase()}"/>` +
    `</adtcore:objectReferences>`
  );
}

// ── 상태 읽기 ───────────────────────────────────────────────────────────────

/**
 * 상태 파서 — **속성 접두사가 `@_`다.**
 *
 * 같은 클래스 안의 `parseServiceBindingPayload`가 접두사 없이 파싱하는 것과
 * 다르다(`AdtService.js:16-19` vs 구 `serviceBindingPayloadUtils.ts:46-49`).
 * 한 계열 안에서 파서가 둘로 갈리는 자리이므로 합치지 않는다.
 */
const stateParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export interface ServiceBindingState {
  readonly published: boolean;
  readonly allowedAction?: string;
  /**
   * 발행 통로 — `binding@type`이 `ODATA`일 때만 정해진다(`V4`면 `odatav4`, 아니면
   * `odatav2`). `DeleteServiceBinding`의 발행취소 사전 걸음이 읽는다.
   */
  readonly serviceType?: ServiceBindingServiceType;
  /** `srvb:services@name`. */
  readonly serviceName?: string;
  /** `srvb:services > srvb:content@version`. */
  readonly serviceVersion?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function stringOrUndefined(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
}

/**
 * 벤더 `parseServiceBindingState`(`:85-110`) 그대로.
 *
 * `published`·`allowedAction` 둘만 쓰던 자리에 `serviceType`·`serviceName`·
 * `serviceVersion` 셋을 **더했다**(값을 덜어내지 않았으므로 기존 호출자에는 영향이
 * 없다). 셋을 읽는 것은 `DeleteServiceBinding` 하나뿐이며, 벤더의 `delete()`가
 * 발행취소 사전 걸음에 그 값을 넘긴다.
 */
export function parseServiceBindingState(body: string): ServiceBindingState {
  if (!body) return { published: false };

  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(stateParser.parse(body));
  } catch {
    // 벤더는 여기서 던진다 — 파싱 실패는 삼키지 않는다.
    throw new Error('Failed to parse service binding state');
  }
  const root = asRecord(parsed['srvb:serviceBinding'] ?? parsed['serviceBinding']);
  const publishedRaw = root['@_srvb:published'] ?? root['@_published'];
  const allowedActionRaw = root['@_srvb:allowedAction'] ?? root['@_allowedAction'];

  const binding = asRecord(root['srvb:binding'] ?? root['binding']);
  const services = asRecord(root['srvb:services'] ?? root['services']);
  const content = asRecord(services['srvb:content'] ?? services['content']);
  const bindingType = String(binding['@_srvb:type'] ?? binding['@_type'] ?? '').toUpperCase();
  const bindingVersion = String(binding['@_srvb:version'] ?? binding['@_version'] ?? '').toUpperCase();

  return {
    published: String(publishedRaw).toLowerCase() === 'true',
    allowedAction: allowedActionRaw ? String(allowedActionRaw) : undefined,
    // 벤더는 `ODATA`가 아니면 통로를 정하지 않는다 — 여기서 짐작하지 않는다.
    serviceType:
      bindingType === 'ODATA' ? (bindingVersion === 'V4' ? 'odatav4' : 'odatav2') : undefined,
    serviceName: stringOrUndefined(services['@_srvb:name'] ?? services['@_name']),
    serviceVersion: stringOrUndefined(content['@_srvb:version'] ?? content['@_version']),
  };
}

// ── 발행 / 발행취소 ─────────────────────────────────────────────────────────

/**
 * `POST /sap/bc/adt/businessservices/{종류}/{publish|unpublish}jobs` —
 * **타임아웃이 `long`이다**(`AdtService.js:128`·`:143`). 발행은 백그라운드 작업을
 * 세우므로 기본 타임아웃으로는 끊긴다.
 */
export function publicationJob(
  client: AdtClient,
  action: 'publish' | 'unpublish',
  serviceType: ServiceBindingServiceType,
  bindingName: string,
  serviceName: string,
  serviceVersion?: string,
): ReturnType<AdtClient['request']> {
  return client.request({
    method: 'POST',
    path: `/sap/bc/adt/businessservices/${serviceType}/${action}jobs`,
    params: { servicename: serviceName, serviceversion: serviceVersion },
    body: bindingObjectReferences(bindingName),
    contentType: 'application/xml',
    accept: ACCEPT_VALIDATION,
    timeout: 'long',
  });
}

// ── 생성 사슬의 조각 ────────────────────────────────────────────────────────

/** 종류 목록에서 `이름:설명:데이터` 집합을 뽑는다 — 벤더 `:64-84`. */
export function extractAvailableBindingTypes(body: string): Set<string> {
  const available = new Set<string>();
  if (!body) return available;

  const parsed = asRecord(stateParser.parse(body));
  const namedItemList = asRecord(parsed['nameditem:namedItemList']);
  const list = namedItemList['nameditem:namedItem'];
  const items = Array.isArray(list) ? list : list ? [list] : [];
  for (const raw of items) {
    const item = asRecord(raw);
    const name = String(item['nameditem:name'] ?? '').toUpperCase();
    const description = String(item['nameditem:description'] ?? '');
    const data = String(item['nameditem:data'] ?? '').toUpperCase();
    if (!name || !data) continue;
    available.add(`${name}:${description}:${data}`);
  }
  return available;
}

/** 벤더 `getBindingTypeAvailabilityKey`(`:111-121`) 그대로. */
export function bindingTypeAvailabilityKey(bindingType: string, bindingVersion: string): string {
  const name = bindingType.toUpperCase();
  const version = bindingVersion.toUpperCase();
  if (name === 'ODATA' && version === 'V4') return 'ODATA:1:ODATA V4';
  if (name === 'ODATA' && version === 'V2') return 'ODATA:1:ODATA V2';
  return `${name}:1:${name}`;
}

/** 이송 검사 본문 — 벤더 `buildTransportCheckXml`(`:56-59`). */
export function buildTransportCheckXml(args: {
  readonly objectName: string;
  readonly packageName: string;
  readonly description?: string;
  readonly operation?: string;
}): string {
  const description = (args.description ?? '').replace(/"/g, '&quot;');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>` +
    `<PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT>` +
    `<OBJECTNAME>${args.objectName.toUpperCase()}</OBJECTNAME>` +
    `<OPERATION>${args.operation ?? 'I'}</OPERATION>` +
    `<DEVCLASS>${args.packageName.toUpperCase()}</DEVCLASS>` +
    `<CTEXT>${description}</CTEXT>` +
    `</DATA></asx:values></asx:abap>`
  );
}

/** 생성 페이로드 — 벤더 `buildServiceBindingCreateXml`(`:26-54`). */
export function buildServiceBindingCreateXml(args: {
  readonly bindingName: string;
  readonly packageName: string;
  readonly description: string;
  readonly serviceDefinitionName: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly bindingType: string;
  readonly bindingVersion: string;
  readonly masterLanguage: string;
  readonly masterSystem?: string;
  readonly responsible?: string;
}): string {
  // 벤더는 설명의 큰따옴표만 바꾼다 — 다른 XML 특수문자는 손대지 않는다(`:31`).
  const escapedDescription = args.description.replace(/"/g, '&quot;');
  const masterSystemAttr = args.masterSystem
    ? ` adtcore:masterSystem="${args.masterSystem}"`
    : '';
  const responsibleAttr = args.responsible
    ? ` adtcore:responsible="${args.responsible}"`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?><srvb:serviceBinding ` +
    `xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" ` +
    `xmlns:adtcore="http://www.sap.com/adt/core" ` +
    `adtcore:description="${escapedDescription}" ` +
    `adtcore:language="${args.masterLanguage}" ` +
    `adtcore:name="${args.bindingName.toUpperCase()}" ` +
    `adtcore:type="SRVB/SVB" ` +
    `adtcore:masterLanguage="${args.masterLanguage}"${masterSystemAttr}${responsibleAttr}>\n` +
    `  <adtcore:packageRef adtcore:name="${args.packageName.toUpperCase()}"/>\n` +
    `  <srvb:services srvb:name="${args.serviceName.toUpperCase()}">\n` +
    `    <srvb:content srvb:version="${args.serviceVersion}">\n` +
    `      <srvb:serviceDefinition adtcore:name="${args.serviceDefinitionName.toUpperCase()}"/>\n` +
    `    </srvb:content>\n` +
    `  </srvb:services>\n` +
    `  <srvb:binding srvb:category="1" srvb:type="${args.bindingType}" srvb:version="${args.bindingVersion}">\n` +
    `    <srvb:implementation adtcore:name=""/>\n` +
    `  </srvb:binding>\n` +
    `</srvb:serviceBinding>`
  );
}

export interface SystemInformation {
  readonly language?: string;
  readonly systemID?: string;
  readonly userName?: string;
}

/**
 * 벤더 `getSystemInformation`(`utils/systemInfo.js:16-60`).
 *
 * **Eclipse처럼 캐시 무력화 인자 `_=<현재시각>`을 붙인다**(`:22-25`) — 나가는
 * 주소가 호출마다 달라지는 유일한 자리다. 재생 대조에서는 비결정 토큰으로 다뤄야
 * 한다. 실패는 전부 삼키고 `null`을 돌려준다(조회 실패가 생성 실패가 되지 않는다).
 *
 * 이 계열은 **env가 아니라 이 응답**에서 마스터 언어·시스템·담당자를 얻는다
 * (`AdtService.js:499-504`) — 서비스 정의·DDLX 생성이 env를 읽는 것과 갈린다.
 */
export async function fetchSystemInformation(
  client: AdtClient,
  now: () => number = Date.now,
): Promise<SystemInformation | null> {
  try {
    const response = await client.request({
      method: 'GET',
      path: SYSTEMINFO_PATH,
      params: { _: now() },
      accept: SYSTEMINFO_ACCEPT,
      timeout: 'default',
    });
    const parsed = JSON.parse(response.body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      language: typeof parsed.language === 'string' ? parsed.language : undefined,
      systemID: typeof parsed.systemID === 'string' ? parsed.systemID : undefined,
      userName: typeof parsed.userName === 'string' ? parsed.userName : undefined,
    };
  } catch {
    return null;
  }
}
