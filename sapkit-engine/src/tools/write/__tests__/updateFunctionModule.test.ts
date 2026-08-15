/**
 * `UpdateFunctionModule` — 발행 계약 · 노출 선언 · 와이어 · 갈래.
 *
 * 기대값의 출처는 구 엔진이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 설명 문장의 계약 → 구 엔진 자체 시험
 *    `engine/src/__tests__/handleUpdateFunctionModule.test.ts`
 *    (쓰기가 남는다는 것과 형제 FM 이야기가 설명에 있어야 한다)
 *  - 잠금·PUT·해제·활성화의 주소와 헤더 →
 *    `@babamba2/mcp-abap-adt-clients/dist/core/functionModule/{lock,update,unlock,activation}.js`
 *  - 사후검사 → `engine/src/lib/preCheckBeforeActivation.ts:243-261`·`:503-533`
 *
 * 못 박는 자리:
 *  ⑴ **검사가 PUT 뒤에 온다** — `UpdateProgram`과 순서가 반대다.
 *  ⑵ **전송요청이 없어도 `corrNr=local`이 실린다.**
 *  ⑶ **사후검사 요청에 Accept가 없다.**
 *  ⑷ 활성화 실패를 성공으로 접지 않는다(장부 D51).
 */

import { updateFunctionModule } from '../updateFunctionModule';
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
import { cleanupTempDirs, harnessFor, publishedDeclaration } from '../../read/__tests__/support';

const FM_URI = '/sap/bc/adt/functions/groups/zfg_test/fmodules/z_fm_test';
const SOURCE = "FUNCTION z_fm_test.\n  WRITE 'hi'.\nENDFUNCTION.";
const ARGS = {
  function_group_name: 'ZFG_TEST',
  function_module_name: 'Z_FM_TEST',
  source_code: SOURCE,
};

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

interface Options {
  readonly check?: string;
  readonly activation?: string;
  readonly putStatus?: number;
}

/** 잠금 → PUT → 검사 → 해제 → 활성화에 차례로 답하는 응답기. */
function serve(options: Options = {}): Parameters<typeof startWriteHarness>[0] {
  return (request, response) => {
    const action = request.query.get('_action');
    if (request.path === FM_URI && action === 'LOCK') return xml(response, lockBody());
    if (request.path === FM_URI && action === 'UNLOCK') return xml(response, '<ok/>');
    if (request.path === `${FM_URI}/source/main`) {
      if (options.putStatus && options.putStatus >= 400) {
        return xml(response, '<error/>', options.putStatus);
      }
      return plainText(response, '');
    }
    if (request.path === '/sap/bc/adt/checkruns') {
      return xml(response, options.check ?? cleanCheckRun());
    }
    if (request.path === '/sap/bc/adt/activation') {
      return xml(response, options.activation ?? activationBody());
    }
    response.statusCode = 500;
    response.end('예상하지 못한 요청');
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const listing = await harnessFor(updateFunctionModule);
    try {
      const listed = await listing.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('UpdateFunctionModule'));
    } finally {
      await listing.close();
    }
  });

  it('설명이 구 엔진 시험의 두 계약을 유지한다', () => {
    // `engine/src/__tests__/handleUpdateFunctionModule.test.ts`가 붙잡은 것.
    const description = updateFunctionModule.definition.description.toLowerCase();
    expect(description).toContain('persist');
    expect(description).toContain('sibling');
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/function/high/` → high 집합.
    expect(updateFunctionModule.definition.sets).toEqual(['high']);
    expect(updateFunctionModule.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateFunctionModule.definition.kind).toBe('mutation');
    expect(updateFunctionModule.definition.targetNames).toEqual([
      'function_module_name',
      'function_group_name',
    ]);
  });
});

describe('와이어', () => {
  it('잠금 → PUT → 검사 → 해제 순으로 나간다 (검사가 쓰기 뒤다)', async () => {
    harness = await startWriteHarness(serve());
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${FM_URI}`,
      `PUT ${FM_URI}/source/main`,
      'POST /sap/bc/adt/checkruns',
      `POST ${FM_URI}`,
    ]);
    expect(harness.nth(0).query.get('_action')).toBe('LOCK');
    expect(harness.nth(0).query.get('accessMode')).toBe('MODIFY');
    expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
    expect(harness.nth(3).query.get('lockHandle')).toBe('LOCK-HANDLE-1');
  });

  it('주소의 이름은 그룹·모듈 둘 다 소문자다', async () => {
    harness = await startWriteHarness(serve());
    await invoke(updateFunctionModule, harness, {
      ...ARGS,
      function_group_name: 'ZFG_TEST',
      function_module_name: 'Z_FM_TEST',
    });

    expect(harness.nth(1).path).toBe(`${FM_URI}/source/main`);
  });

  it('PUT은 잠금 핸들과 소스를 싣고 text/plain으로 나간다', async () => {
    harness = await startWriteHarness(serve());
    await invoke(updateFunctionModule, harness, { ...ARGS, transport_request: 'E19K905635' });

    const put = harness.nth(1);
    expect(put.query.get('lockHandle')).toBe('LOCK-HANDLE-1');
    expect(put.query.get('corrNr')).toBe('E19K905635');
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.headers['accept']).toBe('text/plain');
    expect(put.body).toBe(SOURCE);
  });

  it('전송요청이 없어도 corrNr=local이 실려 나간다', async () => {
    harness = await startWriteHarness(serve());
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(harness.nth(1).query.get('corrNr')).toBe('local');
    expect(jsonOf(result).transport_request).toBe('local');
  });

  it('사후검사는 비활성 판을 겨누고 Accept를 싣지 않는다', async () => {
    harness = await startWriteHarness(serve());
    await invoke(updateFunctionModule, harness, ARGS);

    const check = harness.nth(2);
    expect(check.query.get('reporters')).toBe('abapCheckRun');
    expect(check.headers['content-type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(check.body).toContain(
      `<chkrun:checkObject adtcore:uri="${FM_URI}" chkrun:version="inactive"/>`,
    );
    // 구 `runRawCheckRun`은 Content-Type만 넘기므로 접속 계층의 기본값이 나간다.
    expect(check.headers['accept']).toBe('application/xml, application/json, text/plain, */*');
  });

  it('activate=true면 해제 뒤에 활성화가 나간다', async () => {
    harness = await startWriteHarness(serve());
    const result = await invoke(updateFunctionModule, harness, { ...ARGS, activate: true });

    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${FM_URI}`,
      `PUT ${FM_URI}/source/main`,
      'POST /sap/bc/adt/checkruns',
      `POST ${FM_URI}`,
      'POST /sap/bc/adt/activation',
    ]);
    const activation = harness.nth(4);
    expect(activation.query.get('method')).toBe('activate');
    expect(activation.query.get('preauditRequested')).toBe('true');
    expect(activation.headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
    expect(activation.body).toContain(
      `<adtcore:objectReference adtcore:uri="${FM_URI}" adtcore:name="Z_FM_TEST"/>`,
    );
    expect(jsonOf(result).activated).toBe(true);
  });

  it('activate를 안 주면 활성화가 없다', async () => {
    harness = await startWriteHarness(serve());
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
    expect(jsonOf(result).activated).toBe(false);
  });
});

describe('응답', () => {
  it('성공 응답의 키는 구 그대로다', async () => {
    harness = await startWriteHarness(serve());
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(jsonOf(result)).toEqual({
      success: true,
      function_module_name: 'Z_FM_TEST',
      function_group_name: 'ZFG_TEST',
      transport_request: 'local',
      activated: false,
      message: 'Function module Z_FM_TEST source code updated successfully',
    });
  });

  it('활성화까지 하면 문구가 이어 붙는다', async () => {
    harness = await startWriteHarness(serve());
    const result = await invoke(updateFunctionModule, harness, { ...ARGS, activate: true });

    expect(jsonOf(result).message).toBe(
      'Function module Z_FM_TEST source code updated successfully and activated',
    );
  });

  it('검사 경고는 실려 나가되 실패로 만들지 않는다', async () => {
    harness = await startWriteHarness(serve({ check: warningCheckRun('Obsolete statement') }));
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(result.isError).toBe(false);
    expect(jsonOf(result).check_warnings).toEqual([
      { type: 'W', text: 'Obsolete statement', line: '7' },
    ]);
  });
});

describe('갈래', () => {
  it('사후검사 오류는 줄번호를 달고 실패로 나오되 잠금은 풀린다', async () => {
    harness = await startWriteHarness(serve({ check: failingCheckRun('Field IV_X is unknown') }));
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Function module Z_FM_TEST preCheck syntax check failed (1 error): [L42] Field IV_X is unknown',
    );
    // 쓰기는 이미 나갔고, 해제도 반드시 나간다.
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${FM_URI}`,
      `PUT ${FM_URI}/source/main`,
      'POST /sap/bc/adt/checkruns',
      `POST ${FM_URI}`,
    ]);
    expect(harness.nth(3).query.get('_action')).toBe('UNLOCK');
  });

  it('활성화가 200에 오류를 담아 와도 성공으로 접지 않는다 (D51)', async () => {
    harness = await startWriteHarness(
      serve({ activation: activationBody([{ type: 'E', text: 'Syntax error in FM' }]) }),
    );
    const result = await invoke(updateFunctionModule, harness, { ...ARGS, activate: true });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('was not activated');
    expect(textOf(result)).toContain('Syntax error in FM');
    expect(textOf(result)).toContain('the active version is unchanged');
  });

  it('PUT의 404는 전용 문구다', async () => {
    harness = await startWriteHarness(serve({ putStatus: 404 }));
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(textOf(result)).toBe(
      'Error: Failed to update function module source: Function module Z_FM_TEST not found in group ZFG_TEST.',
    );
  });

  it('PUT의 423은 잠금 문구다', async () => {
    harness = await startWriteHarness(serve({ putStatus: 423 }));
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(textOf(result)).toBe(
      'Error: Failed to update function module source: Function module Z_FM_TEST is locked by another user or lock handle is invalid.',
    );
  });

  it('전송요청 없이 받은 400은 전송요청을 지목한다', async () => {
    harness = await startWriteHarness(serve({ putStatus: 400 }));
    const result = await invoke(updateFunctionModule, harness, ARGS);

    expect(textOf(result)).toBe(
      'Error: Failed to update function module source: Update failed for Z_FM_TEST. The object may be assigned to a transport request. Pass transport_request explicitly.',
    );
  });

  it('전송요청을 준 400은 그 지목을 하지 않는다', async () => {
    harness = await startWriteHarness(serve({ putStatus: 400 }));
    const result = await invoke(updateFunctionModule, harness, {
      ...ARGS,
      transport_request: 'E19K905635',
    });

    expect(textOf(result)).not.toContain('Pass transport_request explicitly');
    expect(textOf(result).startsWith('Error: Failed to update function module source: ')).toBe(
      true,
    );
  });
});

describe('인자 검증 — 접속을 만들기 전에 끝난다', () => {
  const cases: ReadonlyArray<readonly [string, Record<string, unknown>, string]> = [
    [
      '모듈 이름이 없으면',
      { function_group_name: 'ZFG', function_module_name: '', source_code: SOURCE },
      'Error: Function module name is required and must not exceed 30 characters',
    ],
    [
      '모듈 이름이 30자를 넘으면',
      { function_group_name: 'ZFG', function_module_name: 'Z'.repeat(31), source_code: SOURCE },
      'Error: Function module name is required and must not exceed 30 characters',
    ],
    [
      '그룹 이름이 30자를 넘으면',
      { function_group_name: 'Z'.repeat(31), function_module_name: 'Z_FM', source_code: SOURCE },
      'Error: Function group name is required and must not exceed 30 characters',
    ],
    [
      '소스가 없으면',
      { function_group_name: 'ZFG', function_module_name: 'Z_FM', source_code: '' },
      'Error: Source code is required',
    ],
  ];

  it.each(cases)('%s 거절한다', async (_label, args, expected) => {
    harness = await startWriteHarness(serve());
    const result = await invoke(updateFunctionModule, harness, args);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(expected);
    expect(harness.calls()).toEqual([]);
  });
});
