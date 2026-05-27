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

## Layout

```
agent-cockpit/
├── server/   Node backend (port 3001)
└── web/      Vite frontend (port 5173, proxies /api + /ws to server)
```
