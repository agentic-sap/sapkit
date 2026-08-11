import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { RUNTIME_DIR_NAME } from '../home';
import { resolveProfile, resolveProfileDetailed } from '../resolve';

// ── temp world ──────────────────────────────────────────────────────────────
// Every filesystem-touching test builds a throwaway home + project under
// os.tmpdir(). The real `~/.sapkit` is never read and never written.
const temps: string[] = [];

function mkdtemp(tag: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sapkit-t2-${tag}-`));
  temps.push(dir);
  return dir;
}

/** Credential-free profile body. The URL is a dead loopback port on purpose. */
const BASE_ENV = [
  'SAP_URL=http://127.0.0.1:1',
  'SAP_CLIENT=100',
  'SAP_USERNAME=fixture-user',
  'SAP_PASSWORD=not-a-secret',
];

function writeProfile(home: string, alias: string, lines: readonly string[]): string {
  const dir = path.join(home, 'profiles', alias);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'sap.env');
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

function writeProject(alias: string | null, lines?: readonly string[]): string {
  const project = mkdtemp('proj');
  const runtime = path.join(project, RUNTIME_DIR_NAME);
  fs.mkdirSync(runtime, { recursive: true });
  if (alias !== null) fs.writeFileSync(path.join(runtime, 'active-profile.txt'), `${alias}\n`);
  if (lines) fs.writeFileSync(path.join(runtime, 'sap.env'), `${lines.join('\n')}\n`, 'utf8');
  return project;
}

afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

// ── pointer + home resolution ───────────────────────────────────────────────
describe('resolveProfile — pointer and home', () => {
  it('follows <runtime>/active-profile.txt to <home>/profiles/<alias>/sap.env', () => {
    const home = mkdtemp('home');
    const envPath = writeProfile(home, 'dev1', [...BASE_ENV, 'SAP_TIER=DEV']);
    const project = writeProject('dev1');

    const p = resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home } });

    expect(p.alias).toBe('dev1');
    expect(p.envPath).toBe(envPath);
    expect(p.tier).toBe('DEV');
    expect(p.connection).not.toBeNull();
    expect(p.connection?.baseUrl).toBe('http://127.0.0.1:1');
    expect(p.connection?.client).toBe('100');
  });

  it('uses the runtime directory\'s own sap.env when no pointer exists', () => {
    const home = mkdtemp('home');
    const project = writeProject(null, [...BASE_ENV, 'SAP_TIER=DEV']);

    const p = resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home } });

    expect(p.alias).toBeNull();
    expect(p.envPath).toBe(path.join(project, RUNTIME_DIR_NAME, 'sap.env'));
    expect(p.connection).not.toBeNull();
  });

  it('ignores an empty pointer file and falls through to the local sap.env', () => {
    const home = mkdtemp('home');
    const project = writeProject('', [...BASE_ENV, 'SAP_TIER=DEV']);

    const p = resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home } });

    expect(p.alias).toBeNull();
    expect(p.connection).not.toBeNull();
  });

  // NEGATIVE — the headline fail-closed rule.
  it('starts with NO connection when SAPKIT_HOME_DIR is set but missing, even though a project-local sap.env exists', () => {
    const missingHome = path.join(mkdtemp('home'), 'gone');
    const project = writeProject(null, [...BASE_ENV, 'SAP_TIER=DEV']);
    const decoyHomedir = mkdtemp('decoy');
    writeProfile(path.join(decoyHomedir, RUNTIME_DIR_NAME), 'dev1', [...BASE_ENV, 'SAP_TIER=DEV']);

    const p = resolveProfile({
      cwd: project,
      env: { SAPKIT_HOME_DIR: missingHome },
      homedir: decoyHomedir,
    });

    expect(p.connection).toBeNull();
    expect(p.tier).toBe('UNKNOWN');
    expect(p.envPath).toBeNull();
    expect(p.diagnostics.join('\n')).toContain('ENV_INVALID');
  });

  it('reports PROFILE_NOT_FOUND (no connection) when the alias has no profile directory', () => {
    const home = mkdtemp('home');
    writeProfile(home, 'other', BASE_ENV);
    const project = writeProject('dev1');

    const p = resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home } });

    expect(p.connection).toBeNull();
    expect(p.tier).toBe('UNKNOWN');
    expect(p.alias).toBe('dev1');
    const text = p.diagnostics.join('\n');
    expect(text).toContain('PROFILE_NOT_FOUND');
    // the diagnostic names the aliases that DO exist
    expect(text).toContain('other');
  });

  it('starts inspection-only when there is no runtime directory at all', () => {
    const home = mkdtemp('home');
    const project = mkdtemp('bare');

    const p = resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home } });

    expect(p.connection).toBeNull();
    expect(p.tier).toBe('UNKNOWN');
    expect(p.envPath).toBeNull();
    expect(p.diagnostics.length).toBeGreaterThan(0);
  });
});

// ── MCP_ENV_PATH injection ──────────────────────────────────────────────────
describe('resolveProfile — MCP_ENV_PATH injection', () => {
  it('honours an injected env-file path', () => {
    const home = mkdtemp('home');
    const injected = writeProfile(home, 'injected', [...BASE_ENV, 'SAP_TIER=DEV']);
    const project = mkdtemp('bare');

    const p = resolveProfile({ cwd: project, env: { MCP_ENV_PATH: injected } });

    expect(p.envPath).toBe(injected);
    expect(p.connection).not.toBeNull();
    expect(p.tier).toBe('DEV');
    expect(p.alias).toBeNull();
  });

  it('prefers the injection over its own pointer resolution', () => {
    const home = mkdtemp('home');
    writeProfile(home, 'dev1', [...BASE_ENV, 'SAP_TIER=DEV', 'SAP_CLIENT=100']);
    const injected = writeProfile(home, 'injected', [...BASE_ENV, 'SAP_TIER=QA', 'SAP_CLIENT=200']);
    const project = writeProject('dev1');

    const p = resolveProfile({
      cwd: project,
      env: { SAPKIT_HOME_DIR: home, MCP_ENV_PATH: injected },
    });

    expect(p.envPath).toBe(injected);
    expect(p.tier).toBe('QA');
    expect(p.connection?.client).toBe('200');
  });

  // NEGATIVE — a broken injection does not fall back either.
  it('starts with no connection when MCP_ENV_PATH points at a missing file', () => {
    const home = mkdtemp('home');
    writeProfile(home, 'dev1', [...BASE_ENV, 'SAP_TIER=DEV']);
    const project = writeProject('dev1');

    const p = resolveProfile({
      cwd: project,
      env: { SAPKIT_HOME_DIR: home, MCP_ENV_PATH: path.join(home, 'nope.env') },
    });

    expect(p.connection).toBeNull();
    expect(p.tier).toBe('UNKNOWN');
    expect(p.diagnostics.join('\n')).toContain('ENV_PATH_MISSING');
  });
});

// ── explicit env-file option ────────────────────────────────────────────────
// The shipped shim deliberately does NOT translate `--env-path` / `--mcp` into
// MCP_ENV_PATH, so those channels reach this layer only as an explicit option.
describe('resolveProfile — explicit envPath option', () => {
  it('beats MCP_ENV_PATH', () => {
    const home = mkdtemp('home');
    const injected = writeProfile(home, 'injected', [...BASE_ENV, 'SAP_TIER=QA']);
    const explicit = writeProfile(home, 'explicit', [...BASE_ENV, 'SAP_TIER=DEV']);
    const project = writeProject('dev1');

    const p = resolveProfile({
      cwd: project,
      env: { SAPKIT_HOME_DIR: home, MCP_ENV_PATH: injected },
      envPath: explicit,
    });

    expect(p.envPath).toBe(explicit);
    expect(p.tier).toBe('DEV');
  });

  it('beats the pointer when MCP_ENV_PATH is absent', () => {
    const home = mkdtemp('home');
    writeProfile(home, 'dev1', [...BASE_ENV, 'SAP_TIER=DEV', 'SAP_CLIENT=100']);
    const explicit = writeProfile(home, 'explicit', [...BASE_ENV, 'SAP_TIER=QA', 'SAP_CLIENT=200']);
    const project = writeProject('dev1');

    const p = resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home }, envPath: explicit });

    expect(p.envPath).toBe(explicit);
    expect(p.connection?.client).toBe('200');
    expect(p.alias).toBeNull();
  });

  it('leaves MCP_ENV_PATH in charge when no envPath is given', () => {
    const home = mkdtemp('home');
    const injected = writeProfile(home, 'injected', [...BASE_ENV, 'SAP_TIER=QA']);
    const project = writeProject('dev1');

    const p = resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home, MCP_ENV_PATH: injected } });

    expect(p.envPath).toBe(injected);
    expect(p.tier).toBe('QA');
  });

  it('ignores a blank envPath and keeps the ordinary resolution', () => {
    const home = mkdtemp('home');
    const envPath = writeProfile(home, 'dev1', [...BASE_ENV, 'SAP_TIER=DEV']);
    const project = writeProject('dev1');

    const p = resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home }, envPath: '  ' });

    expect(p.envPath).toBe(envPath);
    expect(p.alias).toBe('dev1');
  });

  // NEGATIVE — an explicit path that is not there does not fall back either.
  it('starts with no connection when the explicit envPath is missing', () => {
    const home = mkdtemp('home');
    writeProfile(home, 'dev1', [...BASE_ENV, 'SAP_TIER=DEV']);
    const project = writeProject('dev1');

    const p = resolveProfile({
      cwd: project,
      env: { SAPKIT_HOME_DIR: home },
      envPath: path.join(home, 'nope.env'),
    });

    expect(p.connection).toBeNull();
    expect(p.tier).toBe('UNKNOWN');
    expect(p.diagnostics.join('\n')).toContain('ENV_PATH_MISSING');
  });
});

// ── tier ────────────────────────────────────────────────────────────────────
describe('resolveProfile — tier', () => {
  function tierOf(value: string | null): string {
    const home = mkdtemp('home');
    const lines = value === null ? BASE_ENV : [...BASE_ENV, `SAP_TIER=${value}`];
    writeProfile(home, 'a', lines);
    const project = writeProject('a');
    return resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home } }).tier;
  }

  it('resolves DEV/QA/PRD case-insensitively', () => {
    expect(tierOf('dev')).toBe('DEV');
    expect(tierOf('  Qa ')).toBe('QA');
    expect(tierOf('PRD')).toBe('PRD');
  });

  // NEGATIVE — an absent or unreadable tier is UNKNOWN, never DEV.
  it('resolves an absent SAP_TIER to UNKNOWN (fail-closed)', () => {
    expect(tierOf(null)).toBe('UNKNOWN');
  });

  it('resolves an unrecognised SAP_TIER to UNKNOWN (fail-closed)', () => {
    expect(tierOf('production')).toBe('UNKNOWN');
    expect(tierOf('')).toBe('UNKNOWN');
  });
});

// ── connection payload ──────────────────────────────────────────────────────
describe('resolveProfile — connection payload', () => {
  function build(lines: readonly string[]) {
    const home = mkdtemp('home');
    writeProfile(home, 'a', lines);
    const project = writeProject('a');
    return resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home } });
  }

  it('applies the documented timeout defaults', () => {
    const p = build([...BASE_ENV, 'SAP_TIER=DEV']);
    expect(p.connection?.timeouts).toEqual({ default: 45000, csrf: 15000, long: 60000 });
  });

  it('honours SAP_TIMEOUT_DEFAULT / _CSRF / _LONG overrides', () => {
    const p = build([
      ...BASE_ENV,
      'SAP_TIER=DEV',
      'SAP_TIMEOUT_DEFAULT=1000',
      'SAP_TIMEOUT_CSRF=2000',
      'SAP_TIMEOUT_LONG=3000',
    ]);
    expect(p.connection?.timeouts).toEqual({ default: 1000, csrf: 2000, long: 3000 });
  });

  it('ignores a non-numeric timeout and keeps the default', () => {
    const p = build([...BASE_ENV, 'SAP_TIER=DEV', 'SAP_TIMEOUT_DEFAULT=soon']);
    expect(p.connection?.timeouts.default).toBe(45000);
  });

  it('rejects unauthorized TLS by default and only opens it for TLS_REJECT_UNAUTHORIZED=0', () => {
    expect(build([...BASE_ENV, 'SAP_TIER=DEV']).connection?.rejectUnauthorized).toBe(true);
    expect(
      build([...BASE_ENV, 'SAP_TIER=DEV', 'TLS_REJECT_UNAUTHORIZED=0']).connection
        ?.rejectUnauthorized,
    ).toBe(false);
    expect(
      build([...BASE_ENV, 'SAP_TIER=DEV', 'TLS_REJECT_UNAUTHORIZED=1']).connection
        ?.rejectUnauthorized,
    ).toBe(true);
  });

  it('carries SAP_LANGUAGE through and leaves it undefined when absent', () => {
    expect(build([...BASE_ENV, 'SAP_LANGUAGE=en']).connection?.language).toBe('en');
    expect(build([...BASE_ENV]).connection?.language).toBeUndefined();
  });

  // NEGATIVE — an incomplete profile does not become a half-built connection.
  it('produces no connection when SAP_URL is missing', () => {
    const p = build(['SAP_USERNAME=fixture-user', 'SAP_PASSWORD=not-a-secret', 'SAP_TIER=DEV']);
    expect(p.connection).toBeNull();
    expect(p.tier).toBe('UNKNOWN');
    expect(p.diagnostics.join('\n')).toContain('SAP_URL');
  });

  it('produces no connection when the credentials are missing', () => {
    const p = build(['SAP_URL=http://127.0.0.1:1', 'SAP_CLIENT=100', 'SAP_TIER=DEV']);
    expect(p.connection).toBeNull();
    expect(p.diagnostics.join('\n')).toContain('INCOMPLETE_CONNECTION');
  });

  // NEGATIVE — a `keychain:` reference that cannot be resolved must not become
  // the password. Sending the reference produced repeated failed logons against
  // a real system and locked the account (2026-08-11).
  describe('keychain reference (fail-closed)', () => {
    const withRef = (ref: string) => [
      'SAP_URL=http://127.0.0.1:1',
      'SAP_CLIENT=100',
      'SAP_USERNAME=fixture-user',
      `SAP_PASSWORD=${ref}`,
      'SAP_TIER=DEV',
    ];

    it('builds no connection when the reference is malformed', () => {
      const p = build(withRef('keychain:no-slash'));
      expect(p.connection).toBeNull();
      expect(p.tier).toBe('UNKNOWN');
      expect(p.diagnostics.join('\n')).toContain('KEYCHAIN_REF_INVALID');
    });

    // The property that matters, stated directly: whatever goes wrong, the
    // reference string is never what we would authenticate with.
    //
    // Which failure code appears depends on the machine — a host with a working
    // keychain reports ENTRY_NOT_FOUND, a headless CI box reports UNAVAILABLE.
    // So this case asserts only what is true on every machine, and the
    // code-level branches are pinned deterministically in `secrets.test.ts`
    // through the injected reader. Asserting a loose alternation here would
    // pass without ever entering the branch it claims to cover.
    it.each([
      ['malformed', 'keychain:no-slash'],
      ['well-formed but unresolvable', 'keychain:sapkit-absent/no-such-account'],
    ])('never puts the reference in the password slot — %s', (_label, ref) => {
      const p = build(withRef(ref));
      expect(p.connection).toBeNull();
      expect(p.connection?.password).toBeUndefined();
      expect(p.tier).toBe('UNKNOWN');
      expect(p.diagnostics.join('\n')).toContain('KEYCHAIN_');
    });

    it('leaves a plaintext password untouched', () => {
      const p = build([...BASE_ENV, 'SAP_TIER=DEV']);
      expect(p.connection?.password).toBe('not-a-secret');
    });
  });
});

// ── deployment axis ─────────────────────────────────────────────────────────
describe('resolveProfile — deployment axis', () => {
  function typeOf(lines: readonly string[]) {
    const home = mkdtemp('home');
    writeProfile(home, 'a', lines);
    const project = writeProject('a');
    return resolveProfile({ cwd: project, env: { SAPKIT_HOME_DIR: home } });
  }

  it('defaults SAP_SYSTEM_TYPE to cloud', () => {
    expect(typeOf([...BASE_ENV, 'SAP_TIER=DEV']).systemType).toBe('cloud');
  });

  it('honours onprem', () => {
    expect(typeOf([...BASE_ENV, 'SAP_SYSTEM_TYPE=OnPrem']).systemType).toBe('onprem');
  });

  // `legacy` is a third axis value in its own right, not a synonym for cloud:
  // folding it in would expose the wrong tool set (the measured engine computes
  // legacy|onprem|cloud and its handlers declare `available_in: legacy`).
  it('honours legacy as its own axis rather than folding it into cloud', () => {
    const p = typeOf([...BASE_ENV, 'SAP_SYSTEM_TYPE=Legacy']);
    expect(p.systemType).toBe('legacy');
    expect(p.diagnostics.join('\n')).not.toContain('SYSTEM_TYPE_LEGACY');
  });

  it('still defaults an unrecognised axis value to cloud', () => {
    expect(typeOf([...BASE_ENV, 'SAP_SYSTEM_TYPE=hana-cloud-ish']).systemType).toBe('cloud');
  });

  it('defaults to cloud with no profile at all', () => {
    const project = mkdtemp('bare');
    expect(resolveProfile({ cwd: project, env: {}, homedir: mkdtemp('home') }).systemType).toBe(
      'cloud',
    );
  });
});

// ── raw env vars for the safety layer ───────────────────────────────────────
describe('resolveProfileDetailed', () => {
  it('exposes the raw profile env so the safety knobs in sap.env can be honoured', () => {
    const home = mkdtemp('home');
    writeProfile(home, 'a', [
      ...BASE_ENV,
      'SAP_TIER=DEV',
      'MCP_BLOCKLIST_EXTEND=ZSECRET,ZP*',
      'MCP_ALLOW_TABLE=BNKA',
    ]);
    const project = writeProject('a');

    const { profile, envVars } = resolveProfileDetailed({
      cwd: project,
      env: { SAPKIT_HOME_DIR: home },
    });

    expect(profile.tier).toBe('DEV');
    expect(envVars.MCP_BLOCKLIST_EXTEND).toBe('ZSECRET,ZP*');
    expect(envVars.MCP_ALLOW_TABLE).toBe('BNKA');
  });

  it('returns an empty env map when nothing resolved', () => {
    const { profile, envVars } = resolveProfileDetailed({
      cwd: mkdtemp('bare'),
      env: {},
      homedir: mkdtemp('home'),
    });
    expect(profile.connection).toBeNull();
    expect(envVars).toEqual({});
  });
});
