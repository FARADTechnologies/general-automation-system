import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '@gas/shared/env';
import { CORE_PROMPT, DEFAULT_CONFIG } from '@gas/agent-core';
import { AnthropicModel } from './model.ts';
import { GeminiModel } from './model-gemini.ts';
import { openAICompatFromEnv } from './model-openai.ts';
import { createAgentServer } from './server.ts';
import { sttFromEnv } from './stt.ts';

loadEnv();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const domainPrompt = readFileSync(resolve(root, 'domains/bank/prompt.md'), 'utf8');
const screens = JSON.parse(readFileSync(resolve(root, 'domains/bank/screens.json'), 'utf8')) as Record<string, string>;
const tryCommands = JSON.parse(readFileSync(resolve(root, 'domains/bank/try-commands.json'), 'utf8')) as string[];
const sttHints = JSON.parse(readFileSync(resolve(root, 'domains/bank/stt-hints.json'), 'utf8')) as string[];
const stt = sttFromEnv(process.env, sttHints);

// AGENT_PROVIDER selects the model behind the same interface: anthropic (default), gemini, or an
// OpenAI-compatible provider (mistral, groq, openai-compat).
const provider = process.env.AGENT_PROVIDER || 'anthropic';
const model = provider !== 'anthropic' && provider !== 'gemini' ? openAICompatFromEnv(provider, process.env) : provider === 'gemini'
  ? new GeminiModel({ model: process.env.GEMINI_MODEL || 'gemini-3.6-flash', fallbacks: (process.env.GEMINI_FALLBACKS || 'gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-2.5-flash').split(',').filter(Boolean), apiKey: process.env.GEMINI_API_KEY || '', thinkingLevel: (process.env.GEMINI_THINKING as 'low') || 'low' })
  : new AnthropicModel({
  model: process.env.AGENT_MODEL || 'claude-sonnet-5-5',
  effort: (process.env.AGENT_EFFORT as 'low' | 'medium' | 'high') || 'medium',
  thinking: (process.env.AGENT_THINKING as 'between_tools' | 'adaptive') || 'between_tools',
  fallback: process.env.AGENT_FALLBACK !== '0',
  baseURL: process.env.ANTHROPIC_BASE_URL,
  authToken: process.env.ANTHROPIC_AUTH_TOKEN,
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
  stt,
});
const port = Number(process.env.AGENT_PORT || 4300);
server.listen(port, '127.0.0.1', () => console.log(`agent listening on ${port} (model ${model.model}; speech-to-text ${stt.enabled ? stt.providers.join(' then ') : 'off, browser speech only'})`));
