import { DurableObject } from 'cloudflare:workers';

// Маршрут: /ws/<КОД> — WebSocket комнаты. Всё остальное — статика из ./public.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/([A-Z0-9]{4})$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// Одна комната = один Durable Object. Хранит только "presence" подключённых
// игроков в памяти сокета (attachment) и рассылает всем текущий список.
// Ничего не пишет в базу; комната исчезает, когда все вышли.
const MAX_PEERS = 6;
const KEY_RE = /^[a-z]{1,3}$/;

export class Room extends DurableObject {
  async fetch() {
    if (this.ctx.getWebSockets().length >= MAX_PEERS) {
      return new Response('Room is full', { status: 429 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const id = crypto.randomUUID().slice(0, 8);
    server.serializeAttachment({ id, p: {}, u: Date.now() });
    server.send(JSON.stringify({ t: 'hello', id }));
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 4096) return;
    let d;
    try { d = JSON.parse(msg); } catch { return; }
    if (d && d.t === 'ping') { ws.send('{"t":"pong"}'); return; }
    if (!d || d.t !== 'p' || !d.d || typeof d.d !== 'object') return;
    const a = ws.deserializeAttachment() || { id: 'x', p: {} };
    const next = { ...a.p };
    for (const [k, v] of Object.entries(d.d)) {
      if (!KEY_RE.test(k)) continue;
      if (v === null) delete next[k];
      else if (['string', 'number', 'boolean'].includes(typeof v)) next[k] = v;
    }
    if (JSON.stringify(next).length > 2048) return;
    ws.serializeAttachment({ id: a.id, p: next, u: Date.now() });
    this.broadcast();
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {}
    this.broadcast(ws);
  }

  webSocketError(ws) { this.broadcast(ws); }

  broadcast(exclude) {
    const socks = this.ctx.getWebSockets().filter((s) => s !== exclude);
    const peers = socks.map((s) => s.deserializeAttachment()).filter(Boolean);
    const msg = JSON.stringify({ t: 'peers', peers });
    for (const s of socks) { try { s.send(msg); } catch {} }
  }
}
