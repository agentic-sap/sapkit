/**
 * `UpdateMetadataExtension` — 발행 계약 · 사슬의 와이어 · 잠금 갈래 · D103.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.UpdateMetadataExtension`
 *  - 사슬: `engine/src/handlers/ddlx/high/handleUpdateMetadataExtension.ts:59-162`
 *  - 각 단계의 주소·헤더:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/metadataExtension/`의
 *    `lock.js:25-48` · `update.js:34-48` · `unlock.js:26-33` · `activate.js:24-27`
 *    → `utils/activationUtils.js:116-132`
 *  - 구문검사(Accept 없음 · **인코딩 규칙이 다른 URI**):
 *    `engine/src/lib/preCheckBeforeActivation.ts:263-276`·`:503-533`
 *  - **활성화 응답을 아무도 읽지 않는다** → 차이 D103.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { ToolResult } from '../../../server';
import { updateMetadataExtension } from '../updateMetadataExtension';
import {
  type WriteHarness,
  activationBody,
  cleanCheckRun,
  failingCheckRun,
  jsonOf,
  lockBody,
  startWriteHarness,
  textOf,
  xml,
} from './harness';

const URI = '/sap/bc/adt/ddic/ddlx/sources/z_my_ddlx';
const SOURCE = '@Metadata.layer: #CUSTOMER\nannotate entity ZI_DEMO with\n{\n  Field1;\n}';

interface Overrides {
  readonly check?: string;
  readonly activation?: string;
  readonly putStatus?: number;
  readonly putBody?: string;
}

async function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    const query = request.query;
    if (query.get('_action') === 'LOCK') return xml(response, lockBody('LOCK-DDLX'));
    if (query.get('_action') === 'UNLOCK') return xml(response, '');
    if (request.path === `${URI}/source/main` && request.method === 'PUT') {
      return xml(response, overrides.putBody ?? '', overrides.putStatus ?? 200);
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, overrides.check ?? cleanCheckRun());
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, overrides.activation ?? activationBody());
    }
    return xml(response, '<unexpected/>', 500);
  });
}

function run(harness: WriteHarness, args: Record<string, unknown>): Promise<ToolResult> {
  return Promise.resolve(updateMetadataExtension.handler(harness.context, args));
}

const ARGS = { name: 'Z_MY_DDLX', source_code: SOURCE } as const;

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
      tools: [updateMetadataExtension],
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
      }).toEqual(CAPTURED.tools['UpdateMetadataExtension']);
    } finally {
      await client.close();
      await core.server.close();
    }
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(updateMetadataExtension.definition.sets).toEqual(['high']);
    expect(updateMetadataExtension.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(updateMetadataExtension.definition.kind).toBe('mutation');
    expect(updateMetadataExtension.definition.targetNames).toEqual(['name']);
  });
});

// ── 사슬의 와이어 ───────────────────────────────────────────────────────────

describe('와이어', () => {
  it('잠금 → PUT → 검사 → 해제 → 활성화 다섯 요청을 순서대로 보낸다', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(false);

      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        `POST ${URI}`,
        `PUT ${URI}/source/main`,
        'POST /sap/bc/adt/checkruns',
        `POST ${URI}`,
        'POST /sap/bc/adt/activation',
      ]);
      expect(harness.nth(0).query.get('_action')).toBe('LOCK');
      expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
      expect(harness.nth(3).query.get('lockHandle')).toBe('LOCK-DDLX');
    } finally {
      await harness.close();
    }
  });

  it('PUT은 소스를 그대로 싣고 활성화 Content-Type은 activation+xml이다', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS, transport_request: 'E19K905635' });
      const put = harness.nth(1);
      expect(put.query.get('lockHandle')).toBe('LOCK-DDLX');
      expect(put.query.get('corrNr')).toBe('E19K905635');
      expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(put.headers['accept']).toBe('text/plain');
      expect(put.body).toBe(SOURCE);

      const activation = harness.nth(4);
      expect(activation.headers['content-type']).toBe(
        'application/vnd.sap.adt.activation+xml',
      );
      expect(activation.headers['accept']).toBe('application/xml');
      expect(activation.body).toContain(`adtcore:uri="${URI}"`);
      expect(activation.body).toContain('adtcore:name="Z_MY_DDLX"');
    } finally {
      await harness.close();
    }
  });

  it('구문검사는 Accept를 싣지 않고 인액티브 판을 겨눈다', async () => {
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

  it('activate=false면 활성화 요청이 나가지 않는다', async () => {
    const harness = await harnessFor();
    try {
      const payload = jsonOf(await run(harness, { ...ARGS, activate: false }));
      expect(harness.calls()).toHaveLength(4);
      expect(payload.message).toBe('Metadata Extension Z_MY_DDLX updated successfully');
    } finally {
      await harness.close();
    }
  });
});

// ── 잠금 갈래 ───────────────────────────────────────────────────────────────

describe('lock_handle 갈래', () => {
  it('남이 준 핸들이면 **잠그지도 풀지도 않는다**', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, { ...ARGS, lock_handle: 'CALLER-HANDLE' });
      expect(result.isError).toBe(false);

      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        `PUT ${URI}/source/main`,
        'POST /sap/bc/adt/checkruns',
        'POST /sap/bc/adt/activation',
      ]);
      expect(harness.nth(0).query.get('lockHandle')).toBe('CALLER-HANDLE');
    } finally {
      await harness.close();
    }
  });
});

// ── D103 — 활성화 거짓 성공 ─────────────────────────────────────────────────

describe('D103 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다', () => {
  it('type="E"가 하나라도 있으면 실패다 (구는 success:true였다)', async () => {
    const harness = await harnessFor({
      activation: activationBody([{ type: 'E', text: 'Entity ZI_DEMO does not exist' }]),
    });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Activation failed: metadata extension Z_MY_DDLX was not activated (1 error): ' +
          '[L12] Entity ZI_DEMO does not exist. The DDLX source is on SAP as an inactive version; ' +
          'the active version is unchanged.',
      );
    } finally {
      await harness.close();
    }
  });

  it('경고만 있는 활성화는 성공이다 — 과잉 거부하지 않는다', async () => {
    const harness = await harnessFor({
      activation: activationBody([{ type: 'W', text: 'Deprecated annotation' }]),
    });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(false);
      expect(jsonOf(result).message).toBe(
        'Metadata Extension Z_MY_DDLX updated and activated successfully',
      );
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
      const result = await run(harness, { name: 'Z_MY_DDLX' });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Error: Missing required parameters');
      expect(harness.calls()).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('구문검사 오류는 접두사 없이 진단 그대로 올라가고 활성화가 막힌다', async () => {
    const harness = await harnessFor({ check: failingCheckRun('Field1 is unknown', '4') });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Metadata Extension Z_MY_DDLX preCheck syntax check failed (1 error): [L4] Field1 is unknown',
      );
      expect(harness.calls()).toHaveLength(4);
      expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
    } finally {
      await harness.close();
    }
  });

  it('PUT이 죽으면 ADT 예외 메시지를 SAP Error로 실어 올린다 (구 extractAdtErrorMessage)', async () => {
    const harness = await harnessFor({
      putStatus: 400,
      putBody:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAccess"/>' +
        '<message lang="EN">Metadata extension is not modifiable</message><properties/></exc:exception>',
    });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Error: SAP Error: Metadata extension is not modifiable');
    } finally {
      await harness.close();
    }
  });
});
