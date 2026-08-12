/**
 * Safety layer — exposure, tier gate, table blocklist, row-data gate.
 *
 * Exposure decides what is *visible*; the tier gate and the blocklist decide
 * what is *allowed*. They are not the same axis, and the visible surface is
 * never the safety story: the two row-returning tools are visible on every
 * surface and are gated here instead.
 */

export {
  type BlocklistAction,
  type BlocklistConfig,
  type BlocklistHit,
  type BlocklistLevel,
  type BlocklistProfileName,
  type BlocklistResult,
  type BlocklistVerdict,
  DEFAULT_BLOCKLIST_PROFILE,
  checkTables,
  evaluateTables,
  readBlocklistConfig,
  resolveSafetyEnv,
} from './blocklist';
export {
  DEFAULT_EXPOSITION,
  type ExposableTool,
  type ExpositionResolution,
  type ExposureQuery,
  expositionFromArgv,
  expositionFromArgvDetailed,
  parseExposition,
  parseExpositionDetailed,
  resolveActiveSets,
  selectExposedTools,
} from './exposition';
export {
  ROW_DATA_TOOLS,
  type RowDataContext,
  type RowDataDecision,
  type RowDataDenyCode,
  type RowDataRequest,
  type RowDataTool,
  evaluateRowDataRequest,
  isRowDataTool,
} from './rowData';
export {
  extractTablesFromSql,
  isAggregateOnly,
  sqlHasTableSource,
  stripSqlComments,
} from './sql';
export {
  SERVER_CONTROL_TOOLS,
  TierBlockedError,
  type TierDecision,
  type TierGatedTool,
  UNIT_TEST_EXECUTION_TOOLS,
  assertTierAllowed,
  checkTierAllowed,
} from './tier';
export { type UnsafeFlagInput, resolveUnsafeFlag } from './unsafe';
