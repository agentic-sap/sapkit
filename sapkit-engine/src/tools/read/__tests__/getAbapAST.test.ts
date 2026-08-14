/**
 * `GetAbapAST` — 발행 계약 · 무접속 · 근사 파서의 실제 결과 · 파일 쓰기 갈래.
 *
 * ## 기대값을 어디서 뽑았나 (자기확인 회피)
 *
 * 아래 `OLD_ENGINE_AST`는 **구 엔진의 `SimpleAbapASTGenerator` 클래스를 그대로
 * 떼어 내 실행한 출력**이다(`engine/src/handlers/system/readonly/handleGetAbapAST.ts:26-160`
 * 을 그대로 실행). 신 구현을 돌려 얻은 값이 아니다 — 그렇게 뽑으면 "내가 쓴
 * 시험이 내 코드를 통과시키는" 자기확인이 된다.
 *
 * 그래서 이 표는 **구의 근사 파서가 실제로 저지르는 일**을 그대로 담고 있다.
 * 특히 다음 셋은 버그처럼 보이지만 구의 실측 동작이며, 시험이 그것을 고정한다.
 *  - `methods`에 `run`이 **두 번** 나온다 — `METHODS run`과 `METHOD run` 둘 다
 *    `/methods?\s+…/`에 걸린다.
 *  - `FORM do_work.` 한 줄이 `structures`에도 `forms`에도 각각 잡힌다.
 *  - `position`은 줄 번호가 아니라 **문자 오프셋**이다.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getAbapAST } from '../getAbapAST';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

/** 구 파서를 실행해 얻은 입력. 줄바꿈까지 그대로다. */
const SAMPLE = [
  'REPORT zdemo.',
  '',
  'CLASS zcl_demo DEFINITION.',
  '  PUBLIC SECTION.',
  '    METHODS run.',
  'ENDCLASS.',
  '',
  'CLASS zcl_demo IMPLEMENTATION.',
  '  METHOD run.',
  '    DATA lv_count TYPE i.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  '',
  'INCLUDE zdemo_top.',
  '',
  'FORM do_work.',
  '  DATA: lv_x TYPE string.',
  'ENDFORM.',
].join('\n');

/** 구 엔진 코드를 실행해 받은 출력 그대로. 손으로 고치지 말 것. */
const OLD_ENGINE_AST = {
  type: 'abapSource',
  sourceLength: 251,
  lineCount: 18,
  structures: [
    { type: 'class', line: 3, content: 'CLASS zcl_demo DEFINITION.' },
    { type: 'class', line: 8, content: 'CLASS zcl_demo IMPLEMENTATION.' },
    { type: 'method', line: 9, content: 'METHOD run.' },
    { type: 'form', line: 16, content: 'FORM do_work.' },
  ],
  includes: ['zdemo_top'],
  classes: [
    { name: 'zcl_demo', type: 'definition', position: 15 },
    { name: 'zcl_demo', type: 'implementation', position: 88 },
  ],
  methods: [
    { name: 'run', position: 64 },
    { name: 'run', position: 121 },
  ],
  dataDeclarations: [
    { name: 'lv_count', position: 137 },
    { name: 'lv_x', position: 219 },
  ],
  forms: [{ name: 'do_work', position: 203 }],
};

/** 구 파서가 빈 문자열에 대해 낸 값 — `lineCount`가 0이 아니라 1이다. */
const OLD_ENGINE_EMPTY_AST = {
  type: 'abapSource',
  sourceLength: 0,
  lineCount: 1,
  structures: [],
  includes: [],
  classes: [],
  methods: [],
  dataDeclarations: [],
  forms: [],
};

const tempFiles: string[] = [];

afterEach(() => {
  cleanupTempDirs();
  while (tempFiles.length > 0) {
    const file = tempFiles.pop();
    if (file === undefined) continue;
    try {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    } catch {
      // 정리 실패는 시험 결과가 아니다.
    }
  }
});

/** 전송이 주입되지 않은 채로 부른다 — 접속을 쓰면 여기서 드러난다. */
async function call(args: Record<string, unknown>) {
  const { outcome, requests } = await runTool(getAbapAST, args, () => ({ status: 200, body: '' }));
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getAbapAST);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetAbapAST'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/system/readonly/` → readonly 집합.
    expect(getAbapAST.definition.sets).toEqual(['readonly']);
    // `handleGetAbapAST.ts:6` — legacy는 없다.
    expect(getAbapAST.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getAbapAST.definition.kind).toBe('read');
  });
});

describe('SAP에 붙지 않는다', () => {
  it('요청을 한 건도 보내지 않는다 — 구도 connection을 쓰지 않는다', async () => {
    const { outcome, sent } = await call({ code: SAMPLE });

    expect(outcome.isError).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe('구 파서의 실제 결과를 그대로 낸다', () => {
  it('구 엔진 코드를 실행해 얻은 표와 글자까지 같다', async () => {
    const { outcome } = await call({ code: SAMPLE });

    expect(JSON.parse(outcome.text)).toEqual(OLD_ENGINE_AST);
  });

  it('들여쓰기 2칸 JSON으로 싣는다 (구: JSON.stringify(ast, null, 2))', async () => {
    const { outcome } = await call({ code: SAMPLE });

    expect(outcome.text).toBe(JSON.stringify(OLD_ENGINE_AST, null, 2));
  });

  it('METHODS와 METHOD를 둘 다 세는 구의 동작이 유지된다', async () => {
    const { outcome } = await call({ code: 'METHODS alpha.\nMETHOD alpha.' });
    const ast = JSON.parse(outcome.text);

    expect(ast.methods.map((entry: { name: string }) => entry.name)).toEqual(['alpha', 'alpha']);
  });

  it('빈 문자열은 오류다 — 구의 `!args?.code` 갈래', async () => {
    const { outcome, sent } = await call({ code: '' });

    expect(outcome.isError).toBe(true);
    // 구는 McpError의 message를 그대로 실었고 거기엔 SDK 접두사가 붙어 있다.
    expect(outcome.text).toBe('MCP error -32602: ABAP code is required');
    expect(sent).toHaveLength(0);
  });
});

describe('filePath 갈래', () => {
  it('주면 그 자리에 결과를 쓰고, 응답은 그대로 돌려준다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-ast-'));
    const target = path.join(dir, 'nested', 'ast.json');
    tempFiles.push(target);

    const { outcome } = await call({ code: SAMPLE, filePath: target });

    expect(outcome.isError).toBe(false);
    // 구는 상위 디렉터리를 만들어 준다(`writeResultToFile.ts:26`).
    expect(fs.existsSync(target)).toBe(true);
    // 구는 줄바꿈을 이 OS의 것으로 바꿔 쓴다(`writeResultToFile.ts:33-35`).
    const written = fs.readFileSync(target, 'utf8');
    expect(written).toBe(JSON.stringify(OLD_ENGINE_AST, null, 2).replace(/\r\n|\n/g, os.EOL));
    // 응답 본문은 파일과 무관하게 원래 JSON이다.
    expect(JSON.parse(outcome.text)).toEqual(OLD_ENGINE_AST);
  });

  it('안 주면 아무 파일도 만들지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-ast-'));
    tempFiles.push(path.join(dir, 'x'));

    await call({ code: SAMPLE });

    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('빈 코드는 파일도 쓰지 않는다 — 검증이 먼저다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-ast-'));
    const target = path.join(dir, 'ast.json');
    tempFiles.push(target);

    const { outcome } = await call({ code: '', filePath: target });

    expect(outcome.isError).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });
});

describe('경계 입력', () => {
  it('빈 코드가 아닌 공백 한 칸은 통과하고 구와 같은 빈 표를 낸다', async () => {
    // 구 파서를 실행해 받은 빈 결과와 같은 모양이어야 한다(길이만 다르다).
    const { outcome } = await call({ code: ' ' });
    const ast = JSON.parse(outcome.text);

    expect(ast).toEqual({ ...OLD_ENGINE_EMPTY_AST, sourceLength: 1 });
  });
});
