/**
 * 커버리지 표 — **무엇이 어느 급 증거로 통과했는가, 무엇이 아직 증거가 없는가.**
 *
 * 후자가 조용히 사라지면 표가 존재할 이유가 없다. 그래서 여기서 못박는 것은
 * 통과 집계가 아니라 **빠진 것이 눈에 띄는가**다.
 */
import { buildCoverage, loadM1ToolNames, renderCoverageMarkdown } from '../coverage';
import type { CoverageReport } from '../coverage';
import { M1_DIVERGENCES } from '../divergences';
import type { DivergenceEntry } from '../divergences';
import { replaySequence } from '../replay';
import { envelope, recorded, step, target } from './helpers';

const ADT_403 = 'HTTP 403 Forbidden — [ExceptionResourceNoAccess] (lock-conflict): locked by DEVELOPER1';

function rowOf(report: CoverageReport, tool: string) {
  const row = report.tools.find((r) => r.tool === tool);
  if (row === undefined) throw new Error(`표에 ${tool} 행이 없다.`);
  return row;
}

/** 시험 전용 등재 항목 하나 — 검사는 여기서 소유한다. */
function ledgerEntry(tool: string, overrides: Partial<DivergenceEntry> = {}): DivergenceEntry {
  return {
    id: 'DTEST',
    title: '시험용 등재 항목',
    tool,
    classification: '수리',
    status: 'active',
    evidence: 'harness/replay/__tests__/coverage.test.ts',
    substituteTest: 'harness/replay/__tests__/coverage.test.ts',
    resolvesIn: null,
    applies: (s) => s.tool === tool,
    check: () => ({ ok: true, detail: '신 엔진 쪽이 옳다고 확인했다.' }),
    ...overrides,
  };
}

/** 등재된 차이가 대체 기대 시험으로 판정되는 재생 하나. */
async function allowlistedReplay(tool: string, ok: boolean) {
  const fixture = recorded([step({ index: 0, tool, response: envelope('구') })]);
  return replaySequence(fixture, target([{ payload: envelope('신') }]), {
    divergences: [ledgerEntry(tool, { check: () => ({ ok, detail: '시험이 판정했다.' }) })],
  });
}

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

describe('넷째 급 — 의도적 차이 등재분의 대체 기대 시험', () => {
  it('대체 기대 시험만 가진 도구가 증거 있음으로 계산된다', () => {
    const report = buildCoverage({
      tools: ['GetSqlQuery'],
      substituteTests: [{ tool: 'GetSqlQuery', passed: true, detail: 'D1 대체 기대 시험' }],
    });

    expect(rowOf(report, 'GetSqlQuery').substitute.status).toBe('pass');
    expect(rowOf(report, 'GetSqlQuery').hasEvidence).toBe(true);
    expect(report.toolsWithoutEvidence).toEqual([]);
  });

  it('등재로 통과한 재생 단계는 재생 급이 아니라 대체 기대 시험 급이다', async () => {
    // ⓐ는 "재생 정규화 diff 0"이다. 등재로 통과한 단계는 diff 0이 아니므로
    // 재생 급을 채우면 등재가 주 급을 대신하게 된다 — spec §3.3이 금한 것이다.
    const report = buildCoverage({ tools: ['GetClass'], replays: [await allowlistedReplay('GetClass', true)] });

    expect(rowOf(report, 'GetClass').substitute.status).toBe('pass');
    expect(rowOf(report, 'GetClass').replay.status).toBe('none');
  });

  it('대체 기대 시험이 실패한 단계는 그 급의 실패로 남는다', async () => {
    const report = buildCoverage({ tools: ['GetClass'], replays: [await allowlistedReplay('GetClass', false)] });

    expect(rowOf(report, 'GetClass').substitute.status).toBe('fail');
    expect(rowOf(report, 'GetClass').hasEvidence).toBe(false);
  });

  it('마크다운에 대체 기대 시험 칸이 있다', () => {
    const md = renderCoverageMarkdown(
      buildCoverage({ tools: ['GetSqlQuery'], substituteTests: [{ tool: 'GetSqlQuery', passed: true }] }),
    );

    expect(md).toContain('대체 기대 시험');
  });
});

describe('도구 상태 3칸', () => {
  it('등록점에 없으면 안 지음이다', () => {
    const report = buildCoverage({
      tools: ['GetClass', 'GetInclude'],
      registered: ['GetClass'],
      contractTests: [{ tool: 'GetClass', passed: true }],
    });

    expect(rowOf(report, 'GetInclude').status).toBe('not-built');
    expect(rowOf(report, 'GetClass').status).toBe('evidenced');
  });

  it('요구 급이 재생인데 계약 시험만 있으면 지음·증거 대기다', () => {
    const report = buildCoverage({
      tools: ['GetClass'],
      registered: ['GetClass'],
      requiredGrades: { GetClass: 'replay' },
      contractTests: [{ tool: 'GetClass', passed: true }],
    });

    expect(rowOf(report, 'GetClass').status).toBe('awaiting-evidence');
    expect(rowOf(report, 'GetClass').missing).toEqual(['replay']);
    // 급은 안 찼지만 증거 자체는 있다 — 두 질문은 다르다.
    expect(rowOf(report, 'GetClass').hasEvidence).toBe(true);
  });

  it('요구 급 입력이 없으면 사다리 3 = 계약 시험이다', () => {
    const report = buildCoverage({
      tools: ['GetClass'],
      registered: ['GetClass'],
      contractTests: [{ tool: 'GetClass', passed: true }],
    });

    expect(rowOf(report, 'GetClass').requiredGrade).toBe('contract');
    expect(rowOf(report, 'GetClass').status).toBe('evidenced');
  });

  it('시험이 깨진 등록 도구가 안 지음으로 떨어지지 않는다', () => {
    // 상태의 판정 기준은 등록점 하나다. 시험 통과를 섞으면 다음 판이 같은
    // 도구를 다시 짓는다.
    const report = buildCoverage({
      tools: ['GetClass'],
      registered: ['GetClass'],
      contractTests: [{ tool: 'GetClass', passed: false }],
    });

    expect(rowOf(report, 'GetClass').status).toBe('awaiting-evidence');
  });

  it('장부 등재분은 주 급에 더해 대체 기대 시험을 요구한다', () => {
    const base = {
      tools: ['GetTable'],
      registered: ['GetTable'],
      divergences: [ledgerEntry('GetTable')],
      contractTests: [{ tool: 'GetTable', passed: true }],
    };

    const withoutSubstitute = buildCoverage(base);
    expect(rowOf(withoutSubstitute, 'GetTable').requiresSubstitute).toBe(true);
    expect(rowOf(withoutSubstitute, 'GetTable').status).toBe('awaiting-evidence');
    expect(rowOf(withoutSubstitute, 'GetTable').missing).toEqual(['substitute']);

    const withSubstitute = buildCoverage({ ...base, substituteTests: [{ tool: 'GetTable', passed: true }] });
    expect(rowOf(withSubstitute, 'GetTable').status).toBe('evidenced');
    expect(rowOf(withSubstitute, 'GetTable').missing).toEqual([]);
  });

  it('등록점 스냅샷이 없으면 안 지음을 판정하지 않는다', () => {
    const report = buildCoverage({ tools: ['GetClass'], contractTests: [{ tool: 'GetClass', passed: true }] });

    expect(report.registryKnown).toBe(false);
    expect(rowOf(report, 'GetClass').status).toBe('evidenced');
  });

  it('상태별 총계와 대기 목록을 따로 센다', () => {
    const report = buildCoverage({
      tools: ['GetClass', 'GetInclude', 'CheckSyntax'],
      registered: ['GetClass', 'GetInclude'],
      contractTests: [{ tool: 'GetClass', passed: true }],
    });

    expect(report.totals).toMatchObject({ notBuilt: 1, awaitingEvidence: 1, evidenced: 1 });
    expect(report.toolsAwaitingEvidence).toEqual(['GetInclude']);
  });

  it('마크다운이 상태 3칸을 그대로 적는다', () => {
    const md = renderCoverageMarkdown(
      buildCoverage({
        tools: ['GetClass', 'GetInclude'],
        registered: ['GetClass'],
        contractTests: [{ tool: 'GetClass', passed: true }],
      }),
    );

    expect(md).toContain('안 지음');
    expect(md).toContain('증거 있음');
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
