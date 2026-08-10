import type { SapTier } from '../../contracts';
import { readBlocklistConfig } from '../blocklist';
import { ROW_DATA_TOOLS, evaluateRowDataRequest, isRowDataTool } from '../rowData';

const ctx = (env: Record<string, string | undefined> = {}, tier: SapTier = 'DEV') => ({
  tier,
  config: readBlocklistConfig(env),
});

describe('isRowDataTool', () => {
  it('knows exactly the two row-returning tools', () => {
    expect([...ROW_DATA_TOOLS].sort()).toEqual(['GetSqlQuery', 'GetTableContents']);
    expect(isRowDataTool('GetTableContents')).toBe(true);
    expect(isRowDataTool('GetSqlQuery')).toBe(true);
    expect(isRowDataTool('ReadClass')).toBe(false);
  });
});

describe('evaluateRowDataRequest — GetTableContents', () => {
  // NEGATIVE — a protected table is refused before any connection is touched.
  it('denies a deny-tier table', () => {
    const d = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: 'BNKA' }, ctx());
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_BLOCKED');
  });

  // NEGATIVE — no acknowledgement, no rows.
  it('refuses an ask-tier table when acknowledge_risk is absent', () => {
    const d = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: 'VBRK' }, ctx());
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_CONFIRM');
  });

  it('allows an ask-tier table once acknowledged and emits an audit line', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetTableContents', tableName: 'VBRK', acknowledgeRisk: true },
      ctx(),
    );
    expect(d.kind).toBe('allow');
    expect(d.kind === 'allow' && d.audit.join('\n')).toContain(
      'user-acknowledged GetTableContents on VBRK',
    );
  });

  it('allows an unprotected table', () => {
    const d = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: 'ZSAPKIT_FREE' }, ctx());
    expect(d.kind).toBe('allow');
    expect(d.kind === 'allow' && d.tables).toEqual(['ZSAPKIT_FREE']);
  });

  // NEGATIVE — only the explicitly allowed table passes.
  it('honours MCP_ALLOW_TABLE for exactly the named table', () => {
    const c = ctx({ MCP_ALLOW_TABLE: 'BNKA' });
    const allowed = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: 'BNKA' }, c);
    expect(allowed.kind).toBe('allow');
    expect(allowed.kind === 'allow' && allowed.audit.join('\n')).toContain(
      'MCP_ALLOW_TABLE bypass for BNKA',
    );

    const stillBlocked = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: 'KNA1' }, c);
    expect(stillBlocked.kind).toBe('deny');
  });

  // NEGATIVE — a call with no table name cannot be evaluated, so it is refused.
  it('refuses a call with no table name', () => {
    const d = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: '  ' }, ctx());
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_ARGS');
  });
});

describe('evaluateRowDataRequest — GetSqlQuery', () => {
  it('denies a query against a deny-tier table', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetSqlQuery', sql: 'SELECT * FROM KNA1' },
      ctx(),
    );
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_BLOCKED');
  });

  it('denies a query that reaches a protected table through a JOIN', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetSqlQuery', sql: 'SELECT * FROM ZSAPKIT_FREE JOIN BNKA ON A~X = B~X' },
      ctx(),
    );
    expect(d.kind).toBe('deny');
  });

  it('asks for confirmation on an ask-tier table and passes once acknowledged', () => {
    const asked = evaluateRowDataRequest({ tool: 'GetSqlQuery', sql: 'SELECT * FROM VBRK' }, ctx());
    expect(asked.kind === 'deny' && asked.code).toBe('ERR_ROWDATA_CONFIRM');

    const acked = evaluateRowDataRequest(
      { tool: 'GetSqlQuery', sql: 'SELECT * FROM VBRK', acknowledgeRisk: true },
      ctx(),
    );
    expect(acked.kind).toBe('allow');
    expect(acked.kind === 'allow' && acked.audit.join('\n')).toContain(
      'user-acknowledged GetSqlQuery on VBRK',
    );
  });

  // NEGATIVE — a parser blind spot must not become a bypass.
  it('refuses a query that names a table source it cannot parse (fail-closed)', () => {
    const d = evaluateRowDataRequest({ tool: 'GetSqlQuery', sql: 'SELECT * FROM ( ' }, ctx());
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_UNPARSEABLE');
  });

  it('allows a query with no table source at all', () => {
    const d = evaluateRowDataRequest({ tool: 'GetSqlQuery', sql: 'SELECT 1' }, ctx());
    expect(d.kind).toBe('allow');
  });

  it('exempts an aggregate-only query from the blocklist', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetSqlQuery', sql: 'SELECT COUNT(*) FROM KNA1' },
      ctx(),
    );
    expect(d.kind).toBe('allow');
  });

  // NEGATIVE — the aggregate exemption is not a wrapper anyone can wear.
  it('does not exempt a query that mixes a column with an aggregate', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetSqlQuery', sql: 'SELECT KUNNR, COUNT(*) FROM KNA1' },
      ctx(),
    );
    expect(d.kind).toBe('deny');
  });

  // NEGATIVE — the aggregate exemption is judged on the raw statement, so a
  // comment tucked into the projection does not buy a way past the blocklist.
  it('does not exempt an aggregate whose projection carries a comment', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetSqlQuery', sql: 'SELECT COUNT(*) /*x*/ FROM KNA1' },
      ctx(),
    );
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_BLOCKED');
  });

  it('refuses a call with no sql', () => {
    const d = evaluateRowDataRequest({ tool: 'GetSqlQuery', sql: '' }, ctx());
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_ARGS');
  });
});

// The bypass line is written as each table is checked, before any verdict
// exists, so a refusal on some OTHER table must not erase it — otherwise an
// allowed-table bypass could be hidden from the audit channel by pairing it
// with a table that is refused outright.
describe('evaluateRowDataRequest — the audit trail survives a refusal', () => {
  const allowBnka = () => ctx({ MCP_ALLOW_TABLE: 'BNKA' });

  it('keeps the MCP_ALLOW_TABLE bypass line on a hard refusal', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetSqlQuery', sql: 'SELECT * FROM BNKA JOIN KNA1 ON BNKA~X = KNA1~X' },
      allowBnka(),
    );
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_BLOCKED');
    expect(d.kind === 'deny' && d.audit.join('\n')).toContain(
      'AUDIT: MCP_ALLOW_TABLE bypass for BNKA',
    );
  });

  it('keeps the bypass line on an ask-tier refusal too', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetSqlQuery', sql: 'SELECT * FROM BNKA JOIN VBRK ON BNKA~X = VBRK~X' },
      allowBnka(),
    );
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_ROWDATA_CONFIRM');
    expect(d.kind === 'deny' && d.audit.join('\n')).toContain(
      'AUDIT: MCP_ALLOW_TABLE bypass for BNKA',
    );
  });

  it('carries an empty audit list on the refusals that never reached the blocklist', () => {
    const noArgs = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: ' ' }, ctx());
    expect(noArgs.kind === 'deny' && noArgs.audit).toEqual([]);

    const tierDenied = evaluateRowDataRequest(
      { tool: 'GetTableContents', tableName: 'ZSAPKIT_FREE' },
      { ...ctx({}, 'PRD'), toolKind: 'mutation' },
    );
    expect(tierDenied.kind === 'deny' && tierDenied.audit).toEqual([]);
  });
});

describe('evaluateRowDataRequest — the gate is always on', () => {
  it('applies the blocklist on every tier, not just DEV', () => {
    for (const tier of ['DEV', 'QA', 'PRD', 'UNKNOWN'] as SapTier[]) {
      const d = evaluateRowDataRequest(
        { tool: 'GetTableContents', tableName: 'BNKA' },
        ctx({}, tier),
      );
      expect(d.kind).toBe('deny');
    }
  });

  it('lets an unprotected read through on a read-only tier (rows are a read)', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetTableContents', tableName: 'ZSAPKIT_FREE' },
      ctx({}, 'PRD'),
    );
    expect(d.kind).toBe('allow');
  });

  it('consults the tier gate — a tier refusal comes back as ERR_READONLY_TIER', () => {
    const d = evaluateRowDataRequest(
      { tool: 'GetTableContents', tableName: 'ZSAPKIT_FREE' },
      { ...ctx({}, 'PRD'), toolKind: 'mutation' },
    );
    expect(d.kind).toBe('deny');
    expect(d.kind === 'deny' && d.code).toBe('ERR_READONLY_TIER');
  });

  it('defaults to the locked blocklist when no config is supplied', () => {
    const d = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: 'BNKA' }, {
      tier: 'DEV',
    });
    expect(d.kind).toBe('deny');
  });
});
