#!/usr/bin/env python3
"""
Deterministic Google Workspace fetchers (0 AI API calls):
- Google Calendar: Today (mapped to hourly timeline 7 AM - 9 PM) + Next 7 Days
- Google Tasks: To-Do and Completed tasks
- Gmail: Recent unread/important primary inbox threads
- Google Keep: Pinned/important notes (via gkeepapi or local cache)
"""
import json
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/tasks.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]

TIMELINE_HOURS = list(range(7, 22))  # 7 AM to 9 PM (21:00)


def _get_google_creds():
    token_file = os.path.join(BASE_DIR, "token.json")
    if not os.path.exists(token_file):
        return None
    try:
        from google.oauth2.credentials import Credentials
        return Credentials.from_authorized_user_file(token_file)
    except Exception:
        return None


def build_hourly_timeline(today_events):
    """
    Maps today's events onto a 7 AM - 9 PM hourly ruler (like the receipt printer photo).
    Each slot has: {"hour_label": "7 AM", "events": [{"time": "09:00-10:00", "title": "...", "location": "..."}]}
    """
    slots = {h: [] for h in TIMELINE_HOURS}
    all_day = []

    for ev in today_events:
        if ev.get("all_day"):
            all_day.append(ev)
            continue
        hour = ev.get("hour", 9)
        clamped = max(7, min(21, hour))
        slots[clamped].append(ev)

    timeline = []
    for h in TIMELINE_HOURS:
        suffix = "AM" if h < 12 else "PM"
        h12 = h if h <= 12 else h - 12
        timeline.append({
            "hour": h,
            "label": f"{h12} {suffix}",
            "events": slots[h],
        })
    return all_day, timeline


def fetch_gcal_events():
    """Fetches Today's events and Next 7 Days events with 0 AI calls."""
    creds = _get_google_creds()
    if not creds:
        today_sample = [
            {"time": "09:00 AM - 09:30 AM", "title": "Platform Standup & Sync", "location": "Meet", "hour": 9, "all_day": False},
            {"time": "11:00 AM - 12:30 PM", "title": "Architecture Deep Dive: Lumos", "location": "Focus Block", "hour": 11, "all_day": False},
            {"time": "02:00 PM - 03:00 PM", "title": "PR Code Review & Diagnostics", "location": "GitHub", "hour": 14, "all_day": False},
            {"time": "05:30 PM - 06:45 PM", "title": "Gym — Strength & Conditioning", "location": "Fitness Club", "hour": 17, "all_day": False},
        ]
        all_day, timeline = build_hourly_timeline(today_sample)
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

        all_day, timeline = build_hourly_timeline(today_events)
        return {
            "today_events": today_events,
            "all_day": all_day,
            "timeline": timeline,
            "upcoming_7d": upcoming_7d[:7],
        }
    except Exception as e:
        all_day, timeline = build_hourly_timeline([])
        return {
            "today_events": [{"time": "Notice", "title": f"Calendar error: {e}", "location": "", "hour": 9, "all_day": False}],
            "all_day": all_day,
            "timeline": timeline,
            "upcoming_7d": [],
        }


def fetch_google_tasks():
    """Fetches To-Do and recently Completed tasks from Google Tasks API."""
    creds = _get_google_creds()
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
        return {"todo": todo[:6], "done": done[:4]}
    except Exception:
        return {"todo": ["Google Tasks scope not authorized in token.json"], "done": []}


def fetch_gmail_updates():
    """Fetches top unread/important primary Gmail headers (Sender + Subject)."""
    creds = _get_google_creds()
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


def fetch_keep_notes():
    """Fetches pinned/important Google Keep notes from local cache or gkeepapi."""
    keep_cache = os.path.join(BASE_DIR, "keep_notes.json")
    if os.path.exists(keep_cache):
        try:
            with open(keep_cache, encoding="utf-8") as f:
                return json.load(f)[:3]
        except Exception:
            pass

    keep_user = os.getenv("GOOGLE_KEEP_USERNAME", "").strip()
    keep_token = os.getenv("GOOGLE_KEEP_MASTER_TOKEN", "").strip()
    if keep_user and keep_token:
        try:
            import gkeepapi

            keep = gkeepapi.Keep()
            keep.authenticate(keep_user, keep_token)
            notes = []
            for n in keep.all():
                if n.pinned and not n.trashed and not n.archived:
                    notes.append({
                        "title": (n.title or "Pinned Note")[:28],
                        "snippet": (n.text or "").replace("\n", " • ")[:90],
                    })
            if notes:
                return notes[:3]
        except Exception:
            pass

    return [
        {"title": "Pinned Focus", "snippet": "Prioritize deep work before noon; log gym sessions via Garmin."},
    ]
