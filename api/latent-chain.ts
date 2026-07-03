/**
 * /api/latent-chain — the entire backend.
 *
 * A Vercel serverless function that turns a detected object label into a
 * five-step latent transformation chain and a one-line poetic fragment,
 * using the Anthropic API. Deploy this repo to Vercel and set the
 * ANTHROPIC_API_KEY environment variable; the frontend detects the endpoint
 * automatically and falls back to its local dictionary if it's absent.
 *
 * Only text labels ever reach this function. Camera frames stay on-device.
 *
 * Model strings change over time — check https://docs.claude.com for the
 * current list if this one is ever retired.
 */

const MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap; poetry doesn't need a frontier model

const SYSTEM = `You are generating poetic latent-space transformations for an augmented reality artwork called Latent Space Explorer. Given a detected object, create a five-step transformation chain from literal object to symbolic cosmic form, plus one short poetic sentence about the object. Keep it concise, strange, visual, and emotionally resonant. Avoid clichés.

Respond with ONLY a JSON object, no markdown fences, no preamble:
{"chain": ["object", "step2", "step3", "step4", "cosmic form"], "poem": "One sentence."}
Each chain step is 1-4 lowercase words.`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  const { label, sceneContext, tone } = req.body ?? {};
  if (typeof label !== 'string' || !label.trim() || label.length > 60) {
    res.status(400).json({ error: 'label must be a short string' });
    return;
  }

  const user = [
    `Detected object: ${label.trim()}`,
    sceneContext && typeof sceneContext === 'string'
      ? `Also visible in the scene: ${sceneContext.slice(0, 200)}`
      : '',
    tone && typeof tone === 'string' ? `Tone: ${tone.slice(0, 100)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!r.ok) {
      res.status(502).json({ error: `upstream ${r.status}` });
      return;
    }

    const data = await r.json();
    const text: string = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (!Array.isArray(parsed.chain) || typeof parsed.poem !== 'string') {
      throw new Error('bad shape');
    }

    res.setHeader('Cache-Control', 's-maxage=3600');
    res.status(200).json({
      chain: parsed.chain.slice(0, 6).map((w: unknown) => String(w).slice(0, 60)),
      poem: String(parsed.poem).slice(0, 400),
    });
  } catch {
    res.status(502).json({ error: 'generation failed' });
  }
}
