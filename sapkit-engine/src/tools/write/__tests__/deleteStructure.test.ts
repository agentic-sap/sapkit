/**
 * `DeleteStructure` — 발행 계약 · 와이어 · 거짓 성공 판정(여러 `del:object`) ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteStructure`
 *  - 겉 핸들러: `engine/src/handlers/structure/high/handleDeleteStructure.ts:13-120`
 *    — **ECC 갈래가 없다**(테이블·도메인·데이터엘리먼트에만 있다)
 *  - 사슬·세션: `.../dist/core/structure/AdtStructure.js` delete (세션 무접촉)
 *  - 전문·주소: `.../dist/core/structure/delete.js:19-85` (라벨 `"Structure"`)
 */

import { deleteStructure } from '../deleteStructure';
import { describeStandardDeletion, startDeletionHarness } from './deletionSupport';
import { type WriteHarness, jsonOf, textOf } from './harness';

const NAME = 'ZSAPKIT_S001';
const URI = `/sap/bc/adt/ddic/structures/${NAME}`;

describeStandardDeletion({
  tool: deleteStructure,
  name: 'DeleteStructure',
  args: { structure_name: NAME },
  lowerArgs: { structure_name: NAME.toLowerCase() },
  objectUri: URI,
  availableIn: ['onprem', 'cloud'],
  targetNames: ['structure_name'],
  layout: 'standard',
  stateful: false,
  vendorLabel: 'Structure',
  statusLabel: 'Structure',
  subject: 'structure',
  successPayload: (transport) => ({
    success: true,
    structure_name: NAME,
    transport_request: transport,
    message: `Structure ${NAME} deleted successfully.`,
  }),
  missingArgMessage: 'Error: structure_name is required',
});

// ── 구조체 고유: 삭제 하나가 여러 마디로 갈라진다 ───────────────────────────

describe('구조체 삭제는 응답이 여러 마디로 갈라진다 (TABL/DS + TABT/DTT)', () => {
  let harness: WriteHarness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  /** 벤더 주석이 구조체를 예로 드는 그 모양(`dist/utils/internalUtils.js`). */
  const twoNodes = (first: string, second: string): string =>
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object adtcore:uri="${URI}" del:isDeleted="${first}"/>` +
    `<del:object adtcore:uri="${URI}/dtt" del:isDeleted="${second}"><del:message><del:text>Table type still used</del:text></del:message></del:object>` +
    '</del:deletionResult>';

  it('둘 다 true여야 성공이다', async () => {
    harness = await startDeletionHarness({ deleteBody: twoNodes('true', 'true') });
    const result = await deleteStructure.handler(harness.context, { structure_name: NAME });
    expect(result.isError).toBe(false);
    expect(jsonOf(result).success).toBe(true);
  });

  it('**두 번째만 false여도 실패다** — 첫 마디만 보면 거짓 성공이 된다', async () => {
    harness = await startDeletionHarness({ deleteBody: twoNodes('true', 'false') });
    const result = await deleteStructure.handler(harness.context, { structure_name: NAME });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Failed to delete structure: Structure deletion failed: Table type still used',
    );
  });
});
