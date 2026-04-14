# cabinetai

AI-first self-hosted knowledge base and startup OS. All content lives as markdown files on disk. Humans define intent. Agents do the work. The knowledge base is the shared memory between both.

## Quick Start

```bash
npx cabinetai create my-startup
cd my-startup
npx cabinetai run
```

That's it. The app auto-downloads on first run, installs dependencies, and opens in your browser.

## What You Get

- WYSIWYG markdown editor with AI editing panel (Claude)
- Agent dashboard — define personas, run tasks, view transcripts
- Scheduled jobs — cron-based automation with YAML configs
- Kanban task board
- Full terminal in the browser (xterm.js)
- Cmd+K search across all pages
- Git-backed version history with one-click restore
- Drag-and-drop page organization
- Cabinet registry — import pre-made templates for SaaS, agencies, e-commerce, and more

## How It Works

```
~/.cabinet/              Global app cache (auto-managed)
  app/v0.3.0/            Version-pinned Next.js install

~/my-startup/            Your cabinet (this is your data)
  .cabinet               YAML manifest
  .agents/               Agent personas
  .jobs/                 Scheduled jobs
  index.md               Entry page
  ...                    Your content
```

The app lives in `~/.cabinet/` and is shared across all your cabinets. Each cabinet is a lightweight directory you can put anywhere — just a `.cabinet` manifest file, your agents, jobs, and content. No database.

## Commands

### `cabinetai create [name]`

Create a new cabinet directory.

```bash
cabinetai create my-startup          # root cabinet
cd my-startup
cabinetai create engineering         # child cabinet inside an existing one
```

### `cabinetai run`

Start Cabinet serving the current directory.

```bash
cabinetai run
cabinetai run --no-open              # don't open browser
cabinetai run --app-version 0.2.12   # use a specific app version
```

On first run, downloads the app to `~/.cabinet/app/` and installs dependencies. Subsequent runs start instantly.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `CABINET_APP_PORT` | `4000` | App server port |
| `CABINET_DAEMON_PORT` | `4100` | Daemon server port |

### `cabinetai import <template>`

Import a pre-made cabinet from the [template registry](https://github.com/hilash/cabinets).

```bash
cabinetai import saas-startup
cabinetai import career-ops
cabinetai import text-your-mom
```

### `cabinetai list`

List all cabinets in the current directory.

```bash
cabinetai list
```

```
  Name              Kind    Path              Agents  Jobs
  My Startup        root    .                 3       2
  Engineering       child   engineering       2       1
```

### `cabinetai doctor`

Run health checks on the environment.

```bash
cabinetai doctor
cabinetai doctor --fix       # attempt auto-repair
```

Checks Node.js version, cabinet structure, app installation, dependencies, and port availability.

### `cabinetai update`

Download a newer app version.

```bash
cabinetai update
```

### `cabinetai uninstall`

Remove cached app versions from `~/.cabinet/`.

```bash
cabinetai uninstall          # remove cached app versions
cabinetai uninstall --all    # remove entire ~/.cabinet directory
```

Your cabinet directories and data are never touched.

## Requirements

- Node.js >= 18 (20+ recommended)
- git (for importing templates and app download fallback)

## License

MIT
