# Latent Space Explorer

A browser-based camera instrument. It looks through your camera, detects
objects, and instead of labeling them literally, drifts them through poetic
chains of latent association:

> chair → throne → witness → ruin → monument

All frames are processed locally in the browser. Works fully offline with a
curated local dictionary; optionally connects to an LLM for generated chains
(see AI mode below).

## AI mode (optional, one env var)

The repo includes `api/latent-chain.ts` — a single Vercel serverless function
that generates chains and poems with the Anthropic API (Claude Haiku).

1. Deploy the repo to Vercel
2. In the Vercel project settings, add the environment variable
   `ANTHROPIC_API_KEY` (get one at https://console.anthropic.com)
3. Done — the frontend probes `/api/latent-chain` automatically. When it's
   live, the HUD shows `· ai drift`; when it's absent or fails, the local
   dictionary takes over with no error.

Privacy holds either way: only the detected **label text** (e.g. "chair") and
other visible labels are sent — camera frames never leave the device.
Responses are cached per label in localStorage to keep token usage tiny.
Model string is set in `api/latent-chain.ts`; check https://docs.claude.com
for current models if it's ever retired.

## Run

```bash
npm install
npm run dev
```

Open the printed URL. On desktop, localhost works directly. To test on a
phone against your dev machine, camera access requires HTTPS — the quickest
route is deploying, or `npm run dev -- --host` plus a tunnel (e.g. ngrok).

## Build & deploy

```bash
npm run build
```

Deploy the `dist/` folder to Vercel, Netlify, or Cloudflare Pages (all serve
over HTTPS, which the camera requires).

## Interactions

- **Scan** — point the camera; detected objects get glowing brackets and a
  floating latent chain that reveals word by word
- **Constellation telemetry** — curved threads connect detected objects,
  fanned filaments reach into a flickering feature-point field sampled from
  image contrast, and low-confidence detections render as raw echo boxes
  with coordinate readouts
- **Drift** — each object's chain mutates to a new variant every 8 seconds
- **Tap** an object — expanded bottom sheet: label, confidence, full chain,
  poetic fragment, Regenerate, Generate portal, Save discovery
- **Hold** an object — portal bloom animation + fresh poetic fragment
- **Archive** — saved discoveries (snapshot, chain, poem, timestamp) persist
  in localStorage; delete from the gallery

## Structure

```
index.html          screens: landing / loader / error / scanner / sheet / archive
api/
  latent-chain.ts   optional Vercel function → Anthropic API (the whole backend)
src/
  main.ts           orchestration, render loop, tap & hold input, AI wiring
  camera.ts         rear-camera getUserMedia with typed errors
  detection.ts      COCO-SSD (code-split), 500 ms loop, IoU tracking, echo boxes
  latentChains.ts   curated chain dictionary, fallbacks, poem templates
  constellation.ts  feature-point field, connecting threads, telemetry readouts
  ai.ts             /api/latent-chain client: cache, timeout, silent fallback
  overlays.ts       canvas brackets, chain text, node particles, cover-fit mapping
  portal.ts         chromatic ring + particle bloom layer
  archive.ts        localStorage persistence, frame capture, gallery
  types.ts          shared types
  styles.css        cyber-mystic UI (Space Grotesk / Space Mono)
```

## Notes

- Detection runs every 500 ms at confidence > 0.55 using the
  `lite_mobilenet_v2` COCO-SSD base for mobile performance
- Objects are tracked across frames (IoU matching) so chains and poems stay
  stable while an object remains in view
- Snapshots are stored as ~640 px JPEGs; if localStorage quota is hit, the
  oldest entries are trimmed
