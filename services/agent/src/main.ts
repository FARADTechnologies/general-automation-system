import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '@gas/shared/env';
import { CORE_PROMPT, DEFAULT_CONFIG } from '@gas/agent-core';
import { AnthropicModel } from './model.ts';
import { createAgentServer } from './server.ts';

loadEnv();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const domainPrompt = readFileSync(resolve(root, 'domains/bank/prompt.md'), 'utf8');
const screens = JSON.parse(readFileSync(resolve(root, 'domains/bank/screens.json'), 'utf8')) as Record<string, string>;
const tryCommands = JSON.parse(readFileSync(resolve(root, 'domains/bank/try-commands.json'), 'utf8')) as string[];

const model = new AnthropicModel({
  model: process.env.AGENT_MODEL || 'claude-sonnet-5-5',
  effort: (process.env.AGENT_EFFORT as 'low' | 'medium' | 'high') || 'medium',
  thinking: (process.env.AGENT_THINKING as 'between_tools' | 'adaptive') || 'between_tools',
  fallback: process.env.AGENT_FALLBACK !== '0',
}, process.env.ANTHROPIC_API_KEY);

const { server } = createAgentServer({
  bridgeUrl: process.env.BRIDGE_URL || 'http://127.0.0.1:4200',
  agentKey: process.env.BRIDGE_AGENT_KEY || '',
  webhookSecret: process.env.BRIDGE_WEBHOOK_SECRET || '',
  model,
  loop: {
    ...DEFAULT_CONFIG,
    systemPrompt: `${CORE_PROMPT}\n\n${domainPrompt}`,
    sessionCallCap: Number(process.env.SESSION_CALL_CAP || 40),
    sessionSpendCapUsd: Number(process.env.SESSION_SPEND_CAP_USD || 1.5),
  },
  choreographyStepMs: Number(process.env.CHOREO_STEP_MS || 220),
  confirmTimeoutMs: 125_000,
  maxInputsPerMinute: 12,
  screens,
  tryCommands,
});
const port = Number(process.env.AGENT_PORT || 4300);
server.listen(port, '127.0.0.1', () => console.log(`agent listening on ${port} (model ${model.model})`));
