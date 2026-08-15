// check — 프로젝트 정합(인클루드 해석) 시험.
//
// 신기능이라 구 vsp 기준 채록본이 없다. 그래서 픽스처를 직접 세웠다(합성 이름만).
// 판정의 요점 셋: **Z·Y·$ 네임스페이스만 결함** · 그 밖은 정보 수준 · `IF FOUND`는
// 결함이 아니다(구 엔진 결함 13-13의 교훈).

import { fixture, runCli } from './run-cli';

describe('check — 해석되는 프로젝트', () => {
  it('전부 해석되면 0이고 미해결 보고가 없다', () => {
    const run = runCli(['check', fixture('check/resolved')]);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('4 INCLUDE');
  });

  it('하위 폴더까지 훑는다', () => {
    // resolved/inc/ 아래의 인클루드가 해석되지 않으면 위 시험이 통과할 수 없다.
    const run = runCli(['check', fixture('check/resolved')]);
    expect(run.code).toBe(0);
  });
});

describe('check — 미해결 인클루드', () => {
  it('Z 네임스페이스 미해결은 결함이라 비-0이다', () => {
    const run = runCli(['check', fixture('check/missing-z')]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('E [unresolved_include]');
    expect(run.stdout).toContain('ZMAIN_MISSING');
  });

  it('Y 네임스페이스도 결함이다', () => {
    const run = runCli(['check', fixture('check/missing-y')]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('E [unresolved_include]');
  });

  it('표준(비 Z/Y/$) 미해결은 정보 수준이라 0이다', () => {
    const run = runCli(['check', fixture('check/missing-standard')]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('I [unresolved_include]');
    expect(run.stdout).not.toContain('E [');
  });

  it('INCLUDE … IF FOUND는 미해결이어도 결함이 아니다', () => {
    const run = runCli(['check', fixture('check/if-found')]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('I [unresolved_include]');
    expect(run.stdout).not.toContain('E [');
  });

  it('보고 한 줄 형식은 `파일:행: E|I [키] 메시지`다', () => {
    const run = runCli(['check', fixture('check/missing-z')]);
    for (const line of run.stdout.split('\n').filter((l) => l !== '')) {
      expect(line).toMatch(/^.+:\d+: [EI] \[unresolved_include\] .+$/);
    }
  });
});

describe('check — 범위 밖', () => {
  it('INCLUDE STRUCTURE·INCLUDE TYPE은 인클루드 참조가 아니다', () => {
    const run = runCli(['check', fixture('check/ddic')]);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe('');
  });

  it('PERFORM·클래스 참조는 해석하지 않는다 (인클루드까지가 범위다)', () => {
    const run = runCli(['check', fixture('check/out-of-scope')]);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe('');
  });
});

describe('check — 사용·입력 오류', () => {
  it('없는 디렉터리는 비-0이다', () => {
    const run = runCli(['check', fixture('check/no_such_dir')]);
    expect(run.code).not.toBe(0);
    expect(run.stdout).toBe('');
  });

  it('디렉터리가 아니라 파일을 주면 비-0이다', () => {
    expect(runCli(['check', fixture('check/ddic/ztypes.prog.abap')]).code).not.toBe(0);
  });

  it('인자가 없으면 비-0이다', () => {
    expect(runCli(['check']).code).not.toBe(0);
  });

  it('--stdin은 받지 않는다 (디렉터리를 훑는 명령이다)', () => {
    expect(runCli(['check', '--stdin']).code).not.toBe(0);
  });
});
