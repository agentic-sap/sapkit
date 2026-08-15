/**
 * `UpdateUnitTest` — 발행 계약 · **왕복이 없다는 실측** · 갈래 · tier 게이트.
 *
 * 기대값의 출처(전부 구 엔진·벤더 실측):
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`의 `tools` 키
 *  - 두 오류 문구 → `engine/src/handlers/unit_test/high/handleUpdateUnitTest.ts:49-81`
 *    와 벤더 `.../dist/core/unitTest/AdtUnitTest.js:17, 155-157`
 *  - **요청 0건** → 벤더 `update()`의 본문이 `throw` 한 줄뿐이라는 사실
 *  - tier 판정 → `engine/src/lib/readonlyGuard.ts:95-122`(Update는 읽기가 아니고
 *    단위시험 실행 특례에도 없다 → QA·PRD 모두 거부)
 */

import { UNIT_TEST_UPDATE_UNSUPPORTED, updateUnitTest } from '../updateUnitTest';
import {
  cleanupTempDirs,
  probeTier,
  publishedDeclaration,
  publishedOf,
  runTool,
  toolRequests,
} from './unitTestSupport';

afterEach(() => {
  cleanupTempDirs();
});

/** 어떤 요청이 와도 터뜨린다 — 이 도구는 한 건도 보내면 안 된다. */
const forbidAll = () => ({
  status: 500,
  body: '이 도구는 SAP에 요청을 보내지 않는다',
});

async function call(args: Record<string, unknown>) {
  const { outcome, requests } = await runTool(updateUnitTest, args, forbidAll);
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(updateUnitTest)).toEqual(publishedDeclaration('UpdateUnitTest'));
  });

  it('설명 자체가 "지원하지 않는다"고 말한다 — 채록본 글자 그대로', () => {
    expect(publishedDeclaration('UpdateUnitTest').description).toBe(
      'Update an ABAP Unit test run. Note: ADT does not support updating unit test runs and will return an error.',
    );
  });

  it('노출·정책 선언 — high, mutation, 대상 이름 인자가 **없다**는 빈 배열 선언', () => {
    expect(updateUnitTest.definition.sets).toEqual(['high']);
    expect(updateUnitTest.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(updateUnitTest.definition.kind).toBe('mutation');
    expect(updateUnitTest.definition.targetNames).toEqual([]);
  });

  it('run_id의 설명은 CreateUnitTest/RunUnitTest 둘을 가리킨다 — 형제들과 다르다', () => {
    const mine = publishedDeclaration('UpdateUnitTest').inputSchema as {
      properties: { run_id: { description: string } };
      required: string[];
    };

    expect(mine.properties.run_id.description).toBe(
      'Run identifier returned by CreateUnitTest/RunUnitTest.',
    );
    expect(mine.required).toEqual(['run_id']);
  });
});

describe('와이어 — 한 건도 나가지 않는다', () => {
  it('정상 run_id를 줘도 요청이 0건이고 벤더의 문구로 거절한다', async () => {
    const { outcome, sent } = await call({ run_id: 'RUN-1' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'Error: Update operation is not supported for Unit Test objects in ADT',
    );
    expect(outcome.text).toBe(`Error: ${UNIT_TEST_UPDATE_UNSUPPORTED}`);
    expect(sent).toHaveLength(0);
  });

  it('run_id가 무엇이든 같은 문구다 — 실행을 조회하지도 않는다', async () => {
    const uuidish = await call({ run_id: '9f1c2f0e-0000-4000-8000-000000000000' });
    const junk = await call({ run_id: 'no-such-run' });

    expect(uuidish.outcome.text).toBe(junk.outcome.text);
    expect(uuidish.sent).toHaveLength(0);
    expect(junk.sent).toHaveLength(0);
  });
});

describe('갈래', () => {
  it('빈 run_id는 접속을 열기 전에 거절한다', async () => {
    const { outcome, sent } = await call({ run_id: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: run_id is required');
    expect(sent).toHaveLength(0);
  });

  it('성공 갈래가 없다 — 어떤 입력으로도 success:true가 나오지 않는다', async () => {
    for (const runId of ['RUN-1', 'RUN-2', '   ']) {
      const { outcome } = await call({ run_id: runId });
      expect(outcome.isError).toBe(true);
      expect(outcome.text).not.toContain('updated successfully');
    }
  });
});

describe('tier 게이트 — 단위시험 QA 특례에 **들지 않는다**', () => {
  it('DEV에서는 접속까지 간다', async () => {
    const probe = await probeTier(updateUnitTest, 'DEV', { run_id: 'RUN-1' });

    expect(probe.connections).toBe(1);
  });

  it.each(['QA', 'PRD', ''])('%s tier에서는 접속을 열기 전에 막힌다', async (tier) => {
    const probe = await probeTier(updateUnitTest, tier, { run_id: 'RUN-1' });

    expect(probe.outcome.text).toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(0);
  });
});
