/**
 * 제작 계획 형식 — **T7이 맞춰 쓸 계약**.
 *
 * 이 파일이 형식의 정본이다. 계획이 아직 없을 때 대장이 죽지 않고 「미정」으로
 * 내는 것까지가 계약이라, 부재 처리도 여기서 못박는다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { bundleOf, loadBuildPlan, parseBuildPlan, requiredGradesFrom } from '../plan';

const GOOD = {
  formatVersion: 1,
  bundles: [
    { id: 'class-read', title: '클래스 읽기', order: 1 },
    { id: 'class-write', title: '클래스 쓰기', order: 2 },
  ],
  tools: {
    GetClass: { bundle: 'class-read', requiredGrade: 'replay' },
    UpdateClass: { bundle: 'class-write', requiredGrade: 'attended' },
  },
};

function tempFile(name: string, body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-plan-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

describe('제작 계획 읽기', () => {
  it('묶음·순서·요구 급을 도구별로 준다', () => {
    const plan = parseBuildPlan(JSON.stringify(GOOD), 'build-plan.json');

    expect(requiredGradesFrom(plan)).toEqual({ GetClass: 'replay', UpdateClass: 'attended' });
    expect(bundleOf(plan, 'UpdateClass')).toEqual({ id: 'class-write', title: '클래스 쓰기', order: 2 });
    expect(bundleOf(plan, 'GetProgram')).toBeNull();
  });

  it('파일이 없으면 null이다 — 죽지 않는다', () => {
    expect(loadBuildPlan(path.join(os.tmpdir(), 'sapkit-없는-계획.json'))).toBeNull();
  });

  it('있으면 읽는다', () => {
    const file = tempFile('build-plan.json', JSON.stringify(GOOD));
    expect(loadBuildPlan(file)?.bundles).toHaveLength(2);
  });
});

describe('제작 계획 형식 위반 — 조용히 넘기지 않고 던진다', () => {
  const bad = (mutate: (draft: any) => void): string => {
    const draft = JSON.parse(JSON.stringify(GOOD));
    mutate(draft);
    return JSON.stringify(draft);
  };

  it('JSON이 아니면 출처를 달아 던진다', () => {
    expect(() => parseBuildPlan('{', 'build-plan.json')).toThrow(/build-plan\.json/);
  });

  it('형식판이 다르면 던진다 — 뜻이 바뀐 파일을 옛 규칙으로 읽지 않는다', () => {
    expect(() => parseBuildPlan(bad((d) => (d.formatVersion = 2)), 'x.json')).toThrow(/formatVersion/);
  });

  it('묶음 id가 겹치면 던진다', () => {
    expect(() => parseBuildPlan(bad((d) => (d.bundles[1].id = 'class-read')), 'x.json')).toThrow(/id/);
  });

  it('묶음 순서가 겹치면 던진다 — 순서가 순서 노릇을 못 한다', () => {
    expect(() => parseBuildPlan(bad((d) => (d.bundles[1].order = 1)), 'x.json')).toThrow(/order|순서/);
  });

  it('없는 묶음을 가리키면 던진다', () => {
    expect(() => parseBuildPlan(bad((d) => (d.tools.GetClass.bundle = 'ghost')), 'x.json')).toThrow(/ghost/);
  });

  it('요구 급이 주 급 셋 밖이면 던진다 — 대체 기대 시험은 주 급이 못 된다', () => {
    expect(() => parseBuildPlan(bad((d) => (d.tools.GetClass.requiredGrade = 'substitute')), 'x.json')).toThrow(
      /requiredGrade/,
    );
  });

  it('요구 급이 비면 짐작하지 않고 던진다', () => {
    expect(() => parseBuildPlan(bad((d) => delete d.tools.GetClass.requiredGrade), 'x.json')).toThrow(
      /requiredGrade/,
    );
  });
});
