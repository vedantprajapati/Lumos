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


DEFAULT_CLI_USER = os.getenv("DEFAULT_USER", "default")

def handle_briefing_request(payload: Dict[str, Any], user: Optional[str] = None, print_cups: bool = True) -> Dict[str, Any]:
    target_user = user or DEFAULT_CLI_USER
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


def get_archive_summary(user: Optional[str] = None, send_to_muse: bool = False) -> Dict[str, Any]:
    """Returns a formatted archive ledger of all previous daily digests."""
    u_cfg = resolve_user(user or DEFAULT_CLI_USER)
    ledger_path = u_cfg.archive_dir / "archive_ledger.json"
    if not ledger_path.exists():
        from lumos.renderer import update_archive_ledger
        ledger_path = update_archive_ledger(u_cfg.slug)
    try:
        data = json.loads(ledger_path.read_text(encoding="utf-8"))
    except Exception:
        data = {"count": 0, "digests": []}

    lines = [
        f"📚 *The Lumos Chronicle — Gazette Archive* ({data.get('count', 0)} editions)",
        "────────────────────────────────",
    ]
    for d in data.get("digests", []):
        lines.append(f"• *{d.get('date')}*: {d.get('filename')} ({d.get('size_kb', 0)} KB)")
    lines.append("────────────────────────────────")
    lines.append("Ask me for any past date (e.g. 'Send me Oct 19 digest') to upload that edition!")
    summary_text = "\n".join(lines)

    muse_res = None
    if send_to_muse:
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
                sock.settimeout(30)
                sock.connect(MUSE_SOCKET_PATH)
                sock.sendall(json.dumps({"message": summary_text}).encode() + b"\n")
                muse_res = json.loads(sock.makefile("rb").readline().decode("utf-8", errors="replace"))
        except Exception as e:
            muse_res = {"ok": False, "error": str(e)}

    return {
        "ok": True,
        "summary": summary_text,
        "count": data.get("count", 0),
        "digests": data.get("digests", []),
        "muse_res": muse_res,
    }


def resend_archive_pdf(date_str: str, user: Optional[str] = None) -> Dict[str, Any]:
    """Uploads a specific past edition PDF from the archive directly to Muse chat."""
    u_cfg = resolve_user(user or DEFAULT_CLI_USER)
    pdf_path = u_cfg.archive_dir / f"{date_str}_Lumos_Digest.pdf"
    if not pdf_path.exists():
        matches = list(u_cfg.archive_dir.glob(f"*{date_str}*.pdf"))
        if matches:
            pdf_path = matches[0]
        else:
            return {"ok": False, "error": f"No archive digest found for date: {date_str}"}

    msg = f"🗞️ *The Lumos Chronicle — Archived Edition ({date_str})*\nAttached is the requested past PDF broadsheet."
    upload_res = send_pdf_to_muse(msg, pdf_path)
    return {"ok": True, "date": date_str, "pdf_path": str(pdf_path), "muse_upload": upload_res}


def main():
    parser = argparse.ArgumentParser(description="Lumos RPC & PDF Messenger")
    parser.add_argument("--payload", help="JSON payload or path to JSON file from Muse", default="{}")
    parser.add_argument("--user", default=DEFAULT_CLI_USER, help="User profile name")
    parser.add_argument("--no-print", action="store_true", help="Skip sending to CUPS")
    parser.add_argument("--archive", action="store_true", help="List all previous daily digests in the archive")
    parser.add_argument("--resend", help="Resend/upload a specific past PDF by date (YYYY-MM-DD) to Muse chat")
    parser.add_argument("--send-chat", action="store_true", help="Post output directly to Muse chat")
    args = parser.parse_args()

    if args.archive:
        res = get_archive_summary(user=args.user, send_to_muse=args.send_chat)
        print(json.dumps(res, indent=2))
        return

    if args.resend:
        res = resend_archive_pdf(args.resend, user=args.user)
        print(json.dumps(res, indent=2))
        return

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
