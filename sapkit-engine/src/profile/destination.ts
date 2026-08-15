/**
 * destination 인증 통로의 재료 계층 — `--mcp=<destination>`과 `--env=<name>`이
 * 가리키는 **파일을 찾아 설정을 조립하는 데까지**.
 *
 * 이 모듈은 SAP에 접속하지 않는다. 토큰도 받지 않는다. 파일을 찾고, 읽고,
 * 이름 있는 결과를 돌려줄 뿐이다 — 그 위에서 무엇을 할지는 기동 계층이 정한다.
 * 통로를 하나 더 붙일 때(브로커) 이 모듈에 `read*`/`resolve*` 하나를 더하고
 * `startup.ts`에 갈래 하나를 더하면 되도록 갈라 놓았다.
 *
 * 참조 원본(전부 읽기만 했다):
 * - `engine/src/lib/stores/platformPaths.ts` — 저장소 경로 우선순위 4단
 *   (custom → `AUTH_BROKER_PATH` → 플랫폼 기본 → cwd)
 * - `engine/src/lib/config/envResolver.ts` — `--env` 이름 → 세션 `.env` 파일
 *   (`normalizeEnvFileName` · `firstPlatformSessionsDir`)
 * - `engine/src/lib/config/ArgumentsParser.ts:137-183` — 인자 파싱과 우선순위
 * - `engine/src/lib/auth/brokerFactory.ts:92-200` — Variant 1(`--mcp`) /
 *   Variant 2(`--env`) / Variant 3(cwd `.env`)의 배타 순서
 * - `engine/src/lib/stores/index.ts:34-71` (`detectStoreType`) — 형식 판별
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/stores/abap/AbapServiceKeyStore.js`
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/stores/xsuaa/XsuaaServiceKeyStore.js`
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/parsers/abap/AbapServiceKeyParser.js`
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/parsers/xsuaa/XsuaaServiceKeyParser.js`
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/utils/JsonFileHandler.js`
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/stores/env/EnvFileSessionStore.js`
 *
 * 브로커 통로(`--auth-broker` · `MCP_USE_AUTH_BROKER`)를 위해 더 읽은 것:
 * - `engine/src/lib/auth/brokerFactory.ts:283-296` (기본 브로커 **미생성** 갈래) ·
 *   `336-372`(destination이 지목될 때의 요청별 생성) · `379-458`(store 한 벌 세우기)
 * - `engine/src/server/AuthBrokerConfig.ts` — `useAuthBroker`가 서버 설정에서
 *   브로커 공장으로 넘어가는 경로
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-broker/dist/AuthBroker.js`
 *   (특히 `getToken` 373-464 — 토큰은 브라우저 OAuth2 로그인으로만 나온다)
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-providers/dist/providers/AuthorizationCodeProvider.js`
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/stores/abap/AbapSessionStore.js`
 *   (생성자가 세션 디렉터리를 **만든다** — 신은 만들지 않는다) ·
 *   `…/stores/abap/SafeAbapSessionStore.js`(기본값인 메모리 저장소) ·
 *   `…/utils/pathResolver.js`
 *
 * **이름은 이름이지 경로가 아니다.** 두 인자의 값은 저장소 디렉터리 안의 파일
 * 이름으로 합쳐진다. 경로처럼 생긴 값을 그대로 합치면 운영자가 고르지 않은
 * 파일에 닿을 수 있으므로, 합치기 **전에** 거른다(D17이 지키는 자리와 같은 결).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** 저장소 하위 폴더 — 구 `getPlatformPaths`의 `subfolder`와 같은 어휘. */
export type PlatformSubfolder = 'service-keys' | 'sessions';

export interface PlatformLookup {
  /** 환경. 기본 `process.env`. `AUTH_BROKER_PATH`를 여기서 읽는다. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** 프로젝트 디렉터리. 기본 `process.cwd()`. */
  readonly cwd?: string;
  /** 사용자 홈. 기본 `os.homedir()`. 시험이 주입한다. */
  readonly homedir?: string;
  /** 플랫폼. 기본 `process.platform`. 시험이 주입한다. */
  readonly platform?: NodeJS.Platform;
  /** `--auth-broker-path` 인자의 값. 가장 높은 우선순위의 저장소 뿌리다. */
  readonly authBrokerPath?: string;
}

/**
 * 저장소 후보 경로들 — 구 `getPlatformPaths`의 4단 우선순위를 그대로 옮겼다.
 *
 * 하나 다르다: 구는 `AUTH_BROKER_PATH`를 `[:;]` **양쪽 모두**로 쪼개
 * Windows의 드라이브 문자(`C:\keys`)를 `C`와 `\keys` 두 조각으로 부순다
 * (`platformPaths.ts:66`). 신은 플랫폼 구분자 하나만 쓴다 — 문서가 말하는
 * "Unix는 콜론, Windows는 세미콜론"이 실제로 그렇게 동작하게 만드는 수리다.
 */
export function platformStoreDirs(
  subfolder: PlatformSubfolder,
  lookup: PlatformLookup = {},
): string[] {
  const env = lookup.env ?? process.env;
  const cwd = lookup.cwd ?? process.cwd();
  const platform = lookup.platform ?? process.platform;
  const dirs: string[] = [];

  // 구와 같이 **뿌리 경로에 하위 폴더를 붙인다**. 이미 그 이름으로 끝나면
  // 부모를 뿌리로 본다(`platformPaths.ts:43-46`) — 두 번 붙는 것을 막는다.
  const withSubfolder = (raw: string): string => {
    let resolved = path.resolve(cwd, raw);
    if (path.basename(resolved) === subfolder) resolved = path.dirname(resolved);
    return path.join(resolved, subfolder);
  };

  const custom = (lookup.authBrokerPath ?? '').trim();
  if (custom) dirs.push(withSubfolder(custom));

  const fromEnv = (env.AUTH_BROKER_PATH ?? '').trim();
  if (fromEnv) {
    const delimiter = platform === 'win32' ? ';' : ':';
    for (const part of fromEnv.split(delimiter)) {
      const trimmed = part.trim();
      if (trimmed) dirs.push(withSubfolder(trimmed));
    }
  }

  // 플랫폼 기본 경로는 **위 둘이 하나도 없을 때만** 쓴다(구와 같다).
  if (dirs.length === 0) {
    const home = lookup.homedir ?? os.homedir();
    const base =
      platform === 'win32'
        ? path.join(home, 'Documents', 'mcp-abap-adt')
        : path.join(home, '.config', 'mcp-abap-adt');
    dirs.push(path.join(base, subfolder));
  }

  // cwd는 언제나 마지막 후보로 붙는다(구 우선순위 4).
  dirs.push(cwd);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const dir of dirs) {
    const normalized = path.normalize(dir);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

/** service key 디렉터리 — 구 브로커 Variant 1이 쓰는 첫 후보. */
export function serviceKeysDir(lookup: PlatformLookup = {}): string {
  return platformStoreDirs('service-keys', lookup)[0] ?? path.resolve(lookup.cwd ?? process.cwd());
}

/**
 * 세션 디렉터리 — 구 `envResolver.firstPlatformSessionsDir`와 같이 **cwd가 아닌**
 * 첫 후보를 고른다. cwd를 세션 저장소로 삼으면 프로젝트 로컬 파일이 이름 하나로
 * 접속이 되어 버린다.
 */
export function sessionsDir(lookup: PlatformLookup = {}): string {
  const dirs = platformStoreDirs('sessions', lookup);
  const cwd = path.resolve(lookup.cwd ?? process.cwd());
  return dirs.find((dir) => path.resolve(dir) !== cwd) ?? dirs[0] ?? cwd;
}

// ── 이름 검사 ───────────────────────────────────────────────────────────────

export type NameCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * destination 이름이 **이름인지** 본다.
 *
 * 구 `envResolver.isLikelyPath`는 경로처럼 생긴 `--env` 값을 하위 호환으로
 * *경로처럼* 다뤘다(`envResolver.ts:45-48`). 신은 그러지 않는다 — 그 조항은
 * D17이 이미 닫아 둔 자리이고, 통로를 구현했다고 되열 이유가 없다. 여기서
 * 거르지 않으면 `--env=../../somewhere/.env`가 저장소 밖 파일로 접속을 만든다.
 */
export function checkDestinationName(raw: string): NameCheck {
  const name = raw.trim();
  if (name === '') return { ok: false, reason: 'the value is empty' };
  if (name.includes('/') || name.includes('\\')) {
    return { ok: false, reason: 'it contains a path separator' };
  }
  if (name.startsWith('.') || name.startsWith('~')) {
    return { ok: false, reason: 'it starts with a path prefix ("." or "~")' };
  }
  // `C:foo`는 Windows의 드라이브 상대 경로다 — `path.isAbsolute`가 잡지 못한다.
  if (/^[A-Za-z]:/.test(name)) return { ok: false, reason: 'it starts with a drive letter' };
  if (path.isAbsolute(name)) return { ok: false, reason: 'it is an absolute path' };
  return { ok: true };
}

/** 저장소 디렉터리 안의 이름 목록. 진단용이므로 절대 던지지 않는다. */
export function listStoreNames(dir: string, extension: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
      .map((entry) => entry.name.slice(0, -extension.length))
      .sort();
  } catch {
    return [];
  }
}

// ── `--env=<name>` — 세션 env 파일 ──────────────────────────────────────────

/** 구 `normalizeEnvFileName` — `.env`로 끝나지 않으면 붙인다(대소문자 무시). */
export function sessionEnvFileName(name: string): string {
  const trimmed = name.trim();
  return trimmed.toLowerCase().endsWith('.env') ? trimmed : `${trimmed}.env`;
}

export type SessionEnvResult =
  | { readonly kind: 'ok'; readonly path: string }
  | { readonly kind: 'unsafe-name'; readonly reason: string }
  | { readonly kind: 'not-found'; readonly path: string; readonly available: readonly string[] };

/**
 * `--env=<name>`이 가리키는 세션 env 파일을 찾는다.
 *
 * 찾기만 한다 — 읽어서 접속을 만드는 것은 기존 Basic 해석기(`resolve.ts`)의
 * 일이다. 그래서 이 통로로 들어와도 키체인 참조·tier·안전 노브가 전부 같은
 * 한 경로를 지난다.
 */
export function resolveSessionEnv(name: string, lookup: PlatformLookup = {}): SessionEnvResult {
  const checked = checkDestinationName(name);
  if (!checked.ok) return { kind: 'unsafe-name', reason: checked.reason };

  const dir = sessionsDir(lookup);
  const file = path.join(dir, sessionEnvFileName(name));
  if (!fs.existsSync(file)) {
    return { kind: 'not-found', path: file, available: listStoreNames(dir, '.env') };
  }
  return { kind: 'ok', path: file };
}

// ── `--mcp=<destination>` — service key ─────────────────────────────────────

/** service key에서 조립한 OAuth2 인증 재료. 토큰이 아니다. */
export interface ServiceKeyAuth {
  readonly uaaUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface ServiceKeyConfig {
  readonly destination: string;
  /** 실제로 읽은 파일. */
  readonly source: string;
  /** 구 `detectStoreType`의 두 갈래 — 중첩 `uaa`면 abap, 평면 XSUAA면 btp. */
  readonly storeType: 'abap' | 'btp';
  /** ADT가 붙을 곳. service key에 없을 수 있다. */
  readonly serviceUrl: string | null;
  readonly client: string | null;
  readonly language: string | null;
  readonly auth: ServiceKeyAuth;
}

export type ServiceKeyResult =
  | { readonly kind: 'ok'; readonly key: ServiceKeyConfig }
  | { readonly kind: 'unsafe-name'; readonly reason: string }
  | { readonly kind: 'not-found'; readonly path: string; readonly available: readonly string[] }
  | { readonly kind: 'invalid'; readonly path: string; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 구 `JsonFileHandler.unwrapCredentials` — 키가 `credentials` **하나뿐일 때만**
 * 벗긴다. BTP 콘솔이 그 모양으로 내려주는 파일이 있다.
 */
function unwrapCredentials(data: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== 'credentials') return data;
  const inner = data.credentials;
  return isRecord(inner) ? inner : data;
}

/**
 * 구 `JsonFileHandler.load` + `extractJsonFromText` — 그대로 파싱해 보고,
 * 실패하면 첫 `{`와 마지막 `}` 사이를 건져 한 번 더 시도한다(사람이 설명 글과
 * 함께 붙여 넣은 service key를 구도 받아 준다).
 */
function parseServiceKeyJson(text: string): Record<string, unknown> | null {
  const attempt = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const direct = attempt(text);
  if (direct) return direct;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return attempt(text.slice(start, end + 1));
}

/**
 * `--mcp=<destination>`이 가리키는 service key를 읽어 설정을 조립한다.
 *
 * 절대 던지지 않는다 — 자격증명 해석 실패가 기동을 죽이지 않는다는 계약(D20)이
 * 이 통로에도 그대로 적용된다.
 */
export function readServiceKey(
  destination: string,
  lookup: PlatformLookup = {},
): ServiceKeyResult {
  const checked = checkDestinationName(destination);
  if (!checked.ok) return { kind: 'unsafe-name', reason: checked.reason };

  const name = destination.trim();
  const dir = serviceKeysDir(lookup);
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) {
    return { kind: 'not-found', path: file, available: listStoreNames(dir, '.json') };
  }

  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return {
      kind: 'invalid',
      path: file,
      reason: `it could not be read (${err instanceof Error ? err.message : String(err)})`,
    };
  }

  const raw = parseServiceKeyJson(text);
  if (!raw) return { kind: 'invalid', path: file, reason: 'it is not a JSON object' };

  const data = unwrapCredentials(raw);

  // 구 `detectStoreType:56-63` — 중첩 `uaa`면 ABAP 형식, 아니면 평면 XSUAA.
  const nested = isRecord(data.uaa) ? data.uaa : null;
  const storeType: 'abap' | 'btp' = nested ? 'abap' : 'btp';
  const uaa = nested ?? data;

  const uaaUrl = str(uaa.url);
  const clientId = str(uaa.clientid);
  const clientSecret = str(uaa.clientsecret);

  // 반쪽 설정을 만들지 않는다 — 어느 항목이 없는지 이름으로 말한다.
  // 값은 절대 싣지 않는다(clientsecret이 진단으로 새면 안 된다).
  const missing: string[] = [];
  if (!uaaUrl) missing.push(nested ? 'uaa.url' : 'url');
  if (!clientId) missing.push(nested ? 'uaa.clientid' : 'clientid');
  if (!clientSecret) missing.push(nested ? 'uaa.clientsecret' : 'clientsecret');
  if (missing.length) {
    return {
      kind: 'invalid',
      path: file,
      reason: `it is missing ${missing.join(', ')} — neither the ABAP (nested "uaa") nor the XSUAA (flat) service-key shape is complete`,
    };
  }

  // serviceUrl·client·language의 우선순위는 구 store와 같다
  // (`AbapServiceKeyStore.js:147-149` · `XsuaaServiceKeyStore.js:107-117`).
  // `url`은 인증 엔드포인트일 수 있으므로 'authentication'이 들어 있으면
  // 서비스 URL로 쓰지 않는다.
  const abap = isRecord(data.abap) ? data.abap : null;
  const rootUrl = str(data.url);
  const serviceUrl =
    str(abap?.url) ||
    str(data.sap_url) ||
    (rootUrl && !rootUrl.includes('authentication') ? rootUrl : '');
  const client = str(abap?.client) || str(data.sap_client) || str(data.client);
  const language = str(abap?.language) || str(data.language);

  return {
    kind: 'ok',
    key: {
      destination: name,
      source: file,
      storeType,
      serviceUrl: serviceUrl || null,
      client: client || null,
      language: language || null,
      auth: { uaaUrl, clientId, clientSecret },
    },
  };
}

// ── `--auth-broker` / `MCP_USE_AUTH_BROKER` — 브로커 저장소 ──────────────────

/**
 * 브로커 통로가 쓸 저장소 재료.
 *
 * **destination 이름이 없다.** 구 브로커에서 이 스위치의 효과는 두 가지뿐이기
 * 때문이다(전부 읽기만 한 실측):
 *  ⓐ 인자와 환경변수를 하나로 합쳐(`engine/src/lib/config/ArgumentsParser.ts:182-183`)
 *     Variant 3(cwd `.env`)을 잠근다(`engine/src/lib/auth/brokerFactory.ts:185`).
 *  ⓑ **기본 브로커를 만들지 않는다** — Variant 1(`--mcp`)·2(`--env`)에 걸리지
 *     않으면 `DEFAULT_BROKER_NOT_CREATED`로 끝나고(`brokerFactory.ts:283-293`),
 *     접속 맥락은 destination이 **지목될 때** 저장소에서 그때그때 만들어진다
 *     (`brokerFactory.ts:336-372` — `getPlatformPaths`로 두 디렉터리를 잡고
 *     `detectStoreType`으로 형식을 가른 뒤 store 한 벌을 세운다).
 *
 * 그래서 기동 시점에 조립할 수 있는 것은 **저장소가 어디이고 그 안에 어떤
 * 이름이 있는가**까지다. 그 이상(토큰)은 `AuthBroker.getToken`이 브라우저
 * OAuth2 로그인으로 받아 오는 것이라 실접속이다
 * (`engine/node_modules/@babamba2/mcp-abap-adt-auth-broker/dist/AuthBroker.js:373-464` →
 * `…/mcp-abap-adt-auth-providers/dist/providers/AuthorizationCodeProvider.js:76-90`).
 */
export interface BrokerStores {
  /** service key를 읽을 디렉터리. 구 `getPlatformPaths(custom,'service-keys')[0]`. */
  readonly serviceKeysDir: string;
  /**
   * 세션 디렉터리. 구는 이것을 언제나 계산해 두지만 실제로 파일을 쓰는 것은
   * `--unsafe`일 때뿐이고(`brokerFactory.ts:407-425`), 기본값은 메모리 저장소다
   * (`SafeAbapSessionStore`). 재료로 실어 나르기만 하고 **만들지 않는다** —
   * 구 `AbapSessionStore` 생성자는 없으면 `mkdirSync`로 만든다
   * (`…/mcp-abap-adt-auth-stores/dist/stores/abap/AbapSessionStore.js:71-74`).
   */
  readonly sessionsDir: string;
  /** service key 저장소에 실제로 있는 destination 이름들. 파일을 열지 않는다. */
  readonly destinations: readonly string[];
}

/**
 * 브로커 통로의 저장소 재료를 조립한다. 절대 던지지 않는다(D20).
 *
 * 디렉터리를 만들지도, service key를 열지도 않는다 — 이름만 센다. 비밀이
 * 재료에 실릴 자리를 아예 두지 않기 위해서다.
 */
export function resolveBrokerStores(lookup: PlatformLookup = {}): BrokerStores {
  const keysDir = serviceKeysDir(lookup);
  return {
    serviceKeysDir: keysDir,
    sessionsDir: sessionsDir(lookup),
    destinations: listStoreNames(keysDir, '.json'),
  };
}

// ── 기동 계층이 들고 다니는 선택 결과 ───────────────────────────────────────

/**
 * 어느 destination 통로가 열렸는가. 인자가 하나도 없으면 `null`이다.
 *
 * 통로를 하나 더 붙일 때는 `channel`에 값을 하나 더하고 그 통로가 조립한
 * 재료를 담을 칸을 하나 더한다.
 */
export interface DestinationSelection {
  readonly channel: 'mcp' | 'env' | 'broker';
  /**
   * 운영자가 인자에 적은 이름 그대로. **`broker` 통로는 빈 문자열이다** —
   * 그 통로는 이름을 고르지 않는다(위 `BrokerStores` 주석 ⓑ).
   */
  readonly name: string;
  /** 이 통로가 실제로 고른 파일. 못 찾았거나 파일을 고르지 않는 통로면 null. */
  readonly source: string | null;
  /** `--mcp`가 조립한 OAuth2 재료. 다른 통로면 null. */
  readonly serviceKey: ServiceKeyConfig | null;
  /** `broker` 통로가 조립한 저장소 재료. 다른 통로면 아예 실리지 않는다. */
  readonly broker?: BrokerStores;
}
