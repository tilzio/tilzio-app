# Usage Watcher (Tilzio plugin)

Мониторинг расхода/лимитов Claude Code и Codex в статус-баре и правой колонке.

- **Claude:** реальный % 5ч-окна/недели/Sonnet (`claude -p /usage` — claude сам держит свою аутентификацию) + $/токены/история (`ccusage`).
- **Codex:** $/токены/спарклайн (`ccusage codex`). Без % (нет окна квоты).
- Показатели включаются/выключаются в режиме «⚙ Настроить» (персист в storage).
- Алерт при ≥80% окна/недели (порог настраивается).

## Требования
- `ccusage` в PATH: `npm i -g ccusage`.
- `claude` (Claude Code CLI) в PATH и выполненный вход — нужен для % лимитов (`claude -p /usage`).
- macOS. Linux/Win — backlog.

## Права
- `exec`: `ccusage` ($/токены/история), `claude` (`claude -p /usage` для % лимитов).

## Установка (dev)
Скопировать папку в `~/Library/Application Support/Tilzio/plugins/usage-watcher/`,
в Tilzio: «Расширения» 🧩 → включить.
