/**
 * `GetUnitTestStatus` — 발행 계약 · **상태만** 답한다 · `with_long_polling`의 실체.
 *
 * 형제 셋과 갈리는 자리를 못 박는다:
 *  - `GetUnitTest`는 상태 **와** 결과를 함께 답한다.
 *  - 이 도구는 **`run_status`만** 답한다 — `run_result`가 없다.
 *  - `GetUnitTestResult`는 **`run_result`만** 답하고 `format` 인자를 갖는다.
 *
 * 고전 ADT 엔드포인트가 동기라, 캐시에 `run_id`가 있다는 것 자체가 곧 완료다.
 * 그래서 상태는 **언제나 `completed`**이고 `with_long_polling`은 받기만 하고 아무
 * 일도 하지 않는다(`engine/src/handlers/unit_test/high/handleGetUnitTestStatus.ts:49-88`
 * — 구 핸들러도 `run_id`만 구조분해한다).
 */

import { getUnitTestStatus } from '../getUnitTestStatus';
import {
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
    expect(await publishedOf(getUnitTestStatus)).toEqual(
      publishedDeclaration('GetUnitTestStatus'),
    );
  });

  it('노출 선언은 구 핸들러의 자리·available_in을 그대로 옮겼다', () => {
    expect(getUnitTestStatus.definition.sets).toEqual(['high']);
    expect(getUnitTestStatus.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
  });

  it('kind는 read다', () => {
    expect(getUnitTestStatus.definition.kind).toBe('read');
  });

  it('발행 스키마에 with_long_polling의 default가 실리지 않는다 (구 표면 실측)', async () => {
    const published = (await publishedOf(getUnitTestStatus)).inputSchema as {
      properties: Record<string, Record<string, unknown>>;
    };

    // 구 핸들러 선언에는 `default: true`가 있지만 구가 발행한 표면에는 없다 —
    // 채록본이 정본이다.
    expect(published.properties['with_long_polling']).toEqual({
      type: 'boolean',
      description: 'Enable long polling while waiting for status.',
    });
  });
});

describe('되읽기 — 상태만', () => {
  it('run_result 없이 run_status만 답한다', async () => {
    const run = await startRun(getUnitTestStatus);
    try {
      const outcome = await run.read({ run_id: run.runId });
      const body = JSON.parse(outcome.text) as Record<string, unknown>;

      expect(outcome.isError).toBe(false);
      expect(body).toEqual({
        success: true,
        run_id: run.runId,
        run_status: { status: 'completed' },
      });
      expect(body).not.toHaveProperty('run_result');
      expect(outcome.text).toBe(JSON.stringify(body, null, 2));
    } finally {
      await run.close();
    }
  });

  it('with_long_polling을 줘도 답과 요청이 달라지지 않는다', async () => {
    const run = await startRun(getUnitTestStatus);
    try {
      const off = await run.read({ run_id: run.runId, with_long_polling: false });
      const on = await run.read({ run_id: run.runId, with_long_polling: true });

      expect(off.text).toBe(on.text);
      // RunUnitTest의 POST 한 건 말고는 아무것도 나가지 않았다.
      expect(toolRequests(run.requests()).length).toBe(1);
    } finally {
      await run.close();
    }
  });

  it('모르는 run_id는 구와 같은 문구로 거부한다', async () => {
    const run = await startRun(getUnitTestStatus);
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
    const run = await startRun(getUnitTestStatus);
    try {
      const outcome = await run.read({ run_id: '' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe('Error: run_id is required');
    } finally {
      await run.close();
    }
  });
});

describe('tier 게이트 — 읽기는 모든 등급에서 지나간다', () => {
  it.each(['QA', 'PRD', ''])('%s tier에서도 게이트에 막히지 않는다', async (tier) => {
    const probe = await probeTier(getUnitTestStatus, tier, { run_id: 'anything' });

    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });
});
