/**
 * 요구 증거 급의 사다리 — **그리고 D-092 ⓐ의 인하.**
 *
 * 산식 자체는 `harness/build-plan.mjs`가 부르지만, 코드는 여기 산다. 이유는
 * 하나다: `.mjs` 스크립트 안에 있는 판정은 **jest가 못 잡는다.** 사다리는 도구
 * 186종의 요구를 정하는 자리라 조용히 틀리면 대장 전체가 조용히 틀린다.
 *
 * ## 사다리 (높은 것이 이긴다)
 *
 * | # | 조건 | 주 급 |
 * |---|---|---|
 * | ① | `Create*` · `Delete*` | `attended` — 재생이 원리상 불가하다 |
 * | ② | 실사용 호출 > 0 **이고** 얼린 관측 목록 안 | `replay` |
 * | ②' | 실사용 호출 > 0 인데 목록 **밖** | `contract` — **인하**(D-092 ⓐ) |
 * | ③ | 그 밖 (호출 0) | `contract` — 인하가 아니다 |
 *
 * ②'와 ③은 결과가 같아도 **다른 사실**이다. ②'는 「원래 재생 대조를 요구했는데
 * 판6이 끝나도록 재생 자산이 생기지 않아 요구를 낮춘 것」이고 ③은 「처음부터
 * 계약 시험이었던 것」이다. 그래서 ②'만 `downgradedFrom`을 달아 내보낸다 —
 * 달지 않으면 다음 사람이 「원래 계약이었구나」로 읽는다.
 *
 * ## 얼린 관측을 쓰는 이유 — 자기충족 구조를 막는다
 *
 * ②의 「목록 안」을 매 실행마다 `fixtures/`를 다시 훑어 판정하면, **증거를 못
 * 만들수록 요구가 저절로 낮아진다.** 픽스처를 지우면 그 도구의 요구가 조용히
 * 내려가고, 대장은 아무 일도 없었던 것처럼 초록이다. 그래서 관측을 한 번 뽑아
 * `harness/phase6-exercised.json`으로 얼리고 산식은 **그 파일만** 읽는다.
 * 다시 뽑는 것은 사람의 판단이고 커밋에 남는다(`harness/phase6-exercised.mjs`).
 *
 * 얼린 파일이 없거나 깨졌으면 **던진다**(fail-closed). 조용히 인하 없이 넘어가면
 * 산식이 인하 전으로 되돌아간 채 `build-plan.json`을 다시 써 버리고, 그 파일을
 * 읽는 다음 사람은 인하가 집행된 줄 안다.
 */
import * as fs from 'node:fs';

import type { PrimaryGrade } from '../replay/coverage';

/** 얼린 관측 파일의 자리 — `sapkit-engine/` 기준 상대 경로. */
export const PHASE6_EXERCISED_PATH = 'harness/phase6-exercised.json';

/** 형식 이름. 뜻이 바뀐 파일을 옛 규칙으로 읽지 않기 위해 못 박는다. */
export const PHASE6_EXERCISED_SCHEMA = 'sapkit-phase6-exercised/1';

/** 얼린 관측 — 「판6까지 레포 안 픽스처가 실제로 건드린 도구」. */
export interface Phase6Exercised {
  /** 관측을 뽑은 날. 산식이 도는 날이 아니다. */
  readonly capturedAt: string;
  /** 관측을 뽑은 커밋. 무엇을 훑었는지의 정확한 좌표다. */
  readonly capturedCommit: string;
  readonly tools: ReadonlySet<string>;
}

/** 한 도구의 요구 급 판정. */
export interface GradeVerdict {
  readonly grade: PrimaryGrade;
  /** 인하 전의 급. 인하가 아니면 `null`. */
  readonly downgradedFrom: PrimaryGrade | null;
}

function fail(source: string, message: string): never {
  throw new Error(`얼린 관측 형식 위반 (${source}): ${message}`);
}

export function parsePhase6Exercised(text: string, source: string): Phase6Exercised {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    fail(source, `JSON으로 읽지 못했다 — ${err instanceof Error ? err.message : String(err)}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(source, '최상위가 객체가 아니다');
  }
  const root = parsed as Record<string, unknown>;

  if (root['schema'] !== PHASE6_EXERCISED_SCHEMA) {
    fail(source, `schema 가 ${PHASE6_EXERCISED_SCHEMA} 가 아니다 (${JSON.stringify(root['schema'])})`);
  }

  const capturedAt = root['capturedAt'];
  const capturedCommit = root['capturedCommit'];
  if (typeof capturedAt !== 'string' || capturedAt.trim() === '') fail(source, 'capturedAt 이 없다');
  if (typeof capturedCommit !== 'string' || capturedCommit.trim() === '') fail(source, 'capturedCommit 이 없다');

  const raw = root['tools'];
  if (!Array.isArray(raw)) fail(source, 'tools 가 배열이 아니다');

  const tools = new Set<string>();
  raw.forEach((name, index) => {
    if (typeof name !== 'string' || name.trim() === '') fail(source, `tools[${index}] 가 도구 이름이 아니다`);
    if (tools.has(name)) fail(source, `tools 에 같은 이름이 두 번 있다: ${name}`);
    tools.add(name);
  });

  const sorted = [...tools].sort();
  if (sorted.some((name, index) => raw[index] !== name)) {
    fail(source, 'tools 가 정렬돼 있지 않다 — 손으로 끼워 넣은 흔적이다');
  }

  // 빈 목록은 「관측했더니 아무것도 없었다」가 아니라 **관측이 깨진 것**이다.
  // 그대로 통과시키면 요구 급 `replay` 전량이 인하된다 — 자기충족의 극단.
  if (tools.size === 0) fail(source, 'tools 가 비었다 — 전량 인하로 이어지므로 거부한다');

  return { capturedAt, capturedCommit, tools };
}

/**
 * 얼린 관측을 읽는다. **없으면 던진다** — 인하가 조용히 사라지는 것을 막는다.
 */
export function loadPhase6Exercised(file: string): Phase6Exercised {
  if (!fs.existsSync(file)) {
    throw new Error(
      `얼린 관측이 없다: ${file}\n` +
        '   · 이 파일 없이 산식을 돌리면 D-092 ⓐ의 인하가 통째로 사라진 계획이 나온다.\n' +
        '   · `node harness/phase6-exercised.mjs` 로 뽑아라 (다시 얼리는 것은 사람의 판단이다).',
    );
  }
  return parsePhase6Exercised(fs.readFileSync(file, 'utf8'), file);
}

/**
 * 사다리 — 높은 것이 이긴다.
 *
 * @param calls 실사용 호출 횟수(`harness/usage-census.json`).
 * @param exercised 얼린 관측의 도구 집합. **매번 새로 훑은 집합을 넘기지 마라** —
 *   그러면 픽스처를 지우는 것만으로 요구가 내려간다.
 */
export function gradeOf(tool: string, calls: number, exercised: ReadonlySet<string>): GradeVerdict {
  if (/^(Create|Delete)/.test(tool)) return { grade: 'attended', downgradedFrom: null };
  if (calls > 0) {
    if (exercised.has(tool)) return { grade: 'replay', downgradedFrom: null };
    return { grade: 'contract', downgradedFrom: 'replay' };
  }
  return { grade: 'contract', downgradedFrom: null };
}
