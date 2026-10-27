-- Owner-role cycle additions (fully additive; nothing existing is dropped).
begin;

-- 1. Salon self-onboarding becomes Super-Admin-controllable.
--    The existing product path stays available (seeded enabled), so current
--    onboarding and the offline harness keep working; the platform can switch
--    the regime off centrally, after which only the provisioning chain
--    (platform-admin-ops) can make owners. Staff sessions are unaffected.
insert into public.feature_flags(key,label,description,lifecycle,platform_enabled,sort_order)
values ('salon_self_onboarding','Salon self onboarding',
        'New accounts may create their own salon without a platform invitation','enabled',true,15)
on conflict (key) do update set updated_at = now();

create or replace function public.create_my_salon(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare s uuid; u uuid := auth.uid(); gate record;
begin
  if u is null then raise exception 'Sign in to create a salon'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'Enter a salon name'; end if;
  -- Registry-controlled: a missing row fails closed so the gate cannot be
  -- weakened by deleting the registry entry.
  select lifecycle, platform_enabled into gate from public.feature_flags where key='salon_self_onboarding';
  if not found or gate.lifecycle not in ('enabled','beta') or not gate.platform_enabled then
    raise exception 'Salon self-onboarding is disabled; ask your platform administrator';
  end if;
  -- Serialise concurrent taps from the same account so a double submit cannot
  -- create two salons.
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

commit;
