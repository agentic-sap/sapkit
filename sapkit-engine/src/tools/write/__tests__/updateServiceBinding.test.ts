/**
 * `UpdateServiceBinding` — 발행 계약 · 발행/발행취소 와이어 · 상태 전이 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.UpdateServiceBinding`
 *    (**`service_type`이 `required`에 없다** — default가 붙은 인자라서다)
 *  - 흐름: `engine/src/handlers/service_binding/high/handleUpdateServiceBinding.ts:67-123`
 *    (저수준 `updateServiceBinding`을 직접 부른다 — 감싸개 `update()`가 아니다)
 *  - 갈래·문구·주소:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:535-580`
 *    (`unchanged`·이미 발행됨은 두 번째 요청이 없다) ·
 *    `:122-151`(publishjobs/unpublishjobs · 타임아웃 long) ·
 *    `:85-110`(`@_` 접두사 상태 파서)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { ToolResult } from '../../../server';
import { updateServiceBinding } from '../updateServiceBinding';
import { type WriteHarness, jsonOf, startWriteHarness, textOf, xml } from './harness';

const URI = '/sap/bc/adt/businessservices/bindings/zui_my_binding';

/** 활성 판 응답. 발행 여부와 허용 동작이 갈래를 정한다. */
function bindingState(options: { published?: boolean; allowedAction?: string } = {}): string {
  const published = options.published ?? false;
  const action =
    options.allowedAction === undefined
      ? ''
      : ` srvb:allowedAction="${options.allowedAction}"`;
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" ' +
    `srvb:published="${published}"${action} adtcore:name="ZUI_MY_BINDING"/>`
  );
}

interface Overrides {
  readonly state?: string;
  readonly job?: string;
  readonly jobStatus?: number;
  readonly readStatus?: number;
}

async function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    if (request.path === URI && request.method === 'GET') {
      return xml(response, overrides.state ?? bindingState(), overrides.readStatus ?? 200);
    }
    if (request.path.endsWith('jobs') && request.method === 'POST') {
      return xml(response, overrides.job ?? '<job status="ok"/>', overrides.jobStatus ?? 200);
    }
    return xml(response, '<unexpected/>', 500);
  });
}

function run(harness: WriteHarness, args: Record<string, unknown>): Promise<ToolResult> {
  return Promise.resolve(updateServiceBinding.handler(harness.context, args));
}

const ARGS = {
  service_binding_name: 'ZUI_MY_BINDING',
  desired_publication_state: 'published',
  service_name: 'ZUI_MY_SERVICE',
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
      tools: [updateServiceBinding],
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
      }).toEqual(CAPTURED.tools['UpdateServiceBinding']);
    } finally {
      await client.close();
      await core.server.close();
    }
  });

  it('노출 선언과 정책 분류', () => {
    expect(updateServiceBinding.definition.sets).toEqual(['high']);
    expect(updateServiceBinding.definition.available_in).toEqual(['onprem', 'cloud']);
    // 발행/발행취소는 SAP 상태를 바꾼다.
    expect(updateServiceBinding.definition.kind).toBe('mutation');
    expect(updateServiceBinding.definition.targetNames).toEqual(['service_binding_name']);
  });
});

// ── 와이어 ──────────────────────────────────────────────────────────────────

describe('와이어 — 발행', () => {
  it('활성 판을 읽고 publishjobs를 세운다 (요청 둘)', async () => {
    const harness = await harnessFor({ state: bindingState({ allowedAction: 'PUBLISH' }) });
    try {
      const result = await run(harness, { ...ARGS, service_version: '0001' });
      expect(result.isError).toBe(false);

      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        `GET ${URI}`,
        'POST /sap/bc/adt/businessservices/odatav4/publishjobs',
      ]);
      expect(harness.nth(0).query.get('version')).toBe('active');

      const job = harness.nth(1);
      expect(job.query.get('servicename')).toBe('ZUI_MY_SERVICE');
      expect(job.query.get('serviceversion')).toBe('0001');
      expect(job.headers['content-type']).toBe('application/xml');
      expect(job.headers['accept']).toBe('application/vnd.sap.as+xml');
      // 벤더는 본문을 **한 줄로** 짓는다 — 공용 조립기의 줄바꿈이 없다.
      expect(job.body).toBe(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">' +
          `<adtcore:objectReference adtcore:uri="${URI}" adtcore:name="ZUI_MY_BINDING"/>` +
          '</adtcore:objectReferences>',
      );
    } finally {
      await harness.close();
    }
  });

  it('service_type=ODataV2면 주소의 종류 조각이 바뀐다', async () => {
    const harness = await harnessFor({ state: bindingState({ allowedAction: 'PUBLISH' }) });
    try {
      await run(harness, { ...ARGS, service_type: 'ODataV2' });
      expect(harness.nth(1).path).toBe('/sap/bc/adt/businessservices/odatav2/publishjobs');
    } finally {
      await harness.close();
    }
  });

  it('service_version이 없으면 serviceversion 질의 인자가 빠진다', async () => {
    const harness = await harnessFor({ state: bindingState({ allowedAction: 'PUBLISH' }) });
    try {
      await run(harness, { ...ARGS });
      expect(harness.nth(1).query.get('serviceversion')).toBeNull();
      expect(harness.nth(1).query.get('servicename')).toBe('ZUI_MY_SERVICE');
    } finally {
      await harness.close();
    }
  });
});

describe('와이어 — 발행취소', () => {
  it('allowedAction=UNPUBLISH면 unpublishjobs를 세운다', async () => {
    const harness = await harnessFor({
      state: bindingState({ published: true, allowedAction: 'UNPUBLISH' }),
    });
    try {
      const result = await run(harness, {
        ...ARGS,
        desired_publication_state: 'unpublished',
      });
      expect(result.isError).toBe(false);
      expect(harness.nth(1).path).toBe('/sap/bc/adt/businessservices/odatav4/unpublishjobs');
    } finally {
      await harness.close();
    }
  });
});

// ── 두 번째 요청이 없는 갈래 ────────────────────────────────────────────────

describe('두 번째 요청이 없는 갈래', () => {
  it('unchanged는 읽기 한 번으로 끝나고 그 응답을 답으로 쓴다', async () => {
    const harness = await harnessFor({ state: bindingState({ published: true }) });
    try {
      const result = await run(harness, {
        ...ARGS,
        desired_publication_state: 'unchanged',
      });
      expect(result.isError).toBe(false);
      expect(harness.calls()).toHaveLength(1);
      expect(jsonOf(result).desired_publication_state).toBe('unchanged');
    } finally {
      await harness.close();
    }
  });

  it('published인데 **이미 발행돼 있으면** 발행 작업을 세우지 않는다', async () => {
    const harness = await harnessFor({
      state: bindingState({ published: true, allowedAction: 'UNPUBLISH' }),
    });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(false);
      expect(harness.calls()).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });
});

// ── 상태 전이 거부 ──────────────────────────────────────────────────────────

describe('상태 전이 거부 — 요청을 보내기 전에 던진다', () => {
  it('발행이 허용되지 않으면 계약 문구로 거부한다', async () => {
    const harness = await harnessFor({ state: bindingState({ allowedAction: 'UNPUBLISH' }) });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Invalid state transition: cannot publish service binding ZUI_MY_BINDING. allowedAction=UNPUBLISH',
      );
      expect(harness.calls()).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('허용 동작 자체가 없으면 UNKNOWN으로 적는다', async () => {
    const harness = await harnessFor({ state: bindingState() });
    try {
      const result = await run(harness, { ...ARGS });
      expect(textOf(result)).toBe(
        'Error: Invalid state transition: cannot publish service binding ZUI_MY_BINDING. allowedAction=UNKNOWN',
      );
    } finally {
      await harness.close();
    }
  });

  it('발행취소가 허용되지 않으면 거부한다', async () => {
    const harness = await harnessFor({ state: bindingState({ allowedAction: 'PUBLISH' }) });
    try {
      const result = await run(harness, {
        ...ARGS,
        desired_publication_state: 'unpublished',
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'Error: Invalid state transition: cannot unpublish service binding ZUI_MY_BINDING. allowedAction=PUBLISH',
      );
      expect(harness.calls()).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });
});

// ── 응답 조립 ───────────────────────────────────────────────────────────────

describe('응답 조립', () => {
  it('service_type은 **인자 원문**을 싣고 이름은 대문자다', async () => {
    const harness = await harnessFor({ state: bindingState({ allowedAction: 'PUBLISH' }) });
    try {
      const payload = jsonOf(
        await run(harness, {
          service_binding_name: '  zui_my_binding ',
          desired_publication_state: 'published',
          service_name: ' zui_my_service ',
          service_type: 'ODataV2',
        }),
      );
      expect(payload).toEqual({
        success: true,
        service_binding_name: 'ZUI_MY_BINDING',
        desired_publication_state: 'published',
        service_type: 'ODataV2',
        service_name: 'ZUI_MY_SERVICE',
        service_version: null,
        response_format: 'xml',
        status: 200,
        payload: { job: { status: 'ok' } },
      });
    } finally {
      await harness.close();
    }
  });

  it('response_format=plain이면 원문을 그대로 싣는다', async () => {
    const harness = await harnessFor({ state: bindingState({ allowedAction: 'PUBLISH' }) });
    try {
      const payload = jsonOf(await run(harness, { ...ARGS, response_format: 'plain' }));
      expect(payload.payload).toBe('<job status="ok"/>');
    } finally {
      await harness.close();
    }
  });
});

// ── 갈래 ────────────────────────────────────────────────────────────────────

describe('갈래', () => {
  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, { ...ARGS, service_binding_name: '' });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Error: service_binding_name is required');
      expect(harness.calls()).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('빈 service_name도 요청 전에 거부된다', async () => {
    const harness = await harnessFor();
    try {
      const result = await run(harness, { ...ARGS, service_name: '' });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Error: service_name is required');
      expect(harness.calls()).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('발행 작업이 죽으면 구 return_error의 모양으로 올라간다', async () => {
    const harness = await harnessFor({
      state: bindingState({ allowedAction: 'PUBLISH' }),
      jobStatus: 400,
      job:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
        '<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAccess"/>' +
        '<message lang="EN">Service is already published</message><properties/></exc:exception>',
    });
    try {
      const result = await run(harness, { ...ARGS });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Error: SAP Error: Service is already published [HTTP 400]');
    } finally {
      await harness.close();
    }
  });
});
