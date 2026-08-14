/**
 * `GetScreensList` — 프로젝트 탐색기의 오브젝트 구조에서 `PROG/PS` 마디를 걷는다.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/screen/readonly/handleGetScreensList.ts:35-131`)와 그
 * 아래 벤더 조립
 * (`@babamba2/mcp-abap-adt-clients/dist/core/shared/objectStructure.js:27-45`)의
 * 실측에서 뽑았다.
 */

import { cleanupTempDirs } from '../../../server/__tests__/fixtures';
import {
  type AdtResponder,
  type RfcHarness,
  invoke,
  jsonOf,
  objectStructureXml,
  publishedDeclaration,
  publishedSurfaceOf,
  startRfcHarness,
  textOf,
  xml,
} from '../../rfc-read/__tests__/rfcToolSupport';
import { getScreensList } from '../getScreensList';

const STRUCTURE = '/sap/bc/adt/repository/objectstructure';

function adtResponder(body: string, status = 200): AdtResponder {
  return (request, response) => {
    if (request.path === STRUCTURE) return xml(response, body, status);
    response.statusCode = 500;
    response.end(`예상하지 못한 ADT 요청: ${request.method} ${request.url}`);
  };
}

let harness: RfcHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자 그대로 같다', async () => {
    expect(await publishedSurfaceOf(getScreensList)).toEqual(publishedDeclaration('GetScreensList'));
  });

  it('노출 선언은 구 핸들러 그대로다 — readonly · onprem/legacy · read', () => {
    expect(getScreensList.definition.sets).toEqual(['readonly']);
    expect(getScreensList.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(getScreensList.definition.kind).toBe('read');
    expect(getScreensList.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어', () => {
  it('objecttype → objectname 순으로 손으로 이어 붙인 질의를 보낸다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(objectStructureXml([])) });
    await invoke(getScreensList, harness, { program_name: 'sapmv45a' });

    const request = harness.nthAdt(0);
    expect(request.method).toBe('GET');
    expect(request.url).toBe(`${STRUCTURE}?objecttype=PROG%2FP&objectname=SAPMV45A`);
    expect(request.headers['accept']).toBe(
      'application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml',
    );
    // RFC 대리자는 타지 않는다 — 이 도구는 순수 ADT 읽기다.
    expect(harness.rfcCalls).toHaveLength(0);
  });

  it('오브젝트 이름은 **두 겹**으로 인코딩된다 (타입은 한 겹) — 구의 실측', async () => {
    harness = await startRfcHarness({ adt: adtResponder(objectStructureXml([])) });
    await invoke(getScreensList, harness, { program_name: '/CBY/Z_SCREEN' });
    expect(harness.nthAdt(0).url).toBe(
      `${STRUCTURE}?objecttype=PROG%2FP&objectname=%252FCBY%252FZ_SCREEN`,
    );
  });
});

describe('걸러 내기', () => {
  it('`PROG/PS` 마디의 **description**에서 화면 번호를 꺼낸다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(
        objectStructureXml([
          { objecttype: 'PROG/P', description: 'SAPMV45A' },
          { objecttype: 'PROG/PS', description: '0100' },
          { objecttype: 'PROG/PS', description: ' 1000 ' },
          { objecttype: 'PROG/PC', description: 'MAIN_STATUS' },
        ]),
      ),
    });
    const body = jsonOf(await invoke(getScreensList, harness, { program_name: 'SAPMV45A' }));

    expect(body).toEqual({
      success: true,
      program_name: 'SAPMV45A',
      total_screens: 2,
      screens: [{ screen_number: '0100' }, { screen_number: '1000' }],
    });
  });

  it('앞자리 0이 살아 있다 — 속성 값은 수로 접히지 않는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(objectStructureXml([{ objecttype: 'PROG/PS', description: '0100' }])),
    });
    const body = jsonOf(await invoke(getScreensList, harness, { program_name: 'SAPMV45A' }));
    expect((body['screens'] as Array<Record<string, unknown>>)[0]!['screen_number']).toBe('0100');
  });

  it('폴더 마디와 이름 없는 마디는 버린다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(
        objectStructureXml([
          { objecttype: 'PROG/PS', description: '0100', isfolder: 'true' },
          { objecttype: 'PROG/PS', description: '  ' },
          { objecttype: 'PROG/PS', description: '0200' },
        ]),
      ),
    });
    const body = jsonOf(await invoke(getScreensList, harness, { program_name: 'SAPMV45A' }));
    expect(body['screens']).toEqual([{ screen_number: '0200' }]);
  });

  it('마디가 하나뿐이어도(배열이 아니어도) 읽는다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder(objectStructureXml([{ objecttype: 'PROG/PS', description: '0100' }])),
    });
    const body = jsonOf(await invoke(getScreensList, harness, { program_name: 'SAPMV45A' }));
    expect(body['total_screens']).toBe(1);
  });

  it('마디가 아예 없으면 **빈 목록으로 성공**한다 — 오류가 아니다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder('<?xml version="1.0"?><projectexplorer:objectstructure/>'),
    });
    const body = jsonOf(await invoke(getScreensList, harness, { program_name: 'SAPMV45A' }));
    expect(body).toEqual({
      success: true,
      program_name: 'SAPMV45A',
      total_screens: 0,
      screens: [],
    });
  });
});

describe('갈래', () => {
  it('program_name이 없으면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    const result = await invoke(getScreensList, harness, {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: program_name is required');
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('404는 자기 문구로 갈아 끼우되 **원문 인자 이름**을 쓴다 (대문자로 올리지 않는다)', async () => {
    harness = await startRfcHarness({ adt: adtResponder('<err/>', 404) });
    const result = await invoke(getScreensList, harness, { program_name: 'znope' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: Program znope not found.');
  });
});
