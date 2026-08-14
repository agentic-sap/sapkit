/**
 * `GetCdsUnitTestResult` — 발행 계약 · **결과만** 답한다 · `junit` 거절의 **순서** ·
 * 캐시 되읽기(요청 0건) · tier 게이트.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 검사 순서·응답 조립·문구 →
 *    `engine/src/handlers/unit_test/high/handleGetCdsUnitTestResult.ts:1-9, 56-101`
 *  - 모르는 run_id 문구가 비CDS 형제와 갈린다는 실측 → 같은 파일 `:79-85`와
 *    `engine/src/lib/abapUnitClassic.ts`의 비CDS 문장 대조
 */

import { CDS_JUNIT_REFUSAL, getCdsUnitTestResult } from '../getCdsUnitTestResult';
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
    expect(await publishedOf(getCdsUnitTestResult)).toEqual(
      publishedDeclaration('GetCdsUnitTestResult'),
    );
  });

  it('노출·정책 선언 — high, read', () => {
    expect(getCdsUnitTestResult.definition.sets).toEqual(['high']);
    expect(getCdsUnitTestResult.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getCdsUnitTestResult.definition.kind).toBe('read');
  });

  it('format은 두 값의 열거이고 with_navigation_uris에는 default가 없다', async () => {
    const published = (await publishedOf(getCdsUnitTestResult)).inputSchema as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
    };

    expect(published.properties['format']).toEqual({
      type: 'string',
      enum: ['abapunit', 'junit'],
      description: 'Result format: abapunit or junit.',
    });
    // 구 소스 선언의 `default: false`는 구가 발행한 표면에 없다.
    expect(published.properties['with_navigation_uris']).toEqual({
      type: 'boolean',
      description: 'Include navigation URIs in result if supported.',
    });
    expect(published.required).toEqual(['run_id']);
  });
});

describe('되읽기 — 결과만', () => {
  it('run_status 없이 run_result만 답한다', async () => {
    const run = await startRun(getCdsUnitTestResult);
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

  it('format="abapunit"은 생략과 같고 SAP 요청도 늘지 않는다', async () => {
    const run = await startRun(getCdsUnitTestResult);
    try {
      const bare = await run.read({ run_id: run.runId });
      const explicit = await run.read({ run_id: run.runId, format: 'abapunit' });

      expect(bare.text).toBe(explicit.text);
      // RunUnitTest의 한 발이 전부다 — 되읽기는 캐시만 본다.
      expect(toolRequests(run.requests()).length).toBe(1);
    } finally {
      await run.close();
    }
  });

  it('with_navigation_uris는 받기만 하고 결과를 바꾸지 않는다', async () => {
    const run = await startRun(getCdsUnitTestResult);
    try {
      const off = await run.read({ run_id: run.runId, with_navigation_uris: false });
      const on = await run.read({ run_id: run.runId, with_navigation_uris: true });

      expect(off.text).toBe(on.text);
    } finally {
      await run.close();
    }
  });
});

describe('junit 거절과 검사 순서', () => {
  it('format="junit"은 조용히 바꿔치지 않고 거절한다', async () => {
    const run = await startRun(getCdsUnitTestResult);
    try {
      const outcome = await run.read({ run_id: run.runId, format: 'junit' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe(
        'Error: format "junit" is not available for the classic ADT ABAP Unit endpoint ' +
          '(no verified live endpoint for it). Omit format, or use "abapunit", to get the raw result.',
      );
      expect(outcome.text).toBe(`Error: ${CDS_JUNIT_REFUSAL}`);
    } finally {
      await run.close();
    }
  });

  it('junit 거절 문구는 비CDS 형제와 **글자까지 같다**', () => {
    // 두 계열이 갈리는 것은 「모르는 run_id」 문구뿐이라는 실측을 못 박는다.
    expect(CDS_JUNIT_REFUSAL).toBe(
      'format "junit" is not available for the classic ADT ABAP Unit endpoint ' +
        '(no verified live endpoint for it). Omit format, or use "abapunit", to get the raw result.',
    );
  });

  it('junit 거절은 run_id 검사보다 **뒤**다 — 빈 run_id가 먼저 걸린다', async () => {
    const run = await startRun(getCdsUnitTestResult);
    try {
      const outcome = await run.read({ run_id: '', format: 'junit' });

      expect(outcome.text).toBe('Error: run_id is required');
    } finally {
      await run.close();
    }
  });

  it('junit 거절은 캐시 조회보다 **앞**이다 — 모르는 run_id여도 junit 문구가 나온다', async () => {
    const run = await startRun(getCdsUnitTestResult);
    try {
      const outcome = await run.read({ run_id: 'no-such-run', format: 'junit' });

      expect(outcome.text).toContain('format "junit" is not available');
      expect(outcome.text).not.toContain('no cached CDS unit test result');
    } finally {
      await run.close();
    }
  });
});

describe('갈래', () => {
  it('모르는 run_id는 **CDS 전용 문구**로 거부한다', async () => {
    const run = await startRun(getCdsUnitTestResult);
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
    const probe = await probeTier(getCdsUnitTestResult, tier, { run_id: 'anything' });

    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });
});
