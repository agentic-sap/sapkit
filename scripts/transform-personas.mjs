#!/usr/bin/env node
// sc4sap-custom agents/*.md → core/personas/*.md 변환
// 제거: Claude 배선(model/tools frontmatter, Team_Shutdown_Handler), Tier 로딩 프로토콜 참조
// 유지: 역할 본문 전체. 추가: capability 태그(readonly/readwrite), 경로 재매핑, 도구명 정규화
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.SC4SAP_SRC ?? 'D:/claude for SAP/sc4sap-custom';
const DST = process.env.SC4SAP_DST ?? 'D:/claude for SAP/sc4sap-lite';
const AGENTS = path.join(SRC, 'agents');
const OUT = path.join(DST, 'core', 'personas');

const CONVENTIONS = new Set([
  'abap-release-examples', 'abap-release-reference', 'alv-rules', 'clean-code-oop',
  'clean-code-procedural', 'clean-code', 'cloud-abap-constraints', 'constant-rule',
  'ecc-ddic-fallback', 'field-typing-rule', 'function-module-rule', 'include-structure',
  'naming-conventions', 'ok-code-pattern', 'oop-pattern', 'procedural-form-naming',
  'sap-version-reference', 'text-element-rule',
]);

function mapCommonPath(name) {
  if (CONVENTIONS.has(name)) return `../knowledge/abap/conventions/${name}.md`;
  if (name === 'data-extraction-policy') return '../policies/data-protection/data-extraction-policy.md';
  if (name === 'transport-client-rule') return '../policies/transport-client-rule.md';
  if (['spro-lookup', 'customization-lookup', 'help-portal-fetch'].includes(name)) return `../procedures/${name}.md`;
  if (name === 'active-modules') return '../project-context.md';
  return null; // obsolete 4종 등 — 후처리에서 텍스트화
}

const files = fs.readdirSync(AGENTS).filter((f) => f.endsWith('.md'));
const index = [];
for (const file of files) {
  let text = fs.readFileSync(path.join(AGENTS, file), 'utf8').replace(/\r\n/g, '\n');

  // frontmatter 파싱
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) { console.error(`frontmatter 없음: ${file}`); continue; }
  const get = (k) => (fm[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) ?? [])[1]?.trim() ?? '';
  const name = get('name');
  const description = get('description');
  const tools = get('tools');
  const capability = /\b(Write|Edit|Update[A-Z]|Create[A-Z]|Delete[A-Z])/.test(tools) ? 'readwrite' : 'readonly';
  let body = text.slice(fm[0].length);

  // Team_Shutdown_Handler 블록 제거
  body = body.replace(/[ \t]*<Team_Shutdown_Handler>[\s\S]*?<\/Team_Shutdown_Handler>\n*/g, '');
  // Response_Prefix 블록 제거 (모델 라우팅 배선)
  body = body.replace(/[ \t]*<Response_Prefix>[\s\S]*?<\/Response_Prefix>\n*/g, '');

  // Mandatory_Baseline → Knowledge_Loading (Tier 프로토콜 참조 제거)
  body = body
    .replace(/<(\/?)Mandatory_Baseline>/g, '<$1Knowledge_Loading>')
    .replace(/Load Tier 1 \+ Tier 2 per \[[^\]]*\]\([^)]*context-loading-protocol\.md\) at session start\./g,
      '세션 시작 시 [프로젝트 컨텍스트](../project-context.md)에서 sapVersion·abapRelease·activeModules·industry·country를 확인하고, 아래 지식을 필요 시 로드한다.')
    .replace(/Tier 2 adds:/g, '로드 대상:');

  // 경로 재매핑
  body = body.replace(/(\.\.\/)?common\/([a-z0-9-]+)\.md/g, (m, _rel, n) => mapCommonPath(n) ?? m);
  body = body.replace(/(\.\.\/)?configs\//g, '../knowledge/modules/');
  body = body.replace(/(?<![\w/])industry\//g, '../knowledge/industry/');
  body = body.replace(/(?<![\w/])country\//g, '../knowledge/country/');
  body = body.replace(/\.\.\/skills\/create-program\/phase6-review\.md/g, '../procedures/review-checklist.md');
  body = body.replace(/\.\.\/skills\/([a-z-]+)\/SKILL\.md/g, '../procedures/$1.md');

  // 도구명 정규화
  body = body.replace(/`?mcp__[A-Za-z0-9_-]+__([A-Za-z]\w*)`?/g, '`$1`');

  const header = `---\nname: ${name}\ndescription: ${description}\ncapability: ${capability}\nsource: sc4sap-custom/agents/${file}\n---\n`;
  fs.writeFileSync(path.join(OUT, file), header + body);
  index.push({ name, capability, description, file });
}

// INDEX.md — 유일한 발견 표면 (셀렉터)
const consultants = index.filter((p) => p.name.includes('-consultant'));
const roles = index.filter((p) => !p.name.includes('-consultant'));
const row = (p) => `| [${p.name}](${p.file}) | ${p.capability} | ${p.description} |`;
const indexMd = `# 페르소나 INDEX (셀렉터)

이 파일이 페르소나의 유일한 발견 표면이다. 본문은 필요할 때 해당 파일만 로드한다
(전량 상시 주입 금지 — DESIGN.md §4-1 계약 2).

사용법: 아래에서 과제에 맞는 페르소나 1개를 고르고, 그 파일을 읽어 해당 역할 관점으로
수행한다. capability가 \`readonly\`인 페르소나는 판정·분석만 하고 수정하지 않는다.

## 모듈 컨설턴트 (${consultants.length})

| 페르소나 | capability | 설명 |
|---|---|---|
${consultants.map(row).join('\n')}

## 역할 (${roles.length})

| 페르소나 | capability | 설명 |
|---|---|---|
${roles.map(row).join('\n')}
`;
fs.writeFileSync(path.join(OUT, 'INDEX.md'), indexMd);
console.log(`변환 ${index.length}개 (readonly ${index.filter((p) => p.capability === 'readonly').length} / readwrite ${index.filter((p) => p.capability === 'readwrite').length}) + INDEX.md`);
