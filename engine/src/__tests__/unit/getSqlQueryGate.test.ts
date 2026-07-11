/**
 * Unit tests for the GetSqlQuery blocklist gate — fail-closed behavior when the
 * query names a table source but no table name can be extracted.
 *
 * SAP-independent: the fail-closed branch throws before any ADT client is
 * built, so the handler never touches the (dummy) connection.
 */

import { handleGetSqlQuery } from '../../handlers/system/readonly/handleGetSqlQuery';

function textOf(result: any): string {
  return result?.content?.find((c: any) => c.type === 'text')?.text ?? '';
}

const ctx = { connection: {} as any, logger: undefined } as any;

describe('handleGetSqlQuery — fail-closed extraction gate', () => {
  it('refuses a query whose table is hidden behind a comment', async () => {
    const res = await handleGetSqlQuery(ctx, {
      sql_query: 'SELECT * FROM /* hidden */',
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/could not extract|fail-closed/i);
  });

  it('refuses even an aggregate query when the table cannot be parsed', async () => {
    const res = await handleGetSqlQuery(ctx, {
      sql_query: 'SELECT COUNT(*) FROM /* c */',
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/could not extract|fail-closed/i);
  });
});
