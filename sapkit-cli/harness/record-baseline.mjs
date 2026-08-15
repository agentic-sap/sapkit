#!/usr/bin/env node
// record-baseline — 구 vsp를 몰아 코퍼스의 세 표면 판정을 떠서 `fixtures/baseline/`에 고정한다.
//
// 구 vsp가 은퇴하면 이 스크립트는 더 이상 돌지 않는다. 그때부터는 여기서 나온
// 기준 파일이 「구 vsp가 무엇을 어떻게 판정했는가」의 유일한 잔존 형태다.
// 채록 절차·재현 방법은 `RECORDING.md`.
//
// 사용:
//   node harness/record-baseline.mjs --vsp <vsp(.exe)> --parse-recorder <채록셈(.exe)>
//   (환경변수 VSP_BIN · VSP_PARSE_RECORDER 로도 준다)
//   선택: --out <디렉터리>(기본 fixtures/baseline) · --surface lint|analyze|parse (반복 가능)
//
// 출력은 **결정론적**이다 — 타임스탬프·호스트·경로 같은 휘발성 값을 한 글자도 담지
// 않는다. 두 번 돌려 바이트가 다르면 그것이 결함이다(README의 결정론 확인).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASELINE_DIR,
  CLI_ROOT,
  SURFACES,
  assertCorpusIsLF,
  listCorpusFiles,
  readNormalized,
} from './corpus.mjs';

const SCHEMA = 1;
const ANALYZE_TIMEOUT_MS = 60_000;

// --- 인자 ---------------------------------------------------------------

function parseArgs(argv) {
  const opts = { vsp: process.env.VSP_BIN || '', parseRecorder: process.env.VSP_PARSE_RECORDER || '', out: BASELINE_DIR, surfaces: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--vsp') opts.vsp = argv[++i];
    else if (a === '--parse-recorder') opts.parseRecorder = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--surface') opts.surfaces.push(argv[++i]);
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (opts.surfaces.length === 0) opts.surfaces = [...SURFACES];
  for (const s of opts.surfaces) {
    if (!SURFACES.includes(s)) throw new Error(`알 수 없는 표면: ${s} (${SURFACES.join('|')})`);
  }
  return opts;
}

// --- 표면 ⓐ lint --------------------------------------------------------

// 구 CLI 출력 한 줄: `<파일>:<행>:<열>: W|E [<규칙>] <메시지>`
// 메시지는 대조에서 제외한다(문구는 새 검사기가 새로 쓴다 — spec §3).
const LINT_SEVERITY = { W: 'Warning', E: 'Error' };

function recordLint(vsp, files) {
  const out = {};
  for (const rel of files) {
    const arg = `fixtures/corpus/${rel}`;
    const r = spawnSync(vsp, ['lint', '--file', arg], { cwd: CLI_ROOT, encoding: 'utf8' });
    if (r.error) throw new Error(`vsp lint 실행 실패 (${rel}): ${r.error.message}`);

    const prefix = `${arg}:`;
    const findings = [];
    for (const line of r.stdout.split('\n')) {
      const text = line.trimEnd();
      if (!text) continue;
      if (!text.startsWith(prefix)) {
        throw new Error(`vsp lint 출력 형식이 예상과 다르다 (${rel}): ${text}`);
      }
      const m = /^(\d+):(\d+): ([WE]) \[([a-z_]+)\] /.exec(text.slice(prefix.length));
      if (!m) throw new Error(`vsp lint 발견 행을 해석하지 못했다 (${rel}): ${text}`);
      findings.push({
        rule: m[4],
        line: Number(m[1]),
        col: Number(m[2]),
        severity: LINT_SEVERITY[m[3]],
      });
    }
    out[rel] = {
      exit_code: r.status === null ? -1 : r.status,
      findings: sortLint(findings),
    };
  }
  return out;
}

// 같은 (규칙, 행, 열, 심각도)가 2건 나올 수 있다(콜론 체인은 접두 토큰의 행·열을
// 공유한다). 그래서 집합이 아니라 **중복을 보존하는 다중집합**으로 고정한다 — 건수까지가
// 판정이다.
function sortLint(list) {
  return [...list].sort(
    (a, b) =>
      a.line - b.line || a.col - b.col || cmp(a.rule, b.rule) || cmp(a.severity, b.severity),
  );
}

function sortAnalyze(list) {
  return [...list].sort(
    (a, b) =>
      a.line - b.line || cmp(a.rule, b.rule) || cmp(a.severity, b.severity) || cmp(a.category, b.category),
  );
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// --- 표면 ⓑ analyze (MCP 도구 — CLI에 대응물이 없다) --------------------

// `AnalyzeABAPCode`는 구 vsp에서 CLI 명령이 아니라 MCP 도구로만 존재한다. 그래서
// `vsp --offline`(로컬 전용 · SAP 무접속)로 서버를 띄우고 stdio 왕복으로 부른다 —
// D-049 훅이 쓰던 것과 같은 경로다.
async function recordAnalyze(vsp, files) {
  const child = spawn(vsp, ['--offline'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const pending = new Map();
  let buf = '';
  let fatal = null;

  child.on('error', (e) => {
    fatal = e;
    for (const { reject } of pending.values()) reject(e);
    pending.clear();
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = pending.get(msg.id);
      if (waiter) {
        pending.delete(msg.id);
        waiter.resolve(msg);
      }
    }
  });

  let nextId = 1;
  const send = (obj) => child.stdin.write(`${JSON.stringify(obj)}\n`);
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      if (fatal) return reject(fatal);
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`vsp --offline 응답 시간 초과 (${method})`));
      }, ANALYZE_TIMEOUT_MS);
      timer.unref?.();
      pending.set(id, {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      send({ jsonrpc: '2.0', id, method, params });
    });

  try {
    await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sapkit-baseline-recorder', version: '1' },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const out = {};
    for (const rel of files) {
      const source = readNormalized(rel);
      const msg = await request('tools/call', {
        name: 'AnalyzeABAPCode',
        arguments: { source },
      });
      if (msg.error) throw new Error(`AnalyzeABAPCode 실패 (${rel}): ${JSON.stringify(msg.error)}`);
      const isError = msg.result?.isError === true;
      const text = msg.result?.content?.[0]?.text;
      if (typeof text !== 'string') throw new Error(`AnalyzeABAPCode 응답 형식이 예상과 다르다 (${rel})`);
      if (isError) throw new Error(`AnalyzeABAPCode가 오류를 돌려줬다 (${rel}): ${text}`);

      const result = JSON.parse(text);
      const findings = (result.findings ?? []).map((f) => ({
        rule: f.rule,
        line: f.line,
        severity: f.severity,
        category: f.category,
      }));
      // summary는 findings의 파생이므로 기준에서 뺀다(spec §3). rulesApplied는
      // 파생이 아니라 구성 계약이라 남긴다.
      out[rel] = { rules_applied: result.rulesApplied, findings: sortAnalyze(findings) };
    }
    return out;
  } finally {
    try {
      child.stdin.end();
    } catch {
      /* 종료 경로 — 무시 */
    }
    child.kill();
  }
}

// --- 표면 ⓒ parse (일회용 Go 채록 셈이 필요하다) ------------------------

// 구 `vsp parse` CLI는 문장의 **행 번호를 출력하지 않고** json 출력에는 이스케이프
// 결함이 있어, CLI 출력만으로는 (문장 유형, 행) 시퀀스를 뜰 수 없다. 그래서 vsp의
// 분류기 패키지를 그대로 불러 쓰는 일회용 Go 프로그램을 세션 스크래치에 띄워 쓴다.
// 그 프로그램은 **커밋하지 않는다** — 뜨는 방법은 RECORDING.md에 있다.
function recordParse(recorder, files) {
  const args = files.map((rel) => `fixtures/corpus/${rel}`);
  const r = spawnSync(recorder, [], { cwd: CLI_ROOT, encoding: 'utf8', input: `${args.join('\n')}\n` });
  if (r.error) throw new Error(`parse 채록 셈 실행 실패: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`parse 채록 셈이 비-0으로 끝났다 (exit ${r.status}): ${r.stderr}`);

  const raw = JSON.parse(r.stdout);
  const out = {};
  for (const rel of files) {
    const seq = raw[`fixtures/corpus/${rel}`];
    if (!Array.isArray(seq)) throw new Error(`parse 채록 결과에 ${rel}이 없다`);
    // 시퀀스이므로 정렬하지 않는다 — 순서 자체가 판정이다.
    out[rel] = { statements: seq.map((s) => ({ type: s.type, line: s.line })) };
  }
  return out;
}

// --- 기준 파일 쓰기 -----------------------------------------------------

const HEADERS = {
  lint: {
    surface: 'lint',
    producer: 'vsp lint --file fixtures/corpus/<경로>',
    source_of_truth: 'vsp/cmd/vsp/cli_extra.go runLint (규칙 7종)',
    normalized_as: '파일별 (규칙 키, 행, 열, 심각도) 다중집합 + exit code',
  },
  analyze: {
    surface: 'analyze',
    producer: 'vsp --offline (stdio MCP) → tools/call AnalyzeABAPCode { source }',
    source_of_truth: 'vsp/pkg/adt/codeanalysis.go allRules() (규칙 13종)',
    normalized_as: '파일별 (rule, line, severity, category) 다중집합 + rulesApplied',
  },
  parse: {
    surface: 'parse',
    producer: '일회용 Go 채록 셈 (abaplint.NewABAPFile → GetStatements) — 비커밋, RECORDING.md 참조',
    source_of_truth: 'vsp/pkg/abaplint/{lexer,statements,matcher}.go',
    normalized_as: '파일별 (문장 유형, 행) 시퀀스 — 순서 보존',
  },
};

const EXCLUDED = [
  '메시지·description·match·suggestion 문구 — 새 검사기가 새로 쓰므로 대조 대상이 아니다',
  'analyze의 summary — findings의 파생',
  'EOL — CRLF는 LF로 정규화한 뒤 판정한다',
];

function writeBaseline(outDir, surface, files) {
  const doc = {
    schema: SCHEMA,
    ...HEADERS[surface],
    excluded_from_comparison: EXCLUDED,
    file_count: Object.keys(files).length,
    files,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${surface}.json`), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

// --- main ---------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  assertCorpusIsLF();
  const files = listCorpusFiles();
  if (files.length === 0) throw new Error('코퍼스에 .abap 파일이 없다');

  const needsVsp = opts.surfaces.includes('lint') || opts.surfaces.includes('analyze');
  if (needsVsp) {
    if (!opts.vsp) throw new Error('vsp 바이너리 경로가 필요하다 — --vsp 또는 VSP_BIN');
    if (!existsSync(opts.vsp)) throw new Error(`vsp 바이너리를 찾을 수 없다: ${opts.vsp}`);
  }
  if (opts.surfaces.includes('parse')) {
    if (!opts.parseRecorder) throw new Error('parse 채록 셈 경로가 필요하다 — --parse-recorder 또는 VSP_PARSE_RECORDER (RECORDING.md)');
    if (!existsSync(opts.parseRecorder)) throw new Error(`parse 채록 셈을 찾을 수 없다: ${opts.parseRecorder}`);
  }

  for (const surface of SURFACES) {
    if (!opts.surfaces.includes(surface)) continue;
    let recorded;
    if (surface === 'lint') recorded = recordLint(opts.vsp, files);
    else if (surface === 'analyze') recorded = await recordAnalyze(opts.vsp, files);
    else recorded = recordParse(opts.parseRecorder, files);
    writeBaseline(opts.out, surface, recorded);
    console.log(`[record] ${surface}: ${files.length}개 파일 → ${join(opts.out, `${surface}.json`)}`);
  }
}

main().catch((e) => {
  console.error(`[record] ✗ ${e.message}`);
  process.exit(1);
});
