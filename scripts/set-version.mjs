#!/usr/bin/env node
// Usage: node scripts/set-version.mjs 0.2.0
// Sets the same version on every package in the monorepo so tags, the
// library and the demo never drift apart.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: npm run version:set -- <semver>   e.g. 0.2.0 or 1.0.0-rc.1");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of ["package.json", "packages/factfinch/package.json", "apps/demo/package.json"]) {
  const path = join(root, file);
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = version;
  if (pkg.dependencies?.factfinch) pkg.dependencies.factfinch = version;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${file} -> ${version}`);
}
console.log(
  `\nNext: update CHANGELOG.md, run "npm install", commit, then:\n  git tag -a v${version} -m "v${version}" && git push origin v${version}`,
);
