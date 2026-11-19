// Hook stdin/stdout plumbing.
//
// The lifecycle-hook event schema is not part of the public plugin contract yet,
// so everything here is defensive: locate the fields we need anywhere in the
// event object, and never throw out to the hook runner.

import { readFileSync } from 'node:fs';

export function readEvent() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const COMMAND_KEYS = [
  'command',
  'cmd',
  'shellCommand',
  'shell_command',
  'commandLine',
  'command_line',
  'script',
];

const CWD_KEYS = [
  'cwd',
  'workspacePath',
  'workspaceRoot',
  'workingDirectory',
  'working_directory',
  'projectRoot',
  'root',
  'workspace',
];

const TOOL_KEYS = ['toolName', 'tool_name', 'toolId', 'tool_id', 'tool'];

function deepFind(obj, keys, depth = 0) {
  if (depth > 8 || obj === null || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = deepFind(item, keys, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  for (const value of Object.values(obj)) {
    const hit = deepFind(value, keys, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export const commandOf = (event) => deepFind(event, COMMAND_KEYS);
export const cwdOf = (event) => deepFind(event, CWD_KEYS) || process.cwd();
export const toolOf = (event) => deepFind(event, TOOL_KEYS) || 'run_command';

export function emit(payload) {
  try {
    process.stdout.write(JSON.stringify(payload));
  } catch {
    process.stdout.write('{}');
  }
  process.exit(0);
}

export function note(message) {
  try {
    process.stderr.write(`[sec-engagement] ${message}\n`);
  } catch {
    /* stderr closed; nothing useful to do */
  }
}
