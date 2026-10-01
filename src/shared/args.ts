/**
 * SHARED CONTRACT — git-style option parsing.
 *
 * `parseArgs(spec, argv)` turns the arguments after the subcommand into
 * `ParsedArgs` following git's parse-options rules:
 *   --long, --long=value, --long value, --no-long, unique long prefixes,
 *   -s, -abc (bundled), -mvalue, -m value, -vv (count), -3 (numeric shorthand),
 *   "--" ends options (the rest go to `paths`), a lone "-" is a positional.
 * Options may appear before or after positionals, as in git.
 */
import { GIT_GLOBAL_OPTIONS, type CommandSpec, type OptionSpec } from './commandSpecs';

export type OptionValue = boolean | string | number | string[];

export interface ParsedArgs {
  /** Canonical option name -> value. Absent when not given. */
  options: Record<string, OptionValue>;
  /** Non-option arguments before "--", in order (subcommand excluded). */
  positionals: string[];
  /** Arguments after a literal "--"; null when there was no "--". */
  paths: string[] | null;
  /** Selected subcommand name (canonical, aliases resolved), or null. */
  subcommand: string | null;
}

export interface ParseError {
  error: true;
  /** Lines for stderr, already in git's wording. */
  lines: string[];
  exitCode: 129;
}

export type ParseResult = ParsedArgs | ParseError;

export function isParseError(r: ParseResult): r is ParseError {
  return (r as ParseError).error === true;
}

function usageLines(usage: string[]): string[] {
  return usage.map((u, i) => (i === 0 ? `usage: ${u}` : `   or: ${u}`));
}

function findLong(options: OptionSpec[], name: string): { opt: OptionSpec; negated: boolean } | { ambiguous: string[] } | null {
  for (const opt of options) if (opt.long?.includes(name)) return { opt, negated: false };
  if (name.startsWith('no-')) {
    const base = name.slice(3);
    for (const opt of options) if (opt.negatable && opt.long?.includes(base)) return { opt, negated: true };
  }
  // Unique prefix abbreviation, as git allows (--amen → --amend).
  const matches: { opt: OptionSpec; negated: boolean; spelled: string }[] = [];
  for (const opt of options) {
    for (const l of opt.long ?? []) {
      if (l.startsWith(name)) matches.push({ opt, negated: false, spelled: l });
      if (opt.negatable && `no-${l}`.startsWith(name) && name.startsWith('no-')) matches.push({ opt, negated: true, spelled: `no-${l}` });
    }
  }
  const unique = [...new Map(matches.map((m) => [`${m.opt.name}:${m.negated}`, m])).values()];
  if (unique.length === 1) return { opt: unique[0].opt, negated: unique[0].negated };
  if (unique.length > 1) return { ambiguous: unique.map((m) => m.spelled) };
  return null;
}

function setValue(options: Record<string, OptionValue>, opt: OptionSpec, val: string | boolean): void {
  switch (opt.kind) {
    case 'flag':
      options[opt.name] = val === false ? false : true;
      break;
    case 'count':
      options[opt.name] = val === false ? 0 : ((options[opt.name] as number | undefined) ?? 0) + 1;
      break;
    case 'list': {
      if (val === false) {
        options[opt.name] = [];
        break;
      }
      const prev = (options[opt.name] as string[] | undefined) ?? [];
      options[opt.name] = [...prev, String(val)];
      break;
    }
    case 'value':
      options[opt.name] = val === false ? false : String(val);
      break;
    case 'optionalValue':
      options[opt.name] = val;
      break;
  }
}

/**
 * Parse `argv` (arguments after the subcommand name) against a command spec.
 * Subcommands: if argv[0] names a subcommand (or alias) it is selected and
 * removed; otherwise `defaultSubcommand` is used when argv[0] is absent or an
 * option. A non-option argv[0] that is not a subcommand leaves `subcommand`
 * null and stays in `positionals` so the handler can print git's error.
 */
export function parseArgs(spec: CommandSpec, argv: string[]): ParseResult {
  let rest = argv;
  let subcommand: string | null = null;
  let options: OptionSpec[] = spec.options;
  let usage = spec.usage;
  if (spec.subcommands) {
    const first = argv[0];
    const entry = first !== undefined ? Object.values(spec.subcommands).find((s) => s.name === first || s.aliases?.includes(first)) : undefined;
    if (entry) {
      subcommand = entry.name;
      rest = argv.slice(1);
    } else if (spec.defaultSubcommand && (first === undefined || first.startsWith('-'))) {
      subcommand = spec.defaultSubcommand;
    }
    const sub = subcommand ? spec.subcommands[subcommand] : undefined;
    if (sub) {
      options = [...sub.options, ...spec.options.filter((o) => !sub.options.some((s) => s.name === o.name))];
      usage = sub.usage;
    }
  }

  const parsed: ParsedArgs = { options: {}, positionals: [], paths: null, subcommand };
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (parsed.paths !== null) {
      parsed.paths.push(tok);
      continue;
    }
    if (tok === '--') {
      parsed.paths = [];
      continue;
    }
    if (tok === '-' || !tok.startsWith('-')) {
      parsed.positionals.push(tok);
      continue;
    }
    if (tok.startsWith('--')) {
      const body = tok.slice(2);
      const eq = body.indexOf('=');
      const name = eq >= 0 ? body.slice(0, eq) : body;
      const attached = eq >= 0 ? body.slice(eq + 1) : undefined;
      const found = findLong(options, name);
      if (!found) return { error: true, lines: [`error: unknown option \`${name}'`, ...usageLines(usage)], exitCode: 129 };
      if ('ambiguous' in found) return { error: true, lines: [`error: ambiguous option: ${name} (could be --${found.ambiguous.join(' or --')})`, ...usageLines(usage)], exitCode: 129 };
      const { opt, negated } = found;
      if (negated) {
        if (attached !== undefined) return { error: true, lines: [`error: option \`no-${opt.long?.[0]}' takes no value`], exitCode: 129 };
        setValue(parsed.options, opt, false);
        continue;
      }
      const spelled = opt.long?.find((l) => l === name) ?? opt.long?.[0] ?? name;
      if (opt.kind === 'flag' || opt.kind === 'count') {
        if (attached !== undefined) return { error: true, lines: [`error: option \`${spelled}' takes no value`], exitCode: 129 };
        setValue(parsed.options, opt, true);
      } else if (opt.kind === 'optionalValue') {
        setValue(parsed.options, opt, attached ?? true);
      } else {
        let v = attached;
        if (v === undefined) {
          if (i + 1 >= rest.length) return { error: true, lines: [`error: option \`${spelled}' requires a value`], exitCode: 129 };
          v = rest[++i];
        }
        setValue(parsed.options, opt, v);
      }
      continue;
    }
    // Short options.
    if (/^-\d+$/.test(tok) && spec.numericOption) {
      parsed.options[spec.numericOption] = tok.slice(1);
      continue;
    }
    for (let j = 1; j < tok.length; j++) {
      const c = tok[j];
      const opt = options.find((o) => o.short === c);
      if (!opt) return { error: true, lines: [`error: unknown switch \`${c}'`, ...usageLines(usage)], exitCode: 129 };
      if (opt.kind === 'flag' || opt.kind === 'count') {
        setValue(parsed.options, opt, true);
        continue;
      }
      const remainder = tok.slice(j + 1);
      if (opt.kind === 'optionalValue') {
        setValue(parsed.options, opt, remainder.length > 0 ? remainder : true);
        break;
      }
      let v: string;
      if (remainder.length > 0) v = remainder;
      else {
        if (i + 1 >= rest.length) return { error: true, lines: [`error: switch \`${c}' requires a value`, ...usageLines(usage)], exitCode: 129 };
        v = rest[++i];
      }
      setValue(parsed.options, opt, v);
      break;
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** True when the option was given (flag set, count > 0, value present, list non-empty). */
export function hasFlag(args: ParsedArgs, name: string): boolean {
  const v = args.options[name];
  if (v === undefined || v === false) return false;
  if (typeof v === 'number') return v > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** True only when the option was explicitly negated (--no-x). */
export function isNegated(args: ParsedArgs, name: string): boolean {
  return args.options[name] === false;
}

export function getString(args: ParsedArgs, name: string): string | undefined {
  const v = args.options[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[v.length - 1];
  return undefined;
}

export function getList(args: ParsedArgs, name: string): string[] {
  const v = args.options[name];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return [v];
  return [];
}

export function getCount(args: ParsedArgs, name: string): number {
  const v = args.options[name];
  if (typeof v === 'number') return v;
  return v === true ? 1 : 0;
}

/** All non-option arguments: positionals followed by paths after "--". */
export function allArgs(args: ParsedArgs): string[] {
  return [...args.positionals, ...(args.paths ?? [])];
}

// ---------------------------------------------------------------------------
// Global options (before the subcommand): git -C <path> -c k=v --version
// ---------------------------------------------------------------------------

export interface GlobalParse {
  options: Record<string, OptionValue>;
  /** Remaining argv starting at the subcommand. */
  rest: string[];
  error?: string[];
}

export function parseGlobalOptions(argv: string[]): GlobalParse {
  const options: Record<string, OptionValue> = {};
  let i = 0;
  while (i < argv.length && argv[i].startsWith('-') && argv[i] !== '-') {
    const tok = argv[i];
    const fake: CommandSpec = { name: 'git', owner: 'engine-a', summary: '', usage: ['git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>] <command> [<args>]'], options: GIT_GLOBAL_OPTIONS };
    // Value-taking global options consume the next token.
    const takesValue = tok === '-C' || tok === '-c';
    const slice = takesValue ? argv.slice(i, i + 2) : [tok];
    const r = parseArgs(fake, slice);
    if (isParseError(r)) {
      return { options, rest: argv.slice(i), error: [`unknown option: ${tok}`, ...fake.usage.map((u) => `usage: ${u}`)] };
    }
    for (const [k, v] of Object.entries(r.options)) {
      if (Array.isArray(v)) options[k] = [...((options[k] as string[] | undefined) ?? []), ...v];
      else options[k] = v;
    }
    i += slice.length;
  }
  return { options, rest: argv.slice(i) };
}
