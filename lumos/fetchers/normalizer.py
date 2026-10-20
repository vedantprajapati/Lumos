#!/usr/bin/env python3
"""
Pluggable adapter & schema normalizer for Muse RPC tool-call outputs.
Integrates Ontario statutory holidays and Monday - Friday 9-6 Work schedule.
Zero fake mock data.
"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

TIMELINE_HOURS = list(range(7, 22))  # 7 AM to 9 PM (21:00)


def _parse_hour(time_str: str) -> Tuple[int, bool]:
    if not time_str:
        return 9, False
    t_clean = time_str.strip()
    if "all day" in t_clean.lower() or "all-day" in t_clean.lower():
        return 8, True

    if "T" in t_clean and len(t_clean) >= 13:
        try:
            dt = datetime.fromisoformat(t_clean)
            return dt.hour, False
        except Exception:
            pass

    start_part = t_clean.split("-")[0].split("–")[0].strip()
    for fmt in ("%I:%M %p", "%I %p", "%H:%M"):
        try:
            dt = datetime.strptime(start_part.upper(), fmt)
            return dt.hour, False
        except ValueError:
            continue
    return 9, False


def normalize_gcal_today(
    raw_events: List[Any],
    target_date: Optional[date] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Normalizes today's events into hourly slots (7 AM - 9 PM) and all-day banners.
    Always enforces Monday - Friday 9:00 AM - 6:00 PM Work schedule unless an Ontario stat holiday.
    """
    from lumos.fetchers.google import get_default_work_event, is_ontario_stat_holiday

    d = target_date or datetime.now().date()
    is_holiday, holiday_name = is_ontario_stat_holiday(d)
    work_ev = get_default_work_event(d)

    slots: Dict[int, List[Dict[str, Any]]] = {h: [] for h in TIMELINE_HOURS}
    all_day: List[Dict[str, Any]] = []

    # 1. Statutory Holiday check
    if is_holiday:
        all_day.append({
            "time": "All Day",
            "title": f"Statutory Holiday — {holiday_name}",
            "location": "Ontario",
            "hour": 8,
            "all_day": True,
        })

    # 2. Process any external/calendar events
    has_work = False
    for item in raw_events or []:
        if isinstance(item, str):
            parts = item.split(":", 1) if ":" in item else ["09:00 AM", item]
            t_str = parts[0].strip()
            title = parts[1].strip() if len(parts) > 1 else item
            loc = ""
            hour, is_all_day = _parse_hour(t_str)
        elif isinstance(item, dict):
            t_str = (
                item.get("time")
                or item.get("start_time")
                or item.get("start")
                or "09:00 AM"
            )
            if isinstance(t_str, dict):
                t_str = t_str.get("dateTime") or t_str.get("date") or "All Day"
            title = (
                item.get("title")
                or item.get("summary")
                or item.get("name")
                or "Scheduled Event"
            )
            loc = item.get("location") or ""
            hour = item.get("hour")
            if hour is not None:
                is_all_day = bool(item.get("all_day", False))
            else:
                hour, is_all_day = _parse_hour(str(t_str))
        else:
            continue

        if "work" in str(title).lower():
            has_work = True

        ev_obj = {
            "time": str(t_str),
            "title": str(title)[:38],
            "location": str(loc)[:28],
            "hour": hour,
            "all_day": is_all_day,
        }
        if is_all_day:
            all_day.append(ev_obj)
        else:
            clamped = max(7, min(21, int(hour)))
            slots[clamped].append(ev_obj)

    # 3. Monday - Friday 9:00 AM - 6:00 PM Work block injection (unless stat holiday)
    if work_ev and not has_work:
        slots[9].insert(0, work_ev)

    timeline = []
    for h in TIMELINE_HOURS:
        suffix = "AM" if h < 12 else "PM"
        h12 = h if h <= 12 else h - 12
        timeline.append({
            "hour": h,
            "label": f"{h12} {suffix}",
            "events": slots[h],
            "is_work_hour": (9 <= h <= 17) and bool(work_ev),
        })
    return all_day, timeline


def normalize_gcal_upcoming(
    raw_upcoming: List[Any],
    target_date: Optional[date] = None,
) -> List[Dict[str, str]]:
    """
    Normalizes upcoming 7-day events. If no external events are queued,
    builds the real week horizon (Work 9-6 on weekdays, Rest on weekends/holidays).
    """
    from lumos.fetchers.google import is_ontario_stat_holiday

    d = target_date or datetime.now().date()
    out = []
    for item in raw_upcoming or []:
        if isinstance(item, str):
            parts = item.split("—", 1) if "—" in item else item.split("-", 1)
            day_time = parts[0].strip()
            title = parts[1].strip() if len(parts) > 1 else item
            out.append({"day": day_time[:14], "time": "", "title": title[:40]})
        elif isinstance(item, dict):
            day = item.get("day") or item.get("date") or ""
            time = item.get("time") or item.get("start") or ""
            title = item.get("title") or item.get("summary") or "Upcoming Event"
            out.append({"day": str(day)[:12], "time": str(time)[:10], "title": str(title)[:40]})

    if not out:
        for offset in range(1, 8):
            next_d = d + timedelta(days=offset)
            is_hol, hol_name = is_ontario_stat_holiday(next_d)
            day_str = next_d.strftime("%a %m/%d")
            if is_hol:
                out.append({"day": day_str, "time": "All Day", "title": f"Stat Holiday: {hol_name}"})
            elif next_d.weekday() < 5:
                out.append({"day": day_str, "time": "09:00 AM - 06:00 PM", "title": "Work"})
            else:
                out.append({"day": day_str, "time": "All Day", "title": "Rest & Personal"})

    return out[:6]


def normalize_emails(raw_emails: List[Any]) -> List[Dict[str, str]]:
    out = []
    for item in raw_emails or []:
        if isinstance(item, str):
            if ":" in item:
                sender, subj = item.split(":", 1)
                out.append({"sender": sender.strip()[:18], "subject": subj.strip()[:50]})
            else:
                out.append({"sender": "Update", "subject": item.strip()[:50]})
        elif isinstance(item, dict):
            sender = (
                item.get("sender")
                or item.get("from")
                or item.get("author")
                or "Inbox"
            )
            subject = (
                item.get("subject")
                or item.get("summary")
                or item.get("snippet")
                or item.get("title")
                or "(No Subject)"
            )
            out.append({
                "sender": str(sender).split("<")[0].replace('"', "").strip()[:18],
                "subject": str(subject).strip()[:50],
            })
    return out[:4]


def normalize_tasks(payload: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    tasks_raw = (
        payload.get("tasks_todo")
        or payload.get("tasks")
        or payload.get("google_tasks")
        or []
    )
    done_raw = payload.get("tasks_done") or []

    todo: List[str] = []
    done: List[str] = []

    if isinstance(tasks_raw, list):
        for t in tasks_raw:
            if isinstance(t, str):
                todo.append(t[:65])
            elif isinstance(t, dict):
                title = t.get("title") or t.get("task") or t.get("name") or ""
                if not title:
                    continue
                if t.get("status") == "completed" or t.get("done"):
                    done.append(str(title)[:65])
                else:
                    todo.append(str(title)[:65])

    if isinstance(done_raw, list):
        for t in done_raw:
            if isinstance(t, str):
                done.append(t[:65])
            elif isinstance(t, dict):
                title = t.get("title") or t.get("task") or t.get("name") or ""
                if title:
                    done.append(str(title)[:65])

    return todo[:5], done[:3]


def normalize_keep_notes(raw_notes: List[Any]) -> List[Dict[str, str]]:
    out = []
    for item in raw_notes or []:
        if isinstance(item, str):
            out.append({"title": "Note", "text": item[:120]})
        elif isinstance(item, dict):
            out.append({
                "title": (item.get("title") or "Note")[:24],
                "text": (item.get("text") or item.get("body") or "")[:120],
            })
    return out[:3]
