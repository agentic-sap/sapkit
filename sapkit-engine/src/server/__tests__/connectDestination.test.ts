/**
 * 기동 경로의 토큰 한 걸음 — **실 UAA 없이.**
 *
 * UAA 왕복은 전송 이음매(`HttpTransport`)를 목으로 갈아 끼워 돌고, 이 파일에서
 * 나가는 네트워크 요청은 0이다. 재는 것은 셋이다:
 *
 *  ① `client_credentials` 선언 키에서 **기동이 첫 토큰을 받아 Bearer 접속을
 *     세우는가**(D-114 ⓑ).
 *  ② 실패가 **그 자리에서 끝나고**(fail-closed) 그 진단이 「무엇이 실패했고
 *     사람이 다음에 무엇을 하는가」를 실제로 말하는가(D-114 ⓓ).
 *  ③ **기존 경로에 자국이 0인가** — Basic 기동·`--env` 기동·
 *     `authorization_code` destination은 받은 상태를 **그대로**(같은 객체로)
 *     돌려받는다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { HttpTransportError } from '../../adt/http';
import { mockTransport, tokenBody } from '../../auth/__tests__/helpers';
import { connectDestination } from '../connectDestination';
import { resolveStartup } from '../startup';
import type { Startup } from '../startup';
import { argvOf, cleanupTempDirs, tempDir, writeEnvFile, writeProfile } from './fixtures';

afterEach(() => {
  cleanupTempDirs();
});

const FAKE_SECRET = 'fixture-not-a-real-secret';
const FAKE_TOKEN = 'not-a-real-access-token';
/** 2026-01-01T00:00:00Z. 만료 문구를 글자로 대조하려고 시각을 고정한다. */
const NOW = Date.parse('2026-01-01T00:00:00.000Z');

function storeRoot(): string {
  const root = tempDir('sapkit-store-');
  fs.mkdirSync(path.join(root, 'service-keys'), { recursive: true });
  fs.mkdirSync(path.join(root, 'sessions'), { recursive: true });
  return root;
}

function serviceKey(overrides: Record<string, unknown> = {}, withServiceUrl = true): unknown {
  return {
    uaa: {
      url: 'https://uaa.invalid/oauth',
      clientid: 'fixture-client',
      clientsecret: FAKE_SECRET,
      ...overrides,
    },
    ...(withServiceUrl
      ? { abap: { url: 'http://127.0.0.1:1', client: '100', language: 'EN' } }
      : {}),
  };
}

/** `--mcp=DEST1`로 기동한 **해석 결과**. 아직 토큰은 없다. */
function mcpStartup(body: unknown): Startup {
  const root = storeRoot();
  fs.writeFileSync(
    path.join(root, 'service-keys', 'DEST1.json'),
    JSON.stringify(body, null, 2),
    'utf8',
  );
  return resolveStartup({
    argv: argvOf('--mcp=DEST1'),
    env: { AUTH_BROKER_PATH: root },
    cwd: tempDir(),
    homedir: tempDir(),
  });
}

// ── ⓐ client_credentials — 기동이 첫 토큰을 받는다 ───────────────────────────

describe('connectDestination — client_credentials 성공 경로', () => {
  async function connect(responses: Parameters<typeof mockTransport>[0]) {
    const startup = mcpStartup(serviceKey({ granttype: 'client_credentials' }));
    const mock = mockTransport(responses);
    const connected = await connectDestination(startup, {
      transport: mock.transport,
      now: () => NOW,
    });
    return { before: startup, after: connected, mock };
  }

  it('토큰을 받아 Bearer 접속을 세운다', async () => {
    const { before, after } = await connect([tokenBody()]);

    expect(before.profile.connection).toBeNull();
    const connection = after.profile.connection;
    expect(connection).not.toBeNull();
    if (!connection) return;
    expect(connection.authType).toBe('jwt');
    expect(connection.jwtToken).toBe(FAKE_TOKEN);
    expect(connection.baseUrl).toBe('http://127.0.0.1:1');
    expect(connection.client).toBe('100');
    expect(connection.language).toBe('EN');
    // 뒤 판이 갱신을 얹을 수 있게 재료는 접속에 실려 간다.
    expect(connection.uaa).toEqual({
      url: 'https://uaa.invalid/oauth',
      clientId: 'fixture-client',
      clientSecret: FAKE_SECRET,
    });
    // service key에는 TLS 노브가 없다 — 검증은 켠 채로 둔다.
    expect(connection.rejectUnauthorized).toBe(true);
  });

  it('client_credentials 한 번만 나가고, 비밀은 본문이 아니라 헤더로 간다', async () => {
    const { mock } = await connect([tokenBody()]);
    expect(mock.calls).toHaveLength(1);
    expect(mock.nth(0).url).toBe('https://uaa.invalid/oauth/oauth/token');
    expect(mock.form(0).get('grant_type')).toBe('client_credentials');
    expect(mock.nth(0).body ?? '').not.toContain(FAKE_SECRET);
    expect(mock.nth(0).headers.Authorization).toContain('Basic ');
  });

  it('tier는 UNKNOWN으로 남는다 — service key는 tier를 말하지 않는다', async () => {
    const { after } = await connect([tokenBody()]);
    expect(after.profile.tier).toBe('UNKNOWN');
    expect(after.diagnostics.join('\n')).toContain('every write and execution is refused');
  });

  it('한 줄 요약이 다시 쓰인다 — connection=none이 남지 않는다', async () => {
    const { before, after } = await connect([tokenBody()]);
    expect(before.diagnostics.filter((line) => line.startsWith('[sapkit] profile: '))).toHaveLength(
      1,
    );
    const summaries = after.diagnostics.filter((line) => line.startsWith('[sapkit] profile: '));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain('connection=yes');
    // 그리고 그것이 **맨 끝**이다.
    expect(after.diagnostics[after.diagnostics.length - 1]).toBe(summaries[0]);
  });

  it('진단이 무엇이 섰는지·언제 만료되는지·무엇이 아직 안 되는지를 말한다', async () => {
    const { after } = await connect([tokenBody({ expires_in: 3600 })]);
    const joined = after.diagnostics.join('\n');
    expect(joined).toContain('MCP_DESTINATION_CONNECTED');
    expect(joined).toContain('http://127.0.0.1:1');
    expect(joined).toContain('2026-01-01T01:00:00.000Z');
    expect(joined).toContain('startup does not renew it');
    expect(joined).toContain("this process's memory only");
  });

  // D-115 — 토큰 취득은 접속 성립이 아니다. 판M2-b 실측(BTP ABAP trial)에서
  // 이 진단을 낸 바로 그 접속이 ADT 전 경로 401이었다. 진단이 「붙었다」로
  // 읽히면 사람은 원인을 이쪽에서 찾는다 — 원인은 그랜트에 있는데.
  it('진단이 「아직 대상에 보낸 것이 없다」와 401 갈래를 함께 말한다', async () => {
    const { after } = await connect([tokenBody()]);
    const joined = after.diagnostics.join('\n');
    expect(joined).toContain('Nothing has been sent to that system yet');
    expect(joined).toContain('carries no user identity');
    expect(joined).toContain('401');
    // 그리고 「접속이 섰다」로 단언하지 않는다.
    expect(joined).not.toContain('the connection stands as Bearer');
  });

  it('진단에 비밀도 토큰도 실리지 않는다', async () => {
    const { after } = await connect([tokenBody()]);
    const joined = after.diagnostics.join('\n');
    expect(joined).not.toContain(FAKE_SECRET);
    expect(joined).not.toContain(FAKE_TOKEN);
  });
});

// ── ⓑⓒ 실패는 거기서 끝난다 ────────────────────────────────────────────────

describe('connectDestination — 실패는 fail-closed로 끝난다', () => {
  async function fail(response: Parameters<typeof mockTransport>[0][number]) {
    const startup = mcpStartup(serviceKey({ granttype: 'client_credentials' }));
    const mock = mockTransport([response]);
    const after = await connectDestination(startup, {
      transport: mock.transport,
      now: () => NOW,
    });
    return { after, joined: after.diagnostics.join('\n') };
  }

  it('UAA에 닿지 못하면 무엇이 안 닿았고 어디를 봐야 하는지 말한다', async () => {
    const { after, joined } = await fail(
      new HttpTransportError('network', 'connect ECONNREFUSED 127.0.0.1:443'),
    );
    expect(after.profile.connection).toBeNull();
    expect(joined).toContain('MCP_DESTINATION_TOKEN_FAILED');
    expect(joined).toContain('UAA_REQUEST_FAILED');
    expect(joined).toContain('https://uaa.invalid/oauth/oauth/token');
    expect(joined).toContain('DNS, the proxy, and any VPN');
    // 다른 시스템으로 대신 붙지 않는다.
    expect(joined).toContain('does not fall back to another system');
  });

  it('잘못된 비밀(401)이면 자격증명을 지목하고 다시 받아 오라고 말한다', async () => {
    const { after, joined } = await fail({
      status: 401,
      body: JSON.stringify({
        error: 'unauthorized',
        error_description: 'Bad credentials',
      }),
    });
    expect(after.profile.connection).toBeNull();
    expect(joined).toContain('MCP_DESTINATION_TOKEN_FAILED');
    expect(joined).toContain('UAA_REJECTED');
    expect(joined).toContain('HTTP 401');
    expect(joined).toContain('Bad credentials');
    expect(joined).toContain('Re-download the service key from BTP');
    expect(joined).not.toContain(FAKE_SECRET);
  });

  it('2xx인데 쓸 토큰이 없으면 종단점을 의심하라고 말한다', async () => {
    const { after, joined } = await fail({ status: 200, body: JSON.stringify({ ok: true }) });
    expect(after.profile.connection).toBeNull();
    expect(joined).toContain('UAA_RESPONSE_INVALID');
    expect(joined).toContain('XSUAA token endpoint');
  });

  it('실패 사유가 프로파일 진단에도 남는다 — 도구가 받는 거절문에 실린다', async () => {
    const { after } = await fail(new HttpTransportError('timeout', 'timed out'));
    expect(after.profile.diagnostics.join('\n')).toContain('MCP_DESTINATION_TOKEN_FAILED');
  });

  it('실패해도 한 줄 요약은 하나이고 connection=none 그대로다', async () => {
    const { after } = await fail(new HttpTransportError('network', 'boom'));
    const summaries = after.diagnostics.filter((line) => line.startsWith('[sapkit] profile: '));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain('connection=none');
  });

  it('노출 집합은 흔들리지 않는다 — inspection-only로 기동한다', async () => {
    const { after } = await fail(new HttpTransportError('network', 'boom'));
    expect(after.sets).toEqual(['readonly', 'high']);
  });
});

// ── ⓓⓔ 손대지 않는 갈래 — 자국 0 ───────────────────────────────────────────

describe('connectDestination — 손대지 않는 갈래는 같은 객체를 돌려준다', () => {
  /** 목을 주되 **한 건도 준비하지 않는다** — 한 번이라도 나가면 던진다. */
  function noCalls() {
    return mockTransport([]);
  }

  it('authorization_code destination은 시작조차 하지 않는다', async () => {
    const startup = mcpStartup(serviceKey());
    const mock = noCalls();
    const after = await connectDestination(startup, { transport: mock.transport });
    expect(after).toBe(startup);
    expect(mock.calls).toHaveLength(0);
    expect(after.diagnostics.join('\n')).toContain('MCP_DESTINATION_TOKEN_PENDING');
  });

  it('명시적으로 authorization_code를 선언해도 마찬가지다', async () => {
    const startup = mcpStartup(serviceKey({ granttype: 'authorization_code' }));
    const mock = noCalls();
    expect(await connectDestination(startup, { transport: mock.transport })).toBe(startup);
    expect(mock.calls).toHaveLength(0);
  });

  it('service URL이 없으면 client_credentials여도 토큰을 부르지 않는다', async () => {
    const startup = mcpStartup(serviceKey({ granttype: 'client_credentials' }, false));
    const mock = noCalls();
    expect(await connectDestination(startup, { transport: mock.transport })).toBe(startup);
    expect(mock.calls).toHaveLength(0);
    expect(startup.diagnostics.join('\n')).toContain('MCP_DESTINATION_NO_SERVICE_URL');
  });

  // 회귀 0의 근거 — 기존 기동은 이 걸음을 **통과만** 한다.
  it('Basic 프로파일 기동은 그대로 지나간다 (회귀 0)', async () => {
    const home = tempDir();
    const cwd = tempDir();
    writeProfile({ home, cwd, alias: 'dev1', env: { SAP_TIER: 'DEV' } });
    const startup = resolveStartup({
      argv: argvOf(),
      env: { SAPKIT_HOME_DIR: home },
      cwd,
      homedir: tempDir(),
    });
    expect(startup.profile.connection).not.toBeNull();

    const mock = noCalls();
    const after = await connectDestination(startup, { transport: mock.transport });
    expect(after).toBe(startup);
    expect(mock.calls).toHaveLength(0);
    expect(after.profile.connection?.authType).toBeUndefined();
  });

  it('--env 세션 파일 기동도 그대로 지나간다', async () => {
    const root = storeRoot();
    writeEnvFile(path.join(root, 'sessions', 'DEST1.env'), { SAP_TIER: 'DEV' });
    const startup = resolveStartup({
      argv: argvOf('--env=DEST1'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    const mock = noCalls();
    expect(await connectDestination(startup, { transport: mock.transport })).toBe(startup);
    expect(mock.calls).toHaveLength(0);
  });

  it('프로파일이 아예 없는 기동도 그대로 지나간다', async () => {
    const startup = resolveStartup({
      argv: argvOf(),
      env: {},
      cwd: tempDir(),
      homedir: tempDir(),
    });
    const mock = noCalls();
    expect(await connectDestination(startup, { transport: mock.transport })).toBe(startup);
    expect(mock.calls).toHaveLength(0);
  });
});
