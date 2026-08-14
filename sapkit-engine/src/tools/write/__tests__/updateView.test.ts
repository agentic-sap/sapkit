/**
 * `UpdateView` — 발행 계약 · 잠금→검사→PUT→해제→사후검사→(활성) 시퀀스 ·
 * 두 검사의 Accept 차이 · 활성화 거짓 성공 수리(D66).
 *
 * 기대값은 전부 구 엔진 실측에서 뽑았다:
 *  - 선언 = `harness/old-surface/m1-tools.json`의 `tools`(전량 186종)
 *  - 잠금·해제 = `@babamba2/mcp-abap-adt-clients/dist/core/view/lock.js` · `unlock.js`
 *  - PUT = `dist/core/view/update.js:15-28` (경로는 **소문자**)
 *  - 검사 두 갈래 = `engine/src/lib/preCheckBeforeActivation.ts:389-408` ·
 *    `runInlineArtifactCheck`(484-487, Accept 있음) · `runRawCheckRun`(516-524, 없음)
 *  - 활성화 = `dist/utils/activationUtils.js:116-132`
 *  - 응답 모양 = `engine/src/handlers/view/high/handleUpdateView.ts:208-225`
 */

import { updateView } from '../updateView';
import {
  activationBody,
  cleanCheckRun,
  failingCheckRun,
  invoke,
  jsonOf,
  lockBody,
  plainText,
  startWriteHarness,
  textOf,
  warningCheckRun,
  xml,
} from './harness';
import type { WriteHarness } from './harness';
import { publish, publishedDeclaration } from './viewSupport';

const URI = '/sap/bc/adt/ddic/ddl/sources/z_i_test';
const DDL = "define view Z_I_TEST as select from t000 { key mandt }";

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

interface Scenario {
  readonly check?: string;
  readonly postCheckStatus?: number;
  readonly activation?: string;
  readonly activationStatus?: number;
  readonly putStatus?: number;
}

function responder(scenario: Scenario = {}) {
  let checkRuns = 0;
  return ((request, response) => {
    if (request.path === URI && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody());
    }
    if (request.path === URI && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      checkRuns += 1;
      if (checkRuns === 1) return xml(response, scenario.check ?? cleanCheckRun());
      if (scenario.postCheckStatus) return xml(response, '<err/>', scenario.postCheckStatus);
      return xml(response, cleanCheckRun());
    }
    if (request.path === `${URI}/source/main` && request.method === 'PUT') {
      if (scenario.putStatus) return xml(response, '<err/>', scenario.putStatus);
      return plainText(response, '');
    }
    if (request.path === '/sap/bc/adt/activation') {
      if (scenario.activationStatus) return xml(response, '<err/>', scenario.activationStatus);
      return xml(response, scenario.activation ?? activationBody());
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publish(updateView)).toEqual(publishedDeclaration('UpdateView'));
  });

  it('노출·정책 선언이 구 핸들러의 디렉터리와 맞는다', () => {
    expect(updateView.definition.sets).toEqual(['high']);
    expect(updateView.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateView.definition.kind).toBe('mutation');
    expect(updateView.definition.targetNames).toEqual(['view_name']);
  });
});

describe('시퀀스', () => {
  it('잠금 → 사전 검사 → PUT → 해제 → 사후검사 순으로 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateView, harness, {
      view_name: 'Z_I_TEST',
      ddl_source: DDL,
      transport_request: 'E19K905635',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${URI}/source/main`,
      `POST ${URI}`,
      'POST /sap/bc/adt/checkruns',
    ]);

    expect(harness.nth(0).query.get('accessMode')).toBe('MODIFY');
    expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
    expect(harness.nth(3).query.get('lockHandle')).toBe('LOCK-HANDLE-1');
  });

  it('쓰기 경로의 이름은 전부 소문자다 (읽기 경로와 규칙이 갈린다)', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    for (const call of harness.calls()) {
      expect(call.path).not.toContain('Z_I_TEST');
    }
    expect(harness.nth(0).path).toBe(URI);
    expect(harness.nth(2).path).toBe(`${URI}/source/main`);
  });

  it('PUT은 잠금 핸들·전송요청을 싣고 본문은 DDL 그대로다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateView, harness, {
      view_name: 'Z_I_TEST',
      ddl_source: DDL,
      transport_request: 'E19K905635',
    });

    const put = harness.nth(2);
    expect(put.query.get('lockHandle')).toBe('LOCK-HANDLE-1');
    expect(put.query.get('corrNr')).toBe('E19K905635');
    expect(put.body).toBe(DDL);
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('잠금 보유 구간은 stateful로 나간다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    expect(harness.nth(1).headers['x-sap-adt-sessiontype']).toBe('stateful');
    expect(harness.nth(2).headers['x-sap-adt-sessiontype']).toBe('stateful');
    expect(harness.client.activeLocks()).toHaveLength(0);
  });
});

describe('두 구문검사', () => {
  it('쓰기 전 검사는 제안 DDL을 base64로 실어 보낸다 (PUT 앞이다)', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    const check = harness.nth(1);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.body).toContain(`<chkrun:checkObject adtcore:uri="${URI}" chkrun:version="active">`);
    expect(check.body).toContain(`chkrun:uri="${URI}/source/main"`);
    expect(check.body).toContain(Buffer.from(DDL, 'utf-8').toString('base64'));
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(check.headers['accept']).toBe('application/vnd.sap.adt.checkmessages+xml');
  });

  it('사후 검사는 인액티브 버전을 그대로 보고, **Accept를 싣지 않는다**', async () => {
    // 구 `runRawCheckRun`은 Content-Type만 준다. 접속 계층 기본 Accept가 나간다.
    harness = await startWriteHarness(responder());
    await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    const post = harness.nth(4);
    expect(post.body).toContain(`<chkrun:checkObject adtcore:uri="${URI}" chkrun:version="inactive"/>`);
    expect(post.body).not.toContain('chkrun:artifact');
    expect(post.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(post.headers['accept']).toBe('application/xml, application/json, text/plain, */*');
    expect(post.headers['accept']).not.toBe('application/vnd.sap.adt.checkmessages+xml');
  });

  it('사전 검사가 오류를 내면 PUT이 나가지 않고 잠금은 풀린다', async () => {
    harness = await startWriteHarness(responder({ check: failingCheckRun('Field ZZ is unknown', '9') }));
    const result = await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('View Z_I_TEST preCheck syntax check failed');
    expect(textOf(result)).toContain('Field ZZ is unknown');
    expect(textOf(result)).toContain('[L9]');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(true);
  });

  it('사후 검사가 실패해도 쓰기는 성공으로 남고 응답에 실리지 않는다', async () => {
    // 구는 사후검사 결과를 버린다 — `check_warnings` 같은 키를 더하면 응답
    // 형태가 구와 달라진다.
    harness = await startWriteHarness(responder({ postCheckStatus: 500 }));
    const result = await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    expect(result.isError).toBe(false);
    const payload = jsonOf(result);
    expect(payload.success).toBe(true);
    expect(Object.keys(payload)).not.toContain('check_warnings');
    // 진행 목록은 실제 진행과 무관하게 고정이다(구와 같다).
    expect(payload.steps_completed).toEqual([
      'lock',
      'check_new_code',
      'update',
      'unlock',
      'check_inactive',
    ]);
  });
});

describe('활성화', () => {
  it('activate=true면 DDLS URI로 활성화 요청이 하나 더 나간다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateView, harness, {
      view_name: 'Z_I_TEST',
      ddl_source: DDL,
      activate: true,
    });

    const activation = harness.calls().find((call) => call.path === '/sap/bc/adt/activation');
    expect(activation).toBeDefined();
    expect(activation!.query.get('method')).toBe('activate');
    expect(activation!.query.get('preauditRequested')).toBe('true');
    expect(activation!.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
    expect(activation!.body).toContain(`adtcore:uri="${URI}"`);
    expect(activation!.body).toContain('adtcore:name="Z_I_TEST"');

    const payload = jsonOf(result);
    expect(payload.activated).toBe(true);
    expect(payload.message).toBe('View Z_I_TEST updated and activated successfully');
    expect(payload.steps_completed).toEqual([
      'lock',
      'check_new_code',
      'update',
      'unlock',
      'check_inactive',
      'activate',
    ]);
  });

  it('activate가 없으면 활성화하지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
    expect(jsonOf(result).activated).toBe(false);
    expect(jsonOf(result).message).toBe('View Z_I_TEST updated successfully');
  });

  it('경고만 있는 활성화는 성공이고 문구가 그대로 실린다', async () => {
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'W', text: 'View is not used' }]) }),
    );
    const result = await invoke(updateView, harness, {
      view_name: 'Z_I_TEST',
      ddl_source: DDL,
      activate: true,
    });

    expect(result.isError).toBe(false);
    expect(jsonOf(result).activation_warnings).toEqual(['W: View is not used']);
  });

  it('D66 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다', async () => {
    // 구는 이 응답에도 success:true·activated:true로 답했다(거짓 성공).
    harness = await startWriteHarness(
      responder({ activation: activationBody([{ type: 'E', text: 'Field MANDT is unknown' }]) }),
    );
    const result = await invoke(updateView, harness, {
      view_name: 'Z_I_TEST',
      ddl_source: DDL,
      activate: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed');
    expect(textOf(result)).toContain('Field MANDT is unknown');
    expect(textOf(result)).toContain('the active version is unchanged');
  });

  it('활성화 왕복 자체가 실패하면 구의 계약 문구로 올라간다', async () => {
    harness = await startWriteHarness(responder({ activationStatus: 403 }));
    const result = await invoke(updateView, harness, {
      view_name: 'Z_I_TEST',
      ddl_source: DDL,
      activate: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Activation failed: ');
  });
});

describe('오류 갈래', () => {
  it('필수 인자가 없으면 접속을 만들지 않고 거부한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: '' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Missing required parameters: view_name and ddl_source');
    expect(harness.calls()).toHaveLength(0);
  });

  it('PUT이 실패해도 잠금은 풀린다', async () => {
    harness = await startWriteHarness(responder({ putStatus: 423 }));
    const result = await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    expect(result.isError).toBe(true);
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(true);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });

  it('경고만 있는 사전 검사는 쓰기를 막지 않는다', async () => {
    harness = await startWriteHarness(responder({ check: warningCheckRun('Obsolete statement') }));
    const result = await invoke(updateView, harness, { view_name: 'Z_I_TEST', ddl_source: DDL });

    expect(result.isError).toBe(false);
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(true);
  });
});
