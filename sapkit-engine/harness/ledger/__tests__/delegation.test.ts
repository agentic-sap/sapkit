/**
 * 위임형 판정 — **겉 핸들러만 보면 틀린다.**
 *
 * 겉은 공용 헬퍼만 부르고 그 헬퍼가 `@babamba2`를 부르는 도구가 있다. 그것을
 * 「없음」으로 적으면 다음 세션이 **겉만 읽고 짓는다** — 재생 대조를 미룬
 * 도구에게는 참조 원본의 깊이가 유일한 정확성 근거인데, 그 근거를 틀리게
 * 주는 셈이다.
 *
 * 그래서 여기서 못박는 것은 셋이다.
 *   ① 사슬을 따라가 **간접**을 잡는다
 *   ② 사슬이 없으면 **없음**이다 (과수리 역검증 — 전부 위임으로 칠하지 않는다)
 *   ③ 순환 import에서 죽지 않는다
 *
 * 구 소스는 **읽기만** 한다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadDelegationCapture, scanDelegation } from '../delegation';

/** 가짜 구 엔진 한 벌. `src/handlers/**`와 `src/lib/**`만 있으면 된다. */
function fakeEngine(files: Readonly<Record<string, string>>): { handlersDir: string; srcRoot: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-delegation-'));
  const srcRoot = path.join(root, 'src');
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(srcRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body, 'utf8');
  }
  return { handlersDir: path.join(srcRoot, 'handlers'), srcRoot };
}

const declares = (name: string, extra = ''): string =>
  `${extra}\nexport const TOOL_DEFINITION = { name: '${name}', description: 'x' };\n`;

describe('위임 사슬 따라가기', () => {
  it('겉 핸들러가 직접 부르면 `direct`다', () => {
    const { handlersDir } = fakeEngine({
      'handlers/a/handleAlpha.ts': declares('Alpha', "import { x } from '@babamba2/mcp-abap-adt-clients';"),
    });

    expect(scanDelegation(handlersDir).byTool.get('Alpha')).toBe('direct');
  });

  it('공용 헬퍼를 거쳐 닿으면 `indirect`다 — 이것을 놓치면 겉만 읽고 짓게 된다', () => {
    const { handlersDir } = fakeEngine({
      'handlers/a/handleBeta.ts': declares('Beta', "import { helper } from '../../lib/utils';"),
      'lib/utils.ts': "import { c } from '@babamba2/mcp-abap-adt-clients';\nexport const helper = c;\n",
    });

    expect(scanDelegation(handlersDir).byTool.get('Beta')).toBe('indirect');
  });

  it('두 단계 건너서도 닿으면 `indirect`다', () => {
    const { handlersDir } = fakeEngine({
      'handlers/a/handleGamma.ts': declares('Gamma', "import { m } from '../../lib/middle';"),
      'lib/middle.ts': "export { deep as m } from './deep';\n",
      'lib/deep.ts': "import type { T } from '@babamba2/mcp-abap-adt-clients';\nexport const deep: T = 1 as never;\n",
    });

    expect(scanDelegation(handlersDir).byTool.get('Gamma')).toBe('indirect');
  });

  it('node16식 `.js` 지정자와 디렉터리 `index`도 푼다 — 한쪽만 풀면 사슬이 조용히 끊긴다', () => {
    const { handlersDir } = fakeEngine({
      'handlers/a/handleDelta.ts': declares('Delta', "import { v } from '../../utils/transportValidation.js';"),
      'utils/transportValidation.ts': "export { v } from '../clients';\n",
      'clients/index.ts': "import { c } from '@babamba2/mcp-abap-adt-clients';\nexport const v = c;\n",
    });

    expect(scanDelegation(handlersDir).byTool.get('Delta')).toBe('indirect');
  });

  it('사슬이 없으면 `none`이다 (과수리 역검증 — 전부 위임으로 칠하지 않는다)', () => {
    const { handlersDir } = fakeEngine({
      'handlers/a/handleEpsilon.ts': declares('Epsilon', "import { plain } from '../../lib/plain';"),
      'lib/plain.ts': "export const plain = 1;\n",
      // 같은 트리에 위임 파일이 있어도, 사슬로 이어지지 않으면 옮지 않는다.
      'lib/other.ts': "import { c } from '@babamba2/mcp-abap-adt-clients';\nexport const other = c;\n",
    });

    expect(scanDelegation(handlersDir).byTool.get('Epsilon')).toBe('none');
  });

  it('순환 import에서 죽지 않는다', () => {
    const { handlersDir } = fakeEngine({
      'handlers/a/handleZeta.ts': declares('Zeta', "import { a } from '../../lib/a';"),
      'lib/a.ts': "export { b as a } from './b';\n",
      'lib/b.ts': "export { a as b } from './a';\n",
      'handlers/a/handleEta.ts': declares('Eta', "import { a } from '../../lib/loopy';"),
      'lib/loopy.ts': "export { z } from './loopy2';\n",
      'lib/loopy2.ts': "export { z } from './loopy';\nimport { c } from '@babamba2/mcp-abap-adt-clients';\nexport const z = c;\n",
    });

    const scan = scanDelegation(handlersDir);
    expect(scan.byTool.get('Zeta')).toBe('none');
    expect(scan.byTool.get('Eta')).toBe('indirect');
  });

  it('타입 경로와 값 경로를 따로 낸다 — 「없음 0」이 성긴 계산인지 실제인지 가른다', () => {
    const { handlersDir } = fakeEngine({
      'handlers/a/handleTheta.ts': declares('Theta', "import { t } from '../../lib/typesOnly';"),
      'lib/typesOnly.ts': "import type { T } from '@babamba2/mcp-abap-adt-interfaces';\nexport const t = 1 as T;\n",
      'handlers/a/handleIota.ts': declares('Iota', "import { r } from '../../lib/runtime';"),
      'lib/runtime.ts': "import { AdtClient } from '@babamba2/mcp-abap-adt-clients';\nexport const r = AdtClient;\n",
    });
    const scan = scanDelegation(handlersDir);

    // 어느 쪽이든 사슬로는 닿는다.
    expect(scan.byTool.get('Theta')).toBe('indirect');
    expect(scan.byTool.get('Iota')).toBe('indirect');
    // 값 경로로는 Iota만 닿는다 — Theta는 컴파일 타임 의존일 뿐이다.
    expect(scan.byToolValue.get('Theta')).toBe('none');
    expect(scan.byToolValue.get('Iota')).toBe('indirect');
  });

  it('사이드이펙트 import도 값으로 센다', () => {
    const { handlersDir } = fakeEngine({
      'handlers/a/handleKappa.ts': declares('Kappa', "import '@babamba2/mcp-abap-adt-clients';"),
    });

    expect(scanDelegation(handlersDir).byToolValue.get('Kappa')).toBe('direct');
  });

  it('구 소스가 없으면 빈 판정이다 — 없는 것을 `none`으로 적지 않는다', () => {
    const scan = scanDelegation(path.join(os.tmpdir(), 'sapkit-없는-핸들러'));

    expect(scan.byTool.size).toBe(0);
    expect(scan.sourceFiles).toBe(0);
  });
});

describe('채록본 무결성 — 구 엔진 실물이 아니라 handler-tree.json에 대고 확인한다', () => {
  // 판7.5에서 engine/ 이 레포에서 통째로 삭제됐다 — "실제 구 엔진에 대고" 회귀
  // 확인은 더 이상 성립하지 않는다(댈 실물이 없다). 이 블록의 뜻은 그래서
  // 바뀌었다: "구 엔진이 여전히 이렇게 판정하는가"가 아니라 "삭제 전 마지막으로
  // 굳힌 채록본(harness/old-surface/handler-tree.json, capture-handler-tree.mjs가
  // 만든다)이 여전히 같은 값을 내는가" — 즉 **채록본이 손으로 틀어지지 않았다**는
  // 무결성 확인이다. 단언 값(직접 위임 도구 셋 · 「없음」 0건)은 삭제 전과 동일하게
  // 유지한다 — 채록 자체가 삭제 직전 라이브 스캔의 산출물이기 때문이다.
  const handlerTreePath = path.resolve(__dirname, '../../old-surface/handler-tree.json');
  const scan = loadDelegationCapture(handlerTreePath);

  it('직접 위임하던 도구는 채록본에서도 `direct`로 남는다', () => {
    for (const tool of ['CreateClass', 'CreateDomain', 'CreateDataElement']) {
      expect(scan.byTool.get(tool)).toBe('direct');
    }
  });

  it('파일 수와 도구 수를 따로 센다 — 이 둘이 섞이면 46과 161이 모순으로 보인다', () => {
    // 파일 수는 도구 수와 다른 단위다. 도구 선언이 없는 파일도 파일로는 세어진다.
    expect(scan.directHandlerFiles).not.toBe([...scan.byTool.values()].filter((k) => k === 'direct').length);
  });

  it('`없음 0`이 성긴 계산의 결과가 아님을 값 경로로 뒷받침한다', () => {
    // 구 엔진에서는 어느 도구도 `@babamba2` 밖에 있지 않았다. 그것이 성긴 판정이
    // 아니라는 근거는 **값 경로로도 전부 닿는다**는 것이다 — 타입 경로로만
    // 닿는 도구가 하나라도 있으면 그만큼은 런타임 위임이 아니다.
    const typeOnly = [...scan.byTool.keys()].filter(
      (tool) => scan.byTool.get(tool) !== 'none' && scan.byToolValue.get(tool) === 'none',
    );

    expect([...scan.byTool.values()]).not.toContain('none');
    expect(typeOnly).toEqual([]);
  });

  it('구 엔진의 런타임 위임은 겉이 아니라 공용 계층에 있었다', () => {
    // 핸들러의 `@babamba2` 참조는 대부분 타입이었다. 값 참조는 훨씬 적고,
    // 그래서 "직접 위임하는 도구"를 갈아엎는 것만으로는 남의 코드가 안 걷혔다.
    expect(scan.directValueHandlerFiles).toBeLessThan(scan.directHandlerFiles);
  });
});
