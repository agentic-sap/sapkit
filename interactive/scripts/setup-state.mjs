#!/usr/bin/env node
// setup-state.mjs — `/sapkit:setup` 의 결정론적 상태 mutator.
//
// 설계 `docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md`
// §8-2(대화와 파일 쓰기의 분리) · §8-3(종료 상태) · §4 불변식.
//
// ───────────────────────────── 이 스크립트가 아닌 것 ─────────────────────────
// **질문하지 않는다.** 사람의 선택은 `core/procedures/setup.md`(대화)가 받고, 이 도구는
// 이미 승인된 선택을 **같은 방식으로** 적용만 한다(D-045가 기각한 "비대화형 setup"의
// 부활이 아니다). 권한 템플릿 병합·훅 설치/제거·vsp 설치는 범위 밖 —
// `adapters/claude/hooks/install-hooks.mjs` · `scripts/get-vsp.mjs`가 소유하고
// 여기서는 `status`가 보고만 한다.
//
// ────────────────────────────── 다루는 파일 3종 ──────────────────────────────
//   ①  <home>/profiles/<alias>/sap.env        (setup.md Step 1)
//   ②  <project>/<runtime dir>/active-profile.txt   (setup.md Step 2-1)
//   ③  <project>/<runtime dir>/config.json          (setup.md Step 2-2)
// 그 밖의 파일은 만들지도 고치지도 않는다.
//
// ─────────────────────────────── 계약(§8-2) ──────────────────────────────────
// - 기본은 status/plan. **apply 없이는 상태 파일을 쓰지 않는다.**
// - 입력에 password/secret/token류 **필드명**을 허용하지 않는다(있으면 BLOCKED).
// - `sap.env`는 `SAP_PASSWORD=` 빈 줄만 만든다. 값은 사람이 직접 넣는다(R-SECRET).
//   기존 sap.env의 **비어 있지 않은 값은 절대 덮어쓰지 않는다** — 입력이 다른 값을
//   요구하면 쓰지 않고 `conflicts`로 이름만 보고한다.
// - 기존 JSON의 알 수 없는 키와 키 순서를 보존한다(R-IDEMPOTENT의 전제).
// - **건강한 파일은 byte-level noop** — 의미 변화가 없으면 아예 쓰지 않는다.
//   직렬화 고정: Node 전용 I/O(UTF-8 무BOM — D-060 교훈) · 기존 EOL 보존(신규 LF) ·
//   JSON 2-space + 기존 키 순서 보존.
// - R-ATOMIC: parse → validate → 임시 파일 → rename. 부분 실패 시 이번 apply가 만든
//   파일은 지우고 기존 파일은 백업(원본 바이트)에서 되돌린다.
// - 비밀값과 sap.env 내용은 어느 출력에도 나오지 않는다(정규 키의 존재/부재만).
//
// exit: 0 정상 · 1 BLOCKED · 2 사용법/입출력 오류
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..'); // interactive/

const PLAN_VERSION = 1;

// ── 런타임 경로 (D-057) ─────────────────────────────────────────────────────
// `.sapkit` 하나뿐이다. 이행 기간의 구 세대 폴백은 R5에서 제거됐다.
const NEW_DIR = '.sapkit';
const ENV_HOME = 'SAPKIT_HOME_DIR';

// setup.md Step 1이 이름으로 훑는 연결 키 — 파일 안 순서의 정본이기도 하다.
const ENV_KEYS = [
  'SAP_URL',
  'SAP_CLIENT',
  'SAP_USERNAME',
  'SAP_PASSWORD',
  'SAP_TIER',
  'SAP_ACTIVE_MODULES',
  'MCP_BLOCKLIST_PROFILE',
];
// 입력이 값을 줄 수 있는 키 = 위에서 비밀 1종을 뺀 것.
const SECRET_ENV_KEY = 'SAP_PASSWORD';
const INPUT_ENV_KEYS = ENV_KEYS.filter((k) => k !== SECRET_ENV_KEY);

// core/project-context.md의 config.json 필드 표 + 설계 §7-1의 toolSurface.
const CONFIG_KEYS = [
  'sapVersion',
  'abapRelease',
  'activeModules',
  'industry',
  'country',
  'blocklistProfile',
  'referenceLibraries',
  'toolSurface',
];
const TOOL_SURFACE_VALUES = ['readonly', 'development'];

// 입력 필드명 금칙어. 값은 검사하지 않는다(무엇이 비밀인지 알 수 없다) — 계약은
// "schema에 비밀 필드를 두지 않는다"이고, 그 위반을 이름으로 잡는다.
const SECRET_KEY_RE = /(pass|pwd|secret|token|credential|apikey|api[_-]?key)/i;

// ── 작은 유틸 ───────────────────────────────────────────────────────────────
function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
function readTextOrNull(p) {
  try {
    return stripBom(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
function readBytesOrNull(p) {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}
function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function exists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}
function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

// 임시 파일 → rename. 같은 디렉터리에 만들어야 rename이 원자적이다(R-ATOMIC).
function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf8' });
    fs.renameSync(tmp, target);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* 임시 파일 정리 실패는 원인 오류를 덮지 않는다 */
    }
    throw e;
  }
}

// PATH 훑기 — 자식 프로세스를 띄우지 않는 클라이언트 감지(결정론적·빠름).
function onPath(cmd) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];
  for (const d of dirs) {
    for (const ext of exts) {
      if (exists(path.join(d, cmd + ext))) return true;
    }
  }
  return false;
}
function detectClients() {
  return { claude: onPath('claude'), codex: onPath('codex'), antigravity: onPath('agy') };
}

// ── 홈 해석 ─────────────────────────────────────────────────────────────────
/**
 * **쓰기용** 홈: `SAPKIT_HOME_DIR` > `~/.sapkit`. 서버(`engine/src/lib/profile.ts`
 * resolveHomeDir)가 읽는 순서와 같으므로 "보이지 않는 성공"이 생기지 않는다.
 */
function resolveWriteHome() {
  const pinned = process.env[ENV_HOME];
  if (pinned) {
    return { home: path.resolve(pinned), source: 'env', block: null };
  }
  return { home: path.join(os.homedir(), NEW_DIR), source: 'default', block: null };
}

/**
 * **읽기용** 프로파일 디렉터리: 엔진의 R-ENV 순서를 그대로 흉내낸다 —
 * `SAPKIT_HOME_DIR` > `~/.sapkit`. verify가 "서버가 무엇을 볼지"를 판정하려면
 * 쓰기 규칙이 아니라 이 규칙이어야 한다(지금은 둘이 같다).
 */
function resolveReadProfileDir(alias) {
  const pinned = process.env[ENV_HOME];
  if (pinned) return { dir: path.join(path.resolve(pinned), 'profiles', alias), home: path.resolve(pinned) };
  const newHome = path.join(os.homedir(), NEW_DIR);
  return { dir: path.join(newHome, 'profiles', alias), home: newHome };
}

// ── 프로젝트 런타임 디렉터리 ────────────────────────────────────────────────
/**
 * 깊이 0(엔진 `resolveProjectRuntimeDir`과 같은 판정) — `--project`가 명시된 도구가
 * 조상까지 거슬러 올라가면 남의 프로젝트 상태를 쓰게 된다.
 *
 * 채택 기준은 엔진과 동일: 비어 있지 않은 active-profile.txt 또는 sap.env가 있으면
 * "연결을 낳는" 디렉터리다. 둘 다 낳으면 `.sapkit`, 둘 다 아니면 구 세대만 실재할 때만
 * 구 세대(= setup.md "legacy 프로젝트에 평행 `.sapkit/`를 만들지 않는다").
 */
function yieldsConnection(dir) {
  const pointer = path.join(dir, 'active-profile.txt');
  const raw = readTextOrNull(pointer);
  if (raw !== null && raw.trim().length > 0) return true;
  return exists(path.join(dir, 'sap.env'));
}
function resolveRuntimeDir(project) {
  return { dir: path.join(project, NEW_DIR) };
}

// ── dotenv (sap.env) ────────────────────────────────────────────────────────
// 값이 아니라 **줄 위치**를 다룬다 — 주석·순서·사용자가 넣은 키를 보존해야 한다.
function parseEnvLines(text) {
  const eol = detectEol(text);
  const lines = text.split(/\r?\n/);
  const index = new Map(); // KEY -> { line, value }
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq <= 0) return;
    const key = t.slice(0, eq).trim();
    if (index.has(key)) return; // 첫 등장이 유효 — 뒤 중복은 건드리지 않는다
    index.set(key, { line: i, value: t.slice(eq + 1).trim() });
  });
  return { eol, lines, index, endsWithEol: text.endsWith('\n') };
}

// ── JSON (config.json) ──────────────────────────────────────────────────────
function serializeJson(obj, eol, trailingNewline) {
  const body = JSON.stringify(obj, null, 2);
  const text = trailingNewline ? `${body}\n` : body;
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}
function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── 입력 검증 ───────────────────────────────────────────────────────────────
function scanSecretKeys(node, trail, hits) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanSecretKeys(v, `${trail}[${i}]`, hits));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const where = trail ? `${trail}.${k}` : k;
      if (SECRET_KEY_RE.test(k)) hits.push(where);
      scanSecretKeys(v, where, hits);
    }
  }
}

/** 입력을 검증해 { input, errors } 를 낸다. errors가 있으면 BLOCKED다. */
function validateInput(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { input: null, errors: ['입력이 JSON 객체가 아니다.'] };
  }

  const secretHits = [];
  scanSecretKeys(raw, '', secretHits);
  for (const h of secretHits) {
    errors.push(`입력에 비밀 계열 필드명이 있다: ${h} — 이 도구는 비밀을 받지 않는다(R-SECRET).`);
  }

  for (const k of Object.keys(raw)) {
    if (k !== 'profile' && k !== 'project') errors.push(`알 수 없는 최상위 키: ${k} (허용: profile, project)`);
  }

  const profile = raw.profile ?? null;
  if (profile != null) {
    if (typeof profile !== 'object' || Array.isArray(profile)) {
      errors.push('profile 은 객체여야 한다.');
    } else {
      for (const k of Object.keys(profile)) {
        if (k !== 'alias' && k !== 'env') errors.push(`알 수 없는 profile 키: ${k} (허용: alias, env)`);
      }
      const alias = profile.alias;
      if (typeof alias !== 'string' || alias.trim().length === 0) {
        errors.push('profile.alias 는 비어 있지 않은 문자열이어야 한다.');
      } else if (alias !== alias.trim() || /[\\/]|^\.+$|[:*?"<>|]/.test(alias)) {
        // 별칭은 디렉터리 이름이 된다 — 경로 구분자·상대경로·금칙문자 거부.
        errors.push(`profile.alias 가 디렉터리 이름으로 쓸 수 없는 형태다: ${JSON.stringify(alias)}`);
      }
      const env = profile.env ?? {};
      if (typeof env !== 'object' || Array.isArray(env)) {
        errors.push('profile.env 는 객체여야 한다.');
      } else {
        for (const [k, v] of Object.entries(env)) {
          if (!INPUT_ENV_KEYS.includes(k)) {
            errors.push(`알 수 없는 profile.env 키: ${k} (허용: ${INPUT_ENV_KEYS.join(', ')})`);
            continue;
          }
          if (typeof v !== 'string') errors.push(`profile.env.${k} 는 문자열이어야 한다.`);
          else if (/[\r\n]/.test(v)) errors.push(`profile.env.${k} 에 줄바꿈이 있다.`);
        }
      }
    }
  }

  const project = raw.project ?? null;
  if (project != null) {
    if (typeof project !== 'object' || Array.isArray(project)) {
      errors.push('project 는 객체여야 한다.');
    } else {
      for (const k of Object.keys(project)) {
        if (k !== 'activeProfile' && k !== 'config') errors.push(`알 수 없는 project 키: ${k} (허용: activeProfile, config)`);
      }
      if (project.activeProfile != null) {
        const a = project.activeProfile;
        if (typeof a !== 'string' || a.trim().length === 0 || a !== a.trim()) {
          errors.push('project.activeProfile 은 앞뒤 공백 없는 비어 있지 않은 문자열이어야 한다.');
        }
      }
      const config = project.config ?? null;
      if (config != null) {
        if (typeof config !== 'object' || Array.isArray(config)) {
          errors.push('project.config 는 객체여야 한다.');
        } else {
          for (const k of Object.keys(config)) {
            if (!CONFIG_KEYS.includes(k)) errors.push(`알 수 없는 project.config 키: ${k} (허용: ${CONFIG_KEYS.join(', ')})`);
          }
          if (config.toolSurface != null && !TOOL_SURFACE_VALUES.includes(config.toolSurface)) {
            errors.push(`project.config.toolSurface 는 ${TOOL_SURFACE_VALUES.join(' | ')} 중 하나여야 한다.`);
          }
        }
      }
    }
  }

  if (profile == null && project == null) errors.push('입력에 profile 도 project 도 없다 — 적용할 것이 없다.');
  return { input: raw, errors };
}

// ── 계획 수립 ───────────────────────────────────────────────────────────────
/**
 * 세 파일의 목표 상태를 **현재 디스크와 대조해** 계획으로 만든다.
 * 반환 actions[i]._content 는 apply 전용 내부값 — 계획 JSON에는 절대 싣지 않는다
 * (sap.env를 다시 쓰는 내용에는 기존 비밀값이 그대로 들어 있다).
 */
function computeActions(ctx, input) {
  const actions = [];
  const errors = [];
  const warnings = [];
  const restartReasons = [];

  // ① 홈 프로파일 sap.env
  if (input.profile) {
    const alias = input.profile.alias;
    const env = input.profile.env ?? {};
    if (ctx.writeHome.block) {
      errors.push(ctx.writeHome.block);
    } else {
      const target = path.join(ctx.writeHome.home, 'profiles', alias, 'sap.env');
      const existingText = readTextOrNull(target);
      const fields = [];
      const conflicts = [];
      let content = null;
      let op = 'noop';

      if (existingText === null) {
        // 신규 — 정규 키 순서로, SAP_PASSWORD는 값 없는 빈 줄로.
        const lines = ENV_KEYS.map((k) => `${k}=${k === SECRET_ENV_KEY ? '' : (env[k] ?? '')}`);
        for (const k of ENV_KEYS) fields.push(k);
        content = lines.join('\n') + '\n';
        op = 'create';
      } else {
        const parsed = parseEnvLines(existingText);
        const lines = [...parsed.lines];
        for (const k of INPUT_ENV_KEYS) {
          const want = env[k];
          if (want == null) continue;
          const cur = parsed.index.get(k);
          if (!cur) {
            fields.push(k);
            continue; // 아래에서 말미에 덧붙인다
          }
          if (cur.value === want) continue; // 이미 같은 값 — 손대지 않는다
          if (cur.value.length > 0) {
            // 기존 값은 덮어쓰지 않는다. 사람이 직접 고치도록 이름만 알린다.
            conflicts.push(k);
            continue;
          }
          lines[cur.line] = `${k}=${want}`; // 빈 뼈대 채우기
          fields.push(k);
        }
        // 없는 정규 키 덧붙이기(비밀 키는 값 없는 빈 줄로).
        const append = [];
        for (const k of ENV_KEYS) {
          if (parsed.index.has(k)) continue;
          if (k === SECRET_ENV_KEY) {
            append.push(`${k}=`);
            if (!fields.includes(k)) fields.push(k);
            continue;
          }
          if (env[k] == null) continue;
          append.push(`${k}=${env[k]}`);
        }
        if (append.length) {
          if (lines.length && lines[lines.length - 1] === '') lines.splice(lines.length - 1, 0, ...append);
          else lines.push(...append);
        }
        if (fields.length) {
          // lines 는 split(/\r?\n/) 결과라 CR이 없다 — LF로 이어 붙인 뒤 원래 EOL로 되돌린다.
          let text = lines.join('\n');
          if (parsed.endsWithEol && !text.endsWith('\n')) text += '\n';
          content = parsed.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
          op = content === existingText ? 'noop' : 'update';
        }
      }

      // byte 대조 — 의미 변화가 없으면 아예 쓰지 않는다.
      if (op !== 'noop' && existingText !== null && content === existingText) op = 'noop';

      actions.push({
        kind: 'profile-env',
        target,
        op,
        fields: op === 'noop' ? [] : fields,
        conflicts,
        secretPolicy: 'SAP_PASSWORD 는 빈 줄만 만든다 · 기존 값은 읽지도 바꾸지도 않는다',
        _content: op === 'noop' ? null : content,
      });
      if (op !== 'noop') restartReasons.push('프로파일 sap.env 변경 — MCP 서버는 시작 시 프로파일을 읽는다');
      if (conflicts.length) {
        warnings.push(
          `sap.env 의 기존 값이 있는 키는 덮어쓰지 않았다: ${conflicts.join(', ')} — 바꾸려면 파일을 직접 편집할 것.`,
        );
      }
    }
  }

  // ② active-profile.txt
  if (input.project?.activeProfile != null) {
    const target = path.join(ctx.runtime.dir, 'active-profile.txt');
    const alias = input.project.activeProfile;
    const existingText = readTextOrNull(target);
    let op;
    let content;
    if (existingText === null) {
      op = 'create';
      content = `${alias}\n`;
    } else if (existingText.trim() === alias) {
      op = 'noop';
      content = null;
    } else {
      op = 'update';
      const eol = detectEol(existingText);
      content = `${alias}${eol}`;
    }
    actions.push({ kind: 'active-profile', target, op, fields: op === 'noop' ? [] : ['alias'], conflicts: [], _content: content });
    if (op !== 'noop') restartReasons.push('활성 프로파일 포인터 변경 — MCP 서버 재시작 필요');
  }

  // ③ config.json
  if (input.project?.config) {
    const target = path.join(ctx.runtime.dir, 'config.json');
    const existingText = readTextOrNull(target);
    let existing = {};
    let eol = '\n';
    let trailingNewline = true;
    if (existingText !== null) {
      try {
        const parsed = JSON.parse(existingText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('최상위가 객체가 아니다');
        existing = parsed;
      } catch (e) {
        errors.push(`${target} 을(를) 읽을 수 없다: ${e.message} — 기존 파일에 손대지 않는다. 사람이 고친 뒤 다시 실행할 것.`);
        existing = null;
      }
      eol = existingText.length ? detectEol(existingText) : '\n';
      trailingNewline = existingText.endsWith('\n') || existingText.length === 0;
    }
    if (existing !== null) {
      const want = input.project.config;
      const changed = [];
      // 스프레드로 시작해 기존 키 **순서**를 유지하고, 새 키만 뒤에 붙는다.
      const merged = { ...existing };
      for (const [k, v] of Object.entries(want)) {
        if (Object.prototype.hasOwnProperty.call(existing, k) && sameValue(existing[k], v)) continue;
        merged[k] = v;
        changed.push(k);
      }
      const preserved = Object.keys(existing).filter((k) => !CONFIG_KEYS.includes(k));
      let op = changed.length ? (existingText === null ? 'create' : 'update') : 'noop';
      const content = op === 'noop' ? null : serializeJson(merged, eol, trailingNewline);
      if (op === 'update' && content === existingText) op = 'noop';
      actions.push({
        kind: 'project-config',
        target,
        op,
        fields: op === 'noop' ? [] : changed,
        preservedUnknownKeys: preserved,
        conflicts: [],
        _content: op === 'noop' ? null : content,
      });
      if (op !== 'noop' && changed.includes('toolSurface')) {
        restartReasons.push('toolSurface 변경 — 도구면은 MCP 기동 시 정해진다');
      }
    }
  }

  return { actions, errors, warnings, restartReasons };
}

/** 계획에서 내부값(_content)을 떼어낸 **공개 형태**. 이 모양만 출력·대조에 쓴다. */
function publicActions(actions) {
  return actions.map(({ _content, ...rest }) => rest);
}

// ── status ──────────────────────────────────────────────────────────────────
function describeSapEnv(file) {
  const text = readTextOrNull(file);
  if (text === null) return { exists: false };
  const { index } = parseEnvLines(text);
  const present = ENV_KEYS.filter((k) => index.has(k));
  const empty = present.filter((k) => index.get(k).value.length === 0);
  // 정규 키만 이름으로 말한다 — 사용자가 넣은 키 이름조차 밖으로 내지 않는다.
  let other = 0;
  for (const k of index.keys()) if (!ENV_KEYS.includes(k)) other++;
  return {
    exists: true,
    presentCanonicalKeys: present,
    emptyCanonicalKeys: empty,
    missingCanonicalKeys: ENV_KEYS.filter((k) => !index.has(k)),
    otherKeyCount: other,
    hasPasswordValue: Boolean(index.get(SECRET_ENV_KEY)?.value?.length),
  };
}

function buildStatus(ctx) {
  const runtimeDir = ctx.runtime.dir;
  const pointerPath = path.join(runtimeDir, 'active-profile.txt');
  const pointerRaw = readTextOrNull(pointerPath);
  const alias = pointerRaw !== null && pointerRaw.trim().length > 0 ? pointerRaw.trim() : null;

  const configPath = path.join(runtimeDir, 'config.json');
  const configText = readTextOrNull(configPath);
  let config = { exists: configText !== null, parseOk: null };
  if (configText !== null) {
    try {
      const parsed = JSON.parse(configText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('최상위가 객체가 아니다');
      config = {
        exists: true,
        parseOk: true,
        canonicalKeys: CONFIG_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(parsed, k)),
        unknownKeys: Object.keys(parsed).filter((k) => !CONFIG_KEYS.includes(k)),
        toolSurface: parsed.toolSurface ?? null,
      };
    } catch (e) {
      config = { exists: true, parseOk: false, error: e.message };
    }
  }

  // 홈의 프로파일 목록 — 쓰기 홈과 읽기 홈이 갈릴 수 있으므로 둘 다 훑는다.
  const homes = [];
  const seen = new Set();
  for (const h of [ctx.writeHome.home, alias ? resolveReadProfileDir(alias).home : null]) {
    if (!h || seen.has(h)) continue;
    seen.add(h);
    const dir = path.join(h, 'profiles');
    let aliases = [];
    try {
      aliases = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      aliases = [];
    }
    homes.push({ path: h, exists: isDir(h), profileAliases: aliases });
  }

  const activeProfile = alias ? resolveReadProfileDir(alias) : null;
  return {
    project: ctx.project,
    runtimeDir,
    writeHome: { path: ctx.writeHome.home, source: ctx.writeHome.source, exists: isDir(ctx.writeHome.home), blocked: ctx.writeHome.block },
    homes,
    activeProfile: alias
      ? {
          alias,
          pointer: pointerPath,
          profileDir: activeProfile.dir,
          profileDirExists: isDir(activeProfile.dir),
          sapEnv: describeSapEnv(path.join(activeProfile.dir, 'sap.env')),
        }
      : { alias: null, pointer: pointerPath, pointerExists: pointerRaw !== null },
    config,
    clients: detectClients(),
    pluginRuntime: {
      root: PLUGIN_ROOT,
      launcher: exists(path.join(PLUGIN_ROOT, 'server', 'launch.cjs')),
      bundle: exists(path.join(PLUGIN_ROOT, 'server', 'server.bundle.cjs')),
    },
    outOfScope: {
      note: '아래는 이 도구가 보고만 하고 바꾸지 않는다 — 각 소유자 스크립트가 담당한다.',
      claudePermissions: exists(path.join(ctx.project, '.claude', 'settings.local.json')),
      hooksInstaller: exists(path.join(PLUGIN_ROOT, 'adapters', 'claude', 'hooks', 'install-hooks.mjs')),
      vspInstaller: exists(path.join(PLUGIN_ROOT, 'scripts', 'get-vsp.mjs')),
    },
  };
}

// ── verify (§8-3 종료 상태) ─────────────────────────────────────────────────
/**
 * 파일·구조 레벨 판정만 한다. **SAP 실연결은 검사하지 않는다**(MCP 세션 소관) —
 * 비밀번호가 비어 SAP 연결만 미완성인 상태는 실패가 아니라 `READY_INSPECTION`이다
 * (설계 §8-3 마지막 줄).
 *
 * 우선순위: BLOCKED > DEGRADED_SKILLS_ONLY > RESTART_REQUIRED >
 *           READY_DEVELOPMENT > READY_READONLY > READY_INSPECTION
 */
function judge(ctx, status, restartPending) {
  const reasons = [];
  const blocking = [];
  const ap = status.activeProfile;

  // `SAPKIT_HOME_DIR`이 없는 경로를 가리키면 엔진은 **별칭을 해석할 때** 하드 오류를 낸다
  // (조용한 폴백 없음). 활성 프로파일이 없으면 홈을 아예 해석하지 않으므로 inspection-only
  // 세션은 정상이다 — 그 차이를 그대로 판정한다.
  const pinned = process.env[ENV_HOME];
  const pinnedMissing = Boolean(pinned) && !isDir(path.resolve(pinned));
  if (pinnedMissing && ap.alias) {
    blocking.push(`${ENV_HOME}=${pinned} 이(가) 실재하지 않는 경로다 — 서버는 별칭 해석에서 하드 오류를 낸다(조용한 폴백 없음).`);
  } else if (pinnedMissing) {
    reasons.push(`${ENV_HOME}=${pinned} 이(가) 아직 없는 경로다 — 프로파일을 만들 때 생성된다.`);
  }
  if (status.config.exists && status.config.parseOk === false) {
    blocking.push(`${path.join(status.runtimeDir, 'config.json')} 파싱 실패: ${status.config.error}`);
  }
  if (ap.alias && !ap.profileDirExists) {
    blocking.push(`active-profile.txt 가 가리키는 프로파일이 없다: ${ap.alias} → ${ap.profileDir}`);
  }
  if (ap.alias && ap.profileDirExists && ap.sapEnv?.exists === false) {
    blocking.push(`프로파일 디렉터리는 있으나 sap.env 가 없다: ${ap.profileDir}`);
  }
  if (blocking.length) return { state: 'BLOCKED', reasons: blocking };

  if (!status.pluginRuntime.launcher || !status.pluginRuntime.bundle) {
    return {
      state: 'DEGRADED_SKILLS_ONLY',
      reasons: [
        `번들 런타임 파일이 없다(launcher=${status.pluginRuntime.launcher} · bundle=${status.pluginRuntime.bundle}) — ` +
          '스킬은 로드돼도 MCP는 뜨지 않는다. 파일 실재 검사일 뿐이며 기동 성공 여부는 doctor 소관.',
      ],
    };
  }

  if (restartPending) {
    return { state: 'RESTART_REQUIRED', reasons: ['직전 apply 가 재시작 필요를 보고했고 아직 재시작하지 않았다(호출자 신고).'] };
  }

  const hasCredential = Boolean(ap.alias && ap.sapEnv?.exists && ap.sapEnv.hasPasswordValue);
  if (!hasCredential) {
    reasons.push(
      ap.alias
        ? 'sap.env 의 SAP_PASSWORD 가 비어 있다 — 사람이 직접 채운다. 그때까지 inspection-only가 정상 상태다.'
        : '활성 프로파일이 없다 — inspection-only로 시작한다.',
    );
    return { state: 'READY_INSPECTION', reasons };
  }

  const wantsDev = status.config.toolSurface === 'development';
  const tier = readTierOf(ap.profileDir);
  if (wantsDev) {
    if (tier === 'DEV') return { state: 'READY_DEVELOPMENT', reasons: ['toolSurface=development · SAP_TIER=DEV — write 도구면 조건 충족(파일 레벨).'] };
    reasons.push(`toolSurface=development 이지만 SAP_TIER=${tier ?? '미해석'} — R-DEV상 readonly로 축소된다(fail-closed).`);
    return { state: 'READY_READONLY', reasons };
  }
  reasons.push(`toolSurface=${status.config.toolSurface ?? '미설정 → readonly'} — readonly 도구면.`);
  return { state: 'READY_READONLY', reasons };
}
function readTierOf(profileDir) {
  const text = readTextOrNull(path.join(profileDir, 'sap.env'));
  if (text === null) return null;
  const v = parseEnvLines(text).index.get('SAP_TIER')?.value ?? '';
  return v ? v.trim().toUpperCase() : null;
}

// ── 인자 ────────────────────────────────────────────────────────────────────
const USAGE = `Usage:
  node setup-state.mjs status --project <path> [--json]
  node setup-state.mjs plan   --project <path> --input <file.json> [--out <plan.json>] [--json]
  node setup-state.mjs apply  --project <path> --plan <plan.json> [--json]
  node setup-state.mjs verify --project <path> [--client auto] [--restart-pending] [--json]

exit: 0 정상 · 1 BLOCKED · 2 사용법/입출력 오류`;

const argv = process.argv.slice(2);
const command = argv[0];
function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}
const JSON_OUT = argv.includes('--json');
const RESTART_PENDING = argv.includes('--restart-pending');

// Windows에서 파이프로 나가는 stdout은 **비동기**다 — `process.stdout.write` 직후
// `process.exit`하면 기계가 파싱할 JSON이 잘릴 수 있다. 동기 write로 다 내보낸 뒤 끝낸다.
function writeOut(fd, text) {
  const buf = Buffer.from(text, 'utf8');
  let off = 0;
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off);
    } catch (e) {
      if (e.code === 'EAGAIN') continue;
      break; // 파이프가 이미 닫혔다 — 종료 코드가 결과를 말한다
    }
  }
}

function emit(payload, humanLines, code) {
  if (JSON_OUT) writeOut(1, JSON.stringify(payload, null, 2) + '\n');
  else writeOut(1, humanLines.join('\n') + '\n');
  process.exit(code);
}
function die(message) {
  const payload = { ok: false, command: command ?? null, status: 'ERROR', errors: [message] };
  if (JSON_OUT) writeOut(1, JSON.stringify(payload, null, 2) + '\n');
  else writeOut(2, `${message}\n\n${USAGE}\n`);
  process.exit(2);
}

if (!command || ['-h', '--help', 'help'].includes(command)) {
  console.log(USAGE);
  process.exit(command ? 0 : 2);
}
if (!['status', 'plan', 'apply', 'verify'].includes(command)) die(`알 수 없는 하위명령: ${command}`);

const projectArg = flag('--project');
if (!projectArg) die('--project <path> 는 필수다 (실수로 cwd에 쓰지 않기 위해 기본값을 두지 않는다).');
const project = path.resolve(projectArg);
if (!isDir(project)) die(`--project 가 디렉터리가 아니다: ${project}`);

const ctx = {
  project,
  runtime: resolveRuntimeDir(project),
  writeHome: resolveWriteHome(),
};

// ── status ──────────────────────────────────────────────────────────────────
if (command === 'status') {
  const status = buildStatus(ctx);
  const payload = { ok: true, command: 'status', planVersion: PLAN_VERSION, status: 'OK', ...status };
  const lines = [
    `프로젝트     : ${status.project}`,
    `런타임 디렉터리: ${status.runtimeDir}`,
    `쓰기 홈      : ${status.writeHome.path} (${status.writeHome.source}${status.writeHome.exists ? '' : ' · 아직 없음'})`,
    status.writeHome.blocked ? `  ⚠ ${status.writeHome.blocked}` : null,
    `활성 프로파일 : ${status.activeProfile.alias ?? '(없음)'}${status.activeProfile.alias ? ` → ${status.activeProfile.profileDir}${status.activeProfile.profileDirExists ? '' : ' (없음)'}` : ''}`,
    status.activeProfile.sapEnv
      ? `  sap.env    : ${status.activeProfile.sapEnv.exists ? `있음 · 빈 키 ${(status.activeProfile.sapEnv.emptyCanonicalKeys || []).join(',') || '없음'} · 비밀번호 ${status.activeProfile.sapEnv.hasPasswordValue ? '기입됨' : '비어 있음'}` : '없음'}`
      : null,
    `config.json  : ${status.config.exists ? (status.config.parseOk ? `있음 · toolSurface=${status.config.toolSurface ?? '(미설정)'}` : `파싱 실패 — ${status.config.error}`) : '없음'}`,
    `클라이언트   : ${Object.entries(status.clients).map(([k, v]) => `${k}=${v ? 'O' : 'X'}`).join(' · ')}`,
  ].filter(Boolean);
  emit(payload, lines, 0);
}

// ── verify ──────────────────────────────────────────────────────────────────
if (command === 'verify') {
  const clientArg = flag('--client') ?? 'auto';
  const status = buildStatus(ctx);
  const verdict = judge(ctx, status, RESTART_PENDING);
  const payload = {
    ok: verdict.state !== 'BLOCKED',
    command: 'verify',
    planVersion: PLAN_VERSION,
    status: verdict.state === 'BLOCKED' ? 'BLOCKED' : 'OK',
    state: verdict.state,
    reasons: verdict.reasons,
    client: clientArg === 'auto' ? { mode: 'auto', detected: status.clients } : { mode: clientArg },
    sapConnectionChecked: false,
    project: status.project,
    runtimeDir: status.runtimeDir,
    activeProfile: status.activeProfile.alias ?? null,
    toolSurface: status.config.toolSurface ?? null,
  };
  emit(
    payload,
    [`상태: ${verdict.state}`, ...verdict.reasons.map((r) => `  - ${r}`), 'SAP 실연결은 검사하지 않는다 — MCP 세션 소관.'],
    verdict.state === 'BLOCKED' ? 1 : 0,
  );
}

// ── plan ────────────────────────────────────────────────────────────────────
function loadJsonFile(file, label) {
  const text = readTextOrNull(file);
  if (text === null) die(`${label} 파일을 읽을 수 없다: ${file}`);
  try {
    return JSON.parse(text);
  } catch (e) {
    die(`${label} 파일이 JSON이 아니다: ${file} — ${e.message}`);
  }
}

function buildPlan(inputRaw) {
  const { input, errors: inputErrors } = validateInput(inputRaw);
  if (inputErrors.length) {
    return {
      ok: false,
      command: 'plan',
      planVersion: PLAN_VERSION,
      status: 'BLOCKED',
      project: ctx.project,
      runtimeDir: ctx.runtime.dir,
      actions: [],
      errors: inputErrors,
      warnings: [],
      restartRequired: false,
      restartReasons: [],
    };
  }
  const { actions, errors, warnings, restartReasons } = computeActions(ctx, input);
  const blocked = errors.length > 0;
  return {
    ok: !blocked,
    command: 'plan',
    planVersion: PLAN_VERSION,
    status: blocked ? 'BLOCKED' : 'OK',
    project: ctx.project,
    runtimeDir: ctx.runtime.dir,
    writeHome: ctx.writeHome.home,
    input, // 비밀이 없음이 검증된 입력 — apply 가 현재 디스크와 다시 대조해 재계산한다
    actions: blocked ? [] : publicActions(actions),
    warnings,
    errors,
    restartRequired: !blocked && restartReasons.length > 0,
    restartReasons: blocked ? [] : [...new Set(restartReasons)],
    _internal: blocked ? [] : actions, // 프로세스 안에서만 쓰이고 직렬화 전에 지운다
  };
}

function planLines(plan) {
  const out = [`계획 (${plan.status}) — 프로젝트 ${plan.project}`];
  for (const a of plan.actions) {
    out.push(`  ${a.op.padEnd(6)} ${a.kind.padEnd(14)} ${a.target}`);
    if (a.fields?.length) out.push(`         필드: ${a.fields.join(', ')}`);
    if (a.conflicts?.length) out.push(`         보존(덮어쓰지 않음): ${a.conflicts.join(', ')}`);
    if (a.preservedUnknownKeys?.length) out.push(`         보존(알 수 없는 키): ${a.preservedUnknownKeys.join(', ')}`);
  }
  if (!plan.actions.length) out.push('  (변경 없음)');
  for (const w of plan.warnings) out.push(`  ⚠ ${w}`);
  for (const e of plan.errors) out.push(`  ❌ ${e}`);
  out.push(`재시작 필요: ${plan.restartRequired ? 'YES — ' + plan.restartReasons.join(' / ') : 'no'}`);
  return out;
}

if (command === 'plan') {
  const inputFile = flag('--input');
  if (!inputFile) die('plan 에는 --input <file.json> 이 필요하다.');
  const plan = buildPlan(loadJsonFile(path.resolve(inputFile), '입력'));
  delete plan._internal;

  // --out: PowerShell 리다이렉트가 UTF-16/BOM으로 저장해 apply 가 못 읽는 사고를 막는다
  // (D-060). 상태 파일이 아니라 사람이 검토할 계획 산출물이므로 apply 계약과 무관하다.
  const outFile = flag('--out');
  if (outFile) atomicWrite(path.resolve(outFile), JSON.stringify(plan, null, 2) + '\n');

  emit(plan, planLines(plan), plan.status === 'BLOCKED' ? 1 : 0);
}

// ── apply ───────────────────────────────────────────────────────────────────
if (command === 'apply') {
  const planFile = flag('--plan');
  if (!planFile) die('apply 에는 --plan <plan.json> 이 필요하다.');
  const saved = loadJsonFile(path.resolve(planFile), '계획');

  if (saved.command !== 'plan' || saved.planVersion !== PLAN_VERSION) {
    die(`계획 파일이 이 도구의 계획이 아니다(command=${saved.command} planVersion=${saved.planVersion}).`);
  }
  if (path.resolve(saved.project ?? '') !== ctx.project) {
    die(`계획의 프로젝트(${saved.project})와 --project(${ctx.project})가 다르다.`);
  }
  if (saved.status === 'BLOCKED') die('BLOCKED 계획은 적용할 수 없다.');

  // 계획 수립 이후 디스크가 바뀌었을 수 있다. 다시 계산해 **사람이 승인한 계획과 같은지**
  // 대조한다 — 다르면 쓰지 않는다(R-ATTENDED: 승인 대상이 달라졌다).
  const fresh = buildPlan(saved.input);
  const freshActions = fresh._internal ?? [];
  delete fresh._internal;
  if (fresh.status === 'BLOCKED') {
    emit(
      { ok: false, command: 'apply', planVersion: PLAN_VERSION, status: 'BLOCKED', project: ctx.project, applied: [], errors: fresh.errors },
      ['❌ 지금 다시 계산하니 BLOCKED다:', ...fresh.errors.map((e) => `  - ${e}`)],
      1,
    );
  }
  if (JSON.stringify(fresh.actions) !== JSON.stringify(saved.actions)) {
    emit(
      {
        ok: false,
        command: 'apply',
        planVersion: PLAN_VERSION,
        status: 'BLOCKED',
        project: ctx.project,
        applied: [],
        errors: ['계획 수립 이후 디스크 상태가 바뀌었다 — 승인된 계획과 다르므로 아무것도 쓰지 않았다. plan 을 다시 만들 것.'],
        planned: saved.actions,
        current: fresh.actions,
      },
      ['❌ 계획과 현재 상태가 어긋난다 — 쓰지 않았다. plan 을 다시 만들 것.'],
      1,
    );
  }

  // R-ATOMIC — 쓰기 전 원본 바이트를 모아 두고(백업), 하나라도 실패하면 되돌린다.
  const todo = freshActions.filter((a) => a.op !== 'noop');
  const backups = todo.map((a) => ({ target: a.target, existed: exists(a.target), bytes: readBytesOrNull(a.target) }));
  const done = [];
  try {
    for (const a of todo) {
      atomicWrite(a.target, a._content);
      done.push(a.target);
    }
  } catch (e) {
    const restored = [];
    const failed = [];
    for (const b of backups) {
      if (!done.includes(b.target)) continue;
      try {
        if (b.existed && b.bytes !== null) {
          const tmp = `${b.target}.${process.pid}.rollback.tmp`;
          fs.writeFileSync(tmp, b.bytes);
          fs.renameSync(tmp, b.target);
        } else {
          fs.rmSync(b.target, { force: true });
        }
        restored.push(b.target);
      } catch (re) {
        failed.push(`${b.target}: ${re.message}`);
      }
    }
    emit(
      {
        ok: false,
        command: 'apply',
        planVersion: PLAN_VERSION,
        status: 'BLOCKED',
        project: ctx.project,
        applied: [],
        rolledBack: restored,
        rollbackFailures: failed,
        errors: [`쓰기 실패: ${e.message}`],
      },
      [`❌ 쓰기 실패: ${e.message}`, `되돌림 ${restored.length}건`, ...failed.map((f) => `  ⚠ 되돌리기 실패 — ${f}`)],
      1,
    );
  }

  const payload = {
    ok: true,
    command: 'apply',
    planVersion: PLAN_VERSION,
    status: 'OK',
    project: ctx.project,
    runtimeDir: ctx.runtime.dir,
    applied: publicActions(todo),
    noop: publicActions(freshActions.filter((a) => a.op === 'noop')),
    warnings: fresh.warnings,
    restartRequired: fresh.restartRequired,
    restartReasons: fresh.restartReasons,
    backup: '원본 바이트를 메모리에 담아 두고 부분 실패 시 되돌린다(성공 경로는 흔적을 남기지 않는다).',
  };
  emit(
    payload,
    [
      `적용 ${todo.length}건 · noop ${freshActions.length - todo.length}건`,
      ...todo.map((a) => `  ${a.op.padEnd(6)} ${a.target}`),
      ...fresh.warnings.map((w) => `  ⚠ ${w}`),
      `재시작 필요: ${fresh.restartRequired ? 'YES — ' + fresh.restartReasons.join(' / ') : 'no'}`,
    ],
    0,
  );
}
