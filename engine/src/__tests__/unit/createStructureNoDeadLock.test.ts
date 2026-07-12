/**
 * Regression test for the dead lock/unlock pair removed from CreateStructure
 * (HANDOFF §6 backlog 11-⑨).
 *
 * CreateStructure used to `lock()` the structure and immediately `unlock()` it
 * with nothing but a TODO comment in between — the DDL update the lock was
 * meant to protect was never wired up, so the pair bracketed no request at all.
 * It has been removed. This drives the REAL handler over a fake connection and
 * asserts the handler completes create -> check -> activate WITHOUT ever
 * issuing a structure LOCK / UNLOCK round-trip.
 *
 * SAP-independent. Reverse-verify: restore the lock/unlock calls and the
 * `_action=LOCK` request reappears, failing this test.
 */

process.env.ADT_ACCEPT_CORRECTION = 'false';
delete process.env.SAP_VERSION;
delete process.env.SAP_SYSTEM_TYPE;

import { handleCreateStructure } from '../../handlers/structure/high/handleCreateStructure';

interface Captured {
  url: string;
  method: string;
}

class FakeConnection {
  sessionMode: 'stateful' | 'stateless' = 'stateless';
  captured: Captured[] = [];

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
    this.captured.push({
      url: String(options.url),
      method: String(options.method).toUpperCase(),
    });
    return { status: 200, statusText: 'OK', data: '', headers: {} };
  }
}

describe('CreateStructure has no dead lock/unlock pair (regression: 11-⑨)', () => {
  it('creates -> checks -> activates without issuing a structure LOCK or UNLOCK', async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;

    const result = await handleCreateStructure(context, {
      structure_name: 'ZSAH_S_TEST',
      package_name: '$TMP',
      fields: [{ name: 'FIELD1', data_type: 'CHAR', length: 10 }],
    });

    expect(result.isError).toBeFalsy();

    const lockRequests = connection.captured.filter(
      (r) => r.url.includes('_action=LOCK') || r.url.includes('_action=UNLOCK'),
    );
    expect(lockRequests).toEqual([]);

    // Sanity: the handler did reach the create round-trip (where the dead pair
    // used to sit), so the "no lock" result is meaningful and not just an early
    // bail-out.
    const createReq = connection.captured.find(
      (r) => r.method === 'POST' && r.url.includes('/ddic/structures'),
    );
    expect(createReq).toBeDefined();
  });
});
