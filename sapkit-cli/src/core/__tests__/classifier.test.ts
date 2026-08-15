// 문장 유형 분류기 단위 시험.
//
// 이 파일이 계약의 정본이다: 유형 이름은 판정 대조에 그대로 들어가므로 철자 하나도
// 바꿀 수 없다. 아래 표의 기대값은 전부 구 vsp 검사기(Go)를 실제로 돌려 실측했다.

import { AbapFile, STATEMENT_TYPES, registeredStatementTypes } from '../index';
import type { StatementType } from '../index';

function types(source: string): string[] {
  return new AbapFile('t.abap', source).getStatements().map((s) => s.type);
}

function type1(source: string): string {
  const t = types(source);
  if (t.length !== 1) throw new Error(`문장이 1개가 아니다 (${t.length}): ${source}`);
  return t[0] as string;
}

/** 등록된 유형별 대표 사례. 왼쪽이 기대 유형, 오른쪽이 최소 원문. */
const PER_TYPE: Array<[StatementType, string]> = [
  // 단일 키워드 문장
  ['EndIf', 'ENDIF.'],
  ['EndLoop', 'ENDLOOP.'],
  ['EndDo', 'ENDDO.'],
  ['EndWhile', 'ENDWHILE.'],
  ['EndCase', 'ENDCASE.'],
  ['EndTry', 'ENDTRY.'],
  ['EndMethod', 'ENDMETHOD.'],
  ['EndClass', 'ENDCLASS.'],
  ['EndForm', 'ENDFORM.'],
  ['EndFunction', 'ENDFUNCTION.'],
  ['EndInterface', 'ENDINTERFACE.'],
  ['EndModule', 'ENDMODULE.'],
  ['Else', 'ELSE.'],
  ['Try', 'TRY.'],
  ['Return', 'RETURN.'],
  ['Continue', 'CONTINUE.'],
  ['Exit', 'EXIT.'],
  // 고정 접두부 + 나머지
  ['Report', 'REPORT zfoo.'],
  ['Include', 'INCLUDE zfoo_top.'],
  ['If', 'IF lv_a = 1.'],
  ['ElseIf', 'ELSEIF lv_a = 2.'],
  ['While', 'WHILE lv_a < 3.'],
  ['Do', 'DO 5 TIMES.'],
  ['Case', 'CASE lv_a.'],
  ['WhenOthers', 'WHEN OTHERS.'],
  ['When', 'WHEN 1.'],
  ['Loop', 'LOOP AT lt_x INTO ls_x.'],
  ['Catch', 'CATCH cx_root.'],
  ['Raise', 'RAISE EXCEPTION TYPE cx_root.'],
  ['Commit', 'COMMIT WORK.'],
  ['LeaveToTransaction', "LEAVE TO TRANSACTION 'SE38'."],
  ['Leave', 'LEAVE PROGRAM.'],
  ['Submit', 'SUBMIT zfoo AND RETURN.'],
  ['Sort', 'SORT lt_x BY f1.'],
  ['Assign', 'ASSIGN lv_a TO <fs>.'],
  ['Unassign', 'UNASSIGN <fs>.'],
  ['Clear', 'CLEAR lv_a.'],
  ['Refresh', 'REFRESH lt_x.'],
  ['Append', 'APPEND ls_x TO lt_x.'],
  ['Condense', 'CONDENSE lv_a.'],
  ['Translate', 'TRANSLATE lv_a TO UPPER CASE.'],
  ['Replace', "REPLACE 'a' IN lv_b WITH 'c'."],
  ['Find', "FIND 'a' IN lv_b."],
  ['Split', "SPLIT lv_a AT ',' INTO TABLE lt_x."],
  ['Concatenate', 'CONCATENATE lv_a lv_b INTO lv_c.'],
  ['Write', 'WRITE lv_a.'],
  ['Message', "MESSAGE 'hi' TYPE 'I'."],
  ['Add', 'ADD 1 TO lv_a.'],
  ['Perform', 'PERFORM sub.'],
  ['SelectOption', 'SELECT-OPTIONS so_a FOR lv_a.'],
  ['Select', 'SELECT * FROM t INTO TABLE lt_x.'],
  // 선언
  ['Data', 'DATA lv_x TYPE i.'],
  ['TypeBegin', 'TYPES BEGIN OF ty_s.'],
  ['TypeEnd', 'TYPES END OF ty_s.'],
  ['Type', 'TYPES ty_a TYPE i.'],
  ['Constant', 'CONSTANTS lc_a TYPE i VALUE 1.'],
  // 클래스·인터페이스
  ['ClassDeferred', 'CLASS zcl_a DEFINITION DEFERRED.'],
  ['ClassDefinition', 'CLASS zcl_a DEFINITION PUBLIC FINAL.'],
  ['ClassImplementation', 'CLASS zcl_a IMPLEMENTATION.'],
  ['ClassData', 'CLASS-DATA gv_a TYPE i.'],
  ['MethodDef', 'CLASS-METHODS meth.'],
  ['MethodImplementation', 'METHOD meth.'],
  ['Interface', 'INTERFACE zif_a PUBLIC.'],
  ['InterfaceDef', 'INTERFACES zif_a.'],
  ['Form', 'FORM sub.'],
  ['FunctionModule', 'FUNCTION zfoo.'],
  ['FunctionPool', 'FUNCTION-POOL zfg.'],
  ['Public', 'PUBLIC SECTION.'],
  ['Private', 'PRIVATE SECTION.'],
  ['Protected', 'PROTECTED SECTION.'],
  // 생성·호출
  ['CreateObject', 'CREATE OBJECT lo_a.'],
  ['CreateData', 'CREATE DATA lr_a TYPE i.'],
  ['CallFunction', "CALL FUNCTION 'ZFOO'."],
  ['CallTransaction', "CALL TRANSACTION 'SE38'."],
  ['CallTransformation', 'CALL TRANSFORMATION id SOURCE a = b.'],
  ['CallScreen', 'CALL SCREEN 100.'],
  ['CallSelectionScreen', 'CALL SELECTION-SCREEN 1000.'],
  // 내부 테이블·텍스트풀
  ['ReadTable', 'READ TABLE lt_x INTO ls_x INDEX 1.'],
  ['ReadTextpool', "READ TEXTPOOL 'ZFOO' INTO lt_x."],
  ['InsertTextpool', "INSERT TEXTPOOL 'ZFOO' FROM lt_x."],
  ['InsertInternal', 'INSERT ls_x INTO TABLE lt_x.'],
  ['DeleteInternal', 'DELETE lt_x INDEX 1.'],
  // 화면·선택화면
  ['FieldSymbol', 'FIELD-SYMBOLS <fs> TYPE i.'],
  ['Parameter', 'PARAMETERS p_a TYPE i.'],
  ['SelectionScreen', 'SELECTION-SCREEN BEGIN OF BLOCK b1.'],
  ['SetPFStatus', "SET PF-STATUS 'S100'."],
  ['SetTitlebar', "SET TITLEBAR 'T100'."],
  ['GetTime', 'GET TIME.'],
  ['Module', 'MODULE m1 OUTPUT.'],
  ['StartOfSelection', 'START-OF-SELECTION.'],
  ['NativeSQL', 'DECLARE c CURSOR FOR SELECT.'],
  // 되돌림 matcher
  ['Call', 'lo_a->meth( ).'],
  ['Move', 'lv_a = 1.'],
  // 분류기를 거치지 않는 두 유형
  ['Comment', '* hi'],
  ['Empty', '.'],
];

describe('classify — 등록된 유형 전종', () => {
  it.each(PER_TYPE)('%s', (expected, source) => {
    expect(type1(source)).toBe(expected);
  });

  it('대표 사례가 등록 유형을 빠짐없이 덮는다', () => {
    const covered = new Set(PER_TYPE.map(([t]) => t));
    const missing = registeredStatementTypes().filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it('실측한 유형 수: 등록 93종 + 분류기 밖 3종(Unknown·Comment·Empty)', () => {
    expect(registeredStatementTypes().length).toBe(93);
    expect(STATEMENT_TYPES.length).toBe(96);
  });
});

describe('classify — 같은 키워드 안의 우선순위', () => {
  it('WHEN OTHERS가 WHEN보다 먼저 잡힌다', () => {
    expect(type1('WHEN OTHERS.')).toBe('WhenOthers');
    expect(type1('WHEN 1.')).toBe('When');
  });

  it('SELECT-OPTIONS가 SELECT보다 먼저 잡힌다', () => {
    expect(type1('SELECT-OPTIONS so_a FOR lv_a.')).toBe('SelectOption');
    expect(type1('SELECT SINGLE * FROM t INTO ls_x.')).toBe('Select');
  });

  it('LEAVE TO TRANSACTION이 LEAVE보다 먼저 잡힌다', () => {
    expect(type1("LEAVE TO TRANSACTION 'SE38'.")).toBe('LeaveToTransaction');
    expect(type1('LEAVE LIST-PROCESSING.')).toBe('Leave');
  });

  it('CLASS 계열은 DEFERRED → DEFINITION → IMPLEMENTATION 순', () => {
    expect(type1('CLASS zcl_a DEFINITION DEFERRED.')).toBe('ClassDeferred');
    expect(type1('CLASS zcl_a DEFINITION.')).toBe('ClassDefinition');
    expect(type1('CLASS zcl_a IMPLEMENTATION.')).toBe('ClassImplementation');
  });

  it('METHODS와 CLASS-METHODS는 같은 MethodDef로 모인다', () => {
    expect(type1('METHODS meth IMPORTING iv_a TYPE i.')).toBe('MethodDef');
    expect(type1('CLASS-METHODS meth.')).toBe('MethodDef');
  });

  it('INTERFACE는 PUBLIC이 붙든 안 붙든 Interface', () => {
    expect(type1('INTERFACE zif_a PUBLIC.')).toBe('Interface');
    expect(type1('INTERFACE zif_a.')).toBe('Interface');
  });

  it('TYPES 체인은 BEGIN/필드/END로 각각 갈린다', () => {
    expect(types('TYPES: BEGIN OF ty_s, f1 TYPE i, END OF ty_s.')).toEqual([
      'TypeBegin',
      'Type',
      'TypeEnd',
    ]);
  });
});

describe('classify — Call과 Move의 갈림', () => {
  it('화살표만 있고 최상위 등호가 없으면 Call', () => {
    expect(type1('lo_a->meth( ).')).toBe('Call');
    expect(type1('CALL METHOD lo_a->meth.')).toBe('Call');
  });

  it('최상위 등호가 있으면 화살표가 있어도 Move', () => {
    expect(type1('lv_a = lo_b->meth( ).')).toBe('Move');
    expect(type1('lv_a = foo( 1 ).')).toBe('Move');
    expect(type1('CALL METHOD lo_a->meth\n  EXPORTING iv_a = 1.')).toBe('Move');
  });

  it('되보내기 대입도 Move', () => {
    expect(type1('lo_a ?= lo_b.')).toBe('Move');
  });

  it('알아볼 수 없는 문장은 Unknown이 아니라 Move로 떨어진다 (구 구현 승계)', () => {
    expect(type1('FOOBAR BAZ QUX.')).toBe('Move');
    expect(type1('AT SELECTION-SCREEN.')).toBe('Move');
    expect(type1('DATA.')).toBe('Move');
  });
});

describe('classify — 잡다한 승계 동작', () => {
  it('키워드는 대소문자를 가리지 않는다', () => {
    expect(type1('data lv_x type i.')).toBe('Data');
  });

  it('마침표가 없어도 분류된다', () => {
    expect(type1('ENDMETHOD')).toBe('EndMethod');
    expect(type1('DATA lv_x TYPE i')).toBe('Data');
  });

  it('BY DATABASE가 붙은 METHOD도 MethodImplementation', () => {
    expect(types('METHOD m BY DATABASE PROCEDURE.')).toEqual(['MethodImplementation']);
  });

  it('AMDP 본문은 NativeSQL, 닫는 ENDMETHOD는 EndMethod', () => {
    expect(types('METHOD m BY DATABASE PROCEDURE.\nselect 1;\nENDMETHOD.')).toEqual([
      'MethodImplementation',
      'NativeSQL',
      'EndMethod',
    ]);
  });

  it('한 파일 안의 여러 문장을 순서대로 분류한다', () => {
    expect(types('CLASS zcl_a DEFINITION.\nPUBLIC SECTION.\nENDCLASS.')).toEqual([
      'ClassDefinition',
      'Public',
      'EndClass',
    ]);
    expect(types("IF lv_a = 1.\n  WRITE 'x'.\nENDIF.")).toEqual(['If', 'Write', 'EndIf']);
  });

  it('꼬리 주석은 앞 문장과 분리된다', () => {
    expect(types('ENDCLASS. " trailing')).toEqual(['EndClass', 'Comment']);
  });
});
