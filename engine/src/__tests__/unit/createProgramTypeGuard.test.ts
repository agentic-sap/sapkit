/**
 * Regression test for CreateProgram / CreateProgramLow silently substituting the
 * object type (HANDOFF §6 backlog 3-3; the low-level sibling CreateProgramLow is
 * Known-remaining #2, fixed in 4.13.15 by mirroring the high-level guard).
 *
 * The ADT programs/programs create endpoint only produces PROG/P objects, but
 * `CreateProgram` accepted program_type values (function_group / class_pool /
 * interface_pool / include) that map to distinct ADT object types with their
 * own create endpoints. The vendored create ignored the type and always
 * created a PROG/P shell, so a request for e.g. a function group was silently
 * fulfilled as a plain program and reported as `"type":"PROG/P"` — live-proven.
 *
 * The fix rejects the unsupported types up front with a message pointing at the
 * dedicated tool, before any object is created. This drives the REAL handler
 * over a fake connection and asserts (a) the unsupported types are refused with
 * NO outbound create request, and (b) a supported type (executable) still
 * reaches the create POST.
 *
 * SAP-independent. Reverse-verify: with the guard removed the unsupported
 * types create a PROG/P and these assertions fail.
 */

process.env.ADT_ACCEPT_CORRECTION = 'false';
delete process.env.SAP_VERSION;
delete process.env.SAP_SYSTEM_TYPE;

import { handleCreateProgram } from '../../handlers/program/high/handleCreateProgram';
import { handleCreateProgram as handleCreateProgramLow } from '../../handlers/program/low/handleCreateProgram';

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
    // Empty body -> parseValidationResponse treats it as "valid", and the
    // create/check calls resolve; enough for the supported-type path to reach
    // (and capture) the create POST.
    return { status: 200, statusText: 'OK', data: '', headers: {} };
  }
}

const REJECTED: Array<[string, string]> = [
  ['function_group', 'CreateFunctionGroup'],
  ['class_pool', 'CreateClass'],
  ['interface_pool', 'CreateInterface'],
  ['include', 'CreateInclude'],
];

describe('CreateProgram program_type guard (regression: silent PROG/P substitution)', () => {
  for (const [type, dedicated] of REJECTED) {
    it(`refuses program_type '${type}' and creates nothing, pointing at ${dedicated}`, async () => {
      const connection = new FakeConnection();
      const context = { connection, logger: undefined } as any;

      const result = await handleCreateProgram(context, {
        program_name: 'ZSAH_PROG_TEST',
        package_name: '$TMP',
        program_type: type,
      });

      expect(result.isError).toBeTruthy();
      expect(JSON.stringify(result)).toContain(dedicated);
      // Nothing was created — the guard fired before any SAP round-trip.
      expect(connection.captured.length).toBe(0);
    });
  }

  it("lets a supported program_type ('executable') reach the create POST", async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;

    await handleCreateProgram(context, {
      program_name: 'ZSAH_PROG_TEST',
      package_name: '$TMP',
      program_type: 'executable',
    });

    const createPost = connection.captured.find(
      (r) => r.method === 'POST' && r.url.includes('/programs/programs'),
    );
    expect(createPost).toBeDefined();
  });
});

describe('CreateProgramLow program_type guard (regression: Known-remaining #2 — low-level sibling)', () => {
  for (const [type, dedicated] of REJECTED) {
    it(`refuses program_type '${type}' and creates nothing, pointing at ${dedicated}`, async () => {
      const connection = new FakeConnection();
      const context = { connection, logger: undefined } as any;

      const result = await handleCreateProgramLow(context, {
        program_name: 'ZSAH_PROG_TEST',
        description: 'ZSAH_PROG_TEST',
        package_name: '$TMP',
        program_type: type,
      });

      expect(result.isError).toBeTruthy();
      expect(JSON.stringify(result)).toContain(dedicated);
      // Nothing was created — the guard fired before any SAP round-trip.
      expect(connection.captured.length).toBe(0);
    });
  }

  it("lets a supported program_type ('executable') reach the create POST", async () => {
    const connection = new FakeConnection();
    const context = { connection, logger: undefined } as any;

    await handleCreateProgramLow(context, {
      program_name: 'ZSAH_PROG_TEST',
      description: 'ZSAH_PROG_TEST',
      package_name: '$TMP',
      program_type: 'executable',
      skip_check: true,
    });

    const createPost = connection.captured.find(
      (r) => r.method === 'POST' && r.url.includes('/programs/programs'),
    );
    expect(createPost).toBeDefined();
  });
});
