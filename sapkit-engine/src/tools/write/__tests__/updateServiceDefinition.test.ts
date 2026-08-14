/**
 * `UpdateServiceDefinition` — 발행 계약 · 사슬의 와이어 · 잠금 창 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.UpdateServiceDefinition`
 *  - 사슬: `engine/src/handlers/service_definition/high/handleUpdateServiceDefinition.ts:95-189`
 *  - 각 단계의 주소·헤더:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/serviceDefinition/`의
 *    `lock.js:16-37` · `update.js:14-30` · `unlock.js:14-21` · `activation.js:13-73`
 *  - 구문검사(Accept 없음): `engine/src/lib/preCheckBeforeActivation.ts:311-320`·`:503-533`
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { ToolResult } from '../../../server';
import { updateServiceDefinition } from '../updateServiceDefinition';
import {
  type WriteHarness,
  cleanCheckRun,
  failingCheckRun,
  jsonOf,
  lockBody,
  startWriteHarness,
  textOf,
  xml,
} from './harness';

const URI = '/sap/bc/adt/ddic/srvd/sources/zsrvd_demo';
const SOURCE = 'define service ZSRVD_DEMO {\n  expose ZI_DEMO;\n}';

/** 활성화가 실제로 성사됐을 때 SAP이 돌려주는 속성 블록. */
function activationOk(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
    '<chkl:properties activationExecuted="true" checkExecuted="true"/>' +
    '</chkl:messages>'
  );
}

interface Overrides {
  readonly check?: string;
  readonly activation?: string;
  readonly checkStatus?: number;
  readonly putStatus?: number;
  readonly putBody?: string;
}

async function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    const query = request.query;
    if (query.get('_action') === 'LOCK') return xml(response, lockBody('LOCK-SRVD'));
    if (query.get('_action') === 'UNLOCK') return xml(response, '');
    if (request.path === `${URI}/source/main` && request.method === 'PUT') {
      return xml(response, overrides.putBody ?? '', overrides.putStatus ?? 200);
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, overrides.check ?? cleanCheckRun(), overrides.checkStatus ?? 200);
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, overrides.activation ?? activationOk());
    }
    return xml(response, '<unexpected/>', 500);
  });
}

function run(harness: WriteHarness, args: Record<string, unknown>): Promise<ToolResult> {
  return Promise.resolve(updateServiceDefinition.handler(harness.context, args));
}

const ARGS = {
  service_definition_name: 'ZSRVD_DEMO',
  source_code: SOURCE,
} as const;

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
      tools: [updateServiceDefinition],
      stderr: () => {},
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'contract-test', version: '0.0.0' });
    await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;
      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(CAPTURED.tools['UpdateServiceDefinition']);
    } finally {
      await client.close();
      await core.server.close();
    }
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    // `engine/src/handlers/service_definition/high/` → 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    expect(updateServiceDefinition.definition.sets).toEqual(['high']);
    expect(updateServiceDefinition.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(updateServiceDefinition.definition.kind).toBe('mutation');
    expect(updateServiceDefinition.definition.targetNames).toEqual(['service_definition_name']);
  });
});

// ── 사슬의 와이어 ───────────────────────────────────────────────────────────

describe('와이어', () => {
  it('잠금 → PUT → 검사 → 해제 → 활성화 다섯 요청을 순서대로 보낸다', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(false);

      const calls = harness.calls();
      expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
        `POST ${URI}`,
        `PUT ${URI}/source/main`,
        'POST /sap/bc/adt/checkruns',
        `POST ${URI}`,
        'POST /sap/bc/adt/activation',
      ]);
      expect(harness.nth(0).query.get('_action')).toBe('LOCK');
      expect(harness.nth(0).query.get('accessMode')).toBe('MODIFY');
      expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
      expect(harness.nth(3).query.get('lockHandle')).toBe('LOCK-SRVD');
    } finally {
      await harness.close();
    }
  });

  it('PUT은 소스를 그대로 싣고 lockHandle·corrNr을 질의 인자로 보낸다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS, transport_request: 'E19K905635' });
      const put = harness.nth(1);
      expect(put.query.get('lockHandle')).toBe('LOCK-SRVD');
      expect(put.query.get('corrNr')).toBe('E19K905635');
      expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(put.headers['accept']).toBe('text/plain');
      expect(put.body).toBe(SOURCE);
    } finally {
      await harness.close();
    }
  });

  it('구문검사는 **Accept를 싣지 않는다** — 접속 계층 기본값이 그대로 나간다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS });
      const check = harness.nth(2);
      expect(check.query.get('reporters')).toBe('abapCheckRun');
      expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
      expect(check.headers['accept']).toBe('application/xml, application/json, text/plain, */*');
      expect(check.body).toContain(`adtcore:uri="${URI}"`);
      expect(check.body).toContain('chkrun:version="inactive"');
    } finally {
      await harness.close();
    }
  });

  it('나가는 주소의 이름은 소문자이고 활성화 참조의 이름만 대문자다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS, service_definition_name: 'zsrvd_demo' });
      for (const call of harness.calls()) {
        expect(call.path.includes('ZSRVD_DEMO')).toBe(false);
      }
      const activation = harness.nth(4);
      expect(activation.body).toContain(`adtcore:uri="${URI}"`);
      expect(activation.body).toContain('adtcore:name="ZSRVD_DEMO"');
      expect(activation.headers['content-type']).toBe('application/xml');
      expect(activation.query.get('method')).toBe('activate');
      expect(activation.query.get('preauditRequested')).toBe('true');
    } finally {
      await harness.close();
    }
  });

  it('activate=false면 활성화 요청이 아예 나가지 않는다', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, { ...ARGS, activate: false });
      expect(harness.calls()).toHaveLength(4);
      const payload = jsonOf(result);
      expect(payload.activated).toBe(false);
      expect(payload.steps_completed).toEqual(['lock', 'update', 'check', 'unlock']);
      expect(payload.message).toBe(
        'Service Definition ZSRVD_DEMO updated successfully (not activated)',
      );
    } finally {
      await harness.close();
    }
  });
});

// ── 응답 조립 ───────────────────────────────────────────────────────────────

describe('응답 조립', () => {
  it('보고되는 uri만 **대문자**다 (나가는 주소와 갈린다)', async () => {
    const harness = await harnessFor();
    try {
      const payload = jsonOf(await run(harness, { ...ARGS }));
      expect(payload.uri).toBe('/sap/bc/adt/ddic/srvd/sources/ZSRVD_DEMO');
      expect(payload.success).toBe(true);
      expect(payload.transport_request).toBe('local');
      expect(payload.source_size_bytes).toBe(SOURCE.length);
      expect(payload.steps_completed).toEqual(['lock', 'update', 'check', 'unlock', 'activate']);
      expect(payload).not.toHaveProperty('activation_warnings');
    } finally {
      await harness.close();
    }
  });

  it('활성화 경고는 성공 응답에 실린다', async () => {
    const harness = await harnessFor({
      activation:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
        '<chkl:properties activationExecuted="true" checkExecuted="true"/>' +
        '<msg type="W"><shortText><txt>Deprecated annotation</txt></shortText></msg>' +
        '</chkl:messages>',
    });
    try {
      const payload = jsonOf(await run(harness, { ...ARGS }));
      expect(payload.activation_warnings).toEqual(['W: Deprecated annotation']);
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
      const result = await run(harness, { service_definition_name: 'ZSRVD_DEMO' });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: service_definition_name and source_code are required',
      );
      expect(harness.calls()).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('구문검사 오류는 **접두사 없이** 진단 그대로 올라가고 활성화가 막힌다', async () => {
    const harness = await harnessFor({ check: failingCheckRun('Service ZI_DEMO is unknown', '2') });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Service Definition ZSRVD_DEMO preCheck syntax check failed (1 error): [L2] Service ZI_DEMO is unknown',
      );
      // 잠금 → PUT → 검사 → 해제까지는 갔고 활성화는 없다.
      expect(harness.calls().map((call) => call.method)).toEqual(['POST', 'PUT', 'POST', 'POST']);
      expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
    } finally {
      await harness.close();
    }
  });

  it('활성화 응답에 속성 블록이 없으면 **성공으로 접지 않는다** (200이어도 실패다)', async () => {
    const harness = await harnessFor({
      activation:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
        '<msg type="E"><shortText><txt>Syntax error in service</txt></shortText></msg>' +
        '</chkl:messages>',
    });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Failed to update service definition: Service definition activation failed: Unknown activation status',
      );
    } finally {
      await harness.close();
    }
  });

  it('activationExecuted=false도 실패다', async () => {
    const harness = await harnessFor({
      activation:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
        '<chkl:properties activationExecuted="false" checkExecuted="true"/>' +
        '</chkl:messages>',
    });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Service definition activation failed: Activation failed');
    } finally {
      await harness.close();
    }
  });

  it('PUT이 죽으면 해제는 하되 오류로 답한다', async () => {
    const harness = await harnessFor({ putStatus: 423, putBody: '<locked/>' });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Error: Failed to update service definition:');
      expect(harness.nth(2).query.get('_action')).toBe('UNLOCK');
      expect(harness.calls()).toHaveLength(3);
    } finally {
      await harness.close();
    }
  });

  it('"이미 검사됨"은 실패가 아니다 — 구 runRawCheckRun이 삼키던 갈래', async () => {
    const harness = await harnessFor({
      checkStatus: 500,
      check:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<namespace id="com.sap.adt"/><type id="ExceptionAlreadyChecked"/>' +
        '<message lang="EN">Object has been checked already</message><properties/></exc:exception>',
    });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(false);
      expect(jsonOf(result).success).toBe(true);
    } finally {
      await harness.close();
    }
  });
});
