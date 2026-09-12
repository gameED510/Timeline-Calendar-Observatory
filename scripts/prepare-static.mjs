import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "esbuild";

export async function prepareStatic(directory, configPath) {
  for (const file of ["app.js", "performance.js", "calendar-motion.js", "theme.js", "sw.js", "styles.css"]) {
    const path = resolve(directory, file);
    const { code } = await transform(readFileSync(path, "utf8"), {
      loader: file.endsWith(".css") ? "css" : "js",
      minify: true,
      target: "es2020"
    });
    writeFileSync(path, code);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    writeFileSync(configPath,
      `export const FALLBACK_SUPABASE_URL = ${JSON.stringify(url)};\n` +
      `export const FALLBACK_SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`);
  } else {
    console.log("No build-time Supabase configuration; runtime environment variables are required.");
  }
}
