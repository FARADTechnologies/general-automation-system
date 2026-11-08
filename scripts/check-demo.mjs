// Pre-demo check against a running deployment.
//   node scripts/check-demo.mjs https://<public-host>
// Checks health of every service, the app and stage routes, the WebSocket hub, and one
// read-only assistant turn on a fresh session (which also warms the prompt cache).
const base = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '');
const results = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { const detail = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, detail }); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, detail: String(e.message || e) }); }
};

await check('health (gateway, agent, bridge, core bank)', async () => {
  const r = await fetch(base + '/health'); const j = await r.json();
  if (!j.ok) throw new Error(JSON.stringify(j)); return j;
});
for (const p of ['/app?s=check', '/stage?s=check', '/console']) {
  await check(`page ${p}`, async () => { const r = await fetch(base + p); if (r.status !== 200) throw new Error(String(r.status)); return r.status; });
}
await check('internal APIs are not exposed', async () => {
  const r = await fetch(base + '/mcp', { method: 'POST' });
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('json') || ct.includes('event-stream')) throw new Error('MCP reachable from outside');
  return r.status;
});
const session = 'check-' + Math.random().toString(36).slice(2, 7);
await check('websocket hub snapshot', () => new Promise((res, rej) => {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws?s=' + session);
  const t = setTimeout(() => { ws.close(); rej(new Error('no snapshot in 5 s')); }, 5000);
  ws.onmessage = (m) => { const e = JSON.parse(m.data); if (e.type === 'session.snapshot') { clearTimeout(t); ws.close(); res('ok'); } };
  ws.onerror = () => { clearTimeout(t); rej(new Error('ws error')); };
}));
await check('assistant turn (read only, warms cache)', async () => {
  const r = await fetch(`${base}/api/agent/sessions/${session}/input?wait=1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: "What's my balance?" }) });
  const j = await r.json();
  if (!r.ok || !j.text) throw new Error(JSON.stringify(j).slice(0, 200));
  if (j.latencyMs > 12000) throw new Error(`slow: ${j.latencyMs} ms`);
  return `${j.latencyMs} ms, $${j.costUsd.toFixed(4)}: ${j.text.slice(0, 80)}`;
});
await check('session reset', async () => { const r = await fetch(`${base}/api/agent/sessions/${session}/reset`, { method: 'POST' }); if (!r.ok) throw new Error(String(r.status)); return 'ok'; });

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms} ms)  ${typeof r.detail === 'string' ? r.detail : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
