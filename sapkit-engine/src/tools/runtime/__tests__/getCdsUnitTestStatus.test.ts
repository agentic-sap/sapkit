/**
 * `GetCdsUnitTestStatus` — 발행 계약 · **상태만** 답한다 · 캐시 되읽기(요청 0건) ·
 * 갈래 · tier 게이트.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 응답 조립·문구 →
 *    `engine/src/handlers/unit_test/high/handleGetCdsUnitTestStatus.ts:50-87`
 *  - `status: 'completed'` 상수의 근거 → 같은 파일 `:1-9`(고전 엔드포인트가 동기라
 *    캐시에는 끝난 실행만 들어간다)와 `engine/src/lib/abapUnitClassic.ts:1-33`
 */

import { getCdsUnitTest } from '../getCdsUnitTest';
import { getCdsUnitTestStatus } from '../getCdsUnitTestStatus';
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
    expect(await publishedOf(getCdsUnitTestStatus)).toEqual(
      publishedDeclaration('GetCdsUnitTestStatus'),
    );
  });

  it('노출·정책 선언 — high, read', () => {
    expect(getCdsUnitTestStatus.definition.sets).toEqual(['high']);
    expect(getCdsUnitTestStatus.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getCdsUnitTestStatus.definition.kind).toBe('read');
  });

  it('with_long_polling에는 default가 없다 — 구 소스에는 true가 적혀 있었다', async () => {
    const published = (await publishedOf(getCdsUnitTestStatus)).inputSchema as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
    };

    expect(published.properties['with_long_polling']).toEqual({
      type: 'boolean',
      description: 'Enable long polling while waiting for status.',
    });
    expect(published.required).toEqual(['run_id']);
  });
});

describe('되읽기 — 상태만', () => {
  it('run_result 없이 run_status만 답한다', async () => {
    const run = await startRun(getCdsUnitTestStatus);
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

  it('with_long_polling은 받기만 하고 결과도 요청 수도 바꾸지 않는다', async () => {
    const run = await startRun(getCdsUnitTestStatus);
    try {
      const off = await run.read({ run_id: run.runId, with_long_polling: false });
      const on = await run.read({ run_id: run.runId, with_long_polling: true });

      expect(off.text).toBe(on.text);
      // RunUnitTest의 한 발이 전부다 — 폴링할 서버측 실행이 없다.
      expect(toolRequests(run.requests()).length).toBe(1);
    } finally {
      await run.close();
    }
  });

  it('형제 GetCdsUnitTest와 같은 캐시를 본다 — 같은 run_id가 양쪽에서 읽힌다', async () => {
    const run = await startRun([getCdsUnitTestStatus, getCdsUnitTest]);
    try {
      const status = await run.read({ run_id: run.runId });
      const both = await run.readWith(getCdsUnitTest, { run_id: run.runId });

      expect(status.isError).toBe(false);
      expect(both.isError).toBe(false);
      expect((JSON.parse(both.text) as { run_status: unknown }).run_status).toEqual(
        (JSON.parse(status.text) as { run_status: unknown }).run_status,
      );
    } finally {
      await run.close();
    }
  });
});

describe('갈래', () => {
  it('빈 run_id는 캐시를 보기 전에 거절한다', async () => {
    const run = await startRun(getCdsUnitTestStatus);
    try {
      const outcome = await run.read({ run_id: '' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe('Error: run_id is required');
    } finally {
      await run.close();
    }
  });

  it('모르는 run_id는 **CDS 전용 문구**로 거부한다', async () => {
    const run = await startRun(getCdsUnitTestStatus);
    try {
      const outcome = await run.read({ run_id: 'no-such-run' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe(
        'Error: Unknown run_id "no-such-run" — no cached CDS unit test result ' +
          '(invalid run_id, or the server process restarted since the run was started via RunUnitTest).',
      );
      expect(outcome.text).not.toContain('since RunUnitTest was called');
    } finally {
      await run.close();
    }
  });
});

describe('tier 게이트 — 읽기는 모든 등급에서 지나간다', () => {
  it.each(['QA', 'PRD', ''])('%s tier에서도 게이트에 막히지 않는다', async (tier) => {
    const probe = await probeTier(getCdsUnitTestStatus, tier, { run_id: 'anything' });

    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });
});
