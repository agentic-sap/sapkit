/**
 * `RuntimeListProfilerTraceFiles` — 발행 계약 · 와이어 · 갈래.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 경로·`Accept` →
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/runtime/traces/profiler.js:284-294`
 *    (`Accept`는 같은 패키지 `dist/constants/contentTypes.js:115`의 `application/xml`)
 *  - 응답 표 → `engine/src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts:27-41`
 */

import { runtimeListProfilerTraceFiles } from '../runtimeListProfilerTraceFiles';
import {
  cleanupTempDirs,
  jsonOf,
  publishedDeclaration,
  publishedOf,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const TRACES_XML = '<traces><trace id="ABCDEF0123456789"/></traces>';

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeListProfilerTraceFiles)).toEqual(
      publishedDeclaration('RuntimeListProfilerTraceFiles'),
    );
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeListProfilerTraceFiles.definition.sets).toEqual(['readonly']);
    expect(runtimeListProfilerTraceFiles.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(runtimeListProfilerTraceFiles.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('인자 없이 트레이스 뿌리 경로를 GET 한다', async () => {
    const { outcome, requests } = await runTool(runtimeListProfilerTraceFiles, {}, () => ({
      status: 200,
      body: TRACES_XML,
    }));
    const sent = toolRequests(requests);
    const url = new URL(sent[0]?.url ?? '');

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(url.pathname).toBe('/sap/bc/adt/runtime/traces/abaptraces');
    expect(url.search).toBe('');
    expect(sent[0]?.headers['Accept']).toBe('application/xml');
    expect(sent[0]?.body).toBeUndefined();

    const body = jsonOf(outcome);
    expect(body['success']).toBe(true);
    expect(body['status']).toBe(200);
    // 속성 접두사가 빈 문자열이라 `id`가 형제 키로 올라온다 (구 파서 설정 그대로).
    expect(body['payload']).toEqual({ traces: { trace: { id: 'ABCDEF0123456789' } } });
  });
});

describe('갈래', () => {
  it('SAP이 오류를 주면 Error: 접두사가 붙은 실패로 접힌다', async () => {
    const { outcome } = await runTool(runtimeListProfilerTraceFiles, {}, () => ({
      status: 403,
      body: 'forbidden',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
