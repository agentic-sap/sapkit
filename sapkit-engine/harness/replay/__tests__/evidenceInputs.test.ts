/**
 * 커버리지 입력 배선 — **실기 기록이 표에 닿는가.**
 *
 * `buildCoverage`는 `attended`·`contractTests`를 진작 받게 돼 있었는데 부르는
 * 쪽(`harness/replay-attended.mjs`)이 넘기지 않아, 실기 기록이 있어도 표의
 * "증거 없음"에 영원히 남았다. 여기서 못박는 것은 그 배선이다.
 *
 * **`replay-attended.mjs`를 돌리지 않는다** — 그 스크립트에는 예행 모드가 없고
 * 돌리는 순간 SAP에 붙는다. 그래서 배선 로직은 이 파일이 시험하는 함수로 뽑아
 * 두고, 스크립트가 그 함수를 실제로 물려 넘기는지는 **정적 대조**로 본다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { buildCoverage } from '../coverage';
import { M1_DIVERGENCES } from '../divergences';
import { attendedEvidenceFromReplays, parseContractEvidence } from '../evidenceInputs';
import { replaySequence } from '../replay';
import { echoTarget, envelope, recorded, step, target } from './helpers';

const SCRIPT = path.resolve(__dirname, '../../replay-attended.mjs');

describe('attended 실기 증거 — 재생 실행 자체가 실기다', () => {
  it('돌아간 단계가 도구별 실기 증거가 된다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetClass' })]);
    const evidence = attendedEvidenceFromReplays([await replaySequence(fixture, echoTarget(fixture))]);

    expect(evidence).toEqual([
      { tool: 'GetClass', passed: true, detail: 'demo-read-class #0' },
    ]);
  });

  it('전송이 끊겨 돌지 않은 단계는 실기 증거가 아니다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetClass' }), step({ index: 1, tool: 'GetInclude' })]);
    // 대본이 한 건뿐이라 두 번째 단계에서 전송이 끊긴다.
    const result = await replaySequence(fixture, target([{ payload: envelope('CLASS zcl_demo DEFINITION.') }]));
    const evidence = attendedEvidenceFromReplays([result]);

    expect(evidence.map((e) => e.tool)).toEqual(['GetClass']);
  });

  it('신 엔진이 틀리게 답한 단계는 실기 실패로 센다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetClass', response: envelope('구') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('신') }]));
    const evidence = attendedEvidenceFromReplays([result]);

    expect(evidence[0]).toMatchObject({ tool: 'GetClass', passed: false });
  });

  it('실기 기록만 있는 도구는 더 이상 증거 없음에 남지 않는다', async () => {
    // D1(GetSqlQuery)은 이연이라 재생 급을 채우지 못한다. 그래도 신 엔진이
    // 그 도구를 실제로 돌린 사실은 남는다.
    const fixture = recorded([step({ index: 0, tool: 'GetSqlQuery', response: envelope('구') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('신') }]));

    const before = buildCoverage({ tools: ['GetSqlQuery'], replays: [result], divergences: M1_DIVERGENCES });
    expect(before.toolsWithoutEvidence).toEqual(['GetSqlQuery']);

    const after = buildCoverage({
      tools: ['GetSqlQuery'],
      replays: [result],
      attended: attendedEvidenceFromReplays([result]),
      divergences: M1_DIVERGENCES,
    });
    expect(after.tools[0]?.attended.status).toBe('pass');
    expect(after.toolsWithoutEvidence).toEqual([]);
  });
});

describe('계약 시험 증거 읽기', () => {
  it('도구별 통과 여부를 그대로 급으로 옮긴다', () => {
    const parsed = parseContractEvidence(
      JSON.stringify([{ tool: 'GetClass', passed: true, detail: 'jest' }, { tool: 'GetTable', passed: false }]),
      'x.json',
    );

    expect(parsed).toEqual([
      { tool: 'GetClass', passed: true, detail: 'jest' },
      { tool: 'GetTable', passed: false },
    ]);
  });

  it('형식이 어긋나면 조용히 비우지 않고 던진다', () => {
    expect(() => parseContractEvidence('{"GetClass": true}', 'x.json')).toThrow(/x\.json/);
    expect(() => parseContractEvidence('[{"passed": true}]', 'x.json')).toThrow(/tool/);
    expect(() => parseContractEvidence('[{"tool": "GetClass"}]', 'x.json')).toThrow(/passed/);
  });
});

describe('replay-attended.mjs 배선 (정적 대조 — 스크립트를 돌리지 않는다)', () => {
  const source = fs.readFileSync(SCRIPT, 'utf8');

  it('buildCoverage 호출이 attended·contractTests까지 넘긴다', () => {
    const call = /buildCoverage\(\{[\s\S]*?\}\)/.exec(source)?.[0];

    expect(call).toBeDefined();
    for (const key of ['tools', 'replays', 'attended', 'contractTests']) {
      // 속기(`contractTests,`)도 배선이다 — 이름이 속성 자리에 있는지를 본다.
      expect(call).toMatch(new RegExp(`[{,]\\s*${key}\\s*[:,}]`));
    }
  });

  it('실기 증거를 스스로 다시 짜지 않고 배선 함수를 쓴다', () => {
    expect(source).toContain('attendedEvidenceFromReplays');
  });
});
