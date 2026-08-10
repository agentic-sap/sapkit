/**
 * ActivateObjects — 대량 활성화 한 번.
 *
 * 구 구현(`engine/src/lib/localGroupActivation.ts` + 그 핸들러)의 흐름:
 * `/activation/runs` POST → Location에서 run id → 장기 폴링 → `/activation/results`
 * → 결과 파싱 → **오라클 재조회**(GetInactiveObjects). runs가 없으면 sync
 * `/activation`으로 떨어진다. 오라클은 "성공 플래그는 증거가 아니다"의 실체다.
 */

import { invoke, jsonOf, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';
import { activateObjects } from '../activateObjects';

const RUN_ID = 'RUN123';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function results(options: { activated?: boolean; generated?: boolean; errors?: string[] } = {}): string {
  const msgs = (options.errors ?? [])
    .map(
      (text) =>
        `<msg type="E" href="/sap/bc/adt/programs/programs/zprog#start=7,1"><shortText><txt>${text}</txt></shortText></msg>`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
    `<properties activationExecuted="${options.activated ?? true}" checkExecuted="true" generationExecuted="${options.generated ?? true}"/>` +
    msgs +
    '</chkl:messages>'
  );
}

function inactiveObjects(names: ReadonlyArray<{ type: string; name: string }>): string {
  const entries = names
    .map(
      (entry) =>
        `<ioc:entry><ioc:object><ioc:ref adtcore:type="${entry.type}" adtcore:name="${entry.name}" xmlns:adtcore="http://www.sap.com/adt/core"/></ioc:object></ioc:entry>`,
    )
    .join('');
  return `<?xml version="1.0"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/adt/inactivectsobjects">${entries}</ioc:inactiveObjects>`;
}

interface Scenario {
  readonly runsStatus?: number;
  readonly location?: string | null;
  readonly runStatus?: string;
  readonly results?: string;
  readonly sync?: string;
  readonly inactive?: string;
}

function responder(scenario: Scenario = {}) {
  return ((request, response) => {
    if (request.path === '/sap/bc/adt/activation/runs' && request.method === 'POST') {
      if (scenario.runsStatus) return xml(response, '<err/>', scenario.runsStatus);
      if (scenario.location !== null) {
        response.setHeader('location', scenario.location ?? `/sap/bc/adt/activation/runs/${RUN_ID}`);
      }
      response.statusCode = 202;
      return response.end('');
    }
    if (request.path === `/sap/bc/adt/activation/runs/${RUN_ID}`) {
      return xml(
        response,
        `<?xml version="1.0"?><run status="${scenario.runStatus ?? 'finished'}"/>`,
      );
    }
    if (request.path === `/sap/bc/adt/activation/results/${RUN_ID}`) {
      return xml(response, scenario.results ?? results());
    }
    if (request.path === '/sap/bc/adt/activation' && request.method === 'POST') {
      return xml(response, scenario.sync ?? results());
    }
    if (request.path === '/sap/bc/adt/activation/inactiveobjects') {
      return xml(response, scenario.inactive ?? inactiveObjects([]));
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('ActivateObjects — runs 경로', () => {
  it('runs POST → 폴링 → results → 오라클 재조회 순으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(activateObjects, harness, {
      objects: [
        { name: 'zprog', type: 'PROG/P' },
        { name: 'zinc01', type: 'PROG/I' },
      ],
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /sap/bc/adt/activation/runs',
      `GET /sap/bc/adt/activation/runs/${RUN_ID}`,
      `GET /sap/bc/adt/activation/results/${RUN_ID}`,
      'GET /sap/bc/adt/activation/inactiveobjects',
    ]);

    const start = harness.nth(0);
    expect(start.query.get('method')).toBe('activate');
    expect(start.query.get('preauditRequested')).toBe('true');
    expect(start.headers['content-type']).toBe('application/xml');
    expect(start.body).toContain(
      '<adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/zprog" adtcore:type="PROG/P" adtcore:name="ZPROG"/>',
    );
    expect(start.body).toContain(
      '<adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/includes/zinc01" adtcore:type="PROG/I" adtcore:name="ZINC01"/>',
    );
    expect(harness.nth(1).query.get('withLongPolling')).toBe('true');

    const payload = jsonOf(result);
    expect(payload.success).toBe(true);
    expect(payload.endpoint).toBe('runs');
    expect(payload.run_id).toBe(RUN_ID);
    expect(payload.objects_count).toBe(2);
    expect(payload.failed_count).toBe(0);
  });

  it('preaudit=false는 질의에 그대로 실린다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(activateObjects, harness, {
      objects: [{ name: 'ZPROG', type: 'PROG/P' }],
      preaudit: false,
    });
    expect(harness.nth(0).query.get('preauditRequested')).toBe('false');
  });

  it('명시 uri가 이름 기반 해석을 이긴다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(activateObjects, harness, {
      objects: [{ name: 'ZTHING', uri: '/sap/bc/adt/ddic/ddl/sources/zthing' }],
    });
    expect(harness.nth(0).body).toContain('adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zthing"');
  });

  it('FUGR/FF는 parent_name으로 URI를 만든다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(activateObjects, harness, {
      objects: [{ name: 'Z_FM', type: 'FUGR/FF', parent_name: 'ZFG' }],
    });
    expect(harness.nth(0).body).toContain(
      'adtcore:uri="/sap/bc/adt/functions/groups/zfg/fmodules/z_fm"',
    );
  });

  it('활성화 오류가 있으면 success=false로 보고한다', async () => {
    harness = await startWriteHarness(
      responder({ results: results({ errors: ['Program ZPROG is syntactically wrong'] }) }),
    );
    const result = await invoke(activateObjects, harness, {
      objects: [{ name: 'ZPROG', type: 'PROG/P' }],
    });
    const payload = jsonOf(result);
    expect(payload.success).toBe(false);
    expect(payload.failed_count).toBe(1);
    expect(JSON.stringify(payload.errors)).toContain('Program ZPROG is syntactically wrong');
    // href 조각에서 실제 줄번호를 뽑는다.
    expect(JSON.stringify(payload.errors)).toContain('"line":"7"');
  });

  it('플래그가 성공이라 해도 여전히 비활성이면 실패로 뒤집는다 (오라클)', async () => {
    harness = await startWriteHarness(
      responder({ inactive: inactiveObjects([{ type: 'PROG/P', name: 'ZPROG' }]) }),
    );
    const result = await invoke(activateObjects, harness, {
      objects: [{ name: 'ZPROG', type: 'PROG/P' }],
    });
    const payload = jsonOf(result);
    expect(payload.success).toBe(false);
    expect(payload.failed_count).toBe(1);
    expect(JSON.stringify(payload.errors)).toContain('still inactive');
  });

  it('오라클 재조회 실패는 결과를 뒤집지 않는다 (최선 노력)', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/activation/inactiveobjects') {
        response.statusCode = 404;
        return response.end('<none/>');
      }
      return responder()(request, response, 0);
    });
    const result = await invoke(activateObjects, harness, {
      objects: [{ name: 'ZPROG', type: 'PROG/P' }],
    });
    expect(jsonOf(result).success).toBe(true);
  });
});

describe('ActivateObjects — 폴백과 오류', () => {
  it('runs가 404면 sync 엔드포인트로 떨어진다', async () => {
    harness = await startWriteHarness(responder({ runsStatus: 404 }));
    const result = await invoke(activateObjects, harness, {
      objects: [{ name: 'ZPROG', type: 'PROG/P' }],
    });
    expect(result.isError).toBe(false);
    const sync = harness.calls().find((call) => call.path === '/sap/bc/adt/activation');
    expect(sync).toBeDefined();
    expect(sync!.headers['content-type']).toBe(
      'application/vnd.sap.adt.activation.request+xml; charset=utf-8',
    );
    expect(jsonOf(result).endpoint).toBe('sync');
  });

  it('Location 헤더가 없으면 sync로 떨어진다', async () => {
    harness = await startWriteHarness(responder({ location: null }));
    const result = await invoke(activateObjects, harness, {
      objects: [{ name: 'ZPROG', type: 'PROG/P' }],
    });
    expect(jsonOf(result).endpoint).toBe('sync');
  });

  it('runs가 403이면 폴백하지 않고 그대로 실패한다', async () => {
    harness = await startWriteHarness(responder({ runsStatus: 403 }));
    const result = await invoke(activateObjects, harness, {
      objects: [{ name: 'ZPROG', type: 'PROG/P' }],
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('forbidden');
    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
  });

  it('실행이 끝나지 않으면 정직하게 시간 초과로 실패한다', async () => {
    harness = await startWriteHarness(responder({ runStatus: 'running' }));
    const result = await invoke(activateObjects, harness, {
      objects: [{ name: 'ZPROG', type: 'PROG/P' }],
      run_timeout_ms: 0,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('did not finish');
  });

  it('objects가 비면 SAP에 나가지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(activateObjects, harness, { objects: [] });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('non-empty array');
    expect(harness.calls()).toHaveLength(0);
  });

  it('type도 uri도 없는 항목은 URI를 지어내지 않고 거부한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(activateObjects, harness, { objects: [{ name: 'ZTHING' }] });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ZTHING');
    expect(harness.calls()).toHaveLength(0);
  });
});
