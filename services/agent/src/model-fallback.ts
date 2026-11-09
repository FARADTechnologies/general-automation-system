// A second model provider behind the same interface, used only when the first one is unreachable
// (gateway down, tunnel closed, key revoked, rate limited). The internal message history is
// provider-neutral, so a conversation can continue on the second model. Guards, the Bridge and
// the confirmation flow do not change with the model.
import type { ModelClient, ModelRequest, ModelResult } from '@gas/agent-core';

export interface FallbackOptions {
  /** How long to stay on the second model after the first one failed. */
  cooldownMs?: number;
  log?: (message: string) => void;
  now?: () => number;
}

export class FallbackModel implements ModelClient {
  private downUntil = 0;
  constructor(private primary: ModelClient, private secondary: ModelClient, private opts: FallbackOptions = {}) {}

  private now() { return (this.opts.now || Date.now)(); }
  get model() { return this.now() < this.downUntil ? this.secondary.model : this.primary.model; }

  async create(req: ModelRequest, signal?: AbortSignal): Promise<ModelResult> {
    if (this.now() >= this.downUntil) {
      try {
        return await this.primary.create(req, signal);
      } catch (e) {
        if (signal?.aborted) throw e;
        this.downUntil = this.now() + (this.opts.cooldownMs ?? 60_000);
        const status = (e as { status?: number }).status;
        this.opts.log?.(`primary model ${this.primary.model} failed (${status ?? 'no response'}); using ${this.secondary.model} for ${Math.round((this.opts.cooldownMs ?? 60_000) / 1000)} s`);
      }
    }
    return this.secondary.create(req, signal);
  }
}
