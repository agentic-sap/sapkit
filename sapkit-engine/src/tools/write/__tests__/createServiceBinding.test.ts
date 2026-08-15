/**
 * `CreateServiceBinding` — 발행 계약 · 아홉 요청 사슬 · 종류 게이트 · D105.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.CreateServiceBinding`
 *    (`activate`에 `default`가 **없다** — 채록본 그대로다)
 *  - 사슬: `engine/src/handlers/service_binding/high/handleCreateServiceBinding.ts:92-187`
 *    → `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:190-266`
 *  - 각 단계의 주소·헤더·본문: 같은 파일 `:26-54`(생성 XML) · `:56-59`(이송 검사) ·
 *    `:64-84`·`:111-121`(종류 게이트) · `:479-518`(생성) · `:594-612`(검사) ·
 *    `:613-635`(활성화) · `:636-666`(생성정보) · `utils/systemInfo.js:16-60`
 *  - **활성화 응답을 아무도 읽지 않는다** → 차이 D105
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { ToolResult } from '../../../server';
import { createServiceBinding } from '../createServiceBinding';
import {
  type WriteHarness,
  activationBody,
  jsonOf,
  startWriteHarness,
  textOf,
  xml,
} from './harness';

const URI = '/sap/bc/adt/businessservices/bindings/zui_my_binding';

/** 종류 목록 — 게이트가 여기서 `ODATA:1:ODATA V4` 열쇠를 찾는다. */
function bindingTypes(entries: ReadonlyArray<{ name: string; description: string; data: string }>) {
  const items = entries
    .map(
      (entry) =>
        '<nameditem:namedItem>' +
        `<nameditem:name>${entry.name}</nameditem:name>` +
        `<nameditem:description>${entry.description}</nameditem:description>` +
        `<nameditem:data>${entry.data}</nameditem:data>` +
        '</nameditem:namedItem>',
    )
    .join('');
  return (
    '<nameditem:namedItemList xmlns:nameditem="http://www.sap.com/adt/nameditem">' +
    items +
    '</nameditem:namedItemList>'
  );
}

const BOTH_TYPES = bindingTypes([
  { name: 'ODATA', description: '1', data: 'ODATA V2' },
  { name: 'ODATA', description: '1', data: 'ODATA V4' },
]);

interface Overrides {
  readonly types?: string;
  readonly language?: string | null;
  readonly activation?: string;
  readonly createStatus?: number;
  readonly createBody?: string;
}

async function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    if (request.path === '/sap/bc/adt/businessservices/bindings/bindingtypes') {
      return xml(response, overrides.types ?? BOTH_TYPES);
    }
    if (request.path === '/sap/bc/adt/cts/transportchecks') {
      return xml(response, '<asx:abap><asx:values><DATA/></asx:values></asx:abap>');
    }
    if (request.path === '/sap/bc/adt/core/http/systeminformation') {
      if (overrides.language === null) return xml(response, 'nope', 404);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(
        JSON.stringify({
          language: overrides.language ?? 'CS',
          systemID: 'E19',
          userName: 'TESTER',
        }),
      );
    }
    if (request.path === '/sap/bc/adt/businessservices/bindings' && request.method === 'POST') {
      return xml(response, overrides.createBody ?? '<created/>', overrides.createStatus ?? 201);
    }
    if (request.path === '/sap/bc/adt/checkruns') return xml(response, '<chkrun:checkRunReports/>');
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, overrides.activation ?? activationBody());
    }
    if (request.path === URI && request.method === 'GET') return xml(response, '<read-back/>');
    if (request.path.startsWith('/sap/bc/adt/businessservices/odatav')) {
      return xml(response, '<generated/>');
    }
    return xml(response, '<unexpected/>', 500);
  });
}

const ARGS = {
  service_binding_name: 'ZUI_MY_BINDING',
  service_definition_name: 'ZSRVD_DEMO',
  package_name: 'zok_lab',
} as const;

function run(harness: WriteHarness, args: Record<string, unknown> = { ...ARGS }): Promise<ToolResult> {
  return Promise.resolve(createServiceBinding.handler(harness.context, args));
}

/** 시스템 정보는 캐시 무력화 인자 `_=<시각>`이 붙어 주소가 매번 달라진다. */
function paths(harness: WriteHarness): string[] {
  return harness.calls().map((call) => `${call.method} ${call.path}`);
}

// ── 발행 계약 ───────────────────────────────────────────────────────────────

const CAPTURED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json'), 'utf8'),
) as { tools: Record<string, unknown> };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    const startup = resolveStartup({
      argv: ['/usr/bin/node', '/app/entry.js', '--exposition=readonly,high'],
      env: {},
      cwd: process.cwd(),
      homedir: process.cwd(),
    });
    const core = createServerCore({
      startup: { ...startup, profile: { ...startup.profile, systemType: 'cloud' } },
      tools: [createServiceBinding],
      stderr: () => {},
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'contract-test', version: '0.0.0' });
    await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = await client.listTools();
      const published = listed.tools[0] as unknown as Record<string, unknown>;
      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(CAPTURED.tools['CreateServiceBinding']);
    } finally {
      await client.close();
      await core.server.close();
    }
  });

  it('노출 선언과 정책 분류', () => {
    expect(createServiceBinding.definition.sets).toEqual(['high']);
    expect(createServiceBinding.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createServiceBinding.definition.kind).toBe('mutation');
    expect(createServiceBinding.definition.targetNames).toEqual(['service_binding_name']);
  });
});

// ── 사슬의 와이어 ───────────────────────────────────────────────────────────

describe('와이어', () => {
  it('활성화까지 아홉 요청을 순서대로 보낸다 (**잠금이 없다**)', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness);
      expect(result.isError).toBe(false);

      expect(paths(harness)).toEqual([
        'GET /sap/bc/adt/businessservices/bindings/bindingtypes',
        'POST /sap/bc/adt/cts/transportchecks',
        'GET /sap/bc/adt/core/http/systeminformation',
        'POST /sap/bc/adt/businessservices/bindings',
        'POST /sap/bc/adt/checkruns',
        'POST /sap/bc/adt/activation',
        `GET ${URI}`,
        'GET /sap/bc/adt/businessservices/odatav4/ZUI_MY_BINDING',
        'POST /sap/bc/adt/checkruns',
      ]);
      for (const call of harness.calls()) {
        expect(call.query.get('_action')).toBeNull();
      }
    } finally {
      await harness.close();
    }
  });

  it('activate=false면 활성화와 활성 검사가 빠지고 되읽기가 inactive다 (일곱 요청)', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, { ...ARGS, activate: false });
      expect(result.isError).toBe(false);

      expect(paths(harness)).toEqual([
        'GET /sap/bc/adt/businessservices/bindings/bindingtypes',
        'POST /sap/bc/adt/cts/transportchecks',
        'GET /sap/bc/adt/core/http/systeminformation',
        'POST /sap/bc/adt/businessservices/bindings',
        'POST /sap/bc/adt/checkruns',
        `GET ${URI}`,
        'GET /sap/bc/adt/businessservices/odatav4/ZUI_MY_BINDING',
      ]);
      expect(harness.nth(5).query.get('version')).toBe('inactive');
      expect(jsonOf(result).activated).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('이송 검사 본문은 R3TR/SRVB에 대문자 이름·패키지를 담는다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS, description: 'demo "quoted" binding' });
      const check = harness.nth(1);
      expect(check.headers['content-type']).toBe(
        'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData',
      );
      expect(check.headers['accept']).toBe(
        'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.transport.service.checkData',
      );
      expect(check.body).toContain('<PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT>');
      expect(check.body).toContain('<OBJECTNAME>ZUI_MY_BINDING</OBJECTNAME>');
      expect(check.body).toContain('<OPERATION>I</OPERATION>');
      expect(check.body).toContain('<DEVCLASS>ZOK_LAB</DEVCLASS>');
      // 큰따옴표만 바꾼다.
      expect(check.body).toContain('<CTEXT>demo &quot;quoted&quot; binding</CTEXT>');
    } finally {
      await harness.close();
    }
  });

  it('시스템 정보는 **캐시 무력화 인자**를 달고, 언어·시스템·담당자가 페이로드로 간다', async () => {
    const harness = await harnessFor({ language: 'CS' });
    try {
      await run(harness);
      const info = harness.nth(2);
      expect(info.query.get('_')).toMatch(/^\d+$/);
      expect(info.headers['accept']).toBe(
        'application/vnd.sap.adt.core.http.systeminformation.v1+json',
      );

      const create = harness.nth(3);
      expect(create.headers['content-type']).toBe(
        'application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
      );
      expect(create.body).toContain('adtcore:language="CS"');
      expect(create.body).toContain('adtcore:masterLanguage="CS"');
      expect(create.body).toContain('adtcore:masterSystem="E19"');
      expect(create.body).toContain('adtcore:responsible="TESTER"');
      expect(create.body).toContain('adtcore:type="SRVB/SVB"');
      expect(create.body).toContain('<adtcore:packageRef adtcore:name="ZOK_LAB"/>');
      expect(create.body).toContain('<srvb:services srvb:name="ZUI_MY_BINDING">');
      expect(create.body).toContain('<srvb:content srvb:version="0001">');
      expect(create.body).toContain('<srvb:serviceDefinition adtcore:name="ZSRVD_DEMO"/>');
      expect(create.body).toContain(
        '<srvb:binding srvb:category="1" srvb:type="ODATA" srvb:version="V4">',
      );
    } finally {
      await harness.close();
    }
  });

  it('시스템 정보를 못 읽으면 EN으로 떨어지고 두 속성이 빠진다', async () => {
    const harness = await harnessFor({ language: null });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(false);
      const create = harness.nth(3);
      expect(create.body).toContain('adtcore:language="EN"');
      expect(create.body).not.toContain('adtcore:masterSystem');
      expect(create.body).not.toContain('adtcore:responsible');
    } finally {
      await harness.close();
    }
  });

  it('ODataV2는 **경로와 버전만** 가른다 — 페이로드의 srvb:type은 언제나 ODATA다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS, binding_type: 'ODataV2' });
      expect(harness.nth(3).body).toContain(
        '<srvb:binding srvb:category="1" srvb:type="ODATA" srvb:version="V2">',
      );
      const generated = harness.nth(7);
      expect(generated.path).toBe('/sap/bc/adt/businessservices/odatav2/ZUI_MY_BINDING');
      expect(generated.headers['accept']).toBe(
        'application/vnd.sap.adt.businessservices.odatav2.v2+xml, application/vnd.sap.adt.businessservices.odatav2.v3+xml',
      );
    } finally {
      await harness.close();
    }
  });

  it('생성정보 조회는 이름을 **대문자로** 넣고 세 질의 인자를 싣는다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS, service_name: 'zui_svc', service_version: '0002' });
      const generated = harness.nth(7);
      expect(generated.path).toBe('/sap/bc/adt/businessservices/odatav4/ZUI_MY_BINDING');
      expect(generated.query.get('servicename')).toBe('ZUI_SVC');
      expect(generated.query.get('serviceversion')).toBe('0002');
      expect(generated.query.get('srvdname')).toBe('ZSRVD_DEMO');
    } finally {
      await harness.close();
    }
  });

  it('전송요청은 생성 POST의 corrNr로만 나간다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS, transport_request: 'E19K905635' });
      expect(harness.nth(3).query.get('corrNr')).toBe('E19K905635');
    } finally {
      await harness.close();
    }
  });

  it('두 검사는 `?reporters=`가 **없고** 본문이 한 줄이다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness);
      const inactive = harness.nth(4);
      expect(inactive.query.get('reporters')).toBeNull();
      expect(inactive.headers['content-type']).toBe(
        'application/vnd.sap.adt.checkobjects+xml',
      );
      expect(inactive.headers['accept']).toBe('application/vnd.sap.adt.checkmessages+xml');
      expect(inactive.body).toBe(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" ' +
          'xmlns:adtcore="http://www.sap.com/adt/core">' +
          `<chkrun:checkObject adtcore:uri="${URI}" chkrun:version="inactive"/>` +
          '</chkrun:checkObjectList>',
      );
      expect(harness.nth(8).body).toContain('chkrun:version="active"');
    } finally {
      await harness.close();
    }
  });
});

// ── 종류 게이트 ─────────────────────────────────────────────────────────────

describe('종류 게이트 — ①에서 막히면 아무것도 만들지 않는다', () => {
  it('열쇠가 없으면 계약 문구로 던지고 요청이 하나로 끝난다', async () => {
    const harness = await harnessFor({
      types: bindingTypes([{ name: 'ODATA', description: '1', data: 'ODATA V2' }]),
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Binding type ODATA/V4 is not available on current ADT system',
      );
      expect(harness.calls()).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('service_binding_version을 직접 주면 그 값으로 열쇠를 찾는다', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, { ...ARGS, service_binding_version: '1.0' });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Binding type ODATA/1.0 is not available on current ADT system',
      );
    } finally {
      await harness.close();
    }
  });
});

// ── D105 ────────────────────────────────────────────────────────────────────

describe('D105 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다', () => {
  it('type="E"가 하나라도 있으면 실패다 (구는 activated:true였다)', async () => {
    const harness = await harnessFor({
      activation: activationBody([{ type: 'E', text: 'Service definition is inactive' }]),
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Activation failed: service binding ZUI_MY_BINDING was not activated (1 error): ' +
          '[L12] Service definition is inactive. The binding exists on SAP as an inactive version.',
      );
      // 활성화 뒤에 오던 세 요청이 나가지 않는다.
      expect(harness.calls()).toHaveLength(6);
    } finally {
      await harness.close();
    }
  });

  it('경고만 있는 활성화는 성공이다 — 과잉 거부하지 않는다', async () => {
    const harness = await harnessFor({
      activation: activationBody([{ type: 'W', text: 'Draft is not enabled' }]),
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(false);
      expect(jsonOf(result).activated).toBe(true);
      expect(harness.calls()).toHaveLength(9);
    } finally {
      await harness.close();
    }
  });

  it('구문검사 결과는 **구 그대로 버린다** — 오류가 있어도 생성은 성공이다', async () => {
    const harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/businessservices/bindings/bindingtypes') {
        return xml(response, BOTH_TYPES);
      }
      if (request.path === '/sap/bc/adt/cts/transportchecks') return xml(response, '<ok/>');
      if (request.path === '/sap/bc/adt/core/http/systeminformation') {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        return response.end(JSON.stringify({ language: 'EN' }));
      }
      if (request.path === '/sap/bc/adt/businessservices/bindings') {
        return xml(response, '<created/>', 201);
      }
      if (request.path === '/sap/bc/adt/checkruns') {
        // 오류를 담은 검사 보고. 구는 이것을 읽지 않는다.
        return xml(
          response,
          '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
            '<chkrun:checkReport chkrun:status="processed"><chkrun:checkMessageList>' +
            '<chkrun:checkMessage chkrun:type="E" chkrun:shortText="broken" line="1"/>' +
            '</chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>',
        );
      }
      if (request.path === '/sap/bc/adt/activation') return xml(response, activationBody());
      if (request.path === URI) return xml(response, '<read-back/>');
      if (request.path.startsWith('/sap/bc/adt/businessservices/odatav')) {
        return xml(response, '<generated/>');
      }
      return xml(response, '<unexpected/>', 500);
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(false);
      expect(jsonOf(result).success).toBe(true);
    } finally {
      await harness.close();
    }
  });
});

// ── 응답 조립 ───────────────────────────────────────────────────────────────

describe('응답 조립', () => {
  it('세 페이로드를 함께 싣고 binding_type은 인자 원문이다', async () => {
    const harness = await harnessFor();
    try {
      expect(jsonOf(await run(harness))).toEqual({
        success: true,
        service_binding_name: 'ZUI_MY_BINDING',
        service_definition_name: 'ZSRVD_DEMO',
        package_name: 'ZOK_LAB',
        binding_type: 'ODataV4',
        service_binding_version: 'V4',
        service_name: 'ZUI_MY_BINDING',
        service_version: '0001',
        activated: true,
        response_format: 'xml',
        status: 201,
        payload: { created: '' },
        read_payload: { 'read-back': '' },
        generated_info: { generated: '' },
      });
    } finally {
      await harness.close();
    }
  });
});

// ── 갈래 ────────────────────────────────────────────────────────────────────

describe('갈래', () => {
  it('빈 인자는 요청을 보내기 전에 거부된다', async () => {
    const harness = await harnessFor();
    try {
      const emptyName = await run(harness, { ...ARGS, service_binding_name: '' });
      expect(textOf(emptyName)).toBe('Error: service_binding_name is required');

      const emptyDefinition = await run(harness, { ...ARGS, service_definition_name: '' });
      expect(textOf(emptyDefinition)).toBe('Error: service_definition_name is required');

      const emptyPackage = await run(harness, { ...ARGS, package_name: '' });
      expect(textOf(emptyPackage)).toBe('Error: package_name is required');

      expect(harness.calls()).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('생성 실패는 구 return_error의 모양으로 올라간다', async () => {
    const harness = await harnessFor({
      createStatus: 400,
      createBody:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<namespace id="com.sap.adt"/><type id="ExceptionResourceAlreadyExists"/>' +
        '<message lang="EN">Service binding already exists</message><properties/></exc:exception>',
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: SAP Error: Service binding already exists [HTTP 400]',
      );
    } finally {
      await harness.close();
    }
  });
});
