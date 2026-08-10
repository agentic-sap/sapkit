/**
 * 시퀀스 픽스처 형식 — 채록기(T4)가 **쓰고** 재생 러너가 **읽는** 유일한 계약.
 *
 * 왜 낱개 호출이 아니라 시퀀스인가: 쓰기 흐름(잠금 → 수정 → 활성화)은 호출
 * **순서**와 그 사이의 **상태 전달**(1단계가 받은 잠금 핸들을 2단계가 쓴다)이
 * 의미를 갖는다. 낱개로 쪼개면 그 상관관계가 사라지고, 정규화도 단계별로
 * 독립 수행돼 "같은 원본 토큰 → 같은 자리표시자"가 깨진다.
 *
 * 형식 규약:
 * - `steps[i].index === i` — 순서는 배열 순서이자 명시 필드다(직렬화 왕복에서
 *   순서가 조용히 뒤바뀌는 사고를 형식 차원에서 막는다).
 * - 픽스처에 저장되는 모든 문자열은 **정규화 후** 값이다. 비결정 토큰은
 *   `<<KIND_N>>` 자리표시자로 치환돼 있다.
 * - `placeholders`는 자리표시자 **대장**이다. 원본 토큰은 **절대 담지 않는다**
 *   — 담는 순간 정규화가 무의미해지고 픽스처가 비밀 유출 경로가 된다.
 */

/** 픽스처에 담기는 JSON 값. 채록된 응답은 이 형태로 보존된다. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** 형식 판 번호. 형식이 호환 불가로 바뀌면 올리고 재생 러너가 거부한다. */
export const FIXTURE_FORMAT_VERSION = 1;

/** 정규화가 다루는 비결정 토큰의 종류. */
export type NormalizationKind = 'lock-handle' | 'csrf-token' | 'session-id' | 'timestamp' | 'server-id' | 'uri';

/** 종류 → 자리표시자 접두어. */
export const PLACEHOLDER_PREFIX: Readonly<Record<NormalizationKind, string>> = {
  'lock-handle': 'LOCK_HANDLE',
  'csrf-token': 'CSRF_TOKEN',
  'session-id': 'SESSION_ID',
  timestamp: 'TIMESTAMP',
  'server-id': 'SERVER_ID',
  uri: 'URI',
};

/** 접두어 → 종류 (역인덱스). 이미 정규화된 픽스처를 다시 읽을 때 쓴다. */
export const KIND_BY_PREFIX: ReadonlyMap<string, NormalizationKind> = new Map(
  (Object.keys(PLACEHOLDER_PREFIX) as NormalizationKind[]).map((kind) => [PLACEHOLDER_PREFIX[kind], kind]),
);

/** 자리표시자 하나 — 문자열 전체가 자리표시자일 때만 매치. */
export const PLACEHOLDER_ONLY_RE = /^<<[A-Z]+(?:_[A-Z]+)*_\d+>>$/;

/** 문자열 안의 자리표시자를 모두 찾는다. 호출마다 새 정규식을 만들어 lastIndex 오염을 피한다. */
export function findPlaceholders(text: string): string[] {
  return text.match(/<<[A-Z]+(?:_[A-Z]+)*_\d+>>/g) ?? [];
}

/** 문자열 전체가 자리표시자 하나인가. */
export function isPlaceholder(text: string): boolean {
  return PLACEHOLDER_ONLY_RE.test(text);
}

/** 자리표시자를 종류와 일련번호로 쪼갠다. 형식이 아니면 null. */
export function parsePlaceholder(placeholder: string): { kind: NormalizationKind; index: number } | null {
  const m = /^<<([A-Z]+(?:_[A-Z]+)*)_(\d+)>>$/.exec(placeholder);
  if (!m) return null;
  const prefix = m[1];
  const digits = m[2];
  if (prefix === undefined || digits === undefined) return null;
  const kind = KIND_BY_PREFIX.get(prefix);
  if (kind === undefined) return null;
  return { kind, index: Number(digits) };
}

/**
 * 자리표시자 대장 한 줄.
 *
 * `occurrences`는 픽스처 전체에서 이 자리표시자가 나타난 횟수다. 상관 보존이
 * 실제로 일어났는지(잠금 핸들이 2회 이상 등장하는지)를 사람이 눈으로 확인하는
 * 값이자, 재생 러너가 상관 구조를 재구성하는 근거다.
 */
export interface PlaceholderBinding {
  readonly placeholder: string;
  readonly kind: NormalizationKind;
  readonly occurrences: number;
}

/** 시퀀스 한 단계 — 도구 호출 1회와 그 응답. */
export interface SequenceStep {
  /** 0부터. 배열 위치와 반드시 같다. */
  readonly index: number;
  /** MCP 도구 이름 (예: `ReadClass`). */
  readonly tool: string;
  /** 보낸 인자 (정규화 후). */
  readonly args: JsonValue;
  /** 받은 응답 본문 (정규화 후). JSON-RPC `result`, 오류면 `error`. */
  readonly response: JsonValue;
  /** JSON-RPC 오류이거나 `result.isError`가 참이면 true. */
  readonly isError: boolean;
  /** 이 단계가 왜 여기 있는지에 대한 사람 메모. 없으면 null. */
  readonly note: string | null;
}

/** 채록 대상 엔진의 신원. 재생 대조는 이 값이 다르면 대조 자체가 무의미하다. */
export interface EngineIdentity {
  /** MCP `serverInfo.name` (예: `mcp-abap-adt`). */
  readonly name: string;
  /** MCP `serverInfo.version` (예: `5.0.0`). */
  readonly version: string;
  /** 합의된 MCP 프로토콜 판. 응답에 없으면 null. */
  readonly protocolVersion: string | null;
  /** 기동 시 넘긴 `--exposition` 값 그대로 (예: `readonly,high`). */
  readonly exposition: string;
}

/** 시퀀스 픽스처 — 커밋되는 파일 하나의 전체 내용. */
export interface SequenceFixture {
  readonly formatVersion: number;
  /** 파일 이름으로 쓸 수 있는 안정 식별자 (`^[a-z0-9][a-z0-9-]*$`). */
  readonly sequenceId: string;
  /** 이 시퀀스가 무엇을 증명하는지 한 줄 설명. */
  readonly description: string;
  readonly engine: EngineIdentity;
  /**
   * 채록 시각 — **실제 ISO 시각을 그대로 보존한다**. 증거 계층과 커버리지 표가
   * "무엇이 언제 어느 엔진에서 딴 증거인가"를 묻기 때문에 이 출처는 남아야 한다.
   *
   * 재채록마다 파일이 흔들리는 문제는 값을 지워서가 아니라 **대조에서 빼서**
   * 푼다 — `REPLAY_METADATA_POINTERS` 참조. 응답 **안**의 타임스탬프는 여전히
   * 비결정 토큰이므로 정규화 대상이다.
   */
  readonly recordedAt: string;
  readonly steps: readonly SequenceStep[];
  readonly placeholders: readonly PlaceholderBinding[];
}

/**
 * 재생 대조가 **비교하지 않는** 필드 (JSON 포인터).
 *
 * 채록의 출처를 남기는 메타데이터이지 엔진이 낸 응답이 아니다. 여기 값이 다르다고
 * 대조가 실패하면, 같은 시퀀스를 다시 딴 것만으로 동등성이 깨진 것처럼 보인다.
 */
export const REPLAY_METADATA_POINTERS: readonly string[] = ['/recordedAt'];

/** 대조용 투영 — `REPLAY_METADATA_POINTERS`의 필드를 뺀 픽스처. */
export function comparableFixture(fixture: SequenceFixture): Omit<SequenceFixture, 'recordedAt'> {
  const { recordedAt: _recordedAt, ...rest } = fixture;
  return rest;
}

/** `sequenceId`가 파일 이름으로 안전한가. */
export const SEQUENCE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
