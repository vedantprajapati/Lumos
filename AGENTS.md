# Lumos — Agent Guidelines & Project Context

## Overview
**Lumos** is a headless 1-page daily summary dispatcher running on a **Raspberry Pi 3B** connected to a **Phomemo M834** thermal printer (300 DPI, 8.5" × 11" letter thermal paper). It combines **zero-AI-call local deterministic Python fetchers** (`fetchers/`) with the **Meta Muse Cloud Agent** RPC bridge (`executor.py` over the `muse-gadget-sdk` Noise tunnel).

## Architecture & Key Files
- `briefing_template.html`: Single-page 3-column broadsheet newspaper (`@page { size: 8.5in 11in; margin: 0.28in 0.34in; }`) featuring:
  - **Column 1**: Visual **7 AM – 9 PM Hourly Timeline** with bordered time-block cards + **Next 7 Days** GCal horizon.
  - **Column 2**: **Gmail** & **Outlook** priority inbox digest, **Google Tasks** (`□` To-Do & `■` Done), and **Google Keep** pinned callout cards.
  - **Column 3**: **Garmin Monthly Gym Calendar Grid** (`Su–Sa` boxes shaded solid black `■` on gym days), **Year Progress Bar**, **Open-Meteo Weather**, and **Meta Muse RPC / GPIO Status**.
- `executor.py`: Intercepts `printer.briefing(payload={...})` from Meta Muse over the Noise tunnel and passes the payload to `generate_and_print.py`.
- `generate_and_print.py`: Orchestrates local fetchers in `fetchers/`, merges any Muse payload fields, renders the 1-page PDF via WeasyPrint, and prints via CUPS (`lp -d Phomemo_M834`).
- `button_daemon.py`: Hardware listener on GPIO 17 (Physical Pin 11) to trigger `print_briefing()` on demand with zero AI calls.

## Core Principles
1. **Minimize AI API Calls**: Always prefer deterministic Python scripts (`fetchers/garmin_fetcher.py`, `fetchers/google_fetcher.py`, `fetchers/outlook_fetcher.py`, `fetchers/weather_fetcher.py`) over LLM calls for structured data retrieval.
2. **Strict Single-Page Budget**: All content in `briefing_template.html` must fit onto **1 page** (`REV 1 • VEDANT DAILY REPORT PRINT 1/1`).
3. **Monochrome Thermal Contrast**: Use solid black (`#000`), crisp borders, shaded calendar cells (`gym-hit`), and pill tags (`[KEEP]`, `[NOISE RPC]`) optimized for 300 DPI direct thermal transfer.
4. **Secret Hygiene**: Never commit `.env`, `token.json`, `credentials.json`, or `.garth/`.
