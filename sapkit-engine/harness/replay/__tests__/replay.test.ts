/**
 * 재생 대조 — **"같은가?"를 판정하는 자리**의 세 경로.
 *
 *   통과(정규화 후 동일) / 불일치(어디가 왜 다른지) / allowlist(대체 기대 시험)
 *
 * 자식 프로세스는 하나도 띄우지 않는다. 신 엔진 자리에는 채록기의 가짜 전송을
 * 세운다(이 머신의 jest 수거 함정 — `HANDOFF.md`).
 */
import { ScriptedTransport } from '../../recorder';
import type { SequenceStep } from '../../recorder';
import { M1_DIVERGENCES } from '../divergences';
import type { DivergenceEntry } from '../divergences';
import { replaySequence } from '../replay';
import { echoTarget, envelope, recorded, step, target } from './helpers';

/** 시험 전용 등재 항목 하나. 장부 항목을 흉내 내되 검사는 여기서 소유한다. */
function testEntry(overrides: Partial<DivergenceEntry> = {}): DivergenceEntry {
  return {
    id: 'DTEST',
    title: '시험용 등재 항목',
    tool: 'GetClass',
    classification: '수리',
    status: 'active',
    evidence: 'harness/replay/__tests__/replay.test.ts',
    substituteTest: 'harness/replay/__tests__/replay.test.ts',
    resolvesIn: null,
    applies: (s: SequenceStep) => s.tool === 'GetClass',
    check: () => ({ ok: true, detail: '신 엔진 쪽이 옳다고 확인했다.' }),
    ...overrides,
  };
}

// ── ① 통과 ───────────────────────────────────────────────────────────────────

describe('통과 경로', () => {
  it('정규화 후 동일하면 diff 0으로 통과한다', async () => {
    const fixture = recorded([step({ index: 0 })]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.verdict).toBe('pass');
    expect(result.steps.map((s) => s.verdict)).toEqual(['match']);
    expect(result.steps[0]?.differences).toEqual([]);
    expect(result.sequenceDifferences).toEqual([]);
  });

  it('recordedAt이 달라도 실패하지 않는다', async () => {
    const fixture = recorded([step({ index: 0 })], { recordedAt: '2020-01-01T00:00:00Z' });
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.verdict).toBe('pass');
  });

  it('비결정 토큰이 달라도 정규화 후 같으면 통과한다', async () => {
    const fixture = recorded([
      step({ index: 0, response: envelope('<CREATED>2026-08-10T09:15:22Z</CREATED>') }),
    ]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope('<CREATED>2019-02-02T02:02:02Z</CREATED>') }]),
    );

    expect(result.verdict).toBe('pass');
  });

  it('엔진 신원 차이는 실패가 아니라 출처로 보고된다', async () => {
    const fixture = recorded([step({ index: 0 })]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.verdict).toBe('pass');
    expect(result.recordedEngine.name).toBe('mcp-abap-adt');
    expect(result.actualEngine.name).toBe('sapkit-engine');
    expect(result.provenanceDifferences.length).toBeGreaterThan(0);
    expect(result.provenanceDifferences.every((d) => d.path.startsWith('/engine'))).toBe(true);
  });
});

// ── ② 불일치 ─────────────────────────────────────────────────────────────────

describe('불일치 경로', () => {
  it('어느 경로가 어떻게 다른지 짚는다', async () => {
    const fixture = recorded([step({ index: 0, response: envelope('CLASS zcl_demo DEFINITION.') })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope('CLASS zcl_other DEFINITION.') }]),
    );

    expect(result.verdict).toBe('fail');
    expect(result.steps[0]?.verdict).toBe('mismatch');
    const diff = result.steps[0]?.differences ?? [];
    expect(diff).toHaveLength(1);
    expect(diff[0]?.path).toBe('/steps/0/response/content/0/text');
    expect(diff[0]?.reason).toBe('value');
    expect(diff[0]?.expected).toContain('zcl_demo');
    expect(diff[0]?.actual).toContain('zcl_other');
  });

  it('없는 자리·남는 자리도 사유를 붙여 짚는다', async () => {
    const fixture = recorded([step({ index: 0, response: { a: 1, b: 2 } })]);
    const result = await replaySequence(fixture, target([{ payload: { a: 1, c: 3 } }]));

    expect(result.verdict).toBe('fail');
    const reasons = (result.steps[0]?.differences ?? []).map((d) => `${d.path}:${d.reason}`);
    expect(reasons).toContain('/steps/0/response/b:missing');
    expect(reasons).toContain('/steps/0/response/c:extra');
  });

  it('등재되지 않은 차이는 결함으로 판정된다 — 조용히 통과하지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetInclude', response: envelope('A') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('B') }]), {
      // 장부에는 GetInclude 항목이 없다.
      divergences: M1_DIVERGENCES,
    });

    expect(result.verdict).toBe('fail');
    expect(result.steps[0]?.verdict).toBe('mismatch');
    expect(result.steps[0]?.divergenceId).toBeNull();
  });

  it('실제 응답에 비밀이 섞이면 보고서가 그것을 되싣지 않는다', async () => {
    const fixture = recorded([step({ index: 0, response: envelope('ok') })]);
    const leaked = 'Authorization: Basic dXNlcjpzM2NyZXRwYXNz';
    const result = await replaySequence(fixture, target([{ payload: envelope(leaked) }]));

    expect(result.verdict).toBe('fail');
    const rendered = JSON.stringify(result.steps[0]?.differences ?? []);
    expect(rendered).not.toContain('dXNlcjpzM2NyZXRwYXNz');
    expect(rendered).toContain('REDACTED');
    expect(rendered).toContain('basic-auth');
  });

  it('전송이 끊기면 거기서 멈추고 대상은 닫힌다', async () => {
    const fixture = recorded([step({ index: 0 }), step({ index: 1 })]);
    const scripted = target([{ throws: new Error('전송 끊김') }, { payload: envelope('ok') }]);
    const result = await replaySequence(fixture, scripted);

    expect(result.verdict).toBe('fail');
    expect(result.transportError).toContain('전송 끊김');
    expect(result.steps.map((s) => s.verdict)).toEqual(['not-run', 'not-run']);
    expect(scripted.closed).toBe(1);
  });
});

// ── ③ allowlist ──────────────────────────────────────────────────────────────

describe('allowlist 경로', () => {
  it('등재 항목은 diff 비교 대신 대체 기대 시험으로 판정한다', async () => {
    const fixture = recorded([step({ index: 0, response: envelope('구 동작') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('신 동작') }]), {
      divergences: [testEntry()],
    });

    expect(result.verdict).toBe('pass');
    expect(result.steps[0]?.verdict).toBe('allowlisted-pass');
    expect(result.steps[0]?.divergenceId).toBe('DTEST');
    expect(result.steps[0]?.detail).toContain('신 엔진 쪽이 옳다고 확인했다');
  });

  it('대체 기대 시험이 실패하면 시퀀스가 실패한다', async () => {
    const fixture = recorded([step({ index: 0, response: envelope('구 동작') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('신 동작') }]), {
      divergences: [testEntry({ check: () => ({ ok: false, detail: '기대한 동작이 아니다.' }) })],
    });

    expect(result.verdict).toBe('fail');
    expect(result.steps[0]?.verdict).toBe('allowlisted-fail');
  });

  it('대체 기대 시험이 다른 곳 소유면 통과가 아니라 무증거다', async () => {
    const fixture = recorded([step({ index: 0, response: envelope('구 동작') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('신 동작') }]), {
      divergences: [testEntry({ check: null, substituteTest: '다른 작업이 소유하는 시험' })],
    });

    expect(result.verdict).toBe('no-evidence');
    expect(result.steps[0]?.verdict).toBe('allowlisted-deferred');
    expect(result.steps[0]?.detail).toContain('다른 작업이 소유하는 시험');
  });

  it('등재는 차이가 있을 때만 발동한다 — 같으면 그냥 통과다', async () => {
    const fixture = recorded([step({ index: 0 })]);
    const result = await replaySequence(fixture, echoTarget(fixture), {
      divergences: [testEntry({ check: null })],
    });

    expect(result.verdict).toBe('pass');
    expect(result.steps[0]?.verdict).toBe('match');
    expect(result.steps[0]?.divergenceId).toBeNull();
  });

  it('휴면 등재 항목은 차이를 면제하지 않는다 — 결함으로 남고 장부 갱신을 알린다', async () => {
    const fixture = recorded([step({ index: 0, response: envelope('구 동작') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('신 동작') }]), {
      divergences: [testEntry({ status: 'dormant' })],
    });

    expect(result.verdict).toBe('fail');
    expect(result.steps[0]?.verdict).toBe('mismatch');
    expect(result.steps[0]?.detail).toContain('휴면');
    expect(result.steps[0]?.detail).toContain('DTEST');
  });
});

// ── ④ 시퀀스 순서와 단계 간 상관 ──────────────────────────────────────────────

describe('시퀀스 순서와 상관 보존', () => {
  /** 잠금 → 수정: 1단계가 받은 잠금 핸들을 2단계 인자가 쓴다. */
  function lockThenUpdate(handle: string) {
    return recorded([
      step({
        index: 0,
        tool: 'LockObject',
        args: { object_name: 'ZCL_DEMO' },
        response: envelope(`<DATA><LOCK_HANDLE>${handle}</LOCK_HANDLE></DATA>`),
      }),
      step({
        index: 1,
        tool: 'UpdateClass',
        args: { object_name: 'ZCL_DEMO', lockHandle: handle },
        response: envelope('updated'),
      }),
    ]);
  }

  it('단계를 순서대로 먹인다', async () => {
    const fixture = lockThenUpdate('OLDHANDLE01');
    const scripted = target([
      { payload: envelope('<DATA><LOCK_HANDLE>NEWHANDLE99</LOCK_HANDLE></DATA>') },
      { payload: envelope('updated') },
    ]);
    await replaySequence(fixture, scripted);

    expect(scripted.calls.map((c) => c.tool)).toEqual(['LockObject', 'UpdateClass']);
  });

  it('2단계 인자의 잠금 핸들이 신 엔진이 방금 준 값으로 되묶인다', async () => {
    const fixture = lockThenUpdate('OLDHANDLE01');
    const scripted = target([
      { payload: envelope('<DATA><LOCK_HANDLE>NEWHANDLE99</LOCK_HANDLE></DATA>') },
      { payload: envelope('updated') },
    ]);
    const result = await replaySequence(fixture, scripted);

    // 픽스처에는 자리표시자만 남아 있다 — 원본 핸들은 어디에도 없다.
    expect(JSON.stringify(fixture)).not.toContain('OLDHANDLE01');
    // 그런데도 2단계는 신 엔진이 방금 발급한 실제 핸들로 나갔다.
    expect(scripted.calls[1]?.args['lockHandle']).toBe('NEWHANDLE99');
    // 그리고 상관이 보존된 채 대조가 성립한다.
    expect(result.verdict).toBe('pass');
  });

  it('상관이 깨지면(신 엔진이 2단계에서 다른 핸들을 쓰면) 불일치로 잡힌다', async () => {
    const fixture = lockThenUpdate('OLDHANDLE01');
    const scripted = target([
      { payload: envelope('<DATA><LOCK_HANDLE>NEWHANDLE99</LOCK_HANDLE></DATA>') },
      { payload: envelope('used lockHandle=SOMETHINGELSE1') },
    ]);
    const result = await replaySequence(fixture, scripted);

    expect(result.verdict).toBe('fail');
    expect(result.steps[1]?.verdict).toBe('mismatch');
  });

  it('되묶을 수 없는 자리표시자는 조용히 넘어가지 않고 메모로 남는다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'GetClass', args: { object_name: 'ZCL_DEMO', changedAt: '2026-08-10T09:15:22Z' } }),
    ]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.notes.join('\n')).toContain('<<TIMESTAMP_1>>');
  });
});

// ── ⑤ 장부 기본값이 실려 있다 ────────────────────────────────────────────────

describe('기본 장부', () => {
  it('옵션을 주지 않으면 M1 장부가 쓰인다', async () => {
    const fixture = recorded([
      step({
        index: 0,
        tool: 'UpdateLocalTypes',
        args: { class_name: 'ZCL_DEMO', source_code: 'TYPES ty_x TYPE string.' },
        response: envelope('구 결과 — 활성화했다고 답한다'),
      }),
    ]);
    const result = await replaySequence(fixture, target([{ payload: envelope('신 결과 — 활성화 응답을 읽는다') }]));

    // D2(UpdateLocalTypes)는 활성이지만 대체 기대 시험을 계약 시험이 소유한다 —
    // 차이의 본체가 응답이 아니라 와이어 사실이라 재생이 가를 수 없다.
    // (본보기가 D1이었으나 판6.1에서 D1의 이연이 끝나 자리를 옮겼다.)
    expect(result.steps[0]?.divergenceId).toBe('D2');
    expect(result.steps[0]?.verdict).toBe('allowlisted-deferred');
    expect(result.verdict).toBe('no-evidence');
  });
});

// ── 대상은 언제나 닫힌다 ─────────────────────────────────────────────────────

describe('대상 수명', () => {
  it('정상 종료에서도 대상을 닫는다', async () => {
    const fixture = recorded([step({ index: 0 })]);
    const scripted: ScriptedTransport = echoTarget(fixture);
    await replaySequence(fixture, scripted);

    expect(scripted.opened).toBe(1);
    expect(scripted.closed).toBe(1);
  });
});
