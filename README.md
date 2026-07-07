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

Deploy to Vercel / Netlify / Cloudflare Pages (all HTTPS). Fully
self-contained: model + WASM ship with the build, no runtime CDNs.

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

## The experience (v0.3 — three gestures, no panels)

- **Look around** — everything the system recognizes gets a faint ambient
  bracket: *seen, not yet examined*. Detection is YOLOv8-nano via ONNX
  Runtime Web (80 COCO classes, noticeably tighter than COCO-SSD)
- **TAP one object** — it becomes the single active entity: bright bracket,
  telemetry tag, typewriter fragment, category-tuned particles — and the
  moment is **auto-logged** (snapshot + fragment + session stamp). Tap again
  for a new reading (updates the same log entry). One object active at a
  time = one LLM call per tap, minimal tokens
- **HOLD** — inspect: glitch burst + rotating holographic wireframe
  primitive matched to the object's category
- **Story arc** — the narrator moves from neutral observations → noticing
  patterns in your choices (5+ objects) → addressing you directly (10+),
  and threads one-step memory between taps ("You turned away from the
  chair. The cup was already waiting.")
- **Render anomalies** — occasionally a region spanning between objects
  glitches: chromatic fringing, scan tearing, a wireframe flash
- **Anomaly log** — the only panel. Everything you tapped, in order, with
  session stamps (`T+00:03:42`): the log *is* the story you assembled
- **Sound** — fully synthesized (no audio files): ambient drone, data
  ticks, activation blips, inspect sweeps, glitch stutters, log chimes.
  Mute toggle persisted
- **Onboarding** — three quick cards on first run explain everything

## Structure

```
index.html          screens: landing / loader / error / scanner / sheet / log
api/
  latent-fragment.ts  optional Vercel function → OpenAI / Gemini / Anthropic
public/
  models/yolov8n.onnx  detection model (~12.8 MB, browser-cached)
src/
  main.ts           orchestration, render loop, tap/hold, onboarding, AI wiring
  camera.ts         rear-camera getUserMedia with typed errors
  yolo.ts           YOLOv8 ONNX inference: letterbox, decode, NMS
  detection.ts      600 ms detection loop, IoU tracking
  narrative.ts      story engine: fragments, session arc, entity telemetry
  overlays.ts       brackets, orbit nodes, narrative text, layer compositing
  particles.ts      category-tuned AR particle emitters
  glitch.ts         occasional render-anomaly shader between bounding boxes
  hologram.ts       three.js wireframe primitives on inspect
  audio.ts          synthesized sound design (Web Audio, no files)
  ai.ts             /api/latent-fragment client with silent fallback
  archive.ts        anomaly log: localStorage, snapshots, gallery, updates
  types.ts          shared types
  styles.css        cyber-mystic UI (Space Grotesk / Space Mono)
```
