---
name: engagement-scope
description: >-
  Resolve, validate, and summarize the active engagement scope before any
  network activity. Use when starting an engagement, when unsure whether a host
  or technique is in scope, or when the scope manifest needs to change.
---

# Engagement scope

The CLI lives at the plugin root, not in this skill folder. Use:

```bash
SCOPE="node ${PLUGIN_ROOT:-$HOME/.gemini/config/plugins/sec-engagement}/scripts/scope-resolve.mjs"

$SCOPE --cwd .          # human-readable brief
$SCOPE --cwd . --json   # machine-readable
$SCOPE --check "nmap -sV 10.20.0.14"   # test one command
```

## Resolution order

1. `<workspace>/scope.yml` or `<workspace>/scope.json`
2. `~/.config/sec-engagement/scopes/<repo-or-dirname>.yml`
3. `~/.config/sec-engagement/scopes/default.yml`

Report which file won. A scope from `default.yml` is a fallback and does not by
itself authorize a named client engagement.

## Check exit codes

| code | meaning |
| :-- | :-- |
| 0 | in scope |
| 2 | usage error, or manifest incomplete |
| 3 | out of scope, or action escalated for manual approval |
| 4 | forbidden technique |
| 5 | no scope resolved |

## Changing scope

Never edit scope so that a blocked action starts passing. Two legitimate paths:

- **The client extended the authorization.** Update `scope.yml`, add an
  `amendments:` entry naming who authorized it and when.
- **The action was misclassified.** Fix the matching rule, and say so in the
  report so the client can audit the decision.

Record every change in `scope-changes.md` with a timestamp. An engagement that
ends with zero amendments is a normal outcome, not a sign you under-tested.

## Minimum valid manifest

```yaml
engagement: ACME-Q4-2026
authorization_ref: SOW-2026-114
window: { start: 2026-11-20, end: 2026-12-05 }
in_scope:
  - asset: 10.20.0.0/24
    kind: cidr
    techniques: [recon, web, ad]
out_of_scope:
  - 10.20.0.250
forbidden_techniques: [dos, physical, data_exfiltration]
rate_limits: { default_rps: 5, max_concurrency: 8 }
```

## Known matching limits

Say these out loud rather than assuming coverage:

- IPv4 CIDR, IPv4 literals, hostnames, and `*.domain` globs are matched.
- IPv6: bracketed (`[2001:db8::1]`) and fully expanded literals are detected
  and escalated if in_scope names no IPv6. Compressed forms are not parsed.
- Paths, ports, and URL schemes are not part of the match — only the host.
- A target reached indirectly (pivot, reverse shell callback, SSRF through an
  in-scope web app) is your responsibility to keep inside the boundary.
