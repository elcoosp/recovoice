# Recovoice

**Produce narrated, captioned, cinematically polished demo videos from a single declarative Markdown file — driven programmatically through `tauri-playwright`.**

Recovoice collapses your entire demo pipeline into one `.demo.md` file. Edit the script, run one command, and get back a professional video: automation runs against your real Tauri app, native recording captures every frame, voiceover is synthesized from your prose, captions are aligned to word-level timings, and Recordly-inspired polish (auto-zoom, smoothed cursor, motion blur, connected transitions) is applied deterministically — no manual editing, no re-recordings, no drift.

```bash
pnpm exec recovoice examples/quickstart.demo.md
# → output/final.mp4 (narrated, captioned, polished)
```

---

## Table of Contents

- [Why Recovoice](#why-recovoice)
- [Features](#features)
- [Requirements](#requirements)
- [Install](#install)
- [Quick Start](#quick-start)
- [Script Format](#script-format)
- [Configuration](#configuration)
- [CLI Reference](#cli-reference)
- [Node API](#node-api)
- [Polish Engine](#polish-engine)
- [TTS Providers](#tts-providers)
- [Output Structure](#output-structure)
- [Caching & Reproducibility](#caching--reproducibility)
- [CI Integration](#ci-integration)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why Recovoice

Traditional demo production is fragmented across four disconnected workflows:

| Step | Tool | Problem |
|---|---|---|
| Automation | Playwright / Cypress | Produces no video |
| Recording | Loom, Camtasia | Requires manual interaction, non-reproducible |
| Voiceover | Manual or standalone TTS | Synced by hand to the video |
| Captions | Hand-authored SRT | Drifts out of sync immediately |
| Polish | Premiere, Final Cut | Hours of manual zoom/cursor work |

The moment your product changes, the demo is stale, and someone has to redo it by hand. Recovoice fixes this by making the script the single source of truth. Change the product, edit the script, re-run — the video, voiceover, captions, and polish all regenerate.

**Built on `tauri-playwright`'s native recording API** (OS-level capture → ffmpeg → MP4), so the raw footage is real video at full frame rate — not a screenshot hack.

**Inspired by [Recordly](https://github.com/webadderallorg/Recordly)'s polish engine** — auto-zoom analysis, spring-physics cursor smoothing, cursor sway, motion blur, and connected zoom transitions — all ported to pure TypeScript and driven by cursor telemetry captured during the recording.

**Inspired by [recordable](https://github.com/paragramagency/recordable)'s declarative format** — prose narration and inline actions interleaved in one file, with actions timed to their position in the spoken line.

---

---

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

## Features

- **Single-file scripts** — YAML frontmatter + prose + backtick actions in one `.demo.md`
- **Native video recording** — `tauri-playwright`'s `startRecording`/`stopRecording` → real MP4
- **Synthesized voiceover** — prose is spoken; actions fire at their position in the narration
- **Auto-generated captions** — SRT and VTT derived from word-level TTS timings
- **Cinematic polish** — auto-zoom, cursor smoothing, cursor sway, motion blur, connected transitions
- **Deterministic output** — same script, same video, every run (audio cached by content hash)
- **Cross-platform** — macOS, Windows, Linux (recording quality may vary by platform)
- **CI-friendly** — `--check` mode validates scripts without launching a browser or calling TTS
- **Pluggable TTS** — Kokoro (default), edge-tts, or mock; bring your own provider
- **Interactive `doctor`** — verifies required external tools are installed
- **Node API and CLI** — use it as a library or a command-line tool

---

## Requirements

| Requirement | Notes |
|---|---|
| **Node.js ≥ 20** | LTS |
| **pnpm ≥ 9** | Or npm/yarn |
| **ffmpeg** | Must be on `PATH` (`brew install ffmpeg` / `apt install ffmpeg`) |
| **`tauri-playwright`** | Peer dependency, installed alongside Recovoice |
| **`@napi-rs/canvas`** | Optional dependency for polish; auto-installed |
| **A TTS provider** | See [TTS Providers](#tts-providers) |
| **Screen-recording permission** | macOS only — granted on first run |

Run the built-in checker to confirm everything is ready:

```bash
pnpm exec recovoice doctor
```

---

## Install

```bash
pnpm add recovoice @srsholmes/tauri-playwright
```

Optional TTS providers — install at least one:

```bash
# Kokoro (recommended: Apache 2.0, MOS 4.2, runs locally)
pip install kokoro fastapi uvicorn

# OR edge-tts (free, no API key, works on CPU)
pip install edge-tts
```

Then verify your environment:

```bash
pnpm exec recovoice doctor
```

---

## Quick Start

### 1. Create `hello.demo.md`

```markdown
---
viewport: { width: 1280, height: 800 }
fps: 30
voiceover:
  provider: kokoro
  voiceId: af_bella
captions:
  format: both
variables:
  appName: "Acme"
---

`visit("https://app.example.com")`
Welcome to {{appName}} — the workspace where your team's analytics come alive.

`type("#email", "maya@example.com")`
`click("#signIn")`
Sign in with your work account and you're straight into the dashboard.

`click("#chart")`
Here's the live chart. Every metric updates the moment your data changes.

`click("#export")`
Export your data as CSV or PDF. {{caption: Choose a format to export.}}
```

### 2. Run it

```bash
pnpm exec recovoice hello.demo.md
```

### 3. Get your video

```
Final video: /path/to/output/final.mp4
Captions (SRT): /path/to/output/captions.srt
Captions (VTT): /path/to/output/captions.vtt
```

---

## Script Format

A `.demo.md` file has three parts:

### 1. YAML frontmatter

Optional configuration between `---` delimiters:

```yaml
---
viewport: { width: 1280, height: 800 }
fps: 60
typingSpeed: 16
voiceover:
  provider: kokoro
  voiceId: af_bella
captions:
  format: both
variables:
  appName: Acme
  userEmail: maya@example.com
---
```

### 2. Prose

Natural-language narration between actions. Recovoice synthesizes this into voiceover and generates captions from the same text:

```markdown
Welcome to Acme — your workspace for real-time analytics.
```

### 3. Backtick actions

Playwright / `tauri-playwright` API calls in backticks. Actions fire at their position in the surrounding prose, so timing stays in sync without manual `wait()` calls:

```markdown
`visit("https://app.example.com")`
`click("#dashboard")`
This is your live dashboard.

`type("#search", "revenue")`
Search across all your metrics in one place.
```

Supported actions map 1:1 to the `tauri-playwright` page object: `visit`, `click`, `type`, `fill`, `waitFor`, `press`, `hover`, `select`, `screenshot`, `zoom`, `resetZoom`, and any custom method you add.

### Variables

Use `{{variableName}}` in prose, action arguments, and captions:

```yaml
variables:
  appName: "Acme"
  userName: "Maya"
```

```markdown
`type("#email", "{{userName}}@example.com")`
Welcome to {{appName}}, {{userName}}.
```

### Caption overrides

Decouple the spoken text from the on-screen text.

**Inline** — replaces the caption for the surrounding segment:

```markdown
`click("#export")`
Export your data as CSV or PDF. {{caption: Choose a format.}}
```

**Block** — attaches to the preceding segment:

```markdown
`click("#export")`
Export your data as CSV or PDF.

::: caption
Choose a format to export.
:::
```

### Silent segments

A trailing action with no prose produces no voiceover and no caption:

```markdown
`visit("https://example.com")`
Welcome.

`click("#close")`
```

---

## Configuration

Recovoice merges configuration from three sources, with the following precedence (highest first):

1. **CLI flags** — `--fps 30`
2. **Config file** — `recovoice.config.js` (or `.ts`, `.mjs`) in the project root
3. **Frontmatter** — YAML in the `.demo.md`
4. **Defaults** — built-in values

### Full frontmatter reference

```yaml
viewport:
  width: 1920
  height: 1080

fps: 60
typingSpeed: 16

voiceover:
  provider: kokoro          # mock | kokoro | edge
  voiceId: af_bella
  modelId: kokoro
  language: en-US           # optional

captions:
  format: both              # srt | vtt | both
  burn: true                # burn into the final video
  source: spoken            # spoken | explicit | both
  style:
    font: Inter
    size: 22
    color: "#ffffff"
    background: "rgba(0,0,0,0.75)"
    position: bottom        # top | center | bottom

polish:
  autoZoom: true
  cursorSmoothing: 0.3      # 0.0 (off) to 1.0 (max)
  cursorSway: true
  cursorMotionBlur: true
  zoomMotionBlur: true
  connectedTransitions: true
  background:
    type: gradient          # gradient | solid | wallpaper | blur
    value: "#1e293b"
  frame:
    padding: 60
    borderRadius: 16
    shadow: true

variables:
  appName: "Acme"
  userEmail: "maya@example.com"
```

### Config file

`recovoice.config.js`:

```javascript
export default {
  fps: 60,
  voiceover: { provider: 'kokoro', voiceId: 'af_bella' },
  captions: { format: 'both', burn: false },
  polish: { cursorSmoothing: 0.5 },
};
```

---

## CLI Reference

```
recovoice <script.md> [options]

Options:
  -o, --output <dir>          Output directory (default: ./output)
  --fps <number>              Recording frame rate (default: 60)
  --check                     Validate the script only; no execution
  --dry-run                   Show planned actions without executing
  --voiceover-only            Only regenerate voiceover and captions
  --tts <provider>            TTS provider: mock | kokoro | edge (default: kokoro)
  --kokoro-url <url>          Kokoro server URL (default: http://localhost:8880)
  --no-polish                 Disable all polish effects
  --verbose                   Verbose logging
  --version                   Print version
  --help                      Print help

Commands:
  doctor                      Check that required external tools are installed
```

### Examples

```bash
# Standard run
recovoice demo.demo.md

# Validate for CI without side effects
recovoice --check demo.demo.md

# Show what would happen without incurring cost or launching a browser
recovoice --dry-run demo.demo.md

# Just regenerate narration after editing prose
recovoice --voiceover-only demo.demo.md

# Raw recording for post-processing elsewhere
recovoice --no-polish demo.demo.md

# Custom output and frame rate
recovoice -o ./dist/demos --fps 30 demo.demo.md

# Check the environment
recovoice doctor
```

---

## Node API

```typescript
import {
  Recovoice,
  createTTSProvider,
  createTauriPlaywrightAdapter,
  createPolishCompositor,
} from 'recovoice';

const recovoice = new Recovoice({
  script: './demo.demo.md',
  output: './output',
  recordingAdapter: createTauriPlaywrightAdapter(),
  ttsProvider: createTTSProvider({ provider: 'kokoro' }),
  compositorFactory: (result) =>
    createPolishCompositor({
      durationMs: 30_000,
      fps: 30,
      telemetry: result.telemetry,
      viewport: result.telemetry.viewport,
      smoothingFactor: 0.3,
    }),
});

const result = await recovoice.run();
console.log('Final video:', result.finalVideo);
console.log('Captions:', result.captions.srt, result.captions.vtt);
console.log('Voiceovers:', result.voiceovers);
console.log('Cursor events:', result.telemetry.events.length);
```

### Custom TTS provider

Implement the `TTSProvider` interface:

```typescript
import type {
  TTSProvider,
  TTSResult,
  VoiceConfig,
} from 'recovoice';

class MyProvider implements TTSProvider {
  async synthesize(text: string, config: VoiceConfig): Promise<TTSResult> {
    return {
      audio: Buffer.from(/* ... */),
      format: 'mp3',
      timings: [
        { word: 'Hello', startMs: 0, endMs: 400 },
        // ...
      ],
    };
  }
}
```

### Custom compositor

Implement the `Compositor` interface:

```typescript
import type { Compositor, CompositorOptions } from 'recovoice';

class MyCompositor implements Compositor {
  async compose(options: CompositorOptions): Promise<void> {
    // Do whatever with rawVideo, voiceovers, captionsPath, output
  }
}
```

---

## Polish Engine

Recovoice applies four Recordly-inspired cinematic effects, all derived deterministically from cursor telemetry captured during recording. No manual editing required.

### Auto-Zoom

Analyzes cursor dwell and click clusters to detect moments worth zooming on.

| Parameter | Default | Effect |
|---|---|---|
| `minDwellMs` | 800 | Minimum dwell duration before a zoom triggers |
| `dwellRadiusPx` | 100 | Radius within which motion counts as dwell |
| `minClickCluster` | 2 | Minimum clicks in a burst to trigger zoom |
| `clickClusterTimeMs` | 3000 | Time window for click clustering |
| `defaultDepth` | 1.5 | Zoom scale factor |

### Cursor Smoothing

Damped spring physics give the cursor an organic, filmic quality at any playback speed. The `smoothingFactor` (0.0–1.0) controls stiffness and damping.

### Cursor Sway

Subtle rotational wobble proportional to cursor velocity. Vertical movement produces less sway than horizontal, matching natural hand motion.

### Motion Blur

- **Cursor**: up to 5 ghost frames drawn behind fast-moving cursor with decreasing alpha
- **Camera**: blur applied during rapid zoom/pan, capped at 8px

### Connected Transitions

When two zoom regions are separated by less than 1500 ms, Recovoice inserts a 1000 ms smooth pan instead of a hard cut. Zoom-in transitions take 600 ms; zoom-out take 400 ms — asymmetric for a more cinematic feel.

### Disabling polish

```bash
# All off
recovoice --no-polish demo.demo.md
```

Or per-effect in frontmatter:

```yaml
polish:
  autoZoom: false
  cursorSmoothing: false
  connectedTransitions: false
```

---

## TTS Providers

| Provider | License | Cost | Quality (MOS) | Word timings | Setup |
|---|---|---|---|---|---|
| **kokoro** *(default)* | Apache 2.0 | Free | 4.2 | Yes | `pip install kokoro fastapi uvicorn` |
| **edge** | Free (Microsoft) | Free | High | Yes | `pip install edge-tts` |
| **mock** | MIT | Free | Silent | Synthesized | Built-in |

### Setting up Kokoro

Kokoro is the recommended provider — it's Apache 2.0, produces near-human quality (MOS 4.2) despite being only 82M parameters, runs in under 1 GB of VRAM, and supports word-level timestamps.

```bash
pip install kokoro fastapi uvicorn
# Start the local server (default port 8880)
python -m kokoro.server
```

Then set in frontmatter:

```yaml
voiceover:
  provider: kokoro
  voiceId: af_bella
```

Popular Kokoro voices: `af_bella`, `af_sarah`, `am_adam`, `am_michael`, `bf_emma`, `bm_george`.

### Setting up edge-tts

Zero API key, runs on CPU, provides native word-boundary events.

```bash
pip install edge-tts
```

```yaml
voiceover:
  provider: edge
  voiceId: en-US-JennyNeural
```

### Custom providers

See [Custom TTS provider](#custom-tts-provider) in the Node API section.

---

## Output Structure

Every successful run produces a predictable directory layout:

```
output/
├── raw/
│   └── video.mp4                # native tauri-playwright recording
├── assets/
│   ├── voiceover-001.mp3        # one file per non-silent segment
│   ├── voiceover-002.mp3
│   └── ...
├── telemetry/
│   └── cursor.json              # timestamped cursor events
├── captions.srt                 # SubRip subtitles
├── captions.vtt                 # WebVTT subtitles
└── final.mp4                    # narrated + captioned + polished
```

Additional hidden directories:

- `output/.cache/audio/` — cached TTS synthesis (audio + timings), keyed by content hash
- `output/.tmp/` — staging area during a run, removed on success or failure

---

## Caching & Reproducibility

Recovoice is deterministic where it matters and cached where it counts.

- **Audio cache**: The full TTS result (audio buffer + word timings + format) is cached by SHA-256 of `(text, voice config)`. Subsequent runs with unchanged prose make zero TTS API calls — critical for CI cost control.
- **Telemetry-driven polish**: The polish engine is a pure function of cursor telemetry. Given the same telemetry, the same frames are produced.
- **Frame-rate independence**: The frame scheduler uses integer frame counts (`round(durationMs * fps / 1000)`) to avoid floating-point drift.
- **Atomic output**: Partial runs write to `output/.tmp/` and are only published on success. A failed run leaves the output directory without a `final.mp4`.

---

## CI Integration

Recovoice is designed to run in CI without incurring TTS costs or launching browsers unnecessarily.

### GitHub Actions example

```yaml
name: Regenerate demo videos

on:
  push:
    branches: [main]
    paths:
      - 'demos/**.demo.md'
      - 'src/**'

jobs:
  demos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec recovoice doctor

      - name: Validate scripts
        run: pnpm exec recovoice --check demos/quickstart.demo.md

      - name: Generate video
        env:
          KOKORO_URL: http://localhost:8880
        run: |
          python -m kokoro.server &
          sleep 5
          pnpm exec recovoice demos/quickstart.demo.md

      - uses: actions/upload-artifact@v4
        with:
          name: demo-video
          path: output/final.mp4
```

Tips:

- **Cache `output/.cache/audio/`** between CI runs to avoid re-synthesizing unchanged narration.
- **Use `--check` in the pull-request workflow** to validate scripts without side effects.
- **Use `--no-polish`** if you only need a quick smoke-test recording.

---

## Architecture

Recovoice is built as a layered pipeline:

```
Script (.demo.md)
   │
   ▼
Parser ──▶ AST ──▶ Orchestrator ──▶ tauri-playwright ──▶ Raw MP4
                       │                                    │
                       ├──▶ TTS providers ──▶ Voiceover ────┤
                       │                        │           │
                       │                        ▼           │
                       │                  Caption gen       │
                       │                                    │
                       └──▶ Telemetry ──▶ Polish engine ────┤
                                              │             │
                                              ▼             ▼
                                          Frame renderer ──▶ Compositor ──▶ Final MP4
```

Key architectural decisions are recorded as Architecture Decision Records in `docs/adr/`. Highlights:

- **Post-processing, not real-time polish** — decouples capture from rendering, enables higher-quality effects, allows iterating on polish without re-recording.
- **Pluggable TTS provider interface** — `synthesize(text, config) → { audio, timings, format }`.
- **Recordly algorithms ported to pure TypeScript** — testable in isolation, no Electron dependency.
- **Cursor telemetry via `addInitScript`** — cross-platform, works in all `tauri-playwright` modes.
- **Canvas2D via `@napi-rs/canvas`** — direct port of Recordly's rendering primitives.
- **ffmpeg subprocess for encode/decode** — mature, fast, full codec support.

The full specification (Vision, BRS, SRS, Architecture, Verification) lives in the project docs.

---

## Roadmap

### v0.2

- Multi-language captions (translate + re-synthesize)
- Music bed with ducking
- More polish presets ("screen studio", "linear", "minimal")
- WebM output in addition to MP4

### v0.3

- Interactive preview server (`recovoice preview`)
- Storyboard mode (sections with chapter markers)
- Custom cursor packs
- Zoom easing presets

### v1.0

- Stable API
- Plugin ecosystem for TTS and polish
- Cloud-rendering service (optional)

---

## Contributing

Contributions are welcome. Please:

1. **Open an issue first** for substantial changes so we can align on the approach.
2. **Follow the testing discipline** — Recovoice is built TDD. Every feature or fix lands with tests.
3. **Match the script format conventions** — new parser features must be documented in this README.
4. **Record an ADR** for architectural changes.

### Development

```bash
pnpm install
pnpm test              # run the full suite
pnpm test:watch        # watch mode
pnpm typecheck         # TypeScript strict check
pnpm build             # produce dist/
```

### Test discipline

Tests live under `test/` and mirror the source layout:

| Directory | Coverage |
|---|---|
| `test/parser.test.ts` | Script parsing, variables, captions, actions |
| `test/polish/` | Auto-zoom, easing, spring, sway, motion blur, camera/cursor state |
| `test/tts/` | Mock + Kokoro/Edge providers, retry policy, provider factory |
| `test/caption/` | Cue generation, SRT/VTT serialization |
| `test/cache/` | Content-hash synthesis cache |
| `test/compositor/` | Frame renderer, polish compositor, real ffmpeg e2e |
| `test/recording/` | Adapter, stub session, orchestrator |
| `test/integration/` | Full end-to-end script → captions → compositor |

Current suite: **176+ tests** across unit, integration, and end-to-end layers.

---

## License

MIT — see [LICENSE](./LICENSE).

The polish algorithms are inspired by [Recordly](https://github.com/webadderallorg/Recordly) (see its own license for attribution). The declarative format is inspired by [recordable](https://github.com/paragramagency/recordable). Recovoice is an independent implementation.
