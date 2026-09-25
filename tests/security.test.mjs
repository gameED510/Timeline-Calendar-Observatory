import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const required = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none"
};

test("all deployment targets enforce the additional browser security headers", () => {
  for (const file of ["../edgeone.json", "../vercel.json"]) {
    const config=JSON.parse(readFileSync(new URL(file,import.meta.url),"utf8"));
    const headers=Object.fromEntries(config.headers[0].headers.map(item=>[item.key,item.value]));
    for(const [key,value] of Object.entries(required))assert.equal(headers[key],value,`${file} ${key}`);
  }
  const netlify=readFileSync(new URL("../netlify.toml",import.meta.url),"utf8");
  for(const [key,value] of Object.entries(required))assert.ok(netlify.includes(`${key} = "${value}"`),`netlify ${key}`);
});

test("deployment CSP denies framing, plugins, foreign connections and external forms", () => {
  const config=JSON.parse(readFileSync(new URL("../edgeone.json",import.meta.url),"utf8"));
  const csp=config.headers[0].headers.find(item=>item.key==="Content-Security-Policy")?.value || "";
  for(const rule of ["default-src 'self'","connect-src 'self'","object-src 'none'","frame-ancestors 'none'","form-action 'self'","base-uri 'self'"])
    assert.ok(csp.includes(rule),rule);
  assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval|\*/);
});
