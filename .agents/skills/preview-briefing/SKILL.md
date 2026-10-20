---
name: preview-briefing
description: >-
  Render and preview the Lumos morning briefing HTML and PDF locally without
  requiring a physical CUPS printer or Raspberry Pi GPIO hardware. Use this
  skill when modifying briefing_template.html or generate_and_print.py to verify
  layout, typography, and single-page fit.
---

# Preview Briefing Skill

Use this workflow to render and inspect changes to `briefing_template.html` and `generate_and_print.py` on any development machine (including Windows/macOS where CUPS or `gpiozero` may not be active).

## Steps

1. **Render Standalone HTML Preview**
   If `weasyprint` native GTK/Pango libraries are unavailable on the host OS, render the Jinja2 template directly to `preview.html`:
   ```bash
   python -c "import generate_and_print as gp, os; from datetime import datetime; from jinja2 import Template; html = Template(open('briefing_template.html', encoding='utf-8').read()).render(date_str=datetime.now().strftime('%A, %B %d, %Y'), location_name='Ontario Desk', weather=gp.fetch_weather(), events=gp.fetch_calendar_events(), tasks=['Audit test harness coverage and resolve flaky CI test runs.', 'Review outstanding platform pull requests and sign-offs.', 'Calibrate thermal print density & verify cut alignment.', 'Finalize API route authorization schema & token caching.'], quote='We are what we repeatedly do. Excellence, then, is not an act, but a habit.', quote_author='Aristotle', muse_note='Local preview render.'); open('preview.html', 'w', encoding='utf-8').write(html)"
   ```

2. **Generate PDF via WeasyPrint (if installed)**
   Run `generate_pdf` pointing to a cross-platform path:
   ```bash
   python -c "from generate_and_print import generate_pdf; print(generate_pdf('morning_brief.pdf'))"
   ```

3. **Verify Thermal Print Layout Constraints**
   - Confirm the rendered output fits strictly on **1 page** (`8.5in × 11in` with `0.35in 0.4in` margins).
   - Ensure all borders, rules, and text use pure black (`#000` / `#111`) for sharp 300 DPI thermal transfer on the Phomemo M834.
   - Clean up temporary `preview.html` or `morning_brief.pdf` artifacts after verification.
