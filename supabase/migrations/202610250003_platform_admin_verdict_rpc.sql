-- Public verdict for the browser: supabase-js `rpc('is_platform_admin')` resolves
-- through PostgREST, which only exposes the schemas configured for the API
-- (public). The `private` helper stays the single source of truth and keeps
-- powering the policies; this thin wrapper re-exports the boolean so the
-- Angular verdict works against the live database.
create function public.is_platform_admin() returns boolean
 language sql stable security definer set search_path='' as $$
  select private.is_platform_admin();
 $$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
