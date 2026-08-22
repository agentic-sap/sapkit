#!/usr/bin/env node
// keyring 런타임 의존을 제품에 동봉하고 그 바이트를 핀하는 도구.
//
// 플러그인 설치는 `git clone`만 한다 — 설치기가 `npm install`을 돌리지 않는다.
// 그래서 네이티브 모듈인 `@napi-rs/keyring`은 번들러가 삼킬 수도, 설치 시점에
// 내려받을 수도 없다. 대신 개발 머신의 `node_modules`에서 꺼내
// `runtime-deps/keyring/node_modules/`에 통째로 옮겨 두고, 서버가 NODE_PATH로
// 그 자리를 본다. 여기서 강등이 나면 자격증명은 평문으로 떨어진다.
//
// 담는 것은 코어 1 + 플랫폼 바이너리 4다(win32-x64-msvc · darwin-x64 ·
// darwin-arm64 · linux-x64-gnu). 각 하위 패키지가 자기 os/cpu를 선언하므로
// 평범한 `npm install`은 지금 머신 것 하나만 깔아 준다. 나머지를 끌어오려면
// 플러그인 루트에서:
//
//   npm install --no-save --force \
//     @napi-rs/keyring-darwin-x64 @napi-rs/keyring-darwin-arm64 \
//     @napi-rs/keyring-linux-x64-gnu
//
// (`--force`가 없으면 npm이 os/cpu 불일치를 이유로 건너뛴다.)
//
// integrity.json은 성격이 다른 두 해시를 함께 적는다:
//   npmIntegrity  package-lock.json의 sha512를 그대로 옮긴 것 — **출처**의 증거다
//                 (이 바이트가 특정 npm 타르볼에서 왔음을 말한다).
//   files         지금 디스크에 있는 파일들의 sha256 — **변조**의 증거다
//                 (--verify가 다시 계산해 맞대 본다).
// --verify는 망 없이 돌고, 파일이 늘거나 줄거나 바뀌었으면 떨어진다.
//
// 사용 (경로는 레포 루트 기준):
//   node interactive/server/bundle-keyring.mjs                     # node_modules에서 다시 담는다
//   node interactive/server/bundle-keyring.mjs --check             # 5종이 다 있는지, exit 0/1
//   node interactive/server/bundle-keyring.mjs --refresh-integrity # 담은 뒤 핀을 다시 적는다
//   node interactive/server/bundle-keyring.mjs --verify            # 오프라인 변조 대조

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const FROM_DIR = join(SERVER_DIR, 'node_modules', '@napi-rs');
const INTO_DIR = join(SERVER_DIR, 'runtime-deps', 'keyring', 'node_modules', '@napi-rs');
const PIN_PATH = join(SERVER_DIR, 'runtime-deps', 'keyring', 'integrity.json');
const LOCK_PATH = join(SERVER_DIR, 'package-lock.json');

const SCOPE = '@napi-rs/';
const CORE = 'keyring';
const PLATFORMS = ['keyring-win32-x64-msvc', 'keyring-darwin-x64', 'keyring-darwin-arm64', 'keyring-linux-x64-gnu'];
const BUNDLED = [CORE, ...PLATFORMS];

const SELF = 'node interactive/server/bundle-keyring.mjs';

// exit 코드는 모드마다 다르다 — 호출자가 무엇이 틀어졌는지 코드로 가른다.
function die(code, ...lines) {
  for (const line of lines) console.error(`[bundle-keyring] ${line}`);
  process.exit(code);
}

const say = (line) => console.log(`[bundle-keyring] ${line}`);

function hashOf(path) {
  return `sha256-${createHash('sha256').update(readFileSync(path)).digest('base64')}`;
}

// 한 패키지 폴더 안의 파일을 상대경로로 납작하게 편다. 정렬은 핀을 재현 가능하게 만든다.
function filesUnder(dir) {
  const found = [];
  const walk = (at, prefix) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(at, entry.name), rel);
      else if (entry.isFile()) found.push(rel);
    }
  };
  walk(dir, '');
  return found.sort();
}

// ── --check : 5종이 동봉돼 있는가 ──────────────────────────────────────────
function runCheck() {
  const absent = BUNDLED.filter((pkg) => !existsSync(join(INTO_DIR, pkg)));
  if (absent.length > 0) {
    die(
      1,
      `동봉 미완 — 빠진 패키지: ${absent.join(', ')}`,
      `고치는 법: npm install --no-save --force <빠진 것> && ${SELF}`,
    );
  }
  say(`Bundle OK — ${BUNDLED.length}종 전부 있다.`);
}

// ── --verify : 핀과 디스크가 같은가 (오프라인) ────────────────────────────
function runVerify() {
  if (!existsSync(PIN_PATH)) {
    die(7, `핀 파일이 없다: ${PIN_PATH}`, `고치는 법: ${SELF} --refresh-integrity`);
  }
  const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8'));
  const entries = Object.entries(pin.entries || {});
  const problems = [];
  let checked = 0;

  for (const [key, meta] of entries) {
    // 키는 "@napi-rs/<패키지>@<버전>" — 마지막 @가 버전 구분자다.
    const pkg = key.slice(SCOPE.length, key.lastIndexOf('@'));
    const dir = join(INTO_DIR, pkg);
    if (!existsSync(dir)) {
      problems.push(`${key}: 폴더가 없다`);
      continue;
    }
    const expected = meta.files || {};
    const onDisk = new Set(filesUnder(dir));

    for (const rel of Object.keys(expected)) {
      if (!onDisk.has(rel)) {
        problems.push(`${key}: 파일이 사라졌다 ${rel}`);
        continue;
      }
      checked += 1;
      const actual = hashOf(join(dir, rel));
      if (actual !== expected[rel]) {
        problems.push(`${key}: 해시 불일치 ${rel}\n      핀   ${expected[rel]}\n      실물 ${actual}`);
      }
    }
    for (const rel of onDisk) {
      if (!(rel in expected)) problems.push(`${key}: 핀에 없는 파일 ${rel}`);
    }
  }

  if (problems.length > 0) {
    die(
      8,
      `Integrity FAILED — 문제 ${problems.length}건:`,
      ...problems.map((p) => `  - ${p}`),
      `동봉을 의도적으로 바꾼 것이라면: ${SELF} --refresh-integrity`,
    );
  }
  say(`Integrity OK — ${entries.length}개 패키지 / ${checked}개 파일 대조 통과.`);
}

// ── --refresh-integrity : 지금 상태로 핀을 다시 적는다 ────────────────────
function readLock() {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
  } catch (err) {
    die(4, `package-lock.json을 읽을 수 없다: ${err.message}`);
  }
}

function runRefreshIntegrity() {
  const lock = readLock();
  const entries = {};

  for (const pkg of BUNDLED) {
    const dir = join(INTO_DIR, pkg);
    if (!existsSync(dir)) {
      die(5, `동봉본에 ${pkg}가 없다`, '먼저 인자 없이 실행해 담는다.');
    }
    const locked = lock.packages?.[`node_modules/${SCOPE}${pkg}`];
    if (!locked) {
      die(6, `package-lock.json에 ${SCOPE}${pkg} 항목이 없다`);
    }
    const files = {};
    for (const rel of filesUnder(dir)) files[rel] = hashOf(join(dir, rel));

    const key = `${SCOPE}${pkg}@${locked.version}`;
    entries[key] = {
      npmIntegrity: locked.integrity || null,
      resolved: locked.resolved || null,
      files,
    };
    say(`recorded: ${key} (파일 ${Object.keys(files).length})`);
  }

  const pin = {
    schema: 1,
    generated: new Date().toISOString(),
    source: 'package-lock.json + runtime-deps/keyring/node_modules/',
    entries,
  };
  writeFileSync(PIN_PATH, `${JSON.stringify(pin, null, 2)}\n`, 'utf8');
  say(`wrote: ${PIN_PATH}`);
}

// ── 기본 모드 : node_modules에서 다시 담는다 ──────────────────────────────
// 한 패키지를 통째로 갈아끼운다. 지우고 복사하는 이유는, 남은 파일이 핀에 없는
// 파일로 --verify에 잡히기 때문이다.
function replant(pkg, { required }) {
  const from = join(FROM_DIR, pkg);
  if (!existsSync(from)) {
    if (required) die(2, `필수 패키지가 설치돼 있지 않다: ${pkg}`);
    console.warn(`[bundle-keyring] 건너뜀 (미설치): ${pkg}`);
    return false;
  }
  const into = join(INTO_DIR, pkg);
  if (existsSync(into)) rmSync(into, { recursive: true, force: true });
  cpSync(from, into, { recursive: true, dereference: true });
  say(`copied: ${pkg}`);
  return true;
}

function runBundle() {
  if (!existsSync(FROM_DIR)) {
    die(1, `가져올 곳이 없다: ${FROM_DIR}`, '플러그인 루트에서 `npm install`을 먼저 돌린다.');
  }
  mkdirSync(INTO_DIR, { recursive: true });

  replant(CORE, { required: true });
  const copied = PLATFORMS.filter((pkg) => replant(pkg, { required: false })).length;

  // 플랫폼 바이너리가 하나도 없으면 코어만 있는 껍데기다 — 어디서도 열쇠고리를 못 연다.
  if (copied === 0) die(3, '플랫폼 바이너리를 하나도 담지 못했다 — 이 동봉본은 쓸모가 없다');
  if (copied < PLATFORMS.length) {
    console.warn(
      `[bundle-keyring] 경고: 플랫폼 ${copied}/${PLATFORMS.length}만 담겼다. ` +
        '빠진 플랫폼에서는 런타임이 평문으로 강등된다.',
    );
  }

  say('Done.');
  say(`다음: ${SELF} --refresh-integrity 로 핀을 갱신한다`);
}

const args = process.argv.slice(2);
if (args.includes('--verify')) runVerify();
else if (args.includes('--refresh-integrity')) runRefreshIntegrity();
else if (args.includes('--check')) runCheck();
else runBundle();
