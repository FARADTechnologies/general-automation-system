import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '@gas/shared/env';
import { createBridge } from './server.ts';

loadEnv();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const port = Number(process.env.BRIDGE_PORT || 4200);
const { app } = createBridge({
  manifestDirs: [resolve(root, 'domains/bank/manifest')],
  optionalDirs: [resolve(root, 'domains/bank/manifest-optional')],
  consolePasscode: process.env.BRIDGE_CONSOLE_PASSCODE || '',
  policyPath: resolve(root, 'domains/bank/policy.yaml'),
  coreBankUrl: process.env.CORE_BANK_URL || 'http://127.0.0.1:4100',
  coreBankKey: process.env.CORE_BANK_SERVICE_KEY || '',
  agentKey: process.env.BRIDGE_AGENT_KEY || '',
  adminKey: process.env.BRIDGE_ADMIN_KEY || '',
  webhookUrl: process.env.AGENT_WEBHOOK_URL,
  webhookSecret: process.env.BRIDGE_WEBHOOK_SECRET,
  auditPath: resolve(root, 'data/runtime/bridge-audit.sqlite'),
  secureCookies: process.env.NODE_ENV === 'production',
});
app.listen(port, '127.0.0.1', () => console.log(`bridge listening on ${port}`));
