// The task list of a workspace: a Markdown file in jw's format, one line per task
//   - [ ] t1 title (after: t0)      [x] done, [!] blocked (a `  why: ...` line under it says why)
// Without `after:` a task waits for the ones above it; `fin` waits for all the others.

export const FINAL = "tests: run the project's tests and CI, note the result and the evidence under this line, and ask the advisor to review before marking it done";
export const MAX_LAPS = 20;

// shortcut: the agent builds the same path in shell with `tr` (bytes), this one by UTF-16 unit; they differ for non-ASCII folders.
export const pathFor = (dataDir, folder) => `${dataDir}/tasks/${folder.replace(/[^A-Za-z0-9._-]/g, "_")}.md`;

export function parse(md) {
  const tasks = [];
  for (const line of String(md ?? "").split("\n")) {
    const m = /^- \[( |x|!)\] (\S+)\s*(.*)$/.exec(line);
    if (m) {
      const after = /\(after:\s*([^)]*)\)\s*$/.exec(m[3]);
      tasks.push({ id: m[2], title: m[3].replace(/\s*\(after:[^)]*\)\s*$/, ""), after: after ? after[1].split(/[,\s]+/).filter(Boolean) : null, status: m[1] === "x" ? "done" : m[1] === "!" ? "blocked" : "todo", why: "" });
    } else if (tasks.length) {
      const why = /^\s+why:\s*(.*)$/.exec(line);
      if (why) tasks[tasks.length - 1].why = why[1];
    }
  }
  return tasks;
}

const deps = (t, i, all) => (t.id === "fin" || t.after?.includes("*") ? all.filter((o) => o !== t).map((o) => o.id) : t.after ?? all.slice(0, i).map((o) => o.id));

export const count = (tasks) => ({ done: tasks.filter((t) => t.status === "done").length, total: tasks.length });

// What the loop does next: a task to give, or why it stops.
export function pick(tasks) {
  if (!tasks.length) return { stop: "no hay lista" };
  if (tasks.some((t) => t.status === "blocked")) return { stop: "tarea bloqueada" };
  if (tasks.every((t) => t.status === "done")) return { stop: "todo listo" };
  const done = new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));
  const task = tasks.find((t, i) => t.status === "todo" && deps(t, i, tasks).every((d) => done.has(d)));
  return task ? { task } : { stop: "ninguna tarea lista (revisa los after:)" };
}

// One line: `hc send` pastes it and presses enter.
export const prompt = (task, path) =>
  `Tarea ${task.id}: ${task.id === "fin" ? FINAL : task.title}. La lista está en ${path}. Al terminar, cambia su línea a [x] en ese archivo y termina tu turno. Si necesitas a la persona, cámbiala a [!], escribe debajo una línea "  why: <motivo>" y termina tu turno. No marques hecho lo que no hiciste.`;

// The list as the file needs it: with the last task, `fin`, always there.
export const withFinal = (md) => (parse(md).some((t) => t.id === "fin") ? md : `${String(md ?? "").replace(/\n*$/, "\n")}- [ ] fin ${FINAL}\n`);
