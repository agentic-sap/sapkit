/**
 * 마스킹 검사기 — 픽스처를 저장하기 **직전**에 훑고, 하나라도 걸리면 **거부한다**.
 *
 * 경고가 아니라 거부인 이유: 픽스처는 git에 커밋된다. 자격증명·호스트·접속정보·
 * 실데이터가 한 번 들어가면 되돌릴 수 없다. 그러니 판정은 fail-closed이고,
 * **오탐이 조금 있는 편이 누락보다 낫다**.
 *
 * 잡는 것 (규칙 id):
 * - `basic-auth` — Basic 인증 헤더, `authorization` 키
 * - `base64-credential` — `user:pass`로 복호되는 base64 덩어리 (접두어 없어도)
 * - `password-like` — 비밀번호·시크릿·API 키처럼 보이는 키/env 값, URL userinfo
 * - `real-host` — 실제 호스트명·IP·포트·접속 URL (가짜 호스트는 허용 목록)
 * - `cookie` — 쿠키 헤더와 SAP 세션 쿠키
 * - `jwt` — JWT 형태 토큰
 * - `bulk-row-data` — 실데이터 행처럼 보이는 대량 결과
 *
 * 보고서 자체도 새면 안 되므로 위반 항목은 **규칙 id·경로·정적 안내문**만
 * 담는다. 걸린 원문은 어디에도 싣지 않는다.
 */
import { isPlaceholder } from './types';
import type { JsonValue, SequenceFixture } from './types';

export type MaskingRuleId =
  | 'basic-auth'
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

  // ② `host:port`
  for (const m of text.matchAll(/(?<![\w.@/:-])([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+):(\d{2,5})(?!\d)/gi)) {
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

  // ⑤ 실데이터 행 모양 — 도구와 무관하게 형태로 잡는다
  if (countMatches(text, /<\s*(?:[\w.-]+:)?(?:row|item|record)[\s/>]/gi) > ctx.maxRows) hit('bulk-row-data');
  if (countDelimitedRows(text) > ctx.maxRows) hit('bulk-row-data');
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
    for (const [key, item] of Object.entries(value)) {
      const child = `${path}/${key}`;
      const nk = normalizeKey(key);
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
