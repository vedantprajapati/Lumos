---
name: pi-deploy-and-cups
description: >-
  Configure and deploy Lumos on a Raspberry Pi 3B with the Phomemo M834 thermal
  printer via CUPS, GPIO 17 hardware button daemon, and systemd timer/cron
  scheduling. Use this skill when setting up Raspberry Pi services, debugging
  CUPS printing, or configuring systemd units.
---

# Raspberry Pi 3B & Phomemo M834 Deployment Skill

Use this runbook to configure the Raspberry Pi 3B environment, CUPS printer spooler, and systemd units for Lumos.

## 1. System Dependencies (Raspberry Pi OS)

Install required native packages for WeasyPrint, CUPS, and GPIO:
```bash
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv cups libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0 libffi-dev libjpeg-dev libopenjp2-7-dev python3-gpiozero
sudo usermod -aG lpadmin,gpio $USER
```

## 2. CUPS Configuration for Phomemo M834

1. Connect the Phomemo M834 via USB and verify detection with `lsusb`.
2. Register the printer in CUPS as `Phomemo_M834` (matching `PRINTER_NAME` in `generate_and_print.py` and `.env`).
3. Verify printer status:
   ```bash
   lpstat -p Phomemo_M834
   ```

## 3. Systemd Services

### Hardware Button Daemon (`lumos-button.service`)
Runs `button_daemon.py` continuously, listening on **GPIO 17 (Pin 11)**:
```ini
[Unit]
Description=Lumos Hardware Push Button Daemon
After=network-online.target cups.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Lumos
EnvironmentFile=/home/pi/Lumos/.env
ExecStart=/home/pi/Lumos/.venv/bin/python /home/pi/Lumos/button_daemon.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Scheduled Morning Print (`cron` or `systemd` timer)
To dispatch automatically every morning at 07:00:
```cron
0 7 * * * cd /home/pi/Lumos && /home/pi/Lumos/.venv/bin/python /home/pi/Lumos/generate_and_print.py >> /var/log/lumos.log 2>&1
```
