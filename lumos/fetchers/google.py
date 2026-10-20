#!/usr/bin/env python3
"""
Deterministic Google Workspace fallback fetchers (0 AI API calls).
Used when running standalone without a cached Muse RPC payload.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from lumos.config import resolve_user
from lumos.fetchers.normalizer import normalize_gcal_today


def _get_google_creds(user: Optional[str] = None):
    u_cfg = resolve_user(user)
    if not u_cfg.google_token_path.exists():
        return None
    try:
        from google.oauth2.credentials import Credentials
        return Credentials.from_authorized_user_file(str(u_cfg.google_token_path))
    except Exception:
        return None


def fetch_gcal_events(user: Optional[str] = None) -> Dict[str, Any]:
    creds = _get_google_creds(user)
    if not creds:
        today_sample = [
            {"time": "09:00 AM - 09:30 AM", "title": "Platform Standup & Sync", "location": "Meet", "hour": 9, "all_day": False},
            {"time": "11:00 AM - 12:30 PM", "title": "Architecture Deep Dive: Lumos", "location": "Focus Block", "hour": 11, "all_day": False},
            {"time": "02:00 PM - 03:00 PM", "title": "PR Code Review & Diagnostics", "location": "GitHub", "hour": 14, "all_day": False},
            {"time": "05:30 PM - 06:45 PM", "title": "Gym — Strength & Conditioning", "location": "East Gwillimbury", "hour": 17, "all_day": False},
        ]
        all_day, timeline = normalize_gcal_today(today_sample)
        upcoming_sample = [
            {"day": "Wed", "time": "10:00 AM", "title": "Sprint Planning & Backlog Grooming"},
            {"day": "Thu", "time": "02:00 PM", "title": "Hardware Telemetry Demo"},
            {"day": "Fri", "time": "04:00 PM", "title": "Weekly Engineering Retro"},
        ]
        return {
            "today_events": today_sample,
            "all_day": all_day,
            "timeline": timeline,
            "upcoming_7d": upcoming_sample,
        }

    try:
        from googleapiclient.discovery import build

        service = build("calendar", "v3", credentials=creds)
        local_now = datetime.now(timezone.utc).astimezone()
        start_today = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_today = local_now.replace(hour=23, minute=59, second=59, microsecond=0)
        end_7d = end_today + timedelta(days=7)

        res = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=start_today.isoformat(),
                timeMax=end_7d.isoformat(),
                singleEvents=True,
                orderBy="startTime",
                maxResults=40,
            )
            .execute()
        )

        today_events = []
        upcoming_7d = []
        today_date = local_now.date()

        for it in res.get("items", []):
            start_raw = it["start"].get("dateTime", it["start"].get("date"))
            end_raw = it["end"].get("dateTime", it["end"].get("date"))
            summary = it.get("summary", "Untitled")
            location = it.get("location", "")

            if "T" in start_raw:
                s_dt = datetime.fromisoformat(start_raw).astimezone()
                e_dt = datetime.fromisoformat(end_raw).astimezone()
                ev_date = s_dt.date()
                time_range = f"{s_dt.strftime('%I:%M %p').lstrip('0')} - {e_dt.strftime('%I:%M %p').lstrip('0')}"
                short_time = s_dt.strftime("%I:%M %p").lstrip("0")
                hour = s_dt.hour
                is_all_day = False
            else:
                ev_date = datetime.fromisoformat(start_raw).date()
                time_range = "All Day"
                short_time = "All Day"
                hour = 8
                is_all_day = True

            if ev_date == today_date:
                today_events.append({
                    "time": time_range,
                    "title": summary,
                    "location": location,
                    "hour": hour,
                    "all_day": is_all_day,
                })
            else:
                upcoming_7d.append({
                    "day": ev_date.strftime("%a %m/%d"),
                    "time": short_time,
                    "title": summary,
                })

        all_day, timeline = normalize_gcal_today(today_events)
        return {
            "today_events": today_events,
            "all_day": all_day,
            "timeline": timeline,
            "upcoming_7d": upcoming_7d[:6],
        }
    except Exception as e:
        all_day, timeline = normalize_gcal_today([])
        return {
            "today_events": [{"time": "Notice", "title": f"Calendar error: {e}", "location": "", "hour": 9, "all_day": False}],
            "all_day": all_day,
            "timeline": timeline,
            "upcoming_7d": [],
        }


def fetch_google_tasks(user: Optional[str] = None) -> Dict[str, List[str]]:
    creds = _get_google_creds(user)
    if not creds:
        return {
            "todo": [
                "Verify Phomemo M834 thermal print density & margin cut.",
                "Review open pull requests & CI pipeline status.",
                "Sync Garmin Connect monthly gym attendance log.",
            ],
            "done": [
                "Configure Raspberry Pi GPIO 17 push-button daemon.",
                "Setup Lumos repository & local fetch scripts.",
            ],
        }

    try:
        from googleapiclient.discovery import build

        service = build("tasks", "v1", credentials=creds)
        tasklists = service.tasklists().list(maxResults=5).execute().get("items", [])
        todo, done = [], []
        for tl in tasklists:
            items = (
                service.tasks()
                .list(tasklist=tl["id"], showCompleted=True, showHidden=True, maxResults=20)
                .execute()
                .get("items", [])
            )
            for item in items:
                title = (item.get("title") or "").strip()
                if not title:
                    continue
                if item.get("status") == "completed":
                    done.append(title)
                else:
                    todo.append(title)
        return {"todo": todo[:5], "done": done[:3]}
    except Exception:
        return {"todo": ["Google Tasks scope not authorized in token.json"], "done": []}


def fetch_gmail_updates(user: Optional[str] = None) -> List[Dict[str, str]]:
    creds = _get_google_creds(user)
    if not creds:
        return [
            {"sender": "GitHub", "subject": "[Lumos] CI build passed on main branch"},
            {"sender": "Google Cloud", "subject": "OAuth token verification & quota digest"},
        ]

    try:
        from googleapiclient.discovery import build

        service = build("gmail", "v1", credentials=creds)
        res = (
            service.users()
            .messages()
            .list(userId="me", q="is:unread category:primary", maxResults=4)
            .execute()
        )
        updates = []
        for msg_meta in res.get("messages", []):
            msg = (
                service.users()
                .messages()
                .get(userId="me", id=msg_meta["id"], format="metadata", metadataHeaders=["From", "Subject"])
                .execute()
            )
            headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
            raw_from = headers.get("From", "Unknown").split("<")[0].replace('"', "").strip()
            subject = headers.get("Subject", "(No Subject)").strip()
            updates.append({"sender": raw_from[:18], "subject": subject[:52]})
        return updates or [{"sender": "Inbox Zero", "subject": "No unread primary Gmail threads"}]
    except Exception:
        return [{"sender": "Gmail", "subject": "Authorize gmail.readonly in token.json"}]


def fetch_keep_notes() -> List[Dict[str, str]]:
    return [
        {"title": "PINNED FOCUS", "snippet": "Prioritize deep work before noon; log gym sessions via Garmin."},
    ]
