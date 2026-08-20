/**
 * 제작 계획 — **오브젝트 묶음 · 제작 순서 · 요구 증거 급의 정본.**
 *
 * 이 셋은 대장이 계산해 낼 수 있는 값이 아니다. 어느 도구를 어느 묶음으로
 * 묶고 어떤 순서로 지을지, 그리고 무엇을 요구 급으로 삼을지는 **사람이 정해
 * 레포에 싣는 판단**이다. 대장은 그 판단을 읽어 옮길 뿐이다.
 *
 * 파일은 아직 없다 — 그 판단을 산출하는 작업이 뒤에 온다. 그래서 여기서
 * 형식만 먼저 못박는다. **없을 때 대장은 죽지 않고 「미정」으로 낸다**:
 * 계획이 없다는 사실이 대장에 드러나는 편이, 그럴듯한 기본값으로 덮여
 * 정해진 것처럼 보이는 편보다 낫다.
 *
 * ## 형식
 *
 * ```json
 * {
 *   "formatVersion": 1,
 *   "bundles": [
 *     { "id": "class-read", "title": "클래스 읽기", "order": 1 }
 *   ],
 *   "tools": {
 *     "GetClass": { "bundle": "class-read", "requiredGrade": "replay" },
 *     "GetDomain": { "bundle": "domain", "requiredGrade": "contract", "downgradedFrom": "replay" }
 *   }
 * }
 * ```
 *
 * - `bundles` — 묶음의 목록. `order`가 **제작 순서**다. id·order 모두 겹칠 수
 *   없다. 순서가 겹치면 순서 노릇을 못 한다.
 * - `tools` — 도구 이름 → 어느 묶음인지 + **요구 증거 급**. 급은 주 급 셋
 *   (`replay`·`contract`·`attended`) 중 하나다. `substitute`(대체 기대 시험)는
 *   부가 요건이지 주 급이 아니라 여기 적을 수 없다 — 차이 장부가 소유한다.
 * - `downgradedFrom` — **요구를 낮춘 흔적**(D-092 ⓐ). 있으면 그 도구의 요구 급은
 *   원래 이 급이었고, 증거가 는 것이 아니라 요구가 내려간 것이다. 없으면 처음부터
 *   지금 급이었다. 이 칸이 없으면 다음 사람이 인하분을 「원래 계약이었구나」로 읽는다.
 * - 여기 없는 도구는 요구 급이 **정해지지 않은 것**이고, 대장은 계산기의
 *   기본값(사다리 3 = 계약 시험)을 쓰되 「미정」임을 표시한다.
 *
 * 형식이 어긋나면 **던진다**. 조용히 빈 계획으로 넘기면 오타 하나가 도구 전량을
 * 「미정」으로 되돌려 놓고도 초록으로 보인다.
 */
import * as fs from 'node:fs';

import type { PrimaryGrade } from '../replay/coverage';

/** 계획 파일의 위치 — `sapkit-engine/` 기준 상대 경로. */
export const BUILD_PLAN_PATH = 'harness/build-plan.json';

export const BUILD_PLAN_FORMAT_VERSION = 1;

/** 주 급 셋. 대체 기대 시험은 부가 요건이라 여기 없다. */
const PRIMARY_GRADES: readonly PrimaryGrade[] = ['replay', 'contract', 'attended'];

export interface PlanBundle {
  readonly id: string;
  readonly title: string;
  /** 제작 순서. 작을수록 먼저 짓는다. */
  readonly order: number;
}

export interface PlanEntry {
  readonly bundle: string;
  readonly requiredGrade: PrimaryGrade;
  /** 인하 전의 급. 인하가 아니면 `null`. */
  readonly downgradedFrom: PrimaryGrade | null;
}

export interface BuildPlan {
  readonly formatVersion: number;
  readonly bundles: readonly PlanBundle[];
  readonly tools: Readonly<Record<string, PlanEntry>>;
}

function fail(source: string, message: string): never {
  throw new Error(`제작 계획 형식 위반 (${source}): ${message}`);
}

function asRecord(value: unknown, source: string, at: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(source, `${at} 가 객체가 아니다`);
  }
  return value as Record<string, unknown>;
}

export function parseBuildPlan(text: string, source: string): BuildPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    fail(source, `JSON으로 읽지 못했다 — ${err instanceof Error ? err.message : String(err)}`);
  }

  const root = asRecord(parsed, source, '최상위');
  if (root['formatVersion'] !== BUILD_PLAN_FORMAT_VERSION) {
    fail(
      source,
      `formatVersion 이 ${BUILD_PLAN_FORMAT_VERSION} 이 아니다 (${JSON.stringify(root['formatVersion'])}) — ` +
        '뜻이 바뀐 파일을 옛 규칙으로 읽지 않는다',
    );
  }

  const rawBundles = root['bundles'];
  if (!Array.isArray(rawBundles)) fail(source, 'bundles 가 배열이 아니다');

  const bundles: PlanBundle[] = [];
  const seenId = new Set<string>();
  const seenOrder = new Set<number>();
  rawBundles.forEach((entry, index) => {
    const at = `bundles[${index}]`;
    const bundle = asRecord(entry, source, at);
    const id = bundle['id'];
    const title = bundle['title'];
    const order = bundle['order'];
    if (typeof id !== 'string' || id.trim() === '') fail(source, `${at} 에 id 가 없다`);
    if (typeof title !== 'string' || title.trim() === '') fail(source, `${at} 에 title 이 없다`);
    if (typeof order !== 'number' || !Number.isInteger(order)) fail(source, `${at} 의 order 가 정수가 아니다`);
    if (seenId.has(id)) fail(source, `묶음 id 가 겹친다: ${id}`);
    if (seenOrder.has(order)) fail(source, `묶음 order 가 겹친다: ${order} — 순서가 순서 노릇을 못 한다`);
    seenId.add(id);
    seenOrder.add(order);
    bundles.push({ id, title, order });
  });

  const rawTools = asRecord(root['tools'], source, 'tools');
  const tools: Record<string, PlanEntry> = {};
  for (const [tool, value] of Object.entries(rawTools)) {
    const at = `tools.${tool}`;
    const entry = asRecord(value, source, at);
    const bundle = entry['bundle'];
    const requiredGrade = entry['requiredGrade'];
    if (typeof bundle !== 'string' || !seenId.has(bundle)) {
      fail(source, `${at} 가 없는 묶음을 가리킨다: ${JSON.stringify(bundle)}`);
    }
    if (typeof requiredGrade !== 'string' || !PRIMARY_GRADES.includes(requiredGrade as PrimaryGrade)) {
      fail(
        source,
        `${at} 의 requiredGrade 가 주 급 셋(${PRIMARY_GRADES.join('·')}) 밖이다: ${JSON.stringify(requiredGrade)}`,
      );
    }
    const downgradedFrom = entry['downgradedFrom'];
    if (downgradedFrom !== undefined) {
      if (typeof downgradedFrom !== 'string' || !PRIMARY_GRADES.includes(downgradedFrom as PrimaryGrade)) {
        fail(
          source,
          `${at} 의 downgradedFrom 이 주 급 셋(${PRIMARY_GRADES.join('·')}) 밖이다: ${JSON.stringify(downgradedFrom)}`,
        );
      }
      if (downgradedFrom === requiredGrade) {
        fail(source, `${at} 의 downgradedFrom 이 requiredGrade 와 같다 — 인하가 아닌 것을 인하로 적었다`);
      }
    }
    tools[tool] = {
      bundle,
      requiredGrade: requiredGrade as PrimaryGrade,
      downgradedFrom: downgradedFrom === undefined ? null : (downgradedFrom as PrimaryGrade),
    };
  }

  return { formatVersion: BUILD_PLAN_FORMAT_VERSION, bundles, tools };
}

/** 파일이 없으면 `null` — 「미정」의 근거다. 있으면 형식을 검사해 읽는다. */
export function loadBuildPlan(file: string): BuildPlan | null {
  if (!fs.existsSync(file)) return null;
  return parseBuildPlan(fs.readFileSync(file, 'utf8'), file);
}

/** 커버리지 계산기에 그대로 넘길 수 있는 도구 → 주 급 표. */
export function requiredGradesFrom(plan: BuildPlan): Record<string, PrimaryGrade> {
  return Object.fromEntries(Object.entries(plan.tools).map(([tool, entry]) => [tool, entry.requiredGrade]));
}

/** 이 도구가 속한 묶음. 계획에 없으면 `null`. */
export function bundleOf(plan: BuildPlan | null, tool: string): PlanBundle | null {
  if (plan === null) return null;
  const entry = plan.tools[tool];
  if (entry === undefined) return null;
  return plan.bundles.find((b) => b.id === entry.bundle) ?? null;
}
