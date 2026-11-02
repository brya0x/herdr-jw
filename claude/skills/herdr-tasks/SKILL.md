---
name: herdr-tasks
description: Use right after you have made a plan, whenever you run inside Herdr (the environment variable HC_TERMINAL_ID is set). Writes the plan as this workspace's task list so Herdr's task loop feeds it to you one task at a time. The person can also call it with a list or a goal of their own.
---

# herdr tasks: work a plan to the end

You run in a Herdr space. Its task list is a Markdown file; print its path with

    echo "$HOME/.config/herdr-app/data/tasks/$(printf %s "$PWD" | tr -c 'A-Za-z0-9._-' _).md"

(run it from the space's folder, the one your session started in). A task is a line
`- [ ] t1 title (after: t0)`: `[x]` is done, `[!]` is blocked, and without `after:` a task waits for the ones
above it. The last task, `fin`, waits for all the others and holds the tests and their evidence.

**When you are called with text** (`/herdr-tasks ...`): a list (several lines) keeps the person's wording and
order; a goal (one sentence) gets a drafted list that you show and wait for the person's OK on.
With no text, the list is the plan you just made.

1. Create the folder and write the plan in that file: one line per task, ids `t1`, `t2`, ..., `after:` only where
   one task needs another. End it with `- [ ] fin <tests, CI and the advisor's review>`. If the file already has
   tasks, add at the end; never remove or untick a done line, and never rewrite it while the loop is on.
2. Tell the person to start the loop: the **Tasks** dialog (`cmd-shift-t`, or the `n/m` chip in the bar) has
   **Start loop**. You cannot start it yourself.
3. Herdr then sends you one task each time you end a turn. Do it, change its line to `[x]`, end your turn.
   If you need the person, change it to `[!]`, write `  why: <reason>` under it and end your turn: the loop stops.
4. `fin`: run the project's tests and CI, write the result under its line, ask the advisor to review, then `[x]`.
   If they fail, `[!]` with the reason.

Never mark done what you did not do. The loop stops by itself when everything is done, a task is blocked, or 20
laps pass.
