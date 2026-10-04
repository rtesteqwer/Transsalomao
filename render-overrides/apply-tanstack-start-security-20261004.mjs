import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(target, "package.json"))) {
  throw new Error("tanstack-security: expected reconstructed application directory");
}

const packagePath = path.join(target, "package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
let changed = false;

for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
  if (pkg[section] && pkg[section]["@tanstack/react-start"]) {
    if (pkg[section]["@tanstack/react-start"] !== "1.168.60") {
      pkg[section]["@tanstack/react-start"] = "1.168.60";
      changed = true;
    }
  }
  if (pkg[section] && pkg[section]["@tanstack/start-server-core"]) {
    if (pkg[section]["@tanstack/start-server-core"] !== "1.169.39") {
      pkg[section]["@tanstack/start-server-core"] = "1.169.39";
      changed = true;
    }
  }
}

if (!pkg.dependencies?.["@tanstack/react-start"] && !pkg.devDependencies?.["@tanstack/react-start"] && !pkg.optionalDependencies?.["@tanstack/react-start"]) {
  throw new Error("tanstack-security: @tanstack/react-start dependency not found");
}

// Force every occurrence in the dependency graph to the patched versions.
// The reconstructed app can carry an older package-lock/transitive resolution,
// so package.json pinning alone is not sufficient for Vercel's security scanner.
pkg.overrides = {
  ...(pkg.overrides ?? {}),
  "@tanstack/react-start": "1.168.60",
  "@tanstack/start-server-core": "1.169.39",
};
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

// Recreate the graph from scratch. npm may otherwise keep obsolete nested
// package-lock entries, and Vercel scans those too.
const lockPath = path.join(target, "package-lock.json");
if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });

// Refresh the lockfile itself before the normal install/build. Stale TanStack entries cannot survive. Vercel's package
// security scanner also evaluates lockfile metadata, so leaving 1.168.49 there
// causes a deployment block even when package.json already requests 1.168.60.
execFileSync(
  "npm",
  ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"],
  { cwd: target, stdio: "inherit", env: process.env },
);

if (!fs.existsSync(lockPath)) throw new Error("tanstack-security: package-lock.json was not generated");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const packageEntries = Object.entries(lock.packages ?? {});
const reactStartCopies = packageEntries
  .filter(([name]) => name === "node_modules/@tanstack/react-start" || name.endsWith("/node_modules/@tanstack/react-start"))
  .map(([name, meta]) => ({ name, version: String((meta as any)?.version ?? "") }));
const serverCoreCopies = packageEntries
  .filter(([name]) => name === "node_modules/@tanstack/start-server-core" || name.endsWith("/node_modules/@tanstack/start-server-core"))
  .map(([name, meta]) => ({ name, version: String((meta as any)?.version ?? "") }));
const unsafeReactStart = reactStartCopies.filter((item) => item.version !== "1.168.60");
const unsafeServerCore = serverCoreCopies.filter((item) => item.version !== "1.169.39");
if (!reactStartCopies.length || !serverCoreCopies.length || unsafeReactStart.length || unsafeServerCore.length) {
  throw new Error("tanstack-security: unsafe dependency graph " + JSON.stringify({ reactStartCopies, serverCoreCopies }));
}
console.log("[tanstack-security] package.json + lockfile secured: react-start=1.168.60, start-server-core=1.169.39" + (changed ? "" : " (already pinned)"));
