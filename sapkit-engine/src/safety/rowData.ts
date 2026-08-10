/**
 * The always-on gate in front of the two row-returning tools.
 *
 * `GetTableContents` and `GetSqlQuery` are the only tools that hand back real
 * business rows, and they are **not gated by exposure** — they sit in the
 * read-only surface, so hiding write tools does nothing to them. This module is
 * therefore the one place where a row extraction is judged, and every path into
 * those two tools goes through it.
 *
 * One entry point folds three inputs into one verdict:
 *   - the **tier gate**, run exactly as it is for any other tool;
 *   - the **table blocklist**, including its ask tier;
 *   - the **allow list** (`MCP_ALLOW_TABLE`), which is exact and audited.
 *
 * It refuses before any connection is opened, so a refused call never becomes a
 * request to SAP. The tools themselves are built elsewhere; what they must do
 * is call this first and honour its answer.
 */

import type { SapTier, ToolPolicyKind } from '../contracts';
import {
  type BlocklistConfig,
  evaluateTables,
  readBlocklistConfig,
} from './blocklist';
import { extractTablesFromSql, isAggregateOnly, sqlHasTableSource } from './sql';
import { checkTierAllowed } from './tier';

/** The complete set of row-returning tools. */
export const ROW_DATA_TOOLS = ['GetTableContents', 'GetSqlQuery'] as const;
export type RowDataTool = (typeof ROW_DATA_TOOLS)[number];

export function isRowDataTool(name: string): name is RowDataTool {
  return (ROW_DATA_TOOLS as readonly string[]).includes(name);
}

export interface RowDataRequest {
  readonly tool: RowDataTool;
  /** `GetTableContents` — the table being previewed. */
  readonly tableName?: string;
  /** `GetSqlQuery` — the statement being run. */
  readonly sql?: string;
  /** Set only after a human authorized an ask-tier extraction. */
  readonly acknowledgeRisk?: boolean;
}

export interface RowDataContext {
  readonly tier: SapTier;
  /** Defaults to the locked built-in configuration. */
  readonly config?: BlocklistConfig;
  /**
   * The class the registry declares for this tool. Supplied so the entry point
   * runs the same tier gate as every other call, and so a re-classification is
   * honoured here too rather than being hardcoded.
   */
  readonly toolKind?: ToolPolicyKind;
}

export type RowDataDenyCode =
  /** The tier gate refused the call. */
  | 'ERR_READONLY_TIER'
  /** A protected table — refused outright. */
  | 'ERR_ROWDATA_BLOCKED'
  /** An ask-tier table with no acknowledgement. */
  | 'ERR_ROWDATA_CONFIRM'
  /** A table source exists but could not be parsed — refused, fail-closed. */
  | 'ERR_ROWDATA_UNPARSEABLE'
  /** The call carries nothing to judge. */
  | 'ERR_ROWDATA_ARGS';

export type RowDataDecision =
  | {
      readonly kind: 'allow';
      /** Tables the call was judged against. */
      readonly tables: string[];
      /** Lines the caller must write to its audit channel. */
      readonly audit: string[];
    }
  | { readonly kind: 'deny'; readonly code: RowDataDenyCode; readonly message: string };

export function evaluateRowDataRequest(
  request: RowDataRequest,
  context: RowDataContext,
): RowDataDecision {
  const kind: ToolPolicyKind = context.toolKind ?? 'row-data';
  const tier = checkTierAllowed({ name: request.tool, kind }, context.tier);
  if (!tier.allowed) {
    return {
      kind: 'deny',
      code: 'ERR_READONLY_TIER',
      message: `ERR_READONLY_TIER: ${tier.reason} Active profile tier=${context.tier}.`,
    };
  }

  const candidates = collectTables(request);
  if (candidates.kind === 'deny') return candidates.decision;

  const config = context.config ?? readBlocklistConfig();
  const { verdict, audit } = evaluateTables(
    candidates.tables,
    config,
    request.acknowledgeRisk === true,
  );

  switch (verdict.kind) {
    case 'deny':
      return { kind: 'deny', code: 'ERR_ROWDATA_BLOCKED', message: verdict.message };
    case 'ask':
      return { kind: 'deny', code: 'ERR_ROWDATA_CONFIRM', message: verdict.message };
    case 'approved':
      return {
        kind: 'allow',
        tables: candidates.tables,
        audit: [
          ...audit,
          `AUDIT: user-acknowledged ${request.tool} on ${verdict.tables.join(',')}`,
        ],
      };
    default:
      return { kind: 'allow', tables: candidates.tables, audit };
  }
}

type Candidates =
  | { readonly kind: 'tables'; readonly tables: string[] }
  | { readonly kind: 'deny'; readonly decision: RowDataDecision };

/**
 * Reduce a request to the table names the blocklist should judge.
 *
 * An empty list means "nothing to judge" and is only reached when the request
 * genuinely references no table source; a statement that references one but
 * cannot be parsed is refused here instead.
 */
function collectTables(request: RowDataRequest): Candidates {
  if (request.tool === 'GetTableContents') {
    const table = (request.tableName ?? '').trim();
    if (!table) {
      return {
        kind: 'deny',
        decision: {
          kind: 'deny',
          code: 'ERR_ROWDATA_ARGS',
          message:
            'GetTableContents was called without a table name, so the protected-table gate cannot evaluate it; the call is refused (fail-closed).',
        },
      };
    }
    return { kind: 'tables', tables: [table.toUpperCase()] };
  }

  const sql = (request.sql ?? '').trim();
  if (!sql) {
    return {
      kind: 'deny',
      decision: {
        kind: 'deny',
        code: 'ERR_ROWDATA_ARGS',
        message:
          'GetSqlQuery was called without a statement, so the protected-table gate cannot evaluate it; the call is refused (fail-closed).',
      },
    };
  }

  const tables = extractTablesFromSql(sql);
  if (tables.length === 0) {
    if (sqlHasTableSource(sql)) {
      return {
        kind: 'deny',
        decision: {
          kind: 'deny',
          code: 'ERR_ROWDATA_UNPARSEABLE',
          message:
            'sapkit blocklist — no table name could be extracted from this query, so the protected-table gate cannot evaluate it; the query is refused (fail-closed). Rewrite it with a plain `FROM <table>` reference — one table per FROM/JOIN, no comment between FROM and the name.',
        },
      };
    }
    return { kind: 'tables', tables: [] };
  }

  // A pure aggregate returns no row-level values, so it is judged exempt.
  if (isAggregateOnly(sql)) return { kind: 'tables', tables: [] };

  return { kind: 'tables', tables };
}
