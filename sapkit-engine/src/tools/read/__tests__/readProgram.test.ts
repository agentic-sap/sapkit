/**
 * `ReadProgram` — 발행 계약 · 와이어(요청 **둘**) · 갈래 · `GetProgram`과의 차이.
 *
 * 이 도구는 이름이 `GetProgram`과 비슷하지만 **다른 도구다.** 이 시험의 마지막
 * 절이 그 차이를 글자로 못박는다 — 대충 같게 지으면 그 차이가 조용히 사라진다.
 *
 * 전송은 주입된 가짜다. SAP에 붙지 않는다.
 */

import { getProgram } from '../getProgram';
import { readProgram } from '../readProgram';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const SOURCE = "REPORT zprog_test.\nWRITE 'hello'.";
const METADATA = '<?xml version="1.0"?><program:abapProgram adtcore:name="ZPROG_TEST"/>';

const SOURCE_URL = `${TEST_ORIGIN}/sap/bc/adt/programs/programs/ZPROG_TEST/source/main`;
const METADATA_URL = `${TEST_ORIGIN}/sap/bc/adt/programs/programs/ZPROG_TEST`;

/**
 * 벤더가 프로그램 메타데이터에 싣던 Accept — 시험이 스스로 적어 둔다.
 * 근거: `@babamba2/mcp-abap-adt-clients/dist/constants/contentTypes.js:69`
 * (`ACCEPT_PROGRAM`), 쓰이는 자리는 같은 패키지 `core/shared/AdtUtils.js:281`.
 */
const ACCEPT_PROGRAM =
  'application/vnd.sap.adt.programs.programs.v2+xml, application/vnd.sap.adt.programs.programs.v1+xml';

/** 소스와 메타데이터를 갈라 답하는 전송. */
function split(source: { status?: number; body?: string }, metadata: { status?: number; body?: string }) {
  return (request: { url: string }) => (request.url.includes('/source/main') ? source : metadata);
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readProgram);
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
      }).toEqual(publishedDeclaration('ReadProgram'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/program/readonly/` → readonly 집합.
    // 채록본 `exposures`에서 이 도구는 connected 두 조건에만 뜬다(cloud에 없다).
    expect(readProgram.definition.sets).toEqual(['readonly']);
    expect(readProgram.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(readProgram.definition.kind).toBe('read');
  });
});

describe('와이어 — 요청이 둘이다', () => {
  it('소스와 메타데이터를 각각 구와 같은 자리로 묻는다', async () => {
    const { outcome, requests } = await runTool(
      readProgram,
      { program_name: 'zprog_test' },
      split({ body: SOURCE }, { body: METADATA }),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(2);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(`${SOURCE_URL}?version=active`);
    expect(sent[0]?.headers['Accept']).toBe('text/plain');

    expect(sent[1]?.method).toBe('GET');
    // 메타데이터에는 질의 인자가 붙지 않는다 — 벤더가 options 없이 부른다.
    expect(sent[1]?.url).toBe(METADATA_URL);
    expect(sent[1]?.headers['Accept']).toBe(ACCEPT_PROGRAM);

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      program_name: 'ZPROG_TEST',
      version: 'active',
      source_code: SOURCE,
      metadata: METADATA,
    });
  });

  it('version은 소스 쪽에만 실린다', async () => {
    const { outcome, requests } = await runTool(
      readProgram,
      { program_name: 'ZPROG_TEST', version: 'inactive' },
      split({ body: SOURCE }, { body: METADATA }),
    );
    const sent = toolRequests(requests);

    expect(sent[0]?.url).toBe(`${SOURCE_URL}?version=inactive`);
    expect(sent[1]?.url).toBe(METADATA_URL);
    expect(JSON.parse(outcome.text).version).toBe('inactive');
  });
});

describe('갈래 — 실패해도 오류로 답하지 않는다', () => {
  it('소스가 404여도 성공으로 답하고 source_code만 null이다', async () => {
    const { outcome, requests } = await runTool(
      readProgram,
      { program_name: 'ZPROG_TEST' },
      split({ status: 404, body: 'not found' }, { body: METADATA }),
    );

    // 소스가 없어도 메타데이터는 계속 묻는다.
    expect(toolRequests(requests)).toHaveLength(2);
    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toMatchObject({
      success: true,
      source_code: null,
      metadata: METADATA,
    });
  });

  it('메타데이터가 500이어도 성공으로 답하고 metadata만 null이다', async () => {
    const { outcome } = await runTool(
      readProgram,
      { program_name: 'ZPROG_TEST' },
      split({ body: SOURCE }, { status: 500, body: 'boom' }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toMatchObject({ source_code: SOURCE, metadata: null });
  });

  it('빈 본문은 빈 문자열이 아니라 null이다 — 구의 진위 판정 그대로', async () => {
    const { outcome } = await runTool(
      readProgram,
      { program_name: 'ZPROG_TEST' },
      split({ body: '' }, { body: '' }),
    );

    expect(JSON.parse(outcome.text)).toMatchObject({ source_code: null, metadata: null });
  });

  it('program_name이 비면 구와 같은 문구로 거절한다', async () => {
    const { outcome, requests } = await runTool(readProgram, { program_name: '' }, () => ({ body: '' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: program_name is required');
    // 거절은 접속 앞에서 끝난다 — SAP으로 한 발도 나가지 않는다.
    expect(requests).toHaveLength(0);
  });
});

describe('GetProgram과의 차이 — 이름이 비슷하다고 같은 도구가 아니다', () => {
  const replyAll = () => ({ body: SOURCE });

  it('요청 수가 다르다 — ReadProgram 둘, GetProgram 하나', async () => {
    const read = await runTool(readProgram, { program_name: 'ZP' }, replyAll);
    const get = await runTool(getProgram, { program_name: 'ZP' }, replyAll);

    expect(toolRequests(read.requests)).toHaveLength(2);
    expect(toolRequests(get.requests)).toHaveLength(1);
  });

  it('응답 키가 다르다 — source_code·metadata 대 program_data·status', async () => {
    const read = await runTool(readProgram, { program_name: 'ZP' }, replyAll);
    const get = await runTool(getProgram, { program_name: 'ZP' }, replyAll);

    expect(Object.keys(JSON.parse(read.outcome.text)).sort()).toEqual([
      'metadata',
      'program_name',
      'source_code',
      'success',
      'version',
    ]);
    expect(Object.keys(JSON.parse(get.outcome.text)).sort()).toEqual([
      'program_data',
      'program_name',
      'status',
      'status_text',
      'success',
      'version',
    ]);
  });

  it('404의 뜻이 다르다 — ReadProgram은 성공, GetProgram은 오류', async () => {
    const notFound = () => ({ status: 404, body: '' });
    const read = await runTool(readProgram, { program_name: 'ZP' }, notFound);
    const get = await runTool(getProgram, { program_name: 'ZP' }, notFound);

    expect(read.outcome.isError).toBe(false);
    expect(get.outcome.isError).toBe(true);
    expect(get.outcome.text).toBe('Error: Program ZP not found.');
  });
});
