import { execSync } from "child_process";
import type { AgentProvider, ProviderModel, ProviderStatus } from "../provider-interface";
import { checkCliProviderAvailable, resolveCliCommand, RUNTIME_PATH } from "../provider-cli";

const PI_THINKING_LEVELS = [
  { id: "off", name: "Off", description: "No extra reasoning, fastest" },
  { id: "minimal", name: "Minimal", description: "Minimal reasoning" },
  { id: "low", name: "Low", description: "Light reasoning, faster answers" },
  { id: "medium", name: "Medium", description: "Balanced depth" },
  { id: "high", name: "High", description: "Thorough reasoning" },
  { id: "xhigh", name: "Max", description: "Maximum depth for hardest tasks" },
] as const;

function makeEffortLevels() {
  return [...PI_THINKING_LEVELS];
}

// Models exposed by pi --list-models (openai-codex only as of v0.70.2).
// Pi defaults to the provider configured in settings.json; explicit --provider
// may trigger model-availability errors if the account doesn't have access.
const PI_MODELS: ProviderModel[] = [
  {
    id: "gpt-5.1",
    name: "GPT 5.1",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.1-codex-max",
    name: "GPT 5.1 Codex Max",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT 5.1 Codex Mini",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.2",
    name: "GPT 5.2",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.2-codex",
    name: "GPT 5.2 Codex",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT 5.3 Codex",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.3-codex-spark",
    name: "GPT 5.3 Codex Spark",
    description: "128K context / 128K out — thinking, no images",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.4",
    name: "GPT 5.4",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT 5.4 Mini",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
  {
    id: "gpt-5.5",
    name: "GPT 5.5",
    description: "272K context / 128K out — images, thinking",
    effortLevels: makeEffortLevels(),
  },
];

export const piCliProvider: AgentProvider = {
  id: "pi-cli",
  name: "Pi Coding Agent",
  type: "cli",
  icon: "brain-circuit",
  apiKeyEnvVar: "OPENAI_API_KEY",
  installMessage:
    "Pi Coding Agent not found. Install with: mise use pi@latest (or npm i -g @mariozechner/pi-coding-agent)",
  installSteps: [
    {
      title: "Install Pi Coding Agent",
      detail: "Install via mise (recommended) or npm:",
      command: "mise use pi@latest",
    },
    {
      title: "Set up API key",
      detail: "Set OPENAI_API_KEY (or other provider key):",
      command: "export OPENAI_API_KEY=***",
    },
    {
      title: "Verify",
      detail: "Check that it's installed:",
      command: "pi --version",
    },
    {
      title: "List models",
      detail: "See available models:",
      command: "pi --list-models",
    },
  ],
  models: PI_MODELS,
  detachedPromptLaunchMode: "one-shot",
  commandCandidates: ["pi"],

  command: "pi",

  // Pi v0.70.2 one-shot: -p (print) + positional prompt + --mode json
  // Pi v0.70.2 non-interactive mode: -p (print) + positional prompt + --mode json
  // NOTE: Pi sometimes exits code 124 (SIGTERM) after emitting complete JSONL output
  // because it doesn't close its event loop cleanly. The adapter's runChildProcess
  // handles this via timeout + SIGTERM + grace period. Direct calls to
  // provider-runtime's runOneShotProviderPrompt may timeout — prefer the adapter.
  buildOneShotInvocation(prompt: string, _workdir: string) {
    return {
      command: "pi",
      args: ["-p", "--mode", "json", "--no-session", prompt],
    };
  },

  async isAvailable(): Promise<boolean> {
    return checkCliProviderAvailable(this);
  },

  async healthCheck(): Promise<ProviderStatus> {
    try {
      const command = resolveCliCommand(this);
      const version = execSync(`${JSON.stringify(command)} --version`, {
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, PATH: RUNTIME_PATH },
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();

      // Check authentication: prefer Pi's native auth.json, then env vars
      let authenticatedFromPiAuth = false;
      try {
        const authJsonPath =
          process.env.HOME
            ? `${process.env.HOME}/.pi/agent/auth.json`
            : (() => {
                try {
                  return `${require("os").homedir()}/.pi/agent/auth.json`;
                } catch {
                  return null;
                }
              })();

        if (authJsonPath) {
          try {
            const fs = require("fs");
            if (fs.existsSync(authJsonPath)) {
              const raw = fs.readFileSync(authJsonPath, "utf8");
              const authData = JSON.parse(raw) as Record<
                string,
                { key?: string; access?: string; token?: string }
              >;
              for (const creds of Object.values(authData)) {
                if (creds && (creds.key || creds.access || creds.token)) {
                  authenticatedFromPiAuth = true;
                  break;
                }
              }
            }
          } catch {
            // fall through
          }
        }
      } catch {
        // Pi auth.json not readable or malformed — fall back to env vars
      }

      const hasKey = !!(
        authenticatedFromPiAuth ||
        process.env.OPENAI_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.PI_API_KEY ||
        process.env.OPENROUTER_API_KEY
      );

      return {
        available: true,
        authenticated: hasKey,
        version: version || undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        authenticated: false,
        error: message,
      };
    }
  },
};
