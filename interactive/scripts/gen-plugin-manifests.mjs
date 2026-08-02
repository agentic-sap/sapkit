#!/usr/bin/env node
// 플러그인 매니페스트 생성기 (S3 · D-027 로드맵 §9.5).
//
// 문제: version이 5개 매니페스트에 복제돼 있어 한 곳만 올리면 조용히 갈라진다. 자산 수도
// 손으로 적어 실제와 어긋난다(실측: 설명은 "11 procedures"인데 절차 파일은 16 — 스킬 수를
// 절차 수로 적은 것). 해결: 정본은 plugin-metadata.json 하나, 수는 파일시스템에서 계산.
//
// 사용:
//   node interactive/scripts/gen-plugin-manifests.mjs           # 7종 생성
//   node interactive/scripts/gen-plugin-manifests.mjs --check   # 드리프트 검사 (CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashContent } from './lib/target-hash.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTERACTIVE = path.join(HERE, '..');
const REPO = path.join(INTERACTIVE, '..');
const META_PATH = path.join(INTERACTIVE, 'plugin-metadata.json');
const CHECK = process.argv.includes('--check');

const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));

// ── 자산 수 계산 ───────────────────────────────────────────────────────────
const countFiles = (rel, filter = () => true) => {
  const d = path.join(INTERACTIVE, rel);
  return fs.existsSync(d) ? fs.readdirSync(d).filter(filter).length : 0;
};
const listDirs = (rel) => {
  const d = path.join(INTERACTIVE, rel);
  return fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
};
const countDirs = (rel) => listDirs(rel).length;

// mcp-surface.json의 실측 도구 수를 재사용 — 설명에 손으로 적은 수가 표류하지 않게.
const surfacePath = path.join(INTERACTIVE, 'provenance', 'mcp-surface.json');
const surface = fs.existsSync(surfacePath) ? JSON.parse(fs.readFileSync(surfacePath, 'utf8')) : null;
const toolsDefault = surface?.expositions?.default?.count;
if (!toolsDefault) {
  console.error('❌ provenance/mcp-surface.json에서 default 도구 수를 읽을 수 없음');
  console.error('   먼저: node interactive/scripts/smoke-mcp.mjs --update');
  process.exit(1);
}

// 세는 대상을 정확히 할 것. 순진하게 파일/디렉터리를 세면 틀린다 (실측):
//   - industry/ · country/ 에는 README.md가 있다 → 자산이 아님
//   - modules/common 은 크로스모듈 지식이지 모듈 팩이 아님
//   - personas/INDEX.md 는 선택자이지 페르소나가 아님
// 구 설명의 "14+BC · 14 industries · 16 countries"는 **정확했고**, 순진한 계수가 오히려
// 틀렸다. 기계로 세되 무엇을 세는지는 사람이 정한다.
const NOT_ASSET = new Set(['README.md', 'INDEX.md']);
const isAsset = (f) => f.endsWith('.md') && !NOT_ASSET.has(f);

const NON_PACK_MODULE_DIRS = ['common'];
const moduleDirs = listDirs('core/knowledge/modules');
for (const n of NON_PACK_MODULE_DIRS) {
  if (!moduleDirs.includes(n)) {
    console.error(`❌ modules/${n} 이 없다 — 모듈 팩 계수 가정이 깨졌으니 NON_PACK_MODULE_DIRS를 확인할 것`);
    process.exit(1);
  }
}

const counts = {
  personas: countFiles('core/personas', isAsset),
  skills: countDirs('skills'),
  procedures: countFiles('core/procedures', isAsset),
  agents: countFiles('agents', isAsset),
  modules: moduleDirs.filter((n) => !NON_PACK_MODULE_DIRS.includes(n)).length,
  industries: countFiles('core/knowledge/industry', isAsset),
  countries: countFiles('core/knowledge/country', isAsset),
  tools_default: toolsDefault,
  tools_connected: meta.recorded.tools_connected,
};

const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in counts)) {
    console.error(`❌ 설명에 알 수 없는 placeholder: {{${k}}}`);
    process.exit(1);
  }
  return String(counts[k]);
});

const D = Object.fromEntries(
  Object.entries(meta.descriptions).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, fill(v)])
);

// ── MCP wrapper의 논리 정본 (설계 §6-1) ────────────────────────────────────
// 두 wrapper가 가리키는 **대상**은 하나다. 다른 것은 경로를 쓰는 방식뿐이므로 여기서 한 번만
// 정의하고 아래 두 생성물이 그것을 소비한다.
//
//   Claude — 호스트가 `${CLAUDE_PLUGIN_ROOT}`를 치환한다.
//   Codex  — 호스트가 wrapper 내부 값에 **어떤 치환·재기준화도 하지 않는다**(2026-08-02
//            clean-home 실측, CLI 0.146.0). 상대경로는 세션 cwd 기준으로 풀려 기동에
//            실패하고 `${...}` 류 변수도 없다. 그래서 커밋 생성물에는 상징 토큰을 두고,
//            설치 후 `scripts/codex-wire-mcp.mjs`가 설치된 캐시의 절대경로로 재작성한다.
//            토큰 상태에서는 MCP가 뜨지 않지만 `required:false`라 스킬·세션은 산다.
//
// `--exposition` 인자는 **넣지 않는다** — 도구면은 프로젝트 `.sapkit/config.json`의
// `toolSurface`를 launch.cjs가 해석해 정한다(설계 §7-1). 여기에 인자를 박으면 그 결정을
// 덮어써 프로젝트 설정이 조용히 무력화된다.
const MCP_SERVER_ID = 'sap';
const MCP_LAUNCHER = 'server/launch.cjs';
const MCP_NODE_PATH = 'server/runtime-deps/keyring/node_modules';
// codex-wire-mcp.mjs가 찾아 치환하는 토큰. 두 곳의 값이 갈라지면 배선이 조용히 실패하므로
// test-codex-wire-mcp.mjs가 이 생성물과 그 스크립트의 상수를 대조한다.
const CODEX_ROOT_TOKEN = '{{SAPKIT_PLUGIN_ROOT}}';

// ── 생성물 7종 (매니페스트 5 + MCP wrapper 2) ──────────────────────────────
const GEN_NOTE = '⚠️ 생성물 — 직접 편집하지 말 것. 정본은 interactive/plugin-metadata.json (gen-plugin-manifests.mjs)';

const manifests = {
  [meta.targets.claude_marketplace]: {
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    _generated: GEN_NOTE,
    name: meta.marketplace.name,
    description: D.marketplace_long,
    owner: meta.marketplace.owner,
    plugins: [
      {
        name: meta.name,
        description: D.plugin_short,
        version: meta.version,
        author: meta.author,
        source: './interactive',
        category: meta.category.claude,
        tags: meta.tags,
      },
    ],
    renames: meta.marketplace.renames,
    version: meta.version,
  },

  [meta.targets.claude_plugin]: {
    _generated: GEN_NOTE,
    name: meta.name,
    version: meta.version,
    description: D.claude_long,
    author: meta.author,
    license: meta.license,
    keywords: meta.keywords.claude,
    skills: './skills/',
    mcpServers: './.mcp.json',
  },

  // Claude wrapper — 호스트가 변수를 치환하므로 커밋 값 그대로 동작한다.
  // 최상위 `_generated`는 Claude MCP 파서가 무시함을 실측 확인(2026-08-02: 이 키가 있는
  // .mcp.json의 서버가 `claude mcp list`에 정상 등재).
  [meta.targets.claude_mcp]: {
    _generated: GEN_NOTE,
    mcpServers: {
      [MCP_SERVER_ID]: {
        command: 'node',
        args: [`\${CLAUDE_PLUGIN_ROOT}/${MCP_LAUNCHER}`],
        env: {
          NODE_PATH: `\${CLAUDE_PLUGIN_ROOT}/${MCP_NODE_PATH}`,
        },
      },
    },
  },

  [meta.targets.codex_plugin]: {
    _generated: GEN_NOTE,
    name: meta.name,
    version: meta.version,
    description: D.codex_long,
    author: meta.author,
    license: meta.license,
    keywords: meta.keywords.codex,
    skills: './skills/',
    mcpServers: './adapters/codex/.mcp.json',
    interface: {
      displayName: meta.displayName,
      shortDescription: D.codex_interface_short,
      category: meta.category.codex,
      capabilities: ['Read', 'Write'],
    },
  },

  // Codex wrapper — **서버 맵 직접형**(최상위 키 하나하나가 서버 정의).
  // 그래서 `_generated` 같은 주석 키를 넣으면 안 된다 — 파서가 이름 없는 서버로 오인한다.
  // 경로는 설치 후 `node scripts/codex-wire-mcp.mjs apply`가 실경로로 재작성한다.
  [meta.targets.codex_mcp]: {
    [MCP_SERVER_ID]: {
      command: 'node',
      args: [`${CODEX_ROOT_TOKEN}/${MCP_LAUNCHER}`],
      env: {
        NODE_PATH: `${CODEX_ROOT_TOKEN}/${MCP_NODE_PATH}`,
      },
      required: false,
    },
  },

  [meta.targets.agy_marketplace]: {
    _generated: GEN_NOTE,
    name: meta.marketplace.name,
    interface: { displayName: meta.displayName },
    plugins: [
      {
        name: meta.name,
        source: { source: 'local', path: './interactive' },
        policy: { installation: 'AVAILABLE' },
        category: meta.category.agy,
      },
    ],
  },

  [meta.targets.agy_plugin]: {
    _generated: GEN_NOTE,
    name: meta.name,
    version: meta.version,
    description: D.codex_long,
    author: meta.author,
    license: meta.license,
    skills: './skills/',
    mcpServers: './.mcp.json',
  },
};

// ── 쓰기 / 검사 ────────────────────────────────────────────────────────────
const drift = [];
for (const [rel, obj] of Object.entries(manifests)) {
  const abs = path.join(REPO, rel);
  const next = JSON.stringify(obj, null, 2) + '\n';
  if (CHECK) {
    if (!fs.existsSync(abs)) {
      drift.push(`${rel} 부재`);
      continue;
    }
    // 내용 비교(EOL 정규화) — autocrlf 체크아웃에서 거짓 드리프트 방지.
    if (hashContent(fs.readFileSync(abs)) !== hashContent(Buffer.from(next, 'utf8'))) drift.push(`${rel} 드리프트`);
  } else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, next);
  }
}

// counts 블록도 정본에 되적어 사람이 읽을 수 있게 (검사 대상이기도 함).
const metaNext = JSON.stringify(
  { ...meta, counts: { ...meta.counts, ...counts } },
  null,
  2
) + '\n';
if (CHECK) {
  if (hashContent(fs.readFileSync(META_PATH)) !== hashContent(Buffer.from(metaNext, 'utf8')))
    drift.push('plugin-metadata.json의 counts가 실제 자산 수와 다름');
} else {
  fs.writeFileSync(META_PATH, metaNext);
}

console.log(`version : ${meta.version} (단일 정본: interactive/plugin-metadata.json)`);
console.log(
  `자산    : 페르소나 ${counts.personas} · 스킬 ${counts.skills} · 절차 ${counts.procedures} · 에이전트 ${counts.agents} · ` +
    `모듈 ${counts.modules} · 산업 ${counts.industries} · 국가 ${counts.countries} · 도구 ${counts.tools_default}`
);
console.log(`생성물  : ${Object.keys(manifests).length}종 (매니페스트 5 + MCP wrapper 2)`);

if (CHECK) {
  if (drift.length) {
    console.log(`\n❌ 매니페스트 드리프트 ${drift.length}건:`);
    for (const d of drift) console.log('  - ' + d);
    console.log('\n  재생성: node interactive/scripts/gen-plugin-manifests.mjs');
    process.exit(1);
  }
  console.log('\n✅ 7종 생성물이 단일 정본과 일치 · 자산 수 실제와 일치');
} else {
  for (const rel of Object.keys(manifests)) console.log(`  ✏ ${rel}`);
  console.log('\n✅ 생성 완료');
}
