/**
 * ReloadProfile — inspection-only honesty.
 *
 * When the launcher finds no connection parameters it installs a mock broker
 * and marks the mode on `global`. That broker is captured by the server for the
 * process lifetime, so ReloadProfile cannot revive the connection however
 * correctly the profile is fixed. The tool's name reads like it would, so it
 * must say `restartRequired` instead of reporting a hollow success.
 */

import { handleReloadProfile } from '../../../handlers/system/readonly/handleReloadProfile';

jest.mock('../../../lib/profile', () => ({
  activateProfile: jest.fn(() => ({
    alias: 'DEV1',
    legacy: false,
    tier: 'DEV',
    readonly: false,
    sourcePath: '/tmp/profiles/DEV1/sap.env',
    envVars: { SAP_URL: 'http://sap.example', SAP_CLIENT: '100' },
  })),
}));

jest.mock('../../../lib/utils', () => ({
  invalidateConnectionCache: jest.fn(),
  return_error: jest.fn((e: any) => ({ isError: true, error: e })),
  return_response: jest.fn((r: any) => r),
}));

const FLAG = '__mcpAbapAdtInspectionOnly';

async function reload() {
  const result: any = await handleReloadProfile({} as any, {});
  return JSON.parse(result.data);
}

describe('handleReloadProfile — inspection-only reporting', () => {
  afterEach(() => {
    // Process-global: leaking it would make sibling suites report a restart
    // that never happened.
    delete (global as any)[FLAG];
  });

  it('reports restartRequired with an explanation when the server is inspection-only', async () => {
    (global as any)[FLAG] = true;
    const body = await reload();
    expect(body.ok).toBe(true); // the profile really was reloaded
    expect(body.restartRequired).toBe(true);
    expect(body.note).toMatch(/restarted/);
  });

  it('reports no restart and emits no note on a connected server', async () => {
    const body = await reload();
    expect(body.restartRequired).toBe(false);
    expect('note' in body).toBe(false); // undefined is dropped by JSON.stringify
  });
});
