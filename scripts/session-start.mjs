#!/usr/bin/env node
// SessionStart hook: put the engagement brief in front of the model before it
// reads the first request, so scope is context rather than a later discovery.

import { loadScope, validateScope } from './lib/scope.mjs';
import { readEvent, cwdOf, emit } from './lib/hook-io.mjs';

function summary(scope, source, fallback) {
  const inScope = (scope.in_scope || [])
    .map((e) => (typeof e === 'string' ? { asset: e } : e))
    .filter((e) => e?.asset)
    .map((e) => {
      const tech = Array.isArray(e.techniques) ? ` [${e.techniques.join(', ')}]` : '';
      return `${e.asset}${tech}`;
    });
  const outScope = (scope.out_of_scope || [])
    .map((e) => (typeof e === 'string' ? e : e?.asset))
    .filter(Boolean);
  const limits = scope.rate_limits || {};

  const lines = [
    'ENGAGEMENT BRIEF (sec-engagement plugin)',
    `engagement: ${scope.engagement}`,
    `authorization_ref: ${scope.authorization_ref ?? '(missing)'}`,
  ];
  if (scope.window) {
    const w = typeof scope.window === 'string' ? scope.window : `${scope.window.start} → ${scope.window.end}`;
    lines.push(`window: ${w}`);
  }
  lines.push(`in_scope: ${inScope.join(' | ') || '(none)'}`);
  if (outScope.length) lines.push(`out_of_scope (hard): ${outScope.join(', ')}`);
  if (scope.forbidden_techniques?.length) {
    lines.push(`forbidden_techniques: ${scope.forbidden_techniques.join(', ')}`);
  }
  if (limits.default_rps || limits.max_concurrency) {
    lines.push(`rate_limits: ${limits.default_rps ?? '?'} rps, ${limits.max_concurrency ?? '?'} concurrent`);
  }
  lines.push(`scope_source: ${source}`);
  if (fallback) {
    lines.push('NOTE: this scope came from default.yml and does not by itself authorize a named client engagement — confirm it applies.');
  }
  lines.push(
    'Protocol: name the in-scope asset before every network or mutating command; answer a blocked action with NEEDS_SCOPE: <asset> <technique>; commands are logged automatically to the evidence trail.'
  );
  return lines.join('\n');
}

function main() {
  const event = readEvent();
  const cwd = cwdOf(event);
  const { scope, source, error, fallback } = loadScope(cwd);

  let brief;
  if (error) {
    brief =
      `ENGAGEMENT BRIEF (sec-engagement plugin)\nscope manifest ${source} could not be parsed: ${error}\n` +
      'Ask the user to fix it before any network activity.';
  } else if (!scope) {
    brief =
      'ENGAGEMENT BRIEF (sec-engagement plugin)\nNo scope manifest resolved for this workspace.\n' +
      'Local work (reading files, building, analysing a sample) is unaffected. Before any network activity toward a remote target, ask the user for the engagement manifest, or offer to create scope.yml.';
  } else {
    const problems = validateScope(scope);
    brief = problems.length
      ? `ENGAGEMENT BRIEF (sec-engagement plugin)\nscope manifest ${source} is incomplete: ${problems.join('; ')}\nAsk before any network activity.`
      : summary(scope, source, fallback);
  }

  return emit({ injectSteps: [{ userMessage: brief }] });
}

try {
  main();
} catch (err) {
  emit({});
}
