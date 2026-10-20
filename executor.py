#!/usr/bin/env python3
"""
Meta Muse Gadget SDK RPC Executor for Raspberry Pi 3B.

Architecture:
[User] -> "Print my morning brief"
  -> [Meta Muse Cloud Agent]
  -> Sends RPC over Noise tunnel: `printer.briefing(payload={...})`
  -> [Raspberry Pi 3B (muse-gadget-sdk)] `executor.py` intercepts `printer.briefing`
  -> Merges Muse payload with local zero-AI-call Python fetchers in `generate_and_print.py`
  -> Renders 1-page PDF & dispatches to Phomemo M834.
"""
import argparse
import json
import sys
from typing import Any, Dict, Optional
from generate_and_print import print_briefing


def handle_printer_briefing(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    RPC handler for `printer.briefing(payload=...)`.
    Supported payload keys from Meta Muse Cloud Agent:
      - events / gcal_today: list of today's calendar dicts
      - gcal_upcoming: list of next 7 days calendar dicts
      - gmail_updates: list of {"sender": str, "subject": str}
      - outlook_updates: list of {"sender": str, "subject": str}
      - tasks_todo: list of str
      - tasks_done: list of str
      - keep_notes: list of {"title": str, "snippet": str}
      - note / muse_note: str summary/directive from Meta Muse
    Any omitted fields are automatically populated by local deterministic scripts (0 AI calls).
    """
    payload = payload or {}
    note = payload.get("note") or payload.get("muse_note") or ""
    status = print_briefing(custom_note=note, muse_payload=payload)
    return {
        "ok": True,
        "action": "printer.briefing",
        "status": status,
    }


def register_muse_handlers(gadget_server: Any) -> None:
    """
    Hook for muse-gadget-sdk server registration if imported by the daemon.
    """
    if hasattr(gadget_server, "register"):
        gadget_server.register("printer.briefing", handle_printer_briefing)
    elif hasattr(gadget_server, "on"):
        gadget_server.on("printer.briefing", handle_printer_briefing)


def main():
    parser = argparse.ArgumentParser(description="Lumos Meta Muse RPC Executor")
    parser.add_argument(
        "--payload",
        type=str,
        default="",
        help="JSON string or path to JSON file from Meta Muse `printer.briefing` RPC",
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

    res = handle_printer_briefing(payload)
    print(json.dumps(res))


if __name__ == "__main__":
    main()
