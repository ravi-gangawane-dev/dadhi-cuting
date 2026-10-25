begin;
-- PostgreSQL NUMERIC accepts NaN; ordinary positive-value checks alone do not reject it.
do $$ declare r record; begin
 for r in select table_name,column_name from information_schema.columns where table_schema='public'
 and table_name in ('services','employees','service_entries','service_entry_items','payments','expenses','daily_closings') and data_type='numeric'
 loop execute format('alter table public.%I add constraint %I check (%I <> ''NaN''::numeric)',r.table_name,r.column_name||'_finite',r.column_name); end loop;
end $$;
create function private.validate_timezone() returns trigger language plpgsql set search_path='' as $$
 begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid salon timezone'; end if;
 if TG_OP='UPDATE' and new.timezone<>old.timezone and exists(select 1 from public.service_entries where salon_id=new.id) then raise exception 'Timezone changes after trading require an administrator migration'; end if;
 return new;
 end; $$;
create trigger validate_timezone before insert or update on public.salons for each row execute function private.validate_timezone();
create function private.appointment_valid() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 perform 1 from public.employees where salon_id=new.salon_id and id=new.employee_id for update;
 if new.status='Booked' then
 if not exists(select 1 from public.employees where salon_id=new.salon_id and id=new.employee_id and active) then raise exception 'Choose an active employee'; end if;
 if exists(select 1 from public.appointments where salon_id=new.salon_id and employee_id=new.employee_id and appointment_date=new.appointment_date and id<>new.id and status='Booked' and start_time<new.end_time and end_time>new.start_time) then raise exception 'Employee already has an overlapping appointment'; end if;
 end if;
 return new;
 end; $$;
create trigger appointment_valid before insert or update on public.appointments for each row execute function private.appointment_valid();
revoke all on all functions in schema private from public,anon;
commit;
