/**
 * Regression for backlog 11-⑩ (powerup 4.13.15): the four DeleteLocal* MCP
 * tools were 100% broken. The vendored high-level delete() delegated to
 * update({ ...code: '' }), whose "code is required" falsy guard threw BEFORE the
 * lock, so the delete PUT never reached the wire. The 4.13.15 vendored-client
 * patch replaces each delete() with a dedicated clear chain
 * (lock -> stateful pin -> empty-payload PUT -> unlock) via new low-level
 * clearClassInclude / clearClassTestInclude functions, leaving the common
 * update guard intact.
 *
 * This drives the REAL handlers over a fake IAbapConnection (same pattern as
 * vendoredClientLockChainStatefulSession.test.ts) and asserts, per family
 * member, that:
 *   1. the chain succeeds (no MCP error envelope),
 *   2. a stateful LOCK is acquired,
 *   3. the clear PUT hits /includes/<type> AFTER the lock,
 *   4. every request from lock through the write rides the stateful session
 *      (4.13.7 pin — one stateless request evaporates the ENQUEUE lock),
 *   5. an UNLOCK follows the write,
 *   6. the write body is the effectively-empty single-space payload.
 *
 * With the patch reverted (delete -> update('')), the guard throws before any
 * wire call, so step 1 fails and there is no PUT at all — all four cases FAIL.
 * SAP-independent.
 */

// Disable the AdtClient accept-header negotiation wrapper so the fake
// connection's makeAdtRequest is invoked verbatim and capture is deterministic.
process.env.ADT_ACCEPT_CORRECTION = 'false';
// Make sure the standard (non-ECC, non-legacy) paths are under test.
delete process.env.SAP_VERSION;
delete process.env.SAP_SYSTEM_TYPE;

import { handleDeleteLocalDefinitions } from '../../handlers/class/high/handleDeleteLocalDefinitions';
import { handleDeleteLocalMacros } from '../../handlers/class/high/handleDeleteLocalMacros';
import { handleDeleteLocalTestClass } from '../../handlers/class/high/handleDeleteLocalTestClass';
import { handleDeleteLocalTypes } from '../../handlers/class/high/handleDeleteLocalTypes';

const LOCK_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">' +
  '<asx:values><DATA><LOCK_HANDLE>TESTHANDLE-1</LOCK_HANDLE></DATA></asx:values>' +
  '</asx:abap>';

interface CapturedRequest {
  url: string;
  method: string;
  sessionType?: string;
  data?: unknown;
}

/**
 * Minimal IAbapConnection stand-in. makeAdtRequest replicates
 * AbstractAbapConnection's rule of emitting `x-sap-adt-sessiontype: stateful`
 * exactly when session mode is stateful, then records the effective header +
 * body for assertions.
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
    const { url, method, headers, data } = options;
    const effective: Record<string, string> = { ...(headers || {}) };
    if (this.sessionMode === 'stateful') {
      effective['x-sap-adt-sessiontype'] = 'stateful';
    }
    this.captured.push({
      url,
      method: String(method).toUpperCase(),
      sessionType: effective['x-sap-adt-sessiontype'],
      data,
    });
    return this.route(url, String(method).toUpperCase());
  }

  private route(url: string, method: string): any {
    const ok = (data: string) => ({
      status: 200,
      statusText: 'OK',
      data,
      headers: {},
    });
    if (url.includes('_action=LOCK')) return ok(LOCK_XML);
    if (url.includes('_action=UNLOCK')) return ok('');
    if (method === 'GET') return ok('CLASS zcl_x DEFINITION.\nENDCLASS.');
    return ok('');
  }
}

interface FamilyCase {
  name: string;
  run: (context: any) => Promise<any>;
  /** Matches the clear PUT for this include type. */
  isWrite: (r: CapturedRequest) => boolean;
}

const CASES: FamilyCase[] = [
  {
    name: 'DeleteLocalTypes',
    run: (ctx) => handleDeleteLocalTypes(ctx, { class_name: 'ZCL_SAH_TEST' }),
    isWrite: (r) =>
      r.method === 'PUT' && r.url.includes('/includes/implementations'),
  },
  {
    name: 'DeleteLocalDefinitions',
    run: (ctx) =>
      handleDeleteLocalDefinitions(ctx, { class_name: 'ZCL_SAH_TEST' }),
    isWrite: (r) =>
      r.method === 'PUT' && r.url.includes('/includes/definitions'),
  },
  {
    name: 'DeleteLocalMacros',
    run: (ctx) => handleDeleteLocalMacros(ctx, { class_name: 'ZCL_SAH_TEST' }),
    isWrite: (r) => r.method === 'PUT' && r.url.includes('/includes/macros'),
  },
  {
    name: 'DeleteLocalTestClass',
    run: (ctx) =>
      handleDeleteLocalTestClass(ctx, { class_name: 'ZCL_SAH_TEST' }),
    isWrite: (r) =>
      r.method === 'PUT' && r.url.includes('/includes/testclasses'),
  },
];

describe('DeleteLocal* family reaches the clear PUT under a pinned lock (backlog 11-⑩, 4.13.15)', () => {
  for (const c of CASES) {
    it(`${c.name} runs lock -> clear PUT -> unlock, all stateful`, async () => {
      const connection = new FakeConnection();
      const context = { connection, logger: undefined } as any;

      const result = await c.run(context);

      // The chain must succeed against the mocked backend (reverting the patch
      // makes this fail: the guard throws "code is required" before any wire
      // call, so isError is truthy).
      expect(result.isError).toBeFalsy();

      const reqs = connection.captured;

      // Stateful LOCK (sanity).
      const lockIdx = reqs.findIndex((r) => r.url.includes('_action=LOCK'));
      expect(lockIdx).toBeGreaterThanOrEqual(0);
      expect(reqs[lockIdx].sessionType).toBe('stateful');

      // The clear PUT must exist and come after the lock (reverted patch has no
      // PUT at all -> writeIdx === -1 -> this fails).
      const writeIdx = reqs.findIndex(c.isWrite);
      expect(writeIdx).toBeGreaterThan(lockIdx);

      // The write body is the effectively-empty single-space clear payload.
      expect(reqs[writeIdx].data).toBe(' ');

      // Every request from lock through the write rides the stateful session.
      for (const r of reqs.slice(lockIdx, writeIdx + 1)) {
        expect(`${r.method} ${r.url} -> ${r.sessionType}`).toBe(
          `${r.method} ${r.url} -> stateful`,
        );
      }

      // An UNLOCK follows the write.
      const unlockIdx = reqs.findIndex((r) => r.url.includes('_action=UNLOCK'));
      expect(unlockIdx).toBeGreaterThan(writeIdx);
    });
  }
});
