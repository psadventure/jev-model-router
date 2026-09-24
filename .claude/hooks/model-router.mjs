#!/usr/bin/env node
// PreToolUse hook for the Agent tool: classifies the dispatched prompt via Jev
// and rewrites tool_input.model accordingly. Fails open (no modification) on
// any error, when disabled, or for subagent_type "fork" (model override is
// ignored for forks anyway).

import { pickModel } from "../../router.mjs";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "router.log");
function log(line) {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

try {
  const raw = await readStdin();
  const payload = JSON.parse(raw);
  const toolInput = payload.tool_input ?? {};

  if (toolInput.subagent_type === "fork") {
    log("skip: subagent_type=fork");
    process.exit(0); // no-op: fork ignores model override
  }

  const query = toolInput.prompt;
  if (!query) {
    log("skip: no prompt field");
    process.exit(0); // nothing to classify
  }

  const { model, source } = await pickModel(query);
  console.error(`[model-router] source=${source} model=${model}`);
  log(`fired: subagent_type=${toolInput.subagent_type} original_model=${toolInput.model} chosen=${model} source=${source} prompt="${query.slice(0, 60)}"`);

  if (source === "jev") {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          updatedInput: { ...toolInput, model },
        },
      })
    );
  }
  process.exit(0);
} catch (err) {
  console.error(`[model-router] hook failed (${err.message}); leaving input unmodified.`);
  process.exit(0); // fail open — never block a dispatch over routing issues
}
