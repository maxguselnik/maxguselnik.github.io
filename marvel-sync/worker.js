// Синхронизация отметок для https://maxguselnik.github.io/marvel/
// GET  /p/CODE        -> {items:{id:{w:0|1,t:ms}}}
// POST /p/CODE (JSON) -> слияние по каждому фильму (новее t побеждает), ответ — итог
const ORIGINS = ['https://maxguselnik.github.io', 'http://localhost:8099', 'http://localhost:8080'];
const CODE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
const ID = /^[a-z0-9]{1,24}$/;
const MAX_ITEMS = 200;

function cors(req) {
  const origin = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) } });

function clean(items) {
  const out = {};
  if (!items || typeof items !== 'object' || Array.isArray(items)) return out;
  for (const [id, v] of Object.entries(items).slice(0, MAX_ITEMS)) {
    if (!ID.test(id) || !v || typeof v !== 'object') continue;
    const t = Number(v.t);
    if (!Number.isFinite(t) || t < 0) continue;
    out[id] = { w: v.w ? 1 : 0, t: Math.min(Math.round(t), Date.now() + 60_000) };
  }
  return out;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const m = new URL(req.url).pathname.match(/^\/p\/([^/]+)$/);
    if (!m || !CODE.test(m[1])) return json(req, { error: 'not_found' }, 404);
    const key = 'p:' + m[1];
    const stored = clean((await env.PROGRESS.get(key, 'json'))?.items);
    if (req.method === 'GET') return json(req, { items: stored });
    if (req.method !== 'POST') return json(req, { error: 'method' }, 405);
    const text = await req.text();
    if (text.length > 20_000) return json(req, { error: 'too_large' }, 413);
    let incoming;
    try { incoming = clean(JSON.parse(text).items); } catch { return json(req, { error: 'bad_json' }, 400); }
    const merged = { ...stored };
    for (const [id, v] of Object.entries(incoming)) if (!merged[id] || v.t > merged[id].t) merged[id] = v;
    if (JSON.stringify(merged) !== JSON.stringify(stored)) await env.PROGRESS.put(key, JSON.stringify({ items: merged, updated: Date.now() }));
    return json(req, { items: merged });
  },
};
