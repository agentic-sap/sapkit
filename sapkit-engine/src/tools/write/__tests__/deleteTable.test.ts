/**
 * `DeleteTable` — 발행 계약 · 삭제 서비스 두 걸음의 와이어 · 거짓 성공 판정 ·
 * ECC 갈래(장부 D110) · tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteTable`
 *  - 겉 핸들러: `engine/src/handlers/table/high/handleDeleteTable.ts:17-185`
 *  - 사슬·세션: `@babamba2/mcp-abap-adt-clients/dist/core/table/AdtTable.js` delete
 *    — **세션을 건드리지 않는다**(클래스 계열과 갈리는 자리)
 *  - 전문·주소: `.../dist/core/table/delete.js:19-84` (라벨 `"Table"`)
 */

import { deleteTable } from '../deleteTable';
import { describeStandardDeletion, startDeletionHarness } from './deletionSupport';
import { type WriteHarness, textOf } from './harness';

const NAME = 'ZSAPKIT_T001';
const URI = `/sap/bc/adt/ddic/tables/${NAME}`;

describeStandardDeletion({
  tool: deleteTable,
  name: 'DeleteTable',
  args: { table_name: NAME },
  lowerArgs: { table_name: NAME.toLowerCase() },
  objectUri: URI,
  availableIn: ['onprem', 'cloud'],
  targetNames: ['table_name'],
  layout: 'standard',
  stateful: false,
  vendorLabel: 'Table',
  statusLabel: 'Table',
  subject: 'table',
  successPayload: (transport) => ({
    success: true,
    table_name: NAME,
    transport_request: transport,
    message: `Table ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: table_name is required',
});

// ── D110 — ECC ──────────────────────────────────────────────────────────────

describe('D110 — ECC 우회로가 없다는 것을 정직하게 알린다', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  it('SAP_VERSION=ECC면 이름 있는 거절을 내고 **요청이 0회**다', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const ecc = {
      ...harness.context,
      profile: { ...harness.context.profile, sapVersion: 'ECC' },
    };
    const result = await deleteTable.handler(ecc, { table_name: NAME });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('DeleteTable on SAP_VERSION=ECC');
    expect(textOf(result)).toContain('ZMCP_ADT_DDIC_TABL');
    expect(textOf(result)).toContain('divergence D110');
    // ECC 커널에 없는 엔드포인트에 삭제를 시도하지 않는다.
    expect(harness.calls()).toHaveLength(0);
  });

  it('ECC가 아니면 평소대로 두 걸음을 보낸다 (과수리 역검증)', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const s4 = {
      ...harness.context,
      profile: { ...harness.context.profile, sapVersion: 'S4HANA' },
    };
    const result = await deleteTable.handler(s4, { table_name: NAME });
    expect(result.isError).toBe(false);
    expect(harness.calls()).toHaveLength(2);
  });
});
