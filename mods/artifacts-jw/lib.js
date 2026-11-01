// What the CLI (artifact.js) and the panel (main.js) agree on. A workspace's artifacts live in
// <appHome>/data/artifacts/<space key>/<id>/ as meta.json, v<n>.html|md and v<n>.verdict.json
// ({ verdict: "approved" | "changes", note, ts }) once a person decided on that version.

export const KINDS = ["prototype", "document", "report", "spec"];
export const MAX_VERSIONS = 20;
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "artifact";
export const formatOf = (file) => (/\.html?$/i.test(file) ? "html" : /\.md$/i.test(file) ? "md" : null);
export const latest = (meta) => meta.versions.reduce((a, b) => (b.n > a.n ? b : a));
export const statusOf = (verdict) => (!verdict ? "pendiente" : verdict.verdict === "approved" ? "aprobado" : "cambios");
export const verdictFile = (dir, n) => `${dir}/v${n}.verdict.json`;
export const versionFile = (dir, v) => `${dir}/v${v.n}.${v.format}`;
