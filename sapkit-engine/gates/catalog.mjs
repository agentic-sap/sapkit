/**
 * 카탈로그 게이트 — `interactive/server/tool-catalog/`의 네 파일이 **등록점과 같은가.**
 *
 * 이 게이트가 생기기 전에는 사람이 도구 이름을 손으로 옮겨 적었고, 맞는지 재는 것이
 * 아무것도 없었다. 그래서 카탈로그는 **조용히 낡을 수 있는 문서**였다 — 어댑터 노출
 * 프리셋과 권한 정책 분류가 그 문서를 읽는데도. 판6.1부터 「tool-catalog 자동 대조
 * 게이트 부재」로 이월돼 오던 자리가 여기다.
 *
 * ## 판정은 생성기가 소유한다
 *
 * 본문을 만드는 일은 `harness/render-tool-catalog.mjs`의 `build()`가 한다. 게이트가
 * 그 로직을 다시 짜지 않는 이유는 단순하다 — 다시 짜면 둘이 갈라지고, 갈라진 순간
 * 게이트는 카탈로그가 아니라 **자기 사본**을 지킨다. 여기서 하는 일은 「만든 본문 ==
 * 커밋된 파일」 넷을 재는 것뿐이다.
 *
 * ## 왜 등록점이지 기동한 서버가 아닌가
 *
 * 번들을 띄워 `tools/list`로 카탈로그를 재는 길도 있다. 그러나 그 표면은 **프로파일
 * 활성 여부에 따라 155/186으로 갈린다**(프로그램·화면 계열은 프로파일이 있어야 동적
 * 노출). 등록점은 그 조건과 무관하게 전량을 정적으로 갖고 있으므로, 프로파일이 없는
 * CI에서도 같은 답이 나온다. 「등록점 = 발행 표면」쪽은 표면 게이트(§4.5-1)가 이미
 * 따로 못 박고 있으니 여기서 겹쳐 재지 않는다.
 *
 * ## 줄바꿈은 판정 대상이 아니다
 *
 * Windows 체크아웃이 `\r\n`으로 받아 갈 수 있다. 그 차이로 게이트가 빨개지면 사람은
 * 게이트가 아니라 줄바꿈을 의심하게 되고, 그 습관이 진짜 표류도 같이 넘긴다. CLI
 * `--check`와 똑같이 `\r\n` → `\n`으로 정규화한 뒤 대조한다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { CATALOG_DIR, build } from '../harness/render-tool-catalog.mjs';
import { createReport } from './lib.mjs';

export { CATALOG_DIR };

const normalize = (text) => text.replace(/\r\n/g, '\n');

/** 첫 어긋난 줄을 짚는다 — "다르다"만으로는 재생성 말고 할 수 있는 일이 없다. */
function firstDifferentLine(expected, actual) {
  const want = expected.split('\n');
  const got = actual.split('\n');
  for (let i = 0; i < Math.max(want.length, got.length); i += 1) {
    if (want[i] !== got[i]) {
      return `${i + 1}행: 기대 ${JSON.stringify(want[i] ?? '(파일 끝)')} · 실제 ${JSON.stringify(got[i] ?? '(파일 끝)')}`;
    }
  }
  return null;
}

/**
 * @param catalogDir 대조할 카탈로그 디렉터리. 게이트 자체의 음성시험이 일부러
 *   망가뜨린 사본을 물려 "이 게이트가 정말 거부하는지"를 확인한다.
 */
export async function run({ catalogDir = CATALOG_DIR } = {}) {
  const report = createReport('카탈로그 게이트');

  let files;
  try {
    files = await build();
  } catch (error) {
    // 생성이 죽은 것은 통과가 아니다 — 판정을 못 했다는 뜻이다.
    report.check('등록점에서 카탈로그 본문을 만들었다', false, String(error?.message ?? error));
    return report;
  }

  const names = Object.keys(files);
  report.check(
    '생성기가 네 파일을 만든다 (인덱스 1 + 갈래 3)',
    names.length === 4,
    `${names.length}개 [${names.join(', ')}]`,
  );

  for (const [name, expected] of Object.entries(files)) {
    const file = path.join(catalogDir, name);
    let current = null;
    try {
      current = fs.readFileSync(file, 'utf8');
    } catch {
      current = null;
    }
    if (current === null) {
      report.check(
        `${name} 가 등록점과 같다`,
        false,
        `파일이 없다 (${file}) — \`node harness/render-tool-catalog.mjs\`로 만들어라`,
      );
      continue;
    }
    const difference = firstDifferentLine(expected, normalize(current));
    report.check(
      `${name} 가 등록점과 같다`,
      difference === null,
      difference === null
        ? `${expected.split('\n').length - 1}행`
        : `${difference} — \`node harness/render-tool-catalog.mjs\`로 다시 만들어라`,
    );
  }

  return report;
}
