#!/usr/bin/env node
// check-doc-size.mjs — 웜 레이어 문서의 **줄 수 상한** 게이트.
// 설계 `docs/reference/designs/2026-08-23-project-brain-design.md` §3 (처방 2) · 판B.
// 판C에서 **대상을 인자로 받도록** 바꿨다 — 같은 게이트를 이 레포 밖(사용자 자기
// 프로젝트의 마감 스킬)에서도 돌리기 때문이다.
//
// ─────────────────────────── 이 게이트의 주장 ──────────────────────────────
// 세션마다 읽히는 문서가 불어나면 **살아있는 규칙이 과거 기록 사이에 묻힌다.**
// 판B 착수 시점의 실측이 그것이다 — `HANDOFF.md` 4,808줄 · `docs/RUN-PLAN.md`
// 1,964줄. 둘 다 「재개점」과 「판 큐」라는 짧은 실무 정보를 들라고 있는 문서인데,
// 그 앞에 수천 줄의 완료 기록이 쌓여 회수가 불안정해졌다.
//
// 그래서 이 게이트가 세는 것은 하나다:
//
//   **호출자가 지목한** 문서가 상한 줄 수를 넘지 않는다.
//
// ⚠ **무엇을 잴지는 이 파일이 정하지 않는다.** 대상·상한·아카이브 안내는 전부
// `--file` 인자로 들어오고, 이 레포 자신의 값(`HANDOFF.md` 500 · `docs/RUN-PLAN.md`
// 300)은 호출자인 `CLAUDE.md` 게이트 절과 CI(`offline-gates.yml`)에 적혀 있다.
// 판B의 원본은 그 둘을 상수로 박고 있었는데, 그러면 **남의 프로젝트에서 무인자로
// 돌릴 때 있지도 않은 파일을 「부재=위반」으로 잡아** 거짓 red가 난다. 그래서 무인자
// 실행은 위반이 아니라 **사용법 안내(exit 2)**로 갈린다.
//
// ⚠ **상한만 잰다.** 수술의 목표치(HANDOFF 300 · RUN-PLAN 200)는 여기 넣지 않는다 —
// 목표는 사람이 겨누는 값이고 게이트가 겨누면 정상 갱신마다 red가 된다. 상한을
// 옮기는 일은 호출자의 인자를 고치는 일이고, 그것은 계약 변경이므로 커밋에 사유를
// 남긴다.
//
// ── 사용법 ─────────────────────────────────────────────────────────────────
//   node check-doc-size.mjs [--root <dir>] --file <상대경로>:<상한>[:<아카이브경로>] ...
//
//   --root  **선택 · 기본값은 `process.cwd()`**(현재 작업 디렉터리). 이 레포의 게이트는
//           다른 게이트와 마찬가지로 레포 루트에서 도므로 적지 않는다. 음성시험이
//           복제 트리를 먹일 때 쓴다.
//   --file  **필수 · 반복**. 콜론으로 끊은 3항이며 앞 둘은 필수다 — 루트 기준 상대
//           경로 : 상한 줄 수 : (선택) 초과 안내에 실을 아카이브 디렉터리 경로.
//           세 번째를 생략하면 안내가 일반 문구로 나간다.
//
// ── 측정 정의 (이 구현이 정본이다) ─────────────────────────────────────────
//   물리 줄 수 = 파일 안의 **개행 문자(LF) 개수** — `wc -l` 동등.
//   ⚠ 그러므로 마지막 줄이 개행으로 끝나지 않으면 그 줄은 세지 않는다. 이 레포의
//     문서는 전부 개행으로 끝나므로 실무상 차이가 없고, 차이가 나더라도 **상한
//     게이트라 느슨해지는 쪽**(≤1줄)이라 안전 방향이다.
//   ⚠ PowerShell의 `Get-Content | Measure-Object -Line`은 **빈 줄을 세지 않는다** —
//     그 값으로 이 게이트를 예측하지 말 것(실제로 HANDOFF에서 101줄 어긋났다).
//
// 지목된 대상이 **없으면 위반**이다. 통과만 하는 장식 게이트가 되지 않기 위해서다.
// (반대로 지목하지 않은 파일은 있든 없든 쳐다보지 않는다 — 그래야 남의 프로젝트에서
// 조용하다.)
//
// exit 0 통과 / 1 위반(상한 초과 또는 대상 부재) / 2 사용법 오류(안내는 stderr)
import fs from 'node:fs';
import path from 'node:path';

// ── 인자 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const usageErrors = [];
const targets = [];
let rootArg = null;

for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--root') {
    const value = argv[i + 1];
    if (value === undefined) {
      usageErrors.push('`--root`에 값이 없다.');
      break;
    }
    rootArg = value;
    i += 1;
  } else if (argv[i] === '--file') {
    const value = argv[i + 1];
    if (value === undefined) {
      usageErrors.push('`--file`에 값이 없다.');
      break;
    }
    i += 1;
    // 3항 중 앞 둘만 고정으로 끊는다 — 아카이브 경로에 콜론이 들어와도 살려 둔다.
    const parts = value.split(':');
    const [file, max] = parts;
    if (!file || max === undefined || !/^\d+$/.test(max)) {
      usageErrors.push(
        `\`--file ${value}\` — 형식이 아니다. \`<상대경로>:<상한>[:<아카이브경로>]\`이고 상한은 정수다.`,
      );
      continue;
    }
    targets.push({
      file,
      max: Number(max),
      archive: parts.length > 2 ? parts.slice(2).join(':') : null,
    });
  }
}

// 무인자 = 「무엇을 재라는 것인지 못 들었다」이지 「위반」이 아니다.
if (!targets.length && !usageErrors.length) {
  usageErrors.push('`--file` 인자가 하나도 없다 — 잴 대상을 지목하지 않았다.');
}

if (usageErrors.length) {
  console.error('check-doc-size — 사용법 안내 (아무것도 측정하지 않았다 · 판정이 아니다)');
  for (const u of usageErrors) console.error('  · ' + u);
  console.error('');
  console.error('  node check-doc-size.mjs [--root <dir>] --file <상대경로>:<상한>[:<아카이브경로>] ...');
  console.error('');
  console.error('    --root  선택 — 스캔 루트. 기본값은 현재 작업 디렉터리.');
  console.error('    --file  필수 · 반복 — 잴 문서 하나. 세 번째 항(아카이브 경로)만 선택.');
  console.error('');
  console.error('  예) node check-doc-size.mjs --file HANDOFF.md:500:docs/reference/handoff-archive/');
  console.error('');
  console.error('  exit 0 = 전부 상한 이내 · exit 1 = 상한 초과 또는 대상 부재 · exit 2 = 이 화면');
  process.exit(2);
}

const ROOT = rootArg === null ? process.cwd() : path.resolve(rootArg);

/** 물리 줄 수 = LF 개수 (`wc -l` 동등). 위 「측정 정의」가 이 함수다. */
function countPhysicalLines(abs) {
  const buf = fs.readFileSync(abs);
  let n = 0;
  for (let i = 0; i < buf.length; i += 1) if (buf[i] === 0x0a) n += 1;
  return n;
}

const rows = [];
const fail = [];

for (const target of targets) {
  const abs = path.join(ROOT, ...target.file.split('/'));
  if (!fs.existsSync(abs)) {
    rows.push({ file: target.file, lines: null, max: target.max });
    fail.push(`${target.file} — 대상 파일이 없다. 개명·이동됐으면 호출자의 \`--file\` 인자를 함께 고칠 것.`);
    continue;
  }
  const lines = countPhysicalLines(abs);
  rows.push({ file: target.file, lines, max: target.max });
  if (lines > target.max) {
    // 이사 갈 자리는 호출자가 알려 준다. 안 알려 줬으면 일반 문구로 안내한다.
    const where = target.archive ? `\`${target.archive}\`로` : '아카이브 디렉터리로';
    fail.push(
      `${target.file} — ${lines}줄 (상한 ${target.max} · ${lines - target.max}줄 초과). ` +
        `줄이는 방법은 삭제가 아니라 **이사**다: 과거 기록을 ${where} ` +
        `§ 번호·블록인용 접두어를 보존한 채 옮기고, 남는 문서에는 아카이브 포인터 한 줄을 남긴다.`,
    );
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
console.log(`스캔 루트   : ${ROOT}`);
console.log(`측정 정의   : 물리 줄 수 = 개행(LF) 개수 · wc -l 동등`);
for (const r of rows) {
  const shown = r.lines === null ? '부재' : String(r.lines);
  const mark = r.lines === null || r.lines > r.max ? '❌' : 'OK';
  console.log(`  ${mark} ${r.file.padEnd(20)} ${shown.padStart(6)} / 상한 ${r.max}`);
}

if (fail.length) {
  console.log(`\n❌ 위반 ${fail.length}건:`);
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ 줄 수 게이트 통과 — 웜 레이어 문서가 상한 안에 있다');
