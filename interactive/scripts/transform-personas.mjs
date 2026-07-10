#!/usr/bin/env node
// sc4sap-custom agents/*.md → core/personas/*.md 변환 (멱등 — 재실행 시 전체 재생성)
// 제거: Claude 배선(model/tools frontmatter, 팀/디스패치/모델라우팅/phase banner)
// 유지: 역할 본문. 추가: capability 태그, 경로 재매핑, 도구명 정규화. 대체문은 영어(계약).
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
  if (name === 'active-modules') return '../knowledge/modules/common/active-modules.md';
  return null; // obsolete 4종 등 — 개별 규칙에서 처리
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
  // description에서 모델·R/O 표기 제거 (capability 태그로 일원화)
  const description = get('description').replace(/\s*\((?:Opus|Sonnet|Haiku)[^)]*\)\s*$/, '');
  const tools = get('tools');
  const capability =
    /(^|[\s\[,])(Write|Edit)[,\]\s]/.test(tools) || /__(Update|Create|Delete)[A-Z]/.test(tools)
      ? 'readwrite' : 'readonly';
  let body = text.slice(fm[0].length);

  // ── Claude 배선 블록 제거 ──
  body = body.replace(/[ \t]*<Team_Shutdown_Handler>[\s\S]*?<\/Team_Shutdown_Handler>\n*/g, '');
  body = body.replace(/[ \t]*<Response_Prefix>[\s\S]*?<\/Response_Prefix>\n*/g, '');
  // phase banner 지시 라인 제거
  body = body.replace(/^[ \t]*- Emit phase banner:.*\n/gm, '');

  // ── Mandatory_Baseline → Knowledge_Loading (Tier 프로토콜 제거, 영어 대체) ──
  body = body
    .replace(/<(\/?)Mandatory_Baseline>/g, '<$1Knowledge_Loading>')
    .replace(/Load Tier 1 \+ Tier 2 per \[[^\]]*\]\([^)]*context-loading-protocol\.md\) at session start\./g,
      'At session start, resolve sapVersion / abapRelease / activeModules / industry / country from [project context](../project-context.md), then load the knowledge below on demand.')
    .replace(/Load Tier 1 per \[[^\]]*\]\([^)]*context-loading-protocol\.md\) at session start\./g,
      'At session start, check [project context](../project-context.md).')
    .replace(/Per \[`\.\.\/common\/context-loading-protocol\.md`\]\(\.\.\/common\/context-loading-protocol\.md\):/g,
      'Context-minimization principle (load only what this task needs):')
    .replace(/Tier 2 adds:/g, 'Load:');

  // ── 모델 라우팅 중립화 ──
  body = body
    .replace(/<(\/?)Model_Selection>/g, '<$1Depth_Escalation>')
    .replace(/Per \[`\.\.\/common\/model-routing-rule\.md`\]\(\.\.\/common\/model-routing-rule\.md\): base reviewer model is \*\*Sonnet\*\* for routine rule-matching across buckets\. The skill escalates to \*\*Opus\*\* when:/g,
      'Base mode is fast rule-matching review. Escalate to deep-scrutiny review when:')
    .replace(/The agent front-matter defaults to Sonnet\. The dispatching skill MAY override via the `model:` parameter on `Agent\(\.\.\.\)` per \[`\.\.\/common\/model-routing-rule\.md`\]\(\.\.\/common\/model-routing-rule\.md\):/g,
      'Default is standard execution. Switch to a more careful, deep-scrutiny mode when:')
    .replace(/the skill escalates to Opus with that context only/g, 'escalate with that narrow context only')
    .replace(/the skill re-dispatches to Opus/gi, 'switch to deep-scrutiny mode')
    .replace(/escalates? to \*\*Opus\*\*/g, 'escalates to deep-scrutiny review')
    .replace(/Sonnet-level findings/g, 'routine findings')
    .replace(/\b(?:Opus|Sonnet|Haiku)(?:\s+\d[\d.]*)?\b/g, 'deep-scrutiny')
    .replace(/deep-scrutiny-level/g, 'routine');

  // ── 디스패치 → 페르소나 채택 ──
  body = body.replace(/Dispatch sap-stocker and consume/g,
    'Adopt the [sap-stocker](sap-stocker.md) persona in a fresh step and consume');
  body = body.replace(/Dispatch `?sap-([a-z-]+)`?/g, 'Adopt the [sap-$1](sap-$1.md) persona');

  // ── 경로 재매핑 ──
  body = body.replace(/(\.\.\/)?common\/([a-z0-9-]+)\.md/g, (m, _rel, n) => mapCommonPath(n) ?? m);
  body = body.replace(/`multi-profile-artifact-resolution\.md`/g, '[project context](../project-context.md)');
  body = body.replace(/(\.\.\/)?configs\//g, '../knowledge/modules/');
  body = body.replace(/(?<![\w/])industry\//g, '../knowledge/industry/');
  body = body.replace(/(?<![\w/])country\//g, '../knowledge/country/');
  body = body.replace(/\.\.\/skills\/create-program\/phase6-review\.md/g, '../procedures/review-checklist.md');
  body = body.replace(/\.\.\/skills\/([a-z-]+)\/SKILL\.md/g, '../procedures/$1.md');
  // Knowledge_Loading 등의 bare 파일명 → 실제 경로
  body = body
    .replace(/`spro-lookup\.md`/g, '`../procedures/spro-lookup.md`')
    .replace(/`customization-lookup\.md`/g, '`../procedures/customization-lookup.md`')
    .replace(/`help-portal-fetch\.md`/g, '`../procedures/help-portal-fetch.md`')
    .replace(/`active-modules\.md`/g, '`../knowledge/modules/common/active-modules.md`');

  // ── 도구명 정규화 + 잔존 스킬 명령 중립화 ──
  body = body.replace(/`?mcp__[A-Za-z0-9_-]+__([A-Za-z]\w*)`?/g, '`$1`');
  body = body.replace(/\/sc4sap:sap-option/g, 'the profile options (see ../procedures/troubleshooting.md)');
  body = body.replace(/\/sc4sap:setup/g, 'the profile setup (see ../procedures/troubleshooting.md)');
  body = body.replace(/\/sc4sap:([a-z-]+)/g, 'the $1 procedure (../procedures/$1.md)');

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
