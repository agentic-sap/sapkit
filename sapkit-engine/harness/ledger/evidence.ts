/**
 * 보유 증거를 **레포 안의 파일에서만** 긁어 모은다.
 *
 * 대장의 증거 열은 문서 서술이나 옛 콘솔 출력에서 오지 않는다. 지금 "재생 증거
 * 7종"이라 불리는 것은 과거 실행의 표준출력과 문서 문장으로만 존재한다 —
 * 재생 러너가 판정을 **레포에 커밋되는 파일**로 내보낸 적이 없기 때문이다.
 * 그래서 이 판의 대장은 그것을 **미기록**으로 센다. 없는 것을 있다고 적지 않는다.
 *
 * 급별로 어느 파일을 보는가:
 *
 * | 급 | 입력 |
 * |---|---|
 * | `replay` | 커밋된 재생 픽스처 + **커밋된 재생 판정 파일**(`evidence/replay/*.json`) |
 * | `contract` | 도구별 계약 시험 파일의 존재 + 최근 실행 결과 파일 |
 * | `attended` | `fixtures/attended-only/*.json` — attended 실기 기록 |
 * | `substitute` | 차이 장부 등재분이 지목하는 **시험 파일이 실재하는가** |
 *
 * `harness/replay-attended.mjs`는 SAP에 붙으므로 시험이 돌릴 수 없다. 그래서
 * 판정 파일의 형식과 직렬화를 그 스크립트 안에 두지 않고 여기로 뽑았다 —
 * 스크립트 안에 있으면 그 형식은 영영 시험되지 않는다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseFixture } from '../recorder';
import type { DivergenceEntry } from '../replay/divergences';
import type { ToolEvidenceInput } from '../replay/coverage';
import type {
  ProseNormalizedRecord,
  SequenceReplayResult,
  SequenceVerdict,
  StepVerdictKind,
} from '../replay/types';

// ── 재생 판정 파일 ───────────────────────────────────────────────────────────

/** 판정 파일이 놓이는 자리 — `sapkit-engine/` 기준. */
export const REPLAY_VERDICT_DIR = 'evidence/replay';

export const REPLAY_VERDICT_FORMAT_VERSION = 1;

const STEP_VERDICTS: readonly StepVerdictKind[] = [
  'match',
  'mismatch',
  'allowlisted-pass',
  'allowlisted-fail',
  'allowlisted-deferred',
  'not-run',
];

const SEQUENCE_VERDICTS: readonly SequenceVerdict[] = ['pass', 'fail', 'no-evidence'];

export interface ReplayVerdictStep {
  readonly index: number;
  readonly tool: string;
  readonly verdict: StepVerdictKind;
  /** 판정에 쓰인(또는 휴면이라 쓰이지 못한) 등재 항목. */
  readonly divergenceId: string | null;
  readonly detail: string | null;
}

/**
 * 커밋되는 재생 판정 한 건.
 *
 * **응답 본문과 차이 값은 담지 않는다.** 이 파일이 답해야 하는 질문은 "무엇이
 * 어떤 판정을 받았는가"뿐이고, 응답을 실으면 마스킹 검사를 다시 통과해야 하는
 * 두 번째 증거 파일이 생긴다. 차이의 내용은 실행 당시의 콘솔과 픽스처가 갖는다.
 */
export interface ReplayVerdictDocument {
  readonly formatVersion: number;
  readonly sequenceId: string;
  readonly description: string;
  /** 이 판정을 낸 시각. 픽스처의 채록 시각과 다르다. */
  readonly recordedAt: string;
  readonly verdict: SequenceVerdict;
  readonly recordedEngine: { readonly name: string; readonly version: string };
  readonly actualEngine: { readonly name: string; readonly version: string };
  readonly transportError: string | null;
  readonly steps: readonly ReplayVerdictStep[];
  readonly proseNormalized: readonly ProseNormalizedRecord[];
}

export function replayVerdictDocument(result: SequenceReplayResult, recordedAt: string): ReplayVerdictDocument {
  return {
    formatVersion: REPLAY_VERDICT_FORMAT_VERSION,
    sequenceId: result.sequenceId,
    description: result.description,
    recordedAt,
    verdict: result.verdict,
    recordedEngine: { name: result.recordedEngine.name, version: result.recordedEngine.version },
    actualEngine: { name: result.actualEngine.name, version: result.actualEngine.version },
    transportError: result.transportError,
    steps: result.steps.map((step) => ({
      index: step.index,
      tool: step.tool,
      verdict: step.verdict,
      divergenceId: step.divergenceId,
      detail: step.detail,
    })),
    proseNormalized: result.proseNormalized.map((record) => ({
      stepIndex: record.stepIndex,
      tool: record.tool,
      divergenceId: record.divergenceId,
      strictSignal: record.strictSignal,
    })),
  };
}

function badVerdict(source: string, message: string): never {
  throw new Error(`재생 판정 파일 형식 위반 (${source}): ${message}`);
}

export function parseReplayVerdict(text: string, source: string): ReplayVerdictDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    badVerdict(source, `JSON으로 읽지 못했다 — ${err instanceof Error ? err.message : String(err)}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    badVerdict(source, '최상위가 객체가 아니다');
  }
  const root = parsed as Record<string, unknown>;
  if (root['formatVersion'] !== REPLAY_VERDICT_FORMAT_VERSION) {
    badVerdict(source, `formatVersion 이 ${REPLAY_VERDICT_FORMAT_VERSION} 이 아니다`);
  }
  const sequenceId = root['sequenceId'];
  if (typeof sequenceId !== 'string' || sequenceId.trim() === '') badVerdict(source, 'sequenceId 가 없다');
  const verdict = root['verdict'];
  if (typeof verdict !== 'string' || !SEQUENCE_VERDICTS.includes(verdict as SequenceVerdict)) {
    badVerdict(source, `verdict 가 ${SEQUENCE_VERDICTS.join('·')} 밖이다: ${JSON.stringify(verdict)}`);
  }
  const rawSteps = root['steps'];
  if (!Array.isArray(rawSteps)) badVerdict(source, 'steps 가 배열이 아니다');

  const steps: ReplayVerdictStep[] = rawSteps.map((entry, index) => {
    const at = `steps[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) badVerdict(source, `${at} 가 객체가 아니다`);
    const step = entry as Record<string, unknown>;
    if (typeof step['tool'] !== 'string' || step['tool'].trim() === '') badVerdict(source, `${at} 에 tool 이 없다`);
    if (typeof step['verdict'] !== 'string' || !STEP_VERDICTS.includes(step['verdict'] as StepVerdictKind)) {
      badVerdict(source, `${at} 의 verdict 가 판정 어휘 밖이다: ${JSON.stringify(step['verdict'])}`);
    }
    return {
      index: typeof step['index'] === 'number' ? step['index'] : index,
      tool: step['tool'],
      verdict: step['verdict'] as StepVerdictKind,
      divergenceId: typeof step['divergenceId'] === 'string' ? step['divergenceId'] : null,
      detail: typeof step['detail'] === 'string' ? step['detail'] : null,
    };
  });

  const rawProse = Array.isArray(root['proseNormalized']) ? (root['proseNormalized'] as unknown[]) : [];
  const proseNormalized: ProseNormalizedRecord[] = rawProse.map((entry, index) => {
    const at = `proseNormalized[${index}]`;
    if (entry === null || typeof entry !== 'object') badVerdict(source, `${at} 가 객체가 아니다`);
    const record = entry as Record<string, unknown>;
    if (typeof record['tool'] !== 'string') badVerdict(source, `${at} 에 tool 이 없다`);
    if (typeof record['divergenceId'] !== 'string') badVerdict(source, `${at} 에 divergenceId 가 없다`);
    return {
      stepIndex: typeof record['stepIndex'] === 'number' ? record['stepIndex'] : index,
      tool: record['tool'],
      divergenceId: record['divergenceId'],
      strictSignal: record['strictSignal'] === true,
    };
  });

  const engine = (value: unknown): { name: string; version: string } => {
    const raw = (value ?? {}) as Record<string, unknown>;
    return {
      name: typeof raw['name'] === 'string' ? raw['name'] : '알 수 없음',
      version: typeof raw['version'] === 'string' ? raw['version'] : '알 수 없음',
    };
  };

  return {
    formatVersion: REPLAY_VERDICT_FORMAT_VERSION,
    sequenceId,
    description: typeof root['description'] === 'string' ? root['description'] : '',
    recordedAt: typeof root['recordedAt'] === 'string' ? root['recordedAt'] : '',
    verdict: verdict as SequenceVerdict,
    recordedEngine: engine(root['recordedEngine']),
    actualEngine: engine(root['actualEngine']),
    transportError: typeof root['transportError'] === 'string' ? root['transportError'] : null,
    steps,
    proseNormalized,
  };
}

/** 판정 파일 디렉터리를 이름순으로 읽는다. 없으면 0건 — 통과가 아니라 미기록이다. */
export function loadReplayVerdicts(dir: string): ReplayVerdictDocument[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => parseReplayVerdict(fs.readFileSync(path.join(dir, name), 'utf8'), path.join(dir, name)));
}

/**
 * 판정 파일을 커버리지 계산기가 먹는 모양으로 되편다.
 *
 * 계산기는 `replays`를 통해서만 재생 급을 채운다 — 등재 판정을 넷째 급으로
 * 보내고 이연을 무증거로 두는 규칙이 거기 들어 있기 때문이다. 그 규칙을 여기서
 * 다시 짜지 않으려고 계산기가 아는 모양으로 되편다. 대조에 쓰이지 않는 자리
 * (차이 값·출처 차이)는 비운다 — 판정 파일이 애초에 담지 않는다.
 */
export function replaysFromVerdicts(docs: readonly ReplayVerdictDocument[]): SequenceReplayResult[] {
  return docs.map((doc) => ({
    sequenceId: doc.sequenceId,
    description: doc.description,
    verdict: doc.verdict,
    recordedEngine: { ...doc.recordedEngine, protocolVersion: null, exposition: '' },
    actualEngine: { ...doc.actualEngine, protocolVersion: null, exposition: '' },
    steps: doc.steps.map((step) => ({
      index: step.index,
      tool: step.tool,
      verdict: step.verdict,
      differences: [],
      divergenceId: step.divergenceId,
      proseNormalized: null,
      detail: step.detail,
    })),
    sequenceDifferences: [],
    provenanceDifferences: [],
    proseNormalized: doc.proseNormalized,
    notes: [],
    transportError: doc.transportError,
  }));
}

// ── attended 실기 기록 ───────────────────────────────────────────────────────

/**
 * `fixtures/attended-only/*.json` — 재생할 수 없는 시퀀스의 실기 기록.
 *
 * `Create*` 계열은 두 번째 실행에서 "이미 있다"로 실패하므로 재생 자산이 아니다
 * (`fixtures/README.md`). 그 도구의 증거는 **대표 건 실기가 실제로 일어났다는
 * 기록**이고, 그 기록이 이 디렉터리의 픽스처다.
 */
export function attendedEvidenceFromFixtures(dir: string): ToolEvidenceInput[] {
  if (!fs.existsSync(dir)) return [];
  const out: ToolEvidenceInput[] = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    const fixture = parseFixture(fs.readFileSync(file, 'utf8'));
    for (const step of fixture.steps) {
      out.push({
        tool: step.tool,
        // 오류로 채록된 단계는 "돌긴 했다"의 기록이지 통과가 아니다.
        passed: !step.isError,
        detail: `${fixture.sequenceId} #${step.index}`,
      });
    }
  }
  return out;
}

/** 재생 픽스처가 건드리는 도구. 판정 파일이 없어도 "픽스처는 있다"를 말하기 위한 것. */
export function toolsInFixtures(dir: string): Set<string> {
  const out = new Set<string>();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const fixture = parseFixture(fs.readFileSync(path.join(dir, name), 'utf8'));
    for (const step of fixture.steps) out.add(step.tool);
  }
  return out;
}

// ── 계약 시험 ────────────────────────────────────────────────────────────────

/** 계약 시험 결과 파일이 놓이는 자리 — `sapkit-engine/` 기준. */
export const CONTRACT_RESULTS_PATH = 'evidence/contract/results.json';

const lowerFirst = (name: string): string => (name === '' ? name : `${name[0]?.toLowerCase() ?? ''}${name.slice(1)}`);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * 도구별 계약 시험 파일을 찾는다 — 규약은 `<모듈 디렉터리>/__tests__/<도구 소문자시작>.test.ts`.
 *
 * 돌려주는 경로는 `baseDir`(기본 = `toolsDir`의 두 단계 위 = `sapkit-engine/`)
 * 기준의 posix 상대 경로다. jest 실행 결과의 절대 경로와 맞대기 위해서다.
 */
export function findContractTestFiles(
  toolsDir: string,
  toolNames: readonly string[],
  baseDir: string = path.resolve(toolsDir, '..', '..'),
): Map<string, string> {
  const out = new Map<string, string>();
  if (!fs.existsSync(toolsDir)) return out;

  const byBasename = new Map<string, string>();
  for (const file of walk(toolsDir)) {
    if (!file.endsWith('.test.ts')) continue;
    if (!path.dirname(file).split(path.sep).includes('__tests__')) continue;
    byBasename.set(path.basename(file, '.test.ts'), path.relative(baseDir, file).split(path.sep).join('/'));
  }

  for (const tool of toolNames) {
    const found = byBasename.get(lowerFirst(tool));
    if (found !== undefined) out.set(tool, found);
  }
  return out;
}

/**
 * jest의 `--json` 보고서를 도구별 통과로 옮긴다.
 *
 * 보고서에 없는 시험 파일은 **증거가 아니다** — 안 돈 것을 통과로 세지 않는다.
 */
export function contractEvidenceFromJest(report: unknown, testFiles: ReadonlyMap<string, string>): ToolEvidenceInput[] {
  const raw = (report ?? {}) as Record<string, unknown>;
  const results = Array.isArray(raw['testResults']) ? (raw['testResults'] as unknown[]) : [];
  const byPath = new Map<string, string>();
  for (const entry of results) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record['name'] !== 'string' || typeof record['status'] !== 'string') continue;
    byPath.set(record['name'].split('\\').join('/'), record['status']);
  }

  const out: ToolEvidenceInput[] = [];
  for (const [tool, rel] of testFiles) {
    for (const [name, status] of byPath) {
      if (!name.endsWith(`/${rel}`) && name !== rel) continue;
      out.push({ tool, passed: status === 'passed', detail: rel });
      break;
    }
  }
  return out;
}

// ── 대체 기대 시험 ───────────────────────────────────────────────────────────

const PATHLIKE = /[\w./@-]+\.(?:ts|mjs|js)/g;

/**
 * 차이 장부 등재분이 지목하는 시험 파일이 **실재하는가**.
 *
 * 장부의 `substituteTest`는 파일 경로일 수도 있고 "어느 마일스톤이 소유한다"는
 * 산문일 수도 있다. 산문은 증거가 아니다 — 파일이 실재할 때만 센다.
 * 도구가 없는 등재분(계층 차이)은 도구 단위 요건이 아니라 건너뛴다.
 */
export function substituteEvidenceFromLedger(
  ledger: readonly DivergenceEntry[],
  repoRoot: string,
): ToolEvidenceInput[] {
  const out: ToolEvidenceInput[] = [];
  for (const entry of ledger) {
    if (entry.tool === null || entry.substituteTest === null) continue;
    const found = (entry.substituteTest.match(PATHLIKE) ?? []).find((token) =>
      fs.existsSync(path.join(repoRoot, token)),
    );
    if (found === undefined) continue;
    out.push({ tool: entry.tool, passed: true, detail: `${entry.id} — ${found}` });
  }
  return out;
}
