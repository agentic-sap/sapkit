/**
 * CJS 기동 엔트리 — **`require()` 한 번으로 뜬다.**
 *
 * 셰임(`interactive/server/launch.cjs:380-383`)은 argv·env를 손질한 뒤 같은
 * 프로세스에서 번들을 `require`한다. `require.main === module`은 그때 거짓이므로
 * 그 조건으로 기동을 가둘 수 없다 — 구 엔진도 모듈 최상위에서 `void main()`을
 * 부른다(`engine/src/server/launcher.ts` 말미). 여기도 같다.
 *
 * 예외는 `MCP_SKIP_AUTO_START=true` 하나다. 구 엔진이 도움말에 적어 두고도
 * (`engine/src/lib/utils.ts:1344`) 어디서도 읽지 않던 노브이며, 여기서는 실제로
 * 동작한다. 무엇도 열지 않고 **기동을 멈추기만** 하므로 안전 바닥선과는 무관하다.
 * 시험이 이 파일을 `require`할 때 실 stdio를 잡지 않기 위한 통로다.
 */

import { startFromProcess } from './bootstrap';

export { startFromProcess };
export type { BootstrapOptions, StartedServer } from './bootstrap';

if (process.env.MCP_SKIP_AUTO_START !== 'true') {
  void startFromProcess().catch((error: unknown) => {
    // stdout은 프로토콜 채널이다. 진단은 전부 stderr로.
    process.stderr.write(
      `[sapkit] server failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    // 프로세스를 강제로 죽이지 않는다 — 붙잡을 것이 없으면 이 코드로 끝난다.
    process.exitCode = 1;
  });
}
