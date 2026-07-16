#!/usr/bin/env node
// 플러그인 매니페스트 생성기 (S3 · D-027 로드맵 §9.5).
//
// 문제: version이 5개 매니페스트에 복제돼 있어 한 곳만 올리면 조용히 갈라진다. 자산 수도
// 손으로 적어 실제와 어긋난다(실측: 설명은 "11 procedures"인데 절차 파일은 16 — 스킬 수를
// 절차 수로 적은 것). 해결: 정본은 plugin-metadata.json 하나, 수는 파일시스템에서 계산.
//
// 사용:
//   node interactive/scripts/gen-plugin-manifests.mjs           # 5종 생성
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

// ── 5종 매니페스트 ─────────────────────────────────────────────────────────
const GEN_NOTE = '⚠️ 생성물 — 직접 편집하지 말 것. 정본은 interactive/plugin-metadata.json (gen-plugin-manifests.mjs)';

const manifests = {
  [meta.targets.claude_marketplace]: {
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    _generated: GEN_NOTE,
    name: meta.name,
    description: D.marketplace_long,
    owner: meta.author,
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

  [meta.targets.codex_plugin]: {
    _generated: GEN_NOTE,
    name: meta.name,
    version: meta.version,
    description: D.codex_long,
    author: meta.author,
    license: meta.license,
    keywords: meta.keywords.codex,
    skills: './skills/',
    interface: {
      displayName: meta.displayName,
      shortDescription: D.codex_interface_short,
      category: meta.category.codex,
      capabilities: ['Read', 'Write'],
    },
  },

  [meta.targets.agy_marketplace]: {
    _generated: GEN_NOTE,
    name: meta.name,
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
console.log(`매니페스트: ${Object.keys(manifests).length}종`);

if (CHECK) {
  if (drift.length) {
    console.log(`\n❌ 매니페스트 드리프트 ${drift.length}건:`);
    for (const d of drift) console.log('  - ' + d);
    console.log('\n  재생성: node interactive/scripts/gen-plugin-manifests.mjs');
    process.exit(1);
  }
  console.log('\n✅ 5종 매니페스트가 단일 정본과 일치 · 자산 수 실제와 일치');
} else {
  for (const rel of Object.keys(manifests)) console.log(`  ✏ ${rel}`);
  console.log('\n✅ 생성 완료');
}
