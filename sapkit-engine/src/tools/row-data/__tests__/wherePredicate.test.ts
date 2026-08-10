/**
 * 결함 13-9의 **대체 기대 시험** (하) — 술어 검증기 단위.
 *
 * 장부 `harness/DIVERGENCES.md` D1: 구 엔진은 wide-SELECT에서 WHERE가 통째로
 * 무시된 표를 그대로 `success`로 돌려준다. 신 엔진은 돌아온 행이 **자기 질의의
 * 술어를 만족하는지** 확인하고, 만족하지 않으면 그 표를 내주지 않는다.
 *
 * 이 검증기의 유일한 계약은 **한쪽으로만 틀린다**는 것이다:
 * 위반을 **증명**할 수 있을 때만 위반이라 말하고, 조금이라도 모르면
 * `unverifiable`로 물러난다. 옳은 결과를 거부하는 것(거짓 경보)은 이 도구에서
 * 틀린 데이터를 통과시키는 것만큼 나쁘다.
 */

import { verifyWherePredicate } from '../wherePredicate';

type Row = Record<string, string | null>;

const rows = (...values: Row[]): Row[] => values;

describe('verifyWherePredicate — 위반을 증명할 수 있을 때만 위반이다', () => {
  it('WHERE를 무시한 표를 위반으로 짚는다 (13-9 그 자체)', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr, bukrs FROM zdemo_docs WHERE belnr = '9000000001'",
      rows(
        { BELNR: '9000000001', BUKRS: '1000' },
        { BELNR: '9000000777', BUKRS: '1000' },
      ),
    );
    expect(verdict.kind).toBe('violated');
    if (verdict.kind !== 'violated') return;
    expect(verdict.column).toBe('BELNR');
    expect(verdict.rowIndex).toBe(1);
    expect(verdict.term).toContain('belnr');
  });

  it('술어를 만족하는 표는 통과시킨다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr FROM zdemo_docs WHERE belnr = '9000000001'",
      rows({ BELNR: '9000000001' }, { BELNR: '9000000001' }),
    );
    expect(verdict.kind).toBe('honoured');
  });

  it('IN 목록 밖의 행을 위반으로 짚는다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr FROM zdemo_docs WHERE belnr IN ( '9000000001', '9000000002' )",
      rows({ BELNR: '9000000002' }, { BELNR: '9000000009' }),
    );
    expect(verdict.kind).toBe('violated');
  });

  it('IN 목록 안이면 통과시킨다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr FROM zdemo_docs WHERE belnr IN ('9000000001','9000000002')",
      rows({ BELNR: '9000000002' }, { BELNR: '9000000001' }),
    );
    expect(verdict.kind).toBe('honoured');
  });

  it('AND로 묶인 항 각각을 본다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr, bukrs FROM zdemo_docs WHERE belnr = '9000000001' AND bukrs = '1000'",
      rows({ BELNR: '9000000001', BUKRS: '2000' }),
    );
    expect(verdict.kind).toBe('violated');
    if (verdict.kind !== 'violated') return;
    expect(verdict.column).toBe('BUKRS');
  });

  it('별칭 접두(`a~belnr`·`a.belnr`)를 컬럼 이름으로 되돌린다', () => {
    for (const predicate of ['a~belnr', 'a.belnr']) {
      const verdict = verifyWherePredicate(
        `SELECT a~belnr FROM zdemo_docs AS a WHERE ${predicate} = '9000000001'`,
        rows({ BELNR: '9000000777' }),
      );
      expect(verdict.kind).toBe('violated');
    }
  });

  it('`<>`는 문자열이 정확히 같을 때만 위반이다', () => {
    expect(
      verifyWherePredicate(
        "SELECT bukrs FROM zdemo_docs WHERE bukrs <> '1000'",
        rows({ BUKRS: '1000' }),
      ).kind,
    ).toBe('violated');
    expect(
      verifyWherePredicate(
        "SELECT bukrs FROM zdemo_docs WHERE bukrs <> '1000'",
        rows({ BUKRS: '2000' }),
      ).kind,
    ).toBe('honoured');
  });

  it('`<>`에 숫자 관용 비교를 쓰지 않는다 — 0채움 값이 거짓 경보가 되면 안 된다', () => {
    // CHAR '0000001000' 은 ABAP에서 '1000'과 같지 않다. 숫자로 접으면 위반처럼
    // 보이지만 실제로는 옳은 행이다.
    expect(
      verifyWherePredicate(
        "SELECT bukrs FROM zdemo_docs WHERE bukrs <> '1000'",
        rows({ BUKRS: '0000001000' }),
      ).kind,
    ).toBe('honoured');
  });

  it('`=`에는 관용 비교를 쓴다 — 0채움·꼬리 공백으로 거짓 경보를 내지 않는다', () => {
    expect(
      verifyWherePredicate(
        "SELECT belnr FROM zdemo_docs WHERE belnr = '1000'",
        rows({ BELNR: '0000001000' }),
      ).kind,
    ).toBe('honoured');
    expect(
      verifyWherePredicate(
        "SELECT bukrs FROM zdemo_docs WHERE bukrs = 'ABC'",
        rows({ BUKRS: 'ABC   ' }),
      ).kind,
    ).toBe('honoured');
  });

  it('숫자 리터럴도 비교한다', () => {
    expect(
      verifyWherePredicate(
        'SELECT gjahr FROM zdemo_docs WHERE gjahr = 2026',
        rows({ GJAHR: '2025' }),
      ).kind,
    ).toBe('violated');
  });

  it('술어 컬럼이 SELECT 목록에 없으면 아무 말도 하지 않는다', () => {
    const verdict = verifyWherePredicate(
      "SELECT bukrs FROM zdemo_docs WHERE belnr = '9000000001'",
      rows({ BUKRS: '1000' }),
    );
    expect(verdict.kind).toBe('unverifiable');
  });

  it('OR가 섞이면 항을 쪼갤 수 없으므로 물러난다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr FROM zdemo_docs WHERE belnr = '9000000001' OR bukrs = '1000'",
      rows({ BELNR: '9000000777' }),
    );
    expect(verdict.kind).toBe('unverifiable');
  });

  it('모델링하지 않은 연산자(LIKE·BETWEEN·부등호)에는 판정하지 않는다', () => {
    for (const predicate of [
      "belnr LIKE '90%'",
      "belnr BETWEEN '1' AND '2'",
      "belnr > '9000000009'",
    ]) {
      const verdict = verifyWherePredicate(
        `SELECT belnr FROM zdemo_docs WHERE ${predicate}`,
        rows({ BELNR: '9000000777' }),
      );
      expect(verdict.kind).toBe('unverifiable');
    }
  });

  it('WHERE가 없으면 검증할 것이 없다', () => {
    expect(
      verifyWherePredicate('SELECT belnr FROM zdemo_docs', rows({ BELNR: '9000000001' })).kind,
    ).toBe('unverifiable');
  });

  it('주석 안에 숨은 WHERE에 속지 않는다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr FROM zdemo_docs /* WHERE belnr = '9000000001' */",
      rows({ BELNR: '9000000777' }),
    );
    expect(verdict.kind).toBe('unverifiable');
  });

  it('WHERE 뒤의 ORDER BY·UP TO는 술어에 섞이지 않는다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr FROM zdemo_docs WHERE belnr = '9000000001' ORDER BY belnr",
      rows({ BELNR: '9000000001' }),
    );
    expect(verdict.kind).toBe('honoured');
  });

  it('하위 질의가 술어에 있으면 물러난다', () => {
    const verdict = verifyWherePredicate(
      'SELECT belnr FROM zdemo_docs WHERE belnr IN ( SELECT belnr FROM zdemo_other )',
      rows({ BELNR: '9000000777' }),
    );
    expect(verdict.kind).toBe('unverifiable');
  });

  it('빈 표는 위반을 만들지 않는다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr FROM zdemo_docs WHERE belnr = '9000000001'",
      [],
    );
    expect(verdict.kind).not.toBe('violated');
  });

  it('nil 셀은 리터럴과 같지 않다', () => {
    const verdict = verifyWherePredicate(
      "SELECT belnr FROM zdemo_docs WHERE belnr = '9000000001'",
      rows({ BELNR: null }),
    );
    expect(verdict.kind).toBe('violated');
  });
});
