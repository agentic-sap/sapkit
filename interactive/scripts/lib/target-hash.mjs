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

// 디렉터리 tree hash를 계산하던 `hashTarget()`은 T8에서 삭제됐다 — 유일한 소비자였던
// 이식 장부(check/build-migration-snapshot)가 은퇴했고, 그 함수를 붙잡아 두던 개명
// 게이트의 폴백 의무 앵커도 R5에서 사라져 호출자가 0이 됐다. 복원은 git 이력에서.
