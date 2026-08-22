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
import { loadCapturedToolNames } from '../coverage';
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

  /**
   * D1의 소유자는 장부가 적어 둔 "실데이터 도구 작업"이었다. 그 작업이 오면
   * 이연이 끝나야 한다 — 산문 자리를 파일 경로로 바꾸고 `check`를 물리는 것이
   * 곧 이연의 종료다. 경로가 산문으로 남으면 대장이 **없는 증거를 있다고**
   * 보고한다(`harness/ledger/evidence.ts`).
   */
  it('D1은 대체 기대 시험을 실제 파일로 들고 판정 검사를 갖는다', () => {
    expect(byId('D1').check).not.toBeNull();
    expect(byId('D1').substituteTest).toContain('getSqlQuery.test.ts');

    const repoRoot = path.resolve(__dirname, '../../../..');
    const paths = (byId('D1').substituteTest ?? '').match(/[\w./-]+\.(?:ts|mjs|md)/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    for (const candidate of paths) {
      expect(fs.existsSync(path.join(repoRoot, candidate))).toBe(true);
    }
  });


  /**
   * D3는 인클루드 묶음에서 **깨어났다.** 도구가 등록점에 있는데 장부가 휴면이면
   * 러너가 그 도구의 모든 차이를 `mismatch`로 떨어뜨린다 — 활성화는 그 신호를
   * 지우는 것이 아니라 **판정 자리를 채우는 것**이다.
   */
  it('D3은 활성이고 대체 기대 시험을 실제 파일로 들고 있다', () => {
    expect(byId('D3')).toMatchObject({ tool: 'GetIncludesList', status: 'active', classification: '수리' });
    expect(byId('D3').check).not.toBeNull();
    expect(byId('D3').substituteTest).toContain('getIncludesList.test.ts');
  });
});

describe('D3 — 주소 없는 인클루드 이름만 빠진다', () => {
  /** 이름 목록을 줄바꿈으로 이은 평문 응답. 구·신 둘 다 이 모양이다. */
  const list = (...names: string[]): JsonValue => envelope(names.join('\n'));

  const judge = async (before: JsonValue, after: JsonValue, isError = false) => {
    const fixture = recorded([step({ index: 0, tool: 'GetIncludesList', response: before })]);
    return replaySequence(fixture, target([{ payload: after, isError }]));
  };

  it('구가 싣던 비실재 이름이 빠지면 통과다', async () => {
    const result = await judge(list('ZINC_REAL', 'ZUNIVI_H011'), list('ZINC_REAL'));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D3' });
    expect(result.verdict).toBe('pass');
  });

  it('구에 없던 이름이 늘면 등재가 덮어 주지 않는다', async () => {
    const result = await judge(list('ZINC_REAL'), list('ZINC_REAL', 'ZINC_NEW'));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D3' });
  });

  /**
   * 빠지면서 **동시에** 느는 갈래. 이 자리가 없으면 "늘었는가" 검사를 통째로
   * 들어내도 시험이 통과한다 — 뺀 것이 있으면 그것만 보고 넘어가기 때문이다.
   */
  it('빠진 이름이 있어도 늘어난 이름이 있으면 덮어 주지 않는다', async () => {
    const result = await judge(list('ZINC_A', 'ZINC_B'), list('ZINC_A', 'ZINC_C'));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D3' });
    expect(result.steps[0]?.detail).toContain('ZINC_C');
  });

  it('오류로 답하면 등재가 덮어 주지 않는다', async () => {
    const result = await judge(list('ZINC_REAL'), envelope('ERR_X: 실패', true), true);

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D3' });
  });

  it('detailed 응답의 includes 배열도 같은 자로 잰다', async () => {
    const detailed = (...names: string[]): JsonValue =>
      envelope(JSON.stringify({ detailed: true, total_includes: names.length, includes: names }));
    const result = await judge(detailed('ZINC_REAL', 'ZUNIVI_H011'), detailed('ZINC_REAL'));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D3' });
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

describe('D1 — 술어를 무시한 표를 성공으로 내주지 않는다', () => {
  const SQL = "SELECT * FROM zsapkit_m1_tab WHERE probe_id = 'A'";

  /** Data Preview 응답 본문의 모양 그대로 — 도구가 싣는 pretty-print JSON이다. */
  const table = (...rows: Record<string, string | null>[]): JsonValue =>
    envelope(
      JSON.stringify({
        sql_query: SQL,
        row_number: 100,
        returned_row_count: rows.length,
        truncated: false,
        columns: [{ name: 'PROBE_ID' }],
        rows,
      }),
    );

  const refusal = (text: string): JsonValue => envelope(text, true);
  const IGNORED = 'ERR_SQLQUERY_PREDICATE_IGNORED: the rows the server returned do not satisfy';

  const judge = async (before: JsonValue, after: JsonValue, isError = false, beforeIsError = false) => {
    const fixture = recorded([
      step({ index: 0, tool: 'GetSqlQuery', args: { sql_query: SQL, row_number: 100 }, response: before, isError: beforeIsError }),
    ]);
    return replaySequence(fixture, target([{ payload: after, isError }]));
  };

  it('구가 술어를 어긴 표를 성공으로 냈고 신이 거부하면 통과다', async () => {
    const result = await judge(table({ PROBE_ID: 'B' }), refusal(IGNORED), true);

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D1' });
    expect(result.verdict).toBe('pass');
  });

  /**
   * 과수리 역검증. 이 자리가 없으면 "거부하기만 하면 통과"가 되어, 신 엔진이
   * 옳은 표까지 물리치는 회귀를 등재가 삼킨다.
   */
  it('구 표가 술어를 지켰는데 신이 거부하면 덮어 주지 않는다', async () => {
    const result = await judge(table({ PROBE_ID: 'A' }), refusal(IGNORED), true);

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D1' });
    expect(result.steps[0]?.detail).toContain('옳은 표를 거부했다');
  });

  it('신의 거부가 술어 무시 거부가 아니면 덮어 주지 않는다', async () => {
    const result = await judge(table({ PROBE_ID: 'B' }), refusal('ADT error: 500'), true);

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D1' });
  });

  it('신이 성공으로 답했는데 표가 갈리면 덮어 주지 않는다', async () => {
    const result = await judge(table({ PROBE_ID: 'B' }), table({ PROBE_ID: 'C' }));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D1' });
  });

  it('구도 오류였으면 거부할 표가 없었으므로 덮어 주지 않는다', async () => {
    const result = await judge(refusal('ADT error: 400'), refusal(IGNORED), true, true);

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D1' });
  });

  /**
   * 등재는 **차이가 났을 때만** 발동한다. 같으면 그냥 통과이고, 그래야
   * `GetSqlQuery`가 재생 급 증거를 얻을 수 있다 — 등재가 언제나 발동하면
   * 이 도구의 재생 칸은 영원히 빈다.
   */
  it('구·신이 같으면 등재가 발동하지 않고 재생 급으로 통과한다', async () => {
    const same = table({ PROBE_ID: 'A' });
    const result = await judge(same, same);

    expect(result.steps[0]).toMatchObject({ verdict: 'match', divergenceId: null });
    expect(result.verdict).toBe('pass');
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
  // 본보기를 D1에서 D2로 옮겼다 — D1의 이연은 실데이터 도구 작업(판6.1)이
  // 끝냈고, 지금 이연으로 남은 도구 단위 항목은 D2다(재생 대조가 볼 수 없는
  // 와이어 사실이라 계약 시험이 판정 자리를 갖는다).
  it('이연된 항목에 검사를 나중에 물릴 수 있다', () => {
    const wired = withSubstituteChecks(M1_DIVERGENCES, {
      D2: () => ({ ok: true, detail: '활성화 요청이 실제로 나갔음을 계약 시험이 증명했다.' }),
    });

    expect(M1_DIVERGENCES.find((e) => e.id === 'D2')?.check).toBeNull();
    expect(wired.find((e) => e.id === 'D2')?.check).not.toBeNull();
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

/**
 * 은퇴 근거 경로의 얼린 목록 — `engine/`이 레포에 있을 때(판7.5 이전) 실재를
 * 확인해 굳힌 것. `capture-retired-evidence-paths.mjs`가 만든다.
 *
 * 아래 "경로가 전부 실재한다" 계열이 이 목록에 **있는** `engine/` 경로만 면제한다
 * — `engine/`이 삭제되면 그 경로는 `fs.existsSync`로 다시 확인할 길이 없지만,
 * 삭제 전에는 실재했다는 사실 자체는 사라지지 않기 때문이다. 목록 **밖**의
 * `engine/` 경로(앞으로 새로 등재될 것)는 여전히 `fs.existsSync`로 검증된다 —
 * 「`engine/`으로 시작하면 무조건 통과」가 되면 장부에 아무 허구나 적을 수 있다.
 */
const RETIRED_EVIDENCE_PATHS: ReadonlySet<string> = new Set(
  (
    JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'retired-evidence-paths.json'), 'utf8'),
    ) as { paths: string[] }
  ).paths,
);

/** 토큰이 실재하는가 — 실물이거나, `engine/` 은퇴 전에 실재를 확인해 얼린 목록에 있으면. */
function tokenExists(token: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, token)) || RETIRED_EVIDENCE_PATHS.has(token);
}

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
   *
   * 판7.5에서 `engine/`이 레포에서 삭제된 뒤로 `engine/` 접두 경로는
   * `RETIRED_EVIDENCE_PATHS`(얼린 목록, 채록 시점 `${RETIRED_EVIDENCE_PATHS.size}`개)에
   * **있을 때만** 면제한다 — 삭제 전에 실재를 확인해 두었다는 뜻이다. 목록 밖의
   * `engine/` 경로는 새로 지어낸 것일 수 있으므로 여전히 `fs.existsSync`로 떨어진다.
   */
  it(`substituteTest가 지목하는 경로는 전부 실재한다 (engine/ 은퇴분 ${RETIRED_EVIDENCE_PATHS.size}종은 얼린 목록으로 면제)`, () => {
    const missing: string[] = [];
    for (const entry of M1_DIVERGENCES) {
      for (const token of entry.substituteTest?.match(PATHLIKE) ?? []) {
        if (!tokenExists(token)) missing.push(`${entry.id} — ${token}`);
      }
      for (const token of entry.evidence.match(PATHLIKE) ?? []) {
        if (!tokenExists(token)) missing.push(`${entry.id}(근거) — ${token}`);
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

// ── D41~D105의 기계 장부 반영 ────────────────────────────────────────────────
//
// 오브젝트 묶음 13개가 병렬로 돌면서 `harness/replay/**`를 무접촉으로 갖고 있었기
// 때문에 D41 이후는 사람용 장부에만 쌓였다. 여기서 옮긴 것과 옮기지 않은 것을
// 둘 다 못박는다 — **안 옮긴 것도 판정이다.**

/** 이번에 옮긴 것. 사람용 장부의 D 번호를 그대로 쓴다. */
const MOVED_41_105: readonly string[] = [
  'D41',
  'D46',
  'D51',
  'D56',
  'D61',
  'D66',
  'D73',
  'D77',
  'D81',
  'D93',
  'D99',
  'D100',
  'D103',
  'D105',
];

/** 판정해서 **안 옮긴** 것. 장부에 항목은 있으나 기계 장부에는 오지 않는다. */
const NOT_MOVED_41_105: readonly string[] = [
  'D52',
  'D62',
  'D71',
  'D72',
  'D76',
  'D82',
  'D91',
  'D92',
  'D94',
  'D95',
  'D98',
  'D101',
  'D104',
];

const numberOf = (id: string): number => Number(id.slice(1));

/** 구가 "활성화까지 마쳤다"고 답한 성공 본문 (뷰 계열의 실제 모양). */
const OLD_ACTIVATED = {
  success: true,
  view_name: 'ZV_DEMO',
  type: 'DDLS',
  activated: true,
  message: 'View ZV_DEMO updated and activated successfully',
};

/** 신 엔진이 활성화 실패를 되돌린 응답. */
const NEW_ACTIVATION_FAILED = envelope(
  'Activation failed: view ZV_DEMO was not activated (1 error): [L3] Field ZZZ is unknown. ' +
    'The DDL source is on SAP as an inactive version; the active version is unchanged.',
  true,
);

describe('D41~D105 판정 — 재생 대조가 보는 표면에 나타나는 것만 옮긴다', () => {
  it('D41 이후로 옮긴 것은 열넷뿐이다', () => {
    const moved = M1_DIVERGENCES.map((e) => e.id).filter((id) => numberOf(id) >= 41 && numberOf(id) <= 105);
    expect(moved).toEqual([...MOVED_41_105]);
  });

  it('와이어에만 남는 차이·계층 차이는 옮기지 않았다', () => {
    for (const id of NOT_MOVED_41_105) expect(M1_DIVERGENCES.find((e) => e.id === id)).toBeUndefined();
  });

  it('번호 예약으로 비어 있는 자리는 애초에 등재가 아니다', () => {
    // 결번(D42~D45 등)은 예약 구간을 다 쓰지 않은 과제가 남긴 자리다.
    const known = new Set([...MOVED_41_105, ...NOT_MOVED_41_105]);
    for (const entry of M1_DIVERGENCES) {
      const n = numberOf(entry.id);
      if (n >= 41 && n <= 105) expect(known.has(entry.id)).toBe(true);
    }
  });

  it('새 항목을 얹은 뒤에도 장부는 잘 형성돼 있다', () => {
    expect(() => assertLedgerWellFormed(M1_DIVERGENCES)).not.toThrow();
  });

  /**
   * 하드 게이트 — **없는 대체 기대 시험을 있다고 적지 않는다.**
   *
   * 위쪽 「substituteTest가 지목하는 경로는 전부 실재한다」는 경로 토큰이 하나도
   * 없으면 공허하게 통과한다. 새 항목은 전부 **파일을 하나 이상 지목해야** 한다 —
   * 산문만 적으면 대장(`substituteEvidenceFromLedger`)이 그 도구를 세지 않으면서
   * 사람은 시험이 있다고 읽는다.
   */
  it('새 항목의 대체 기대 시험은 산문이 아니라 실재하는 파일이다', () => {
    const bad: string[] = [];
    for (const id of MOVED_41_105) {
      const entry = M1_DIVERGENCES.find((e) => e.id === id);
      if (entry === undefined) {
        bad.push(`${id} — 장부에 없다`);
        continue;
      }
      const tokens = entry.substituteTest?.match(PATHLIKE) ?? [];
      const real = tokens.filter((token) => tokenExists(token));
      if (real.length === 0) bad.push(`${id} — 실재하는 시험 파일이 없다`);
    }
    expect(bad).toEqual([]);
  });

  // engine/ 은퇴분은 얼린 목록(RETIRED_EVIDENCE_PATHS)에 있을 때만 면제한다 —
  // 새로 지어낸 engine/ 경로는 여전히 fs.existsSync로 떨어진다.
  it(`새 항목의 근거 경로도 전부 실재한다 (engine/ 은퇴분 ${RETIRED_EVIDENCE_PATHS.size}종은 얼린 목록으로 면제)`, () => {
    const missing: string[] = [];
    for (const id of MOVED_41_105) {
      const entry = M1_DIVERGENCES.find((e) => e.id === id);
      if (entry === undefined) continue;
      for (const token of entry.evidence.match(PATHLIKE) ?? []) {
        if (!tokenExists(token)) missing.push(`${id} — ${token}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('활성화 거짓 성공 계열 — 도구 묶음마다 갈라 등재한다', () => {
  /** 한 항목이 맡는 도구들. 사람용 장부가 그 항목 본문에 적은 집합 그대로다. */
  const FAMILY: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['D41', ['UpdateLocalTestClass']],
    ['D51', ['UpdateFunctionModule']],
    ['D56', ['UpdateTable', 'CreateStructure', 'UpdateStructure']],
    ['D66', ['UpdateView']],
    ['D73', ['UpdateInterface']],
    [
      'D93',
      [
        'CreateTextElement',
        'UpdateTextElement',
        'CreateScreen',
        'UpdateScreen',
        'CreateGuiStatus',
        'UpdateGuiStatus',
        'PatchGuiStatus',
      ],
    ],
    ['D99', ['CreateBehaviorDefinition', 'UpdateBehaviorDefinition']],
    ['D100', ['UpdateBehaviorImplementation']],
    ['D103', ['CreateMetadataExtension', 'UpdateMetadataExtension']],
    ['D105', ['CreateServiceBinding']],
  ];

  it('도구 묶음이 서로 겹치지 않는다 — 배열 순서가 판정을 정하지 않게', () => {
    const seen = new Map<string, string>();
    for (const [id, tools] of FAMILY) {
      for (const tool of tools) {
        expect(seen.get(tool)).toBeUndefined();
        seen.set(tool, id);
      }
    }
  });

  it('각 도구의 "활성화됨" 성공 단계는 자기 항목 하나에만 걸린다', () => {
    for (const [id, tools] of FAMILY) {
      for (const tool of tools) {
        expect(idsIn(step({ index: 0, tool, response: textEnvelope(OLD_ACTIVATED) }))).toEqual([id]);
      }
    }
  });

  it('`CreateTable`은 D56에서 뺐다 — 그 도구는 활성화를 부르지 않는다', () => {
    expect(idsIn(step({ index: 0, tool: 'CreateTable', response: textEnvelope(OLD_ACTIVATED) }))).toEqual([]);
  });

  it('활성화를 주장하지 않은 단계는 등재 밖이다 — 여전히 대조된다', async () => {
    const quiet = { ...OLD_ACTIVATED, activated: false, message: 'View ZV_DEMO updated successfully' };
    expect(idsIn(step({ index: 0, tool: 'UpdateView', response: textEnvelope(quiet) }))).toEqual([]);

    const fixture = recorded([step({ index: 0, tool: 'UpdateView', response: textEnvelope(quiet) })]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope({ ...quiet, type: 'OTHER' }) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'mismatch', divergenceId: null });
  });

  it('차이가 없으면 발동하지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'UpdateView', response: textEnvelope(OLD_ACTIVATED) })]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.steps[0]).toMatchObject({ verdict: 'match', divergenceId: null });
    expect(result.verdict).toBe('pass');
  });

  it('구의 거짓 성공을 활성화 실패로 되돌리면 통과다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'UpdateView', response: textEnvelope(OLD_ACTIVATED) })]);
    const result = await replaySequence(fixture, target([{ payload: NEW_ACTIVATION_FAILED, isError: true }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D66' });
    expect(result.verdict).toBe('pass');
  });

  it('활성화가 아닌 이유로 실패하면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'UpdateView', response: textEnvelope(OLD_ACTIVATED) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope('[423 lock-conflict] SAP Error: object is locked by ZUSER', true), isError: true }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D66' });
    expect(result.verdict).toBe('fail');
  });

  it('신도 성공으로 답했는데 본문이 달라지면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'UpdateView', response: textEnvelope(OLD_ACTIVATED) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ ...OLD_ACTIVATED, view_name: 'ZV_OTHER' }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D66' });
  });

  it('장부에서 빼면 같은 단계가 결함으로 떨어진다 — 지금 옮기는 이유', async () => {
    const fixture = recorded([step({ index: 0, tool: 'UpdateView', response: textEnvelope(OLD_ACTIVATED) })]);
    const result = await replaySequence(fixture, target([{ payload: NEW_ACTIVATION_FAILED, isError: true }]), {
      divergences: [],
    });

    expect(result.steps[0]).toMatchObject({ verdict: 'mismatch', divergenceId: null });
  });
});

describe('D46 — GetProgFullCode가 인클루드 본문을 실제로 꺼낸다', () => {
  const body = (objects: { OBJECT_TYPE: string; OBJECT_NAME: string; code: string | null }[]): JsonValue => ({
    name: 'ZPROG',
    type: 'PROG/P',
    total_code_objects: objects.length,
    code_objects: objects,
  });

  const OLD = body([
    { OBJECT_TYPE: 'PROG/P', OBJECT_NAME: 'ZPROG', code: 'REPORT zprog.' },
    { OBJECT_TYPE: 'PROG/I', OBJECT_NAME: 'ZINC_A', code: null },
  ]);

  it('`code_objects`를 실은 성공 단계에만 걸린다', () => {
    expect(idsIn(step({ index: 0, tool: 'GetProgFullCode', response: textEnvelope(OLD) }))).toEqual(['D46']);
    expect(idsIn(step({ index: 0, tool: 'GetProgFullCode', response: envelope('Unsupported type') }))).toEqual([]);
    expect(idsIn(step({ index: 0, tool: 'GetProgFullCode', isError: true, response: envelope('boom', true) }))).toEqual(
      [],
    );
  });

  it('빈손이던 code가 채워지고 중첩이 붙으면 통과다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetProgFullCode', response: textEnvelope(OLD) })]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: textEnvelope(
            body([
              { OBJECT_TYPE: 'PROG/P', OBJECT_NAME: 'ZPROG', code: 'REPORT zprog.' },
              { OBJECT_TYPE: 'PROG/I', OBJECT_NAME: 'ZINC_A', code: 'WRITE 1.' },
              { OBJECT_TYPE: 'PROG/I', OBJECT_NAME: 'ZINC_NESTED', code: 'WRITE 2.' },
            ]),
          ),
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D46' });
  });

  it('구가 싣던 본문이 달라지면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetProgFullCode', response: textEnvelope(OLD) })]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: textEnvelope(
            body([
              { OBJECT_TYPE: 'PROG/P', OBJECT_NAME: 'ZPROG', code: 'REPORT zother.' },
              { OBJECT_TYPE: 'PROG/I', OBJECT_NAME: 'ZINC_A', code: 'WRITE 1.' },
            ]),
          ),
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D46' });
  });

  it('구에 있던 항목이 빠지면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetProgFullCode', response: textEnvelope(OLD) })]);
    const result = await replaySequence(
      fixture,
      target([
        { payload: textEnvelope(body([{ OBJECT_TYPE: 'PROG/P', OBJECT_NAME: 'ZPROG', code: 'REPORT zprog.' }])) },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D46' });
  });
});

describe('D77 — 인핸스먼트 두 도구의 `type: json` 블록을 규약대로 text로', () => {
  const BODY: JsonValue = { spot: 'ZSPOT', enhancements: [{ name: 'ZENH' }] };

  it('구가 json 블록으로 답한 두 도구에만 걸린다', () => {
    expect(idsIn(step({ index: 0, tool: 'GetEnhancementSpot', response: jsonEnvelope(BODY) }))).toEqual(['D77']);
    expect(idsIn(step({ index: 0, tool: 'GetEnhancementImpl', response: jsonEnvelope(BODY) }))).toEqual(['D77']);
    // 같은 묶음의 `GetEnhancements`는 구도 text였다 — 이 항목 밖이다.
    expect(idsIn(step({ index: 0, tool: 'GetEnhancements', response: jsonEnvelope(BODY) }))).toEqual([]);
    // 같은 도구라도 구가 text로 답한 단계는 여전히 대조된다.
    expect(idsIn(step({ index: 0, tool: 'GetEnhancementSpot', response: envelope('평문') }))).toEqual([]);
  });

  it('그릇만 바뀌었으면 통과한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetEnhancementSpot', response: jsonEnvelope(BODY) })]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope(BODY) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D77' });
  });

  it('본문 값이 달라지면 실패한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetEnhancementSpot', response: jsonEnvelope(BODY) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ spot: 'ZOTHER', enhancements: [] }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D77' });
  });
});

describe('D81 — CreateTransport가 만든 이송번호를 응답에 싣는다', () => {
  const OLD = {
    success: true,
    description: '데모',
    type: 'K',
    target_system: 'LOCAL',
    message: 'Transport request unknown created successfully',
  };
  const NEW = {
    success: true,
    transport_request: 'DEVK900123',
    description: '데모',
    type: 'K',
    target_system: 'LOCAL',
    message: 'Transport request DEVK900123 created successfully',
  };

  it('구의 `unknown created successfully` 자국을 단 단계에만 걸린다', () => {
    expect(idsIn(step({ index: 0, tool: 'CreateTransport', response: textEnvelope(OLD) }))).toEqual(['D81']);
    // 번호가 살아 있던 채록분은 이 차이가 아니다 — 여전히 대조된다.
    expect(idsIn(step({ index: 0, tool: 'CreateTransport', response: textEnvelope(NEW) }))).toEqual([]);
  });

  it('번호가 실리고 문구만 따라 바뀌면 통과다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'CreateTransport', response: textEnvelope(OLD) })]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope(NEW) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D81' });
  });

  it('등재되지 않은 키가 함께 달라지면 실패한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'CreateTransport', response: textEnvelope(OLD) })]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope({ ...NEW, target_system: 'QAS' }) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D81' });
  });

  it('문구가 여전히 unknown이면 실패한다 — 번호를 잃은 자리가 그대로다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'CreateTransport', response: textEnvelope(OLD) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ ...OLD, message: 'Transport request unknown created successfully!' }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D81' });
  });

  /**
   * 문구에서 `unknown`만 지우고 **번호는 여전히 안 싣는** 갈래.
   *
   * 이 자리가 없으면 `transport_request`를 실제로 요구하는 검사를 통째로 들어내도
   * 시험이 통과한다 — 위 시험은 문구 쪽 검사만으로도 잡히기 때문이다.
   */
  it('문구만 손보고 번호를 안 실으면 실패한다 — 등재는 수리를 요구한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'CreateTransport', response: textEnvelope(OLD) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ ...OLD, message: 'Transport request created successfully' }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D81' });
    expect(result.steps[0]?.detail).toContain('이송번호가 없다');
  });
});

describe('D61 — 데이터 엘리먼트·도메인의 ECC 우회로가 없다', () => {
  const OLD_ECC = {
    success: true,
    data_element_name: 'ZDE_DEMO',
    version: 'active',
    data_element_data: '{}',
    status: 200,
    status_text: 'OK',
    path: 'ecc-odata-rfc',
  };

  it('구가 ECC 브리지로 답한 단계에만 걸린다', () => {
    expect(idsIn(step({ index: 0, tool: 'GetDataElement', response: textEnvelope(OLD_ECC) }))).toEqual(['D61']);
    expect(idsIn(step({ index: 0, tool: 'GetDomain', response: textEnvelope(OLD_ECC) }))).toEqual(['D61']);
    expect(idsIn(step({ index: 0, tool: 'CreateDataElement', response: textEnvelope(OLD_ECC) }))).toEqual(['D61']);
    expect(idsIn(step({ index: 0, tool: 'CreateDomain', response: textEnvelope(OLD_ECC) }))).toEqual(['D61']);
    // ADT 갈래(브리지 자국 없음)는 등재 밖이다.
    const adt = { success: true, data_element_name: 'ZDE_DEMO', version: 'active' };
    expect(idsIn(step({ index: 0, tool: 'GetDataElement', response: textEnvelope(adt) }))).toEqual([]);
  });

  it('축소분이라 재생은 통과가 아니라 무증거로 센다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetDataElement', response: textEnvelope(OLD_ECC) })]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: envelope(
            'GetDataElement on SAP_VERSION=ECC needs the ZMCP_ADT_DDIC_DTEL_READ OData bridge, ' +
              'which this engine does not implement yet (divergence D61).',
            true,
          ),
          isError: true,
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-deferred', divergenceId: 'D61' });
    expect(result.verdict).toBe('no-evidence');
  });
});

// ── D110~D132의 기계 장부 반영 (**마지막 반영**) ─────────────────────────────
//
// 꼬리 묶음 셋(삭제 계열 25종 · `tail-test` · `tail-read`)이 `harness/replay/**`를
// 무접촉으로 갖고 있어 사람용 장부에만 쌓인 마지막 분량이다. 2차 반영이 좁혀 둔
// 가름선을 **그대로** 쓴다 — 「재생 대조가 보는 표면(도구 호출·응답·`isError`)에
// 나타나는가」. 새 규칙을 만들지 않았다.

/** 이번에 옮긴 것. 사람용 장부의 D 번호를 그대로 쓴다. */
const MOVED_110_132: readonly string[] = [
  'D110',
  'D111',
  'D114',
  'D115',
  'D120',
  'D121',
  'D122',
  'D125',
  'D130',
  'D132',
];

/** 판정해서 **안 옮긴** 것. 장부에 항목은 있으나 기계 장부에는 오지 않는다. */
const NOT_MOVED_110_132: readonly string[] = ['D112', 'D113', 'D123', 'D124', 'D131'];

/** 구 ECC 브리지가 답한 자국 — D110(삭제 셋)·D132(BAdI)가 함께 쓰는 표식. */
const OLD_ECC_BRIDGE = {
  success: true,
  path: 'ecc-odata-rfc',
  table_name: 'ZTDEMO',
  transport_request: null,
  message: 'Table ZTDEMO deleted successfully (ECC fallback via OData).',
};

/** 구 `DeleteServiceBinding`이 「지웠다」고 답했으나 본문은 아니라고 말하는 응답. */
const OLD_NOT_DELETED = {
  success: true,
  service_binding_name: 'ZSB_DEMO',
  response_format: 'xml',
  status: 200,
  payload: {
    'del:deletionResult': {
      'del:object': { 'del:isDeleted': 'false', 'del:message': { 'del:text': 'Binding is published' } },
    },
  },
};

/** 같은 도구가 실제로 지운 응답 — 등재 밖이므로 그대로 대조된다. */
const OLD_DELETED = {
  ...OLD_NOT_DELETED,
  payload: { 'del:deletionResult': { 'del:object': { 'del:isDeleted': 'true' } } },
};

/** 신 엔진이 삭제 거짓 성공을 되돌린 응답. */
const NEW_DELETION_FAILED = envelope('Error: Service binding deletion failed: Binding is published', true);

/** 구 `UpdateCdsUnitTest`의 성공 응답 — **`activated` 키도 문구도 없다.** */
const OLD_CDS_UNIT_TEST_OK = {
  success: true,
  class_name: 'ZCL_DEMO',
  test_class_state: { testClassCode: 'CLASS ltcl_x DEFINITION.', lockHandle: 'LH1', errors: [] },
  message: 'CDS unit test class ZCL_DEMO updated successfully.',
};

/** 신 엔진이 활성화 실패를 되돌린 클래스 계열 문구. */
const NEW_CLASS_ACTIVATION_FAILED = envelope(
  'Activation failed: class ZCL_DEMO was not activated (1 error): [L3] Field ZZZ is unknown. ' +
    'The source is on SAP as an inactive version; the active version is unchanged.',
  true,
);

describe('D110~D132 판정 — 마지막 반영', () => {
  it('D110 이후로 옮긴 것은 열뿐이다', () => {
    const moved = M1_DIVERGENCES.map((e) => e.id).filter((id) => numberOf(id) >= 110 && numberOf(id) <= 132);
    expect(moved).toEqual([...MOVED_110_132]);
  });

  it('접속 계층·와이어에만 남는 차이는 옮기지 않았다', () => {
    for (const id of NOT_MOVED_110_132) expect(M1_DIVERGENCES.find((e) => e.id === id)).toBeUndefined();
  });

  /**
   * **D33 재판정.** 2차 반영이 D33을 「안 옮김」으로 판정한 근거는 "읽는 도구가
   * 등록점에 없다"였고 그 전제는 깨졌다(`GetObjectNodeFromCache`가 지어졌다).
   * 그래도 D33 자신은 오지 않는다 — 캐시를 **얹던** 다섯 도구의 자기 응답은
   * 그대로이기 때문이다. 관측되는 결과를 지목한 D130이 그 자리를 받는다.
   */
  it('D33은 여전히 기계 장부 밖이고, 그 자리를 D130이 받았다', () => {
    expect(M1_DIVERGENCES.find((e) => e.id === 'D33')).toBeUndefined();
    expect(M1_DIVERGENCES.find((e) => e.id === 'D130')).toBeDefined();
  });

  it('새 항목을 얹은 뒤에도 장부는 잘 형성돼 있다', () => {
    expect(() => assertLedgerWellFormed(M1_DIVERGENCES)).not.toThrow();
  });

  /** 하드 게이트 — **없는 대체 기대 시험을 있다고 적지 않는다.** */
  it('새 항목의 대체 기대 시험은 산문이 아니라 실재하는 파일이다', () => {
    const bad: string[] = [];
    for (const id of MOVED_110_132) {
      const entry = M1_DIVERGENCES.find((e) => e.id === id);
      if (entry === undefined) {
        bad.push(`${id} — 장부에 없다`);
        continue;
      }
      const tokens = entry.substituteTest?.match(PATHLIKE) ?? [];
      const real = tokens.filter((token) => tokenExists(token));
      if (real.length === 0) bad.push(`${id} — 실재하는 시험 파일이 없다`);
    }
    expect(bad).toEqual([]);
  });

  // engine/ 은퇴분은 얼린 목록(RETIRED_EVIDENCE_PATHS)에 있을 때만 면제한다 —
  // 새로 지어낸 engine/ 경로는 여전히 fs.existsSync로 떨어진다.
  it(`새 항목의 근거 경로도 전부 실재한다 (engine/ 은퇴분 ${RETIRED_EVIDENCE_PATHS.size}종은 얼린 목록으로 면제)`, () => {
    const missing: string[] = [];
    for (const id of MOVED_110_132) {
      const entry = M1_DIVERGENCES.find((e) => e.id === id);
      if (entry === undefined) continue;
      for (const token of entry.evidence.match(PATHLIKE) ?? []) {
        if (!tokenExists(token)) missing.push(`${id} — ${token}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('과등재 역검증 — 표면 186종을 대표 응답 모양으로 훑는다', () => {
  /**
   * 성공 갈래의 대표 모양들. **한 단계에 두 등재가 겹치면 배열 순서가 판정을
   * 정한다**(머리주석 규칙 ①) — 그 일이 표면 어디에서도 일어나지 않는지를
   * 도구 이름 186개 전량으로 훑어 못박는다.
   */
  const SUCCESS_SHAPES: readonly JsonValue[] = [
    envelope('평문 성공'),
    jsonEnvelope({ any: 'body' }),
    textEnvelope(OLD_ACTIVATED),
    textEnvelope({ success: true, message: 'Domain ZD_DEMO updated and activated successfully' }),
    textEnvelope(OLD_ECC_BRIDGE),
    textEnvelope(OLD_NOT_DELETED),
    textEnvelope(OLD_DELETED),
    textEnvelope(OLD_CDS_UNIT_TEST_OK),
    textEnvelope({ success: true, message: 'Transport request unknown created successfully' }),
  ];

  /** 오류 갈래의 대표 모양들. **새 항목은 어느 것에도 걸리면 안 된다.** */
  const ERROR_SHAPES: readonly JsonValue[] = [
    envelope('boom', true),
    envelope('MCP error -32602: object_name is required', true),
    envelope('Basic authentication requires SAP_CLIENT to be provided', true),
    envelope('Node not found in cache', true),
  ];

  const SURFACE = loadCapturedToolNames();

  it('표면 채록본이 186종을 준다', () => {
    expect(SURFACE.length).toBe(186);
  });

  it('성공 갈래의 어떤 모양에서도 두 등재가 겹치지 않는다', () => {
    const clashes: string[] = [];
    for (const tool of SURFACE) {
      for (const [shape, response] of SUCCESS_SHAPES.entries()) {
        const ids = idsIn(step({ index: 0, tool, response }));
        if (ids.length > 1) clashes.push(`${tool} · 모양 ${shape} — ${ids.join('+')}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('새 항목은 오류 단계에 하나도 걸리지 않는다 — 구가 성공이라 답한 자리만 등재다', () => {
    const wrong: string[] = [];
    for (const tool of SURFACE) {
      for (const response of ERROR_SHAPES) {
        for (const id of idsIn(step({ index: 0, tool, isError: true, response }))) {
          if (MOVED_110_132.includes(id)) wrong.push(`${tool} — ${id}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('D110 — 삭제 셋의 ECC 우회로가 없다', () => {
  it('구가 ECC 브리지로 답한 세 도구의 단계에만 걸린다', () => {
    for (const tool of ['DeleteTable', 'DeleteDomain', 'DeleteDataElement']) {
      expect(idsIn(step({ index: 0, tool, response: textEnvelope(OLD_ECC_BRIDGE) }))).toEqual(['D110']);
    }
    // 브리지 자국이 없는 ADT 갈래는 등재 밖이다 — 그대로 대조된다.
    expect(
      idsIn(step({ index: 0, tool: 'DeleteTable', response: textEnvelope({ success: true, table_name: 'ZTDEMO' }) })),
    ).toEqual([]);
    // 구에도 ECC 우회로가 없던 형제 삭제는 이 항목 밖이다.
    expect(idsIn(step({ index: 0, tool: 'DeleteStructure', response: textEnvelope(OLD_ECC_BRIDGE) }))).toEqual([]);
    expect(idsIn(step({ index: 0, tool: 'DeleteView', response: textEnvelope(OLD_ECC_BRIDGE) }))).toEqual([]);
  });

  it('축소분이라 재생은 통과가 아니라 무증거로 센다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'DeleteTable', response: textEnvelope(OLD_ECC_BRIDGE) })]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: envelope('Error: DeleteTable on SAP_VERSION=ECC is not supported (divergence D110).', true),
          isError: true,
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-deferred', divergenceId: 'D110' });
    expect(result.verdict).toBe('no-evidence');
  });

  it('ADT 갈래의 차이는 등재가 덮어 주지 않는다', async () => {
    const adt = { success: true, table_name: 'ZTDEMO' };
    const fixture = recorded([step({ index: 0, tool: 'DeleteTable', response: textEnvelope(adt) })]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope({ ...adt, table_name: 'ZTOTHER' }) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'mismatch', divergenceId: null });
  });
});

describe('활성화 거짓 성공 계열 — 꼬리 묶음이 더한 다섯', () => {
  /** 한 항목이 맡는 도구들. 사람용 장부가 그 항목 본문에 적은 집합 그대로다. */
  const FAMILY_110_132: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['D111', ['DeleteLocalDefinitions', 'DeleteLocalMacros', 'DeleteLocalTestClass', 'DeleteLocalTypes']],
    ['D114', ['DeleteTextElement']],
    ['D121', ['UpdateLocalDefinitions']],
    ['D122', ['UpdateLocalMacros']],
    ['D125', ['UpdateDomain']],
  ];

  it('각 도구의 "활성화됨" 성공 단계는 자기 항목 하나에만 걸린다', () => {
    for (const [id, tools] of FAMILY_110_132) {
      for (const tool of tools) {
        expect(idsIn(step({ index: 0, tool, response: textEnvelope(OLD_ACTIVATED) }))).toEqual([id]);
      }
    }
  });

  it('활성화를 주장하지 않은 단계는 등재 밖이다 — 여전히 대조된다', async () => {
    const quiet = {
      success: true,
      class_name: 'ZCL_DEMO',
      activated: false,
      message: 'Local test class deleted successfully from ZCL_DEMO.',
    };
    expect(idsIn(step({ index: 0, tool: 'DeleteLocalTestClass', response: textEnvelope(quiet) }))).toEqual([]);

    const fixture = recorded([step({ index: 0, tool: 'DeleteLocalTestClass', response: textEnvelope(quiet) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ ...quiet, class_name: 'ZCL_OTHER' }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'mismatch', divergenceId: null });
  });

  it('차이가 없으면 발동하지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'UpdateDomain', response: textEnvelope(OLD_ACTIVATED) })]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.steps[0]).toMatchObject({ verdict: 'match', divergenceId: null });
    expect(result.verdict).toBe('pass');
  });

  it('구의 거짓 성공을 활성화 실패로 되돌리면 통과다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'DeleteTextElement', response: textEnvelope(OLD_ACTIVATED) })]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: envelope(
            'Activation failed: program ZPROG was not activated (1 error): [L1] boom. ' +
              'The text element is cleared on SAP as an inactive version.',
            true,
          ),
          isError: true,
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D114' });
  });

  it('활성화가 아닌 이유로 실패하면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'UpdateLocalMacros', response: textEnvelope(OLD_ACTIVATED) })]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope('[423 lock-conflict] SAP Error: class is locked by ZUSER', true), isError: true }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D122' });
    expect(result.verdict).toBe('fail');
  });
});

describe('D120 — UpdateCdsUnitTest는 성공 갈래 전체가 활성화 주장이다', () => {
  /**
   * 이 도구의 구 응답에는 `activated` 키도 "activated successfully" 문구도
   * **없다**(`handleUpdateCdsUnitTest.ts:98-107`). 그래서 다른 항목이 쓰는 채록
   * 표식이 걸리지 않는다. 대신 구 벤더가 `activateOnUpdate: true`를 **박아 두어**
   * 활성화를 부르지 않는 성공 갈래가 아예 없으므로, **「구가 성공이라 답했다」가
   * 곧 활성화 주장**이다.
   */
  it('구 응답에는 활성화 표식이 없는데도 성공 갈래에 걸린다', () => {
    const text = JSON.stringify(OLD_CDS_UNIT_TEST_OK);
    expect(text).not.toContain('"activated"');
    expect(text).not.toContain('activated successfully');

    expect(idsIn(step({ index: 0, tool: 'UpdateCdsUnitTest', response: textEnvelope(OLD_CDS_UNIT_TEST_OK) }))).toEqual([
      'D120',
    ]);
  });

  it('오류 갈래는 등재 밖이다 — 그대로 대조된다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'UpdateCdsUnitTest', isError: true, response: envelope('Error: locked', true) }),
    ]);
    expect(idsIn(fixture.steps[0] as SequenceStep)).toEqual([]);

    const result = await replaySequence(
      fixture,
      target([{ payload: envelope('Error: not found', true), isError: true }]),
    );
    expect(result.steps[0]?.divergenceId).toBeNull();
  });

  it('활성화 실패로 되돌리면 통과다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'UpdateCdsUnitTest', response: textEnvelope(OLD_CDS_UNIT_TEST_OK) }),
    ]);
    const result = await replaySequence(fixture, target([{ payload: NEW_CLASS_ACTIVATION_FAILED, isError: true }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D120' });
  });

  it('차이가 없으면 발동하지 않는다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'UpdateCdsUnitTest', response: textEnvelope(OLD_CDS_UNIT_TEST_OK) }),
    ]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.steps[0]).toMatchObject({ verdict: 'match', divergenceId: null });
  });

  it('신도 성공인데 본문이 달라지면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'UpdateCdsUnitTest', response: textEnvelope(OLD_CDS_UNIT_TEST_OK) }),
    ]);
    const result = await replaySequence(
      fixture,
      target([{ payload: textEnvelope({ ...OLD_CDS_UNIT_TEST_OK, class_name: 'ZCL_OTHER' }) }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D120' });
    expect(result.verdict).toBe('fail');
  });
});

describe('D115 — DeleteServiceBinding의 삭제 거짓 성공', () => {
  it('본문이 「안 지웠다」고 말한 성공 단계에만 걸린다', () => {
    expect(idsIn(step({ index: 0, tool: 'DeleteServiceBinding', response: textEnvelope(OLD_NOT_DELETED) }))).toEqual([
      'D115',
    ]);
    // 실제로 지운 응답은 이 차이가 아니다 — 그대로 대조된다.
    expect(idsIn(step({ index: 0, tool: 'DeleteServiceBinding', response: textEnvelope(OLD_DELETED) }))).toEqual([]);
    // 같은 주소를 쓰는 다른 삭제 12종은 구도 이미 판정했으므로 이 항목 밖이다.
    expect(idsIn(step({ index: 0, tool: 'DeleteClass', response: textEnvelope(OLD_NOT_DELETED) }))).toEqual([]);
  });

  it('평문 XML로 실린 본문에서도 표식을 읽는다', () => {
    const raw = {
      success: true,
      service_binding_name: 'ZSB_DEMO',
      payload:
        '<?xml version="1.0"?><del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
        '<del:object del:isDeleted="false"/></del:deletionResult>',
    };
    expect(idsIn(step({ index: 0, tool: 'DeleteServiceBinding', response: textEnvelope(raw) }))).toEqual(['D115']);
  });

  it('신이 삭제 실패를 이름으로 되돌리면 통과다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'DeleteServiceBinding', response: textEnvelope(OLD_NOT_DELETED) }),
    ]);
    const result = await replaySequence(fixture, target([{ payload: NEW_DELETION_FAILED, isError: true }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-pass', divergenceId: 'D115' });
    expect(result.verdict).toBe('pass');
  });

  it('삭제가 아닌 이유로 실패하면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'DeleteServiceBinding', response: textEnvelope(OLD_NOT_DELETED) }),
    ]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope('[423 lock-conflict] SAP Error: object is locked', true), isError: true }]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D115' });
  });

  it('신도 성공으로 답하면 등재가 덮어 주지 않는다 — 수리를 요구한다', async () => {
    const fixture = recorded([
      step({ index: 0, tool: 'DeleteServiceBinding', response: textEnvelope(OLD_NOT_DELETED) }),
    ]);
    const result = await replaySequence(fixture, target([{ payload: textEnvelope(OLD_DELETED) }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-fail', divergenceId: 'D115' });
  });
});

describe('D130 — GetObjectNodeFromCache는 캐시가 없어 언제나 「없다」로 답한다', () => {
  const OLD_HIT: JsonValue = {
    content: [{ type: 'json', json: { OBJECT_TYPE: 'CLAS/OC', OBJECT_NAME: 'ZCL_DEMO', TECH_NAME: 'ZCL_DEMO' } }],
  };
  const MISS = envelope('Node not found in cache', true);

  it('구가 캐시 적중으로 답한 단계에만 걸린다 — 빈-캐시 갈래는 그대로 대조된다', () => {
    expect(idsIn(step({ index: 0, tool: 'GetObjectNodeFromCache', response: OLD_HIT }))).toEqual(['D130']);
    expect(idsIn(step({ index: 0, tool: 'GetObjectNodeFromCache', isError: true, response: MISS }))).toEqual([]);
  });

  it('빈-캐시 갈래는 글자까지 같으므로 등재 없이 통과한다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetObjectNodeFromCache', isError: true, response: MISS })]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.steps[0]).toMatchObject({ verdict: 'match', divergenceId: null });
  });

  it('빈-캐시 갈래의 문구가 달라지면 등재가 덮어 주지 않는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetObjectNodeFromCache', isError: true, response: MISS })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('Cache miss', true), isError: true }]));

    expect(result.steps[0]?.divergenceId).toBeNull();
    expect(result.steps[0]?.verdict).not.toBe('allowlisted-pass');
  });

  it('축소분이라 재생은 통과가 아니라 무증거로 센다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetObjectNodeFromCache', response: OLD_HIT })]);
    const result = await replaySequence(fixture, target([{ payload: MISS, isError: true }]));

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-deferred', divergenceId: 'D130' });
    expect(result.verdict).toBe('no-evidence');
  });
});

describe('D132 — GetBadiImplementations의 ECC 브리지가 없다', () => {
  const OLD_ECC_BADI = {
    success: true,
    path: 'ecc-odata-rfc',
    badi_definition: 'ZBADI_DEMO',
    kind: 'BAdI',
    total_implementations: 1,
    implementations: [{ impl_name: 'ZIMPL', active: true }],
  };

  it('구가 ECC 브리지로 답한 단계에만 걸린다', () => {
    expect(idsIn(step({ index: 0, tool: 'GetBadiImplementations', response: textEnvelope(OLD_ECC_BADI) }))).toEqual([
      'D132',
    ]);
    // 비-ECC 갈래는 구와 글자까지 같은 거절이라 등재 밖이다.
    expect(
      idsIn(
        step({
          index: 0,
          tool: 'GetBadiImplementations',
          isError: true,
          response: envelope('GetBadiImplementations currently routes through the ECC bridge', true),
        }),
      ),
    ).toEqual([]);
  });

  it('비-ECC 거절이 글자까지 같으면 등재 없이 통과한다', async () => {
    const same = envelope('GetBadiImplementations currently routes through the ECC bridge', true);
    const fixture = recorded([step({ index: 0, tool: 'GetBadiImplementations', isError: true, response: same })]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    expect(result.steps[0]).toMatchObject({ verdict: 'match', divergenceId: null });
  });

  it('축소분이라 재생은 통과가 아니라 무증거로 센다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetBadiImplementations', response: textEnvelope(OLD_ECC_BADI) })]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: envelope(
            'GetBadiImplementations on SAP_VERSION=ECC needs the ZMCP_ADT_DDIC_BADI OData bridge ' +
              '(FunctionImport DdicBadi), which this engine does not implement yet (divergence D132).',
            true,
          ),
          isError: true,
        },
      ]),
    );

    expect(result.steps[0]).toMatchObject({ verdict: 'allowlisted-deferred', divergenceId: 'D132' });
    expect(result.verdict).toBe('no-evidence');
  });
});
