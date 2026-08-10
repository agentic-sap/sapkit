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
import { LedgerError, M1_DIVERGENCES, assertLedgerWellFormed, divergencesFor, withSubstituteChecks } from '../divergences';
import type { DivergenceEntry } from '../divergences';
import { envelope, step } from './helpers';

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

  it('D2·D3은 등재됐지만 휴면이다 — 도구가 M1 밖이다', () => {
    expect(byId('D2')).toMatchObject({ tool: 'UpdateLocalTypes', status: 'dormant' });
    expect(byId('D3')).toMatchObject({ tool: 'GetIncludesList', status: 'dormant' });
  });

  it('휴면 항목도 활성화 마일스톤을 적어 둔다', () => {
    expect(byId('D2').resolvesIn).not.toBeNull();
    expect(byId('D3').resolvesIn).not.toBeNull();
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
