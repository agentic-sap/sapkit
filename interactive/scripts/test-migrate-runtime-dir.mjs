#!/usr/bin/env node
// migrate-runtime-dir.mjs 음성시험 — 마이그레이터가 거부해야 할 것을 실제로 거부하고,
// 성공한 이행이 **엔진 리더가 읽는 journal**을 남기는지 확인한다.
//
// 검사 (D-057 §5):
//   ⑴ dry-run은 아무것도 바꾸지 않는다
//   ⑵ apply 후 journal이 목적지 안에 있고, 엔진 리더로 파싱해 COEXIST_OK가 재현된다
//   ⑶ 목적지가 이미 있으면 거부(병합·덮어쓰기 없음)
//   ⑷ symlink/junction이 있으면 거부
//   ⑸ 미분류 항목은 열거만 하고 이행하지 않는다
//   ⑹ --revert 는 무변경일 때만 자동, divergence면 병합 없이 거부
//      (이행 뒤 생긴 **비이행** 산출물 — 제외·미분류 — 도 divergence다: 3차 리뷰 #1)
//   ⑺ 제외 목록(logs/ · state/ · bin/)은 복사되지 않는다
//   ⑻ 목적지 검사는 no-follow — 끊어진 symlink 목적지도 거부한다 (3차 리뷰 #3)
//   ⑼ win32 자격증명 DACL 대조 — 소스에 명시 ACE가 있으면 거부 (3차 리뷰 #4)
//   보강: --scope home이 SAPKIT_HOME_DIR 고정 시 거부 · SC4SAP_HOME_DIR 홈 이행 ·
//         --status 가 COEXIST_OK를 보고 · --yes 없는 비대화형 실행은 거부
//
// 전부 임시 디렉터리 · 오프라인 · 실사용자 상태(`~/.sc4sap`) 무접촉.
// exit 0 전부 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TOOL = path.join(HERE, 'migrate-runtime-dir.mjs');
// 엔진 리더 정본. dist가 없으면 journal 계약 확증을 건너뛰지 않고 **실패**시킨다 —
// "리더로 검증했다"는 이 시험의 핵심 주장이기 때문이다.
const ENGINE_PROFILE = path.join(REPO, 'engine', 'dist', 'lib', 'profile.js');

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    fail++;
  }
}

function tmp(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mig-${tag}-`));
}

function seedProject(root, gen = '.sc4sap') {
  const w = (rel, txt) => {
    const p = path.join(root, gen, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt);
  };
  w('active-profile.txt', 'KR-DEV');
  w('config.json', '{"blocklistProfile":"strict"}');
  w('RULES.md', '# rules');
  w('LESSONS.md', '# lessons');
  w('knowledge/domain.md', 'domain fact');
  w('processes/p2p.md', 'process');
  w('program/ZTEST/spec.md', 'spec');
  w('spro-config-FI.json', '{}');
  w('blocklist-extend.txt', 'ZSECRET');
  // 제외 대상
  w('logs/mcp.log', 'log line');
  w('state/last.json', '{}');
  w('bin/vsp.exe', 'binary');
  // 미분류
  w('scratch/notes.txt', 'note');
  w('untitled.md', 'orphan');
  return path.join(root, gen);
}

function migrate(cwd, args, env = {}) {
  try {
    return {
      code: 0,
      out: execFileSync('node', [TOOL, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } }),
    };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

function listAll(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

// ── ⑴ dry-run 무변경 ────────────────────────────────────────────────────────
console.log('⑴ dry-run');
{
  const root = tmp('dry');
  const src = seedProject(root);
  const before = listAll(src);
  const r = migrate(root, ['--scope', 'project']);
  check('dry-run exit 0', r.code === 0, `exit ${r.code}`);
  check('목적지가 만들어지지 않는다', !fs.existsSync(path.join(root, '.sapkit')));
  check('소스가 그대로다', JSON.stringify(listAll(src)) === JSON.stringify(before));
  check('무엇이 이사할지 보고한다', r.out.includes('이행 대상'), r.out.slice(0, 200));
  fs.rmSync(root, { recursive: true, force: true });
}

// ── ⑵ apply + journal 계약 (엔진 리더로 COEXIST_OK 재현) ────────────────────
console.log('\n⑵ apply · journal 계약');
{
  const root = tmp('apply');
  const src = seedProject(root);
  const r = migrate(root, ['--scope', 'project', '--apply', '--yes']);
  const dest = path.join(root, '.sapkit');
  check('apply exit 0', r.code === 0, r.out.slice(-400));
  check('목적지가 생겼다', fs.existsSync(dest));
  check('소스는 남아 있다 (copy-not-move)', fs.existsSync(src));

  const journalPath = path.join(dest, '.migration-journal.json');
  check('journal이 목적지 **안**에 있다', fs.existsSync(journalPath));
  let journal = null;
  try {
    journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  } catch (e) {
    check('journal이 유효한 JSON이다', false, e.message);
  }
  if (journal) {
    check('journal이 유효한 JSON이다', true);
    check(
      'journal.source 가 이행 원본 절대경로다 (엔진 리더 계약)',
      typeof journal.source === 'string' && path.resolve(journal.source).toLowerCase() === src.toLowerCase(),
      `source=${journal.source}`,
    );
    check('journal.items 가 이행 목록을 담는다', Array.isArray(journal.items) && journal.items.length > 0);
  }

  // 엔진 리더로 직접 판정 — 이 시험의 핵심. profile.ts의 hasMigrationJournalFrom이
  // `parsed.source ?? parsed.from` 을 읽어 samePath 비교한다.
  if (!fs.existsSync(ENGINE_PROFILE)) {
    check('엔진 리더 dist 실재', false, `${ENGINE_PROFILE} 부재 — engine에서 npm run build 필요`);
  } else {
    const probe = `import(${JSON.stringify(pathToFileURL(ENGINE_PROFILE).href)}).then(m => {
      const sel = m.resolveProjectRuntimeDir(process.argv[1]);
      process.stdout.write(JSON.stringify(sel));
    });`;
    let sel = null;
    try {
      sel = JSON.parse(execFileSync('node', ['-e', probe, root], { encoding: 'utf8' }));
    } catch (e) {
      check('엔진 리더 구동', false, String(e.stderr ?? e.message).slice(0, 300));
    }
    if (sel) {
      check('엔진 리더가 신 세대를 고른다', path.resolve(sel.dir).toLowerCase() === dest.toLowerCase(), sel.dir);
      check('엔진 리더 판정이 COEXIST_OK다 (오경고 없음)', sel.reason === 'COEXIST_OK', `reason=${sel.reason}`);
    }
  }

  // ⑺ 제외 목록 미복사 — 같은 트리에서 확인한다
  const copied = listAll(dest);
  check('⑺ logs/ 미복사', !copied.some((p) => p.startsWith('logs/')), copied.join(','));
  check('⑺ state/ 미복사', !copied.some((p) => p.startsWith('state/')));
  check('⑺ bin/ 미복사 (vsp는 get-vsp 재실행)', !copied.some((p) => p.startsWith('bin/')));
  check('포함 목록은 복사됐다 (knowledge/·processes/ 포함)',
    copied.includes('knowledge/domain.md') && copied.includes('processes/p2p.md') && copied.includes('program/ZTEST/spec.md'));
  check('glob 슬롯도 복사됐다 (spro-config-FI.json)', copied.includes('spro-config-FI.json'));

  // ⑸ 미분류는 열거만
  check('⑸ 미분류는 이행하지 않는다', !copied.some((p) => p.startsWith('scratch/') || p === 'untitled.md'));
  check('⑸ 미분류를 열거해 보고한다', r.out.includes('scratch/') && r.out.includes('untitled.md'));

  // 안내(비이행 항목)를 출력하는가
  check('vsp 재설치·재배선 안내를 출력한다', r.out.includes('get-vsp.mjs') && r.out.includes('install-hooks.mjs'));

  // --status가 COEXIST_OK를 보고하는가
  const st = migrate(root, ['--status', '--scope', 'project']);
  check('--status 가 COEXIST_OK를 보고한다', st.code === 0 && st.out.includes('COEXIST_OK'), st.out.slice(0, 300));

  // ⑹ revert — 무변경이면 자동
  const rv = migrate(root, ['--revert', '--scope', 'project', '--apply']);
  check('⑹ 무변경 revert 는 목적지를 제거한다', rv.code === 0 && !fs.existsSync(dest), rv.out.slice(-300));
  check('⑹ revert 후에도 소스는 온전하다', fs.existsSync(path.join(src, 'active-profile.txt')));

  fs.rmSync(root, { recursive: true, force: true });
}

// ── ⑶ 목적지 존재 시 거부 ───────────────────────────────────────────────────
console.log('\n⑶ 목적지 존재');
{
  const root = tmp('dest');
  seedProject(root);
  fs.mkdirSync(path.join(root, '.sapkit'), { recursive: true });
  fs.writeFileSync(path.join(root, '.sapkit', 'anything.txt'), 'x');
  const r = migrate(root, ['--scope', 'project', '--apply', '--yes']);
  check('거부하고 exit 1', r.code === 1, `exit ${r.code}`);
  check('병합·덮어쓰기 없음을 말한다', r.out.includes('병합·덮어쓰기를 하지 않는다'), r.out.slice(0, 400));
  check('목적지 내용이 그대로다', fs.readFileSync(path.join(root, '.sapkit', 'anything.txt'), 'utf8') === 'x');
  fs.rmSync(root, { recursive: true, force: true });
}
{
  // 빈 디렉터리 하나만 있어도 거부한다 ("조금이라도 존재하면")
  const root = tmp('destempty');
  seedProject(root);
  fs.mkdirSync(path.join(root, '.sapkit'), { recursive: true });
  const r = migrate(root, ['--scope', 'project', '--apply', '--yes']);
  check('빈 목적지 디렉터리도 거부한다', r.code === 1, `exit ${r.code}`);
  fs.rmSync(root, { recursive: true, force: true });
}

// ── ⑷ symlink/junction 거부 ─────────────────────────────────────────────────
console.log('\n⑷ symlink/junction');
{
  const root = tmp('link');
  const src = seedProject(root);
  const target = path.join(root, 'elsewhere');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'x.md'), 'x');
  let made = false;
  for (const type of ['junction', 'dir']) {
    try {
      fs.symlinkSync(target, path.join(src, 'knowledge-link'), type);
      made = true;
      break;
    } catch {
      /* 권한 없으면 다음 형태로 */
    }
  }
  if (!made) {
    console.log('  ⚠ symlink/junction을 만들 수 없는 환경 — 이 검사만 건너뛴다');
  } else {
    const r = migrate(root, ['--scope', 'project', '--apply', '--yes']);
    check('symlink/junction이 있으면 거부한다', r.code === 1, `exit ${r.code}`);
    check('사유에 symlink를 명시한다', r.out.includes('symlink'), r.out.slice(0, 400));
    check('목적지를 만들지 않았다', !fs.existsSync(path.join(root, '.sapkit')));
  }
  fs.rmSync(root, { recursive: true, force: true });
}

// ── ⑹ revert divergence 거부 ────────────────────────────────────────────────
console.log('\n⑹ revert divergence');
{
  const root = tmp('rev');
  seedProject(root);
  const dest = path.join(root, '.sapkit');
  migrate(root, ['--scope', 'project', '--apply', '--yes']);
  fs.writeFileSync(path.join(dest, 'knowledge', 'new-fact.md'), '이행 뒤에 쌓인 지식');
  const r = migrate(root, ['--revert', '--scope', 'project', '--apply']);
  check('divergence면 거부하고 exit 1', r.code === 1, `exit ${r.code}`);
  check('병합하지 않는다고 말한다', r.out.includes('병합하지 않는다'), r.out.slice(0, 500));
  check('추가된 파일을 지목한다', r.out.includes('new-fact.md'));
  check('목적지를 지우지 않았다', fs.existsSync(path.join(dest, 'knowledge', 'new-fact.md')));
  fs.rmSync(root, { recursive: true, force: true });
}
{
  const root = tmp('revnj');
  seedProject(root);
  fs.mkdirSync(path.join(root, '.sapkit'), { recursive: true });
  fs.writeFileSync(path.join(root, '.sapkit', 'RULES.md'), '# not ours');
  const r = migrate(root, ['--revert', '--scope', 'project', '--apply']);
  check('journal 없는 목적지는 자동으로 지우지 않는다', r.code === 1 && fs.existsSync(path.join(root, '.sapkit')), r.out.slice(0, 300));
  fs.rmSync(root, { recursive: true, force: true });
}
// 이행 **후에 생긴 비이행 산출물**도 divergence다. journal.items에 없으니 sha 대조에는
// 걸리지 않지만, 스테이징에는 manifest 항목+journal만 담기므로 지금 목적지에 있는
// 제외·미분류 항목은 전부 사후 산출물이다 — 되돌리기가 그것을 삭제하면 안 된다.
{
  const root = tmp('revexcl');
  seedProject(root);
  const dest = path.join(root, '.sapkit');
  migrate(root, ['--scope', 'project', '--apply', '--yes']);
  fs.mkdirSync(path.join(dest, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'logs', 'x.log'), '이행 뒤에 쌓인 로그');
  const r = migrate(root, ['--revert', '--scope', 'project', '--apply']);
  check('제외 항목(logs/)이 생겼으면 revert를 거부한다', r.code === 1, `exit ${r.code}`);
  check('사후 산출물을 지목한다', r.out.includes('logs'), r.out.slice(0, 500));
  check('수동 처리를 안내한다', r.out.includes('수동 처리'), r.out.slice(0, 500));
  check('목적지를 지우지 않았다', fs.existsSync(path.join(dest, 'logs', 'x.log')));
  fs.rmSync(root, { recursive: true, force: true });
}
{
  const root = tmp('revuncl');
  seedProject(root);
  const dest = path.join(root, '.sapkit');
  migrate(root, ['--scope', 'project', '--apply', '--yes']);
  fs.writeFileSync(path.join(dest, 'handover.md'), '이행 뒤에 생긴 미분류 파일');
  const r = migrate(root, ['--revert', '--scope', 'project', '--apply']);
  check('미분류 항목이 생겼으면 revert를 거부한다', r.code === 1, `exit ${r.code}`);
  check('미분류 파일을 지목한다', r.out.includes('handover.md'), r.out.slice(0, 500));
  check('목적지를 지우지 않았다', fs.existsSync(path.join(dest, 'handover.md')));
  fs.rmSync(root, { recursive: true, force: true });
}

// ── 목적지 no-follow·no-replace (3차 리뷰 #3) ──────────────────────────────
console.log('\n목적지 no-follow (끊어진 symlink)');
{
  const root = tmp('dangling');
  seedProject(root);
  const dest = path.join(root, '.sapkit');
  let made = false;
  for (const type of ['dir', 'junction', 'file']) {
    try {
      fs.symlinkSync(path.join(root, 'nowhere-at-all'), dest, type);
      made = true;
      break;
    } catch {
      /* 권한 없으면 다음 형태로 */
    }
  }
  if (!made) {
    console.log('  ⚠ 끊어진 symlink를 만들 수 없는 환경 — 이 검사만 건너뛴다');
  } else {
    // existsSync는 링크를 따라가 "없다"고 답한다 — 그 답을 믿으면 rename이
    // 링크 이름을 차지한다. lstat 기반 검사라야 거부한다.
    check('전제: existsSync로는 보이지 않는다 (follow)', !fs.existsSync(dest));
    const r = migrate(root, ['--scope', 'project', '--apply', '--yes']);
    check('끊어진 symlink 목적지는 거부한다', r.code === 1, `exit ${r.code}`);
    check('사유에 symlink를 명시한다', r.out.includes('symlink'), r.out.slice(0, 500));
    check('링크를 그대로 둔다', fs.lstatSync(dest).isSymbolicLink());
  }
  fs.rmSync(root, { recursive: true, force: true });
}

// ── win32 자격증명 DACL 검증 (3차 리뷰 #4) ────────────────────────────────
// POSIX에는 mode 대조가 이미 있다. win32에는 mode 개념이 없어 지금까지 자격증명
// 보호 검증이 아예 실행되지 않았다 — icacls 대조가 그 자리를 메운다.
if (process.platform === 'win32') {
  console.log('\nwin32 자격증명 DACL (§5)');
  {
    // 상속만 받은 평범한 sap.env → 소스·사본의 DACL이 같아 통과해야 한다.
    const root = tmp('dacl-ok');
    const src = path.join(root, '.sc4sap');
    fs.mkdirSync(path.join(src, 'profiles', 'KR-DEV'), { recursive: true });
    fs.writeFileSync(path.join(src, 'profiles', 'KR-DEV', 'sap.env'), 'SAP_URL=http://x\nSAP_TIER=dev\n');
    fs.writeFileSync(path.join(src, 'sap.env'), 'SAP_URL=http://x\n');
    const r = migrate(root, ['--scope', 'project', '--apply', '--yes']);
    check('상속 그대로면 DACL 검증을 통과한다', r.code === 0, r.out.slice(-500));
    check('자격증명이 따라갔다', fs.existsSync(path.join(root, '.sapkit', 'profiles', 'KR-DEV', 'sap.env')));
    fs.rmSync(root, { recursive: true, force: true });
  }
  {
    // 소스 sap.env의 상속을 끊고 소유자에게만 준다 → 사본은 부모 상속만 받으므로
    // 더 느슨해진다. 그 상태로 자격증명을 복제하면 안 된다.
    const root = tmp('dacl-strict');
    const src = path.join(root, '.sc4sap');
    fs.mkdirSync(src, { recursive: true });
    const secret = path.join(src, 'sap.env');
    fs.writeFileSync(secret, 'SAP_URL=http://x\nSAP_PASSWORD=zzz\n');
    let hardened = false;
    try {
      execFileSync('icacls', [secret, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:F`], {
        encoding: 'utf8',
        windowsHide: true,
      });
      hardened = true;
    } catch {
      /* 권한이 없으면 이 검사만 건너뛴다 */
    }
    if (!hardened) {
      console.log('  ⚠ icacls로 상속을 끊을 수 없는 환경 — 이 검사만 건너뛴다');
    } else {
      const r = migrate(root, ['--scope', 'project', '--apply', '--yes']);
      check('소스 DACL이 사본과 다르면 거부한다', r.code === 1, `exit ${r.code}`);
      check('사유에 DACL을 명시한다', r.out.includes('DACL'), r.out.slice(-600));
      check('목적지를 만들지 않았다', !fs.existsSync(path.join(root, '.sapkit')));
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ── 홈 스코프 ───────────────────────────────────────────────────────────────
console.log('\n홈 스코프 (§11-5)');
{
  const root = tmp('home');
  const fakeHome = path.join(root, 'home');
  const legacyHome = path.join(fakeHome, '.sc4sap');
  fs.mkdirSync(path.join(legacyHome, 'profiles', 'KR-DEV'), { recursive: true });
  fs.writeFileSync(path.join(legacyHome, 'profiles', 'KR-DEV', 'sap.env'), 'SAP_URL=http://x\nSAP_TIER=dev\n');
  fs.mkdirSync(path.join(legacyHome, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(legacyHome, 'bin', 'vsp'), 'binary');

  const r = migrate(root, ['--scope', 'home', '--apply', '--yes'], { SC4SAP_HOME_DIR: legacyHome, SAPKIT_HOME_DIR: undefined });
  const newHome = path.join(fakeHome, '.sapkit');
  check('SC4SAP_HOME_DIR 소스 → 같은 부모의 .sapkit 로 이행', r.code === 0 && fs.existsSync(newHome), r.out.slice(-400));
  check('profiles/ 의 자격증명이 따라간다', fs.existsSync(path.join(newHome, 'profiles', 'KR-DEV', 'sap.env')));
  check('bin/(vsp)은 따라가지 않는다', !fs.existsSync(path.join(newHome, 'bin')));
  check('env 재등록 안내를 출력한다', r.out.includes('SAPKIT_HOME_DIR'), r.out.slice(-400));

  const pinned = migrate(root, ['--scope', 'home', '--apply', '--yes'], { SAPKIT_HOME_DIR: newHome, SC4SAP_HOME_DIR: legacyHome });
  check('SAPKIT_HOME_DIR 고정 시에는 추측하지 않고 거부한다', pinned.code === 1 && pinned.out.includes('고정'), pinned.out.slice(0, 400));
  fs.rmSync(root, { recursive: true, force: true });
}

// ── 쓰기 주체 정지 확인 ─────────────────────────────────────────────────────
console.log('\n쓰기 주체 정지 확인 (§5-3)');
{
  const root = tmp('confirm');
  seedProject(root);
  const r = migrate(root, ['--scope', 'project', '--apply']); // --yes 없음, stdin은 TTY 아님
  check('비대화형에서 --yes 없이 apply 하면 거부한다', r.code === 1, `exit ${r.code}`);
  check('무엇을 확인해야 하는지 말한다', r.out.includes('--yes'), r.out.slice(-300));
  check('목적지를 만들지 않았다', !fs.existsSync(path.join(root, '.sapkit')));
  fs.rmSync(root, { recursive: true, force: true });
}

// ── 인자 검증 ───────────────────────────────────────────────────────────────
console.log('\n인자');
{
  const root = tmp('args');
  seedProject(root);
  check('잘못된 --scope 는 exit 2', migrate(root, ['--scope', 'everything']).code === 2);
  check('알 수 없는 옵션은 exit 2', migrate(root, ['--force']).code === 2);
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
