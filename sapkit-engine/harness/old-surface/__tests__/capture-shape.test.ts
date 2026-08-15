/**
 * 커밋된 채록본이 **전량인가**를 시험한다.
 *
 * `capture.mjs`의 강등 감지는 채록을 새로 뜰 때만 돈다. 이미 커밋된 파일이 반쪽으로
 * 줄어든 채 들어오는 경로(손으로 고치기, 잘못된 병합, 옛 판 되살리기)는 그 감지가
 * 막지 못한다. 그래서 같은 기준을 `npm test`에서 한 번 더 건다 — 채록기를 돌리지
 * 않고 파일만 읽으므로 자식 프로세스도, SAP 접속도 없다.
 *
 * 여기서 지키는 것은 **소비자들이 이 파일에 걸고 있는 약속**이다:
 *   · `gates/surface.mjs` · `harness/replay/coverage.ts` · `src/tools/**` 계약 시험 → `m1`
 *   · 「전 M 공통 완료 요건 4(노출 제어 회귀 0)」의 기계 판정 → `exposures`
 *   · 한 도구의 완성 조건 2(발행 선언 글자 일치) → `tools`
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const CAPTURE_PATH = path.join(__dirname, '..', 'm1-tools.json');

interface Declaration {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly execution: unknown;
}

interface Exposure {
  readonly exposition: string;
  readonly profile: string | null;
  readonly count: number;
  readonly names: readonly string[];
}

interface Capture {
  readonly counts: Record<string, number>;
  readonly exposures: Record<string, Exposure>;
  readonly connectedOnly: readonly string[];
  readonly m1Missing: readonly string[];
  readonly m1: Record<string, Declaration>;
  readonly tools: Record<string, Declaration>;
}

const capture = JSON.parse(fs.readFileSync(CAPTURE_PATH, 'utf8')) as Capture;

/** `capture.mjs`의 `RUNS`와 같은 기대치 — 두 곳이 어긋나면 어느 한쪽이 틀린 것이다. */
const EXPECTED: ReadonlyArray<readonly [string, string, string | null, number]> = [
  ['connected_default', 'readonly,high', 'onprem', 186],
  ['noProfile_default', 'readonly,high', null, 155],
  ['connected_readonly', 'readonly', 'onprem', 74],
  ['noProfile_readonly', 'readonly', null, 65],
];

const sorted = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

describe('구 표면 채록본 (m1-tools.json)', () => {
  it('4개 노출 조건이 전부 있고, 조건마다 기대 수만큼의 이름을 담는다', () => {
    expect(Object.keys(capture.exposures).sort()).toEqual(EXPECTED.map(([k]) => k).sort());
    for (const [key, exposition, profile, expected] of EXPECTED) {
      const exposure = capture.exposures[key];
      expect(exposure).toBeDefined();
      expect(exposure!.exposition).toBe(exposition);
      expect(exposure!.profile).toBe(profile);
      expect(exposure!.names).toHaveLength(expected);
      expect(exposure!.count).toBe(expected);
      expect(capture.counts[key]).toBe(expected);
      // 이름은 오름차순이어야 한다 — CI의 표류 확인이 `git diff`로 보므로,
      // 순서가 흔들리면 바뀐 게 없어도 빨간불이 뜬다.
      expect(exposure!.names).toEqual(sorted(exposure!.names));
      // 같은 이름이 두 번 들어오면 수는 맞는데 집합은 반쪽이다.
      expect(new Set(exposure!.names).size).toBe(expected);
    }
  });

  it('186종 전량의 선언을 담고, 선언마다 네 필드가 다 있다', () => {
    const names = Object.keys(capture.tools);
    expect(names).toHaveLength(186);
    expect(names).toEqual(sorted(names));
    for (const name of names) {
      const tool = capture.tools[name]!;
      expect(tool.name).toBe(name);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.execution).toBeTruthy();
    }
  });

  it('네 조건의 이름이 모두 전량 선언 안에 있다', () => {
    for (const [key] of EXPECTED) {
      const missing = capture.exposures[key]!.names.filter((n) => !(n in capture.tools));
      expect(missing).toEqual([]);
    }
  });

  it('옛 키 `m1`이 전량 선언과 글자 그대로 같다 (소비자 호환)', () => {
    expect(capture.m1Missing).toEqual([]);
    const m1Names = Object.keys(capture.m1);
    expect(m1Names).toHaveLength(19);
    for (const name of m1Names) {
      expect(capture.tools[name]).toBeDefined();
      expect(capture.m1[name]).toEqual(capture.tools[name]);
    }
  });

  it('연결 전용 31종이 두 집합의 차이와 정확히 같다', () => {
    const connected = capture.exposures['connected_default']!.names;
    const noProfile = new Set(capture.exposures['noProfile_default']!.names);
    expect(capture.connectedOnly).toEqual(connected.filter((n) => !noProfile.has(n)));
    expect(capture.connectedOnly).toHaveLength(31);
  });

  it('노출 제어가 실제로 표면을 좁힌다 (역검증)', () => {
    const count = (key: string): number => capture.exposures[key]!.names.length;
    // 프로파일을 물리면 넓어지고, readonly로 좁히면 줄어든다 — 두 축이 따로 논다.
    expect(count('connected_default')).toBeGreaterThan(count('noProfile_default'));
    expect(count('connected_readonly')).toBeGreaterThan(count('noProfile_readonly'));
    expect(count('connected_default')).toBeGreaterThan(count('connected_readonly'));
    expect(count('noProfile_default')).toBeGreaterThan(count('noProfile_readonly'));
    // readonly 집합은 같은 프로파일의 넓은 집합에 포함된다.
    for (const [narrow, wide] of [
      ['connected_readonly', 'connected_default'],
      ['noProfile_readonly', 'noProfile_default'],
    ] as const) {
      const wideSet = new Set(capture.exposures[wide]!.names);
      expect(capture.exposures[narrow]!.names.filter((n) => !wideSet.has(n))).toEqual([]);
    }
  });
});
