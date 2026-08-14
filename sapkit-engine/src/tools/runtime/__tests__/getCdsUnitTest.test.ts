/**
 * `GetCdsUnitTest` — 발행 계약 · **캐시 되읽기(요청 0건)** · 갈래 · tier 게이트.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 응답 조립·문구 → `engine/src/handlers/unit_test/high/handleGetCdsUnitTest.ts:49-93`
 *  - "요청을 보내지 않는다"는 판단 → 같은 파일 `:1-13`(벤더 `/abapunit/runs/{id}`가
 *    온프렘에서 404라는 실측)과 `engine/src/lib/abapUnitClassic.ts:1-33`
 *  - tier 판정 → `engine/src/lib/readonlyGuard.ts:42-54, 118` (Get 접두사 = 읽기)
 */

import { getCdsUnitTest } from '../getCdsUnitTest';
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
    expect(await publishedOf(getCdsUnitTest)).toEqual(publishedDeclaration('GetCdsUnitTest'));
  });

  it('노출·정책 선언 — high, read', () => {
    expect(getCdsUnitTest.definition.sets).toEqual(['high']);
    expect(getCdsUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getCdsUnitTest.definition.kind).toBe('read');
  });

  it('run_id의 설명이 비CDS 형제와 **다르다** — 채록본이 갈라져 있다', () => {
    const cds = publishedDeclaration('GetCdsUnitTest').inputSchema as {
      properties: { run_id: { description: string } };
    };
    const plain = publishedDeclaration('GetUnitTest').inputSchema as {
      properties: { run_id: { description: string } };
    };

    expect(cds.properties.run_id.description).toBe('Run identifier returned by unit test run.');
    expect(plain.properties.run_id.description).toBe('Run identifier returned by RunUnitTest.');
  });
});

describe('되읽기 — 상태와 결과를 함께', () => {
  it('RunUnitTest가 담아 둔 결과를 run_id로 되찾는다', async () => {
    const run = await startRun(getCdsUnitTest);
    try {
      const outcome = await run.read({ run_id: run.runId });

      expect(outcome.isError).toBe(false);
      expect(JSON.parse(outcome.text)).toEqual({
        success: true,
        run_id: run.runId,
        run_status: { status: 'completed' },
        run_result: RUN_RESULT_XML,
      });
      expect(outcome.text).toBe(JSON.stringify(JSON.parse(outcome.text), null, 2));
    } finally {
      await run.close();
    }
  });

  it('되읽기는 SAP에 요청을 더 보내지 않는다 — RunUnitTest의 한 발이 전부다', async () => {
    const run = await startRun(getCdsUnitTest);
    try {
      const before = toolRequests(run.requests()).length;
      await run.read({ run_id: run.runId });

      expect(toolRequests(run.requests()).length).toBe(before);
      expect(before).toBe(1);
    } finally {
      await run.close();
    }
  });
});

describe('갈래', () => {
  it('빈 run_id는 캐시를 보기 전에 거절한다', async () => {
    const run = await startRun(getCdsUnitTest);
    try {
      const outcome = await run.read({ run_id: '' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe('Error: run_id is required');
    } finally {
      await run.close();
    }
  });

  it('모르는 run_id는 **CDS 전용 문구**로 거부한다 — 비CDS 형제와 다르다', async () => {
    const run = await startRun(getCdsUnitTest);
    try {
      const outcome = await run.read({ run_id: 'no-such-run' });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toBe(
        'Error: Unknown run_id "no-such-run" — no cached CDS unit test result ' +
          '(invalid run_id, or the server process restarted since the run was started via RunUnitTest).',
      );
      // 비CDS 형제의 문장이 섞여 들어오지 않았는지 못 박는다.
      expect(outcome.text).not.toContain('since RunUnitTest was called');
    } finally {
      await run.close();
    }
  });
});

describe('tier 게이트 — 읽기는 모든 등급에서 지나간다', () => {
  it.each(['QA', 'PRD', ''])('%s tier에서도 게이트에 막히지 않는다', async (tier) => {
    const probe = await probeTier(getCdsUnitTest, tier, { run_id: 'anything' });

    expect(probe.outcome.text).not.toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(1);
  });
});
