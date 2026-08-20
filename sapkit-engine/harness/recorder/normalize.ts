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
 *
 * **숫자에 뚫린 구멍 하나 — 서버가 잰 소요 시간.** `GetSqlQuery` 응답의
 * `execution_time`은 SAP이 그 질의에 실제로 쓴 시간이라 부를 때마다 다르다
 * (2026-08-18 실측: 같은 빈 표에 구 18.464 · 신 0.475). 숫자라는 이유로 그대로
 * 두면 재생 판정이 **엔진 동등성이 아니라 그날 시스템이 얼마나 바빴는지**로
 * 정해진다 — 시나리오 README 함정 ⑵가 도구 단위로 말한 것과 같은 병이다. 그래서
 * 이 값만 자리표시자로 바꾸되, **따옴표를 씌운다**: 응답 본문이 text 블록 안의
 * JSON 문자열이라, 따옴표 없이 넣으면 그 블록이 더 이상 JSON으로 읽히지 않고
 * 대체 기대 시험(D1)이 행 표를 못 읽게 된다.
 *
 * ## `principal` — 성격이 갈리는 여덟 번째 종류
 *
 * 위 일곱은 전부 **비결정 토큰**이다: 부를 때마다 값이 달라져서 대조를 방해하니
 * 치운다. 여덟 번째 `principal`은 다르다 — **값이 안정적인데도** 치운다. 픽스처가
 * PUBLIC 레포에 커밋되고, SAP이 객체 메타데이터의 `adtcore:responsible`·
 * `adtcore:changedBy`·`adtcore:createdBy`와 `CreateTransport` 응답의 `owner`에
 * 접속 사용자의 로그인 아이디를 반드시 박기 때문이다(2026-08-20 실기: 픽스처 9편
 * 중 4편에 22군데).
 *
 * 그래서 이것만 **패턴이 아니라 목록**으로 온다 — 사람 이름·계정 아이디는 모양으로
 * 알아볼 수 없다. 목록은 `normalizeFixture(fixture, { redact })`로 밖에서 들어오고,
 * 채록 진입점이 접속 프로파일의 `SAP_USERNAME`에서 채운다.
 *
 * 마스킹(거부)이 아니라 정규화(치환)인 이유: 거부하면 작성자를 박는 도구들
 * (`Create*`·`Read*` 대부분)의 증거를 영영 남길 수 없다. **가리되 증거는 남겨야**
 * 하므로 자리표시자로 바꾼다. 기존 계약은 그대로다 — 같은 원본 → 같은 자리표시자.
 *
 * 두 가지가 이 종류에만 붙는다.
 * - **대소문자 무시.** SAP은 같은 이름을 두 꼴로 낸다: ADT URI는 소문자
 *   (`/sap/bc/adt/…/testuser`), 메타데이터 속성은 대문자(`responsible="TESTUSER"`).
 *   둘은 **같은 신원**이므로 **같은 자리표시자**를 받는다 — 사상의 키를 대문자로
 *   접어서 그렇게 만든다. 갈라 놓으면 「이 객체의 작성자가 곧 접속자」라는 상관이
 *   픽스처에서 사라진다.
 * - **경계는 영숫자다.** 이름 앞뒤가 `[A-Za-z0-9]`면 매치하지 않는다. `_`는 경계로
 *   **친다** — 그래서 `TESTUSER2`(다른 계정)는 안 걸리고 `ZCL_TESTUSER_DEMO`(이름을
 *   품은 객체명)는 걸린다. 후자를 남기면 그것도 신원 유출이고, 남겨 두면 저장
 *   뒷문(`harness/attended-guard.mjs`)이 어차피 거부해 아무것도 저장되지 않는다.
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
  /**
   * 자리표시자에 따옴표를 씌운다. 원본이 **JSON 안의 숫자**였던 자리에만 쓴다 —
   * 씌우지 않으면 그 JSON이 깨진다.
   */
  readonly quote?: boolean;
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
  // "execution_time": 18.464 · execution_time=18.464 — SAP이 잰 소요 시간
  // (머리말의 「숫자에 뚫린 구멍」). `:`는 JSON 본문, `=`는 진단 문구의 형태다
  // (`ERR_SQLQUERY_PREDICATE_IGNORED`가 그 모양으로 소요 시간을 싣는다).
  // 앞의 뒤돌아보기가 **접미사 오탐**을 막는다 — `total_execution_time` 같은 다른
  // 필드까지 삼키면 주석의 「이 값만」이 거짓이 된다.
  // 이미 자리표시자로 바뀐 자리는 따옴표가 앞서므로 숫자와 만나지 않는다 = 멱등.
  {
    kind: 'duration',
    re: /((?<![A-Za-z0-9_])["']?execution[_-]?time["']?\s*[:=]\s*)(\d+(?:\.\d+)?)/gi,
    tokenGroup: 2,
    quote: true,
  },
];

/** 키 이름 → 종류. 해당 없으면 null. */
export function keyKind(key: string): NormalizationKind | null {
  return KEY_KINDS[key.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}

// ── 신원 가리기 (`principal`) ────────────────────────────────────────────────

/**
 * 가릴 이름의 **최소 길이**. 이보다 짧은 항목은 목록에서 조용히 버린다.
 *
 * 왜 하한이 필요한가. 빈 문자열을 가리면 문자 사이 **모든 자리**가 자리표시자가
 * 되어 픽스처가 통째로 무의미해진다. 두 글자도 거의 그렇다 — 경계가 영숫자라 `_`가
 * 경계로 쳐지므로 `AB`는 `ZCL_AB_DEMO`·`SET AB` 같은 흔한 SAP 토큰 안에서 끝없이
 * 걸리고, 그러면 남는 것은 대조할 수 없는 잡음이다.
 *
 * 3자는 SAP 사용자 아이디의 현실적 하한이기도 하다. 그보다 짧은 아이디로 접속한다면
 * **자동 가리기로는 안전하지 않다**는 뜻이고, 그 판단은 조용히 넘기지 않고 채록
 * 진입점이 사람에게 돌려준다 — `harness/attended-guard.mjs`의 `REDACTION_MIN_LENGTH`가
 * 같은 수를 들고 그 자리를 막는다(두 수가 어긋나면 `gates/test-attended-guard.mjs`가
 * 잡는다).
 */
export const REDACT_MIN_LENGTH = 3;

/** 정규화에 밖에서 들어오는 것 — 지금은 가릴 이름 목록 하나뿐이다. */
export interface NormalizeOptions {
  /**
   * 자리표시자로 가릴 **신원 이름** 목록(접속 사용자의 SAP 로그인 아이디 등).
   * 비었거나 없으면 `principal` 치환은 **아무 일도 하지 않는다** — 기존 픽스처의
   * 정규화 결과가 이 인자 하나로 흔들리지 않게 하기 위해서다.
   */
  readonly redact?: readonly string[];
}

/**
 * 가릴 이름 목록을 쓸 수 있는 꼴로 다듬는다 — 공백 제거 · 짧은 것 버림 ·
 * 대문자로 접어 중복 제거 · **긴 것부터** 정렬.
 *
 * 긴 것부터인 이유: 짧은 이름이 긴 이름의 앞부분일 때(`ZDEV` / `ZDEVOPS`) 교대
 * 정규식은 먼저 쓴 쪽을 택하므로, 긴 쪽이 앞에 서야 잘려 나가지 않는다.
 */
export function redactionTargets(names: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of names ?? []) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (name.length < REDACT_MIN_LENGTH) continue;
    seen.add(name.toUpperCase());
  }
  return [...seen].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 목록에서 치환 정규식 하나를 만든다. 목록이 비면 `null` — 부를 자리에서
 * 「아무것도 안 한다」가 분기 하나로 끝나게.
 *
 * 앞뒤 조건이 곧 경계 규칙이다(머리주석 참조): 영숫자만 경계가 아니고 `_`는 경계다.
 */
function redactionPattern(targets: readonly string[]): RegExp | null {
  if (targets.length === 0) return null;
  return new RegExp(`(?<![A-Za-z0-9])(?:${targets.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`, 'gi');
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
  /** 가릴 신원의 치환 정규식. 목록이 비면 null이고 `principal`은 한 번도 발급되지 않는다. */
  private readonly redactRe: RegExp | null;

  constructor(options: NormalizeOptions = {}) {
    this.redactRe = redactionPattern(redactionTargets(options.redact));
  }

  /**
   * 가릴 이름을 자리표시자로 바꾼다. **다른 어떤 규칙보다 먼저** 돈다 — 신원이
   * 다른 규칙(잠금 핸들 값 등)에 먼저 삼켜지면 종류가 뒤바뀌고, 대장이 「이 픽스처가
   * 무엇을 가렸는가」를 거짓으로 세게 된다.
   *
   * 사상의 키를 **대문자로 접는다**: `HJAEWON`과 `hjaewon`은 같은 신원이므로 같은
   * 자리표시자를 받아야 한다. 접두사 `@principal:`은 우연히 같은 글자의 비결정
   * 토큰과 키가 부딪히는 것을 막는다. 이 키는 `assigned` 안에만 있고 대장에도
   * 픽스처에도 나가지 않는다.
   */
  private redact(text: string): string {
    if (this.redactRe === null) return text;
    return text.replace(this.redactRe, (match) => this.token('principal', `@principal:${match.toUpperCase()}`));
  }

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
    let out = this.redact(text);
    for (const rule of STRING_RULES) {
      out = out.replace(rule.re, (...args: unknown[]): string => {
        const whole = String(args[0]);
        const raw = args[rule.tokenGroup];
        if (typeof raw !== 'string' || raw.length === 0 || isPlaceholder(raw)) return whole;
        let prefix = '';
        for (let i = 1; i < rule.tokenGroup; i++) prefix += typeof args[i] === 'string' ? (args[i] as string) : '';
        const placeholder = this.token(rule.kind, raw);
        return prefix + (rule.quote === true ? `"${placeholder}"` : placeholder);
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
 * 순회 순서가 곧 자리표시자 번호 순서다: **단계만** 훑는다(인자 → 응답, 0번부터).
 * `recordedAt`은 정규화하지 않는다 — 채록의 출처를 남기는 메타데이터이고, 재생
 * 대조는 이 필드를 보지 않는다(`REPLAY_METADATA_POINTERS`). 정규화에서 빠지므로
 * 자리표시자 번호를 하나도 소비하지 않고, 단계 안의 번호는 메타데이터에 딸려
 * 흔들리지 않는다. 응답 **안**의 타임스탬프는 여전히 비결정 토큰이라 그대로
 * 정규화된다.
 *
 * `steps[i].index`는 배열 위치로 다시 매긴다 — 형식 불변식을 여기서 세운다.
 *
 * `options.redact`는 **가릴 신원 이름 목록**이다(머리주석의 `principal`). 훑는
 * 자리가 단계의 **인자와 응답 양쪽**이므로 가리기도 양쪽에 걸린다. 시나리오가
 * 소유한 자리(`description`·`note`·`sequenceId`)는 **일부러 손대지 않는다** —
 * 거기 신원이 박혀 있으면 고칠 자리는 픽스처가 아니라 **시나리오 파일**이고
 * (그 파일도 커밋된다), 저장 뒷문(`harness/attended-guard.mjs`의
 * `detectRedactionLeak`)이 그 경우를 거부해 사람에게 돌려준다.
 */
export function normalizeFixture(fixture: SequenceFixture, options: NormalizeOptions = {}): SequenceFixture {
  const n = new Normalizer(options);
  const steps: SequenceStep[] = fixture.steps.map((step, index) => ({
    index,
    tool: step.tool,
    args: n.normalizeJson(step.args, null),
    response: n.normalizeJson(step.response, null),
    isError: step.isError,
    note: step.note ?? null,
  }));
  return {
    formatVersion: fixture.formatVersion,
    sequenceId: fixture.sequenceId,
    description: fixture.description,
    engine: fixture.engine,
    recordedAt: fixture.recordedAt,
    steps,
    placeholders: n.bindings(),
  };
}
