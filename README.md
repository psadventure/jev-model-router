# jev-model-router

Automatically pick the right Claude model (**haiku**, **sonnet** or **opus**) for each task, using [TypeSafe's Jev](https://typesafe.ai) model as a classifier.

It works two ways:

- **CLI / import** — `router.mjs` takes a query and returns a model name.
- **Claude Code hook** — `.claude/hooks/model-router.mjs` is a `PreToolUse` hook that classifies the prompt of every `Agent` (subagent) dispatch and sets its `model` for you.

## How it works

1. The query is sent to Jev's `systemone` endpoint with one `choice` question and three criteria:
   - **haiku** — quick lookups, formatting, boilerplate, low-stakes small edits
   - **sonnet** — day-to-day coding, feature work, most agentic building
   - **opus** — architecture decisions, hard debugging, security-sensitive work, large multi-file refactors, complex planning
2. The answer is checked against an allowlist (`haiku`, `sonnet`, `opus`). Anything else is rejected.
3. The hook rewrites `tool_input.model` with the choice.

**It fails open.** If routing is disabled, a key is missing, the API errors, the response is malformed or the choice isn't on the allowlist, the router falls back to `sonnet` and the hook leaves the dispatch unmodified. Routing problems never block your work. `fork` subagents are skipped, since a model override is ignored for them.

## Setup

Requires Node.js 18+ (uses built-in `fetch`). No dependencies.

```bash
cp .env.example .env.local
# edit .env.local: set JEV_ROUTER_ENABLED=true and one API key
```

| Variable | Purpose |
| --- | --- |
| `JEV_ROUTER_ENABLED` | Must be `true` to route. Otherwise the default (`sonnet`) is used. |
| `TYPESAFE_API_KEY` | Calls `api.typesafe.ai` directly. |
| `OPENROUTER_API_KEY` | Calls via OpenRouter. Takes priority if both keys are set. |

## Usage

### CLI

```bash
node router.mjs "refactor the auth module across the whole codebase"
# → opus
```

Diagnostics (confidence, probabilities, fallbacks) go to stderr; only the model name goes to stdout.

### As a module

```js
import { pickModel } from "./router.mjs";
const { model, source } = await pickModel("fix this typo in the README");
// model: "haiku" | "sonnet" | "opus"; source: "jev" or a "fallback-*" / "switch-off" reason
```

### Claude Code hook

`.claude/settings.json` registers the hook:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/model-router.mjs\"" }
        ]
      }
    ]
  }
}
```

Open this folder in Claude Code and approve the hook when prompted. Each routing decision is appended to `.claude/hooks/router.log`.

## Privacy and security

- **Your prompts leave your machine.** When enabled, the full text of each dispatched `Agent` prompt is sent to TypeSafe (or OpenRouter). Don't enable it if your prompts may contain code or data you can't share with those services.
- **Off by default.** Nothing is sent unless `JEV_ROUTER_ENABLED=true` and a key is set.
- **Keys stay local.** They're read from `.env.local` (gitignored) and sent only as a `Authorization` header to the two hardcoded HTTPS endpoints. They're never logged.
- **Logs may contain prompt snippets.** `router.log` records the first 60 characters of each prompt. It's gitignored; delete it if you like.
- **The hook is code that runs on your machine.** Read it before approving it in Claude Code (it's ~60 lines).

## Files

```
router.mjs                       # pickModel(): classification + fallbacks
.claude/hooks/model-router.mjs   # PreToolUse hook for the Agent tool
.claude/settings.json            # registers the hook
.env.example                     # config template (copy to .env.local)
```

## License

[MIT](LICENSE)
