#!/usr/bin/env python3
"""
One-time helper script to generate `token.json` for deterministic (0 AI call)
fetching of Google Calendar (Today + 7 Days), Google Tasks (To-Do + Done), and Gmail.

Place `credentials.json` (OAuth 2.0 Desktop Client from Google Cloud Console)
in the repo root and run:
    python scripts/auth_google.py
"""
import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_FILE = os.path.join(BASE_DIR, "token.json")
CREDS_FILE = os.path.join(BASE_DIR, "credentials.json")

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/tasks.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def main():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDS_FILE):
                raise FileNotFoundError(
                    f"Missing {CREDS_FILE}. Download an OAuth 2.0 Desktop Client JSON from Google Cloud Console."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    print(f"Saved valid Google OAuth token to {TOKEN_FILE}")


if __name__ == "__main__":
    main()
