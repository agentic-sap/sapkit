#!/usr/bin/env node
// check-conventions-note.mjs 음성시험 — 게이트가 '통과만 하는 장식'이 아님을 증명한다.
//
// 임시 디렉터리에 최소 트리(쪽지 정본 + 지시서 사본 4 + conventions 출처 파일)를
// 합성해 `--root=`로 먹이고, 게이트가 **정말 거부하는지** 본다. 원본 트리는 건드리지
// 않는다. SAP 무접촉 · 오프라인.
//
// 고정하는 것:
//   ⑴ 정상 트리                                → PASS  (면제 줄 3종 · 출처 둘 단 줄 포함)
//   ⑵ 사본 한 글자 변형                         → FAIL  (사본 파일 · 줄 번호 지목)
//   ⑶ 출처 장 이름 오타                         → FAIL
//   ⑷ 출처 표식 없는 규칙 줄                    → FAIL
//   ⑷-b 출처 없는 들여쓴 하위 글머리            → FAIL  (들여써도 규칙 줄)
//   ⑸ 출처 파일이 conventions/에 없음           → FAIL
//   ⑹ 같은 이름 파일이 modules/common/에만 있음 → FAIL  (conventions/만 본다)
//   ⑺ 출처 둘 중 둘째만 틀림                    → FAIL  (둘 다 검사한다)
//   ⑻ 줄 상한 초과(71줄)                        → FAIL
//   ⑼ 줄 상한 경계(70줄)                        → PASS
//   ⑽ 바이트 상한 초과(줄은 적게)               → FAIL
//   ⑾ 정본 표식 누락                            → FAIL  (「표식 부재」)
//   ⑿ 사본 표식 누락                            → FAIL
//   ⒀ 사본 표식 중복                            → FAIL
//   ⒁ begin만 있고 end 없음                     → FAIL  (짝 안 맞음)
//   ⒂ CRLF 사본 vs LF 정본                      → PASS  (줄 끝은 정규화)
//   ⒃ --canonical-only + 사본 불일치            → PASS  (①을 건너뛴다)
//   ⒄ --canonical-only + 정본 형식 위반         → FAIL  (②~④는 정본에 그대로)
//   ⒅ 모르는 인자                               → exit 2
//   ⒆ 정본 파일 부재                            → FAIL
//
// exit 0 전부 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-conventions-note.mjs');

const BEGIN = '<!-- sapkit:conventions-note:begin -->';
const END = '<!-- sapkit:conventions-note:end -->';
const CONV = 'interactive/core/knowledge/abap/conventions';
const CANONICAL = `${CONV}/clean-code-note.md`;
const COPIES = [
  'interactive/core/procedures/create-program.md',
  'interactive/core/procedures/create-object.md',
  'interactive/core/procedures/modify-object.md',
  'interactive/core/procedures/review-checklist.md',
];

// 출처 파일 — 장 제목 몇 개. `## ` 장만 출처가 될 수 있다.
const SOURCES = {
  'clean-code.md': '# Clean code\n\n## Open SQL\n\ntext\n\n## Naming\n\ntext\n\n### Sub heading\n',
  'naming-conventions.md': '# Naming\n\n##   Prefixes   \n\ntext\n',
};

// 정상 본문 — 면제 줄 3종(빈 줄 · 소제목 · 굵은 소제목 · 탈출구 평문)과 출처 둘 단 줄을 포함한다.
const GOOD_BODY = [
  '## 작법 쪽지',
  '',
  '**SQL**',
  '- SELECT * 금지, 필요한 필드만 [clean-code.md § Open SQL]',
  '- 변수 접두어는 규약대로 [clean-code.md § Naming] [naming-conventions.md § Prefixes]',
  '',
  '이 쪽지에 없는 경우는 원문 장을 찾아 읽는다.',
].join('\n');

let pass = 0;
let fail = 0;

/** 표식 쌍으로 감싼 블록 — 사본은 앞뒤로 지시서 본문이 붙는다. */
function block(body) {
  return `${BEGIN}\n${body}\n${END}`;
}

function canonicalText(body) {
  return `# 쪽지 정본\n\n설명 문단.\n\n${block(body)}\n`;
}

function copyText(name, body) {
  return `# ${name}\n\n앞 단락.\n\n${block(body)}\n\n뒤 단락.\n`;
}

/**
 * 트리를 만든다. opts로 조각을 갈아 끼운다:
 *   body            — 정본 본문
 *   canonical       — 정본 파일 전체 텍스트(지정하면 body보다 우선 · null이면 파일 없음)
 *   copies          — { [상대경로]: 전체 텍스트 } 덮어쓰기
 *   extra           — { [상대경로]: 텍스트 } 추가 파일
 */
function buildTree(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-note-'));
  const write = (rel, text) => {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  const body = opts.body ?? GOOD_BODY;
  for (const [name, text] of Object.entries(SOURCES)) write(`${CONV}/${name}`, text);
  const canon = opts.canonical === undefined ? canonicalText(body) : opts.canonical;
  if (canon !== null) write(CANONICAL, canon);
  for (const rel of COPIES) {
    const override = opts.copies?.[rel];
    write(rel, override ?? copyText(path.basename(rel), body));
  }
  for (const [rel, text] of Object.entries(opts.extra ?? {})) write(rel, text);
  return root;
}

function runArgs(args) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [GATE, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  [ok ] ${label}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  }
}

/** 트리를 돌려 exit를 보고, extra(r)로 문구까지 본 뒤 치운다. */
function expect(label, root, want, extra, flags = []) {
  const r = runArgs([`--root=${root}`, ...flags]);
  check(label, r.code === want, `기대 exit ${want} / 실제 ${r.code}\n${r.out}`);
  if (extra) extra(r);
  fs.rmSync(root, { recursive: true, force: true });
}

const P0 = COPIES[0];

// ⑴ 정상
expect('⑴ 정상 트리 (면제 줄 · 출처 둘)', buildTree(), 0);

// ⑵ 사본 한 글자 변형 — 「SELECT」의 한 글자만 바꾼다
{
  const mutated = GOOD_BODY.replace('SELECT *', 'SELECT +');
  expect(
    '⑵ 사본 한 글자 변형',
    buildTree({ copies: { [P0]: copyText('create-program.md', mutated) } }),
    1,
    (r) => {
      check('   └ 사유가 그 사본 파일을 지목한다', r.out.includes('create-program.md'));
      // 사본 파일에서 본문 둘째 규칙 줄 = begin 표식이 5행이니 9행
      check('   └ 사유에 줄 번호가 있다', /create-program\.md:9\b/.test(r.out), r.out);
    },
  );
}

// ⑶ 장 이름 오타
expect(
  '⑶ 출처 장 이름 오타',
  buildTree({ body: GOOD_BODY.replace('§ Open SQL]', '§ Open SQl]') }),
  1,
  (r) => check('   └ 사유가 오타 난 장 이름을 말한다', r.out.includes('Open SQl')),
);

// ⑷ 출처 표식 없는 규칙 줄
expect(
  '⑷ 출처 표식 없는 규칙 줄',
  buildTree({ body: `${GOOD_BODY}\n- 출처를 잊은 규칙` }),
  1,
  (r) => check('   └ 사유가 정본 파일을 지목한다', r.out.includes('clean-code-note.md')),
);

// ⑷-b 출처 없는 들여쓴 하위 글머리 — 들여써도 규칙 줄이다
expect(
  '⑷-b 출처 없는 들여쓴 하위 글머리',
  buildTree({ body: `${GOOD_BODY}\n  - 들여써서 숨은 규칙` }),
  1,
  (r) => check('   └ 사유가 출처 표식 누락이다', r.out.includes('출처 표식')),
);

// ⑸ 출처 파일 부재
expect(
  '⑸ 출처 파일이 conventions/에 없음',
  buildTree({ body: `${GOOD_BODY}\n- 없는 파일 [no-such-file.md § Open SQL]` }),
  1,
  (r) => check('   └ 사유가 그 파일 이름을 말한다', r.out.includes('no-such-file.md')),
);

// ⑹ modules/common/에만 있는 파일 — 보지 않는다
expect(
  '⑹ 같은 이름 파일이 modules/common/에만 있음',
  buildTree({
    body: `${GOOD_BODY}\n- 공통 모듈 [common-only.md § Shared]`,
    extra: {
      'interactive/core/knowledge/abap/modules/common/common-only.md': '# x\n\n## Shared\n',
    },
  }),
  1,
);

// ⑺ 출처 둘 중 둘째만 틀림
expect(
  '⑺ 출처 둘 중 둘째만 틀림',
  buildTree({ body: GOOD_BODY.replace('§ Prefixes]', '§ Prefix]') }),
  1,
  (r) => check('   └ 사유가 둘째 출처를 말한다', r.out.includes('Prefix')),
);

/** n줄짜리 본문 — 전부 출처 단 규칙 줄. */
function rules(n) {
  return Array.from({ length: n }, (_, i) => `- 규칙 ${i + 1} [clean-code.md § Naming]`).join('\n');
}

// ⑻ 줄 상한 초과
expect('⑻ 줄 상한 초과 (71줄)', buildTree({ body: rules(71) }), 1, (r) =>
  check('   └ 사유가 줄 수를 말한다', r.out.includes('71')),
);

// ⑼ 줄 상한 경계
expect('⑼ 줄 상한 경계 (70줄)', buildTree({ body: rules(70) }), 0);

// ⑽ 바이트 상한 초과 — 3줄인데 한 줄이 아주 길다
{
  const long = `- ${'가'.repeat(3600)} [clean-code.md § Naming]`; // 한글 3바이트 × 3600 ≈ 10,800
  expect('⑽ 바이트 상한 초과 (줄은 적게)', buildTree({ body: `${GOOD_BODY}\n${long}` }), 1, (r) =>
    check('   └ 사유가 바이트를 말한다', r.out.includes('바이트')),
  );
}

// ⑾ 정본 표식 누락
expect(
  '⑾ 정본 표식 누락',
  buildTree({ canonical: `# 쪽지 정본\n\n${GOOD_BODY}\n` }),
  1,
  (r) => check('   └ 사유가 「표식 부재」다', r.out.includes('표식 부재')),
);

// ⑿ 사본 표식 누락
expect(
  '⑿ 사본 표식 누락',
  buildTree({ copies: { [COPIES[2]]: '# modify-object\n\n표식 없는 지시서.\n' } }),
  1,
  (r) => check('   └ 사유가 그 사본을 지목한다', r.out.includes('modify-object.md')),
);

// ⒀ 사본 표식 중복
expect(
  '⒀ 사본 표식 중복',
  buildTree({
    copies: { [COPIES[3]]: `${copyText('review-checklist.md', GOOD_BODY)}\n${block(GOOD_BODY)}\n` },
  }),
  1,
  (r) => check('   └ 사유가 「중복」을 말한다', r.out.includes('중복')),
);

// ⒁ begin만 있음
expect(
  '⒁ begin만 있고 end 없음',
  buildTree({ copies: { [COPIES[1]]: `# create-object\n\n${BEGIN}\n${GOOD_BODY}\n` } }),
  1,
  (r) => check('   └ 사유가 create-object.md를 지목한다', r.out.includes('create-object.md')),
);

// ⒂ CRLF 사본
expect(
  '⒂ CRLF 사본 vs LF 정본',
  buildTree({ copies: { [P0]: copyText('create-program.md', GOOD_BODY).replace(/\n/g, '\r\n') } }),
  0,
);

// ⒃ --canonical-only — 사본 불일치를 무시한다
expect(
  '⒃ --canonical-only + 사본 불일치',
  buildTree({ copies: { [P0]: copyText('create-program.md', 'X') } }),
  0,
  null,
  ['--canonical-only'],
);

// ⒄ --canonical-only — 정본 형식 위반은 그대로 잡는다
expect(
  '⒄ --canonical-only + 정본 출처 표식 누락',
  buildTree({ body: `${GOOD_BODY}\n- 출처를 잊은 규칙` }),
  1,
  null,
  ['--canonical-only'],
);

// ⒅ 모르는 인자
{
  const r = runArgs(['--bogus']);
  check('⒅ 모르는 인자 → exit 2', r.code === 2, `기대 exit 2 / 실제 ${r.code}`);
  check('   └ 출력이 사용법 안내이지 위반 판정이 아니다', r.out.includes('사용법') && !r.out.includes('❌'), r.out);
}

// ⒆ 정본 파일 부재
expect('⒆ 정본 파일 부재', buildTree({ canonical: null }), 1, (r) =>
  check('   └ 사유가 정본 경로를 말한다', r.out.includes('clean-code-note.md')),
);

console.log(`\n통과 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
