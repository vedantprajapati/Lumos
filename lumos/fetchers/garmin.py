#!/usr/bin/env python3
"""
Deterministic Garmin Connect fetcher (0 AI API calls).
Logs in with per-user credentials from `.env` (caching OAuth tokens in `.garth/<user>/`),
fetches this month's gym/workout activities, builds the monthly calendar grid,
and retrieves daily recovery vitals. Falls back to realistic sample data when
unconfigured so local mock renders display shaded gym days.
"""
import calendar
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set
from lumos.config import resolve_user

GYM_ACTIVITY_TYPES = {
    "strength_training",
    "indoor_cardio",
    "fitness_equipment",
    "treadmill_running",
    "indoor_cycling",
    "indoor_rowing",
    "elliptical",
    "stair_climbing",
    "hiit",
    "yoga",
    "pilates",
    "breathwork",
    "cardio",
    "gym",
    "workout",
}


def build_month_grid(year: int, month: int, gym_days: Set[int], today_day: int) -> List[List[Dict[str, Any]]]:
    cal = calendar.Calendar(firstweekday=6)  # Sunday first
    weeks = []
    for week in cal.monthdayscalendar(year, month):
        row = []
        for d in week:
            if d == 0:
                row.append({"day": None, "is_gym": False, "is_today": False, "is_future": False})
            else:
                row.append({
                    "day": d,
                    "is_gym": d in gym_days,
                    "is_today": d == today_day,
                    "is_future": d > today_day,
                })
        weeks.append(row)
    return weeks


def _is_gym_activity(act_type: str, act_name: str) -> bool:
    t_low = act_type.lower()
    n_low = act_name.lower()
    return (
        any(k in t_low for k in GYM_ACTIVITY_TYPES)
        or any(k in n_low for k in ("gym", "lift", "strength", "workout", "weights", "cardio", "fitness"))
        or bool(t_low)
    )


def _mock_garmin_fallback(user_slug: str, today: date) -> Dict[str, Any]:
    """Returns realistic mock gym days up to `today.day` when credentials are not yet set."""
    sample_candidates = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]
    gym_days = {d for d in sample_candidates if d <= today.day}
    if today.day >= 1:
        gym_days.add(max(1, today.day - 1))

    month_abbr = today.strftime("%b")
    gym_sessions = [
        {"day": d, "date": f"{month_abbr} {d:02d}", "label": "Strength & Lift (55m)"}
        for d in sorted(gym_days)
    ]
    last_gym = (
        f"{gym_sessions[-1]['date']} — {gym_sessions[-1]['label']}"
        if gym_sessions
        else "No sessions logged yet this month"
    )
    return {
        "user": user_slug,
        "month_name": today.strftime("%B %Y"),
        "month_short": month_abbr.upper(),
        "gym_count": len(gym_days),
        "gym_days": sorted(gym_days),
        "gym_sessions": gym_sessions[-8:],
        "month_grid": build_month_grid(today.year, today.month, gym_days, today.day),
        "last_gym": last_gym,
        "resting_hr": "54",
        "steps_yesterday": "11,480",
        "sleep_hours": "7h 45m",
        "status": "Sample Preview (set GARMIN_PASSWORD in .env for live sync)",
        "error": None,
    }


def fetch_garmin_stats(user: Optional[str] = None) -> Dict[str, Any]:
    u_cfg = resolve_user(user)
    today = date.today()
    first_of_month = today.replace(day=1)
    month_name = today.strftime("%B %Y")
    month_short = today.strftime("%b").upper()

    username = u_cfg.garmin_username
    password = u_cfg.garmin_password
    tokenstore = str(u_cfg.garth_dir)

    has_valid_pw = bool(password and password != "your_garmin_password" and "\n" not in password)
    has_cached_tokens = u_cfg.garth_dir.exists() and any(u_cfg.garth_dir.iterdir())

    if not username or (not has_valid_pw and not has_cached_tokens):
        return _mock_garmin_fallback(u_cfg.slug, today)

    gym_days: Set[int] = set()
    gym_sessions: List[Dict[str, Any]] = []
    resting_hr = "--"
    steps_yesterday = "--"
    sleep_hours = "--"

    try:
        from garminconnect import Garmin

        client = Garmin(username, password if has_valid_pw else "")
        if has_cached_tokens:
            try:
                client.login(tokenstore)
            except Exception:
                if not has_valid_pw:
                    raise
                client.login()
                u_cfg.garth_dir.mkdir(parents=True, exist_ok=True)
                client.garth.dump(tokenstore)
        else:
            client.login()
            u_cfg.garth_dir.mkdir(parents=True, exist_ok=True)
            client.garth.dump(tokenstore)

        activities = client.get_activities_by_date(
            first_of_month.isoformat(), today.isoformat()
        )
        for act in activities:
            act_type = act.get("activityType", {}).get("typeKey", "") or ""
            act_name = act.get("activityName", "Workout") or "Workout"
            start_local = act.get("startTimeLocal", "")
            duration_min = round((act.get("duration") or 0) / 60)

            if _is_gym_activity(act_type, act_name) and start_local:
                dt = datetime.fromisoformat(start_local.replace(" ", "T"))
                gym_days.add(dt.day)
                gym_sessions.append({
                    "day": dt.day,
                    "date": dt.strftime("%b %d"),
                    "type": act_type,
                    "name": act_name,
                    "duration_min": duration_min,
                    "label": f"{act_name[:14]} ({duration_min}m)",
                })

        gym_sessions.sort(key=lambda x: x["day"])

        try:
            stats = client.get_stats(today.isoformat())
            rhr = stats.get("restingHeartRate")
            if rhr:
                resting_hr = str(rhr)
            yesterday = (today - timedelta(days=1)).isoformat()
            y_stats = client.get_stats(yesterday)
            steps = y_stats.get("totalSteps")
            if steps is not None:
                steps_yesterday = f"{steps:,}"
        except Exception:
            pass

        try:
            sleep = client.get_sleep_data(today.isoformat())
            sleep_sec = (
                sleep.get("dailySleepDTO", {}).get("sleepTimeSeconds") or 0
            )
            if sleep_sec:
                sleep_hours = f"{sleep_sec // 3600}h {(sleep_sec % 3600) // 60:02d}m"
        except Exception:
            pass

        status = "Live Sync"
        error_detail = None
    except Exception as e:
        fallback = _mock_garmin_fallback(u_cfg.slug, today)
        fallback["status"] = f"Sync Error ({type(e).__name__})"
        fallback["error"] = str(e)
        return fallback

    last_gym = (
        f"{gym_sessions[-1]['date']} — {gym_sessions[-1]['label']}"
        if gym_sessions
        else "No sessions logged yet this month"
    )

    return {
        "user": u_cfg.slug,
        "month_name": month_name,
        "month_short": month_short,
        "gym_count": len(gym_days),
        "gym_days": sorted(gym_days),
        "gym_sessions": gym_sessions[-8:],
        "month_grid": build_month_grid(today.year, today.month, gym_days, today.day),
        "last_gym": last_gym,
        "resting_hr": resting_hr,
        "steps_yesterday": steps_yesterday,
        "sleep_hours": sleep_hours,
        "status": status,
        "error": error_detail,
    }
