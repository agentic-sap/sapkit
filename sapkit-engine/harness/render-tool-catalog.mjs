#!/usr/bin/env node
/**
 * tool-catalog 생성기 — 등록점이 유일한 입력이다.
 *
 * `interactive/server/tool-catalog/`의 네 파일은 **기계 생성물**이다. 그 전에는 사람이
 * 도구 이름을 손으로 옮겨 적었고, 맞는지 재는 게이트가 없어 카탈로그가 조용히 낡을 수
 * 있었다. 이 스크립트가 그 둘을 함께 닫는다 — 카탈로그를 등록점에서 만들고 `--check`가
 * 어긋남을 잡는다.
 *
 * ## 입력은 등록점 하나다
 *
 * `dist/src/tools/registry.js`의 `TOOL_REGISTRY`에서 이름만 읽는다. 번들을 띄워
 * `tools/list`를 받는 길도 있으나 그쪽 표면은 **프로파일 활성 여부에 따라 달라진다**
 * (프로그램·화면 계열은 프로파일이 있어야 동적으로 뜬다). 등록점은 그 조건과 무관하게
 * 전량을 정적으로 갖고 있어 프로파일 없는 CI에서도 같은 답이 나온다.
 *
 * ## 분류는 이름이 정한다
 *
 * 세 갈래(read / write / runtime)와 그 안의 절은 전부 이름 규칙으로 결정된다. 규칙은
 * 아래 `classify()`와 `SECTIONS`에 있고 그것이 이 파일의 유일한 판단이다.
 *
 * ## 행 데이터 도구 둘은 목록에서 뺀다
 *
 * `GetTableContents`·`GetSqlQuery`는 호출마다 사람 승인을 받는 도구다. 섹션 목록에
 * 넣으면 그 목록을 권한 템플릿에 그대로 붙이는 소비자가 둘을 자동승인 대상으로 만든다.
 * 그래서 섹션 파일에서 빼고, 인덱스에는 **왜 뺐는지와 함께** 이름을 남긴다.
 *
 * 사용법:
 *   node harness/render-tool-catalog.mjs           # 생성 (npm run build 뒤)
 *   node harness/render-tool-catalog.mjs --check   # 대조만, 어긋나면 exit 1
 *
 * ## 이 파일은 라이브러리이기도 하다
 *
 * `gates/catalog.mjs`가 `build()`를 그대로 불러 판정한다 — 생성 로직을 게이트가 다시
 * 짜면 둘이 갈라지고, 갈라진 순간 게이트는 카탈로그가 아니라 자기 사본을 지킨다.
 * 그래서 아래 CLI 실행부는 **직접 실행됐을 때만** 돈다(`import.meta.url` ↔
 * `process.argv[1]`). 가드가 없으면 게이트가 import 하는 것만으로 파일을 덮어쓰거나
 * 프로세스를 죽인다.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENGINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG_DIR = join(ENGINE_ROOT, '..', 'interactive', 'server', 'tool-catalog');
const REGISTRY = join(ENGINE_ROOT, 'dist', 'src', 'tools', 'registry.js');

/** 호출마다 사람 승인을 받는 도구 — 섹션 파일에서 제외한다. */
const PROMPT_GATED = ['GetTableContents', 'GetSqlQuery'];

/** runtime 갈래이지만 `Runtime` 접두어가 아닌 것들. */
const RUNTIME_BY_NAME = new Set(['RunUnitTest', 'ValidateServiceBinding', 'ReloadProfile']);

const WRITE_PREFIX = /^(Create|Update|Delete|Activate|Patch|Release|Write)/;

function classify(name) {
  if (name.startsWith('Runtime') || RUNTIME_BY_NAME.has(name)) return 'runtime';
  if (WRITE_PREFIX.test(name)) return 'write';
  return 'read';
}

/** 갈래별 절 — 배열 순서가 곧 출력 순서이고, 앞선 절이 이름을 먼저 가져간다. */
const SECTIONS = {
  read: [
    { title: 'Get*', match: (n) => n.startsWith('Get') },
    { title: 'Read*', match: (n) => n.startsWith('Read') },
    { title: 'Check* / List* / Search* / Describe* / Grep*', match: () => true },
  ],
  write: [
    { title: 'Create*', match: (n) => n.startsWith('Create') },
    { title: 'Update*', match: (n) => n.startsWith('Update') },
    { title: 'Delete*', match: (n) => n.startsWith('Delete') },
    { title: 'Activate*', match: (n) => n.startsWith('Activate') },
    { title: 'Patch*', match: (n) => n.startsWith('Patch') },
    { title: 'Release*', match: (n) => n.startsWith('Release') },
    { title: 'Write*', match: () => true },
  ],
  runtime: [
    { title: 'Runtime* — Dump / Profiler / Diagnostics', match: (n) => n.startsWith('Runtime') },
    { title: 'Unit Test Execution & Validation', match: (n) => n === 'RunUnitTest' || n === 'ValidateServiceBinding' },
    { title: 'Server Session Control', match: () => true },
  ],
};

function banner() {
  return [
    '<!--',
    '  GENERATED FILE — do not edit by hand.',
    '  Source: the engine tool registry (sapkit-engine/src/tools/registry.ts).',
    '  Regenerate: node harness/render-tool-catalog.mjs   (from sapkit-engine/, after npm run build)',
    '  Gate: the 「카탈로그」 gate inside `npm run gates` (sapkit-engine/gates/catalog.mjs).',
    '        `node harness/render-tool-catalog.mjs --check` makes the same comparison by hand.',
    '-->',
    '',
  ].join('\n');
}

const NAMING = [
  'Tools are listed by **bare capability name**. Each harness maps those names to its',
  'own tool identifiers — see the [capability vocabulary](../../core/vocabulary.md)',
  '(Claude Code, for instance, prefixes `mcp__<plugin-namespace>__`).',
].join('\n');

function renderSection(title, names) {
  return `## ${title}\n\n${names.map((n) => `- \`${n}\``).join('\n')}\n`;
}

function renderPart(kind, names, heading, blurb, extra) {
  const out = [
    banner(),
    `# SAP MCP Tool Catalog — ${heading}\n`,
    `${blurb}\n`,
    `Part of [sapkit-mcp-tools.md](sapkit-mcp-tools.md).

${NAMING}
`,
  ];
  if (kind === 'read') {
    out.push(
      `**Not listed here (prompt-gated, never auto-approved)**: ${PROMPT_GATED.map((n) => `\`${n}\``).join(', ')}.\nThe index file explains why.\n`
    );
  }
  let rest = [...names];
  for (const { title, match } of SECTIONS[kind]) {
    const picked = rest.filter(match);
    rest = rest.filter((n) => !match(n));
    if (picked.length) out.push(renderSection(title, picked));
  }
  if (rest.length) throw new Error(`분류되지 않은 ${kind} 도구: ${rest.join(', ')}`);
  if (extra) out.push(extra);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function renderIndex(counts, total) {
  const listed = counts.read + counts.write + counts.runtime;
  return `${banner()}
# SAP MCP Tool Catalog

The MCP tool surface the bundled SAP ADT server exposes. Since 2026-08-19 that
server is this repository's own \`sapkit-engine\` (D-095), and these files are
generated from its tool registry — so the catalog and the shipped surface cannot
drift apart without the gate noticing.

${NAMING}

**Who reads this**: adapter exposure presets (Codex \`--exposition\`), permission
policy classification ([verification-policy](../../core/policies/verification-policy.md) ·
[vocabulary](../../core/vocabulary.md)), and any procedure that needs to walk the
whole surface by operation class.

## Section files

| File | Categories | Count |
|---|---|---:|
| [sapkit-mcp-tools-read.md](sapkit-mcp-tools-read.md) | Get\\*, Read\\*, Check\\*/List\\*/Search\\*/Describe\\*/Grep\\* | ${counts.read} |
| [sapkit-mcp-tools-write.md](sapkit-mcp-tools-write.md) | Create\\*, Update\\*, Delete\\*, Activate\\*/Patch\\*/Release\\*/Write\\* | ${counts.write} |
| [sapkit-mcp-tools-runtime.md](sapkit-mcp-tools-runtime.md) | Runtime\\*, execution, session control | ${counts.runtime} |

**Registered tools**: ${total}. **Listed above**: ${listed}. **Prompt-gated (never
auto-approve)**: ${PROMPT_GATED.length}.

⚠ A running server can report **fewer** than ${total}. Program and screen tools only
appear once a profile is active, so a bundle started without one answers
\`tools/list\` with an inspection-only subset. The registry — and therefore this
catalog — always holds the full set.

## Prompt-gated tools — never auto-approve

${PROMPT_GATED.map((n) => `- \`${n}\``).join('\n')}

These stay callable but need an explicit per-call decision from the user, so they
are **deliberately absent from every section file**: a consumer that pastes a
section list into a permission template must not pick them up by accident.

The line is drawn at row data, not at reading. Metadata calls (\`GetTable\`,
\`GetStructure\`, \`GetDataElement\`) return DDIC schema and are safe to
auto-approve; the two above pull actual table rows, which can carry personal,
financial, or authorization-sensitive records. See
[data-extraction-policy](../../core/policies/data-protection/data-extraction-policy.md).

## Do not grant the namespace with a wildcard

A wildcard such as \`mcp__plugin_sapkit_sap__*\` silently swallows the two gated
tools above. Enumerate the names instead — that is what
\`scripts/gen-permissions.mjs\` does from a live \`tools/list\`.

## Regenerating

\`\`\`
cd sapkit-engine && npm run build && node harness/render-tool-catalog.mjs
\`\`\`

\`npm run gates\` makes the same comparison in its 「카탈로그」 gate and fails if
these files no longer match the registry; \`node harness/render-tool-catalog.mjs
--check\` runs that comparison by hand.
`;
}

/**
 * 등록점을 읽어 네 파일의 **본문 문자열**을 만든다. 파일을 쓰지도 읽지도 않는
 * 순수 계산이라, CLI(`--check`/생성)와 게이트(`gates/catalog.mjs`)가 같은 하나를
 * 나눠 쓴다.
 *
 * @returns {Promise<Record<string, string>>} 파일 이름 → 본문 (LF)
 */
export async function build() {
  const mod = await import(pathToFileURL(REGISTRY).href);
  const registry = mod.TOOL_REGISTRY ?? mod.default?.TOOL_REGISTRY;
  if (!Array.isArray(registry)) throw new Error(`등록점을 읽지 못했다: ${REGISTRY}`);
  const all = registry.map((t) => t.definition.name).sort();
  for (const n of PROMPT_GATED) {
    if (!all.includes(n)) {
      throw new Error(`prompt-gated 목록의 ${n}이 등록점에 없다 — 이름이 바뀌었는지 확인할 것`);
    }
  }
  const gated = new Set(PROMPT_GATED);
  const listed = all.filter((n) => !gated.has(n));
  const by = { read: [], write: [], runtime: [] };
  for (const n of listed) by[classify(n)].push(n);
  const counts = { read: by.read.length, write: by.write.length, runtime: by.runtime.length };
  return {
    'sapkit-mcp-tools.md': renderIndex(counts, all.length),
    'sapkit-mcp-tools-read.md': renderPart(
      'read',
      by.read,
      'Read operations',
      'Get / Read / Check / List / Search / Describe / Grep handlers — DDIC and object\nmetadata, source retrieval, structure navigation, cross-object search, and\nserver-side syntax checks. Nothing here changes SAP state.'
    ),
    'sapkit-mcp-tools-write.md': renderPart(
      'write',
      by.write,
      'Write operations',
      'Create / Update / Delete / Activate / Patch / Release / Write handlers covering\nthe ABAP object lifecycle. Every tool here changes SAP state and is therefore\nDEV-tier only.'
    ),
    'sapkit-mcp-tools-runtime.md': renderPart(
      'runtime',
      by.runtime,
      'Runtime operations',
      'Runtime diagnostics (dumps, profiler traces, gateway errors, system messages),\nunit test execution, service binding validation, and server session control.',
      '`ReloadProfile` re-reads the active profile and drops the cached connection, so\nit changes **which SAP system** later calls reach. Treat a profile switch as a\ndeliberate user action, never a routine auto-approved step. The profile itself\nlives outside the repository — see\n[project-context](../../core/project-context.md).\n'
    ),
  };
}

async function main() {
  const check = process.argv.includes('--check');
  const files = await build();
  let bad = 0;
  for (const [name, body] of Object.entries(files)) {
    const path = join(CATALOG_DIR, name);
    if (check) {
      let cur = '';
      try {
        cur = readFileSync(path, 'utf8');
      } catch {
        cur = '';
      }
      if (cur.replace(/\r\n/g, '\n') !== body) {
        console.error(`[tool-catalog] FAIL: ${name} 이 등록점과 어긋난다`);
        bad++;
      }
    } else {
      writeFileSync(path, body, 'utf8');
      console.log(`[tool-catalog] wrote ${name}`);
    }
  }
  if (check) {
    if (bad) {
      console.error(`[tool-catalog] ${bad}개 파일이 어긋난다 — 'node harness/render-tool-catalog.mjs'로 재생성할 것`);
      process.exit(1);
    }
    console.log('[tool-catalog] OK — 4개 파일이 등록점과 일치한다');
  }
}

// 직접 실행됐을 때만 돈다 — import(게이트)에서는 `build()`만 쓴다.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
