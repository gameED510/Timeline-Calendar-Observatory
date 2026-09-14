import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'vendor/ocr');
mkdirSync(target, { recursive: true });
for (const name of ['tesseract.min.js', 'worker.min.js']) copyFileSync(resolve(root, 'node_modules/tesseract.js/dist', name), resolve(target, name));
for (const name of ['tesseract-core', 'tesseract-core-simd', 'tesseract-core-lstm', 'tesseract-core-simd-lstm']) {
  copyFileSync(resolve(root, `node_modules/tesseract.js-core/${name}.wasm.js`), resolve(target, `${name}.wasm.js`));
}
for (const lang of ['chi_sim', 'eng']) copyFileSync(resolve(root, `node_modules/@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`), resolve(target, `${lang}.traineddata.gz`));
console.log('Prepared self-hosted OCR worker, engine and language data.');
