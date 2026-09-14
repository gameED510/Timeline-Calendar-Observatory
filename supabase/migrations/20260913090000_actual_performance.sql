create table if not exists public.timeline_actual_performance (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  total numeric check (total >= 0 and total <= 1000000000),
  ads jsonb not null default '[]'::jsonb check (jsonb_typeof(ads) = 'array'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.timeline_actual_performance enable row level security;
create policy "Own actual performance" on public.timeline_actual_performance
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.timeline_actual_performance from anon, authenticated;
grant select on public.timeline_actual_performance to authenticated;

-- The estimate is immutable after the first capture; edits only update actuals.
create or replace function public.save_actual_performance(
  p_month text, p_total numeric, p_ads jsonb, p_snapshot jsonb, p_expected_version integer
) returns public.timeline_actual_performance
language plpgsql security definer set search_path = '' as $$
declare saved public.timeline_actual_performance;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_month is null
    or p_total < 0 or p_total > 1000000000
    or jsonb_typeof(p_ads) is distinct from 'array' or jsonb_array_length(p_ads) > 500
    or jsonb_typeof(p_snapshot) is distinct from 'object'
    or octet_length(p_ads::text) > 500000 or octet_length(p_snapshot::text) > 1000000
    or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Invalid settlement record';
  end if;
  if jsonb_typeof(p_snapshot->'formula') is distinct from 'number'
    or (p_snapshot->>'formula')::numeric < 0
    or exists (select 1 from jsonb_array_elements(p_ads) ad where
      jsonb_typeof(ad) <> 'object' or jsonb_typeof(ad->'revenue') is distinct from 'number'
      or (ad->>'revenue')::numeric < 0 or (ad->>'revenue')::numeric > 1000000000
      or length(coalesce(ad->>'name','')) > 200 or length(coalesce(ad->>'projectId','')) > 200
      or (ad->>'commissionRate')::numeric < 0 or (ad->>'commissionRate')::numeric > 1) then
    raise exception 'Invalid settlement amounts';
  end if;
  if p_expected_version = 0 then
    insert into public.timeline_actual_performance (user_id, month, total, ads, snapshot)
    values (auth.uid(), p_month, p_total, p_ads, p_snapshot)
    on conflict (user_id,month) do nothing returning * into saved;
  else
    update public.timeline_actual_performance set total = p_total, ads = p_ads,
      version = version + 1, updated_at = now()
    where user_id = auth.uid() and month = p_month and version = p_expected_version
    returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'Settlement changed; reload before saving' using errcode = '40001'; end if;
  return saved;
end;
$$;
revoke all on function public.save_actual_performance(text,numeric,jsonb,jsonb,integer) from public, anon;
grant execute on function public.save_actual_performance(text,numeric,jsonb,jsonb,integer) to authenticated;
