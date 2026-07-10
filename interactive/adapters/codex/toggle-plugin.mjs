#!/usr/bin/env node
// Codex 플러그인 활성 토글 — 실측 결과 Codex 플러그인 enable은 전역 전용이라
// (프로젝트 .codex/config.toml 오버레이·`-c` 런타임 오버라이드 모두 스킬 로딩에 무효, 2026-07-10)
// SAP 작업 시작/종료 때 이 스크립트로 전역 플래그를 토글한다.
//   node toggle-plugin.mjs on|off|status
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG = path.join(os.homedir(), '.codex', 'config.toml');
const KEY = 'sap-agentic-harness@sap-agentic-harness';
const SECTION = `[plugins."${KEY}"]`;

const mode = process.argv[2];
let s = fs.readFileSync(CONFIG, 'utf8');
const re = new RegExp(`(\\[plugins\\."${KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\]\\r?\\n)enabled = (true|false)`);
const m = s.match(re);

if (mode === 'status' || !mode) {
  console.log(m ? `${KEY}: enabled = ${m[2]}` : `${KEY}: config에 항목 없음`);
  process.exit(0);
}
if (!['on', 'off'].includes(mode)) { console.error('사용법: node toggle-plugin.mjs on|off|status'); process.exit(1); }
const want = mode === 'on' ? 'true' : 'false';
if (!m) {
  s += `\n${SECTION}\nenabled = ${want}\n`;
} else {
  s = s.replace(re, `$1enabled = ${want}`);
}
fs.writeFileSync(CONFIG, s);
console.log(`${KEY}: enabled = ${want}`);
