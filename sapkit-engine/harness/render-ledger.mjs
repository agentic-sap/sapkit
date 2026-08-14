/**
 * 진척 대장 생성기 — `sapkit-engine/TOOL-LEDGER.md`를 **계산해 만든다.**
 *
 * 대장은 손으로 쓰지 않는다. 손으로 쓴 진척표는 언제나 실제보다 앞서 있고,
 * 앞서 있다는 사실을 아무도 모른 채 다음 판의 계획 근거가 된다.
 *
 *   node harness/render-ledger.mjs           # 계산해 파일에 쓴다
 *   node harness/render-ledger.mjs --check   # 커밋본과 대조만 한다 (게이트와 같은 판정)
 *   node harness/render-ledger.mjs --stdout  # 파일을 건드리지 않고 화면에 낸다
 *
 * **SAP에 붙지 않는다.** 입력은 전부 레포 안의 파일이다.
 *
 * PowerShell로 실행할 것 — 실행 습관을 게이트와 맞춰 둔다.
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

const CHECK = process.argv.includes('--check');
const STDOUT = process.argv.includes('--stdout');

const engineRoot = ledger.findEngineRoot();
const target = path.join(engineRoot, ledger.LEDGER_PATH);

const rendered = ledger.renderLedger(ledger.collectLedger());

if (STDOUT) {
  process.stdout.write(rendered);
  process.exit(0);
}

if (CHECK) {
  const committed = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  const verdict = ledger.checkLedger(rendered, committed);
  if (verdict.ok) {
    console.log(`✅ 대장이 입력과 일치한다 — ${ledger.LEDGER_PATH}`);
    process.exit(0);
  }
  console.error(`❌ 대장이 입력과 다르다 — ${ledger.LEDGER_PATH}`);
  console.error(`   · ${verdict.reason}`);
  console.error('   · 손으로 고쳤다면 되돌려라. 입력이 바뀐 것이면 `node harness/render-ledger.mjs`로 다시 만들어 커밋해라.');
  process.exit(1);
}

fs.writeFileSync(target, rendered, 'utf8');
console.log(`대장 → ${target}`);
