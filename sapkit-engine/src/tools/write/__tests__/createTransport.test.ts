/**
 * `CreateTransport` — 발행 계약 · 와이어 한 발 · 페이로드 · 갈래 · **tier 게이트**.
 *
 * 기대값의 출처는 **구 엔진의 실측**이다:
 *  - 발행 선언  → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 주소·헤더·본문 → `@babamba2/mcp-abap-adt-clients/dist/core/transport/create.js:12-27, 60-90`
 *  - 인자 매핑  → `dist/core/transport/AdtRequest.js`의 `create()`
 *  - 응답 조립  → `engine/src/handlers/transport/high/handleCreateTransport.ts:99-184`
 *  - tier       → `engine/src/lib/readonlyGuard.ts:95-123`(읽기로 분류되지 않는다)
 *
 * **SAP에 붙지 않는다.** 시험 서버는 in-process이고 이송번호는 합성값이다.
 */

import { createTransport } from '../createTransport';
import { invoke, jsonOf, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';
import { publish, publishedDeclaration } from './classPublication';
import { cleanupTierProbeDirs, probeTier } from '../../__tests__/tierProbe';

const TR = 'DEVK900123';
const PATH = '/sap/bc/adt/cts/transportrequests';

/** `dist/constants/contentTypes.js:36`의 `ACCEPT_TRANSPORT` — **한 값**이다. */
const ACCEPT = 'application/vnd.sap.adt.transportorganizer.v1+xml';

const CREATED_XML =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">' +
  `<tm:request tm:number="${TR}" tm:desc="Fixture request" tm:type="K" tm:target="LOCAL"` +
  ' tm:target_desc="Local" tm:cts_project="" tm:uri="/sap/bc/adt/cts/transportrequests/' +
  `${TR}"><tm:task tm:owner="DEVUSER"/></tm:request></tm:root>`;

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});
afterAll(() => {
  cleanupTierProbeDirs();
});

/** 프로파일에서 담당자가 오는 자리 — 쓰기 하네스의 기본 컨텍스트는 env가 비어 있다. */
function withUser(user = 'DEVUSER') {
  return { ...harness.context, env: { SAP_USERNAME: user } };
}

describe('발행 계약 — 채록본과 글자 일치', () => {
  it('tools/list의 네 필드가 구 번들과 같다', async () => {
    const published = await publish(createTransport);
    const expected = publishedDeclaration('CreateTransport');

    expect(published.name).toBe(expected.name);
    expect(published.description).toBe(expected.description);
    expect(published.inputSchema).toEqual(expected.inputSchema);
    expect(published.execution).toEqual(expected.execution);
  });

  it('sets · available_in · kind · targetNames', () => {
    // 구 경로는 `handlers/transport/high/`이고 채록본 exposures에서도
    // connected_default·noProfile_default 둘에만 뜬다.
    expect(createTransport.definition.sets).toEqual(['high']);
    expect(createTransport.definition.available_in).toEqual(['onprem', 'cloud']);
    // 구 `readonlyGuard`는 `Create*`를 읽기로 분류하지 않아 DEV 밖에서 전부 막았다.
    expect(createTransport.definition.kind).toBe('mutation');
    // 이 도구는 대상 객체 이름을 아예 받지 않는다 — 설명·대상시스템·소유자뿐이다.
    expect(createTransport.definition.targetNames).toEqual([]);
  });
});

describe('와이어 — 요청 생성 POST 한 발', () => {
  it('주소·메서드·Accept·Content-Type', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    await createTransport.handler(withUser(), { description: 'Fixture request' });

    expect(harness.calls()).toHaveLength(1);
    const sent = harness.nth(0);
    expect(sent.method).toBe('POST');
    expect(sent.path).toBe(PATH);
    expect(sent.query.toString()).toBe('');
    expect(sent.headers.accept).toBe(ACCEPT);
    expect(sent.headers['content-type']).toBe('text/plain');
  });

  it('페이로드는 벤더 템플릿 글자 그대로다 (줄바꿈·들여쓰기 포함)', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    await createTransport.handler(withUser(), { description: 'Fixture request' });

    expect(harness.nth(0).body).toBe(
      '<?xml version="1.0" encoding="ASCII"?>\n' +
        '<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n' +
        '  <tm:request tm:desc="Fixture request" tm:type="K" tm:target="LOCAL" tm:cts_project="">\n' +
        '    <tm:task tm:owner="DEVUSER"/>\n' +
        '  </tm:request>\n' +
        '</tm:root>',
    );
  });

  it("transport_type='customizing'이면 tm:type이 T다", async () => {
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    await createTransport.handler(withUser(), {
      description: 'Fixture request',
      transport_type: 'customizing',
    });

    expect(harness.nth(0).body).toContain('tm:type="T"');
  });

  it('target_system은 앞뒤 슬래시로 감싸 나가고, 공백뿐이면 LOCAL이다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    await createTransport.handler(withUser(), {
      description: 'Fixture request',
      target_system: 'PRD',
    });
    expect(harness.nth(0).body).toContain('tm:target="/PRD/"');
    await harness.close();

    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    await createTransport.handler(withUser(), {
      description: 'Fixture request',
      target_system: '   ',
    });
    expect(harness.nth(0).body).toContain('tm:target="LOCAL"');
  });

  it('owner 인자가 프로파일 담당자를 이긴다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    await createTransport.handler(withUser(), {
      description: 'Fixture request',
      owner: 'OTHERUSER',
    });

    expect(harness.nth(0).body).toContain('tm:task tm:owner="OTHERUSER"');
  });

  it('SAP_RESPONSIBLE이 SAP_USERNAME을 이긴다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    await createTransport.handler(
      { ...harness.context, env: { SAP_USERNAME: 'DEVUSER', SAP_RESPONSIBLE: 'OWNER' } },
      { description: 'Fixture request' },
    );

    expect(harness.nth(0).body).toContain('tm:task tm:owner="OWNER"');
  });
});

describe('응답 — 구의 키 + 이송번호 수리(D81)', () => {
  it('생성된 이송번호를 싣는다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    const result = await createTransport.handler(withUser(), { description: 'Fixture request' });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content.map((item) => item.text).join(''))).toEqual({
      success: true,
      transport_request: TR,
      description: 'Fixture request',
      type: 'K',
      target_system: 'LOCAL',
      target_desc: 'Local',
      cts_project: '',
      owner: 'DEVUSER',
      uri: `/sap/bc/adt/cts/transportrequests/${TR}`,
      message: `Transport request ${TR} created successfully`,
    });
  });

  it('구는 이 자리에서 번호를 잃었다 — 그 모양이 되살아나지 않는지 못박는다', async () => {
    // 구는 `transportInfo.transport_number`를 읽는데 벤더가 준 객체의 키는
    // `transport_request`였고, 폴백으로 쓰는 지역 변수 `transportNumber`는
    // 선언만 되고 값이 들어간 적이 없다(`handleCreateTransport.ts:106, 151-153,
    // 162-175`). 그래서 `transport_request` 키가 통째로 빠지고 message가
    // "Transport request unknown created successfully"였다.
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    const result = await createTransport.handler(withUser(), { description: 'Fixture request' });

    expect(textOf(result)).not.toContain('unknown created successfully');
  });
});

describe('갈래 — 구의 관측 문구', () => {
  it('description이 비면 요청을 보내지 않는다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    const result = await invoke(createTransport, harness, { description: '' });

    expect(result.isError).toBe(true);
    // 구는 `MCP error -32602: Transport description is required`였다(D34).
    expect(textOf(result)).toBe('Transport description is required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('담당자를 어디서도 못 구하면 요청 전에 거절한다', async () => {
    // 벤더 `createTransport`가 `owner`가 없으면 요청을 보내기 전에 던진다
    // (`create.js:66-70`). 구 핸들러가 그것을 한 겹 더 감싼다.
    harness = await startWriteHarness((_request, response) => xml(response, CREATED_XML));
    const result = await invoke(createTransport, harness, { description: 'Fixture request' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Failed to create transport: Cannot create transport request: owner is required. Please provide owner in params.',
    );
    expect(harness.calls()).toHaveLength(0);
  });

  it('tm:root가 없으면 문구가 두 겹으로 감싸인다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, '<weird/>'));
    const result = await createTransport.handler(withUser(), { description: 'Fixture request' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Failed to create transport: Failed to create transport request: ' +
        'Invalid transport response XML structure - no tm:root found',
    );
  });

  it('번호가 없는 응답은 성공으로 접지 않는다', async () => {
    // 벤더 `AdtRequest.create()`가 번호 없는 응답을 오류로 뒤집는다.
    const noNumber =
      '<?xml version="1.0"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">' +
      '<tm:request tm:desc="x"/></tm:root>';
    harness = await startWriteHarness((_request, response) => xml(response, noNumber));
    const result = await createTransport.handler(withUser(), { description: 'Fixture request' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Failed to create transport: Failed to create transport request: transport number not returned',
    );
  });

  it('HTTP 실패는 응답 본문을 두 겹 안에 싣는다', async () => {
    harness = await startWriteHarness((_request, response) =>
      xml(response, '<err>boom</err>', 500),
    );
    const result = await createTransport.handler(withUser(), { description: 'Fixture request' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Failed to create transport: Failed to create transport request: ');
    expect(textOf(result)).toContain('<err>boom</err>');
  });
});

describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
  it.each(['QA', 'PRD'])('%s tier에서 거부한다', async (tier) => {
    const probe = await probeTier(createTransport, tier, { description: 'Fixture request' });

    expect(probe.isError).toBe(true);
    expect(probe.text).toContain('ERR_READONLY_TIER');
    expect(probe.text).toContain('mutates SAP objects');
    expect(probe.connections).toBe(0);
  });

  it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
    const probe = await probeTier(createTransport, '', { description: 'Fixture request' });

    expect(probe.isError).toBe(true);
    expect(probe.text).toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(0);
  });

  it('DEV에서는 게이트를 지나 접속까지 간다 (과수리 역검증)', async () => {
    const probe = await probeTier(createTransport, 'DEV', { description: 'Fixture request' });

    expect(probe.connections).toBe(1);
    expect(probe.text).not.toContain('ERR_READONLY_TIER');
  });
});
