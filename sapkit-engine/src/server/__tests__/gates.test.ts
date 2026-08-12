/**
 * 게이트 판정 — 이미 지어진 판정기들이 **한 자리에서** 순서대로 불리는지.
 *
 * 판정기 자체의 시험은 `src/safety/__tests__`에 있다. 여기서 고정하는 것은
 * 배선이다: 무엇이 먼저 걸리는가, 감사 문구가 거부 갈래에서도 올라오는가,
 * 실데이터 2종이 노출과 무관하게 매번 지나는가.
 */

import { readBlocklistConfig } from '../../safety';
import { evaluateToolCall } from '../gates';

const locked = readBlocklistConfig({});

describe('tier 게이트', () => {
  it('DEV에서는 mutation을 통과시킨다', () => {
    const decision = evaluateToolCall(
      { name: 'CreateProgram', kind: 'mutation' },
      {},
      { tier: 'DEV', blocklist: locked },
    );
    expect(decision.kind).toBe('allow');
  });

  it.each(['QA', 'PRD', 'UNKNOWN'] as const)('%s에서는 mutation을 거부한다', (tier) => {
    const decision = evaluateToolCall(
      { name: 'CreateProgram', kind: 'mutation' },
      {},
      { tier, blocklist: locked },
    );
    expect(decision.kind).toBe('deny');
    if (decision.kind !== 'deny') return;
    expect(decision.code).toBe('ERR_READONLY_TIER');
    expect(decision.message).toContain('ERR_READONLY_TIER');
  });

  it('QA에서 단위시험 실행은 통과하고 프로파일링 실행은 막힌다 (승계된 좁은 규칙)', () => {
    const unit = evaluateToolCall(
      { name: 'RunUnitTest', kind: 'execution' },
      {},
      { tier: 'QA', blocklist: locked },
    );
    const profiling = evaluateToolCall(
      { name: 'RuntimeRunClassWithProfiling', kind: 'execution' },
      {},
      { tier: 'QA', blocklist: locked },
    );
    expect(unit.kind).toBe('allow');
    expect(profiling.kind).toBe('deny');
  });

  it('읽기 도구는 어느 tier에서도 통과한다', () => {
    expect(
      evaluateToolCall({ name: 'GetInclude', kind: 'read' }, {}, { tier: 'PRD', blocklist: locked })
        .kind,
    ).toBe('allow');
  });
});

describe('실데이터 2종 상시 게이트', () => {
  it('보호 테이블은 거부한다', () => {
    const decision = evaluateToolCall(
      { name: 'GetTableContents', kind: 'row-data' },
      { table_name: 'KNA1' },
      { tier: 'DEV', blocklist: locked },
    );
    expect(decision.kind).toBe('deny');
    if (decision.kind !== 'deny') return;
    expect(decision.message).toContain('row extraction refused');
  });

  it('ask층은 미신고 거부 · 신고 동봉 통과이고 통과에 감사 문구가 붙는다', () => {
    const without = evaluateToolCall(
      { name: 'GetTableContents', kind: 'row-data' },
      { table_name: 'VBRK' },
      { tier: 'DEV', blocklist: locked },
    );
    expect(without.kind).toBe('deny');
    if (without.kind === 'deny') {
      expect(without.message).toContain('user confirmation required for row extraction');
    }

    const withAck = evaluateToolCall(
      { name: 'GetTableContents', kind: 'row-data' },
      { table_name: 'VBRK', acknowledge_risk: true },
      { tier: 'DEV', blocklist: locked },
    );
    expect(withAck.kind).toBe('allow');
    expect(withAck.audit).toContain('AUDIT: user-acknowledged GetTableContents on VBRK');
  });

  it('GetSqlQuery는 sql_query 인자를 판정 대상으로 삼는다', () => {
    const decision = evaluateToolCall(
      { name: 'GetSqlQuery', kind: 'row-data' },
      { sql_query: 'SELECT * FROM KNA1' },
      { tier: 'DEV', blocklist: locked },
    );
    expect(decision.kind).toBe('deny');
    if (decision.kind !== 'deny') return;
    expect(decision.message).toContain('row extraction refused');
  });

  it('인자가 비면 판정할 수 없으므로 거부한다 (fail-closed)', () => {
    const decision = evaluateToolCall(
      { name: 'GetTableContents', kind: 'row-data' },
      {},
      { tier: 'DEV', blocklist: locked },
    );
    expect(decision.kind).toBe('deny');
    if (decision.kind !== 'deny') return;
    expect(decision.code).toBe('ERR_ROWDATA_ARGS');
  });

  it('거부 갈래에도 MCP_ALLOW_TABLE 우회 감사 문구가 실려 온다', () => {
    const config = readBlocklistConfig({ MCP_ALLOW_TABLE: 'BNKA' });
    const decision = evaluateToolCall(
      { name: 'GetSqlQuery', kind: 'row-data' },
      { sql_query: 'SELECT * FROM BNKA INNER JOIN KNA1 ON BNKA.BANKL = KNA1.KUNNR' },
      { tier: 'DEV', blocklist: config },
    );
    expect(decision.kind).toBe('deny');
    expect(decision.audit).toContain('AUDIT: MCP_ALLOW_TABLE bypass for BNKA');
  });

  it('tier 게이트가 실데이터 판정보다 앞선다', () => {
    const decision = evaluateToolCall(
      { name: 'GetTableContents', kind: 'mutation' },
      { table_name: 'KNA1' },
      { tier: 'PRD', blocklist: locked },
    );
    expect(decision.kind).toBe('deny');
    if (decision.kind !== 'deny') return;
    expect(decision.code).toBe('ERR_READONLY_TIER');
  });
});
