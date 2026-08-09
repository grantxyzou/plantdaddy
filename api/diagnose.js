// AI photo diagnosis — PlantDaddy's only server-side code.
//
// The client POSTs a compressed plant photo plus care context; this function
// asks Claude for a structured visual assessment and relays it. The API key
// lives exclusively in the ANTHROPIC_API_KEY env var (Vercel dashboard) —
// without it the endpoint answers 501 and the app degrades gracefully.
//
// Exported as a factory so tests can inject a fake Anthropic client; the real
// SDK is imported dynamically only when no client is injected, which keeps
// `node --test` runnable without node_modules.

const MAX_BASE64_CHARS = 5_400_000; // ≈ 4 MB decoded; client sends ~200–670 KB
const MODEL = 'claude-opus-5';

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'confidence', 'summary', 'observations', 'likely_causes', 'recommended_actions', 'caveat'],
  properties: {
    status: { type: 'string', enum: ['healthy', 'watch', 'attention'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: { type: 'string', description: 'One sentence: overall verdict a plant owner can act on.' },
    observations: { type: 'array', items: { type: 'string' }, description: 'What is actually visible in the photo.' },
    likely_causes: { type: 'array', items: { type: 'string' }, description: 'Most probable explanations for any problems seen.' },
    recommended_actions: { type: 'array', items: { type: 'string' }, description: 'Concrete steps, most important first.' },
    caveat: { type: 'string', description: 'What could not be judged from this photo.' },
  },
};

const SYSTEM_PROMPT = `You are an experienced houseplant horticulturist doing a visual check-up from a single photo.

Rules:
- Assess ONLY what is visible. Never invent problems; a healthy plant gets status "healthy" and an empty likely_causes list.
- Use the care history provided: it often distinguishes overwatering from underwatering better than the leaves do.
- status: "healthy" = no visible issues; "watch" = early signs worth monitoring; "attention" = clear problem needing action now.
- confidence reflects photo quality, how much of the plant is visible, and how diagnostic the symptoms are.
- Keep observations, likely_causes and recommended_actions to at most 4 items each; short, specific sentences a beginner can follow.
- recommended_actions must be doable at home (watering, light, humidity, trimming, repotting, pest treatment). Mention professional help only for severe cases.
- caveat: one honest sentence about the photo's limits (e.g. roots and soil moisture not visible).`;

function careContext(plant = {}, cadence = {}, currentHealth = null, recentLogs = []) {
  const lines = [
    `Plant: ${plant.latinName || 'unknown species'} (${plant.commonName || 'houseplant'})`,
    plant.light?.level ? `Light situation: ${plant.light.level}${plant.light.notes ? ` — ${plant.light.notes}` : ''}` : null,
    cadence.min ? `Watering cadence: every ${cadence.min}–${cadence.max} days` : null,
    plant.humidity ? `Humidity preference: ${plant.humidity}` : null,
    plant.soil?.type ? `Soil: ${plant.soil.type}` : null,
    plant.potType ? `Pot: ${plant.potType}` : null,
    currentHealth ? `Owner's current assessment: ${currentHealth.status}${currentHealth.note ? ` — ${currentHealth.note}` : ''}` : null,
  ].filter(Boolean);

  if (Array.isArray(recentLogs) && recentLogs.length) {
    lines.push('', 'Recent care log (newest first):');
    for (const log of recentLogs.slice(0, 20)) {
      const when = log.ts ? new Date(log.ts).toISOString().slice(0, 10) : '?';
      const detail = [log.status, log.method, log.note].filter(Boolean).join(' · ');
      lines.push(`- ${when} ${log.type}${detail ? `: ${detail}` : ''}`);
    }
  }

  lines.push('', 'Assess the plant in the photo. Respond with the structured diagnosis.');
  return lines.join('\n');
}

function fail(res, httpStatus, code, message) {
  return res.status(httpStatus).json({ error: { code, message } });
}

export function createHandler({ getClient } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'POST only.');

    const body = req.body;
    if (!body || typeof body !== 'object') return fail(res, 400, 'bad_request', 'JSON body required.');

    const { image, plant, cadence, currentHealth, recentLogs } = body;
    if (typeof image !== 'string' || image.length < 100) {
      return fail(res, 400, 'bad_request', 'Field "image" must be a base64-encoded JPEG.');
    }
    if (image.length > MAX_BASE64_CHARS) return fail(res, 413, 'too_large', 'Image too large (4 MB max).');

    if (!getClient && !process.env.ANTHROPIC_API_KEY) {
      return fail(res, 501, 'not_configured', 'AI diagnosis is not configured on this deployment (missing ANTHROPIC_API_KEY).');
    }

    let client;
    if (getClient) {
      client = await getClient();
    } else {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      client = new Anthropic({ maxRetries: 1, timeout: 45_000 });
    }

    let msg;
    try {
      msg = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: DIAGNOSIS_SCHEMA },
        },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: careContext(plant, cadence, currentHealth, recentLogs) },
          ],
        }],
      });
    } catch (err) {
      // Duck-typed on the SDK's error shape so the error path never needs the import.
      const status = typeof err?.status === 'number' ? err.status : null;
      if (status === 429) {
        const retryAfter = err.headers?.get?.('retry-after') ?? err.headers?.['retry-after'];
        if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
        return fail(res, 429, 'rate_limited', 'The AI service is rate-limiting requests. Try again in a minute.');
      }
      if (status !== null && status >= 500) return fail(res, 503, 'overloaded', 'The AI service is overloaded. Try again shortly.');
      if (status === null || /timeout|connection/i.test(err?.name || '')) {
        return fail(res, 504, 'upstream_timeout', 'The AI service did not answer in time. Try again.');
      }
      return fail(res, 502, 'upstream', 'The AI service rejected the request.');
    }

    if (msg.stop_reason === 'refusal') {
      return fail(res, 422, 'refused', 'The AI declined to analyze this image.');
    }
    if (msg.stop_reason === 'max_tokens') {
      return fail(res, 502, 'bad_model_output', 'The AI response was cut short. Try again.');
    }

    const text = msg.content?.find(b => b.type === 'text')?.text;
    let diagnosis;
    try {
      diagnosis = JSON.parse(text);
    } catch {
      return fail(res, 502, 'bad_model_output', 'The AI returned an unreadable response. Try again.');
    }

    return res.status(200).json({ diagnosis });
  };
}

export default createHandler();
