/**
 * 서버 코어 시험의 공용 fixture.
 *
 * 실 SAP도 자식 프로세스도 쓰지 않는다 — 프로파일은 임시 디렉터리의 파일이고,
 * 접속 계층은 주입된 가짜다.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ConnectionConfig } from '../../contracts';
import type { AdtClient } from '../../adt';

const created: string[] = [];

/** 시험이 끝나면 지워지는 임시 디렉터리. */
export function tempDir(prefix = 'sapkit-server-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  while (created.length > 0) {
    const dir = created.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // 임시 디렉터리 정리 실패는 시험 결과가 아니다.
    }
  }
}

/** 완전한 sap.env 한 장을 쓴다. 비밀은 없다 — 죽은 루프백 주소와 더미 값뿐이다. */
export function writeEnvFile(
  file: string,
  overrides: Readonly<Record<string, string>> = {},
): string {
  const values: Record<string, string> = {
    SAP_URL: 'http://127.0.0.1:1',
    SAP_USERNAME: 'FIXTURE',
    SAP_PASSWORD: 'fixture-not-a-secret',
    SAP_CLIENT: '100',
    SAP_TIER: 'DEV',
    ...overrides,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    'utf8',
  );
  return file;
}

/** `<home>/profiles/<alias>/sap.env` + `<cwd>/.sapkit/active-profile.txt`. */
export function writeProfile(options: {
  readonly home: string;
  readonly cwd: string;
  readonly alias: string;
  readonly env?: Readonly<Record<string, string>>;
}): string {
  const envPath = path.join(options.home, 'profiles', options.alias, 'sap.env');
  writeEnvFile(envPath, options.env ?? {});
  const runtimeDir = path.join(options.cwd, '.sapkit');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, 'active-profile.txt'), options.alias, 'utf8');
  return envPath;
}

/** 셰임이 재조립하는 모양 그대로의 argv — `[node, script, ...rest]`. */
export function argvOf(...rest: string[]): string[] {
  return ['/usr/bin/node', '/app/sapkit-engine/entry.js', ...rest];
}

export interface FakeConnection {
  /** 접속 계층이 몇 번 만들어졌는지. 게이트 배선 시험의 단언 대상이다. */
  calls: ConnectionConfig[];
  factory: (config: ConnectionConfig) => AdtClient;
}

/**
 * 접속을 만들지 않는 가짜 접속 공장.
 *
 * 게이트가 접속 **앞에** 서 있는지를 판정하는 계측기다 — 막힌 호출은
 * `calls`를 한 줄도 늘리지 않아야 한다.
 */
export function fakeConnectionFactory(): FakeConnection {
  const calls: ConnectionConfig[] = [];
  return {
    calls,
    factory(config: ConnectionConfig): AdtClient {
      calls.push(config);
      return { fake: true } as unknown as AdtClient;
    },
  };
}
