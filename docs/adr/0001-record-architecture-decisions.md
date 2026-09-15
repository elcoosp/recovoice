# ADR-0001: Record Architecture Decisions

- **Status:** Accepted
- **Date:** 2026-09-15

## Context and Problem Statement

We need a durable, low-overhead way to capture architectural decisions and their
rationale so future contributors can understand why Recovoice is built the way
it is.

## Decision Drivers

- Architecture must be traceable to the ASRs (Architecturally Significant Requirements)
- Decisions must live close to the code
- Process overhead must be minimal

## Considered Options

- A) Markdown ADRs in `docs/adr/`, version-controlled
- B) Wiki pages maintained separately
- C) Inline comments in source files

## Decision Outcome

Chosen option **A** — Markdown ADRs in `docs/adr/`, following the MADR template.
Each ADR is short (< 1 page), numbered sequentially, and referenced from the
design docs. Superseding an ADR creates a new one that links back to the old.

## Consequences

**Positive**

- Decisions are diffable, reviewable via PR, and versioned with the code
- Rationale survives team turnover
- Traceable from ASR → decision → implementation

**Negative**

- Minor overhead to author and maintain
- Requires team discipline to keep them current

## Links

- Architecture spec: `docs/architecture.md`
- MADR: https://adr.github.io/madr/
