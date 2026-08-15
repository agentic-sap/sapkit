/**
 * 위임형 판정 — **구 도구가 남의 패키지에 얼마나 깊이 기대고 있는가.**
 *
 * 이 열이 있는 이유는 하나다: 재생 대조를 미룬 도구에게는 **참조 원본의 깊이가
 * 유일한 정확성 근거**다. 다음 세션은 이 열을 보고 "겉 핸들러만 읽고 지어도
 * 되는가, 안쪽 패키지까지 읽어야 하는가"를 정한다.
 *
 * 그래서 겉 핸들러의 `@babamba2` 한 줄만 보면 안 된다. 겉은 공용 헬퍼만 부르고
 * 그 헬퍼가 `@babamba2`를 부르는 도구가 있다 — 그것을 「없음」으로 적으면
 * **겉만 읽고 짓게 만든다.** 판정을 셋으로 나누는 이유가 이것이다.
 *
 * | 판정 | 뜻 |
 * |---|---|
 * | `direct` | 그 도구의 핸들러 파일이 `@babamba2/*`를 직접 참조한다 |
 * | `indirect` | 핸들러는 직접 참조하지 않지만, `engine/src` 안의 상대 import를 따라가면 닿는다 |
 * | `none` | 어느 경로로도 닿지 않는다 — 겉만 읽어도 되는 도구다 |
 *
 * 도달 판정은 **역방향 BFS**로 한다. 씨앗은 `@babamba2`를 직접 쓰는 파일이고,
 * 거기서 "나를 import 하는 파일"을 거슬러 올라간다. 정방향 DFS로 하면 순환
 * import에서 방문 표시와 결과 메모가 얽히는데, 역방향 BFS는 방문 집합 하나로
 * 순환이 저절로 풀린다. 구 소스는 우리가 고칠 수 없으니 순환이 없다고 가정하지
 * 않는다.
 *
 * **구 부품은 읽기만 한다.**
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type DelegationKind = 'direct' | 'indirect' | 'none';

export interface DelegationScan {
  /** 도구 이름 → 판정. 구 소스가 없으면 빈 표이고, 그때 대장은 「미상」으로 낸다. */
  readonly byTool: ReadonlyMap<string, DelegationKind>;
  /**
   * 같은 판정을 **값 참조만** 씨앗으로 삼아 다시 낸 것.
   *
   * `import type`으로만 닿는 것은 컴파일 타임 의존이라 "런타임을 남이 돌린다"는
   * 뜻이 아니다. 둘을 함께 내야 「없음 0」이 계산이 성긴 탓인지 실제로 전부
   * 남의 코드를 돌리는 것인지 **구별할 수 있다.**
   */
  readonly byToolValue: ReadonlyMap<string, DelegationKind>;
  /** 훑은 소스 파일 수. */
  readonly sourceFiles: number;
  /** 핸들러 파일 중 `@babamba2`를 **직접** 쓰는 파일 수. 도구 수와 단위가 다르다. */
  readonly directHandlerFiles: number;
  /** 그중 타입이 아니라 **값**으로 쓰는 파일 수. */
  readonly directValueHandlerFiles: number;
}

const BABAMBA = /@babamba2/;

/**
 * `@babamba2`를 가리키는 import/export 문 하나. 절(clause)을 따로 잡아
 * `import type …`인지 본다 — 타입 전용은 런타임 위임이 아니다.
 */
const BABAMBA_STATEMENT = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)from\s*['"]@babamba2[^'"]*['"]/g;

/** 사이드이펙트 import — 절이 없어도 런타임에 실행된다. */
const BABAMBA_SIDE_EFFECT = /(?:^|\n)\s*import\s*['"]@babamba2[^'"]*['"]/;

/** `import`·`export … from`·`require(...)`·동적 `import(...)`의 대상 문자열. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const TOOL_NAME = /export const TOOL_DEFINITION[^{]*=\s*{\s*name:\s*['"]([^'"]+)['"]/;

interface SourceNode {
  readonly babamba: boolean;
  /** 타입이 아니라 **값**으로 `@babamba2`를 쓰는가 — 런타임 위임. */
  readonly babambaValue: boolean;
  readonly toolName: string | null;
  readonly specifiers: readonly string[];
}

function walkTypeScript(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkTypeScript(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function readNode(file: string): SourceNode {
  const text = fs.readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  SPECIFIER.lastIndex = 0;
  let hit: RegExpExecArray | null;
  while ((hit = SPECIFIER.exec(text)) !== null) {
    const spec = hit[1];
    // 패키지 이름은 여기서 따라가지 않는다 — `@babamba2` 자체는 위의 텍스트
    // 검사가 이미 잡았고, 그 밖의 패키지는 이 레포 안에 소스가 없다.
    if (spec !== undefined && spec.startsWith('.')) specifiers.push(spec);
  }
  let babambaValue = BABAMBA_SIDE_EFFECT.test(text);
  BABAMBA_STATEMENT.lastIndex = 0;
  let statement: RegExpExecArray | null;
  while ((statement = BABAMBA_STATEMENT.exec(text)) !== null) {
    if (!/^\s*type\s/.test(statement[1] ?? '')) babambaValue = true;
  }

  return {
    babamba: BABAMBA.test(text),
    babambaValue,
    toolName: TOOL_NAME.exec(text)?.[1] ?? null,
    specifiers,
  };
}

/**
 * 상대 지정자를 실제 파일로 푼다.
 *
 * 구 소스는 확장자 없는 `'../lib/utils'`와 node16식 `'../utils/x.js'`를 섞어
 * 쓴다. 둘 다 같은 `.ts`로 가야 한다 — 한쪽만 풀면 사슬이 조용히 끊기고,
 * 끊긴 사슬은 「없음」이라는 **틀린 안전 신호**가 된다.
 */
function resolveSpecifier(fromFile: string, spec: string, known: ReadonlySet<string>): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base.endsWith('.ts') ? base : null,
    base.endsWith('.js') ? `${base.slice(0, -3)}.ts` : null,
    `${base}.ts`,
    path.join(base, 'index.ts'),
  ];
  for (const candidate of candidates) {
    if (candidate !== null && known.has(candidate)) return candidate;
  }
  return null;
}

/**
 * @param handlersDir 도구 선언(`TOOL_DEFINITION`)이 사는 곳.
 * @param srcRoot import를 따라갈 범위. 기본은 `handlersDir`의 부모(= `engine/src`) —
 *   공용 헬퍼(`lib/`·`utils/`)가 그 아래 있어야 간접 위임이 잡힌다.
 */
export function scanDelegation(handlersDir: string, srcRoot?: string): DelegationScan {
  const empty: DelegationScan = {
    byTool: new Map(),
    byToolValue: new Map(),
    sourceFiles: 0,
    directHandlerFiles: 0,
    directValueHandlerFiles: 0,
  };
  if (!fs.existsSync(handlersDir)) return empty;

  const root = srcRoot ?? path.resolve(handlersDir, '..');
  const scanRoot = fs.existsSync(root) ? root : handlersDir;

  const files = walkTypeScript(scanRoot);
  const known = new Set(files);
  const nodes = new Map<string, SourceNode>(files.map((file) => [file, readNode(file)]));

  // 역방향 인접: 대상 → 그것을 import 하는 파일들.
  const importers = new Map<string, string[]>();
  for (const [file, node] of nodes) {
    for (const spec of node.specifiers) {
      const target = resolveSpecifier(file, spec, known);
      if (target === null || target === file) continue;
      const list = importers.get(target);
      if (list === undefined) importers.set(target, [file]);
      else list.push(file);
    }
  }

  // 씨앗에서 거슬러 올라간다. 방문 집합 하나로 순환이 풀린다.
  const closure = (seed: (node: SourceNode) => boolean): Set<string> => {
    const reaches = new Set<string>();
    const queue: string[] = [];
    for (const [file, node] of nodes) {
      if (!seed(node)) continue;
      reaches.add(file);
      queue.push(file);
    }
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const importer of importers.get(current) ?? []) {
        if (reaches.has(importer)) continue;
        reaches.add(importer);
        queue.push(importer);
      }
    }
    return reaches;
  };

  const reachesAny = closure((node) => node.babamba);
  const reachesValue = closure((node) => node.babambaValue);

  const byTool = new Map<string, DelegationKind>();
  const byToolValue = new Map<string, DelegationKind>();
  let directHandlerFiles = 0;
  let directValueHandlerFiles = 0;
  const handlersPrefix = path.resolve(handlersDir) + path.sep;
  for (const [file, node] of nodes) {
    if (!file.startsWith(handlersPrefix)) continue;
    if (node.babamba) directHandlerFiles += 1;
    if (node.babambaValue) directValueHandlerFiles += 1;
    if (node.toolName === null) continue;
    byTool.set(node.toolName, node.babamba ? 'direct' : reachesAny.has(file) ? 'indirect' : 'none');
    byToolValue.set(
      node.toolName,
      node.babambaValue ? 'direct' : reachesValue.has(file) ? 'indirect' : 'none',
    );
  }

  return { byTool, byToolValue, sourceFiles: files.length, directHandlerFiles, directValueHandlerFiles };
}
