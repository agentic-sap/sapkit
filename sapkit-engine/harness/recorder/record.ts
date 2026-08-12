/**
 * 채록기 코어 — 시퀀스 하나를 돌려 픽스처를 만든다.
 *
 * 코어는 **전송을 모른다**. `RecorderTransport`(요청 하나를 보내고 응답 하나를
 * 받는다)에만 의존하고, 구 번들을 자식 프로세스로 띄우는 것은 그 인터페이스의
 * 한 구현일 뿐이다(`childProcessTransport.ts`). 이 머신에서 jest가 자식 프로세스
 * 수거에서 비결정적으로 블록된 실측 기록이 있어(`HANDOFF.md`) 단위 시험은 전부
 * 가짜 전송(`scriptedTransport.ts`)으로 돈다.
 *
 * 저장 경로는 두 관문을 반드시 지난다:
 *   ① 정규화 — 비결정 토큰이 자리표시자가 된다 (채록 시점에 붙는다)
 *   ② 마스킹 — 비밀이 하나라도 있으면 **저장 거부** (쓰기 직전에 붙는다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { assertMasked } from './masking';
import type { MaskingOptions } from './masking';
import { normalizeFixture } from './normalize';
import { FIXTURE_FORMAT_VERSION, SEQUENCE_ID_RE } from './types';
import type { JsonValue, PlaceholderBinding, SequenceFixture, SequenceStep } from './types';

// ── 전송 계약 ────────────────────────────────────────────────────────────────

/** 전송이 기동 직후 알려 주는 상대편 신원. */
export interface TransportHandshake {
  readonly serverName: string;
  readonly serverVersion: string;
  readonly protocolVersion: string | null;
  /** 이 전송이 상대에게 넘긴 `--exposition` 값. */
  readonly exposition: string;
}

/** 도구 호출 하나의 결과. `payload`는 손대지 않은 응답 본문이다. */
export interface CapturedResponse {
  readonly payload: JsonValue;
  readonly isError: boolean;
}

/**
 * 채록기가 의존하는 유일한 전송 계약.
 *
 * 좁게 유지한다 — 넓히는 순간 가짜 전송이 무거워지고, 단위 시험이 실제
 * 프로세스를 흉내 내기 시작한다.
 */
export interface RecorderTransport {
  open(): Promise<TransportHandshake>;
  callTool(tool: string, args: Record<string, JsonValue>): Promise<CapturedResponse>;
  close(): Promise<void>;
}

// ── 시퀀스 명세 ──────────────────────────────────────────────────────────────

export interface RecordingStepSpec {
  readonly tool: string;
  readonly args: Record<string, JsonValue>;
  /** 이 단계가 왜 시퀀스에 있는지에 대한 사람 메모. */
  readonly note?: string;
}

/** 무엇을 채록할지에 대한 사람의 지시. */
export interface SequenceSpec {
  readonly sequenceId: string;
  readonly description: string;
  readonly steps: readonly RecordingStepSpec[];
}

// ── 채록 ─────────────────────────────────────────────────────────────────────

/**
 * 시퀀스를 순서대로 돌려 **정규화된** 픽스처를 만든다.
 *
 * 단계 사이에 상태(잠금 핸들 등)가 흐르므로 호출은 반드시 직렬이고, 도구가
 * 오류를 돌려줘도 시퀀스는 계속한다 — 오류 응답도 구 엔진의 계약이고 재생
 * 대조의 대상이다. 전송 자체가 끊기면 거기서 멈추되 전송은 반드시 닫는다.
 */
export async function recordSequence(spec: SequenceSpec, transport: RecorderTransport): Promise<SequenceFixture> {
  if (!SEQUENCE_ID_RE.test(spec.sequenceId)) {
    throw new Error(`sequenceId가 파일 이름으로 안전하지 않다: ${JSON.stringify(spec.sequenceId)} (${SEQUENCE_ID_RE})`);
  }
  if (spec.steps.length === 0) throw new Error('빈 시퀀스는 채록하지 않는다 — steps가 비어 있다.');

  const steps: SequenceStep[] = [];
  try {
    const handshake = await transport.open();
    for (const [index, stepSpec] of spec.steps.entries()) {
      const captured = await transport.callTool(stepSpec.tool, stepSpec.args);
      steps.push({
        index,
        tool: stepSpec.tool,
        args: { ...stepSpec.args },
        response: captured.payload,
        isError: captured.isError,
        note: stepSpec.note ?? null,
      });
    }
    return normalizeFixture({
      formatVersion: FIXTURE_FORMAT_VERSION,
      sequenceId: spec.sequenceId,
      description: spec.description,
      engine: {
        name: handshake.serverName,
        version: handshake.serverVersion,
        protocolVersion: handshake.protocolVersion,
        exposition: handshake.exposition,
      },
      recordedAt: new Date().toISOString(),
      steps,
      placeholders: [],
    });
  } finally {
    await transport.close();
  }
}

// ── 직렬화 ───────────────────────────────────────────────────────────────────

export class FixtureFormatError extends Error {
  constructor(message: string) {
    super(`픽스처 형식 오류 — ${message}`);
    this.name = 'FixtureFormatError';
  }
}

/** 커밋되는 바이트. 필드 순서를 고정해 재채록 시 잡음을 없앤다. */
export function serializeFixture(fixture: SequenceFixture): string {
  const ordered = {
    formatVersion: fixture.formatVersion,
    sequenceId: fixture.sequenceId,
    description: fixture.description,
    engine: {
      name: fixture.engine.name,
      version: fixture.engine.version,
      protocolVersion: fixture.engine.protocolVersion,
      exposition: fixture.engine.exposition,
    },
    recordedAt: fixture.recordedAt,
    steps: fixture.steps.map((s) => ({
      index: s.index,
      tool: s.tool,
      args: s.args,
      response: s.response,
      isError: s.isError,
      note: s.note,
    })),
    placeholders: fixture.placeholders.map((b) => ({
      placeholder: b.placeholder,
      kind: b.kind,
      occurrences: b.occurrences,
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new FixtureFormatError(`${what}은(는) 객체여야 한다.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new FixtureFormatError(`${what}은(는) 문자열이어야 한다.`);
  return value;
}

/** 파일에서 읽은 픽스처를 검증하며 되살린다. 형식이 어긋나면 던진다. */
export function parseFixture(text: string): SequenceFixture {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new FixtureFormatError(`JSON으로 읽히지 않는다 (${err instanceof Error ? err.message : String(err)}).`);
  }
  const root = asRecord(raw, '픽스처');

  if (root['formatVersion'] !== FIXTURE_FORMAT_VERSION) {
    throw new FixtureFormatError(`형식 판이 ${FIXTURE_FORMAT_VERSION}이 아니다 (${String(root['formatVersion'])}).`);
  }
  const sequenceId = asString(root['sequenceId'], 'sequenceId');
  if (!SEQUENCE_ID_RE.test(sequenceId)) {
    throw new FixtureFormatError(`sequenceId가 파일 이름으로 안전하지 않다 (${SEQUENCE_ID_RE}).`);
  }
  const engineRaw = asRecord(root['engine'], 'engine');
  const protocolVersion = engineRaw['protocolVersion'];
  if (protocolVersion !== null && typeof protocolVersion !== 'string') {
    throw new FixtureFormatError('engine.protocolVersion은 문자열이거나 null이어야 한다.');
  }
  const stepsRaw = root['steps'];
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new FixtureFormatError('steps는 비어 있지 않은 배열이어야 한다.');
  }
  const steps: SequenceStep[] = stepsRaw.map((entry, i) => {
    const s = asRecord(entry, `steps[${i}]`);
    if (s['index'] !== i) throw new FixtureFormatError(`steps[${i}].index가 배열 위치와 어긋난다 (${String(s['index'])}).`);
    const isError = s['isError'];
    if (typeof isError !== 'boolean') throw new FixtureFormatError(`steps[${i}].isError는 불리언이어야 한다.`);
    const note = s['note'];
    if (note !== null && typeof note !== 'string') throw new FixtureFormatError(`steps[${i}].note는 문자열이거나 null이어야 한다.`);
    if (!('args' in s) || !('response' in s)) throw new FixtureFormatError(`steps[${i}]에 args/response가 없다.`);
    return {
      index: i,
      tool: asString(s['tool'], `steps[${i}].tool`),
      args: s['args'] as JsonValue,
      response: s['response'] as JsonValue,
      isError,
      note,
    };
  });
  const placeholdersRaw = root['placeholders'];
  if (!Array.isArray(placeholdersRaw)) throw new FixtureFormatError('placeholders는 배열이어야 한다.');
  const placeholders: PlaceholderBinding[] = placeholdersRaw.map((entry, i) => {
    const b = asRecord(entry, `placeholders[${i}]`);
    const occurrences = b['occurrences'];
    if (typeof occurrences !== 'number') throw new FixtureFormatError(`placeholders[${i}].occurrences는 숫자여야 한다.`);
    return {
      placeholder: asString(b['placeholder'], `placeholders[${i}].placeholder`),
      kind: asString(b['kind'], `placeholders[${i}].kind`) as PlaceholderBinding['kind'],
      occurrences,
    };
  });

  return {
    formatVersion: FIXTURE_FORMAT_VERSION,
    sequenceId,
    description: asString(root['description'], 'description'),
    engine: {
      name: asString(engineRaw['name'], 'engine.name'),
      version: asString(engineRaw['version'], 'engine.version'),
      protocolVersion,
      exposition: asString(engineRaw['exposition'], 'engine.exposition'),
    },
    recordedAt: asString(root['recordedAt'], 'recordedAt'),
    steps,
    placeholders,
  };
}

// ── 저장 (마스킹 하드 게이트) ─────────────────────────────────────────────────

/** 파일 쓰기 구현. 시험은 여기에 감시자를 끼워 "쓰지 않았음"을 확인한다. */
export interface FixtureWriter {
  write(filePath: string, contents: string): void;
}

const fsWriter: FixtureWriter = {
  write(filePath, contents) {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf8');
  },
};

export interface SaveOptions {
  readonly writer?: FixtureWriter;
  readonly masking?: MaskingOptions;
}

/**
 * 픽스처를 저장한다 — **마스킹 검사를 먼저** 통과해야 한다.
 *
 * 위반이 하나라도 있으면 `MaskingRejection`을 던지고 파일에 손대지 않는다.
 * 경고 후 저장 같은 중간 지대는 두지 않는다.
 */
export function saveSequenceFixture(fixture: SequenceFixture, filePath: string, opts: SaveOptions = {}): void {
  assertMasked(fixture, opts.masking);
  const contents = serializeFixture(fixture);
  // 되읽기 검증: 방금 만든 바이트가 형식 관문을 통과하는지 쓰기 전에 확인한다.
  parseFixture(contents);
  (opts.writer ?? fsWriter).write(filePath, contents);
}
