/**
 * 시퀀스 픽스처 형식 — 직렬화 왕복에서 **순서와 내용이 보존되는가**.
 *
 * 재생 러너는 이 형식만 보고 구 엔진의 흐름을 재현한다. 순서가 흔들리면
 * 쓰기 흐름(잠금 → 수정 → 활성화)의 의미가 사라진다.
 */
import { FixtureFormatError, parseFixture, serializeFixture } from '../record';
import { FIXTURE_FORMAT_VERSION } from '../types';
import { fixture, step } from './helpers';

const threeSteps = fixture([
  step({ index: 0, tool: 'LockObject', args: { object_name: 'ZCL_DEMO' }, note: '잠금' }),
  step({ index: 1, tool: 'UpdateClass', args: { object_name: 'ZCL_DEMO', source: 'CLASS zcl_demo.' } }),
  step({ index: 2, tool: 'ActivateObjects', args: { object_name: 'ZCL_DEMO' }, isError: true }),
]);

describe('픽스처 왕복', () => {
  it('직렬화 → 역직렬화에서 순서와 내용이 그대로다', () => {
    const back = parseFixture(serializeFixture(threeSteps));
    expect(back).toEqual(threeSteps);
    expect(back.steps.map((s) => s.tool)).toEqual(['LockObject', 'UpdateClass', 'ActivateObjects']);
    expect(back.steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('두 번 직렬화해도 같은 바이트다 (커밋 잡음 없음)', () => {
    expect(serializeFixture(parseFixture(serializeFixture(threeSteps)))).toBe(serializeFixture(threeSteps));
  });

  it('개행으로 끝난다', () => {
    expect(serializeFixture(threeSteps).endsWith('\n')).toBe(true);
  });

  it('단계별 오류 표식과 메모가 살아남는다', () => {
    const back = parseFixture(serializeFixture(threeSteps));
    expect(back.steps[2]?.isError).toBe(true);
    expect(back.steps[0]?.note).toBe('잠금');
    expect(back.steps[1]?.note).toBeNull();
  });

  it('엔진 신원이 살아남는다', () => {
    expect(parseFixture(serializeFixture(threeSteps)).engine).toEqual({
      name: 'mcp-abap-adt',
      version: '5.0.0',
      protocolVersion: '2024-11-05',
      exposition: 'readonly',
    });
  });
});

describe('픽스처 형식 거부', () => {
  it('JSON이 아니면 거부', () => {
    expect(() => parseFixture('not json')).toThrow(FixtureFormatError);
  });

  it('형식 판이 다르면 거부', () => {
    const bad = serializeFixture(threeSteps).replace(`"formatVersion": ${FIXTURE_FORMAT_VERSION}`, '"formatVersion": 99');
    expect(() => parseFixture(bad)).toThrow(FixtureFormatError);
  });

  it('index가 배열 위치와 어긋나면 거부', () => {
    const raw = JSON.parse(serializeFixture(threeSteps)) as { steps: { index: number }[] };
    const firstStep = raw.steps[0];
    if (firstStep) firstStep.index = 7;
    expect(() => parseFixture(JSON.stringify(raw))).toThrow(FixtureFormatError);
  });

  it('steps가 비면 거부', () => {
    const raw = JSON.parse(serializeFixture(threeSteps)) as { steps: unknown[] };
    raw.steps = [];
    expect(() => parseFixture(JSON.stringify(raw))).toThrow(FixtureFormatError);
  });

  it('sequenceId가 파일 이름으로 안전하지 않으면 거부', () => {
    const raw = JSON.parse(serializeFixture(threeSteps)) as { sequenceId: string };
    raw.sequenceId = '../escape';
    expect(() => parseFixture(JSON.stringify(raw))).toThrow(FixtureFormatError);
  });
});
