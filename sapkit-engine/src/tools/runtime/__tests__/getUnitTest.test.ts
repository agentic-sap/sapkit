/**
 * `GetUnitTest` — 발행 계약 · 캐시 되읽기 · 네 도구 사이에서의 자리.
 *
 * **이 도구는 SAP에 요청을 보내지 않는다.** 고전 ADT 엔드포인트가 동기라서
 * `RunUnitTest`가 결과를 그 자리에서 받아 캐시하고, 이 도구는 그것을 `run_id`로
 * 되찾을 뿐이다(`engine/src/lib/abapUnitClassic.ts:1-33` 머리주석 · `:161-224`).
 * 「요청 0건」을 못 박는 시험이 그 사실의 증거다.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 응답 필드·오류 문구 → `engine/src/handlers/unit_test/high/handleGetUnitTest.ts:44-85`
 *  - tier 판정 → `engine/src/lib/readonlyGuard.ts:42-54, 106-118`(`Get` 접두사 = 읽기)
 */

import { getUnitTest } from '../getUnitTest';
import { getUnitTestResult } from '../getUnitTestResult';
import { getUnitTestStatus } from '../getUnitTestStatus';
import { runUnitTest } from '../runUnitTest';
import {
  RUN_RESULT_XML,
  cleanupTempDirs,
  probeTier,
  publishedDeclaration,
  publishedOf,
  startRun,
  toolRequests,
} from './unitTestSupport';

afterEach(() => {
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(getUnitTest)).toEqual(publishedDeclaration('GetUnitTest'));
  });

  it('노출 선언은 구 핸들러의 자리·available_in을 그대로 옮겼다', () => {
    expect(getUnitTest.definition.sets).toEqual(['high']);
    expect(getUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
  });

  it('kind는 read다 — 되읽기일 뿐 SAP을 돌리지 않는다', () => {
    expect(getUnitTest.definition.kind).toBe('read');
  });
});

describe('되읽기', () => {
  it('상태와 결과를 **함께** 답한다 (Status·Result를 합친 판)', async () => {
    const run = await startRun(getUnitTest);
    try {
      const outcome = await run.read({ run_id: run.runId });
      const body = JSON.parse(outcome.text) as Record<string, unknown>;

      expect(outcome.isError).toBe(false);
      expect(body).toEqual({
        success: true,
        run_id: run.runId,
        run_status: { status: 'completed' },
        run_result: RUN_RESULT_XML,
      });
      expect(outcome.text).toBe(JSON.stringify(body, null, 2));
    } finally {
      await run.close();
    }
  });

  it('SAP에 요청을 보내지 않는다 — RunUnitTest의 POST 한 건이 전부다', async () => {
    const run = await startRun(getUnitTest);
    try {
      const before = toolRequests(run.requests()).length;
      await run.read({ run_id: run.runId });

      expect(before).toBe(1);
      expect(toolRequests(run.requests()).length).toBe(1);
    } finally {
      await run.close();
    }
  });

  it('모르는 run_id는 구와 같은 문구로 거부한다', async () => {
    const run = await startRun(getUnitTest);
    try {
      const outcome = await run.read({ run_id: 'no-such-run' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe(
        'Error: Unknown run_id "no-such-run" — no cached result ' +
          '(invalid run_id, or the server process restarted since RunUnitTest was called).',
      );
    } finally {
      await run.close();
    }
  });

  it('빈 run_id는 조회 전에 거부한다', async () => {
    const run = await startRun(getUnitTest);
    try {
      const outcome = await run.read({ run_id: '' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe('Error: run_id is required');
    } finally {
      await run.close();
    }
  });
});

/**
 * 네 도구는 이름이 한 계열이라 대충 같게 지으면 차이가 조용히 사라진다. 한 번의
 * 실행을 셋이 나란히 되읽어 **무엇이 갈리는지**를 한 자리에서 못 박는다.
 */
describe('형제 셋의 차이 — 같은 run_id를 나란히 되읽는다', () => {
  it('필드 구성이 셋 다 다르다 (상태+결과 / 상태만 / 결과만)', async () => {
    const run = await startRun([getUnitTest, getUnitTestStatus, getUnitTestResult]);
    try {
      const both = JSON.parse((await run.readWith(getUnitTest, { run_id: run.runId })).text);
      const status = JSON.parse(
        (await run.readWith(getUnitTestStatus, { run_id: run.runId })).text,
      );
      const result = JSON.parse(
        (await run.readWith(getUnitTestResult, { run_id: run.runId })).text,
      );

      expect(Object.keys(both)).toEqual(['success', 'run_id', 'run_status', 'run_result']);
      expect(Object.keys(status)).toEqual(['success', 'run_id', 'run_status']);
      expect(Object.keys(result)).toEqual(['success', 'run_id', 'run_result']);
      // 겹치는 자리의 값은 같다 — 셋이 같은 캐시를 본다는 증거.
      expect(status['run_status']).toEqual(both['run_status']);
      expect(result['run_result']).toBe(both['run_result']);
    } finally {
      await run.close();
    }
  });

  it('format 인자를 가진 것은 GetUnitTestResult 하나뿐이다', () => {
    expect(Object.keys(getUnitTest.definition.inputSchema)).toEqual(['run_id']);
    expect(Object.keys(getUnitTestStatus.definition.inputSchema)).toEqual([
      'run_id',
      'with_long_polling',
    ]);
    expect(Object.keys(getUnitTestResult.definition.inputSchema)).toEqual([
      'run_id',
      'with_navigation_uris',
      'format',
    ]);
  });

  it('셋 다 read이고 실행은 RunUnitTest 하나뿐이다', () => {
    expect([
      getUnitTest.definition.kind,
      getUnitTestStatus.definition.kind,
      getUnitTestResult.definition.kind,
    ]).toEqual(['read', 'read', 'read']);
    expect(runUnitTest.definition.kind).toBe('execution');
  });
});

describe('tier 게이트 — 읽기는 모든 등급에서 지나간다', () => {
  it.each(['QA', 'PRD', ''])('%s tier에서도 게이트에 막히지 않는다', async (tier) => {
    const probe = await probeTier(getUnitTest, tier, { run_id: 'anything' });

    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
    // 게이트를 지났다는 증거 — 지나지 못했다면 접속 공장이 불리지 않는다.
    expect(probe.connections).toBe(1);
  });
});
