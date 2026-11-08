// Test harness: Core Bank and Bridge on their own ephemeral ports, plus an MCP client
// that plays the agent. Nothing here bypasses HTTP.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createCoreBankApp } from '../services/core-bank/src/server.ts';
import { createBridge } from '../services/bridge/src/server.ts';

export const ROOT = resolve(import.meta.dirname, '..');

const listen = (app: { listen: (port: number, host: string, cb: () => void) => Server }) =>
  new Promise<{ server: Server; url: string }>((res) => {
    const server = app.listen(0, '127.0.0.1', () => res({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });

export async function startStack(opts: { manifestDirs?: string[]; webhook?: (e: unknown) => void } = {}) {
  const keys = { core: 'core-test-key-123456', agent: 'agent-test-key-123456', admin: 'admin-test-key-123456' };
  let clock = Date.now();
  const core = createCoreBankApp({ serviceKey: keys.core });
  const coreSrv = await listen(core.app);
  const bridge = createBridge({
    manifestDirs: opts.manifestDirs || [resolve(ROOT, 'domains/bank/manifest')],
    policyPath: resolve(ROOT, 'domains/bank/policy.yaml'),
    coreBankUrl: coreSrv.url, coreBankKey: keys.core, agentKey: keys.agent, adminKey: keys.admin,
    now: () => clock,
  });
  const bridgeSrv = await listen(bridge.app);

  const clients: Client[] = [];
  async function mcp(session: string) {
    const transport = new StreamableHTTPClientTransport(new URL(bridgeSrv.url + '/mcp'), {
      requestInit: { headers: { authorization: `Bearer ${keys.agent}`, 'x-session-id': session } },
    });
    const client = new Client({ name: 'test-agent', version: '0.0.0' });
    await client.connect(transport);
    clients.push(client);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
      const body = JSON.parse(r.content[0].text);
      return { isError: !!r.isError, body, text: r.content[0].text };
    };
    return { client, call };
  }

  async function device(session: string) {
    const r = await fetch(bridgeSrv.url + '/bridge/device/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session }) });
    const c = (r.headers.get('set-cookie') || '').split(';')[0];
    const get = (id: string) => fetch(`${bridgeSrv.url}/bridge/confirm/${id}`, { headers: { cookie: c } });
    const post = (id: string, body: unknown, cookieOverride?: string) => fetch(`${bridgeSrv.url}/bridge/confirm/${id}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieOverride ?? c }, body: JSON.stringify(body) });
    return { cookie: c, get, post };
  }

  const coreGet = async (path: string) => (await fetch(coreSrv.url + path, { headers: { 'x-cb-svc-key': keys.core } })).json();
  const custOf = async (session: string) => (await (await fetch(coreSrv.url + '/internal/v3/cust/rslv', { method: 'POST', headers: { 'x-cb-svc-key': keys.core, 'content-type': 'application/json' }, body: JSON.stringify({ ext_ref: session }) })).json()).cust_id as string;

  return {
    keys, core, bridge, coreUrl: coreSrv.url, bridgeUrl: bridgeSrv.url, mcp, device, coreGet, custOf,
    advance: (ms: number) => { clock += ms; },
    close: async () => { for (const c of clients) await c.close().catch(() => undefined); bridge.close(); coreSrv.server.close(); bridgeSrv.server.close(); },
  };
}

export type Stack = Awaited<ReturnType<typeof startStack>>;
