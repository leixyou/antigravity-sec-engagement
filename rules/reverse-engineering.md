---
trigger: glob
globs: "**/*.bin, **/*.elf, **/*.so, **/*.dylib, **/*.exe, **/*.dll, samples/**, firmware/**"
description: Reverse engineering conventions for binary samples in this workspace
---

## Placement

- Raw samples: `samples/` — never modified in place, never committed.
- Working copies: `analysis/<sample-sha256-first12>/`.
- Extracted artifacts, decompiler projects, and notes stay in that same directory.

## Always record

For every sample, before analysis:

```
sha256, file size, `file` output, architecture, endianness, and tool versions
```

Record them once in `analysis/<sample>/MANIFEST.md` and reference it afterwards.

## Locating a check

When asked to find a guard, license check, or validation routine, report the
full chain rather than a single address:

| Field | Example |
| :-- | :-- |
| function | `-[LicenseManager validateToken:]` |
| address | `0x100004a20` (__TEXT,__text) |
| call site | `0x100003f18` in `-[AppDelegate applicationDidFinishLaunching:]` |
| comparison | `strcmp(input, expected)` at `0x100004a88` |
| patch point | file offset `0x4a88`, original `0f 84 8f 00 00 00` → `90 90 90 90 90 90` |

Byte-level claims need a byte-level citation. "The function returns false" is
not a finding; `test al, al / jz` at a named offset is.

## Dynamic analysis

- Run under `lldb`/`gdb`/`frida` with a script that is committed next to the
  sample, not typed ad hoc into a shell.
- Capture the hook script, the trace, and the exact launch command.
- Note whether the environment is virtualized; some binaries behave differently.

## Code signing (macOS)

Patching a signed binary requires re-signing or the loader will refuse it:

```bash
cp -R Sample.app analysis/$SAMPLE/
codesign --force --deep --sign - analysis/$SAMPLE/Sample.app
codesign -dv --verbose=4 analysis/$SAMPLE/Sample.app
```

Keep the untouched original for diffing the patched result.
