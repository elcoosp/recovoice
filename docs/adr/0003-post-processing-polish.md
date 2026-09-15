# ADR-0003: Post-Processing Polish (Not Real-Time)

- **Status:** Accepted
- **Date:** 2026-09-15

## Context and Problem Statement

Polish (auto-zoom, cursor smoothing, motion blur) can be applied during
recording (real-time) or after (post-processing). The choice affects quality,
iteration speed, and reproducibility.

## Decision Drivers

- ASR-1: Compositing in ≤ 2× duration
- ASR-3: Polish algorithms must be testable without a browser
- ASR-6: Deterministic output for unchanged scripts

## Considered Options

- **A) Post-processing**: record raw, apply polish offline
- B) Real-time: apply polish during recording

## Decision Outcome

Chosen **A**. Post-processing decouples capture from rendering, allows iterating
on polish without re-recording, and produces higher-quality results without
frame-rate constraints.

## Consequences

**Positive**

- Higher quality polish
- Iterate on polish without re-recording
- Deterministic output
- Testable in isolation

**Negative**

- Slower total pipeline (decode + render + encode round-trip)
- Requires `@napi-rs/canvas` and `ffmpeg` at compose time

## Links

- ADR-0004 (polish algorithms as pure TypeScript)
- ADR-0006 (Canvas2D for compositing)
