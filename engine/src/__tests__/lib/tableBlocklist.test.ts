/**
 * Unit tests for src/lib/policy/tableBlocklist.ts — SQL table extraction.
 *
 * Focus: the hardened `extractTablesFromSql` / `sqlHasTableSource` pair that
 * closes the GetSqlQuery extraction bypass (comment-obfuscated and
 * comma-separated tables previously slipped past the blocklist gate), plus the
 * fail-closed wiring in handleGetSqlQuery.
 */

import {
  checkTables,
  extractTablesFromSql,
  sqlHasTableSource,
} from '../../lib/policy/tableBlocklist';

describe('extractTablesFromSql — hardened extraction', () => {
  it('extracts BOTH tables from a comma-separated FROM list', () => {
    expect(extractTablesFromSql('SELECT * FROM A, B').sort()).toEqual([
      'A',
      'B',
    ]);
  });

  it('closes the comma bypass: FROM SAFE_TABLE, KNA1 yields KNA1', () => {
    // Proven bypass — the old /\b(FROM|JOIN)\s+([A-Z0-9_/]+)/ regex captured
    // only SAFE_TABLE and silently dropped the protected KNA1.
    const tables = extractTablesFromSql('SELECT * FROM SAFE_TABLE, KNA1');
    expect(tables).toContain('SAFE_TABLE');
    expect(tables).toContain('KNA1');
  });

  it('closes the comment bypass: FROM /*c*/ KNA1 yields KNA1 (not "/")', () => {
    // Proven bypass — the old regex matched the leading "/" of the comment and
    // never reached KNA1.
    const tables = extractTablesFromSql('SELECT * FROM /*c*/ KNA1');
    expect(tables).toEqual(['KNA1']);
  });

  it('handles a comment + comma combination', () => {
    const tables = extractTablesFromSql(
      'SELECT * FROM /* a */ KNA1, /* b */ LFA1 -- trailing FROM ADRC',
    );
    expect(tables.sort()).toEqual(['KNA1', 'LFA1']);
  });

  it('strips -- line comments so a hidden FROM cannot inject a table', () => {
    const tables = extractTablesFromSql(
      'SELECT * FROM T000 -- FROM KNA1\nWHERE mandt = 100',
    );
    expect(tables).toEqual(['T000']);
  });

  it('captures a nested FROM inside a subquery', () => {
    const tables = extractTablesFromSql(
      'SELECT * FROM KNA1 WHERE kunnr IN ( SELECT kunnr FROM VBAK )',
    );
    expect(tables.sort()).toEqual(['KNA1', 'VBAK']);
  });

  it('captures the real source of a derived-table FROM ( SELECT … )', () => {
    const tables = extractTablesFromSql(
      'SELECT * FROM ( SELECT * FROM BSEG ) AS x',
    );
    expect(tables).toEqual(['BSEG']);
  });

  it('captures both sides of an explicit JOIN with aliases', () => {
    const tables = extractTablesFromSql(
      'SELECT * FROM VBAK AS a INNER JOIN VBAP AS b ON a~vbeln = b~vbeln',
    );
    expect(tables.sort()).toEqual(['VBAK', 'VBAP']);
  });

  it('regression: a simple single-table SELECT still extracts one table', () => {
    expect(extractTablesFromSql('SELECT MANDT, MTEXT FROM T000')).toEqual([
      'T000',
    ]);
  });

  it('does not treat a bare alias or a WHERE keyword as a table', () => {
    expect(
      extractTablesFromSql('SELECT * FROM USR02 u WHERE u~bname = X'),
    ).toEqual(['USR02']);
  });

  it('keeps namespaced (/…) table names intact', () => {
    expect(extractTablesFromSql('SELECT * FROM /BIC/AZTABLE')).toEqual([
      '/BIC/AZTABLE',
    ]);
  });

  it('returns nothing when a table source cannot be parsed', () => {
    // FROM survives but no table token follows — extraction is empty; the
    // handler pairs this with sqlHasTableSource() to fail closed.
    expect(extractTablesFromSql('SELECT * FROM /* only a comment */')).toEqual(
      [],
    );
  });
});

describe('sqlHasTableSource — fail-closed signal', () => {
  it('is true when a FROM survives comment stripping but no table parses', () => {
    expect(sqlHasTableSource('SELECT * FROM /* only a comment */')).toBe(true);
  });

  it('is true for an ordinary FROM/JOIN query', () => {
    expect(sqlHasTableSource('SELECT * FROM T000')).toBe(true);
    expect(sqlHasTableSource('SELECT * FROM A JOIN B ON A~x = B~x')).toBe(true);
  });

  it('is false when the only FROM lives inside a comment', () => {
    expect(sqlHasTableSource('SELECT 1 /* FROM KNA1 */')).toBe(false);
    expect(sqlHasTableSource('SELECT 1 -- FROM KNA1')).toBe(false);
  });

  it('is false for a query with no table source', () => {
    expect(sqlHasTableSource('SELECT 1')).toBe(false);
  });
});

describe('blocklist end-to-end via the hardened extractor', () => {
  it('the previously-bypassed comma case now trips the deny gate', () => {
    const tables = extractTablesFromSql('SELECT * FROM SAFE_TABLE, KNA1');
    const hits = checkTables(tables);
    expect(hits.some((h) => h.table === 'KNA1' && h.action === 'deny')).toBe(
      true,
    );
  });

  it('the previously-bypassed comment case now trips the deny gate', () => {
    const hits = checkTables(extractTablesFromSql('SELECT * FROM /*x*/ LFA1'));
    expect(hits.some((h) => h.table === 'LFA1' && h.action === 'deny')).toBe(
      true,
    );
  });
});
