# ADR-0005: Deterministic Output via Content-Hash Caching

- **Status:** Accepted
- **Date:** 2026-09-15

## Context and Problem Statement

Demo videos must be reproducible: the same script should produce the same
output, and re-running a script after a minor prose edit should not re-incur
TTS costs or re-record the video.

## Decision Drivers

- BG-1: Same script → byte-identical video (modulo TTS variation)
- NFR-PERF-002: Bounded TTS synthesis time
- NFR-REL-001: Cached voiceovers reused across runs

## Considered Options

- A) Content-hash caching with SHA-256 keys
- B) Timestamp-based caching
- C) No caching

## Decision Outcome

Chosen **A**. TTS synthesis results (audio buffer + word timings + format)
are persisted under `output/.cache/audio/`, keyed by `SHA-256(prose + voice
config)`. Subsequent runs with unchanged prose skip synthesis entirely.

Polish is deterministic by construction: the frame scheduler is a pure
function of telemetry, zoom regions, and configuration.

Recording duration is measured with `ffprobe` rather than estimated from
telemetry, ensuring the compositor uses the actual video length.

## Consequences

**Positive**

- Zero TTS API calls for unchanged segments
- Deterministic polish and caption output
- Fast iteration on prose edits
- CI cost control

**Negative**

- Cache invalidation must be carefully designed (only text and voice config
  affect the hash)
- TTS providers may not produce byte-identical audio across API calls, so
  "determinism" applies to the cache layer, not raw provider output

## Links

- ADR-0003 (post-processing polish)
- ADR-0004 (port Recordly algorithms)
