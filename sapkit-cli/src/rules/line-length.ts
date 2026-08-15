// line_length — 너무 긴 행.
//
// 길이는 UTF-8 바이트로 재고, 행 끝 CR은 재기 전에 뗀다. 상한을 넘으면 Warning,
// 설정과 무관한 절대 상한 255를 넘으면 Error다. 판정 자리는 늘 그 행의 열 1이다.
//
// 구 구현은 **한 파일에서 10건이 모이면 훑기를 멈춘다.** 11번째 긴 행은 조용히
// 사라진다는 뜻이고, 그 조기 중단까지가 판정이라 그대로 승계한다.

import type { AbapFile } from '../core';
import { byteLength } from './common';
import type { Finding, Rule } from './types';

const KEY = 'line_length';

/** CLI `--max-length`의 기본값이자, 상한을 0 이하로 준 경우의 되돌림 값. */
export const DEFAULT_MAX_LINE_LENGTH = 120;

/** 상한 설정과 무관하게 이 위는 Error다. */
const ABSOLUTE_MAX = 255;

/** 한 파일에서 이만큼 모이면 훑기를 멈춘다 (구 구현 승계). */
const FINDING_CAP = 10;

const TRAILING_CR = /\r+$/;

export function lineLengthRule(maxLength: number = DEFAULT_MAX_LINE_LENGTH): Rule {
  const max = maxLength > 0 ? maxLength : DEFAULT_MAX_LINE_LENGTH;

  return {
    key: KEY,
    run(file: AbapFile): Finding[] {
      const findings: Finding[] = [];

      const rows = file.getRawRows();
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (row === undefined) continue;

        const width = byteLength(row.replace(TRAILING_CR, ''));
        if (width > ABSOLUTE_MAX) {
          findings.push({
            rule: KEY,
            row: i + 1,
            col: 1,
            severity: 'Error',
            message: `Line runs to ${width} bytes — ${ABSOLUTE_MAX} is the hard limit`,
          });
        } else if (width > max) {
          findings.push({
            rule: KEY,
            row: i + 1,
            col: 1,
            severity: 'Warning',
            message: `Line runs to ${width} bytes — keep it within ${max}`,
          });
        }

        if (findings.length >= FINDING_CAP) break;
      }

      return findings;
    },
  };
}
