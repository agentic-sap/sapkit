#!/usr/bin/env node
/**
 * SessionStart advisory — point a fresh session at this project's resume point.
 *
 * A session that starts cold re-reads nothing and re-asks everything. sapkit's
 * answer is two ordinary Markdown files in the user's own project root:
 * `HANDOFF.md` says where the work got to, `RUN-PLAN.md` says what happens next.
 * This hook does one thing — it tells the session those files are there.
 *
 * It hands over a pointer, never the contents. The files can run to hundreds of
 * lines, and pasting them into every session start would spend the exact budget
 * this project measures weight in. So the injection is a handful of lines: read
 * that file, the queue is beside it, the `handoff` skill rewrites them at the
 * end.
 *
 * ── Whose file is it ────────────────────────────────────────────────────────
 * `HANDOFF.md` is a common enough name that a project may already have one that
 * has nothing to do with sapkit. So ownership is decided by a marker comment on
 * the first line of the templates — `<!-- sapkit:continuity -->` — looked for in
 * the first 20 lines, which leaves room for a title or a front-matter block
 * above it without opening the window wide enough to match a passing mention
 * deep in the body.
 *
 * The decision is deliberately fail-closed, and asymmetric:
 *
 *   HANDOFF.md   RUN-PLAN.md            result
 *   ──────────   ─────────────────────  ─────────────────────────────────────
 *   marked       marked                 inject, naming both files
 *   marked       absent                 inject, naming HANDOFF.md only
 *   marked       present but unmarked   silent
 *   unmarked     anything               silent
 *   absent       anything               silent
 *   unreadable   anything               silent
 *
 * One unmarked file of either name is enough to stay quiet: a same-named file we
 * did not set up means the two names have another owner here, and speaking would
 * be claiming somebody else's document. A read that fails, or a file we cannot
 * classify, counts as unmarked for the same reason — the honest answer to "we do
 * not know" is silence, not a guess.
 *
 * ── Advisory, never a gate ──────────────────────────────────────────────────
 * Nothing here can deny, block, or fail a session. Every path — no payload,
 * unparsable JSON, a missing field, an exception anywhere — ends in the same
 * silent pass, and the process always exits 0. A resume-point reminder that
 * could break a session start would cost far more than it is worth.
 *
 * The one warning it does raise is about size: past its cap a resume point stops
 * being a snapshot and turns into a log nobody rereads. The line names the file,
 * its length, its cap, and where the settled parts should go.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readStdin } from '../../lib/stdin.mjs';

// `{ continue: true, suppressOutput: true }` is the "nothing to say" answer:
// the session proceeds and the user sees no hook chatter.
const SILENT = JSON.stringify({ continue: true, suppressOutput: true });

// The ownership marker, verbatim from `interactive/assets/continuity/`. The
// templates carry it on line 1; that file set is the source of truth and this is
// a quotation of it.
const MARKER = '<!-- sapkit:continuity -->';

// How far into the file the marker is looked for. Wide enough for a heading or
// front matter above it, narrow enough that a body mention cannot promote a
// foreign file into ours.
const SCAN_LINES = 20;

// Line caps the templates state for themselves. A line is one LF byte, which is
// what `wc -l` counts and what the repo's own size gate measures.
const FILES = [
  { name: 'HANDOFF.md', cap: 500 },
  { name: 'RUN-PLAN.md', cap: 300 },
];

/**
 * Classify one candidate file: `marked`, `unmarked`, or `absent`.
 *
 * Only a missing file is `absent`. Every other failure — a directory in its
 * place, a permission error, undecodable bytes — lands on `unmarked`, the side
 * that keeps the hook quiet.
 */
function inspect(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    return { state: err?.code === 'ENOENT' ? 'absent' : 'unmarked', lines: 0 };
  }
  const head = text.split('\n', SCAN_LINES);
  const lines = text.split('\n').length - 1;
  return { state: head.some((line) => line.includes(MARKER)) ? 'marked' : 'unmarked', lines };
}

/** The pointer itself — short by contract, and never a line out of the files. */
function pointer(found) {
  const out = [
    `[SAPKIT CONTINUITY] This project keeps a sapkit resume point at HANDOFF.md — read it ` +
      `before starting work: it says where the project got to and what is still open.`,
  ];
  const queue = found['RUN-PLAN.md']?.state === 'marked';
  if (queue) {
    out.push('The work queue is in RUN-PLAN.md beside it.');
  }
  // "both" only reads as English when the queue file was just named; with a lone
  // HANDOFF.md the pronoun would have no antecedent.
  out.push(
    `The \`handoff\` skill (/sapkit:handoff on Claude Code) rewrites ${queue ? 'both' : 'it'} ` +
      `at the end of a session.`,
  );
  for (const { name, cap } of FILES) {
    const file = found[name];
    if (file?.state === 'marked' && file.lines > cap) {
      out.push(
        `${name} is ${file.lines} lines, past its ${cap}-line cap — relocate the settled parts ` +
          `to archive/ under this project's root, keeping only what is still live.`,
      );
    }
  }
  return out.join('\n');
}

async function main() {
  try {
    const raw = await readStdin();

    let data = {};
    if (raw.trim()) {
      try {
        data = JSON.parse(raw);
      } catch {
        // Unparsable payload: fall through with the empty object. The project
        // root then comes from `process.cwd()`, which is where Claude Code
        // launches a hook anyway.
      }
    }

    const root = typeof data?.cwd === 'string' && data.cwd ? data.cwd : process.cwd();

    const found = {};
    for (const { name } of FILES) found[name] = inspect(resolve(root, name));

    // Fail closed: our HANDOFF.md must be there, and neither name may be held by
    // a file we did not set up.
    const ours =
      found['HANDOFF.md'].state === 'marked' &&
      FILES.every(({ name }) => found[name].state !== 'unmarked');

    if (!ours) {
      console.log(SILENT);
      return;
    }

    console.log(
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: pointer(found),
        },
      }),
    );
  } catch {
    console.log(SILENT);
  }
}

main();
