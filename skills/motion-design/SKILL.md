---
name: motion-design
description: "Age-adaptive motion design for children's teaching videos: beat-synchronized focus/reveal choreography, easing and anticipation recipes, and frame-driven Remotion implementation rules. Use when authoring or reviewing lesson-video animation (3-4 vs 5-6 rhythm, focus transfers, reveal staggering)."
whenToUse: "When writing GeneratedLesson.tsx animation code or choosing motion presets for a teaching-video scene."
metadata:
  tags: [motion, animation, remotion, age-adaptive, choreography]
---

# Motion Design for Teaching Videos

Animation exists to point at what the narration is saying **right now**.
A scene that lays everything out and then idles is a slide, not a teaching video.

## Age profiles (hard rules, not suggestions)

| | 3-4 years | 5-6 years |
|---|---|---|
| min beat length | 2.5s | 1.6s |
| focus transfers per scene | 1 | up to 3 |
| reveals | one element per beat | overlapping reveals allowed |
| motion amplitude | 1.25 (big, slow, readable) | 1.12 (smaller, quicker) |
| on-screen text per beat | ≤ 6 chars | ≤ 8 chars |

Derive beats from the narration sentences: sentence i owns beat i.
If the storyboard provides `beats`, honor them; if not, derive one beat per sentence.

## Motion vocabulary (map every beat to exactly one)

- `focus-ring`: the subject being spoken about gets a soft ring + scale 1→1.16·amp.
  Use for "this is X" sentences. The ring must land on the subject, not the scene center.
- `spring-pop`: new subject enters with overshoot (stiffness ~120, damping ~14).
  Use for the first appearance of a countable object.
- `trace-on`: lines/arcs draw themselves stroke-by-stroke synced to the beat
  (strokeDashoffset from length→0). Use for rays, orbits, lever arms, growth arrows.
- `stagger`: siblings enter one after another, 6-10 frame offset. Use for counting sets.
- `swell`: the subject's size tracks the concept (hot→bigger, cold→smaller).
  Amplitude follows the age profile.
- `orbit`: subject travels a closed path while the beat lasts. Use for cycles
  (water cycle, day/night, seasons). One revolution per cycle narration, not per second.
- `camera-push`: whole-stage scale 1→1.08 toward the focus point. Use once per scene
  at the core-concept sentence; never stack with focus-ring on the same beat.
- `fade-rise`: quiet entrance for background/summary elements.

## Motion helpers (prefer these for standard beats)

The authoring task directory ships `motion-helpers.ts` — pre-tuned primitives
extracted from the proven deterministic-engine recipes. Import what you need:
`import { ageAmplitude, springEnter, focusScale, staggerEnter, popScale, swellScale, progress } from "./motion-helpers";`

| Vocabulary | Helper |
|---|---|
| focus-ring | `focusScale(frame, "active"\|"visited"\|"pending", amp)` |
| spring-pop | `popScale(frame, popFrame, fps)` then settle into `focusScale` |
| stagger | `staggerEnter(frame, enterFrame, index, fps)` (8-frame offset) |
| swell | `swellScale(progress01, "grow"\|"shrink")` (±28%) |
| entrances | `springEnter(frame, enterFrame, fps, "pop"\|"travel")` |
| amplitude | `ageAmplitude(ageGroup)` — multiply every scale by it |
| beat windows | `progress(frame, start, end)` — clamped 0→1 |

Helpers are optional, not mandatory: bespoke motion the helpers don't cover
(trace-on, orbit, camera-push, custom choreography) is still written with raw
`interpolate`/`spring` following the recipes below. Preferring helpers shrinks
the code you must write and keeps the common cases on tuned parameters.

## Easing and anticipation recipes

- Entrances: spring or cubic-bezier(0.22, 1, 0.36, 1) (ease-out-quint). Never linear —
  the contract validator rejects `Easing.linear` unless the same/previous line carries
  a `// linear-ok: <reason>` comment (continuous motion like rotation/progress only).
- Exits: ease-in (accelerate away), 12-18 frames; a lingering exit reads as lag.
- Anticipation: before a big move, 4-6 frames of 2-3% counter-scale. Children read
  the wind-up as "something is about to happen" — it buys attention for the reveal.
- Hold: after each reveal, hold ≥ 20 frames (3-4) / ≥ 12 frames (5-6) before the next
  motion starts. Motion without holds is noise.
- Focus transfer: old focus releases over 8 frames while new focus rises over 12;
  overlap the two so the eye is never left without an anchor.

## Frame-driven implementation (Remotion)

- Everything derives from `useCurrentFrame()` + `fps`. No setTimeout/setInterval,
  no Date.now, no Math.random (use `random(seed)` from remotion if you need jitter).
- Compute local beat time: `local = (frame - sceneStart) / fps - beatStartSec`.
  Clamp windows; a beat's motion must be a pure function of local time so stills
  at any frame are reproducible.
- Interpolate with `interpolate(frame, [a, b], [v1, v2], {extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp'})` — unclamped interpolation leaks motion across scenes.
- Springs: `spring({frame: frame - enterFrame, fps, config})` — always offset by the
  enter frame, never the raw composition frame.
- Keep amplitude in one place: `const amp = ageGroup === '3-4' ? 1.25 : 1.12` and
  multiply every scale/swell by it so the age profile is auditable in one line.

## Readability floor (QA will reject violations)

- White or pale subjects on pale backgrounds get a 3-4px darker outline.
- Labels never sit on top of solid shapes; place them in empty space, white stroke
  behind text (paintOrder stroke) when unavoidable.
- The main figure must occupy the middle ~60% of the canvas; a corner doodle fails.
- Subtitles live in the bottom band; no figure element may enter that band.