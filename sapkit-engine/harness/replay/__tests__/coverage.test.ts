/**
 * 커버리지 표 — **무엇이 어느 급 증거로 통과했는가, 무엇이 아직 증거가 없는가.**
 *
 * 후자가 조용히 사라지면 표가 존재할 이유가 없다. 그래서 여기서 못박는 것은
 * 통과 집계가 아니라 **빠진 것이 눈에 띄는가**다.
 */
import { buildCoverage, loadM1ToolNames, renderCoverageMarkdown } from '../coverage';
import { M1_DIVERGENCES } from '../divergences';
import { replaySequence } from '../replay';
import { envelope, recorded, step, target } from './helpers';

const ADT_403 = 'HTTP 403 Forbidden — [ExceptionResourceNoAccess] (lock-conflict): locked by DEVELOPER1';

async function passingReplay(tool: string) {
  const fixture = recorded([step({ index: 0, tool })]);
  return replaySequence(fixture, target([{ payload: envelope('CLASS zcl_demo DEFINITION.') }]));
}

async function failingReplay(tool: string) {
  const fixture = recorded([step({ index: 0, tool, response: envelope('구') })]);
  return replaySequence(fixture, target([{ payload: envelope('신') }]));
}

async function proseNormalizedReplay(tool: string) {
  const fixture = recorded([step({ index: 0, tool, isError: true, response: envelope(ADT_403, true) })]);
  return replaySequence(fixture, target([{ payload: envelope(`${ADT_403} (재시도 없음)`, true), isError: true }]));
}

describe('증거 급 집계', () => {
  it('재생 대조로 통과한 도구가 replay 급에 남는다', async () => {
    const report = buildCoverage({ tools: ['GetClass', 'GetInclude'], replays: [await passingReplay('GetClass')] });
    const row = report.tools.find((r) => r.tool === 'GetClass');

    expect(row?.replay.status).toBe('pass');
    expect(row?.hasEvidence).toBe(true);
  });

  it('재생 대조가 실패한 도구는 pass로 세지 않는다', async () => {
    const report = buildCoverage({ tools: ['GetClass'], replays: [await failingReplay('GetClass')] });

    expect(report.tools[0]?.replay.status).toBe('fail');
  });

  it('계약 시험·attended 실기도 각자의 급으로 들어간다', () => {
    const report = buildCoverage({
      tools: ['GetTable'],
      contractTests: [{ tool: 'GetTable', passed: true }],
      attended: [{ tool: 'GetTable', passed: true, detail: 'C3 대표 건' }],
    });

    expect(report.tools[0]?.contract.status).toBe('pass');
    expect(report.tools[0]?.attended.status).toBe('pass');
    expect(report.tools[0]?.attended.detail).toBe('C3 대표 건');
  });
});

describe('증거 없는 도구가 눈에 띈다', () => {
  it('아무 증거도 없는 도구를 따로 모아 센다', async () => {
    const report = buildCoverage({
      tools: ['GetClass', 'GetInclude', 'CheckSyntax'],
      replays: [await passingReplay('GetClass')],
    });

    expect(report.toolsWithoutEvidence).toEqual(['CheckSyntax', 'GetInclude']);
    expect(report.totals).toMatchObject({ tools: 3, withEvidence: 1, withoutEvidence: 2 });
  });

  it('마크다운이 증거 없는 도구를 명시적으로 말한다', async () => {
    const md = renderCoverageMarkdown(
      buildCoverage({ tools: ['GetClass', 'GetInclude'], replays: [await passingReplay('GetClass')] }),
    );

    expect(md).toContain('증거 없음');
    expect(md).toContain('GetInclude');
  });

  it('증거가 전부 있으면 그 사실도 말한다', async () => {
    const md = renderCoverageMarkdown(buildCoverage({ tools: ['GetClass'], replays: [await passingReplay('GetClass')] }));

    expect(md).toContain('증거 없는 도구 0');
  });
});

describe('휴면 등재는 통과로 세지 않는다', () => {
  it('휴면 항목이 표에 휴면으로 드러난다', () => {
    const report = buildCoverage({ tools: [], divergences: M1_DIVERGENCES });
    const dormant = report.divergences.filter((d) => d.status === 'dormant').map((d) => d.id);

    expect(dormant).toEqual(['D2', 'D3']);
    for (const row of report.divergences) {
      if (row.status === 'dormant') expect(row.passed).toBe(0);
    }
  });

  it('마크다운이 휴면 항목을 통과가 아닌 것으로 적는다', () => {
    const md = renderCoverageMarkdown(buildCoverage({ tools: [], divergences: M1_DIVERGENCES }));

    expect(md).toContain('휴면');
    expect(md).toContain('D2');
    expect(md).toContain('D3');
  });

  it('이연된 등재 항목은 통과가 아니라 이연으로 세어진다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetSqlQuery', response: envelope('구') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('신') }]));
    const report = buildCoverage({ tools: ['GetSqlQuery'], replays: [result], divergences: M1_DIVERGENCES });
    const d1 = report.divergences.find((d) => d.id === 'D1');

    expect(d1).toMatchObject({ judged: 1, passed: 0, deferred: 1, failed: 0 });
    expect(report.tools[0]?.replay.status).toBe('none');
  });
});

describe('산문 정규화 건수 (D13)', () => {
  it('느슨하게 판정한 건수가 표에 잡힌다', async () => {
    const report = buildCoverage({
      tools: ['GetClass'],
      replays: [await proseNormalizedReplay('GetClass')],
      divergences: M1_DIVERGENCES,
    });

    expect(report.proseNormalized.total).toBe(1);
    expect(report.proseNormalized.divergenceId).toBe('D13');
    expect(report.proseNormalized.byTool).toEqual([{ tool: 'GetClass', count: 1 }]);
  });

  it('마크다운이 그 건수를 적는다', async () => {
    const md = renderCoverageMarkdown(
      buildCoverage({ tools: ['GetClass'], replays: [await proseNormalizedReplay('GetClass')], divergences: M1_DIVERGENCES }),
    );

    expect(md).toContain('D13');
    expect(md).toContain('산문 정규화');
  });

  it('건수가 0이어도 절을 지운다 — 0건임이 보여야 한다', () => {
    const md = renderCoverageMarkdown(buildCoverage({ tools: ['GetClass'] }));

    expect(md).toContain('산문 정규화 0건');
  });
});

describe('두 형태로 낸다', () => {
  it('기계가 읽는 형태는 그대로 JSON이 된다', async () => {
    const report = buildCoverage({ tools: ['GetClass'], replays: [await passingReplay('GetClass')] });

    expect(() => JSON.parse(JSON.stringify(report))).not.toThrow();
    expect(JSON.parse(JSON.stringify(report))).toMatchObject({ totals: { tools: 1 } });
  });

  it('사람이 읽는 형태는 마크다운 표다', async () => {
    const md = renderCoverageMarkdown(buildCoverage({ tools: ['GetClass'], replays: [await passingReplay('GetClass')] }));

    expect(md).toContain('| 도구 |');
    expect(md).toContain('GetClass');
  });

  it('시퀀스별 판정도 남는다', async () => {
    const report = buildCoverage({ tools: ['GetClass'], replays: [await passingReplay('GetClass')] });

    expect(report.sequences).toEqual([{ sequenceId: 'demo-read-class', verdict: 'pass', steps: 1 }]);
  });
});

describe('M1 도구 목록', () => {
  it('구 표면 채록에서 M1 19종을 읽는다 — 이름을 여기 베끼지 않는다', () => {
    const names = loadM1ToolNames();

    expect(names).toHaveLength(19);
    expect(names).toContain('GetSqlQuery');
    expect(names).toContain('ActivateObjects');
    expect([...names]).toEqual([...names].sort());
  });
});
