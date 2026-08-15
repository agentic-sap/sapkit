/**
 * GetAbapAST — ABAP 소스를 훑어 구조 요약을 JSON으로 돌려준다.
 *
 * **SAP에 붙지 않는다.** 구 핸들러
 * (`engine/src/handlers/system/readonly/handleGetAbapAST.ts:162-201`)도 접속을
 * 꺼내 쓰지 않는다 — `context`에서 `connection`을 구조분해하지만 한 번도 부르지
 * 않는다. 그래서 이 도구는 `context.getConnection()`을 **호출하지 않으며**,
 * 무프로파일 기동에서도 답한다. 구와 같다.
 *
 * ## 이름이 약속하는 것보다 훨씬 적게 한다 (구를 그대로 옮긴 것)
 *
 * 클래스 이름이 `SimpleAbapASTGenerator`이고 주석이 밝히듯
 * (`handleGetAbapAST.ts:25-30`) **ANTLR 파서가 아니다.** 줄 단위 접두사 검사와
 * 정규식 몇 개로 만든 근사치이며, 진짜 구문 트리가 아니다. 이식하면서
 * "개선"하지 않았다 — 응답 형태를 바꾸지 않는 것이 이 판의 규칙이고, 근사치가
 * 답이라는 사실 자체가 호출자에게 계약이다.
 *
 * 그래서 다음 어긋남이 **구에서 그대로 넘어온다**(결함이 아니라 이식 대상):
 *  - `findMethods`의 정규식이 `methods?`라 `METHOD`와 `METHODS` 둘 다 잡는다.
 *  - `findForms`와 `analyzeStructures`가 같은 `FORM`을 각각 센다.
 *  - 주석·문자열 리터럴 안의 낱말도 가린다. 어휘 분석이 없다.
 *  - `findIncludes`는 `INCLUDE` 문뿐 아니라 `include`가 든 아무 낱말이나 잡는다.
 *
 * ## 정규식과 순회를 구에서 글자 그대로 옮긴 자리
 *
 *  - `analyzeStructures` — `handleGetAbapAST.ts:52-87`. 줄을 `trim().toLowerCase()`
 *    한 뒤 `'class '`·`'method '`·`'form '`·`'function '` 접두사를 본다.
 *    `line`은 **1부터**이고 `content`는 소문자화 이전의 `lines[i].trim()`이다.
 *  - `findIncludes` — `:89-93`. `/include\s+([a-zA-Z0-9_/<>]+)/gi`로 **전체 일치**를
 *    모은 뒤 앞머리 `include\s+`를 떼어 낸다(`String.match`+`replace`).
 *  - `findClasses` — `:95-111`. `type`은 `definition`·`implementation`을 소문자로.
 *  - `findMethods`·`findDataDeclarations`·`findForms` — `:113-159`. 셋 다
 *    `{ name, position }`이고 `position`은 `match.index`(문자 오프셋)다.
 *
 * `position`이 줄 번호가 아니라 문자 오프셋인 것도 구 그대로다.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { ok, failure } from './internal/results';

interface StructureEntry {
  readonly type: string;
  readonly line: number;
  readonly content: string;
}

interface NamedAt {
  readonly name: string;
  readonly position: number;
}

interface ClassEntry extends NamedAt {
  readonly type: string;
}

export interface AbapAst {
  readonly type: 'abapSource';
  readonly sourceLength: number;
  readonly lineCount: number;
  readonly structures: StructureEntry[];
  readonly includes: string[];
  readonly classes: ClassEntry[];
  readonly methods: NamedAt[];
  readonly dataDeclarations: NamedAt[];
  readonly forms: NamedAt[];
}

/** 접두사 하나당 구조 종류 하나. 구의 if/else 사슬과 같은 순서다. */
const STRUCTURE_PREFIXES: readonly (readonly [string, string])[] = [
  ['class ', 'class'],
  ['method ', 'method'],
  ['form ', 'form'],
  ['function ', 'function'],
];

function analyzeStructures(code: string): StructureEntry[] {
  const structures: StructureEntry[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.trim().toLowerCase();
    const hit = STRUCTURE_PREFIXES.find(([prefix]) => line.startsWith(prefix));
    // 구는 첫 번째로 맞는 갈래에서 멈춘다(else if 사슬) — `find`가 그 뜻이다.
    if (hit !== undefined) {
      structures.push({ type: hit[1], line: i + 1, content: raw.trim() });
    }
  }

  return structures;
}

/**
 * `String.prototype.match`에 `/g`를 주면 **캡처가 아니라 전체 일치**가 온다.
 * 구는 그 전체 일치에서 앞머리를 떼어 이름을 얻었다 — 캡처 그룹을 쓰지 않은
 * 것이 그 함수의 실제 동작이므로 그대로 옮긴다.
 */
function findIncludes(code: string): string[] {
  const matches = code.match(/include\s+([a-zA-Z0-9_/<>]+)/gi) ?? [];
  return matches.map((match) => match.replace(/include\s+/i, '').trim());
}

/** `/g` 정규식을 `exec`로 돌리며 `{name, position}`을 모으는 공통 골격. */
function collectNamed(code: string, pattern: RegExp): NamedAt[] {
  const out: NamedAt[] = [];
  let match: RegExpExecArray | null = pattern.exec(code);
  while (match !== null) {
    out.push({ name: match[1] ?? '', position: match.index });
    match = pattern.exec(code);
  }
  return out;
}

function findClasses(code: string): ClassEntry[] {
  const pattern = /class\s+([a-zA-Z0-9_]+)\s+(definition|implementation)/gi;
  const classes: ClassEntry[] = [];
  let match: RegExpExecArray | null = pattern.exec(code);
  while (match !== null) {
    classes.push({
      name: match[1] ?? '',
      type: (match[2] ?? '').toLowerCase(),
      position: match.index,
    });
    match = pattern.exec(code);
  }
  return classes;
}

/** 구의 `parseToAST` — 필드 이름과 순서를 그대로 둔다. */
export function parseToAst(code: string): AbapAst {
  return {
    type: 'abapSource',
    sourceLength: code.length,
    lineCount: code.split('\n').length,
    structures: analyzeStructures(code),
    includes: findIncludes(code),
    classes: findClasses(code),
    // `methods?`라 METHOD·METHODS 양쪽을 잡는다. 구 그대로다.
    methods: collectNamed(code, /methods?\s+([a-zA-Z0-9_]+)/gi),
    dataDeclarations: collectNamed(code, /data:?\s+([a-zA-Z0-9_]+)/gi),
    forms: collectNamed(code, /form\s+([a-zA-Z0-9_]+)/gi),
  };
}

/**
 * 구 `lib/writeResultToFile.ts`와 같은 동작 — 경로를 절대화하고, 상위
 * 디렉터리를 만들고, 줄바꿈을 이 OS의 것으로 바꿔 쓴다.
 *
 * **구 주석이 말하는 `./output` 제한은 구현된 적이 없다**
 * (`engine/src/lib/writeResultToFile.ts:8-11` 대 `:16-40` — 검사 코드가 없다).
 * 여기서도 새로 만들지 않는다. 없는 검사를 새로 넣으면 구가 받아 주던 경로가
 * 거부되고, 그것은 이식이 아니라 계약 변경이다. 경로는 **호출자가 명시로 준
 * 것**이며 이 도구는 SAP이 아니라 로컬 디스크만 만진다.
 */
export function writeResultToFile(text: string, filePath: string): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, text.replace(/\r\n|\n/g, os.EOL), 'utf8');
}

export const getAbapAST = defineTool(
  {
    name: 'GetAbapAST',
    description: '[read-only] Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format.',
    inputSchema: {
      code: z.string().describe('ABAP source code to parse'),
      filePath: z.string().optional().describe('Optional file path to write the result to'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      // 구는 `!args?.code`로 본다 — **빈 문자열도 여기서 걸린다.** 스키마가
      // `code`를 필수로 잡으므로 아예 빠진 경우는 SDK가 먼저 막고, 빈 문자열만
      // 이 갈래에 닿는다.
      if (!args.code) {
        // 구는 SDK의 `McpError(InvalidParams, …)`를 던지고 자기 catch에서
        // `error.message`를 실어 보냈다. 그 message에는 SDK가 붙이는
        // `MCP error -32602: ` 접두사가 들어 있다 — 문구가 계약이므로 그대로 둔다.
        return failure('MCP error -32602: ABAP code is required');
      }

      const ast = parseToAst(args.code);
      context.logger.debug('Generated AST for provided ABAP code');

      const text = JSON.stringify(ast, null, 2);

      // 구는 **결과를 만든 뒤** 파일에 쓴다. 쓰기가 실패하면 그 오류가 catch로
      // 가고 성공 응답은 나가지 않는다(`handleGetAbapAST.ts:173-188`).
      if (args.filePath) {
        context.logger.debug(`Writing AST result to file: ${args.filePath}`);
        writeResultToFile(text, args.filePath);
      }

      return ok(text);
    } catch (error) {
      context.logger.error('Failed to generate ABAP AST');
      return failure(error instanceof Error ? error.message : String(error));
    }
  },
);
