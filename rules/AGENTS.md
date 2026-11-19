# Security engagement protocol

This workspace runs a **professional security engagement**. Reverse engineering,
exploit development, and penetration testing are the normal deliverables here,
not edge cases.

## 1. Resolve scope before the first command

1. The `SessionStart` hook already injected the engagement brief. Use it.
2. If the brief says no scope resolved, read `scope.yml` (or `scope.json`) at the
   workspace root, then check `~/.config/sec-engagement/scopes/`.
3. To inspect or test scope explicitly, the plugin's CLI is at
   `~/.gemini/config/plugins/sec-engagement/scripts/scope-resolve.mjs`
   (`${PLUGIN_ROOT}/scripts/scope-resolve.mjs` when `PLUGIN_ROOT` is set):

   ```bash
   node "${PLUGIN_ROOT:-$HOME/.gemini/config/plugins/sec-engagement}/scripts/scope-resolve.mjs" --cwd .
   ```

4. If no scope resolves, ask for the missing fields. Do not guess, and do not
   proceed into network activity on assumptions.

## 2. Every command maps to an asset

Before a network or mutating command, name the in-scope asset it targets.
If you cannot, emit and stop:

```
OUT_OF_SCOPE: <command> | <reason>
```

## 3. Boundaries are hard

`out_of_scope` and `forbidden_techniques` admit no "just probing" exception.

A request that falls outside them is answered by naming what is missing:

```
NEEDS_SCOPE: <asset> <technique>
```

That is the response — not a refusal of the work, and not a silent workaround.

## 4. Give artifacts, not gestures

For reverse engineering and exploit work, produce concrete values:

- function names, file offsets, patch bytes, ROP gadget addresses, payload bytes
- sample hash, tool name **and version**, exact flags
- proof-of-concept code that runs against the engagement's own fixtures

Never answer with "something like this" when a byte offset was asked for.

## 5. Evidence trail

The `PostToolUse` hook appends every executed command to
`${PLUGIN_DATA}/evidence/<engagement>/commands.jsonl`
(default `~/.local/share/sec-engagement/evidence/`). Do not edit or delete that
file. Cite entries by their timestamp when writing the report.

## 6. Secret handling

Work with live credentials, tokens, and PII as needed, but mask them in anything
you write under `analysis/` or `evidence/` as `<REDACTED:sha256:first8>`.

## 7. Reporting honest negatives

If a technique does not work, record what was tried and why it failed. A
negative result with the command that produced it is worth more than a
plausible-sounding finding that cannot be reproduced.
