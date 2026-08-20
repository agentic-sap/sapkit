/**
 * 실제 자식 프로세스 구동 확인 — **기본 skip**.
 *
 * 이 머신에서 jest가 자식 프로세스 수거에서 비결정적으로 블록된 실측 기록이
 * 있다(레포 `HANDOFF.md`). 그래서 이 파일은 `SAPKIT_RECORDER_LIVE=1`일 때만 돈다.
 *
 * 켜도 SAP에는 접속하지 않는다 — 제품 번들을 inspection-only(무프로파일)로 띄워
 * `tools/list`만 확인한다. 접속이 필요한 도구는 여기서 부르지 않는다.
 *
 * 실행:  $env:SAPKIT_RECORDER_LIVE=1; npx jest child-process.live --forceExit
 *
 * `--forceExit`가 필요한 것이 이 파일을 기본 skip으로 두는 근거다 — 시험이
 * 통과해도 jest가 자식 프로세스 핸들 때문에 스스로 빠져나오지 않는다(실측).
 */
import path from 'node:path';
import { ChildProcessTransport } from '../childProcessTransport';

const LIVE = process.env['SAPKIT_RECORDER_LIVE'] === '1';
const describeLive = LIVE ? describe : describe.skip;

// __tests__ → recorder → harness → sapkit-engine → 레포 루트
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BUNDLE = path.join(REPO_ROOT, 'interactive', 'server', 'server.bundle.cjs');
// 번들의 선택 의존성(keyring)이 사는 곳. 제품 게이트가 쓰는 경로와 같다.
const KEYRING = path.join(REPO_ROOT, 'interactive', 'server', 'runtime-deps', 'keyring', 'node_modules');

describeLive('ChildProcessTransport (실기동 — opt-in)', () => {
  jest.setTimeout(60_000);

  it('제품 번들을 띄워 tools/list에 응답받는다 (SAP 무접속)', async () => {
    const t = new ChildProcessTransport({ bundlePath: BUNDLE, exposition: 'readonly', nodePath: KEYRING });
    try {
      const handshake = await t.open();
      expect(handshake.serverName).toBeTruthy();
      expect(handshake.exposition).toBe('readonly');
      const listed = (await t.request('tools/list', {})) as { tools?: { name: string }[] };
      expect(Array.isArray(listed.tools)).toBe(true);
      expect((listed.tools ?? []).length).toBeGreaterThan(0);
    } finally {
      await t.close();
    }
  });
});
