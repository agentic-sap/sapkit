// hardcoded_credentials — 자격증명으로 보이는 이름에 리터럴을 박아 넣은 대입.
//
// 문장에서 첫 `=`를 찾아 왼쪽을 이름, 오른쪽을 값으로 본다. 이름이 자격증명 어휘를
// 품고 값이 문자열/템플릿 리터럴이면 잡는다. 판정 자리는 이름이 아니라 **값**이다.
//
// 아주 짧은 리터럴(따옴표까지 3바이트 이하)은 초기값으로 보고 넘어간다. 길이는
// 글자가 아니라 **바이트**로 잰다 — 구 구현이 Go 문자열 길이를 썼기 때문이다.

import { TokenType } from '../core';
import type { AbapFile } from '../core';
import { byteLength, isCodeStatement, lowerSimple } from './common';
import type { Finding, Rule } from './types';

const KEY = 'hardcoded_credentials';

/** 이름에 이 중 하나라도 들어 있으면 자격증명으로 본다. */
const CREDENTIAL_WORDS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'auth_token',
  'access_token',
  'bearer_token',
  'refresh_token',
  'api_token',
];

/** 값 자리에 놓였을 때 「박아 넣은 리터럴」로 보는 토큰 유형. */
const LITERAL_TYPES: ReadonlySet<TokenType> = new Set<TokenType>([
  TokenType.StringToken,
  TokenType.StringTemplate,
  TokenType.StringTemplateBegin,
]);

/** 이 바이트 수 이하의 리터럴은 초기값으로 본다 (따옴표를 포함한 길이다). */
const TRIVIAL_LITERAL_BYTES = 3;

export function hardcodedCredentialsRule(): Rule {
  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      for (const stmt of file.getStatements()) {
        if (!isCodeStatement(stmt) || stmt.tokens.length < 3) continue;

        const assign = stmt.tokens.findIndex((token, i) => i >= 1 && token.str === '=');
        if (assign < 1 || assign >= stmt.tokens.length - 1) continue;

        const name = stmt.tokens[assign - 1];
        const value = stmt.tokens[assign + 1];
        if (name === undefined || value === undefined) continue;
        if (!looksLikeCredential(name.str)) continue;
        if (!LITERAL_TYPES.has(value.type)) continue;
        if (byteLength(value.str) <= TRIVIAL_LITERAL_BYTES) continue;

        findings.push({
          rule: KEY,
          row: value.row,
          col: value.col,
          severity: 'Error',
          message: `${name.str} is given a literal value — keep credentials out of the source`,
        });
      }

      return findings;
    },
  };
}

function looksLikeCredential(name: string): boolean {
  const lower = lowerSimple(name);
  return CREDENTIAL_WORDS.some((word) => lower.includes(word));
}
