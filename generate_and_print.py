#!/usr/bin/env python3
"""
Lumos Daily Brief Generator & CUPS Dispatcher.
Combines pluggable Muse RPC tool-call outputs (`fetchers/muse_normalizer.py`)
with local deterministic Python fetchers (`garmin_fetcher.py`, `weather_fetcher.py`)
and persists daily artifacts in `~/Documents/digest/vedant/`.
"""
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from dotenv import load_dotenv
from jinja2 import Template

from fetchers.weather_fetcher import fetch_weather
from fetchers.garmin_fetcher import fetch_garmin_stats
from fetchers.google_fetcher import (
    fetch_gcal_events,
    fetch_gmail_updates,
    fetch_google_tasks,
    fetch_keep_notes,
)
from fetchers.muse_normalizer import (
    normalize_emails,
    normalize_gcal_today,
    normalize_gcal_upcoming,
    normalize_keep_notes,
    normalize_tasks,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
PRINTER_NAME = os.getenv("PRINTER_NAME", "Phomemo_M834")


def get_archive_dir() -> Path:
    """
    Returns `~/Documents/digest/vedant` (or `DIGEST_ARCHIVE_DIR` from `.env`),
    creating the directory tree if it does not already exist.
    """
    raw_dir = os.getenv("DIGEST_ARCHIVE_DIR", "~/Documents/digest/vedant")
    archive_path = Path(os.path.expanduser(raw_dir)).resolve()
    archive_path.mkdir(parents=True, exist_ok=True)
    return archive_path


def get_daily_artifact_paths(dt: Optional[datetime] = None) -> Tuple[Path, Path, Path]:
    """
    Returns (pdf_path, html_path, json_path) inside `~/Documents/digest/vedant/`
    for the given date (e.g. `2026-10-19_Lumos_Digest.pdf`).
    """
    dt = dt or datetime.now()
    date_prefix = dt.strftime("%Y-%m-%d")
    archive_dir = get_archive_dir()
    pdf_path = archive_dir / f"{date_prefix}_Lumos_Digest.pdf"
    html_path = archive_dir / f"{date_prefix}_Lumos_Digest.html"
    json_path = archive_dir / f"{date_prefix}_Lumos_Digest.json"
    return pdf_path, html_path, json_path


def format_ordinal_date(dt: datetime) -> str:
    """Formats date as e.g. 'October 19th 2026'."""
    day = dt.day
    if 11 <= (day % 100) <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{dt.strftime('%B')} {day}{suffix} {dt.year}"


def compute_year_progress(dt: datetime) -> Dict[str, Any]:
    day_of_year = dt.timetuple().tm_yday
    total_days = 366 if (dt.year % 4 == 0 and (dt.year % 100 != 0 or dt.year % 400 == 0)) else 365
    pct = round((day_of_year / total_days) * 100)
    return {
        "day_of_year": day_of_year,
        "total_days": total_days,
        "percent": pct,
    }


def _load_or_save_daily_payload(muse_payload: Optional[Dict[str, Any]], dt: datetime) -> Dict[str, Any]:
    """
    Saves incoming Muse RPC payload into `~/Documents/digest/vedant/YYYY-MM-DD_Lumos_Digest.json`
    (creating the file if it doesn't exist, or merging updates into today's file).
    If called without a payload (e.g. GPIO button press), loads today's saved JSON if present.
    """
    _, _, json_path = get_daily_artifact_paths(dt)
    existing: Dict[str, Any] = {}
    if json_path.exists():
        try:
            existing = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    if muse_payload:
        merged = {**existing, **muse_payload}
        json_path.write_text(json.dumps(merged, indent=2), encoding="utf-8")
        return merged

    if not json_path.exists():
        json_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    return existing


def build_briefing_context(custom_note: str = "", muse_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    today_dt = datetime.now()
    payload = _load_or_save_daily_payload(muse_payload, today_dt)
    ordinal_date = format_ordinal_date(today_dt)

    # 1. Dual-Location Weather: East Gwillimbury + Downtown Toronto (Open-Meteo, 0 AI calls)
    weather = payload.get("weather") or fetch_weather()

    # 2. Google Calendar: Today (Hourly Timeline 7 AM - 9 PM) + Next 7 Days
    raw_today = payload.get("gcal_today") or payload.get("events")
    raw_upcoming = payload.get("gcal_upcoming") or payload.get("gcal_next_7_days")

    if raw_today is not None or raw_upcoming is not None:
        all_day, timeline = normalize_gcal_today(raw_today or [])
        gcal_upcoming = normalize_gcal_upcoming(raw_upcoming or [])
    else:
        gcal_data = fetch_gcal_events()
        all_day = gcal_data["all_day"]
        timeline = gcal_data["timeline"]
        gcal_upcoming = gcal_data["upcoming_7d"][:6]

    # 3. Google Tasks: To-Do & Done
    if any(k in payload for k in ("tasks_todo", "tasks_done", "tasks", "google_tasks")):
        tasks_todo, tasks_done = normalize_tasks(payload)
    else:
        tasks_data = fetch_google_tasks()
        tasks_todo = tasks_data["todo"][:5]
        tasks_done = tasks_data["done"][:3]

    # 4. Gmail & Outlook Updates (from Muse tool output or local fallback)
    raw_gmail = payload.get("gmail_updates") or payload.get("gmail")
    gmail_updates = normalize_emails(raw_gmail) if raw_gmail is not None else fetch_gmail_updates()[:4]

    raw_outlook = payload.get("outlook_updates") or payload.get("outlook")
    outlook_updates = (
        normalize_emails(raw_outlook)
        if raw_outlook is not None
        else [{"sender": "Outlook", "subject": "No unread priority Outlook threads"}]
    )

    # 5. Google Keep Notes (from Muse tool output or local fallback)
    raw_keep = payload.get("keep_notes") or payload.get("keep") or payload.get("google_keep")
    keep_notes = normalize_keep_notes(raw_keep) if raw_keep is not None else fetch_keep_notes()[:3]

    # 6. Garmin Monthly Gym & Biometrics (via .env credentials, 0 AI calls)
    garmin = payload.get("garmin") or fetch_garmin_stats()

    # 7. Year Progress & Dispatch Note
    year_progress = compute_year_progress(today_dt)
    note = (
        custom_note
        or payload.get("note")
        or payload.get("muse_note")
        or "All local services healthy. GPIO 17 listener armed and CUPS print spooler active."
    )

    return {
        "header_title": f"Lumos Digest - Vedant - {ordinal_date}",
        "ordinal_date": ordinal_date,
        "date_str": today_dt.strftime("%A, %B %d, %Y"),
        "short_date": today_dt.strftime("%a, %b %d"),
        "location_name": "11 Blazing Star St, East Gwillimbury • Downtown Toronto",
        "weather": weather,
        "all_day_events": all_day[:2],
        "timeline": timeline,
        "gcal_upcoming": gcal_upcoming,
        "gmail_updates": gmail_updates,
        "outlook_updates": outlook_updates,
        "tasks_todo": tasks_todo,
        "tasks_done": tasks_done,
        "keep_notes": keep_notes,
        "garmin": garmin,
        "year_progress": year_progress,
        "quote": payload.get("quote", "We are what we repeatedly do. Excellence, then, is not an act, but a habit."),
        "quote_author": payload.get("quote_author", "Aristotle"),
        "muse_note": note,
    }


def render_html(custom_note: str = "", muse_payload: Optional[Dict[str, Any]] = None) -> str:
    ctx = build_briefing_context(custom_note=custom_note, muse_payload=muse_payload)
    template_path = os.path.join(BASE_DIR, "briefing_template.html")
    with open(template_path, encoding="utf-8") as f:
        rendered = Template(f.read()).render(**ctx)

    # Always save/update today's HTML artifact in ~/Documents/digest/vedant/
    _, html_path, _ = get_daily_artifact_paths()
    html_path.write_text(rendered, encoding="utf-8")
    return rendered


def generate_pdf(
    output_pdf: Optional[str] = None,
    custom_note: str = "",
    muse_payload: Optional[Dict[str, Any]] = None,
) -> str:
    default_pdf_path, _, _ = get_daily_artifact_paths()
    target_pdf = str(output_pdf or default_pdf_path)

    rendered = render_html(custom_note=custom_note, muse_payload=muse_payload)
    from weasyprint import HTML

    HTML(string=rendered).write_pdf(target_pdf)
    return target_pdf


def print_briefing(custom_note: str = "", muse_payload: Optional[Dict[str, Any]] = None) -> str:
    pdf = generate_pdf(custom_note=custom_note, muse_payload=muse_payload)
    try:
        check = subprocess.run(["lpstat", "-p", PRINTER_NAME], capture_output=True, text=True)
        if check.returncode == 0:
            subprocess.run(["lp", "-d", PRINTER_NAME, pdf], check=True)
            print(f"Dispatched {pdf} to {PRINTER_NAME}")
        else:
            print(f"Notice: Printer '{PRINTER_NAME}' not registered in CUPS yet. Saved at: {pdf}")
    except FileNotFoundError:
        print(f"Notice: CUPS 'lpstat' not found on this OS. Saved at: {pdf}")
    return pdf


if __name__ == "__main__":
    print_briefing()
