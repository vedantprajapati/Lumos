#!/usr/bin/env python3
"""
Pluggable adapter & schema normalizer for Meta Muse RPC tool-call outputs.

Meta Muse accesses connected tools in the cloud:
  - Gmail updates (`gmail` / `gmail_updates`)
  - Outlook email updates (`outlook` / `outlook_updates`)
  - Google Calendar today (`events` / `gcal_today`)
  - Google Calendar next 7 days (`gcal_upcoming` / `gcal_next_7_days`)
  - Google Tasks to-do & done (`tasks_todo`, `tasks_done`, or `tasks`)
  - Google Keep notes (`keep` / `keep_notes`)
  - Optional summary note (`note`)

This module accepts raw tool-call dicts, strings, or structured objects from Muse
and normalizes them into the exact shape required by `briefing_template.html`.
"""
from datetime import datetime
from typing import Any, Dict, List, Tuple

TIMELINE_HOURS = list(range(7, 22))  # 7 AM to 9 PM (21:00)


def _parse_hour(time_str: str) -> Tuple[int, bool]:
    """Extracts 24-hour integer (7..21) and all_day boolean from any time string."""
    if not time_str:
        return 9, False
    t_clean = time_str.strip()
    if "all day" in t_clean.lower() or "all-day" in t_clean.lower():
        return 8, True

    # Handle ISO datetime strings e.g. "2026-10-19T14:30:00-04:00"
    if "T" in t_clean and len(t_clean) >= 13:
        try:
            dt = datetime.fromisoformat(t_clean)
            return dt.hour, False
        except Exception:
            pass

    # Handle "09:00 AM - 10:00 AM", "9:30 AM", "14:00"
    start_part = t_clean.split("-")[0].split("–")[0].strip()
    for fmt in ("%I:%M %p", "%I %p", "%H:%M"):
        try:
            dt = datetime.strptime(start_part.upper(), fmt)
            return dt.hour, False
        except ValueError:
            continue
    return 9, False


def normalize_gcal_today(raw_events: List[Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Normalizes Muse's today calendar tool output and maps onto the 7 AM - 9 PM timeline.
    Accepts items like:
      - {"time": "9:00 AM - 10:00 AM", "title": "Standup", "location": "Meet"}
      - {"start": "2026-10-19T09:00:00", "summary": "Standup"}
      - "9:00 AM: Standup"
    """
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
            "title": str(title)[:42],
            "location": str(loc)[:32],
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
    """
    Normalizes Muse's next-7-days calendar tool output.
    Accepts dicts (`{"day": "Wed Oct 21", "time": "2:00 PM", "title": "..."}`) or strings.
    """
    out = []
    for item in raw_upcoming or []:
        if isinstance(item, str):
            parts = item.split("—", 1) if "—" in item else item.split("-", 1)
            day_time = parts[0].strip()
            title = parts[1].strip() if len(parts) > 1 else item
            out.append({"day": day_time[:14], "time": "", "title": title[:44]})
        elif isinstance(item, dict):
            day = item.get("day") or item.get("date") or ""
            time = item.get("time") or item.get("start") or ""
            title = item.get("title") or item.get("summary") or "Upcoming Event"
            out.append({"day": str(day)[:12], "time": str(time)[:10], "title": str(title)[:44]})
    return out[:6]


def normalize_emails(raw_emails: List[Any]) -> List[Dict[str, str]]:
    """
    Normalizes Muse's Gmail or Outlook tool output.
    Accepts dicts (`{"sender": "...", "subject": "..."}` or `{"from": "...", "snippet": "..."}`) or strings.
    """
    out = []
    for item in raw_emails or []:
        if isinstance(item, str):
            if ":" in item:
                sender, subj = item.split(":", 1)
                out.append({"sender": sender.strip()[:18], "subject": subj.strip()[:55]})
            else:
                out.append({"sender": "Update", "subject": item.strip()[:55]})
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
                "subject": str(subject).strip()[:55],
            })
    return out[:4]


def normalize_tasks(raw_payload: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """
    Normalizes Muse's Google Tasks tool output into (tasks_todo, tasks_done).
    Supports:
      - Separate `tasks_todo` and `tasks_done` lists
      - Single `tasks` / `google_tasks` list of dicts with `{"title": "...", "status": "completed"|"needsAction"|"done"}`
    """
    todo: List[str] = []
    done: List[str] = []

    for t in raw_payload.get("tasks_todo") or []:
        if isinstance(t, dict):
            todo.append(str(t.get("title") or t.get("text") or "").strip())
        else:
            todo.append(str(t).strip())

    for t in raw_payload.get("tasks_done") or []:
        if isinstance(t, dict):
            done.append(str(t.get("title") or t.get("text") or "").strip())
        else:
            done.append(str(t).strip())

    combined = raw_payload.get("tasks") or raw_payload.get("google_tasks") or []
    for item in combined:
        if isinstance(item, dict):
            title = str(item.get("title") or item.get("name") or "").strip()
            status = str(item.get("status") or "").lower()
            is_done = bool(item.get("done") or item.get("completed") or status in ("completed", "done"))
            if is_done:
                done.append(title)
            else:
                todo.append(title)
        elif isinstance(item, str) and not todo:
            todo.append(item.strip())

    return [x[:48] for x in todo if x][:5], [x[:48] for x in done if x][:3]


def normalize_keep_notes(raw_keep: List[Any]) -> List[Dict[str, str]]:
    """
    Normalizes Muse's Google Keep tool output into `[{"title": "...", "snippet": "..."}]`.
    """
    out = []
    for item in raw_keep or []:
        if isinstance(item, str):
            if ":" in item:
                title, body = item.split(":", 1)
                out.append({"title": title.strip()[:24], "snippet": body.strip()[:90]})
            else:
                out.append({"title": "KEEP NOTE", "snippet": item.strip()[:90]})
        elif isinstance(item, dict):
            title = item.get("title") or item.get("label") or "KEEP NOTE"
            snippet = item.get("snippet") or item.get("text") or item.get("body") or item.get("content") or ""
            out.append({
                "title": str(title).strip()[:24],
                "snippet": str(snippet).replace("\n", " • ").strip()[:90],
            })
    return out[:3]
