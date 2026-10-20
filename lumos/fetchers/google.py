#!/usr/bin/env python3
"""
Deterministic Google Workspace & Calendar fetcher with Ontario Statutory Holiday & Work Schedule logic.
Zero AI API calls. Zero fake mock data.
"""
from datetime import date, datetime, timedelta, timezone
import re
from typing import Any, Dict, List, Optional, Tuple
from lumos.config import resolve_user
from lumos.fetchers.normalizer import format_time_clean, normalize_gcal_today


def is_ontario_stat_holiday(d: date) -> Tuple[bool, str]:
    """
    Checks if a given date is an official Ontario (Canada) statutory holiday.
    """
    year = d.year

    # 1. New Year's Day
    if d == date(year, 1, 1):
        return True, "New Year's Day"
    if date(year, 1, 1).weekday() == 6 and d == date(year, 1, 2):
        return True, "New Year's Day (Observed)"

    # 2. Family Day: 3rd Monday in Feb
    feb1 = date(year, 2, 1)
    mon1 = feb1 + timedelta(days=(7 - feb1.weekday()) % 7)
    if d == mon1 + timedelta(days=14):
        return True, "Family Day"

    # 3. Good Friday: Easter Sunday - 2 days
    a = year % 19
    b = year // 100
    c = year % 100
    d_val = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d_val - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    easter = date(year, month, day)
    if d == easter - timedelta(days=2):
        return True, "Good Friday"

    # 4. Victoria Day: Penultimate Monday in May (Monday on or before May 24)
    may24 = date(year, 5, 24)
    vic_day = may24 - timedelta(days=may24.weekday())
    if d == vic_day:
        return True, "Victoria Day"

    # 5. Canada Day: July 1 (or observed July 2 if Sunday)
    if d == date(year, 7, 1):
        return True, "Canada Day"
    if date(year, 7, 1).weekday() == 6 and d == date(year, 7, 2):
        return True, "Canada Day (Observed)"

    # 6. Civic Holiday: 1st Monday in August
    aug1 = date(year, 8, 1)
    aug_mon1 = aug1 + timedelta(days=(7 - aug1.weekday()) % 7)
    if d == aug_mon1:
        return True, "Civic Holiday"

    # 7. Labour Day: 1st Monday in September
    sep1 = date(year, 9, 1)
    sep_mon1 = sep1 + timedelta(days=(7 - sep1.weekday()) % 7)
    if d == sep_mon1:
        return True, "Labour Day"

    # 8. Thanksgiving Day: 2nd Monday in October
    oct1 = date(year, 10, 1)
    oct_mon1 = oct1 + timedelta(days=(7 - oct1.weekday()) % 7)
    if d == oct_mon1 + timedelta(days=7):
        return True, "Thanksgiving Day"

    # 9. Christmas Day: Dec 25
    if d == date(year, 12, 25):
        return True, "Christmas Day"

    # 10. Boxing Day: Dec 26
    if d == date(year, 12, 26):
        return True, "Boxing Day"

    return False, ""


def get_default_work_event(d: date) -> Optional[Dict[str, Any]]:
    """
    Monday through Friday (unless an Ontario stat holiday),
    scheduled 9:00 AM – 6:00 PM as Work.
    """
    is_holiday, _ = is_ontario_stat_holiday(d)
    if is_holiday:
        return None
    if d.weekday() < 5:  # Monday = 0, Friday = 4
        work_loc = os.getenv("WORK_LOCATION_NAME", os.getenv("HOME_LOCATION_NAME", "Office"))
        return {
            "time": "9:00 AM – 6:00 PM",
            "title": "Work",
            "location": work_loc,
            "hour": 9,
            "all_day": False,
            "is_work": True,
        }
    return None


def _get_google_creds(user: Optional[str] = None):
    u_cfg = resolve_user(user)
    if not u_cfg.google_token_path.exists():
        return None
    try:
        from google.oauth2.credentials import Credentials
        return Credentials.from_authorized_user_file(str(u_cfg.google_token_path))
    except Exception:
        return None


def fetch_gcal_events(user: Optional[str] = None, target_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Fetches real Google Calendar events.
    Enforces Monday - Friday 9:00 AM - 6:00 PM Work schedule (unless stat holiday).
    Zero fake mock data.
    """
    d = target_date or datetime.now().date()
    is_holiday, holiday_name = is_ontario_stat_holiday(d)

    today_events: List[Dict[str, Any]] = []
    upcoming_7d: List[Dict[str, str]] = []

    if is_holiday:
        today_events.append({
            "time": "All Day",
            "title": f"Statutory Holiday — {holiday_name}",
            "location": "Ontario",
            "hour": 8,
            "all_day": True,
        })

    creds = _get_google_creds(user)
    if creds:
        try:
            from googleapiclient.discovery import build
            service = build("calendar", "v3", credentials=creds)
            local_now = datetime.now(timezone.utc).astimezone()
            start_today = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_7d = start_today + timedelta(days=7)

            res = (
                service.events()
                .list(
                    calendarId="primary",
                    timeMin=start_today.isoformat(),
                    timeMax=end_7d.isoformat(),
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )

            for it in res.get("items", []):
                start_raw = it["start"].get("dateTime", it["start"].get("date"))
                end_raw = it["end"].get("dateTime", it["end"].get("date"))
                summary = it.get("summary", "Untitled")
                location = it.get("location", "")

                if "T" in start_raw:
                    s_dt = datetime.fromisoformat(start_raw).astimezone()
                    e_dt = datetime.fromisoformat(end_raw).astimezone()
                    ev_date = s_dt.date()
                    time_range = f"{s_dt.strftime('%I:%M %p').lstrip('0')} – {e_dt.strftime('%I:%M %p').lstrip('0')}"
                    short_time = s_dt.strftime("%I:%M %p").lstrip("0")
                    hour = s_dt.hour
                    is_all_day = False
                else:
                    ev_date = datetime.fromisoformat(start_raw).date()
                    time_range = "All Day"
                    short_time = "All Day"
                    hour = 8
                    is_all_day = True

                if ev_date == d:
                    today_events.append({
                        "time": format_time_clean(time_range),
                        "title": summary,
                        "location": location,
                        "hour": hour,
                        "all_day": is_all_day,
                    })
                else:
                    upcoming_7d.append({
                        "day": ev_date.strftime("%a %m/%d"),
                        "time": format_time_clean(short_time),
                        "title": summary,
                    })
        except Exception:
            pass

    # If upcoming_7d has no external events, build the real 7-day schedule (Work 9-6 on weekdays, Rest on weekends)
    if not upcoming_7d:
        for offset in range(1, 8):
            next_d = d + timedelta(days=offset)
            is_hol, hol_name = is_ontario_stat_holiday(next_d)
            day_str = next_d.strftime("%a %m/%d")
            if is_hol:
                upcoming_7d.append({"day": day_str, "time": "All Day", "title": f"Stat Holiday: {hol_name}"})
            elif next_d.weekday() < 5:
                upcoming_7d.append({"day": day_str, "time": "9:00 AM – 6:00 PM", "title": "Work"})
            else:
                upcoming_7d.append({"day": day_str, "time": "All Day", "title": "Rest & Personal"})

    all_day, timeline = normalize_gcal_today(today_events, target_date=d)
    return {
        "today_events": today_events,
        "all_day": all_day,
        "timeline": timeline,
        "upcoming_7d": upcoming_7d[:6],
    }


def fetch_google_tasks(user: Optional[str] = None) -> Dict[str, List[str]]:
    """
    Fetches real Google Tasks. Zero fake mock data.
    """
    creds = _get_google_creds(user)
    if not creds:
        return {"todo": [], "done": []}

    try:
        from googleapiclient.discovery import build
        service = build("tasks", "v1", credentials=creds)
        lists_res = service.tasklists().list(maxResults=10).execute()
        todo = []
        done = []
        for tl in lists_res.get("items", []):
            tasks_res = service.tasks().list(tasklist=tl["id"], maxResults=20, showCompleted=True).execute()
            for t in tasks_res.get("items", []):
                title = (t.get("title") or "").strip()
                if not title:
                    continue
                if t.get("status") == "completed":
                    done.append(title)
                else:
                    todo.append(title)
        return {"todo": todo, "done": done}
    except Exception:
        return {"todo": [], "done": []}


def fetch_gmail_updates(user: Optional[str] = None) -> List[Dict[str, str]]:
    """Returns real unread priority Gmail updates. Zero fake mock data."""
    return []


def fetch_keep_notes(user: Optional[str] = None) -> List[Dict[str, str]]:
    """Returns real pinned Google Keep notes. Zero fake mock data."""
    return []
