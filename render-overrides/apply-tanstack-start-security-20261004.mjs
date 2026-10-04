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

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
console.log("[tanstack-security] @tanstack/react-start pinned to patched 1.168.60" + (changed ? "" : " (already patched)"));
