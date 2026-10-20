#!/usr/bin/env python3
"""
Muse Gadget SDK RPC Executor for Raspberry Pi 3B.
Supports multi-user routing (`payload.get("user", "vedant")`), saving artifacts
into `~/Documents/digest/<user>/` and dispatching to Phomemo M834.
"""
import argparse
import json
import sys
from typing import Any, Dict, Optional
from generate_and_print import print_briefing


def handle_printer_briefing(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    RPC handler for `printer.briefing(payload=...)`.
    Supported payload keys:
      - user: str (optional, defaults to "vedant")
      - events / gcal_today: list of today's calendar items
      - gcal_upcoming / gcal_next_7_days: list of next 7 days items
      - gmail_updates / gmail: list of {"sender": str, "subject": str}
      - outlook_updates / outlook: list of {"sender": str, "subject": str}
      - tasks_todo / tasks_done / tasks: Google Tasks lists
      - keep_notes / keep: list of {"title": str, "snippet": str}
      - note / muse_note: str summary/directive
    """
    payload = payload or {}
    user = payload.get("user") or "vedant"
    note = payload.get("note") or payload.get("muse_note") or ""
    pdf_path = print_briefing(custom_note=note, muse_payload=payload, user=user)
    return {
        "ok": True,
        "action": "printer.briefing",
        "user": user,
        "artifact_pdf": pdf_path,
    }


def register_muse_handlers(gadget_server: Any) -> None:
    if hasattr(gadget_server, "register"):
        gadget_server.register("printer.briefing", handle_printer_briefing)
    elif hasattr(gadget_server, "on"):
        gadget_server.on("printer.briefing", handle_printer_briefing)


def main():
    parser = argparse.ArgumentParser(description="Lumos RPC Executor")
    parser.add_argument("--user", type=str, default="", help="Override user slug (default: vedant)")
    parser.add_argument(
        "--payload",
        type=str,
        default="",
        help="JSON string or path to JSON file from `printer.briefing` RPC",
    )
    args = parser.parse_args()

    payload: Dict[str, Any] = {}
    if args.payload:
        try:
            if args.payload.startswith("{"):
                payload = json.loads(args.payload)
            else:
                with open(args.payload, encoding="utf-8") as f:
                    payload = json.load(f)
        except Exception as e:
            print(f"Warning: could not parse payload ({e}), falling back to local fetchers.", file=sys.stderr)
    elif not sys.stdin.isatty():
        raw = sys.stdin.read().strip()
        if raw:
            try:
                data = json.loads(raw)
                payload = data.get("payload", data) if isinstance(data, dict) else {}
            except Exception:
                pass

    if args.user:
        payload["user"] = args.user

    res = handle_printer_briefing(payload)
    print(json.dumps(res))


if __name__ == "__main__":
    main()
