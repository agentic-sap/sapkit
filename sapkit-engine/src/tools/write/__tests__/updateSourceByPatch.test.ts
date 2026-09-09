/**
 * UpdateSourceByPatch — 현재 소스 읽기 → 문자열 치환 → 같은 쓰기 흐름에 위임.
 *
 * 구 핸들러(`engine/src/handlers/common/high/handleUpdateSourceByPatch.ts`)는
 * 쓰기를 UpdateClass/UpdateProgram/UpdateInclude에 **그대로 위임**한다. 여기서도
 * 위임 사실(잠금·검사·PUT·해제가 그대로 나가는지)과 치환 판정을 못박는다.
 *
 * 「장부 D142」 절은 실사용이 고친 다섯 자리(읽는 판 · 줄바꿈 · 유일성 문구 ·
 * `match_whole_line` · FUNC/INTF 배선)의 대체 기대 시험이고, 「장부 D143」 절은
 * 함수그룹 인클루드 라우팅이 위임을 통해 여기까지 닿는지를 본다.
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
import { applySourcePatch, findWholeLineMatches, updateSourceByPatch } from '../updateSourceByPatch';

const CLASS_LOWER = '/sap/bc/adt/oo/classes/zcl_test';
const CLASS_UPPER = '/sap/bc/adt/oo/classes/ZCL_TEST';
const CURRENT = 'CLASS zcl_test DEFINITION.\n  DATA lv_x TYPE i.\nENDCLASS.\n';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

interface Scenario {
  /** 활성 판. */
  readonly active?: string;
  /** 비활성 판. `null`이면 404, 숫자면 그 상태로 거절. 기본은 활성과 같은 본문. */
  readonly inactive?: string | null | number;
}

function responder(scenario: Scenario = {}) {
  const active = scenario.active ?? CURRENT;
  return ((request, response) => {
    if (request.path === `${CLASS_UPPER}/source/main` && request.method === 'GET') {
      if (request.query.get('version') === 'inactive') {
        if (scenario.inactive === null) return xml(response, '<err/>', 404);
        if (typeof scenario.inactive === 'number') return xml(response, '<err/>', scenario.inactive);
        return plainText(response, scenario.inactive ?? active);
      }
      return plainText(response, active);
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

const putBody = (): string | undefined => harness.calls().find((call) => call.method === 'PUT')?.body;

describe('UpdateSourceByPatch', () => {
  it('현재 소스를 읽고 치환한 전체 소스를 PUT한다', async () => {
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
    expect(putBody()).toBe('CLASS zcl_test DEFINITION.\n  DATA lv_x TYPE string.\nENDCLASS.\n');

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
    harness = await startWriteHarness(responder({ active: 'A\nDATA x.\nDATA x.\n' }));
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
    harness = await startWriteHarness(responder({ active: 'A\nDATA x.\nDATA x.\n' }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'DATA x.',
      new_string: 'DATA y.',
      replace_all: true,
    });
    expect(result.isError).toBe(false);
    expect(jsonOf(result).occurrences_replaced).toBe(2);
    expect(putBody()).toBe('A\nDATA y.\nDATA y.\n');
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
    expect(putBody()).toBe('REPORT zprog.\nWRITE 2.\n');
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
    expect(harness.calls()).toHaveLength(0);
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

describe('장부 D142 ① — 읽는 판: 비활성 먼저, 없으면 활성', () => {
  it('비활성 판이 있으면 그것을 읽어 패치하고 source_version_read=inactive를 싣는다', async () => {
    const inactive = 'CLASS zcl_test DEFINITION.\n  DATA lv_new TYPE i.\n  DATA lv_x TYPE i.\nENDCLASS.\n';
    harness = await startWriteHarness(responder({ inactive }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'DATA lv_x TYPE i.',
      new_string: 'DATA lv_x TYPE string.',
    });

    expect(result.isError).toBe(false);
    const reads = harness.calls().filter((call) => call.method === 'GET');
    expect(reads).toHaveLength(1);
    expect(reads[0]!.query.get('version')).toBe('inactive');
    // 앞 패치(`lv_new`)가 살아남는다 — 구는 활성 판을 읽어 이것을 덮어썼다.
    expect(putBody()).toBe(
      'CLASS zcl_test DEFINITION.\n  DATA lv_new TYPE i.\n  DATA lv_x TYPE string.\nENDCLASS.\n',
    );
    expect(jsonOf(result).source_version_read).toBe('inactive');
  });

  it('비활성 판이 없으면(404) 활성 판으로 떨어지고 source_version_read=active를 싣는다', async () => {
    harness = await startWriteHarness(responder({ inactive: null }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'DATA lv_x TYPE i.',
      new_string: 'DATA lv_x TYPE string.',
    });

    expect(result.isError).toBe(false);
    const reads = harness.calls().filter((call) => call.method === 'GET');
    expect(reads.map((call) => call.query.get('version'))).toEqual(['inactive', 'active']);
    expect(jsonOf(result).source_version_read).toBe('active');
  });

  it('구형 시스템의 400도 활성 판으로 떨어진다', async () => {
    harness = await startWriteHarness(responder({ inactive: 400 }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'TYPE i',
      new_string: 'TYPE string',
    });
    expect(result.isError).toBe(false);
    expect(jsonOf(result).source_version_read).toBe('active');
  });

  it('비활성 읽기의 다른 실패(403)는 폴백하지 않고 그대로 올린다 — 아무것도 쓰지 않는다', async () => {
    harness = await startWriteHarness(responder({ inactive: 403 }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'TYPE i',
      new_string: 'TYPE string',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('forbidden');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
  });

  it('못 찾은 오류는 어느 판을 읽었는지 말한다', async () => {
    harness = await startWriteHarness(responder({ inactive: null }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'NOT PRESENT',
      new_string: 'X',
    });
    expect(textOf(result)).toContain('active version read');
  });
});

describe('장부 D142 ② — 줄바꿈: CRLF 소스에 여러 줄 old_string', () => {
  const CRLF = '* a\r\n  DATA x.\r\n  DATA y.\r\nENDCLASS.\r\n';

  it('LF로 준 여러 줄 old_string이 CRLF 소스에 맞고, 되쓴 소스는 CRLF로 통일된다', async () => {
    harness = await startWriteHarness(responder({ active: CRLF }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: '  DATA x.\n  DATA y.',
      new_string: '  DATA z.\n  DATA w.',
    });

    expect(result.isError).toBe(false);
    expect(putBody()).toBe('* a\r\n  DATA z.\r\n  DATA w.\r\nENDCLASS.\r\n');
    // 혼합 EOL이 아니다 — 새 줄에도 CRLF가 붙었고 홀로 선 LF가 없다.
    expect(putBody()!.replace(/\r\n/g, '')).not.toContain('\n');
    // diff_preview는 정규화본이라 CR이 섞이지 않는다.
    expect(String(jsonOf(result).diff_preview)).not.toContain('\r');
  });

  it('여러 줄을 지우는 패치(new_string 빈 값)도 CRLF 소스에서 성립한다', async () => {
    harness = await startWriteHarness(responder({ active: CRLF }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: '  DATA x.\n  DATA y.\n',
      new_string: '',
    });
    expect(result.isError).toBe(false);
    expect(putBody()).toBe('* a\r\nENDCLASS.\r\n');
  });

  it('LF 소스는 LF 그대로다', async () => {
    harness = await startWriteHarness(responder({ active: '* a\n  DATA x.\n  DATA y.\nENDCLASS.\n' }));
    await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: '  DATA x.\n  DATA y.',
      new_string: '  DATA z.',
    });
    expect(putBody()).toBe('* a\n  DATA z.\nENDCLASS.\n');
  });
});

describe('장부 D142 ③④ — 유일성 문구와 match_whole_line', () => {
  const SOURCE = 'FORM do_show.\n  WRITE 1.\nENDFORM.\n  PERFORM do_show.\n';

  it('부분문자열로 여러 곳에 걸리면 각 일치의 줄 번호와 원문을 싣는다', async () => {
    harness = await startWriteHarness(responder({ active: SOURCE }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'FORM do_show.',
      new_string: 'FORM do_show2.',
    });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('matches 2 locations');
    expect(text).toContain('L1: "FORM do_show."');
    expect(text).toContain('L4: "  PERFORM do_show."');
    expect(text).toContain('match_whole_line');
    expect(harness.calls().some((call) => call.method === 'PUT')).toBe(false);
  });

  it('match_whole_line=true면 줄 전체가 같은 곳만 걸린다', async () => {
    harness = await startWriteHarness(responder({ active: SOURCE }));
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'CLAS',
      object_name: 'ZCL_TEST',
      old_string: 'FORM do_show.',
      new_string: 'FORM do_show2.',
      match_whole_line: true,
    });
    expect(result.isError).toBe(false);
    expect(jsonOf(result).occurrences_replaced).toBe(1);
    expect(putBody()).toBe('FORM do_show2.\n  WRITE 1.\nENDFORM.\n  PERFORM do_show.\n');
  });

  it('match_whole_line은 양끝 공백을 빼고 견준다 — 들여쓰기가 달라도 같은 문장이면 걸린다', () => {
    const matches = findWholeLineMatches('  APPEND it.\n        APPEND it.\n', '  APPEND it.');
    expect(matches).toHaveLength(2);
  });

  it('여덟 건을 넘는 일치는 요약한다', () => {
    const source = Array.from({ length: 10 }, (_, i) => `  DATA x${i}.\n  DATA x.`).join('\n');
    expect(() => applySourcePatch(source, 'DATA x.', 'DATA y.', { replaceAll: false, matchWholeLine: false })).toThrow(
      /matches 10 locations[\s\S]*and 2 more/,
    );
  });
});

describe('applySourcePatch — 순수 치환', () => {
  const opts = (matchWholeLine = false, replaceAll = false) => ({ matchWholeLine, replaceAll });

  it('부분문자열 치환은 구 그대로다', () => {
    expect(applySourcePatch('A x B', 'x', 'y', opts()).newSource).toBe('A y B');
    expect(applySourcePatch('A x B x', 'x', 'y', opts(false, true)).newSource).toBe('A y B y');
    expect(() => applySourcePatch('A x B x', 'x', 'y', opts())).toThrow('not unique');
  });

  it('줄 전체 일치에서 old·new가 둘 다 개행으로 끝나면 그 개행을 짝으로 뗀다', () => {
    const out = applySourcePatch('A\n  X.\nB\n', '  X.\n', '  Y.\n', opts(true));
    expect(out.newSource).toBe('A\n  Y.\nB\n');
  });

  it('줄 전체 일치로 줄을 지우면 뒤따르는 개행도 함께 지운다', () => {
    const out = applySourcePatch('A\n  X.\n  Y.\nB\n', '  X.\n  Y.\n', '', opts(true));
    expect(out.newSource).toBe('A\nB\n');
  });

  it('줄 전체 일치는 부분문자열에 걸리지 않는다', () => {
    expect(() => applySourcePatch('PERFORM x.\n', 'FORM x.', 'FORM y.', opts(true))).toThrow(
      'old_string not found',
    );
  });
});

describe('장부 D142 ⑤ — FUNC·INTF 배선', () => {
  const FM_UPPER = '/sap/bc/adt/functions/groups/ZFG_TEST/fmodules/Z_FM_TEST';
  const FM_LOWER = '/sap/bc/adt/functions/groups/zfg_test/fmodules/z_fm_test';
  const FM_SOURCE = "FUNCTION z_fm_test.\n  WRITE 'hi'.\nENDFUNCTION.";

  it('FUNC는 함수모듈을 읽어 UpdateFunctionModule로 위임한다', async () => {
    harness = await startWriteHarness((request, response) => {
      const action = request.query.get('_action');
      if (request.path === `${FM_UPPER}/source/main` && request.method === 'GET') {
        return plainText(response, FM_SOURCE);
      }
      if (request.path === FM_LOWER && action === 'LOCK') return xml(response, lockBody('FM-LOCK'));
      if (request.path === FM_LOWER && action === 'UNLOCK') return xml(response, '<ok/>');
      if (request.path === `${FM_LOWER}/source/main` && request.method === 'PUT') {
        return plainText(response, '');
      }
      if (request.path === '/sap/bc/adt/checkruns') return xml(response, cleanCheckRun());
      response.statusCode = 500;
      response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
    });
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'FUNC',
      object_name: 'z_fm_test',
      function_group: 'zfg_test',
      old_string: "WRITE 'hi'.",
      new_string: "WRITE 'bye'.",
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${FM_UPPER}/source/main`,
      `POST ${FM_LOWER}`,
      `PUT ${FM_LOWER}/source/main`,
      'POST /sap/bc/adt/checkruns',
      `POST ${FM_LOWER}`,
    ]);
    // 위임받은 도구의 규칙 그대로 — 전송요청이 없어도 `corrNr=local`이 실린다.
    const put = harness.calls().find((call) => call.method === 'PUT')!;
    expect(put.query.get('corrNr')).toBe('local');
    expect(put.body).toBe("FUNCTION z_fm_test.\n  WRITE 'bye'.\nENDFUNCTION.");
    const payload = jsonOf(result);
    expect(payload.object_type).toBe('FUNC');
    expect(payload.function_group).toBe('ZFG_TEST');
    expect(payload.success).toBe(true);
  });

  it('INTF는 인터페이스를 읽어 UpdateInterface로 위임한다', async () => {
    const LOWER = '/sap/bc/adt/oo/interfaces/zif_test';
    const UPPER = '/sap/bc/adt/oo/interfaces/ZIF_TEST';
    harness = await startWriteHarness((request, response) => {
      const action = request.query.get('_action');
      if (request.path === `${UPPER}/source/main` && request.method === 'GET') {
        return plainText(response, 'INTERFACE zif_test PUBLIC.\n  METHODS run.\nENDINTERFACE.\n');
      }
      if (request.path === LOWER && action === 'LOCK') return xml(response, lockBody('INTF-LOCK'));
      if (action === 'UNLOCK') return xml(response, '<ok/>');
      if (request.path === '/sap/bc/adt/checkruns') return xml(response, cleanCheckRun());
      if (request.path === `${UPPER}/source/main` && request.method === 'PUT') {
        return plainText(response, '');
      }
      response.statusCode = 500;
      response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
    });
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'INTF',
      object_name: 'zif_test',
      old_string: 'METHODS run.',
      new_string: 'METHODS run RETURNING VALUE(rv) TYPE i.',
    });

    expect(result.isError).toBe(false);
    expect(putBody()).toBe('INTERFACE zif_test PUBLIC.\n  METHODS run RETURNING VALUE(rv) TYPE i.\nENDINTERFACE.\n');
    // `activate`를 명시로 넘기므로 UpdateInterface의 기본값(켜짐)이 새어 나오지 않는다.
    expect(harness.calls().some((call) => call.path === '/sap/bc/adt/activation')).toBe(false);
    expect(jsonOf(result).activated).toBe(false);
  });
});

describe('장부 D143 — 함수그룹 인클루드는 그룹 주소로 잠근다 (위임을 통해)', () => {
  it('LZ…F01은 독립 주소로 읽고, 잠금·PUT은 /functions/groups/<그룹>/includes/<이름>으로 나간다', async () => {
    const READ = '/sap/bc/adt/programs/includes/LZFG_TESTF01';
    const WRITE = '/sap/bc/adt/functions/groups/zfg_test/includes/lzfg_testf01';
    harness = await startWriteHarness((request, response) => {
      if (request.path === `${READ}/source/main` && request.method === 'GET') {
        return plainText(response, 'FORM f.\n  WRITE 1.\nENDFORM.\n');
      }
      if (request.path === WRITE && request.query.get('_action')) return xml(response, lockBody('FG-INC'));
      if (request.path === `${WRITE}/source/main` && request.method === 'PUT') {
        return plainText(response, '');
      }
      response.statusCode = 500;
      response.end(`예상하지 못한 요청: ${request.method} ${request.url}`);
    });
    const result = await invoke(updateSourceByPatch, harness, {
      object_type: 'INCL',
      object_name: 'lzfg_testf01',
      old_string: 'WRITE 1.',
      new_string: 'WRITE 2.',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${READ}/source/main`,
      `POST ${WRITE}`,
      `PUT ${WRITE}/source/main`,
      `POST ${WRITE}`,
    ]);
    expect(putBody()).toBe('FORM f.\n  WRITE 2.\nENDFORM.\n');
  });
});
