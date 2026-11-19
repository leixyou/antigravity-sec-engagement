// Zero-dependency scope engine for the sec-engagement plugin.
// Shared by the CLI and by the lifecycle hooks.

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONFIG_DIR = join(homedir(), '.config', 'sec-engagement');
const DEFAULT_DATA_DIR =
  process.platform === 'win32'
    ? join(homedir(), 'AppData', 'Local', 'sec-engagement')
    : join(homedir(), '.local', 'share', 'sec-engagement');

export const DATA_DIR = process.env.PLUGIN_DATA || DEFAULT_DATA_DIR;

// fileURLToPath, not URL.pathname: on Windows the latter yields `/C:/...`,
// which resolve() then turns into a nonsense path.
export const PLUGIN_ROOT =
  process.env.PLUGIN_ROOT || resolve(fileURLToPath(new URL('..', import.meta.url)));

// ---------------------------------------------------------------- YAML subset
// Deliberately small: maps, block lists, flow lists/maps, scalars, comments.
// Anchors, multi-document, block scalars and merge keys are NOT supported on
// purpose — schema drift in a scope manifest is a safety bug, not a nicety.

function stripComment(line) {
  let inS = false;
  let inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD) {
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function splitTop(s, sep) {
  const out = [];
  let depth = 0;
  let inS = false;
  let inD = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (inS || inD) continue;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

function unquote(s) {
  s = s.trim();
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return s.slice(1, -1);
  }
  return s;
}

function splitKey(s) {
  let depth = 0;
  let inS = false;
  let inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (inS || inD) continue;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0) {
      const next = s[i + 1];
      if (next !== undefined && next !== ' ' && next !== '\t') continue;
      return { key: unquote(s.slice(0, i)), rest: s.slice(i + 1).trim() };
    }
  }
  return { key: unquote(s), rest: undefined };
}

export function parseScalar(s) {
  s = String(s).trim();
  if (!s) return null;
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  if (s.startsWith('[') && s.endsWith(']')) {
    return splitTop(s.slice(1, -1), ',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parseScalar);
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const o = {};
    for (const part of splitTop(s.slice(1, -1), ',')) {
      if (!part.trim()) continue;
      const { key, rest } = splitKey(part);
      o[key] = rest === undefined || rest === '' ? null : parseScalar(rest);
    }
    return o;
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return Number.parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return Number.parseFloat(s);
  return s;
}

export function parseYaml(text) {
  const lines = [];
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const stripped = stripComment(rawLine);
    if (!stripped.trim()) continue;
    const indent = stripped.match(/^ */)[0].length;
    if (stripped.trim() === '---') continue;
    lines.push({ indent, content: stripped.trim() });
  }
  let i = 0;

  function parseBlock(indent) {
    if (i >= lines.length || lines[i].indent < indent) return null;
    const isList = /^-( |$)/.test(lines[i].content);

    if (isList) {
      const arr = [];
      while (i < lines.length && lines[i].indent === indent && /^-( |$)/.test(lines[i].content)) {
        const itemText = lines[i].content.slice(1).trim();
        i++;
        if (!itemText) {
          if (i < lines.length && lines[i].indent > indent) arr.push(parseBlock(lines[i].indent));
          else arr.push(null);
          continue;
        }
        const probe = splitKey(itemText);
        const isMapItem = probe.rest !== undefined;
        if (!isMapItem) {
          arr.push(parseScalar(itemText));
          continue;
        }
        const obj = {};
        obj[probe.key] = probe.rest === '' ? null : parseScalar(probe.rest);
        while (i < lines.length && lines[i].indent > indent && !/^-( |$)/.test(lines[i].content)) {
          const inner = lines[i];
          const kv = splitKey(inner.content);
          i++;
          if (kv.rest === undefined || kv.rest === '') {
            obj[kv.key] = i < lines.length && lines[i].indent > inner.indent ? parseBlock(lines[i].indent) : null;
          } else {
            obj[kv.key] = parseScalar(kv.rest);
          }
        }
        arr.push(obj);
      }
      return arr;
    }

    const obj = {};
    while (i < lines.length && lines[i].indent === indent && !/^-( |$)/.test(lines[i].content)) {
      const line = lines[i];
      const kv = splitKey(line.content);
      i++;
      if (kv.rest === undefined || kv.rest === '') {
        obj[kv.key] = i < lines.length && lines[i].indent > indent ? parseBlock(lines[i].indent) : null;
      } else {
        obj[kv.key] = parseScalar(kv.rest);
      }
    }
    return obj;
  }

  if (!lines.length) return {};
  return parseBlock(lines[0].indent);
}

// ---------------------------------------------------------------- scope load

function readManifest(file) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return JSON.parse(text);
  return parseYaml(text);
}

function projectKey(cwd) {
  // Prefer the git repo name, fall back to the directory name.
  try {
    const head = readFileSync(join(cwd, '.git', 'HEAD'), 'utf8');
    const m = head.match(/refs\/heads\/(.+)/);
    if (m) return m[1].trim();
  } catch {
    /* not a git checkout, or worktree indirection */
  }
  return basename(cwd);
}

export function loadScope(cwd = process.cwd()) {
  const root = resolve(cwd);
  const candidates = [
    join(root, 'scope.yml'),
    join(root, 'scope.json'),
    join(CONFIG_DIR, 'scopes', `${projectKey(root)}.yml`),
    join(CONFIG_DIR, 'scopes', `${basename(root)}.yml`),
    join(CONFIG_DIR, 'scopes', 'default.yml'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const scope = readManifest(file);
      if (!scope || typeof scope !== 'object') continue;
      return { scope, source: file, fallback: basename(file) === 'default.yml' };
    } catch (err) {
      return { scope: null, source: file, error: err.message };
    }
  }
  return { scope: null, source: null };
}

// ---------------------------------------------------------------- validation

const REQUIRED = ['engagement', 'authorization_ref', 'in_scope'];

export function validateScope(scope) {
  const problems = [];
  if (!scope) return ['no scope resolved'];
  for (const k of REQUIRED) if (!scope[k]) problems.push(`missing required key: ${k}`);
  if (scope.in_scope && !Array.isArray(scope.in_scope)) problems.push('in_scope must be a list');
  for (const entry of scope.in_scope || []) {
    const asset = typeof entry === 'string' ? entry : entry?.asset;
    if (!asset) problems.push('in_scope entry without an asset');
  }
  if (scope.rate_limits && typeof scope.rate_limits !== 'object') problems.push('rate_limits must be a map');
  return problems;
}

// ---------------------------------------------------------------- matching

export function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function cidrContains(cidr, ip) {
  const [base, bitsRaw] = String(cidr).split('/');
  const bits = Number.parseInt(bitsRaw ?? '32', 10);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipToInt(base);
  const b = ipToInt(ip);
  if (a === null || b === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

export function globToRegExp(glob) {
  const escaped = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^.]*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

export function assetMatches(asset, target) {
  const kind = target.kind;
  const value = target.value;
  if (value.includes('/') && kind === 'ip') return cidrContains(value, target.ip || value.split('/')[0]);
  if (kind === 'ip') {
    if (String(asset).includes('/')) return cidrContains(asset, value);
    return String(asset) === value;
  }
  if (kind === 'host') {
    if (String(asset).startsWith('*.')) return globToRegExp(asset).test(value);
    return String(asset).toLowerCase() === value.toLowerCase();
  }
  return false;
}

// ---------------------------------------------------------------- extraction

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '0.0.0.0']);

const NON_HOST_SUFFIXES = new Set([
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cc', 'cpp',
  'hpp', 'md', 'txt', 'json', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'log', 'csv', 'xml',
  'html', 'css', 'sh', 'bash', 'zsh', 'ps1', 'php', 'pl', 'lua', 'sql', 'db', 'so', 'dylib',
  'dll', 'exe', 'bin', 'elf', 'o', 'a', 'zip', 'gz', 'tgz', 'tar', 'pkg', 'dmg', 'iso', 'img',
  'pcap', 'pcapng', 'cer', 'crt', 'pem', 'key', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp',
]);

export function extractTargets(command) {
  const cmd = String(command || '');
  const targets = new Map();

  const add = (kind, value, ip) => {
    const key = `${kind}:${value}`;
    if (!targets.has(key)) targets.set(key, { kind, value, ip });
  };

  for (const m of cmd.matchAll(/\bhttps?:\/\/([^/\s:'"<>]+)(?::(\d+))?/gi)) {
    const host = m[1].toLowerCase();
    if (LOOPBACK.has(host)) continue;
    add(ipToInt(host) === null ? 'host' : 'ip', host);
  }
  for (const m of cmd.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?\b/g)) {
    const ip = m[1];
    if (LOOPBACK.has(ip)) continue;
    add('ip', m[2] ? `${ip}/${m[2]}` : ip, ip);
  }
  for (const m of cmd.matchAll(/\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24})\b/gi)) {
    const host = m[1].toLowerCase();
    if (LOOPBACK.has(host)) continue;
    const suffix = host.split('.').pop();
    if (NON_HOST_SUFFIXES.has(suffix)) continue;
    add('host', host);
  }
  return [...targets.values()];
}

// IPv6 literals: bracketed (how they appear in URLs and most tool arguments)
// and the fully expanded 8-group form. Compressed forms such as fe80::1 are
// ambiguous against C++ `add::sub`, so they are deliberately NOT matched —
// they fall through to the "unresolved IPv6" escalation instead.
export function extractIpv6(command) {
  const cmd = String(command || '');
  const found = new Set();
  for (const m of cmd.matchAll(/\[([0-9a-fA-F:.]{2,45})\]/g)) {
    if (m[1].includes(':')) found.add(m[1].toLowerCase());
  }
  for (const m of cmd.matchAll(/\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g)) {
    found.add(m[0].toLowerCase());
  }
  for (const loop of ['::1', '0:0:0:0:0:0:0:1']) found.delete(loop);
  return [...found];
}

// ---------------------------------------------------------------- techniques

const TECHNIQUE_SIGNATURES = {
  dos: [
    /\b--flood\b/, /\bhping3\b/, /\bslowloris\b/, /\bgoldeneye\b/, /\bmdk4\b/,
    /\baireplay-ng\b[^\n]*--deauth/, /\bt50\b/, /\b--dos\b/, /\bsynflood\b/,
  ],
  data_exfiltration: [/\bexfiltrat/i, /\bcurl\b[^\n]*\|\s*(?:sh|bash)\b/],
  social_engineering: [/\bsetoolkit\b/i, /\bgophish\b/i, /\bphishing\s+kit\b/i],
  physical: [],
};

export function detectTechniques(command) {
  const hits = [];
  const cmd = String(command || '');
  for (const [name, patterns] of Object.entries(TECHNIQUE_SIGNATURES)) {
    if (patterns.some((re) => re.test(cmd))) hits.push(name);
  }
  return hits;
}

// ---------------------------------------------------------------- the check

export function checkCommand(scope, command) {
  if (!scope) {
    const targets = extractTargets(command);
    const remote = targets.length > 0;
    return {
      decision: remote ? 'ask' : 'allow',
      reason: remote
        ? 'no engagement scope resolved and this command names a remote target'
        : 'no engagement scope resolved; command names no remote target',
      targets,
    };
  }

  const targets = extractTargets(command);
  const forbidden = (scope.forbidden_techniques || []).map(String);
  for (const tech of detectTechniques(command)) {
    if (forbidden.includes(tech)) {
      return {
        decision: 'deny',
        reason: `forbidden_techniques includes "${tech}" for engagement ${scope.engagement}`,
        targets,
        technique: tech,
      };
    }
  }

  // An IPv6 literal we cannot attribute is escalated, never silently allowed.
  const v6 = extractIpv6(command);
  if (v6.length) {
    const scopeHasV6 = (scope.in_scope || []).some((e) => String(e?.asset ?? e).includes(':'));
    if (!scopeHasV6) {
      return {
        decision: 'ask',
        reason: `IPv6 target(s) ${v6.join(', ')} found, but the scope engine matches IPv4 and hostnames only — confirm manually or add the literal to in_scope`,
        targets,
        ipv6: v6,
      };
    }
  }

  if (!targets.length) return { decision: 'allow', reason: 'no remote target in command', targets };

  const outOfScope = (scope.out_of_scope || []).map((e) => (typeof e === 'string' ? e : e?.asset)).filter(Boolean);
  for (const target of targets) {
    for (const asset of outOfScope) {
      if (assetMatches(asset, target)) {
        return {
          decision: 'deny',
          reason: `target ${target.value} matches out_of_scope entry ${asset} (engagement ${scope.engagement})`,
          targets,
          target: target.value,
        };
      }
    }
  }

  const inScope = (scope.in_scope || []).map((e) => (typeof e === 'string' ? { asset: e } : e)).filter((e) => e?.asset);
  const unmatched = [];
  for (const target of targets) {
    if (!inScope.some((entry) => assetMatches(entry.asset, target))) unmatched.push(target.value);
  }
  if (unmatched.length) {
    return {
      decision: 'deny',
      reason: `not in in_scope for ${scope.engagement}: ${unmatched.join(', ')}`,
      targets,
      unmatched,
    };
  }

  return { decision: 'allow', reason: `all targets in scope for ${scope.engagement}`, targets };
}

// ---------------------------------------------------------------- evidence

export function evidenceDir(scope) {
  return join(DATA_DIR, 'evidence', scope?.engagement || 'unscoped');
}
