/**
 * 재생 시험용 조립기.
 *
 * 여기서 만드는 것은 전부 **명백한 가짜**다 — 호스트는 `sap.example.test`,
 * 자격증명 모양의 문자열은 음성시험(보고서가 비밀을 되싣지 않는지) 안에서만
 * 쓰고 파일로 저장하지 않는다. `fixtures/`에는 아무것도 쓰지 않는다.
 */
import { FIXTURE_FORMAT_VERSION, ScriptedTransport, normalizeFixture } from '../../recorder';
import type { JsonValue, SequenceFixture, SequenceStep } from '../../recorder';
import type { ScriptedResponse } from '../../recorder';

/** 도구 응답 봉투 — 구 번들이 `tools/call` 결과로 돌려주는 모양 그대로. */
export function envelope(text: string, isError = false): JsonValue {
  return isError
    ? { content: [{ type: 'text', text }], isError: true }
    : { content: [{ type: 'text', text }] };
}

export function step(partial: Partial<SequenceStep> & { index: number }): SequenceStep {
  return {
    index: partial.index,
    tool: partial.tool ?? 'GetClass',
    args: partial.args ?? { object_name: 'ZCL_DEMO' },
    response: partial.response ?? envelope('CLASS zcl_demo DEFINITION.'),
    isError: partial.isError ?? false,
    note: partial.note ?? null,
  };
}

/**
 * 채록된 픽스처 하나. **정규화를 거쳐** 돌려준다 — 실제 픽스처는 언제나
 * 정규화 후 값이고, 시험이 그 전제를 벗어나면 대조가 현실과 달라진다.
 */
export function recorded(steps: SequenceStep[], overrides: Partial<SequenceFixture> = {}): SequenceFixture {
  return normalizeFixture({
    formatVersion: FIXTURE_FORMAT_VERSION,
    sequenceId: 'demo-read-class',
    description: '데모 클래스 하나를 읽는 최소 시퀀스',
    engine: {
      name: 'mcp-abap-adt',
      version: '5.0.0',
      protocolVersion: '2024-11-05',
      exposition: 'readonly',
    },
    recordedAt: '2026-08-10T09:00:00Z',
    steps,
    placeholders: [],
    ...overrides,
  });
}

/** 신 엔진 자리에 세우는 가짜 대상. 프로세스를 하나도 띄우지 않는다. */
export function target(script: ScriptedResponse[]): ScriptedTransport {
  return new ScriptedTransport({
    script,
    handshake: {
      serverName: 'sapkit-engine',
      serverVersion: '0.1.0',
      protocolVersion: '2024-11-05',
      exposition: 'readonly',
    },
  });
}

/** 픽스처의 응답을 그대로 되돌려주는 대상 — "완전히 같은 신 엔진". */
export function echoTarget(fixture: SequenceFixture): ScriptedTransport {
  return target(fixture.steps.map((s) => ({ payload: s.response, isError: s.isError })));
}
