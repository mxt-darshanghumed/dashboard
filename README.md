# Agent Cockpit

Personal dashboard for running Claude agents — generic agent creation + bespoke tabs for PR / Jira / Worklog workflows.

Uses your existing Claude Code subscription auth — no API key needed.

## Stack

- **Backend:** Node + TypeScript + Express + WebSocket + Claude Agent SDK + SQLite
- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn/ui

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Then open http://localhost:5173.

## Environment setup

Before running, create a Jira API token and a `.env` file.

### 1. Create a Jira API token (basic)

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**, give it a label, and copy the generated token.

### 2. Create the `.env` file

Copy `.env.example` to `.env` and fill in your values:

```env
PORT=3001
DATABASE_PATH=./data/cockpit.db
JIRA_SITE=maxxton.atlassian.net
JIRA_EMAIL=youremail@maxxton.com
JIRA_API_TOKEN=<your token>
JIRA_AUTH_TYPE=basic
```

- **JIRA_EMAIL** — your Maxxton email.
- **JIRA_API_TOKEN** — the token you created in step 1.
- **JIRA_AUTH_TYPE** — use `basic` for classic API tokens, `bearer` for "API token with scopes".

> The `.env` file is git-ignored, so your token will not be committed.

### 3. (Optional) Install Ollama for offline prompt compression

The chat input has two compression buttons — **Rules** (always available, instant, pure regex) and **Smart** (needs Ollama running locally). Smart compression sends your prompt to a small local LLM that rewrites it using the fewest possible tokens. Zero remote tokens spent.

#### Install Ollama (Windows)

```powershell
winget install Ollama.Ollama
```

The installer registers Ollama as a Windows service, so it starts automatically on the next boot and listens on `http://localhost:11434`. You don't need to launch anything manually.

After installation, **open a new PowerShell window** (so `ollama` is on PATH) and pull a small model:

```powershell
ollama pull qwen2.5:1.5b
```

That's ~1 GB on disk, fast on CPU (no GPU needed).

#### Other model options

Any chat-tuned model works. Choose based on quality vs. speed:

| Model | Size | Notes |
|---|---|---|
| `qwen2.5:1.5b` | ~1 GB | Default. Fast, good baseline. |
| `qwen2.5:3b` | ~2 GB | Better quality, still fast. |
| `phi3:mini` | ~2.3 GB | Strong reasoning. |
| `gemma2:2b` | ~1.6 GB | Balanced. |

To use a different model, add to `.env`:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_COMPRESS_MODEL=qwen2.5:3b
```

#### Verify it's working

1. Open http://localhost:11434 in your browser. You should see `Ollama is running`.
2. Refresh the chat tab in the app. The **Smart** button under the input is enabled (not greyed out).
3. Type a verbose prompt, click **Smart**, and watch your token count drop.

If the **Smart** button stays disabled, the backend can't reach `localhost:11434`. Common causes:

- Ollama service isn't running — check the **Ollama** entry in the Windows system tray, or run `ollama serve` manually.
- A firewall is blocking the local port.
- The `OLLAMA_URL` in `.env` doesn't match the actual port.

## Layout

```
agent-cockpit/
├── server/   Node backend (port 3001)
└── web/      Vite frontend (port 5173, proxies /api + /ws to server)
```
