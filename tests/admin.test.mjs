import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261015090000_readonly_admin.sql',import.meta.url),'utf8');
const ui=await readFile(new URL('../admin-console.js',import.meta.url),'utf8');
test('admin RPC binds a confirmed owner UUID and refuses direct whitelist access',()=>{
  assert.match(sql,/email_confirmed_at is not null/);
  assert.match(sql,/a.user_id = auth.uid\(\)/);
  assert.match(sql,/revoke all on public.tl_admin_allowlist from public, anon, authenticated/);
  assert.match(sql,/security definer set search_path = ''/);
  assert.match(sql,/Administrator access required.*errcode = '42501'/);
  assert.match(sql,/revoke all on function.*from public, anon/);
});
test('admin response contains only bounded identity and aggregate usage fields',()=>{
  const payload=sql.slice(sql.indexOf("'users', coalesce"));
  for(const privateField of ['project', 'user_metadata', 'encrypted_password', 'access_token','commission'])
    assert.doesNotMatch(payload,new RegExp(`'${privateField}'`));
  assert.match(sql,/p_page_size > 100/);
  assert.match(sql,/length\(p_search\) > 200/);
  assert.match(sql,/limit p_page_size offset p_page \* p_page_size/);
  assert.match(sql,/where not p.deleted/);
});
test('admin UI clears private results on close, rejection and late account changes',()=>{
  assert.match(ui,/isCurrent\(userId\)/);
  assert.match(ui,/request!==sequence/);
  assert.match(ui,/closed=true;sequence\+\+;clearData\(\)/);
  assert.match(ui,/escape\(u.email/);
  assert.doesNotMatch(ui,/\.from\(|\.update\(|\.delete\(|\.insert\(/);
  assert.match(ui,/client.rpc\('admin_user_overview'/);
});
