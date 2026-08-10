/**
 * 게이트 배선 — 이미 지어진 판정기들을 **한 자리에서** 순서대로 부른다.
 *
 * 판정 논리는 전부 `src/safety/`에 있다. 이 모듈은 논리를 다시 쓰지 않고
 * **부르는 자리**만 만든다. 그 자리가 어디냐가 이 파일의 전부다:
 *
 *   구 엔진의 실증 결함(GAP-1)은 판정기가 틀린 것이 아니라 **아무도 부르지
 *   않은 것**이었다. `readonlyGuard.guardTool()`이 어떤 서버도 지나지 않는
 *   등록 경로에만 걸려 있어서, QA·PRD·tier 미해석 어느 쪽에서도 write 호출이
 *   SAP까지 도달했다(`interactive/scripts/conformance-server-gates.mjs` 43-51행).
 *   그래서 여기는 **접속을 얻기 전에** 지나야 하는 유일한 관문이다.
 *
 * 순서:
 *   1. tier 게이트 — 모든 도구가 예외 없이 지난다.
 *   2. 실데이터 2종 — 노출로는 막히지 않으므로 호출 시점에 한 번 더 지난다.
 *
 * 감사 문구는 **반환값으로** 올린다. 여기서 stderr에 직접 쓰지 않는다 —
 * 출력 스트림의 주인은 서버다.
 */

import type { BlocklistConfig, RowDataDenyCode } from '../safety';
import {
  TierBlockedError,
  assertTierAllowed,
  evaluateRowDataRequest,
  isRowDataTool,
} from '../safety';
import type { SapTier, ToolPolicyKind } from '../contracts';

/**
 * 실데이터 2종의 인자 이름 — **구 엔진의 계약 그대로**다
 * (`handleGetTableContents.ts:17-29` · `handleGetSqlQuery.ts:19-39`).
 * 게이트가 인자를 읽어야 하므로 여기 고정한다. 도구 저자는 이 이름을 바꾸지
 * 않는다(spec §2.1 — 개명 금지).
 */
export const ROW_DATA_ARGS = {
  tableName: 'table_name',
  sql: 'sql_query',
  acknowledgeRisk: 'acknowledge_risk',
} as const;

export interface GatedTool {
  readonly name: string;
  readonly kind: ToolPolicyKind;
}

export interface GateContext {
  readonly tier: SapTier;
  readonly blocklist: BlocklistConfig;
}

export type GateDenyCode = 'ERR_READONLY_TIER' | RowDataDenyCode;

export type GateDecision =
  | { readonly kind: 'allow'; readonly audit: string[] }
  | {
      readonly kind: 'deny';
      readonly code: GateDenyCode;
      readonly message: string;
      /** 거부 갈래에도 감사 문구가 실린다 — 우회는 판정보다 먼저 일어난다. */
      readonly audit: string[];
    };

function readString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

export function evaluateToolCall(
  tool: GatedTool,
  args: Record<string, unknown>,
  context: GateContext,
): GateDecision {
  // ① tier. 예외 없이 모든 도구가 지난다.
  try {
    assertTierAllowed(tool, context.tier);
  } catch (error) {
    if (!(error instanceof TierBlockedError)) throw error;
    return { kind: 'deny', code: 'ERR_READONLY_TIER', message: error.message, audit: [] };
  }

  // ② 실데이터 2종. 노출은 이 둘을 숨기지 않으므로 매 호출이 지난다.
  if (isRowDataTool(tool.name)) {
    const decision = evaluateRowDataRequest(
      {
        tool: tool.name,
        ...(readString(args, ROW_DATA_ARGS.tableName) !== undefined
          ? { tableName: readString(args, ROW_DATA_ARGS.tableName) as string }
          : {}),
        ...(readString(args, ROW_DATA_ARGS.sql) !== undefined
          ? { sql: readString(args, ROW_DATA_ARGS.sql) as string }
          : {}),
        acknowledgeRisk: args[ROW_DATA_ARGS.acknowledgeRisk] === true,
      },
      { tier: context.tier, config: context.blocklist, toolKind: tool.kind },
    );
    if (decision.kind === 'deny') {
      return {
        kind: 'deny',
        code: decision.code,
        message: decision.message,
        audit: [...decision.audit],
      };
    }
    return { kind: 'allow', audit: [...decision.audit] };
  }

  return { kind: 'allow', audit: [] };
}
