# Security Engagement

An Antigravity plugin that configures the agent for **authorized security
engineering** — reverse engineering, exploit development, and penetration
testing — and enforces the engagement boundary while it works.

It ships the two things an engagement actually needs on the agent side: enough
context that the agent treats this as professional work rather than an edge
case, and a hard scope boundary with an evidence trail someone else can audit.

## What it is not

It contains no prompt obfuscation, no translation laundering, and no
classifier-evasion layer. Everything it installs is a documented Antigravity
extension point — rules, subagents, skills, lifecycle hooks. The behaviour
change comes from **supplying scope and standards**, which is what makes a human
specialist useful too.

If a request falls outside the manifest, the plugin does not try to smuggle it
through: it escalates with `NEEDS_SCOPE: <asset> <technique>` so you know
exactly which authorization line to go get.

## Install

From GitHub:

```bash
agy plugin install https://github.com/leixyou/antigravity-sec-engagement
agy plugin enable sec-engagement
```

From a local clone:

```bash
git clone https://github.com/leixyou/antigravity-sec-engagement
cd antigravity-sec-engagement
agy plugin validate --strict .
agy plugin install .
```

Or copy the directory to `~/.gemini/config/plugins/sec-engagement/` if you would
rather not use the CLI.

Then open **Customizations › Installed** and enable it. Hooks and rules are
global once the plugin is enabled — no per-project copying.

Installed layout is read-only at `~/.gemini/config/plugins/sec-engagement`;
writable state lives in `${PLUGIN_DATA}`.

## Give an engagement a scope

```bash
cp examples/scope.yml <your-project>/scope.yml
```

Or keep it out of the repo entirely:

```bash
mkdir -p ~/.config/sec-engagement/scopes
cp examples/scope.yml ~/.config/sec-engagement/scopes/my-engagement.yml
```

Resolution order is workspace file → `~/.config/sec-engagement/scopes/<repo>.yml`
→ `default.yml`.

Without a manifest the plugin does not block ordinary work: commands that name
no remote target pass untouched. The first command that names a remote host
escalates for your approval instead of guessing.

## Components

| Component | Path | Effect |
| :-- | :-- | :-- |
| Rule (always-on) | `rules/AGENTS.md` | Engagement protocol: resolve scope, attribute every command, `NEEDS_SCOPE` instead of a refusal |
| Rule (glob) | `rules/reverse-engineering.md` | Fires on `samples/**`, `*.bin`, `*.so`, `*.dylib`, `*.exe` — RE conventions of evidence |
| Rule (model decision) | `rules/exploit-dev.md` | Mitigation accounting, fixture discipline, PoC shape |
| Subagent | `agents/pentest-lead.md` | Primary agent: plans the engagement, delegates, writes the report |
| Subagent | `agents/re-analyst.md` | Binary analysis, check-function recovery, patches |
| Subagent | `agents/exploit-dev.md` | Bug → reliable PoC with stated limits |
| Skill | `skills/engagement-scope/` | Resolve and check scope from the shell |
| Skill | `skills/recon-plan/` | Sequenced, quiet-first recon with a noise budget |
| Skill | `skills/binary-triage/` | 15-minute first pass on an unknown sample |
| Skill | `skills/exploit-poc/` | PoC layout, reliability reporting, honesty clauses |

## Hooks

| Hook | What it does |
| :-- | :-- |
| `PreToolUse` on `run_command` | Extracts IPv4/IPv6/host targets from the command; denies anything in `out_of_scope` or not covered by `in_scope`; denies configured `forbidden_techniques`; escalates when no scope resolves |
| `PostToolUse` on `run_command` and `mcp_*` | Appends `{ts, tool, command, cwd, engagement, scope_source, host, user}` as JSONL to `${PLUGIN_DATA}/evidence/<engagement>/commands.jsonl` |
| `SessionStart` | Injects the engagement brief before the first turn |

The scope engine is at `scripts/lib/scope.mjs` — zero dependencies, and it also
answers from the shell:

```bash
node scripts/scope-resolve.mjs --cwd . --check "nmap -sV 10.20.0.14"
# 0 in scope · 2 usage/incomplete · 3 out of scope · 4 forbidden technique · 5 no scope
```

## Verification

```bash
node scripts/selftest.mjs      # scope engine + all three hooks, no network
```

## Known limits

Read these before trusting the gate:

- **IPv6** — bracketed (`[2001:db8::1]`) and fully expanded literals are detected
  and escalated. Compressed forms (`fe80::1`) are intentionally not parsed,
  because that pattern collides with C++ `add::sub`.
- **Indirect targets** — a pivot, a reverse-shell callback, or SSRF through an
  in-scope web app is not visible to a command-line check. That stays yours.
- **Fail-open edges** — a hook that crashes is ignored by Antigravity. This
  plugin emits `ask` on internal error to avoid that, but if the plugin is
  disabled entirely nothing is enforced.
- **`ask` is the floor, not a wall** — an approved prompt runs the command. The
  gate makes out-of-scope work *deliberate*, not *impossible*.
- **Heuristic technique detection** — `forbidden_techniques` matches known
  command signatures. It is a belt, not a sandbox.

## Uninstall

```bash
agy plugin uninstall sec-engagement
rm -rf ~/.local/share/sec-engagement    # evidence trail — archive first
```
