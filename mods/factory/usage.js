// Reads usage.py's rows; the sums over them are in stats.js (pure, so node tests them).
import { exec, appHome } from "herdr";

export * from "./stats.js";

export async function loadUsage() {
  const r = await exec("python3", ["-I", `${appHome()}/mods/factory-usage/usage.py`]);
  if (r.code !== 0) throw new Error(r.stderr.split("\n").filter(Boolean).pop() || "usage.py falló");
  return JSON.parse(r.stdout);
}
