import type { DeploymentType, HandlerSet, ToolPolicyKind } from '../../contracts';
import {
  DEFAULT_EXPOSITION,
  type ExposableTool,
  expositionFromArgv,
  expositionFromArgvDetailed,
  parseExposition,
  parseExpositionDetailed,
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
  tool('GetLegacyThing', ['readonly'], 'read', ['legacy']),
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
  //
  // DELIBERATE DIFFERENCE from the measured engine — register it as such.
  // `ServerConfigManager.parseExposition()` filtered the tokens and its caller
  // (:113) then replaced an empty result with `['readonly','high']`, so
  // `--exposition=bogus` opened the write surface. That is fail-open; here the
  // filtered result stands and the dropped tokens are reported instead.
  it('drops unknown tokens and does NOT fall back to the default', () => {
    expect(parseExposition('bogus')).toEqual([]);
    expect(parseExposition('readonly,bogus')).toEqual(['readonly']);
  });
});

describe('parseExpositionDetailed — diagnostics', () => {
  it('reports nothing when every token is recognised', () => {
    expect(parseExpositionDetailed('readonly,high')).toEqual({
      sets: ['readonly', 'high'],
      diagnostics: [],
    });
  });

  it('reports nothing for an unset value — that path legitimately defaults', () => {
    expect(parseExpositionDetailed(undefined).diagnostics).toEqual([]);
    expect(parseExpositionDetailed('  ').diagnostics).toEqual([]);
  });

  // DELIBERATE DIFFERENCE (see above): the surface stays narrow, so the reason
  // has to be said out loud rather than left as a silently smaller server.
  it('names the dropped token and says the value did not fall back', () => {
    const { sets, diagnostics } = parseExpositionDetailed('readonly,bogus');
    expect(sets).toEqual(['readonly']);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('EXPOSITION_UNKNOWN');
    expect(diagnostics[0]).toContain('bogus');
    expect(diagnostics[0]).toContain('readonly,high');
  });

  it('adds an EXPOSITION_EMPTY line when nothing at all was recognised', () => {
    const { sets, diagnostics } = parseExpositionDetailed('bogus');
    expect(sets).toEqual([]);
    expect(diagnostics.join('\n')).toContain('EXPOSITION_UNKNOWN');
    expect(diagnostics.join('\n')).toContain('EXPOSITION_EMPTY');
  });

  it('returns the diagnostics by value and writes nothing to stderr', () => {
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(parseExpositionDetailed('bogus').diagnostics.length).toBeGreaterThan(0);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('expositionFromArgvDetailed', () => {
  it('carries the diagnostics of the occurrence it used', () => {
    const { sets, diagnostics } = expositionFromArgvDetailed(['--exposition=bogus']);
    expect(sets).toEqual([]);
    expect(diagnostics.join('\n')).toContain('EXPOSITION_UNKNOWN');
  });

  it('reports nothing when the flag is absent', () => {
    expect(expositionFromArgvDetailed(['--transport=stdio'])).toEqual({
      sets: [...DEFAULT_EXPOSITION],
      diagnostics: [],
    });
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

  // The `legacy` axis is its own value, not a synonym for cloud: a tool that
  // declares only `legacy` appears there and nowhere else, and the ordinary
  // onprem/cloud tools disappear.
  it('exposes legacy-only tools when the deployment axis is legacy', () => {
    const got = names(
      selectExposedTools(CATALOG, { sets: ['readonly', 'high'], systemType: 'legacy' }),
    );
    expect(got).toContain('GetLegacyThing');
    expect(got).toContain('AlwaysOnTool');
    expect(got).not.toContain('GetProgram');
    expect(got).not.toContain('ReadClass');
    expect(got).not.toContain('UpdateClass');
  });

  // NEGATIVE — and it is hidden everywhere else.
  it('hides legacy-only tools on cloud and onprem', () => {
    for (const systemType of ['cloud', 'onprem'] as DeploymentType[]) {
      const got = names(selectExposedTools(CATALOG, { sets: ['readonly', 'high'], systemType }));
      expect(got).not.toContain('GetLegacyThing');
    }
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
