/**
 * Regression tests for the tier readonly gate on the **BaseMcpServer
 * registration path** — the one every transport actually uses.
 *
 * `StdioServer.start()` (and the SSE/HTTP servers) register tools through
 * `BaseMcpServer.registerHandlers()`, not through
 * `BaseHandlerGroup.registerToolOnServer()`. The guard used to live only in the
 * latter, so on stdio — the only transport this product ships — QA/PRD write and
 * runtime-execution calls were dispatched to SAP with no server-side gate.
 *
 * These cases pin the guard on that path, using the same `applyProfile` state
 * fixture as `lib/readonlyGuard.test.ts` and a fake connection that counts how
 * often it is opened: a blocked call must never reach it.
 */

import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { BaseMcpServer } from '../../server/BaseMcpServer';

const { applyProfile, __resetProfileState } = require('../../lib/profile');

/** Tools the gate must judge — one per branch of the block matrix. */
const TOOL_NAMES = [
  'CreateProgram', // mutation
  'UpdateClass', // mutation
  'RuntimeRunClassWithProfiling', // runtime execution
  'RuntimeCreateProfilerTraceParameters', // unclassified → fail-closed
  'RunUnitTest', // unit-test execution (QA-allowed)
  'GetProgram', // read
  'ReloadProfile', // always allowed (escape hatch)
] as const;

const noopLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
} as any;

/** Records which handlers actually ran, so "blocked" means "never executed". */
const executed: string[] = [];

class FakeGroup implements IHandlerGroup {
  /** Set if the BaseHandlerGroup registration path is (wrongly) taken. */
  ownRegistrationUsed = false;

  getName(): string {
    return 'fake';
  }

  getHandlers(): HandlerEntry[] {
    return TOOL_NAMES.map((name) => ({
      toolDefinition: {
        name,
        description: `fake ${name}`,
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (_context: any, _args: any) => {
        executed.push(name);
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    }));
  }

  registerHandlers(): void {
    this.ownRegistrationUsed = true;
  }
}

/** Concrete BaseMcpServer with a fake connection, mirroring StdioServer.start(). */
class TestServer extends BaseMcpServer {
  connectionOpens = 0;

  constructor() {
    super({ name: 'test', version: '0.0.0', logger: noopLogger });
  }

  protected async getConnection(): Promise<any> {
    this.connectionOpens++;
    return { fake: true };
  }

  register(registry: CompositeHandlersRegistry): void {
    this.registerHandlers(registry);
  }

  /** The wrapper the SDK would invoke for `name`. */
  toolHandler(name: string): (args: unknown) => Promise<any> {
    const registered = (this as any)._registeredTools?.[name];
    if (!registered) throw new Error(`tool not registered: ${name}`);
    return registered.handler;
  }
}

function bootServer(profile: {
  alias: string | undefined;
  tier: string;
  readonly: boolean;
  legacy: boolean;
}): { server: TestServer; group: FakeGroup } {
  __resetProfileState();
  applyProfile({
    alias: profile.alias,
    sourcePath: '/dev/null',
    envVars: profile.tier ? { SAP_TIER: profile.tier } : {},
    tier: profile.tier,
    readonly: profile.readonly,
    legacy: profile.legacy,
  });
  const group = new FakeGroup();
  const server = new TestServer();
  server.register(new CompositeHandlersRegistry([group]));
  return { server, group };
}

const QA = { alias: 'HK-QA', tier: 'QA', readonly: true, legacy: false };
const PRD = { alias: 'HK-PRD', tier: 'PRD', readonly: true, legacy: false };
const UNKNOWN = {
  alias: undefined,
  tier: 'UNKNOWN',
  readonly: true,
  legacy: true,
};
const DEV = { alias: 'HK-DEV', tier: 'DEV', readonly: false, legacy: false };

beforeEach(() => {
  executed.length = 0;
});

afterAll(() => {
  __resetProfileState();
});

describe('BaseMcpServer registration path — tier readonly gate', () => {
  it('registers through its own wrapper, not BaseHandlerGroup', () => {
    const { server, group } = bootServer(DEV);
    // The defect existed precisely because this path bypasses the group's own
    // (guarded) registration. Pin that it still does — the guard must be on
    // *this* wrapper, not borrowed from the other one.
    expect(group.ownRegistrationUsed).toBe(false);
    expect(server.toolHandler('CreateProgram')).toBeInstanceOf(Function);
  });

  it('QA blocks write tools before the connection is opened', async () => {
    const { server } = bootServer(QA);
    for (const tool of ['CreateProgram', 'UpdateClass']) {
      await expect(server.toolHandler(tool)({})).rejects.toThrow(
        /ERR_READONLY_TIER.*HK-QA.*tier=QA/s,
      );
    }
    expect(executed).toEqual([]);
    expect(server.connectionOpens).toBe(0);
  });

  it('PRD blocks runtime-execution tools before the connection is opened', async () => {
    const { server } = bootServer(PRD);
    for (const tool of [
      'RuntimeRunClassWithProfiling',
      'RuntimeCreateProfilerTraceParameters',
      'RunUnitTest',
    ]) {
      await expect(server.toolHandler(tool)({})).rejects.toThrow(
        /ERR_READONLY_TIER.*tier=PRD/s,
      );
    }
    expect(executed).toEqual([]);
    expect(server.connectionOpens).toBe(0);
  });

  it('QA blocks runtime execution but still allows unit-test execution', async () => {
    const { server } = bootServer(QA);
    await expect(
      server.toolHandler('RuntimeRunClassWithProfiling')({}),
    ).rejects.toThrow(/ERR_READONLY_TIER/);
    await expect(server.toolHandler('RunUnitTest')({})).resolves.toBeDefined();
    expect(executed).toEqual(['RunUnitTest']);
  });

  it('unresolved tier (UNKNOWN) fails closed on writes, reads still pass', async () => {
    const { server } = bootServer(UNKNOWN);
    await expect(server.toolHandler('CreateProgram')({})).rejects.toThrow(
      /ERR_READONLY_TIER.*tier=UNKNOWN/s,
    );
    expect(server.connectionOpens).toBe(0);
    await expect(server.toolHandler('GetProgram')({})).resolves.toBeDefined();
    expect(executed).toEqual(['GetProgram']);
    expect(server.connectionOpens).toBe(1);
  });

  it('ReloadProfile stays reachable on a blocked tier', async () => {
    const { server } = bootServer(PRD);
    await expect(
      server.toolHandler('ReloadProfile')({}),
    ).resolves.toBeDefined();
    expect(executed).toEqual(['ReloadProfile']);
  });

  it('DEV passes every tool through (the gate must not break the product)', async () => {
    const { server } = bootServer(DEV);
    for (const tool of TOOL_NAMES) {
      await expect(server.toolHandler(tool)({})).resolves.toBeDefined();
    }
    expect(executed).toEqual([...TOOL_NAMES]);
    expect(server.connectionOpens).toBe(TOOL_NAMES.length);
  });

  it('inspection-only (no profile applied) keeps the permissive DEV default', async () => {
    // Boot shape of the connectionless shell: profile.ts returns tier DEV, so
    // the guard must stay silent and every tool must reach the (mock) handler.
    __resetProfileState();
    const server = new TestServer();
    server.register(new CompositeHandlersRegistry([new FakeGroup()]));
    for (const tool of TOOL_NAMES) {
      await expect(server.toolHandler(tool)({})).resolves.toBeDefined();
    }
    expect(executed).toEqual([...TOOL_NAMES]);
  });

  it('the whole tool surface stays registered on a blocked tier', () => {
    // The gate rejects at call time; it must not remove tools from tools/list.
    const { server } = bootServer(PRD);
    for (const tool of TOOL_NAMES) {
      expect(server.toolHandler(tool)).toBeInstanceOf(Function);
    }
  });
});
