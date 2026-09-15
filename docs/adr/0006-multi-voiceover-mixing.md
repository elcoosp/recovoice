# ADR-0006: Pre-Mix Voiceovers into a Single Audio Track

- **Status:** Accepted
- **Date:** 2026-09-15

## Context and Problem Statement

A demo may have N voiceover segments, each starting at a different time.
The compositor must produce a single audio track that plays all segments
at their correct offsets. There are two ways to do this: mix them together
in a dedicated pass, or overlay them directly in the final composition.

## Decision Drivers

- REQ-FUNC-061: Mix voiceovers onto the final video
- NFR-MAINT-003: Keep the compositor simple
- Reproducibility: same audio output regardless of compositor

## Considered Options

- A) Pre-mix voiceovers into a single M4A, then hand the M4A to the compositor
- B) Overlay N audio inputs directly in the compositor's ffmpeg invocation
- C) Concatenate voiceovers with silence padding between them

## Decision Outcome

Chosen **A**. A dedicated `mixVoiceovers` function builds a single audio
track using ffmpeg's `adelay` + `amix` filter graph. The compositor then
receives one audio input via `audioTrackPath`.

This keeps the compositor's audio handling trivial (`-map 0:v -map 1:a`)
and makes the audio pipeline independently testable.

## Consequences

**Positive**

- Compositor stays simple
- Audio mixing is independently testable
- Single-pass encoding (one audio input)
- Reuses the same encoder settings regardless of N

**Negative**

- One extra ffmpeg invocation per run
- Intermediate M4A file lives in the staging directory

## Links

- ADR-0003 (post-processing polish)
