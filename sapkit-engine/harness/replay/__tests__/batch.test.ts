/**
 * 전량 재생의 **수집 단위와 거부 판정** — D-122 ⑵가 등재한 결함의 시험.
 *
 * 재는 것은 셋이다.
 *   ① 수집이 `fixtures/` 아래를 **재귀로** 훑는다 (배정 단위와 같아진다)
 *   ② 되돌리지 않는 시퀀스와 P4 시퀀스는 전량 재생에서 **빠진다**
 *   ③ `replay-attended.mjs`가 그 판정을 **스스로 다시 짜지 않고** 여기 것을 쓴다
 *
 * **`replay-attended.mjs`를 돌리지 않는다** — 예행 모드가 없고 돌리는 순간 SAP에
 * 붙는다. 그래서 판정은 이 파일이 시험하는 함수로 뽑아 두고, 스크립트가 그것을
 * 실제로 물었는지는 **정적 대조**로 본다(`evidenceInputs.test.ts`와 같은 방식).
 *
 * 레포의 실제 픽스처도 함께 건다 — 판정이 옳아도 **지금 레포에 있는 시퀀스**를
 * 잘못 가르면 소용이 없기 때문이다. 파일을 읽기만 하고 쓰지 않는다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TRANSPORT_TOOLS, batchRefusal, collectFixtureFiles } from '../batch';

const SCRIPT = path.resolve(__dirname, '../../replay-attended.mjs');
const FIXTURE_DIR = path.resolve(__dirname, '../../../fixtures');

const tempDirs: string[] = [];
function tempTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-batch-test-'));
  tempDirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body, 'utf8');
  }
  return root;
}

afterAll(() => {
  while (tempDirs.length > 0) {
    try {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
    } catch {
      // 임시 디렉터리 정리 실패는 판정이 아니다.
    }
  }
});

describe('collectFixtureFiles — 수집은 재귀다', () => {
  it('하위 디렉터리의 픽스처도 모은다', () => {
    const root = tempTree({
      'top.json': '{}',
      'attended-only/deep.json': '{}',
      'attended-only/nested/deeper.json': '{}',
    });

    expect(collectFixtureFiles(root).map((f) => path.relative(root, f).split(path.sep).join('/'))).toEqual([
      'attended-only/deep.json',
      'attended-only/nested/deeper.json',
      'top.json',
    ]);
  });

  it('`.json` 이 아닌 것은 모으지 않는다', () => {
    const root = tempTree({ 'README.md': '#', 'a.json': '{}', 'b.txt': 'x' });

    expect(collectFixtureFiles(root).map((f) => path.basename(f))).toEqual(['a.json']);
  });

  it('디렉터리가 없으면 빈 목록이다 — 던지지 않는다', () => {
    expect(collectFixtureFiles(path.join(os.tmpdir(), 'sapkit-no-such-dir-2f9a'))).toEqual([]);
  });

  it('순서가 결정적이다 — 같은 트리는 늘 같은 차례로 나온다', () => {
    const root = tempTree({ 'z.json': '{}', 'a.json': '{}', 'sub/m.json': '{}' });

    expect(collectFixtureFiles(root)).toEqual(collectFixtureFiles(root));
    // 정렬 기준은 **전체 경로**다 — `sub/m.json` 이 `z.json` 보다 앞선다.
    expect(collectFixtureFiles(root).map((f) => path.relative(root, f).split(path.sep).join('/'))).toEqual([
      'a.json',
      'sub/m.json',
      'z.json',
    ]);
  });
});

describe('batchRefusal — 전량 재생에서 무엇을 빼는가', () => {
  it('읽기만 하는 시퀀스는 뺄 이유가 없다', () => {
    expect(batchRefusal(['GetClass', 'GetProgram'])).toBeNull();
  });

  it('스스로 지우고 끝나는 생애주기는 뺄 이유가 없다', () => {
    expect(batchRefusal(['CreateDomain', 'GetDomain', 'DeleteDomain'])).toBeNull();
  });

  it('생성만 하고 지우지 않으면 뺀다 — 두 번째 실행이 "이미 있다"로 실패한다', () => {
    const reason = batchRefusal(['CreateProgram', 'GetProgram']);

    expect(reason).toContain('CreateProgram');
    expect(reason).toContain('지우지 않는다');
  });

  it('그 거부는 도구 이름을 열거해 사람이 무엇 때문인지 알게 한다', () => {
    expect(batchRefusal(['CreateInclude', 'CreateProgram'])).toContain('CreateInclude·CreateProgram');
  });

  it('P4(이송)는 지우는 단계가 있어도 뺀다 — 되돌릴 수 없기 때문이다', () => {
    const reason = batchRefusal(['CreateTransport', 'DeleteProgram']);

    expect(reason).toContain('P4');
    expect(reason).toContain('CreateTransport');
  });

  it('패키지 생성도 P4다', () => {
    expect(batchRefusal(['CreatePackage'])).toContain('P4');
  });

  it('해제도 P4다 — 지금 픽스처에 없어도 표가 행위를 막는다', () => {
    expect(TRANSPORT_TOOLS.has('ReleaseTransport')).toBe(true);
    expect(batchRefusal(['ReleaseTransport'])).toContain('P4');
  });

  it('P4가 섞이면 생성/삭제 판정보다 P4 이유를 낸다 — 더 무거운 쪽을 말한다', () => {
    expect(batchRefusal(['CreateTransport'])).toContain('P4');
  });

  it('빈 시퀀스는 뺄 이유가 없다', () => {
    expect(batchRefusal([])).toBeNull();
  });
});

describe('레포의 실제 픽스처를 어떻게 가르는가', () => {
  const toolsOf = (file: string): string[] => {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { steps?: { tool?: unknown }[] };
    return (parsed.steps ?? []).map((s) => s.tool).filter((t): t is string => typeof t === 'string');
  };

  const collected = collectFixtureFiles(FIXTURE_DIR);
  const nameOf = (file: string): string => path.basename(file, '.json');
  const kept = collected.filter((f) => batchRefusal(toolsOf(f)) === null).map(nameOf);
  const refused = collected.filter((f) => batchRefusal(toolsOf(f)) !== null).map(nameOf);

  it('재귀 수집이 `attended-only/`까지 닿는다', () => {
    expect(collected.some((f) => f.includes(`${path.sep}attended-only${path.sep}`))).toBe(true);
  });

  it('되돌리지 않는 M1 생성 픽스처 2편과 P4 이송 1편만 빠진다', () => {
    expect(refused.sort()).toEqual([
      'zsapkit-m1-include-create',
      'zsapkit-m1-program-create',
      'zsapkit63-p4-transport',
    ]);
  });

  it('옛 기본 수집(최상위 `fixtures/*.json`)은 하나도 빠지지 않는다 — 회귀 없음', () => {
    const topLevel = fs
      .readdirSync(FIXTURE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.basename(f, '.json'));

    for (const name of topLevel) expect(kept).toContain(name);
  });

  it('요구 급이 재생인데 옛 수집이 못 태우던 18종을 이제 태운다', () => {
    // D-122 ⑵가 이름을 적어 둔 그 18종이다. 여기 박아 두는 이유는, 수집이 다시
    // 좁아지면 **어느 도구가 도로 도달 불가가 되는지**까지 시험이 말해야 하기
    // 때문이다. 「몇 종」만 세면 그 사실이 수치 뒤로 숨는다.
    const unreachableBefore = [
      'GetDataElement',
      'GetDomain',
      'GetFunctionGroup',
      'GetInterface',
      'GetLocalTestClass',
      'GetLocalTypes',
      'GetMetadataExtension',
      'GetServiceBinding',
      'GetServiceDefinition',
      'GetView',
      'ReadBehaviorDefinition',
      'ReadBehaviorImplementation',
      'UpdateLocalTestClass',
      'UpdateLocalTypes',
      'UpdateMetadataExtension',
      'UpdateServiceDefinition',
      'UpdateTable',
      'UpdateView',
    ];
    const burned = new Set(
      collected.filter((f) => batchRefusal(toolsOf(f)) === null).flatMap((f) => toolsOf(f)),
    );

    for (const tool of unreachableBefore) expect([tool, burned.has(tool)]).toEqual([tool, true]);
  });

  it('전량 재생이 P4를 한 건도 태우지 않는다', () => {
    const burned = collected
      .filter((f) => batchRefusal(toolsOf(f)) === null)
      .flatMap((f) => toolsOf(f));

    expect(burned.filter((tool) => TRANSPORT_TOOLS.has(tool))).toEqual([]);
  });
});

describe('replay-attended.mjs 배선 — 판정을 다시 짜지 않는다', () => {
  const source = fs.readFileSync(SCRIPT, 'utf8');

  it('수집을 `collectFixtureFiles`에 맡긴다', () => {
    expect(source).toMatch(/replay\.collectFixtureFiles\(/);
  });

  it('거부 판정을 `batchRefusal`에 맡긴다', () => {
    expect(source).toMatch(/replay\.batchRefusal\(/);
  });

  it('스스로 `readdirSync`로 픽스처를 모으지 않는다 — 그것이 결함의 모양이었다', () => {
    expect(source).not.toMatch(/readdirSync\s*\(\s*FIXTURE_DIR/);
  });

  it('keyring 해석 경로를 문다 — 녹화 쪽과 같은 기본값', () => {
    expect(source).toMatch(/interactive\/server\/runtime-deps\/keyring\/node_modules/);
    expect(source).toMatch(/--node-path|node-path/);
  });

  it('같은 프로세스라 NODE_PATH만 넣지 않고 해석 경로를 다시 세운다', () => {
    expect(source).toMatch(/process\.env\.NODE_PATH\s*=/);
    expect(source).toMatch(/_initPaths\(\)/);
  });
});
