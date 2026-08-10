/**
 * 정규화 필터 — 비결정 토큰이 자리표시자로 바뀌는가, 그리고 **상관관계가
 * 보존되는가**.
 *
 * 상관 보존이 이 필터의 존재 이유다: 1단계 응답에서 받은 잠금 핸들을 2단계
 * 인자가 그대로 쓴다. 두 자리가 서로 다른 자리표시자를 받으면 재생 대조는
 * "같은 흐름"을 "다른 흐름"으로 판정한다.
 */
import { Normalizer, normalizeFixture } from '../normalize';
import { findPlaceholders, isPlaceholder } from '../types';
import type { JsonValue } from '../types';
import { fixture, step, withArgs, withResponse } from './helpers';

/** 단계 하나의 응답을 JSON 문자열로 (부분 문자열 단언용). */
const responseText = (f: { steps: readonly { response: JsonValue }[] }, i: number): string =>
  JSON.stringify(f.steps[i]?.response ?? null);

const argsText = (f: { steps: readonly { args: JsonValue }[] }, i: number): string =>
  JSON.stringify(f.steps[i]?.args ?? null);

describe('정규화 — 비결정 토큰이 자리표시자로 바뀐다', () => {
  it('XML 잠금 핸들', () => {
    const f = normalizeFixture(
      withResponse({ content: [{ type: 'text', text: '<DATA><LOCK_HANDLE>AB12CD34EF56</LOCK_HANDLE></DATA>' }] }),
    );
    expect(responseText(f, 0)).toContain('<<LOCK_HANDLE_1>>');
    expect(responseText(f, 0)).not.toContain('AB12CD34EF56');
  });

  it('JSON 필드 잠금 핸들', () => {
    const f = normalizeFixture(withResponse({ lockHandle: 'AB12CD34EF56' }));
    expect(responseText(f, 0)).toContain('<<LOCK_HANDLE_1>>');
    expect(responseText(f, 0)).not.toContain('AB12CD34EF56');
  });

  it('질의 인자에 실린 잠금 핸들', () => {
    const f = normalizeFixture(withResponse({ content: [{ type: 'text', text: 'PUT /x?lockHandle=AB12CD34EF56&y=1' }] }));
    expect(responseText(f, 0)).toContain('<<LOCK_HANDLE_1>>');
    expect(responseText(f, 0)).not.toContain('AB12CD34EF56');
    // 뒤따르는 다른 인자는 살아 있어야 한다 — 과잉 삼킴 금지.
    expect(responseText(f, 0)).toContain('&y=1');
  });

  it('CSRF 토큰', () => {
    const f = normalizeFixture(withResponse({ content: [{ type: 'text', text: 'x-csrf-token: aBcD1234wXyZ9876' }] }));
    expect(responseText(f, 0)).toContain('<<CSRF_TOKEN_1>>');
    expect(responseText(f, 0)).not.toContain('aBcD1234wXyZ9876');
  });

  it('세션 식별자', () => {
    const f = normalizeFixture(withResponse({ sessionId: 'SID-7731-QQ' }));
    expect(responseText(f, 0)).toContain('<<SESSION_ID_1>>');
    expect(responseText(f, 0)).not.toContain('SID-7731-QQ');
  });

  it('ISO 타임스탬프', () => {
    const f = normalizeFixture(
      withResponse({ content: [{ type: 'text', text: 'adtcore:changedAt="2026-08-10T09:15:22Z"' }] }),
    );
    expect(responseText(f, 0)).toContain('<<TIMESTAMP_1>>');
    expect(responseText(f, 0)).not.toContain('2026-08-10T09:15:22Z');
  });

  it('서버 생성 ID — UUID와 32자리 hex', () => {
    const f = normalizeFixture(
      withResponse({
        content: [
          { type: 'text', text: 'worklist 0050568f1d2e1edcb4c0b87f84e5a6d1' },
          { type: 'text', text: 'run 3f2504e0-4f89-11d3-9a0c-0305e82c3301' },
        ],
      }),
    );
    expect(responseText(f, 0)).toContain('<<SERVER_ID_1>>');
    expect(responseText(f, 0)).toContain('<<SERVER_ID_2>>');
    expect(responseText(f, 0)).not.toContain('0050568f1d2e1edcb4c0b87f84e5a6d1');
    expect(responseText(f, 0)).not.toContain('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  });

  it('서버 생성 URI — Location 계열 키는 값 전체가 바뀐다', () => {
    const f = normalizeFixture(withResponse({ location: '/sap/bc/adt/atc/worklists/W0001' }));
    expect(responseText(f, 0)).toContain('<<URI_1>>');
    expect(responseText(f, 0)).not.toContain('W0001');
  });

  it('결정적인 객체 URI는 건드리지 않는다 — 그게 대조의 신호다', () => {
    const f = normalizeFixture(withResponse({ content: [{ type: 'text', text: '/sap/bc/adt/oo/classes/zcl_demo' }] }));
    expect(responseText(f, 0)).toContain('/sap/bc/adt/oo/classes/zcl_demo');
    expect(findPlaceholders(responseText(f, 0))).toHaveLength(0);
  });

  it('채록 시각은 정규화하지 않고 보존한다 — 증거의 출처다', () => {
    const f = normalizeFixture(fixture([step({ index: 0 })], { recordedAt: '2026-08-10T09:00:00Z' }));
    expect(isPlaceholder(f.recordedAt)).toBe(false);
    expect(f.recordedAt).toBe('2026-08-10T09:00:00Z');
  });

  it('채록 시각 보존이 자리표시자 번호를 흔들지 않는다', () => {
    const f = normalizeFixture(
      fixture([step({ index: 0, response: { content: [{ type: 'text', text: 'changedAt="2026-08-10T09:15:22Z"' }] } })], {
        recordedAt: '2026-08-11T01:02:03Z',
      }),
    );
    // 응답 **안**의 타임스탬프는 여전히 비결정 토큰이다.
    expect(responseText(f, 0)).toContain('<<TIMESTAMP_1>>');
    // 그리고 recordedAt은 번호를 하나도 소비하지 않는다.
    expect(f.placeholders.map((b) => b.placeholder)).toEqual(['<<TIMESTAMP_1>>']);
    expect(f.recordedAt).toBe('2026-08-11T01:02:03Z');
  });
});

describe('정규화 — 상관 보존 (이 필터의 존재 이유)', () => {
  it('같은 원본 토큰은 시퀀스 어디에 있든 같은 자리표시자를 받는다', () => {
    const handle = 'AB12CD34EF56';
    const f = normalizeFixture(
      fixture([
        step({
          index: 0,
          tool: 'LockObject',
          response: { content: [{ type: 'text', text: `<LOCK_HANDLE>${handle}</LOCK_HANDLE>` }] },
        }),
        step({ index: 1, tool: 'UpdateClass', args: { object_name: 'ZCL_DEMO', lockHandle: handle } }),
        step({ index: 2, tool: 'ActivateObjects', args: { lockHandle: handle } }),
      ]),
    );

    const first = findPlaceholders(responseText(f, 0));
    expect(first).toEqual(['<<LOCK_HANDLE_1>>']);
    expect(argsText(f, 1)).toContain('<<LOCK_HANDLE_1>>');
    expect(argsText(f, 2)).toContain('<<LOCK_HANDLE_1>>');

    const binding = f.placeholders.find((b) => b.placeholder === '<<LOCK_HANDLE_1>>');
    expect(binding).toBeDefined();
    expect(binding?.kind).toBe('lock-handle');
    expect(binding?.occurrences).toBe(3);
  });

  it('서로 다른 원본 토큰은 서로 다른 자리표시자를 받는다', () => {
    const f = normalizeFixture(
      fixture([
        step({ index: 0, response: { content: [{ type: 'text', text: '<LOCK_HANDLE>HANDLE-AAA</LOCK_HANDLE>' }] } }),
        step({ index: 1, response: { content: [{ type: 'text', text: '<LOCK_HANDLE>HANDLE-BBB</LOCK_HANDLE>' }] } }),
      ]),
    );
    expect(responseText(f, 0)).toContain('<<LOCK_HANDLE_1>>');
    expect(responseText(f, 1)).toContain('<<LOCK_HANDLE_2>>');
    expect(responseText(f, 1)).not.toContain('<<LOCK_HANDLE_1>>');
  });

  it('구조 경로로 잡히든 문자열 규칙으로 잡히든 같은 토큰이면 같은 자리표시자', () => {
    const handle = 'AB12CD34EF56';
    const f = normalizeFixture(
      fixture([
        // 구조 경로(키 이름)로 잡히는 자리
        step({ index: 0, args: { lockHandle: handle } }),
        // 자유 텍스트 안에서 문자열 규칙으로 잡히는 자리
        step({ index: 1, response: { content: [{ type: 'text', text: `<LOCK_HANDLE>${handle}</LOCK_HANDLE>` }] } }),
      ]),
    );
    expect(argsText(f, 0)).toContain('<<LOCK_HANDLE_1>>');
    expect(responseText(f, 1)).toContain('<<LOCK_HANDLE_1>>');
  });

  it('자리표시자 대장에는 원본 토큰이 절대 실리지 않는다', () => {
    const handle = 'AB12CD34EF56';
    const f = normalizeFixture(fixture([step({ index: 0, args: { lockHandle: handle } })]));
    expect(JSON.stringify(f.placeholders)).not.toContain(handle);
  });
});

describe('정규화 — 결정성', () => {
  it('같은 입력을 두 번 정규화하면 결과가 같다', () => {
    const build = (): ReturnType<typeof fixture> =>
      fixture([
        step({ index: 0, response: { content: [{ type: 'text', text: '<LOCK_HANDLE>H1</LOCK_HANDLE> at 2026-08-10T09:15:22Z' }] } }),
        step({ index: 1, args: { lockHandle: 'H1' } }),
      ]);
    expect(JSON.stringify(normalizeFixture(build()))).toBe(JSON.stringify(normalizeFixture(build())));
  });

  it('이미 정규화된 픽스처를 다시 정규화해도 그대로다 (멱등)', () => {
    const once = normalizeFixture(
      fixture([
        step({ index: 0, response: { content: [{ type: 'text', text: '<LOCK_HANDLE>H1</LOCK_HANDLE>' }] } }),
        step({ index: 1, args: { lockHandle: 'H1' } }),
      ]),
    );
    const twice = normalizeFixture(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('단계 순서는 그대로이고 index가 배열 위치와 맞춰진다', () => {
    const f = normalizeFixture(
      fixture([
        step({ index: 99, tool: 'A' }),
        step({ index: 3, tool: 'B' }),
        step({ index: 0, tool: 'C' }),
      ]),
    );
    expect(f.steps.map((s) => s.tool)).toEqual(['A', 'B', 'C']);
    expect(f.steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });
});

describe('Normalizer — 하위 수준 API', () => {
  it('여러 값에 걸쳐 상태를 이어 간다', () => {
    const n = new Normalizer();
    expect(n.normalizeString('<LOCK_HANDLE>X9</LOCK_HANDLE>')).toContain('<<LOCK_HANDLE_1>>');
    expect(n.normalizeJson({ lockHandle: 'X9' }, null)).toEqual({ lockHandle: '<<LOCK_HANDLE_1>>' });
    expect(n.bindings()).toEqual([{ placeholder: '<<LOCK_HANDLE_1>>', kind: 'lock-handle', occurrences: 2 }]);
  });

  it('숫자·불리언·null은 건드리지 않는다', () => {
    const n = new Normalizer();
    expect(n.normalizeJson({ a: 1, b: true, c: null }, null)).toEqual({ a: 1, b: true, c: null });
  });

  it('빈 문자열은 자리표시자를 소비하지 않는다', () => {
    const n = new Normalizer();
    expect(n.normalizeJson({ lockHandle: '' }, null)).toEqual({ lockHandle: '' });
    expect(n.bindings()).toEqual([]);
  });
});

describe('정규화 — 인자 쪽도 대상이다', () => {
  it('args 안의 타임스탬프도 바뀐다', () => {
    const f = normalizeFixture(withArgs({ since: '2026-08-10T09:15:22Z' }));
    expect(argsText(f, 0)).toContain('<<TIMESTAMP_1>>');
  });
});
