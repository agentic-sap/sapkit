// CLI를 **진짜 프로세스로** 띄워 exit 계약과 stdout/stderr 분리를 확인한다.
//
// spec §2의 exit 계약을 양극으로 건다: 통과 0 · 결함 비-0 · 사용/입력 오류 비-0.
// lint의 "Warning만이면 0"은 구 계약이므로 **통과 쪽**에 걸어 둔다.

import { readFileSync } from 'node:fs';
import { corpus, runCli } from './run-cli';

const CLEAN = corpus('synthetic/rules/colon_missing_space_neg.abap'); // 판정 0건
const ERRORS = corpus('synthetic/rules/empty_statement_pos.abap'); // 기준 exit_code 1
const WARNINGS = corpus('synthetic/rules/line_length_pos.abap'); // 기준 exit_code 0 · 판정 있음
const QUOTED = corpus('synthetic/statements/lexical_forms.abap'); // 토큰에 따옴표가 들어간다
const MISSING = corpus('synthetic/rules/no_such_file.abap');

describe('lint — exit 계약 (양극)', () => {
  it('깨끗한 파일은 0이고 stdout이 비어 있다', () => {
    const run = runCli(['lint', CLEAN]);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr.length).toBeGreaterThan(0);
  });

  it('Error 심각도가 있으면 1이다', () => {
    const run = runCli(['lint', ERRORS]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('E [empty_statement]');
  });

  it('Warning만 있으면 0이다 (구 계약)', () => {
    const run = runCli(['lint', WARNINGS]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('W [line_length]');
    expect(run.stdout).not.toContain(' E [');
  });

  it('판정은 stdout · 요약은 stderr로 갈라진다', () => {
    const run = runCli(['lint', WARNINGS]);
    expect(run.stdout.split('\n').filter((l) => l !== '').length).toBeGreaterThan(0);
    expect(run.stderr).toMatch(/\d/);
  });

  it('한 줄 형식은 `파일:행:열: W|E [키] 메시지`다', () => {
    const run = runCli(['lint', WARNINGS]);
    for (const line of run.stdout.split('\n').filter((l) => l !== '')) {
      expect(line).toMatch(/^.+:\d+:\d+: [WE] \[[a-z_]+\] .+$/);
    }
  });

  it('--max-length로 상한을 옮길 수 있다', () => {
    expect(runCli(['lint', '--max-length', '500', WARNINGS]).stdout).not.toContain('[line_length]');
    expect(runCli(['lint', '--max-length=500', WARNINGS]).stdout).not.toContain('[line_length]');
  });

  it('--stdin은 진짜 파이프로 동작한다 (구현이 Windows에서 깨지던 자리)', () => {
    const source = readFileSync(ERRORS, 'utf8');
    const run = runCli(['lint', '--stdin'], source);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('E [empty_statement]');
  });

  it('없는 파일은 비-0이고 stdout에 아무것도 흘리지 않는다', () => {
    const run = runCli(['lint', MISSING]);
    expect(run.code).not.toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr.length).toBeGreaterThan(0);
  });

  it('모르는 깃발은 비-0이다', () => {
    expect(runCli(['lint', '--nope', CLEAN]).code).not.toBe(0);
  });

  it('입력이 없으면 비-0이다', () => {
    expect(runCli(['lint']).code).not.toBe(0);
  });

  it('파일과 --stdin을 함께 주면 비-0이다', () => {
    expect(runCli(['lint', '--stdin', CLEAN]).code).not.toBe(0);
  });

  it('구 vsp의 `<TYPE> <NAME>` 인자를 승계하지 않는다 (SAP-fetch 경로 없음)', () => {
    const run = runCli(['lint', 'PROG', 'ZTEST_REPORT']);
    expect(run.code).not.toBe(0);
    expect(run.stdout).toBe('');
  });
});

describe('parse — 읽히면 0', () => {
  it('기본 형식은 text이고 0으로 끝난다', () => {
    const run = runCli(['parse', CLEAN]);
    expect(run.code).toBe(0);
    expect(run.stdout.length).toBeGreaterThan(0);
  });

  it('결함이 있는 파일도 0이다 (문법 합격 판정기가 아니다)', () => {
    expect(runCli(['parse', ERRORS]).code).toBe(0);
  });

  it('--format json은 정상 JSON을 낸다', () => {
    const run = runCli(['parse', '--format', 'json', CLEAN]);
    expect(run.code).toBe(0);
    const parsed: unknown = JSON.parse(run.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    const first = (parsed as { type: string; line: number; tokens: string[] }[])[0];
    expect(typeof first?.type).toBe('string');
    expect(typeof first?.line).toBe('number');
    expect(Array.isArray(first?.tokens)).toBe(true);
  });

  it('토큰에 따옴표가 있어도 JSON이 깨지지 않는다 (구 이스케이프 결함 미승계)', () => {
    const run = runCli(['parse', '--format', 'json', QUOTED]);
    expect(run.code).toBe(0);
    expect(() => JSON.parse(run.stdout)).not.toThrow();
    expect(run.stdout).toContain('\\"');
  });

  it('--format summary는 실행마다 같은 순서를 낸다 (구 비결정성 미승계)', () => {
    const a = runCli(['parse', '--format', 'summary', CLEAN]);
    const b = runCli(['parse', '--format', 'summary', CLEAN]);
    const c = runCli(['parse', '--format=summary', CLEAN]);
    expect(a.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stdout).toBe(c.stdout);
    expect(a.stdout).toContain('Statements:');
  });

  it('--stdin은 빈 결과를 조용히 내지 않는다 (구 조용한 오답 미승계)', () => {
    const run = runCli(['parse', '--format', 'json', '--stdin'], 'DATA lv_a TYPE i.\nWRITE lv_a.\n');
    expect(run.code).toBe(0);
    const parsed = JSON.parse(run.stdout) as unknown[];
    expect(parsed).toHaveLength(2);
  });

  it('모르는 형식은 비-0이다', () => {
    expect(runCli(['parse', '--format', 'yaml', CLEAN]).code).not.toBe(0);
  });

  it('없는 파일은 비-0이다', () => {
    expect(runCli(['parse', MISSING]).code).not.toBe(0);
  });
});

describe('analyze — 분석이 돌면 0', () => {
  it('발견이 있어도 0이다', () => {
    const run = runCli(['analyze', ERRORS]);
    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { findings: unknown[]; rulesApplied: number };
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.rulesApplied).toBe(13);
  });

  it('깨끗한 파일도 0이고 findings는 빈 배열이다', () => {
    const run = runCli(['analyze', CLEAN]);
    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { findings: unknown[] }).findings).toEqual([]);
  });

  it('--format json은 받고 다른 형식은 비-0이다', () => {
    expect(runCli(['analyze', '--format', 'json', CLEAN]).code).toBe(0);
    expect(runCli(['analyze', '--format', 'text', CLEAN]).code).not.toBe(0);
  });

  it('--stdin으로도 분석한다', () => {
    const run = runCli(['analyze', '--stdin'], 'CATCH cx_root.\n');
    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { findings: { rule: string }[] };
    expect(result.findings.map((f) => f.rule)).toContain('catch_cx_root');
  });

  it('JSON은 stdout으로만 나간다 (기계가 그대로 먹을 수 있게)', () => {
    const run = runCli(['analyze', CLEAN]);
    expect(() => JSON.parse(run.stdout)).not.toThrow();
  });

  it('없는 파일은 비-0이고 stdout이 비어 있다', () => {
    const run = runCli(['analyze', MISSING]);
    expect(run.code).not.toBe(0);
    expect(run.stdout).toBe('');
  });
});

describe('CLI 껍데기', () => {
  it('인자가 없으면 비-0으로 쓰는 법을 낸다', () => {
    const run = runCli([]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('sapkit');
  });

  it('모르는 명령은 비-0이다', () => {
    expect(runCli(['deploy']).code).not.toBe(0);
  });

  it('--help는 0이고 명령 넷을 모두 적는다', () => {
    const run = runCli(['--help']);
    expect(run.code).toBe(0);
    for (const command of ['lint', 'parse', 'analyze', 'check']) {
      expect(run.stdout).toContain(command);
    }
  });

  it('--version은 0이고 판 번호를 낸다', () => {
    const run = runCli(['--version']);
    expect(run.code).toBe(0);
    expect(run.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('SAP 접속·MCP 모드 깃발은 존재하지 않는다', () => {
    for (const flag of ['--mcp', '--stdio', '--offline', '--system']) {
      expect(runCli([flag]).code).not.toBe(0);
    }
  });
});
