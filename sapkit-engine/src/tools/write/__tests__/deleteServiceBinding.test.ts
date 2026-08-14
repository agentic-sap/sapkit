/**
 * `DeleteServiceBinding` — 발행 계약 · 발행취소 사전 걸음 · **검사 걸음이 없는**
 * 한 줄 전문 · D115(거짓 성공 판정) · tier 게이트 음성시험.
 *
 * 기대값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteServiceBinding`
 *  - 겉 핸들러: `engine/src/handlers/service_binding/high/handleDeleteServiceBinding.ts:17-86`
 *  - 사슬: `.../dist/core/service/AdtService.js`의 `delete()`(:343-384) ·
 *    `updateServiceBinding()`(:542-584) · `unpublishByServiceType()`(:137-151) ·
 *    `deleteServiceBinding()`(:585-599) · `buildDeletionXml()`(:59-63)
 */

import * as http from 'node:http';

import { deleteServiceBinding } from '../deleteServiceBinding';
import {
  CHECK_PATH,
  DELETE_PATH,
  describeTierGate,
  exposureMemberships,
  notDeletedBody,
} from './deletionSupport';
import { type WriteHarness, jsonOf, startWriteHarness, textOf, xml } from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';

const NAME = 'ZSAPKIT_SRVB';
const BINDING_URI = `/sap/bc/adt/businessservices/bindings/${NAME.toLowerCase()}`;
const UNPUBLISH = '/sap/bc/adt/businessservices/odatav4/unpublishjobs';

/** 발행 중인 바인딩(ODATA V4). */
function publishedBinding(allowedAction = 'UNPUBLISH'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" srvb:published="true" srvb:allowedAction="${allowedAction}">` +
    '<srvb:binding srvb:type="ODATA" srvb:version="V4">' +
    '<srvb:implementation/></srvb:binding>' +
    `<srvb:services srvb:name="${NAME}"><srvb:content srvb:version="0001"/></srvb:services>` +
    '</srvb:serviceBinding>'
  );
}

/** 발행 중이 아닌 바인딩. */
const UNPUBLISHED_BINDING =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" srvb:published="false" srvb:allowedAction="PUBLISH">' +
  '<srvb:binding srvb:type="ODATA" srvb:version="V4"/></srvb:serviceBinding>';

const DELETED = '<?xml version="1.0" encoding="UTF-8"?><del:deletionResult xmlns:del="http://www.sap.com/adt/deletion"><del:object del:isDeleted="true"/></del:deletionResult>';

interface Overrides {
  readonly read?: string;
  readonly readStatus?: number;
  readonly deleteBody?: string;
  readonly deleteStatus?: number;
  readonly unpublishStatus?: number;
}

function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response: http.ServerResponse) => {
    if (request.path === BINDING_URI && request.method === 'GET') {
      return xml(response, overrides.read ?? UNPUBLISHED_BINDING, overrides.readStatus ?? 200);
    }
    if (request.path === UNPUBLISH) {
      return xml(response, '<job/>', overrides.unpublishStatus ?? 200);
    }
    if (request.path === DELETE_PATH) {
      return xml(response, overrides.deleteBody ?? DELETED, overrides.deleteStatus ?? 200);
    }
    return xml(response, '<unexpected/>', 500);
  });
}

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

const run = (args: Record<string, unknown>) =>
  Promise.resolve(deleteServiceBinding.handler(harness.context, args));

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    expect(await publishedSurfaceOf(deleteServiceBinding)).toEqual(
      publishedDeclaration('DeleteServiceBinding'),
    );
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteServiceBinding.definition.sets).toEqual(['high']);
    expect(deleteServiceBinding.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(deleteServiceBinding.definition.kind).toBe('mutation');
    expect(deleteServiceBinding.definition.targetNames).toEqual(['service_binding_name']);
  });

  it('채록본의 노출 조건 소속과 어긋나지 않는다', () => {
    expect(exposureMemberships('DeleteServiceBinding')).toEqual([
      'connected_default',
      'noProfile_default',
    ]);
  });
});

describe('와이어 — **검사 걸음이 없다**', () => {
  it('발행 중이 아니면 읽기 한 번 + 삭제 한 번이다', async () => {
    harness = await harnessFor();
    const result = await run({ service_binding_name: `  ${NAME.toLowerCase()}  ` });
    expect(result.isError).toBe(false);

    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${BINDING_URI}`,
      `POST ${DELETE_PATH}`,
    ]);
    // 다른 12종과 갈리는 자리 — 검사 주소를 치지 않는다.
    expect(harness.calls().map((call) => call.path)).not.toContain(CHECK_PATH);
  });

  it('이름은 **trim 뒤 대문자**이고 URI는 소문자다', async () => {
    harness = await harnessFor();
    const payload = jsonOf(await run({ service_binding_name: `  ${NAME.toLowerCase()}  ` }));
    expect(payload.service_binding_name).toBe(NAME);
    expect(harness.nth(0).query.get('version')).toBe('active');
    expect(harness.nth(1).body).toContain(`adtcore:uri="${BINDING_URI}"`);
  });

  it('삭제 전문은 **한 줄**이고 이송번호가 없어도 값 태그가 실린다', async () => {
    harness = await harnessFor();
    await run({ service_binding_name: NAME });

    const remove = harness.nth(1);
    expect(remove.headers['content-type']).toBe('application/vnd.sap.adt.deletion.request.v1+xml');
    expect(remove.headers['accept']).toBe('application/vnd.sap.adt.deletion.response.v1+xml');
    expect(remove.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">' +
        `<del:object adtcore:uri="${BINDING_URI}">` +
        '<del:transportNumber></del:transportNumber>' +
        '</del:object></del:deletionRequest>',
    );
    // 표준 배치의 빈 태그와 다르다.
    expect(remove.body).not.toContain('<del:transportNumber/>');
  });

  it('이송번호를 주면 그 값이 실린다', async () => {
    harness = await harnessFor();
    await run({ service_binding_name: NAME, transport_request: 'E19K905635' });
    expect(harness.nth(1).body).toContain('<del:transportNumber>E19K905635</del:transportNumber>');
  });

  it('성공 응답은 구의 다섯 칸 그대로다', async () => {
    harness = await harnessFor();
    const payload = jsonOf(await run({ service_binding_name: NAME }));
    expect(payload.success).toBe(true);
    expect(payload.service_binding_name).toBe(NAME);
    expect(payload.response_format).toBe('xml');
    expect(payload.status).toBe(200);
    expect(payload.payload).toBeDefined();
  });

  it('response_format=plain이면 원문을 그대로 싣는다', async () => {
    harness = await harnessFor();
    const payload = jsonOf(await run({ service_binding_name: NAME, response_format: 'plain' }));
    expect(payload.response_format).toBe('plain');
    expect(payload.payload).toBe(DELETED);
  });
});

describe('발행취소 사전 걸음 — 최선 노력', () => {
  it('발행 중이면 상태를 **두 번 읽고** unpublishjobs를 친 뒤 지운다', async () => {
    harness = await harnessFor({ read: publishedBinding() });
    const result = await run({ service_binding_name: NAME });
    expect(result.isError).toBe(false);

    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${BINDING_URI}`,
      `GET ${BINDING_URI}`,
      `POST ${UNPUBLISH}`,
      `POST ${DELETE_PATH}`,
    ]);
    expect(harness.nth(2).query.get('servicename')).toBe(NAME);
    expect(harness.nth(2).query.get('serviceversion')).toBe('0001');
    expect(harness.nth(2).headers['content-type']).toBe('application/xml');
    expect(harness.nth(2).body).toContain(`adtcore:name="${NAME}"`);
  });

  it('allowedAction이 UNPUBLISH가 아니면 발행취소를 치지 않는다', async () => {
    harness = await harnessFor({ read: publishedBinding('PUBLISH') });
    await run({ service_binding_name: NAME });
    expect(harness.calls().map((call) => call.path)).not.toContain(UNPUBLISH);
  });

  it('**사전 걸음이 실패해도 삭제는 계속된다** — 구가 catch를 비워 두었다', async () => {
    harness = await harnessFor({ read: publishedBinding(), unpublishStatus: 500 });
    const result = await run({ service_binding_name: NAME });
    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => call.path)).toContain(DELETE_PATH);
  });

  it('상태를 못 읽어도 삭제는 계속된다 (404는 읽기 쪽이 빈손으로 접는다)', async () => {
    harness = await harnessFor({ readStatus: 404, read: '<not-found/>' });
    const result = await run({ service_binding_name: NAME });
    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => call.path)).toContain(DELETE_PATH);
  });
});

describe('D115 — HTTP 200에 실려 온 삭제 실패를 성공으로 접지 않는다', () => {
  it('isDeleted="false"면 실패다 (구는 success:true였다)', async () => {
    harness = await harnessFor({ deleteBody: notDeletedBody(BINDING_URI, 'Binding is published') });
    const result = await run({ service_binding_name: NAME });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: Service binding deletion failed: Binding is published');
  });

  it('isDeleted="true"면 성공이다 — 과수리 역검증', async () => {
    harness = await harnessFor();
    expect((await run({ service_binding_name: NAME })).isError).toBe(false);
  });
});

describe('갈래', () => {
  it('이름이 없으면 요청을 하나도 보내지 않는다', async () => {
    harness = await harnessFor();
    const result = await run({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: service_binding_name is required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('삭제가 죽으면 SAP 문구를 HTTP 상태와 함께 올린다 (구 return_error)', async () => {
    harness = await harnessFor({
      deleteStatus: 403,
      deleteBody:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAccess"/>' +
        '<message lang="EN">Not authorized to delete</message><properties/></exc:exception>',
    });
    expect(textOf(await run({ service_binding_name: NAME }))).toBe(
      'Error: SAP Error: Not authorized to delete [HTTP 403]',
    );
  });
});

describeTierGate(deleteServiceBinding, { service_binding_name: NAME });
