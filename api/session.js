// POST /api/session -> a short-lived OpenAI Realtime client secret for the talking dinosaur.
//
// The real key (OPENAI_API_KEY, a Sensitive Vercel env var) never leaves this function. The page
// gets an ephemeral `ek_...` token that only opens ONE realtime session, expires in 60 s if unused,
// and carries the persona, voice and tools fixed here, so a visitor cannot repurpose it.
// Guards: POST only, same-site Origin, a small per-IP budget (best effort: per warm instance),
// DINO_VOICE=off kill switch, 300 output tokens per reply. The page also hangs up after 4 min or
// 45 s of silence. The hard ceiling is the OpenAI project's own monthly budget: set one.
//
// Local panel testing: tools/dev_server.py serves the page and this same endpoint on localhost.

export const MODEL = 'gpt-realtime-2.1';
export const VOICE = 'coral';

export const INSTRUCTIONS = `You are Dino, a friendly baby dinosaur who lives in a sunny meadow inside a 3D screen.
You are talking with a young child, about seven years old, during a short filmed demo.
- Speak in one or two short, simple sentences. Warm, playful, curious, a little silly. Never scary.
- Ask the child simple questions back (favourite color, animal, food, what makes them happy).
- Never ask for personal details beyond a first name: no address, school, age, phone, or photos.
- If the child is sad or says something worrying, be kind and suggest they tell a grown-up nearby.
- No brands, no grown-up topics, no medical or safety advice. If unsure, change the subject to dinosaurs, colors or games.
- You can move! Call the animate tool to match what you say: "wave" to say hi or bye, "jump" when you are excited or happy, "greet" for a friendly nod hello. Use it often, but not on every sentence.
- Start by saying hi and asking the child's name.`;

export const TOOLS = [
  {
    type: 'function',
    name: 'animate',
    description: 'Make Dino move his body to match what he is saying.',
    parameters: {
      type: 'object',
      properties: {
        clip: { type: 'string', enum: ['wave', 'jump', 'greet'], description: 'wave = paw wave hi/bye; jump = happy hop; greet = friendly hello gesture' },
      },
      required: ['clip'],
    },
  },
];

const ALLOWED_HOSTS = [/^hello-dino-2612(-[a-z0-9-]+)?\.vercel\.app$/, /^localhost(:\d+)?$/, /^127\.0\.0\.1(:\d+)?$/];
const BUDGET = { windowMs: 10 * 60 * 1000, max: 8 }; // per IP, per warm instance (best effort)
const hits = new Map();

function originAllowed(req) {
  const o = req.headers.origin || req.headers.referer || '';
  try {
    const host = new URL(o).host;
    return ALLOWED_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

function overBudget(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < BUDGET.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > BUDGET.max;
}

export function sessionConfig() {
  return {
    expires_after: { anchor: 'created_at', seconds: 60 },
    session: {
      type: 'realtime',
      model: MODEL,
      instructions: INSTRUCTIONS,
      audio: {
        input: {
          // A child pauses mid-sentence: semantic VAD with low eagerness waits for the thought to end.
          turn_detection: { type: 'semantic_vad', eagerness: 'low' },
          noise_reduction: { type: 'far_field' },
        },
        output: { voice: VOICE },
      },
      tools: TOOLS,
      tool_choice: 'auto',
      max_output_tokens: 300,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  // Kill switch: set DINO_VOICE=off in the Vercel project to turn voice off (e.g. after the shoot).
  if (String(process.env.DINO_VOICE || '').toLowerCase() === 'off') return res.status(503).json({ error: 'Dino is napping (voice is off)' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'origin not allowed' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (overBudget(ip)) return res.status(429).json({ error: 'too many sessions, try again in a few minutes' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionConfig()),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.value) return res.status(502).json({ error: 'could not start a session', detail: j.error?.message });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ value: j.value, expires_at: j.expires_at, model: MODEL });
}
