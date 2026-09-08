import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prepareStatic } from "./prepare-static.mjs";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output", "netlify");
const siteOutput = resolve(output, "site");
const staticEntries = [
  "index.html",
  "styles.css",
  "theme.js",
  "app.js",
  "calendar-motion.js",
  "favicon.svg",
  "site.webmanifest",
  "sw.js",
  "vendor"
];

function copyEntry(source, destination) {
  const children = readdirSync(source, { withFileTypes: true });
  mkdirSync(destination, { recursive: true });
  for (const child of children) {
    const childSource = resolve(source, child.name);
    const childDestination = resolve(destination, child.name);
    if (child.isDirectory()) copyEntry(childSource, childDestination);
    else if (child.isFile()) copyFileSync(childSource, childDestination);
  }
}

rmSync(output, { recursive: true, force: true });
mkdirSync(siteOutput, { recursive: true });

for (const entry of staticEntries) {
  const source = resolve(root, entry);
  const destination = resolve(siteOutput, entry);
  if (entry.includes(".")) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  } else {
    copyEntry(source, destination);
  }
}

copyEntry(resolve(root, "netlify-functions"), resolve(output, "functions"));
copyEntry(resolve(root, "shared"), resolve(output, "shared"));
await prepareStatic(siteOutput, resolve(output, "functions", "_runtime-config.mjs"));
console.log(`Prepared Netlify deployment in ${output}`);
