/**
 * `DeleteUnitTest` — 발행 계약 · **요청 0회** · 구 문구 보존 · tier 게이트 음성시험.
 *
 * 기대값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteUnitTest`
 *  - 겉 핸들러: `engine/src/handlers/unit_test/high/handleDeleteUnitTest.ts:17-88`
 *  - 벤더: `.../dist/core/unitTest/AdtUnitTest.js`의 `delete()` — 본문이 한 줄이고
 *    곧바로 던진다. **어떤 주소도 치지 않는다.**
 *
 * 이 도구는 `targetNames`가 **빈 배열**이다 — `run_id`는 오브젝트 이름이 아니라
 * 실행 식별자다. 빈 배열이 선언으로 인정된다는 것을 함께 못 박는다.
 */

import { missingTargetNameDeclarations } from '../../../server/toolDefinition';
import { TARGET_NAME_EXTRACTORS } from '../../../../harness/targetGuard';
import { UNIT_TEST_DELETE_UNSUPPORTED, deleteUnitTest } from '../deleteUnitTest';
import { describeTierGate, exposureMemberships, startDeletionHarness } from './deletionSupport';
import { type WriteHarness, textOf } from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';

const RUN_ID = 'ZRUN-0001';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    expect(await publishedSurfaceOf(deleteUnitTest)).toEqual(publishedDeclaration('DeleteUnitTest'));
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteUnitTest.definition.sets).toEqual(['high']);
    expect(deleteUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(deleteUnitTest.definition.kind).toBe('mutation');
  });

  it('채록본의 노출 조건 소속과 어긋나지 않는다', () => {
    expect(exposureMemberships('DeleteUnitTest')).toEqual([
      'connected_default',
      'noProfile_default',
    ]);
  });
});

describe('대상-이름 선언은 **빈 배열**이다', () => {
  it('run_id는 오브젝트 이름이 아니므로 빈 배열을 명시했다', () => {
    expect(deleteUnitTest.definition.targetNames).toEqual([]);
  });

  it('빈 배열도 선언이므로 게이트를 통과한다 (undefined면 거부된다)', () => {
    expect(missingTargetNameDeclarations([deleteUnitTest])).toEqual([]);
  });

  it('빈 선언은 사전 검사기를 만들지 않는다 — 막을 대상 이름이 없다', () => {
    expect(Object.keys(TARGET_NAME_EXTRACTORS)).not.toContain('DeleteUnitTest');
  });
});

describe('ADT가 지원하지 않는다 — **요청 0회**', () => {
  it('구 문구를 글자 그대로 올리고 SAP에 아무것도 보내지 않는다', async () => {
    harness = await startDeletionHarness();
    const result = await deleteUnitTest.handler(harness.context, { run_id: RUN_ID });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Error: ${UNIT_TEST_DELETE_UNSUPPORTED}`);
    expect(textOf(result)).toBe(
      'Error: Delete operation is not supported for Unit Test objects in ADT',
    );
    expect(harness.calls()).toHaveLength(0);
  });

  it('run_id가 없으면 그 앞에서 걸린다', async () => {
    harness = await startDeletionHarness();
    const result = await deleteUnitTest.handler(harness.context, {});
    expect(textOf(result)).toBe('Error: run_id is required');
    expect(harness.calls()).toHaveLength(0);
  });
});

describeTierGate(deleteUnitTest, { run_id: RUN_ID });
