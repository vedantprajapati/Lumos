#!/usr/bin/env python3
"""
MinMax Workout Routine Tracker for Lumos.
Detects if today is a scheduled workout day from Google Calendar or Google Tasks,
and extracts the targeted MinMax routine from Muse artifacts or local tracker configs.
"""
from datetime import datetime
import json
import os
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple

from lumos.config import BASE_DIR, resolve_user

WORKOUT_KEYWORDS = [
    r"\bgym\b",
    r"\bworkout\b",
    r"\blift\b",
    r"\blifting\b",
    r"\btraining\b",
    r"\bstrength\b",
    r"\bpush\b",
    r"\bpull\b",
    r"\blegs\b",
    r"\bquads\b",
    r"\bchest\b",
    r"\bback\b",
    r"\bshoulders\b",
    r"\barms\b",
    r"\bexercise\b",
    r"\bcardio\b",
    r"\bfitness\b",
]

SPLIT_HINTS = {
    "push": ["push", "chest", "bench", "tricep"],
    "pull": ["pull", "back", "row", "deadlift", "bicep"],
    "legs": ["leg", "squat", "quad", "hamstring", "calves"],
    "upper": ["upper", "torso", "press"],
    "cardio": ["cardio", "run", "cycle", "recovery"],
}


def is_workout_day(today_events: List[Dict[str, Any]], tasks_todo: List[str]) -> Tuple[bool, str, str]:
    """
    Checks if a workout is specified for today in Google Calendar or Google Tasks.
    Returns: (is_scheduled: bool, detected_trigger: str, split_hint: str)
    """
    trigger_text = ""
    split_hint = ""

    # 1. Check Google Calendar today
    for ev in today_events or []:
        title = (ev.get("title") or "").lower()
        loc = (ev.get("location") or "").lower()
        combined = f"{title} {loc}"
        if any(re.search(kw, combined) for kw in WORKOUT_KEYWORDS):
            trigger_text = ev.get("title", "Scheduled Workout")
            for split, hints in SPLIT_HINTS.items():
                if any(h in combined for h in hints):
                    split_hint = split
                    break
            return True, trigger_text, split_hint

    # 2. Check Google Tasks to-do
    for t in tasks_todo or []:
        t_low = t.lower()
        if any(re.search(kw, t_low) for kw in WORKOUT_KEYWORDS):
            trigger_text = t
            for split, hints in SPLIT_HINTS.items():
                if any(h in t_low for h in hints):
                    split_hint = split
                    break
            return True, trigger_text, split_hint

    return False, "", ""


def _load_tracker_data(user_slug: str) -> Dict[str, Any]:
    """Loads MinMax tracker data from user archive or base repo file."""
    u_cfg = resolve_user(user_slug)
    user_file = u_cfg.archive_dir / "minmax_tracker.json"
    if user_file.exists():
        try:
            return json.loads(user_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    base_file = BASE_DIR / "minmax_tracker.json"
    if base_file.exists():
        try:
            return json.loads(base_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def resolve_today_workout(
    today_events: List[Dict[str, Any]],
    tasks_todo: List[str],
    user: Optional[str] = None,
    muse_payload: Optional[Dict[str, Any]] = None,
    dt: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    """
    Resolves the MinMax workout routine for today IF scheduled in GCal or Google Tasks.
    Returns None if today is not a workout day.
    """
    is_scheduled, trigger_text, split_hint = is_workout_day(today_events, tasks_todo)
    payload = muse_payload or {}

    # If Muse explicitly passed a workout routine or MinMax tracker artifact in the payload,
    # honor it directly
    explicit_routine = payload.get("workout_routine") or payload.get("minmax_routine")
    if explicit_routine:
        if isinstance(explicit_routine, dict):
            return explicit_routine
        if isinstance(explicit_routine, str):
            return {
                "title": "MinMax Workout",
                "focus": trigger_text or "Daily Split",
                "exercises": [e.strip() for e in explicit_routine.split("\n") if e.strip()][:5],
            }

    # If not scheduled in calendar or tasks, hide the routine card
    if not is_scheduled:
        return None

    dt = dt or datetime.now()
    day_name = dt.strftime("%A")
    u_cfg = resolve_user(user)
    tracker = _load_tracker_data(u_cfg.slug)
    splits = tracker.get("splits", {})
    weekly = tracker.get("weekly_schedule", {})

    target_key = split_hint or weekly.get(day_name, "push")
    split_data = splits.get(target_key) or splits.get("push", {
        "title": "MinMax Hypertrophy",
        "focus": "Full Body Strength & Capacity",
        "exercises": [
            "Barbell Compound Movement — 3 × 6–8 (RPE 8)",
            "Secondary Compound Press/Row — 3 × 8–10",
            "Targeted Accessory Lift — 3 × 10–12",
            "Core & Isolation Finisher — 3 × 15",
        ],
    })

    return {
        "is_active": True,
        "trigger": trigger_text,
        "day_name": day_name,
        "title": split_data.get("title", "MinMax Workout"),
        "focus": split_data.get("focus", "Strength & Hypertrophy"),
        "exercises": split_data.get("exercises", [])[:5],
    }
