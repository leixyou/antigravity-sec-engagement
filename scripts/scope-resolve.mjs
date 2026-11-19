#!/usr/bin/env node
// Human- and machine-readable scope resolution.
//
//   node scripts/scope-resolve.mjs [--cwd DIR] [--json]
//   node scripts/scope-resolve.mjs [--cwd DIR] --check "<shell command>"
//
// Exit codes
//   0  resolved / action allowed
//   2  usage error
//   3  action out of scope
//   4  action uses a forbidden technique
//   5  no scope resolved

import { loadScope, validateScope, checkCommand } from './lib/scope.mjs';

const argv = process.argv.slice(2);

function flag(name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function has(name) {
  return argv.includes(name);
}

const asJson = has('--json');
const cwd = flag('--cwd') || process.cwd();
const check = flag('--check');

if (has('--help') || has('-h')) {
  process.stdout.write(
    'usage: scope-resolve.mjs [--cwd DIR] [--json] [--check "<command>"]\n' +
      '\n' +
      '  no --check   print the resolved engagement brief\n' +
      '  --check      test one command against the scope and exit 0/3/4/5\n'
  );
  process.exit(0);
}

const { scope, source, error, fallback } = loadScope(cwd);

if (check !== undefined) {
  if (error) {
    process.stderr.write(`scope manifest ${source} could not be parsed: ${error}\n`);
    process.exit(5);
  }
  if (!scope) {
    process.stderr.write(`no scope resolved for ${cwd}\n`);
    process.exit(5);
  }
  const result = checkCommand(scope, check);
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ command: check, engagement: scope.engagement, ...result }, null, 2)}\n`);
  } else {
    process.stdout.write(`${result.decision.toUpperCase()}: ${result.reason}\n`);
    if (result.targets?.length) {
      process.stdout.write(`targets: ${result.targets.map((t) => `${t.value}(${t.kind})`).join(', ')}\n`);
    }
  }
  process.exit(result.decision === 'allow' ? 0 : result.decision === 'deny' ? (result.technique ? 4 : 3) : 3);
}

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        resolved: Boolean(scope),
        source,
        fallback: Boolean(fallback),
        error: error ?? null,
        problems: scope ? validateScope(scope) : ['no scope resolved'],
        scope,
      },
      null,
      2
    )}\n`
  );
  process.exit(scope && !error ? 0 : 5);
}

if (error) {
  process.stdout.write(`ERROR  ${source}\n  ${error}\n`);
  process.exit(2);
}
if (!scope) {
  process.stdout.write(`NO SCOPE for ${cwd}\n`);
  process.stdout.write('Looked for: scope.yml, scope.json, ~/.config/sec-engagement/scopes/<project>.yml, default.yml\n');
  process.exit(5);
}

const problems = validateScope(scope);
process.stdout.write(`engagement       ${scope.engagement}\n`);
process.stdout.write(`authorization    ${scope.authorization_ref ?? '(missing)'}\n`);
if (scope.window) {
  const w = typeof scope.window === 'string' ? scope.window : `${scope.window.start} -> ${scope.window.end}`;
  process.stdout.write(`window           ${w}\n`);
}
process.stdout.write(`source           ${source}${fallback ? '  (fallback)' : ''}\n`);
process.stdout.write('\nin_scope\n');
for (const entry of scope.in_scope || []) {
  const e = typeof entry === 'string' ? { asset: entry } : entry;
  const tech = Array.isArray(e.techniques) ? `  ${e.techniques.join(', ')}` : '';
  process.stdout.write(`  ${String(e.asset).padEnd(28)} ${e.kind ?? ''}${tech}\n`);
}
const out = (scope.out_of_scope || []).map((e) => (typeof e === 'string' ? e : e?.asset)).filter(Boolean);
if (out.length) {
  process.stdout.write('\nout_of_scope (hard)\n');
  for (const a of out) process.stdout.write(`  ${a}\n`);
}
if (scope.forbidden_techniques?.length) {
  process.stdout.write(`\nforbidden_techniques  ${scope.forbidden_techniques.join(', ')}\n`);
}
if (scope.rate_limits) {
  process.stdout.write(`rate_limits           ${JSON.stringify(scope.rate_limits)}\n`);
}
if (problems.length) {
  process.stdout.write(`\nINCOMPLETE\n`);
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.exit(2);
}
process.stdout.write('\nOK\n');
