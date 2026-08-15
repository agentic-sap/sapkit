// 규칙이 내놓는 판정과 규칙 자체의 모양.
//
// `rule`·`row`·`col`·`severity`는 **기능 계약**이다 — 판정 대조에 이 값이 그대로
// 실린다. `message`는 계약이 아니다(대조에서 빠져 있다). 사람이 읽으라고 붙이는
// 것이므로 문구는 이 검사기가 새로 쓴다.

import type { AbapFile } from '../core';

/** 판정 등급. 구 검사기는 `Information`도 형식상 가졌으나 규칙 13종은 쓰지 않는다. */
export type Severity = 'Error' | 'Warning';

/** 규칙이 잡아낸 자리 한 곳. */
export interface Finding {
  /** 규칙 키 (`line_length` 등). */
  readonly rule: string;
  /** 1부터 세는 행. */
  readonly row: number;
  /** 1부터 세는 열 — 그 줄 안의 **UTF-8 바이트** 자리다. */
  readonly col: number;
  readonly severity: Severity;
  readonly message: string;
}

/** 파일 하나를 훑어 판정을 내놓는 규칙. */
export interface Rule {
  readonly key: string;
  run(file: AbapFile): Finding[];
}
