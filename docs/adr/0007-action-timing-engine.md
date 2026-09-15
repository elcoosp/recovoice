# ADR-0007: Actions Fire at Word Anchors in the Narration

- **Status:** Accepted
- **Date:** 2026-09-15

## Context and Problem Statement

For a narrated demo to feel natural, actions must fire at the moment the
narration references them. If a script says "click the export button" and
the click happens three seconds later, the demo feels disconnected.

## Decision Drivers

- REQ-FUNC-012: Actions shall fire at their position in the spoken line
- UR-2: Preview narration without re-recording
- BG-1: Deterministic output

## Considered Options

- A) Actions fire immediately in order, with manual `wait()` calls between
- B) Actions are annotated with explicit millisecond delays
- C) Actions record their word anchor in the prose; the executor computes
     fire times from the TTS word timings

## Decision Outcome

Chosen **C**. The parser assigns each action an `anchor` — the number of
words of prose that precede it in the segment. The timed executor looks up
the end time of word `anchor - 1` in the TTS timings and schedules the
action at that offset.

Consequences for the format:

- The parser maintains a running word count as it walks the segment
- Silent segments (no prose) have actions firing at t=0
- Anchors beyond the last word clamp to the segment's end time

## Consequences

**Positive**

- Actions stay in sync with narration without manual delays
- Same script → same timing, deterministically
- Prose edits automatically adjust action timing
- Users can preview narration via `--voiceover-only` and check action times

**Negative**

- Requires word-level TTS timings (Kokoro and edge-tts provide them; the
  mock provider synthesizes them)
- Providers without timings fall back to WPM estimation with a warning
- Complex segments with many actions require careful prose authoring

## Links

- ADR-0003 (post-processing polish)
- README § Script Format
