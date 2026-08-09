/**
 * Unit tests for src/lib/profile.ts
 *
 * Uses temp dirs for the project cwd and a stubbed HOME (via os.homedir mock)
 * so the tests never touch the real ~/.sapkit.
 *
 * `.sapkit` is the only runtime generation: the pre-0.6 `.sc4sap` directory and
 * the `SC4SAP_HOME_DIR` variable were a migration-period fallback and have been
 * removed. The conformance block below is driven by the shared fixture.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function makeTempHome(): string {
  // SAPKIT_HOME_DIR points directly at the `.sapkit` directory, so we don't
  // need to nest one more level inside the temp dir.
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-home-'));
}
function makeTempCwd(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-proj-'));
}

function writeFile(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function writeProfile(home: string, alias: string, envContent: string): string {
  const envPath = path.join(home, 'profiles', alias, 'sap.env');
  writeFile(envPath, envContent);
  return envPath;
}

function writeActivePointer(cwd: string, alias: string): string {
  const p = path.join(cwd, '.sapkit', 'active-profile.txt');
  writeFile(p, alias);
  return p;
}

/** The single-profile `<runtime dir>/sap.env` mode (no alias pointer). */
function writeLegacy(cwd: string, envContent: string): string {
  const p = path.join(cwd, '.sapkit', 'sap.env');
  writeFile(p, envContent);
  return p;
}

describe('profile — load and apply', () => {
  const ORIGINAL_ENV = { ...process.env };
  let home: string;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('SAP_')) delete process.env[k];
    }
    home = makeTempHome();
    process.env.SAPKIT_HOME_DIR = home;
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns an empty shell when no active-profile and no legacy sap.env exist', () => {
    const cwd = makeTempCwd();
    try {
      const { loadActiveProfile } = require('../../lib/profile');
      const loaded = loadActiveProfile(cwd);
      expect(loaded.alias).toBeUndefined();
      expect(loaded.envVars).toEqual({});
      expect(loaded.tier).toBe('DEV');
      expect(loaded.readonly).toBe(false);
      expect(loaded.legacy).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed (UNKNOWN/readonly) for a legacy sap.env with no SAP_TIER', () => {
    // Was "DEV default": a loaded connection whose tier is unresolved is now
    // read-only. Only an explicit SAP_TIER=dev opens write tools (next test).
    const cwd = makeTempCwd();
    try {
      writeLegacy(cwd, 'SAP_URL=http://legacy.corp:50000\nSAP_CLIENT=100\n');
      const { loadActiveProfile } = require('../../lib/profile');
      const loaded = loadActiveProfile(cwd);
      expect(loaded.alias).toBeUndefined();
      expect(loaded.legacy).toBe(true);
      expect(loaded.envVars.SAP_URL).toBe('http://legacy.corp:50000');
      expect(loaded.envVars.SAP_CLIENT).toBe('100');
      expect(loaded.tier).toBe('UNKNOWN');
      expect(loaded.readonly).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('opens DEV for a legacy sap.env that explicitly sets SAP_TIER=dev', () => {
    const cwd = makeTempCwd();
    try {
      writeLegacy(cwd, 'SAP_URL=http://legacy.corp:50000\nSAP_TIER=dev\n');
      const { loadActiveProfile } = require('../../lib/profile');
      const loaded = loadActiveProfile(cwd);
      expect(loaded.tier).toBe('DEV');
      expect(loaded.readonly).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('loads a user-level profile when active-profile.txt points to it', () => {
    const cwd = makeTempCwd();
    try {
      writeProfile(
        home,
        'HK-DEV',
        'SAP_URL=http://dev.hk.corp:50000\nSAP_CLIENT=100\nSAP_TIER=DEV\nSAP_DESCRIPTION=HK Development\n',
      );
      writeActivePointer(cwd, 'HK-DEV');
      const { loadActiveProfile } = require('../../lib/profile');
      const loaded = loadActiveProfile(cwd);
      expect(loaded.alias).toBe('HK-DEV');
      expect(loaded.legacy).toBe(false);
      expect(loaded.envVars.SAP_URL).toBe('http://dev.hk.corp:50000');
      expect(loaded.tier).toBe('DEV');
      expect(loaded.readonly).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('marks QA profile as readonly', () => {
    const cwd = makeTempCwd();
    try {
      writeProfile(home, 'HK-QA', 'SAP_URL=http://qa.hk.corp\nSAP_TIER=QA\n');
      writeActivePointer(cwd, 'HK-QA');
      const { loadActiveProfile } = require('../../lib/profile');
      const loaded = loadActiveProfile(cwd);
      expect(loaded.tier).toBe('QA');
      expect(loaded.readonly).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('marks PRD profile as readonly', () => {
    const cwd = makeTempCwd();
    try {
      writeProfile(
        home,
        'HK-PRD',
        'SAP_URL=http://prd.hk.corp\nSAP_TIER=PRD\n',
      );
      writeActivePointer(cwd, 'HK-PRD');
      const { loadActiveProfile } = require('../../lib/profile');
      const loaded = loadActiveProfile(cwd);
      expect(loaded.tier).toBe('PRD');
      expect(loaded.readonly).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('accepts lowercase / whitespace in SAP_TIER', () => {
    const cwd = makeTempCwd();
    try {
      writeProfile(home, 'HK-QA', 'SAP_URL=http://qa\nSAP_TIER=  qa  \n');
      writeActivePointer(cwd, 'HK-QA');
      const { loadActiveProfile } = require('../../lib/profile');
      expect(loadActiveProfile(cwd).tier).toBe('QA');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed (UNKNOWN/readonly) for an unrecognized SAP_TIER value', () => {
    // Was "unknown → DEV for backward compatibility": unknown tiers now fail
    // closed so a typo (STG, PROD, …) can never silently open write tools.
    const cwd = makeTempCwd();
    try {
      writeProfile(home, 'X', 'SAP_URL=http://x\nSAP_TIER=STG\n');
      writeActivePointer(cwd, 'X');
      const { loadActiveProfile } = require('../../lib/profile');
      const loaded = loadActiveProfile(cwd);
      expect(loaded.tier).toBe('UNKNOWN');
      expect(loaded.readonly).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('throws when active-profile.txt points at a missing profile', () => {
    const cwd = makeTempCwd();
    try {
      writeActivePointer(cwd, 'MISSING');
      const { loadActiveProfile } = require('../../lib/profile');
      expect(() => loadActiveProfile(cwd)).toThrow(/MISSING/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('resolves keychain:<service>/<account> in SAP_PASSWORD', () => {
    const cwd = makeTempCwd();
    try {
      jest.doMock(
        '@napi-rs/keyring',
        () => ({
          Entry: class {
            constructor(
              public service: string,
              public account: string,
            ) {}
            getPassword() {
              if (
                this.service === 'sc4sap' &&
                this.account === 'HK-DEV/DEVELOPER'
              ) {
                return 'RESOLVED_PASSWORD';
              }
              return null;
            }
            setPassword() {
              /* noop */
            }
            deletePassword() {
              return false;
            }
          },
        }),
        { virtual: true },
      );
      writeProfile(
        home,
        'HK-DEV',
        'SAP_URL=http://dev\nSAP_USERNAME=DEVELOPER\nSAP_PASSWORD=keychain:sc4sap/HK-DEV/DEVELOPER\nSAP_TIER=DEV\n',
      );
      writeActivePointer(cwd, 'HK-DEV');
      const { loadActiveProfile } = require('../../lib/profile');
      const loaded = loadActiveProfile(cwd);
      expect(loaded.envVars.SAP_PASSWORD).toBe('RESOLVED_PASSWORD');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('applyProfile overwrites process.env and caches the tier', () => {
    const cwd = makeTempCwd();
    try {
      process.env.SAP_URL = 'http://stale';
      process.env.SAP_TIER = 'DEV';
      writeProfile(
        home,
        'HK-PRD',
        'SAP_URL=http://prd\nSAP_TIER=PRD\nSAP_CLIENT=400\n',
      );
      writeActivePointer(cwd, 'HK-PRD');
      const {
        activateProfile,
        getActiveTier,
        getActiveAlias,
        isReadOnlyTier,
        __resetProfileState,
      } = require('../../lib/profile');
      __resetProfileState();

      const loaded = activateProfile(cwd);
      expect(loaded.alias).toBe('HK-PRD');
      expect(process.env.SAP_URL).toBe('http://prd');
      expect(process.env.SAP_CLIENT).toBe('400');
      expect(process.env.SAP_TIER).toBe('PRD');
      expect(getActiveTier()).toBe('PRD');
      expect(getActiveAlias()).toBe('HK-PRD');
      expect(isReadOnlyTier()).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('applyProfile clears stale SAP_* keys before writing new ones', () => {
    const cwd = makeTempCwd();
    try {
      process.env.SAP_URL = 'http://old';
      process.env.SAP_JWT_TOKEN = 'old-jwt';
      process.env.SAP_INDUSTRY = 'old-industry';
      writeProfile(home, 'X', 'SAP_URL=http://new\nSAP_TIER=DEV\n');
      writeActivePointer(cwd, 'X');
      const {
        activateProfile,
        __resetProfileState,
      } = require('../../lib/profile');
      __resetProfileState();
      activateProfile(cwd);
      expect(process.env.SAP_URL).toBe('http://new');
      // Stale keys wiped:
      expect(process.env.SAP_JWT_TOKEN).toBeUndefined();
      expect(process.env.SAP_INDUSTRY).toBeUndefined();
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  // Tier reconciliation for --env-path / MCP_ENV_PATH connections, whose
  // SAP_TIER the launcher hydrates into process.env (no .sapkit profile).
  describe('reconcileTierFromEnv', () => {
    it('opens DEV when process.env.SAP_TIER=dev', () => {
      const {
        reconcileTierFromEnv,
        getActiveTier,
        isReadOnlyTier,
        __resetProfileState,
      } = require('../../lib/profile');
      __resetProfileState();
      process.env.SAP_TIER = 'dev';
      expect(reconcileTierFromEnv()).toBe('DEV');
      expect(getActiveTier()).toBe('DEV');
      expect(isReadOnlyTier()).toBe(false);
    });

    it('fails closed to UNKNOWN/readonly when SAP_TIER is absent', () => {
      const {
        reconcileTierFromEnv,
        getActiveTier,
        isReadOnlyTier,
        __resetProfileState,
      } = require('../../lib/profile');
      __resetProfileState();
      delete process.env.SAP_TIER;
      expect(reconcileTierFromEnv()).toBe('UNKNOWN');
      expect(getActiveTier()).toBe('UNKNOWN');
      expect(isReadOnlyTier()).toBe(true);
    });

    it('fails closed to UNKNOWN for an unrecognized SAP_TIER value', () => {
      const {
        reconcileTierFromEnv,
        __resetProfileState,
      } = require('../../lib/profile');
      __resetProfileState();
      process.env.SAP_TIER = 'staging';
      expect(reconcileTierFromEnv()).toBe('UNKNOWN');
    });

    it('resolves QA and PRD from process.env.SAP_TIER (case-insensitive)', () => {
      const {
        reconcileTierFromEnv,
        __resetProfileState,
      } = require('../../lib/profile');
      __resetProfileState();
      process.env.SAP_TIER = 'qa';
      expect(reconcileTierFromEnv()).toBe('QA');
      process.env.SAP_TIER = 'PRD';
      expect(reconcileTierFromEnv()).toBe('PRD');
    });
  });
});

// ---------------------------------------------------------------------------
// Runtime-path resolution conformance (D-057 / design §7-3).
//
// Driven by the shared fixture engine/__tests__/fixtures/runtime-dir-selection.json,
// which the interactive-layer Node runner reads too. Expected results differ per
// consumer on purpose: each consumer keeps its own depth / adoption criterion /
// state definition, so the question is "does each consumer resolve its own way
// correctly?", never "do they all agree?".
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../__tests__/fixtures/runtime-dir-selection.json',
);

interface EngineExpectation {
  throws?: string | null;
  envSubset?: Record<string, string>;
  [key: string]: unknown;
}

interface FixtureCase {
  id: string;
  axis: string;
  title: string;
  input: {
    dirs?: string[];
    files?: Record<string, string>;
    cwd?: string;
    env?: Record<string, string | null>;
  };
  consumers: Record<
    string,
    { expected: EngineExpectation | null; note?: string }
  >;
}

/** Keys whose expected value is a filesystem path and needs native separators. */
const PATH_KEYS = new Set(['runtimeDir', 'sourcePath', 'homeDir']);

describe('profile — runtime-path resolution conformance (fixture)', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const cases: FixtureCase[] = fixture.cases;
  const ORIGINAL_ENV = { ...process.env };

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fixture is well-formed', () => {
    expect(Array.isArray(cases)).toBe(true);
    expect(cases.length).toBeGreaterThan(0);
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of cases) {
      // Every consumer named in the schema must have an entry, so a missing
      // expectation is always a deliberate `null` + note, never an omission.
      for (const consumer of [
        'engine',
        'launch',
        'profile-resolve',
        'tier-guard',
        'blocklist',
      ]) {
        expect(c.consumers[consumer]).toBeDefined();
        if (c.consumers[consumer].expected === null) {
          expect(typeof c.consumers[consumer].note).toBe('string');
        }
      }
    }
  });

  for (const testCase of cases) {
    const expected = testCase.consumers.engine?.expected ?? null;
    const runner = expected === null ? it.skip : it;

    runner(`${testCase.id} — ${testCase.title}`, () => {
      const projectRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'sapkit-fx-proj-'),
      );
      const fakeHome = fs.mkdtempSync(
        path.join(os.tmpdir(), 'sapkit-fx-home-'),
      );
      const cwd = path.resolve(projectRoot, testCase.input.cwd ?? '.');

      // Placeholders inside file CONTENT stay in forward-slash form: a Windows
      // path pasted raw into JSON would produce invalid escape sequences, and
      // path.resolve() normalizes forward slashes anyway.
      const expandContent = (s: string) =>
        s
          .replace(/\$PROJECT/g, projectRoot.replace(/\\/g, '/'))
          .replace(/\$HOME/g, fakeHome.replace(/\\/g, '/'))
          .replace(/\$CWD/g, cwd.replace(/\\/g, '/'));
      const expandPath = (s: string) =>
        path.normalize(
          s
            .replace(/\$PROJECT/g, projectRoot)
            .replace(/\$HOME/g, fakeHome)
            .replace(/\$CWD/g, cwd),
        );

      try {
        for (const dir of testCase.input.dirs ?? []) {
          fs.mkdirSync(expandPath(dir), { recursive: true });
        }
        for (const [p, content] of Object.entries(testCase.input.files ?? {})) {
          const target = expandPath(p);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, expandContent(content));
        }
        fs.mkdirSync(cwd, { recursive: true });

        process.env = { ...ORIGINAL_ENV };
        for (const k of Object.keys(process.env)) {
          if (k.startsWith('SAP_')) delete process.env[k];
        }
        delete process.env.SAPKIT_HOME_DIR;
        for (const [k, v] of Object.entries(testCase.input.env ?? {})) {
          if (v === null) delete process.env[k];
          else process.env[k] = expandPath(v);
        }

        jest.resetModules();
        const realOs = jest.requireActual('node:os');
        jest.doMock('node:os', () => ({
          ...realOs,
          homedir: () => fakeHome,
        }));
        const profile = require('../../lib/profile');

        if (expected.throws) {
          let caught: any;
          try {
            profile.loadActiveProfile(cwd);
          } catch (err) {
            caught = err;
          }
          expect(caught).toBeDefined();
          if (expected.throws === 'MISSING_ENV_FILE') {
            expect(String(caught.message)).toMatch(/missing env file/);
          } else {
            expect(caught.reason).toBe(expected.throws);
          }
          return;
        }

        const loaded = profile.loadActiveProfile(cwd);

        for (const [key, want] of Object.entries(expected)) {
          if (key === 'throws' || key === 'envSubset') continue;
          const got = (loaded as any)[key] ?? null;
          if (PATH_KEYS.has(key) && typeof want === 'string') {
            expect(got).toBe(expandPath(want));
          } else {
            expect({ [key]: got }).toEqual({ [key]: want });
          }
        }
        for (const [k, v] of Object.entries(expected.envSubset ?? {})) {
          expect(loaded.envVars[k]).toBe(v);
        }
      } finally {
        jest.dontMock('node:os');
        fs.rmSync(projectRoot, { recursive: true, force: true });
        fs.rmSync(fakeHome, { recursive: true, force: true });
      }
    });
  }
});

describe('profile — path-resolution helpers', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SAPKIT_HOME_DIR;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('the project runtime dir is <cwd>/.sapkit — a leftover .sc4sap is invisible', () => {
    const cwd = makeTempCwd();
    try {
      // The pre-0.6 directory carries a full connection. After the compat layer
      // was removed it must not be adopted, shadowed, or reported.
      writeFile(
        path.join(cwd, '.sc4sap', 'sap.env'),
        'SAP_URL=http://old\nSAP_TIER=dev\n',
      );
      const {
        resolveProjectRuntimeDir,
        loadActiveProfile,
      } = require('../../lib/profile');
      const picked = resolveProjectRuntimeDir(cwd);
      expect(picked.dir).toBe(path.join(cwd, '.sapkit'));
      expect(picked.reason).toBe('OK_NEW');
      // …and no connection is loaded from it: the empty inspection-only shell.
      const loaded = loadActiveProfile(cwd);
      expect(loaded.envVars).toEqual({});
      expect(loaded.runtimeDir).toBe(path.join(cwd, '.sapkit'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('R-NEW: with no runtime directory the creation site is .sapkit', () => {
    const cwd = makeTempCwd();
    try {
      const { resolveProjectRuntimeDir } = require('../../lib/profile');
      const picked = resolveProjectRuntimeDir(cwd);
      expect(picked.dir).toBe(path.join(cwd, '.sapkit'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('R-ENV: SC4SAP_HOME_DIR is no longer consulted', () => {
    const home = makeTempHome();
    try {
      // The alias exists only under the retired variable's home. With the
      // fallback removed the lookup must fail loudly rather than connect.
      fs.mkdirSync(path.join(home, 'profiles', 'ANY'), { recursive: true });
      process.env.SC4SAP_HOME_DIR = home;
      const { resolveHomeDir } = require('../../lib/profile');
      expect(() => resolveHomeDir('ANY')).toThrow(/not found/);
      try {
        resolveHomeDir('ANY');
      } catch (err: any) {
        expect(err.reason).toBe('PROFILE_NOT_FOUND');
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('R-ENV: a SAPKIT_HOME_DIR pointing nowhere throws ENV_INVALID', () => {
    const home = makeTempHome();
    try {
      process.env.SAPKIT_HOME_DIR = path.join(home, 'nope');
      const { resolveHomeDir, ProfilePathError } = require('../../lib/profile');
      expect(() => resolveHomeDir('ANY')).toThrow(ProfilePathError);
      try {
        resolveHomeDir('ANY');
      } catch (err: any) {
        expect(err.reason).toBe('ENV_INVALID');
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
