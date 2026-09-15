# ADR-0002: Use `tauri-playwright` Native Recording

- **Status:** Accepted
- **Date:** 2026-09-15

## Context and Problem Statement

Recovoice must capture video of a real Tauri application. The capture mechanism
determines recording quality, cross-platform support, and the composability of
the rest of the pipeline.

## Decision Drivers

- ASR-1: Post-processing must handle a 2-minute 1080p video in ≤ 2× its duration
- CON-1: Must use `tauri-playwright`
- REQ-FUNC-020/021: Native recording start/stop

## Considered Options

- **A) `tauri-playwright` native recording** (`startRecording`/`stopRecording`)
- B) Playwright's built-in video (browser mode only)
- C) Screenshot loop
- D) CDP screencast via `context.newCDPSession`

## Decision Outcome

Chosen **A**. `tauri-playwright` provides native capture → ffmpeg → MP4, works
against real Tauri apps (not just browser contexts), and is the peer dependency
Recovoice already requires for automation.

## Consequences

**Positive**

- Real video at full frame rate
- Works against real Tauri apps
- Single dependency provides both automation and capture

**Negative**

- Recording quality varies across macOS/Windows/Linux
- macOS requires screen-recording permission on first run
- Fallback to CDP screencast (Windows only) is needed when native capture is unavailable

## Links

- https://github.com/srsholmes/tauri-playwright
