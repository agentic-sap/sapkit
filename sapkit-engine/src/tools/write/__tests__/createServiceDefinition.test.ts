/**
 * `CreateServiceDefinition` — 발행 계약 · 사슬의 와이어 · 페이로드 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.CreateServiceDefinition`
 *  - 사슬: `engine/src/handlers/service_definition/high/handleCreateServiceDefinition.ts:113-197`
 *  - 각 단계의 주소·헤더·본문:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/serviceDefinition/`의
 *    `validation.js:20-36` · `create.js:15-44` · `activation.js:13-73`
 *  - 구문검사(Accept 없음): `engine/src/lib/preCheckBeforeActivation.ts:311-320`·`:503-533`
 *  - **`source_code`가 와이어에 실리지 않는 근거**: `create.js`가 그 인자를 한 번도
 *    읽지 않는다(파일 전체에 `source_code` 사용처가 없다).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { ToolResult } from '../../../server';
import { createServiceDefinition } from '../createServiceDefinition';
import {
  type WriteHarness,
  cleanCheckRun,
  failingCheckRun,
  jsonOf,
  startWriteHarness,
  textOf,
  xml,
} from './harness';

const URI = '/sap/bc/adt/ddic/srvd/sources/zsrvd_demo';

function activationOk(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
    '<chkl:properties activationExecuted="true" checkExecuted="true"/>' +
    '</chkl:messages>'
  );
}

interface Overrides {
  readonly language?: string | null;
  readonly check?: string;
  readonly activation?: string;
  readonly createStatus?: number;
  readonly createBody?: string;
}

async function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    if (request.path === '/sap/bc/adt/ddic/srvd/sources/validation') {
      return xml(response, '<asx:abap><asx:values><DATA><CHECK_RESULT>X</CHECK_RESULT></DATA></asx:values></asx:abap>');
    }
    if (request.path === '/sap/bc/adt/core/http/systeminformation') {
      if (overrides.language === null) return xml(response, 'nope', 404);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ language: overrides.language ?? 'CS' }));
    }
    if (request.path === '/sap/bc/adt/ddic/srvd/sources' && request.method === 'POST') {
      return xml(response, overrides.createBody ?? '<created/>', overrides.createStatus ?? 201);
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, overrides.check ?? cleanCheckRun());
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, overrides.activation ?? activationOk());
    }
    return xml(response, '<unexpected/>', 500);
  });
}

const ARGS = {
  service_definition_name: 'ZSRVD_DEMO',
  description: 'demo service',
  package_name: '$tmp',
} as const;

function run(
  harness: WriteHarness,
  args: Record<string, unknown> = { ...ARGS },
  env: Record<string, string> = { SAP_USERNAME: 'TESTER' },
): Promise<ToolResult> {
  return Promise.resolve(createServiceDefinition.handler({ ...harness.context, env }, args));
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
      tools: [createServiceDefinition],
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
      }).toEqual(CAPTURED.tools['CreateServiceDefinition']);
    } finally {
      await client.close();
      await core.server.close();
    }
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(createServiceDefinition.definition.sets).toEqual(['high']);
    expect(createServiceDefinition.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createServiceDefinition.definition.kind).toBe('mutation');
    expect(createServiceDefinition.definition.targetNames).toEqual(['service_definition_name']);
  });
});

// ── 사슬의 와이어 ───────────────────────────────────────────────────────────

describe('와이어', () => {
  it('검증 → 언어조회 → 생성 → 검사 → 활성화 다섯 요청을 순서대로 보낸다 (**잠금이 없다**)', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness);
      expect(result.isError).toBe(false);

      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        'POST /sap/bc/adt/ddic/srvd/sources/validation',
        'GET /sap/bc/adt/core/http/systeminformation',
        'POST /sap/bc/adt/ddic/srvd/sources',
        'POST /sap/bc/adt/checkruns',
        'POST /sap/bc/adt/activation',
      ]);
      for (const call of harness.calls()) {
        expect(call.query.get('_action')).toBeNull();
      }
    } finally {
      await harness.close();
    }
  });

  it('이름 검증의 질의 인자는 objtype=srvdsrv이고 설명은 **자르지 않은 원문**이다', async () => {
    const long = 'x'.repeat(80);
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS, description: long });
      const validation = harness.nth(0);
      expect(validation.query.get('objtype')).toBe('srvdsrv');
      expect(validation.query.get('objname')).toBe('ZSRVD_DEMO');
      expect(validation.query.get('description')).toBe(long);
      expect(validation.headers['accept']).toBe('application/vnd.sap.as+xml');
      // 생성 페이로드에서만 60자로 잘린다.
      expect(harness.nth(2).body).toContain(`adtcore:description="${'x'.repeat(60)}"`);
    } finally {
      await harness.close();
    }
  });

  it('생성 페이로드는 로그온 언어·패키지 대문자·SRVD/SRV 타입을 담는다', async () => {
    const harness = await harnessFor({ language: 'CS' });
    try {
      await run(harness);
      const create = harness.nth(2);
      expect(create.headers['content-type']).toBe('application/vnd.sap.adt.ddic.srvd.v1+xml');
      expect(create.headers['accept']).toBe('application/vnd.sap.adt.ddic.srvd.v1+xml');
      expect(create.query.get('corrNr')).toBeNull();
      expect(create.body).toContain('adtcore:language="CS"');
      expect(create.body).toContain('adtcore:masterLanguage="CS"');
      expect(create.body).toContain('adtcore:name="ZSRVD_DEMO"');
      expect(create.body).toContain('adtcore:type="SRVD/SRV"');
      expect(create.body).toContain('srvd:srvdSourceType="S"');
      expect(create.body).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
      expect(create.body).toContain('adtcore:responsible="TESTER"');
      expect(create.body).not.toContain('adtcore:masterSystem');
    } finally {
      await harness.close();
    }
  });

  it('언어를 못 읽으면 EN으로 떨어진다 — 조회 실패가 생성 실패가 되지 않는다', async () => {
    const harness = await harnessFor({ language: null });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(false);
      expect(harness.nth(2).body).toContain('adtcore:language="EN"');
    } finally {
      await harness.close();
    }
  });

  it('전송요청은 corrNr 질의 인자로만 나간다', async () => {
    const harness = await harnessFor();
    try {
      const payload = jsonOf(await run(harness, { ...ARGS, transport_request: 'E19K905635' }));
      expect(harness.nth(2).query.get('corrNr')).toBe('E19K905635');
      expect(payload.transport_request).toBe('E19K905635');
    } finally {
      await harness.close();
    }
  });

  it('`source_code`를 줘도 **와이어에 실리지 않는다** (구 create.js가 읽지 않는다)', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, {
        ...ARGS,
        source_code: 'define service ZSRVD_DEMO { expose ZI_DEMO; }',
      });
      expect(result.isError).toBe(false);
      // 요청 수는 그대로 다섯이고 PUT은 없다.
      expect(harness.calls()).toHaveLength(5);
      for (const call of harness.calls()) {
        expect(call.method).not.toBe('PUT');
        expect(call.body ?? '').not.toContain('expose ZI_DEMO');
      }
    } finally {
      await harness.close();
    }
  });

  it('구문검사는 Accept를 싣지 않고 인액티브 판을 겨눈다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness);
      const check = harness.nth(3);
      expect(check.query.get('reporters')).toBe('abapCheckRun');
      expect(check.headers['accept']).toBe('application/xml, application/json, text/plain, */*');
      expect(check.body).toContain(`adtcore:uri="${URI}"`);
      expect(check.body).toContain('chkrun:version="inactive"');
    } finally {
      await harness.close();
    }
  });

  it('activate=false면 활성화 요청이 나가지 않는다', async () => {
    const harness = await harnessFor();
    try {
      const payload = jsonOf(await run(harness, { ...ARGS, activate: false }));
      expect(harness.calls()).toHaveLength(4);
      expect(payload.steps_completed).toEqual(['validate', 'create']);
      expect(payload.message).toBe(
        'Service Definition ZSRVD_DEMO created successfully (not activated)',
      );
    } finally {
      await harness.close();
    }
  });
});

// ── 응답 조립 ───────────────────────────────────────────────────────────────

describe('응답 조립', () => {
  it('보고되는 uri는 대문자이고 type은 SRVD/SRV다', async () => {
    const harness = await harnessFor();
    try {
      const payload = jsonOf(await run(harness));
      expect(payload).toEqual({
        success: true,
        service_definition_name: 'ZSRVD_DEMO',
        package_name: '$TMP',
        transport_request: null,
        type: 'SRVD/SRV',
        message: 'Service Definition ZSRVD_DEMO created and activated successfully',
        uri: '/sap/bc/adt/ddic/srvd/sources/ZSRVD_DEMO',
        steps_completed: ['validate', 'create', 'activate'],
      });
    } finally {
      await harness.close();
    }
  });
});

// ── 갈래 ────────────────────────────────────────────────────────────────────

describe('갈래', () => {
  it('인자가 빠지면 요청을 하나도 보내지 않는다', async () => {
    const harness = await harnessFor();
    try {
      const missingName = await run(harness, { package_name: '$TMP' });
      expect(missingName.isError).toBe(true);
      expect(textOf(missingName)).toBe('Error: service_definition_name is required');

      const missingPackage = await run(harness, { service_definition_name: 'ZSRVD_DEMO' });
      expect(missingPackage.isError).toBe(true);
      expect(textOf(missingPackage)).toBe('Error: package_name is required');

      expect(harness.calls()).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('409는 "이미 있다"로 접힌다 (이 핸들러만의 조합 — 상태 코드다)', async () => {
    const harness = await harnessFor({ createStatus: 409, createBody: '<conflict/>' });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Service Definition ZSRVD_DEMO already exists. Please delete it first or use a different name.',
      );
    } finally {
      await harness.close();
    }
  });

  it('그 밖의 생성 실패는 ADT 원문 본문을 그대로 싣는다', async () => {
    const harness = await harnessFor({ createStatus: 400, createBody: '<bad-request/>' });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Failed to create service definition: <bad-request/>',
      );
    } finally {
      await harness.close();
    }
  });

  it('구문검사 오류는 접두사 없이 진단 그대로 올라가고 활성화가 막힌다', async () => {
    const harness = await harnessFor({ check: failingCheckRun('Entity ZI_DEMO is unknown', '3') });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Service Definition ZSRVD_DEMO preCheck syntax check failed (1 error): [L3] Entity ZI_DEMO is unknown',
      );
      expect(harness.calls()).toHaveLength(4);
    } finally {
      await harness.close();
    }
  });

  it('활성화 속성 블록이 없으면 성공으로 접지 않는다 (200이어도 실패다)', async () => {
    const harness = await harnessFor({
      activation:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
        '<msg type="E"><shortText><txt>Syntax error</txt></shortText></msg>' +
        '</chkl:messages>',
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Failed to create service definition: Service definition activation failed: Unknown activation status',
      );
    } finally {
      await harness.close();
    }
  });
});
