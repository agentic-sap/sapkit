/**
 * GetAbapSystemSymbols — 의미 분석 결과의 심볼을 SAP에 물어 보강한다.
 *
 * ## 두 단계
 *
 * 1. `GetAbapSemanticAnalysis`와 **똑같은 분석기**를 돌린다. 구는 그 클래스를
 *    파일에 **통째로 복사해 두었는데**(`engine/src/handlers/system/readonly/handleGetAbapSystemSymbols.ts:106-456`
 *    대 `handleGetAbapSemanticAnalysis.ts:80-432`), 두 사본을 떠서 비교하면 **주석과
 *    타입 표기만 다르고 로직은 한 글자도 다르지 않다.** 그래서 여기서는 복사하지
 *    않고 `getAbapSemanticAnalysis`의 `analyzeAbap`을 그대로 부른다 — 복사본 둘이
 *    따로 낡는 것이 구가 겪던 문제다.
 * 2. 심볼 하나하나를 종류에 따라 다른 도구로 물어 `systemInfo`를 붙인다
 *    (`:458-739`).
 *
 * ## ⚠ 구의 「보강」은 대부분 아무것도 보강하지 못한다
 *
 * 읽어 보면 세 갈래 모두 실제 정보를 가져오지 못한다. 시험이 이 사실을 고정한다.
 *
 *  - **클래스** (`:525-588`) — `GetClass`를 부른 뒤 응답 JSON에서
 *    `description`·`packageName`·`superclass`를 찾는다. 그런데 `GetClass`가 싣는
 *    필드는 `success`·`class_name`·`version`·`source_code`·`status`·`status_text`
 *    뿐이다(구 `handleGetClass.ts:107-114`, 신 `getClass.ts`도 같은 여섯). 셋 다
 *    없으므로 **언제나 폴백**이 나간다 — `ABAP Class {이름}` · `Unknown` · `''`.
 *    실제로 확인되는 것은 "그 클래스를 읽을 수 있었다"(=`exists: true`)뿐이다.
 *  - **함수** (`:590-644`) — **두 겹으로 막혀 있다.**
 *    ⓐ 호출부가 `function_group_name`에 **빈 문자열을 하드코딩**한다(`:597`).
 *      그런데 `GetFunctionModule`은 이름 둘이 **모두** 있어야 하고, 없으면 SAP에
 *      닿기 전에 `return_error`로 돌아선다(구 `handleGetFunctionModule.ts:94-99`,
 *      신 `getFunctionModule.ts`도 같은 검사). 그래서 이 갈래는 `isError`에 걸려
 *      **언제나 `Function not found in SAP system`**이 되고, **SAP 왕복은 한 건도
 *      나가지 않는다.**
 *    ⓑ 설령 ⓐ를 통과해도 그다음 줄이 `'json' in contentItem`을 요구하는데 그
 *      핸들러는 `return_response`로 **언제나 `type: 'text'`**를 낸다
 *      (구 `handleGetFunctionModule.ts:152`). 즉 `Invalid response format from
 *      GetFunction` 갈래는 **도달 불가**다.
 *    호출 자체는 구와 같은 자리에서 그대로 한다 — 생략하면 와이어가 달라진다.
 *    다만 그 호출이 SAP까지 가지 않는다는 것이 위 ⓐ의 내용이다.
 *  - **그 밖의 종류** (`:712-738`) — SAP에 묻지 않고 `exists: false` +
 *    `objectType: 'LOCAL'`로 고정 응답을 만든다. 변수·상수·타입·메서드·폼·
 *    인클루드가 전부 여기로 온다.
 *
 * 즉 `systemResolutionStats.resolvedSymbols`는 사실상 **읽을 수 있었던 클래스의
 * 수**다. 이름이 약속하는 "해소된 심볼"이 아니다.
 *
 * ## ⚠ 인터페이스 갈래는 이 판에서 축소됐다
 *
 * 구는 `GetInterface`(`handlers/interface/high/`)를 부른다. 그 도구는 **아직 신
 * 엔진에 없다** — 이 묶음(system·common)의 범위 밖이다. 없는 도구의 와이어를 여기
 * 안에서 새로 지으면, 나중에 진짜 `GetInterface`가 지어질 때 두 벌이 갈린다.
 * 그래서 인터페이스 심볼은 `exists: false`에 무엇이 없는지 밝히는 문구를 달아
 * 돌려준다. 장부 등재분의 「GetAbapSystemSymbols의 인터페이스 보강」 항목 참조 —
 * `GetInterface`를 짓는 판에서 해소된다.
 *
 * ## 그 밖에 구를 그대로 옮긴 것
 *
 * - 심볼이 하나도 없으면 `resolutionRate`가 `0/0`이라 **`"NaN%"`**가 된다
 *   (`:493`). 0%로 고치지 않았다 — 문자열이 계약이다.
 * - 보강 중 예외는 심볼 단위로 삼켜 `systemInfo.error`에 담고 계속 간다(`:476-486`).
 *
 * ## 구와 다른 것 (등재된 차이)
 *
 * 구는 `{ type: 'json', json: result }`로 실었다(`:774-782`). 장부 D34 참조.
 * 실어 보내는 문자열은 **들여쓰기 2칸**으로 맞췄다 — 구가 같은 객체를 파일에 쓸
 * 때 쓰던 형태이고(`:788`), 그것이 이 도구가 남긴 유일한 직렬화 선례다.
 */

import * as z from 'zod';

import type { ToolContext, ToolResult } from '../../server/toolDefinition';
import { defineTool } from '../../server/toolDefinition';
import { writeResultToFile } from './getAbapAST';
import { analyzeAbap } from './getAbapSemanticAnalysis';
import type { SymbolInfo } from './getAbapSemanticAnalysis';
import { getClass } from './getClass';
import { getFunctionModule } from './getFunctionModule';
import { failure, ok } from './internal/results';

export interface SystemInfo {
  readonly exists: boolean;
  readonly objectType?: string;
  readonly description?: string;
  readonly package?: string;
  readonly responsible?: string;
  readonly lastChanged?: string;
  readonly sapRelease?: string;
  readonly techName?: string;
  readonly methods?: string[];
  readonly interfaces?: string[];
  readonly superClass?: string;
  readonly attributes?: string[];
  readonly error?: string;
}

export interface ResolvedSymbol extends SymbolInfo {
  readonly systemInfo?: SystemInfo;
}

/** 도구 응답의 첫 콘텐츠 블록을 JSON으로 푼다. 못 풀면 빈 객체다(구와 같다). */
function firstBlockAsJson(result: ToolResult): Record<string, any> {
  const item = result.content[0];
  if (!item) return {};
  try {
    return JSON.parse(item.text) as Record<string, any>;
  } catch {
    return {};
  }
}

/** 응답이 「쓸 수 없다」고 볼 조건 — 구의 세 갈래 공통(`:534-539` 등). */
const unusable = (result: ToolResult): boolean =>
  !result || result.isError || !result.content || result.content.length === 0;

async function resolveClassSymbol(
  context: ToolContext,
  symbol: SymbolInfo,
): Promise<ResolvedSymbol> {
  try {
    const result = await getClass.handler(context, { class_name: symbol.name });
    if (unusable(result)) {
      return { ...symbol, systemInfo: { exists: false, error: 'Class not found in SAP system' } };
    }
    const data = firstBlockAsJson(result);
    return {
      ...symbol,
      systemInfo: {
        exists: true,
        objectType: 'CLAS',
        // 아래 셋은 GetClass가 싣지 않는 필드라 **언제나 폴백**이다.
        description: data?.description || `ABAP Class ${symbol.name}`,
        package: data?.packageName || 'Unknown',
        superClass: data?.superclass || '',
      },
    };
  } catch (error) {
    return {
      ...symbol,
      systemInfo: { exists: false, error: error instanceof Error ? error.message : String(error) },
    };
  }
}

async function resolveFunctionSymbol(
  context: ToolContext,
  symbol: SymbolInfo,
): Promise<ResolvedSymbol> {
  try {
    // 구는 함수그룹 자리에 빈 문자열을 넘긴다(`:597`).
    const result = await getFunctionModule.handler(context, {
      function_module_name: symbol.name,
      function_group_name: '',
    });
    if (unusable(result)) {
      return {
        ...symbol,
        systemInfo: { exists: false, error: 'Function not found in SAP system' },
      };
    }
    // **도달 불가 갈래다.** 위 `unusable`이 빈 함수그룹 이름 때문에 언제나 참이라
    // 여기까지 오지 않고, 설령 온다 해도 구는 `'json' in contentItem`을 요구하는데
    // 그 도구는 언제나 text를 낸다. 구가 적어 둔 문구를 그대로 옮겨 둔다.
    return {
      ...symbol,
      systemInfo: { exists: false, error: 'Invalid response format from GetFunction' },
    };
  } catch (error) {
    return {
      ...symbol,
      systemInfo: { exists: false, error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** `GetInterface`가 아직 없다 — 축소분. 위 머리주석과 장부 항목 참조. */
function resolveInterfaceSymbol(symbol: SymbolInfo): ResolvedSymbol {
  return {
    ...symbol,
    systemInfo: {
      exists: false,
      objectType: 'INTF',
      error:
        'Interface resolution is not available yet: this engine does not implement GetInterface. See harness/DIVERGENCES.md.',
    },
  };
}

/** 구 `resolveGenericSymbol`(`:712-738`) — SAP에 묻지 않는다. */
function resolveGenericSymbol(symbol: SymbolInfo): ResolvedSymbol {
  return {
    ...symbol,
    systemInfo: {
      exists: false,
      objectType: 'LOCAL',
      description: `Local ${symbol.type} ${symbol.name}`,
      package: 'LOCAL',
      error: 'No system resolution available for this symbol type',
    },
  };
}

export const getAbapSystemSymbols = defineTool(
  {
    name: 'GetAbapSystemSymbols',
    description:
      '[read-only] Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.',
    inputSchema: {
      code: z.string().describe('ABAP source code to analyze and resolve symbols for'),
      filePath: z.string().optional().describe('Optional file path to write the result to'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args.code) {
        return failure('MCP error -32602: ABAP code is required');
      }
      context.logger.debug('Running semantic analysis and system symbol resolution');

      const analysis = analyzeAbap(args.code);

      const resolved: ResolvedSymbol[] = [];
      let resolvedCount = 0;
      let failedCount = 0;

      for (const symbol of analysis.symbols) {
        let entry: ResolvedSymbol;
        try {
          switch (symbol.type) {
            case 'class':
              entry = await resolveClassSymbol(context, symbol);
              break;
            case 'function':
              entry = await resolveFunctionSymbol(context, symbol);
              break;
            case 'interface':
              entry = resolveInterfaceSymbol(symbol);
              break;
            default:
              entry = resolveGenericSymbol(symbol);
              break;
          }
        } catch (error) {
          // 심볼 하나가 터져도 목록 전체가 죽지 않는다.
          entry = {
            ...symbol,
            systemInfo: {
              exists: false,
              error: error instanceof Error ? error.message : String(error),
            },
          };
        }
        resolved.push(entry);
        if (entry.systemInfo?.exists) resolvedCount += 1;
        else failedCount += 1;
      }

      const stats = {
        totalSymbols: analysis.symbols.length,
        resolvedSymbols: resolvedCount,
        failedSymbols: failedCount,
        // 심볼이 없으면 0/0이라 "NaN%"가 된다. 구 그대로다.
        resolutionRate: `${((resolvedCount / analysis.symbols.length) * 100).toFixed(1)}%`,
      };

      context.logger.info(
        `Resolved ${stats.resolvedSymbols}/${stats.totalSymbols} symbols from system`,
      );

      const result = {
        symbols: resolved,
        dependencies: analysis.dependencies,
        errors: analysis.errors,
        scopes: analysis.scopes,
        systemResolutionStats: stats,
      };
      const text = JSON.stringify(result, null, 2);

      if (args.filePath) {
        context.logger.debug(`Writing system symbol resolution result to file: ${args.filePath}`);
        writeResultToFile(text, args.filePath);
      }

      return ok(text);
    } catch (error) {
      context.logger.error('Failed to resolve ABAP system symbols');
      return failure(error instanceof Error ? error.message : String(error));
    }
  },
);
