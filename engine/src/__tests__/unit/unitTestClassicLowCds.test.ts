/**
 * Regression test for the low-level class / CDS ABAP-Unit paths still using the
 * ABAP-Cloud-only run endpoint (HANDOFF §6 old backlog 3-6).
 *
 * 4.13.1 moved the HIGH-level RunUnitTest / GetUnitTest* off
 * /sap/bc/adt/abapunit/runs (the Cloud-only async collection that 404s on
 * on-prem) onto the classic synchronous /sap/bc/adt/abapunit/testruns endpoint,
 * bridged through a connection-scoped run_id store (lib/abapUnitClassic.ts).
 * The low-level RunClassUnitTestsLow / GetClassUnitTestStatusLow /
 * GetClassUnitTestResultLow and the CDS readers GetCdsUnitTest(/Status/Result)
 * were left on the vendored cloud path and 404'd on-prem. 4.13.11 routes them
 * through the SAME classic helpers.
 *
 * SAP-independent: drives the real handlers over a fake IAbapConnection that
 * serves the classic /testruns endpoint and hard-fails any request to the old
 * cloud /abapunit/runs|results collection (so a regression to the old path is
 * caught, not silently 404-swallowed).
 */

process.env.ADT_ACCEPT_CORRECTION = 'false';

import { handleGetClassUnitTestResult } from '../../handlers/class/low/handleGetClassUnitTestResult';
import { handleGetClassUnitTestStatus } from '../../handlers/class/low/handleGetClassUnitTestStatus';
import { handleRunClassUnitTests } from '../../handlers/class/low/handleRunClassUnitTests';
import { handleGetCdsUnitTest } from '../../handlers/unit_test/high/handleGetCdsUnitTest';
import { handleGetCdsUnitTestResult } from '../../handlers/unit_test/high/handleGetCdsUnitTestResult';
import { handleGetCdsUnitTestStatus } from '../../handlers/unit_test/high/handleGetCdsUnitTestStatus';
import { handleRunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest';

const RUN_RESULT_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit">' +
  '<program adtcoreName="ZCL_SAH_TEST">' +
  '<testClasses><testClass name="LTCL_SAH"><testMethods>' +
  '<testMethod name="TEST_ONE"/></testMethods></testClass></testClasses>' +
  '</program></aunit:runResult>';

class FakeConnection {
  sessionMode: 'stateful' | 'stateless' = 'stateless';
  urls: string[] = [];

  setSessionType(type: 'stateful' | 'stateless') {
    this.sessionMode = type;
  }
  getSessionMode() {
    return this.sessionMode;
  }
  getSessionId() {
    return 'testsessionid00000000000000000000';
  }
  async getBaseUrl() {
    return 'https://sap.example.com:44300';
  }
  async getAuthHeaders() {
    return {};
  }

  async makeAdtRequest(options: any): Promise<any> {
    const url = String(options.url);
    this.urls.push(url);
    // The old cloud collection — must never be hit again.
    if (/\/sap\/bc\/adt\/abapunit\/(runs|results)/.test(url)) {
      const err: any = new Error('Not Found');
      err.response = { status: 404, data: 'not found', headers: {} };
      throw err;
    }
    if (url.includes('/sap/bc/adt/abapunit/testruns')) {
      return {
        status: 200,
        statusText: 'OK',
        data: RUN_RESULT_XML,
        headers: {},
      };
    }
    return { status: 200, statusText: 'OK', data: '', headers: {} };
  }
}

const parse = (result: any) => JSON.parse(result.content[0].text);

describe('low-level class + CDS ABAP Unit use the classic endpoint (backlog 3-6)', () => {
  it('RunClassUnitTestsLow posts to the classic /testruns, not the cloud /runs', async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;

    const result = await handleRunClassUnitTests(context, {
      tests: [{ container_class: 'ZCL_SAH_TEST', test_class: 'LTCL_SAH' }],
    });

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.success).toBe(true);
    expect(typeof body.run_id).toBe('string');
    expect(body.run_id.length).toBeGreaterThan(0);

    // Classic endpoint hit; cloud endpoint never hit.
    expect(connection.urls.some((u) => u.includes('/abapunit/testruns'))).toBe(
      true,
    );
    expect(connection.urls.some((u) => /\/abapunit\/runs/.test(u))).toBe(false);
  });

  it('GetClassUnitTestStatusLow / ResultLow read the cached run without any cloud GET', async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;

    const run = parse(
      await handleRunClassUnitTests(context, {
        tests: [{ container_class: 'ZCL_SAH_TEST', test_class: 'LTCL_SAH' }],
      }),
    );
    const runId = run.run_id;
    connection.urls = []; // only observe the reader requests

    const status = parse(
      await handleGetClassUnitTestStatus(context, { run_id: runId }),
    );
    expect(status.success).toBe(true);
    expect(status.run_status.status).toBe('completed');

    const res = parse(
      await handleGetClassUnitTestResult(context, { run_id: runId }),
    );
    expect(res.success).toBe(true);
    expect(res.run_result).toContain('runResult');

    // Neither reader touched SAP at all (pure cache lookup) — certainly not /runs.
    expect(connection.urls.length).toBe(0);
  });

  it('GetClassUnitTestResultLow rejects format:"junit" (unsupported on classic)', async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;
    const result = await handleGetClassUnitTestResult(context, {
      run_id: 'anything',
      format: 'junit',
    });
    expect(result.isError).toBeTruthy();
    expect(JSON.stringify(result)).toContain('junit');
  });

  it('GetCdsUnitTest(/Status/Result) resolve a classic-run run_id from the shared store', async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;

    // No RunCdsUnitTest tool exists — CDS test classes are run via RunUnitTest,
    // which populates the same connection-scoped store the CDS readers read.
    const run = parse(
      await handleRunUnitTest(context, {
        tests: [
          { container_class: 'ZCL_SAH_CDS_TEST', test_class: 'LTCL_SAH' },
        ],
      }),
    );
    const runId = run.run_id;
    connection.urls = [];

    const full = parse(await handleGetCdsUnitTest(context, { run_id: runId }));
    expect(full.success).toBe(true);
    expect(full.run_result).toContain('runResult');

    const status = parse(
      await handleGetCdsUnitTestStatus(context, { run_id: runId }),
    );
    expect(status.success).toBe(true);
    expect(status.run_status.status).toBe('completed');

    const res = parse(
      await handleGetCdsUnitTestResult(context, { run_id: runId }),
    );
    expect(res.success).toBe(true);
    expect(res.run_result).toContain('runResult');

    expect(connection.urls.some((u) => /\/abapunit\/runs/.test(u))).toBe(false);
  });

  it('CDS readers give an honest error for an unknown run_id (no cloud call)', async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;
    const result = await handleGetCdsUnitTest(context, {
      run_id: 'no-such-run',
    });
    expect(result.isError).toBeTruthy();
    expect(JSON.stringify(result)).toContain('no cached');
    expect(connection.urls.length).toBe(0);
  });
});
