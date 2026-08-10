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

  it('reports the unsupported `legacy` axis instead of silently pretending it is onprem', () => {
    const p = typeOf([...BASE_ENV, 'SAP_SYSTEM_TYPE=legacy']);
    expect(p.systemType).toBe('cloud');
    expect(p.diagnostics.join('\n')).toContain('SYSTEM_TYPE_LEGACY');
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
