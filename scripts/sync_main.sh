#!/usr/bin/env bash
# Lumos Automated Git Synchronizer
# Pulls latest commits from origin/main every 6 hours and at system boot.
set -euo pipefail

REPO_DIR="/home/leafshin/lumos"
LOG_FILE="/home/leafshin/lumos/sync.log"

# Wait for network connectivity (up to 45s if running at boot)
for i in $(seq 1 15); do
  if ping -c 1 -W 2 github.com >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

cd "$REPO_DIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Checking for updates from origin/main..." >> "$LOG_FILE"
git fetch origin main >> "$LOG_FILE" 2>&1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] New commits found. Updating from $LOCAL to $REMOTE..." >> "$LOG_FILE"
  git reset --hard origin/main >> "$LOG_FILE" 2>&1
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update complete. Now at $(git rev-parse --short HEAD)." >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Already up to date at $(git rev-parse --short HEAD)." >> "$LOG_FILE"
fi
