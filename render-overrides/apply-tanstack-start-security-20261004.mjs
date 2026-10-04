import fs from "node:fs";
import path from "node:path";

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
console.log("[tanstack-security] forced patched TanStack versions: react-start=1.168.60, start-server-core=1.169.39; existing lock retained for peer compatibility" + (changed ? "" : " (already patched)"));
