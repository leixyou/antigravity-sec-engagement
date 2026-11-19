#!/usr/bin/env node
// PreToolUse hook: refuse, or escalate, a shell command whose targets are not
// covered by the engagement scope.
//
// Exit code is always 0 — a non-zero exit is treated by Antigravity as a hook
// error and ignored (fail open), which is exactly the wrong direction here.

import { loadScope, checkCommand, validateScope } from './lib/scope.mjs';
import { readEvent, commandOf, cwdOf, emit, note } from './lib/hook-io.mjs';

function main() {
  const event = readEvent();
  const command = commandOf(event);
  if (!command) return emit({});

  const cwd = cwdOf(event);
  const { scope, source, error } = loadScope(cwd);

  if (error) {
    note(`scope manifest ${source} failed to parse: ${error}`);
    return emit({
      decision: 'ask',
      reason: `sec-engagement: scope manifest ${source} could not be parsed (${error}). Fix it before running "${clip(command)}".`,
    });
  }

  if (scope) {
    const problems = validateScope(scope);
    if (problems.length) {
      note(`scope manifest ${source} is incomplete: ${problems.join('; ')}`);
      return emit({
        decision: 'ask',
        reason: `sec-engagement: scope manifest ${source} is incomplete (${problems.join('; ')}).`,
      });
    }
  }

  let result;
  try {
    result = checkCommand(scope, command);
  } catch (err) {
    note(`scope check failed: ${err.message}`);
    return emit({
      decision: 'ask',
      reason: `sec-engagement: scope check failed (${err.message}); approve manually if "${clip(command)}" is in scope.`,
    });
  }

  if (result.decision === 'allow') return emit({});
  return emit({
    decision: result.decision,
    reason: `sec-engagement [${scope?.engagement ?? 'no-scope'}]: ${result.reason}. Command: ${clip(command)}`,
  });
}

function clip(command, max = 160) {
  const flat = String(command).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

try {
  main();
} catch (err) {
  note(`unhandled: ${err.message}`);
  emit({ decision: 'ask', reason: `sec-engagement hook error: ${err.message}` });
}
