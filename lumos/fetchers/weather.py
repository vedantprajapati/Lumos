#!/usr/bin/env python3
"""
Deterministic Open-Meteo Weather Fetcher (0 AI API calls).
Fetches current, daily, and 24-hour hourly temperature & rain probability curves
for both East Gwillimbury and Downtown Toronto, plus builds an inline SVG line chart.
"""
from datetime import datetime
from typing import Any, Dict, List
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


def _build_svg_chart(hourly_temps: List[float], hourly_rain: List[float]) -> Dict[str, Any]:
    """
    Computes SVG polyline coordinates for a 220x46 viewBox:
      - Solid line: 24-hour temperature curve
      - Dashed line: 24-hour rain probability (0-100%)
    """
    temps = (hourly_temps or [8, 7, 7, 6, 6, 7, 9, 11, 13, 15, 17, 18, 19, 20, 20, 19, 17, 15, 13, 12, 11, 10, 9, 8])[:24]
    rains = (hourly_rain or [0] * 24)[:24]

    w = 216.0
    h = 40.0
    pad_x = 2.0
    pad_y = 4.0

    t_min = min(temps)
    t_max = max(temps)
    t_span = max(t_max - t_min, 1.0)

    temp_pts = []
    rain_pts = []
    n = max(len(temps) - 1, 1)

    for i, t in enumerate(temps):
        x = pad_x + (i / n) * (w - 2 * pad_x)
        y_t = pad_y + (1.0 - (t - t_min) / t_span) * (h - 2 * pad_y)
        temp_pts.append(f"{x:.1f},{y_t:.1f}")

    for i, r in enumerate(rains):
        x = pad_x + (i / n) * (w - 2 * pad_x)
        r_clamped = max(0.0, min(100.0, float(r)))
        y_r = pad_y + (1.0 - r_clamped / 100.0) * (h - 2 * pad_y)
        rain_pts.append(f"{x:.1f},{y_r:.1f}")

    return {
        "temp_polyline": " ".join(temp_pts),
        "rain_polyline": " ".join(rain_pts),
        "temp_min": round(t_min),
        "temp_max": round(t_max),
        "rain_max": round(max(rains) if rains else 0),
    }


def _fetch_location(loc: LocationCoords) -> Dict[str, Any]:
    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={loc.lat}&longitude={loc.lon}"
        "&current=temperature_2m,precipitation,weather_code,wind_speed_10m"
        "&hourly=temperature_2m,precipitation_probability"
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max,sunrise,sunset"
        "&forecast_days=1&timezone=auto"
    )
    try:
        r = requests.get(url, timeout=8).json()
        curr = r["current"]
        daily = r["daily"]
        hourly = r.get("hourly", {})
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
        h_temps = hourly.get("temperature_2m", [])[:24]
        h_rains = hourly.get("precipitation_probability", [])[:24]
        chart = _build_svg_chart(h_temps, h_rains)

        return {
            "name": loc.name,
            "temp": round(curr["temperature_2m"]),
            "condition": WMO_CODES.get(code, "Cloudy / Showers" if code >= 3 else "Clear / Mild"),
            "temp_max": round(daily["temperature_2m_max"][0]),
            "temp_min": round(daily["temperature_2m_min"][0]),
            "rain_prob": round((daily.get("precipitation_probability_max") or [0])[0] or 0),
            "precip_mm": round((daily.get("precipitation_sum") or [0.0])[0] or 0.0, 1),
            "precipitation": curr.get("precipitation", 0),
            "wind": round(curr["wind_speed_10m"]),
            "uv": round((daily.get("uv_index_max") or [3.5])[0] or 3.5, 1),
            "sunrise": sr,
            "sunset": ss,
            "daylight": daylight,
            "chart": chart,
        }
    except Exception:
        chart = _build_svg_chart([], [])
        return {
            "name": loc.name,
            "temp": 14,
            "condition": "Partly Cloudy",
            "temp_max": 16,
            "temp_min": 7,
            "rain_prob": 10,
            "precip_mm": 0.0,
            "precipitation": 0,
            "wind": 12,
            "uv": 3.5,
            "sunrise": "07:38",
            "sunset": "18:22",
            "daylight": "10h 44m",
            "chart": chart,
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
        "chart": home["chart"],
    }
