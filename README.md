# Latent Space Explorer

A browser-based narrative CV/AR instrument. It looks through your camera,
detects objects — and slowly convinces you the room is being rendered.
Framed objects get story fragments in the voice of a simulation caught in
the act: assets reused, entities loading late, render hints leaking through.

> `0x4A2F · chair · LOD-1`
> *This chair was not here when you weren't looking.*

All camera frames are processed locally in the browser. Works fully offline
with the built-in narrative engine; optionally connects to an LLM narrator.

## Run

```bash
npm install
npm run dev
```

On desktop, localhost works directly. To test on a phone, camera access
requires HTTPS — quickest is deploying, or `npm run dev -- --host` + a
tunnel (e.g. ngrok).

## Deploy

```bash
npm run build
```

Deploy to Vercel / Netlify / Cloudflare Pages (all HTTPS).

## Live LLM narrator (optional, one env var)

`api/latent-fragment.ts` is a single provider-agnostic Vercel function.
Set **one** environment variable in your Vercel project:

| Key                 | Provider → model        | Where to get it            |
| ------------------- | ----------------------- | -------------------------- |
| `OPENAI_API_KEY`    | OpenAI → gpt-4o-mini    | platform.openai.com        |
| `GEMINI_API_KEY`    | Google → gemini-2.0-flash | aistudio.google.com (free tier) |
| `ANTHROPIC_API_KEY` | Anthropic → Claude Haiku | console.anthropic.com      |

The frontend probes the endpoint automatically. When live, the HUD shows
`· live narrator` and new objects get bespoke fragments; when absent, the
local engine takes over seamlessly. Only label text + story state are sent —
never camera frames. Model strings drift; check provider docs if one 404s.

## The experience

- **Scan** — objects get glowing brackets, a telemetry tag
  (`0x4A2F · cup · LOD-2`), and a typewriter story fragment
- **Story state** — the narrative engine tracks encounters, session time,
  and scene composition: your 4th chair reads differently than your 1st, and
  after a few minutes the simulation starts noticing *you*
- **AR particles** — every object emits particles tuned to its category:
  screens shed pixels, plants release spores, furniture stirs dust
- **Render anomalies** — occasionally a region spanning between objects
  glitches: chromatic fringing, scan tearing, a wireframe flash
- **Hold to inspect** — a rotating holographic wireframe primitive (matched
  to the object's category) materializes above it, with a glitch burst
- **Tap to read** — bottom sheet: entity telemetry, full fragment,
  Inspect / New reading / Log anomaly
- **Anomaly log** — logged evidence with session stamps (`T+00:03:42`),
  snapshots, and fragments; the log *is* the story you assembled
- **Sound** — fully synthesized (no audio files): low ambient drone, data
  ticks, detection blips, inspect sweeps, glitch stutters, log chimes.
  Mute toggle in the HUD, persisted
- **Onboarding** — three quick cards on first run explain everything

## Structure

```
index.html          screens: landing / loader / error / scanner / sheet / log
api/
  latent-fragment.ts  optional Vercel function → OpenAI / Gemini / Anthropic
src/
  main.ts           orchestration, render loop, input, onboarding, AI wiring
  camera.ts         rear-camera getUserMedia with typed errors
  detection.ts      COCO-SSD (code-split), 500 ms loop, IoU tracking
  narrative.ts      story engine: fragments, story state, entity telemetry
  overlays.ts       brackets, orbit nodes, narrative text, layer compositing
  particles.ts      category-tuned AR particle emitters
  glitch.ts         occasional render-anomaly shader between bounding boxes
  hologram.ts       three.js wireframe primitives on inspect
  audio.ts          synthesized sound design (Web Audio, no files)
  ai.ts             /api/latent-fragment client with silent fallback
  archive.ts        anomaly log: localStorage, snapshots, gallery
  types.ts          shared types
  styles.css        cyber-mystic UI (Space Grotesk / Space Mono)
```
