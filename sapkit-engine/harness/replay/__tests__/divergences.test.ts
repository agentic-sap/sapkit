/**
 * 의도적 차이 목록 — **기계가 읽는 형태**가 사람용 정본(`harness/DIVERGENCES.md`)의
 * 등재 규칙을 그대로 지키는가.
 *
 * 등재 규칙(장부 「등재 규칙」):
 *   ① 근거 문서 — 필수
 *   ② 대체 기대 시험 — 비교에서 빼는 것이 곧 무증거가 되지 않게 하는 조건
 *   ③ 분류 — 수리 / 강화 / 축소
 *   ④ 축소 항목은 해소 마일스톤을 명시한다
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { JsonValue, SequenceStep } from '../../recorder';
import { LedgerError, M1_DIVERGENCES, assertLedgerWellFormed, divergencesFor, withSubstituteChecks } from '../divergences';
import type { DivergenceEntry } from '../divergences';
import { compareErrorSignatures, errorSignature } from '../errorSignature';
import { replaySequence } from '../replay';
import { echoTarget, envelope, recorded, step, target } from './helpers';

const byId = (id: string): DivergenceEntry => {
  const found = M1_DIVERGENCES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`장부에 ${id}이(가) 없다.`);
  return found;
};

describe('등재 규칙', () => {
  it('기본 장부는 잘 형성돼 있다', () => {
    expect(() => assertLedgerWellFormed(M1_DIVERGENCES)).not.toThrow();
  });

  it('모든 항목이 근거 문서 경로를 갖는다', () => {
    for (const entry of M1_DIVERGENCES) expect(entry.evidence.length).toBeGreaterThan(0);
  });

  it('근거 문서가 없으면 거부한다', () => {
    const bad = [{ ...byId('D1'), evidence: '' }];
    expect(() => assertLedgerWellFormed(bad)).toThrow(LedgerError);
  });

  it('축소가 아닌 항목은 대체 기대 시험을 갖는다', () => {
    for (const entry of M1_DIVERGENCES) {
      if (entry.classification !== '축소') expect(entry.substituteTest).not.toBeNull();
    }
  });

  it('축소가 아닌데 대체 기대 시험이 없으면 거부한다', () => {
    const bad = [{ ...byId('D1'), substituteTest: null }];
    expect(() => assertLedgerWellFormed(bad)).toThrow(LedgerError);
  });

  it('축소 항목은 해소 마일스톤을 명시한다', () => {
    const bad = [{ ...byId('D1'), classification: '축소' as const, resolvesIn: null }];
    expect(() => assertLedgerWellFormed(bad)).toThrow(LedgerError);
  });

  it('id가 중복되면 거부한다', () => {
    expect(() => assertLedgerWellFormed([byId('D1'), byId('D1')])).toThrow(LedgerError);
  });
});

describe('M1 사전 등재 3건', () => {
  it('D1은 GetSqlQuery이고 M1에서 활성이다', () => {
    expect(byId('D1')).toMatchObject({ tool: 'GetSqlQuery', status: 'active', classification: '수리' });
  });

  it('D3은 등재됐지만 아직 휴면이다 — 도구가 M1 밖이다', () => {
    expect(byId('D3')).toMatchObject({ tool: 'GetIncludesList', status: 'dormant' });
  });

  it('휴면 항목은 활성화 마일스톤을 적어 둔다', () => {
    expect(byId('D3').resolvesIn).not.toBeNull();
  });

  it('D2는 UpdateLocalTypes를 지으며 깨어났고 대체 기대 시험이 실재한다', () => {
    // 휴면의 뜻은 "대체 기대 시험은 그 도구를 짓는 마일스톤에서 활성화한다"였다.
    // 그 마일스톤이 왔으므로 상태가 바뀌고, 시험 경로가 **파일로** 존재해야 한다 —
    // 산문이면 대장이 없는 증거를 있다고 보고한다.
    expect(byId('D2')).toMatchObject({ tool: 'UpdateLocalTypes', status: 'active' });

    const repoRoot = path.resolve(__dirname, '../../../..');
    const paths = (byId('D2').substituteTest ?? '').match(/[\w./-]+\.(?:ts|mjs|md)/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    for (const candidate of paths) {
      expect(fs.existsSync(path.join(repoRoot, candidate))).toBe(true);
    }
  });
});

describe('단계에 걸리는 항목 고르기', () => {
  it('도구 이름이 맞는 항목만 고른다', () => {
    const sql = step({ index: 0, tool: 'GetSqlQuery' });
    expect(divergencesFor(M1_DIVERGENCES, sql).map((e) => e.id)).toEqual(['D1']);
  });

  it('걸리는 항목이 없으면 빈 목록이다', () => {
    const other = step({ index: 0, tool: 'GetInclude' });
    expect(divergencesFor(M1_DIVERGENCES, other)).toEqual([]);
  });

  it('D13은 단계에 걸리지 않는다 — 비교 규칙이지 면제가 아니다', () => {
    expect(byId('D13').applies).toBeNull();
    const anyStep = step({ index: 0, isError: true, response: envelope('ERR_X: 실패', true) });
    expect(divergencesFor(M1_DIVERGENCES, anyStep).map((e) => e.id)).not.toContain('D13');
  });

  it('D18은 구 무접속 어휘를 만난 단계에만 걸린다', () => {
    const noConn = step({
      index: 0,
      isError: true,
      response: envelope('Basic authentication requires SAP_CLIENT to be provided', true),
    });
    expect(divergencesFor(M1_DIVERGENCES, noConn).map((e) => e.id)).toContain('D18');
  });
});

describe('대체 기대 시험 붙이기', () => {
  it('이연된 항목에 검사를 나중에 물릴 수 있다', () => {
    const wired = withSubstituteChecks(M1_DIVERGENCES, {
      D1: () => ({ ok: true, detail: '실데이터 도구 작업이 소유하는 시험이 통과했다.' }),
    });

    expect(M1_DIVERGENCES.find((e) => e.id === 'D1')?.check).toBeNull();
    expect(wired.find((e) => e.id === 'D1')?.check).not.toBeNull();
    expect(() => assertLedgerWellFormed(wired)).not.toThrow();
  });

  it('장부에 없는 id에 검사를 물리려 하면 거부한다', () => {
    expect(() => withSubstituteChecks(M1_DIVERGENCES, { DZZZ: () => ({ ok: true, detail: '' }) })).toThrow(LedgerError);
  });
});

// ── D21~D40의 기계 장부 반영 ─────────────────────────────────────────────────

/** 레포 루트 — `substituteTest` 경로가 실재하는지 보는 기준이다. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/** `harness/ledger/evidence.ts`의 `PATHLIKE`와 같은 규칙. 두 벌이 되면 안 되지만 그 파일은 이 과제의 범위 밖이다. */
const PATHLIKE = /[\w./@-]+\.(?:ts|mjs|js)/g;

/** 구가 싣던 `type:'json'` 콘텐츠 블록 봉투. */
function jsonEnvelope(value: JsonValue): JsonValue {
  return { content: [{ type: 'json', json: value }] };
}

/** 신이 싣는 규약대로의 `type:'text'` 봉투. */
function textEnvelope(value: JsonValue): JsonValue {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

const idsIn = (s: SequenceStep): string[] => divergencesFor(M1_DIVERGENCES, s).map((e) => e.id);

describe('D21~D40 판정 — 와이어에 나타나는 것만 옮긴다', () => {
  it('옮긴 것은 D34~D40 일곱뿐이다', () => {
    const moved = M1_DIVERGENCES.map((e) => e.id).filter((id) => /^D(2[1-9]|3\d|40)$/.test(id));
    expect(moved).toEqual(['D34', 'D35', 'D36', 'D37', 'D38', 'D39', 'D40']);
  });

  it('접속·기동·전송·캐시 계층(D21~D33)은 옮기지 않았다', () => {
    const layerOnly = ['D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28', 'D29', 'D30', 'D31', 'D32', 'D33'];
    for (const id of layerOnly) expect(M1_DIVERGENCES.find((e) => e.id === id)).toBeUndefined();
  });

  it('새 항목을 얹은 뒤에도 장부는 잘 형성돼 있다', () => {
    expect(() => assertLedgerWellFormed(M1_DIVERGENCES)).not.toThrow();
  });

  /**
   * 하드 게이트 — 없는 대체 기대 시험을 있다고 적지 않는다.
   *
   * `substituteEvidenceFromLedger`가 **파일이 실재할 때만** 센다. 경로를 지어내면
   * 대장이 그 도구를 「증거 있음」으로 잘못 올린다. 그래서 여기서 못박는다.
   */
  it('substituteTest가 지목하는 경로는 전부 실재한다', () => {
    const missing: string[] = [];
    for (const entry of M1_DIVERGENCES) {
      for (const token of entry.substituteTest?.match(PATHLIKE) ?? []) {
        if (!fs.existsSync(path.join(REPO_ROOT, token))) missing.push(`${entry.id} — ${token}`);
      }
      for (const token of entry.evidence.match(PATHLIKE) ?? []) {
        if (!fs.existsSync(path.join(REPO_ROOT, token))) missing.push(`${entry.id}(근거) — ${token}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('D34 — 인자 검증 실패 문구의 프로토콜 코드 조각', () => {
  const OLD = 'MCP error -32602: object_name is required';
  const NEW = 'object_name is required';

  it('옮기지 않으면 무엇이 잘못되는가 — errorSignature가 -32602를 강한 신호로 쓴다', () => {
    const before = errorSignature(OLD);
    const after = errorSignature(NEW);

    expect(before.codes).toContain('-32602');
    expect(after.codes).not.toContain('-32602');
    // D13의 산문 정규화로 흡수되지 않는다 — 코드가 다르면 그 앞에서 떨어진다.
    expect(compareErrorSignatures(before, after)).toMatchObject({ ok: false, reason: 'error-kind' });
  });

  it('구 접두사를 단 오류 단계에만 걸린다', () => {
    const withPrefix = step({ index: 0, tool: 'GrepPackages', isError: true, response: envelope(OLD, true) });
    const withoutPrefix = step({ index: 0, tool: 'GrepPackages', isError: true, response: envelope('ERR_NOT_FOUND: 없다', true) });

    expect(idsIn(withPrefix)).toEqual(['D34']);
    expect(idsIn(withoutPrefix)).toEqual([]);
  });

  it('접두사만 빠졌으면 대체 기대 시험이 통과한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GrepPackages', isError: true, response: envelope(OLD, true) })]);
    const result = await replaySequence(fixture, target([{ payload: envelope(NEW, true), isError: true }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D34' });
    expect(result.verdict).toBe('pass');
  });

  it('문장 자체가 달라지면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GrepPackages', isError: true, response: envelope(OLD, true) })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('something else went wrong', true), isError: true }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D34' });
    expect(result.verdict).toBe('fail');
  });

  it('장부에서 빼면 같은 단계가 결함으로 떨어진다 — 지금 옮기는 이유', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GrepPackages', isError: true, response: envelope(OLD, true) })]);
    const result = await replaySequence(fixture, target([{ payload: envelope(NEW, true), isError: true }]), {
      divergences: [],
    });

    expect(result.steps[0]).toMatchObject({ verdict: 'mismatch', divergenceId: null });
    expect(result.steps[0]?.differences[0]?.reason).toBe('error-kind');
  });
});

describe('D36 — `type: json` 블록을 규약대로 text로 싣는다', () => {
  const BODY: JsonValue = { name: 'ZCL_DEMO', kind: 'CLAS', fields: [{ name: 'MANDT' }] };

  it('구가 json 블록으로 답한 네 도구의 단계에만 걸린다', () => {
    expect(idsIn(step({ index: 0, tool: 'GetTypeInfo', response: jsonEnvelope(BODY) }))).toEqual(['D36']);
    expect(idsIn(step({ index: 0, tool: 'GetWhereUsed', response: jsonEnvelope(BODY) }))).toEqual(['D36']);
    // 같은 도구라도 구가 text로 답한 단계는 이 차이가 아니다 — 여전히 대조된다.
    expect(idsIn(step({ index: 0, tool: 'GetTypeInfo', response: envelope('그냥 문자열') }))).toEqual([]);
    // 이 묶음 밖의 도구도 아니다.
    expect(idsIn(step({ index: 0, tool: 'GetClass', response: jsonEnvelope(BODY) }))).toEqual([]);
  });

  it('차이가 없으면 발동하지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetTypeInfo', response: jsonEnvelope(BODY) })]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.steps[0]).toMatchObject({ verdict: 'match', divergenceId: null });
  });

  it('그릇만 바뀌었으면 통과한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetTypeInfo', response: jsonEnvelope(BODY) })]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope(BODY) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D36' });
  });

  it('본문 값이 달라지면 실패한다 — 등재가 도구 전체를 대조 밖에 두지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetTypeInfo', response: jsonEnvelope(BODY) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ ...(BODY as Record<string, JsonValue>), kind: 'INTF' }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D36' });
    expect(result.verdict).toBe('fail');
  });

  it('같은 도구의 text 단계는 등재 없이 대조된다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetTypeInfo', response: envelope('hello') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('goodbye') }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'mismatch', divergenceId: null });
  });
});

describe('D35 — GetObjectInfo의 enrich가 실제로 동작한다', () => {
  const TREE: JsonValue = { OBJECT_TYPE: 'CLAS/OC', OBJECT_NAME: 'ZCL_DEMO' };

  it('GetObjectInfo는 D35가 맡는다 — D36과 겹치지 않는다', () => {
    expect(idsIn(step({ index: 0, tool: 'GetObjectInfo', response: jsonEnvelope(TREE) }))).toEqual(['D35']);
  });

  it('보강 필드가 는 것까지가 등재다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetObjectInfo', response: jsonEnvelope(TREE) })]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: textEnvelope({ ...(TREE as Record<string, JsonValue>), OBJECT_DESCRIPTION: '데모', OBJECT_PACKAGE: '$TMP' }),
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D35' });
  });

  it('보강 밖의 값이 달라지면 실패한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetObjectInfo', response: jsonEnvelope(TREE) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ OBJECT_TYPE: 'CLAS/OC', OBJECT_NAME: 'ZCL_OTHER', OBJECT_PACKAGE: '$TMP' }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D35' });
  });
});

describe('D37 — GetAbapSystemSymbols의 인터페이스 보강 축소', () => {
  const INTF: JsonValue = {
    symbols: [{ name: 'ZIF_DEMO', systemInfo: { exists: true, objectType: 'INTF', description: 'x', package: 'Y' } }],
  };
  const CLAS: JsonValue = {
    symbols: [{ name: 'ZCL_DEMO', systemInfo: { exists: true, objectType: 'CLAS', description: 'x', package: 'Y' } }],
  };

  it('인터페이스 갈래에만 걸린다 — 나머지 갈래는 D36이 맡는다', () => {
    expect(idsIn(step({ index: 0, tool: 'GetAbapSystemSymbols', response: jsonEnvelope(INTF) }))).toEqual(['D37']);
    expect(idsIn(step({ index: 0, tool: 'GetAbapSystemSymbols', response: jsonEnvelope(CLAS) }))).toEqual(['D36']);
  });

  it('축소분이라 재생은 통과가 아니라 무증거로 센다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetAbapSystemSymbols', response: jsonEnvelope(INTF) })]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: textEnvelope({
            symbols: [
              { name: 'ZIF_DEMO', systemInfo: { exists: false, objectType: 'INTF', error: 'Interface resolution is not available yet' } },
            ],
          }),
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-deferred', divergenceId: 'D37' });
    expect(result.verdict).toBe('no-evidence');
  });
});

describe('D38·D39·D40 — ReloadProfile', () => {
  const OK_BODY = {
    ok: true,
    alias: 'dev',
    legacy: false,
    tier: 'DEV',
    readonly: false,
    host: 'https://sap.example.test',
    client: '100',
    description: '',
    sourcePath: '/home/u/.sapkit/profiles/dev/sap.env',
    restartRequired: false,
  };

  it('실패 갈래는 D38, 성공 갈래는 D39·D40이 나눠 맡는다', () => {
    const failed = step({ index: 0, tool: 'ReloadProfile', isError: true, response: envelope('Error: missing env file', true) });
    const stale = step({ index: 0, tool: 'ReloadProfile', response: textEnvelope({ ...OK_BODY, restartRequired: true }) });
    const fresh = step({ index: 0, tool: 'ReloadProfile', response: textEnvelope(OK_BODY) });

    expect(idsIn(failed)).toEqual(['D38']);
    expect(idsIn(stale)).toEqual(['D39']);
    expect(idsIn(fresh)).toEqual(['D40']);
  });

  it('D40 — diagnostics가 는 것은 등재다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'ReloadProfile', response: textEnvelope(OK_BODY) })]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope({ ...OK_BODY, diagnostics: [] }) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D40' });
  });

  it('D40 — 등재되지 않은 키가 달라지면 실패한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'ReloadProfile', response: textEnvelope(OK_BODY) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ ...OK_BODY, tier: 'PRD', diagnostics: [] }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D40' });
  });

  it('D38 — 실패가 무접속·UNKNOWN·이유로 내려앉으면 통과한다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'ReloadProfile', isError: true, response: envelope('Error: missing env file', true) }),
    ]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: textEnvelope({ ...OK_BODY, tier: 'UNKNOWN', readonly: true, diagnostics: ['활성 프로파일을 찾지 못했다'] }),
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D38' });
  });

  it('D38 — 옛 등급이 살아남으면 실패한다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'ReloadProfile', isError: true, response: envelope('Error: missing env file', true) }),
    ]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope({ ...OK_BODY, diagnostics: [] }) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D38' });
  });
});
