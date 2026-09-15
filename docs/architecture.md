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
