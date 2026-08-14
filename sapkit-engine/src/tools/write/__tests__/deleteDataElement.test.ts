/**
 * `DeleteDataElement` — 발행 계약 · 와이어 · 거짓 성공 판정 · ECC 갈래(장부 D110) ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteDataElement`
 *  - 겉 핸들러: `engine/src/handlers/data_element/high/handleDeleteDataElement.ts:17-192`
 *  - 사슬·세션: `.../dist/core/dataElement/AdtDataElement.js` delete (세션 무접촉)
 *  - 전문·주소: `.../dist/core/dataElement/delete.js:19-85` (라벨 `"Data element"`)
 *  - ECC 브리지 이름: `ZMCP_ADT_DDIC_DTEL` (`handleDeleteDataElement.ts:159-165`)
 *
 * 라벨에 **띄어쓰기가 들어간다** — 눈으로 옮기면 틀리는 자리라 spec으로 못 박는다.
 */

import { deleteDataElement } from '../deleteDataElement';
import { describeStandardDeletion, startDeletionHarness } from './deletionSupport';
import { type WriteHarness, textOf } from './harness';

const NAME = 'ZSAPKIT_DTEL';
const URI = `/sap/bc/adt/ddic/dataelements/${NAME}`;

describeStandardDeletion({
  tool: deleteDataElement,
  name: 'DeleteDataElement',
  args: { data_element_name: NAME },
  lowerArgs: { data_element_name: NAME.toLowerCase() },
  objectUri: URI,
  availableIn: ['onprem', 'cloud'],
  targetNames: ['data_element_name'],
  layout: 'standard',
  stateful: false,
  vendorLabel: 'Data element',
  statusLabel: 'Data element',
  subject: 'data element',
  successPayload: (transport) => ({
    success: true,
    data_element_name: NAME,
    transport_request: transport,
    message: `Data element ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: data_element_name is required',
});

describe('D110 — ECC 우회로가 없다는 것을 정직하게 알린다', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  it('SAP_VERSION=ECC면 이름 있는 거절을 내고 **요청이 0회**다', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const ecc = { ...harness.context, profile: { ...harness.context.profile, sapVersion: 'ECC' } };
    const result = await deleteDataElement.handler(ecc, { data_element_name: NAME });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('DeleteDataElement on SAP_VERSION=ECC');
    expect(textOf(result)).toContain('ZMCP_ADT_DDIC_DTEL');
    expect(textOf(result)).toContain('divergence D110');
    expect(harness.calls()).toHaveLength(0);
  });

  it('ECC가 아니면 평소대로 두 걸음을 보낸다 (과수리 역검증)', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const s4 = { ...harness.context, profile: { ...harness.context.profile, sapVersion: 'S4HANA' } };
    expect((await deleteDataElement.handler(s4, { data_element_name: NAME })).isError).toBe(false);
    expect(harness.calls()).toHaveLength(2);
  });
});
