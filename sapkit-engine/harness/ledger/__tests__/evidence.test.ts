/**
 * 증거 수집 — **레포 안의 파일에서만 읽는다.**
 *
 * 대장의 증거 열은 문서 서술이나 옛 콘솔 출력이 아니라 커밋된 파일에서만
 * 나온다. 그래서 여기서 못박는 것은 두 가지다:
 *   ① 파일이 있을 때 무엇을 어떤 급으로 세는가
 *   ② **파일이 없을 때 「미기록」이 되는가** — 없는 증거를 있다고 적지 않는다
 *
 * `harness/replay-attended.mjs`는 SAP에 붙으므로 돌리지 않는다. 그 스크립트가
 * 판정 파일을 쓰는 배선은 여기 함수로 뽑아 두고 시험은 함수를 검사한다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { echoTarget, envelope, recorded, step, target } from '../../replay/__tests__/helpers';
import { M1_DIVERGENCES } from '../../replay/divergences';
import { replaySequence } from '../../replay/replay';
import {
  REPLAY_VERDICT_FORMAT_VERSION,
  attendedEvidenceFromFixtures,
  contractEvidenceFromJest,
  findContractTestFiles,
  loadReplayVerdicts,
  parseReplayVerdict,
  replayVerdictDocument,
  replaysFromVerdicts,
  substituteEvidenceFromLedger,
} from '../evidence';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-evidence-'));
}

const AT = '2026-08-14T00:00:00.000Z';

describe('재생 판정 파일 — 형식과 왕복', () => {
  it('판정을 파일로 접었다 펴도 도구·판정이 남는다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetClass' })]);
    const result = await replaySequence(fixture, echoTarget(fixture));

    const doc = replayVerdictDocument(result, AT);
    expect(doc.formatVersion).toBe(REPLAY_VERDICT_FORMAT_VERSION);
    expect(doc.sequenceId).toBe('demo-read-class');
    expect(doc.recordedAt).toBe(AT);
    expect(doc.steps).toEqual([
      { index: 0, tool: 'GetClass', verdict: 'match', divergenceId: null, detail: null },
    ]);

    const back = parseReplayVerdict(JSON.stringify(doc), 'x.json');
    expect(replaysFromVerdicts([back])[0]?.steps[0]?.verdict).toBe('match');
  });

  it('판정 파일에 응답 본문을 싣지 않는다 — 판정만 담는 파일이다', async () => {
    const fixture = recorded([step({ index: 0, tool: 'GetClass', response: envelope('CLASS 비밀 DEFINITION.') })]);
    const result = await replaySequence(fixture, target([{ payload: envelope('CLASS 다름 DEFINITION.') }]));

    expect(JSON.stringify(replayVerdictDocument(result, AT))).not.toContain('비밀');
  });

  it('형식이 어긋나면 조용히 비우지 않고 던진다', () => {
    expect(() => parseReplayVerdict('[]', 'x.json')).toThrow(/x\.json/);
    expect(() => parseReplayVerdict(JSON.stringify({ formatVersion: 99 }), 'x.json')).toThrow(/formatVersion/);
    expect(() =>
      parseReplayVerdict(JSON.stringify({ formatVersion: 1, sequenceId: 'a', verdict: '아무거나', steps: [] }), 'x.json'),
    ).toThrow(/verdict/);
  });

  it('디렉터리가 없으면 0건이다 — 「미기록」이지 통과가 아니다', () => {
    expect(loadReplayVerdicts(path.join(os.tmpdir(), 'sapkit-없는-판정'))).toEqual([]);
  });

  it('디렉터리의 판정 파일을 이름순으로 읽는다', async () => {
    const dir = tempDir();
    const fixture = recorded([step({ index: 0, tool: 'GetClass' })]);
    const result = await replaySequence(fixture, echoTarget(fixture));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(replayVerdictDocument(result, AT)), 'utf8');
    fs.writeFileSync(
      path.join(dir, 'a.json'),
      JSON.stringify({ ...replayVerdictDocument(result, AT), sequenceId: 'aaa' }),
      'utf8',
    );

    expect(loadReplayVerdicts(dir).map((d) => d.sequenceId)).toEqual(['aaa', 'demo-read-class']);
  });
});

describe('attended 실기 기록 — 커밋된 픽스처', () => {
  it('픽스처의 단계마다 도구별 실기 증거가 된다', () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'z.json'),
      JSON.stringify(recorded([step({ index: 0, tool: 'CreateProgram' }), step({ index: 1, tool: 'GetProgram' })])),
      'utf8',
    );

    expect(attendedEvidenceFromFixtures(dir).map((e) => e.tool)).toEqual(['CreateProgram', 'GetProgram']);
  });

  it('오류로 채록된 단계는 통과가 아니다', () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'z.json'),
      JSON.stringify(
        recorded([step({ index: 0, tool: 'CreateProgram', response: envelope('실패', true), isError: true })]),
      ),
      'utf8',
    );

    expect(attendedEvidenceFromFixtures(dir)[0]).toMatchObject({ tool: 'CreateProgram', passed: false });
  });

  it('디렉터리가 없으면 0건이다', () => {
    expect(attendedEvidenceFromFixtures(path.join(os.tmpdir(), 'sapkit-없는-실기'))).toEqual([]);
  });
});

describe('계약 시험 증거 — 시험 파일의 존재 + 실행 결과', () => {
  const engineRoot = path.resolve(__dirname, '../../..');

  it('도구별 계약 시험 파일을 찾는다', () => {
    const found = findContractTestFiles(path.join(engineRoot, 'src', 'tools'), ['GetClass', 'CreateProgram', 'GetBadiImplementations']);

    expect(found.get('GetClass')).toMatch(/getClass\.test\.ts$/);
    expect(found.get('CreateProgram')).toMatch(/createProgram\.test\.ts$/);
    // 아직 짓지 않은 도구는 계약 시험 파일도 없다.
    expect(found.has('GetBadiImplementations')).toBe(false);
  });

  it('jest 실행 결과를 도구별 통과로 옮긴다', () => {
    const files = new Map([
      ['GetClass', 'src/tools/read/__tests__/getClass.test.ts'],
      ['GetProgram', 'src/tools/read/__tests__/getProgram.test.ts'],
    ]);
    const report = {
      testResults: [
        { name: 'D:\\repo\\sapkit-engine\\src\\tools\\read\\__tests__\\getClass.test.ts', status: 'passed' },
        { name: '/home/x/sapkit-engine/src/tools/read/__tests__/getProgram.test.ts', status: 'failed' },
      ],
    };

    expect(contractEvidenceFromJest(report, files)).toEqual([
      { tool: 'GetClass', passed: true, detail: 'src/tools/read/__tests__/getClass.test.ts' },
      { tool: 'GetProgram', passed: false, detail: 'src/tools/read/__tests__/getProgram.test.ts' },
    ]);
  });

  it('결과에 없는 시험 파일은 증거가 아니다 — 안 돈 것을 통과로 세지 않는다', () => {
    const files = new Map([['GetClass', 'src/tools/read/__tests__/getClass.test.ts']]);

    expect(contractEvidenceFromJest({ testResults: [] }, files)).toEqual([]);
  });
});

describe('대체 기대 시험 — 장부 등재분에 대응하는 시험 파일', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');

  it('시험 파일이 실재하는 등재분만 증거가 된다', () => {
    const evidence = substituteEvidenceFromLedger(M1_DIVERGENCES, repoRoot);

    // D1·D3은 대체 기대 시험을 아직 다른 작업이 소유한다 — 산문뿐이고 파일이 없다.
    expect(evidence.map((e) => e.tool)).not.toContain('GetSqlQuery');
    expect(evidence.map((e) => e.tool)).not.toContain('GetIncludesList');

    // **D2는 반대쪽 증거다.** class 묶음이 `UpdateLocalTypes`를 지으며 휴면을
    // 깨우고 대체 기대 시험을 실제 파일로 저작했으므로, 이제 **잡혀야** 한다.
    // 산문과 실재 파일을 가르는 것이 이 수집기의 존재 이유이므로 양쪽을 함께 못박는다.
    expect(evidence.map((e) => e.tool)).toContain('UpdateLocalTypes');
  });

  it('도구가 없는 등재분(계층 차이)은 도구 단위 증거가 아니다', () => {
    const evidence = substituteEvidenceFromLedger(M1_DIVERGENCES, repoRoot);

    expect(evidence.every((e) => typeof e.tool === 'string' && e.tool.length > 0)).toBe(true);
  });

  it('파일이 실재하면 증거로 센다', () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'a'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'sub.test.ts'), '// 대체 기대 시험', 'utf8');

    const evidence = substituteEvidenceFromLedger(
      [
        {
          id: 'DX',
          title: 'x',
          tool: 'GetClass',
          classification: '수리',
          status: 'active',
          evidence: '',
          substituteTest: 'a/sub.test.ts',
          resolvesIn: null,
          applies: null,
          check: null,
        },
      ],
      root,
    );

    expect(evidence).toEqual([{ tool: 'GetClass', passed: true, detail: 'DX — a/sub.test.ts' }]);
  });
});
