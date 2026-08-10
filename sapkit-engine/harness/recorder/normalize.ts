/**
 * 정규화 필터 — 비결정 토큰을 안정된 자리표시자로 바꾼다.
 *
 * **되돌릴 수 있는 규칙이 아니라 판정용 사상(mapping)이다.** 원본 토큰은
 * 어디에도 남기지 않는다. 대신 지키는 성질은 하나:
 *
 *   같은 원본 토큰 → 같은 자리표시자, 다른 원본 토큰 → 다른 자리표시자
 *
 * 이 성질이 시퀀스 안의 상관관계를 보존한다. 1단계 응답에서 받은 잠금 핸들을
 * 2단계 인자가 쓴다면, 정규화 후에도 두 자리는 같은 자리표시자를 갖는다.
 * 낱개 호출 단위로 정규화하면 이 성질이 성립할 수 없다 — 그래서 정규화기는
 * 시퀀스 전체에 걸쳐 **하나의 상태**를 이어 간다.
 *
 * 잡는 경로는 둘이다.
 * - **구조**: 값이 어떤 키(`lockHandle`·`location`…) 아래 있으면 값 전체가 토큰.
 * - **문자열**: 자유 텍스트(ADT의 XML 본문·헤더 덤프) 안의 패턴.
 *
 * 두 경로가 같은 원본을 잡아도 사상은 원본 토큰만으로 키를 잡으므로 결과는
 * 같은 자리표시자다.
 *
 * 반대로 **건드리지 않는 것**: 결정적인 객체 URI(`/sap/bc/adt/oo/classes/zcl_x`),
 * 숫자·불리언·null. 결정적인 값이야말로 대조가 봐야 할 신호다.
 */
import { PLACEHOLDER_PREFIX, findPlaceholders, isPlaceholder, parsePlaceholder } from './types';
import type { JsonValue, NormalizationKind, PlaceholderBinding, SequenceFixture, SequenceStep } from './types';

/** 값 전체가 토큰인 키. 비교 전 소문자·비영숫자 제거로 정규화한 이름으로 판정한다. */
const KEY_KINDS: Readonly<Record<string, NormalizationKind>> = {
  lockhandle: 'lock-handle',
  xsaplockhandle: 'lock-handle',
  csrftoken: 'csrf-token',
  xcsrftoken: 'csrf-token',
  sessionid: 'session-id',
  mcpsessionid: 'session-id',
  timestamp: 'timestamp',
  createdat: 'timestamp',
  changedat: 'timestamp',
  modifiedat: 'timestamp',
  lastchanged: 'timestamp',
  lastmodified: 'timestamp',
  recordedat: 'timestamp',
  expiresat: 'timestamp',
  starttime: 'timestamp',
  endtime: 'timestamp',
  etag: 'server-id',
  requestid: 'server-id',
  correlationid: 'server-id',
  traceid: 'server-id',
  runid: 'server-id',
  jobid: 'server-id',
  worklistid: 'server-id',
  location: 'uri',
  worklisturi: 'uri',
  resulturi: 'uri',
  traceuri: 'uri',
};

interface StringRule {
  readonly kind: NormalizationKind;
  readonly re: RegExp;
  /** 토큰이 담긴 캡처 그룹 번호. 1..tokenGroup-1은 그대로 되돌려 붙일 접두부다. */
  readonly tokenGroup: number;
}

/**
 * 자유 텍스트 규칙. 순서가 곧 우선순위다 — 앞선 규칙이 만든 자리표시자는
 * 뒤 규칙에 다시 걸리지 않는다(자리표시자는 건너뛴다).
 *
 * 각 규칙의 매치는 **토큰에서 끝나야 한다**. 그래야 접두부만 되돌려 붙이면
 * 나머지 문자열이 온전히 살아남는다(`?lockHandle=X&y=1`의 `&y=1`).
 */
const STRING_RULES: readonly StringRule[] = [
  // <LOCK_HANDLE>...</LOCK_HANDLE> — ADT 잠금 응답의 XML 형태
  { kind: 'lock-handle', re: /(<\s*(?:[\w.-]+:)?LOCK_HANDLE\s*>)([^<]+)/gi, tokenGroup: 2 },
  // "lockHandle": "..." / lockHandle=... / ?lock_handle=...
  { kind: 'lock-handle', re: /((?:lock[_-]?handle)["']?\s*[:=]\s*["']?)([^"'&<>\s,;}]+)/gi, tokenGroup: 2 },
  // x-csrf-token: ... / "csrfToken": "..."
  { kind: 'csrf-token', re: /((?:x-)?csrf[_-]?token["']?\s*[:=]\s*["']?)([^"'&<>\s,;}]+)/gi, tokenGroup: 2 },
  // sessionId: ... — 앞이 영숫자/밑줄이면 매치하지 않는다. SAP_SESSIONID_* 쿠키는
  // 정규화 대상이 아니라 **마스킹 거부 대상**이므로 여기서 삼키면 안 된다.
  { kind: 'session-id', re: /((?<![A-Za-z0-9_])session[_-]?id["']?\s*[:=]\s*["']?)([^"'&<>\s,;}]+)/gi, tokenGroup: 2 },
  // ISO 8601 타임스탬프
  { kind: 'timestamp', re: /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)/g, tokenGroup: 1 },
  // UUID
  { kind: 'server-id', re: /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g, tokenGroup: 1 },
  // 서버 생성 32자리 hex (ATC 워크리스트·트레이스 id 등)
  { kind: 'server-id', re: /(?<![0-9A-Za-z])([0-9A-Fa-f]{32})(?![0-9A-Za-z])/g, tokenGroup: 1 },
];

/** 키 이름 → 종류. 해당 없으면 null. */
export function keyKind(key: string): NormalizationKind | null {
  return KEY_KINDS[key.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}

/**
 * 시퀀스 하나에 걸친 정규화 상태.
 *
 * 인스턴스 하나가 곧 하나의 사상이다. 시퀀스마다 새로 만들고, 시퀀스 안에서는
 * 절대 새로 만들지 않는다 — 새로 만드는 순간 상관 보존이 깨진다.
 */
export class Normalizer {
  /** 원본 토큰 → 자리표시자. **키가 원본이라 절대 밖으로 내보내지 않는다.** */
  private readonly assigned = new Map<string, string>();
  private readonly kindOf = new Map<string, NormalizationKind>();
  private readonly occurrences = new Map<string, number>();
  private readonly issueOrder: string[] = [];
  private readonly nextIndex = new Map<NormalizationKind, number>();

  /** 원본 토큰에 대응하는 자리표시자를 얻고 등장 횟수를 1 올린다. */
  token(kind: NormalizationKind, raw: string): string {
    const existing = this.assigned.get(raw);
    if (existing !== undefined) {
      this.count(existing);
      return existing;
    }
    const index = (this.nextIndex.get(kind) ?? 0) + 1;
    this.nextIndex.set(kind, index);
    const placeholder = `<<${PLACEHOLDER_PREFIX[kind]}_${index}>>`;
    this.assigned.set(raw, placeholder);
    this.register(placeholder, kind);
    this.count(placeholder);
    return placeholder;
  }

  /**
   * 이미 자리표시자인 것을 대장에 반영한다. 한 번 정규화한 픽스처를 다시
   * 정규화해도 결과가 같으려면(멱등) 이 등록이 필요하다.
   */
  private absorb(text: string): void {
    for (const placeholder of findPlaceholders(text)) {
      const parsed = parsePlaceholder(placeholder);
      if (parsed === null) continue;
      this.register(placeholder, parsed.kind);
      if ((this.nextIndex.get(parsed.kind) ?? 0) < parsed.index) this.nextIndex.set(parsed.kind, parsed.index);
      this.count(placeholder);
    }
  }

  private register(placeholder: string, kind: NormalizationKind): void {
    if (this.occurrences.has(placeholder)) return;
    this.occurrences.set(placeholder, 0);
    this.kindOf.set(placeholder, kind);
    this.issueOrder.push(placeholder);
  }

  private count(placeholder: string): void {
    this.occurrences.set(placeholder, (this.occurrences.get(placeholder) ?? 0) + 1);
  }

  /** 자유 텍스트 하나를 정규화한다. */
  normalizeString(text: string): string {
    this.absorb(text);
    let out = text;
    for (const rule of STRING_RULES) {
      out = out.replace(rule.re, (...args: unknown[]): string => {
        const whole = String(args[0]);
        const raw = args[rule.tokenGroup];
        if (typeof raw !== 'string' || raw.length === 0 || isPlaceholder(raw)) return whole;
        let prefix = '';
        for (let i = 1; i < rule.tokenGroup; i++) prefix += typeof args[i] === 'string' ? (args[i] as string) : '';
        return prefix + this.token(rule.kind, raw);
      });
    }
    return out;
  }

  /**
   * JSON 값 하나를 정규화한다. `keyHint`는 이 값을 담고 있던 키의 종류다
   * (배열이면 바깥 키의 종류가 원소로 전달된다).
   */
  normalizeJson(value: JsonValue, keyHint: NormalizationKind | null): JsonValue {
    if (typeof value === 'string') {
      if (keyHint !== null && value.length > 0 && !isPlaceholder(value)) return this.token(keyHint, value);
      return this.normalizeString(value);
    }
    if (Array.isArray(value)) return value.map((item) => this.normalizeJson(item, keyHint));
    if (value !== null && typeof value === 'object') {
      const out: { [key: string]: JsonValue } = {};
      for (const [key, item] of Object.entries(value)) out[key] = this.normalizeJson(item, keyKind(key));
      return out;
    }
    return value;
  }

  /** 자리표시자 대장. 발급 순서를 유지한다. 원본 토큰은 담기지 않는다. */
  bindings(): PlaceholderBinding[] {
    return this.issueOrder.map((placeholder) => ({
      placeholder,
      kind: this.kindOf.get(placeholder) ?? 'server-id',
      occurrences: this.occurrences.get(placeholder) ?? 0,
    }));
  }
}

/**
 * 픽스처 전체를 정규화한다.
 *
 * 순회 순서가 곧 자리표시자 번호 순서다: **단계를 먼저**(인자 → 응답, 0번부터)
 * 훑고 마지막에 `recordedAt`을 훑는다. 메타데이터가 `<<TIMESTAMP_1>>`을 먼저
 * 가져가면 단계 안의 번호가 메타데이터에 딸려 흔들리기 때문이다.
 *
 * `steps[i].index`는 배열 위치로 다시 매긴다 — 형식 불변식을 여기서 세운다.
 */
export function normalizeFixture(fixture: SequenceFixture): SequenceFixture {
  const n = new Normalizer();
  const steps: SequenceStep[] = fixture.steps.map((step, index) => ({
    index,
    tool: step.tool,
    args: n.normalizeJson(step.args, null),
    response: n.normalizeJson(step.response, null),
    isError: step.isError,
    note: step.note ?? null,
  }));
  const recordedAt = n.normalizeString(fixture.recordedAt);
  return {
    formatVersion: fixture.formatVersion,
    sequenceId: fixture.sequenceId,
    description: fixture.description,
    engine: fixture.engine,
    recordedAt,
    steps,
    placeholders: n.bindings(),
  };
}
