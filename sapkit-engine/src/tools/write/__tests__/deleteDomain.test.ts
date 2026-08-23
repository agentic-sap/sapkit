/**
 * `DeleteDomain` — 발행 계약 · 와이어 · 거짓 성공 판정 · ECC 갈래(장부 D110) ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteDomain`
 *  - 겉 핸들러: `engine/src/handlers/domain/high/handleDeleteDomain.ts:17-186`
 *  - 사슬·세션: `.../dist/core/domain/AdtDomain.js` delete (세션 무접촉)
 *  - 전문·주소: `.../dist/core/domain/delete.js:19-84` (라벨 `"Domain"`)
 *  - ECC 브리지 이름: `ZSAPKIT_ADT_DDIC_DOMA` (`handleDeleteDomain.ts:155-161`)
 */

import { deleteDomain } from '../deleteDomain';
import { describeStandardDeletion, startDeletionHarness } from './deletionSupport';
import { type WriteHarness, textOf } from './harness';

const NAME = 'ZSAPKIT_DOM';
const URI = `/sap/bc/adt/ddic/domains/${NAME}`;

describeStandardDeletion({
  tool: deleteDomain,
  name: 'DeleteDomain',
  args: { domain_name: NAME },
  lowerArgs: { domain_name: NAME.toLowerCase() },
  objectUri: URI,
  availableIn: ['onprem', 'cloud'],
  targetNames: ['domain_name'],
  layout: 'standard',
  stateful: false,
  vendorLabel: 'Domain',
  statusLabel: 'Domain',
  subject: 'domain',
  successPayload: (transport) => ({
    success: true,
    domain_name: NAME,
    transport_request: transport,
    message: `Domain ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: domain_name is required',
});

describe('D110 — ECC 우회로가 없다는 것을 정직하게 알린다', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  it('SAP_VERSION=ECC면 이름 있는 거절을 내고 **요청이 0회**다', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const ecc = { ...harness.context, profile: { ...harness.context.profile, sapVersion: 'ECC' } };
    const result = await deleteDomain.handler(ecc, { domain_name: NAME });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('DeleteDomain on SAP_VERSION=ECC');
    expect(textOf(result)).toContain('ZSAPKIT_ADT_DDIC_DOMA');
    expect(textOf(result)).toContain('divergence D110');
    expect(harness.calls()).toHaveLength(0);
  });

  it('ECC가 아니면 평소대로 두 걸음을 보낸다 (과수리 역검증)', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const s4 = { ...harness.context, profile: { ...harness.context.profile, sapVersion: 'S4HANA' } };
    expect((await deleteDomain.handler(s4, { domain_name: NAME })).isError).toBe(false);
    expect(harness.calls()).toHaveLength(2);
  });
});
