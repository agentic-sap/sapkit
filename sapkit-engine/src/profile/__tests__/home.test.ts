import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { RUNTIME_DIR_NAME, resolveHomeDir } from '../home';

const temps: string[] = [];

function mkdtemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-t2-home-'));
  temps.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

describe('resolveHomeDir', () => {
  it('uses SAPKIT_HOME_DIR when it is set and exists', () => {
    const home = mkdtemp();
    expect(resolveHomeDir({ env: { SAPKIT_HOME_DIR: home }, homedir: mkdtemp() })).toEqual({
      kind: 'ok',
      dir: home,
      source: 'env',
    });
  });

  // NEGATIVE — a broken pin is terminal, never a silent fallback.
  it('refuses a SAPKIT_HOME_DIR that does not exist instead of falling back', () => {
    const homedir = mkdtemp();
    const missing = path.join(mkdtemp(), 'gone');
    const result = resolveHomeDir({ env: { SAPKIT_HOME_DIR: missing }, homedir });
    expect(result.kind).toBe('env-invalid');
    expect(result.dir).toBe(missing);
    // the default home is NOT offered as a substitute
    expect(result.dir).not.toBe(path.join(homedir, RUNTIME_DIR_NAME));
  });

  it('treats an empty SAPKIT_HOME_DIR as unset', () => {
    const homedir = mkdtemp();
    expect(resolveHomeDir({ env: { SAPKIT_HOME_DIR: '' }, homedir })).toEqual({
      kind: 'ok',
      dir: path.join(homedir, RUNTIME_DIR_NAME),
      source: 'default',
    });
  });

  it('falls back to <homedir>/.sapkit when SAPKIT_HOME_DIR is unset', () => {
    const homedir = mkdtemp();
    expect(resolveHomeDir({ env: {}, homedir })).toEqual({
      kind: 'ok',
      dir: path.join(homedir, RUNTIME_DIR_NAME),
      source: 'default',
    });
  });

  it('names the runtime directory `.sapkit`', () => {
    expect(RUNTIME_DIR_NAME).toBe('.sapkit');
  });
});
