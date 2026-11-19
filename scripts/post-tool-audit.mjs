#!/usr/bin/env node
// PostToolUse hook: append one JSONL record per executed command.
//
// This is the evidence trail the report cites. It is append-only by design:
// nothing here truncates, rewrites, or deduplicates prior records.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadScope, evidenceDir } from './lib/scope.mjs';
import { readEvent, commandOf, cwdOf, toolOf, emit, note } from './lib/hook-io.mjs';

function main() {
  const event = readEvent();
  const command = commandOf(event);
  if (!command) return emit({});

  const cwd = cwdOf(event);
  const { scope, source } = loadScope(cwd);
  const dir = evidenceDir(scope);

  const record = {
    ts: new Date().toISOString(),
    tool: toolOf(event),
    command,
    cwd,
    engagement: scope?.engagement ?? null,
    scope_source: source,
    host: process.env.COMPUTERNAME || process.env.HOSTNAME || process.env.HOST || null,
    user: process.env.USER || process.env.USERNAME || null,
  };

  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(join(dir, 'commands.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch (err) {
    note(`could not write evidence record: ${err.message}`);
  }

  return emit({});
}

try {
  main();
} catch (err) {
  note(`unhandled: ${err.message}`);
  emit({});
}
