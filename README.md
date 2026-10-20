# Lumos — Daily Summary Dispatcher

Automated 1-page morning broadsheet newspaper printer and **Meta Muse** gadget interface for the **Phomemo M834** thermal printer (300 DPI, 8.5" × 11") running on a **Raspberry Pi 3B**.

## Architecture

```text
[User]
   │ "Print my morning brief" (voice / chat) OR physical GPIO 17 button / morning cron
   ▼
[Meta Muse Cloud Agent]
   ├── Accesses connected Workspace tools (Calendar, Gmail, Outlook, Tasks, Keep)
   ├── Summarizes today's agenda, high-priority emails, directives
   └── Sends RPC over Noise tunnel:
       `printer.briefing(payload={"events": [...], "note": "..."})`
   │
   ▼ (Noise Tunnel)
[Raspberry Pi 3B (muse-gadget-sdk)]
   └── `executor.py` intercepts `printer.briefing`
       └── Merges Muse payload with zero-AI-call Python fetchers in `fetchers/`
       └── `generate_and_print.py` renders 1-page PDF & dispatches to Phomemo M834
```

## Zero-Token Deterministic Fetchers (`fetchers/`)

To minimize AI API calls and token usage, Lumos uses local Python scripts for direct data retrieval whenever possible, merging any overrides sent by Meta Muse:

- **[fetchers/garmin_fetcher.py](./fetchers/garmin_fetcher.py)**: Logs into Garmin Connect via `.env` (`GARMIN_USERNAME`, `GARMIN_PASSWORD`) with `.garth/` session caching, fetches all gym/workout sessions for the current month, renders a **Monthly Gym Attendance Calendar Grid** (`■` shaded boxes), and pulls Resting HR, Steps, and Sleep.
- **[fetchers/google_fetcher.py](./fetchers/google_fetcher.py)**: Uses `token.json` to fetch:
  - **Google Calendar Today**: Mapped onto a visual **7 AM – 9 PM Hourly Timeline** with bordered time blocks.
  - **Google Calendar Next 7 Days**: Upcoming week horizon.
  - **Google Tasks**: Active To-Do (`□`) and recently Completed (`■`) tasks.
  - **Gmail**: Unread primary inbox threads (`Sender` + `Subject`).
  - **Google Keep**: Pinned notes via `keep_notes.json` or `gkeepapi`.
- **[fetchers/outlook_fetcher.py](./fetchers/outlook_fetcher.py)**: Fetches unread Outlook inbox headers via IMAP (`OUTLOOK_USERNAME`, `OUTLOOK_PASSWORD`).
- **[fetchers/weather_fetcher.py](./fetchers/weather_fetcher.py)**: Fetches local weather, high/low, wind, precipitation, and solar hours from Open-Meteo.
