-- Owner-role security hardening: feature_state must not disclose a salon's
-- feature entitlements to accounts that have no membership in that salon.
-- Members of the salon and Super Admins keep full access; everyone else gets
-- an empty object (fail closed) so flag metadata cannot be probed cross-salon.
begin;
create or replace function public.feature_state(p_salon uuid) returns jsonb
 language sql stable security definer set search_path='' as $$
  select case
    when private.has_role(
           p_salon,
           array['owner','manager','receptionist','employee']
         )
         or private.is_platform_admin()
    then (
      select coalesce(jsonb_object_agg(k,v order by s),'{}') from (
        select f.key k, f.sort_order s,
          jsonb_build_object('label',f.label,'description',f.description,'lifecycle',f.lifecycle,
            'platformEnabled',f.platform_enabled,
            'available', private.feature_enabled(p_salon,f.key),
            'entitled', coalesce((select o.enabled from public.salon_feature_overrides o
                                  where o.salon_id=p_salon and o.flag_key=f.key), true)) v
        from public.feature_flags f) x
    )
    else '{}'::jsonb
  end;
 $$;
commit;
