/**
 * `GetGuiStatusList` — 오브젝트 구조에서 `PROG/PC` 마디를 걷는다.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/gui_status/readonly/handleGetGuiStatusList.ts:35-134`)의
 * 실측에서 뽑았고, `GetScreensList`와 **같은 요청**임을 나란히 못 박는다.
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
import { getGuiStatusList } from '../getGuiStatusList';
import { getScreensList } from '../getScreensList';

const STRUCTURE = '/sap/bc/adt/repository/objectstructure';

const NODES = objectStructureXml([
  { objecttype: 'PROG/P', description: 'SAPMV45A' },
  { objecttype: 'PROG/PC', description: 'MAIN_STATUS' },
  { objecttype: 'PROG/PC', description: ' POPUP ' },
  { objecttype: 'PROG/PC', description: 'FOLDER', isfolder: 'true' },
  { objecttype: 'PROG/PS', description: '0100' },
]);

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
    expect(await publishedSurfaceOf(getGuiStatusList)).toEqual(
      publishedDeclaration('GetGuiStatusList'),
    );
  });

  it('노출 선언은 구 핸들러 그대로다 — readonly · onprem/legacy · read', () => {
    expect(getGuiStatusList.definition.sets).toEqual(['readonly']);
    expect(getGuiStatusList.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(getGuiStatusList.definition.kind).toBe('read');
    expect(getGuiStatusList.definition.targetNames).toEqual(['program_name']);
  });
});

describe('와이어', () => {
  it('GetScreensList와 **같은 요청**을 보낸다 — 다른 것은 걸러 내기뿐이다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(NODES) });
    await invoke(getGuiStatusList, harness, { program_name: 'sapmv45a' });
    await invoke(getScreensList, harness, { program_name: 'sapmv45a' });

    expect(harness.nthAdt(0).url).toBe(`${STRUCTURE}?objecttype=PROG%2FP&objectname=SAPMV45A`);
    expect(harness.nthAdt(0).url).toBe(harness.nthAdt(1).url);
    expect(harness.nthAdt(0).headers['accept']).toBe(harness.nthAdt(1).headers['accept']);
    expect(harness.rfcCalls).toHaveLength(0);
  });
});

describe('걸러 내기', () => {
  it('`PROG/PC` 마디만 걷고 화면 마디는 버린다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(NODES) });
    const body = jsonOf(await invoke(getGuiStatusList, harness, { program_name: 'SAPMV45A' }));

    expect(body).toEqual({
      success: true,
      program_name: 'SAPMV45A',
      total_statuses: 2,
      statuses: [{ status_name: 'MAIN_STATUS' }, { status_name: 'POPUP' }],
    });
  });

  it('같은 응답에서 두 도구가 서로 다른 것을 걷는다', async () => {
    harness = await startRfcHarness({ adt: adtResponder(NODES) });
    const statuses = jsonOf(await invoke(getGuiStatusList, harness, { program_name: 'SAPMV45A' }));
    const screens = jsonOf(await invoke(getScreensList, harness, { program_name: 'SAPMV45A' }));

    expect(statuses['statuses']).toEqual([
      { status_name: 'MAIN_STATUS' },
      { status_name: 'POPUP' },
    ]);
    expect(screens['screens']).toEqual([{ screen_number: '0100' }]);
  });

  it('마디가 아예 없으면 빈 목록으로 성공한다', async () => {
    harness = await startRfcHarness({
      adt: adtResponder('<?xml version="1.0"?><projectexplorer:objectstructure/>'),
    });
    const body = jsonOf(await invoke(getGuiStatusList, harness, { program_name: 'SAPMV45A' }));
    expect(body).toEqual({
      success: true,
      program_name: 'SAPMV45A',
      total_statuses: 0,
      statuses: [],
    });
  });
});

describe('갈래', () => {
  it('program_name이 없으면 SAP에 나가기 전에 거절한다', async () => {
    harness = await startRfcHarness({});
    expect(textOf(await invoke(getGuiStatusList, harness, {}))).toBe(
      'Error: program_name is required',
    );
    expect(harness.adtCalls()).toHaveLength(0);
  });

  it('404는 원문 인자 이름을 그대로 쓴다', async () => {
    harness = await startRfcHarness({ adt: adtResponder('<err/>', 404) });
    expect(textOf(await invoke(getGuiStatusList, harness, { program_name: 'znope' }))).toBe(
      'Error: Program znope not found.',
    );
  });
});
