/**
 * 전송 설정 — **어떤 인자·환경변수가 네트워크 표면을 여는가.**
 *
 * 구 엔진에서 실측해 승계한 계약이다:
 *
 *  - 전송 선택: `--transport=stdio|http|streamable-http|sse` (1순위) →
 *    `MCP_TRANSPORT` (2순위) → 기본 `stdio`. 구 `ServerConfigManager.parseTransport`
 *    (`engine/src/lib/config/ServerConfigManager.ts:138-152`).
 *  - 호스트: `--host` → `--http-host` → `MCP_HTTP_HOST` → `127.0.0.1`
 *    (`ServerConfigManager.ts:115` · `ArgumentsParser.ts:220-221`).
 *  - 포트: `--port` → `--http-port` → `MCP_HTTP_PORT` → `3000`
 *    (`ServerConfigManager.ts:116` · `ArgumentsParser.ts:219` ·
 *    `utils.ts:1700-1716` — 1~65535 밖은 오류).
 *  - 경로: `--path` → `--http-path` → `/mcp/stream/http`
 *    (`ServerConfigManager.ts:118-120` · `StreamableHttpServer.ts:91`).
 *  - JSON 응답: 구의 **실효 기본값은 켬**이다 — 런처가
 *    `parsed.httpJsonResponse || undefined`를 넘겨(`launcher.ts:439`) 거짓이
 *    `undefined`로 접히고, 전송이 `?? true`로 받는다
 *    (`StreamableHttpServer.ts:89`). 그 실효 동작을 승계하되 노브가 실제로
 *    끌 수 있게 고쳤다(차이 장부 D23).
 *
 * **바닥선에 관한 두 가지 결정**(차이 장부 D21·D22):
 *
 *  ① 구는 `--http-allowed-hosts`·`--http-allowed-origins`·
 *    `--http-enable-dns-protection`을 **파싱만 하고 전송에 넘기지 않는다**
 *    (`StreamableHttpServer.ts:186-189`는 `sessionIdGenerator`와
 *    `enableJsonResponse` 둘만 넘긴다). 여기서는 배선하고 **기본으로 켠다.**
 *  ② 구는 `--http-host=0.0.0.0`을 아무 조건 없이 받는다. 이 엔진에는 HTTP
 *    클라이언트 인증이 없으므로 그 바인딩은 도구 표면 전체를 무인증으로 여는
 *    일이다. 비루프백 바인딩은 **명시 옵트인**을 요구한다.
 *
 * 읽는 곳은 **argv와 프로세스 env뿐**이다. 프로파일 파일(`sap.env`)의 값은 보지
 * 않는다 — 구는 활성 프로파일의 모든 키를 `process.env`에 부어(`engine/src/lib/
 * profile.ts:271-277` `applyProfile`) 프로파일 파일 한 줄이 포트를 열 수 있었다.
 *
 * **SSE의 바인딩 옵션은 HTTP와 같은 자리에서 해석된다**(차이 장부 D31). 두 전송은
 * 같은 웹 표면을 열므로 잠금(비루프백 옵트인 D27 · DNS 리바인딩 보호 D26 · 포트
 * 검증)이 갈라지면 한쪽이 다른 쪽의 뒷문이 된다. 구는 SSE 짝 노브를
 * (`--sse-port`·`--sse-host`·`--sse-allowed-*`·`--sse-enable-dns-protection`)
 * 파싱만 하고 런처가 넘기지 않았다 — 실제로 쓰인 것은 `--host`/`--port`/
 * `--http-*`였고(`engine/src/lib/config/ServerConfigManager.ts:115-122` ·
 * `engine/src/server/launcher.ts:420-433`), SSE 전용 경로 둘(`--sse-path`·
 * `--post-path`)만 살아 있었다. 여기서는 SSE 이름을 **HTTP 이름 앞에 두고**
 * 되살린다 — 안 주면 구의 실효값이 그대로 나온다.
 */

/** 전송 종류. */
export type TransportKind = 'stdio' | 'http' | 'sse';

export interface StdioTransportConfig {
  readonly kind: 'stdio';
}

export interface HttpTransportConfig {
  readonly kind: 'http';
  readonly host: string;
  readonly port: number;
  readonly path: string;
  /** 거짓이면 응답이 SSE 스트림이 된다. 구의 실효 기본값은 참. */
  readonly enableJsonResponse: boolean;
  readonly dnsRebindingProtection: boolean;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
}

/**
 * SSE 전송 설정.
 *
 * HTTP와 다른 것은 둘뿐이다 — 경로가 **둘**(스트림을 여는 GET · 메시지를 올리는
 * POST)이고, `enableJsonResponse`가 없다(응답이 언제나 스트림으로 나간다).
 * 나머지 바인딩·잠금 필드는 HTTP와 이름까지 같다.
 */
export interface SseTransportConfig {
  readonly kind: 'sse';
  readonly host: string;
  readonly port: number;
  /** SSE 스트림을 여는 GET 경로. 구 기본값 `/sse`(`engine/src/server/SseServer.ts:88`). */
  readonly ssePath: string;
  /** 클라이언트가 메시지를 올리는 POST 경로. 구 기본값 `/messages`(같은 파일 :89). */
  readonly postPath: string;
  readonly dnsRebindingProtection: boolean;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
}

export type TransportConfig =
  | StdioTransportConfig
  | HttpTransportConfig
  | SseTransportConfig;

export interface TransportResolution {
  readonly config: TransportConfig;
  /** 사람이 읽을 기동 진단. 부르는 쪽이 stderr로 낸다. */
  readonly diagnostics: readonly string[];
}

export interface TransportInput {
  /** `process.argv.slice(2)` — 앞 둘은 이미 버린 뒤의 것. */
  readonly args: readonly string[];
  /** 프로세스 env. **프로파일 값을 얹은 env가 아니다.** */
  readonly env: Readonly<Record<string, string | undefined>>;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const DEFAULT_PATH = '/mcp/stream/http';
const DEFAULT_SSE_PATH = '/sse';
const DEFAULT_POST_PATH = '/messages';

/** 인자 하나의 값을 읽는다. `--name=v`와 `--name v` 둘 다. 첫 등장이 이긴다. */
function argValue(args: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) return args[i + 1] ?? '';
  }
  return undefined;
}

/**
 * 인자 → 환경변수 → 기본값. 빈 문자열은 "주지 않은 것"으로 본다.
 *
 * 이름을 **여럿** 받는 것은 SSE 때문이다 — 같은 옵션에 SSE 이름과 HTTP 이름이
 * 나란히 있고, 앞에 적은 것이 이긴다.
 */
function option(
  input: TransportInput,
  argNames: readonly string[],
  envNames: readonly string[],
): string | undefined {
  for (const name of argNames) {
    const value = argValue(input.args, name);
    if (value !== undefined && value.trim() !== '') return value.trim();
  }
  for (const name of envNames) {
    const fromEnv = (input.env[name] ?? '').trim();
    if (fromEnv !== '') return fromEnv;
  }
  return undefined;
}

/** 구 `resolveBooleanOption`과 같은 어휘(`utils.ts:1718-1735`). */
function booleanOption(
  input: TransportInput,
  argNames: readonly string[],
  envNames: readonly string[],
  fallback: boolean,
): boolean {
  const raw = option(input, argNames, envNames);
  if (raw === undefined) {
    // 값 없는 맨 플래그(`--http-allow-remote`)는 참이다.
    return argNames.some((name) => input.args.includes(name)) ? true : fallback;
  }
  const normalized = raw.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

/** 구 `resolveListOption`과 같은 어휘(`utils.ts:1737-1750`). */
function listOption(
  input: TransportInput,
  argNames: readonly string[],
  envNames: readonly string[],
): readonly string[] | undefined {
  const raw = option(input, argNames, envNames);
  if (raw === undefined) return undefined;
  const items = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

/** 구 `resolvePortOption`과 같은 판정(`utils.ts:1700-1716`) — 1~65535만. */
function resolvePort(
  input: TransportInput,
  argNames: readonly string[],
  envNames: readonly string[],
): number {
  const raw = option(input, argNames, envNames);
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      `ERR_HTTP_PORT: invalid HTTP port ${JSON.stringify(raw)} — give an integer in 1..65535 ` +
        `(${argNames.join(' / ')} · ${envNames.join(' / ')}).`,
    );
  }
  return port;
}

/** 앞이 이긴다 — SSE면 SSE 이름을 앞에, 아니면 HTTP 이름만. */
function names(sse: boolean, sseNames: readonly string[], httpNames: readonly string[]): string[] {
  return sse ? [...sseNames, ...httpNames] : [...httpNames];
}

/** 경로는 언제나 `/`로 시작한다 — 구 `StreamableHttpServer.ts:91`과 같은 손질. */
function normalizePath(raw: string): string {
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * 루프백인가. `0.0.0.0`·`::`는 **아니다** — 그 둘은 모든 인터페이스에 붙는다.
 */
export function isLoopbackHost(host: string): boolean {
  const bare = host.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (bare === 'localhost' || bare === '::1' || bare === '::ffff:127.0.0.1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
}

/** Host 헤더 허용 목록의 기본값 — 바인딩 대상에서 유도한다. */
function defaultAllowedHosts(host: string, port: number): string[] {
  if (isLoopbackHost(host)) {
    return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, `${host}:${port}`].filter(
      (entry, index, all) => all.indexOf(entry) === index,
    );
  }
  return [`${host}:${port}`];
}

/** Origin 헤더 허용 목록의 기본값 — 로컬 웹 클라이언트 둘. */
function defaultAllowedOrigins(port: number): string[] {
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

export function resolveTransport(input: TransportInput): TransportResolution {
  const diagnostics: string[] = [];
  const requested = (
    option(input, ['--transport'], ['MCP_TRANSPORT']) ?? 'stdio'
  ).toLowerCase();

  if (requested === 'stdio') {
    diagnostics.push('[sapkit] transport(resolved): stdio');
    return { config: { kind: 'stdio' }, diagnostics };
  }

  const sse = requested === 'sse';

  if (!sse && requested !== 'http' && requested !== 'streamable-http') {
    // 오타 하나가 포트를 여는 일은 없다(D5와 같은 fail-closed 방향).
    diagnostics.push(
      `TRANSPORT_UNSUPPORTED: unknown transport ${JSON.stringify(requested)} — ` +
        'known values are stdio, http and sse. Starting on stdio; nothing was bound to a port.',
    );
    diagnostics.push('[sapkit] transport(resolved): stdio');
    return { config: { kind: 'stdio' }, diagnostics };
  }

  // 아래의 잠금 셋(비루프백 옵트인 · DNS 리바인딩 보호 · 포트 검증)은 두 전송이
  // **같은 자리**를 쓴다. 갈라지면 한쪽이 다른 쪽의 뒷문이 된다.
  const host =
    option(
      input,
      names(sse, ['--sse-host'], ['--host', '--http-host']),
      names(sse, ['MCP_SSE_HOST'], ['MCP_HTTP_HOST']),
    ) ?? DEFAULT_HOST;
  const port = resolvePort(
    input,
    names(sse, ['--sse-port'], ['--port', '--http-port']),
    names(sse, ['MCP_SSE_PORT'], ['MCP_HTTP_PORT']),
  );

  if (!isLoopbackHost(host)) {
    const allowRemote = booleanOption(
      input,
      ['--http-allow-remote'],
      ['MCP_HTTP_ALLOW_REMOTE'],
      false,
    );
    if (!allowRemote) {
      throw new Error(
        `ERR_HTTP_NON_LOOPBACK: refusing to bind the ${requested} transport to ${host} — this ` +
          'engine has no HTTP client authentication, so a non-loopback bind exposes the whole ' +
          'tool surface to anyone who can reach the port. Bind to 127.0.0.1, or opt in ' +
          'explicitly with --http-allow-remote (MCP_HTTP_ALLOW_REMOTE=true) and restrict access ' +
          'yourself.',
      );
    }
    diagnostics.push(
      `HTTP_REMOTE_BIND: binding to ${host}:${port} on explicit opt-in — there is no HTTP client ` +
        'authentication; every reachable client gets the full exposed tool surface.',
    );
  }

  const dnsRebindingProtection = booleanOption(
    input,
    names(sse, ['--sse-enable-dns-protection'], ['--http-enable-dns-protection']),
    names(sse, ['MCP_SSE_ENABLE_DNS_PROTECTION'], ['MCP_HTTP_ENABLE_DNS_PROTECTION']),
    true,
  );
  const allowedHosts =
    listOption(
      input,
      names(sse, ['--sse-allowed-hosts'], ['--http-allowed-hosts']),
      names(sse, ['MCP_SSE_ALLOWED_HOSTS'], ['MCP_HTTP_ALLOWED_HOSTS']),
    ) ?? defaultAllowedHosts(host, port);
  const allowedOrigins =
    listOption(
      input,
      names(sse, ['--sse-allowed-origins'], ['--http-allowed-origins']),
      names(sse, ['MCP_SSE_ALLOWED_ORIGINS'], ['MCP_HTTP_ALLOWED_ORIGINS']),
    ) ?? defaultAllowedOrigins(port);

  if (!dnsRebindingProtection) {
    diagnostics.push(
      'HTTP_DNS_PROTECTION_OFF: DNS-rebinding protection was turned off explicitly — a web page ' +
        'in a browser can then reach this server through a rebound hostname.',
    );
  }

  if (sse) {
    const ssePath = normalizePath(
      option(input, ['--sse-path'], ['MCP_SSE_PATH']) ?? DEFAULT_SSE_PATH,
    );
    const postPath = normalizePath(
      option(input, ['--post-path'], ['MCP_POST_PATH']) ?? DEFAULT_POST_PATH,
    );

    diagnostics.push(
      `[sapkit] transport(resolved): sse · endpoint=http://${host}:${port}${ssePath} · ` +
        `post=http://${host}:${port}${postPath} · ` +
        `dns-protection=${dnsRebindingProtection} · client-auth=none`,
    );

    return {
      config: {
        kind: 'sse',
        host,
        port,
        ssePath,
        postPath,
        dnsRebindingProtection,
        allowedHosts,
        allowedOrigins,
      },
      diagnostics,
    };
  }

  const path = normalizePath(
    option(input, ['--path', '--http-path'], ['MCP_HTTP_PATH']) ?? DEFAULT_PATH,
  );
  const enableJsonResponse = booleanOption(
    input,
    ['--http-json-response'],
    ['MCP_HTTP_ENABLE_JSON_RESPONSE'],
    true,
  );

  diagnostics.push(
    `[sapkit] transport(resolved): http · endpoint=http://${host}:${port}${path} · ` +
      `json-response=${enableJsonResponse} · dns-protection=${dnsRebindingProtection} · ` +
      'client-auth=none',
  );

  return {
    config: {
      kind: 'http',
      host,
      port,
      path,
      enableJsonResponse,
      dnsRebindingProtection,
      allowedHosts,
      allowedOrigins,
    },
    diagnostics,
  };
}
