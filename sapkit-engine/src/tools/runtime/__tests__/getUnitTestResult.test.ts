/**
 * `GetUnitTestResult` — 발행 계약 · **결과만** 답한다 · `format: "junit"` 거절.
 *
 * 형제 셋과 갈리는 자리:
 *  - `GetUnitTest`   → `run_status` + `run_result`
 *  - `GetUnitTestStatus` → `run_status`만
 *  - **이 도구** → `run_result`만. 그리고 형제 중 **혼자만** `format` 인자를 갖고,
 *    `junit`을 조용히 abapunit으로 바꿔치지 않고 **명시적으로 거절**한다
 *    (`engine/src/handlers/unit_test/high/handleGetUnitTestResult.ts:1-10, 69-75`).
 *
 * `with_navigation_uris`는 받기만 한다 — 구 핸들러도 `run_id`·`format`만
 * 구조분해한다(`:63`). 고전 엔드포인트의 전문이 `withNavigationUri enabled="true"`로
 * 고정이라 되읽기 쪽에서 켤 것이 없다.
 */

import { getUnitTestResult } from '../getUnitTestResult';
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
    expect(await publishedOf(getUnitTestResult)).toEqual(
      publishedDeclaration('GetUnitTestResult'),
    );
  });

  it('노출 선언은 구 핸들러의 자리·available_in을 그대로 옮겼다', () => {
    expect(getUnitTestResult.definition.sets).toEqual(['high']);
    expect(getUnitTestResult.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
  });

  it('kind는 read다', () => {
    expect(getUnitTestResult.definition.kind).toBe('read');
  });

  it('format은 두 값의 열거이고 with_navigation_uris에는 default가 없다', async () => {
    const published = (await publishedOf(getUnitTestResult)).inputSchema as {
      properties: Record<string, Record<string, unknown>>;
    };

    expect(published.properties['format']).toEqual({
      type: 'string',
      enum: ['abapunit', 'junit'],
      description: 'Result format: abapunit or junit.',
    });
    // 구 핸들러 선언의 `default: false`는 구가 발행한 표면에 없다.
    expect(published.properties['with_navigation_uris']).toEqual({
      type: 'boolean',
      description: 'Include navigation URIs in result if supported.',
    });
  });
});

describe('되읽기 — 결과만', () => {
  it('run_status 없이 run_result만 답한다', async () => {
    const run = await startRun(getUnitTestResult);
    try {
      const outcome = await run.read({ run_id: run.runId });
      const body = JSON.parse(outcome.text) as Record<string, unknown>;

      expect(outcome.isError).toBe(false);
      expect(body).toEqual({
        success: true,
        run_id: run.runId,
        run_result: RUN_RESULT_XML,
      });
      expect(body).not.toHaveProperty('run_status');
      expect(outcome.text).toBe(JSON.stringify(body, null, 2));
    } finally {
      await run.close();
    }
  });

  it('format="abapunit"은 생략과 같다', async () => {
    const run = await startRun(getUnitTestResult);
    try {
      const bare = await run.read({ run_id: run.runId });
      const explicit = await run.read({ run_id: run.runId, format: 'abapunit' });

      expect(bare.text).toBe(explicit.text);
      expect(toolRequests(run.requests()).length).toBe(1);
    } finally {
      await run.close();
    }
  });

  it('format="junit"은 조용히 바꿔치지 않고 거절한다', async () => {
    const run = await startRun(getUnitTestResult);
    try {
      const outcome = await run.read({ run_id: run.runId, format: 'junit' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe(
        'Error: format "junit" is not available for the classic ADT ABAP Unit endpoint ' +
          '(no verified live endpoint for it). Omit format, or use "abapunit", to get the raw result.',
      );
    } finally {
      await run.close();
    }
  });

  it('junit 거절은 run_id 검사보다 **뒤**다 — 빈 run_id가 먼저 걸린다', async () => {
    const run = await startRun(getUnitTestResult);
    try {
      const outcome = await run.read({ run_id: '', format: 'junit' });

      expect(outcome.text).toBe('Error: run_id is required');
    } finally {
      await run.close();
    }
  });

  it('junit 거절은 캐시 조회보다 **앞**이다 — 모르는 run_id여도 junit 문구가 나온다', async () => {
    const run = await startRun(getUnitTestResult);
    try {
      const outcome = await run.read({ run_id: 'no-such-run', format: 'junit' });

      expect(outcome.text).toContain('format "junit" is not available');
    } finally {
      await run.close();
    }
  });

  it('모르는 run_id는 구와 같은 문구로 거부한다', async () => {
    const run = await startRun(getUnitTestResult);
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
});

describe('tier 게이트 — 읽기는 모든 등급에서 지나간다', () => {
  it.each(['QA', 'PRD', ''])('%s tier에서도 게이트에 막히지 않는다', async (tier) => {
    const probe = await probeTier(getUnitTestResult, tier, { run_id: 'anything' });

    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });
});
