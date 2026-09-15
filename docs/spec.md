# Recovoice — Complete Specification Suite

**A programmatic, narrated, captioned, and polished demo recording tool built on `tauri-playwright`.**

| Field | Value |
|-------|-------|
| Project | Recovoice |
| Document | Combined Specification Suite (Vision + BRS + SRS + Architecture + Verification) |
| Version | 0.1 (Draft) |
| Date | 2026-09-15 |
| Author | User, assisted by AI |
| Status | Draft — Pending Review |
| Document Scope | Single-file consolidated specification |

---

## Table of Contents

- [Part I — Vision & Strategic Alignment](#part-i--vision--strategic-alignment)
- [Part II — Business & Stakeholder Requirements Specification](#part-ii--business--stakeholder-requirements-specification)
- [Part III — Software Requirements Specification](#part-iii--software-requirements-specification)
- [Part IV — Architecture & Design Specification](#part-iv--architecture--design-specification)
- [Part V — Behavioral Specification & Test Verification](#part-v--behavioral-specification--test-verification)
- [Appendix A — Master Glossary](#appendix-a--master-glossary)
- [Appendix B — Master Traceability Matrix](#appendix-b--master-traceability-matrix)
- [Appendix C — Open Questions and TBD Register](#appendix-c--open-questions-and-tbd-register)

---

# Part I — Vision & Strategic Alignment

**Level 0 — "Why are we building Recovoice?"**

---

## I.1 Vision Statement

**Recovoice makes software demo videos reproducible, narrated, captioned, and cinematic — from a single declarative file, run as an automated test.**

## I.2 Elevator Pitch

For **developer-tools teams, DevRel engineers, product marketers, and QA engineers** who are dissatisfied with **fragmented demo pipelines** — manual screen capture, hand-tuned zooms, separately authored voiceovers, and mismatched subtitle files — **Recovoice is a programmatic demo recording library** that drives a real Tauri application through `tauri-playwright`, records native video, synthesizes voiceover, generates captions, and applies cinematic polish (auto-zoom, smoothed cursor, motion blur, connected transitions) **in a single pipeline**. Unlike **manual screen recorders (Loom, ScreenFlow) or standalone video editors (Camtasia, Premiere)**, Recovoice uses **the same declarative script to drive the automation, the narration, the captions, and the polish**, producing a deterministic, reproducible demo video every time the script changes.

## I.3 Problem Statement & Business Context

### The problem

Teams that ship software demos face four disconnected workflows:

1. **Automation** — Playwright/Cypress scripts drive the app, but produce no video.
2. **Recording** — Loom/Camtasia capture video, but require manual interaction and produce non-reproducible output.
3. **Voiceover** — Narration is recorded manually or synthesized separately, then synced by hand.
4. **Captions** — Subtitles are authored in a separate SRT file and re-synced to the video.

The result: demos drift out of date the moment the product changes, require hours of manual rework, and lose the polish that makes them feel professional (auto-zoom on interaction, smooth cursor motion, motion blur during transitions).

### Why now

- **`tauri-playwright` already provides native video recording** via `startRecording()`/`stopRecording()` — the hardest infrastructure problem is solved. It records via OS-native capture → ffmpeg → MP4.
- **Recordly's polish algorithms are pure TypeScript** — auto-zoom analysis, spring-physics cursor smoothing, connected zoom transitions, and motion blur are decoupled from any specific recording stack and can be ported.
- **`recordable` demonstrated the value of prose-narrated Markdown** — actions and narration interleaved in one file, with actions timed to the spoken line.
- **TTS providers now return word-level timing metadata** — enabling frame-accurate captions derived from the same narration that drives the voiceover.

### Drivers

| Driver | Description |
|---|---|
| Reproducibility | Same script must produce the same demo |
| Single source of truth | One file drives automation, voice, captions, and polish |
| Native quality | Real video capture, full frame rate, no screenshot hacks |
| Cinematic polish | Auto-zoom, cursor smoothing, motion blur — the Recordly standard |
| Cross-platform | Work with real Tauri apps on macOS, Windows, Linux |

## I.4 Target Users

### Primary user classes

| User class | Description | Primary need |
|---|---|---|
| **DevRel Engineer** | Publishes product demos, tutorials, changelogs | Produce polished, narrated, captioned demos from code |
| **QA / Test Engineer** | Runs automated tests against Tauri apps | Attach a video recording to every test run, with narration for review |
| **Product Marketer** | Creates launch videos and feature walkthroughs | Non-engineer-editable demo scripts that produce professional output |
| **Developer-Tools Maintainer** | Documents OSS tools and libraries | CI-integrated demo regeneration on every release |

### Secondary user classes

| User class | Description |
|---|---|
| **Technical Writer** | Authors documentation with embedded demo videos |
| **Designer** | Reviews and refines auto-generated demos before publishing |
| **Engineering Manager** | Reviews PRs that change demo scripts and their outputs |

### Explicit non-targets

- **General consumers** — Recovoice is not a consumer screen recorder. It assumes familiarity with Markdown and a code editor.
- **Non-Tauri apps** — Recovoice targets Tauri applications via `tauri-playwright`. Browser-only Playwright is supported as a secondary mode; Electron and native desktop are out of scope for v1.
- **Real-time streaming** — Recovoice produces files, not live streams.

## I.5 User Needs & Value Proposition

### Top user needs

| Need ID | Need | Users |
|---|---|---|
| N-1 | Produce a demo video from a script without manual recording | DevRel, QA |
| N-2 | Keep demo video in sync with product changes | DevRel, OSS |
| N-3 | Produce narrated demos without recording voiceover | DevRel, Marketing |
| N-4 | Produce captioned videos without separate subtitle authoring | Marketing, Writers |
| N-5 | Apply cinematic polish (zoom, cursor, blur) automatically | DevRel, Marketing |
| N-6 | Run demo generation inside CI | QA, OSS |

### Value proposition

Recovoice delivers a **single-file, declarative demo pipeline** where:

- **The automation is the script** — Playwright actions in backticks.
- **The narration is the prose** — synthesized to voiceover, with actions timed to it.
- **The captions are the narration** — automatically generated from the TTS timings.
- **The polish is deterministic** — auto-zoom, cursor smoothing, and motion blur applied from telemetry.
- **The output is reproducible** — same script, same video, every run.

Unlike **Loom**, Recovoice produces deterministic, version-controllable demos. Unlike **Camtasia**, it produces them programmatically. Unlike **Playwright's built-in video**, it produces narrated, captioned, cinematically polished output.

## I.6 Desired Outcomes & Success Metrics

### Business outcomes

| ID | Objective | Key Results |
|---|---|---|
| BO-1 | Establish Recovoice as the standard for Tauri demo recording | KR1: ≥ 100 GitHub stars within 6 months of v1.0<br>KR2: ≥ 10 external projects using Recovoice in production<br>KR3: ≥ 3 conference talks or blog posts referencing Recovoice |
| BO-2 | Enable fully automated CI demo generation | KR1: End-to-end demo generation in < 5 minutes for a 2-minute video<br>KR2: ≥ 80% of CI runs produce byte-identical video for unchanged scripts<br>KR3: ≥ 5 reference CI integrations documented |
| BO-3 | Deliver cinematic polish indistinguishable from manual editors | KR1: ≥ 90% of surveyed users rate output "as good as" or "better than" hand-edited demos<br>KR2: Zero visible cursor jitter in benchmark recordings<br>KR3: Smooth zoom transitions on all auto-zoom events |

### Product outcomes

| ID | Product Metric | Target |
|---|---|---|
| PO-1 | Time from script to first successful recording | < 30 minutes for a new user |
| PO-2 | Fraction of scripts that require manual polish touch-up | < 10% |
| PO-3 | Caption accuracy vs. spoken narration (WER) | < 2% |
| PO-4 | Voiceover-audio-to-video-sync drift | < 50 ms over 5 minutes |

## I.7 Strategic Constraints

| ID | Constraint | Source |
|---|---|---|
| C-1 | Must use `tauri-playwright` native recording as the video capture foundation | Technical decision |
| C-2 | Must support macOS, Windows, and Linux for script execution (recording may vary by platform) | Cross-platform requirement |
| C-3 | Must not require a running GUI to parse scripts or generate captions | CI-friendliness |
| C-4 | TTS provider must be pluggable (ElevenLabs first, OpenAI/mock subsequent) | Vendor-neutrality |
| C-5 | Must produce standard MP4 (H.264/AAC) and SRT/VTT outputs | Interoperability |
| C-6 | Must be usable as a Node.js library and as a CLI | Two primary consumption modes |

## I.8 Goals and Non-Goals

### Goals (v1.0)

| ID | Goal |
|---|---|
| G-1 | Parse a single `.demo.md` file containing frontmatter, prose, and inline Playwright actions |
| G-2 | Execute actions against a `tauri-playwright`-controlled Tauri webview |
| G-3 | Synthesize voiceover from prose segments via a pluggable TTS provider |
| G-4 | Generate SRT and VTT captions from TTS timing metadata |
| G-5 | Record native video via `tauriPage.startRecording()` / `stopRecording()` |
| G-6 | Apply Recordly-inspired polish: auto-zoom, cursor smoothing, cursor sway, connected transitions, cursor motion blur, zoom motion blur |
| G-7 | Assemble final MP4 with mixed voiceover, burned-in (optional) captions, and polish applied |
| G-8 | Provide a `--check` mode for CI that validates scripts without launching a browser or TTS API |

### Non-Goals (v1.0)

Non-goals are *plausible goals intentionally excluded* — not trivial negations.

| ID | Non-goal | Rationale |
|---|---|---|
| NG-1 | Real-time recording (no post-processing) | Post-processing enables higher quality and reproducibility; real-time constrains polish quality |
| NG-2 | Live streaming output | Out of scope; this is a file-producing tool |
| NG-3 | Electron or non-Tauri native desktop support | Focus on `tauri-playwright` integration; other stacks would fragment the polish engine |
| NG-4 | Multi-track audio editing / music beds | Voiceover only in v1; music is a v2 feature |
| NG-5 | Video timeline editor GUI | Recovoice is script-driven; manual editing is delegated to external tools |
| NG-6 | Cloud-hosted rendering service | v1 is local-only; cloud is a potential v2 product |
| NG-7 | Support for languages other than English in v1 | TTS and caption quality depend on provider support; multilingual is v2 |
| NG-8 | Automated visual regression on the recorded video | Video diffing is a separate concern; Recovoice focuses on generation |
| NG-9 | Interactive / branching demos | Linear recordings only |
| NG-10 | Real-time collaboration on scripts | Standard Git workflow suffices |

## I.9 Operational Concept & High-Level Scenarios

### Concept of operations

Recovoice operates as a **build tool** in the developer's or CI's workflow. The user authors a single `.demo.md` file, runs `recovoice demo.md`, and receives a directory of outputs: raw video, voiceover audio segments, caption files, and a final polished MP4. The tool is invoked from the command line or programmatically from Node.js.

### High-level scenarios

| Scenario ID | Scenario | Narrative |
|---|---|---|
| S-1 | Author creates first demo | User copies a template, edits prose and actions, runs `recovoice demo.md`, gets `output/final.mp4` |
| S-2 | Developer updates demo on product change | Developer edits `.demo.md` to reflect new UI, re-runs; TTS and recording are cached for unchanged segments |
| S-3 | CI regenerates demo on release | Release workflow runs `recovoice --check` then `recovoice demo.md`; final MP4 is attached to the release |
| S-4 | Non-engineer edits narration | Marketing edits prose in `.demo.md`, runs `recovoice --voiceover-only`, previews new narration before full re-record |
| S-5 | QA attaches narrated video to test run | Test suite wraps `recovoice` around critical E2E tests; failures produce narrated walkthrough videos for review |
| S-6 | User previews before committing to TTS spend | `recovoice --dry-run` shows what would be synthesized, recorded, and composed without calling TTS or recording |

## I.10 Stakeholders, Sponsorship & Governance

| Role | Responsibility | Named |
|---|---|---|
| Executive Sponsor | Owns business outcomes BO-1..BO-3 | TBD |
| Product Owner | Owns vision, priorities, non-goals | TBD |
| Tech Lead | Owns architecture, ADRs, external contracts | TBD |
| Community Maintainer | Owns external contributions and issue triage | TBD |

### Governance model

- **Vision changes** require Product Owner + Executive Sponsor approval.
- **Scope changes (goals/non-goals)** require a new ADR and Product Owner approval.
- **Architectural changes** require Tech Lead approval via ADR.
- **Routine changes** (bug fixes, minor features) proceed via standard PR review.

## I.11 Risks, Assumptions & Open Questions

### Assumptions

| ID | Assumption | Impact if false |
|---|---|---|
| A-1 | `tauri-playwright` native recording produces clean MP4 at 30–60 fps on all three platforms | Recording quality may be insufficient; fallback to CDP screencast per-platform |
| A-2 | TTS providers return word-level timing | Captions degrade to sentence-level cues |
| A-3 | Recordly's algorithms can be ported to operate on decoded MP4 frames without rewriting them | Polish engine requires redesign |
| A-4 | Users are comfortable with Markdown and backtick action syntax | Adoption friction; may need YAML alternative |

### Risks

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Recording pipeline varies in quality across macOS/Windows/Linux | High | High | Abstract frame capture; document platform-specific quality; support CDP mode on Windows |
| R-2 | TTS API costs make CI usage expensive | Medium | Medium | Aggressive caching keyed on text hash; support OpenAI and local models as alternatives |
| R-3 | Post-processing MP4 decode/encode is slow for large videos | Medium | Medium | Parallelize frame processing; support GPU-accelerated ffmpeg |
| R-4 | Recordly algorithms depend on details not documented in public materials | Medium | High | Where public docs are insufficient, re-derive algorithms from first principles |
| R-5 | Cursor telemetry is not captured by `tauri-playwright` | High | High | Inject `addInitScript` telemetry recorder into the page |

### Open questions

| ID | Question | Owner | Target |
|---|---|---|---|
| OQ-1 | Should polish be applied during recording or as post-processing? | Tech Lead | Before design freeze |
| OQ-2 | How do we handle scroll events in cursor telemetry? | Tech Lead | Before polish engine |
| OQ-3 | Do we ship a default TTS voice or require user configuration? | Product Owner | Before v1.0 |

---

# Part II — Business & Stakeholder Requirements Specification

**Level 1 — "What does the business need?"**

---

## II.1 Business Context

### Purpose

This BRS/StRS defines the business needs, stakeholders, business rules, and stakeholder outcomes that Recovoice must satisfy. It is implementation-free: no technology choices, no UI specifications, no API contracts. Those belong in the SRS (Part III).

### Business scope

**In scope:**
- Software demo generation for Tauri applications
- Narration, captioning, and cinematic polish as first-class outputs
- Reproducible, script-driven demo production
- CI integration

**Out of scope:**
- Consumer-grade screen recording
- Manual video editing
- Non-Tauri applications
- Live streaming

### Business environment

Recovoice targets **developer-focused products** — dev tools, SaaS platforms with Tauri desktop clients, and OSS projects. The primary market is technical teams who ship frequent software changes and need to keep demos in sync. Regulatory environment: standard software licensing (MIT/Apache 2.0 TBD).

## II.2 Business Goals, Objectives & Success Metrics

| ID | Goal | Key Result | Fit Criterion |
|---|---|---|---|
| BG-1 | Make demo video generation reproducible | Same `.demo.md` → byte-identical video (modulo TTS variation) | Two consecutive runs on the same environment produce videos whose frames match within perceptual hash tolerance 99%+ |
| BG-2 | Reduce time to produce a polished demo | Reduce manual demo production time by ≥ 80% | Time from "script ready" to "final MP4" < 10 minutes for a 2-minute demo |
| BG-3 | Keep demos in sync with the product | Enable demo regeneration on every release | `recovoice` runs in CI on every tagged release and produces an updated MP4 |
| BG-4 | Deliver cinematic polish programmatically | User survey: ≥ 90% rate polish "as good as" hand-edited | Survey administered post-v1.0 with 30+ respondents |
| BG-5 | Eliminate manual caption authoring | Captions derived from narration with < 2% WER vs TTS output | Automated comparison of caption text vs TTS timing metadata |
| BG-6 | Enable narration without voice recording | ≥ 95% of demos use synthesized voiceover | Telemetry in opt-in analytics (user-reported in surveys if telemetry declined) |

## II.3 Business Model & Processes

### Value proposition

Recovoice is an **open-source library and CLI**, distributed via npm. No monetization in v1. Potential future revenue streams: hosted rendering service, premium polish presets, enterprise support. Non-goal for v1.

### Core business processes

| Process | Description | Actors |
|---|---|---|
| Script authoring | User writes `.demo.md` | DevRel, Engineer, Marketer |
| Demo generation | User runs `recovoice demo.md` | Engineer, CI |
| Validation | CI runs `recovoice --check` | CI |
| Distribution | User shares `final.mp4` | DevRel, Marketer |
| Feedback | User files issues/PRs on GitHub | All |

## II.4 Business Rules & Policies

| ID | Rule | Source |
|---|---|---|
| BR-001 | Every action in a `.demo.md` script must be attributable to a Playwright or `tauri-playwright` API call | Design decision |
| BR-002 | Every prose segment not marked as silent must produce voiceover | Design decision |
| BR-003 | Every voiceover segment must produce caption cues unless overridden | Design decision |
| BR-004 | TTS synthesis must be cached on text hash to avoid redundant API calls | Cost control policy |
| BR-005 | Recording must use `tauri-playwright` native recording when available; fallback mechanisms must be explicit | Technical policy |
| BR-006 | Polish effects must be deterministically derived from telemetry, not random | Reproducibility policy |
| BR-007 | Users must be able to disable any polish effect | User control policy |
| BR-008 | No PII must be sent to TTS providers beyond the narration text | Privacy policy |
| BR-009 | Scripts must be processable without a browser or TTS API in `--check` mode | CI policy |
| BR-010 | All output artifacts must be written to a user-specified output directory | User control policy |

## II.5 Stakeholders & User Classes

### Stakeholder map

| Stakeholder | Role | Concerns | Influence |
|---|---|---|---|
| DevRel Engineer | Primary user | Reproducibility, quality, speed | High |
| QA Engineer | Primary user | CI integration, review workflows | High |
| Product Marketer | Primary user | Quality, ease of editing | Medium |
| OSS Maintainer | Primary user | CI integration, license | Medium |
| Tech Lead | Decision-maker | Architecture, extensibility | High |
| Executive Sponsor | Sponsor | Business outcomes | High |
| End Viewer | Consumer | Video quality, clarity | Low (indirect) |

### User classes

| User class | Description | Primary tasks | Frequency |
|---|---|---|---|
| Author | Writes `.demo.md` scripts | Author, edit, iterate | Daily during authoring |
| Runner | Executes `recovoice` | Run script, inspect output | Per iteration / per release |
| Reviewer | Reviews generated demos | Watch video, request changes | Per PR |
| Consumer | Watches final video | Watch, share | Passive |

### Jobs to Be Done

| JTBD ID | Job statement |
|---|---|
| JTBD-1 | When I ship a new feature, I want to update the demo video without re-recording manually, so I can keep demos current with minimal effort |
| JTBD-2 | When I create a launch video, I want cinematic polish without learning a video editor, so I can produce professional output quickly |
| JTBD-3 | When I add narration, I want to avoid recording my own voice, so I can produce demos without a microphone |
| JTBD-4 | When I run tests in CI, I want an automatically generated video of the test run, so I can review failures visually |
| JTBD-5 | When I localize a demo, I want captions in multiple languages, so I can reach international audiences (v2) |

## II.6 Glossary / Ubiquitous Language

See [Appendix A](#appendix-a--master-glossary) for the full glossary. Key terms used throughout this specification:

| Term | Definition |
|---|---|
| **Script** | A `.demo.md` file containing frontmatter, prose, and action markers |
| **Action** | A backtick-delimited Playwright/`tauri-playwright` API call |
| **Prose** | Natural-language narration between actions |
| **Segment** | A (prose, actions) pair constituting one narration unit |
| **Voiceover** | Synthesized audio for a prose segment |
| **Caption** | On-screen text derived from a voiceover segment |
| **Polish** | Cinematic post-processing: zoom, cursor smoothing, blur, transitions |
| **Zoom Region** | A time interval with a computed zoom target (focus, scale) |
| **Cursor Telemetry** | Timestamped cursor positions and click events captured during recording |
| **Recording** | The raw MP4 produced by `tauri-playwright` |
| **Compositor** | The component that applies polish and mixes audio/captions |
| **TTS Provider** | A pluggable synthesis backend (ElevenLabs, OpenAI, mock) |

## II.7 Conceptual Domain Model

### Core entities

```
Script
  ├── Frontmatter (viewport, voiceover config, caption config, variables)
  ├── Segment[]  (ordered)
  │     ├── Prose (narration text)
  │     ├── Action[]  (Playwright calls with arguments)
  │     └── CaptionOverride?  (optional explicit caption text)
  └── Include[]  (referenced sub-scripts)

Recording
  ├── RawVideoFile (MP4)
  ├── CursorTelemetry
  │     ├── Event[]  (timestamped move/click/scroll)
  │     └── Timebase alignment metadata
  └── ViewportMetadata (width, height, DPR)

Voiceover
  ├── AudioFile (MP3/WAV per segment)
  ├── TextHash  (for caching)
  └── WordTimings[]  (per-word start/end times)

Caption
  ├── Cues[]  (start, end, text)
  ├── Format (SRT | VTT)
  └── StyleHints (font, size, color)

ZoomRegion
  ├── startMs, endMs
  ├── focus (cx, cy)
  ├── depth (scale factor)
  └── connectedTo? (ZoomRegion ID for pan transitions)

PolishConfiguration
  ├── autoZoom (enabled, params)
  ├── cursorSmoothing (enabled, params)
  ├── cursorSway (enabled, params)
  ├── motionBlur (cursor, zoom)
  └── transitions (connected pan)
```

### Relationships

- A **Script** produces exactly one **Recording** per execution.
- A **Script** contains one or more **Segments**.
- Each **Segment** produces zero or one **Voiceover** and zero or one **Caption**.
- A **Recording** produces one **CursorTelemetry**.
- **CursorTelemetry** drives the generation of zero or more **ZoomRegions**.
- A **PolishConfiguration** and a **Recording** are inputs to a **Compositor**.
- The **Compositor** produces the final MP4.

## II.8 Stakeholder Needs & User Requirements

### Per user class

**Author needs:**
- A syntax that is easy to write and read (Markdown + backticks)
- Immediate feedback on script validity (`--check`)
- Fast iteration on prose without re-recording video (`--voiceover-only`)
- Ability to reuse shared segments across scripts (`include`)

**Runner needs:**
- Single command to produce final output
- Clear error messages when actions fail
- Caching to avoid redundant work
- Deterministic output

**Reviewer needs:**
- Ability to preview individual segments
- Clear diff of what changed between script versions

**Consumer needs:**
- High-quality video
- Clear narration
- Readable captions

### User requirements

| ID | Requirement | User class |
|---|---|---|
| UR-1 | The author shall be able to write a demo script in a single file combining narration and actions | Author |
| UR-2 | The author shall be able to preview voiceover synthesis for a single segment without re-recording video | Author |
| UR-3 | The runner shall be able to execute a script with a single command | Runner |
| UR-4 | The runner shall receive actionable errors when an action fails | Runner |
| UR-5 | The runner shall receive a final MP4 and associated captions in a predictable location | Runner |
| UR-6 | The reviewer shall be able to compare two versions of a demo script | Reviewer |
| UR-7 | The reviewer shall be able to regenerate demos in CI on every release | Reviewer |
| UR-8 | The consumer shall receive captions synchronized to narration within 200 ms | Consumer |

## II.9 System-in-Context & Operational Concept

### Concept of operations

Recovoice is a **build-time tool**. It runs on a developer workstation or CI runner. It launches a Tauri application under test, drives it via `tauri-playwright`, records the video natively, synthesizes voiceover, generates captions, applies polish, and assembles the final MP4.

### System-in-context processes

| Process | Inputs | Outputs |
|---|---|---|
| Script parsing | `.demo.md` file | In-memory AST |
| Action execution | AST + running Tauri app | Screen state changes + telemetry |
| Recording | Running Tauri app | Raw MP4 + metadata |
| Voiceover synthesis | Prose text + TTS config | MP3 segments + word timings |
| Caption generation | Prose + timings + overrides | SRT/VTT files |
| Polish analysis | Cursor telemetry | Zoom regions + motion analysis |
| Compositing | Raw MP4 + voiceovers + captions + polish | Final MP4 |

### Operational scenarios

| Scenario ID | Narrative |
|---|---|
| OS-1 | Author runs `recovoice demo.md`. Recovoice parses the script, prints a summary, asks for confirmation if `--confirm` is set, then executes |
| OS-2 | In CI, `recovoice --check demo.md` validates the script and exits with code 0 or non-zero |
| OS-3 | On macOS, first run prompts for screen recording permission; subsequent runs proceed without prompting |
| OS-4 | If a TTS API is unavailable, Recovoice falls back to cached audio if available, otherwise fails with a clear error |

## II.10 Stakeholder-Level Constraints & Quality Expectations

| ID | Constraint / Quality | Target |
|---|---|---|
| SQ-1 | Script parse time | < 100 ms for a typical script |
| SQ-2 | Voiceover synthesis for a 2-minute demo | < 3 minutes on a typical network |
| SQ-3 | Recording quality | Native resolution, 30–60 fps |
| SQ-4 | Final MP4 size | < 100 MB for a 2-minute 1080p demo |
| SQ-5 | Caption sync accuracy | Cues align within 200 ms of spoken word |
| SQ-6 | Voiceover-to-action sync | Actions fire within 100 ms of their position in the narration |
| SQ-7 | Cross-platform support | macOS, Windows, Linux (recording may degrade on Linux) |
| SQ-8 | Cost per demo | < $0.50 in TTS costs for a 2-minute demo (typical) |

## II.11 Risks, Assumptions & Open Issues

See [Part I § I.11](#i11-risks-assumptions--open-questions). Additional BRS-level risks:

| ID | Risk | Mitigation |
|---|---|---|
| BR-R-1 | Users may resist the Markdown + backtick syntax | Provide clear templates and a 5-minute "hello world" tutorial |
| BR-R-2 | Polish quality may not meet user expectations | Ship polish as opt-in flags; iterate on algorithms based on user feedback |
| BR-R-3 | TTS provider pricing may change | Pluggable provider architecture; support OpenAI and local models |

## II.12 Traceability Mapping to Vision

| Vision Goal | BRS Goal | User Requirements |
|---|---|---|
| G-1 | BG-1 | UR-1, UR-6 |
| G-3 | BG-6 | UR-2 |
| G-5 | BG-3 | UR-3, UR-5, UR-7 |
| G-6 | BG-4 | UR-5 |
| G-7 | BG-1, BG-2 | UR-5, UR-7 |
| G-8 | BG-3 | UR-4 |

---

# Part III — Software Requirements Specification

**Level 2 — "What does the system do?"**

---

## III.1 Introduction & Scope

### Purpose

This SRS specifies the functional and non-functional requirements for Recovoice v1.0, as decomposed from the BRS (Part II). Each requirement is uniquely identified, atomic, verifiable, and traced to its business or stakeholder origin.

### System scope

Recovoice is a Node.js library and CLI that:

1. Parses `.demo.md` scripts
2. Drives Tauri applications through `tauri-playwright`
3. Records native video via `tauri-playwright`
4. Synthesizes voiceover via pluggable TTS providers
5. Generates SRT/VTT captions
6. Applies cinematic polish to the recording
7. Assembles the final MP4

### References

- `tauri-playwright` (https://github.com/srsholmes/tauri-playwright)
- Recordly (https://github.com/webadderallorg/Recordly)
- `recordable` (https://github.com/paragramagency/recordable)
- ISO/IEC/IEEE 29148:2018
- IEEE 830-1998
- W3C WebVTT specification

## III.2 System Context & Overview

### External entities

| Entity | Role |
|---|---|
| Tauri application | Target of automation and recording |
| `tauri-playwright` | Provides page control and native recording API |
| TTS provider (ElevenLabs, OpenAI, etc.) | Provides voiceover audio and word timings |
| `ffmpeg` | Encodes/decodes video for polish and assembly |
| Filesystem | Stores scripts, caches, and outputs |

### Actors

| Actor | Description |
|---|---|
| Author | Writes `.demo.md` scripts |
| Runner | Executes `recovoice` |
| CI system | Runs `recovoice --check` and `recovoice` in pipelines |

### System boundaries

Recovoice does **not**:

- Implement its own video capture (delegated to `tauri-playwright`)
- Implement its own video encoding (delegated to `ffmpeg`)
- Implement its own browser automation (delegated to `tauri-playwright`)
- Implement its own TTS (delegated to pluggable providers)

## III.3 Functional Capabilities & Behavior

### F-1: Script Parsing

**Description:** Recovoice parses a `.demo.md` file into an in-memory AST.

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-001 | When `recovoice` is invoked with a path to a `.demo.md` file, Recovoice shall parse the file's YAML frontmatter into a configuration object. | Must | Unit test |
| REQ-FUNC-002 | When parsing a `.demo.md` file, Recovoice shall extract prose segments and backtick-delimited action markers in order. | Must | Unit test |
| REQ-FUNC-003 | When parsing a `.demo.md` file, Recovoice shall support variable substitution using `{{variableName}}` syntax in prose, actions, and captions. | Must | Unit test |
| REQ-FUNC-004 | If a `.demo.md` file contains a syntax error, then Recovoice shall exit with a non-zero status and print a message indicating the line and column of the error. | Must | Unit test |
| REQ-FUNC-005 | When parsing a `.demo.md` file with `include("./path.md")` directives, Recovoice shall splice the included file's segments at the directive's position. | Should | Integration test |
| REQ-FUNC-006 | When parsing a `.demo.md` file, Recovoice shall support `::: caption ... :::` blocks for explicit caption text that overrides narration-derived captions. | Should | Unit test |
| REQ-FUNC-007 | When parsing a `.demo.md` file, Recovoice shall support `{{caption: ...}}` inline overrides within prose. | Could | Unit test |

### F-2: Action Execution

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-010 | When executing a parsed script, Recovoice shall launch or connect to a Tauri application via `tauri-playwright`. | Must | Integration test |
| REQ-FUNC-011 | When executing an action, Recovoice shall invoke the corresponding `tauri-playwright` API method (e.g., `click`, `type`, `goto`). | Must | Integration test |
| REQ-FUNC-012 | When executing a segment, Recovoice shall time actions to the corresponding position within the segment's voiceover narration. | Must | Integration test with mocked timings |
| REQ-FUNC-013 | If an action fails, then Recovoice shall capture a screenshot, log the failure context, and abort the recording with a non-zero exit status. | Must | Integration test |
| REQ-FUNC-014 | While executing a script, Recovoice shall inject a cursor telemetry recorder into the page via `addInitScript`. | Must | Integration test |
| REQ-FUNC-015 | When execution completes, Recovoice shall extract cursor telemetry from the page and persist it alongside the recording. | Must | Integration test |

### F-3: Native Recording

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-020 | When execution begins, Recovoice shall invoke `tauriPage.startRecording({ path, fps })` to start native video recording. | Must | Integration test |
| REQ-FUNC-021 | When execution completes, Recovoice shall invoke `tauriPage.stopRecording()` and obtain the path to the produced MP4. | Must | Integration test |
| REQ-FUNC-022 | If `tauri-playwright`'s recording API is unavailable (e.g., unsupported platform), then Recovoice shall fall back to CDP screencast if the platform supports it, or fail with a clear error. | Should | Integration test |
| REQ-FUNC-023 | Recovoice shall support a configurable frame rate (default 60, minimum 15, maximum 120). | Must | Unit test |

### F-4: Voiceover Synthesis

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-030 | When a segment contains prose not marked as silent, Recovoice shall synthesize voiceover audio via the configured TTS provider. | Must | Integration test with mock provider |
| REQ-FUNC-031 | When synthesizing voiceover, Recovoice shall obtain per-word or per-character timing metadata from the provider. | Must | Integration test |
| REQ-FUNC-032 | If the TTS provider does not return timing metadata, then Recovoice shall approximate timings using WPM-based estimation and log a warning. | Should | Unit test |
| REQ-FUNC-033 | Recovoice shall cache synthesized audio keyed on the SHA-256 hash of (prose text + voice config). | Must | Unit test |
| REQ-FUNC-034 | When voiceover audio exists in cache and the input hash is unchanged, Recovoice shall skip re-synthesis. | Must | Integration test |
| REQ-FUNC-035 | Recovoice shall support a `--voiceover-only` mode that regenerates voiceover audio and captions without re-recording video. | Should | Integration test |
| REQ-FUNC-036 | Recovoice shall support pluggable TTS providers via a `TTSProvider` interface with `synthesize(text, config): Promise<{audio, timings}>`. | Must | Unit test |

### F-5: Caption Generation

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-040 | When synthesizing voiceover, Recovoice shall generate caption cues aligned to the audio's word timings. | Must | Unit test |
| REQ-FUNC-041 | When generating captions, Recovoice shall split narration into cues at natural sentence boundaries with a default maximum cue duration of 7 seconds. | Must | Unit test |
| REQ-FUNC-042 | Recovoice shall output captions in SRT format. | Must | Unit test |
| REQ-FUNC-043 | Recovoice shall output captions in WebVTT format when configured. | Should | Unit test |
| REQ-FUNC-044 | When a `::: caption ... :::` block or `{{caption: ...}}` override is present, Recovoice shall use the override text for the corresponding cue instead of the narration text. | Should | Unit test |
| REQ-FUNC-045 | Recovoice shall support configurable caption styling (font, size, color, background, position) via frontmatter. | Should | Unit test |
| REQ-FUNC-046 | When `captions.burn` is true, Recovoice shall burn captions into the final video using `ffmpeg`'s `subtitles` filter. | Should | Integration test |

### F-6: Polish Engine

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-050 | When cursor telemetry is available, Recovoice shall compute auto-zoom regions using a dwell-and-click-cluster analyzer with configurable `minDwellMs`, `dwellRadiusPx`, `minClickCluster`, and `defaultDepth`. | Must | Unit test |
| REQ-FUNC-051 | When two zoom regions are separated by less than `CHAINED_ZOOM_PAN_GAP_MS` (default 1500 ms), Recovoice shall produce a connected pan transition between them. | Should | Unit test |
| REQ-FUNC-052 | When applying cursor smoothing, Recovoice shall use a damped spring simulation configured from a user-facing `smoothingFactor`. | Must | Unit test |
| REQ-FUNC-053 | When applying cursor sway, Recovoice shall add a rotational wobble based on cursor velocity, with configurable `MAX_ROTATION`, `SPEED_REFERENCE`, `VERTICAL_WEIGHT`, and `INTENSITY_SCALE`. | Should | Unit test |
| REQ-FUNC-054 | When cursor velocity exceeds a threshold, Recovoice shall draw up to 5 ghost cursor frames with decreasing alpha behind the main cursor. | Should | Visual regression test |
| REQ-FUNC-055 | When camera (zoom/pan) velocity exceeds a threshold, Recovoice shall apply a zoom motion blur capped at 8px. | Should | Visual regression test |
| REQ-FUNC-056 | Recovoice shall apply asymmetric timing for zoom-in (600 ms) and zoom-out (400 ms) transitions. | Should | Unit test |
| REQ-FUNC-057 | Recovoice shall allow disabling any individual polish effect via frontmatter flags. | Must | Unit test |
| REQ-FUNC-058 | When polish is disabled entirely, Recovoice shall emit the raw recording with only voiceover and captions applied. | Must | Integration test |

### F-7: Compositing & Assembly

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-060 | When compositing, Recovoice shall decode the raw MP4 using `ffmpeg`, apply camera transforms and cursor overlay per frame, and re-encode to the final MP4. | Must | Integration test |
| REQ-FUNC-061 | When compositing, Recovoice shall mix the voiceover audio onto the final video's audio track. | Must | Integration test |
| REQ-FUNC-062 | When compositing, Recovoice shall apply the configured background (wallpaper/gradient/solid/blur) around the frame. | Should | Visual regression test |
| REQ-FUNC-063 | When compositing, Recovoice shall draw the frame with configurable padding, rounded corners, and drop shadow. | Should | Visual regression test |
| REQ-FUNC-064 | Recovoice shall output the final MP4 in H.264/AAC format. | Must | Integration test |
| REQ-FUNC-065 | Recovoice shall write all artifacts (raw video, voiceover segments, captions, final MP4) to a predictable directory structure under the configured output path. | Must | Integration test |

### F-8: Validation & CI Mode

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-070 | When invoked with `--check`, Recovoice shall validate the script's frontmatter schema, action argument types, variable references, and caption strategy without launching a browser or calling a TTS API. | Must | Unit test |
| REQ-FUNC-071 | When `--check` succeeds, Recovoice shall exit with status 0. | Must | Unit test |
| REQ-FUNC-072 | When `--check` fails, Recovoice shall print all detected issues and exit with a non-zero status. | Must | Unit test |
| REQ-FUNC-073 | When invoked with `--dry-run`, Recovoice shall print what would be synthesized, recorded, and composed without performing any of those actions. | Should | Unit test |
| REQ-FUNC-074 | When invoked with `--confirm`, Recovoice shall prompt for confirmation before incurring TTS costs. | Could | Integration test |

### F-9: Configuration & Extensibility

| Req ID | Requirement | Priority | Verification |
|---|---|---|---|
| REQ-FUNC-080 | Recovoice shall support configuration via YAML frontmatter, CLI flags, and an optional `recovoice.config.js` file, with precedence CLI > config file > frontmatter > defaults. | Must | Unit test |
| REQ-FUNC-081 | Recovoice shall expose a Node.js API (`Recovoice` class) that mirrors the CLI functionality. | Must | Unit test |
| REQ-FUNC-082 | Recovoice shall expose a plugin interface for TTS providers. | Must | Unit test |
| REQ-FUNC-083 | Recovoice shall expose a plugin interface for custom polish effects. | Could | Unit test |

## III.4 Quality & Non-Functional Requirements

Organized per ISO/IEC 25010:2023.

### Performance Efficiency

| Req ID | Requirement | Fit Criterion |
|---|---|---|
| REQ-NFR-PERF-001 | Script parsing shall complete quickly. | Parse time ≤ 100 ms for scripts up to 500 lines on reference hardware |
| REQ-NFR-PERF-002 | Voiceover synthesis shall complete in bounded time. | ≤ 3 minutes for a 2-minute demo (typical network, ElevenLabs) |
| REQ-NFR-PERF-003 | Compositing shall complete in bounded time. | ≤ 2× the video's duration (e.g., 2-minute video → ≤ 4-minute compositing) |
| REQ-NFR-PERF-004 | Native recording shall sustain target frame rate. | ≥ 30 fps sustained for a 2-minute recording on reference hardware |
| REQ-NFR-PERF-005 | Cursor telemetry extraction shall be fast. | ≤ 500 ms to extract and persist telemetry |

### Reliability

| Req ID | Requirement | Fit Criterion |
|---|---|---|
| REQ-NFR-REL-001 | Cached voiceovers shall be reused across runs. | Zero TTS API calls for unchanged segments |
| REQ-NFR-REL-002 | Recovoice shall handle transient TTS failures gracefully. | 3 automatic retries with exponential backoff; fallback to cache |
| REQ-NFR-REL-003 | Recovoice shall not leave partial artifacts on failure. | Failed runs are written to a `.tmp/` directory; successful runs atomically move to output |

### Compatibility

| Req ID | Requirement | Fit Criterion |
|---|---|---|
| REQ-NFR-COMPAT-001 | Recovoice shall run on Node.js 20 LTS and above. | CI matrix tests on Node.js 20, 22, 24 |
| REQ-NFR-COMPAT-002 | Recovoice shall support macOS 12+, Windows 11, and Ubuntu 22.04+. | CI matrix tests on all three platforms |
| REQ-NFR-COMPAT-003 | Recovoice shall produce MP4s playable in major browsers. | Manual test in Chrome, Firefox, Safari |
| REQ-NFR-COMPAT-004 | Recovoice shall produce SRT files conformant to the SubRip specification. | Automated SRT schema validation |

### Interaction Capability (Usability)

| Req ID | Requirement | Fit Criterion |
|---|---|---|
| REQ-NFR-USE-001 | A new user shall produce their first demo within 30 minutes. | Usability test with 5 target users |
| REQ-NFR-USE-002 | Error messages shall include actionable next steps. | User study: ≥ 90% of errors correctly resolved without documentation lookup |

### Security

| Req ID | Requirement | Fit Criterion |
|---|---|---|
| REQ-NFR-SEC-001 | API keys shall never be logged or written to artifacts. | Static analysis; manual review |
| REQ-NFR-SEC-002 | No narration text beyond the segment's prose shall be sent to TTS providers. | Code review; network capture test |
| REQ-NFR-SEC-003 | Recovoice shall enforce TLS 1.2+ for all external communications. | Config inspection |

### Maintainability

| Req ID | Requirement | Fit Criterion |
|---|---|---|
| REQ-NFR-MAINT-001 | Core modules (parser, polish, caption) shall have ≥ 80% unit-test coverage. | Coverage report |
| REQ-NFR-MAINT-002 | Public APIs shall be documented with TSDoc. | Documentation linting |
| REQ-NFR-MAINT-003 | Polish algorithms shall be isolated in pure functions testable without a browser. | Architecture review |

### Flexibility

| Req ID | Requirement | Fit Criterion |
|---|---|---|
| REQ-NFR-FLEX-001 | TTS providers shall be swappable without code changes to the core. | Plugin interface + ≥ 2 reference implementations |
| REQ-NFR-FLEX-002 | Polish effects shall be individually toggleable. | Frontmatter flags + tests |

## III.5 External Interfaces & Data Contracts

### CLI interface

```
recovoice <script.md> [options]

Options:
  --output <dir>              Output directory (default: ./output)
  --fps <number>              Recording frame rate (default: 60)
  --voiceover-only            Only regenerate voiceover and captions
  --check                     Validate script only; no execution
  --dry-run                   Show planned actions without executing
  --confirm                   Prompt before TTS costs
  --config <path>             Path to config file
  --no-polish                 Disable all polish effects
  --tts <provider>            TTS provider (default: elevenlabs)
  --tts-api-key <key>         API key for TTS provider
  --verbose                   Verbose logging
  --version                   Print version
  --help                      Print help
```

### Node.js API

```typescript
interface RecovoiceOptions {
  script: string;
  output?: string;
  fps?: number;
  voiceoverOnly?: boolean;
  polish?: PolishConfig | false;
  tts?: TTSProvider;
}

class Recovoice {
  constructor(options: RecovoiceOptions);
  run(): Promise<RecovoiceResult>;
  check(): Promise<CheckResult>;
}

interface RecovoiceResult {
  finalVideo: string;
  rawVideo: string;
  captions: { srt?: string; vtt?: string };
  voiceovers: string[];
  telemetry: CursorTelemetry;
}
```

### TTS Provider Interface

```typescript
interface TTSProvider {
  synthesize(text: string, config: VoiceConfig): Promise<TTSResult>;
}

interface VoiceConfig {
  voiceId: string;
  modelId?: string;
  language?: string;
}

interface TTSResult {
  audio: Buffer;         // MP3 or WAV
  format: 'mp3' | 'wav';
  timings: WordTiming[];
}

interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}
```

### Output directory structure

```
output/
├── raw/
│   └── video.mp4
├── assets/
│   ├── voiceover-001.mp3
│   ├── voiceover-002.mp3
│   └── ...
├── telemetry/
│   └── cursor.json
├── captions.srt
├── captions.vtt
└── final.mp4
```

## III.6 Constraints, Assumptions & Dependencies

### Constraints

| ID | Constraint |
|---|---|
| CON-1 | Must use `tauri-playwright` for Tauri app control and recording |
| CON-2 | Must use `ffmpeg` for video encoding/decoding |
| CON-3 | Must use Node.js 20+ |
| CON-4 | Must be distributed via npm |

### Assumptions

See Part I § I.11.

### Dependencies

| Dependency | Purpose |
|---|---|
| `tauri-playwright` | Page control and native recording |
| `ffmpeg` (external binary) | Video encoding/decoding |
| TTS provider SDK | Voiceover synthesis |
| `js-yaml` or similar | Frontmatter parsing |
| `fluent-ffmpeg` or `child_process` | ffmpeg invocation |

## III.7 TBD Log

See [Appendix C](#appendix-c--open-questions-and-tbd-register).

## III.8 Requirements Attributes & Traceability Model

### ID scheme

- `REQ-FUNC-NNN` — functional requirements
- `REQ-NFR-{CATEGORY}-NNN` — non-functional requirements
- `REQ-INT-NNN` — external interface requirements
- `CON-N` — constraints
- `A-N` — assumptions

### Requirement attributes

Each requirement in this SRS carries:

- **ID** — unique stable identifier
- **Statement** — the requirement text
- **Priority** — Must / Should / Could / Won't (MoSCoW)
- **Source** — trace to BRS/StRS items (BG, UR, JTBD)
- **Verification method** — Test / Inspection / Analysis / Demonstration
- **Verification artifact** — specific test ID or inspection reference

### Traceability

See [Appendix B](#appendix-b--master-traceability-matrix).

---

# Part IV — Architecture & Design Specification

**Level 3 — "How will it work?"**

---

## IV.1 Context & Scope

### Objective

Design a Node.js library and CLI that integrates `tauri-playwright` native recording, a pluggable TTS layer, a caption generator, and a Recordly-inspired polish engine into a single deterministic pipeline.

### Key constraints (from SRS)

- CON-1: Must use `tauri-playwright`
- CON-2: Must use `ffmpeg`
- CON-3: Must use Node.js 20+
- CON-4: Must be distributed via npm

## IV.2 Goals & Non-Goals (Design-Level)

### Design goals

| ID | Goal | Related ASR |
|---|---|---|
| DG-1 | Decouple polish algorithms from capture mechanism | ASR-3 |
| DG-2 | Make TTS providers pluggable | ASR-2 |
| DG-3 | Enable post-processing pipeline | ASR-1 |
| DG-4 | Keep parser pure and testable | ASR-4 |
| DG-5 | Support CI validation without side effects | ASR-5 |

### Design non-goals

| ID | Non-goal |
|---|---|
| DNG-1 | Real-time polish during recording |
| DNG-2 | Custom video codec implementation |
| DNG-3 | Browser-based runtime (Recovoice is Node-only) |
| DNG-4 | Native mobile app control |

## IV.3 Architecturally Significant Requirements (ASRs)

| ASR ID | Requirement | Source |
|---|---|---|
| ASR-1 | Post-processing must handle a 2-minute 1080p video in ≤ 2× its duration | REQ-NFR-PERF-003 |
| ASR-2 | TTS providers must be swappable without core changes | REQ-NFR-FLEX-001 |
| ASR-3 | Polish algorithms must be testable without a browser | REQ-NFR-MAINT-003 |
| ASR-4 | Script parsing must complete in ≤ 100 ms | REQ-NFR-PERF-001 |
| ASR-5 | `--check` must not launch browser or call TTS API | REQ-FUNC-070 |
| ASR-6 | Output must be deterministic for unchanged scripts | BG-1 |
| ASR-7 | Cursor telemetry must not require platform-specific capture | REQ-FUNC-014 |

## IV.4 The Design

### IV.4.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Recovoice (Node.js)                        │
│                                                                 │
│  ┌────────────┐    ┌────────────────┐    ┌──────────────────┐   │
│  │  Parser    │───▶│  Orchestrator  │───▶│  TTS Adapter     │   │
│  └────────────┘    └────────┬───────┘    └──────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│                    ┌────────────────┐    ┌──────────────────┐   │
│                    │  Playwright    │───▶│  Telemetry       │   │
│                    │  Driver        │    │  Collector       │   │
│                    └────────┬───────┘    └──────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│                    ┌────────────────┐                           │
│                    │  Recording     │                           │
│                    │  (via tauri-   │                           │
│                    │   playwright)  │                           │
│                    └────────┬───────┘                           │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                Polish Engine                         │       │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐  │       │
│  │  │ Auto-    │ │ Cursor   │ │ Cursor   │ │ Motion  │  │       │
│  │  │ Zoom     │ │ Smooth.  │ │ Sway     │ │ Blur    │  │       │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────┘  │       │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐             │       │
│  │  │ Connected│ │ Easing   │ │ Frame    │             │       │
│  │  │ Pan      │ │ Library  │ │ Styling  │             │       │
│  │  └──────────┘ └──────────┘ └──────────┘             │       │
│  └──────────────────────────────────────────────────────┘       │
│                             │                                   │
│                             ▼                                   │
│                    ┌────────────────┐                           │
│                    │  Compositor    │───▶ ffmpeg ──▶ final.mp4  │
│                    │  (Canvas2D +   │                           │
│                    │   ffmpeg)      │                           │
│                    └────────────────┘                           │
│                                                                 │
│  ┌────────────────┐    ┌────────────────┐                       │
│  │  Caption       │───▶│  SRT/VTT       │                       │
│  │  Generator     │    │  Writer        │                       │
│  └────────────────┘    └────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### IV.4.2 C4 Model — System Context (C1)

**Recovoice System** interacts with:

- **Author** (person) — writes `.demo.md` scripts
- **Runner** (person) — executes `recovoice` CLI
- **CI System** (external system) — runs `recovoice --check`
- **Tauri Application** (external system) — target of automation
- **TTS Provider** (external system) — synthesis backend
- **ffmpeg** (external binary) — video encoding

### IV.4.3 C4 Model — Container (C2)

| Container | Responsibility | Technology |
|---|---|---|
| CLI | Command-line entry point | Node.js, `commander` or `yargs` |
| Node API | Programmatic entry point | TypeScript |
| Parser | `.demo.md` → AST | TypeScript, `js-yaml` |
| Orchestrator | Coordinates execution | TypeScript |
| Playwright Driver | Wraps `tauri-playwright` | TypeScript |
| Telemetry Collector | Injects and extracts cursor telemetry | TypeScript, page `addInitScript` |
| TTS Adapter | Pluggable TTS provider interface | TypeScript |
| Caption Generator | Timings → SRT/VTT cues | TypeScript |
| Polish Engine | Auto-zoom, cursor smoothing, sway, blur, transitions | TypeScript |
| Compositor | Frame decode → transform → encode | TypeScript, Canvas2D, `fluent-ffmpeg` |
| Cache | Audio and telemetry caching | Filesystem, SHA-256 keys |

### IV.4.4 Key Data Flows

**Flow 1: Script to Recording**

```
.demo.md → Parser → AST → Orchestrator
                          ↓
              tauri-playwright (startRecording)
                          ↓
              Execute actions (timed to voiceover)
                          ↓
              tauri-playwright (stopRecording)
                          ↓
                     raw/video.mp4
```

**Flow 2: Prose to Voiceover to Captions**

```
Prose segments → TTS Adapter → {audio, word timings}
                                     ↓
                          ┌──────────┴──────────┐
                          ▼                     ▼
                     assets/voiceover-N.mp3   Caption Generator
                                                    ↓
                                              captions.srt/.vtt
```

**Flow 3: Telemetry to Polish**

```
Cursor telemetry → Auto-Zoom Analyzer → ZoomRegion[]
                                ↓
                    Connected Pan Interpolator
                                ↓
                    Camera state per frame
                                ↓
                    Cursor Smoothing + Sway
                                ↓
                    Motion Blur
                                ↓
                    Compositor
```

**Flow 4: Assembly**

```
raw/video.mp4 + assets/voiceover-*.mp3 + captions.srt + polish config
                                ↓
                           Compositor
                                ↓
                          ffmpeg pipeline
                                ↓
                          output/final.mp4
```

### IV.4.5 Data Model

See Part II § II.7 for the conceptual domain model. The implementation-level model mirrors it with TypeScript types.

### IV.4.6 Security Architecture

- **API keys** are read from environment variables or config files, never logged.
- **Narration text** is the only data sent to TTS providers.
- **No user data** is collected or transmitted by Recovoice itself.
- **TLS** is enforced for all TTS communications.
- **Filesystem** writes are restricted to the configured output directory.

## IV.5 Architecture Decision Records (ADRs)

### ADR-0001: Use `tauri-playwright` Native Recording

**Status:** Accepted

**Context:** Need native video capture of a Tauri webview with full frame rate.

**Decision Drivers:** ASR-1 (post-processing performance), CON-1 (constraint)

**Options considered:**
- A) Use `tauri-playwright` native recording (`startRecording`/`stopRecording`)
- B) Use Playwright's built-in video recording (browser mode only)
- C) Screenshot loop (rejected: not real video)
- D) CDP screencast via `context.newCDPSession`

**Decision:** Option A. `tauri-playwright` provides native capture → ffmpeg → MP4, works with real Tauri apps, and is the project's foundation.

**Consequences:**
- (+) Real video at full frame rate
- (+) Works with real Tauri apps, not just browsers
- (−) Platform-dependent quality (macOS vs Windows vs Linux)
- (−) Requires screen recording permission on macOS

### ADR-0002: Post-Processing Pipeline (Not Real-Time)

**Status:** Accepted

**Context:** Polish can be applied during recording (real-time) or after (post-processing).

**Decision Drivers:** ASR-1, ASR-3, ASR-6

**Options considered:**
- A) Post-processing: record raw, then apply polish offline
- B) Real-time: apply polish during recording

**Decision:** Option A. Post-processing decouples capture from rendering, enables high-quality effects without frame-rate constraints, and allows iterating on polish without re-recording.

**Consequences:**
- (+) Higher quality polish
- (+) Iterate on polish without re-recording
- (+) Deterministic
- (−) Slower total pipeline
- (−) Requires decode/encode round-trip

### ADR-0003: Pluggable TTS Provider Interface

**Status:** Accepted

**Context:** Multiple TTS providers exist (ElevenLabs, OpenAI, Play.ht, local models); each has different APIs, pricing, and timing metadata quality.

**Decision Drivers:** ASR-2

**Options considered:**
- A) Pluggable `TTSProvider` interface
- B) Hard-code ElevenLabs
- C) Abstract only voice configuration

**Decision:** Option A. The interface takes text and voice config, returns audio and word timings.

**Consequences:**
- (+) Users can swap providers
- (+) Testable with mock provider
- (−) Interface must accommodate provider-specific quirks (e.g., missing timings)

### ADR-0004: Port Recordly's Algorithms as Pure TypeScript

**Status:** Accepted

**Context:** Recordly provides the polish quality bar. Its algorithms live in an Electron app.

**Decision Drivers:** ASR-3, REQ-NFR-MAINT-003

**Options considered:**
- A) Port Recordly's algorithms as pure TypeScript functions
- B) Fork Recordly wholesale
- C) Reimplement from scratch

**Decision:** Option A. Extract the pure algorithmic core (auto-zoom analyzer, motion smoothing, cursor sway, easing, connected transitions, motion blur) and re-target it to the compositor.

**Consequences:**
- (+) Algorithms testable in isolation
- (+) Same quality as Recordly
- (−) Must reimplement compositor-specific glue
- (−) Some Recordly internals are not publicly documented; may require re-derivation

### ADR-0005: Cursor Telemetry via `addInitScript`

**Status:** Accepted

**Context:** Recovoice needs cursor positions and click events to drive auto-zoom and smoothing.

**Decision Drivers:** ASR-7, REQ-FUNC-014

**Options considered:**
- A) Inject a telemetry recorder via `page.addInitScript()`
- B) Use CDP `Input.dispatchMouseEvent` interception
- C) Use OS-level cursor capture

**Decision:** Option A. A lightweight listener captures `mousemove`, `mousedown`, and `wheel` events with `performance.now()` timestamps.

**Consequences:**
- (+) Cross-platform
- (+) Works in all `tauri-playwright` modes
- (+) Simple to implement
- (−) Requires alignment between page timebase and video timebase
- (−) May miss OS-level cursor motion outside the webview

### ADR-0006: Use Canvas2D for Frame Compositing

**Status:** Accepted

**Context:** Compositor must apply camera transforms and cursor overlay to each frame.

**Decision Drivers:** ASR-1, ASR-3

**Options considered:**
- A) Canvas2D in Node.js (via `node-canvas` or `@napi-rs/canvas`)
- B) WebGL via `headless-gl`
- C) Pure ffmpeg filters

**Decision:** Option A. Recordly's compositor is Canvas2D-based; porting is direct.

**Consequences:**
- (+) Direct port from Recordly
- (+) Wide ecosystem support
- (−) CPU-bound; may be slower than GPU
- (−) `node-canvas` has native dependencies

### ADR-0007: ffmpeg for Encode/Decode

**Status:** Accepted

**Context:** Compositor must decode raw MP4, process frames, and re-encode.

**Decision Drivers:** CON-2

**Options considered:**
- A) External `ffmpeg` binary via `child_process`
- B) `ffmpeg.wasm`
- C) Native Node.js video libraries

**Decision:** Option A. External `ffmpeg` is fast, mature, and universally available.

**Consequences:**
- (+) Fast, mature
- (+) Full codec support
- (−) Requires `ffmpeg` on PATH
- (−) Streaming frames via pipes requires careful buffer management

### ADR-0008: Deterministic Output for Unchanged Scripts

**Status:** Accepted

**Context:** Reproducibility is a core value (BG-1).

**Decision Drivers:** BG-1, ASR-6

**Options considered:**
- A) Cache audio, telemetry, and polish analysis; skip re-computation
- B) Always recompute

**Decision:** Option A. SHA-256 keyed caches for TTS audio, telemetry, and zoom regions.

**Consequences:**
- (+) Fast iteration
- (+) Deterministic when cache hits
- (−) Cache invalidation must be carefully designed
- (−) TTS providers may not produce byte-identical audio for the same input

## IV.6 API & Interface Contracts

See Part III § III.5 for CLI, Node API, and TTS provider interfaces.

## IV.7 Cross-Cutting Concerns

### Observability

- Structured logging via `pino` or equivalent
- Log levels: `error`, `warn`, `info`, `debug`
- Progress indicators for long-running phases (TTS, recording, compositing)

### Deployment

- Distributed via npm as `recovoice`
- Requires `ffmpeg` on PATH (documented in README)
- Requires `tauri-playwright` as a peer dependency
- Node.js 20+ required

### Error Handling

- All errors surface with context (script file, line, action, phase)
- Failed runs clean up partial artifacts
- TTS errors retry 3× with exponential backoff
- Recording errors abort with a screenshot for debugging

### Configuration

- Precedence: CLI flags > config file > frontmatter > defaults
- Config file: `recovoice.config.js` (or `.ts`, `.mjs`)
- Frontmatter schema validated with `zod` or `ajv`

## IV.8 Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Fork Recordly and adapt it | Recordly is an Electron app; porting the algorithmic core is cleaner |
| Use `recordable` directly | `recordable` is Puppeteer-based; incompatible with `tauri-playwright`'s Playwright foundation |
| Real-time polish | Constrains quality; post-processing is more flexible |
| Custom video codec | ffmpeg is mature and universal |
| Cloud-only rendering | v1 is local-only for simplicity and privacy |

## IV.9 Traceability

| ASR | Design Decision | ADR |
|---|---|---|
| ASR-1 | Post-processing pipeline | ADR-0002 |
| ASR-2 | Pluggable TTS interface | ADR-0003 |
| ASR-3 | Pure algorithmic core | ADR-0004 |
| ASR-4 | Pure parser | (design decision, no ADR) |
| ASR-5 | `--check` mode | (design decision, no ADR) |
| ASR-6 | Caching layer | ADR-0008 |
| ASR-7 | `addInitScript` telemetry | ADR-0005 |

---

# Part V — Behavioral Specification & Test Verification

**Levels 4–5 — "Prove it with examples"**

---

## V.1 Behavioral Specifications (SbE / BDD)

### Feature: Script Parsing

```gherkin
Feature: Parse .demo.md script into an executable AST

  Scenario: Parse frontmatter, prose, and actions in order
    Given a script file with frontmatter, prose, and backtick actions
    When Recovoice parses the file
    Then the AST contains one configuration object
    And the AST contains segments in the order they appear
    And each segment contains prose text and zero or more actions

  Scenario: Reject invalid frontmatter
    Given a script with an unknown key in frontmatter
    When Recovoice parses the file with --check
    Then Recovoice exits with a non-zero status
    And the error message names the offending key and its line

  Scenario: Substitute variables in prose, actions, and captions
    Given a script with `variables: { appName: "Acme" }`
    And prose containing "{{appName}}"
    When Recovoice parses the file
    Then the resolved prose is "Acme"
    And action arguments and captions are substituted identically
```

### Feature: Action Execution Timing

```gherkin
Feature: Time actions to voiceover narration

  Scenario: Actions fire at their position in the spoken line
    Given a segment with prose "Click the button to continue" 
    And word timings indicating "Click" at 0ms, "the" at 150ms, "button" at 300ms
    And an action `click("#submit")` placed at the position of "button"
    When Recovoice executes the segment
    Then the click fires within 100ms of the 300ms mark in the voiceover

  Scenario: Failed action aborts recording with context
    Given a segment with `click("#nonexistent")`
    When Recovoice executes the segment
    Then the recording is aborted
    And a screenshot is captured
    And the error message names the script, segment, and selector
```

### Feature: Voiceover Synthesis

```gherkin
Feature: Synthesize voiceover from prose

  Scenario: Synthesize audio with word timings
    Given a segment with prose "Welcome to Acme"
    And an ElevenLabs TTS provider configured
    When Recovoice synthesizes the voiceover
    Then an audio file is written to assets/
    And word timings are recorded for each word in the prose

  Scenario: Cache hit skips synthesis
    Given a segment whose text hash matches a cached synthesis
    When Recovoice synthesizes the voiceover
    Then no TTS API call is made
    And the cached audio is reused

  Scenario: TTS failure retries with backoff
    Given a TTS provider that fails twice then succeeds
    When Recovoice synthesizes the voiceover
    Then the synthesis succeeds on the third attempt
    And the retry timings follow exponential backoff
```

### Feature: Caption Generation

```gherkin
Feature: Generate captions from voiceover timings

  Scenario: Sentence-bounded cues
    Given a voiceover with two sentences
    When Recovoice generates captions
    Then two cues are emitted
    And each cue's start and end align with the sentence boundaries

  Scenario: Caption override replaces narration text
    Given a segment with prose "This is the spoken narration"
    And a caption override "Shorter on-screen text"
    When Recovoice generates captions
    Then the cue text is "Shorter on-screen text"
    And the cue timing still aligns with the spoken narration

  Scenario: SRT output conforms to SubRip
    Given a set of caption cues
    When Recovoice writes captions.srt
    Then the file parses with a standard SRT parser
    And all cues have valid timestamps
```

### Feature: Auto-Zoom Analysis

```gherkin
Feature: Compute zoom regions from cursor telemetry

  Scenario: Dwell triggers zoom
    Given cursor telemetry with the cursor dwelling for 1 second within a 100px radius
    When Recovoice analyzes the telemetry
    Then a zoom region is produced
    And its focus is the dwell center
    And its depth is 1.5 by default

  Scenario: Click cluster triggers zoom
    Given cursor telemetry with 3 clicks within 3000ms
    When Recovoice analyzes the telemetry
    Then a zoom region is produced covering the click cluster

  Scenario: Connected zoom regions produce a pan
    Given two zoom regions separated by less than 1500ms
    When Recovoice applies connected transitions
    Then a pan transition of 1000ms is inserted between them
```

### Feature: Cursor Smoothing

```gherkin
Feature: Smooth cursor motion with spring physics

  Scenario: Spring interpolation produces continuous motion
    Given raw cursor telemetry with a jumpy path
    When Recovoice applies cursor smoothing
    Then the smoothed path has no discontinuities
    And the cursor does not overshoot the target by more than 5%

  Scenario: Smoothing factor affects stiffness
    Given a smoothing factor of 0.9
    When Recovoice configures the spring
    Then the spring stiffness is lower than for a smoothing factor of 0.1
```

### Feature: Motion Blur

```gherkin
Feature: Apply motion blur based on velocity

  Scenario: Fast cursor motion produces ghost trail
    Given cursor telemetry with velocity above threshold
    When Recovoice renders the cursor
    Then up to 5 ghost frames are drawn
    And each ghost has decreasing alpha

  Scenario: Fast camera pan applies zoom blur
    Given a camera velocity above threshold
    When Recovoice renders the frame
    Then a blur is applied
    And the blur radius is capped at 8px
```

### Feature: Compositing

```gherkin
Feature: Compose final video from raw assets

  Scenario: Voiceover mixed onto video
    Given a raw video and a set of voiceover audio files
    When Recovoice composites the final video
    Then the voiceover audio is audible in the final video's audio track
    And the raw audio (if any) is muted or removed

  Scenario: Captions burned when configured
    Given `captions.burn: true` in frontmatter
    When Recovoice composites the final video
    Then the captions are rendered visually in the video
    And their style matches the frontmatter configuration
```

### Feature: Check Mode

```gherkin
Feature: Validate scripts without side effects

  Scenario: Valid script exits 0
    Given a valid .demo.md file
    When Recovoice runs with --check
    Then no browser is launched
    And no TTS API is called
    And Recovoice exits with status 0

  Scenario: Invalid script exits non-zero
    Given a .demo.md file with an action that references an undefined variable
    When Recovoice runs with --check
    Then Recovoice prints the error with line number
    And Recovoice exits with a non-zero status
```

## V.2 Test Strategy & Plan

### Test pyramid stance

Recovoice follows a **testing trophy** stance (Kent C. Dodds):

| Layer | Coverage target | Focus |
|---|---|---|
| Static checks | 100% of code | TypeScript, ESLint, Prettier |
| Unit tests | ≥ 80% of core modules | Parser, caption generator, polish algorithms |
| Integration tests | Key flows | Script → recording → compositing (with mocked TTS) |
| Visual regression | Polish output | Snapshot frames for zoom, cursor, blur |
| E2E tests | Happy path | Full pipeline against a reference Tauri app |
| Exploratory | Manual | New features, edge cases |

### Tools

| Tool | Purpose |
|---|---|
| `vitest` | Unit and integration tests |
| `playwright` | E2E test infrastructure |
| `pixelmatch` or `odiff` | Visual regression for polish frames |
| `nock` or `msw` | HTTP mocking for TTS providers |
| `k6` or `autocannon` | Performance tests for parser and compositor |

### Test data

- Reference `.demo.md` scripts under `test/fixtures/`
- Recorded telemetry fixtures under `test/fixtures/telemetry/`
- Expected SRT outputs under `test/fixtures/captions/`
- Sample TTS outputs (mocked) under `test/fixtures/tts/`

### Risk-based prioritization

| Risk | Priority |
|---|---|
| Polish quality regressions | High |
| Caption sync drift | High |
| TTS cache invalidation bugs | High |
| Cross-platform recording differences | Medium |
| CLI ergonomics | Medium |
| Parser edge cases | Medium |

## V.3 Test Case Specifications

### TC-PARSE-001: Parse valid script

- **Requirement:** REQ-FUNC-001, REQ-FUNC-002
- **Preconditions:** Test fixture `simple.demo.md` exists
- **Steps:**
  1. Call `parseScript('simple.demo.md')`
  2. Inspect the returned AST
- **Expected:** AST has one config, N segments, each segment has prose and actions
- **Verification method:** Test (automated unit)

### TC-TTS-001: Cache hit skips synthesis

- **Requirement:** REQ-FUNC-033, REQ-FUNC-034
- **Preconditions:** A cached audio file with a matching hash exists
- **Steps:**
  1. Configure a mock TTS provider that counts calls
  2. Call `synthesize` with cached text
  3. Assert provider call count is 0
- **Expected:** Cached audio is used; TTS provider is not invoked
- **Verification method:** Test (automated integration)

### TC-CAP-001: SRT conformance

- **Requirement:** REQ-FUNC-042
- **Preconditions:** Caption cues generated
- **Steps:**
  1. Write captions to `.srt`
  2. Parse with a standard SRT parser
- **Expected:** All cues parse with valid timestamps
- **Verification method:** Test (automated unit)

### TC-POLISH-001: Auto-zoom on dwell

- **Requirement:** REQ-FUNC-050
- **Preconditions:** Telemetry fixture with a 1-second dwell
- **Steps:**
  1. Run `analyzeZoomRegions(telemetry)`
- **Expected:** One zoom region with focus at the dwell center and depth 1.5
- **Verification method:** Test (automated unit)

### TC-POLISH-002: Connected pan transition

- **Requirement:** REQ-FUNC-051
- **Preconditions:** Two zoom regions 800ms apart
- **Steps:**
  1. Run `connectZoomRegions(regions)`
- **Expected:** A pan transition of 1000ms is inserted
- **Verification method:** Test (automated unit)

### TC-COMPOSE-001: Voiceover audible in final video

- **Requirement:** REQ-FUNC-061
- **Preconditions:** Raw video and voiceover audio available
- **Steps:**
  1. Run compositor
  2. Extract audio from final video
  3. Compare waveform to input voiceover
- **Expected:** Waveforms match within tolerance
- **Verification method:** Test (automated integration)

### TC-CHECK-001: No side effects in --check

- **Requirement:** REQ-FUNC-070
- **Preconditions:** Valid script; browser and TTS provider mocked
- **Steps:**
  1. Run `recovoice --check valid.demo.md`
  2. Assert no browser launch and no TTS call
- **Expected:** Exit code 0; mocks confirm no calls
- **Verification method:** Test (automated integration)

## V.4 NFR Verification Plans

### Performance

- **REQ-NFR-PERF-001:** Benchmark parser against a 500-line fixture; assert ≤ 100 ms on CI runner
- **REQ-NFR-PERF-002:** Synthesize a 2-minute script with a mock provider; measure wall-clock
- **REQ-NFR-PERF-003:** Composite a 2-minute video; assert total time ≤ 2× duration
- **REQ-NFR-PERF-004:** Record a 2-minute run; assert sustained ≥ 30 fps

### Reliability

- **REQ-NFR-REL-001:** Run synthesis twice; assert second run makes no API calls
- **REQ-NFR-REL-002:** Mock a TTS provider that fails twice; assert success with 3 retries
- **REQ-NFR-REL-003:** Kill the process mid-run; assert no partial output in the final directory

### Compatibility

- **REQ-NFR-COMPAT-001/002:** CI matrix on Node.js 20/22/24 × macOS/Windows/Ubuntu
- **REQ-NFR-COMPAT-003:** Play the final MP4 in Chrome, Firefox, Safari (manual)
- **REQ-NFR-COMPAT-004:** Validate SRT with a standard parser

### Security

- **REQ-NFR-SEC-001:** Static analysis to detect key logging
- **REQ-NFR-SEC-002:** Network capture during synthesis; assert only prose is sent
- **REQ-NFR-SEC-003:** Config inspection for TLS version

### Maintainability

- **REQ-NFR-MAINT-001:** Coverage report ≥ 80% on core modules
- **REQ-NFR-MAINT-002:** `eslint-plugin-tsdoc` on public APIs
- **REQ-NFR-MAINT-003:** Architecture review confirms polish modules are pure

### Flexibility

- **REQ-NFR-FLEX-001:** Two reference TTS providers (ElevenLabs + mock) passed to the same pipeline
- **REQ-NFR-FLEX-002:** Test each polish flag disables its effect independently

## V.5 Requirements Traceability Matrix

See [Appendix B](#appendix-b--master-traceability-matrix).

## V.6 Living Documentation Strategy

- **Scripts under test** live in `test/fixtures/` and are treated as first-class code
- **BDD scenarios** in `features/*.feature` are run in CI and published to a documentation site
- **Visual regression snapshots** are stored alongside features and updated via PR review
- **Coverage reports** are published per-commit
- **CHANGELOG.md** is generated from conventional commits

---

# Appendix A — Master Glossary

| Term | Definition | Synonyms (forbidden) |
|---|---|---|
| **Recovoice** | The product described by this specification | — |
| **Script** | A `.demo.md` file containing frontmatter, prose, and action markers | Demo file, demo script |
| **Action** | A backtick-delimited Playwright/`tauri-playwright` API call | Command, step |
| **Prose** | Natural-language narration text between actions | Narration, text |
| **Segment** | A (prose, actions) pair forming one narration unit | Block, section |
| **Voiceover** | Synthesized audio for a prose segment | VO, narration audio |
| **Caption** | On-screen text derived from a voiceover segment | Subtitle |
| **Cue** | A single caption entry with start/end times and text | Subtitle entry |
| **Polish** | Cinematic post-processing: zoom, cursor smoothing, blur, transitions | Effects, animations |
| **Zoom Region** | A time interval with a computed zoom target | — |
| **Cursor Telemetry** | Timestamped cursor positions and click events captured during recording | Mouse data |
| **Recording** | The raw MP4 produced by `tauri-playwright` | Raw video |
| **Compositor** | The component that applies polish and mixes audio/captions | Renderer |
| **TTS Provider** | A pluggable synthesis backend | Voice engine |
| **Timebase** | The reference timeline against which all timestamps are aligned | — |
| **Word Timing** | The start and end times of a single word within a voiceover | — |
| **Fit Criterion** | A measurable test that determines whether a requirement is satisfied | Acceptance test |
| **ASR** | Architecturally Significant Requirement | — |
| **ADR** | Architecture Decision Record | — |
| **MADR** | Markdown Architectural Decision Record | — |

---

# Appendix B — Master Traceability Matrix

| Vision Goal | BRS Goal | User Req | System Req | BDD Scenario | Test Case | Verification Method |
|---|---|---|---|---|---|---|
| G-1 | BG-1 | UR-1 | REQ-FUNC-001 | Parse frontmatter, prose, actions | TC-PARSE-001 | Test |
| G-1 | BG-1 | UR-1 | REQ-FUNC-002 | Parse frontmatter, prose, actions | TC-PARSE-001 | Test |
| G-1 | BG-1 | UR-6 | REQ-FUNC-005 | Parse include directives | (unit) | Test |
| G-3 | BG-6 | UR-2 | REQ-FUNC-030 | Synthesize audio with word timings | TC-TTS-001 | Test |
| G-3 | BG-6 | UR-2 | REQ-FUNC-035 | --voiceover-only mode | (integration) | Test |
| G-4 | BG-5 | UR-5 | REQ-FUNC-040 | Sentence-bounded cues | TC-CAP-001 | Test |
| G-4 | BG-5 | UR-5 | REQ-FUNC-042 | SRT conformance | TC-CAP-001 | Test |
| G-5 | BG-3 | UR-3 | REQ-FUNC-020 | Native recording start | (integration) | Test |
| G-5 | BG-3 | UR-3 | REQ-FUNC-021 | Native recording stop | (integration) | Test |
| G-6 | BG-4 | UR-5 | REQ-FUNC-050 | Auto-zoom on dwell | TC-POLISH-001 | Test |
| G-6 | BG-4 | UR-5 | REQ-FUNC-051 | Connected pan transition | TC-POLISH-002 | Test |
| G-7 | BG-1, BG-2 | UR-5 | REQ-FUNC-060 | Voiceover mixed onto video | TC-COMPOSE-001 | Test |
| G-7 | BG-2 | UR-5 | REQ-FUNC-064 | H.264/AAC output | (integration) | Test |
| G-8 | BG-3 | UR-4 | REQ-FUNC-070 | Valid script exits 0 | TC-CHECK-001 | Test |
| G-8 | BG-3 | UR-4 | REQ-FUNC-072 | Invalid script exits non-zero | TC-CHECK-001 | Test |
| — | BG-1 | UR-1 | REQ-NFR-PERF-001 | — | (benchmark) | Analysis |
| — | BG-2 | — | REQ-NFR-PERF-003 | — | (benchmark) | Analysis |
| — | BG-3 | UR-7 | REQ-NFR-REL-001 | Cache hit skips synthesis | TC-TTS-001 | Test |
| — | BG-4 | — | REQ-NFR-USE-001 | — | (usability) | Demonstration |
| — | BG-5 | — | REQ-NFR-COMPAT-004 | SRT conformance | TC-CAP-001 | Test |
| — | BG-6 | — | REQ-NFR-FLEX-001 | — | (integration) | Test |

---

# Appendix C — Open Questions and TBD Register

| ID | Question | Owner | Due | Status |
|---|---|---|---|---|
| OQ-1 | Should polish be applied during recording or as post-processing? | Tech Lead | Before design freeze | **Resolved** — post-processing (ADR-0002) |
| OQ-2 | How do we handle scroll events in cursor telemetry? | Tech Lead | Before polish engine | Open |
| OQ-3 | Do we ship a default TTS voice or require user configuration? | Product Owner | Before v1.0 | Open |
| OQ-4 | Which caption styling engine (custom Canvas2D vs ffmpeg `subtitles` filter)? | Tech Lead | Before compositor | Open |
| OQ-5 | How do we handle multi-cursor scenarios (e.g., split view)? | Tech Lead | Before polish engine | Open |
| OQ-6 | Should the raw video be preserved after compositing? | Product Owner | Before v1.0 | Open |
| OQ-7 | What is the license (MIT vs Apache 2.0)? | Executive Sponsor | Before v1.0 | Open |
| OQ-8 | Do we support remote TTS models (self-hosted) in v1? | Product Owner | Before v1.0 | Open |
| OQ-9 | How do we handle `waitFor` actions that fail due to timing? | Tech Lead | Before action executor | Open |
| OQ-10 | Do we support WebVTT styling beyond basic cues? | Tech Lead | Before v1.0 | Open |
| TBD-1 | Frame rate default for CI runners | Tech Lead | Before v1.0 | Open |
| TBD-2 | Reference hardware for performance targets | Tech Lead | Before v1.0 | Open |
| TBD-3 | CI matrix for cross-platform recording | QA Lead | Before v1.0 | Open |

---

*End of Recovoice Complete Specification Suite — v0.1 Draft*
