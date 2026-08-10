import { readBlocklistConfig } from '../blocklist';
import { evaluateRowDataRequest } from '../rowData';
import { checkTierAllowed } from '../tier';
import { resolveUnsafeFlag } from '../unsafe';

describe('resolveUnsafeFlag', () => {
  it('is off by default', () => {
    expect(resolveUnsafeFlag({ argv: [], env: {} })).toBe(false);
  });

  it('turns on for the --unsafe flag', () => {
    expect(resolveUnsafeFlag({ argv: ['--unsafe'], env: {} })).toBe(true);
  });

  it('turns on for MCP_UNSAFE=true', () => {
    expect(resolveUnsafeFlag({ argv: [], env: { MCP_UNSAFE: 'true' } })).toBe(true);
  });

  // Measured: the old engine compares against the exact string 'true'.
  it('requires the exact string `true` — anything else stays off', () => {
    for (const value of ['TRUE', 'True', '1', 'yes', 'false', '']) {
      expect(resolveUnsafeFlag({ argv: [], env: { MCP_UNSAFE: value } })).toBe(false);
    }
  });
});

// NEGATIVE — MCP_UNSAFE is a session-store switch, not a safety-gate switch.
describe('resolveUnsafeFlag — what it does NOT open', () => {
  it('does not unlock a write on a non-DEV tier', () => {
    process.env.MCP_UNSAFE = 'true';
    try {
      expect(checkTierAllowed({ name: 'CreateProgram', kind: 'mutation' }, 'PRD').allowed).toBe(
        false,
      );
    } finally {
      delete process.env.MCP_UNSAFE;
    }
  });

  it('does not unlock the table blocklist', () => {
    const config = readBlocklistConfig({ MCP_UNSAFE: 'true' });
    expect(config.profile).toBe('standard');
    const d = evaluateRowDataRequest({ tool: 'GetTableContents', tableName: 'BNKA' }, {
      tier: 'DEV',
      config,
    });
    expect(d.kind).toBe('deny');
  });
});
