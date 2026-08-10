/**
 * 시험용 픽스처 조립기.
 *
 * 여기서 만드는 것은 전부 **명백한 가짜**다 — 호스트는 `sap.example.test`,
 * 자격증명은 심는 시험(음성시험) 안에서만 쓰고 파일로 저장하지 않는다.
 */
import { FIXTURE_FORMAT_VERSION } from '../types';
import type { JsonValue, SequenceFixture, SequenceStep } from '../types';

export function step(partial: Partial<SequenceStep> & { index: number }): SequenceStep {
  return {
    index: partial.index,
    tool: partial.tool ?? 'ReadClass',
    args: partial.args ?? { object_name: 'ZCL_DEMO' },
    response: partial.response ?? { content: [{ type: 'text', text: 'CLASS zcl_demo DEFINITION.' }] },
    isError: partial.isError ?? false,
    note: partial.note ?? null,
  };
}

export function fixture(steps: SequenceStep[], overrides: Partial<SequenceFixture> = {}): SequenceFixture {
  return {
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
  };
}

/** 한 단계짜리 픽스처에 임의 응답을 심는다. */
export function withResponse(response: JsonValue, tool = 'ReadClass'): SequenceFixture {
  return fixture([step({ index: 0, tool, response })]);
}

/** 한 단계짜리 픽스처에 임의 인자를 심는다. */
export function withArgs(args: JsonValue, tool = 'ReadClass'): SequenceFixture {
  return fixture([step({ index: 0, tool, args })]);
}
