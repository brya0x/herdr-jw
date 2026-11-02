# herdr-jw

**A workspace is a factory: a folder with several repos, an agent and their worktrees.**

Mods and a layout for [Herdr](https://herdr.dev) that bring jw's workflow (`feat/repo-refs-prototype` and
`feat/workspace-factory`) to Herdr and tie it to Claude Code: you create the workspace, add repos to it, open
worktrees with their `setup`, let the agent work through a task list, approve its results from a panel, and see
what each PR costs and how long it takes. No Android app.

```
~/ws/my-product/               a workspace = a Herdr space with claude beside it
├── .factory.json              the workspace's repos
├── repos/
│   ├── api/                   cloned from GitHub (or linked to a folder of yours)
│   └── web/
└── worktrees/
    └── api/fix-login/         a branch, with its setup already run
```

## Repo layout

Organised by who consumes each thing:

```
install.sh  sync.sh  README.md
.claude-plugin/marketplace.json    the plugin's marketplace (it has to be at the root)
herdr/                             what Herdr loads
├── mods/                          factory, factory-tasks, worktree-wt, tabs-one, picker-one, spaces-one, jw-settings, artifacts-jw, jw-diff
├── layouts/                       jw.json
└── config/                        keys.json (shortcuts)
claude/                            what Claude Code loads
└── plugins/jw/                    jw:tasks, jw:role
internals/
└── themes/                        palettes and scripts that serve Herdr and Claude Code at once
```

`install.sh` and `sync.sh` copy to `~/.config/herdr-app` and `~/.claude`; those paths do not change.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/brya0x/herdr-jw/main/install.sh | sh
```

You need Herdr (opened once), `curl`, `tar`, `rsync` and `python3`, on macOS. The script downloads the repo and
copies the mods, layout and themes to `~/.config/herdr-app`. It also adds the shortcuts
below to `keys.json` and removes the `tab.*` ones; if anything changes it leaves a `keys.json.bak-<date>` copy.

- `| sh -s -- --no-keys` leaves `keys.json` alone.
- `| sh -s -- --no-plugin` skips the `jw` plugin for Claude Code (if `claude` is installed it adds the plugin from this repo's marketplace; running the script again updates it).
- `HERDR_JW_REF=<branch|tag>` picks the version. Running it again updates.
- To update without leaving Herdr: `cmd-shift-,` and the **Update** section runs the same thing and shows what it prints. Restart Herdr afterwards to load the new mods.
- Restart Herdr and turn the layout on: `herdr-app do layout.switch '{"name":"jw"}'` (the script does not switch it for you).

From a clone: `./sync.sh push` copies the same without touching `keys.json`. To save into the repo what you changed
in the live config: `./sync.sh pull`, then commit.

## What it brings

### Workspaces as a factory (`herdr/mods/factory`)

`cmd-shift-n` asks for a name, creates `~/ws/<name>/` and opens a space with `claude` and the repos panel beside it.
The panel adds GitHub repos (`gh repo clone`, never leaving half clones) or folders (linked, not copied), and shows
each one's state, branch and changes, and each branch's PR: merged or with failing CI, with a notification.

The panel (the **Repos** button in the top bar of a factory workspace) has four tabs:

| Tab | What it shows |
|---|---|
| **Productivity** | The factory: every worktree by stage (and also the list's filter), times you spoke per PR, cycle time (start → merge, start → PR, PR → merge), PRs per week, tokens per model, agents now and the list of worktrees with their PR. |
| **Spend** | Consumption, average cost per PR, usage per model, tokens per week and biggest consumers. |
| **Detections** | Failures, not PRs. The agents' (commands that failed in the last 7 days and nobody fixed) and the factory's (a `setup` that exited with an error, failed clones, `gh`, the usage reading). A click shows the error and offers "Fix with an agent" (a claude in that folder with the error as its first message), "Open worktree" and "Dismiss". |
| **Repos** | Add, remove and create worktrees. |

Everything comes from claude's transcripts and `gh`. There are no evaluators (scores): nothing measures them yet.

### Worktrees like jw (`herdr/mods/worktree-wt`)

Reads the repo's `.jw.toml` (`root`, `setup`, `copy`, `open`), puts the folder at the last segment of the branch,
validates like jw, runs `setup` before opening, can hand claude an initial task, and warns about unpushed commits
when removing. From a terminal:

```sh
bun herdr/mods/worktree-wt/wt.js <branch> [--in <repo>] [--branch b] [--from ref] [--open shell|claude] [--task text]
```

A workspace's repos go to `<workspace>/worktrees/<repo>/<folder>`; the others, to `<repo>-wt/` according to
`.jw.toml`. The workspace is recognised by the repo (even if its folder in `repos/` is a link elsewhere), not by the
folder you launch from.

### Tasks with a loop (`herdr/mods/factory-tasks` + `claude/plugins/jw`)

`cmd-shift-t` opens the workspace's task list (jw's Markdown, one per folder). When the agent ends a turn it gets
the next ready task, up to 20 laps or until everything is done or a task is blocked. The `n/m` counter shows in the
bar. The `jw:tasks` skill teaches the agent to write its plan there.

### Artifacts to approve (`herdr/mods/artifacts-jw`)

An agent publishes an `.html` or `.md` and waits for your decision:

```sh
bun ~/.config/herdr-app/mods/artifacts-jw/artifact.js publish report.html --wait
```

A notification appears and `cmd-shift-a` opens the panel: Open, Approve or Request changes with a note. `wait`
returns exit 0 if you approved, 4 if you requested changes (the note on stdout) and 3 if time ran out. A person can
take longer than the 10-minute limit of the Bash tool: run it with `run_in_background` or `--timeout`.
It keeps up to 20 versions in `data/artifacts/`. There is no embedded viewer: Open uses the system's app.
Also `ls`, `wait` and `rm`.

### Plugin `jw` (`claude/plugins/jw`)

Claude Code skills, prefixed `jw:`:

- `jw:tasks`: take a plan to the end with `jw tasks`.
- `jw:role`: `/jw:role <role>` puts the session in a role (`brain`, the orchestrator that hands work out in worktrees; `researcher`, read-only with sources). Roles are `<name>.md` files in three layers, and the one closest to the project wins: `.claude/roles/`, `~/.claude/roles/` and the plugin's. The plugin's use Herdr's tools (`hc`, `wt.js`, `artifact.js`) and are called `brain` and `researcher`, like jw's: if `~/.claude/roles/` has one with the same name, that one wins. The roles are written in Spanish, like jw's.

```sh
claude plugin marketplace add brya0x/herdr-jw
claude plugin install jw@herdr-jw
```

`install.sh` already does this; open sessions load it with `/reload-plugins`.

### Themes for Herdr and Claude Code (`internals/themes/` + `herdr/mods/jw-settings`)

Ten themes (One, Catppuccin, Tokyo Night, Gruvbox and Solarized, each dark and light) with a single palette per
theme, from which `build.py` makes the Herdr theme and the Claude Code one (`~/.claude/themes/`). `cmd-shift-,`
opens the jw screen, **Theme** section: **Light**, **Dark** or **System**, and which dark and light theme to use. In
System, Herdr follows the system and Claude's theme changes with it. Claude always uses a single theme, `JW`
(`~/.claude/themes/jw.json`), rewritten with the chosen palette; Claude Code repaints the open sessions by itself
when that file changes, working or not. A session that does not use `JW` yet is moved to it once with `/theme`
(keys sent through `hc`, also if it is working). Sessions with text typed in are left alone. A session opened before
`~/.claude/themes/` existed does not list `JW` in its `/theme`: it cannot be moved on its own and has to be restarted
by hand with `claude --resume`.
From a terminal: `use.py mode light|dark|system`, `set <slug>` and `apply`.

### Navigation and layout

- `herdr/layouts/jw.json`: a clone of `main` without the agents section, with `tabs-one`.
- `herdr/mods/tabs-one`: no tabs and no `+`, one tab per workspace; it keeps the name and the window buttons. The Diff button opens the diff viewer in a pane beside the agent; Files and Changes ship off and are turned on in `cmd-shift-,` > Panels.
- `herdr/mods/spaces-one`: worktrees hang from their repo (or from the workspace that lists that repo), and `cmd-]` / `cmd-[` walk the spaces in the sidebar's order.
- `herdr/mods/jw-diff` (the **Diff** button of the top bar; the panel is titled `jw:diff`): jw's diff viewer as a layout **pane**. The button splits the focused pane and opens this mod to its right (with the border, focus, zoom and swap of any pane, Herdr's look and the terminal font in the diff); pressing it again closes it. The pane shows the folder it was opened from. Three views: **Uncommitted** (the working tree against `HEAD`), **Branch** (against the base branch: `origin/main` or whatever `origin/HEAD` says) and **Commits** (pick one and its files show, with "‹ commits" to go back). The diff is **unified** (one column) or **side by side** like GitHub (old on the left, new on the right, long lines cut); the selector in the header remembers the choice. The file list is on the left of the diff (the ▥/▤ button in the header moves it above and remembers the choice). Each file has a "seen" checkbox, kept in `data/diff-seen.json` and cleared when the file's change changes. It refreshes by itself when the folder changes. Read-only: it writes nothing under `.git`. Not ported from jw yet: word-level changes, wrapping long lines (in unified mode you scroll horizontally), picking lines with `V` and opening a file in a viewer.
- `herdr/mods/picker-one`: tab and space picker (`cmd-p`).
- `herdr/mods/jw-settings` (`cmd-shift-,`): one screen with a list on the left, like Herdr's Settings. **Theme** (light, dark or system, and which theme), **Costs** (cost and tokens per project and per week, from `~/.claude/projects`, same counting rules as jw's `usage.rs`), **Panels** (which buttons show in the top bar: Diff on, Files and Changes off) and **Update** (runs the published `install.sh`, without touching `keys.json`).

## Shortcuts

| Shortcut | Does |
|---|---|
| `cmd-]` / `cmd-[` | Next / previous space, in the sidebar's order |
| `cmd-alt-]` / `cmd-alt-[` | Next / previous agent |
| `cmd-shift-n` | New workspace (factory) |
| `cmd-shift-t` | The workspace's tasks |
| `cmd-shift-a` | Artifacts to approve |
| `cmd-shift-,` | jw screen: Theme, Costs, Panels and Update (`Tab` or `1`-`4` switch section) |
| `cmd-p` | Tab and space picker |

They all come from `herdr/config/keys.json`.

## Rates

Cost shows "no rate" until you write `~/.config/herdr-app/data/factory-rates.json`
(USD per million tokens): `{"opus": {"input": …, "cache_read": …, "output": …}}`. There are no defaults.

## Differences from jw

- `[[env]] file = ".env"` is treated as `copy` (current jw ignores it).
- Settings are read like jw does: the repo's `.jw.toml` and, if it does not exist, the personal file `~/.config/jw/projects/<origin>.toml` (the first that exists is the only one read). `ports`, `[dev]` and `[layout]` are ignored, and so are `branch` and `workspace` (jw does not use them either).
- A new branch starts from `HEAD`, as in jw.
- After a `setup`, the task is passed to claude as its first argument (Herdr only delivers `task` if `argv` is `claude`).
- Without `agents`, `cmd-alt-]` and `cmd-alt-[` may follow no list (untested).

## Tests

```sh
bun herdr/mods/worktree-wt/jwtoml.test.js     # reads real .jw.toml files from a repo of yours: the path is at the top of the test
bun herdr/mods/artifacts-jw/artifact.test.js
bun herdr/mods/factory-tasks/lib.test.js
bun herdr/mods/jw-diff/lib.test.js
node herdr/mods/factory/test_stats.mjs
python3 herdr/mods/factory/test_fails.py
python3 herdr/mods/factory/test_flow.py
python3 -I herdr/mods/jw-settings/test_usage.py
```

`herdr-app check herdr/mods/<name>` only draws the initial state: always look at `herdr-app shot`.
Untested with clicks: the shell/claude selector and the task field of the dialog, the artifacts panel buttons, the
merged-PR and failing-CI notifications.
Claude asks "do you trust this folder?" in a new folder; if it happens in every worktree, the task waits until you accept.
