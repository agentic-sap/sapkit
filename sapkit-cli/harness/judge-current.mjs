// judge-current — **새 CLI**로 판정을 떠서 기준 파일과 같은 형태(RECORDING.md §형식)로
// 돌려준다. 채록기(`record-baseline.mjs`)의 짝이다 — 저쪽이 구 vsp를 몰고, 이쪽이 새
// 검사기를 몬다. 둘의 산출물이 같은 형태라서 `compare-baseline.mjs`로 바로 맞댈 수 있다.
//
// 쓰는 곳 둘:
//   · `gates/corpus-baseline.mjs` — 커밋 코퍼스 47파일을 기준과 맞대는 상설 게이트
//   · 광역 대조 — 커밋하지 않는 외부 ABAP 표본을 구 vsp와 나란히 돌릴 때 (RECORDING.md)
//
// 그래서 파일 목록을 인자로 받는다. 코퍼스에 묶여 있지 않다.

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLI_ROOT, SURFACES } from './corpus.mjs';

const require = createRequire(import.meta.url);

const DIST_ENTRY = join(CLI_ROOT, 'dist', 'src', 'cli', 'main.js');
const SRC_DIR = join(CLI_ROOT, 'src');

/** 구 CLI 출력의 심각도 한 글자 → 기준 파일의 이름. */
const LINT_SEVERITY = { W: 'Warning', E: 'Error' };

// --- 빌드 ---------------------------------------------------------------

function newestSourceMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestSourceMtime(path));
    else if (entry.name.endsWith('.ts')) newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest;
}

function distIsStale() {
  let built;
  try {
    built = statSync(DIST_ENTRY).mtimeMs;
  } catch {
    return true; // 아직 빌드하지 않았다
  }
  // 소스가 더 새로우면 낡은 `dist/`를 판정에 쓰게 된다 — 고친 코드를 대조하지 않고
  // green을 내는 가장 흔한 거짓 통과 경로라서 여기서 막는다.
  return newestSourceMtime(SRC_DIR) > built;
}

/** `dist/`가 없거나 낡았으면 세운다. `dist/`는 커밋하지 않으므로 새 클론에서도 돌아야 한다. */
export function ensureBuilt() {
  if (!distIsStale()) return;
  const tsc = join(CLI_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  const r = spawnSync(process.execPath, [tsc, '-p', join(CLI_ROOT, 'tsconfig.json')], {
    cwd: CLI_ROOT,
    stdio: 'inherit',
  });
  if (r.error) throw new Error(`빌드를 실행하지 못했다 (npm ci 를 먼저 돌렸는가): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`빌드가 비-0으로 끝났다 (exit ${r.status})`);
}

/** 새 CLI의 `run(argv)`를 돌려준다. 프로세스를 띄우지 않고 같은 코드 경로를 돈다. */
export function loadRun() {
  ensureBuilt();
  const mod = require(DIST_ENTRY);
  if (typeof mod.run !== 'function') throw new Error(`${DIST_ENTRY}에 run()이 없다`);
  return mod.run;
}

// --- 표면별 판정 ---------------------------------------------------------

function judgeLint(run, path) {
  const result = run(['lint', path]);
  const prefix = `${path}:`;
  const findings = [];
  for (const line of result.stdout.split('\n')) {
    const text = line.trimEnd();
    if (!text) continue;
    if (!text.startsWith(prefix)) throw new Error(`sapkit lint 출력 형식이 예상과 다르다 (${path}): ${text}`);
    const m = /^(\d+):(\d+): ([WE]) \[([a-z_]+)\] /.exec(text.slice(prefix.length));
    if (!m) throw new Error(`sapkit lint 발견 행을 해석하지 못했다 (${path}): ${text}`);
    findings.push({ rule: m[4], line: Number(m[1]), col: Number(m[2]), severity: LINT_SEVERITY[m[3]] });
  }
  return { exit_code: result.code, findings };
}

function judgeAnalyze(run, path) {
  const result = run(['analyze', path]);
  if (result.code !== 0) throw new Error(`sapkit analyze가 비-0으로 끝났다 (${path}): ${result.stderr}`);
  const doc = JSON.parse(result.stdout);
  return {
    rules_applied: doc.rulesApplied,
    findings: (doc.findings ?? []).map((f) => ({
      rule: f.rule,
      line: f.line,
      severity: f.severity,
      category: f.category,
    })),
  };
}

function judgeParse(run, path) {
  const result = run(['parse', '--format', 'json', path]);
  if (result.code !== 0) throw new Error(`sapkit parse가 비-0으로 끝났다 (${path}): ${result.stderr}`);
  // 시퀀스이므로 정렬하지 않는다 — 순서 자체가 판정이다.
  return { statements: JSON.parse(result.stdout).map((s) => ({ type: s.type, line: s.line })) };
}

const JUDGE = { lint: judgeLint, analyze: judgeAnalyze, parse: judgeParse };

/**
 * 파일 여럿을 한 표면으로 판정한다.
 *
 * @param {{key: string, path: string}[]} entries `key`는 판정 문서의 키(POSIX 상대 경로),
 *   `path`는 CLI에 넘길 경로. lint 출력의 앞머리가 `path`이므로 둘을 갈라 둔다.
 * @returns 기준 파일의 `files` 객체와 같은 형태
 */
export function judgeSurface(surface, entries, run = loadRun()) {
  const judge = JUDGE[surface];
  if (!judge) throw new Error(`알 수 없는 표면: ${surface}`);
  const out = {};
  for (const { key, path } of entries) out[key] = judge(run, path);
  return out;
}

/** 세 표면을 한 번에. `compare-baseline.mjs`가 바로 먹는 문서 형태로 돌려준다. */
export function judgeAll(entries, run = loadRun()) {
  const docs = {};
  for (const surface of SURFACES) {
    const files = judgeSurface(surface, entries, run);
    docs[surface] = { schema: 1, surface, file_count: Object.keys(files).length, files };
  }
  return docs;
}
