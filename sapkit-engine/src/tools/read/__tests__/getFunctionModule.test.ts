/**
 * GetFunctionModule 핸들러 계약.
 *
 * 핵심은 곁읽기다 — 활성 판을 읽을 때 비활성 판을 한 번 더 확인해 다르면
 * 경고를 붙이고, **그 곁읽기가 실패해도 본 읽기는 성공한다**.
 */

import { getFunctionModule } from '../getFunctionModule';
import { TEST_ORIGIN, cleanupTempDirs, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const FM_PATH = `${TEST_ORIGIN}/sap/bc/adt/functions/groups/ZFG_TEST/fmodules/Z_FM_TEST/source/main`;
const ACTIVE_SOURCE = "FUNCTION z_fm_test.\n  WRITE 'active'.\nENDFUNCTION.";

interface Payload {
  success: boolean;
  function_module_name: string;
  function_group_name: string;
  version: string;
  function_module_data: string;
  status: number;
  status_text: string;
  warning?: string;
}

describe('GetFunctionModule', () => {
  it('그룹이 낀 경로로 읽고, 기본값에서는 비활성 판을 한 번 더 확인한다', async () => {
    const { outcome, requests } = await runTool(
      getFunctionModule,
      { function_module_name: 'z_fm_test', function_group_name: 'zfg_test' },
      (request) => ({
        body: request.url.includes('version=inactive')
          ? "FUNCTION z_fm_test.\n  WRITE 'pending edit'.\nENDFUNCTION."
          : ACTIVE_SOURCE,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${FM_PATH}?version=active`,
      `GET ${FM_PATH}?version=inactive`,
    ]);

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.function_module_data).toBe(ACTIVE_SOURCE);
    expect(payload.warning).toContain('will be silently overwritten');
  });

  it('비활성 판이 같으면 경고를 붙이지 않는다', async () => {
    const { outcome } = await runTool(
      getFunctionModule,
      { function_module_name: 'z_fm_test', function_group_name: 'zfg_test' },
      () => ({ body: ACTIVE_SOURCE }),
    );

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.warning).toBeUndefined();
    expect(payload).toEqual({
      success: true,
      function_module_name: 'Z_FM_TEST',
      function_group_name: 'ZFG_TEST',
      version: 'active',
      function_module_data: ACTIVE_SOURCE,
      status: 200,
      status_text: 'OK',
    });
  });

  it('곁읽기가 실패해도 본 읽기는 성공한다', async () => {
    const { outcome, requests } = await runTool(
      getFunctionModule,
      { function_module_name: 'z_fm_test', function_group_name: 'zfg_test' },
      (request) =>
        request.url.includes('version=inactive')
          ? { status: 404, body: '' }
          : { body: ACTIVE_SOURCE },
    );

    expect(requests).toHaveLength(2);
    expect(outcome.isError).toBe(false);
    expect((JSON.parse(outcome.text) as Payload).warning).toBeUndefined();
  });

  it('check_inactive=false면 곁읽기를 건너뛴다', async () => {
    const { requests } = await runTool(
      getFunctionModule,
      {
        function_module_name: 'z_fm_test',
        function_group_name: 'zfg_test',
        check_inactive: false,
      },
      () => ({ body: ACTIVE_SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${FM_PATH}?version=active`);
  });

  it('version=inactive를 직접 읽으면 곁읽기가 없다', async () => {
    const { requests } = await runTool(
      getFunctionModule,
      {
        function_module_name: 'z_fm_test',
        function_group_name: 'zfg_test',
        version: 'inactive',
      },
      () => ({ body: ACTIVE_SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${FM_PATH}?version=inactive`);
  });

  it('404는 구와 같은 문구로 보고된다', async () => {
    const { outcome } = await runTool(
      getFunctionModule,
      { function_module_name: 'z_fm_test', function_group_name: 'zfg_test' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: FunctionModule Z_FM_TEST not found.');
  });
});
