/**
 * 마스킹 검사기 — 픽스처를 저장하기 **직전**에 훑고, 하나라도 걸리면 **거부한다**.
 *
 * 경고가 아니라 거부인 이유: 픽스처는 git에 커밋된다. 자격증명·호스트·접속정보·
 * 실데이터가 한 번 들어가면 되돌릴 수 없다. 그러니 판정은 fail-closed이고,
 * **오탐이 조금 있는 편이 누락보다 낫다**.
 *
 * 잡는 것 (규칙 id):
 * - `basic-auth` — Basic 인증 헤더, `authorization` 키
 * - `bearer-token` — 불투명 Bearer 토큰 (Basic도 JWT도 아니어서 사이로 샌다)
 * - `base64-credential` — `user:pass`로 복호되는 base64 덩어리 (접두어 없어도)
 * - `password-like` — 비밀번호·시크릿·API 키처럼 보이는 키/env 값, URL userinfo
 * - `real-host` — 실제 호스트명·IPv4/IPv6·포트·접속 URL (가짜 호스트는 허용 목록)
 * - `cookie` — 쿠키 헤더와 SAP 세션 쿠키
 * - `jwt` — JWT 형태 토큰
 * - `bulk-row-data` — 실데이터 행처럼 보이는 대량 결과
 *
 * 훑는 자리는 값**과** 객체의 **키 이름** 둘 다다. 호스트별 맵처럼 접속정보가
 * 키 자리에 실리는 응답이 있고, 값만 보면 그대로 통과하기 때문이다.
 *
 * 보고서 자체도 새면 안 되므로 위반 항목은 **규칙 id·경로·정적 안내문**만
 * 담는다. 걸린 원문은 어디에도 싣지 않는다 — 비밀이 키 이름 자리일 때는 경로에
 * 키를 그대로 쓰지 않고 `<key#N>`으로 가린다.
 */
import { isPlaceholder } from './types';
import type { JsonValue, SequenceFixture } from './types';

export type MaskingRuleId =
  | 'basic-auth'
  | 'bearer-token'
  | 'base64-credential'
  | 'password-like'
  | 'real-host'
  | 'cookie'
  | 'jwt'
  | 'bulk-row-data';

export interface MaskingViolation {
  readonly ruleId: MaskingRuleId;
  /** 픽스처 안의 위치 (JSON 포인터 꼴). */
  readonly path: string;
  /** 사람에게 무엇을 고치라고 알리는 정적 문구. **걸린 원문은 담지 않는다.** */
  readonly hint: string;
}

export interface MaskingOptions {
  /** 기본 허용 목록에 **더할** 호스트. 판 번호 오탐 같은 것을 풀 때 쓴다. */
  readonly allowedHosts?: readonly string[];
  /** 이보다 많은 행이면 대량 실데이터로 본다. 기본 20. */
  readonly maxRows?: number;
}

export class MaskingRejection extends Error {
  readonly violations: readonly MaskingViolation[];
  constructor(violations: readonly MaskingViolation[]) {
    const summary = [...new Set(violations.map((v) => v.ruleId))].sort().join(', ');
    super(
      `마스킹 검사 거부 — 위반 ${violations.length}건 (${summary}). ` +
        `픽스처를 저장하지 않았다. 위치는 violations[].path 참조.`,
    );
    this.name = 'MaskingRejection';
    this.violations = violations;
  }
}

const DEFAULT_MAX_ROWS = 20;

/** 접속처가 아닌 것이 확실한 호스트 — XML 네임스페이스와 문서용 이름. */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '0.0.0.0',
  '::1',
  '[::1]',
  'example.com',
  'example.net',
  'example.org',
  'www.w3.org',
  'w3.org',
  'www.sap.com',
  'sap.com',
  'xml.sap.com',
  'schemas.xmlsoap.org',
  'purl.org',
  'www.purl.org',
  'docs.oasis-open.org',
]);

/** RFC 2606/6761이 예약한, 실제로 존재할 수 없는 이름들. */
const ALLOWED_SUFFIXES: readonly string[] = ['.example', '.test', '.invalid', '.localhost'];

/** 자유 텍스트에서 맨 이름만으로도 실제 호스트로 볼 최상위 도메인. */
const REAL_TLDS =
  'com|net|org|io|cloud|corp|local|internal|de|kr|jp|cn|eu|us|uk|fr|it|es|ca|au|in|br|ru|nl|ch|se|no|dk|fi|pl|cz|at|be';

const ROW_DATA_TOOLS: ReadonlySet<string> = new Set(['GetTableContents', 'GetSqlQuery']);

const HINTS: Readonly<Record<MaskingRuleId, string>> = {
  'basic-auth': '자격증명이 실린 인증 헤더로 보인다. 채록 전 헤더를 걷어내거나 정규화 대상에 넣어라.',
  'bearer-token': '불투명 Bearer 토큰이 실렸다. 토큰은 자격증명이므로 정규화가 아니라 제거 대상이다.',
  'base64-credential': 'base64가 `사용자:비밀번호` 꼴로 복호된다. 자격증명이 픽스처에 실렸다.',
  'password-like': '비밀번호·시크릿·API 키로 보이는 값이 실렸다.',
  'real-host': '실제 호스트명·IP·포트로 보인다. 픽스처에는 `sap.example.test` 같은 명백한 가짜만 남긴다.',
  cookie: '세션 쿠키가 실렸다. 쿠키는 자격증명이므로 정규화가 아니라 제거 대상이다.',
  jwt: 'JWT 형태의 토큰이 실렸다.',
  'bulk-row-data': '실데이터 행으로 보이는 대량 결과다. 픽스처는 데모 데이터만 담는다.',
};

// ── 판정 도우미 ───────────────────────────────────────────────────────────────

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 호스트 문자열에서 스킴·사용자정보·경로·포트를 벗겨 낸 이름.
 * 값이 통째 URL로 들어오는 키(`SAP_URL`·`destination`)도 여기서 정리된다.
 */
function bareHost(raw: string): string {
  let host = raw.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const at = host.lastIndexOf('@');
  if (at >= 0) host = host.slice(at + 1);
  host = host.split('/')[0] ?? host;
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    if (close > 0) return host.slice(0, close + 1);
  }
  // IPv6 리터럴은 콜론이 여럿이라 포트 분리를 하지 않는다.
  if ((host.match(/:/g) ?? []).length > 1) return host;
  const colon = host.lastIndexOf(':');
  if (colon > 0) host = host.slice(0, colon);
  return host.replace(/\.$/, '');
}

function isAllowedHost(raw: string, extra: ReadonlySet<string>): boolean {
  const host = bareHost(raw);
  if (host === '') return true;
  if (ALLOWED_HOSTS.has(host) || extra.has(host)) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (ALLOWED_SUFFIXES.some((s) => host.endsWith(s))) return true;
  return ['example.com', 'example.net', 'example.org'].some((s) => host.endsWith(`.${s}`));
}

/** base64 덩어리가 `사용자:비밀번호`로 복호되는가. */
function decodesToCredential(token: string): boolean {
  if (token.length < 12) return false;
  const stripped = token.replace(/=+$/, '');
  const padded = stripped + '='.repeat((4 - (stripped.length % 4)) % 4);
  let decoded: string;
  let roundTrip: string;
  try {
    const buf = Buffer.from(padded, 'base64');
    decoded = buf.toString('utf8');
    roundTrip = buf.toString('base64').replace(/=+$/, '');
  } catch {
    return false;
  }
  if (roundTrip !== stripped) return false;
  return /^[A-Za-z0-9._@-]{1,64}:[\x21-\x7e]{1,64}$/.test(decoded);
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function countDelimitedRows(text: string): number {
  let rows = 0;
  for (const line of text.split('\n')) {
    if (countMatches(line, /\|/g) >= 2 || countMatches(line, /\t/g) >= 2) rows += 1;
  }
  return rows;
}

/**
 * 행 배열이 실릴 만한 키 이름. `columns`는 **일부러 뺐다** — 열이 서른 개인 넓은
 * 테이블의 열 목록을 행으로 세면 데모 데이터 세 줄짜리 픽스처까지 거부된다.
 */
const ROW_CONTAINER_KEYS: ReadonlySet<string> = new Set(['rows', 'records', 'entries', 'items', 'data', 'results']);

/** parse된 JSON에서 행 컨테이너 키 아래 배열의 최대 원소 수. */
function countRowContainers(value: JsonValue, depth: number): number {
  if (depth > 6) return 0;
  let best = 0;
  if (Array.isArray(value)) {
    for (const item of value) best = Math.max(best, countRowContainers(item, depth + 1));
    return best;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (Array.isArray(item) && ROW_CONTAINER_KEYS.has(normalizeKey(key))) best = Math.max(best, item.length);
      best = Math.max(best, countRowContainers(item, depth + 1));
    }
  }
  return best;
}

/**
 * JSON으로 읽히지 않을 때의 보수적 폴백 — 반복되는 레코드 모양을 센다.
 * 잘린 응답이나 다른 직렬화 앞에서 눈을 감지 않기 위한 것이고, 여기서는
 * **오탐이 누락보다 낫다**.
 */
function estimateRowsInText(text: string): number {
  let objectLines = 0;
  for (const line of text.split('\n')) if (/^\s*\{/.test(line)) objectLines += 1;
  const inline = countMatches(text, /\}\s*,\s*\{/g);
  return Math.max(objectLines, inline === 0 ? 0 : inline + 1);
}

/**
 * 실데이터 도구 응답의 **text 콘텐츠 안**을 들여다보고 행 수를 센다.
 *
 * 구 엔진(`handleGetTableContents`·`handleGetSqlQuery`)은 행을 JSON 배열 노드로
 * 싣지 않는다 — `JSON.stringify(parsedData, null, 2)` **문자열**을 담는다. 그래서
 * 바깥에서 배열 길이만 세는 검사는 정확히 가장 위험한 응답을 통째로 놓친다.
 */
function countRowsInText(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return estimateRowsInText(text);
  }
  if (parsed === null || typeof parsed !== 'object') return 0;
  const value = parsed as JsonValue;
  if (Array.isArray(value)) {
    // 최상위가 곧 행 배열인 형태(원소가 레코드인 맨 배열)도 센다.
    const rootRows = value.filter((i) => i !== null && typeof i === 'object' && !Array.isArray(i)).length;
    return Math.max(rootRows, countRowContainers(value, 0));
  }
  return countRowContainers(value, 0);
}

// ── 문자열 규칙 ───────────────────────────────────────────────────────────────

interface ScanContext {
  readonly maxRows: number;
  readonly extraHosts: ReadonlySet<string>;
  /** 이 값이 실데이터 도구(GetTableContents·GetSqlQuery)의 것인가. */
  readonly rowDataTool: boolean;
}

function scanString(text: string, path: string, ctx: ScanContext, out: MaskingViolation[]): void {
  const hit = (ruleId: MaskingRuleId): void => void out.push({ ruleId, path, hint: HINTS[ruleId] });

  if (/\bBasic\s+[A-Za-z0-9+/]{8,}={0,2}/.test(text)) hit('basic-auth');
  // 불투명 Bearer 토큰 — Basic 규칙(Basic 전용)에도 JWT 규칙(eyJ 전용)에도 걸리지
  // 않아 두 규칙 사이로 샌다.
  if (/\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}/i.test(text)) hit('bearer-token');
  if (/\b(?:set-)?cookie\s*:/i.test(text)) hit('cookie');
  if (/\b(?:SAP_SESSIONID_[A-Z0-9_]+|MYSAPSSO2|sap-usercontext)\s*=\s*\S/i.test(text)) hit('cookie');
  if (/\beyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/.test(text)) hit('jwt');

  // 비밀번호처럼 보이는 대입 — `SAP_PASSWORD=x`, `"secret": "x"`, `apiKey=x`
  const secretAssign =
    /(?:sap[_-])?(?:password|passwd|pwd|secret|api[_-]?key|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["']?([^"'\s,;}&]+)/gi;
  for (const m of text.matchAll(secretAssign)) {
    const value = m[1];
    if (value !== undefined && !isPlaceholder(value)) {
      hit('password-like');
      break;
    }
  }

  for (const m of text.matchAll(/[A-Za-z0-9+/]{12,}={0,2}/g)) {
    if (decodesToCredential(m[0])) {
      hit('base64-credential');
      break;
    }
  }

  // ① URL 오리티 ─ `scheme://authority`
  for (const m of text.matchAll(/\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^\s"'<>\\)]+)/g)) {
    const authority = m[1];
    if (authority === undefined) continue;
    if (authority.includes('@')) hit('password-like');
    if (!isAllowedHost(authority, ctx.extraHosts)) {
      hit('real-host');
      break;
    }
  }

  // ② `host:port` — 점 있는 이름과 **단일 라벨**(`sapdev01:44300`) 둘 다.
  //    SAP 온프렘 호스트는 단일 라벨이 흔하다. 단일 라벨 쪽은 글자로 시작하고
  //    세 자 이상일 때만 본다 — 그래야 `09:15` 같은 시각 표기를 호스트로 읽지 않는다.
  const hostPort = /(?<![\w.@/:-])((?:[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)|(?:[a-z][a-z0-9-]{2,})):(\d{2,5})(?!\d)/gi;
  for (const m of text.matchAll(hostPort)) {
    const host = m[1];
    if (host !== undefined && !isAllowedHost(host, ctx.extraHosts)) {
      hit('real-host');
      break;
    }
  }

  // ③ IPv4 리터럴 — 각 옥텟 0~255일 때만. 커널 판 번호(753.0.0.0)는 걸리지 않는다.
  const ipv4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;
  for (const m of text.matchAll(ipv4)) {
    if (!isAllowedHost(m[0], ctx.extraHosts)) {
      hit('real-host');
      break;
    }
  }

  // ④ 맨 이름 FQDN — 실재하는 최상위 도메인일 때만
  for (const m of text.matchAll(new RegExp(`\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${REAL_TLDS})\\b`, 'gi'))) {
    if (!isAllowedHost(m[0], ctx.extraHosts)) {
      hit('real-host');
      break;
    }
  }

  // ⑤ IPv6 리터럴 — `::` 압축형이거나 8그룹 완전형일 때만 본다. 이 조건이 없으면
  //    `09:15:22` 같은 시각 표기가 전부 주소로 읽힌다(3그룹짜리는 IPv6가 아니다).
  //    루프백 `::1`은 허용 목록이 통과시킨다.
  const ipv6 =
    /(?<![0-9A-Za-z:.])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:)+:(?:[0-9a-f]{1,4}:)*[0-9a-f]{1,4}|::(?:[0-9a-f]{1,4}:)*[0-9a-f]{1,4})(?![0-9A-Za-z:.])/gi;
  for (const m of text.matchAll(ipv6)) {
    if (!isAllowedHost(m[0], ctx.extraHosts)) {
      hit('real-host');
      break;
    }
  }

  // ⑥ 실데이터 행 모양 — 도구와 무관하게 형태로 잡는다
  if (countMatches(text, /<\s*(?:[\w.-]+:)?(?:row|item|record)[\s/>]/gi) > ctx.maxRows) hit('bulk-row-data');
  if (countDelimitedRows(text) > ctx.maxRows) hit('bulk-row-data');

  // ⑦ 실데이터 도구라면 **text 콘텐츠 안**까지 들여다본다. 구 엔진은 행을 배열
  //    노드가 아니라 pretty-print JSON 문자열로 싣기 때문에, 여기가 없으면 실테이블
  //    수십 행이 실린 응답이 마스킹을 통과해 커밋된다.
  if (ctx.rowDataTool && countRowsInText(text) > ctx.maxRows) hit('bulk-row-data');
}

// ── 순회 ─────────────────────────────────────────────────────────────────────

/** 비밀번호·자격증명 계열 키. */
const SECRET_KEYS = /^(password|passwd|pwd|secret|credential|credentials|apikey|clientsecret|privatekey|accesskey|authtoken)$/;
/** 접속처를 담는 키. 값이 맨 호스트명이어도 잡는다. */
const HOST_KEYS =
  /^(saphost|sapashost|ashost|mshost|sapurl|sapserver|sapdestination|destination|baseurl|hostname|serverurl|endpoint)$/;

function scanValue(value: JsonValue, path: string, ctx: ScanContext, out: MaskingViolation[]): void {
  if (typeof value === 'string') {
    scanString(value, path, ctx, out);
    return;
  }
  if (Array.isArray(value)) {
    if (ctx.rowDataTool && value.length > ctx.maxRows) {
      out.push({ ruleId: 'bulk-row-data', path, hint: HINTS['bulk-row-data'] });
    }
    value.forEach((item, i) => scanValue(item, `${path}/${i}`, ctx, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [i, [key, item]] of Object.entries(value).entries()) {
      const child = `${path}/${key}`;
      const nk = normalizeKey(key);
      // 키 **이름 자체**도 문자열 규칙을 한 번 지난다 — 호스트별 맵처럼 접속정보가
      // 키 자리에 실리면 값만 훑는 검사는 그대로 통과시킨다. 경로에는 키를 쓰지
      // 않는다: 비밀이 키 이름일 때 보고서가 그 비밀을 되싣게 되기 때문이다.
      scanString(key, `${path}/<key#${i}>`, ctx, out);
      if (typeof item === 'string' && item.length > 0 && !isPlaceholder(item)) {
        if (SECRET_KEYS.test(nk)) out.push({ ruleId: 'password-like', path: child, hint: HINTS['password-like'] });
        if (nk === 'authorization' || nk === 'proxyauthorization') {
          out.push({ ruleId: 'basic-auth', path: child, hint: HINTS['basic-auth'] });
        }
        if (nk === 'cookie' || nk === 'setcookie') out.push({ ruleId: 'cookie', path: child, hint: HINTS.cookie });
        if (HOST_KEYS.test(nk) && !isAllowedHost(item, ctx.extraHosts)) {
          out.push({ ruleId: 'real-host', path: child, hint: HINTS['real-host'] });
        }
      }
      scanValue(item, child, ctx, out);
    }
  }
}

function dedupe(violations: readonly MaskingViolation[]): MaskingViolation[] {
  const seen = new Set<string>();
  const out: MaskingViolation[] = [];
  for (const v of violations) {
    const key = `${v.ruleId} ${v.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function contextOf(opts: MaskingOptions | undefined, rowDataTool: boolean): ScanContext {
  return {
    maxRows: opts?.maxRows ?? DEFAULT_MAX_ROWS,
    extraHosts: new Set((opts?.allowedHosts ?? []).map((h) => h.toLowerCase())),
    rowDataTool,
  };
}

/** 값 하나를 훑는다. 픽스처 밖의 조각(응답 하나)을 따로 볼 때 쓴다. */
export function scanForSecrets(
  value: JsonValue,
  basePath = '',
  opts?: MaskingOptions & { readonly rowDataTool?: boolean },
): MaskingViolation[] {
  const out: MaskingViolation[] = [];
  scanValue(value, basePath, contextOf(opts, opts?.rowDataTool ?? false), out);
  return dedupe(out);
}

/** 픽스처 전체를 훑는다. 위반이 있으면 던진다 — 저장 경로의 하드 게이트. */
export function assertMasked(fixture: SequenceFixture, opts?: MaskingOptions): void {
  const out: MaskingViolation[] = [];
  const meta = contextOf(opts, false);
  scanValue(fixture.sequenceId, '/sequenceId', meta, out);
  scanValue(fixture.description, '/description', meta, out);
  scanValue(fixture.engine.name, '/engine/name', meta, out);
  scanValue(fixture.engine.version, '/engine/version', meta, out);
  scanValue(fixture.engine.protocolVersion, '/engine/protocolVersion', meta, out);
  scanValue(fixture.engine.exposition, '/engine/exposition', meta, out);
  scanValue(fixture.recordedAt, '/recordedAt', meta, out);
  fixture.steps.forEach((step, i) => {
    const ctx = contextOf(opts, ROW_DATA_TOOLS.has(step.tool));
    scanValue(step.tool, `/steps/${i}/tool`, ctx, out);
    scanValue(step.args, `/steps/${i}/args`, ctx, out);
    scanValue(step.response, `/steps/${i}/response`, ctx, out);
    if (step.note !== null) scanValue(step.note, `/steps/${i}/note`, ctx, out);
  });
  fixture.placeholders.forEach((b, i) => scanValue(b.placeholder, `/placeholders/${i}/placeholder`, meta, out));

  const violations = dedupe(out);
  if (violations.length > 0) throw new MaskingRejection(violations);
}
