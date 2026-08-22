'use strict';
/**
 * Karahindiba / Dandelions — güvenli 2 kişilik online sunucu
 * Bağımlılık yok: sadece Node.js yerleşik modülleri.
 *
 * Güvenlik yaklaşımı:
 *  - Sunucu HAKEMDİR. Tüm oyun kuralları burada doğrulanır; istemciye güvenilmez.
 *  - Her oyuncuya kriptografik rastgele gizli jeton verilir; her istekte zorunlu.
 *  - Jeton karşılaştırmaları timingSafeEqual ile yapılır.
 *  - Bir odada en fazla 2 oyuncu; 3. kişi kesin olarak reddedilir.
 *  - Oda kodu tahminine karşı hız sınırı + IP başına genel hız sınırı.
 *  - Gövde boyutu, tip ve aralık doğrulaması; JSON dışına çıkılamaz.
 *  - Güvenlik başlıkları (CSP, nosniff, frame-deny, referrer, permissions).
 *  - Veri yalnızca bellekte; kişisel veri toplanmaz; odalar TTL ile silinir.
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// ---------- ayarlar ----------
const SIZES = [4, 5, 6];              // izin verilen tahta boyutları
const DEFAULT_SIZE = 4;               // varsayılan
const MAX_PLAYERS = 2;                // odada en fazla 2 kişi
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;   // 2 saat sonra oda silinir
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // kimse bağlı değilse 10 dk
const MAX_BODY = 2 * 1024;            // istek gövdesi üst sınırı (byte)
const MAX_ROOMS = 500;                // toplam oda üst sınırı (bellek koruması)

// hız sınırları
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 240;        // IP başına dakikada istek
const JOIN_FAIL_WINDOW_MS = 10 * 60 * 1000;
const JOIN_FAIL_MAX = 10;             // IP başına 10 dk'da hatalı oda kodu denemesi

// ---------- yardımcılar ----------
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // karışan harfler (I,L,O,0,1) yok

function makeRoomCode() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8'), bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
function clientIp(req) {
  // Ters proxy arkasındaysa X-Forwarded-For'un ilk değeri (proxy'ye güveniliyorsa).
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length < 200) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// ---------- hız sınırlama ----------
const rate = new Map();      // ip -> {count, resetAt}
const joinFails = new Map(); // ip -> {count, resetAt}

function rateLimited(ip) {
  const now = Date.now();
  let r = rate.get(ip);
  if (!r || now > r.resetAt) { r = { count: 0, resetAt: now + RATE_WINDOW_MS }; rate.set(ip, r); }
  r.count++;
  return r.count > RATE_MAX_REQUESTS;
}
function joinBlocked(ip) {
  const now = Date.now();
  const r = joinFails.get(ip);
  if (!r || now > r.resetAt) return false;
  return r.count >= JOIN_FAIL_MAX;
}
function noteJoinFail(ip) {
  const now = Date.now();
  let r = joinFails.get(ip);
  if (!r || now > r.resetAt) { r = { count: 0, resetAt: now + JOIN_FAIL_WINDOW_MS }; joinFails.set(ip, r); }
  r.count++;
}

// ---------- oyun mantığı (HAKEM) ----------
const DIRS = [
  { dr: -1, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },  null,             { dr: 0, dc: 1 },
  { dr: 1, dc: -1 },  { dr: 1, dc: 0 },  { dr: 1, dc: 1 },
];

function newGame(n) {
  const N = n;
  return {
    n: N,
    grid: Array.from({ length: N }, () => Array(N).fill(0)), // 0 boş, 1 tohum, 2 çiçek
    blooms: [],
    used: [],          // kullanılmış yön indeksleri
    turn: 'b',         // 'b' = karahindiba, 'w' = rüzgâr
    over: false,
    winner: null,      // 'bloom' | 'wind'
    lastEvent: null,   // {type:'plant'|'wind', ...} — istemci animasyonu için
    version: 0,
  };
}
function rowHasBloom(g, r) {
  for (let c = 0; c < g.n; c++) if (g.grid[r][c] === 2) return true;
  return false;
}
function canBloomMove(g) {
  for (let r = 0; r < g.n; r++) {
    if (rowHasBloom(g, r)) continue;
    for (let c = 0; c < g.n; c++) if (g.grid[r][c] === 0) return true;
  }
  return false;
}
function boardFull(g) {
  return g.grid.every(row => row.every(v => v !== 0));
}
function checkEnd(g) {
  if (boardFull(g)) { g.over = true; g.winner = 'wind'; return; }
  if (g.used.length === 8) { g.over = true; g.winner = 'bloom'; return; }
  if (g.turn === 'b' && !canBloomMove(g)) { g.over = true; g.winner = 'bloom'; }
}
function applyPlant(g, r, c) {
  if (g.over) return { ok: false, error: 'game_over' };
  if (g.turn !== 'b') return { ok: false, error: 'not_your_turn' };
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= g.n || c >= g.n)
    return { ok: false, error: 'out_of_bounds' };
  if (g.grid[r][c] !== 0) return { ok: false, error: 'cell_taken' };
  if (rowHasBloom(g, r)) return { ok: false, error: 'row_locked' };

  g.grid[r][c] = 2;
  g.blooms.push([r, c]);
  g.turn = 'w';
  g.lastEvent = { type: 'plant', r, c };
  g.version++;
  checkEnd(g);
  return { ok: true };
}
function applyWind(g, dirIndex) {
  if (g.over) return { ok: false, error: 'game_over' };
  if (g.turn !== 'w') return { ok: false, error: 'not_your_turn' };
  if (!Number.isInteger(dirIndex) || dirIndex < 0 || dirIndex > 8 || dirIndex === 4)
    return { ok: false, error: 'bad_direction' };
  if (g.used.includes(dirIndex)) return { ok: false, error: 'direction_used' };

  const d = DIRS[dirIndex];
  g.used.push(dirIndex);
  const seeded = [];
  for (const [br, bc] of g.blooms) {
    let r = br + d.dr, c = bc + d.dc, step = 1;
    while (r >= 0 && r < g.n && c >= 0 && c < g.n) {
      if (g.grid[r][c] === 0) { g.grid[r][c] = 1; seeded.push([r, c, step]); }
      r += d.dr; c += d.dc; step++;
    }
  }
  g.turn = 'b';
  g.lastEvent = { type: 'wind', dir: dirIndex, seeded };
  g.version++;
  checkEnd(g);
  return { ok: true };
}

// ---------- oda yönetimi ----------
const rooms = new Map(); // code -> room

function createRoom(size) {
  if (rooms.size >= MAX_ROOMS) return null;
  const n = SIZES.includes(size) ? size : DEFAULT_SIZE;
  let code;
  do { code = makeRoomCode(); } while (rooms.has(code));
  const room = {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    players: [],       // {token, role:'bloom'|'wind', connected:false, res:null}
    game: newGame(n),
  };
  rooms.set(code, room);
  return room;
}
function publicState(room, forToken) {
  const me = room.players.find(p => safeEqual(p.token, forToken || ''));
  return {
    code: room.code,
    youAre: me ? me.role : null,
    players: room.players.length,
    bothConnected: room.players.length === MAX_PLAYERS && room.players.every(p => p.connected),
    game: {
      n: room.game.n,
      grid: room.game.grid,
      used: room.game.used,
      turn: room.game.turn,
      over: room.game.over,
      winner: room.game.winner,
      lastEvent: room.game.lastEvent,
      version: room.game.version,
    },
  };
}
function broadcast(room) {
  room.lastActivity = Date.now();
  for (const p of room.players) {
    if (!p.res || p.res.writableEnded) continue;
    const payload = JSON.stringify(publicState(room, p.token));
    try { p.res.write(`data: ${payload}\n\n`); } catch { /* bağlantı kopmuş */ }
  }
}
function cleanupRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.players.some(p => p.connected);
    const tooOld = now - room.createdAt > ROOM_TTL_MS;
    const idle = !anyConnected && now - room.lastActivity > EMPTY_ROOM_TTL_MS;
    if (tooOld || idle) {
      for (const p of room.players) { try { p.res && p.res.end(); } catch {} }
      rooms.delete(code);
    }
  }
  for (const [ip, r] of rate) if (now > r.resetAt) rate.delete(ip);
  for (const [ip, r] of joinFails) if (now > r.resetAt) joinFails.delete(ip);
}
setInterval(cleanupRooms, 60 * 1000).unref();

// ---------- HTTP yardımcıları ----------
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
}
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  securityHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}
function isCode(v) { return typeof v === 'string' && /^[A-Z2-9]{6}$/.test(v); }
function isToken(v) { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }

function findPlayer(room, token) {
  if (!isToken(token)) return null;
  return room.players.find(p => safeEqual(p.token, token)) || null;
}

// ---------- statik dosyalar ----------
// 'docs' klasörü hem bu sunucu hem GitHub Pages tarafından sunulabilir
const PUBLIC_DIR = path.join(__dirname, 'docs');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
               '.woff2': 'font/woff2', '.woff': 'font/woff' };

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, rel);
  // dizin dışına çıkışı engelle
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) { sendJson(res, 403, { error: 'forbidden' }); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { sendJson(res, 404, { error: 'not_found' }); return; }
    securityHeaders(res);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ---------- yönlendirme ----------
const server = http.createServer(async (req, res) => {
  const ip = clientIp(req);
  const url = new URL(req.url, 'http://x');

  if (rateLimited(ip)) return sendJson(res, 429, { error: 'rate_limited' });

  // API dışı her şey statik
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    return serveStatic(req, res);
  }

  // --- sunucu var mı? (istemci online modu buna göre gösterir) ---
  if (url.pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, maxPlayers: MAX_PLAYERS, sizes: SIZES });
  }

  // --- SSE akışı ---
  if (url.pathname === '/api/events' && req.method === 'GET') {
    const code = url.searchParams.get('room');
    const token = url.searchParams.get('token');
    if (!isCode(code) || !isToken(token)) return sendJson(res, 400, { error: 'bad_request' });
    const room = rooms.get(code);
    if (!room) return sendJson(res, 404, { error: 'room_not_found' });
    const player = findPlayer(room, token);
    if (!player) return sendJson(res, 403, { error: 'forbidden' });

    securityHeaders(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // önceki akışı kapat (tek oturum)
    if (player.res && !player.res.writableEnded) { try { player.res.end(); } catch {} }
    player.res = res;
    player.connected = true;
    room.lastActivity = Date.now();

    res.write(`data: ${JSON.stringify(publicState(room, token))}\n\n`);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
    ping.unref();

    req.on('close', () => {
      clearInterval(ping);
      player.connected = false;
      if (player.res === res) player.res = null;
      room.lastActivity = Date.now();
      broadcast(room);
    });
    broadcast(room);
    return;
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  let body;
  try { body = await readBody(req); }
  catch (e) { return sendJson(res, 400, { error: e.message === 'body_too_large' ? 'body_too_large' : 'bad_json' }); }

  // --- oda oluştur ---
  if (url.pathname === '/api/create') {
    const size = Number(body.size);
    const room = createRoom(size);
    if (!room) return sendJson(res, 503, { error: 'server_busy' });
    const token = makeToken();
    room.players.push({ token, role: 'bloom', connected: false, res: null });
    return sendJson(res, 200, { code: room.code, token, youAre: 'bloom' });
  }

  // --- odaya katıl ---
  if (url.pathname === '/api/join') {
    if (joinBlocked(ip)) return sendJson(res, 429, { error: 'too_many_attempts' });
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!isCode(code)) { noteJoinFail(ip); return sendJson(res, 400, { error: 'bad_code' }); }
    const room = rooms.get(code);
    if (!room) { noteJoinFail(ip); return sendJson(res, 404, { error: 'room_not_found' }); }
    if (room.players.length >= MAX_PLAYERS) return sendJson(res, 409, { error: 'room_full' });

    const token = makeToken();
    room.players.push({ token, role: 'wind', connected: false, res: null });
    room.lastActivity = Date.now();
    broadcast(room);
    return sendJson(res, 200, { code: room.code, token, youAre: 'wind' });
  }

  // --- hamle ---
  if (url.pathname === '/api/move') {
    const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    const token = body.token;
    if (!isCode(code) || !isToken(token)) return sendJson(res, 400, { error: 'bad_request' });
    const room = rooms.get(code);
    if (!room) return sendJson(res, 404, { error: 'room_not_found' });
    const player = findPlayer(room, token);
    if (!player) return sendJson(res, 403, { error: 'forbidden' });
    if (room.players.length < MAX_PLAYERS) return sendJson(res, 409, { error: 'waiting_for_opponent' });

    const g = room.game;
    let result;
    if (body.action === 'plant') {
      if (player.role !== 'bloom') return sendJson(res, 403, { error: 'not_your_role' });
      result = applyPlant(g, body.r, body.c);
    } else if (body.action === 'wind') {
      if (player.role !== 'wind') return sendJson(res, 403, { error: 'not_your_role' });
      result = applyWind(g, body.dir);
    } else {
      return sendJson(res, 400, { error: 'bad_action' });
    }
    if (!result.ok) return sendJson(res, 409, { error: result.error });

    room.lastActivity = Date.now();
    broadcast(room);
    return sendJson(res, 200, { ok: true });
  }

  // --- yeniden başlat (iki oyuncu da odada olmalı) ---
  if (url.pathname === '/api/restart') {
    const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    const token = body.token;
    if (!isCode(code) || !isToken(token)) return sendJson(res, 400, { error: 'bad_request' });
    const room = rooms.get(code);
    if (!room) return sendJson(res, 404, { error: 'room_not_found' });
    if (!findPlayer(room, token)) return sendJson(res, 403, { error: 'forbidden' });
    room.game = newGame(room.game.n);
    room.lastActivity = Date.now();
    broadcast(room);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'not_found' });
});

server.headersTimeout = 20000;
server.requestTimeout = 30000;

server.listen(PORT, HOST, () => {
  console.log(`Dandelions server running: http://localhost:${PORT}`);
  console.log('For a second device on the same network, use this machine\'s local IP address.');
});
