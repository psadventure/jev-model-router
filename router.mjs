#!/usr/bin/env node
// Jev-based model router: classifies a query and picks haiku/sonnet/opus.
// CLI:    node router.mjs "<query text>"
// Import: import { pickModel } from "./router.mjs"

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_MODEL = "sonnet";
const ALLOWED_MODELS = new Set(["haiku", "sonnet", "opus"]);
const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), ".env.local");

function loadEnv() {
  const env = {};
  let raw;
  try {
    raw = readFileSync(ENV_PATH, "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

export async function pickModel(query) {
  const env = loadEnv();
  const enabled = String(env.JEV_ROUTER_ENABLED).toLowerCase() === "true";

  if (!enabled) {
    return { model: DEFAULT_MODEL, source: "switch-off" };
  }

  // Prefer OpenRouter when its key is set; otherwise call TypeSafe directly.
  const useOpenRouter = Boolean(env.OPENROUTER_API_KEY);
  const apiKey = useOpenRouter ? env.OPENROUTER_API_KEY : env.TYPESAFE_API_KEY;
  if (!apiKey) {
    console.error("[router] JEV_ROUTER_ENABLED=true but neither OPENROUTER_API_KEY nor TYPESAFE_API_KEY is set; falling back to default.");
    return { model: DEFAULT_MODEL, source: "fallback-no-key" };
  }
  const endpoint = useOpenRouter
    ? "https://openrouter.ai/api/v1/systemone"
    : "https://api.typesafe.ai/v1/systemone";
  const jevModel = useOpenRouter ? "~typesafe/jev-latest" : "jev-latest";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: { query },
        model: jevModel,
        questions: {
          model_choice: {
            type: "choice",
            instructions:
              "Given `query`, which Claude model should handle this task?",
            criteria: {
              haiku: "Quick lookups, formatting, boilerplate, low-stakes small edits",
              sonnet: "Default day-to-day coding, feature work, most agentic building",
              opus: "Architecture decisions, hard debugging, security-sensitive work, large multi-file refactors, complex planning",
            },
          },
        },
      }),
    });

    if (!res.ok) {
      console.error(`[router] Jev API returned ${res.status}; falling back to default.`);
      return { model: DEFAULT_MODEL, source: "fallback-http-error" };
    }

    const data = await res.json();
    const answer = data.answers?.model_choice;
    if (!answer?.choice) {
      console.error("[router] Unexpected Jev response shape; falling back to default.");
      return { model: DEFAULT_MODEL, source: "fallback-bad-shape" };
    }

    if (!ALLOWED_MODELS.has(answer.choice)) {
      console.error(`[router] Jev returned unexpected model "${String(answer.choice).slice(0, 40)}"; falling back to default.`);
      return { model: DEFAULT_MODEL, source: "fallback-bad-choice" };
    }

    console.error(
      `[router] choice=${answer.choice} confidence=${answer.confidence} probabilities=${JSON.stringify(answer.probabilities)}`
    );
    return { model: answer.choice, source: "jev" };
  } catch (err) {
    console.error(`[router] Jev call failed (${err.message}); falling back to default.`);
    return { model: DEFAULT_MODEL, source: "fallback-exception" };
  }
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv.slice(2).join(" ");
  if (!query) {
    console.error('Usage: node router.mjs "<query text>"');
    process.exit(1);
  }
  const { model } = await pickModel(query);
  console.log(model);
}
