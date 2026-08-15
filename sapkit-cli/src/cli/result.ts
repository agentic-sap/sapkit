// 명령 하나가 내놓는 것 — 흘려 쓴 글이 아니라 **값**이다.
//
// 명령은 `process.stdout`에 직접 쓰지 않는다. 문자열 둘과 exit code를 돌려주고,
// 진입점(`entry.ts`)만이 프로세스 표면에 닿는다. 그래야 명령을 프로세스 없이도
// 부를 수 있고, stdout/stderr가 어디로 갈리는지가 코드에 드러난다.

export interface CommandResult {
  /** 기계가 먹는 것 — 판정 줄·JSON. */
  readonly stdout: string;
  /** 사람이 읽는 것 — 요약·오류. */
  readonly stderr: string;
  readonly code: number;
}

/** 통과. */
export const EXIT_OK = 0;
/** 결함을 찾았다 (lint의 Error 심각도 · check의 미해결 Z 인클루드). */
export const EXIT_FINDINGS = 1;
/** 사용·입력 오류 — 판정을 내지 못했다. */
export const EXIT_USAGE = 2;
