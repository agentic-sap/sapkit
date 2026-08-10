import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parseEnvText, readEnvFile } from '../envFile';

const temps: string[] = [];

function tmpFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-t2-env-'));
  temps.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

describe('parseEnvText', () => {
  it('reads KEY=VALUE pairs and trims surrounding whitespace', () => {
    expect(parseEnvText('SAP_URL=http://127.0.0.1:1\n  SAP_CLIENT = 100 \n')).toEqual({
      SAP_URL: 'http://127.0.0.1:1',
      SAP_CLIENT: '100',
    });
  });

  it('ignores blank lines and whole-line comments', () => {
    expect(parseEnvText('\n# a comment\n   # indented comment\nA=1\n')).toEqual({ A: '1' });
  });

  it('strips a leading `export ` so shell-style files parse', () => {
    expect(parseEnvText('export SAP_TIER=DEV\n')).toEqual({ SAP_TIER: 'DEV' });
  });

  it('keeps only the last assignment of a duplicated key', () => {
    expect(parseEnvText('A=1\nA=2\n')).toEqual({ A: '2' });
  });

  it('strips one matching pair of surrounding quotes', () => {
    expect(parseEnvText('A="x y"\nB=\'z\'\nC="unbalanced\n')).toEqual({
      A: 'x y',
      B: 'z',
      C: '"unbalanced',
    });
  });

  it('keeps `=` characters that appear inside the value', () => {
    expect(parseEnvText('A=b=c=d\n')).toEqual({ A: 'b=c=d' });
  });

  it('accepts an empty value', () => {
    expect(parseEnvText('A=\n')).toEqual({ A: '' });
  });

  it('skips lines with no `=` at all', () => {
    expect(parseEnvText('nonsense\nA=1\n')).toEqual({ A: '1' });
  });

  it('handles CRLF line endings', () => {
    expect(parseEnvText('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });
});

describe('readEnvFile', () => {
  it('reads and parses an existing file', () => {
    const file = tmpFile('sap.env', 'SAP_TIER=DEV\n');
    expect(readEnvFile(file)).toEqual({ SAP_TIER: 'DEV' });
  });

  it('returns null when the file cannot be read (no throw)', () => {
    expect(readEnvFile(path.join(os.tmpdir(), 'sapkit-t2-does-not-exist', 'sap.env'))).toBeNull();
  });
});
