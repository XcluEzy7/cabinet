import { ollamaCliProvider } from "../providers/ollama-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import type { AgentExecutionAdapter, AdapterExecutionContext, AdapterExecutionResult } from "./types";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

function readStringConfig(
  config: Record<string, unknown>,
  key: string
): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const ollamaLocalAdapter: AgentExecutionAdapter = {
  type: "ollama_local",
  name: "Ollama Local",
  description:
    "Local LLM execution via Ollama HTTP API. Sends prompts to a running Ollama instance and returns generated text. Supports model selection, temperature, and token limits via adapter config.",
  providerId: ollamaCliProvider.id,
  executionEngine: "api",
  supportsDetachedRuns: true,
  supportsSessionResume: false,
  models: ollamaCliProvider.models,

  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "ollama_local",
      await ollamaCliProvider.healthCheck(),
      ollamaCliProvider.installMessage
    );
  },

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const model = readStringConfig(ctx.config, "model") || "llama3.1";
    const host = readStringConfig(ctx.config, "host") || readStringConfig(ctx.config, "ollamaHost") || OLLAMA_HOST;
    const temperature = Number(readStringConfig(ctx.config, "temperature") || "0.7");
    const maxTokens = Number(readStringConfig(ctx.config, "num_predict") || readStringConfig(ctx.config, "maxTokens") || "4096");

    try {
      const res = await fetch(`${host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: ctx.prompt,
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }),
        signal: AbortSignal.timeout(ctx.timeoutMs || 300_000),
      });

      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as {
        response: string;
        done?: boolean;
        context?: number[];
        total_duration?: number;
        load_duration?: number;
        prompt_eval_duration?: number;
        eval_count?: number;
        eval_duration?: number;
      };

      await ctx.onLog("stdout", data.response);

      // Estimate token usage from Ollama metrics
      const outputTokens = typeof data.eval_count === "number" ? data.eval_count : undefined;
      const inputTokens = data.prompt_eval_duration && data.eval_duration && data.eval_count
        ? Math.max(1, Math.round((data.prompt_eval_duration / Math.max(1, data.eval_duration)) * data.eval_count))
        : undefined;

      const summary = data.response.trim().slice(0, 500);

      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        output: data.response,
        summary: summary,
        usage: inputTokens !== undefined || outputTokens !== undefined ? {
          inputTokens: inputTokens ?? 0,
          outputTokens: outputTokens ?? 0,
        } : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.onLog("stderr", `[ollama] ${message}`);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `[ollama] ${message}`,
        errorCode: "OLLAMA_API_ERROR",
      };
    }
  },
};
