---
name: binary-triage
description: >-
  Fast first pass on an unknown binary sample: identify it, map its structure,
  and decide whether deeper reverse engineering is worth the time. Use when a
  sample lands with no context, or before committing to a full analysis.
---

# Binary triage

Target: 15 minutes to a defensible answer about what this is and where to look.

## Step 1 — identity

```bash
shasum -a 256 sample.bin
file -k sample.bin
ls -l sample.bin
```

Record all three in `analysis/<sha12>/MANIFEST.md` before anything else. A
sample with no hash is an anecdote.

## Step 2 — structure

```bash
# macOS Mach-O
otool -hv sample.bin        # header, PIE, arch
otool -l  sample.bin | grep -A4 LC_SEGMENT
otool -L  sample.bin        # linked libraries

# ELF
readelf -h sample.bin
readelf -lW sample.bin
readelf -dW sample.bin

# any
nm -m sample.bin 2>/dev/null || nm -D sample.bin
strings -a -n 6 sample.bin | head -200
```

## Step 3 — what kind of program is this

| Observation | Read |
| :-- | :-- |
| imports `socket`, `connect`, `inet_*` | network client/server |
| imports `dlopen`, `dlsym` | plugin host or obfuscated loader |
| high entropy + no imports | packed or encrypted — unpack first |
| `ptrace`, `sysctl`, `sysctlbypid` | anti-debug present |
| `mach_vm_protect` / `mprotect` on RWX pages | runtime code generation |
| symbol table stripped but rich string table | needs dynamic analysis |

## Step 4 — decide

Write one of:

- **Stop.** It is a known good binary (hash matches a vendor package).
- **Shallow.** Read strings, imports, and the entry point; report structure only.
- **Deep.** Name the specific function or behaviour to recover, and switch to a
  full analysis plan with a time box.

## Rules

- Never modify `samples/`. Work in `analysis/<sha12>/`.
- Do not run an unknown sample outside a VM or a dedicated analysis host, and
  record which one.
- "It looks like a dropper" is not a triage result. "Imports `dlopen` and
  `socket`, contains a 4 KB high-entropy blob at 0x2a10, no symbol table" is.
