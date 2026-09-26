import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("mobile completion controls retain compact visuals inside full touch targets", () => {
  assert.match(styles, /Mobile controls keep compact icons while providing finger-sized hit areas/);
  assert.match(styles, /\.project-done-toggle,[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.match(styles, /\.project-done-toggle::before\s*\{\s*width:\s*34px;\s*height:\s*34px;/);
  assert.match(styles, /\.inline-pile:not\(\.expanded\):not\(\.dragging\) \.motion-card-main::before[\s\S]*?inset:\s*-9px -6px;/);
});

test("password forms expose correct account and recovery semantics", () => {
  assert.match(html, /id="syncEmail"[^>]+autocomplete="username"/);
  assert.match(html, /id="syncPasswordUpdateEmail"[^>]+autocomplete="username"/);
  assert.match(html, /id="syncNewPassword"[^>]+autocomplete="new-password"/);
  assert.match(app, /event === "PASSWORD_RECOVERY"/);
  assert.match(app, /syncPasswordUpdateForm\.classList\.toggle\("hidden", !syncState\.user \|\| !passwordRecoveryActive\)/);
});

test("primary text fields have persistent accessible labels and status relationships", () => {
  for (const id of ["syncEmail", "syncPassword", "syncNewPassword"]) {
    assert.match(html, new RegExp(`<label[^>]+for="${id}"[^>]*>`));
    assert.match(html, new RegExp(`id="${id}"[^>]+aria-describedby="syncNote"`));
  }
  assert.match(html, /id="syncNote"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /id="projectSearch"[^>]+aria-label=/);
  assert.match(html, /id="smartPasteInput"[^>]+aria-label=/);
});

test("the modal account popover traps tab focus and restores through its opener", () => {
  assert.match(app, /function trapAccountPopoverFocus\(event\)/);
  assert.match(app, /event\.shiftKey && document\.activeElement === first/);
  assert.match(app, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(app, /accountPopover\?\.addEventListener\("keydown", trapAccountPopoverFocus\)/);
  assert.match(app, /avatarButton\.focus\(\{ preventScroll: true \}\)/);
});

test("interactive blue and colored-card metadata use contrast-safe tokens", () => {
  assert.match(styles, /--accent-fill:\s*#0066cc/);
  assert.match(styles, /--accent-label:\s*#0066cc/);
  assert.match(styles, /--event-muted:\s*#4b4b50/);
  assert.match(styles, /\.mobile-tabbar button\.active\s*\{[^}]*color:\s*var\(--accent-label\)/s);
  assert.match(styles, /\.chip-project,[\s\S]*?color:\s*var\(--event-muted\)/);
});
