// 인자 파서 — 자작 소형.
//
// 이 부품의 설계 전제는 **런타임 외부 의존 0**이다. 인자 파싱 라이브러리 하나를 들이면
// 그 전제가 무너지므로, 이 CLI가 실제로 쓰는 만큼만 직접 쓴다: 긴 깃발(`--이름`),
// 값 붙이는 두 형태(`--이름 값` · `--이름=값`), `--` 종결자, 나머지는 위치 인자.
//
// 짧은 깃발(`-f`)·묶음 깃발(`-abc`)은 **일부러 없다.** 쓰는 곳이 없고, 없으면 오타가
// 조용히 위치 인자로 흘러 들어가는 길도 함께 막힌다.

/** 깃발이 값을 받는 방식. */
export type FlagKind = 'boolean' | 'string' | 'number';

/** 명령 하나가 받는 깃발표. 여기 없는 이름은 전부 사용 오류다. */
export type FlagSpec = Readonly<Record<string, FlagKind>>;

/** 쓰는 법이 틀렸다 — 판정을 시작하지도 못했다는 뜻이다. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** 파싱 결과. 값은 선언한 방식대로만 꺼낸다. */
export class ParsedArgs {
  constructor(
    readonly positionals: readonly string[],
    private readonly values: ReadonlyMap<string, string | number | boolean>,
  ) {}

  bool(name: string): boolean {
    return this.values.get(name) === true;
  }

  str(name: string, fallback: string): string {
    const value = this.values.get(name);
    return typeof value === 'string' ? value : fallback;
  }

  num(name: string, fallback: number): number {
    const value = this.values.get(name);
    return typeof value === 'number' ? value : fallback;
  }
}

export function parseArgs(argv: readonly string[], spec: FlagSpec): ParsedArgs {
  const positionals: string[] = [];
  const values = new Map<string, string | number | boolean>();
  let terminated = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (terminated || arg === '-' || !arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    if (arg === '--') {
      terminated = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new UsageError(`unknown option '${arg}' — this CLI takes long options only (--name)`);
    }

    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const inline = eq === -1 ? null : arg.slice(eq + 1);

    const kind: FlagKind | undefined = Object.prototype.hasOwnProperty.call(spec, name) ? spec[name] : undefined;
    if (kind === undefined) throw new UsageError(`unknown option '--${name}'`);

    if (kind === 'boolean') {
      if (inline !== null) throw new UsageError(`option '--${name}' takes no value`);
      values.set(name, true);
      continue;
    }

    let raw = inline;
    if (raw === null) {
      const next = argv[i + 1];
      if (next === undefined) throw new UsageError(`option '--${name}' needs a value`);
      raw = next;
      i += 1;
    }

    if (kind === 'number') {
      const parsed = Number(raw);
      if (raw.trim() === '' || !Number.isInteger(parsed)) {
        throw new UsageError(`option '--${name}' needs a whole number, got '${raw}'`);
      }
      values.set(name, parsed);
    } else {
      values.set(name, raw);
    }
  }

  return new ParsedArgs(positionals, values);
}
