/**
 * 채록기 코어 — **전송을 주입**해서 돈다.
 *
 * 이 머신에서 jest가 자식 프로세스 수거에서 비결정적으로 블록된 실측 기록이
 * 있다(레포 `HANDOFF.md`). 그래서 코어는 "요청을 보내고 응답을 받는" 인터페이스
 * (`RecorderTransport`)에만 의존하고, 자식 프로세스 구동은 그 인터페이스의 한
 * 구현일 뿐이다. 단위 시험은 전부 가짜 전송으로 돈다 — 여기서 프로세스는
 * 하나도 뜨지 않는다.
 */
import { recordSequence, parseFixture, serializeFixture } from '../record';
import { ScriptedTransport } from '../scriptedTransport';
import { assertMasked } from '../masking';
import { findPlaceholders } from '../types';
import type { SequenceSpec } from '../record';

const lockFlow: SequenceSpec = {
  sequenceId: 'demo-lock-modify-activate',
  description: '데모 클래스 잠금 → 수정 → 활성화',
  steps: [
    { tool: 'LockObject', args: { object_name: 'ZCL_DEMO' }, note: '잠금 핸들을 받는다' },
    { tool: 'UpdateClass', args: { object_name: 'ZCL_DEMO', lockHandle: 'AB12CD34EF56' } },
    { tool: 'ActivateObjects', args: { object_name: 'ZCL_DEMO' } },
  ],
};

const lockFlowTransport = (): ScriptedTransport =>
  new ScriptedTransport({
    handshake: { serverName: 'mcp-abap-adt', serverVersion: '5.0.0', protocolVersion: '2024-11-05', exposition: 'readonly,high' },
    script: [
      { payload: { content: [{ type: 'text', text: '<LOCK_HANDLE>AB12CD34EF56</LOCK_HANDLE>' }] } },
      { payload: { content: [{ type: 'text', text: 'updated at 2026-08-10T09:15:22Z' }] } },
      { payload: { content: [{ type: 'text', text: 'activated' }] } },
    ],
  });

describe('채록 — 시퀀스 단위로 보존한다', () => {
  it('요청 순서 그대로 호출하고 그 순서로 기록한다', async () => {
    const t = lockFlowTransport();
    const f = await recordSequence(lockFlow, t);
    expect(t.calls.map((c) => c.tool)).toEqual(['LockObject', 'UpdateClass', 'ActivateObjects']);
    expect(f.steps.map((s) => s.tool)).toEqual(['LockObject', 'UpdateClass', 'ActivateObjects']);
    expect(f.steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('시퀀스 식별자·설명·엔진 신원을 담는다', async () => {
    const f = await recordSequence(lockFlow, lockFlowTransport());
    expect(f.sequenceId).toBe('demo-lock-modify-activate');
    expect(f.description).toBe('데모 클래스 잠금 → 수정 → 활성화');
    expect(f.engine).toEqual({
      name: 'mcp-abap-adt',
      version: '5.0.0',
      protocolVersion: '2024-11-05',
      exposition: 'readonly,high',
    });
  });

  it('전송을 열고 닫는다', async () => {
    const t = lockFlowTransport();
    await recordSequence(lockFlow, t);
    expect(t.opened).toBe(1);
    expect(t.closed).toBe(1);
  });

  it('중간에 전송이 실패해도 닫는다', async () => {
    const t = new ScriptedTransport({
      script: [{ payload: { ok: true } }, { throws: new Error('전송 끊김') }],
    });
    await expect(recordSequence(lockFlow, t)).rejects.toThrow('전송 끊김');
    expect(t.closed).toBe(1);
  });

  it('도구 오류 응답은 isError로 남기고 시퀀스를 계속한다', async () => {
    const t = new ScriptedTransport({
      script: [
        { payload: { content: [{ type: 'text', text: 'ok' }] } },
        { payload: { content: [{ type: 'text', text: 'lock failed' }], isError: true }, isError: true },
        { payload: { content: [{ type: 'text', text: 'ok' }] } },
      ],
    });
    const f = await recordSequence(lockFlow, t);
    expect(f.steps.map((s) => s.isError)).toEqual([false, true, false]);
  });

  it('메모를 보존한다', async () => {
    const f = await recordSequence(lockFlow, lockFlowTransport());
    expect(f.steps[0]?.note).toBe('잠금 핸들을 받는다');
    expect(f.steps[1]?.note).toBeNull();
  });
});

describe('채록 — 정규화가 채록 경로에 붙어 있다', () => {
  it('응답에서 받은 잠금 핸들과 다음 단계 인자가 같은 자리표시자가 된다', async () => {
    const f = await recordSequence(lockFlow, lockFlowTransport());
    expect(findPlaceholders(JSON.stringify(f.steps[0]?.response))).toEqual(['<<LOCK_HANDLE_1>>']);
    expect(JSON.stringify(f.steps[1]?.args)).toContain('<<LOCK_HANDLE_1>>');
    expect(JSON.stringify(f)).not.toContain('AB12CD34EF56');
  });

  it('타임스탬프도 자리표시자가 된다', async () => {
    const f = await recordSequence(lockFlow, lockFlowTransport());
    expect(JSON.stringify(f.steps[1]?.response)).toContain('<<TIMESTAMP_');
    expect(JSON.stringify(f)).not.toContain('2026-08-10T09:15:22Z');
  });

  it('산출물은 형식 왕복과 마스킹 검사를 통과한다', async () => {
    const f = await recordSequence(lockFlow, lockFlowTransport());
    expect(() => assertMasked(f)).not.toThrow();
    expect(parseFixture(serializeFixture(f))).toEqual(f);
  });
});

describe('채록 — 입력 검증', () => {
  it('파일 이름으로 안전하지 않은 시퀀스 식별자는 거부', async () => {
    await expect(recordSequence({ ...lockFlow, sequenceId: '../escape' }, lockFlowTransport())).rejects.toThrow(
      /sequenceId/,
    );
  });

  it('빈 시퀀스는 거부', async () => {
    await expect(recordSequence({ ...lockFlow, steps: [] }, lockFlowTransport())).rejects.toThrow(/steps/);
  });
});
