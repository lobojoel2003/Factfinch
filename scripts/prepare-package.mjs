#!/usr/bin/env node
// Runs before `npm pack` / `npm publish` of packages/factfinch. Copies the
// LICENSE and the root README into the package, rewriting the README's
// relative links and images to absolute GitHub URLs so they work on npm too.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "packages/factfinch");
const REPO = "https://github.com/lobojoel2003/Factfinch";
const RAW = "https://raw.githubusercontent.com/lobojoel2003/Factfinch/main";

const isRelative = (url) => !/^(https?:|mailto:|#|\/\/)/.test(url);
const clean = (url) => url.replace(/^\.\//, "");

let readme = readFileSync(join(root, "README.md"), "utf8");
// Images: markdown ![alt](path) and HTML src= / srcset= attributes.
readme = readme
  .replace(/(!\[[^\]]*\]\()([^)\s]+)/g, (m, pre, url) =>
    isRelative(url) ? `${pre}${RAW}/${clean(url)}` : m,
  )
  .replace(/\b(src|srcset)="([^"]+)"/g, (m, attr, url) =>
    isRelative(url) ? `${attr}="${RAW}/${clean(url)}"` : m,
  );
// Links: [text](path) and href= (images are already absolute by now).
readme = readme
  .replace(/(\]\()([^)\s]+)/g, (m, pre, url) =>
    isRelative(url) ? `${pre}${REPO}/blob/main/${clean(url)}` : m,
  )
  .replace(/\bhref="([^"]+)"/g, (m, url) =>
    isRelative(url) ? `href="${REPO}/blob/main/${clean(url)}"` : m,
  );

writeFileSync(join(pkgDir, "README.md"), readme);
copyFileSync(join(root, "LICENSE"), join(pkgDir, "LICENSE"));
console.log("prepared packages/factfinch README.md and LICENSE");
