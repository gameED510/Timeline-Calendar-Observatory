import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
copyFileSync(
  resolve(root, "node_modules", "lucide", "dist", "umd", "lucide.min.js"),
  resolve(root, "vendor", "lucide.min.js")
);

console.log("Prepared local Lucide icon bundle");
