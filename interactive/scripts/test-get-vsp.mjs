#!/usr/bin/env node
// get-vsp.mjs 시험 — 다운로드·sha256 검증·설치·idempotent 계약이 '통과만 하는 장식'이
// 아님을 증명한다. 음성시험(불일치 거부·미기입/부재 거부)을 포함한다.
//
// 오프라인 완결: 로컬 http 서버(node:http)를 fixture 릴리스 저장소로 세워 실제 다운로드
// 경로(302 리다이렉트 → 본문)를 통째로 돌린다. 실제 ~/.sapkit과 실제 핀 파일은 건드리지
// 않는다 — 임시 설치 위치·임시 핀 fixture만 쓴다(VSP_INSTALL_DIR·VSP_PIN_FILE override).
//
// 자식 프로세스가 부모의 http 서버로 요청을 보내므로, 부모 이벤트 루프를 막는
// execFileSync 대신 비동기 spawn을 쓴다(execFileSync면 서버가 응답하지 못해 교착된다).
//
// exit 0 전 시나리오 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'get-vsp.mjs');

const IS_WINDOWS = process.platform === 'win32';
const BIN_NAME = IS_WINDOWS ? 'vsp.exe' : 'vsp';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// get-vsp.mjs와 동일한 OS/arch → platform 키 매핑(시험이 스스로 현재 플랫폼을 안다).
function detectPlatform() {
  const osKey = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
  const archKey = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!osKey || !archKey) return null;
  return `${osKey}-${archKey}`;
}

const CUR = detectPlatform();
if (!CUR) {
  console.error(`이 시험은 지원 플랫폼에서만 돈다 (현재 ${process.platform}/${process.arch})`);
  process.exit(1);
}
const CUR_FILE = `vsp-${CUR}${IS_WINDOWS ? '.exe' : ''}`;

const GOOD = Buffer.from('vsp-binary-bytes-good\n'.repeat(64));
const BAD = Buffer.from('vsp-binary-bytes-tampered\n'.repeat(64));
const GOOD_SHA = sha256(GOOD);

// ── fixture 릴리스 서버 ──────────────────────────────────────────────────────
// /…/releases/download/… → 302 리다이렉트(/cdn/<file>)로 GitHub 자산 흐름을 재현.
// /cdn/…                  → 200 본문(serveMode에 따라 GOOD 또는 BAD).
let reqCount = 0;
let serveMode = 'good';
const server = http.createServer((req, res) => {
  reqCount++;
  if (req.url.includes('/releases/download/')) {
    const base = req.url.split('/').pop();
    res.writeHead(302, { Location: `/cdn/${base}` });
    res.end();
    return;
  }
  if (req.url.startsWith('/cdn/')) {
    const body = serveMode === 'good' ? GOOD : BAD;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end();
});

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}`);
    if (detail) console.log(`       ${detail}`);
    fail++;
  }
}

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

function writePin(file, assets) {
  const pin = {
    version: 'v0.0.0-test',
    source: { repo: 'agentic-sap/sapkit', commit: '0'.repeat(40), path: 'vsp/' },
    release: {
      tag: 'vsp-v0.0.0-test',
      asset_url_pattern: 'https://github.com/agentic-sap/sapkit/releases/download/{tag}/{asset}',
    },
    install_dir: '~/.sapkit/bin',
    assets,
  };
  fs.writeFileSync(file, JSON.stringify(pin, null, 2) + '\n');
}

const installedFile = (dir) => path.join(dir, BIN_NAME);
const tmpResidue = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.tmp')) : []);

async function run() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'get-vsp-test-'));

  console.log('get-vsp 다운로드·검증·설치 시험\n');

  // ── (음성) 핀 sha와 내용이 다른 파일 응답 → 거부 ──────────────────────────
  console.log('sha256 불일치 파일 거부 (음성)');
  {
    const dir = path.join(TEST_ROOT, 'mismatch');
    const pinFile = path.join(TEST_ROOT, 'pin-good.json');
    writePin(pinFile, [{ platform: CUR, file: CUR_FILE, sha256: GOOD_SHA }]);
    serveMode = 'bad';
    reqCount = 0;
    const { code, out } = await runScript({
      VSP_PIN_FILE: pinFile,
      VSP_INSTALL_DIR: dir,
      VSP_RELEASE_BASE_URL: base,
    });
    check('exit 1', code === 1, `실제 exit ${code}`);
    check('"sha256 불일치" 메시지', out.includes('sha256 불일치'), out.trim().split('\n').pop());
    check('설치 위치에 파일 없음', !fs.existsSync(installedFile(dir)));
    check('임시 파일 잔존 없음', tmpResidue(dir).length === 0, tmpResidue(dir).join(', '));
  }

  // ── (양성) 일치 파일 응답 → 설치 ──────────────────────────────────────────
  console.log('\n일치 파일 설치 (양성)');
  const installedDir = path.join(TEST_ROOT, 'ok');
  const pinGood = path.join(TEST_ROOT, 'pin-good2.json');
  writePin(pinGood, [{ platform: CUR, file: CUR_FILE, sha256: GOOD_SHA }]);
  {
    serveMode = 'good';
    reqCount = 0;
    const { code, out } = await runScript({
      VSP_PIN_FILE: pinGood,
      VSP_INSTALL_DIR: installedDir,
      VSP_RELEASE_BASE_URL: base,
    });
    check('exit 0', code === 0, `실제 exit ${code}`);
    check('"설치 완료" 메시지', out.includes('설치 완료'), out.trim().split('\n').pop());
    const f = installedFile(installedDir);
    check('설치 파일 존재', fs.existsSync(f));
    check('설치 파일 sha256 = 핀 값', fs.existsSync(f) && sha256(fs.readFileSync(f)) === GOOD_SHA);
    check('302 리다이렉트를 거쳐 받음(요청 2건)', reqCount === 2, `실제 요청 ${reqCount}건`);
    check('임시 파일 잔존 없음', tmpResidue(installedDir).length === 0, tmpResidue(installedDir).join(', '));
  }

  // ── (idempotent) 설치된 상태에서 재실행 → 다운로드 요청 0건으로 성공 ───────
  console.log('\nidempotent 재실행 (다운로드 0건)');
  {
    serveMode = 'good';
    reqCount = 0;
    const { code, out } = await runScript({
      VSP_PIN_FILE: pinGood,
      VSP_INSTALL_DIR: installedDir,
      VSP_RELEASE_BASE_URL: base,
    });
    check('exit 0', code === 0, `실제 exit ${code}`);
    check('"no-op" 메시지', out.includes('no-op'), out.trim().split('\n').pop());
    check('다운로드 요청 0건', reqCount === 0, `실제 요청 ${reqCount}건`);
  }

  // ── (음성) 핀에 현재 플랫폼 자산이 없음 → 거부 ────────────────────────────
  console.log('\n핀에 현재 플랫폼 자산 부재 거부 (음성)');
  {
    const dir = path.join(TEST_ROOT, 'noplatform');
    const pinFile = path.join(TEST_ROOT, 'pin-noplatform.json');
    // 현재 플랫폼과 다른 조합만 등재.
    const other = CUR === 'linux-amd64' ? 'darwin-arm64' : 'linux-amd64';
    writePin(pinFile, [{ platform: other, file: `vsp-${other}`, sha256: '0'.repeat(64) }]);
    serveMode = 'good';
    reqCount = 0;
    const { code, out } = await runScript({
      VSP_PIN_FILE: pinFile,
      VSP_INSTALL_DIR: dir,
      VSP_RELEASE_BASE_URL: base,
    });
    check('exit 1', code === 1, `실제 exit ${code}`);
    check('"자산이 없음" 메시지', out.includes('자산이 없음'), out.trim().split('\n').pop());
    check('네트워크 미접촉(요청 0건)', reqCount === 0, `실제 요청 ${reqCount}건`);
    check('설치 위치에 파일 없음', !fs.existsSync(installedFile(dir)));
  }

  // ── (음성) 핀 sha256이 "TBD"(빌드 전 미기입) → 거부 ──────────────────────
  console.log('\nsha256 미기입("TBD") 거부 (음성)');
  {
    const dir = path.join(TEST_ROOT, 'tbd');
    const pinFile = path.join(TEST_ROOT, 'pin-tbd.json');
    writePin(pinFile, [{ platform: CUR, file: CUR_FILE, sha256: 'TBD' }]);
    serveMode = 'good';
    reqCount = 0;
    const { code, out } = await runScript({
      VSP_PIN_FILE: pinFile,
      VSP_INSTALL_DIR: dir,
      VSP_RELEASE_BASE_URL: base,
    });
    check('exit 1', code === 1, `실제 exit ${code}`);
    check('"미기입" 메시지', out.includes('미기입'), out.trim().split('\n').pop());
    check('네트워크 미접촉(요청 0건)', reqCount === 0, `실제 요청 ${reqCount}건`);
    check('설치 위치에 파일 없음', !fs.existsSync(installedFile(dir)));
  }

  server.close();
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });

  console.log(`\n${pass + fail}건 중 ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
