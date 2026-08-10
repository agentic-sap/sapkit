import type { DeploymentType, HandlerSet, ToolPolicyKind } from '../../contracts';
import {
  DEFAULT_EXPOSITION,
  type ExposableTool,
  expositionFromArgv,
  parseExposition,
  resolveActiveSets,
  selectExposedTools,
} from '../exposition';

function tool(
  name: string,
  sets: readonly HandlerSet[],
  kind: ToolPolicyKind,
  availableIn: readonly DeploymentType[] = ['onprem', 'cloud'],
): ExposableTool {
  return { name, kind, exposure: { sets, availableIn } };
}

// A miniature catalogue shaped like the real one: reads in `readonly`,
// mutations in `high`, row-data in `readonly` (measured: exposition does NOT
// gate row data), one onprem-only tool.
const CATALOG: ExposableTool[] = [
  tool('ReadClass', ['readonly'], 'read'),
  tool('GetTableContents', ['readonly'], 'row-data'),
  tool('GetSqlQuery', ['readonly'], 'row-data'),
  tool('ReloadProfile', ['system'], 'server-control'),
  tool('SearchObject', ['search'], 'read'),
  tool('CreateProgram', ['high'], 'mutation', ['onprem']),
  tool('UpdateClass', ['high'], 'mutation'),
  tool('ActivateObjects', ['high'], 'mutation'),
  tool('GetProgram', ['readonly'], 'read', ['onprem']),
  tool('AlwaysOnTool', ['readonly'], 'read', []),
];

const names = (tools: readonly ExposableTool[]): string[] => tools.map((t) => t.name);

describe('parseExposition', () => {
  it('defaults to readonly,high when the value is absent', () => {
    expect(parseExposition(undefined)).toEqual([...DEFAULT_EXPOSITION]);
    expect(DEFAULT_EXPOSITION).toEqual(['readonly', 'high']);
  });

  it('treats an empty value as unset (the bundle reads `--exposition=` as absent)', () => {
    expect(parseExposition('')).toEqual([...DEFAULT_EXPOSITION]);
    expect(parseExposition('   ')).toEqual([...DEFAULT_EXPOSITION]);
  });

  it('splits a comma-separated list and lowercases it', () => {
    expect(parseExposition('readonly,HIGH')).toEqual(['readonly', 'high']);
    expect(parseExposition('readonly, low ,compact')).toEqual(['readonly', 'low', 'compact']);
  });

  it('deduplicates while preserving order', () => {
    expect(parseExposition('high,readonly,high')).toEqual(['high', 'readonly']);
  });

  // NEGATIVE — a typo must not silently open the write surface.
  it('drops unknown tokens and does NOT fall back to the default', () => {
    expect(parseExposition('bogus')).toEqual([]);
    expect(parseExposition('readonly,bogus')).toEqual(['readonly']);
  });
});

describe('expositionFromArgv', () => {
  it('reads --exposition=VALUE', () => {
    expect(expositionFromArgv(['--exposition=readonly'])).toEqual(['readonly']);
  });

  it('reads the two-token --exposition VALUE form', () => {
    expect(expositionFromArgv(['--exposition', 'readonly,high'])).toEqual(['readonly', 'high']);
  });

  it('takes the FIRST occurrence, like the bundle parser', () => {
    expect(expositionFromArgv(['--exposition=readonly', '--exposition=readonly,high'])).toEqual([
      'readonly',
    ]);
  });

  it('defaults when the flag is absent', () => {
    expect(expositionFromArgv(['--transport=stdio'])).toEqual([...DEFAULT_EXPOSITION]);
  });

  it('defaults when the flag carries an empty value', () => {
    expect(expositionFromArgv(['--exposition='])).toEqual([...DEFAULT_EXPOSITION]);
    expect(expositionFromArgv(['--exposition'])).toEqual([...DEFAULT_EXPOSITION]);
  });
});

describe('resolveActiveSets', () => {
  it('activates the system set together with readonly', () => {
    expect([...resolveActiveSets(['readonly'])].sort()).toEqual(['readonly', 'search', 'system']);
  });

  it('always activates the search set', () => {
    expect([...resolveActiveSets([])]).toEqual(['search']);
    expect([...resolveActiveSets(['high'])].sort()).toEqual(['high', 'search']);
  });
});

describe('selectExposedTools — handler-set filter', () => {
  it('exposes reads, row-data, system and search under readonly', () => {
    const got = names(selectExposedTools(CATALOG, { sets: ['readonly'], systemType: 'onprem' }));
    expect(got).toEqual(
      expect.arrayContaining([
        'ReadClass',
        'GetTableContents',
        'GetSqlQuery',
        'ReloadProfile',
        'SearchObject',
      ]),
    );
  });

  // NEGATIVE — the whole point of `readonly`.
  it('hides every mutation tool under readonly', () => {
    const got = names(selectExposedTools(CATALOG, { sets: ['readonly'], systemType: 'onprem' }));
    expect(got).not.toContain('CreateProgram');
    expect(got).not.toContain('UpdateClass');
    expect(got).not.toContain('ActivateObjects');
  });

  it('exposes mutation tools under readonly,high', () => {
    const got = names(
      selectExposedTools(CATALOG, { sets: ['readonly', 'high'], systemType: 'onprem' }),
    );
    expect(got).toContain('UpdateClass');
    expect(got).toContain('CreateProgram');
  });

  // Measured finding: exposition does not gate row data — it is on both surfaces.
  it('keeps the two row-data tools visible on BOTH surfaces', () => {
    for (const sets of [['readonly'], ['readonly', 'high']] as HandlerSet[][]) {
      const got = names(selectExposedTools(CATALOG, { sets, systemType: 'onprem' }));
      expect(got).toContain('GetTableContents');
      expect(got).toContain('GetSqlQuery');
    }
  });
});

describe('selectExposedTools — deployment filter', () => {
  // NEGATIVE — the second stage of the two-stage filter.
  it('hides onprem-only tools when the deployment axis is cloud', () => {
    const got = names(
      selectExposedTools(CATALOG, { sets: ['readonly', 'high'], systemType: 'cloud' }),
    );
    expect(got).not.toContain('GetProgram');
    expect(got).not.toContain('CreateProgram');
    expect(got).toContain('UpdateClass');
  });

  it('shows onprem-only tools when the deployment axis is onprem', () => {
    const got = names(
      selectExposedTools(CATALOG, { sets: ['readonly', 'high'], systemType: 'onprem' }),
    );
    expect(got).toContain('GetProgram');
    expect(got).toContain('CreateProgram');
  });

  it('does not filter tools that declare no deployment axis', () => {
    for (const systemType of ['cloud', 'onprem'] as DeploymentType[]) {
      const got = names(selectExposedTools(CATALOG, { sets: ['readonly'], systemType }));
      expect(got).toContain('AlwaysOnTool');
    }
  });

  it('applies both stages: an unexposed onprem tool stays hidden on onprem', () => {
    const got = names(selectExposedTools(CATALOG, { sets: ['readonly'], systemType: 'onprem' }));
    expect(got).not.toContain('CreateProgram');
  });
});
