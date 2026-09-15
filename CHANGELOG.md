# Changelog

All notable changes to Recovoice are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.1] — 2026-09-15

### Added

**Script format**
- `.demo.md` parser with YAML frontmatter, prose narration, and backtick-delimited actions
- Variable substitution (`{{name}}`) in prose, action arguments, and captions
- Inline caption overrides (`{{caption: ...}}`)
- Caption block overrides (`::: caption ... :::`)
- `include("./path.md")` directive with cycle detection
- Silent segments (trailing actions with no prose)
- Action anchors: each action records its word position in the narration
- Parse errors include line and column
- zod-based frontmatter schema validation

**Recording**
- `tauri-playwright` adapter for real Tauri app control
- Native recording via `startRecording` / `stopRecording`
- Injected cursor telemetry via `addInitScript`
- Screenshot-on-action-failure
- CDP fallback discovery (Windows-only)

**Timing**
- Action-to-narration timing engine: actions fire at their word anchor position
- Configurable inter-segment gap

**Voiceover**
- Pluggable `TTSProvider` interface
- Kokoro provider (Apache 2.0, local, near-human quality)
- edge-tts provider (free, native word boundaries)
- Mock provider for testing (produces valid silent WAV)
- Content-hash audio cache with timings persisted
- Retry policy with exponential backoff

**Captions**
- SRT and WebVTT output
- Sentence-bounded cue generation with max duration and max chars per cue
- Per-segment caption override support
- Configurable styling (font, size, color, background, position)
- ffmpeg `force_style` integration with proper ASS alpha inversion

**Polish engine**
- Easing library (cubic bezier solver, named curves)
- Auto-zoom analyzer (dwell + click cluster detection)
- Connected zoom transitions with asymmetric in/out timing
- Spring physics cursor smoothing
- Cursor sway (velocity-based rotational wobble)
- Cursor motion blur (ghost trails)
- Zoom motion blur (camera velocity driven)
- Per-frame camera and cursor state computation
- Frame scheduler with camera velocity tracking
- Plugin interface for custom polish effects

**Compositing**
- Frame renderer with camera transform, cursor overlay, backgrounds
- Wallpaper and blur background modes
- Configurable frame padding, radius, and shadow
- ffmpeg-based polish compositor (decode → render → encode)
- Multi-voiceover audio mixer with per-segment offsets (ffmpeg `adelay` + `amix`)
- Single audio track pipeline for N voiceovers

**Orchestration**
- `Recovoice` class with dependency-injected adapter, TTS, compositor
- Config file loader (`recovoice.config.{js,mjs,cjs,ts}`) with deep merge
- Precedence: CLI > config file > frontmatter > defaults
- `voiceoverOnly` mode (regenerate narration without re-recording)
- Atomic publish: staging directory → final on success only
- ffprobe-based duration detection with telemetry fallback

**CLI**
- `recovoice <script>` — run a demo
- `--check` — validate without side effects
- `--dry-run` — show what would happen
- `--voiceover-only` — regenerate narration
- `--confirm` — prompt before incurring costs
- `--config <path>` — explicit config file
- `--tts <provider>` — mock | kokoro | edge
- `--kokoro-url <url>` — Kokoro server URL
- `--no-polish` — disable all polish effects
- `recovoice doctor` — environment check

**Documentation**
- Complete README with quickstart, format reference, and CI guide
- Architecture Decision Records (ADR-0001 through ADR-0004)
- `examples/quickstart.demo.md`

### Known Limitations

- CDP screencast fallback is discovery-only (connection is left to the caller)
- Windows-only CDP mode requires WebView2
- Recording quality varies by platform (macOS, Windows, Linux)
- Multilingual captions and translation are deferred to v0.2
- Music beds and ducking are deferred to v0.2

### Test coverage

- 297 passing tests across 44 test files
- Unit, integration, and end-to-end (real ffmpeg) test layers
- Coverage targets: 80% statements, 75% branches on core modules

[0.1.0-alpha.1]: https://github.com/recovoice/recovoice/releases/tag/v0.1.0-alpha.1
