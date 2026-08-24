/**
 * 전량 재생이 **무엇을 모으고 무엇을 빼는가.**
 *
 * 이 판정이 `harness/replay-attended.mjs` 안에 있으면 jest가 못 잡는다. 수집
 * 단위는 조용히 틀리면 **요구 급이 재생인 도구가 영영 재생되지 않는** 자리이므로
 * (실제로 그렇게 났다 — D-122 실측 ①②), 판정을 여기 두고 스크립트는 부르기만 한다.
 * `harness/ledger/grade.ts`가 사다리 판정을 `.mjs` 밖에 둔 것과 같은 이유다.
 *
 * ## 왜 재귀인가 — 수집 단위와 배정 단위를 맞춘다
 *
 * 요구 증거 급의 산식(`harness/build-plan.mjs` 사다리 ②)은 얼린 관측
 * `harness/phase6-exercised.json`을 읽고, 그 관측은 **`fixtures/` 아래를 재귀로**
 * 훑어 뽑았다(그 파일의 `source.roots`가 `fixtures/*.json`과
 * `fixtures/attended-only/*.json` 둘을 함께 적는다). 그런데 재생기는 최상위만
 * 모았다. 그래서 **「요구 급은 재생 대조인데 재생 대상이 될 수 없는」 도구 18종**이
 * 생겼다(D-122 ⑵). 배정을 낮추는 길은 D-122 ⓑ가 「요구를 낮춰 증거를 만드는
 * 모양」이라며 기각했으므로, 맞출 수 있는 쪽은 **수집**이다.
 *
 * ## 그런데 왜 그냥 다 모으지 않는가
 *
 * 최상위만 모으던 옛 수집은 **「지우지 않는 생성 시퀀스를 전량 재생에서 뺀다」**를
 * 디렉터리로 대신한 것이었다(`fixtures/README.md`의 실측 —
 * `zsapkit-m1-program-create`를 기본 재생에 남겼더니 두 번째 실행이 "이미 있다"로
 * 실패했고, `coverage.ts`의 `merge()`가 실패를 끈끈하게 물어 **다른 시퀀스에서
 * 통과한 `GetProgram`의 증거까지** 앗아갔다). 판6.3이 그 대리 지표를 무너뜨렸다 —
 * 그 판의 시퀀스들은 **스스로 지우고 끝나는 생애주기**라(픽스처 description이
 * 「재실행 가능하다」를 명시한다) 같은 디렉터리에 재생 가능한 것과 불가능한 것이
 * 섞여 살게 됐다. 그래서 디렉터리 대신 **성질 자체**를 본다.
 *
 * 빼는 이유는 둘뿐이다.
 *
 *   ⑴ **P4(이송·패키지)를 태운다** — 되돌릴 수 없고 건별 사람 승인이 필요하다
 *      (CLAUDE.md 안전 규칙 · AGENTS.md P4). 전량 재생이 이송요청을 한 벌 더
 *      만드는 갈래를 열어 두지 않는다.
 *   ⑵ **생성만 하고 지우지 않는다** — 위의 실측이 그대로 재현되는 모양이다.
 *
 * ⚠ **⑵는 「지우는 단계가 있는가」만 본다.** 무엇을 지우는지는 SAP만 안다 —
 * `zsapkit63-cds-view-mde-test`는 `CreateClass`의 숙주를 `DeleteCdsUnitTest`로
 * 치우므로 이름만 맞대면 갈라 낼 수 없다. 그러므로 이 관문은 **명백히 되돌리지
 * 않는 시퀀스를 거르는 것**이지 재실행 가능성을 보증하지 않는다. 보증은 실기가
 * 한다.
 *
 * ⚠ **거부는 「전량 재생에서 뺀다」는 뜻이지 「재생하지 마라」가 아니다.**
 * `--fixture=<경로>`로 한 건을 명시하면 이 판정을 지나간다 — 실데이터 관문이
 * 같은 모양으로 열어 둔 문이고, 사람이 대상을 먼저 치운 뒤 돌리는 자리다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * P4 — 이송·패키지. 만들면 되돌릴 수 없고 건별 사람 승인 밖에서 돌면 안 된다.
 *
 * `ReleaseTransport`는 지금 어느 픽스처에도 없다. 그래도 적어 둔다 — 이 표가
 * 막으려는 것은 「지금 있는 픽스처」가 아니라 **P4 행위**이기 때문이다.
 */
export const TRANSPORT_TOOLS: ReadonlySet<string> = new Set([
  'CreateTransport',
  'ReleaseTransport',
  'CreatePackage',
]);

/**
 * 전량 재생에서 이 시퀀스를 빼야 하는가.
 *
 * @param tools 시퀀스의 `steps[].tool` 을 **차례대로**
 * @returns 빼야 하면 사람이 읽을 이유, 아니면 `null`
 */
export function batchRefusal(tools: readonly string[]): string | null {
  const p4 = tools.filter((tool) => TRANSPORT_TOOLS.has(tool));
  if (p4.length > 0) {
    return `P4(이송·패키지)를 태운다 — ${[...new Set(p4)].join('·')}. 되돌릴 수 없고 건별 사람 승인이 필요하다.`;
  }

  const creates = tools.filter((tool) => tool.startsWith('Create'));
  if (creates.length > 0 && !tools.some((tool) => tool.startsWith('Delete'))) {
    return (
      `생성만 하고 지우지 않는다 — ${[...new Set(creates)].join('·')}. ` +
      '두 번째 실행은 "이미 있다"로 실패하고, 그 실패가 같은 시퀀스의 다른 도구 증거까지 앗아간다.'
    );
  }

  return null;
}

/**
 * `fixtures/` 아래의 픽스처 파일 전량 — **재귀**, 경로 오름차순.
 *
 * 디렉터리가 없으면 빈 목록이다. 「없다」와 「비었다」를 여기서 가르지 않는다 —
 * 픽스처 0건을 무증거로 판정하는 것은 부르는 쪽의 몫이다.
 */
export function collectFixtureFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFixtureFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out.sort();
}
