import {
  DEFAULT_BLOCKLIST_PROFILE,
  checkTables,
  evaluateTables,
  readBlocklistConfig,
  resolveSafetyEnv,
} from '../blocklist';

const cfg = (env: Record<string, string | undefined> = {}) => readBlocklistConfig(env);

const hitTables = (names: string[], env?: Record<string, string | undefined>) =>
  checkTables(names, cfg(env)).hits.map((h) => h.table);

describe('readBlocklistConfig — profile selection', () => {
  it('defaults to standard when no knob is set (the floor stays locked)', () => {
    expect(DEFAULT_BLOCKLIST_PROFILE).toBe('standard');
    expect(cfg().profile).toBe('standard');
  });

  it('accepts the four supported values, case-insensitively', () => {
    expect(cfg({ MCP_BLOCKLIST_PROFILE: 'off' }).profile).toBe('off');
    expect(cfg({ MCP_BLOCKLIST_PROFILE: 'MINIMAL' }).profile).toBe('minimal');
    expect(cfg({ MCP_BLOCKLIST_PROFILE: ' strict ' }).profile).toBe('strict');
    expect(cfg({ MCP_BLOCKLIST_PROFILE: 'standard' }).profile).toBe('standard');
  });

  // NEGATIVE — a typo must not open the guard.
  it('falls back to standard for an unsupported value (fail-safe, not fail-open)', () => {
    expect(cfg({ MCP_BLOCKLIST_PROFILE: 'bogus-value' }).profile).toBe('standard');
    expect(cfg({ MCP_BLOCKLIST_PROFILE: '' }).profile).toBe('standard');
  });
});

describe('checkTables — built-in profiles', () => {
  it('standard denies banking/PII tables and asks for protected business data', () => {
    const { hits } = checkTables(['BNKA', 'VBRK', 'ZSAPKIT_FREE'], cfg());
    expect(hits.map((h) => h.table)).toEqual(['BNKA', 'VBRK']);
    expect(hits.find((h) => h.table === 'BNKA')?.action).toBe('deny');
    expect(hits.find((h) => h.table === 'VBRK')?.action).toBe('ask');
  });

  it('minimal covers PII and credentials only', () => {
    const env = { MCP_BLOCKLIST_PROFILE: 'minimal' };
    expect(hitTables(['BNKA'], env)).toEqual(['BNKA']);
    expect(hitTables(['KNA1', 'USR02', 'ADRC'], env)).toEqual(['KNA1', 'USR02', 'ADRC']);
    expect(hitTables(['VBRK'], env)).toEqual([]); // standard tier
    expect(hitTables(['BALDAT'], env)).toEqual([]); // strict tier
  });

  it('strict adds the audit/security and communication tiers', () => {
    const env = { MCP_BLOCKLIST_PROFILE: 'strict' };
    expect(hitTables(['BALDAT'], env)).toEqual(['BALDAT']);
    expect(hitTables(['SOOD'], env)).toEqual(['SOOD']);
    expect(hitTables(['BNKA'], env)).toEqual(['BNKA']);
  });

  it('off disables the guard entirely', () => {
    const env = { MCP_BLOCKLIST_PROFILE: 'off' };
    expect(hitTables(['BNKA', 'VBRK', 'BALDAT'], env)).toEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(hitTables(['bnka'])).toEqual(['BNKA']);
  });

  it('expands `*` wildcards inside the built-in list (HR payroll)', () => {
    expect(hitTables(['PA0001', 'PA0008', 'HRP1000'])).toEqual(['PA0001', 'PA0008', 'HRP1000']);
    expect(hitTables(['PARTNER_Z'])).toEqual(['PARTNER_Z']); // PA* is deliberately broad
  });

  it('de-duplicates repeated names', () => {
    expect(hitTables(['BNKA', 'bnka'])).toEqual(['BNKA']);
  });

  it('lets an unlisted table through', () => {
    expect(hitTables(['ZSAPKIT_FREE', 'ZDEMO'])).toEqual([]);
  });
});

describe('checkTables — MCP_BLOCKLIST_EXTEND', () => {
  it('denies extra names and wildcard patterns', () => {
    const env = { MCP_BLOCKLIST_EXTEND: 'ZSAPKIT_SECRET,ZP*' };
    expect(hitTables(['ZSAPKIT_SECRET'], env)).toEqual(['ZSAPKIT_SECRET']);
    expect(hitTables(['ZPSAPKIT'], env)).toEqual(['ZPSAPKIT']);
    expect(hitTables(['ZSAPKIT_FREE'], env)).toEqual([]);
  });

  it('marks extended hits as a hard deny', () => {
    const { hits } = checkTables(['ZSAPKIT_SECRET'], cfg({ MCP_BLOCKLIST_EXTEND: 'ZSAPKIT_SECRET' }));
    expect(hits[0]?.action).toBe('deny');
    expect(hits[0]?.category).toContain('extend');
  });

  it('accepts whitespace-separated lists too', () => {
    expect(hitTables(['ZA', 'ZB'], { MCP_BLOCKLIST_EXTEND: 'ZA ZB' })).toEqual(['ZA', 'ZB']);
  });

  it('does not apply when the profile is off', () => {
    expect(
      hitTables(['ZSAPKIT_SECRET'], {
        MCP_BLOCKLIST_PROFILE: 'off',
        MCP_BLOCKLIST_EXTEND: 'ZSAPKIT_SECRET',
      }),
    ).toEqual([]);
  });
});

describe('checkTables — MCP_ALLOW_TABLE', () => {
  it('lets ONLY the named table through and audits the bypass', () => {
    const result = checkTables(['BNKA', 'KNA1'], cfg({ MCP_ALLOW_TABLE: 'BNKA' }));
    expect(result.hits.map((h) => h.table)).toEqual(['KNA1']); // still blocked
    expect(result.bypassed).toEqual(['BNKA']);
    expect(result.audit.join('\n')).toContain('MCP_ALLOW_TABLE bypass for BNKA');
  });

  // NEGATIVE — the allowlist is exact, not a family opener.
  it('does not open a whole family from one allowed name', () => {
    const result = checkTables(['BNKA', 'KNBK', 'LFBK'], cfg({ MCP_ALLOW_TABLE: 'BNKA' }));
    expect(result.hits.map((h) => h.table)).toEqual(['KNBK', 'LFBK']);
  });

  it('is case-insensitive', () => {
    expect(checkTables(['BNKA'], cfg({ MCP_ALLOW_TABLE: 'bnka' })).hits).toEqual([]);
  });
});

describe('evaluateTables', () => {
  it('passes when nothing matches', () => {
    expect(evaluateTables(['ZSAPKIT_FREE'], cfg(), false).verdict.kind).toBe('pass');
  });

  // NEGATIVE — a deny-tier table is refused outright.
  it('denies a deny-tier table', () => {
    const r = evaluateTables(['BNKA'], cfg(), false);
    expect(r.verdict.kind).toBe('deny');
    expect(r.verdict.kind === 'deny' && r.verdict.message).toContain('row extraction refused');
    expect(r.verdict.kind === 'deny' && r.verdict.message).toContain('BNKA');
  });

  // NEGATIVE — acknowledging does NOT unlock a deny-tier table.
  it('still denies a deny-tier table when acknowledge_risk is set', () => {
    expect(evaluateTables(['BNKA'], cfg(), true).verdict.kind).toBe('deny');
  });

  // NEGATIVE — an ask-tier table without acknowledgement is refused.
  it('asks for confirmation on an ask-tier table', () => {
    const r = evaluateTables(['VBRK'], cfg(), false);
    expect(r.verdict.kind).toBe('ask');
    expect(r.verdict.kind === 'ask' && r.verdict.message).toContain(
      'user confirmation required for row extraction',
    );
  });

  it('approves an ask-tier table once acknowledged, and says so for the audit log', () => {
    const r = evaluateTables(['VBRK'], cfg(), true);
    expect(r.verdict.kind).toBe('approved');
    expect(r.verdict.kind === 'approved' && r.verdict.tables).toEqual(['VBRK']);
  });

  it('lets deny outrank ask when both are present', () => {
    expect(evaluateTables(['VBRK', 'BNKA'], cfg(), true).verdict.kind).toBe('deny');
  });

  it('names the active profile in the refusal so the operator can see the floor', () => {
    const r = evaluateTables(['BALDAT'], cfg({ MCP_BLOCKLIST_PROFILE: 'strict' }), false);
    expect(r.verdict.kind === 'deny' && r.verdict.message).toContain('profile: strict');
  });
});

// DELIBERATE DIFFERENCE from the measured engine, and one the repo's own gate
// already records as its `want` value: `interactive/scripts/
// conformance-server-gates.mjs` GAP-2 documents that the old loader deleted
// MCP_BLOCKLIST_PROFILE / MCP_BLOCKLIST_EXTEND / MCP_ALLOW_TABLE out of
// process.env at startup, leaving the active profile's sap.env as their only
// working channel — a value set in an MCP server definition was silently
// ignored. Here both channels work, but **the process environment may only
// tighten**: loosening belongs to the profile file. See resolveSafetyEnv's doc
// comment for the measurement that forced the asymmetry.
describe('resolveSafetyEnv', () => {
  it('takes a tightening level from the process environment when the profile is silent', () => {
    const merged = resolveSafetyEnv({ MCP_BLOCKLIST_PROFILE: 'strict' }, {});
    expect(readBlocklistConfig(merged).profile).toBe('strict');
  });

  it('takes a tightening extend list from the process environment', () => {
    const merged = resolveSafetyEnv({ MCP_BLOCKLIST_EXTEND: 'ZSECRET' }, {});
    const config = readBlocklistConfig(merged);
    expect(checkTables(['ZSECRET'], config).hits.map((h) => h.table)).toEqual(['ZSECRET']);
  });

  it('unions the extend lists so neither channel erases the other', () => {
    const merged = resolveSafetyEnv({ MCP_BLOCKLIST_EXTEND: 'ZFROM_PROC' }, { MCP_BLOCKLIST_EXTEND: 'ZFROM_FILE' });
    const config = readBlocklistConfig(merged);
    expect(checkTables(['ZFROM_PROC', 'ZFROM_FILE'], config).hits.map((h) => h.table).sort()).toEqual([
      'ZFROM_FILE',
      'ZFROM_PROC',
    ]);
  });

  // ── 여기부터가 바닥선의 소유권 ──────────────────────────────────────────
  it('refuses a loosening level from the process environment when the profile is silent', () => {
    const merged = resolveSafetyEnv({ MCP_BLOCKLIST_PROFILE: 'off' }, {});
    expect(readBlocklistConfig(merged).profile).toBe(DEFAULT_BLOCKLIST_PROFILE);
  });

  it('refuses a loosening level from the process environment even against an explicit profile value', () => {
    const merged = resolveSafetyEnv({ MCP_BLOCKLIST_PROFILE: 'off' }, { MCP_BLOCKLIST_PROFILE: 'strict' });
    expect(readBlocklistConfig(merged).profile).toBe('strict');
  });

  it('never takes MCP_ALLOW_TABLE from the process environment — not even when the profile is silent', () => {
    const merged = resolveSafetyEnv({ MCP_ALLOW_TABLE: 'BNKA' }, {});
    expect(merged.MCP_ALLOW_TABLE).toBeUndefined();
    expect(readBlocklistConfig(merged).allow.has('BNKA')).toBe(false);
  });

  it('takes MCP_ALLOW_TABLE from the profile file, and only from there', () => {
    const merged = resolveSafetyEnv({ MCP_ALLOW_TABLE: 'KNA1' }, { MCP_ALLOW_TABLE: 'BNKA' });
    const config = readBlocklistConfig(merged);
    expect(config.allow.has('BNKA')).toBe(true);
    expect(config.allow.has('KNA1')).toBe(false);
  });

  it('honours an explicit profile-file opt-out', () => {
    const merged = resolveSafetyEnv({}, { MCP_BLOCKLIST_PROFILE: 'off' });
    expect(readBlocklistConfig(merged).profile).toBe('off');
  });

  it('leaves unrelated variables alone', () => {
    const merged = resolveSafetyEnv({ PATH: '/bin' }, {});
    expect(merged.PATH).toBe('/bin');
  });
});
