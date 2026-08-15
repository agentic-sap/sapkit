// `sapkit check <dir>` — 프로젝트 정합. **신기능이다** (구 vsp에 대응물이 없다).
//
// 하는 일 하나: 디렉터리의 `.abap`을 전부 parse해서 `INCLUDE` 문을 모으고, 그 이름이
// 트리 안의 파일로 이어지는지 본다. 이름→파일 사상은 abapGit 명명 관례를 따른다
// (`<이름>.prog.abap` · `<이름>.fugr.abap` · `<이름>.abap`, 네임스페이스 `/`는 `#`).
//
// 판정은 셋으로 갈린다:
//   · 못 찾은 **Z·Y·$** 인클루드 → 결함(Error, exit 비-0). 프로젝트가 소유한 이름인데
//     트리에 없다는 뜻이라 배포하면 깨진다.
//   · 그 밖(표준 SAP 등) → **정보 수준만**. 트리에 없는 것이 정상이다.
//   · `INCLUDE … IF FOUND` → 없어도 된다는 선언이므로 **결함이 아니다.** 구 엔진 결함
//     13-13(선택적 인클루드를 결함으로 세던 것)의 교훈을 여기서 미리 막는다.
//
// **범위는 인클루드 해석까지다.** 서브루틴(PERFORM)·클래스·DDIC 참조는 보지 않는다.
// `INCLUDE STRUCTURE` · `INCLUDE TYPE`은 DDIC 구조 포함이라 인클루드 참조가 아니다.

import { readdirSync, statSync } from 'node:fs';
import { AbapFile, asciiUpper } from '../core';
import type { Statement } from '../core';
import { UsageError, parseArgs } from './args';
import { InputError, readSourceFile } from './io';
import { EXIT_FINDINGS, EXIT_OK } from './result';
import type { CommandResult } from './result';

export const CHECK_USAGE = 'check <dir>';

/** abapGit 파일명 꼬리 — 인클루드 이름에 붙여 볼 순서. */
const NAME_SUFFIXES = ['.prog.abap', '.fugr.abap', '.abap'];

/** 프로젝트가 소유하는 이름의 첫 글자. */
const PROJECT_NAMESPACE = ['Z', 'Y', '$'];

/** `INCLUDE` 뒤에 오면 인클루드 참조가 아닌 낱말 (DDIC 구조 포함). */
const NOT_A_REFERENCE = ['STRUCTURE', 'TYPE'];

interface IncludeReference {
  /** 보고에 쓰는 파일 경로 (`/` 구분 — 플랫폼마다 갈리지 않게 한다). */
  readonly file: string;
  readonly line: number;
  /** 원문 그대로의 인클루드 이름. */
  readonly name: string;
  readonly ifFound: boolean;
}

export function checkCommand(argv: readonly string[]): CommandResult {
  const args = parseArgs(argv, {});
  const root = readRoot(args.positionals);

  const files = listAbapFiles(root);
  const index = new Set(files.map((f) => lowerAscii(basenameOf(f))));

  const references: IncludeReference[] = [];
  for (const file of files) {
    references.push(...collectIncludes(file, new AbapFile(file, readSourceFile(file)).getStatements()));
  }

  const unresolved = references.filter((ref) => !isResolved(ref.name, index));
  const defects = unresolved.filter(isDefect);

  const stdout = unresolved.map((ref) => `${formatReference(ref)}\n`).join('');
  const stderr =
    `${root}: ${files.length} file(s), ${references.length} INCLUDE statement(s), ` +
    `${unresolved.length} unresolved, ${defects.length} of them defects\n`;

  return { stdout, stderr, code: defects.length > 0 ? EXIT_FINDINGS : EXIT_OK };
}

function readRoot(positionals: readonly string[]): string {
  const given = positionals[0];
  if (given === undefined) throw new UsageError(`usage: sapkit ${CHECK_USAGE}`);
  if (positionals.length > 1) {
    throw new UsageError(`sapkit ${CHECK_USAGE} takes exactly one directory (got ${positionals.length})`);
  }

  let isDirectory: boolean;
  try {
    isDirectory = statSync(given).isDirectory();
  } catch (err) {
    throw new InputError(`cannot read '${given}': ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isDirectory) throw new InputError(`'${given}' is not a directory — check inspects a project tree`);

  return given.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** 하위 폴더까지 훑어 `.abap`을 정렬된 순서로 모은다. 경로는 `/`로 잇는다. */
function listAbapFiles(root: string): string[] {
  const out: string[] = [];

  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && lowerAscii(entry.name).endsWith('.abap')) out.push(path);
    }
  };

  walk(root);
  return out;
}

/** 파일 하나의 `INCLUDE` 참조. DDIC 구조 포함은 걸러 낸다. */
function collectIncludes(file: string, statements: readonly Statement[]): IncludeReference[] {
  const out: IncludeReference[] = [];

  for (const stmt of statements) {
    if (stmt.type !== 'Include') continue;

    const name = stmt.tokens[1];
    if (name === undefined) continue;
    if (NOT_A_REFERENCE.includes(asciiUpper(name.str))) continue;

    out.push({ file, line: name.row, name: name.str, ifFound: hasIfFound(stmt) });
  }

  return out;
}

function hasIfFound(stmt: Statement): boolean {
  return stmt.tokens.some((token, i) => {
    if (i < 2 || asciiUpper(token.str) !== 'IF') return false;
    const next = stmt.tokens[i + 1];
    return next !== undefined && asciiUpper(next.str) === 'FOUND';
  });
}

/** 인클루드 이름이 트리 안의 파일로 이어지는가. */
function isResolved(name: string, index: ReadonlySet<string>): boolean {
  const base = lowerAscii(name).replace(/\//g, '#');
  return NAME_SUFFIXES.some((suffix) => index.has(`${base}${suffix}`));
}

/** 결함인가 — 프로젝트 네임스페이스이면서 `IF FOUND`가 아닌 것만. */
function isDefect(ref: IncludeReference): boolean {
  return !ref.ifFound && PROJECT_NAMESPACE.includes(asciiUpper(ref.name).charAt(0));
}

function formatReference(ref: IncludeReference): string {
  const defect = isDefect(ref);
  const why = ref.ifFound
    ? 'declared IF FOUND, so absence is allowed'
    : defect
      ? 'the project owns the Z/Y/$ namespace, so the file belongs here'
      : 'outside the Z/Y/$ namespace, so it is reported for information only';
  const name = asciiUpper(ref.name);
  return `${ref.file}:${ref.line}: ${defect ? 'E' : 'I'} [unresolved_include] INCLUDE ${name} has no file in this tree (${why})`;
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** ASCII 전용 소문자화 — 파일명 대조는 로케일에 흔들리면 안 된다. */
function lowerAscii(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : s.charAt(i);
  }
  return out;
}
