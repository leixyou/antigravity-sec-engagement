---
name: recon-plan
description: >-
  Build a sequenced, quiet-first reconnaissance plan for the in-scope assets,
  with per-step command lines, expected signal, and a noise budget. Use at the
  start of an engagement or when adding a newly discovered asset.
---

# Recon plan

Produce a plan, not a scan. The output is a table the client could have
approved before you run anything.

## Sequence

1. **Passive.** DNS enumeration from public sources, certificate transparency,
   ASN and netblock lookup, published job posts and docs, archived endpoints.
   Zero packets to the client's infrastructure.
2. **Light active.** TCP connect sweep of the negotiated port set against the
   named assets, at or under `rate_limits.default_rps`.
3. **Service identification.** Version probes only on ports that answered, one
   host at a time, stopping at the first sign of a fragile service.
4. **Content discovery.** Only if the contract permits web testing on that
   asset's `techniques` list.

## Plan table

| # | Step | Command | Assets | Est. packets | Signal if positive |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | CT lookup | `curl -s "https://crt.sh/?q=%25.example.internal&output=json"` | none | 0 | additional hostnames |
| 2 | TCP sweep | `nmap -Pn -sT -p 22,80,443,445,3389 --max-rate 5 <asset>` | 10.20.0.0/24 | ~120 | open ports |
| 3 | Version probe | `nmap -sV -p <open> <host>` | host | ~40/host | product+version |

## Rules

- State the noise budget per step and stop when it is exhausted.
- One asset at a time until you know how it reacts.
- Never run discovery against an asset whose `techniques` do not include the
  matching category.
- Record the exact command, timestamp, and result — the audit hook captures
  commands, you capture the interpretation.
- If a scan gets slower or a service drops, stop. That is a finding about
  fragility, and continuing is how engagements get terminated early.
