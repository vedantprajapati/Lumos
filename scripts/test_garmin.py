#!/usr/bin/env python3
"""
CLI utility to test the Garmin Connect API integration for a given user
(defaults to `vedant`) and display the monthly gym attendance calendar grid.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lumos.config import resolve_user
from lumos.fetchers.garmin import fetch_garmin_stats


def print_ascii_calendar(garmin_data: dict) -> None:
    print(f"\n=== {garmin_data['month_name']} Gym Attendance ({garmin_data['gym_count']} Days) ===")
    print("Su  Mo  Tu  We  Th  Fr  Sa")
    for week in garmin_data["month_grid"]:
        row_strs = []
        for cell in week:
            if not cell["day"]:
                row_strs.append("  . ")
            elif cell["is_gym"]:
                row_strs.append(f"[{cell['day']:2d}]")
            elif cell["is_today"]:
                row_strs.append(f"({cell['day']:2d})")
            else:
                row_strs.append(f" {cell['day']:2d} ")
        print("".join(row_strs))
    print(f"\nStatus       : {garmin_data['status']}")
    if garmin_data.get("error"):
        print(f"Error Detail : {garmin_data['error']}")
    print(f"Latest Gym   : {garmin_data['last_gym']}")
    print(f"Vitals       : RHR {garmin_data['resting_hr']} bpm | Steps {garmin_data['steps_yesterday']} | Sleep {garmin_data['sleep_hours']}")


def main():
    parser = argparse.ArgumentParser(description="Test Garmin Connect API fetcher")
    parser.add_argument("--user", type=str, default="vedant", help="User slug (default: vedant)")
    parser.add_argument("--json", action="store_true", help="Print raw JSON output")
    args = parser.parse_args()

    u_cfg = resolve_user(args.user)
    print(f"Testing Garmin Connect for user '{u_cfg.slug}' ({u_cfg.garmin_username})...")
    stats = fetch_garmin_stats(user=u_cfg.slug)
    if args.json:
        print(json.dumps(stats, indent=2))
    else:
        print_ascii_calendar(stats)


if __name__ == "__main__":
    main()
