/**
 * `CreateMetadataExtension` — 발행 계약 · 사슬의 와이어 · 페이로드 두 갈래 · D103 · D104.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.CreateMetadataExtension`
 *  - 사슬: `engine/src/handlers/ddlx/high/handleCreateMetadataExtension.ts:55-168`
 *    (**이름 검증 왕복이 없다** — 벤더 validate()를 부르지 않는다)
 *  - 생성 페이로드의 두 갈래:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/metadataExtension/create.js:41-60`
 *  - 구문검사(Accept 없음): `engine/src/lib/preCheckBeforeActivation.ts:263-276`
 *  - **활성화 응답을 아무도 읽지 않는다** → 차이 D103
 *  - **활성화 실패 뒤 UNLOCK이 한 번 더 나간다** → 차이 D104
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { ToolResult } from '../../../server';
import { createMetadataExtension } from '../createMetadataExtension';
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

interface Overrides {
  readonly language?: string | null;
  readonly check?: string;
  readonly activation?: string;
  readonly createStatus?: number;
  readonly createBody?: string;
}

async function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    const query = request.query;
    if (request.path === '/sap/bc/adt/core/http/systeminformation') {
      if (overrides.language === null) return xml(response, 'nope', 404);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ language: overrides.language ?? 'CS' }));
    }
    if (query.get('_action') === 'LOCK') return xml(response, lockBody('LOCK-DDLX'));
    if (query.get('_action') === 'UNLOCK') return xml(response, '');
    if (request.path === '/sap/bc/adt/ddic/ddlx/sources' && request.method === 'POST') {
      return xml(response, overrides.createBody ?? '<created/>', overrides.createStatus ?? 201);
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

const ARGS = {
  name: 'Z_MY_DDLX',
  description: 'demo ddlx',
  package_name: 'zok_lab',
} as const;

function run(
  harness: WriteHarness,
  args: Record<string, unknown> = { ...ARGS },
  env: Record<string, string> = {},
): Promise<ToolResult> {
  return Promise.resolve(createMetadataExtension.handler({ ...harness.context, env }, args));
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
      tools: [createMetadataExtension],
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
      }).toEqual(CAPTURED.tools['CreateMetadataExtension']);
    } finally {
      await client.close();
      await core.server.close();
    }
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(createMetadataExtension.definition.sets).toEqual(['high']);
    expect(createMetadataExtension.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createMetadataExtension.definition.kind).toBe('mutation');
    expect(createMetadataExtension.definition.targetNames).toEqual(['name']);
  });
});

// ── 사슬의 와이어 ───────────────────────────────────────────────────────────

describe('와이어', () => {
  it('언어조회 → 생성 → 잠금 → 검사 → 해제 → 활성화 — **이름 검증 왕복이 없다**', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness);
      expect(result.isError).toBe(false);

      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        'GET /sap/bc/adt/core/http/systeminformation',
        'POST /sap/bc/adt/ddic/ddlx/sources',
        `POST ${URI}`,
        'POST /sap/bc/adt/checkruns',
        `POST ${URI}`,
        'POST /sap/bc/adt/activation',
      ]);
      expect(harness.nth(2).query.get('_action')).toBe('LOCK');
      expect(harness.nth(4).query.get('_action')).toBe('UNLOCK');
      // 소스를 올리는 PUT은 없다.
      for (const call of harness.calls()) expect(call.method).not.toBe('PUT');
    } finally {
      await harness.close();
    }
  });

  it('전송요청이 없으면 페이로드가 **자기 닫음 packageRef 한 줄**이고 corrNr도 없다', async () => {
    const harness = await harnessFor({ language: 'CS' });
    try {
      await run(harness);
      const create = harness.nth(1);
      expect(create.query.get('corrNr')).toBeNull();
      expect(create.headers['content-type']).toBe('application/vnd.sap.adt.ddic.ddlx.v1+xml');
      expect(create.headers['accept']).toBe('application/vnd.sap.adt.ddic.ddlx.v1+xml');
      expect(create.body).toBe(
        '<?xml version="1.0" encoding="UTF-8"?><ddlxsources:ddlxSource ' +
          'xmlns:ddlxsources="http://www.sap.com/adt/ddic/ddlxsources" ' +
          'xmlns:adtcore="http://www.sap.com/adt/core" ' +
          'adtcore:description="demo ddlx" adtcore:language="CS" adtcore:name="Z_MY_DDLX" ' +
          'adtcore:type="DDLX/EX" adtcore:masterLanguage="CS">\n' +
          '    <adtcore:packageRef adtcore:name="zok_lab"/>\n  \n</ddlxsources:ddlxSource>',
      );
    } finally {
      await harness.close();
    }
  });

  it('전송요청이 있으면 packageRef가 **펼쳐지고 transportInfo가 붙는다**', async () => {
    const harness = await harnessFor({ language: 'EN' });
    try {
      await run(harness, { ...ARGS, transport_request: 'E19K905635' });
      const create = harness.nth(1);
      expect(create.query.get('corrNr')).toBe('E19K905635');
      expect(create.body).toContain('<adtcore:packageRef adtcore:name="zok_lab">');
      expect(create.body).toContain(
        '<adtcore:property adtcore:name="abapLanguageVersion" adtcore:value=""/>',
      );
      expect(create.body).toContain('<adtcore:transportInfo>');
      expect(create.body).toContain('<adtcore:localObject/>');
    } finally {
      await harness.close();
    }
  });

  it('마스터 시스템·담당자는 값이 있을 때만 붙는다 (서비스 정의와 갈린다)', async () => {
    const harness = await harnessFor();
    try {
      await run(harness, { ...ARGS }, { SAP_USERNAME: 'TESTER', SAP_MASTER_SYSTEM: 'E19' });
      const body = harness.nth(1).body ?? '';
      expect(body).toContain('adtcore:masterSystem="E19"');
      expect(body).toContain('adtcore:responsible="TESTER"');
    } finally {
      await harness.close();
    }
  });

  it('설명은 60자로 잘리고 언어를 못 읽으면 EN으로 떨어진다', async () => {
    const harness = await harnessFor({ language: null });
    try {
      const result = await run(harness, { ...ARGS, description: 'y'.repeat(80) });
      expect(result.isError).toBe(false);
      const body = harness.nth(1).body ?? '';
      expect(body).toContain(`adtcore:description="${'y'.repeat(60)}"`);
      expect(body).toContain('adtcore:language="EN"');
    } finally {
      await harness.close();
    }
  });

  it('activate=false면 활성화 요청이 나가지 않는다', async () => {
    const harness = await harnessFor();
    try {
      const payload = jsonOf(await run(harness, { ...ARGS, activate: false }));
      expect(harness.calls()).toHaveLength(5);
      expect(payload.message).toBe('Metadata Extension Z_MY_DDLX created successfully');
    } finally {
      await harness.close();
    }
  });
});

// ── 응답 조립 ───────────────────────────────────────────────────────────────

describe('응답 조립', () => {
  it('package_name은 인자를 **그대로** 싣는다 (대문자로 올리지 않는다)', async () => {
    const harness = await harnessFor();
    try {
      expect(jsonOf(await run(harness))).toEqual({
        success: true,
        name: 'Z_MY_DDLX',
        package_name: 'zok_lab',
        type: 'DDLX',
        message: 'Metadata Extension Z_MY_DDLX created and activated successfully',
      });
    } finally {
      await harness.close();
    }
  });
});

// ── D103 · D104 ─────────────────────────────────────────────────────────────

describe('D103 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다', () => {
  it('type="E"가 하나라도 있으면 실패다 (구는 success:true였다)', async () => {
    const harness = await harnessFor({
      activation: activationBody([{ type: 'E', text: 'Entity ZI_DEMO does not exist' }]),
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Activation failed: metadata extension Z_MY_DDLX was not activated (1 error): ' +
          '[L12] Entity ZI_DEMO does not exist. The DDLX shell is on SAP as an inactive version; ' +
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
      const result = await run(harness);
      expect(result.isError).toBe(false);
    } finally {
      await harness.close();
    }
  });
});

describe('D104 — 활성화가 실패해도 해제는 한 번뿐이다', () => {
  it('구는 catch에서 이미 풀린 핸들로 UNLOCK을 한 번 더 보냈다', async () => {
    const harness = await harnessFor({
      activation: activationBody([{ type: 'E', text: 'boom' }]),
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        'GET /sap/bc/adt/core/http/systeminformation',
        'POST /sap/bc/adt/ddic/ddlx/sources',
        `POST ${URI}`,
        'POST /sap/bc/adt/checkruns',
        `POST ${URI}`,
        'POST /sap/bc/adt/activation',
      ]);
      // UNLOCK은 정확히 한 번이다.
      expect(
        harness.calls().filter((call) => call.query.get('_action') === 'UNLOCK'),
      ).toHaveLength(1);
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
    const harness = await harnessFor({ check: failingCheckRun('Layer is missing', '1') });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Metadata Extension Z_MY_DDLX preCheck syntax check failed (1 error): [L1] Layer is missing',
      );
      expect(harness.calls()).toHaveLength(5);
      expect(harness.nth(4).query.get('_action')).toBe('UNLOCK');
    } finally {
      await harness.close();
    }
  });

  it('생성 실패는 구 return_error의 `SAP Error: … [HTTP n]` 모양으로 올라간다', async () => {
    const harness = await harnessFor({
      createStatus: 400,
      createBody:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<namespace id="com.sap.adt"/><type id="ExceptionResourceAlreadyExists"/>' +
        '<message lang="EN">Metadata extension already exists</message><properties/></exc:exception>',
    });
    try {
      const result = await run(harness);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: SAP Error: Metadata extension already exists [HTTP 400]',
      );
    } finally {
      await harness.close();
    }
  });
});
