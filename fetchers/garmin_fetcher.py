#!/usr/bin/env python3
"""
Deterministic Garmin Connect fetcher (0 AI API calls).
Fetches this month's gym/workout sessions, builds a monthly calendar grid
for the broadsheet, and pulls daily recovery vitals.
"""
import calendar
import os
from datetime import date, datetime, timedelta
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

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


def build_month_grid(year: int, month: int, gym_days: set, today_day: int):
    """
    Returns a list of weeks (Sunday-first) where each cell is:
    {"day": int | None, "is_gym": bool, "is_today": bool, "is_future": bool}
    """
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


def fetch_garmin_stats():
    today = date.today()
    first_of_month = today.replace(day=1)
    month_name = today.strftime("%B %Y")
    month_short = today.strftime("%b").upper()

    username = os.getenv("GARMIN_USERNAME", "").strip()
    password = os.getenv("GARMIN_PASSWORD", "").strip()
    tokenstore = os.path.join(BASE_DIR, ".garth")

    gym_days = set()
    gym_sessions = []
    resting_hr = "--"
    steps_yesterday = "--"
    sleep_hours = "--"
    status = "Offline / Unconfigured"

    if username and password and password != "your_garmin_password" and "\n" not in password:
        try:
            from garminconnect import Garmin

            client = Garmin(username, password)
            if os.path.exists(tokenstore):
                try:
                    client.login(tokenstore)
                except Exception:
                    client.login()
                    client.garth.dump(tokenstore)
            else:
                client.login()
                os.makedirs(tokenstore, exist_ok=True)
                client.garth.dump(tokenstore)

            # 1. Fetch activities from 1st of current month to today
            activities = client.get_activities_by_date(
                first_of_month.isoformat(), today.isoformat()
            )
            for act in activities:
                act_type = (
                    act.get("activityType", {}).get("typeKey", "") or ""
                ).lower()
                act_name = act.get("activityName", "Workout")
                start_local = act.get("startTimeLocal", "")  # e.g. "2026-10-04 17:30:00"
                duration_min = round((act.get("duration") or 0) / 60)

                # Consider gym/fitness types or any logged workout
                is_gym = (
                    any(k in act_type for k in GYM_ACTIVITY_TYPES)
                    or "gym" in act_name.lower()
                    or "lift" in act_name.lower()
                    or "strength" in act_name.lower()
                    or "workout" in act_name.lower()
                    or bool(act_type)
                )
                if is_gym and start_local:
                    dt = datetime.fromisoformat(start_local.replace(" ", "T"))
                    gym_days.add(dt.day)
                    gym_sessions.append({
                        "day": dt.day,
                        "date": dt.strftime("%b %d"),
                        "label": f"{act_name[:14]} ({duration_min}m)",
                    })

            gym_sessions.sort(key=lambda x: x["day"])

            # 2. Fetch daily summary / vitals
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
        except Exception as e:
            status = f"Sync Notice ({type(e).__name__})"

    last_gym = (
        f"{gym_sessions[-1]['date']} — {gym_sessions[-1]['label']}"
        if gym_sessions
        else "No sessions logged yet this month"
    )

    return {
        "month_name": month_name,
        "month_short": month_short,
        "gym_count": len(gym_days),
        "gym_days": sorted(gym_days),
        "gym_sessions": gym_sessions[-8:],  # most recent 8 sessions
        "month_grid": build_month_grid(today.year, today.month, gym_days, today.day),
        "last_gym": last_gym,
        "resting_hr": resting_hr,
        "steps_yesterday": steps_yesterday,
        "sleep_hours": sleep_hours,
        "status": status,
    }
