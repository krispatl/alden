/**
 * /api/latent-fragment — the entire backend, provider-agnostic.
 *
 * A Vercel serverless function that turns a detected object label + story
 * state into one short narrative fragment in the app's voice. Configure ONE
 * of these environment variables in Vercel and it uses that provider:
 *
 *   OPENAI_API_KEY     → gpt-4o-mini        (platform.openai.com)
 *   GEMINI_API_KEY     → gemini-2.0-flash   (aistudio.google.com — free tier)
 *   ANTHROPIC_API_KEY  → claude haiku       (console.anthropic.com)
 *
 * Only text labels ever reach this function. Camera frames stay on-device.
 * Model strings drift over time — check each provider's docs if one 404s.
 */

const SYSTEM = `You write single narrative fragments for an AR artwork where the viewer slowly realizes the room around them is a simulation being rendered in real time. Voice: curious, present-tense, gently uncanny — never menacing, never explanatory. The viewer is noticing seams: objects loading late, assets being reused, render hints leaking through. Second person ("you") is allowed. One or two short sentences, under 160 characters total. Plain language a newcomer immediately understands.

Respond with ONLY a JSON object, no markdown fences:
{"fragment": "Your sentence(s) here."}`;

function buildUser(body: any): string {
  const { label, encounter, prevLabel, sceneContext, sessionMinutes } = body;
  return [
    `Object the viewer just examined: ${String(label).slice(0, 60)}`,
    encounter > 1 ? `This is their encounter #${encounter} with this object type.` : 'First encounter with this object type.',
    prevLabel ? `The previous object they examined was: ${String(prevLabel).slice(0, 60)} — you may reference the shift in attention.` : '',
    sceneContext ? `Also visible in the scene: ${String(sceneContext).slice(0, 200)}` : '',
    sessionMinutes >= 3 ? `They have been observing for ${sessionMinutes} minutes; the simulation is starting to notice them back.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function callOpenAI(key: string, user: string): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 120,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(key: string, user: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 120, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callAnthropic(key: string, user: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const data = await r.json();
  return (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const { label } = req.body ?? {};
  if (typeof label !== 'string' || !label.trim() || label.length > 60) {
    res.status(400).json({ error: 'label must be a short string' });
    return;
  }

  const user = buildUser(req.body);
  const openai = process.env.OPENAI_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;

  try {
    let text: string;
    if (openai) text = await callOpenAI(openai, user);
    else if (gemini) text = await callGemini(gemini, user);
    else if (anthropic) text = await callAnthropic(anthropic, user);
    else {
      res.status(500).json({ error: 'no provider key configured' });
      return;
    }

    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (typeof parsed.fragment !== 'string') throw new Error('bad shape');
    res.status(200).json({ fragment: String(parsed.fragment).slice(0, 300) });
  } catch {
    res.status(502).json({ error: 'generation failed' });
  }
}
