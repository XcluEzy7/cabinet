import { piCliProvider } from "../providers/pi-cli";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import type { AgentExecutionAdapter, AdapterExecutionContext, AdapterExecutionResult } from "./types";
import { ADAPTER_RUNTIME_PATH, runChildProcess } from "./utils";

function readStringConfig(
  config: Record<string, unknown>,
  key: string
): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Parse Pi JSONL output and extract the final assistant text.
 * Pi v0.70.2 JSONL event types:
 *  - session: session metadata
 *  - agent_start/turn_start: process start
 *  - message_start: beginning of a message
 *  - message_update (text_delta, text_end, tool_call_delta, etc.): streaming content
 *  - message_end: finalized message with full content
 *  - turn_end: end of a turn
 *  - agent_end: final state with all messages
 * Strategy: prioritize message_end for finalized text; fall back to agent_end.
 */
function extractPiText(stdout: string): { text: string; toolCalls: { name: string; result: string }[] } {
  const toolCalls: { name: string; result: string }[] = [];
  let currentTool: { id: string; name: string } | null = null;
  let assistantText = "";

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      switch (event.type) {
        case "tool_execution_start":
          currentTool = { id: event.toolCallId, name: event.toolName };
          break;
        case "tool_execution_end":
          if (currentTool && currentTool.id === event.toolCallId) {
            const r = event.result;
            const text = typeof r === "string"
              ? r
              : r?.content
                ? (Array.isArray(r.content) ? r.content.map((c: any) => c.text || "").join("\n") : String(r.content))
                : JSON.stringify(r);
            toolCalls.push({ name: currentTool.name, result: text.slice(0, 500) });
          }
          currentTool = null;
          break;
        // Pi v0.70.2: message_end carries the final synthesized message, often more reliable
        // than piecing together deltas.
        case "message_end": {
          const msg = event.message as { role: string; content?: any } | undefined;
          if (msg?.role === "assistant") {
            const content = msg.content;
            if (Array.isArray(content)) {
              for (const item of content) {
                if (item?.type === "text") {
                  assistantText = item.text || "";
                  break;
                }
              }
            } else if (typeof content === "string") {
              assistantText = content;
            }
          }
          break;
        }
        // Fallback: agent_end carries full conversation messages
        case "agent_end": {
          const msgs = event.messages as Array<{ role: string; content?: any }> | undefined;
          if (Array.isArray(msgs) && !assistantText) {
            for (let i = msgs.length - 1; i >= 0; i--) {
              const msg = msgs[i];
              if (msg.role === "assistant") {
                const content = msg.content;
                if (Array.isArray(content)) {
                  for (const item of content) {
                    if (item?.type === "text") {
                      assistantText = item.text || "";
                      break;
                    }
                  }
                } else if (typeof content === "string") {
                  assistantText = content;
                }
                break;
              }
            }
          }
          break;
        }
      }
    } catch {
      // skip non-JSON lines
    }
  }

  return { text: assistantText, toolCalls };
}

export const piLocalAdapter: AgentExecutionAdapter = {
  type: "pi_local",
  name: "Pi Coding Agent",
  description:
    "Non-interactive Pi execution via -p (print) mode. Parses Pi's JSONL event stream to extract assistant responses. Supports model selection and thinking levels.",
  providerId: piCliProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: false,
  models: piCliProvider.models,

  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "pi_local",
      await piCliProvider.healthCheck(),
      piCliProvider.installMessage
    );
  },

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const command = readStringConfig(ctx.config, "command") ||
      (() => { try { return resolveCliCommand(piCliProvider); } catch { return "pi"; } })();

    // Pi v0.70.2 non-interactive syntax:
    //   pi -p --mode json --no-session [options] "prompt"
    const args: string[] = ["-p", "--mode", "json", "--no-session"];

    const model = readStringConfig(ctx.config, "model");
    if (model) {
      args.push("--model", model);
    }

    const effort = readStringConfig(ctx.config, "effort") || readStringConfig(ctx.config, "reasoningEffort") || readStringConfig(ctx.config, "thinking");
    if (effort) {
      args.push("--thinking", effort);
    }

    const tools = readStringConfig(ctx.config, "tools");
    if (tools) {
      args.push("--tools", tools);
    }

    const systemPrompt = readStringConfig(ctx.config, "systemPrompt");
    if (systemPrompt) {
      args.push("--system-prompt", systemPrompt);
    }

    args.push(ctx.prompt);

    // CRITICAL: PI_OFFLINE=1 prevents Pi from running npm install during startup
    const env = {
      ...process.env,
      PATH: ADAPTER_RUNTIME_PATH,
      PI_OFFLINE: "1",
    };

    return runChildProcess(
      command,
      args,
      {
        cwd: ctx.cwd,
        env,
        timeoutMs: ctx.timeoutMs,
        onStdout: async (chunk: string) => {
          await ctx.onLog("stdout", chunk);
        },
        onStderr: async (chunk: string) => {
          await ctx.onLog("stderr", chunk);
        },
        onSpawn: async (meta: { pid: number; processGroupId: number | null; startedAt: string }) => {
          if (ctx.onMeta) {
            await ctx.onMeta({
              adapterType: "pi_local",
              command,
              cwd: ctx.cwd,
              commandArgs: args,
              prompt: ctx.prompt,
            });
          }
          if (ctx.onSpawn) {
            await ctx.onSpawn(meta);
          }
        },
      }
    );
  },
};
