# Year end Work Dashboard

Static dashboard of JIRA tasks assigned to `ngoli@givelify.com` that moved
from **Discovery** to **Design Done**, reporting window Aug 2025 – Aug 2026.

## How it works

- `scripts/fetch-jira.mjs` queries JIRA, reads each matching issue's changelog,
  and writes `docs/data.json`.
- `docs/index.html` is a static page that reads `docs/data.json` and renders
  the table, summary cards, and filters. No build step, no dependencies.
- `.github/workflows/update-dashboard.yml` runs the fetch script and commits
  the refreshed `docs/data.json`. It's manual only (`workflow_dispatch`) — no
  schedule.

## First-time setup

1. Add a repo secret `JIRA_YEARLY_REPORT` containing your JIRA API token
   (Settings → Secrets and variables → Actions → New repository secret).
2. Enable GitHub Pages: Settings → Pages → Source: **Deploy from a branch**,
   Branch: `main`, Folder: `/docs`.
3. Go to the **Actions** tab → **Refresh JIRA dashboard data** → **Run workflow**
   to populate `docs/data.json` for the first time.
4. Re-run that workflow any time you want the dashboard to reflect the latest
   JIRA data.

## Config

Base URL, assignee, status names, and the reporting date window are set as
env vars in `.github/workflows/update-dashboard.yml` — edit that file to
change any of them.
