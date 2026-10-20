#!/usr/bin/env python3
"""
Lumos Multi-User Daily Brief CLI & Entrypoint.
Delegates to the refactored `lumos` package (`lumos.renderer`, `lumos.config`, `lumos.fetchers`).
"""
import argparse
from lumos.config import (
    get_configured_users,
    get_daily_artifact_paths,
    resolve_user,
)
from lumos.renderer import (
    build_briefing_context,
    compute_year_progress,
    format_ordinal_date,
    generate_pdf,
    print_briefing,
    render_html,
)

__all__ = [
    "build_briefing_context",
    "compute_year_progress",
    "format_ordinal_date",
    "generate_pdf",
    "get_configured_users",
    "get_daily_artifact_paths",
    "print_briefing",
    "render_html",
    "resolve_user",
]


def main():
    parser = argparse.ArgumentParser(description="Generate and print 1-page Lumos Digest")
    parser.add_argument(
        "--user",
        type=str,
        default="",
        help="Target user slug (defaults to all users in DIGEST_USERS, currently 'vedant')",
    )
    parser.add_argument("--note", type=str, default="", help="Custom dispatch note")
    parser.add_argument(
        "--html-only",
        action="store_true",
        help="Render and save HTML artifact to ~/Documents/digest/<user>/ without calling WeasyPrint/CUPS",
    )
    args = parser.parse_args()

    users = [args.user] if args.user else get_configured_users()
    for u in users:
        if args.html_only:
            render_html(custom_note=args.note, user=u)
            _, html_path, _ = get_daily_artifact_paths(u)
            print(f"Saved HTML digest for '{u}' at: {html_path}")
        else:
            print_briefing(custom_note=args.note, user=u)


if __name__ == "__main__":
    main()
