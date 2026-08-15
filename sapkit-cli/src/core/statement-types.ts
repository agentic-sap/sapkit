// 문장 유형 이름의 정본.
//
// **이 글자들은 계약이다** — 판정 대조에 그대로 실리므로 철자 하나도 바꾸지 않는다.
// 목록은 구 vsp 검사기의 분류기 등록표를 세어 옮긴 것이고(등록 93종), 여기에
// 분류기를 거치지 않는 3종(Unknown·Comment·Empty)을 더해 96종이다.
//
// - `Comment`·`Empty`는 문장 분할 단계에서 확정된다.
// - `Unknown`은 분할 직후의 초기값이다. 분류기는 마지막에 `Move`로 떨어뜨리므로
//   분류를 마친 문장에는 남지 않는다 (구 구현 실측 — 되돌림 matcher가 토큰 1개
//   이상이면 무조건 잡는다).
// - `NativeSQL`은 두 곳에서 나온다: `DECLARE`로 시작하는 문장, 그리고
//   `METHOD ... BY DATABASE` 뒤의 AMDP 본문.

export const STATEMENT_TYPES = [
  // 단일 키워드
  'EndIf',
  'EndLoop',
  'EndDo',
  'EndWhile',
  'EndCase',
  'EndTry',
  'EndMethod',
  'EndClass',
  'EndForm',
  'EndFunction',
  'EndInterface',
  'EndModule',
  'Else',
  'Try',
  'Return',
  'Continue',
  'Exit',
  // 고정 접두부 + 나머지
  'Report',
  'Include',
  'If',
  'ElseIf',
  'While',
  'Do',
  'Case',
  'WhenOthers',
  'When',
  'Loop',
  'Catch',
  'Raise',
  'Commit',
  'LeaveToTransaction',
  'Leave',
  'Submit',
  'Sort',
  'Assign',
  'Unassign',
  'Clear',
  'Refresh',
  'Append',
  'Condense',
  'Translate',
  'Replace',
  'Find',
  'Split',
  'Concatenate',
  'Write',
  'Message',
  'Add',
  'Perform',
  'SelectOption',
  'Select',
  // 선언
  'Data',
  'TypeBegin',
  'TypeEnd',
  'Type',
  'Constant',
  // 클래스·인터페이스
  'ClassDeferred',
  'ClassDefinition',
  'ClassImplementation',
  'ClassData',
  'MethodDef',
  'MethodImplementation',
  'Interface',
  'InterfaceDef',
  'Form',
  'FunctionModule',
  'FunctionPool',
  'Public',
  'Private',
  'Protected',
  // 생성·호출
  'CreateObject',
  'CreateData',
  'CallFunction',
  'CallTransaction',
  'CallTransformation',
  'CallScreen',
  'CallSelectionScreen',
  // 내부 테이블·텍스트풀
  'ReadTable',
  'ReadTextpool',
  'InsertTextpool',
  'InsertInternal',
  'DeleteInternal',
  // 화면·선택화면·기타
  'FieldSymbol',
  'Parameter',
  'SelectionScreen',
  'SetPFStatus',
  'SetTitlebar',
  'GetTime',
  'Module',
  'StartOfSelection',
  'NativeSQL',
  // 되돌림 matcher
  'Call',
  'Move',
  // 분류기를 거치지 않는 3종
  'Unknown',
  'Comment',
  'Empty',
] as const;

export type StatementType = (typeof STATEMENT_TYPES)[number];
