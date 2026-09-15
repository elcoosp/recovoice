# ADR-0004: Port Recordly's Algorithms as Pure TypeScript

- **Status:** Accepted
- **Date:** 2026-09-15

## Context and Problem Statement

Recordly provides the quality bar for cinematic demo polish. Its polish engine
lives inside an Electron app. Recovoice needs the same quality without the
Electron dependency.

## Decision Drivers

- ASR-3: Polish algorithms must be testable without a browser
- NFR-MAINT-003: Pure functions for polish

## Considered Options

- **A) Port Recordly's algorithms as pure TypeScript functions**
- B) Fork Recordly wholesale
- C) Reimplement from scratch

## Decision Outcome

Chosen **A**. The polish engine is pure mathematics: spring simulation, easing,
velocity-based effects, region analysis. Ported as pure functions, they are
testable in isolation, framework-agnostic, and reusable.

Modules ported:

- `auto-zoom-analyzer` — dwell + click-cluster detection
- `motion-smoothing` — damped spring simulation
- `cursor-sway` — velocity-based rotational wobble
- `easing` — cubic bezier solver + named curves
- `zoom-region-utils` — connected transition detection
- `motion-blur` — velocity → blur intensity
- `canvas-cursor-renderer` — cursor drawing (adapted)

## Consequences

**Positive**

- Testable in isolation (no Electron, no browser)
- Same quality as Recordly
- Reusable across projects

**Negative**

- Some internals are not publicly documented; a few algorithms were re-derived
  from first principles
- Compositor-specific glue must be written from scratch

## Links

- https://github.com/webadderallorg/Recordly
