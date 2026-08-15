// select_star — 필드 목록 없이 전부 읽는 SELECT.
//
// `SELECT` 뒤의 `SINGLE`·`DISTINCT`는 건너뛰고, 그 다음 토큰이 별표일 때만 잡는다.
// 그래서 `COUNT( * )`는 첫 필드가 별표가 아니라 조용하다.

import type { AbapFile } from '../core';
import { isCodeStatement, upperSimple } from './common';
import type { Finding, Rule } from './types';

const KEY = 'select_star';

/** 첫 필드 앞에 놓일 수 있어 건너뛰는 낱말. */
const SKIPPED_BEFORE_FIELDS: ReadonlySet<string> = new Set(['SINGLE', 'DISTINCT']);

export function selectStarRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt)) continue;

        const first = stmt.tokens[0];
        if (first === undefined || upperSimple(first.str) !== 'SELECT') continue;

        let i = 1;
        while (i < stmt.tokens.length) {
          const token = stmt.tokens[i];
          if (token === undefined || !SKIPPED_BEFORE_FIELDS.has(upperSimple(token.str))) break;
          i += 1;
        }

        const field = stmt.tokens[i];
        if (field === undefined || field.str !== '*') continue;

        findings.push({
          rule: KEY,
          row: field.row,
          col: field.col,
          severity: 'Warning',
          message: 'Name the columns you need instead of reading the whole row',
        });
      }

      return findings;
    },
  };
}
