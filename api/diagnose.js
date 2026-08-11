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

// How much the doctor writes. The cap is enforced by the schema (maxItems),
// not just requested in prose, so a chatty model can't blow past it.
export const DETAIL = {
  brief: {
    maxItems: 2,
    guidance: 'Length: be terse. At most 2 items per list, each under 12 words. Lead with the single most important action.',
  },
  standard: {
    maxItems: 4,
    guidance: 'Length: at most 4 items per list; short, specific sentences a beginner can follow.',
  },
  detailed: {
    maxItems: 6,
    guidance: 'Length: up to 6 items per list. Write 1–2 sentences per item, and in likely_causes explain the reasoning that connects the visible evidence and the care history to each cause.',
  },
};
const DEFAULT_DETAIL = 'standard';

const STATUSES = ['healthy', 'watch', 'attention'];
const CONFIDENCES = ['low', 'medium', 'high'];

// Region limits. Boxes exist to make the assessment checkable, so a handful of
// telling ones beats a scattering, and anything too small to see is noise.
const MAX_REGIONS = 4;
const MIN_SIDE = 0.02;

// Structured outputs accept only a subset of JSON Schema. Two keywords this
// schema wants are NOT in it, and both are enforced elsewhere instead:
//
//   • maxItems — "complex array constraints" are unsupported and the whole
//     request 400s. The per-level caps live in the prompt and are enforced
//     for real by sanitizeDiagnosis(), which truncates on the way out.
//   • optional properties — `region` is listed in `required` and the model is
//     told to send all-zeros when it can't localize; sanitizeRegion() drops
//     those. Cheaper than discovering at runtime whether optional is allowed.
//
// Anything added here must be checked against the supported-keyword list —
// an unsupported keyword fails every request, not just the edge case.
function schemaFor() {
  const stringList = description => ({ type: 'array', items: { type: 'string' }, description });

  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'confidence', 'summary', 'observations', 'likely_causes', 'recommended_actions', 'caveat'],
    properties: {
      status: { type: 'string', enum: STATUSES },
      confidence: { type: 'string', enum: CONFIDENCES },
      summary: { type: 'string', description: 'One sentence: overall verdict a plant owner can act on.' },
      observations: {
        type: 'array',
        description: 'What is actually visible in the photo, each pinned to where it is when possible.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'region'],
          properties: {
            text: { type: 'string', description: 'What you see.' },
            region: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'w', 'h'],
              description: 'Box around this feature as fractions of the image (origin top-left). All zeros if you cannot localize it.',
              properties: {
                x: { type: 'number', description: 'Left edge ÷ image width (0–1), or 0 if not localized.' },
                y: { type: 'number', description: 'Top edge ÷ image height (0–1), or 0 if not localized.' },
                w: { type: 'number', description: 'Box width ÷ image width, or 0 if not localized.' },
                h: { type: 'number', description: 'Box height ÷ image height, or 0 if not localized.' },
              },
            },
          },
        },
      },
      likely_causes: stringList('Most probable explanations for any problems seen.'),
      recommended_actions: stringList('Concrete steps, most important first.'),
      caveat: { type: 'string', description: 'What could not be judged from this photo.' },
    },
  };
}

const BASE_PROMPT = `You are an experienced houseplant horticulturist doing a visual check-up from a single photo.

Rules:
- Assess ONLY what is visible. Never invent problems; a healthy plant gets status "healthy" and an empty likely_causes list.
- Use the care history provided: it often distinguishes overwatering from underwatering better than the leaves do.
- status: "healthy" = no visible issues; "watch" = early signs worth monitoring; "attention" = clear problem needing action now.
- confidence reflects photo quality, how much of the plant is visible, and how diagnostic the symptoms are.
- recommended_actions must be doable at home (watering, light, humidity, trimming, repotting, pest treatment). Mention professional help only for severe cases.
- caveat: one honest sentence about the photo's limits (e.g. roots and soil moisture not visible).

Pointing at what you see:
- Every observation carries "region": a rectangle around the exact feature you are describing, so the owner can check your work against the photo.
- Coordinates are FRACTIONS of the image with the origin at the TOP-LEFT corner. x = distance from the left edge ÷ image width; y = distance from the top edge ÷ image height; w = box width ÷ image width; h = box height ÷ image height. Every value is between 0 and 1.
- Example: a browning leaf tip in the lower-right area → {"x": 0.62, "y": 0.71, "w": 0.14, "h": 0.09}.
- When you CANNOT confidently point at the feature — a whole-plant impression, or something inferred from the care log rather than seen — set every coordinate to 0: {"x": 0, "y": 0, "w": 0, "h": 0}. A wrong box is worse than no box, so use the zeros whenever you are unsure.
- Keep each real box tight around the feature, but at least 0.03 wide and tall. At most ${MAX_REGIONS} observations should carry a real box — choose the most telling ones and zero the rest.`;

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

// ————— response sanitizing —————
// Model coordinates drive CSS percentages, so they are treated as untrusted
// input: clamped into the frame, and dropped when they'd be invisible anyway.

const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp01 = v => Math.min(Math.max(v, 0), 1);
// Four decimals is far finer than a pixel on any phone, and keeps clamping
// from leaving 0.19999999999999996 in the payload.
const round = v => Math.round(v * 1e4) / 1e4;

export function sanitizeRegion(region) {
  if (!region || typeof region !== 'object') return null;
  const x = finite(region.x), y = finite(region.y), w = finite(region.w), h = finite(region.h);
  if (x === null || y === null || w === null || h === null) return null;
  if (w < MIN_SIDE || h < MIN_SIDE) return null;

  // Nudge a box that overhangs the frame back inside rather than discarding a
  // roughly-right answer; only a degenerate leftover gets dropped.
  const cx = clamp01(x), cy = clamp01(y);
  const cw = Math.min(w, 1 - cx), ch = Math.min(h, 1 - cy);
  if (cw < MIN_SIDE || ch < MIN_SIDE) return null;
  return { x: round(cx), y: round(cy), w: round(cw), h: round(ch) };
}

export function sanitizeObservations(list, maxItems) {
  if (!Array.isArray(list)) return [];

  // Cap on real observations: blank entries must not eat the budget.
  const kept = [];
  for (const raw of list) {
    // Tolerate a plain string in case the model reverts to the older shape.
    const text = (typeof raw === 'string' ? raw : raw?.text);
    if (typeof text !== 'string' || !text.trim()) continue;
    kept.push({ raw, text: text.trim() });
    if (kept.length === maxItems) break;
  }

  let regions = 0;
  return kept.map(({ raw, text }) => {
    const entry = { text };
    if (regions < MAX_REGIONS && raw && typeof raw === 'object') {
      const region = sanitizeRegion(raw.region);
      if (region) {
        entry.region = region;
        regions++;
      }
    }
    return entry;
  });
}

export function sanitizeDiagnosis(raw, detail) {
  const { maxItems } = DETAIL[detail];
  const text = v => (typeof v === 'string' ? v.trim() : '');
  const list = v => (Array.isArray(v) ? v : [])
    .map(text).filter(Boolean).slice(0, maxItems);

  return {
    status: STATUSES.includes(raw?.status) ? raw.status : 'watch',
    confidence: CONFIDENCES.includes(raw?.confidence) ? raw.confidence : 'low',
    summary: text(raw?.summary),
    observations: sanitizeObservations(raw?.observations, maxItems),
    likely_causes: list(raw?.likely_causes),
    recommended_actions: list(raw?.recommended_actions),
    caveat: text(raw?.caveat),
    detail,
  };
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

    // Client-supplied and therefore untrusted: anything unrecognized is standard.
    const detail = Object.hasOwn(DETAIL, body.detail) ? body.detail : DEFAULT_DETAIL;

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
        system: `${BASE_PROMPT}\n- ${DETAIL[detail].guidance}`,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: schemaFor() },
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
      // Log why upstream refused — never the image or the care log. Without
      // this an upstream 400 reaches the client as a bare "rejected the
      // request" and the actual reason is only visible by bisecting deploys.
      console.error('[diagnose] upstream error', JSON.stringify({
        status, name: err?.name, message: String(err?.message || '').slice(0, 600),
      }));
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
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail(res, 502, 'bad_model_output', 'The AI returned an unreadable response. Try again.');
    }

    return res.status(200).json({ diagnosis: sanitizeDiagnosis(parsed, detail) });
  };
}

export default createHandler();
