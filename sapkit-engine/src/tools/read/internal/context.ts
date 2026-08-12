/**
 * 의존 문맥 서두(dependency prologue) — `with_context`가 붙이는 블록.
 *
 * 소스에서 참조하는 클래스·인터페이스를 정규식 어림으로 골라(ABAP 파서가 아니다)
 * 각각의 **공개 계약만** 남기고 접어 한 덩이로 잇는다. 한 번의 호출로 주변
 * 서명까지 받게 하는 것이 목적이며, 개별 의존의 실패는 결코 본 읽기를 깨지
 * 않는다 — 못 가져온 것은 이유와 함께 `SKIPPED`에 남는다.
 */

import type { AdtClient } from '../../../adt';
import {
  adtStatusOf,
  bodyOf,
  objectSourcePath,
  readSourceText,
} from './adt';

/** 종류를 통틀어 돌려주는 의존의 최대 개수. */
export const MAX_SCAN_DEPENDENCIES = 15;
export const DEFAULT_CONTEXT_MAX_DEPS = 10;
export const MAX_CONTEXT_MAX_DEPS = 15;
const MAX_CONCURRENT_FETCHES = 5;

export interface AbapDependencies {
  classes: string[];
  interfaces: string[];
  functionModules: string[];
}

type DepKind = 'class' | 'interface' | 'fm';

const CLASS_PREFIX_RE = /^(ZCX_|CX_|ZCL_|YCL_|CL_)/;
const INTERFACE_PREFIX_RE = /^(ZIF_|YIF_|IF_)/;

/** 전행 `*` 주석과 인라인 `"` 주석을 걷어낸다. */
function stripComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      if (line.trimStart().startsWith('*')) return '';
      const index = line.indexOf('"');
      return index === -1 ? line : line.slice(0, index);
    })
    .join('\n');
}

/** 자기 자신에 대한 참조를 결과에서 빼기 위해 헤더에서 이름을 읽는다. */
function detectOwnName(source: string): string {
  const classMatch = source.match(/^\s*CLASS\s+(\w+)\s+(DEFINITION|IMPLEMENTATION)\b/im);
  if (classMatch?.[1]) return classMatch[1].toUpperCase();
  const interfaceMatch = source.match(/^\s*INTERFACE\s+(\w+)\b/im);
  if (interfaceMatch?.[1]) return interfaceMatch[1].toUpperCase();
  return '';
}

/**
 * 참조를 훑는다. 우선순위 순으로 모아 상한까지만 남긴다 —
 * 상속 > 인터페이스 구현 > TYPE REF TO > 정적 호출 > CALL FUNCTION > 그 밖.
 */
export function scanAbapDependencies(source: string): AbapDependencies {
  const cleaned = stripComments(source);
  const ownName = detectOwnName(cleaned);

  const candidates: Array<{ name: string; kind: DepKind; priority: number }> = [];
  const seen = new Set<string>();

  const push = (rawName: string, kind: DepKind, priority: number): void => {
    const name = rawName.toUpperCase();
    if (!name || name === ownName) return;
    const key = `${kind}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ name, kind, priority });
  };

  /** 접두사로 클래스/인터페이스를 가른다. 어느 쪽도 아니면 버린다. */
  const pushType = (rawName: string, priority: number): void => {
    const name = rawName.toUpperCase();
    if (INTERFACE_PREFIX_RE.test(name)) push(name, 'interface', priority);
    else if (CLASS_PREFIX_RE.test(name)) push(name, 'class', priority);
  };

  for (const m of cleaned.matchAll(/INHERITING\s+FROM\s+(\w+)/gi)) pushType(m[1] ?? '', 1);
  for (const m of cleaned.matchAll(/\bINTERFACES\s+(\w+)/gi)) pushType(m[1] ?? '', 2);
  for (const m of cleaned.matchAll(/TYPE\s+REF\s+TO\s+(\w+)/gi)) pushType(m[1] ?? '', 3);
  for (const m of cleaned.matchAll(/\b(\w+)=>/g)) pushType(m[1] ?? '', 4);
  for (const m of cleaned.matchAll(/CALL\s+FUNCTION\s+'([^']+)'/gi)) push(m[1] ?? '', 'fm', 5);
  for (const m of cleaned.matchAll(/\bNEW\s+(\w+)\s*\(/gi)) pushType(m[1] ?? '', 6);
  for (const m of cleaned.matchAll(/\bCAST\s+(\w+)\s*\(/gi)) pushType(m[1] ?? '', 6);
  for (const m of cleaned.matchAll(/\bRAISING\s+((?:\w+\s*)+)/gi)) {
    for (const word of (m[1] ?? '').trim().split(/\s+/)) pushType(word, 6);
  }
  for (const m of cleaned.matchAll(/\bTYPE\s+(\w+)\b/gi)) pushType(m[1] ?? '', 6);

  candidates.sort((a, b) => a.priority - b.priority);
  const capped = candidates.slice(0, MAX_SCAN_DEPENDENCIES);

  return {
    classes: capped.filter((c) => c.kind === 'class').map((c) => c.name),
    interfaces: capped.filter((c) => c.kind === 'interface').map((c) => c.name),
    functionModules: capped.filter((c) => c.kind === 'fm').map((c) => c.name),
  };
}

function stripCommentLines(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('*'))
    .join('\n');
}

/**
 * 클래스에서 `DEFINITION` 헤더와 `PUBLIC SECTION`만 남긴다. 기대한 구조가
 * 없으면(비정형 서식) 주석만 걷어낸 원문을 그대로 돌려준다.
 */
export function compressClass(source: string): string {
  const cleaned = stripCommentLines(source);

  const definition = cleaned.match(/CLASS\s+\S+\s+DEFINITION\b/i);
  if (!definition || definition.index === undefined) return cleaned.trim();

  const tail = cleaned.slice(definition.index);
  const end = tail.match(/ENDCLASS\s*\./i);
  if (!end || end.index === undefined) return cleaned.trim();

  const block = tail.slice(0, end.index + end[0].length);

  const publicSectionStart = block.match(/PUBLIC\s+SECTION\s*\./i);
  if (!publicSectionStart || publicSectionStart.index === undefined) return block.trim();

  const header = block.slice(0, publicSectionStart.index);
  const afterPublic = block.slice(publicSectionStart.index);

  const cut = afterPublic.match(/\b(PROTECTED|PRIVATE)\s+SECTION\s*\./i);
  let publicSection: string;
  if (cut && cut.index !== undefined) {
    publicSection = afterPublic.slice(0, cut.index);
  } else {
    const endInAfter = afterPublic.match(/ENDCLASS\s*\./i);
    publicSection =
      endInAfter && endInAfter.index !== undefined
        ? afterPublic.slice(0, endInAfter.index)
        : afterPublic;
  }

  return `${header}${publicSection}\nENDCLASS.`.trim();
}

/** 인터페이스는 이미 계약뿐이다 — 주석만 걷어낸다. */
export function compressInterface(source: string): string {
  return stripCommentLines(source).trim();
}

type DepResult =
  | { status: 'resolved'; kind: DepKind; name: string; contract: string }
  | { status: 'skipped'; kind: DepKind; name: string; reason: string };

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

/**
 * `source`가 참조하는 것들을 접어 서두 블록을 만든다. 의존이 없으면 빈 문자열.
 * **던지지 않는다** — 개별 실패는 `SKIPPED` 줄로 드러난다.
 */
export async function buildContextPrologue(
  client: AdtClient,
  source: string,
  maxDeps: number = DEFAULT_CONTEXT_MAX_DEPS,
): Promise<string> {
  const cappedMaxDeps = Math.max(0, Math.min(maxDeps, MAX_CONTEXT_MAX_DEPS));

  const dependencies = scanAbapDependencies(source);
  const tasks: Array<{ kind: DepKind; name: string }> = [
    ...dependencies.classes.map((name) => ({ kind: 'class' as const, name })),
    ...dependencies.interfaces.map((name) => ({ kind: 'interface' as const, name })),
    ...dependencies.functionModules.map((name) => ({ kind: 'fm' as const, name })),
  ].slice(0, cappedMaxDeps);

  if (tasks.length === 0) return '';

  const results = await mapWithConcurrency(
    tasks,
    MAX_CONCURRENT_FETCHES,
    async (task): Promise<DepResult> => {
      if (task.kind === 'fm') {
        return {
          status: 'skipped',
          kind: task.kind,
          name: task.name,
          reason:
            'function module — function group required to fetch source, not resolved by static analysis',
        };
      }

      try {
        const response = await readSourceText(
          client,
          objectSourcePath(task.kind, task.name),
          'active',
        );
        const raw = bodyOf(response);
        if (!raw) throw new Error('empty response');
        return {
          status: 'resolved',
          kind: task.kind,
          name: task.name,
          contract: task.kind === 'class' ? compressClass(raw) : compressInterface(raw),
        };
      } catch (error) {
        const status = adtStatusOf(error);
        const reason =
          status === 404
            ? 'not found'
            : status
              ? `HTTP ${status}`
              : error instanceof Error
                ? error.message
                : 'fetch failed';
        return { status: 'skipped', kind: task.kind, name: task.name, reason };
      }
    },
  );

  const resolved = results.filter(
    (result): result is Extract<DepResult, { status: 'resolved' }> =>
      result.status === 'resolved',
  );
  const skipped = results.filter(
    (result): result is Extract<DepResult, { status: 'skipped' }> => result.status === 'skipped',
  );

  const lines: string[] = [
    '* ===== DEPENDENCY CONTEXT (compressed public contracts) =====',
    `* ${resolved.length} dependencies resolved, ${skipped.length} failed/skipped`,
  ];
  for (const dependency of resolved) {
    lines.push('', `* ----- ${dependency.kind.toUpperCase()}: ${dependency.name} -----`, dependency.contract);
  }
  if (skipped.length > 0) {
    lines.push('', '* ----- SKIPPED -----');
    for (const dependency of skipped) {
      lines.push(`* ${dependency.name} (${dependency.kind}): ${dependency.reason}`);
    }
  }

  return lines.join('\n');
}
