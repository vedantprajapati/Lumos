#!/usr/bin/env python3
"""
Pluggable adapter & schema normalizer for Muse RPC tool-call outputs.
"""
from datetime import datetime
from typing import Any, Dict, List, Tuple

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


def normalize_gcal_today(raw_events: List[Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    slots = {h: [] for h in TIMELINE_HOURS}
    all_day = []

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


def normalize_gcal_upcoming(raw_upcoming: List[Any]) -> List[Dict[str, str]]:
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


def _clean_task_title(val: Any) -> str:
    s = str(val or "").strip()
    if len(s) > 42:
        cutoff = s[:42].rfind(" ")
        if cutoff > 25:
            return s[:cutoff] + "..."
        return s[:40] + "..."
    return s


def normalize_tasks(raw_payload: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    todo: List[str] = []
    done: List[str] = []

    for t in raw_payload.get("tasks_todo") or []:
        if isinstance(t, dict):
            todo.append(_clean_task_title(t.get("title") or t.get("text")))
        else:
            todo.append(_clean_task_title(t))

    for t in raw_payload.get("tasks_done") or []:
        if isinstance(t, dict):
            done.append(_clean_task_title(t.get("title") or t.get("text")))
        else:
            done.append(_clean_task_title(t))

    combined = raw_payload.get("tasks") or raw_payload.get("google_tasks") or []
    for item in combined:
        if isinstance(item, dict):
            title = _clean_task_title(item.get("title") or item.get("name"))
            status = str(item.get("status") or "").lower()
            is_done = bool(item.get("done") or item.get("completed") or status in ("completed", "done"))
            if is_done:
                done.append(title)
            else:
                todo.append(title)
        elif isinstance(item, str) and not todo:
            todo.append(_clean_task_title(item))

    return [x for x in todo if x][:5], [x for x in done if x][:3]


def normalize_keep_notes(raw_keep: List[Any]) -> List[Dict[str, str]]:
    out = []
    for item in raw_keep or []:
        if isinstance(item, str):
            if ":" in item:
                title, body = item.split(":", 1)
                out.append({"title": title.strip()[:24], "snippet": body.strip()[:80]})
            else:
                out.append({"title": "KEEP NOTE", "snippet": item.strip()[:80]})
        elif isinstance(item, dict):
            title = item.get("title") or item.get("label") or "KEEP NOTE"
            snippet = item.get("snippet") or item.get("text") or item.get("body") or item.get("content") or ""
            out.append({
                "title": str(title).strip()[:24],
                "snippet": str(snippet).replace("\n", " • ").strip()[:80],
            })
    return out[:3]
