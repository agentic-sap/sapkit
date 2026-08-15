// analyze 표면에만 등록되는 규칙 5종 단위 시험 — select_star · hardcoded_credentials ·
// catch_cx_root · commit_in_loop · dynamic_call_no_try.

import { AbapFile } from '../../core';
import {
  catchCxRootRule,
  commitInLoopRule,
  dynamicCallNoTryRule,
  hardcodedCredentialsRule,
  selectStarRule,
} from '../index';
import type { Rule } from '../index';

/** 판정을 [규칙, 행, 열, 심각도]로 편다 — 문구는 계약이 아니므로 대조하지 않는다. */
function shape(rule: Rule, source: string): Array<[string, number, number, string]> {
  return rule.run(new AbapFile('t.abap', source)).map((f) => [f.rule, f.row, f.col, f.severity]);
}

describe('select_star', () => {
  const rule = selectStarRule();

  it('별표 자리에서 Warning을 낸다', () => {
    expect(shape(rule, 'SELECT * FROM zdemo_tab INTO TABLE lt_rows.')).toEqual([
      ['select_star', 1, 8, 'Warning'],
    ]);
  });

  it('SINGLE·DISTINCT는 건너뛰고 그 다음을 본다', () => {
    expect(shape(rule, 'SELECT SINGLE * FROM zdemo_tab INTO ls_row.')).toEqual([
      ['select_star', 1, 15, 'Warning'],
    ]);
    expect(shape(rule, 'SELECT DISTINCT * FROM zdemo_tab INTO TABLE lt_rows.')).toEqual([
      ['select_star', 1, 17, 'Warning'],
    ]);
  });

  it('명시 필드 목록은 조용하다', () => {
    expect(shape(rule, 'SELECT id name FROM zdemo_tab INTO TABLE lt_rows.')).toEqual([]);
  });

  it('COUNT( * )는 첫 필드가 별표가 아니라 잡히지 않는다', () => {
    expect(shape(rule, 'SELECT COUNT( * ) FROM zdemo_tab INTO lv_count.')).toEqual([]);
  });

  it('SELECT로 시작하지 않는 문장은 보지 않는다', () => {
    expect(shape(rule, "WRITE '*'.")).toEqual([]);
  });
});

describe('hardcoded_credentials', () => {
  const rule = hardcodedCredentialsRule();

  it('자격증명 이름에 문자열 리터럴을 대입하면 Error를 낸다', () => {
    expect(shape(rule, "lv_password = 'PLACEHOLDER_NOT_A_SECRET'.")).toEqual([
      ['hardcoded_credentials', 1, 15, 'Error'],
    ]);
  });

  it('문자열 템플릿 대입도 잡는다', () => {
    expect(shape(rule, 'lv_auth_token = |PLACEHOLDER_NOT_A_SECRET|.')).toEqual([
      ['hardcoded_credentials', 1, 17, 'Error'],
    ]);
  });

  it('자격증명 어휘가 이름에 들어 있기만 하면 된다', () => {
    expect(shape(rule, "lv_api_key_new = 'PLACEHOLDER_NOT_A_SECRET'.")).toEqual([
      ['hardcoded_credentials', 1, 18, 'Error'],
    ]);
  });

  it('우변이 변수면 잡지 않는다', () => {
    expect(shape(rule, 'lv_password = lv_input.')).toEqual([]);
  });

  it('아주 짧은 리터럴은 초기값으로 보고 넘어간다', () => {
    expect(shape(rule, "lv_secret = ''.")).toEqual([]);
    expect(shape(rule, "lv_secret = 'a'.")).toEqual([]);
    expect(shape(rule, "lv_secret = 'ab'.")).toEqual([['hardcoded_credentials', 1, 13, 'Error']]);
  });

  it('리터럴 길이도 바이트로 잰다 (구 구현 승계 — 글자로 재면 갈린다)', () => {
    // 'ü'는 따옴표까지 글자로 3, 바이트로 4다. 바이트로 재야 잡힌다.
    expect(shape(rule, "lv_secret = 'ü'.")).toEqual([['hardcoded_credentials', 1, 13, 'Error']]);
  });

  it('자격증명 어휘가 아닌 이름은 보지 않는다', () => {
    expect(shape(rule, "lv_display_name = 'PLACEHOLDER_NOT_A_SECRET'.")).toEqual([]);
  });
});

describe('catch_cx_root', () => {
  const rule = catchCxRootRule();

  it('너무 넓은 예외 클래스를 그 자리에서 Warning으로 잡는다', () => {
    expect(shape(rule, 'CATCH cx_root INTO lr_err.')).toEqual([['catch_cx_root', 1, 7, 'Warning']]);
    expect(shape(rule, 'CATCH cx_static_check.')).toEqual([['catch_cx_root', 1, 7, 'Warning']]);
    expect(shape(rule, 'CATCH cx_dynamic_check.')).toEqual([['catch_cx_root', 1, 7, 'Warning']]);
    expect(shape(rule, 'CATCH cx_no_check.')).toEqual([['catch_cx_root', 1, 7, 'Warning']]);
  });

  it('한 CATCH에 여럿이 나열돼도 첫 건만 낸다', () => {
    expect(shape(rule, 'CATCH cx_root cx_no_check.')).toEqual([['catch_cx_root', 1, 7, 'Warning']]);
  });

  it('구체 예외만 잡으면 조용하다', () => {
    expect(shape(rule, 'CATCH cx_sy_zerodivide INTO lr_err.')).toEqual([]);
    expect(shape(rule, 'CATCH zcx_demo_error.')).toEqual([]);
  });

  it('CATCH 문이 아니면 보지 않는다', () => {
    expect(shape(rule, 'DATA lr_err TYPE REF TO cx_root.')).toEqual([]);
  });
});

describe('commit_in_loop', () => {
  const rule = commitInLoopRule();

  it('LOOP·DO·WHILE 안의 COMMIT WORK를 Error로 잡는다', () => {
    expect(shape(rule, 'LOOP AT lt_rows INTO ls_row.\n  COMMIT WORK.\nENDLOOP.')).toEqual([
      ['commit_in_loop', 2, 3, 'Error'],
    ]);
    expect(shape(rule, 'DO 3 TIMES.\n  COMMIT WORK AND WAIT.\nENDDO.')).toEqual([
      ['commit_in_loop', 2, 3, 'Error'],
    ]);
    expect(shape(rule, 'WHILE lv_i < 3.\n  COMMIT WORK.\nENDWHILE.')).toEqual([
      ['commit_in_loop', 2, 3, 'Error'],
    ]);
  });

  it('루프를 빠져나온 뒤의 COMMIT WORK는 조용하다', () => {
    expect(shape(rule, 'LOOP AT lt_rows INTO ls_row.\nENDLOOP.\nCOMMIT WORK.')).toEqual([]);
  });

  it('중첩 루프의 안쪽 깊이를 센다', () => {
    const source = [
      'LOOP AT lt_a INTO ls_a.',
      '  LOOP AT lt_b INTO ls_b.',
      '  ENDLOOP.',
      '  COMMIT WORK.',
      'ENDLOOP.',
    ].join('\n');
    expect(shape(rule, source)).toEqual([['commit_in_loop', 4, 3, 'Error']]);
  });

  it('WORK가 뒤따르지 않는 COMMIT은 보지 않는다', () => {
    expect(shape(rule, 'LOOP AT lt_rows INTO ls_row.\n  COMMIT.\nENDLOOP.')).toEqual([]);
  });
});

describe('dynamic_call_no_try', () => {
  const rule = dynamicCallNoTryRule();

  it('TRY 밖의 동적 호출을 문장 첫 자리에서 Warning으로 잡는다', () => {
    expect(shape(rule, 'CALL FUNCTION lv_fm_name.')).toEqual([['dynamic_call_no_try', 1, 1, 'Warning']]);
    expect(shape(rule, 'CALL METHOD (lv_class_name)=>run.')).toEqual([
      ['dynamic_call_no_try', 1, 1, 'Warning'],
    ]);
  });

  it('문자열 리터럴로 이름을 준 호출은 정적이라 조용하다', () => {
    expect(shape(rule, "CALL FUNCTION 'ZDEMO_FM'.")).toEqual([]);
  });

  it('정적 메서드 호출은 조용하다', () => {
    expect(shape(rule, 'CALL METHOD lo_obj->run.')).toEqual([]);
  });

  it('TRY로 감싸면 조용하다', () => {
    expect(shape(rule, 'TRY.\n    CALL FUNCTION lv_fm_name.\n  CATCH cx_sy_dyn_call_error.\nENDTRY.')).toEqual(
      [],
    );
  });

  it('ENDTRY 뒤로 나오면 다시 잡는다', () => {
    expect(shape(rule, 'TRY.\nENDTRY.\nCALL FUNCTION lv_fm_name.')).toEqual([
      ['dynamic_call_no_try', 3, 1, 'Warning'],
    ]);
  });
});
