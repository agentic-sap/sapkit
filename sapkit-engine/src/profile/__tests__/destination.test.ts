/**
 * destination 통로의 재료 계층 — 플랫폼 저장소 경로 · 이름 검사 ·
 * service key 읽기 · 세션 env 파일 찾기.
 *
 * 여기서는 **파일을 찾고 읽어 설정을 조립하는 데까지만** 다룬다. 토큰 취득도
 * SAP 접속도 이 계층 밖이다.
 *
 * 참조 원본:
 * - `engine/src/lib/stores/platformPaths.ts` — 저장소 경로 우선순위 4단
 * - `engine/src/lib/config/envResolver.ts` — `--env` 이름 → 세션 파일
 * - `engine/src/lib/stores/index.ts` (`detectStoreType`) — 형식 판별
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/stores/abap/AbapServiceKeyStore.js`
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/stores/xsuaa/XsuaaServiceKeyStore.js`
 * - `engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/utils/JsonFileHandler.js`
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  checkDestinationName,
  platformStoreDirs,
  readServiceKey,
  resolveSessionEnv,
  serviceKeysDir,
  sessionEnvFileName,
  sessionsDir,
} from '../destination';

const temps: string[] = [];

function mkdtemp(tag: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sapkit-t15-${tag}-`));
  temps.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

/** 명백한 가짜만 쓴다 — 죽은 루프백 주소와 `.invalid` TLD. */
const FAKE_SECRET = 'fixture-not-a-real-secret';

function writeJson(file: string, body: unknown): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf8');
  return file;
}

function writeText(file: string, body: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

/** `--auth-broker-path`가 가리키는 저장소 뿌리를 하나 만든다. */
function storeRoot(): string {
  const root = mkdtemp('store');
  fs.mkdirSync(path.join(root, 'service-keys'), { recursive: true });
  fs.mkdirSync(path.join(root, 'sessions'), { recursive: true });
  return root;
}

// ── 플랫폼 저장소 경로 ───────────────────────────────────────────────────────

describe('platformStoreDirs — 구 getPlatformPaths 우선순위 4단', () => {
  it('아무 지정이 없으면 플랫폼 기본 경로가 첫째, cwd가 마지막이다 (win32)', () => {
    const home = mkdtemp('home');
    const cwd = mkdtemp('cwd');
    const dirs = platformStoreDirs('service-keys', {
      env: {},
      cwd,
      homedir: home,
      platform: 'win32',
    });
    expect(dirs[0]).toBe(path.join(home, 'Documents', 'mcp-abap-adt', 'service-keys'));
    expect(dirs[dirs.length - 1]).toBe(path.normalize(cwd));
  });

  it('아무 지정이 없으면 플랫폼 기본 경로가 첫째다 (posix)', () => {
    const home = mkdtemp('home');
    const cwd = mkdtemp('cwd');
    const dirs = platformStoreDirs('sessions', {
      env: {},
      cwd,
      homedir: home,
      platform: 'linux',
    });
    expect(dirs[0]).toBe(path.join(home, '.config', 'mcp-abap-adt', 'sessions'));
  });

  it('--auth-broker-path가 있으면 플랫폼 기본 경로를 아예 쓰지 않는다', () => {
    const home = mkdtemp('home');
    const cwd = mkdtemp('cwd');
    const custom = mkdtemp('custom');
    const dirs = platformStoreDirs('service-keys', {
      env: {},
      cwd,
      homedir: home,
      platform: 'win32',
      authBrokerPath: custom,
    });
    expect(dirs[0]).toBe(path.join(custom, 'service-keys'));
    expect(dirs).not.toContain(path.join(home, 'Documents', 'mcp-abap-adt', 'service-keys'));
  });

  it('이미 하위 폴더 이름으로 끝나는 경로는 그 부모를 뿌리로 본다 (중복 방지)', () => {
    const custom = mkdtemp('custom');
    const dirs = platformStoreDirs('sessions', {
      env: {},
      cwd: mkdtemp('cwd'),
      homedir: mkdtemp('home'),
      authBrokerPath: path.join(custom, 'sessions'),
    });
    expect(dirs[0]).toBe(path.join(custom, 'sessions'));
  });

  // 값은 일부러 콜론 없는 합성 경로다 — 실제 임시 디렉터리를 쓰면 Windows에서
  // 드라이브 문자가 섞여 시험이 호스트 플랫폼을 타게 된다.
  it('AUTH_BROKER_PATH를 플랫폼 구분자로 쪼갠다', () => {
    const cwd = mkdtemp('cwd');
    const dirs = platformStoreDirs('sessions', {
      env: { AUTH_BROKER_PATH: '/alpha:/beta' },
      cwd,
      homedir: mkdtemp('home'),
      platform: 'linux',
    });
    expect(dirs).toHaveLength(3);
    expect(dirs[0]).toBe(path.join(path.resolve(cwd, '/alpha'), 'sessions'));
    expect(dirs[1]).toBe(path.join(path.resolve(cwd, '/beta'), 'sessions'));
  });

  // 구는 `[:;]` 양쪽으로 쪼개 Windows 드라이브 문자(`C:\…`)를 두 조각으로
  // 부순다. 신은 플랫폼 구분자만 쓴다.
  it('win32에서 드라이브 문자를 가진 AUTH_BROKER_PATH를 쪼개지 않는다', () => {
    const dirs = platformStoreDirs('service-keys', {
      env: { AUTH_BROKER_PATH: 'C:\\keys;D:\\more' },
      cwd: mkdtemp('cwd'),
      homedir: mkdtemp('home'),
      platform: 'win32',
    });
    expect(dirs).toHaveLength(3);
  });

  it('중복 경로는 한 번만 남는다', () => {
    const dirs = platformStoreDirs('sessions', {
      env: { AUTH_BROKER_PATH: '/alpha:/alpha' },
      cwd: mkdtemp('cwd'),
      homedir: mkdtemp('home'),
      platform: 'linux',
    });
    expect(dirs).toHaveLength(2);
  });
});

describe('serviceKeysDir · sessionsDir', () => {
  it('service key 디렉터리는 첫 후보다', () => {
    const root = storeRoot();
    expect(serviceKeysDir({ env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root })).toBe(
      path.join(root, 'service-keys'),
    );
  });

  // 구 `envResolver.firstPlatformSessionsDir` — cwd가 아닌 첫 후보를 고른다.
  it('세션 디렉터리는 cwd가 아닌 첫 후보다', () => {
    const cwd = mkdtemp('cwd');
    const root = storeRoot();
    expect(sessionsDir({ env: {}, cwd, authBrokerPath: root })).toBe(
      path.join(root, 'sessions'),
    );
  });

  it('저장소 뿌리가 cwd를 가리켜도 하위 폴더를 붙여 cwd 자체는 피한다', () => {
    const cwd = mkdtemp('cwd');
    expect(sessionsDir({ env: {}, cwd, authBrokerPath: cwd })).toBe(
      path.join(path.normalize(cwd), 'sessions'),
    );
  });
});

// ── 이름 검사 ───────────────────────────────────────────────────────────────

describe('checkDestinationName — 이름은 이름이지 경로가 아니다 (D17 유지)', () => {
  it('평범한 이름은 통과한다', () => {
    for (const name of ['TRIAL', 'dev-1', 'my_dest', 'a.b']) {
      expect(checkDestinationName(name).ok).toBe(true);
    }
  });

  it.each([
    ['빈 값', ''],
    ['공백만', '   '],
    ['상대 경로', './foo.env'],
    ['상위 경로', '../foo'],
    ['슬래시', 'a/b'],
    ['역슬래시', 'a\\b'],
    ['홈 표기', '~/foo'],
    ['절대 경로', '/etc/passwd'],
    ['드라이브 상대 경로', 'C:foo'],
  ])('경로처럼 생긴 값은 거부한다 — %s', (_label, name) => {
    const checked = checkDestinationName(name);
    expect(checked.ok).toBe(false);
  });
});

describe('sessionEnvFileName — 구 normalizeEnvFileName', () => {
  it('.env가 없으면 붙인다', () => {
    expect(sessionEnvFileName('TRIAL')).toBe('TRIAL.env');
  });

  it('이미 .env로 끝나면 그대로 둔다 (대소문자 무시)', () => {
    expect(sessionEnvFileName('TRIAL.env')).toBe('TRIAL.env');
    expect(sessionEnvFileName('TRIAL.ENV')).toBe('TRIAL.ENV');
  });
});

// ── 세션 env 파일 ───────────────────────────────────────────────────────────

describe('resolveSessionEnv — `--env=<name>`이 가리키는 파일', () => {
  it('세션 디렉터리의 <name>.env를 찾는다', () => {
    const root = storeRoot();
    const file = writeText(path.join(root, 'sessions', 'DEST1.env'), 'SAP_URL=http://127.0.0.1:1\n');
    const result = resolveSessionEnv('DEST1', {
      env: {},
      cwd: mkdtemp('cwd'),
      authBrokerPath: root,
    });
    expect(result).toEqual({ kind: 'ok', path: file });
  });

  it('없으면 not-found이고 있는 이름들을 알려준다', () => {
    const root = storeRoot();
    writeText(path.join(root, 'sessions', 'OTHER.env'), 'SAP_URL=http://127.0.0.1:1\n');
    const result = resolveSessionEnv('DEST1', {
      env: {},
      cwd: mkdtemp('cwd'),
      authBrokerPath: root,
    });
    expect(result.kind).toBe('not-found');
    if (result.kind === 'not-found') {
      expect(result.path).toBe(path.join(root, 'sessions', 'DEST1.env'));
      expect(result.available).toEqual(['OTHER']);
    }
  });

  it('경로처럼 생긴 이름은 파일을 찾지 않고 거부한다', () => {
    const root = storeRoot();
    writeText(path.join(root, 'sessions', 'foo.env'), 'SAP_URL=http://127.0.0.1:1\n');
    const result = resolveSessionEnv('./foo.env', {
      env: {},
      cwd: mkdtemp('cwd'),
      authBrokerPath: root,
    });
    expect(result.kind).toBe('unsafe-name');
  });
});

// ── service key ─────────────────────────────────────────────────────────────

describe('readServiceKey — `--mcp=<destination>`이 조립하는 설정', () => {
  it('ABAP 형식(중첩 uaa)을 읽는다', () => {
    const root = storeRoot();
    const file = writeJson(path.join(root, 'service-keys', 'DEST1.json'), {
      uaa: {
        url: 'https://uaa.invalid/oauth',
        clientid: 'fixture-client',
        clientsecret: FAKE_SECRET,
      },
      abap: { url: 'http://127.0.0.1:1', client: '100', language: 'EN' },
    });
    const result = readServiceKey('DEST1', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.key).toEqual({
      destination: 'DEST1',
      source: file,
      storeType: 'abap',
      serviceUrl: 'http://127.0.0.1:1',
      client: '100',
      language: 'EN',
      auth: {
        uaaUrl: 'https://uaa.invalid/oauth',
        clientId: 'fixture-client',
        clientSecret: FAKE_SECRET,
      },
    });
  });

  // 구 store: serviceUrl = abap.url || sap_url || (url에 'authentication'이
  // 없을 때만 url).
  it('XSUAA 평면 형식을 읽고 인증 URL을 서비스 URL로 착각하지 않는다', () => {
    const root = storeRoot();
    writeJson(path.join(root, 'service-keys', 'DEST2.json'), {
      url: 'https://authentication.invalid/oauth',
      clientid: 'fixture-client',
      clientsecret: FAKE_SECRET,
      sap_url: 'http://127.0.0.1:2',
      sap_client: '200',
    });
    const result = readServiceKey('DEST2', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.key.storeType).toBe('btp');
    expect(result.key.serviceUrl).toBe('http://127.0.0.1:2');
    expect(result.key.client).toBe('200');
    expect(result.key.auth.uaaUrl).toBe('https://authentication.invalid/oauth');
  });

  it('인증 URL이 아닌 url은 서비스 URL로 쓴다', () => {
    const root = storeRoot();
    writeJson(path.join(root, 'service-keys', 'DEST3.json'), {
      url: 'http://127.0.0.1:3',
      clientid: 'fixture-client',
      clientsecret: FAKE_SECRET,
    });
    const result = readServiceKey('DEST3', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.key.serviceUrl).toBe('http://127.0.0.1:3');
  });

  // 구 JsonFileHandler.unwrapCredentials — `credentials` 하나뿐일 때만 벗긴다.
  it('credentials 한 겹은 벗긴다', () => {
    const root = storeRoot();
    writeJson(path.join(root, 'service-keys', 'DEST4.json'), {
      credentials: {
        uaa: { url: 'https://uaa.invalid', clientid: 'c', clientsecret: FAKE_SECRET },
        abap: { url: 'http://127.0.0.1:4' },
      },
    });
    const result = readServiceKey('DEST4', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.key.serviceUrl).toBe('http://127.0.0.1:4');
  });

  // 구 JsonFileHandler.extractJsonFromText — 앞뒤에 붙은 글을 건너뛴다.
  it('앞뒤에 설명 글이 붙은 JSON도 건져 읽는다', () => {
    const root = storeRoot();
    writeText(
      path.join(root, 'service-keys', 'DEST5.json'),
      `service key:\n{"uaa":{"url":"https://uaa.invalid","clientid":"c","clientsecret":"${FAKE_SECRET}"},"sap_url":"http://127.0.0.1:5"}\n끝.`,
    );
    const result = readServiceKey('DEST5', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.key.serviceUrl).toBe('http://127.0.0.1:5');
  });

  it('파일이 없으면 not-found이고 있는 destination을 알려준다', () => {
    const root = storeRoot();
    writeJson(path.join(root, 'service-keys', 'OTHER.json'), {
      uaa: { url: 'https://uaa.invalid', clientid: 'c', clientsecret: FAKE_SECRET },
    });
    const result = readServiceKey('DEST1', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('not-found');
    if (result.kind !== 'not-found') return;
    expect(result.path).toBe(path.join(root, 'service-keys', 'DEST1.json'));
    expect(result.available).toEqual(['OTHER']);
  });

  it('JSON이 깨졌으면 invalid — 던지지 않는다 (D20)', () => {
    const root = storeRoot();
    writeText(path.join(root, 'service-keys', 'DEST6.json'), 'not json at all');
    const result = readServiceKey('DEST6', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('invalid');
  });

  it('uaa 필수 항목이 빠졌으면 invalid — 반쪽 설정을 만들지 않는다', () => {
    const root = storeRoot();
    writeJson(path.join(root, 'service-keys', 'DEST7.json'), {
      uaa: { url: 'https://uaa.invalid', clientid: 'c' },
    });
    const result = readServiceKey('DEST7', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toContain('clientsecret');
  });

  it('경로처럼 생긴 destination은 파일을 찾지 않고 거부한다', () => {
    const root = storeRoot();
    const result = readServiceKey('../DEST1', {
      env: {},
      cwd: mkdtemp('cwd'),
      authBrokerPath: root,
    });
    expect(result.kind).toBe('unsafe-name');
  });

  // 비밀은 판정 문구에 실리지 않는다 — 진단은 stderr로 나간다.
  it('실패 사유 문구에 clientsecret 값이 실리지 않는다', () => {
    const root = storeRoot();
    writeJson(path.join(root, 'service-keys', 'DEST8.json'), {
      uaa: { url: '', clientid: 'c', clientsecret: FAKE_SECRET },
    });
    const result = readServiceKey('DEST8', { env: {}, cwd: mkdtemp('cwd'), authBrokerPath: root });
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).not.toContain(FAKE_SECRET);
  });
});
