import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prepareStatic } from "./prepare-static.mjs";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output", "edgeone");
const entries = [
  "index.html",
  "styles.css",
  "theme.js",
  "app.js",
  "performance.js",
  "calendar-motion.js",
  "favicon.svg",
  "site.webmanifest",
  "sw.js",
  "vendor",
  "shared",
  "edge-functions",
  "edgeone.json"
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

function copyEntry(source, destination) {
  const children = readdirSync(source, { withFileTypes: true });
  mkdirSync(destination, { recursive: true });
  for (const child of children) {
    const childSource = resolve(source, child.name);
    const childDestination = resolve(destination, child.name);
    if (child.isDirectory()) {
      copyEntry(childSource, childDestination);
    } else if (child.isFile()) {
      copyFileSync(childSource, childDestination);
    }
  }
}

for (const entry of entries) {
  const source = resolve(root, entry);
  const destination = resolve(output, entry);
  if (entry.includes(".") && !entry.endsWith("-functions")) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  } else {
    copyEntry(source, destination);
  }
}

await prepareStatic(output, resolve(output, "edge-functions", "api", "_runtime-config.js"));
await build({
  entryPoints: [resolve(output, "edge-functions", "api", "supabase-proxy.js")],
  outfile: resolve(output, "edge-functions", "api", "supabase-proxy.js"),
  bundle: true, format: "esm", platform: "browser", target: "es2020", allowOverwrite: true
});
console.log(`Prepared EdgeOne deployment in ${output}`);
