// Production gateway: one public HTTPS origin (TLS terminated by the host) for phone and stage.
// Serves the built web client and routes to the separate internal services.
// The browser reaches the bank app's own API and the Bridge's confirmation routes, never the
// Core Bank's internal API or the Bridge's MCP and admin routes.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import httpProxy from 'http-proxy';

const PORT = Number(process.env.PORT || 8080);
const DIST = resolve(process.env.WEB_DIST || 'apps/web/dist');
const AGENT = process.env.AGENT_ORIGIN || 'http://127.0.0.1:4300';
const BRIDGE = process.env.BRIDGE_ORIGIN || 'http://127.0.0.1:4200';
const APP_API = process.env.APP_API_ORIGIN || 'http://127.0.0.1:4100';

const proxy = httpProxy.createProxyServer({ xfwd: true, ws: true, proxyTimeout: 130_000 });
proxy.on('error', (_err, _req, res) => {
  if (res && 'writeHead' in res && !res.headersSent) { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"error":"upstream unavailable"}'); }
  else if (res && 'destroy' in res) res.destroy();
});

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'microphone=(self), camera=(), geolocation=()',
};

// simple per-IP request budget, so one client cannot flood the services
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, at: now };
  if (now - h.at > 60_000) { h.n = 0; h.at = now; }
  h.n += 1;
  hits.set(ip, h);
  return h.n <= 600;
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(DIST, p);
  if (!file.startsWith(DIST)) { res.writeHead(400); res.end(); return; }
  if (!p || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html'); // SPA routes: /app, /stage
  const ext = extname(file);
  res.writeHead(200, {
    ...SECURITY,
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
}

function route(pathname) {
  if (pathname === '/api/agent' || pathname.startsWith('/api/agent/')) return AGENT;
  if (pathname.startsWith('/bridge/')) return BRIDGE;
  if (pathname.startsWith('/app-api/')) return APP_API;
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    const check = async (u) => { try { const r = await fetch(u + '/health', { signal: AbortSignal.timeout(2000) }); return r.ok; } catch { return false; } };
    const [agent, bridge, core] = await Promise.all([check(AGENT), check(BRIDGE), check(APP_API)]);
    const ok = agent && bridge && core;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok, agent, bridge, coreBank: core, web: existsSync(join(DIST, 'index.html')) }));
    return;
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!allowed(ip)) { res.writeHead(429); res.end(); return; }
  const target = route(url.pathname);
  if (target) { proxy.web(req, res, { target }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  proxy.ws(req, socket, head, { target: AGENT });
});

server.listen(PORT, '0.0.0.0', () => console.log(`gateway listening on ${PORT}`));
