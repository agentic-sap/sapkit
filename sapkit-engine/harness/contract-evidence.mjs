/**
 * 계약 시험 증거 만들기 — jest의 `--json` 보고서를 **도구별 통과**로 접는다.
 *
 * 진척 대장의 계약 열은 두 가지를 함께 본다: 도구별 계약 시험 파일이 있는가,
 * 그리고 **그 시험이 최근에 실제로 돌았는가.** 앞은 파일 목록으로 알 수 있지만
 * 뒤는 실행 결과가 있어야 안다. jest 보고서는 절대 경로와 머신 사정이 섞여
 * 있어 그대로 커밋할 물건이 아니므로, 도구 이름과 통과 여부만 남겨 접는다.
 *
 *   npm run test:report        # jest --json --outputFile=.jest-report.json
 *   npm run evidence:contract  # 이 스크립트 — evidence/contract/results.json 을 쓴다
 *
 * 나온 파일은 **커밋한다**. 커밋하지 않으면 대장이 그 증거를 「미기록」으로 센다 —
 * 그것이 이 대장의 규칙이다: 레포에 없는 것은 없는 것이다.
 *
 * SAP에 붙지 않는다.
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const DIST_LEDGER = here('../dist/harness/ledger/index.js');
if (!fs.existsSync(DIST_LEDGER)) {
  console.error(`❌ 빌드 산출물이 없다: ${DIST_LEDGER}`);
  console.error('   · `npm run build`를 먼저 돌려라.');
  process.exit(2);
}
const ledger = require(DIST_LEDGER);

const argv = process.argv.slice(2);
const valueOf = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const engineRoot = ledger.findEngineRoot();
const reportPath = path.resolve(valueOf('jest') ?? path.join(engineRoot, '.jest-report.json'));
const outPath = path.resolve(valueOf('out') ?? path.join(engineRoot, ledger.CONTRACT_RESULTS_PATH));

if (!fs.existsSync(reportPath)) {
  console.error(`❌ jest 보고서가 없다: ${reportPath}`);
  console.error('   · 먼저 `npm run test:report`를 돌려라 (jest --json --outputFile=.jest-report.json).');
  process.exit(1);
}

const tools = ledger.loadSurfaceToolNames(path.join(engineRoot, 'harness', 'old-surface', 'm1-tools.json'));
const testFiles = ledger.findContractTestFiles(path.join(engineRoot, 'src', 'tools'), tools, engineRoot);
const evidence = ledger.contractEvidenceFromJest(JSON.parse(fs.readFileSync(reportPath, 'utf8')), testFiles);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

const passed = evidence.filter((e) => e.passed).length;
console.log(`계약 시험 증거 → ${outPath}`);
console.log(`   · 시험 파일이 있는 도구 ${testFiles.size}종 · 결과가 잡힌 도구 ${evidence.length}종 (통과 ${passed})`);
console.log('   · 이 파일을 커밋해야 대장의 계약 열이 「미기록」에서 벗어난다.');
