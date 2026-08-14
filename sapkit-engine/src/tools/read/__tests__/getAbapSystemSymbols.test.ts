/**
 * `GetAbapSystemSymbols` — 발행 계약 · 종류별 보강 갈래 · 통계 · 축소분.
 *
 * 기대값은 구 핸들러
 * (`engine/src/handlers/system/readonly/handleGetAbapSystemSymbols.ts:458-804`)의
 * 소스와, 보강이 부르는 두 도구의 **실제 응답 필드**에서 뽑았다
 * (구 `handleGetClass.ts:107-114` · `handleGetFunctionModule.ts:152`).
 *
 * ## 이 시험이 붙잡는 것은 대부분 「보강이 안 된다」는 사실이다
 *
 * 구를 읽어 보면 세 갈래 모두 실제 정보를 못 가져온다. 그것이 구의 동작이므로
 * 시험이 그대로 고정한다 — 나중에 누가 "설명대로 채워 넣자"고 고치면 여기서
 * 걸리고, 그때 비로소 근거와 함께 기대값을 바꾸는 것이 맞다.
 */

import { getAbapSystemSymbols } from '../getAbapSystemSymbols';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';
import type { RecordedRequest, Reply } from './support';

/** `GetClass`가 실제로 싣는 여섯 필드. description·packageName·superclass는 없다. */
const CLASS_SOURCE = 'CLASS zcl_demo DEFINITION PUBLIC.\nENDCLASS.';

afterEach(() => {
  cleanupTempDirs();
});

async function call(
  args: Record<string, unknown>,
  reply: (request: RecordedRequest) => Reply = () => ({ status: 200, body: CLASS_SOURCE }),
) {
  const { outcome, requests } = await runTool(getAbapSystemSymbols, args, reply);
  return {
    outcome,
    sent: toolRequests(requests),
    payload: outcome.isError ? null : JSON.parse(outcome.text),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getAbapSystemSymbols);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetAbapSystemSymbols'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(getAbapSystemSymbols.definition.sets).toEqual(['readonly']);
    expect(getAbapSystemSymbols.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getAbapSystemSymbols.definition.kind).toBe('read');
  });
});

describe('분석 결과를 그대로 물려받는다', () => {
  it('scopes·dependencies·errors는 의미 분석의 것이다', async () => {
    const { payload } = await call({ code: 'INCLUDE zdemo_top.\nFORM x.\nENDFORM.' });

    expect(payload.dependencies).toEqual(['ZDEMO_TOP']);
    expect(payload.errors).toEqual([]);
    expect(payload.scopes).toEqual([{ name: 'X', type: 'form', startLine: 2, endLine: 3 }]);
  });
});

describe('클래스 보강 — exists 말고는 아무것도 못 가져온다', () => {
  it('GetClass가 답하면 exists:true지만 나머지는 전부 폴백이다', async () => {
    const { payload } = await call({ code: 'CLASS zcl_demo DEFINITION PUBLIC.' });
    const symbol = payload.symbols[0];

    expect(symbol.name).toBe('ZCL_DEMO');
    expect(symbol.systemInfo).toEqual({
      exists: true,
      objectType: 'CLAS',
      // GetClass는 description·packageName·superclass를 싣지 않는다.
      description: 'ABAP Class ZCL_DEMO',
      package: 'Unknown',
      superClass: '',
    });
  });

  it('GetClass가 실패하면 exists:false에 구의 문구가 붙는다', async () => {
    const { payload } = await call({ code: 'CLASS zcl_demo DEFINITION PUBLIC.' }, () => ({
      status: 404,
      body: 'not found',
    }));

    expect(payload.symbols[0].systemInfo).toEqual({
      exists: false,
      error: 'Class not found in SAP system',
    });
  });

  it('클래스 심볼 하나당 SAP 왕복이 하나 나간다', async () => {
    const { sent } = await call({ code: 'CLASS zcl_demo DEFINITION PUBLIC.' });

    expect(sent).toHaveLength(1);
    expect(new URL(sent[0]?.url ?? '').pathname).toContain('/sap/bc/adt/oo/classes/');
  });
});

describe('함수 보강 — 구에서 두 겹으로 막혀 있다', () => {
  it('SAP에 닿지도 못하고 Function not found가 된다', async () => {
    // 호출부가 function_group_name에 빈 문자열을 하드코딩하는데(구 :597)
    // GetFunctionModule은 이름 둘이 다 있어야 하고 없으면 SAP 전에 돌아선다
    // (구 handleGetFunctionModule.ts:94-99). 그래서 왕복이 0이다.
    const { payload, sent } = await call({ code: 'FUNCTION z_demo.' });

    expect(sent).toHaveLength(0);
    expect(payload.symbols[0].systemInfo).toEqual({
      exists: false,
      error: 'Function not found in SAP system',
    });
  });

  it('SAP 응답이 무엇이든 결과가 같다 — 응답을 볼 기회가 없다', async () => {
    const ok200 = await call({ code: 'FUNCTION z_demo.' });
    const notFound = await call({ code: 'FUNCTION z_demo.' }, () => ({
      status: 404,
      body: 'not found',
    }));

    expect(ok200.payload.symbols[0].systemInfo).toEqual(
      notFound.payload.symbols[0].systemInfo,
    );
  });
});

describe('인터페이스 보강 — 이 판에서 축소됐다 (장부 등재분의 대체 기대 시험)', () => {
  it('SAP에 묻지 않고 무엇이 없는지 밝힌다', async () => {
    const { payload, sent } = await call({ code: 'INTERFACE zif_demo.' });

    expect(sent).toHaveLength(0);
    expect(payload.symbols[0].systemInfo).toEqual({
      exists: false,
      objectType: 'INTF',
      error:
        'Interface resolution is not available yet: this engine does not implement GetInterface. See harness/DIVERGENCES.md.',
    });
  });
});

describe('그 밖의 종류 — SAP에 묻지 않는다', () => {
  it('변수·상수·타입·폼·인클루드는 LOCAL 고정 응답이다', async () => {
    const { payload, sent } = await call({ code: 'DATA mv_a TYPE i.' });

    expect(sent).toHaveLength(0);
    expect(payload.symbols[0].systemInfo).toEqual({
      exists: false,
      objectType: 'LOCAL',
      description: 'Local variable MV_A',
      package: 'LOCAL',
      error: 'No system resolution available for this symbol type',
    });
  });

  it('메서드도 여기로 온다', async () => {
    const { payload } = await call({ code: 'METHODS run.' });

    expect(payload.symbols[0].systemInfo.objectType).toBe('LOCAL');
    expect(payload.symbols[0].systemInfo.description).toBe('Local method RUN');
  });
});

describe('통계', () => {
  it('resolvedSymbols는 사실상 읽을 수 있었던 클래스의 수다', async () => {
    const { payload } = await call({
      code: ['CLASS zcl_demo DEFINITION PUBLIC.', 'DATA mv_a TYPE i.', 'INTERFACE zif_x.'].join('\n'),
    });

    expect(payload.systemResolutionStats).toEqual({
      totalSymbols: 3,
      resolvedSymbols: 1,
      failedSymbols: 2,
      resolutionRate: '33.3%',
    });
  });

  it('심볼이 하나도 없으면 resolutionRate가 "NaN%"다 (구의 0/0)', async () => {
    const { payload } = await call({ code: '" only a comment' });

    expect(payload.symbols).toEqual([]);
    expect(payload.systemResolutionStats).toEqual({
      totalSymbols: 0,
      resolvedSymbols: 0,
      failedSymbols: 0,
      resolutionRate: 'NaN%',
    });
  });
});

describe('오류 갈래', () => {
  it('빈 코드는 구와 같은 문구로 거절한다', async () => {
    const { outcome, sent } = await call({ code: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('MCP error -32602: ABAP code is required');
    expect(sent).toHaveLength(0);
  });

  it('들여쓰기 2칸 JSON으로 싣는다', async () => {
    const { outcome, payload } = await call({ code: 'DATA mv_a TYPE i.' });

    expect(outcome.text).toBe(JSON.stringify(payload, null, 2));
  });
});
