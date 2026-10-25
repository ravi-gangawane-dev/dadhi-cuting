-- Self-service onboarding for a signed-in account that has no salon membership yet.
-- The caller is always auth.uid(); no client-supplied user or salon id is trusted.
begin;

create function public.create_my_salon(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare s uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in to create a salon'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'Enter a salon name'; end if;
  -- Serialise concurrent taps from the same account so a double submit cannot
  -- create two salons.
  perform pg_advisory_xact_lock(hashtext(u::text));
  if exists(select 1 from public.salon_members where user_id=u and active) then
    raise exception 'This account already belongs to a salon';
  end if;
  insert into public.salons(name) values(trim(p_name)) returning id into s;
  insert into public.salon_members(salon_id,user_id,role) values(s,u,'owner');
  insert into public.user_profiles(id) values(u) on conflict (id) do nothing;
  insert into public.service_categories(salon_id,name)
    select s,unnest(array['Hair','Beard','Combo','Facial','Wellness','Treatment']);
  insert into public.expense_categories(salon_id,name)
    select s,unnest(array['Shop supplies','Electricity','Staff advance','Tea & refreshments','Rent','Equipment maintenance','Other']);
  return s;
end; $$;

revoke all on function public.create_my_salon(text) from public,anon;
grant execute on function public.create_my_salon(text) to authenticated;

commit;
