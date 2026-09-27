import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Heuristic audit: prints locations only, never credential values.
const patterns = [
  /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|password|access[_-]?token)\s*[=:]\s*["'][A-Za-z0-9_+/=-]{20,}["']/i,
];
let findings = 0;
let scanned = 0;
function inspect(text, label) {
  scanned++;
  if (patterns.some(pattern => pattern.test(text))) { findings++; console.log(`REVIEW: ${label} (value redacted)`); }
}
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of tracked) {
  if (existsSync(file) && !/\.(png|pdf|jpg|woff2?|ico|gz)$/i.test(file)) inspect(readFileSync(file, "utf8"), file);
  if (/(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(file)) { findings++; console.log(`REVIEW: tracked environment file ${file}`); }
}
function scanDirectory(path) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) scanDirectory(file);
    else if (/\.(js|json|html|map|css)$/.test(file)) inspect(readFileSync(file, "utf8"), file);
  }
}
scanDirectory("dist/client");
if (process.argv.includes("--history")) {
  const commits = execFileSync("git", ["rev-list", "--all"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const commit of commits) {
    const diff = execFileSync("git", ["show", "--format=", "--no-ext-diff", commit], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    inspect(diff, `history commit ${commit}`);
  }
}
console.log(`Scanned ${scanned} files/commit diffs; ${findings} potential findings. Heuristics do not prove absence of secrets.`);
process.exitCode = findings ? 1 : 0;
