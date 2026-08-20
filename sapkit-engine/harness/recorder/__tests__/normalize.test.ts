/**
 * 정규화 필터 — 비결정 토큰이 자리표시자로 바뀌는가, 그리고 **상관관계가
 * 보존되는가**.
 *
 * 상관 보존이 이 필터의 존재 이유다: 1단계 응답에서 받은 잠금 핸들을 2단계
 * 인자가 그대로 쓴다. 두 자리가 서로 다른 자리표시자를 받으면 재생 대조는
 * "같은 흐름"을 "다른 흐름"으로 판정한다.
 */
import { REDACT_MIN_LENGTH, Normalizer, normalizeFixture, redactionTargets } from '../normalize';
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

/**
 * 서버가 잰 소요 시간 — 숫자이지만 결정적이지 않다. 2026-08-18에 같은 빈 표를
 * 두고 구 18.464 · 신 0.475가 나왔고, 그대로 두면 재생 판정이 엔진 동등성이
 * 아니라 그날 시스템이 얼마나 바빴는지로 정해진다.
 */
describe('정규화 — 서버가 잰 소요 시간', () => {
  const body = (seconds: string): string =>
    JSON.stringify({ sql_query: 'SELECT a FROM ztab', execution_time: 0, rows: [] }).replace('"execution_time":0', `"execution_time":${seconds}`);

  it('text 블록 안의 execution_time이 자리표시자로 바뀐다', () => {
    const n = new Normalizer();
    const out = n.normalizeString(body('18.464'));

    expect(out).toContain('<<DURATION_1>>');
    expect(out).not.toContain('18.464');
  });

  /** 따옴표를 씌우는 이유 — 이 블록은 JSON으로 다시 읽힌다(D1의 대체 기대 시험). */
  it('바꾼 뒤에도 그 블록은 JSON으로 읽힌다', () => {
    const n = new Normalizer();
    const parsed = JSON.parse(n.normalizeString(body('0.475'))) as { execution_time: unknown };

    expect(parsed.execution_time).toBe('<<DURATION_1>>');
  });

  it('구·신의 서로 다른 값이 같은 자리표시자가 된다 — 대조가 성립하는 조건', () => {
    const old = new Normalizer().normalizeString(body('18.464'));
    const fresh = new Normalizer().normalizeString(body('0.475'));

    expect(old).toBe(fresh);
  });

  it('두 번 정규화해도 결과가 같다 — 자리표시자를 다시 감싸지 않는다', () => {
    const once = new Normalizer().normalizeString(body('1.5'));
    const twice = new Normalizer().normalizeString(once);

    expect(twice).toBe(once);
  });

  it('다른 숫자는 여전히 건드리지 않는다', () => {
    const out = new Normalizer().normalizeString(JSON.stringify({ returned_row_count: 0, total_rows: 12 }));

    expect(out).toBe(JSON.stringify({ returned_row_count: 0, total_rows: 12 }));
  });

  /**
   * 진단 문구는 `=`로 싣는다 — `ERR_SQLQUERY_PREDICATE_IGNORED`의 「tells in this
   * response」 줄이 그 모양이다. 거부 응답을 언젠가 채록하면 그 픽스처도 시간
   * 의존이 되므로 같은 규칙이 덮어야 한다.
   */
  it('진단 문구의 `execution_time=…` 형태도 잡는다', () => {
    const out = new Normalizer().normalizeString('returned_row_count=0 · execution_time=0.475 · truncated=false');

    expect(out).toContain('<<DURATION_1>>');
    expect(out).not.toContain('0.475');
    expect(out).toContain('returned_row_count=0');
  });

  /** 접미사 오탐 — 이 자리가 없으면 주석의 「이 값만」이 거짓이 된다. */
  it('이름이 execution_time으로 끝나는 다른 필드는 삼키지 않는다', () => {
    const text = JSON.stringify({ total_execution_time: 3.5, my_execution_time: 1 });

    expect(new Normalizer().normalizeString(text)).toBe(text);
  });
});

/**
 * `principal` — 가려야 할 신원.
 *
 * 앞의 종류들과 시험하는 것이 다르다. 저것들은 「비결정 값이 안정된 자리표시자가
 * 되는가」를 보지만, 여기서는 **안정된 값이 사라지는가**를 본다. 픽스처가 PUBLIC
 * 레포에 커밋되고 SAP은 작성자를 메타데이터에 박기 때문이다.
 *
 * 시험용 이름은 전부 명백한 가짜다 — 실제 계정 아이디를 여기 쓰지 않는다.
 */
describe('정규화 — 가려야 할 신원(principal)', () => {
  const USER = 'TESTUSER';
  /** SAP이 실제로 내는 두 꼴을 한 응답에 담는다: 대문자 메타데이터 속성 + 소문자 ADT URI. */
  const bothCases = `<abap adtcore:responsible="${USER}" adtcore:changedBy="${USER}"/> /sap/bc/adt/oo/classes/zcl_demo/source/main?user=${USER.toLowerCase()}`;

  it('대문자 꼴과 소문자 꼴을 둘 다 잡고, 같은 자리표시자를 준다', () => {
    const f = normalizeFixture(withResponse({ content: [{ type: 'text', text: bothCases }] }), { redact: [USER] });
    const text = responseText(f, 0);

    expect(text).toContain('<<PRINCIPAL_1>>');
    expect(text.toUpperCase()).not.toContain(USER);
    // 같은 신원의 두 꼴이 갈라지면 「이 객체의 작성자가 곧 접속자」라는 상관이 사라진다.
    expect(new Set(findPlaceholders(text).filter((p) => p.startsWith('<<PRINCIPAL')))).toEqual(
      new Set(['<<PRINCIPAL_1>>']),
    );
  });

  it('인자와 응답 양쪽에서 가린다', () => {
    const f = normalizeFixture(
      fixture([
        step({ index: 0, args: { object_name: 'ZCL_DEMO', owner: USER } }),
        step({ index: 1, response: { content: [{ type: 'text', text: `owner: ${USER}` }] } }),
      ]),
      { redact: [USER] },
    );

    expect(argsText(f, 0)).toContain('<<PRINCIPAL_1>>');
    expect(argsText(f, 0)).not.toContain(USER);
    expect(responseText(f, 1)).toContain('<<PRINCIPAL_1>>');
    expect(responseText(f, 1)).not.toContain(USER);
  });

  it('같은 이름은 시퀀스 전체에서 같은 자리표시자다 — 대장이 등장 횟수를 센다', () => {
    const f = normalizeFixture(
      fixture([
        step({ index: 0, response: { content: [{ type: 'text', text: `responsible="${USER}"` }] } }),
        step({ index: 1, response: { content: [{ type: 'text', text: `changedBy="${USER}"` }] } }),
      ]),
      { redact: [USER] },
    );

    const binding = f.placeholders.find((b) => b.kind === 'principal');
    expect(binding?.placeholder).toBe('<<PRINCIPAL_1>>');
    expect(binding?.occurrences).toBe(2);
  });

  it('다른 이름은 다른 자리표시자다', () => {
    const f = normalizeFixture(
      withResponse({ content: [{ type: 'text', text: `created=${USER} changed=OTHERUSER` }] }),
      { redact: [USER, 'OTHERUSER'] },
    );
    const text = responseText(f, 0);

    expect(text).toContain('<<PRINCIPAL_1>>');
    expect(text).toContain('<<PRINCIPAL_2>>');
    expect(text).not.toContain(USER);
    expect(text).not.toContain('OTHERUSER');
  });

  it('목록이 비면 아무것도 바뀌지 않는다 — 인자 하나로 기존 정규화가 흔들리지 않는다', () => {
    const source = withResponse({ content: [{ type: 'text', text: bothCases }] });
    const untouched = JSON.stringify(normalizeFixture(source));

    expect(JSON.stringify(normalizeFixture(source, {}))).toBe(untouched);
    expect(JSON.stringify(normalizeFixture(source, { redact: [] }))).toBe(untouched);
    expect(responseText(normalizeFixture(source, { redact: [] }), 0)).toContain(USER);
  });

  it('빈 문자열·공백·너무 짧은 이름은 무시한다 — 가리면 픽스처가 통째로 무의미해진다', () => {
    const source = withResponse({ content: [{ type: 'text', text: `${USER} AB` }] });
    const untouched = JSON.stringify(normalizeFixture(source));

    expect(JSON.stringify(normalizeFixture(source, { redact: ['', '   ', 'AB'] }))).toBe(untouched);
    expect(redactionTargets(['', '  ', 'AB', 'ABC'])).toEqual(['ABC']);
    expect(REDACT_MIN_LENGTH).toBe(3);
  });

  /**
   * 경계 규칙 — 영숫자가 붙으면 다른 이름이고, `_`는 경계다. 후자를 놓치면 이름을
   * 품은 객체명(`ZCL_TESTUSER_DEMO`)이 그대로 커밋되고, 저장 뒷문이 그걸 잡아
   * 아무것도 저장되지 않는다.
   */
  it('오탐 경계 — 영숫자가 이어지면 안 걸리고, 밑줄로 끊기면 걸린다', () => {
    const f = normalizeFixture(
      withResponse({
        content: [{ type: 'text', text: `${USER}2 MY${USER} ${USER}X ZCL_${USER}_DEMO (${USER})` }],
      }),
      { redact: [USER] },
    );
    const text = responseText(f, 0);

    expect(text).toContain(`${USER}2`);
    expect(text).toContain(`MY${USER}`);
    expect(text).toContain(`${USER}X`);
    expect(text).toContain('ZCL_<<PRINCIPAL_1>>_DEMO');
    expect(text).toContain('(<<PRINCIPAL_1>>)');
  });

  it('가린 뒤 다시 정규화해도 결과가 같다 (멱등)', () => {
    const once = normalizeFixture(withResponse({ content: [{ type: 'text', text: bothCases }] }), { redact: [USER] });
    const twice = normalizeFixture(once, { redact: [USER] });

    expect(JSON.stringify(twice.steps)).toBe(JSON.stringify(once.steps));
  });

  /**
   * 시나리오가 소유한 자리는 정규화가 손대지 않는다 — 고칠 자리가 픽스처가 아니라
   * 시나리오 파일이기 때문이다(그 파일도 커밋된다). 저장 뒷문이 그 경우를 거부한다
   * (`gates/test-attended-guard.mjs` ⑧).
   */
  it('description·note는 정규화 대상이 아니다 — 그 자리는 저장 뒷문이 맡는다', () => {
    const f = normalizeFixture(
      fixture([step({ index: 0, note: `${USER}가 만든 객체` })], { description: `${USER}의 시퀀스` }),
      { redact: [USER] },
    );

    expect(f.description).toContain(USER);
    expect(f.steps[0]?.note).toContain(USER);
  });
});
