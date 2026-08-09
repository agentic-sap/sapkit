// 체크아웃 EOL과 무관한 내용 해시 — 여러 게이트의 **공유 계약**. 두 곳에 복제하면
// 조용히 갈라져 게이트가 무력해지므로 여기 한 곳에만 둔다.
// 현 소비자: check-engine-provenance · smoke-mcp · gen-plugin-manifests.
//
// EOL 정규화가 필수인 이유 (2026-07-16 실측):
//   이 레포엔 .gitattributes가 없고 core.autocrlf=true라, 같은 커밋이라도
//   Windows 체크아웃은 CRLF · Linux(CI) 체크아웃은 LF다. 원시 바이트를 해시하면
//   같은 내용이 플랫폼마다 다른 해시가 되어 ubuntu 러너에서 게이트가 거짓 FAIL한다.
//   provenance가 봐야 하는 것은 **내용**이지 체크아웃의 EOL 관습이 아니다.
//   → 텍스트는 CRLF를 LF로 정규화한 뒤 해시한다. 바이너리는 손대지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// NUL 바이트 휴리스틱 — git의 바이너리 판정과 같은 관습.
export function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

// 체크아웃 EOL과 무관한 내용 해시.
// 정규화는 **바이트 수준**으로 한다: toString('utf8')로 왕복하면 잘못된 UTF-8 바이트가
// U+FFFD로 치환돼 내용이 조용히 바뀐다(해시가 거짓말을 하게 된다). CRLF(0x0D 0x0A) 쌍만
// LF(0x0A)로 접으면 인코딩을 몰라도 안전하다.
export function hashContent(buf) {
  if (isBinary(buf)) return sha256(buf);
  const out = Buffer.allocUnsafe(buf.length);
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) continue; // CRLF → LF
    out[n++] = buf[i];
  }
  return sha256(out.subarray(0, n));
}

// tree hash에서 제외하는 디렉터리 — **자산이 아닌 것**만.
// `.sc4sap`이 여기 있는 이유 (2026-07-16 S4 staging 실측): 전역 활성 sc4sap 플러그인이
// 레포 안에서 기동하며 `.sc4sap/state/last-tool-error.json` 같은 런타임 상태를 남긴다.
// 이것들은 git 미추적이라 **개발 머신에만 있고 클린 클론·CI에는 없다**. 해시에 섞으면
// 스냅샷이 "이 머신에서만 통과하는" 기록이 된다 — 실제로 clean clone에서 adapters/가
// 18 vs 16 파일로 갈려 게이트가 깨졌다. MIGRATION-MANIFEST도 `.sc4sap/**`를
// "MCP 런타임 상태 … 자산 아님"으로 이미 분류하고 있다.
// `.sapkit`은 같은 것의 신세대 이름이다 (D-057) — **둘 다** 제외해야 개명 뒤에도,
// 그리고 두 세대가 공존하는 머신에서도 같은 결함이 재발하지 않는다.
const NOT_ASSET_DIRS = new Set(['node_modules', '.git', '.sapkit', '.sc4sap']);

// 목적지 토큰(파일 또는 디렉터리) → { kind, sha256, files? }
// 디렉터리는 정렬된 '<relpath> <contenthash>\n' 라인들의 해시(tree hash).
//
// ⚠️ 현재 호출자 없음 — 유일한 소비자였던 이식 장부(check/build-migration-snapshot)가
// 은퇴했다. 그래도 지우지 않는다: 위 `NOT_ASSET_DIRS`가 개명 게이트의 폴백 의무 앵커라
// (`check-runtime-path-rename.mjs` 구역 C · 그 음성시험이 실제로 이 상수를 건드려 red를
// 확인한다) 이 함수를 지우면 상수만 뜬 채 남거나 게이트가 깨진다.
export function hashTarget(root, token) {
  const abs = path.join(root, token);
  if (!fs.existsSync(abs)) return null;
  if (fs.statSync(abs).isFile()) return { kind: 'file', sha256: hashContent(fs.readFileSync(abs)) };

  const files = [];
  (function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (NOT_ASSET_DIRS.has(ent.name)) continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else files.push(full);
    }
  })(abs);

  // 경로 문자열 기준 정렬 — 플랫폼 구분자를 '/'로 통일한 뒤 정렬해야 재현된다.
  const rows = files
    .map((f) => ({ rel: path.relative(abs, f).replaceAll('\\', '/'), abs: f }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const lines = rows.map((r) => `${r.rel} ${hashContent(fs.readFileSync(r.abs))}\n`);
  return { kind: 'tree', files: rows.length, sha256: sha256(lines.join('')) };
}
