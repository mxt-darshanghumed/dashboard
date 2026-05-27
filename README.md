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

## Layout

```
agent-cockpit/
├── server/   Node backend (port 3001)
└── web/      Vite frontend (port 5173, proxies /api + /ws to server)
```
