#!/usr/bin/env python3
"""
Core digest context builder, PDF renderer, and CUPS print dispatcher.
"""
import calendar
from datetime import date, datetime
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional
from jinja2 import Template

from lumos.config import (
    BASE_DIR,
    TEMPLATE_PATH,
    get_daily_artifact_paths,
    get_locations,
    get_printer_name,
    resolve_user,
)
from lumos.fetchers.garmin import fetch_garmin_stats
from lumos.fetchers.google import (
    fetch_gcal_events,
    fetch_gmail_updates,
    fetch_google_tasks,
    fetch_keep_notes,
)
from lumos.fetchers.minmax import resolve_today_workout
from lumos.fetchers.normalizer import (
    normalize_emails,
    normalize_gcal_today,
    normalize_gcal_upcoming,
    normalize_keep_notes,
    normalize_tasks,
)
from lumos.fetchers.weather import fetch_weather

MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
SPECIAL_DAYS = {
    (1, 1): "★",
    (2, 14): "♥",
    (7, 1): "♣",
    (10, 31): "♦",
    (12, 25): "✦",
}


def format_ordinal_date(dt: datetime) -> str:
    day = dt.day
    if 11 <= (day % 100) <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{dt.strftime('%B')} {day}{suffix} {dt.year}"


def compute_year_progress(dt: datetime) -> Dict[str, Any]:
    """
    Computes the 12-month visual calendar grid for `Year Progress`
    (matching the receipt-brief photo: JAN-DEC 2-column grid where elapsed days
    are filled black squares and future days are open bordered squares).
    """
    today_d = dt.date()
    year = today_d.year
    day_of_year = dt.timetuple().tm_yday
    total_days = 366 if calendar.isleap(year) else 365
    pct_float = (day_of_year / total_days) * 100.0

    cal = calendar.Calendar(firstweekday=6)  # Sunday-first
    months: List[Dict[str, Any]] = []

    for m_idx in range(1, 13):
        weeks_raw = cal.monthdayscalendar(year, m_idx)
        weeks = []
        for w in weeks_raw:
            row = []
            for d in w:
                if d == 0:
                    row.append({"day": None, "state": "pad", "icon": ""})
                else:
                    cell_date = date(year, m_idx, d)
                    icon = SPECIAL_DAYS.get((m_idx, d), "")
                    if cell_date < today_d:
                        state = "past"
                    elif cell_date == today_d:
                        state = "today"
                    else:
                        state = "future"
                    row.append({"day": d, "state": state, "icon": icon})
            weeks.append(row)
        months.append({
            "label": MONTH_LABELS[m_idx - 1],
            "month": m_idx,
            "weeks": weeks,
        })

    # Pair into 6 rows of 2 months ([JAN, FEB], [MAR, APR], ..., [NOV, DEC])
    month_pairs = [months[i : i + 2] for i in range(0, 12, 2)]

    return {
        "year": year,
        "day_of_year": day_of_year,
        "total_days": total_days,
        "percent": round(pct_float),
        "percent_exact": f"{pct_float:.1f}%",
        "months": months,
        "month_pairs": month_pairs,
    }


def _load_or_save_daily_payload(
    user_slug: str,
    muse_payload: Optional[Dict[str, Any]],
    dt: datetime,
) -> Dict[str, Any]:
    _, _, json_path = get_daily_artifact_paths(user_slug, dt)
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


def build_briefing_context(
    custom_note: str = "",
    muse_payload: Optional[Dict[str, Any]] = None,
    user: Optional[str] = None,
) -> Dict[str, Any]:
    raw_user = user or (muse_payload or {}).get("user")
    u_cfg = resolve_user(raw_user)
    today_dt = datetime.now()
    payload = _load_or_save_daily_payload(u_cfg.slug, muse_payload, today_dt)
    ordinal_date = format_ordinal_date(today_dt)

    # 1. Dual-Location Weather (East Gwillimbury + Downtown Toronto) + 24h Curve
    weather = payload.get("weather") or fetch_weather()

    # 2. Google Calendar: Today (Hourly Timeline 7 AM - 9 PM) + Next 7 Days
    target_d = today_dt.date()
    raw_today = payload.get("gcal_today") or payload.get("events")
    raw_upcoming = payload.get("gcal_upcoming") or payload.get("gcal_next_7_days")

    if raw_today is not None or raw_upcoming is not None:
        all_day, timeline = normalize_gcal_today(raw_today or [], target_date=target_d)
        gcal_upcoming = normalize_gcal_upcoming(raw_upcoming or [], target_date=target_d)
    else:
        gcal_data = fetch_gcal_events(user=u_cfg.slug, target_date=target_d)
        all_day = gcal_data["all_day"]
        timeline = gcal_data["timeline"]
        gcal_upcoming = gcal_data["upcoming_7d"][:6]

    # 3. Google Tasks: To-Do & Done
    if any(k in payload for k in ("tasks_todo", "tasks_done", "tasks", "google_tasks")):
        tasks_todo, tasks_done = normalize_tasks(payload)
    else:
        tasks_data = fetch_google_tasks(user=u_cfg.slug)
        tasks_todo = tasks_data["todo"][:5]
        tasks_done = tasks_data["done"][:3]

    # 4. Gmail & Outlook Updates (0 fake mock data)
    raw_gmail = payload.get("gmail_updates") or payload.get("gmail")
    gmail_updates = (
        normalize_emails(raw_gmail)
        if raw_gmail is not None
        else []
    )

    raw_outlook = payload.get("outlook_updates") or payload.get("outlook")
    outlook_updates = (
        normalize_emails(raw_outlook)
        if raw_outlook is not None
        else []
    )

    # 5. Google Keep Notes (0 fake mock data)
    raw_keep = payload.get("keep_notes") or payload.get("keep") or payload.get("google_keep")
    keep_notes = normalize_keep_notes(raw_keep) if raw_keep is not None else []

    # 6. Garmin Monthly Gym & Biometrics
    garmin = payload.get("garmin") or fetch_garmin_stats(user=u_cfg.slug)

    # 7. MinMax Workout Routine Resolution (if scheduled today in GCal or Tasks)
    today_all_events = list(all_day) + [ev for slot in timeline for ev in slot["events"]]
    minmax_workout = resolve_today_workout(
        today_events=today_all_events,
        tasks_todo=tasks_todo,
        user=u_cfg.slug,
        muse_payload=payload,
        dt=today_dt,
    )

    # 8. Year Progress (12-Month Visual Grid) & Dispatch Note
    year_progress = compute_year_progress(today_dt)
    note = (
        custom_note
        or payload.get("note")
        or payload.get("muse_note")
        or "All local services healthy. GPIO 17 listener armed and CUPS print spooler active."
    )

    # 8. Lumos Logo data URI
    logo_data_uri = ""
    for lp in [BASE_DIR / "docs" / "assets" / "logo.png", BASE_DIR / "lumos-ui" / "logo.png"]:
        if lp.exists():
            try:
                b64 = base64.b64encode(lp.read_bytes()).decode("ascii")
                logo_data_uri = f"data:image/png;base64,{b64}"
                break
            except Exception:
                pass

    home_loc, toronto_loc = get_locations()
    location_name = f"{home_loc.name} • {toronto_loc.name}"

    return {
        "user_slug": u_cfg.slug,
        "user_display": u_cfg.display_name,
        "header_title": f"Lumos Digest - {u_cfg.display_name} - {ordinal_date}",
        "ordinal_date": ordinal_date,
        "date_str": today_dt.strftime("%A, %B %d, %Y"),
        "short_date": today_dt.strftime("%a, %b %d"),
        "location_name": location_name,
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
        "minmax_workout": minmax_workout,
        "year_progress": year_progress,
        "quote": payload.get("quote", "We are what we repeatedly do. Excellence, then, is not an act, but a habit."),
        "quote_author": payload.get("quote_author", "Aristotle"),
        "muse_note": note,
        "logo_data_uri": logo_data_uri,
    }


def render_html(
    custom_note: str = "",
    muse_payload: Optional[Dict[str, Any]] = None,
    user: Optional[str] = None,
) -> str:
    """Renders the Jinja2 template in-memory as an intermediate step for PDF generation."""
    ctx = build_briefing_context(custom_note=custom_note, muse_payload=muse_payload, user=user)
    return Template(TEMPLATE_PATH.read_text(encoding="utf-8")).render(**ctx)


def _write_pdf_fallback_browser(rendered_html: str, target_pdf: str) -> bool:
    """Fallback PDF renderer using headless Edge/Chromium when WeasyPrint GTK libs are absent on Windows."""
    candidates = [
        shutil.which("msedge"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        shutil.which("chrome"),
        shutil.which("chromium"),
    ]
    browser = next((c for c in candidates if c and Path(c).exists()), None)
    if not browser:
        return False

    clean_html = rendered_html.replace("__PAGE_HEIGHT__", "11in")
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as tmp:
        tmp.write(clean_html)
        tmp_path = Path(tmp.name)

    try:
        subprocess.run(
            [
                browser,
                "--headless",
                "--disable-gpu",
                "--no-pdf-header-footer",
                f"--print-to-pdf={target_pdf}",
                tmp_path.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
        return Path(target_pdf).exists()
    finally:
        tmp_path.unlink(missing_ok=True)


def generate_pdf(
    output_pdf: Optional[str] = None,
    custom_note: str = "",
    muse_payload: Optional[Dict[str, Any]] = None,
    user: Optional[str] = None,
) -> str:
    raw_user = user or (muse_payload or {}).get("user")
    u_cfg = resolve_user(raw_user)
    default_pdf_path, _, _ = get_daily_artifact_paths(u_cfg.slug)
    target_pdf = str(output_pdf or default_pdf_path)

    rendered = render_html(custom_note=custom_note, muse_payload=muse_payload, user=u_cfg.slug)
    try:
        from weasyprint import HTML

        # Dynamic continuous height: measure content to stop cleanly at the tear-off line
        if "__PAGE_HEIGHT__" in rendered:
            measure_html = rendered.replace("__PAGE_HEIGHT__", "35in")
            doc = HTML(string=measure_html).render()
            page = doc.pages[0]
            body = page._page_box.children[0]
            # Height in points: body position + body height + bottom margin (0.20in = 14.4pt) + small buffer (4pt)
            bottom_pt = body.position_y + body.height + 14.4 + 4.0
            height_in = max(8.5, round(bottom_pt / 72.0, 2))
            final_html = rendered.replace("__PAGE_HEIGHT__", f"{height_in}in")
            HTML(string=final_html).write_pdf(target_pdf)
        else:
            HTML(string=rendered).write_pdf(target_pdf)
    except Exception:
        if not _write_pdf_fallback_browser(rendered, target_pdf):
            raise

    # Maintain persistent historical archive ledger
    try:
        update_archive_ledger(u_cfg.slug)
    except Exception:
        pass

    return target_pdf


def update_archive_ledger(user_slug: str) -> Path:
    """Scans the user's digest archive directory and maintains a persistent historical ledger."""
    u_cfg = resolve_user(user_slug)
    archive_dir = u_cfg.archive_dir
    pdf_files = sorted(archive_dir.glob("*_Lumos_Digest.pdf"), reverse=True)

    entries = []
    for pdf in pdf_files:
        dt_str = pdf.name.split("_")[0]
        json_file = archive_dir / f"{dt_str}_Lumos_Digest.json"
        entries.append({
            "date": dt_str,
            "filename": pdf.name,
            "pdf_path": str(pdf.resolve()),
            "size_bytes": pdf.stat().st_size,
            "size_kb": round(pdf.stat().st_size / 1024, 1),
        })

    ledger_path = archive_dir / "archive_ledger.json"
    ledger_path.write_text(json.dumps({"user": user_slug, "count": len(entries), "digests": entries}, indent=2), encoding="utf-8")
    return ledger_path


def print_briefing(
    custom_note: str = "",
    muse_payload: Optional[Dict[str, Any]] = None,
    user: Optional[str] = None,
) -> str:
    printer_name = get_printer_name()
    pdf = generate_pdf(custom_note=custom_note, muse_payload=muse_payload, user=user)
    try:
        check = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True)
        if check.returncode == 0:
            subprocess.run(["lp", "-d", printer_name, pdf], check=True)
            print(f"Dispatched {pdf} to {printer_name}")
        else:
            print(f"Notice: Printer '{printer_name}' not registered in CUPS yet. PDF saved at: {pdf}")
    except FileNotFoundError:
        print(f"Notice: CUPS 'lpstat' not found on this OS. PDF saved at: {pdf}")
    return pdf
