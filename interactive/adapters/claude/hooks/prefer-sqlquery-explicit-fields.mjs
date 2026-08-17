#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — steer wide row reads toward an explicit field list.
 *
 * This guard is about cost, not safety. Both tools it watches are already
 * fenced by the row-extraction and tier hooks; what this one notices is the
 * *width* of a read. A call that hauls back every column when three were
 * wanted spends session budget on columns nobody will read.
 *
 * Two shapes earn an `ask`:
 *
 *   · `GetTableContents` — the tool takes no field list at all, so every call
 *     amounts to `SELECT * FROM <table>`. The prompt points at `GetSqlQuery`,
 *     which can name columns.
 *   · `GetSqlQuery` whose statement selects `*` (or `<prefix>.*`) — the wide
 *     read again, through the very tool that was supposed to narrow it. Field
 *     lists built only from COUNT/SUM/MIN/MAX/AVG are exempt: aggregates
 *     collapse a result instead of widening it.
 *
 * Neither shape is refused. `ask` leaves the call to the human, because full
 * width is sometimes exactly what was wanted — meeting an unfamiliar
 * structure, or reading one puzzling row end to end.
 *
 * Failure mode — this hook fails OPEN, deliberately the opposite of the two
 * safety hooks beside it (block-forbidden-tables, tier-readonly-guard). Those
 * two protect data and systems, so a payload they cannot read has to stop the
 * call. This one protects a budget: when it cannot read the payload it says
 * nothing and the call proceeds. A cost hint that breaks must not become an
 * outage.
 */

// Nothing on stdin within this window is treated as nothing at all.
const STDIN_WAIT_MS = 1500;

// Comment syntax that can hide a field list from a first glance at the text.
// The line form wants its closing newline, so a comment running to the very end
// of the statement survives — harmless here, since the field list sits up front.
const LINE_COMMENT = /--[^\n]*\n/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

// A field list made of nothing but aggregate calls, each optionally aliased.
const AGGREGATES_ONLY = /^SELECT\s+(?:(?:COUNT|SUM|MIN|MAX|AVG)\s*\([^)]*\)(?:\s+AS\s+\w+)?\s*,?\s*)+FROM\b/i;

// `*`, or `<prefix>.*`, standing where the field list belongs — reached past the
// qualifiers that do not change what comes back.
//
// Recorded gap, held on purpose: the prefix here is dot notation, so the ABAP
// alias spelling `t~*` walks straight past this pattern. Widening it would move
// a judgment rather than fix a bug — `interactive/scripts/test-hook-decisions.mjs`
// pins today's answer for that spelling (allow) and would have to move with it.
const STAR_FIELD_LIST = /^SELECT(?:\s+(?:DISTINCT|SINGLE|TOP\s+\d+))*\s+(?:[A-Z0-9_~/]+\.)?\*(?:\s*,|\s+FROM\b)/i;

// Collect the PreToolUse payload from stdin. Settles on end, on error, or when
// the wait runs out — with whatever text had arrived. Never rejects, never hangs.
function readPayloadText() {
  return new Promise((settle) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      text += chunk;
    });
    process.stdin.on('end', () => settle(text));
    process.stdin.on('error', () => settle(text));
    setTimeout(() => settle(text), STDIN_WAIT_MS).unref?.();
  });
}

// The one decision this hook ever emits. The harness reads a single JSON object
// from stdout, so writing it is also the end of the run.
function askAndExit(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

// Silence is how this hook allows: no output, exit 0.
function allowAndExit() {
  process.exit(0);
}

/**
 * Does this statement's field list stand for "everything"?
 *
 * Only the head of the statement decides that, so the text is flattened first —
 * comments out, runs of whitespace down to a single space — and then read from
 * `SELECT` forward. Whatever cannot be recognized answers no, which is the
 * fail-open stance again: an uncertain hint is worse than no hint.
 */
function selectsEveryField(statement) {
  const flat = String(statement || '')
    .replace(LINE_COMMENT, ' ')
    .replace(BLOCK_COMMENT, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!/^SELECT\b/i.test(flat)) return false;
  if (AGGREGATES_ONLY.test(flat)) return false;
  return STAR_FIELD_LIST.test(flat);
}

async function main() {
  const text = await readPayloadText();
  if (!text) allowAndExit();

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    allowAndExit();
  }

  // Both key spellings turn up in practice; `arguments` is the older input key.
  const tool = payload.tool_name || payload.toolName || '';
  const args = payload.tool_input || payload.toolInput || payload.arguments || {};

  if (/GetTableContents/i.test(tool)) {
    const table = String(args.table_name || args.table || '').toUpperCase();
    askAndExit([
      'sc4sap policy — credit-saving guard:',
      `  GetTableContents${table ? `(${table})` : ''} takes no field list, so it returns every column.`,
      '',
      'Ask through GetSqlQuery instead and name the fields the answer needs:',
      `  SELECT field1, field2 FROM ${table || '<table>'} WHERE ... UP TO N ROWS`,
      '',
      'Approve the wide read only when the width is the point — a schema snapshot, or ' +
        'one unfamiliar row you need whole. Counting rows is COUNT(*); sampling is SELECT <fields>.',
    ].join('\n'));
  }

  if (/GetSqlQuery/i.test(tool)) {
    const statement = String(args.sql_query || args.sql || args.query || '');
    if (selectsEveryField(statement)) {
      askAndExit([
        'sc4sap policy — credit-saving guard:',
        '  Query uses SELECT * — every column of every matched row comes back.',
        '',
        'Name the fields the answer actually needs:',
        '  SELECT field1, field2, field3 FROM ... WHERE ... UP TO N ROWS',
        '',
        'Approve as written only if every column is genuinely required. Aggregate-only ' +
          'selects (COUNT/SUM/MIN/MAX/AVG) never reach this prompt.',
      ].join('\n'));
    }
  }

  allowAndExit();
}

main();
