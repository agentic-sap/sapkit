/**
 * `GetProgFullCode` — 발행 계약 · 와이어 · 인클루드 수집 · `GetProgram`과의 차이.
 *
 * 이 도구는 프로그램 소스를 읽는다는 점에서 `GetProgram`과 겹쳐 보이지만
 * **보내는 주소부터 다르다**(질의 인자도, 이름 대문자화도 없다). 마지막 절이
 * 그 차이를 글자로 못박는다.
 *
 * 전송은 주입된 가짜다. SAP에 붙지 않는다.
 */

import { getProgFullCode } from '../getProgFullCode';
import { getProgram } from '../getProgram';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const PROGRAM_ROOT = '/sap/bc/adt/programs/programs';
const INCLUDE_ROOT = '/sap/bc/adt/programs/includes';
const FUNCTION_GROUP_ROOT = '/sap/bc/adt/functions/groups';

/** 소스 본문을 이름으로 골라 주는 전송. 없는 이름은 404다. */
function sources(bodies: Readonly<Record<string, string>>) {
  return (request: { url: string }) => {
    for (const [name, body] of Object.entries(bodies)) {
      if (request.url.includes(`/${name}/source/main`) || request.url.endsWith(`/${name}`)) {
        return { body };
      }
    }
    return { status: 404, body: 'not found' };
  };
}

/** 응답 JSON. */
interface FullCode {
  name: string;
  type: string;
  total_code_objects: number;
  code_objects: { OBJECT_TYPE: string; OBJECT_NAME: string; code: string | null }[];
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getProgFullCode);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as {
        name: string;
        description: string;
        inputSchema: unknown;
        execution: unknown;
      };

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetProgFullCode'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/program/readonly/` → readonly 집합.
    expect(getProgFullCode.definition.sets).toEqual(['readonly']);
    expect(getProgFullCode.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(getProgFullCode.definition.kind).toBe('read');
  });
});

describe('와이어 — PROG/P', () => {
  it('질의 인자 없이, 이름을 대문자로 올리지 않고 묻는다', async () => {
    const { requests } = await runTool(
      getProgFullCode,
      { name: 'zprog_main', type: 'PROG/P' },
      sources({ zprog_main: 'REPORT zprog_main.' }),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(`${TEST_ORIGIN}${PROGRAM_ROOT}/zprog_main/source/main`);
    expect(sent[0]?.headers['Accept']).toBe('text/plain');
  });

  it('본체가 첫 항목으로 실리고 type은 준 값 그대로다', async () => {
    const { outcome } = await runTool(
      getProgFullCode,
      { name: 'ZPROG_MAIN', type: 'PROG/P' },
      sources({ ZPROG_MAIN: 'REPORT zprog_main.' }),
    );
    const payload = JSON.parse(outcome.text) as FullCode;

    expect(payload.name).toBe('ZPROG_MAIN');
    expect(payload.type).toBe('PROG/P');
    expect(payload.total_code_objects).toBe(1);
    expect(payload.code_objects[0]).toEqual({
      OBJECT_TYPE: 'PROG/P',
      OBJECT_NAME: 'ZPROG_MAIN',
      code: 'REPORT zprog_main.',
    });
  });
});

describe('인클루드 수집', () => {
  it('`INCLUDE X.`와 `INCLUDE: X, Y.` 두 어법을 모두 걷는다', async () => {
    const main = ['REPORT zprog_main.', 'INCLUDE ZINC_A.', 'INCLUDE: ZINC_B, ZINC_C.'].join('\n');
    const { outcome } = await runTool(
      getProgFullCode,
      { name: 'ZPROG_MAIN', type: 'PROG/P' },
      sources({ ZPROG_MAIN: main, ZINC_A: '* a', ZINC_B: '* b', ZINC_C: '* c' }),
    );
    const payload = JSON.parse(outcome.text) as FullCode;

    expect(payload.code_objects.map((o) => o.OBJECT_NAME)).toEqual([
      'ZPROG_MAIN',
      'ZINC_A',
      'ZINC_B',
      'ZINC_C',
    ]);
    expect(payload.code_objects.map((o) => o.OBJECT_TYPE)).toEqual(['PROG/P', 'PROG/I', 'PROG/I', 'PROG/I']);
    expect(payload.total_code_objects).toBe(4);
  });

  it('인클루드는 구와 같은 인클루드 경로로 읽는다', async () => {
    const { requests } = await runTool(
      getProgFullCode,
      { name: 'ZPROG_MAIN', type: 'PROG/P' },
      sources({ ZPROG_MAIN: 'INCLUDE ZINC_A.', ZINC_A: '* a' }),
    );
    const urls = toolRequests(requests).map((r) => r.url);

    expect(urls[0]).toBe(`${TEST_ORIGIN}${PROGRAM_ROOT}/ZPROG_MAIN/source/main`);
    expect(urls.slice(1)).toEqual([
      // 구는 같은 인클루드를 두 번 읽는다 — 한 번은 중첩 탐색, 한 번은 코드 수집.
      `${TEST_ORIGIN}${INCLUDE_ROOT}/ZINC_A/source/main`,
      `${TEST_ORIGIN}${INCLUDE_ROOT}/ZINC_A/source/main`,
    ]);
  });

  it('중첩 인클루드까지 내려간다 (장부 D46 — 구는 여기서 멈췄다)', async () => {
    const { outcome } = await runTool(
      getProgFullCode,
      { name: 'ZPROG_MAIN', type: 'PROG/P' },
      sources({
        ZPROG_MAIN: 'INCLUDE ZINC_A.',
        ZINC_A: 'INCLUDE ZINC_NESTED.',
        ZINC_NESTED: '* nested',
      }),
    );
    const payload = JSON.parse(outcome.text) as FullCode;

    expect(payload.code_objects.map((o) => o.OBJECT_NAME)).toEqual(['ZPROG_MAIN', 'ZINC_A', 'ZINC_NESTED']);
    expect(payload.code_objects[2]?.code).toBe('* nested');
  });

  it('같은 인클루드를 두 번 선언해도 한 번만 실린다', async () => {
    const main = ['INCLUDE ZINC_A.', 'INCLUDE ZINC_A.'].join('\n');
    const { outcome } = await runTool(
      getProgFullCode,
      { name: 'ZPROG_MAIN', type: 'PROG/P' },
      sources({ ZPROG_MAIN: main, ZINC_A: '* a' }),
    );
    const payload = JSON.parse(outcome.text) as FullCode;

    expect(payload.code_objects.map((o) => o.OBJECT_NAME)).toEqual(['ZPROG_MAIN', 'ZINC_A']);
  });

  it('서로를 부르는 인클루드에서도 멈춘다', async () => {
    const { outcome } = await runTool(
      getProgFullCode,
      { name: 'ZPROG_MAIN', type: 'PROG/P' },
      sources({
        ZPROG_MAIN: 'INCLUDE ZINC_A.',
        ZINC_A: 'INCLUDE ZINC_B.',
        ZINC_B: 'INCLUDE ZINC_A.',
      }),
    );
    const payload = JSON.parse(outcome.text) as FullCode;

    expect(payload.code_objects.map((o) => o.OBJECT_NAME)).toEqual(['ZPROG_MAIN', 'ZINC_A', 'ZINC_B']);
  });
});

describe('와이어 — FUGR', () => {
  it('함수그룹은 그룹 경로로, 벤더가 싣던 Accept로 묻는다', async () => {
    const { requests } = await runTool(
      getProgFullCode,
      { name: 'ZFG_TEST', type: 'FUGR' },
      sources({ ZFG_TEST: '<group/>' }),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`${TEST_ORIGIN}${FUNCTION_GROUP_ROOT}/ZFG_TEST`);
    expect(sent[0]?.headers['Accept']).toBe('*/*');
  });

  it('함수그룹의 인클루드에도 코드가 실린다 (장부 D46 — 구는 언제나 null이었다)', async () => {
    const { outcome } = await runTool(
      getProgFullCode,
      { name: 'ZFG_TEST', type: 'FUGR' },
      sources({ ZFG_TEST: 'INCLUDE LZFG_TESTTOP.', LZFG_TESTTOP: '* top' }),
    );
    const payload = JSON.parse(outcome.text) as FullCode;

    expect(payload.code_objects[0]?.OBJECT_TYPE).toBe('FUGR');
    expect(payload.code_objects[1]).toEqual({
      OBJECT_TYPE: 'PROG/I',
      OBJECT_NAME: 'LZFG_TESTTOP',
      code: '* top',
    });
  });
});

describe('코드가 없을 때 — 두 문구가 갈린다', () => {
  it('404면 Result: undefined', async () => {
    const { outcome } = await runTool(getProgFullCode, { name: 'ZP', type: 'PROG/P' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('No program code found for ZP. Result: undefined');
  });

  it('빈 본문이면 Result: exists but no sourceCode', async () => {
    const { outcome } = await runTool(getProgFullCode, { name: 'ZP', type: 'PROG/P' }, () => ({ body: '' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('No program code found for ZP. Result: exists but no sourceCode');
  });

  it('404가 아닌 실패는 접속 계층의 문구로 오른다', async () => {
    const { outcome } = await runTool(getProgFullCode, { name: 'ZP', type: 'PROG/P' }, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).not.toContain('No program code found');
  });
});

describe('공백 정규화 — 구가 일부러 하던 일이다', () => {
  it('두 칸 이상 이어진 공백은 한 칸으로 접힌다', async () => {
    const { outcome } = await runTool(
      getProgFullCode,
      { name: 'ZP', type: 'PROG/P' },
      sources({ ZP: 'REPORT zp.\n    WRITE    1.' }),
    );
    const payload = JSON.parse(outcome.text) as FullCode;

    expect(payload.code_objects[0]?.code).toBe('REPORT zp.\n WRITE 1.');
  });
});

describe('GetProgram과의 차이 — 같은 소스를 다른 주소로 읽는다', () => {
  it('GetProgram은 대문자화 + version 인자, GetProgFullCode는 둘 다 없다', async () => {
    const full = await runTool(
      getProgFullCode,
      { name: 'zprog', type: 'PROG/P' },
      sources({ zprog: 'REPORT zprog.' }),
    );
    const get = await runTool(getProgram, { program_name: 'zprog' }, () => ({ body: 'REPORT zprog.' }));

    expect(toolRequests(full.requests)[0]?.url).toBe(`${TEST_ORIGIN}${PROGRAM_ROOT}/zprog/source/main`);
    expect(toolRequests(get.requests)[0]?.url).toBe(
      `${TEST_ORIGIN}${PROGRAM_ROOT}/ZPROG/source/main?version=active`,
    );
  });

  it('GetProgram은 소스를 그대로 싣고, GetProgFullCode는 공백을 접는다', async () => {
    const source = 'REPORT zp.\n    WRITE 1.';
    const full = await runTool(getProgFullCode, { name: 'ZP', type: 'PROG/P' }, sources({ ZP: source }));
    const get = await runTool(getProgram, { program_name: 'ZP' }, () => ({ body: source }));

    expect((JSON.parse(full.outcome.text) as FullCode).code_objects[0]?.code).toBe('REPORT zp.\n WRITE 1.');
    expect(JSON.parse(get.outcome.text).program_data).toBe(source);
  });
});
