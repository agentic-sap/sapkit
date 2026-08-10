/**
 * UpdateSourceByPatch — 현재 소스 읽기 → 문자열 치환 → 같은 쓰기 흐름에 위임.
 *
 * 구 핸들러(`engine/src/handlers/common/high/handleUpdateSourceByPatch.ts`)는
 * 쓰기를 UpdateClass/UpdateProgram/UpdateInclude에 **그대로 위임**한다. 여기서도
 * 위임 사실(잠금·검사·PUT·해제가 그대로 나가는지)과 치환 판정을 못박는다.
 */

import {
  cleanCheckRun,
  invoke,
  jsonOf,
  lockBody,
  plainText,
  startWriteHarness,
  textOf,
  xml,
} from './harness';
import type { WriteHarness } from './harness';
import { updateSourceByPatch } from '../updateSourceByPatch';

const CLASS_LOWER = '/sap/bc/adt/oo/classes/zcl_test';
const CLASS_UPPER = '/sap/bc/adt/oo/classes/ZCL_TEST';
const CURRENT = 'CLASS zcl_test DEFINITION.\n  DATA lv_x TYPE i.\nENDCLASS.\n';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function responder(current = CURRENT) {
  return ((request, response) => {
    if (request.path === `${CLASS_UPPER}/source/main` && request.method === 'GET') {
      return plainText(response, current);
    }
    if (request.path === CLASS_LOWER && request.query.get('_action') === 'LOCK') {
      return xml(response, lockBody('PATCH-LOCK'));
    }
    if (request.path === CLASS_LOWER && request.query.get('_action') === 'UNLOCK') {
      return xml(response, '<ok/>');
    }
    if (request.path === '/sap/bc/adt/checkruns') return xml(response, cleanCheckRun());
    if (request.path === `${CLASS_LOWER}/source/main` && request.method === 'PUT') {
      return plainText(response, '');
    }
    response.statusCode = 500;
    response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
  }) as Parameters<typeof startWriteHarness>[0];
}

describe('UpdateSourceByPatch', () => {
  it('현재 소스를 active 버전으로 읽고 치환한 전체 소스를 PUT한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'zcl_test',
      old_string: 'DATA lv_x TYPE i.',
      new_string: 'DATA lv_x TYPE string.',
    });

    expect(result.isError).toBe(false);
    const read = harness.nth(0);
    expect(read.method).toBe('GET');
    expect(read.path).toBe(`${CLASS_UPPER}/source/main`);
    expect(read.query.get('version')).toBe('active');

    const put = harness.calls().find((call) => call.method === 'PUT');
    expect(put?.body).toBe('CLASS zcl_test DEFINITION.\n  DATA lv_x TYPE string.\nENDCLASS.\n');

    const payload = jsonOf(result);
    expect(payload.success).toBe(true);
    expect(payload.object_type).toBe('CLAS');
    expect(payload.object_name).toBe('ZCL_TEST');
    expect(payload.occurrences_replaced).toBe(1);
    expect(payload.activated).toBe(false);
    expect(String(payload.diff_preview)).toContain('-  DATA lv_x TYPE i.');
    expect(String(payload.diff_preview)).toContain('+  DATA lv_x TYPE string.');
  });

  it('위임된 쓰기 흐름(잠금→검사→PUT→해제)이 그대로 나간다', async () => {
    harness = await startWriteHarness(responder());
    await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'TYPE i',
      new_string: 'TYPE string',
    });
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${CLASS_UPPER}/source/main`,
      `POST ${CLASS_LOWER}`,
      'POST /sap/bc/adt/checkruns',
      `PUT ${CLASS_LOWER}/source/main`,
      `POST ${CLASS_LOWER}`,
      'POST /sap/bc/adt/checkruns',
    ]);
  });

  it('old_string이 없으면 아무것도 쓰지 않는다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'NOT PRESENT',
      new_string: 'X',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('old_string not found in current source');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
  });

  it('중복 일치는 replace_all 없이는 거부한다', async () => {
    harness = await startWriteHarness(responder('A\nDATA x.\nDATA x.\n'));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'DATA x.',
      new_string: 'DATA y.',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not unique');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
  });

  it('replace_all=true면 전부 치환하고 건수를 보고한다', async () => {
    harness = await startWriteHarness(responder('A\nDATA x.\nDATA x.\n'));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'DATA x.',
      new_string: 'DATA y.',
      replace_all: true,
    });
    expect(result.isError).toBe(false);
    expect(jsonOf(result).occurrences_replaced).toBe(2);
    const put = harness.calls().find((call) => call.method === 'PUT');
    expect(put?.body).toBe('A\nDATA y.\nDATA y.\n');
  });

  it('PROG는 프로그램 쓰기 흐름으로 위임된다', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/programs/programs/ZPROG/source/main' && request.method === 'GET') {
        return plainText(response, 'REPORT zprog.\nWRITE 1.\n');
      }
      if (request.path === '/sap/bc/adt/programs/programs/zprog') return xml(response, lockBody('P'));
      if (request.path === '/sap/bc/adt/checkruns') return xml(response, cleanCheckRun());
      if (request.path === '/sap/bc/adt/programs/programs/zprog/source/main' && request.method === 'PUT') {
        return plainText(response, '');
      }
      response.statusCode = 500;
      response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
    });
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'PROG',
      object_name: 'zprog',
      old_string: 'WRITE 1.',
      new_string: 'WRITE 2.',
    });
    expect(result.isError).toBe(false);
    const put = harness.calls().find((call) => call.method === 'PUT');
    expect(put?.body).toBe('REPORT zprog.\nWRITE 2.\n');
  });

  it('INCL은 인클루드 쓰기 흐름으로 위임된다', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/programs/includes/ZINC/source/main' && request.method === 'GET') {
        return plainText(response, '* a\nWRITE 1.\n');
      }
      if (request.path === '/sap/bc/adt/programs/includes/ZINC' && request.query.get('_action')) {
        return xml(response, lockBody('I'));
      }
      if (request.path === '/sap/bc/adt/programs/includes/ZINC/source/main' && request.method === 'PUT') {
        return plainText(response, '');
      }
      response.statusCode = 500;
      response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
    });
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'INCL',
      object_name: 'zinc',
      old_string: 'WRITE 1.',
      new_string: 'WRITE 2.',
    });
    expect(result.isError).toBe(false);
    expect(jsonOf(result).object_name).toBe('ZINC');
  });

  it('M1이 아직 짓지 않은 위임 대상(INTF/FUNC)은 정직하게 거부한다', async () => {
    harness = await startWriteHarness(responder());
    for (const objectType of ['INTF', 'FUNC']) {
      const result = await invoke(updateSourceByPatch, harness, {
        object_type: objectType,
        object_name: 'ZTHING',
        function_group: 'ZFG',
        old_string: 'a',
        new_string: 'b',
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/not available|미구현|not implemented/i);
    }
    expect(harness.calls()).toHaveLength(0);
  });

  it('FUNC에 function_group이 없으면 인자 오류로 거부한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'FUNC',
      object_name: 'Z_FM',
      old_string: 'a',
      new_string: 'b',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('function_group is required');
  });

  it('알 수 없는 object_type은 거부한다', async () => {
    harness = await startWriteHarness(responder());
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'TABL',
      object_name: 'ZT',
      old_string: 'a',
      new_string: 'b',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Unsupported object_type');
  });
});
