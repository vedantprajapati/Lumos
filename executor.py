#!/usr/bin/env python3
"""
Muse Gadget SDK RPC Executor for Raspberry Pi 3B.
Intercepts `printer.briefing(payload={...})`, renders the 1-page PDF on the Pi,
and uploads both the executive text summary AND the actual PDF artifact directly
as a message to Meta Muse on your phone.
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import os
from pathlib import Path
import socket
import sys
from typing import Any, Dict, Optional

import subprocess
from lumos.config import get_daily_artifact_paths, get_printer_name, resolve_user
from lumos.renderer import build_briefing_context, generate_pdf

log = logging.getLogger("lumos.executor")
MUSE_SOCKET_PATH = "/run/musegadget/musegadget.sock"


def send_pdf_to_muse(message: str, pdf_path: str | Path, session_id: Optional[str] = None) -> Dict[str, Any]:
    """Posts a message with the actual PDF file attached directly to Meta Muse on the phone."""
    p = Path(pdf_path)
    if not p.exists():
        return {"ok": False, "error": f"PDF file not found: {p}"}

    payload = {
        "message": message,
        "file_path": str(p.resolve()),
        "filename": p.name,
        "mime_type": "application/pdf",
    }
    if session_id:
        payload["session_id"] = session_id

    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(60)
            sock.connect(MUSE_SOCKET_PATH)
            sock.sendall(json.dumps(payload).encode() + b"\n")
            reply_raw = sock.makefile("rb").readline()
            if not reply_raw:
                return {"ok": False, "error": "empty reply from musegadget socket"}
            return json.loads(reply_raw.decode("utf-8", errors="replace"))
    except Exception as exc:
        return {"ok": False, "error": f"socket transmission failed: {exc}"}


def build_digest_summary(ctx: Dict[str, Any]) -> str:
    """Builds a rich executive summary for Meta Muse to present in phone chat."""
    home_w = ctx.get("weather", {}).get("home", {})
    tor_w = ctx.get("weather", {}).get("toronto", {})
    garmin = ctx.get("garmin", {})
    minmax = ctx.get("minmax_workout")
    tasks = ctx.get("tasks_todo", [])
    today_events = [ev for slot in ctx.get("timeline", []) for ev in slot.get("events", [])]

    workout_line = (
        f"🏋️ *Workout Today*: {minmax['title']} ({minmax['focus']})"
        if minmax
        else "🛋️ *Workout Today*: Rest / No session scheduled"
    )

    formatted_msg = (
        f"🗞️ *{ctx.get('header_title', 'The Lumos Chronicle')}*\n"
        f"────────────────────────────────\n"
        f"🌤️ *Weather*: {home_w.get('name', 'Home')} {home_w.get('temp', '--')}°C ({home_w.get('condition', '')}) | "
        f"{tor_w.get('name', 'Toronto')} {tor_w.get('temp', '--')}°C\n"
        f"💪 *Garmin*: {garmin.get('gym_count', 0)} gym days this month (RHR: {garmin.get('resting_hr', '--')} bpm, Steps: {garmin.get('steps_yesterday', '--')})\n"
        f"{workout_line}\n"
        f"📋 *Tasks*: {len(tasks)} to-do items remaining\n"
        f"📅 *Schedule*: {len(today_events)} calendar blocks today\n"
        f"🖨️ *Printer*: Dispatched to Phomemo M834\n"
        f"────────────────────────────────\n"
        f"Attached is your complete 1-page continuous-roll PDF broadsheet!"
    )
    return formatted_msg


def handle_briefing_request(payload: Dict[str, Any], user: str = "vedant", print_cups: bool = True) -> Dict[str, Any]:
    """
    Main handler invoked when Muse calls `printer.briefing` or via system.run:
    1. Compiles context & renders the 1-page PDF via WeasyPrint.
    2. Sends print job to Phomemo M834.
    3. Uploads the actual PDF + summary directly into Muse chat on the phone.
    4. Returns execution details to caller.
    """
    user_prof = resolve_user(user)
    ctx = build_briefing_context(payload, user=user_prof.slug)
    pdf_path = generate_pdf(muse_payload=payload, user=user_prof.slug)

    if print_cups:
        printer_name = get_printer_name()
        try:
            check = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True)
            if check.returncode == 0:
                subprocess.run(["lp", "-d", printer_name, pdf_path], check=True)
                log.info("Dispatched to %s", printer_name)
        except Exception as exc:
            log.warning("CUPS dispatch skipped: %s", exc)

    summary_msg = build_digest_summary(ctx)
    session_id = payload.get("session_id")
    muse_upload = send_pdf_to_muse(summary_msg, pdf_path, session_id=session_id)

    _, json_path, _ = get_daily_artifact_paths(user_prof.slug)

    return {
        "ok": True,
        "status": "completed",
        "summary": summary_msg,
        "pdf_path": pdf_path,
        "json_path": str(json_path),
        "muse_upload": muse_upload,
    }


def main():
    parser = argparse.ArgumentParser(description="Lumos RPC & PDF Messenger")
    parser.add_argument("--payload", help="JSON payload or path to JSON file from Muse", default="{}")
    parser.add_argument("--user", default="vedant", help="User profile name")
    parser.add_argument("--no-print", action="store_true", help="Skip sending to CUPS")
    args = parser.parse_args()

    payload_data = {}
    if args.payload:
        if Path(args.payload).exists():
            payload_data = json.loads(Path(args.payload).read_text(encoding="utf-8"))
        else:
            try:
                payload_data = json.loads(args.payload)
            except Exception:
                payload_data = {}

    result = handle_briefing_request(payload_data, user=args.user, print_cups=not args.no_print)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
