/**
 * `DeleteClass` — 발행 계약 · 삭제 서비스 두 걸음의 와이어 · 거짓 성공 판정 ·
 * tier 게이트 음성시험.
 *
 * 기대값은 **구의 실측**에서 뽑았다(이 시험이 내 구현을 다시 읽어 만든 값이
 * 아니라는 뜻이다):
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteClass`
 *  - 겉 핸들러: `engine/src/handlers/class/high/handleDeleteClass.ts:16-135`
 *  - 사슬: `@babamba2/mcp-abap-adt-clients/dist/core/class/AdtClass.js`의 `delete()`
 *  - 두 걸음의 주소·헤더·전문: `.../dist/core/class/delete.js:19-88`
 *  - 콘텐츠 타입 4종: `.../dist/constants/contentTypes.js:26-29`
 *  - 거짓 성공 판정: `.../dist/utils/internalUtils.js`의 `assertDeletionSucceeded`
 *
 * **이 시험은 「실제로 지운다」를 증명하지 않는다.** 삭제는 재생 대조가 원리상
 * 불가능하고(두 번째 실행은 "없다"로 실패한다) 이 판은 SAP에 붙지 않으므로,
 * 여기서 증명되는 것은 "구와 같은 바이트를 보낸다"까지다.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createServerCore, resolveStartup } from '../../../server';
import type { ToolResult } from '../../../server';
import { cleanupTierProbeDirs, probeTier } from '../../__tests__/tierProbe';
import { deleteClass } from '../deleteClass';
import {
  type WriteHarness,
  adtException,
  jsonOf,
  startWriteHarness,
  textOf,
  xml,
} from './harness';

const NAME = 'ZCL_MY_CLASS';
const OBJECT_URI = `/sap/bc/adt/oo/classes/${NAME}`;
const CHECK = '/sap/bc/adt/deletion/check';
const DELETE = '/sap/bc/adt/deletion/delete';

/** 삭제 서비스가 성공을 알리는 모양. */
function deletedBody(uri = OBJECT_URI): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object adtcore:uri="${uri}" del:isDeleted="true"/>` +
    '</del:deletionResult>'
  );
}

/** 실패를 **HTTP 200에 실어** 보내는 모양 — 이 계열의 거짓 성공 함정. */
function notDeletedBody(text?: string): string {
  const message = text
    ? `<del:message><del:text>${text}</del:text></del:message>`
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object adtcore:uri="${OBJECT_URI}" del:isDeleted="false">${message}</del:object>` +
    '</del:deletionResult>'
  );
}

interface Overrides {
  readonly checkStatus?: number;
  readonly checkBody?: string;
  readonly deleteStatus?: number;
  readonly deleteBody?: string;
}

async function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    if (request.path === CHECK) {
      return xml(response, overrides.checkBody ?? '<del:checkResult/>', overrides.checkStatus ?? 200);
    }
    if (request.path === DELETE) {
      return xml(response, overrides.deleteBody ?? deletedBody(), overrides.deleteStatus ?? 200);
    }
    return xml(response, '<unexpected/>', 500);
  });
}

function run(harness: WriteHarness, args: Record<string, unknown>): Promise<ToolResult> {
  return Promise.resolve(deleteClass.handler(harness.context, args));
}

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});
afterAll(() => {
  cleanupTierProbeDirs();
});

// ── 발행 계약 ───────────────────────────────────────────────────────────────

const CAPTURED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json'), 'utf8'),
) as { tools: Record<string, unknown>; exposures: Record<string, { names: string[] }> };

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
      tools: [deleteClass],
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
      }).toEqual(CAPTURED.tools['DeleteClass']);
    } finally {
      await client.close();
      await core.server.close();
    }
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteClass.definition.sets).toEqual(['high']);
    expect(deleteClass.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(deleteClass.definition.kind).toBe('mutation');
    expect(deleteClass.definition.targetNames).toEqual(['class_name']);
  });

  it('채록본의 4개 노출 조건 소속과 어긋나지 않는다 — 읽기 표면에는 없다', () => {
    const memberships = Object.entries(CAPTURED.exposures)
      .filter(([, value]) => value.names.includes('DeleteClass'))
      .map(([key]) => key)
      .sort();
    expect(memberships).toEqual(['connected_default', 'noProfile_default']);
  });
});

// ── 와이어 ──────────────────────────────────────────────────────────────────

describe('와이어 — 검사 → 삭제 두 걸음', () => {
  it('두 요청을 순서대로 보내고 이름은 대문자 그대로 URI에 실린다', async () => {
    harness = await harnessFor();
    const result = await run(harness, { class_name: 'zcl_my_class' });
    expect(result.isError).toBe(false);

    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${CHECK}`,
      `POST ${DELETE}`,
    ]);
    expect(harness.nth(0).body).toContain(`adtcore:uri="${OBJECT_URI}"`);
    expect(harness.nth(1).body).toContain(`adtcore:uri="${OBJECT_URI}"`);
  });

  it('검사 걸음의 헤더와 전문이 구와 같다', async () => {
    harness = await harnessFor();
    await run(harness, { class_name: NAME });

    const check = harness.nth(0);
    expect(check.headers['content-type']).toBe(
      'application/vnd.sap.adt.deletion.check.request.v1+xml',
    );
    expect(check.headers['accept']).toBe(
      'application/vnd.sap.adt.deletion.check.response.v1+xml',
    );
    expect(check.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        `  <del:object adtcore:uri="${OBJECT_URI}"/>\n` +
        '</del:checkRequest>',
    );
  });

  it('삭제 걸음의 헤더와 전문이 구와 같고 이송번호가 실린다', async () => {
    harness = await harnessFor();
    await run(harness, { class_name: NAME, transport_request: 'E19K905635' });

    const remove = harness.nth(1);
    expect(remove.headers['content-type']).toBe('application/vnd.sap.adt.deletion.request.v1+xml');
    expect(remove.headers['accept']).toBe('application/vnd.sap.adt.deletion.response.v1+xml');
    expect(remove.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
        `  <del:object adtcore:uri="${OBJECT_URI}">\n` +
        '    <del:transportNumber>E19K905635</del:transportNumber>\n' +
        '  </del:object>\n' +
        '</del:deletionRequest>',
    );
  });

  it('이송번호가 없거나 공백뿐이면 **빈 태그**가 나간다', async () => {
    harness = await harnessFor();
    await run(harness, { class_name: NAME });
    expect(harness.nth(1).body).toContain('<del:transportNumber/>');

    await run(harness, { class_name: NAME, transport_request: '   ' });
    expect(harness.nth(3).body).toContain('<del:transportNumber/>');
  });

  it('삭제 걸음만 stateful 세션으로 나간다 (구 AdtClass.delete)', async () => {
    harness = await harnessFor();
    await run(harness, { class_name: NAME });

    expect(harness.nth(0).headers['x-sap-adt-sessiontype']).toBeUndefined();
    expect(harness.nth(1).headers['x-sap-adt-sessiontype']).toBe('stateful');
    // finally에서 되돌린다 — 다음 호출의 검사 걸음이 다시 stateless다.
    await run(harness, { class_name: NAME });
    expect(harness.nth(2).headers['x-sap-adt-sessiontype']).toBeUndefined();
  });

  it('성공 응답은 구의 네 칸 그대로다', async () => {
    harness = await harnessFor();
    const payload = jsonOf(await run(harness, { class_name: NAME, transport_request: 'E19K905635' }));
    expect(payload).toEqual({
      success: true,
      class_name: NAME,
      transport_request: 'E19K905635',
      message: `Class ${NAME} deleted successfully.`,
    });
  });

  it('이송번호를 안 주면 응답의 그 칸은 null이다', async () => {
    harness = await harnessFor();
    expect(jsonOf(await run(harness, { class_name: NAME })).transport_request).toBeNull();
  });
});

// ── 거짓 성공 판정 ──────────────────────────────────────────────────────────

describe('HTTP 200에 실려 온 삭제 실패를 성공으로 접지 않는다', () => {
  it('isDeleted="false"면 실패다 — 이유 문구를 그대로 싣는다', async () => {
    harness = await harnessFor({ deleteBody: notDeletedBody('Object is used by ZCL_OTHER') });
    const result = await run(harness, { class_name: NAME });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to delete class: Class deletion failed: Object is used by ZCL_OTHER',
    );
  });

  it('이유 문구가 없으면 구의 기본 문구로 떨어진다', async () => {
    harness = await harnessFor({ deleteBody: notDeletedBody() });
    const result = await run(harness, { class_name: NAME });
    expect(textOf(result)).toBe(
      'Error: Failed to delete class: Class deletion failed: the deletion service reported isDeleted="false"',
    );
  });

  it('여러 del:object 중 하나만 false여도 실패다', async () => {
    harness = await harnessFor({
      deleteBody:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
        `<del:object adtcore:uri="${OBJECT_URI}" del:isDeleted="true"/>` +
        `<del:object adtcore:uri="${OBJECT_URI}#x" del:isDeleted="false"/>` +
        '</del:deletionResult>',
    });
    expect((await run(harness, { class_name: NAME })).isError).toBe(true);
  });

  it('deletionResult를 말하지 않는 본문은 판정하지 않는다 (구와 같은 유보)', async () => {
    harness = await harnessFor({ deleteBody: '<del:somethingElse/>' });
    expect((await run(harness, { class_name: NAME })).isError).toBe(false);
  });
});

// ── 갈래 ────────────────────────────────────────────────────────────────────

describe('갈래', () => {
  it('class_name이 없으면 요청을 하나도 보내지 않는다', async () => {
    harness = await harnessFor();
    const result = await run(harness, {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: class_name is required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('404는 "이미 지워졌을 수 있다"로 답한다', async () => {
    harness = await harnessFor({ checkStatus: 404, checkBody: '<not-found/>' });
    const result = await run(harness, { class_name: NAME });
    expect(textOf(result)).toBe(`Error: Class ${NAME} not found. It may already be deleted.`);
  });

  it('423은 남의 잠금이다', async () => {
    harness = await harnessFor({ deleteStatus: 423, deleteBody: '<locked/>' });
    const result = await run(harness, { class_name: NAME });
    expect(textOf(result)).toBe(
      `Error: Class ${NAME} is locked by another user. Cannot delete.`,
    );
  });

  it('400은 이송번호를 되묻는다 — **예외 XML보다 상태 코드가 먼저다**', async () => {
    harness = await harnessFor({
      deleteStatus: 400,
      deleteBody: adtException('ExceptionResourceNoAccess', 'Transport request required'),
    });
    const result = await run(harness, { class_name: NAME });
    expect(textOf(result)).toBe(
      'Error: Bad request. Check if transport request is required and valid.',
    );
  });

  it('그 밖의 상태에서는 예외 XML의 문구를 SAP Error로 싣는다', async () => {
    harness = await harnessFor({
      deleteStatus: 500,
      deleteBody: adtException('ExceptionInternal', 'Deletion service unavailable'),
    });
    const result = await run(harness, { class_name: NAME });
    expect(textOf(result)).toBe('Error: SAP Error: Deletion service unavailable');
  });
});

// ── 안전 음성시험 ───────────────────────────────────────────────────────────

describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
  it.each(['QA', 'PRD'])('%s tier에서 거부한다', async (tier) => {
    const probe = await probeTier(deleteClass, tier, { class_name: NAME });

    expect(probe.isError).toBe(true);
    expect(probe.text).toContain('ERR_READONLY_TIER');
    expect(probe.text).toContain('mutates SAP objects');
    expect(probe.connections).toBe(0);
  });

  it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
    const probe = await probeTier(deleteClass, '', { class_name: NAME });

    expect(probe.isError).toBe(true);
    expect(probe.text).toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(0);
  });

  it('DEV에서는 게이트를 지나 접속까지 간다 (과수리 역검증)', async () => {
    const probe = await probeTier(deleteClass, 'DEV', { class_name: NAME });

    expect(probe.connections).toBe(1);
    expect(probe.text).not.toContain('ERR_READONLY_TIER');
  });
});
