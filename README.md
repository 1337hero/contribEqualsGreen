# GitHub Contribution Generator

> **Hey!** This is just a fun experiment - you probably shouldn't run this, but it's fun to learn from. Built for tinkering, not for gaming your contribution graph. Be cool.

A Node.js tool that generates GitHub contributions across multiple repos by making empty commits on a rotating schedule.

## What It Does

- Rotates through a list of repos you configure
- Makes empty commits (no file changes) with alternating messages
- Tracks state so each repo alternates between "pulse" and "beat" commits
- Shuffles repo order each cycle for variety
- Includes safety checks: lock files, preflight validation, dry-run mode

## Configuration

Edit `config.json`:

```json
{
  "version": 1,
  "repos": [
    "/path/to/repo1",
    "/path/to/repo2",
    "/path/to/repo3"
  ],
  "reposPerRun": 2,
  "maxReposPerRun": 5,
  "method": "empty-commit",
  "dryRun": true,
  "exclude": [],
  "targetBranch": null
}
```

| Setting | What it does |
|---------|--------------|
| `repos` | Paths to git repos with remotes |
| `reposPerRun` | How many repos to hit each run |
| `method` | `"empty-commit"` or `"heartbeat-file"` |
| `dryRun` | Set `false` when ready for real commits |
| `exclude` | Patterns to skip |
| `targetBranch` | `null` = auto-detect default branch |

## Running It

```bash
# Install deps
npm install

# Dry run (default - no actual commits)
npm start

# Or directly
node runContrib.js
```

## Preflight Checks

Before touching any repo, the script verifies:
- Path exists and is a git repo
- Has an origin remote
- Working tree is clean
- On the correct branch

If any check fails, that repo is skipped and state is preserved.

## State Tracking

`state.json` (auto-generated) tracks:
- Which action each repo did last (for alternating)
- Shuffled rotation order
- Failure counts per repo

State is keyed by origin URL, so moving folders won't lose history.

## Systemd Setup (Linux)

Create `~/.config/systemd/user/github-contrib.service`:
```ini
[Unit]
Description=GitHub Contribution Generator
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/path/to/contribEqualsGreen
ExecStart=/usr/bin/node runContrib.js

[Install]
WantedBy=default.target
```

Create `~/.config/systemd/user/github-contrib.timer`:
```ini
[Unit]
Description=Run GitHub Contribution Generator Daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:
```bash
systemctl --user enable github-contrib.timer
systemctl --user start github-contrib.timer
```

Stop:
```bash
systemctl --user stop github-contrib.timer
systemctl --user disable github-contrib.timer
```

## License

MIT
