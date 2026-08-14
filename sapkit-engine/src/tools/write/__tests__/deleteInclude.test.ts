/**
 * `DeleteInclude` — 발행 계약 · LOCK → DELETE 와이어 · 메인 프로그램 정리 갈래 ·
 * 실측한 함정 넷 · tier 게이트 음성시험.
 *
 * 기대값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteInclude`
 *  - 겉 핸들러: `engine/src/handlers/include/high/handleDeleteInclude.ts:27-428`
 *    (벤더에 인클루드 메서드가 없어 겉 핸들러가 ADT REST를 직접 친다)
 *
 * 함정 넷을 각각 겨눈다: 성공하면 UNLOCK을 안 보낸다 · 세션이 걸음마다 뒤집힌다 ·
 * 활성화 XML의 인코딩 표기가 대문자다 · 오류 문구는 예외 XML이 상태 코드보다 먼저다.
 */

import * as http from 'node:http';

import { deleteInclude, removeIncludeStatement } from '../deleteInclude';
import { describeTierGate, exposureMemberships } from './deletionSupport';
import {
  type WriteHarness,
  adtException,
  jsonOf,
  lockBody,
  plainText,
  startWriteHarness,
  textOf,
  xml,
} from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';

const INCLUDE = 'ZSAPKIT_DEMO_INC';
const INCLUDE_URI = `/sap/bc/adt/programs/includes/${INCLUDE}`;
const MAIN = 'ZSAPKIT_DEMO';
const MAIN_URI = `/sap/bc/adt/programs/programs/${MAIN}`;
const ACTIVATION = '/sap/bc/adt/activation';

const MAIN_SOURCE = `REPORT ${MAIN}.\r\n*  INCLUDE ${INCLUDE}.   " commented out\r\n  INCLUDE ${INCLUDE}.\r\nSTART-OF-SELECTION.\r\n`;

interface Overrides {
  readonly deleteStatus?: number;
  readonly deleteBody?: string;
  readonly mainSource?: string;
  readonly putStatus?: number;
  readonly activationStatus?: number;
}

function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response: http.ServerResponse) => {
    const action = request.query.get('_action');
    if (action === 'LOCK') return xml(response, lockBody('LOCK-INC'));
    if (action === 'UNLOCK') return xml(response, '<ok/>');
    if (request.path === `${MAIN_URI}/source/main`) {
      if (request.method === 'GET') {
        return plainText(response, overrides.mainSource ?? MAIN_SOURCE);
      }
      return xml(response, '', overrides.putStatus ?? 200);
    }
    if (request.path === ACTIVATION) {
      return xml(response, '<chkl:messages xmlns:chkl="x"/>', overrides.activationStatus ?? 200);
    }
    if (request.path === INCLUDE_URI && request.method === 'DELETE') {
      return xml(response, overrides.deleteBody ?? '', overrides.deleteStatus ?? 200);
    }
    return xml(response, '<unexpected/>', 500);
  });
}

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

const run = (args: Record<string, unknown>) =>
  Promise.resolve(deleteInclude.handler(harness.context, args));

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    expect(await publishedSurfaceOf(deleteInclude)).toEqual(publishedDeclaration('DeleteInclude'));
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteInclude.definition.sets).toEqual(['high']);
    // D112 — 클라우드 축이 없다는 것이 JWT 거절 갈래를 대신하는 바닥선이다.
    expect(deleteInclude.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(deleteInclude.definition.kind).toBe('mutation');
    // 메인 프로그램도 소스가 바뀌므로 사전 검사의 대상이다.
    expect(deleteInclude.definition.targetNames).toEqual(['include_name', 'main_program']);
  });

  it('채록본의 노출 조건 소속과 어긋나지 않는다 — 클라우드에는 없다', () => {
    expect(exposureMemberships('DeleteInclude')).toEqual(['connected_default']);
  });
});

describe('와이어 — 메인 정리 없이', () => {
  it('LOCK → DELETE 둘뿐이고 **성공하면 UNLOCK을 보내지 않는다**', async () => {
    harness = await harnessFor();
    const result = await run({ include_name: INCLUDE.toLowerCase() });
    expect(result.isError).toBe(false);

    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${INCLUDE_URI}`,
      `DELETE ${INCLUDE_URI}`,
    ]);
    expect(harness.nth(0).query.get('_action')).toBe('LOCK');
    expect(harness.calls().some((call) => call.query.get('_action') === 'UNLOCK')).toBe(false);
  });

  it('**세션이 걸음마다 뒤집힌다** — 잠금은 stateful, DELETE는 stateless', async () => {
    harness = await harnessFor();
    await run({ include_name: INCLUDE });
    expect(harness.nth(0).headers['x-sap-adt-sessiontype']).toBe('stateful');
    expect(harness.nth(1).headers['x-sap-adt-sessiontype']).toBeUndefined();
  });

  it('DELETE에 lockHandle과 corrNr가 실린다', async () => {
    harness = await harnessFor();
    await run({ include_name: INCLUDE, transport_request: 'E19K905635' });
    expect(harness.nth(1).query.get('lockHandle')).toBe('LOCK-INC');
    expect(harness.nth(1).query.get('corrNr')).toBe('E19K905635');
  });

  it('성공 응답은 구의 일곱 칸 그대로다', async () => {
    harness = await harnessFor();
    expect(jsonOf(await run({ include_name: INCLUDE }))).toEqual({
      success: true,
      include_name: INCLUDE,
      main_program: null,
      transport_request: null,
      message: `Include ${INCLUDE} deleted successfully.`,
      steps_completed: ['lock', 'delete'],
      remove_note: null,
    });
  });
});

describe('메인 프로그램 정리', () => {
  it('읽기 → 잠금 → PUT → 해제 → 활성화 뒤에 인클루드를 지운다', async () => {
    harness = await harnessFor();
    const payload = jsonOf(await run({ include_name: INCLUDE, main_program: MAIN.toLowerCase() }));

    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${MAIN_URI}/source/main`,
      `POST ${MAIN_URI}`,
      `PUT ${MAIN_URI}/source/main`,
      `POST ${MAIN_URI}`,
      `POST ${ACTIVATION}`,
      `POST ${INCLUDE_URI}`,
      `DELETE ${INCLUDE_URI}`,
    ]);
    expect(payload.steps_completed).toEqual(['remove_from_main', 'activate_main', 'lock', 'delete']);
    expect(payload.remove_note).toBe(`INCLUDE ${INCLUDE}. removed from ${MAIN}.`);
  });

  it('PUT은 그 줄만 뺀 소스를 싣고 **주석 줄은 남긴다** · CRLF도 보존한다', async () => {
    harness = await harnessFor();
    await run({ include_name: INCLUDE, main_program: MAIN, transport_request: 'E19K905635' });

    const put = harness.nth(2);
    expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(put.query.get('lockHandle')).toBe('LOCK-INC');
    expect(put.query.get('corrNr')).toBe('E19K905635');
    expect(put.body).toBe(
      `REPORT ${MAIN}.\r\n*  INCLUDE ${INCLUDE}.   " commented out\r\nSTART-OF-SELECTION.\r\n`,
    );
  });

  it('**활성화 XML의 인코딩 표기가 대문자 UTF-8이다** (형제는 소문자다)', async () => {
    harness = await harnessFor();
    await run({ include_name: INCLUDE, main_program: MAIN });

    const activate = harness.nth(4);
    expect(activate.body).toContain('encoding="UTF-8"');
    expect(activate.body).not.toContain('encoding="utf-8"');
    expect(activate.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">' +
        `<adtcore:objectReference adtcore:uri="${MAIN_URI}" adtcore:name="${MAIN}"/>` +
        '</adtcore:objectReferences>',
    );
    expect(activate.headers['content-type']).toBe(
      'application/vnd.sap.adt.activation.request+xml; charset=utf-8',
    );
    expect(activate.query.get('method')).toBe('activate');
    expect(activate.query.get('preauditRequested')).toBe('true');
  });

  it('그 줄이 없으면 메인을 건드리지 않고 넘어간다', async () => {
    harness = await harnessFor({ mainSource: `REPORT ${MAIN}.\nSTART-OF-SELECTION.\n` });
    const payload = jsonOf(await run({ include_name: INCLUDE, main_program: MAIN }));

    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${MAIN_URI}/source/main`,
      `POST ${INCLUDE_URI}`,
      `DELETE ${INCLUDE_URI}`,
    ]);
    expect(payload.steps_completed).toEqual(['skip_remove_not_present', 'lock', 'delete']);
    expect(String(payload.remove_note)).toContain('skipping main program update');
  });

  it('remove_from_main=false면 메인을 읽지도 않는다', async () => {
    harness = await harnessFor();
    await run({ include_name: INCLUDE, main_program: MAIN, remove_from_main: false });
    expect(harness.calls()).toHaveLength(2);
  });

  it('**메인 정리 실패는 삼키고 삭제를 계속한다** — 구 그대로', async () => {
    harness = await harnessFor({ putStatus: 400 });
    const result = await run({ include_name: INCLUDE, main_program: MAIN });

    expect(result.isError).toBe(false);
    const payload = jsonOf(result);
    expect(String(payload.remove_note)).toContain(`Could not remove reference from ${MAIN}`);
    expect(payload.steps_completed).toEqual(['lock', 'delete']);
    expect(String(payload.message)).toContain(`Include ${INCLUDE} deleted.`);
  });

  it('활성화가 실패해도 경고로 끝난다 — 삭제는 계속된다', async () => {
    harness = await harnessFor({ activationStatus: 500 });
    const payload = jsonOf(await run({ include_name: INCLUDE, main_program: MAIN }));
    expect(payload.steps_completed).toEqual(['remove_from_main', 'lock', 'delete']);
    expect(payload.remove_note).toBe(`INCLUDE ${INCLUDE}. removed from ${MAIN}.`);
  });
});

describe('갈래 — **예외 XML이 상태 코드보다 먼저다**', () => {
  it('include_name이 없으면 요청을 하나도 보내지 않는다', async () => {
    harness = await harnessFor();
    const result = await run({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: include_name is required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('404 + 예외 XML이면 **SAP 문구**가 이긴다 (삭제 서비스 계열과 반대)', async () => {
    harness = await harnessFor({
      deleteStatus: 404,
      deleteBody: adtException('ExceptionResourceNotFound', 'Include is still referenced'),
    });
    expect(textOf(await run({ include_name: INCLUDE }))).toBe(
      `Error: Failed to delete include ${INCLUDE}: SAP Error: Include is still referenced`,
    );
  });

  it('예외 XML이 없는 404는 상태 힌트로 답한다', async () => {
    harness = await harnessFor({ deleteStatus: 404, deleteBody: '<plain/>' });
    expect(textOf(await run({ include_name: INCLUDE }))).toBe(
      `Error: Failed to delete include ${INCLUDE}: Include ${INCLUDE} not found. It may already be deleted.`,
    );
  });

  it('예외 XML이 없는 400은 구 문구 그대로다 — 괄호가 붙는다', async () => {
    harness = await harnessFor({ deleteStatus: 400, deleteBody: '<plain/>' });
    expect(textOf(await run({ include_name: INCLUDE }))).toBe(
      `Error: Failed to delete include ${INCLUDE}: Bad request (400). Check if transport request is required and valid.`,
    );
  });

  it('DELETE가 실패하면 **그때는 UNLOCK을 보낸다**', async () => {
    harness = await harnessFor({ deleteStatus: 423, deleteBody: '<locked/>' });
    await run({ include_name: INCLUDE });
    expect(harness.calls().map((call) => `${call.method} ${call.query.get('_action') ?? ''}`)).toEqual(
      ['POST LOCK', 'DELETE ', 'POST UNLOCK'],
    );
  });
});

describe('removeIncludeStatement — 구 헬퍼의 판정', () => {
  it('주석 줄은 지우지 않는다', () => {
    const { newSource, removed } = removeIncludeStatement(
      `* INCLUDE zfoo.\n" INCLUDE zfoo.\n  INCLUDE zfoo.\n`,
      'ZFOO',
    );
    expect(removed).toBe(true);
    expect(newSource).toBe('* INCLUDE zfoo.\n" INCLUDE zfoo.\n');
  });

  it('LF만 있는 소스는 LF로 다시 잇는다', () => {
    expect(removeIncludeStatement('REPORT z.\nINCLUDE zfoo.\n', 'ZFOO').newSource).toBe(
      'REPORT z.\n',
    );
  });

  it('없으면 removed=false이고 소스가 그대로다', () => {
    const source = 'REPORT z.\n';
    expect(removeIncludeStatement(source, 'ZFOO')).toEqual({ newSource: source, removed: false });
  });
});

describeTierGate(deleteInclude, { include_name: INCLUDE });
