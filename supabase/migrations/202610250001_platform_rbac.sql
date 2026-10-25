-- Platform RBAC: Super Admin management, accountant role, owner-controlled
-- membership status, suspension safety. Additive; no existing business table
-- column semantics change. Backed by the offline PGlite harness.
begin;

-- ---------------------------------------------------------------- accountant
alter table public.salon_members
  drop constraint salon_members_role_check,
  add constraint salon_members_role_check
    check(role in ('owner','manager','receptionist','employee','accountant'));

-- One auth account maps to at most one staff record.
create unique index if not exists employees_user_account_key
  on public.employees(user_id) where user_id is not null;

-- Accountants read the financial records plus the context needed to interpret
-- them; they can never read the platform tables or manage anything.
do $$ declare t text; begin
 foreach t in array array['service_entries','service_entry_items','payments','expenses','daily_closings','employees','customers','services','service_categories'] loop
  execute format('create policy accountant_read on public.%I for select to authenticated using(private.has_role(salon_id,array[''accountant'']))',t);
 end loop;
end $$;

-- ------------------------------------------------------------ platform admins
-- Platform roles are stored backend-side and written only by service_role
-- (operator bootstrap script / privileged Edge Functions). Browsers can only
-- ask "am I one?" through the definer function; the list itself stays private.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  note text not null default ''
);
create table public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null check(length(trim(action)) > 0),
  entity_type text not null,
  entity_id text not null default '',
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
alter table public.platform_audit_logs enable row level security;
revoke all on public.platform_admins, public.platform_audit_logs from public, anon, authenticated;
grant select on public.platform_audit_logs to authenticated;
create index on public.platform_audit_logs(created_at);
create index on public.platform_audit_logs(action);

create function private.is_platform_admin() returns boolean
 language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.platform_admins where user_id=auth.uid());
 $$;
revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

create policy platform_admin_inspect on public.platform_audit_logs for select
  to authenticated using(private.is_platform_admin());

-- Platform admins may inspect every salon, membership, staff record and profile
-- for the portal. They never get business-table write grants.
create policy platform_read_salons on public.salons for select to authenticated using(private.is_platform_admin());
create policy platform_read_members on public.salon_members for select to authenticated using(private.is_platform_admin());
create policy platform_read_staff on public.employees for select to authenticated using(private.is_platform_admin());
create policy platform_read_profiles on public.user_profiles for select to authenticated using(private.is_platform_admin());
create policy platform_read_customers on public.customers for select to authenticated using(private.is_platform_admin());
create policy platform_read_admins on public.platform_admins for select to authenticated using(private.is_platform_admin());

-- ------------------------------------------------- membership management RPCs
-- Owners suspend/restore and re-role their staff logins. Owners can never touch
-- a fellow owner, create memberships, or grant any role outside the salon list.
create function public.set_member_active(p_salon uuid,p_user uuid,p_active boolean)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare m record; begin
  if not private.has_role(p_salon,array['owner']) then raise exception 'Not authorized'; end if;
  select id,role into m from public.salon_members where salon_id=p_salon and user_id=p_user for update;
  if not found then raise exception 'Member not found'; end if;
  if m.role='owner' then raise exception 'Owner membership cannot be suspended here'; end if;
  update public.salon_members set active=p_active where id=m.id;
  insert into public.audit_logs(salon_id,actor_user_id,action,entity_type,entity_id)
    values(p_salon,auth.uid(),case when p_active then 'RESTORE_MEMBER' else 'SUSPEND_MEMBER' end,'salon_members',m.id);
  return m.id;
 end $$;
revoke all on function public.set_member_active(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_member_active(uuid,uuid,boolean) to authenticated;

create function public.set_member_role(p_salon uuid,p_user uuid,p_role text)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare m record; begin
  if p_role not in ('manager','receptionist','employee','accountant') then raise exception 'Invalid role'; end if;
  if not private.has_role(p_salon,array['owner']) then raise exception 'Not authorized'; end if;
  select id,role into m from public.salon_members where salon_id=p_salon and user_id=p_user for update;
  if not found then raise exception 'Member not found'; end if;
  if m.role='owner' or p_role='owner' then raise exception 'Owner memberships are provisioned by the platform only'; end if;
  update public.salon_members set role=p_role where id=m.id;
  insert into public.audit_logs(salon_id,actor_user_id,action,entity_type,entity_id)
    values(p_salon,auth.uid(),'SET_ROLE '||p_role,'salon_members',m.id);
  return m.id;
 end $$;
revoke all on function public.set_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_member_role(uuid,uuid,text) to authenticated;

-- Suspended or never-activated staff must not be able to bypass a suspension by
-- creating their own salon. Any membership row (active or not) blocks self-serve
-- onboarding.
create or replace function public.create_my_salon(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare s uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in to create a salon'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'Enter a salon name'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  if exists(select 1 from public.salon_members where user_id=u and active) then
    raise exception 'This account already belongs to a salon';
  end if;
  if exists(select 1 from public.salon_members where user_id=u) then
    raise exception 'This account is suspended; ask your salon owner for access';
  end if;
  -- Platform administrators must never mix salon ownership into their account.
  if private.is_platform_admin() then
    raise exception 'Platform administrators do not own salons';
  end if;
  insert into public.salons(name) values(trim(p_name)) returning id into s;
  insert into public.salon_members(salon_id,user_id,role) values(s,u,'owner');
  insert into public.user_profiles(id) values(u) on conflict (id) do nothing;
  insert into public.service_categories(salon_id,name)
    select s,unnest(array['Hair','Beard','Combo','Facial','Wellness','Treatment']);
  insert into public.expense_categories(salon_id,name)
    select s,unnest(array['Shop supplies','Electricity','Staff advance','Tea & refreshments','Rent','Equipment maintenance','Other']);
  return s;
end $$;
revoke all on function public.create_my_salon(text) from public,anon;
grant execute on function public.create_my_salon(text) to authenticated;

revoke all on all functions in schema private from public,anon;
grant execute on function private.is_platform_admin() to authenticated;
commit;