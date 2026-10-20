---
name: muse-rpc-bridge
description: >-
  Manage the Meta Muse Cloud Agent to Raspberry Pi 3B Noise tunnel RPC bridge
  (`printer.briefing` -> `executor.py` -> `generate_and_print.py`) and hybrid
  zero-AI-call local fetchers. Use this skill when updating the Muse RPC payload
  schema, debugging `executor.py`, or testing hybrid Muse + local fetcher runs.
---

# Meta Muse RPC Bridge Skill

## Architecture

```text
[User]
   │ "Print my morning brief" (voice / chat)
   ▼
[Meta Muse Cloud Agent]
   ├── Accesses connected Workspace tools (Calendar, Gmail, Outlook, Tasks, Keep)
   ├── Summarizes today's agenda, priority emails, and directives
   └── Sends RPC over Noise tunnel:
       `printer.briefing(payload={"events": [...], "gmail_updates": [...], "note": "..."})`
   │
   ▼ (Noise Tunnel)
[Raspberry Pi 3B (muse-gadget-sdk)]
   └── `executor.py` intercepts `printer.briefing`
       └── Merges Muse payload with zero-AI-call local Python fetchers in `fetchers/`
       └── `generate_and_print.py` renders 1-page PDF & dispatches to Phomemo M834
```

## Minimizing AI Token Calls

- **Local Deterministic Scripts First (`0 AI Calls`)**:
  - `fetchers/garmin_fetcher.py`: Connects directly to Garmin Connect via `.env` (`GARMIN_USERNAME`, `GARMIN_PASSWORD`) to build the monthly gym attendance calendar grid (`■` shaded boxes) and vitals.
  - `fetchers/weather_fetcher.py`: Queries Open-Meteo REST API directly.
  - `fetchers/google_fetcher.py`: Queries Google Calendar (Today + 7 Days), Google Tasks (To-Do + Done), Gmail, and Keep directly via `token.json`.
  - `fetchers/outlook_fetcher.py`: Queries Outlook unread messages via IMAP.
- **Meta Muse RPC Override**:
  - When triggered via voice/chat through Meta Muse, `executor.py` accepts whatever fields Muse supplies in `payload` and fills any missing sections using the local deterministic fetchers.

## Testing RPC Dispatch Locally

```bash
python executor.py --payload '{"note": "Dispatched over Meta Muse Noise tunnel.", "tasks_todo": ["Ship Lumos v0.1"]}'
```
