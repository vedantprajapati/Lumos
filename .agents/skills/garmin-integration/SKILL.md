---
name: garmin-integration
description: >-
  Fetch and integrate Garmin Connect health, sleep, body battery, and activity
  metrics into the Lumos daily briefing using credentials from .env. Use this
  skill when adding or debugging Garmin telemetry in generate_and_print.py or
  briefing_template.html.
---

# Garmin Integration Skill

Use this workflow when adding, updating, or debugging Garmin Connect health metrics in Lumos.

## Configuration & Authentication

1. **Environment Variables (`.env`)**
   Ensure `.env` is loaded via `python-dotenv` (`load_dotenv()`) and defines:
   - `GARMIN_USERNAME`: Garmin Connect account email
   - `GARMIN_PASSWORD`: Garmin Connect account password

2. **Session Caching (`.garth`)**
   To avoid repeated SSO logins and rate limits on headless morning runs:
   - Store Garmin OAuth tokens in `.garth/` (which is gitignored).
   - Attempt to resume session via `garmin.login(tokenstore=".garth")` first, falling back to credential login and saving tokens on first run.

## Standard Data Payload

When fetching Garmin metrics in `generate_and_print.py`, always return a structured dictionary with safe fallbacks if offline or unauthenticated:

```python
def fetch_garmin_stats():
    # Expected keys for briefing_template.html:
    return {
        "sleep_hours": "7h 42m",
        "sleep_score": 84,
        "body_battery": 88,
        "resting_hr": 52,
        "steps_yesterday": "10,420",
        "stress_avg": 24,
    }
```

## Verification

1. Test `fetch_garmin_stats()` in isolation with and without valid `.env` credentials to verify both live data retrieval and offline fallback resilience.
2. Verify any new biometric section added to `briefing_template.html` maintains the 3-column broadsheet alignment without overflowing page 1.
