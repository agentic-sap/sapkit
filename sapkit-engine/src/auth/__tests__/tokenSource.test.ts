import * as fs from 'node:fs';
import * as path from 'node:path';

import { AuthError } from '../errors';
import { TokenSource } from '../tokenSource';
import { UaaClient } from '../uaa';
import type { TokenSet } from '../uaa';
import { fakeUaa, mockTransport, tokenBody } from './helpers';

const NOW = 1_700_000_000_000;

function seed(overrides: Partial<TokenSet> = {}): TokenSet {
  return {
    accessToken: 'seed-access-token',
    refreshToken: 'seed-refresh-token',
    tokenType: 'bearer',
    expiresAtMs: NOW + 3_600_000,
    scope: null,
    ...overrides,
  };
}

async function rejection(work: Promise<unknown>): Promise<AuthError> {
  try {
    await work;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    return error as AuthError;
  }
  throw new Error('던지지 않았다 — 실패로 다뤄야 하는 갈래다');
}

describe('TokenSource — 캐시와 60초 버퍼', () => {
  it('충분히 남은 토큰은 그대로 쓴다 — 왕복이 없다', async () => {
    const mock = mockTransport([]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport }),
      seed: seed(),
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('seed-access-token');
    expect(await source.accessToken()).toBe('seed-access-token');
    expect(mock.calls).toHaveLength(0);
  });

  it('만료된 토큰은 갱신한다', async () => {
    const mock = mockTransport([tokenBody({ access_token: 'renewed-token' })]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      seed: seed({ expiresAtMs: NOW - 1 }),
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('renewed-token');
    expect(mock.form(0).get('grant_type')).toBe('refresh_token');
    expect(mock.form(0).get('refresh_token')).toBe('seed-refresh-token');
  });

  it('**버퍼 안에 든 토큰은 아직 살아 있어도 미리 갈아 끼운다**', async () => {
    const mock = mockTransport([tokenBody({ access_token: 'renewed-token' })]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      // 59초 남았다 — 왕복 지연이 이 사이에 들어가면 SAP에서 401이 난다.
      seed: seed({ expiresAtMs: NOW + 59_000 }),
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('renewed-token');
  });

  it('버퍼 밖이면 갱신하지 않는다', async () => {
    const mock = mockTransport([]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport }),
      seed: seed({ expiresAtMs: NOW + 61_000 }),
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('seed-access-token');
    expect(mock.calls).toHaveLength(0);
  });

  it('버퍼는 바꿔 부를 수 있다', async () => {
    const mock = mockTransport([tokenBody({ access_token: 'renewed-token' })]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      seed: seed({ expiresAtMs: NOW + 61_000 }),
      now: () => NOW,
      bufferSeconds: 120,
    });

    expect(await source.accessToken()).toBe('renewed-token');
  });

  it('수명을 모르는 토큰(exp도 expires_in도 없음)은 저절로 갱신하지 않는다', async () => {
    const mock = mockTransport([]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport }),
      seed: seed({ expiresAtMs: null }),
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('seed-access-token');
    expect(mock.calls).toHaveLength(0);
  });
});

describe('TokenSource — 갱신 실패는 재로그인으로 넘어가지 않는다', () => {
  it('갱신이 거절되면 UAA_REFRESH_FAILED로 끝난다', async () => {
    const mock = mockTransport([
      { status: 401, body: JSON.stringify({ error: 'invalid_token' }) },
    ]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport }),
      seed: seed({ expiresAtMs: NOW - 1 }),
      now: () => NOW,
    });

    expect((await rejection(source.accessToken())).code).toBe('UAA_REFRESH_FAILED');
  });

  it('**갱신 실패가 처음 취득 갈래로 흘러내리지 않는다** — acquire를 부르지 않는다', async () => {
    const mock = mockTransport([
      { status: 401, body: JSON.stringify({ error: 'invalid_token' }) },
    ]);
    let acquireCalls = 0;
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport }),
      seed: seed({ expiresAtMs: NOW - 1 }),
      acquire: async () => {
        acquireCalls += 1;
        return seed({ accessToken: 'should-not-be-used' });
      },
      now: () => NOW,
    });

    await rejection(source.accessToken());
    expect(acquireCalls).toBe(0);
    // client_credentials로 조용히 갈아타지도 않았다 — 왕복은 갱신 한 번뿐이다.
    expect(mock.calls).toHaveLength(1);
    expect(mock.form(0).get('grant_type')).toBe('refresh_token');
  });

  it('갱신 재료(UAA 클라이언트)가 없으면 AUTH_NO_REFRESH_MATERIAL', async () => {
    const source = new TokenSource({ seed: seed({ expiresAtMs: NOW - 1 }), now: () => NOW });

    expect((await rejection(source.accessToken())).code).toBe('AUTH_NO_REFRESH_MATERIAL');
  });

  it('갱신 실패 뒤에도 다음 호출은 다시 갱신을 시도한다(같은 실패가 반복될 뿐)', async () => {
    const mock = mockTransport([
      { status: 401, body: JSON.stringify({ error: 'invalid_token' }) },
      { status: 401, body: JSON.stringify({ error: 'invalid_token' }) },
    ]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport }),
      seed: seed({ expiresAtMs: NOW - 1 }),
      now: () => NOW,
    });

    await rejection(source.accessToken());
    await rejection(source.accessToken());
    expect(mock.calls).toHaveLength(2);
  });
});

describe('TokenSource — 처음 취득', () => {
  it('씨앗도 갱신 토큰도 없으면 acquire를 쓴다', async () => {
    let calls = 0;
    const source = new TokenSource({
      acquire: async () => {
        calls += 1;
        return seed({ accessToken: 'first-token', refreshToken: null });
      },
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('first-token');
    expect(calls).toBe(1);
  });

  it('acquire가 없으면 client_credentials로 받는다', async () => {
    const mock = mockTransport([tokenBody({ access_token: 'cc-token' })]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('cc-token');
    expect(mock.form(0).get('grant_type')).toBe('client_credentials');
  });

  it('아무 재료도 없으면 AUTH_NO_REFRESH_MATERIAL', async () => {
    const source = new TokenSource({ now: () => NOW });
    expect((await rejection(source.accessToken())).code).toBe('AUTH_NO_REFRESH_MATERIAL');
  });

  it('씨앗이 갱신 토큰을 갖고 있으면 처음부터 갱신 갈래다', async () => {
    const mock = mockTransport([tokenBody({ access_token: 'renewed' })]);
    let acquireCalls = 0;
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      seed: seed({ expiresAtMs: NOW - 1 }),
      acquire: async () => {
        acquireCalls += 1;
        return seed();
      },
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('renewed');
    expect(acquireCalls).toBe(0);
  });
});

describe('TokenSource — 갱신 토큰 회전', () => {
  it('새 갱신 토큰이 오면 그것을 쓴다', async () => {
    const mock = mockTransport([
      tokenBody({ access_token: 'a1', refresh_token: 'rotated-1', expires_in: 1 }),
      tokenBody({ access_token: 'a2', refresh_token: 'rotated-2', expires_in: 1 }),
    ]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      seed: seed({ expiresAtMs: NOW - 1 }),
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('a1');
    expect(mock.form(0).get('refresh_token')).toBe('seed-refresh-token');
    // 1초짜리라 버퍼 안 — 다음 호출이 다시 갱신한다.
    expect(await source.accessToken()).toBe('a2');
    expect(mock.form(1).get('refresh_token')).toBe('rotated-1');
  });

  it('**회전하지 않는 종단점이면 기존 갱신 토큰을 계속 쓴다** — 버리면 다음 갱신이 불가능해진다', async () => {
    const mock = mockTransport([
      tokenBody({ access_token: 'a1', expires_in: 1 }),
      tokenBody({ access_token: 'a2', expires_in: 1 }),
    ]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      seed: seed({ expiresAtMs: NOW - 1 }),
      now: () => NOW,
    });

    await source.accessToken();
    await source.accessToken();
    expect(mock.form(1).get('refresh_token')).toBe('seed-refresh-token');
  });
});

describe('TokenSource — 동시 호출과 무효화', () => {
  it('동시에 불러도 왕복은 한 번이다', async () => {
    const mock = mockTransport([tokenBody({ access_token: 'once' })]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      seed: seed({ expiresAtMs: NOW - 1 }),
      now: () => NOW,
    });

    const [a, b, c] = await Promise.all([
      source.accessToken(),
      source.accessToken(),
      source.accessToken(),
    ]);

    expect([a, b, c]).toEqual(['once', 'once', 'once']);
    expect(mock.calls).toHaveLength(1);
  });

  it('invalidate()는 접근 토큰만 버리고 갱신 재료는 남긴다', async () => {
    const mock = mockTransport([tokenBody({ access_token: 'after-invalidate' })]);
    const source = new TokenSource({
      client: new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW }),
      seed: seed(),
      now: () => NOW,
    });

    expect(await source.accessToken()).toBe('seed-access-token');
    source.invalidate();

    expect(await source.accessToken()).toBe('after-invalidate');
    expect(mock.form(0).get('grant_type')).toBe('refresh_token');
    expect(mock.form(0).get('refresh_token')).toBe('seed-refresh-token');
  });
});

describe('TokenSource.status — 진단에 비밀이 없다', () => {
  it('수명과 갱신 가능 여부를 말하되 토큰은 담지 않는다', () => {
    const source = new TokenSource({ seed: seed({ expiresAtMs: NOW + 120_000 }), now: () => NOW });
    const status = source.status();

    expect(status).toEqual({
      hasToken: true,
      expiresAtMs: NOW + 120_000,
      remainingMs: 120_000,
      needsRenewal: false,
      renewable: true,
    });
    expect(JSON.stringify(status)).not.toContain('seed-access-token');
    expect(JSON.stringify(status)).not.toContain('seed-refresh-token');
  });

  it('버퍼 안에 들면 needsRenewal이 참이다', () => {
    const source = new TokenSource({ seed: seed({ expiresAtMs: NOW + 30_000 }), now: () => NOW });
    expect(source.status().needsRenewal).toBe(true);
  });

  it('토큰도 재료도 없으면 갱신 불가로 보고한다', () => {
    expect(new TokenSource({ now: () => NOW }).status()).toEqual({
      hasToken: false,
      expiresAtMs: null,
      remainingMs: null,
      needsRenewal: true,
      renewable: false,
    });
  });
});

// ── 무상태 — 토큰이 디스크로 나가는 경로가 **코드에 없다** ──────────────────
//
// 이 주장은 시험 하나로 재현하기 어렵다(쓰지 않는 것을 어떻게 보이는가). 그래서
// 원천에서 본다 — 인증 계층 모듈 어느 것도 파일 시스템을 부르지 않는다. 구
// 부품은 세션 저장소를 갖고 `--unsafe`에서 실제로 파일을 썼고, 신이 그것을
// 승계하지 않았다는 것이 이 계층의 설계 결정이다.
describe('인증 계층 — 디스크로 나가는 경로가 없다', () => {
  const authDir = path.resolve(__dirname, '..');

  it('어느 모듈도 파일 시스템을 부르지 않는다', () => {
    const modules = fs
      .readdirSync(authDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);

    expect(modules).toEqual(
      expect.arrayContaining(['tokenSource.ts', 'uaa.ts', 'callback.ts', 'jwt.ts', 'errors.ts']),
    );

    for (const name of modules) {
      const source = fs.readFileSync(path.join(authDir, name), 'utf8');
      // 주석에는 `node:fs` 이야기가 나올 수 있으므로 import 문만 본다.
      const imports = source
        .split('\n')
        .filter((line) => /^\s*import\b/.test(line))
        .join('\n');
      expect({ module: name, hasFs: /['"]node:fs['"]/.test(imports) }).toEqual({
        module: name,
        hasFs: false,
      });
      expect({ module: name, hasKeyring: /keyring|keytar|keychain/i.test(imports) }).toEqual({
        module: name,
        hasKeyring: false,
      });
    }
  });
});
