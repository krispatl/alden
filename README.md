# Latent Space Explorer

A browser-based camera instrument. It looks through your camera, detects
objects, and instead of labeling them literally, drifts them through poetic
chains of latent association:

> chair → throne → witness → ruin → monument

All frames are processed locally in the browser. No backend, no API keys.

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
- **Drift** — each object's chain mutates to a new variant every 8 seconds
- **Tap** an object — expanded bottom sheet: label, confidence, full chain,
  poetic fragment, Regenerate, Generate portal, Save discovery
- **Hold** an object — portal bloom animation + fresh poetic fragment
- **Archive** — saved discoveries (snapshot, chain, poem, timestamp) persist
  in localStorage; delete from the gallery

## Structure

```
index.html          screens: landing / loader / error / scanner / sheet / archive
src/
  main.ts           orchestration, render loop, tap & hold input
  camera.ts         rear-camera getUserMedia with typed errors
  detection.ts      COCO-SSD (code-split), 500 ms loop, IoU object tracking
  latentChains.ts   curated chain dictionary, fallbacks, poem templates
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
