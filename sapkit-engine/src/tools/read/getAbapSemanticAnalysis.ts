/**
 * GetAbapSemanticAnalysis — ABAP 소스에서 심볼·스코프·의존을 줄 단위로 훑어 낸다.
 *
 * **SAP에 붙지 않는다.** 구 핸들러
 * (`engine/src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts:434-478`)도
 * `connection`을 구조분해만 하고 부르지 않는다. 그래서
 * `context.getConnection()`을 호출하지 않으며 무프로파일에서도 답한다.
 *
 * ## 이름이 약속하는 것보다 훨씬 적게 한다 (구를 그대로 옮긴 것)
 *
 * 클래스 이름이 `SimpleAbapSemanticAnalyzer`이고 주석이 밝히듯(`:79`) **ANTLR
 * 파서가 아니다.** 줄을 하나씩 `trim()`한 뒤 정규식 열두 개를 차례로 물리는
 * 근사치이며, 진짜 의미 분석이 아니다. "개선"하지 않고 그대로 옮겼다.
 *
 * 그래서 다음 어긋남이 **구에서 그대로 넘어온다**(결함이 아니라 이식 대상):
 *
 *  - **`visibility`가 섹션을 보지 않는다.** `extractVisibility`(`:383-388`)는 **그
 *    줄에** `private`/`protected`라는 글자가 있는지만 본다. `PRIVATE SECTION.`
 *    아래에 선언된 `DATA`도 그 줄에 그 낱말이 없으므로 **`public`**이 된다.
 *  - **`extractDataType`이 `TYPE REF TO`를 잘못 읽는다**(`:390-404`). 후보 셋을
 *    순서대로 보는데 첫 번째가 `/type\s+(\w+)/`라, `TYPE REF TO zcl_x`에서
 *    클래스 이름이 아니라 **`REF`**를 돌려준다. 세 번째에 있는 `ref to` 패턴은
 *    영영 닿지 않는다.
 *  - **스코프 되돌리기가 이름으로 찾는다**(`popScope`, `:368-381`). 같은 이름의
 *    스코프가 둘이면 앞의 것이 잡힌다.
 *  - 문자열 리터럴 안의 낱말도 가린다. 어휘 분석이 없다.
 *  - 한 줄이 여러 분석기에 동시에 걸릴 수 있다 — 구는 열두 개를 **전부** 물린다.
 *
 * ## 옮긴 자리
 *
 * 분석기 열둘과 그 호출 순서는 `:114-150`, 각 정규식은 `:152-345`, 스코프
 * 밀기/되돌리기는 `:351-381`, 보조 셋은 `:383-431`이다. 주석·빈 줄 건너뛰기
 * 조건(`''`·`*`·`"` 로 시작)은 `:123-125`.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { writeResultToFile } from './getAbapAST';
import { failure, ok } from './internal/results';

export type SymbolKind =
  | 'class' | 'method' | 'function' | 'variable' | 'constant' | 'type'
  | 'interface' | 'form' | 'program' | 'report' | 'include';

export type Visibility = 'public' | 'protected' | 'private';

export interface ParameterInfo {
  readonly name: string;
  readonly type: 'importing' | 'exporting' | 'changing' | 'returning';
  readonly dataType?: string;
  readonly optional?: boolean;
  readonly defaultValue?: string;
}

export interface SymbolInfo {
  readonly name: string;
  readonly type: SymbolKind;
  readonly scope: string;
  readonly line: number;
  readonly column: number;
  readonly description?: string;
  readonly package?: string;
  readonly visibility?: Visibility;
  readonly dataType?: string;
  readonly parameters?: ParameterInfo[];
}

export interface ScopeInfo {
  readonly name: string;
  readonly type: 'global' | 'class' | 'method' | 'form' | 'function' | 'local';
  readonly startLine: number;
  endLine: number;
  readonly parent?: string;
}

export interface ParseError {
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly severity: 'error' | 'warning' | 'info';
}

export interface SemanticAnalysis {
  readonly symbols: SymbolInfo[];
  readonly dependencies: string[];
  readonly errors: ParseError[];
  readonly scopes: ScopeInfo[];
}

/** 구 `extractVisibility`(`:383-388`) — **그 줄만** 본다. 섹션은 보지 않는다. */
function extractVisibility(line: string): Visibility {
  const lower = line.toLowerCase();
  if (lower.includes('private')) return 'private';
  if (lower.includes('protected')) return 'protected';
  return 'public';
}

/**
 * 구 `extractDataType`(`:390-404`).
 *
 * 후보 순서가 곧 결과다 — `TYPE REF TO zcl_x`는 첫 후보에 걸려 **`REF`**가 된다.
 * 세 번째 후보(`type ref to`)는 도달 불가다. 구 그대로 둔다.
 */
function extractDataType(line: string): string | undefined {
  const lower = line.toLowerCase();
  const candidates = [
    lower.match(/type\s+([a-zA-Z0-9_]+)/),
    lower.match(/like\s+([a-zA-Z0-9_]+)/),
    lower.match(/type\s+ref\s+to\s+([a-zA-Z0-9_]+)/),
  ];
  for (const match of candidates) {
    if (match) return (match[1] ?? '').toUpperCase();
  }
  return undefined;
}

/** 구 `extractMethodParameters`(`:406-431`) — 종류마다 **첫 일치 하나만** 본다. */
function extractMethodParameters(line: string): ParameterInfo[] {
  const parameters: ParameterInfo[] = [];
  const kinds = ['importing', 'exporting', 'changing', 'returning'] as const;

  for (const kind of kinds) {
    const regex = new RegExp(`${kind}\\s+([a-zA-Z0-9_\\s,]+)`, 'gi');
    const match = regex.exec(line);
    if (!match) continue;
    for (const raw of (match[1] ?? '').split(',')) {
      const name = raw.trim();
      if (!name) continue;
      parameters.push({
        name: name.toUpperCase(),
        type: kind,
        // 줄 어디에든 `optional`이 있으면 전부 optional이 된다. 구 그대로다.
        optional: line.toLowerCase().includes('optional'),
      });
    }
  }
  return parameters;
}

/** 구 `SimpleAbapSemanticAnalyzer`(`:80-432`)를 함수 하나로 다시 저작했다. */
export function analyzeAbap(code: string): SemanticAnalysis {
  const symbols: SymbolInfo[] = [];
  const scopes: ScopeInfo[] = [];
  const dependencies: string[] = [];
  const errors: ParseError[] = [];
  let currentScope = 'global';

  const pushScope = (name: string, type: ScopeInfo['type'], startLine: number): void => {
    scopes.push({
      name,
      type,
      startLine,
      // 되돌릴 때 채워진다. 끝내 안 닫히면 시작 줄로 남는다.
      endLine: startLine,
      parent: currentScope !== 'global' ? currentScope : undefined,
    });
    currentScope = name;
  };

  const popScope = (endLine: number): void => {
    // **이름으로** 찾는다 — 같은 이름이 둘이면 앞의 것이 잡힌다(구 그대로).
    const current = scopes.find((scope) => scope.name === currentScope);
    if (current) current.endLine = endLine;
    const parent = scopes.find((scope) => scope.name === current?.parent);
    currentScope = parent?.name || 'global';
  };

  try {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim();
      const lineNumber = i + 1;
      // 빈 줄과 주석은 건너뛴다.
      if (line === '' || line.startsWith('*') || line.startsWith('"')) continue;

      const lower = line.toLowerCase();
      try {
        // 구는 열두 분석기를 **전부** 물린다 — 한 줄이 여럿에 걸릴 수 있다.

        const classDef = lower.match(/^class\s+([a-zA-Z0-9_]+)\s+definition/);
        if (classDef) {
          const name = (classDef[1] ?? '').toUpperCase();
          symbols.push({
            name,
            type: 'class',
            scope: currentScope,
            line: lineNumber,
            column: 1,
            visibility: extractVisibility(line),
          });
          pushScope(name, 'class', lineNumber);
        }

        const classImpl = lower.match(/^class\s+([a-zA-Z0-9_]+)\s+implementation/);
        if (classImpl) {
          // 구현부는 심볼을 만들지 않고 스코프만 연다. 이름에 `_IMPL`이 붙는다.
          pushScope(`${(classImpl[1] ?? '').toUpperCase()}_IMPL`, 'class', lineNumber);
        }

        const methodDef = lower.match(/^(methods|class-methods)\s+([a-zA-Z0-9_]+)/);
        if (methodDef) {
          symbols.push({
            name: (methodDef[2] ?? '').toUpperCase(),
            type: 'method',
            scope: currentScope,
            line: lineNumber,
            column: 1,
            visibility: extractVisibility(line),
            description: methodDef[1] === 'class-methods' ? 'Static method' : 'Instance method',
            parameters: extractMethodParameters(line),
          });
        }

        const methodImpl = lower.match(/^method\s+([a-zA-Z0-9_~\->]+)/);
        if (methodImpl) {
          pushScope((methodImpl[1] ?? '').toUpperCase(), 'method', lineNumber);
        }

        // DATA · CLASS-DATA · STATICS는 같은 갈래로 접힌다. 첫 일치에서 멈춘다.
        const dataMatch =
          lower.match(/^data:?\s+([a-zA-Z0-9_]+)/) ??
          lower.match(/^class-data:?\s+([a-zA-Z0-9_]+)/) ??
          lower.match(/^statics:?\s+([a-zA-Z0-9_]+)/);
        if (dataMatch) {
          symbols.push({
            name: (dataMatch[1] ?? '').toUpperCase(),
            type: 'variable',
            scope: currentScope,
            line: lineNumber,
            column: 1,
            dataType: extractDataType(line),
            visibility: extractVisibility(line),
          });
        }

        const constantMatch = lower.match(/^constants:?\s+([a-zA-Z0-9_]+)/);
        if (constantMatch) {
          symbols.push({
            name: (constantMatch[1] ?? '').toUpperCase(),
            type: 'constant',
            scope: currentScope,
            line: lineNumber,
            column: 1,
            dataType: extractDataType(line),
            visibility: extractVisibility(line),
          });
        }

        const typeMatch = lower.match(/^types:?\s+([a-zA-Z0-9_]+)/);
        if (typeMatch) {
          symbols.push({
            name: (typeMatch[1] ?? '').toUpperCase(),
            type: 'type',
            scope: currentScope,
            line: lineNumber,
            column: 1,
            dataType: extractDataType(line),
            visibility: extractVisibility(line),
          });
        }

        const formMatch = lower.match(/^form\s+([a-zA-Z0-9_]+)/);
        if (formMatch) {
          const name = (formMatch[1] ?? '').toUpperCase();
          symbols.push({ name, type: 'form', scope: currentScope, line: lineNumber, column: 1 });
          pushScope(name, 'form', lineNumber);
        }

        const functionMatch = lower.match(/^function\s+([a-zA-Z0-9_]+)/);
        if (functionMatch) {
          const name = (functionMatch[1] ?? '').toUpperCase();
          symbols.push({ name, type: 'function', scope: currentScope, line: lineNumber, column: 1 });
          pushScope(name, 'function', lineNumber);
        }

        const includeMatch = lower.match(/^include\s+([a-zA-Z0-9_/<>]+)/);
        if (includeMatch) {
          const name = (includeMatch[1] ?? '').toUpperCase();
          dependencies.push(name);
          symbols.push({ name, type: 'include', scope: currentScope, line: lineNumber, column: 1 });
        }

        const interfaceMatch = lower.match(/^interface\s+([a-zA-Z0-9_]+)/);
        if (interfaceMatch) {
          const name = (interfaceMatch[1] ?? '').toUpperCase();
          symbols.push({
            name,
            type: 'interface',
            scope: currentScope,
            line: lineNumber,
            column: 1,
            visibility: extractVisibility(line),
          });
          // 인터페이스는 클래스 스코프처럼 다룬다 — 구의 주석이 그렇게 밝힌다.
          pushScope(name, 'class', lineNumber);
        }

        // 스코프를 닫는 줄은 **그 낱말 하나(+마침표)로만** 이뤄져야 한다.
        if (lower.match(/^(endclass|endmethod|endform|endfunction|endinterface)\.?$/)) {
          popScope(lineNumber);
        }
      } catch (error) {
        errors.push({
          message: `Error analyzing line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
          line: lineNumber,
          column: 1,
          severity: 'warning',
        });
      }
    }
  } catch (error) {
    errors.push({
      message: error instanceof Error ? error.message : String(error),
      line: 1,
      column: 1,
      severity: 'error',
    });
  }

  return { symbols, dependencies, errors, scopes };
}

export const getAbapSemanticAnalysis = defineTool(
  {
    name: 'GetAbapSemanticAnalysis',
    description:
      '[read-only] Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies.',
    inputSchema: {
      code: z.string().describe('ABAP source code to analyze'),
      filePath: z.string().optional().describe('Optional file path to write the result to'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args.code) {
        // 구는 McpError의 message를 그대로 실었다 — SDK 접두사가 계약의 일부다.
        return failure('MCP error -32602: ABAP code is required');
      }
      context.logger.debug('Running semantic analysis for provided ABAP code');

      const analysis = analyzeAbap(args.code);
      const text = JSON.stringify(analysis, null, 2);

      if (args.filePath) {
        context.logger.debug(`Writing semantic analysis result to file: ${args.filePath}`);
        writeResultToFile(text, args.filePath);
      }

      return ok(text);
    } catch (error) {
      context.logger.error('Failed to perform ABAP semantic analysis');
      return failure(error instanceof Error ? error.message : String(error));
    }
  },
);
