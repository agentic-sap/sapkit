/**
 * `GetTransport` — 발행 계약 · 노출 선언 · 와이어 두 갈래 · tier.
 *
 * 기대값의 출처는 **구 엔진의 실측**이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 두 엔드포인트의 의미 → `engine/src/handlers/transport/readonly/handleGetTransport.ts:1-20`
 *  - Accept  → 같은 파일 `:33-34`
 *  - tier    → `engine/src/lib/readonlyGuard.ts:42-54, 95-100`(`Get` 접두사 = 읽기)
 *
 * **SAP에 붙지 않는다** — 전송을 주입해 끊는다. 이송번호는 전부 합성값이다.
 */

import { getTransport } from '../getTransport';
import { cleanupTierProbeDirs, probeTier } from '../../__tests__/tierProbe';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

const TR = 'DEVK900123';
const TASK = 'DEVK900124';
const ROOT = '/sap/bc/adt/cts/transportrequests';

/** `handleGetTransport.ts:33-34` — 두 미디어 타입을 쉼표로 이은 한 줄. */
const ACCEPT =
  'application/vnd.sap.adt.transportorganizer.v1+xml, application/vnd.sap.adt.transportorganizertree.v1+xml';

const NS =
  'xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core"';

const OBJECT =
  '<tm:abap_object tm:name="ZCL_FIXTURE" tm:type="CLAS/OC" tm:wbtype="CLAS/OC" tm:pgmid="R3TR"' +
  ' tm:obj_desc="Fixture class" tm:position="1" tm:lock_status="X" tm:obj_info="info"/>';

const REQUEST_NODE =
  `<tm:request tm:number="${TR}" tm:desc="Fixture request" tm:type="K" tm:status="D"` +
  ' tm:status_text="Modifiable" tm:owner="FIXTURE" tm:target="LOCAL" tm:target_desc="Local"' +
  ' tm:source_client="100" tm:cts_project="" tm:cts_project_desc="">' +
  `<tm:all_objects>${OBJECT}</tm:all_objects>` +
  `<tm:task tm:number="${TASK}" tm:parent="${TR}" tm:desc="Fixture task" tm:type="T"` +
  ' tm:status="D" tm:status_text="Modifiable" tm:owner="FIXTURE" tm:target="LOCAL"' +
  ` tm:source_client="100">${OBJECT}</tm:task>` +
  '</tm:request>';

/** S/4 — 경로 읽기가 그 이송을 그대로 돌려준다(`adtcore:name`이 이송번호). */
const SINGLE_TR_XML = `<?xml version="1.0" encoding="utf-8"?><tm:root ${NS} adtcore:name="${TR}">${REQUEST_NODE}</tm:root>`;

/** ECC — 경로 읽기가 **세션 사용자 목록**을 돌려준다(`adtcore:name`이 사용자). */
function listXml(user: string, inner = REQUEST_NODE): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><tm:root ${NS} adtcore:name="${user}">` +
    `<tm:workbench><tm:modifiable>${inner}</tm:modifiable></tm:workbench></tm:root>`
  );
}

/** 그 이송이 없는 목록. */
const EMPTY_LIST_XML = listXml('FIXTURE', '');

afterAll(() => {
  cleanupTempDirs();
  cleanupTierProbeDirs();
});

async function call(args: Record<string, unknown>, reply: Parameters<typeof runTool>[2]) {
  const { outcome, requests } = await runTool(getTransport, args, reply);
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약 — 채록본과 글자 일치', () => {
  it('tools/list의 네 필드가 구 번들과 같다', async () => {
    const harness = await harnessFor(getTransport);
    try {
      const listed = await harness.client.listTools();
      const published = listed.tools.find((tool) => tool.name === 'GetTransport');
      expect(published).toBeDefined();

      const expected = publishedDeclaration('GetTransport');
      expect(published?.name).toBe(expected.name);
      expect(published?.description).toBe(expected.description);
      expect(published?.inputSchema).toEqual(expected.inputSchema);
      expect((published as { execution?: unknown })?.execution).toEqual(expected.execution);
    } finally {
      await harness.close();
    }
  });
});

describe('노출 선언 — 이송 계열의 읽기 쪽', () => {
  it('sets · available_in · kind', () => {
    // 구 경로는 `handlers/transport/readonly/`이고 채록본 exposures 네 조건 전부에 뜬다.
    expect(getTransport.definition.sets).toEqual(['readonly']);
    expect(getTransport.definition.available_in).toEqual(['onprem', 'cloud']);
    // 구 `readonlyGuard`의 READ_PREFIXES에 `Get`이 있어 QA·PRD에서도 통과한다.
    expect(getTransport.definition.kind).toBe('read');
  });

  it('대상-이름 선언이 없다 — 이송번호는 Z·Y 검사가 성립하지 않는다', () => {
    // `harness/targetGuard.ts`의 `isCustomerObject`는 Z·Y로 시작하는지만 본다.
    // 이송번호(DEVK900123 꼴)를 선언하면 녹화가 통째로 사전 검사에 막힌다.
    expect(getTransport.definition.targetNames).toBeUndefined();
  });
});

describe('와이어 — 경로 읽기 먼저', () => {
  it('GET /sap/bc/adt/cts/transportrequests/<번호> + 두 값짜리 Accept', async () => {
    const { outcome, sent } = await call({ transport_number: TR }, () => ({
      status: 200,
      body: SINGLE_TR_XML,
    }));

    expect(outcome.isError).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(new URL(sent[0]?.url ?? '').pathname).toBe(`${ROOT}/${TR}`);
    expect(new URL(sent[0]?.url ?? '').search).toBe('');
    expect(sent[0]?.headers['Accept']).toBe(ACCEPT);
  });

  it('S/4 단일 응답은 single-tr 시야로 읽는다', async () => {
    const { outcome } = await call({ transport_number: TR }, () => ({
      status: 200,
      body: SINGLE_TR_XML,
    }));

    const payload = JSON.parse(outcome.text) as Record<string, any>;
    expect(payload.success).toBe(true);
    expect(payload.transport_number).toBe(TR);
    expect(payload.resolved_via).toBe('path');
    expect(payload.view_type).toBe('single-tr');
    expect(payload.owner_scope).toBe('FIXTURE');
    expect(payload.transport).toMatchObject({
      number: TR,
      description: 'Fixture request',
      type: 'K',
      status: 'D',
      owner: 'FIXTURE',
      target_system: 'LOCAL',
      client: 100,
    });
    expect(payload.object_count).toBe(1);
    expect(payload.objects[0]).toMatchObject({ name: 'ZCL_FIXTURE', type: 'CLAS/OC' });
    expect(payload.task_count).toBe(1);
    expect(payload.tasks[0]).toMatchObject({ number: TASK, parent: TR });
  });

  it('ECC 경로 응답(사용자 목록)은 list 시야로 읽는다', async () => {
    const { outcome, sent } = await call({ transport_number: TR }, () => ({
      status: 200,
      body: listXml('FIXTURE'),
    }));

    // 경로 읽기 하나로 끝난다 — 목록 안에 그 이송이 있으므로 폴백이 없다.
    expect(sent).toHaveLength(1);
    const payload = JSON.parse(outcome.text) as Record<string, unknown>;
    expect(payload.resolved_via).toBe('path');
    expect(payload.view_type).toBe('list');
  });

  it('include_objects=false · include_tasks=false면 두 목록이 빠진다', async () => {
    const { outcome } = await call(
      { transport_number: TR, include_objects: false, include_tasks: false },
      () => ({ status: 200, body: SINGLE_TR_XML }),
    );

    const payload = JSON.parse(outcome.text) as Record<string, unknown>;
    expect(payload.objects).toBeUndefined();
    expect(payload.tasks).toBeUndefined();
    expect(payload.object_count).toBe(0);
    expect(payload.task_count).toBe(0);
  });
});

describe('와이어 — owner 폴백 (ECC 교차 사용자)', () => {
  it('경로 읽기가 못 찾고 owner가 세션 사용자와 다르면 목록으로 한 발 더', async () => {
    const { outcome, sent } = await call({ transport_number: TR, owner: 'OTHERUSER' }, (request) =>
      new URL(request.url).searchParams.get('user')
        ? { status: 200, body: listXml('OTHERUSER') }
        : { status: 200, body: EMPTY_LIST_XML },
    );

    expect(sent).toHaveLength(2);
    expect(new URL(sent[1]?.url ?? '').pathname).toBe(ROOT);
    expect(new URL(sent[1]?.url ?? '').searchParams.get('user')).toBe('OTHERUSER');
    expect(sent[1]?.headers['Accept']).toBe(ACCEPT);

    const payload = JSON.parse(outcome.text) as Record<string, unknown>;
    expect(payload.resolved_via).toBe('list');
    expect(payload.owner_scope).toBe('OTHERUSER');
  });

  it('owner가 세션 사용자와 같으면 폴백하지 않는다', async () => {
    // 프로파일의 SAP_USERNAME이 FIXTURE다(`__tests__/support.ts`).
    const { outcome, sent } = await call({ transport_number: TR, owner: 'FIXTURE' }, () => ({
      status: 200,
      body: EMPTY_LIST_XML,
    }));

    expect(sent).toHaveLength(1);
    expect(outcome.isError).toBe(true);
  });
});

describe('갈래 — 구의 관측 문구', () => {
  it('transport_number가 비면 요청을 보내지 않는다', async () => {
    const { outcome, sent } = await call({ transport_number: '' }, () => ({
      status: 200,
      body: SINGLE_TR_XML,
    }));

    expect(outcome.isError).toBe(true);
    // 구는 `MCP error -32602: Transport number is required`였다 — 접두사가 빠지는
    // 것은 등재된 축소분이다(`harness/DIVERGENCES.md` D34).
    expect(outcome.text).toBe('Transport number is required');
    expect(sent).toHaveLength(0);
  });

  it('못 찾으면 owner를 넘기라고 안내한다', async () => {
    const { outcome } = await call({ transport_number: TR }, () => ({
      status: 200,
      body: EMPTY_LIST_XML,
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      `Transport ${TR} not found via path read. If this TR belongs to a different user, pass 'owner'.`,
    );
  });

  it('owner를 줬는데도 못 찾으면 그 사실이 문구에 남는다', async () => {
    const { outcome } = await call({ transport_number: TR, owner: 'OTHERUSER' }, () => ({
      status: 200,
      body: EMPTY_LIST_XML,
    }));

    expect(outcome.text).toBe(
      `Transport ${TR} not found via path read or owner=OTHERUSER list. If this TR belongs to a different user, pass 'owner'.`,
    );
  });

  it('tm:root가 없는 XML은 구조 오류다', async () => {
    const { outcome } = await call({ transport_number: TR }, () => ({
      status: 200,
      body: '<weird/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Invalid transport XML structure - no tm:root found');
  });

  it('HTTP 실패는 Error: 접두사가 붙는다', async () => {
    const { outcome } = await call({ transport_number: TR }, () => ({
      status: 500,
      body: '<boom/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: /);
  });
});

describe('tier 게이트 — 읽기는 전 등급에서 지난다 (구 승계)', () => {
  // 구 `readonlyGuard`의 READ_PREFIXES에 `Get`이 있으므로 QA·PRD·미해석에서도
  // 막히지 않는다. **접속까지 간다**는 것이 그 증거다(공장이 1회 불린다).
  it.each(['QA', 'PRD', ''])('tier=%s에서도 게이트를 지난다', async (tier) => {
    const probe = await probeTier(getTransport, tier, { transport_number: TR });

    expect(probe.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });
});
