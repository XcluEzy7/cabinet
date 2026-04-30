import type { AgentProvider, ProviderStatus, ProviderModel } from "../provider-interface";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

async function fetchOllamaTags(): Promise<ProviderModel[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json() as { models?: Array<{ name: string; size?: number }> };
    return (data.models || []).map((m) => ({
      id: m.name,
      name: m.name,
      description: m.size ? `Size: ${(m.size / 1e9).toFixed(1)}GB` : undefined,
      effortLevels: [],
    }));
  } catch {
    return [];
  }
}

export const ollamaCliProvider: AgentProvider = {
  id: "ollama-cli",
  name: "Ollama",
  type: "api",
  icon: "cpu",
  apiKeyEnvVar: "OLLAMA_HOST",
  models: [], // populated dynamically via isAvailable
  detachedPromptLaunchMode: "one-shot",

  installMessage:
    "Ollama is not running. Install from https://ollama.com and start with: ollama serve",
  installSteps: [
    {
      title: "Install Ollama",
      detail: "Download and install Ollama for your OS:",
      link: { label: "Get Ollama", url: "https://ollama.com" },
    },
    {
      title: "Start Ollama server",
      detail: "Run the server locally (or set OLLAMA_HOST if remote):",
      command: "ollama serve",
    },
    {
      title: "Pull a model",
      detail: "Download a model to use with Cabinet:",
      command: "ollama pull llama3.1",
    },
  ],

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  },

  async healthCheck(): Promise<ProviderStatus> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        return { available: false, authenticated: false, error: `HTTP ${res.status}` };
      }
      const data = await res.json() as { models?: Array<{ name: string }> };
      const models = data.models || [];

      // Cache models for later use
      (this as unknown as { models: ProviderModel[] }).models = models.map((m) => ({
        id: m.name,
        name: m.name,
        effortLevels: [],
      }));

      return {
        available: true,
        authenticated: true,
        version: `${models.length} model(s) loaded`,
      };
    } catch (err) {
      return {
        available: false,
        authenticated: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async runPrompt(prompt: string, context: string): Promise<string> {
    const model = (this as unknown as { models: ProviderModel[] }).models?.[0]?.id || "llama3.1";

    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: `${context}\n\n${prompt}`,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 4096,
        },
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: HTTP ${res.status}`);
    }

    const data = await res.json() as { response: string };
    return data.response;
  },
};
