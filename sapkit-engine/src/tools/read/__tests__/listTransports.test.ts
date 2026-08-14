/**
 * `ListTransports` — 발행 계약 · 노출 선언 · 와이어 한 발 · 갈래 · tier.
 *
 * 기대값의 출처는 **구 엔진의 실측**이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 와이어    → `@babamba2/mcp-abap-adt-clients/dist/core/transport/list.js:14-31`
 *                + `dist/core/transport/AdtRequest.js`의 `list()`
 *  - Accept    → `dist/constants/contentTypes.js:37`(`ACCEPT_TRANSPORT_LIST`)
 *  - 파싱·응답 → `engine/src/handlers/transport/readonly/handleListTransports.ts`
 *
 * **SAP에 붙지 않는다.** 이송번호는 전부 합성값이다.
 */

import { listTransports } from '../listTransports';
import { cleanupTierProbeDirs, probeTier } from '../../__tests__/tierProbe';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

const ROOT = '/sap/bc/adt/cts/transportrequests';

/** `dist/constants/contentTypes.js:37` — 한 값뿐이다(`GetTransport`의 두 값과 다르다). */
const ACCEPT = 'application/vnd.sap.adt.transportorganizertree.v1+xml';

const NS = 'xmlns:tm="http://www.sap.com/cts/adt/tm"';

function request(number: string, extra = ''): string {
  return (
    `<tm:request tm:number="${number}" tm:desc="Fixture ${number}" tm:type="K"` +
    ` tm:status="D" tm:owner="FIXTURE" tm:target="LOCAL" tm:source_client="100"${extra}/>`
  );
}

/** workbench(modifiable+released) + customizing(modifiable) — 네 자리 중 셋을 채운다. */
const LIST_XML =
  `<?xml version="1.0" encoding="utf-8"?><tm:root ${NS}>` +
  `<tm:workbench><tm:modifiable>${request('DEVK900123')}</tm:modifiable>` +
  `<tm:released>${request('DEVK900001')}</tm:released></tm:workbench>` +
  `<tm:customizing><tm:modifiable>${request('DEVK900555')}</tm:modifiable></tm:customizing>` +
  '</tm:root>';

/** 뿌리 밑에 평평하게 달린 back-compat 모양. */
const FLAT_XML = `<?xml version="1.0" encoding="utf-8"?><tm:root ${NS}>${request('DEVK900777')}</tm:root>`;

afterAll(() => {
  cleanupTempDirs();
  cleanupTierProbeDirs();
});

async function call(args: Record<string, unknown>, reply: Parameters<typeof runTool>[2]) {
  const { outcome, requests } = await runTool(listTransports, args, reply);
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약 — 채록본과 글자 일치', () => {
  it('tools/list의 네 필드가 구 번들과 같다', async () => {
    const harness = await harnessFor(listTransports);
    try {
      const listed = await harness.client.listTools();
      const published = listed.tools.find((tool) => tool.name === 'ListTransports');
      expect(published).toBeDefined();

      const expected = publishedDeclaration('ListTransports');
      expect(published?.name).toBe(expected.name);
      expect(published?.description).toBe(expected.description);
      expect(published?.inputSchema).toEqual(expected.inputSchema);
      expect((published as { execution?: unknown })?.execution).toEqual(expected.execution);
    } finally {
      await harness.close();
    }
  });
});

describe('노출 선언', () => {
  it('sets · available_in · kind', () => {
    expect(listTransports.definition.sets).toEqual(['readonly']);
    expect(listTransports.definition.available_in).toEqual(['onprem', 'cloud']);
    // 구 `readonlyGuard`의 READ_PREFIXES에 `List`가 있어 읽기다
    // (`engine/src/lib/readonlyGuard.ts:42-54`).
    expect(listTransports.definition.kind).toBe('read');
  });
});

describe('와이어 — 목록 GET 한 발', () => {
  it('user는 프로파일에서 오고 modifiable_only 기본값이 status=D를 붙인다', async () => {
    const { outcome, sent } = await call({}, () => ({ status: 200, body: LIST_XML }));

    expect(outcome.isError).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    const url = new URL(sent[0]?.url ?? '');
    expect(url.pathname).toBe(ROOT);
    // 프로파일의 SAP_USERNAME이 FIXTURE다(`__tests__/support.ts`).
    expect(url.searchParams.get('user')).toBe('FIXTURE');
    expect(url.searchParams.get('status')).toBe('D');
    expect(sent[0]?.headers['Accept']).toBe(ACCEPT);
    expect(sent[0]?.body).toBeUndefined();
  });

  it('user 인자가 프로파일을 이긴다', async () => {
    const { sent } = await call({ user: 'OTHERUSER' }, () => ({ status: 200, body: LIST_XML }));

    expect(new URL(sent[0]?.url ?? '').searchParams.get('user')).toBe('OTHERUSER');
  });

  it('modifiable_only=false면 status 인자가 아예 빠진다', async () => {
    const { sent } = await call({ modifiable_only: false }, () => ({
      status: 200,
      body: LIST_XML,
    }));

    expect(new URL(sent[0]?.url ?? '').searchParams.has('status')).toBe(false);
  });
});

describe('파싱 — 네 자리를 전부 훑는다', () => {
  it('workbench·customizing × modifiable·released를 모아 온다', async () => {
    const { outcome } = await call({}, () => ({ status: 200, body: LIST_XML }));

    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      count: 3,
      transports: [
        {
          number: 'DEVK900123',
          description: 'Fixture DEVK900123',
          type: 'K',
          status: 'D',
          owner: 'FIXTURE',
          target: 'LOCAL',
        },
        {
          number: 'DEVK900001',
          description: 'Fixture DEVK900001',
          type: 'K',
          status: 'D',
          owner: 'FIXTURE',
          target: 'LOCAL',
        },
        {
          number: 'DEVK900555',
          description: 'Fixture DEVK900555',
          type: 'K',
          status: 'D',
          owner: 'FIXTURE',
          target: 'LOCAL',
        },
      ],
    });
  });

  it('뿌리 밑 평평한 모양도 back-compat로 받는다', async () => {
    const { outcome } = await call({}, () => ({ status: 200, body: FLAT_XML }));

    const payload = JSON.parse(outcome.text) as { count: number; transports: Array<{ number: string }> };
    expect(payload.count).toBe(1);
    expect(payload.transports[0]?.number).toBe('DEVK900777');
  });

  it('번호가 없는 항목은 버린다', async () => {
    const xml = `<?xml version="1.0"?><tm:root ${NS}><tm:workbench><tm:modifiable>` +
      '<tm:request tm:desc="번호 없음"/>' +
      '</tm:modifiable></tm:workbench></tm:root>';
    const { outcome } = await call({}, () => ({ status: 200, body: xml }));

    expect(JSON.parse(outcome.text)).toEqual({ success: true, count: 0, transports: [] });
  });

  it('알아볼 수 없는 XML은 빈 목록이다', async () => {
    const { outcome } = await call({}, () => ({ status: 200, body: '<weird/>' }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({ success: true, count: 0, transports: [] });
  });
});

describe('갈래', () => {
  it('HTTP 실패는 Error: 접두사가 붙는다', async () => {
    const { outcome } = await call({}, () => ({ status: 500, body: '<boom/>' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: /);
  });
});

describe('tier 게이트 — 읽기는 전 등급에서 지난다 (구 승계)', () => {
  it.each(['QA', 'PRD', ''])('tier=%s에서도 게이트를 지난다', async (tier) => {
    const probe = await probeTier(listTransports, tier, {});

    expect(probe.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });
});
