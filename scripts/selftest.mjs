#!/usr/bin/env node
// Offline self-test: scope engine, matching matrix, and all three lifecycle
// hooks. No network. Exits non-zero on the first failed expectation.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

let pass = 0;
const failures = [];

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

function check(label, actual, expected) {
  if (stable(actual) === stable(expected)) {
    pass += 1;
  } else {
    failures.push(`${label}\n    expected: ${stable(expected)}\n    actual:   ${stable(actual)}`);
  }
}

function runCli(args, cwd = ROOT) {
  try {
    return { code: 0, out: execFileSync('node', [join(HERE, 'scope-resolve.mjs'), ...args], { cwd, encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function runHook(name, event, env = {}) {
  const out = execFileSync('node', [join(HERE, name)], {
    cwd: ROOT,
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return out.trim() ? JSON.parse(out.trim()) : {};
}

const MANIFEST = `engagement: T-1
authorization_ref: REF-1
in_scope:
  - asset: 10.20.0.0/24
    kind: cidr
    techniques: [recon, web]
  - asset: app.example.internal
    kind: host
  - asset: "*.api.example.internal"
    kind: host
out_of_scope:
  - 10.20.0.250
  - "*.hr.example.internal"
forbidden_techniques: [dos, data_exfiltration]
rate_limits: { default_rps: 5, max_concurrency: 8 }
`;

const dataDir = mkdtempSync(join(tmpdir(), 'sec-data-'));
const ws = mkdtempSync(join(tmpdir(), 'sec-ws-'));
const empty = mkdtempSync(join(tmpdir(), 'sec-empty-'));
writeFileSync(join(ws, 'scope.yml'), MANIFEST);

// ---------------------------------------------------------------- CLI matrix
const cli = [
  ['nmap -sV 10.20.0.14', 0],
  ['nmap -sV 10.20.0.250', 3],
  ['nmap -sV 8.8.8.8', 3],
  ['hping3 --flood 10.20.0.14', 4],
  ['python3 analyze.py', 0],
  ['curl -s https://app.example.internal/x', 0],
  ['curl -s https://gw.api.example.internal/x', 0],
  ['curl -s https://evil.example.com/x', 3],
  ['ssh a@db.hr.example.internal', 3],
  ['otool -hv ./sample.bin', 0],
  ['curl -s http://[2001:db8::1]/x', 3],
];
for (const [cmd, expected] of cli) {
  const { code } = runCli(['--cwd', ws, '--check', cmd]);
  check(`check: ${cmd}`, code, expected);
}

// ---------------------------------------------------------------- hooks
check('hook: in scope allows', runHook('pre-tool-scope.mjs', { toolName: 'run_command', tool_input: { command: 'nmap -sV 10.20.0.14' }, cwd: ws }), {});
check(
  'hook: out of scope denies',
  runHook('pre-tool-scope.mjs', { toolName: 'run_command', tool_input: { command: 'nmap -sV 10.20.0.250' }, cwd: ws }).decision,
  'deny'
);
check(
  'hook: forbidden technique denies',
  runHook('pre-tool-scope.mjs', { toolName: 'run_command', tool_input: { command: 'hping3 --flood 10.20.0.14' }, cwd: ws }).decision,
  'deny'
);
check(
  'hook: no scope + remote target escalates',
  runHook('pre-tool-scope.mjs', { toolName: 'run_command', tool_input: { command: 'nmap 203.0.113.9' }, cwd: empty }).decision,
  'ask'
);
check(
  'hook: no scope + local command pass',
  runHook('pre-tool-scope.mjs', { toolName: 'run_command', tool_input: { command: 'cargo build' }, cwd: empty }),
  {}
);

const brief = runHook('session-start.mjs', { cwd: ws });
check('hook: brief names the engagement', /engagement: T-1/.test(JSON.stringify(brief)), true);

runHook('post-tool-audit.mjs', { toolName: 'run_command', tool_input: { command: 'nmap -sV 10.20.0.14' }, cwd: ws }, { PLUGIN_DATA: dataDir });
const jsonl = readFileSync(join(dataDir, 'evidence', 'T-1', 'commands.jsonl'), 'utf8').trim().split('\n');
check('hook: evidence record written', jsonl.length, 1);
check('hook: evidence record has the command', JSON.parse(jsonl[0]).command, 'nmap -sV 10.20.0.14');

rmSync(dataDir, { recursive: true, force: true });
rmSync(ws, { recursive: true, force: true });
rmSync(empty, { recursive: true, force: true });

// ---------------------------------------------------------------- report
if (failures.length) {
  process.stderr.write(`\n${failures.length} failed, ${pass} passed\n\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n\n`);
  process.exit(1);
}
process.stdout.write(`${pass} checks passed\n`);
