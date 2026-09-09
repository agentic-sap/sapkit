/**
 * `DeleteLocalTestClass` — 발행 계약 · 잠금 → 빈 소스 PUT → 해제 · 활성화(D111) ·
 * tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteLocalTestClass`
 *  - 겉 핸들러: `engine/src/handlers/class/high/handleDeleteLocalTestClass.ts:16-132`
 *  - 사슬: `.../dist/core/class/AdtLocalTestClass.js` delete →
 *    `testclasses.js`의 `clearClassTestInclude` (본문 = 공백 한 칸)
 */

import { deleteLocalTestClass } from '../deleteLocalTestClass';
import { adtException, lockBody, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';
import { describeLocalIncludeClear } from './localIncludeClearSupport';

describeLocalIncludeClear({
  tool: deleteLocalTestClass,
  name: 'DeleteLocalTestClass',
  className: 'ZCL_SAPKIT_DEMO',
  includeType: 'testclasses',
  messageSubject: 'Local test class',
  failureSubject: 'local test class',
  notFoundSubject: 'Local test class',
});

/**
 * 장부 D146 — CCAU 인클루드가 없는 클래스는 비우기도 같은 500으로 죽는다
 * (실측 2026-08-25 · ZUNIVAT-MODI 패키지맵 §5-U: 「둘 다 HTTP 500」). 판정은
 * `classIncludeWrite.ts`의 것을 `UpdateLocalTestClass`와 공유한다.
 */
describe('DeleteLocalTestClass — 장부 D146: CCAU 인클루드가 없는 클래스', () => {
  const CLASS_URI = '/sap/bc/adt/oo/classes/zcl_sapkit_demo';
  const CCAU_MESSAGE = 'ZCL_SAPKIT_DEMO===============CCAU에는 어떠한 비활성 버전도 없습니다';

  let harness: WriteHarness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  it('「인클루드가 없다」로 바꿔 말하고 원문을 뒤에 싣는다', async () => {
    harness = await startWriteHarness((request, response) => {
      const action = request.query.get('_action');
      if (action === 'LOCK') return xml(response, lockBody('LOCK-LOCAL'));
      if (action === 'UNLOCK') return xml(response, '');
      if (request.path === `${CLASS_URI}/includes/testclasses` && request.method === 'PUT') {
        return xml(response, adtException('ExceptionResourceNoInactiveVersion', CCAU_MESSAGE), 500);
      }
      return xml(response, '<unexpected/>', 500);
    });
    const result = await deleteLocalTestClass.handler(harness.context, { class_name: 'ZCL_SAPKIT_DEMO' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('has no test-class include');
    expect(textOf(result)).toContain('[Test Classes]');
    expect(textOf(result)).toContain(CCAU_MESSAGE);
    expect(harness.client.activeLocks()).toHaveLength(0);
  });
});
