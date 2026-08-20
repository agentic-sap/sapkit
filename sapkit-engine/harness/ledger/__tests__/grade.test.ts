/**
 * 요구 급 사다리와 **D-092 ⓐ의 인하** — 여기가 그 산식의 계약이다.
 *
 * 못박는 것은 넷이다.
 *   ① 얼린 관측 **안**이면 `replay`가 그대로 남는다
 *   ② 실호출은 있는데 관측 **밖**이면 `contract`로 **인하**되고 그 사실이 남는다
 *   ③ 실호출이 **0**이면 처음부터 `contract`다 — 인하가 아니고, ②와 구별돼야 한다
 *   ④ `Create*`·`Delete*`는 관측과 **무관하게** `attended`다
 *
 * 그리고 얼린 관측이 없거나 깨졌을 때 **던진다**(fail-closed). 조용히 인하 없이
 * 넘어가면 산식이 인하 전으로 되돌아간 계획을 다시 써 버리고, 그 파일을 읽는
 * 다음 사람은 인하가 집행된 줄 안다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  PHASE6_EXERCISED_SCHEMA,
  gradeOf,
  loadPhase6Exercised,
  parsePhase6Exercised,
} from '../grade';

const GOOD = {
  schema: PHASE6_EXERCISED_SCHEMA,
  _note: '얼린 관측이다.',
  capturedAt: '2026-08-20',
  capturedCommit: 'aa94862b18f1abb01d47a4b98e8b8b93a489d7fb',
  tools: ['ActivateObjects', 'GetClass', 'GetProgram'],
};

function tempFile(body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-exercised-'));
  const file = path.join(dir, 'phase6-exercised.json');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

const exercised = new Set(['GetClass', 'GetProgram', 'CreateInclude', 'DeleteClass']);

describe('사다리 — 높은 것이 이긴다', () => {
  it('얼린 관측 안이고 실호출이 있으면 재생 대조 그대로다', () => {
    expect(gradeOf('GetClass', 214, exercised)).toEqual({ grade: 'replay', downgradedFrom: null });
  });

  it('실호출은 있는데 얼린 관측 밖이면 계약 시험으로 인하하고, 인하 전 급을 남긴다', () => {
    expect(gradeOf('GetDomain', 12, exercised)).toEqual({ grade: 'contract', downgradedFrom: 'replay' });
  });

  it('실호출이 0이면 처음부터 계약 시험이다 — 인하가 아니다', () => {
    expect(gradeOf('GetEnhancements', 0, exercised)).toEqual({ grade: 'contract', downgradedFrom: null });
  });

  it('인하와 원래 계약은 급이 같아도 구별된다 — 그 구별이 이 산식의 이유다', () => {
    const downgraded = gradeOf('GetDomain', 12, exercised);
    const always = gradeOf('GetEnhancements', 0, exercised);

    expect(downgraded.grade).toBe(always.grade);
    expect(downgraded.downgradedFrom).not.toBe(always.downgradedFrom);
  });

  it('Create*·Delete* 는 얼린 관측과 무관하게 attended 다', () => {
    // 관측 안에 있든(CreateInclude·DeleteClass) 밖에 있든(CreateTable·DeleteView) 같다.
    expect(gradeOf('CreateInclude', 85, exercised)).toEqual({ grade: 'attended', downgradedFrom: null });
    expect(gradeOf('DeleteClass', 0, exercised)).toEqual({ grade: 'attended', downgradedFrom: null });
    expect(gradeOf('CreateTable', 4, exercised)).toEqual({ grade: 'attended', downgradedFrom: null });
    expect(gradeOf('DeleteView', 0, exercised)).toEqual({ grade: 'attended', downgradedFrom: null });
  });

  it('빈 관측을 넘기면 실호출 있는 도구가 전부 인하된다 — 그래서 파서가 빈 목록을 막는다', () => {
    expect(gradeOf('GetClass', 214, new Set())).toEqual({ grade: 'contract', downgradedFrom: 'replay' });
  });
});

describe('얼린 관측 읽기', () => {
  it('도구 집합과 뽑은 좌표를 준다', () => {
    const frozen = parsePhase6Exercised(JSON.stringify(GOOD), 'phase6-exercised.json');

    expect(frozen.capturedAt).toBe('2026-08-20');
    expect(frozen.capturedCommit).toBe(GOOD.capturedCommit);
    expect([...frozen.tools].sort()).toEqual(GOOD.tools);
  });

  it('있으면 파일에서 읽는다', () => {
    expect(loadPhase6Exercised(tempFile(JSON.stringify(GOOD))).tools.size).toBe(3);
  });
});

describe('얼린 관측이 없거나 깨졌을 때 — fail-closed', () => {
  const bad = (mutate: (draft: any) => void): string => {
    const draft = JSON.parse(JSON.stringify(GOOD));
    mutate(draft);
    return JSON.stringify(draft);
  };

  it('파일이 없으면 던진다 — 조용히 인하 없이 넘어가지 않는다', () => {
    const missing = path.join(os.tmpdir(), 'sapkit-없는-관측.json');

    expect(() => loadPhase6Exercised(missing)).toThrow(/얼린 관측이 없다/);
    // 다시 뽑는 길을 오류가 직접 알려 준다 — 몰라서 손으로 채우는 것을 막는다.
    expect(() => loadPhase6Exercised(missing)).toThrow(/phase6-exercised\.mjs/);
  });

  it('JSON이 아니면 출처를 달아 던진다', () => {
    expect(() => parsePhase6Exercised('{', 'phase6-exercised.json')).toThrow(/phase6-exercised\.json/);
  });

  it('schema 가 다르면 던진다 — 뜻이 바뀐 파일을 옛 규칙으로 읽지 않는다', () => {
    expect(() => parsePhase6Exercised(bad((d) => (d.schema = 'other/1')), 'x')).toThrow(/schema/);
  });

  it('tools 가 배열이 아니면 던진다', () => {
    expect(() => parsePhase6Exercised(bad((d) => (d.tools = 'GetClass')), 'x')).toThrow(/tools 가 배열이 아니다/);
  });

  it('tools 가 비면 던진다 — 전량 인하로 이어진다', () => {
    expect(() => parsePhase6Exercised(bad((d) => (d.tools = [])), 'x')).toThrow(/비었다/);
  });

  it('같은 이름이 두 번 있으면 던진다', () => {
    expect(() => parsePhase6Exercised(bad((d) => d.tools.push('GetClass')), 'x')).toThrow(/두 번/);
  });

  it('정렬돼 있지 않으면 던진다 — 손으로 끼워 넣은 흔적이다', () => {
    expect(() => parsePhase6Exercised(bad((d) => (d.tools = ['GetProgram', 'GetClass'])), 'x')).toThrow(/정렬/);
  });

  it('도구 이름이 아닌 원소가 있으면 던진다', () => {
    expect(() => parsePhase6Exercised(bad((d) => (d.tools = [7])), 'x')).toThrow(/도구 이름이 아니다/);
  });

  it('뽑은 시각·커밋이 없으면 던진다 — 좌표 없는 관측은 재현할 수 없다', () => {
    expect(() => parsePhase6Exercised(bad((d) => delete d.capturedAt), 'x')).toThrow(/capturedAt/);
    expect(() => parsePhase6Exercised(bad((d) => delete d.capturedCommit), 'x')).toThrow(/capturedCommit/);
  });
});
