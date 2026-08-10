import type { SapTier } from '../../contracts';
import {
  SERVER_CONTROL_TOOLS,
  TierBlockedError,
  assertTierAllowed,
  checkTierAllowed,
} from '../tier';

const NON_DEV: SapTier[] = ['QA', 'PRD', 'UNKNOWN'];

const mutation = (name = 'CreateProgram') => ({ name, kind: 'mutation' as const });
const read = (name = 'ReadClass') => ({ name, kind: 'read' as const });
const rowData = (name = 'GetTableContents') => ({ name, kind: 'row-data' as const });
const execution = (name = 'RuntimeRunClassWithProfiling') => ({
  name,
  kind: 'execution' as const,
});
const serverControl = (name = 'ReloadProfile') => ({ name, kind: 'server-control' as const });

describe('checkTierAllowed — DEV', () => {
  it('allows every class on DEV (the gate must not kill the product)', () => {
    for (const tool of [mutation(), read(), rowData(), execution(), serverControl()]) {
      expect(checkTierAllowed(tool, 'DEV').allowed).toBe(true);
    }
  });

  it('allows the unit-test runner on DEV', () => {
    expect(checkTierAllowed(execution('RunUnitTest'), 'DEV').allowed).toBe(true);
  });
});

describe('checkTierAllowed — mutation is DEV-only', () => {
  // NEGATIVE — QA write refused.
  it('refuses a write on QA', () => {
    const d = checkTierAllowed(mutation('CreateProgram'), 'QA');
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toContain('CreateProgram');
  });

  // NEGATIVE — PRD write refused.
  it('refuses a write on PRD', () => {
    expect(checkTierAllowed(mutation('UpdateClass'), 'PRD').allowed).toBe(false);
  });

  // NEGATIVE — unresolved tier refused (fail-closed).
  it('refuses a write when the tier is UNKNOWN (fail-closed)', () => {
    expect(checkTierAllowed(mutation('UpdateClass'), 'UNKNOWN').allowed).toBe(false);
  });

  it('refuses every mutation on every non-DEV tier', () => {
    for (const tier of NON_DEV) {
      expect(checkTierAllowed(mutation('DeleteClass'), tier).allowed).toBe(false);
      expect(checkTierAllowed(mutation('ActivateObjects'), tier).allowed).toBe(false);
    }
  });
});

describe('checkTierAllowed — reads', () => {
  it('allows reads on every tier', () => {
    for (const tier of [...NON_DEV, 'DEV' as SapTier]) {
      expect(checkTierAllowed(read('ReadClass'), tier).allowed).toBe(true);
      expect(checkTierAllowed(read('GetObjectStructure'), tier).allowed).toBe(true);
    }
  });

  it('allows row-data reads on every tier (the blocklist, not the tier, gates them)', () => {
    for (const tier of NON_DEV) {
      expect(checkTierAllowed(rowData('GetTableContents'), tier).allowed).toBe(true);
      expect(checkTierAllowed(rowData('GetSqlQuery'), tier).allowed).toBe(true);
    }
  });
});

describe('checkTierAllowed — execution', () => {
  // NEGATIVE — arbitrary ABAP execution is DEV-only.
  it('refuses profiling runs on QA and PRD', () => {
    for (const tier of NON_DEV) {
      expect(checkTierAllowed(execution('RuntimeRunClassWithProfiling'), tier).allowed).toBe(false);
      expect(checkTierAllowed(execution('RuntimeRunProgramWithProfiling'), tier).allowed).toBe(
        false,
      );
      expect(checkTierAllowed(execution('RuntimeCreateProfilerTraceParameters'), tier).allowed).toBe(
        false,
      );
    }
  });

  it('allows unit-test execution on QA (that is what QA is for) but not on PRD or UNKNOWN', () => {
    expect(checkTierAllowed(execution('RunUnitTest'), 'QA').allowed).toBe(true);
    expect(checkTierAllowed(execution('RunUnitTest'), 'PRD').allowed).toBe(false);
    expect(checkTierAllowed(execution('RunUnitTest'), 'UNKNOWN').allowed).toBe(false);
  });
});

describe('checkTierAllowed — server control', () => {
  it('always allows ReloadProfile — it is the escape hatch out of a bad profile', () => {
    for (const tier of [...NON_DEV, 'DEV' as SapTier]) {
      expect(checkTierAllowed(serverControl('ReloadProfile'), tier).allowed).toBe(true);
    }
  });

  it('exempts exactly the names the measured contract exempts', () => {
    expect([...SERVER_CONTROL_TOOLS]).toEqual(['ReloadProfile']);
  });

  // NEGATIVE — the exemption is a known-name list, not a class. A registry line
  // that merely declares `server-control` must not be able to smuggle a write
  // onto a production system.
  it('refuses a mutating NAME that declares itself server-control', () => {
    for (const name of ['DeleteClass', 'CreateProgram', 'ActivateObjects', 'UpdateClass']) {
      const d = checkTierAllowed({ name, kind: 'server-control' }, 'PRD');
      expect(d.allowed).toBe(false);
      expect(d.allowed === false && d.reason).toContain('declared');
    }
  });

  // NEGATIVE — an innocuous-looking but unknown server-control name is still
  // outside the exemption, so it falls through to the fail-closed branch.
  it('refuses a server-control name the exemption does not cover', () => {
    for (const tier of NON_DEV) {
      const d = checkTierAllowed({ name: 'RestartEverything', kind: 'server-control' }, tier);
      expect(d.allowed).toBe(false);
      expect(d.allowed === false && d.reason).toContain('ReloadProfile');
    }
  });
});

describe('checkTierAllowed — fail-closed cross-checks', () => {
  // NEGATIVE — a mis-declared registry entry must not smuggle a write through.
  it('refuses a mutating NAME even when it is declared read', () => {
    for (const name of ['CreateProgram', 'UpdateClass', 'DeleteView', 'ActivateObjects']) {
      const d = checkTierAllowed({ name, kind: 'read' }, 'QA');
      expect(d.allowed).toBe(false);
      expect(d.allowed === false && d.reason).toContain('declared');
    }
  });

  it('refuses an executing NAME even when it is declared read', () => {
    expect(checkTierAllowed({ name: 'RuntimeRunClassWithProfiling', kind: 'read' }, 'QA').allowed).toBe(
      false,
    );
  });

  // NEGATIVE — an unknown class is not a free pass.
  it('refuses a tool whose class it cannot recognise', () => {
    const d = checkTierAllowed(
      { name: 'SomethingNew', kind: 'brand-new' as unknown as 'read' },
      'QA',
    );
    expect(d.allowed).toBe(false);
  });

  it('does not misread ReloadProfile as a Release* mutation', () => {
    expect(checkTierAllowed(serverControl('ReloadProfile'), 'PRD').allowed).toBe(true);
  });
});

describe('assertTierAllowed', () => {
  it('throws a TierBlockedError carrying ERR_READONLY_TIER', () => {
    expect(() => assertTierAllowed(mutation('CreateProgram'), 'PRD')).toThrow(TierBlockedError);
    try {
      assertTierAllowed(mutation('CreateProgram'), 'PRD');
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TierBlockedError);
      expect((err as TierBlockedError).code).toBe('ERR_READONLY_TIER');
      expect((err as Error).message).toContain('ERR_READONLY_TIER');
      expect((err as Error).message).toContain('tier=PRD');
    }
  });

  it('does not throw on DEV', () => {
    expect(() => assertTierAllowed(mutation('CreateProgram'), 'DEV')).not.toThrow();
  });
});
