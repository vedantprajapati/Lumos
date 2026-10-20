#!/usr/bin/env python3
"""
Centralized configuration, multi-user profile resolution, and artifact path management.
"""
from dataclasses import dataclass
from datetime import datetime
import os
from pathlib import Path
from typing import List, Optional, Tuple
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
TEMPLATE_PATH = BASE_DIR / "briefing_template.html"

load_dotenv(ENV_PATH)


@dataclass(frozen=True)
class LocationCoords:
    name: str
    lat: str
    lon: str


@dataclass(frozen=True)
class UserConfig:
    slug: str
    display_name: str
    garmin_username: str
    garmin_password: str
    garth_dir: Path
    google_token_path: Path
    archive_dir: Path


def get_printer_name() -> str:
    return os.getenv("PRINTER_NAME", "Phomemo_M834").strip()


def get_locations() -> Tuple[LocationCoords, LocationCoords]:
    home = LocationCoords(
        name=os.getenv("HOME_LOCATION_NAME", "East Gwillimbury"),
        lat=os.getenv("HOME_LAT", "44.1008"),
        lon=os.getenv("HOME_LON", "-79.4397"),
    )
    toronto = LocationCoords(
        name=os.getenv("TORONTO_LOCATION_NAME", "Downtown Toronto"),
        lat=os.getenv("TORONTO_LAT", "43.6532"),
        lon=os.getenv("TORONTO_LON", "-79.3832"),
    )
    return home, toronto


def get_configured_users() -> List[str]:
    raw = os.getenv("DIGEST_USERS", os.getenv("DEFAULT_USER", "default"))
    users = [u.strip().lower() for u in raw.split(",") if u.strip()]
    return users or [os.getenv("DEFAULT_USER", "default")]


def resolve_user(user: Optional[str] = None) -> UserConfig:
    load_dotenv(ENV_PATH, override=True)
    slug = (user or os.getenv("DEFAULT_USER", "default")).strip().lower()
    display_name = slug.replace("_", " ").replace("-", " ").title()
    prefix = f"{slug.upper()}_"

    garmin_username = (
        os.getenv(f"{prefix}GARMIN_USERNAME")
        or os.getenv("GARMIN_USERNAME", "")
    ).strip()
    garmin_password = (
        os.getenv(f"{prefix}GARMIN_PASSWORD")
        or os.getenv("GARMIN_PASSWORD", "")
    ).strip()

    raw_root = os.getenv("DIGEST_ARCHIVE_ROOT", os.getenv("DIGEST_ARCHIVE_DIR", "~/Documents/digest"))
    root_path = Path(os.path.expanduser(raw_root))
    # Avoid double-nesting if DIGEST_ARCHIVE_DIR already ends with the user slug
    if root_path.name.lower() == slug:
        archive_dir = root_path.resolve()
    else:
        archive_dir = (root_path / slug).resolve()
    archive_dir.mkdir(parents=True, exist_ok=True)

    user_token = BASE_DIR / f"token_{slug}.json"
    default_token = BASE_DIR / "token.json"
    google_token_path = user_token if user_token.exists() else default_token

    return UserConfig(
        slug=slug,
        display_name=display_name,
        garmin_username=garmin_username,
        garmin_password=garmin_password,
        garth_dir=BASE_DIR / ".garth" / slug,
        google_token_path=google_token_path,
        archive_dir=archive_dir,
    )


def get_daily_artifact_paths(user: Optional[str] = None, dt: Optional[datetime] = None) -> Tuple[Path, Path, Path]:
    """
    Returns (pdf_path, html_path, json_path) inside `~/Documents/digest/<user>/`
    for the given date (e.g. `2026-10-19_Lumos_Digest.pdf`).
    """
    dt = dt or datetime.now()
    date_prefix = dt.strftime("%Y-%m-%d")
    u_cfg = resolve_user(user)
    return (
        u_cfg.archive_dir / f"{date_prefix}_Lumos_Digest.pdf",
        u_cfg.archive_dir / f"{date_prefix}_Lumos_Digest.html",
        u_cfg.archive_dir / f"{date_prefix}_Lumos_Digest.json",
    )
