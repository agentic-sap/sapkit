/**
 * Regression test for the UpdateClass lock-session bug (vsp issue #88 class).
 *
 * SAP-independent: drives the real high-level handleUpdateClass through the
 * real AdtClient over a fake IAbapConnection whose makeAdtRequest mirrors
 * AbstractAbapConnection's header injection (it stamps
 * `x-sap-adt-sessiontype: stateful` whenever the connection's session mode is
 * stateful) and captures every outbound request.
 *
 * The bug: getClass().lock() leaves the connection stateless, so the
 * pre-write /checkruns POST (an intermediate request between lock and PUT)
 * and the source PUT both went out stateless. On systems that recycle the
 * HTTP connection between requests (e.g. IDES) SAP then tears down the
 * stateful session, the ENQUEUE lock evaporates, and the PUT fails with
 * "resource not locked (invalid lock handle)" (HTTP 423).
 *
 * The guard pins the session-type header on the two requests that must ride
 * the same stateful session as the lock — mirroring vsp's
 * TestUpdateClassInclude_UsesStatefulSession.
 */

// Disable the AdtClient accept-header negotiation wrapper so the fake
// connection's makeAdtRequest is invoked verbatim and capture is deterministic.
process.env.ADT_ACCEPT_CORRECTION = 'false';

import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';

const LOCK_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">' +
  '<asx:values><DATA><LOCK_HANDLE>TESTHANDLE-1</LOCK_HANDLE></DATA></asx:values>' +
  '</asx:abap>';

const CHECK_OK_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
  '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="OK"/>' +
  '</chkrun:checkRunReports>';

interface CapturedRequest {
  url: string;
  method: string;
  sessionType?: string;
}

/**
 * Minimal IAbapConnection stand-in. Only the surface the update chain touches
 * is implemented; makeAdtRequest replicates AbstractAbapConnection's rule of
 * emitting `x-sap-adt-sessiontype: stateful` exactly when session mode is
 * stateful, then records the effective header for assertions.
 */
class FakeConnection {
  sessionMode: 'stateful' | 'stateless' = 'stateless';
  captured: CapturedRequest[] = [];

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
    const { url, method, headers } = options;
    const effective: Record<string, string> = { ...(headers || {}) };
    if (this.sessionMode === 'stateful') {
      effective['x-sap-adt-sessiontype'] = 'stateful';
    }
    this.captured.push({
      url,
      method: String(method).toUpperCase(),
      sessionType: effective['x-sap-adt-sessiontype'],
    });
    return this.route(url, String(method).toUpperCase());
  }

  private route(url: string, method: string): any {
    if (url.includes('_action=LOCK')) {
      return { status: 200, statusText: 'OK', data: LOCK_XML, headers: {} };
    }
    if (url.includes('/checkruns')) {
      return { status: 200, statusText: 'OK', data: CHECK_OK_XML, headers: {} };
    }
    if (method === 'PUT' && url.includes('/source/main')) {
      return { status: 200, statusText: 'OK', data: '', headers: {} };
    }
    if (url.includes('_action=UNLOCK')) {
      return { status: 200, statusText: 'OK', data: '', headers: {} };
    }
    return { status: 200, statusText: 'OK', data: '', headers: {} };
  }
}

function findPut(reqs: CapturedRequest[]): CapturedRequest | undefined {
  return reqs.find((r) => r.method === 'PUT' && r.url.includes('/source/main'));
}

// The pre-write check is the /checkruns POST that carries the proposed source
// (inline-artifact base64) — it is the request that sits BETWEEN lock and PUT.
// It is the first /checkruns POST (the post-write inactive check runs later,
// after unlock).
function findPreWriteCheck(
  reqs: CapturedRequest[],
): CapturedRequest | undefined {
  const putIndex = reqs.findIndex(
    (r) => r.method === 'PUT' && r.url.includes('/source/main'),
  );
  return reqs
    .slice(0, putIndex === -1 ? reqs.length : putIndex)
    .find((r) => r.method === 'POST' && r.url.includes('/checkruns'));
}

describe('UpdateClass stateful lock session (regression: invalid lock handle / HTTP 423)', () => {
  const SOURCE =
    'CLASS zcl_sah2_workdays DEFINITION PUBLIC.\nENDCLASS.\n' +
    'CLASS zcl_sah2_workdays IMPLEMENTATION.\nENDCLASS.';

  it('keeps the connection stateful across lock -> pre-write check -> source PUT', async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;

    const result = await handleUpdateClass(context, {
      class_name: 'ZCL_SAH2_WORKDAYS',
      source_code: SOURCE,
    });

    // Handler must succeed against the mocked backend.
    expect(result.isError).toBeFalsy();

    // The lock must have been acquired statefully (sanity).
    const lock = connection.captured.find((r) =>
      r.url.includes('_action=LOCK'),
    );
    expect(lock).toBeDefined();
    expect(lock?.sessionType).toBe('stateful');

    // The intermediate pre-write /checkruns POST must ride the same stateful
    // session — this is the request whose statelessness tore the session down.
    const preCheck = findPreWriteCheck(connection.captured);
    expect(preCheck).toBeDefined();
    expect(preCheck?.sessionType).toBe('stateful');

    // The source PUT itself must be stateful so the lock handle stays valid.
    const put = findPut(connection.captured);
    expect(put).toBeDefined();
    expect(put?.sessionType).toBe('stateful');
  });
});
