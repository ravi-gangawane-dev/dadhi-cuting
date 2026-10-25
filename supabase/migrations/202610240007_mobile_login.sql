-- Sign in with either an email address or a mobile number.
-- Auth still uses the email identity; a mobile number is resolved to its account
-- email by a definer function so the browser never needs to read other profiles.

alter table public.user_profiles add column if not exists phone text not null default '';

create or replace function public.normalize_mobile(p_mobile text)
returns text
language sql
immutable
as $$
  select case
    when d = '' then ''
    when length(d) = 12 and d like '91%' then right(d, 10)
    when length(d) > 10 then right(d, 10)
    else d
  end
  from (select regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g') as d) s;
$$;

create unique index if not exists user_profiles_phone_key
  on public.user_profiles (public.normalize_mobile(phone))
  where public.normalize_mobile(phone) <> '';

create or replace function public.email_for_mobile(p_mobile text)
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select u.email
  from public.user_profiles p
  join auth.users u on u.id = p.id
  where length(public.normalize_mobile(p_mobile)) = 10
    and public.normalize_mobile(p.phone) = public.normalize_mobile(p_mobile)
    and u.email_confirmed_at is not null
  limit 1;
$$;

revoke all on function public.email_for_mobile(text) from public;
grant execute on function public.email_for_mobile(text) to anon, authenticated;
revoke all on function public.normalize_mobile(text) from public;
grant execute on function public.normalize_mobile(text) to anon, authenticated;

grant update(phone) on public.user_profiles to authenticated;
grant insert(id, full_name, avatar_url, phone) on public.user_profiles to authenticated;
