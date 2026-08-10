/**
 * SQL inspection for the row-data gate.
 *
 * The blocklist works on table names, so a freestyle SELECT has to be reduced
 * to the tables it touches before it can be judged. That reduction is
 * best-effort by construction, which is why it comes with a companion:
 * {@link sqlHasTableSource} says whether the statement names a table source at
 * all. A statement that names one but yields no extracted name is a blind spot
 * in this parser, and the caller refuses it rather than letting it through
 * unjudged.
 *
 * The cases that must not slip past, because each was a real bypass:
 *   - a comment sitting between FROM and the table name;
 *   - an old-style comma-separated table list, with or without aliases;
 *   - explicit JOINs;
 *   - a table referenced only inside a subquery.
 */

/** Identifier characters, including the `/NAMESPACE/` form. */
const IDENTIFIER = /^[A-Za-z0-9_/]+/;

/**
 * Words that can appear where a table token is scanned but are never table
 * names. They also mark where a comma-separated table list ends.
 */
const NON_TABLE_WORDS: ReadonlySet<string> = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL',
  'CROSS', 'ON', 'AS', 'GROUP', 'ORDER', 'BY', 'HAVING', 'UNION', 'ALL',
  'INTO', 'AND', 'OR', 'NOT', 'DISTINCT', 'UP', 'TO', 'ROWS', 'CLIENT',
  'SPECIFIED', 'FOR', 'WITH', 'WHEN', 'CASE', 'END',
]);

/**
 * Replace block and line comments with a space, so the tokens they separated
 * do not fuse and nothing can hide inside them.
 */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
}

/** True when a FROM or JOIN survives comment stripping. */
export function sqlHasTableSource(sql: string): boolean {
  return /\b(?:FROM|JOIN)\b/i.test(stripSqlComments(sql));
}

interface Token {
  readonly value: string;
  readonly end: number;
}

function skipSpace(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text.charAt(i))) i++;
  return i;
}

function readIdentifier(text: string, from: number): Token | null {
  const match = IDENTIFIER.exec(text.slice(from));
  if (!match) return null;
  const value = match[0];
  return { value, end: from + value.length };
}

/** Every table name this statement references, uppercased and de-duplicated. */
export function extractTablesFromSql(sql: string): string[] {
  const text = stripSqlComments(sql);
  const found = new Set<string>();

  for (const match of text.matchAll(/\b(FROM|JOIN)\b/gi)) {
    const isFrom = (match[1] ?? '').toUpperCase() === 'FROM';
    let i = (match.index ?? 0) + match[0].length;

    for (;;) {
      i = skipSpace(text, i);
      // A derived table: whatever it selects from is picked up by the outer
      // scan of this same loop, so there is nothing to read here.
      if (text.charAt(i) === '(') break;

      const table = readIdentifier(text, i);
      if (!table) break;
      const name = table.value.toUpperCase();
      if (NON_TABLE_WORDS.has(name)) break;
      found.add(name);
      i = table.end;

      // A JOIN names exactly one table; only FROM can carry a list.
      if (!isFrom) break;

      // Step over an optional alias — "AS x" or a bare "x" — to reach the comma.
      const aliasStart = skipSpace(text, i);
      const alias = readIdentifier(text, aliasStart);
      if (alias) {
        const upper = alias.value.toUpperCase();
        if (upper === 'AS') {
          const named = readIdentifier(text, skipSpace(text, alias.end));
          i = named ? named.end : alias.end;
        } else if (!NON_TABLE_WORDS.has(upper)) {
          i = alias.end;
        }
      }

      i = skipSpace(text, i);
      if (text.charAt(i) !== ',') break;
      i++;
    }
  }

  return [...found];
}

/**
 * True when the projection is nothing but aggregate calls — a row count or a
 * sum returns no row-level values, so such a query is exempt from the
 * blocklist even on a protected table.
 *
 * The exemption is narrow on purpose. GROUP BY and HAVING surface the grouping
 * keys, UNION can graft a second projection on, and a subquery in the
 * projection returns real values; each disqualifies the statement.
 */
export function isAggregateOnly(sql: string): boolean {
  const text = `${stripSqlComments(sql).replace(/\s+/g, ' ').trim()} `;
  if (/\b(UNION|GROUP\s+BY|HAVING)\b/i.test(text)) return false;

  const match = /^SELECT\s+(.+?)\s+FROM\s/i.exec(text);
  if (!match) return false;

  const projection = match[1] ?? '';
  if (/\(\s*SELECT\b/i.test(projection)) return false;

  const items = splitTopLevel(projection, ',');
  if (items.length === 0) return false;

  const aggregate =
    /^(?:COUNT|SUM|MIN|MAX|AVG)\s*\(\s*(?:DISTINCT\s+)?(?:\*|[A-Za-z0-9_./~]+)\s*\)(?:\s+AS\s+[A-Za-z0-9_]+)?$/i;
  return items.every((item) => aggregate.test(item.trim()));
}

/** Split on a separator that is not inside parentheses. */
function splitTopLevel(text: string, separator: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buffer = '';
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (char === separator && depth === 0) {
      out.push(buffer);
      buffer = '';
    } else {
      buffer += char;
    }
  }
  if (buffer.trim()) out.push(buffer);
  return out;
}
