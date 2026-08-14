/**
 * `DeleteCdsUnitTest` — 발행 계약 · 와이어(클래스 삭제 그대로) · **다른 12종과
 * 갈리는 두 자리**(응답에 이송번호 칸이 없다 · 오류를 상태 코드로 가르지 않는다) ·
 * tier 게이트 음성시험.
 *
 * 기대값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteCdsUnitTest`
 *  - 겉 핸들러: `engine/src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts:17-113`
 *  - 사슬: `.../dist/core/unitTest/AdtCdsUnitTest.js` delete → `adtClass.delete()`
 *  - 전문·주소·라벨: `.../dist/core/class/delete.js:19-88` (라벨 `"Class"`)
 *
 * 공용 `describeStandardDeletion`을 쓰지 않는다 — 그 장치는 상태 코드별 문구를
 * 단언하는데 이 도구에는 그 갈래가 **없기 때문**이다. 없는 것을 있는 것처럼
 * 검사하면 시험이 구가 아니라 내 구현을 베끼게 된다.
 */

import { deleteCdsUnitTest } from '../deleteCdsUnitTest';
import {
  CHECK_PATH,
  DELETE_PATH,
  describeTierGate,
  expectedCheckBody,
  expectedDeleteBody,
  exposureMemberships,
  notDeletedBody,
  startDeletionHarness,
} from './deletionSupport';
import { type WriteHarness, adtException, jsonOf, textOf } from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';

const NAME = 'ZCL_SAPKIT_CDS_TEST';
const URI = `/sap/bc/adt/oo/classes/${NAME}`;

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

const run = (args: Record<string, unknown>) =>
  Promise.resolve(deleteCdsUnitTest.handler(harness.context, args));

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    expect(await publishedSurfaceOf(deleteCdsUnitTest)).toEqual(
      publishedDeclaration('DeleteCdsUnitTest'),
    );
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteCdsUnitTest.definition.sets).toEqual(['high']);
    expect(deleteCdsUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(deleteCdsUnitTest.definition.kind).toBe('mutation');
    expect(deleteCdsUnitTest.definition.targetNames).toEqual(['class_name']);
  });

  it('채록본의 노출 조건 소속과 어긋나지 않는다', () => {
    expect(exposureMemberships('DeleteCdsUnitTest')).toEqual([
      'connected_default',
      'noProfile_default',
    ]);
  });
});

describe('와이어 — 클래스 삭제가 그대로 돈다', () => {
  it('검사 → 삭제 두 걸음이고 주소는 클래스 컬렉션이다', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const result = await run({ class_name: NAME.toLowerCase() });
    expect(result.isError).toBe(false);

    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${CHECK_PATH}`,
      `POST ${DELETE_PATH}`,
    ]);
    expect(harness.nth(0).body).toBe(expectedCheckBody(URI, 'standard'));
    expect(harness.nth(1).body).toBe(
      expectedDeleteBody(URI, '<del:transportNumber/>', 'standard'),
    );
  });

  it('이송번호는 전문에 실린다 — 응답에는 안 실린다', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const payload = jsonOf(await run({ class_name: NAME, transport_request: 'E19K905635' }));

    expect(harness.nth(1).body).toContain('<del:transportNumber>E19K905635</del:transportNumber>');
    // **다른 12종과 갈리는 자리 ①** — `transport_request` 칸이 없다.
    expect(payload).toEqual({
      success: true,
      class_name: NAME,
      message: `CDS unit test class ${NAME} deleted successfully.`,
    });
    expect(payload).not.toHaveProperty('transport_request');
  });

  it('삭제 걸음만 stateful이다', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    await run({ class_name: NAME });
    expect(harness.nth(0).headers['x-sap-adt-sessiontype']).toBeUndefined();
    expect(harness.nth(1).headers['x-sap-adt-sessiontype']).toBe('stateful');
  });
});

describe('갈래 — **상태 코드로 가르지 않는다** (다른 12종과 갈리는 자리 ②)', () => {
  it('class_name이 없으면 요청을 하나도 보내지 않는다', async () => {
    harness = await startDeletionHarness({ objectUri: URI });
    const result = await run({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: class_name is required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('404에도 "이미 지워졌을 수 있다" 같은 문구가 없다 — 구에 그 갈래가 없다', async () => {
    harness = await startDeletionHarness({ checkStatus: 404, checkBody: '<not-found/>' });
    const text = textOf(await run({ class_name: NAME }));
    expect(text).not.toContain('not found. It may already be deleted');
    expect(text).toContain('404');
  });

  it('400에도 "Bad request. Check if transport request…"가 없다', async () => {
    harness = await startDeletionHarness({
      deleteStatus: 400,
      deleteBody: adtException('ExceptionResourceNoAccess', 'Transport request required'),
    });
    const text = textOf(await run({ class_name: NAME }));
    expect(text).not.toContain('Bad request. Check if transport request');
    // SAP이 돌려준 문구는 보존된다.
    expect(text).toContain('Transport request required');
  });

  it('HTTP 200에 실려 온 삭제 실패는 벤더 라벨(`Class`)로 올라온다', async () => {
    harness = await startDeletionHarness({ deleteBody: notDeletedBody(URI, 'Still referenced') });
    const result = await run({ class_name: NAME });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: Class deletion failed: Still referenced');
  });
});

describeTierGate(deleteCdsUnitTest, { class_name: NAME });
