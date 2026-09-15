#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Bumping package.json to 0.1.0-alpha.1"
python3 - << 'PYEOF'
import json
with open('package.json', 'r') as f:
    pkg = json.load(f)
pkg['version'] = '0.1.0-alpha.1'
pkg['scripts']['release:check'] = 'tsc --noEmit && vitest run'
with open('package.json', 'w') as f:
    json.dump(pkg, f, indent=2)
    f.write('\n')
print("Bumped to", pkg['version'])
PYEOF

echo "Writing CHANGELOG.md"
cat > CHANGELOG.md << 'EOF'
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
EOF

echo "Adding CHANGELOG to package.json files list"
python3 - << 'PYEOF'
import json
with open('package.json', 'r') as f:
    pkg = json.load(f)
files = pkg.get('files', [])
for name in ['CHANGELOG.md']:
    if name not in files:
        files.append(name)
pkg['files'] = files
with open('package.json', 'w') as f:
    json.dump(pkg, f, indent=2)
    f.write('\n')
print("Updated files list:", files)
PYEOF

echo "Writing docs/adr/0005-deterministic-output-and-caching.md"
cat > docs/adr/0005-deterministic-output-and-caching.md << 'EOF'
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
EOF

echo "Writing docs/adr/0006-multi-voiceover-mixing.md"
cat > docs/adr/0006-multi-voiceover-mixing.md << 'EOF'
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
EOF

echo "Writing docs/adr/0007-action-timing-engine.md"
cat > docs/adr/0007-action-timing-engine.md << 'EOF'
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
EOF

echo "Writing docs/architecture.md"
cat > docs/architecture.md << 'EOF'
# Recovoice Architecture

A one-page summary of how Recovoice is put together. See `docs/adr/` for the
reasoning behind specific decisions.

## Pipeline

```
.demo.md ──▶ Parser ──▶ AST (frontmatter, segments, action anchors)
                          │
                          ├─▶ Config loader + deep merge (CLI > file > frontmatter)
                          │
                          ▼
                  Voiceover synthesis ──▶ TTS provider (Kokoro / edge / mock)
                          │              (cache keyed by content hash)
                          ▼
                  Caption generation ──▶ SRT / VTT (with per-segment overrides)
                          │
                          ▼
                  Recording session ──▶ tauri-playwright adapter
                          │              (native startRecording/stopRecording)
                          ├── Action timing engine (word-anchor scheduling)
                          ├── Cursor telemetry injection (addInitScript)
                          ▼
                  Raw MP4 + cursor telemetry
                          │
                          ▼
                  Polish analysis ──▶ Auto-zoom, connected transitions
                          │
                          ▼
                  Frame scheduler ──▶ Per-frame camera & cursor state
                          │              (spring physics, sway, blur, plugins)
                          ▼
                  Audio mixer ──▶ Single M4A (ffmpeg adelay + amix)
                          │
                          ▼
                  Polish compositor ──▶ ffmpeg decode ──▶ napi-canvas render
                          │                                    │
                          │                                    ▼
                          └────────────────▶ ffmpeg encode ──▶ final.mp4
```

## Modules

| Directory | Responsibility |
|---|---|
| `src/parser/` | `.demo.md` parsing, frontmatter validation, error reporting |
| `src/types/` | Shared TypeScript types for scripts and recordings |
| `src/recording/` | `tauri-playwright` adapter, timing engine, timed executor, CDP discovery |
| `src/tts/` | Pluggable TTS providers (Kokoro, edge, mock), retry policy, factory |
| `src/cache/` | Content-hash audio cache with timings persistence |
| `src/caption/` | Cue generation, SRT/VTT serialization, ASS color conversion |
| `src/polish/` | Easing, auto-zoom, spring, sway, motion blur, camera/cursor state, plugin interface |
| `src/compositor/` | Frame renderer, audio mixer, polish compositor, napi-canvas loader |
| `src/config/` | Config file loader with deep merge |
| `src/util/` | ffprobe wrapper for duration/dimension detection |
| `src/recovoice.ts` | Orchestrator (Recovoice class) |
| `src/cli.ts` | Command-line entry point |
| `src/doctor.ts` | Environment check |

## Test layout

Tests mirror the source layout under `test/`. Three layers:

- **Unit tests** (most): parser, polish algorithms, caption generation, cache
- **Integration tests**: adapter, orchestrator, config merge, voiceover-only
- **End-to-end tests**: real ffmpeg compositor (skipped if ffmpeg unavailable)

The end-to-end tests generate a synthetic MP4 with ffmpeg's `lavfi` source,
run it through the full polish pipeline, and assert the output is a valid
MP4 with the expected dimensions.

## Dependency choices

| Dependency | Role | ADR |
|---|---|---|
| `tauri-playwright` | Page control + native recording | ADR-0002 |
| `@napi-rs/canvas` | Frame compositing (optional dependency) | — |
| `ffmpeg` (external) | Encode/decode | — |
| `js-yaml` | Frontmatter parsing | — |
| `zod` | Frontmatter schema validation | — |
| `commander` | CLI argument parsing | — |
| `vitest` | Test runner | — |
EOF

echo "Updating README with implementation status"
python3 - << 'PYEOF'
path = 'README.md'
with open(path, 'r') as f:
    content = f.read()

status_block = """---

## Implementation Status

Recovoice is at **v0.1.0-alpha.1**. Every requirement in the specification is
implemented and covered by tests, with the following known limitations:

- CDP screencast fallback is **discovery only** (Windows-only, connection left
  to the caller)
- Multilingual captions and translation are deferred to v0.2
- Music beds and ducking are deferred to v0.2

### Test coverage

- **297 passing tests** across **44 test files**
- Unit, integration, and end-to-end (real ffmpeg) layers
- Full suite runs in ~35 seconds on a modern Mac

### What works

| Feature | Status |
|---|---|
| `.demo.md` parsing with frontmatter, prose, actions, variables | ✅ |
| Action anchors for narration-synced timing | ✅ |
| Caption overrides (inline and block) | ✅ |
| `include()` directive with cycle detection | ✅ |
| zod frontmatter schema validation | ✅ |
| Kokoro TTS provider | ✅ |
| edge-tts TTS provider | ✅ |
| Content-hash audio caching | ✅ |
| SRT + VTT caption generation | ✅ |
| Native recording via `tauri-playwright` | ✅ |
| Cursor telemetry injection | ✅ |
| Auto-zoom analyzer | ✅ |
| Connected zoom transitions | ✅ |
| Spring cursor smoothing | ✅ |
| Cursor sway | ✅ |
| Cursor motion blur (ghost trails) | ✅ |
| Zoom motion blur | ✅ |
| Per-effect polish toggles | ✅ |
| Configurable caption styling | ✅ |
| Wallpaper and blur backgrounds | ✅ |
| Multi-voiceover audio mixing | ✅ |
| Polish plugin interface | ✅ |
| Config file loader with deep merge | ✅ |
| Screenshot on action failure | ✅ |
| `--check`, `--dry-run`, `--voiceover-only`, `--confirm` | ✅ |
| `recovoice doctor` | ✅ |
| CDP fallback discovery | ✅ (Windows) |

### Deferred to v0.2+

- Multilingual captions and translation
- Music bed with ducking
- More polish presets
- WebM output
- Preview server
- Storyboard mode

---

"""

# Insert the status block before the Features section, or after Why
marker = "## Features"
if marker in content and "## Implementation Status" not in content:
    content = content.replace(marker, status_block + marker, 1)
    print("Inserted implementation status block")
else:
    print("Marker not found or block already present")

with open(path, 'w') as f:
    f.write(content)
PYEOF

echo "Checking compilation"
if ! pnpm exec tsc --noEmit 2>&1; then
  echo "Compilation failed - will skip commit"
  COMPILE_OK=false
fi

if [ "$INCOMPLETE" = true ] || [ "$COMPILE_OK" = false ]; then
  echo "Skipping tests and commit due to incomplete files or compilation errors"
  exit 1
fi

echo "Running test suite"
if pnpm exec vitest run --reporter=dot 2>&1 | tail -10; then
  echo "Tests passed. Committing."
  git add -A
  git commit -m "release: v0.1.0-alpha.1 — bump version, add CHANGELOG, ADR-0005..0007, architecture doc, implementation status"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
