begin;

create table if not exists public.tl_admin_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'reader')),
  created_at timestamptz not null default now()
);
alter table public.tl_admin_allowlist enable row level security;
revoke all on public.tl_admin_allowlist from public, anon, authenticated;

-- Pin the existing confirmed account's UUID, not an editable JWT email claim.
do $$
declare v_id uuid;
begin
  select id into v_id from auth.users
  where lower(email) = 'ly1636824020@gmail.com'
    and email_confirmed_at is not null;
  if v_id is null then
    raise exception 'The owner account must exist and have a confirmed email';
  end if;
  insert into public.tl_admin_allowlist(user_id, role) values(v_id, 'owner')
    on conflict (user_id) do nothing;
end $$;

create or replace function public.admin_user_overview(
  p_search text default '', p_page integer default 0, p_page_size integer default 25
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
  v_result jsonb;
begin
  select a.role into v_role from public.tl_admin_allowlist a
    join auth.users u on u.id = a.user_id
    where a.user_id = auth.uid() and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now());
  if v_role is null then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_page is null or p_page < 0 or p_page > 10000
    or p_page_size is null or p_page_size < 1 or p_page_size > 100
    or p_search is null or length(p_search) > 200 then
    raise exception 'Invalid pagination or search' using errcode = '22023';
  end if;
  with filtered as (
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at
    from auth.users u where u.deleted_at is null
      and strpos(lower(coalesce(u.email, '')), lower(trim(p_search))) > 0
  ), page_users as (
    select * from filtered order by created_at desc, id
      limit p_page_size offset p_page * p_page_size
  ), rows as (
    select u.*, coalesce(s.project_count, 0) project_count,
      coalesce(s.completed_count, 0) completed_count, s.last_saved_at
    from page_users u left join lateral (
      select count(*) filter (where not p.deleted) project_count,
        coalesce(sum((select count(*) from jsonb_each(
          case when jsonb_typeof(p.project -> 'completedMilestones') = 'object'
            then p.project -> 'completedMilestones' else '{}'::jsonb end
        ) c where c.value = 'true'::jsonb
          and coalesce(p.project -> 'milestones' ->> c.key, '') <> ''))
          filter (where not p.deleted), 0) completed_count,
        max(p.updated_at) last_saved_at
      from public.timeline_projects p where p.user_id = u.id
    ) s on true
  )
  select jsonb_build_object(
    'role', v_role,
    'total', (select count(*) from filtered),
    'page', p_page, 'page_size', p_page_size,
    'summary', (select jsonb_build_object(
      'registered', count(*),
      'new_7d', count(*) filter (where created_at >= now() - interval '7 days'),
      'signed_in_30d', count(*) filter (where last_sign_in_at >= now() - interval '30 days')
    ) from auth.users where deleted_at is null),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'registered_at', created_at,
      'last_sign_in_at', last_sign_in_at,
      'email_verified', email_confirmed_at is not null,
      'project_count', project_count, 'completed_count', completed_count,
      'last_saved_at', last_saved_at
    ) order by created_at desc, id) from rows), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.admin_user_overview(text, integer, integer) from public, anon;
grant execute on function public.admin_user_overview(text, integer, integer) to authenticated;

commit;
