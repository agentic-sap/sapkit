import { HttpTransportError } from '../../adt/http';
import { AuthError } from '../errors';
import { AUTHORIZE_PATH, TOKEN_PATH, UaaClient, uaaEndpoints } from '../uaa';
import { fakeJwt, fakeUaa, mockTransport, tokenBody } from './helpers';

const NOW = 1_700_000_000_000;

/** 던진 오류를 AuthError로 받아 낸다. 안 던지면 시험이 실패한다. */
async function rejection(work: Promise<unknown>): Promise<AuthError> {
  try {
    await work;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    return error as AuthError;
  }
  throw new Error('던지지 않았다 — 실패로 다뤄야 하는 갈래다');
}

describe('uaaEndpoints', () => {
  it('토큰·인가 종단점을 오리진에서 파생한다', () => {
    expect(uaaEndpoints('https://uaa.example.test')).toEqual({
      token: `https://uaa.example.test${TOKEN_PATH}`,
      authorize: `https://uaa.example.test${AUTHORIZE_PATH}`,
    });
  });

  it('끝 슬래시를 잘라 낸다 — 붙으면 //oauth/token 이 된다', () => {
    expect(uaaEndpoints('https://uaa.example.test///').token).toBe(
      `https://uaa.example.test${TOKEN_PATH}`,
    );
  });
});

describe('UaaClient.authorizeUrl — 브라우저에 건넬 URL', () => {
  it('response_type=code와 client_id·redirect_uri·state를 싣는다', () => {
    const client = new UaaClient(fakeUaa());
    const url = new URL(
      client.authorizeUrl({ redirectUri: 'http://127.0.0.1:9876/callback', state: 'state-1' }),
    );

    expect(url.origin + url.pathname).toBe(`https://uaa.example.test${AUTHORIZE_PATH}`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('sb-not-a-real-client');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:9876/callback');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('**client_secret을 URL에 싣지 않는다** — 주소창과 히스토리에 남는 자리다', () => {
    const client = new UaaClient(fakeUaa());
    const url = client.authorizeUrl({ redirectUri: 'http://127.0.0.1:1/callback', state: 's' });
    expect(url).not.toContain('not-a-real-secret');
    expect(url).not.toContain('client_secret');
  });

  it('scope는 주었을 때만 붙는다', () => {
    const client = new UaaClient(fakeUaa());
    expect(client.authorizeUrl({ redirectUri: 'http://127.0.0.1:1/cb', state: 's' })).not.toContain(
      'scope=',
    );
    expect(
      client.authorizeUrl({ redirectUri: 'http://127.0.0.1:1/cb', state: 's', scope: 'uaa.user' }),
    ).toContain('scope=uaa.user');
  });
});

describe('UaaClient.clientCredentials — 사람 없는 통로', () => {
  it('토큰 종단점에 form으로 POST하고 Basic으로 클라이언트를 인증한다', async () => {
    const mock = mockTransport([tokenBody()]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW });

    await client.clientCredentials();

    const request = mock.nth(0);
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`https://uaa.example.test${TOKEN_PATH}`);
    expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(request.headers.Accept).toBe('application/json');
    expect(request.headers.Authorization).toBe(
      `Basic ${Buffer.from('sb-not-a-real-client:not-a-real-secret', 'utf8').toString('base64')}`,
    );
    expect(mock.form(0).get('grant_type')).toBe('client_credentials');
  });

  it('**client_secret을 본문에 싣지 않는다** — 헤더로만 나간다', async () => {
    const mock = mockTransport([tokenBody()]);
    await new UaaClient(fakeUaa(), { transport: mock.transport }).clientCredentials();
    expect(mock.nth(0).body).not.toContain('not-a-real-secret');
  });

  it('expires_in으로 만료 시각을 계산한다', async () => {
    const mock = mockTransport([tokenBody({ expires_in: 3600 })]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW });

    const token = await client.clientCredentials();

    expect(token.accessToken).toBe('not-a-real-access-token');
    expect(token.tokenType).toBe('bearer');
    expect(token.refreshToken).toBeNull();
    expect(token.expiresAtMs).toBe(NOW + 3_600_000);
  });

  it('**JWT의 exp가 expires_in을 이긴다** — SAP이 믿는 쪽이 exp다', async () => {
    const access = fakeJwt({ exp: 1_700_000_900 });
    const mock = mockTransport([tokenBody({ access_token: access, expires_in: 99_999 })]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW });

    expect((await client.clientCredentials()).expiresAtMs).toBe(1_700_000_900_000);
  });

  it('exp도 expires_in도 없으면 수명은 null(모름)이다', async () => {
    const mock = mockTransport([
      { status: 200, body: JSON.stringify({ access_token: 'opaque-token' }) },
    ]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW });

    const token = await client.clientCredentials();
    expect(token.expiresAtMs).toBeNull();
    expect(token.tokenType).toBe('bearer');
  });

  it('깨진 exp는 취득을 죽이지 않고 expires_in으로 내려간다', async () => {
    const mock = mockTransport([
      tokenBody({ access_token: fakeJwt({ exp: 'soon' }), expires_in: 120 }),
    ]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW });

    expect((await client.clientCredentials()).expiresAtMs).toBe(NOW + 120_000);
  });
});

describe('UaaClient.exchangeCode — authorization_code 교환', () => {
  it('코드와 redirect_uri를 실어 보낸다', async () => {
    const mock = mockTransport([tokenBody({ refresh_token: 'not-a-real-refresh' })]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW });

    const token = await client.exchangeCode('not-a-real-code', 'http://127.0.0.1:9876/callback');

    const form = mock.form(0);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('not-a-real-code');
    expect(form.get('redirect_uri')).toBe('http://127.0.0.1:9876/callback');
    expect(form.get('client_id')).toBe('sb-not-a-real-client');
    expect(token.refreshToken).toBe('not-a-real-refresh');
  });
});

describe('UaaClient.refresh — 갱신 갈래', () => {
  it('갱신 토큰을 실어 보낸다', async () => {
    const mock = mockTransport([tokenBody({ refresh_token: 'rotated-refresh' })]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport, now: () => NOW });

    const token = await client.refresh('old-refresh');

    const form = mock.form(0);
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('old-refresh');
    expect(token.refreshToken).toBe('rotated-refresh');
  });

  it('거절은 **UAA_REFRESH_FAILED**로 나온다 — 처음 취득 실패와 구분된다', async () => {
    const mock = mockTransport([
      {
        status: 401,
        body: JSON.stringify({
          error: 'invalid_token',
          error_description: 'Invalid refresh token expired',
        }),
      },
    ]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    const error = await rejection(client.refresh('expired-refresh'));
    expect(error.code).toBe('UAA_REFRESH_FAILED');
    expect(error.message).toContain('invalid_token');
    expect(error.message).toContain('Invalid refresh token expired');
  });

  it('전송 실패도 갱신 갈래에서는 UAA_REFRESH_FAILED다', async () => {
    const mock = mockTransport([new HttpTransportError('timeout', '30000ms 안에 끝나지 않았다')]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    expect((await rejection(client.refresh('r'))).code).toBe('UAA_REFRESH_FAILED');
  });

  it('2xx인데 access_token이 없으면 갱신 실패로 접는다', async () => {
    const mock = mockTransport([{ status: 200, body: JSON.stringify({ token_type: 'bearer' }) }]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    expect((await rejection(client.refresh('r'))).code).toBe('UAA_REFRESH_FAILED');
  });
});

describe('UaaClient — 실패 갈래의 이름과 비밀 취급', () => {
  it('전송이 닿지 못하면 UAA_REQUEST_FAILED', async () => {
    const mock = mockTransport([new HttpTransportError('network', 'ECONNREFUSED')]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    const error = await rejection(client.clientCredentials());
    expect(error.code).toBe('UAA_REQUEST_FAILED');
    expect(error.message).toContain('ECONNREFUSED');
  });

  it('4xx 거절은 UAA_REJECTED이고 error·error_description을 옮긴다', async () => {
    const mock = mockTransport([
      {
        status: 401,
        body: JSON.stringify({ error: 'unauthorized', error_description: 'Bad credentials' }),
      },
    ]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    const error = await rejection(client.clientCredentials());
    expect(error.code).toBe('UAA_REJECTED');
    expect(error.message).toContain('HTTP 401');
    expect(error.message).toContain('Bad credentials');
  });

  it('**오류 본문을 통째로 싣지 않는다** — 종단점이 되비추는 토큰이 로그로 새지 않게', async () => {
    const mock = mockTransport([
      {
        status: 400,
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'nope',
          access_token: 'leaked-token-should-not-appear',
          refresh_token: 'leaked-refresh-should-not-appear',
        }),
      },
    ]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    const error = await rejection(client.clientCredentials());
    expect(error.message).toContain('invalid_grant');
    expect(error.message).not.toContain('leaked-token-should-not-appear');
    expect(error.message).not.toContain('leaked-refresh-should-not-appear');
  });

  it('JSON이 아닌 오류 본문은 상태 코드만 남긴다', async () => {
    const mock = mockTransport([{ status: 502, body: '<html>gateway</html>' }]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    const error = await rejection(client.clientCredentials());
    expect(error.code).toBe('UAA_REJECTED');
    expect(error.message).toContain('HTTP 502');
    expect(error.message).not.toContain('<html>');
  });

  it('2xx인데 JSON이 아니면 UAA_RESPONSE_INVALID', async () => {
    const mock = mockTransport([{ status: 200, body: 'not json at all' }]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    expect((await rejection(client.clientCredentials())).code).toBe('UAA_RESPONSE_INVALID');
  });

  it('2xx인데 access_token이 비면 UAA_RESPONSE_INVALID — 빈 Bearer가 SAP에 가지 않게', async () => {
    const mock = mockTransport([{ status: 200, body: JSON.stringify({ access_token: '   ' }) }]);
    const client = new UaaClient(fakeUaa(), { transport: mock.transport });

    expect((await rejection(client.clientCredentials())).code).toBe('UAA_RESPONSE_INVALID');
  });

  it('어떤 실패 문구에도 clientSecret이 없다', async () => {
    const cases = [
      mockTransport([new HttpTransportError('network', 'boom')]),
      mockTransport([{ status: 401, body: JSON.stringify({ error: 'unauthorized' }) }]),
      mockTransport([{ status: 200, body: 'not json' }]),
    ];
    for (const mock of cases) {
      const client = new UaaClient(fakeUaa(), { transport: mock.transport });
      const error = await rejection(client.clientCredentials());
      expect(error.message).not.toContain('not-a-real-secret');
    }
  });
});

describe('UaaClient — TLS·시한 방침', () => {
  it('인증서 검증은 기본으로 켜져 있다', async () => {
    const mock = mockTransport([tokenBody()]);
    await new UaaClient(fakeUaa(), { transport: mock.transport }).clientCredentials();
    expect(mock.nth(0).rejectUnauthorized).toBe(true);
  });

  it('접속마다 끌 수 있다', async () => {
    const mock = mockTransport([tokenBody()]);
    await new UaaClient(fakeUaa(), {
      transport: mock.transport,
      rejectUnauthorized: false,
    }).clientCredentials();
    expect(mock.nth(0).rejectUnauthorized).toBe(false);
  });

  it('시한을 지정할 수 있고 기본값이 실린다', async () => {
    const withDefault = mockTransport([tokenBody()]);
    await new UaaClient(fakeUaa(), { transport: withDefault.transport }).clientCredentials();
    expect(withDefault.nth(0).timeoutMs).toBe(30_000);

    const custom = mockTransport([tokenBody()]);
    await new UaaClient(fakeUaa(), {
      transport: custom.transport,
      timeoutMs: 5_000,
    }).clientCredentials();
    expect(custom.nth(0).timeoutMs).toBe(5_000);
  });
});
