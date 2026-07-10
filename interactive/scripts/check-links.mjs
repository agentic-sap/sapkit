#!/usr/bin/env node
// 레포 내 모든 .md의 상대 링크가 실재하는 파일/디렉토리를 가리키는지 검증.
// 깨진 링크 존재 → exit 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules']);

const mdFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.md')) mdFiles.push(full);
  }
})(ROOT);

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
let broken = 0;
let checked = 0;
for (const file of mdFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(LINK_RE)) {
    let target = m[1];
    if (/^(https?:|mailto:|#|<)/.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0]);
    if (!target) continue;
    checked++;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      broken++;
      console.log(`❌ ${path.relative(ROOT, file)} → ${m[1]}`);
    }
  }
}
console.log(`\nmd ${mdFiles.length}개, 상대 링크 ${checked}개 검사, 깨짐 ${broken}개`);
process.exit(broken ? 1 : 0);
