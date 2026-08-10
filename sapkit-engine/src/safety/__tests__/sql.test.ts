import { extractTablesFromSql, isAggregateOnly, sqlHasTableSource, stripSqlComments } from '../sql';

const sorted = (sql: string) => extractTablesFromSql(sql).sort();

describe('stripSqlComments', () => {
  it('removes block comments and leaves a separator behind', () => {
    expect(stripSqlComments('SELECT/*x*/A FROM T').replace(/\s+/g, ' ')).toBe('SELECT A FROM T');
  });

  it('removes line comments', () => {
    expect(stripSqlComments('SELECT * FROM T -- secret\nWHERE X=1').replace(/\s+/g, ' ')).toBe(
      'SELECT * FROM T WHERE X=1',
    );
  });
});

describe('sqlHasTableSource', () => {
  it('is true when a FROM or JOIN survives comment stripping', () => {
    expect(sqlHasTableSource('SELECT * FROM KNA1')).toBe(true);
    expect(sqlHasTableSource('SELECT * FROM A INNER JOIN B ON A~X = B~X')).toBe(true);
  });

  it('is false when the only FROM is inside a comment', () => {
    expect(sqlHasTableSource('SELECT 1 /* FROM KNA1 */')).toBe(false);
  });
});

describe('extractTablesFromSql', () => {
  it('finds a plain FROM table', () => {
    expect(extractTablesFromSql('SELECT * FROM KNA1')).toEqual(['KNA1']);
  });

  it('uppercases the result', () => {
    expect(extractTablesFromSql('select * from kna1')).toEqual(['KNA1']);
  });

  // NEGATIVE-adjacent: a comment between FROM and the table used to hide it.
  it('sees through a comment placed between FROM and the table', () => {
    expect(extractTablesFromSql('SELECT * FROM /* hide */ KNA1')).toEqual(['KNA1']);
  });

  it('walks an old-style comma-separated table list', () => {
    expect(sorted('SELECT * FROM VBAK, KNA1 WHERE VBAK~KUNNR = KNA1~KUNNR')).toEqual([
      'KNA1',
      'VBAK',
    ]);
  });

  it('skips `AS` aliases while walking the comma list', () => {
    expect(sorted('SELECT * FROM VBAK AS V, KNA1 AS K')).toEqual(['KNA1', 'VBAK']);
  });

  it('skips bare aliases while walking the comma list', () => {
    expect(sorted('SELECT * FROM VBAK V, KNA1 K')).toEqual(['KNA1', 'VBAK']);
  });

  it('captures explicit JOIN targets', () => {
    expect(sorted('SELECT * FROM VBAK INNER JOIN KNA1 ON VBAK~KUNNR = KNA1~KUNNR')).toEqual([
      'KNA1',
      'VBAK',
    ]);
  });

  it('captures a table referenced only inside a subquery', () => {
    expect(sorted('SELECT * FROM ( SELECT * FROM KNA1 ) AS X')).toEqual(['KNA1']);
  });

  it('keeps namespaced table names intact', () => {
    expect(extractTablesFromSql('SELECT * FROM /BIC/AZTAB')).toEqual(['/BIC/AZTAB']);
  });

  it('stops at a clause keyword instead of reporting it as a table', () => {
    const tables = extractTablesFromSql('SELECT * FROM KNA1 WHERE LAND1 = 1 ORDER BY KUNNR');
    expect(tables).toEqual(['KNA1']);
  });

  it('returns nothing when there is no table source at all', () => {
    expect(extractTablesFromSql('SELECT 1')).toEqual([]);
  });
});

describe('isAggregateOnly', () => {
  it('accepts a bare row count', () => {
    expect(isAggregateOnly('SELECT COUNT(*) FROM KNA1')).toBe(true);
  });

  it('accepts several aggregates with aliases', () => {
    expect(isAggregateOnly('SELECT COUNT(*) AS N, SUM(DMBTR) AS TOTAL FROM BSEG')).toBe(true);
    expect(isAggregateOnly('SELECT COUNT( DISTINCT KUNNR ) FROM KNA1')).toBe(true);
  });

  // NEGATIVE — one plain column is enough to lose the exemption.
  it('rejects a projection that mixes a column with an aggregate', () => {
    expect(isAggregateOnly('SELECT KUNNR, COUNT(*) FROM KNA1')).toBe(false);
  });

  it('rejects a plain projection', () => {
    expect(isAggregateOnly('SELECT * FROM KNA1')).toBe(false);
  });

  // NEGATIVE — GROUP BY surfaces the grouping keys, so it is row data again.
  it('rejects GROUP BY / HAVING / UNION', () => {
    expect(isAggregateOnly('SELECT COUNT(*) FROM KNA1 GROUP BY LAND1')).toBe(false);
    expect(isAggregateOnly('SELECT COUNT(*) FROM KNA1 HAVING COUNT(*) > 1')).toBe(false);
    expect(isAggregateOnly('SELECT COUNT(*) FROM KNA1 UNION SELECT COUNT(*) FROM LFA1')).toBe(false);
  });

  // NEGATIVE — a subquery in the projection can leak rows.
  it('rejects a subquery in the projection', () => {
    expect(isAggregateOnly('SELECT ( SELECT KUNNR FROM KNA1 ) FROM VBAK')).toBe(false);
  });

  it('rejects a statement that is not a SELECT ... FROM', () => {
    expect(isAggregateOnly('COUNT(*)')).toBe(false);
  });
});
