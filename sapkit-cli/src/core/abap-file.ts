// 파일 객체 — 규칙과 CLI가 보는 유일한 표면.
//
// 만드는 순간 어휘 분석 → 문장 분할 → 유형 분류를 끝낸다. 규칙은 원문 행·토큰·문장
// 셋 중 필요한 것만 꺼내 쓴다.

import { tokenize } from './lexer';
import type { Token } from './token';
import { classifyStatements } from './classifier';
import { splitStatements } from './statement';
import type { Statement } from './statement';

export class AbapFile {
  readonly filename: string;
  /** 손대지 않은 원문. */
  readonly raw: string;

  private readonly tokens: readonly Token[];
  private readonly statements: readonly Statement[];
  private rawRows: readonly string[] | null = null;

  constructor(filename: string, source: string) {
    this.filename = filename;
    this.raw = source;
    this.tokens = tokenize(source);
    this.statements = splitStatements(this.tokens);
    classifyStatements(this.statements);
  }

  /**
   * 원문 행. **줄바꿈으로만 자른다** — CR은 남는다(토큰 쪽만 CR을 뗀다).
   * 구 구현 승계이며, 행 길이를 재는 규칙은 이 차이를 알고 써야 한다.
   */
  getRawRows(): readonly string[] {
    if (this.rawRows === null) this.rawRows = this.raw.split('\n');
    return this.rawRows;
  }

  getTokens(): readonly Token[] {
    return this.tokens;
  }

  /** 유형이 이미 확정된 문장들. */
  getStatements(): readonly Statement[] {
    return this.statements;
  }
}
