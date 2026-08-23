/**
 * 기동 경로의 토큰 한 걸음 — **실 UAA 없이.**
 *
 * UAA 왕복은 전송 이음매(`HttpTransport`)를 목으로 갈아 끼워 돌고, 이 파일에서
 * **바깥으로** 나가는 네트워크 요청은 0이다. 인가 콜백만 loopback에서 실제로
 * 뜨는데(그것이 시험 대상이다) 그 포트는 0으로 잡아 임의 할당을 받는다 —
 * 8080을 잡으면 시험이 그 기계의 다른 프로세스와 다툰다. 재는 것은 넷이다:
 *
 *  ① `client_credentials` 선언 키에서 **기동이 첫 토큰을 받아 Bearer 접속을
 *     세우는가**(D-114 ⓑ).
 *  ② `authorization_code` 키에서 **`--auth-interactive`가 있을 때만** 같은 일이
 *     일어나는가(D-117 ⓐ) — 그 플래그가 없으면 오늘과 한 글자도 다르지 않다.
 *  ③ 실패가 **그 자리에서 끝나고**(fail-closed) 그 진단이 「무엇이 실패했고
 *     사람이 다음에 무엇을 하는가」를 실제로 말하는가(D-114 ⓓ · D-117 ⓐ).
 *     실패 갈래마다 사람이 할 일이 다르므로 갈래별로 잰다.
 *  ④ **기존 경로에 자국이 0인가** — Basic 기동·`--env` 기동·브로커 기동·
 *     **플래그 없는** `authorization_code` destination은 받은 상태를
 *     **그대로**(같은 객체로) 돌려받는다.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
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
function mcpStartup(body: unknown, ...extraArgs: string[]): Startup {
  const root = storeRoot();
  fs.writeFileSync(
    path.join(root, 'service-keys', 'DEST1.json'),
    JSON.stringify(body, null, 2),
    'utf8',
  );
  return resolveStartup({
    argv: argvOf('--mcp=DEST1', ...extraArgs),
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
    // 이름이 옮겨졌다 — 이 코드가 아는 것은 취득까지이고 `CONNECTED`는 대상이
    // 그 토큰을 받는 것을 확인한 자리에 예약돼 있다(D-117 ⓖ).
    expect(joined).toContain('MCP_DESTINATION_TOKEN_ACQUIRED');
    expect(joined).not.toContain('MCP_DESTINATION_CONNECTED');
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
    expect(joined).toContain('answer 401 on every path');
    // 그리고 「접속이 섰다」로 단언하지 않는다. `stands`만 잡는다 — 옛 문구의
    // 정확한 철자에만 걸면 「stands as a Bearer」류로 조용히 되살아난다.
    expect(joined).not.toMatch(/connection stands/);
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
    const failed = after.diagnostics.find((line) =>
      line.startsWith('MCP_DESTINATION_TOKEN_FAILED'),
    );
    return { after, joined: after.diagnostics.join('\n'), failed: failed ?? '' };
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
    const { after, joined, failed } = await fail({ status: 200, body: JSON.stringify({ ok: true }) });
    expect(after.profile.connection).toBeNull();
    expect(joined).toContain('UAA_RESPONSE_INVALID');
    expect(joined).toContain('XSUAA token endpoint');
    // D-119 ⓔ — 이 코드의 원인 자리(`uaa.ts`의 「access_token 칸이 없거나 비어
    // 있다」)는 인증 계층의 한국어다. `OPAQUE_CAUSE`에 들어 있어야 영문 진단에
    // 섞이지 않는다. 두 그랜트 모두에서 도달하는 갈래이고, 여기가 재기 쉬운 쪽이다.
    expect(failed).not.toMatch(/[가-힣]/);
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

// ── ⓑ authorization_code — 플래그가 있을 때만 ───────────────────────────────

const FAKE_CODE = 'not-a-real-authorization-code';

/** 인가 URL 안의 `redirect_uri`로 **콜백 한 번**을 실제로 쏜다. loopback뿐이다. */
function hitCallback(
  authorizeUrl: string,
  overrides: Record<string, string> = {},
): Promise<void> {
  const authorize = new URL(authorizeUrl);
  const redirect = new URL(authorize.searchParams.get('redirect_uri') ?? '');
  const params: Record<string, string> = {
    code: FAKE_CODE,
    state: authorize.searchParams.get('state') ?? '',
    ...overrides,
  };
  for (const [name, value] of Object.entries(params)) redirect.searchParams.set(name, value);

  return new Promise<void>((resolve, reject) => {
    const request = http.get(redirect.toString(), (response) => {
      response.resume();
      response.on('end', () => resolve());
    });
    request.on('error', reject);
  });
}

/** 자리를 미리 차지한 loopback 서버 하나. 포트 점유 갈래의 재료다. */
async function occupyPort(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => res.end('busy'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe('connectDestination — authorization_code + --auth-interactive (D-117 ⓐ)', () => {
  /** 콜백 포트는 0(임의 할당)이고 인가 URL은 목이 받는다. */
  async function login(
    responses: Parameters<typeof mockTransport>[0],
    open?: (url: string) => void | Promise<void>,
  ) {
    const startup = mcpStartup(
      serviceKey({ granttype: 'authorization_code' }),
      '--auth-interactive',
    );
    const mock = mockTransport(responses);
    const seen: string[] = [];
    const after = await connectDestination(startup, {
      transport: mock.transport,
      now: () => NOW,
      callbackHost: '127.0.0.1',
      callbackPort: 0,
      timeoutMs: 5_000,
      openAuthorizeUrl: async (url) => {
        seen.push(url);
        if (open) await open(url);
      },
    });
    return { before: startup, after, mock, seen, joined: after.diagnostics.join('\n') };
  }

  it('사람이 로그인을 마치면 코드를 토큰으로 바꿔 Bearer 접속을 세운다', async () => {
    const { before, after, mock } = await login([tokenBody()], (url) => hitCallback(url));

    expect(before.profile.connection).toBeNull();
    const connection = after.profile.connection;
    expect(connection).not.toBeNull();
    if (!connection) return;
    expect(connection.authType).toBe('jwt');
    expect(connection.jwtToken).toBe(FAKE_TOKEN);
    expect(connection.baseUrl).toBe('http://127.0.0.1:1');
    expect(connection.rejectUnauthorized).toBe(true);
    // tier는 여전히 UNKNOWN이다 — 그랜트가 바뀌어도 service key는 tier를 말하지 않는다.
    expect(after.profile.tier).toBe('UNKNOWN');

    // 왕복은 **코드 교환 한 번**이다.
    expect(mock.calls).toHaveLength(1);
    expect(mock.form(0).get('grant_type')).toBe('authorization_code');
    expect(mock.form(0).get('code')).toBe(FAKE_CODE);
  });

  it('인가 URL은 사람에게 건네질 뿐이다 — 여는 코드가 없고 비밀도 실리지 않는다', async () => {
    const { seen } = await login([tokenBody()], (url) => hitCallback(url));
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0] ?? '');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('fixture-client');
    expect(url.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(seen[0]).not.toContain(FAKE_SECRET);
  });

  it('한 줄 요약이 다시 쓰이고 진단이 그랜트와 핸드셰이크 지연을 말한다', async () => {
    const { after, joined } = await login([tokenBody({ expires_in: 3600 })], (url) =>
      hitCallback(url),
    );
    const summaries = after.diagnostics.filter((line) => line.startsWith('[sapkit] profile: '));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain('connection=yes');
    expect(after.diagnostics[after.diagnostics.length - 1]).toBe(summaries[0]);

    expect(joined).toContain('MCP_DESTINATION_TOKEN_ACQUIRED');
    expect(joined).toContain('acquired a authorization_code token');
    expect(joined).toContain('2026-01-01T01:00:00.000Z');
    // D-117 정직 유보 ⓔ — 기동이 로그인만큼 늦어진다는 사실을 미리 말한다.
    expect(joined).toContain('delays the MCP handshake');
    // 401 안내는 `client_credentials` 전용이다 — 사용자 토큰에는 해당하지 않는다.
    expect(joined).not.toContain('answer 401 on every path');
    expect(joined).toContain('carries a user identity');
  });

  it('진단에 code도 토큰도 비밀도 실리지 않는다 (ⓓ)', async () => {
    const { joined } = await login([tokenBody()], (url) => hitCallback(url));
    expect(joined).not.toContain(FAKE_CODE);
    expect(joined).not.toContain(FAKE_TOKEN);
    expect(joined).not.toContain(FAKE_SECRET);
  });
});

// ── ⓒ authorization_code 실패 4종 — 갈래마다 사람이 할 일이 다르다 ──────────

describe('connectDestination — 인터랙티브 로그인 실패는 fail-closed로 끝난다', () => {
  async function login(options: {
    readonly responses?: Parameters<typeof mockTransport>[0];
    readonly open?: (url: string) => void | Promise<void>;
    readonly port?: number;
    readonly timeoutMs?: number;
  }) {
    const startup = mcpStartup(
      serviceKey({ granttype: 'authorization_code' }),
      '--auth-interactive',
    );
    const mock = mockTransport(options.responses ?? []);
    const after = await connectDestination(startup, {
      transport: mock.transport,
      now: () => NOW,
      callbackHost: '127.0.0.1',
      callbackPort: options.port ?? 0,
      timeoutMs: options.timeoutMs ?? 5_000,
      openAuthorizeUrl: async (url) => {
        if (options.open) await options.open(url);
      },
    });
    const failed = after.diagnostics.find((line) =>
      line.startsWith('MCP_DESTINATION_TOKEN_FAILED'),
    );
    return { after, mock, joined: after.diagnostics.join('\n'), failed: failed ?? '' };
  }

  it('시한 안에 콜백이 오지 않으면 되밀지 않고 무엇을 다시 하라고 말한다', async () => {
    const { after, joined, failed } = await login({ timeoutMs: 40 });
    expect(after.profile.connection).toBeNull();
    expect(joined).toContain('MCP_DESTINATION_TOKEN_FAILED');
    expect(joined).toContain('CALLBACK_TIMEOUT');
    expect(joined).toContain('does not push the login again');
    expect(joined).toContain('--auth-interactive');
    expect(joined).toContain('does not fall back to another system');
    // 인증 계층의 한국어 본문이 영문 진단에 섞이지 않는다.
    expect(failed).not.toMatch(/[가-힣]/);
  });

  it('state가 다른 콜백은 이 로그인의 것이 아니라고 말한다', async () => {
    const { after, joined, failed } = await login({
      open: (url) => hitCallback(url, { state: 'a-different-state' }),
    });
    expect(after.profile.connection).toBeNull();
    expect(joined).toContain('CALLBACK_STATE_MISMATCH');
    expect(joined).toContain('did not belong to this login');
    expect(joined).toContain('stale browser tab');
    expect(failed).not.toMatch(/[가-힣]/);
  });

  it('콜백 포트가 점유돼 있으면 조용히 옮기지 않고 그 주소를 지목한다', async () => {
    const busy = await occupyPort();
    try {
      const { after, joined, failed } = await login({ port: busy.port });
      expect(after.profile.connection).toBeNull();
      expect(joined).toContain('CALLBACK_FAILED');
      expect(joined).toContain(`http://127.0.0.1:${busy.port}/callback`);
      expect(joined).toContain('does not quietly move to another one');
      expect(joined).toContain('--callback-port');
      // D-119 ⓕ ⑵ — 나머지 두 갈래에는 있던 단언이 이 갈래에만 없었다.
      // 이 코드는 `OPAQUE_CAUSE`가 아니라 **원인 원문을 끼우는** 갈래라
      // (여기서는 Node의 `listen EADDRINUSE …`) 한글 유입을 상시로 재야 한다.
      expect(failed).not.toMatch(/[가-힣]/);
    } finally {
      await busy.close();
    }
  });

  it('코드 교환이 거절되면 redirect_uri 화이트리스트를 보라고 말한다', async () => {
    const { after, joined } = await login({
      responses: [
        {
          status: 400,
          body: JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Invalid redirect_uri',
          }),
        },
      ],
      open: (url) => hitCallback(url),
    });
    expect(after.profile.connection).toBeNull();
    expect(joined).toContain('UAA_REJECTED');
    expect(joined).toContain('refused the code exchange');
    expect(joined).toContain('redirect_uri');
    expect(joined).toContain('127.0.0.1 and localhost are different values');
    // D-119 ⓓ — D-117 정직 유보 ⓒ가 스스로 예고한 실패 모드(PKCE를 요구하는
    // XSUAA 클라이언트)가 정확히 이 코드로 떨어진다. 안내가 사람을
    // 화이트리스트로만 보내면 그 사람은 고칠 수 없는 것을 계속 고친다.
    expect(joined).toContain('PKCE');
    expect(joined).toContain('code_challenge');
    // `client_credentials` 갈래의 안내(비밀 재발급)가 여기 나오면 오진이다.
    expect(joined).not.toContain('Re-download the service key from BTP');
    expect(joined).not.toContain(FAKE_CODE);
    expect(joined).not.toContain(FAKE_SECRET);
  });

  it('실패해도 요약은 하나이고 connection=none · inspection-only 그대로다', async () => {
    const { after } = await login({ timeoutMs: 40 });
    const summaries = after.diagnostics.filter((line) => line.startsWith('[sapkit] profile: '));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain('connection=none');
    expect(after.sets).toEqual(['readonly', 'high']);
    expect(after.profile.diagnostics.join('\n')).toContain('MCP_DESTINATION_TOKEN_FAILED');
  });

  // ⓖ — 주소는 **기동이 정한 것**이고 이 걸음은 그것을 읽는다. 옵션으로 덮지
  // 않았을 때 argv의 노브가 그대로 콜백 주소가 되는지 잰다.
  it('콜백 주소는 argv의 노브에서 온다 (옵션 주입 없이)', async () => {
    const busy = await occupyPort();
    try {
      const startup = mcpStartup(
        serviceKey({ granttype: 'authorization_code' }),
        '--auth-interactive',
        '--callback-host=127.0.0.1',
        `--callback-port=${busy.port}`,
      );
      expect(startup.authInteractive).toEqual({
        enabled: true,
        callbackHost: '127.0.0.1',
        callbackPort: busy.port,
      });
      const mock = mockTransport([]);
      const after = await connectDestination(startup, {
        transport: mock.transport,
        now: () => NOW,
        timeoutMs: 40,
      });
      expect(after.profile.connection).toBeNull();
      expect(after.diagnostics.join('\n')).toContain(`http://127.0.0.1:${busy.port}/callback`);
    } finally {
      await busy.close();
    }
  });
});

// ── 인가 URL의 **기본** 출력 — 위험 구간 안에서 보이는 유일한 자리 ──────────

/**
 * 다른 시험은 전부 `openAuthorizeUrl`을 목으로 갈아 끼우므로 기본 구현
 * (`printAuthorizeUrl`)의 문면을 아무도 재지 않는다. 그런데 D-119 ⓑ가 경고를
 * 넣은 자리가 바로 그 기본 구현이다 — `bootstrap`이 이 걸음을 transport 연결
 * **전에** await 하므로, 대기 중 사람이 보는 출력은 그 두 줄뿐이다. 그래서
 * 목을 주지 않고 돌린 뒤 `process.stderr.write`를 그 구간 동안만 가로챈다.
 */
describe('connectDestination — 기본 인가 URL 출력 (D-119 ⓑ)', () => {
  it('인가 URL과 함께 핸드셰이크 지연을 미리 말한다', async () => {
    const startup = mcpStartup(
      serviceKey({ granttype: 'authorization_code' }),
      '--auth-interactive',
    );
    const mock = mockTransport([]);
    const written: string[] = [];
    const spy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(((chunk: unknown): boolean => {
        written.push(String(chunk));
        return true;
      }) as typeof process.stderr.write);

    try {
      // 콜백은 아무도 치지 않는다 — 시한으로 접고, 나가는 요청은 0이다.
      await connectDestination(startup, {
        transport: mock.transport,
        now: () => NOW,
        callbackHost: '127.0.0.1',
        callbackPort: 0,
        timeoutMs: 40,
      });
    } finally {
      spy.mockRestore();
    }

    const joined = written.join('');
    expect(joined).toContain('MCP_DESTINATION_AUTHORIZE_URL');
    // 사람이 URL을 실제로 받는다.
    expect(joined).toMatch(/https:\/\/uaa\.invalid\/oauth\/oauth\/authorize\?/);
    // 그리고 기다림의 값이 무엇인지 **미리** 안다.
    expect(joined).toContain('delays the MCP handshake');
    expect(joined).toContain('--auth-interactive');
    // 여전히 아무것도 스스로 열지 않는다.
    expect(joined).toContain('Nothing opens on its own');
    expect(joined).not.toContain(FAKE_SECRET);
  });
});

// ── ⓓⓔ 손대지 않는 갈래 — 자국 0 ───────────────────────────────────────────

describe('connectDestination — 손대지 않는 갈래는 같은 객체를 돌려준다', () => {
  /** 목을 주되 **한 건도 준비하지 않는다** — 한 번이라도 나가면 던진다. */
  function noCalls() {
    return mockTransport([]);
  }

  // ⓑ — **플래그가 없으면 오늘 그대로**가 회귀 0의 정의다(D-117 ⓐ · 대안 b 기각).
  it('authorization_code destination은 플래그가 없으면 시작조차 하지 않는다', async () => {
    const startup = mcpStartup(serviceKey());
    const mock = noCalls();
    const opened: string[] = [];
    const after = await connectDestination(startup, {
      transport: mock.transport,
      openAuthorizeUrl: (url) => {
        opened.push(url);
      },
    });
    expect(after).toBe(startup);
    expect(mock.calls).toHaveLength(0);
    expect(opened).toHaveLength(0);
    expect(after.diagnostics.join('\n')).toContain('MCP_DESTINATION_TOKEN_PENDING');
  });

  it('명시적으로 authorization_code를 선언해도 마찬가지다', async () => {
    const startup = mcpStartup(serviceKey({ granttype: 'authorization_code' }));
    const mock = noCalls();
    expect(await connectDestination(startup, { transport: mock.transport })).toBe(startup);
    expect(mock.calls).toHaveLength(0);
  });

  // 플래그를 켜도 붙을 주소가 없으면 콜백을 열지 않는다 — 열어 봐야 토큰이
  // 갈 데가 없고, 사람만 로그인 화면 앞에 세우는 꼴이 된다.
  it('--auth-interactive여도 service URL이 없으면 콜백을 열지 않는다', async () => {
    const startup = mcpStartup(
      serviceKey({ granttype: 'authorization_code' }, false),
      '--auth-interactive',
    );
    const mock = noCalls();
    const opened: string[] = [];
    const after = await connectDestination(startup, {
      transport: mock.transport,
      openAuthorizeUrl: (url) => {
        opened.push(url);
      },
    });
    expect(after).toBe(startup);
    expect(mock.calls).toHaveLength(0);
    expect(opened).toHaveLength(0);
    expect(startup.diagnostics.join('\n')).toContain('MCP_DESTINATION_NO_SERVICE_URL');
  });

  // 플래그는 `authorization_code`의 정지선만 연다 — 다른 그랜트의 동작은
  // 그것이 켜져 있든 아니든 같다.
  it('--auth-interactive는 client_credentials 갈래를 바꾸지 않는다', async () => {
    const startup = mcpStartup(
      serviceKey({ granttype: 'client_credentials' }),
      '--auth-interactive',
    );
    const mock = mockTransport([tokenBody()]);
    const opened: string[] = [];
    const after = await connectDestination(startup, {
      transport: mock.transport,
      now: () => NOW,
      openAuthorizeUrl: (url) => {
        opened.push(url);
      },
    });
    expect(opened).toHaveLength(0);
    expect(mock.calls).toHaveLength(1);
    expect(mock.form(0).get('grant_type')).toBe('client_credentials');
    expect(after.diagnostics.join('\n')).toContain('acquired a client_credentials token');
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

  it('브로커 통로 기동도 그대로 지나간다', async () => {
    const root = storeRoot();
    const startup = resolveStartup({
      argv: argvOf('--auth-broker', '--auth-interactive'),
      env: { AUTH_BROKER_PATH: root },
      cwd: tempDir(),
      homedir: tempDir(),
    });
    expect(startup.destination?.channel).toBe('broker');
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
