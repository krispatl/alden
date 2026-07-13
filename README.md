# Latent Space Explorer — The Witness

A narrative AR instrument. Point your camera at ordinary objects and piece
together what happened here — who was in this room before you, and why the
traces they left look so familiar.

> `T+03:42 · 0x4A2F · chair`
> *The previous observer sat here for eleven minutes. The cushion still holds
> their thermal signature in the render cache.*

All processing happens on-device. Works fully offline with the built-in
story engine; optionally connects to an LLM narrator for bespoke fragments.

## The story

Someone was here before you. They left traces in the render — thermal
signatures in chairs, liquid levels in cups, pages bookmarked in books. As
you examine objects you piece together what happened. Around the 10th object,
the traces start matching your behavior eerily. By the 15th, you realize:
the previous observer was you, from an earlier loop. The simulation resets
between sessions, but the cache doesn't fully clear.

The story unfolds across four acts gated by how many objects you've examined,
building to a final entry at object 25. When you open the app again, it
knows you've returned. Loop count increments. The narrator remembers.

## Run

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build
```

Deploy `dist/` to Vercel / Netlify / Cloudflare Pages. Fully self-contained.

## Vision narrator (optional)

When the LLM narrator is active, each tap also sends a **small crop of the
tapped object only** (max 320px, ~20–40KB) so the narrator can cite one real
visual detail — the chip on the mug, the sticker on the laptop. Never the
full frame, never without a tap. To make the narrator text-only, set
`SEND_VISION = false` in `src/ai.ts`. All three providers (gpt-4o-mini,
gemini-2.0-flash, claude haiku) handle the image path.

## LLM narrator (optional)

Set one env var on Vercel — `OPENAI_API_KEY` (gpt-4o-mini),
`GEMINI_API_KEY` (free tier), or `ANTHROPIC_API_KEY`. The backend receives
a full story bible with act gates, and each call includes activation count,
visit number, observer ID, and previous-object memory. The local engine
mirrors the same arc offline.

## Three gestures

- **Look around** — everything detected gets a faint ambient bracket
- **Tap** — object becomes the sole active entity: bright bracket,
  telemetry tag, typewriter fragment, category-tuned particles.
  Auto-logged to the anomaly log. Tap again for a new reading
- **Hold** — inspect: glitch burst + rotating holographic wireframe

## What makes it feel like an installation

- **Session persistence** — returning visitors get different openings;
  the loop count and observer ID survive across sessions
- **Sound arc** — ambient drone evolves: Act II adds a detuned fifth,
  Act III a sub-bass heartbeat, Act IV a tritone dissonance. The ending
  fades everything to silence
- **Camera feed** — video desaturates, cools, and vignettes progressively
  as the story darkens
- **Person detection** — always eerie regardless of act: "The other
  observer cannot see what you see"
- **The ending** — at 25 objects the narrator delivers a final entry,
  the sound fades, the HUD goes quiet. The piece is done
- **Anomaly log** — styled as a recovered session document with
  integrity percentage. Read top to bottom: that's the story you built
