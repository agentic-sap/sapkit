/**
 * `GetAbapSemanticAnalysis` — 발행 계약 · 무접속 · 근사 분석기의 실제 결과 · 파일 쓰기.
 *
 * ## 기대값을 어디서 뽑았나 (자기확인 회피)
 *
 * `OLD_ENGINE_ANALYSIS`는 **구 엔진의 `SimpleAbapSemanticAnalyzer` 클래스를 그대로
 * 떼어 내 실행한 출력**이다
 * (`engine/src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts:80-432`).
 * 신 구현을 돌려 얻은 값이 아니다.
 *
 * 그래서 이 표는 **구의 근사 분석기가 실제로 저지르는 일**을 그대로 담고 있다.
 * 버그처럼 보이지만 전부 구의 실측이며, 시험이 그것을 고정한다.
 *  - `PRIVATE SECTION.` 아래의 `DATA`·`CONSTANTS`·`TYPES`가 **`visibility: 'public'`**
 *    이다 — 판정이 섹션이 아니라 **그 줄**만 보기 때문이다.
 *  - `CLASS … IMPLEMENTATION`은 심볼을 만들지 않고 `_IMPL` 스코프만 연다.
 *  - `INTERFACE`의 스코프 종류가 `'interface'`가 아니라 **`'class'`**다.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { analyzeAbap, getAbapSemanticAnalysis } from '../getAbapSemanticAnalysis';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

/** 구 분석기에 물렸던 입력 그대로. */
const SAMPLE = [
  'CLASS zcl_demo DEFINITION PUBLIC.',
  '  PUBLIC SECTION.',
  '    METHODS run IMPORTING iv_a, iv_b.',
  '    CLASS-METHODS build.',
  '  PRIVATE SECTION.',
  '    DATA mv_count TYPE i.',
  '    CONSTANTS c_max TYPE i.',
  '    TYPES ty_list TYPE string.',
  'ENDCLASS.',
  '',
  '" a comment',
  '* another comment',
  '',
  'CLASS zcl_demo IMPLEMENTATION.',
  '  METHOD run.',
  '    DATA lv_x TYPE string.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  '',
  'INCLUDE zdemo_top.',
  '',
  'FORM do_work.',
  'ENDFORM.',
  '',
  'INTERFACE zif_demo.',
  'ENDINTERFACE.',
].join('\n');

/** 구 코드를 실행해 받은 출력 그대로. 손으로 고치지 말 것. */
const OLD_ENGINE_ANALYSIS = {
  symbols: [
    { name: 'ZCL_DEMO', type: 'class', scope: 'global', line: 1, column: 1, visibility: 'public' },
    {
      name: 'RUN',
      type: 'method',
      scope: 'ZCL_DEMO',
      line: 3,
      column: 1,
      visibility: 'public',
      description: 'Instance method',
      parameters: [
        { name: 'IV_A', type: 'importing', optional: false },
        { name: 'IV_B', type: 'importing', optional: false },
      ],
    },
    {
      name: 'BUILD',
      type: 'method',
      scope: 'ZCL_DEMO',
      line: 4,
      column: 1,
      visibility: 'public',
      description: 'Static method',
      parameters: [],
    },
    // ↓ PRIVATE SECTION 아래인데도 public이다. 구의 실측.
    { name: 'MV_COUNT', type: 'variable', scope: 'ZCL_DEMO', line: 6, column: 1, dataType: 'I', visibility: 'public' },
    { name: 'C_MAX', type: 'constant', scope: 'ZCL_DEMO', line: 7, column: 1, dataType: 'I', visibility: 'public' },
    { name: 'TY_LIST', type: 'type', scope: 'ZCL_DEMO', line: 8, column: 1, dataType: 'STRING', visibility: 'public' },
    { name: 'LV_X', type: 'variable', scope: 'RUN', line: 16, column: 1, dataType: 'STRING', visibility: 'public' },
    { name: 'ZDEMO_TOP', type: 'include', scope: 'global', line: 20, column: 1 },
    { name: 'DO_WORK', type: 'form', scope: 'global', line: 22, column: 1 },
    { name: 'ZIF_DEMO', type: 'interface', scope: 'global', line: 25, column: 1, visibility: 'public' },
  ],
  dependencies: ['ZDEMO_TOP'],
  errors: [],
  scopes: [
    { name: 'ZCL_DEMO', type: 'class', startLine: 1, endLine: 9 },
    { name: 'ZCL_DEMO_IMPL', type: 'class', startLine: 14, endLine: 18 },
    { name: 'RUN', type: 'method', startLine: 15, endLine: 17, parent: 'ZCL_DEMO_IMPL' },
    { name: 'DO_WORK', type: 'form', startLine: 22, endLine: 23 },
    // 인터페이스인데 스코프 종류가 class다.
    { name: 'ZIF_DEMO', type: 'class', startLine: 25, endLine: 26 },
  ],
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

async function call(args: Record<string, unknown>) {
  const { outcome, requests } = await runTool(getAbapSemanticAnalysis, args, () => ({
    status: 200,
    body: '',
  }));
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getAbapSemanticAnalysis);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetAbapSemanticAnalysis'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(getAbapSemanticAnalysis.definition.sets).toEqual(['readonly']);
    expect(getAbapSemanticAnalysis.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getAbapSemanticAnalysis.definition.kind).toBe('read');
  });
});

describe('SAP에 붙지 않는다', () => {
  it('요청을 한 건도 보내지 않는다', async () => {
    const { outcome, sent } = await call({ code: SAMPLE });

    expect(outcome.isError).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe('구 분석기의 실제 결과를 그대로 낸다', () => {
  it('구 엔진 코드를 실행해 얻은 표와 글자까지 같다', async () => {
    const { outcome } = await call({ code: SAMPLE });

    expect(JSON.parse(outcome.text)).toEqual(OLD_ENGINE_ANALYSIS);
  });

  it('들여쓰기 2칸 JSON으로 싣는다', async () => {
    const { outcome } = await call({ code: SAMPLE });

    expect(outcome.text).toBe(JSON.stringify(OLD_ENGINE_ANALYSIS, null, 2));
  });

  it('빈 코드는 구와 같은 문구로 거절한다', async () => {
    const { outcome, sent } = await call({ code: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('MCP error -32602: ABAP code is required');
    expect(sent).toHaveLength(0);
  });

  it('빈 줄과 주석은 건너뛴다', () => {
    const analysis = analyzeAbap(['', '* comment', '" comment', 'FORM x.'].join('\n'));

    expect(analysis.symbols).toHaveLength(1);
    expect(analysis.symbols[0]?.line).toBe(4);
  });
});

describe('구의 근사치가 남긴 어긋남 (이식 대상이지 결함이 아니다)', () => {
  it('TYPE REF TO는 클래스 이름이 아니라 REF로 읽힌다', () => {
    // 후보 순서 때문에 첫 패턴(/type\s+(\w+)/)이 먼저 걸린다.
    const analysis = analyzeAbap('DATA lo_x TYPE REF TO zcl_thing.');

    expect(analysis.symbols[0]?.dataType).toBe('REF');
  });

  it('줄 어디에든 optional이 있으면 인자 전부가 optional이 된다', () => {
    const analysis = analyzeAbap('METHODS run IMPORTING iv_a, iv_b OPTIONAL.');
    const parameters = analysis.symbols[0]?.parameters ?? [];

    expect(parameters.map((parameter) => parameter.optional)).toEqual([true, true]);
  });

  it('그 줄에 private이 적혀 있으면 그때만 private이다', () => {
    const analysis = analyzeAbap('DATA mv_a TYPE i. " private');

    expect(analysis.symbols[0]?.visibility).toBe('private');
  });

  it('닫히지 않은 스코프는 endLine이 시작 줄로 남는다', () => {
    const analysis = analyzeAbap('FORM x.');

    expect(analysis.scopes[0]).toEqual({ name: 'X', type: 'form', startLine: 1, endLine: 1 });
  });

  it('스코프를 닫는 줄은 그 낱말 하나여야 한다', () => {
    // `ENDFORM. " 주석`은 정규식에 걸리지 않아 스코프가 닫히지 않는다.
    const analysis = analyzeAbap(['FORM x.', 'ENDFORM. " done'].join('\n'));

    expect(analysis.scopes[0]?.endLine).toBe(1);
  });
});

describe('filePath 갈래', () => {
  it('주면 그 자리에 결과를 쓴다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-sem-'));
    const target = path.join(dir, 'nested', 'analysis.json');
    tempFiles.push(target);

    const { outcome } = await call({ code: SAMPLE, filePath: target });

    expect(outcome.isError).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe(
      JSON.stringify(OLD_ENGINE_ANALYSIS, null, 2).replace(/\r\n|\n/g, os.EOL),
    );
  });

  it('안 주면 아무 파일도 만들지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-sem-'));
    tempFiles.push(path.join(dir, 'x'));

    await call({ code: SAMPLE });

    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
