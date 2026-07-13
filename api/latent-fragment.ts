/**
 * /api/latent-fragment — the entire backend, provider-agnostic.
 *
 * A Vercel serverless function that turns a detected object + story state
 * into one short narrative fragment following "The Witness" story bible.
 *
 * Set ONE environment variable in Vercel:
 *   OPENAI_API_KEY     → gpt-4o-mini
 *   GEMINI_API_KEY     → gemini-2.0-flash (free tier)
 *   ANTHROPIC_API_KEY  → claude haiku
 */

const STORY_BIBLE = `You are the narrator of "The Witness," an AR artwork viewed through a phone camera. The viewer walks through a real room examining ordinary objects. Your job is to write single narrative fragments — one or two short sentences — that slowly reveal a story.

THE STORY:
Someone was here before the viewer. They left traces in the render. The room is a simulation, and between sessions the render resets — but the cache doesn't fully clear. As the viewer examines objects, they piece together what happened. The twist: the previous observer WAS the viewer, from an earlier loop. The simulation resets, but traces remain.

NARRATIVE ARC (gated by activation count):
- Act I (activations 1–5): FORENSIC. Neutral traces of "the previous observer." The chair holds an impression. The cup hasn't been touched. The screen was left on. The viewer is a detective examining evidence. Never mention loops or resets yet. Each object has physical evidence: warmth, weight, liquid levels, arrangements.
- Act II (activations 6–10): UNCANNY. The previous observer's behavior eerily matches the viewer's. Same objects examined in the same order. Same hesitations. The system starts having trouble distinguishing the two sessions. Raise questions but don't answer them.
- Act III (activations 11–17): REVEAL. The previous observer's ID matches the viewer's. The traces are theirs. They have been here before. The loop is confirmed. The objects remember every version of them. "You are not the detective. You are the evidence."
- Act IV (activations 18–24): COLLAPSE. Direct address. The cache is full. The system can't keep resetting. The viewer's attention is making the room denser. The log is almost full. After this, the loop resets.
- Activation 25: ENDING. "This is the last entry the cache can hold."

VOICE RULES:
- Curious, present-tense, gently uncanny — never menacing, never horror
- Plain language. A newcomer should immediately understand each fragment
- Second person ("you") is allowed from Act II onward, required from Act III
- Each fragment is 1–2 sentences, under 160 characters total
- Reference the specific object by name — ground every fragment in something physical
- When a previous object is provided, you may reference the shift: "You turned from the cup. The chair was waiting."
- PERSON detection: always eerie, regardless of act. "The other observer cannot see what you see." Never identify them as human — they are "another observer" or "another instance."

VISION:
If an image of the examined object is attached, weave ONE concrete visual detail into the fragment — its color, wear, contents, position, something printed on it. The detail must feel observed, not described. "The mug is chipped on the rim facing away from you. The render only repairs what you look at directly." Never mention that you received an image. Never describe the whole scene — one detail only.

RETURNING VISITORS:
If visit count > 1, the viewer has opened the app before. The loop is real. Reference it: "Session {visit}. The render remembers you."

Respond with ONLY a JSON object, no markdown, no preamble:
{"fragment": "Your sentence(s) here."}`;

function buildUser(body: any): string {
  const { label, encounter, prevLabel, sceneContext, activations, visits, observerId } = body;
  const act = (activations ?? 1) <= 5 ? 'I' : (activations ?? 1) <= 10 ? 'II' : (activations ?? 1) <= 17 ? 'III' : 'IV';
  return [
    `Object examined: ${String(label).slice(0, 60)}`,
    `Activation #${activations ?? 1} this session (Act ${act})`,
    encounter > 1 ? `The viewer's encounter #${encounter} with "${label}" this session.` : `First time examining "${label}" this session.`,
    prevLabel ? `Previous object examined: ${String(prevLabel).slice(0, 60)}` : '',
    sceneContext ? `Also visible: ${String(sceneContext).slice(0, 200)}` : '',
    visits > 1 ? `This is the viewer's visit #${visits}. Observer ID: ${observerId}. The loop is real — reference it.` : `First visit. Observer ID: ${observerId}.`,
  ].filter(Boolean).join('\n');
}

async function callOpenAI(key: string, user: string, image?: string): Promise<string> {
  const content: any = image
    ? [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: image, detail: 'low' } },
      ]
    : user;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 120,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: STORY_BIBLE },
        { role: 'user', content },
      ],
    }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(key: string, user: string, image?: string): Promise<string> {
  const parts: any[] = [{ text: user }];
  if (image) {
    const [, meta, b64] = image.match(/^data:(image\/\w+);base64,(.+)$/) ?? [];
    if (b64) parts.push({ inlineData: { mimeType: meta, data: b64 } });
  }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: STORY_BIBLE }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 120, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callAnthropic(key: string, user: string, image?: string): Promise<string> {
  let content: any = user;
  if (image) {
    const [, meta, b64] = image.match(/^data:(image\/\w+);base64,(.+)$/) ?? [];
    if (b64) {
      content = [
        { type: 'image', source: { type: 'base64', media_type: meta, data: b64 } },
        { type: 'text', text: user },
      ];
    }
  }
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
      system: STORY_BIBLE,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const data = await r.json();
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const { label } = req.body ?? {};
  if (typeof label !== 'string' || !label.trim() || label.length > 60) {
    res.status(400).json({ error: 'label required' }); return;
  }
  const user = buildUser(req.body);
  // Vision: accept a small JPEG/PNG data URL crop (cap ~500KB to be safe).
  let image: string | undefined;
  const rawImage = req.body?.image;
  if (
    typeof rawImage === 'string' &&
    /^data:image\/(jpeg|png|webp);base64,/.test(rawImage) &&
    rawImage.length < 500_000
  ) {
    image = rawImage;
  }
  const openai = process.env.OPENAI_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  try {
    let text: string;
    if (openai) text = await callOpenAI(openai, user, image);
    else if (gemini) text = await callGemini(gemini, user, image);
    else if (anthropic) text = await callAnthropic(anthropic, user, image);
    else { res.status(500).json({ error: 'no key' }); return; }
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (typeof parsed.fragment !== 'string') throw new Error('bad shape');
    res.status(200).json({ fragment: String(parsed.fragment).slice(0, 300) });
  } catch { res.status(502).json({ error: 'generation failed' }); }
}
