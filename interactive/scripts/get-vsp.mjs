#!/usr/bin/env node
// get-vsp.mjs — sapkit 제품의 vsp(오프라인 ABAP 검증기) 바이너리를 GitHub 릴리스
// 자산에서 내려받아 핀 파일이 지정한 설치 위치(~/.sapkit/bin)에 설치한다.
// 외부 의존성 0 — node 내장 모듈만 쓴다.
//
// 계약:
//   ① OS/arch를 핀 파일의 platform 키(windows|darwin|linux × amd64|arm64)로 매핑.
//      미지원 조합은 명확한 메시지 + exit 1.
//   ② 핀 파일에서 해당 자산·sha256을 결정. sha256이 "TBD"(빌드 전 미기입)면 exit 1.
//   ③ URL 조립 후 다운로드 — GitHub 릴리스 자산은 302 리다이렉트를 거치므로 따라간다.
//   ④ 임시 파일에 받아 sha256을 계산하고 **핀 값과 일치할 때만** 설치 위치로 옮긴다.
//      불일치 = sha256 불일치 파일 거부: 임시 파일 삭제 + 명확한 메시지 + exit 1
//      (설치 파일을 남기지 않는다).
//   ⑤ idempotent — 설치 파일이 이미 있고 sha256이 핀과 일치하면 다운로드 없이 no-op 성공.
//   ⑥ unix 계열이면 실행 권한(chmod 755) 부여.
//   ⑦ 네트워크 오류·부분 다운로드 시 임시 파일 정리 후 exit 1.
//
// 시험용 override 환경변수 (핀 파일·실제 설치 위치를 건드리지 않고 오프라인 시험하기 위한 것):
//   VSP_RELEASE_BASE_URL — URL 패턴의 origin(scheme+host) 부분을 이 값으로 대체.
//   VSP_INSTALL_DIR      — 설치 위치를 이 경로로 대체.
//   VSP_PIN_FILE         — 핀 파일 경로를 이 파일로 대체.
//
// exit 0 설치/no-op 성공 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// VSP_PIN_FILE는 시험용 override — 기본은 레포 내 핀 파일.
const PIN_FILE = process.env.VSP_PIN_FILE
  ? path.resolve(process.env.VSP_PIN_FILE)
  : path.join(ROOT, 'provenance', 'vsp-release.lock.json');

const IS_WINDOWS = process.platform === 'win32';
const BIN_NAME = IS_WINDOWS ? 'vsp.exe' : 'vsp';

const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// OS/arch → 핀 파일 platform 키. 미지원 조합은 null.
function detectPlatform() {
  const osKey = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
  const archKey = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!osKey || !archKey) return null;
  return `${osKey}-${archKey}`;
}

// 런타임 홈 결정 (D-057 R-ENV) — 설치기와 소비자(offline-code-analysis 훅)가
// **같은 홈**을 고르게 하는 것이 목적이다.
//   SAPKIT_HOME_DIR(설정됐는데 경로가 없으면 오류 — 구 env로 조용히 넘어가지 않는다)
//   → SC4SAP_HOME_DIR(deprecation) → 바이너리가 실재하는 세대 → 홈 디렉터리가 실재하는
//   세대 → 신 세대(~/.sapkit).
function resolveRuntimeHome() {
  const explicit = process.env.SAPKIT_HOME_DIR;
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      console.error(`❌ ENV_INVALID: SAPKIT_HOME_DIR 경로가 없음 (${explicit}) — SC4SAP_HOME_DIR로 폴백하지 않는다`);
      return null;
    }
    return explicit;
  }
  const legacyEnv = process.env.SC4SAP_HOME_DIR;
  if (legacyEnv) {
    console.error('⚠️  OK_LEGACY_DEPRECATED: SC4SAP_HOME_DIR는 폐기 예정 — SAPKIT_HOME_DIR로 바꿀 것');
    return legacyEnv;
  }
  const newHome = path.join(os.homedir(), '.sapkit');
  const legacyHome = path.join(os.homedir(), '.sc4sap');
  for (const home of [newHome, legacyHome]) {
    if (fs.existsSync(path.join(home, 'bin', BIN_NAME))) return home;
  }
  if (fs.existsSync(newHome)) return newHome;
  if (fs.existsSync(legacyHome)) return legacyHome;
  return newHome;
}

// 설치 위치 결정 — VSP_INSTALL_DIR override 우선. 핀 파일의 install_dir이 홈 상대
// 기본값(`~/.sapkit/bin` 또는 `~/.sc4sap/bin`)이면 R-ENV로 고른 홈의 bin/에 설치한다
// (그래야 소비자와 같은 홈을 본다). 그 밖의 명시값은 그대로 존중한다.
const HOME_RELATIVE_BIN = /^~[/\\]\.(sapkit|sc4sap)[/\\]bin$/;
function resolveInstallDir(pin) {
  if (process.env.VSP_INSTALL_DIR) return path.resolve(process.env.VSP_INSTALL_DIR);
  const configured = pin.install_dir || '~/.sapkit/bin';
  if (HOME_RELATIVE_BIN.test(configured)) {
    const home = resolveRuntimeHome();
    return home === null ? null : path.resolve(path.join(home, 'bin'));
  }
  let dir = configured;
  if (dir === '~' || dir.startsWith('~/') || dir.startsWith('~\\')) {
    dir = path.join(os.homedir(), dir.slice(1).replace(/^[/\\]+/, ''));
  }
  return path.resolve(dir);
}

// URL 조립 — 패턴에 tag·asset을 끼우고, 시험용 base URL이 있으면 origin만 대체(path 유지).
function buildUrl(pin, asset) {
  let url = pin.release.asset_url_pattern.replace('{tag}', pin.release.tag).replace('{asset}', asset.file);
  if (process.env.VSP_RELEASE_BASE_URL) {
    const u = new URL(url);
    url = process.env.VSP_RELEASE_BASE_URL.replace(/\/+$/, '') + u.pathname;
  }
  return url;
}

// dest로 다운로드하며 302 등 리다이렉트를 따라간다(GitHub 릴리스 자산은 서명 URL로 리다이렉트됨).
function fetchToFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      const { statusCode, headers } = res;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        res.resume(); // 소켓 해제를 위해 본문 드레인
        if (!headers.location) return reject(new Error(`리다이렉트 응답에 Location 헤더 없음 (HTTP ${statusCode})`));
        if (redirectsLeft <= 0) return reject(new Error('리다이렉트 한도 초과'));
        const next = new URL(headers.location, url).toString();
        return fetchToFile(next, dest, redirectsLeft - 1).then(resolve, reject);
      }
      if (statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${statusCode}`));
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close((err) => (err ? reject(err) : resolve())));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function main() {
  // ── ① 플랫폼 매핑 ──────────────────────────────────────────────────────────
  const platformKey = detectPlatform();
  if (!platformKey) {
    console.error(`❌ 미지원 OS/arch 조합: ${process.platform}/${process.arch}`);
    console.error('   지원: windows|darwin|linux × x64(amd64)|arm64');
    return 1;
  }

  // ── 핀 파일 로드 ───────────────────────────────────────────────────────────
  if (!fs.existsSync(PIN_FILE)) {
    console.error(`❌ 핀 파일 부재: ${PIN_FILE}`);
    return 1;
  }
  let pin;
  try {
    pin = JSON.parse(fs.readFileSync(PIN_FILE, 'utf8'));
  } catch (e) {
    console.error(`❌ 핀 파일을 JSON으로 읽지 못함: ${e.message}`);
    return 1;
  }

  // ── ② 자산·sha256 결정 ─────────────────────────────────────────────────────
  const asset = (pin.assets ?? []).find((a) => a.platform === platformKey);
  if (!asset) {
    console.error(`❌ 핀 파일에 platform "${platformKey}" 자산이 없음`);
    return 1;
  }
  if (!/^[0-9a-f]{64}$/.test(asset.sha256 ?? '')) {
    console.error(`❌ platform "${platformKey}" 자산의 sha256이 미기입("${asset.sha256}") — 빌드 완료 후 핀 파일을 채운 뒤 재실행`);
    return 1;
  }

  const installDir = resolveInstallDir(pin);
  if (installDir === null) return 1; // ENV_INVALID — 메시지는 resolveRuntimeHome이 출력
  const installPath = path.join(installDir, BIN_NAME);

  // ── ⑤ idempotent — 이미 설치됐고 sha256이 핀과 일치하면 no-op ────────────────
  if (fs.existsSync(installPath) && fs.statSync(installPath).isFile() && sha256File(installPath) === asset.sha256) {
    console.log(`✅ 이미 설치됨 · sha256 일치 — no-op (${installPath})`);
    return 0;
  }

  // ── ③ URL 조립 ─────────────────────────────────────────────────────────────
  const url = buildUrl(pin, asset);

  // ── ④ 임시 파일에 받고 검증 후 이동 ─────────────────────────────────────────
  fs.mkdirSync(installDir, { recursive: true });
  // 임시 파일을 설치 디렉터리 안에 두어 rename이 같은 파일시스템에서 일어나게 한다(EXDEV 회피).
  const tmp = path.join(installDir, `.vsp-download-${process.pid}-${Date.now()}.tmp`);
  try {
    console.log(`vsp ${platformKey} 다운로드: ${url}`);
    await fetchToFile(url, tmp);

    const got = sha256File(tmp);
    if (got !== asset.sha256) {
      fs.rmSync(tmp, { force: true });
      console.error('❌ sha256 불일치 파일 거부 — 설치하지 않음');
      console.error(`   기대 ${asset.sha256.slice(0, 16)}… / 실제 ${got.slice(0, 16)}…`);
      return 1;
    }

    fs.renameSync(tmp, installPath);
    if (!IS_WINDOWS) fs.chmodSync(installPath, 0o755); // ⑥ 실행 권한
    console.log(`✅ 설치 완료: ${installPath} (sha256 ${got.slice(0, 16)}…)`);
    return 0;
  } catch (e) {
    // ⑦ 네트워크 오류·부분 다운로드 — 임시 파일 정리
    fs.rmSync(tmp, { force: true });
    console.error(`❌ 다운로드 실패: ${e.message}`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`❌ 예기치 못한 오류: ${e.message}`);
    process.exit(1);
  }
);
