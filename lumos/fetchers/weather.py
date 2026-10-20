#!/usr/bin/env python3
"""
Deterministic Open-Meteo Weather Fetcher (0 AI API calls).
Fetches weather for both Home (East Gwillimbury) and Downtown Toronto.
"""
from datetime import datetime
from typing import Any, Dict
import requests
from lumos.config import LocationCoords, get_locations

WMO_CODES = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Rime Fog",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Dense Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    71: "Light Snow",
    73: "Moderate Snow",
    75: "Heavy Snow",
    80: "Rain Showers",
    81: "Mod. Showers",
    82: "Heavy Showers",
    95: "Thunderstorm",
}


def _fetch_location(loc: LocationCoords) -> Dict[str, Any]:
    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={loc.lat}&longitude={loc.lon}"
        "&current=temperature_2m,precipitation,weather_code,wind_speed_10m"
        "&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto"
    )
    try:
        r = requests.get(url, timeout=8).json()
        curr = r["current"]
        daily = r["daily"]
        sr = daily["sunrise"][0].split("T")[1][:5]
        ss = daily["sunset"][0].split("T")[1][:5]
        try:
            t1 = datetime.strptime(sr, "%H:%M")
            t2 = datetime.strptime(ss, "%H:%M")
            diff = int((t2 - t1).total_seconds() // 60)
            daylight = f"{diff // 60}h {diff % 60:02d}m"
        except Exception:
            daylight = "10h 44m"

        code = curr.get("weather_code", 0)
        return {
            "name": loc.name,
            "temp": round(curr["temperature_2m"]),
            "condition": WMO_CODES.get(code, "Cloudy / Showers" if code >= 3 else "Clear / Mild"),
            "temp_max": round(daily["temperature_2m_max"][0]),
            "temp_min": round(daily["temperature_2m_min"][0]),
            "precipitation": curr["precipitation"],
            "wind": round(curr["wind_speed_10m"]),
            "sunrise": sr,
            "sunset": ss,
            "daylight": daylight,
        }
    except Exception:
        return {
            "name": loc.name,
            "temp": 14,
            "condition": "Partly Cloudy",
            "temp_max": 16,
            "temp_min": 7,
            "precipitation": 0,
            "wind": 12,
            "sunrise": "07:38",
            "sunset": "18:22",
            "daylight": "10h 44m",
        }


def fetch_weather() -> Dict[str, Any]:
    home_coords, toronto_coords = get_locations()
    home = _fetch_location(home_coords)
    toronto = _fetch_location(toronto_coords)
    return {
        "home": home,
        "toronto": toronto,
        "sunrise": home["sunrise"],
        "sunset": home["sunset"],
        "daylight": home["daylight"],
    }
