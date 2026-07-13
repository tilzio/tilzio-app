# AI Limits (Tilzio plugin)

Claude Code / Codex usage and limits monitoring in an interactive panel (right side column) and the status bar.

## What it shows

**Panel (iframe dashboard, style B):**
- **Claude:** real 5-hour window / week / per-model limit percentages (`claude -p /usage`), spend for today / week / month, 7-day history (bars or line), token breakdown.
- **Codex:** spend for today / week / month, 7-day history, token breakdown.
- Each provider section can be expanded/collapsed (▾/▸).

**Built-in panel configuration:**
- Limits visualization toggle: `meter` ↔ `rings` (persisted).
- History visualization toggle: `bars` ↔ `line` (persisted).
- Metric configuration: ⚙ opens the inline settings section.

**Settings (⚙ in the panel header):**
- Enable/disable tools (Claude, Codex) — their section and status-bar chips disappear.
- Alert threshold (±5% around the default 80%).
- Data block order (drag & drop) — persisted in storage.
- Per-metric visibility (percent/spend/history/tokens) — persisted in storage.
- Status-bar chip visibility — synced with what the status bar shows.

**Status bar (host side):**
- The "AI Limits" button (gauge icon) — click opens the panel in the right column.
- Chips per provider (toggled in settings):
  - Claude: name, 5h %, week %, today $, tokens, reset daily, reset weekly
  - Codex: name, today $, tokens

## Architecture

1. **Worker** (`main.js`): a background worker that:
   - Runs `claude -p /usage` and `ccusage` (+ `ccusage codex`) on an interval.
   - Normalizes the data into the state shape.
   - Checks alerts (≥ threshold).
   - Pushes state to the iframe via `postMessage`.

2. **Panel** (`panel.html`): an iframe dashboard that:
   - Receives state from the worker.
   - Renders the dashboard (style B).
   - Sends events (collapse toggle, view toggle, settings change) back to the worker.
   - Is styled by the host `--ts-*` variables (colors, fonts).

3. **Host** (Tilzio):
   - Renders the Activity Bar button and manages the status bar.
   - Applies theme CSS variables to the iframe.

## Requirements

- `ccusage` on PATH: `npm i -g ccusage`.
- `claude` (Claude Code CLI) on PATH and signed in — for limit percentages (`claude -p /usage`).
- macOS 12+. Linux/Windows — planned.

## Permissions

- `exec`: `ccusage`, `claude` — to fetch spend and limit data.

## Installing (development)

```bash
# Copy into the Tilzio plugins directory
cp -R examples/plugins/ai-limits/* "$HOME/Library/Application Support/Tilzio/plugins/ai-limits/"
```

In Tilzio: **Settings** → **Extensions** → **AI Limits** → enable.

## Usage

1. Click the gauge icon in the Activity Bar → the panel opens in the right column.
2. Collapse/expand providers (▾/▸); switch the visualizations (meter ↔ rings, bars ↔ line).
3. Click ⚙ → configure tools, alert threshold, metrics, chips, and block order.
4. Status-bar chips reflect the current state and update live.
5. When the alert threshold is exceeded → an in-app toast notification.

## Theming

The panel is styled automatically by the host `--ts-*` variables:
- `--ts-bg-primary`, `--ts-bg-secondary` — backgrounds.
- `--ts-text-primary`, `--ts-text-secondary` — text.
- `--ts-accent`, `--ts-accent-alt` — accents.
- The rest of the Tilzio variable spec.

No extra CSS — only the inline styles in `panel.html`.
