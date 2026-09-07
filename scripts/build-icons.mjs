import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import * as lucide from "lucide";

const root = resolve(import.meta.dirname, "..");
const source = ["index.html", "app.js"].map((file) => readFileSync(resolve(root, file), "utf8")).join("\n");
const names = new Set();
for (const match of source.matchAll(/["']([a-z][a-z0-9-]*)["']/g)) {
  const name = match[1].replace(/(^|-)([a-z0-9])/g, (_, prefix, letter) => letter.toUpperCase());
  if (Array.isArray(lucide[name])) names.add(name);
}
const imports = [...names].sort().join(", ");
await build({
  stdin: {
    contents: `import { createIcons, ${imports} } from 'lucide';
      const icons = { ${imports} };
      window.lucide = { createIcons: () => {
        createIcons({ icons, root: { querySelectorAll: (selector) => document.querySelectorAll('i' + selector) } });
      }};
      window.lucide.createIcons();`,
    resolveDir: root
  },
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  outfile: resolve(root, "vendor/lucide.min.js")
});
console.log(`Prepared ${names.size} icons: ${statSync(resolve(root, "vendor/lucide.min.js")).size} bytes`);
