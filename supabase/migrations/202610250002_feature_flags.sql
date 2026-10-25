-- Dynamic feature flags: registry, salon entitlements, Super Admin setters and
-- enforcement in the existing definer RPCs and RLS policies.
begin;

create table public.feature_flags (
  key text primary key,
  label text not null,
  description text not null default '',
  lifecycle text not null default 'planned'
    check(lifecycle in ('planned','beta','enabled','disabled','deprecated')),
  platform_enabled boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.salon_feature_overrides (
  salon_id uuid not null references public.salons(id) on delete cascade,
  flag_key text not null references public.feature_flags(key) on delete cascade,
  enabled boolean not null,
  unique(salon_id,flag_key)
);
alter table public.feature_flags enable row level security;
alter table public.salon_feature_overrides enable row level security;
revoke all on public.feature_flags, public.salon_feature_overrides from public, anon, authenticated;
-- Flags are not secret; authenticated users may read the registry for status.
grant select on public.feature_flags to authenticated;
create policy flags_read on public.feature_flags for select to authenticated using(true);
create policy overrides_platform_read on public.salon_feature_overrides for select
  to authenticated using(private.is_platform_admin());

insert into public.feature_flags(key,label,description,lifecycle,platform_enabled,sort_order) values
 ('dashboard','Dashboard','Salon home and daily figures','enabled',true,1),
 ('customers','Customers','Customer records and history','enabled',true,2),
 ('employees','Employees','Staff records and team management','enabled',true,3),
 ('services','Services','Service catalog and invoice recording','enabled',true,4),
 ('payments','Payments','Receipt collection and ledger','enabled',true,5),
 ('expenses','Expenses','Business expenses','enabled',true,6),
 ('daily_closing','Daily Closing','Cash reconciliation and day lock','enabled',true,7),
 ('reports','Reports','Period aggregates and charts','enabled',true,8),
 ('appointments','Appointments','Booked,Scheduled visits','enabled',true,9),
 ('inventory','Inventory','Product stock','planned',false,10),
 ('whatsapp_notifications','WhatsApp Notifications','Customer messaging','planned',false,11),
 ('memberships','Memberships','Customer membership plans','planned',false,12),
 ('loyalty','Loyalty','Points and rewards','planned',false,13),
 ('multi_branch','Multi-Branch','Multiple salon branches per owner','planned',false,14);

-- A feature is usable by a salon only when the registry marks it implemented and
-- platform-available and the salon has not been explicitly de-entitled.
-- Missing registry row or unknown flag: fail closed.
create function private.feature_enabled(p_salon uuid,p_key text) returns boolean
 language sql stable security definer set search_path='' as $$
  select f.lifecycle in ('enabled','beta') and f.platform_enabled
    and coalesce((select o.enabled from public.salon_feature_overrides o
                  where o.salon_id=p_salon and o.flag_key=p_key), true)
  from public.feature_flags f
  where f.key = p_key;
 $$;
create function public.feature_state(p_salon uuid) returns jsonb
 language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(k,v order by s),'{}') from (
    select f.key k, f.sort_order s,
      jsonb_build_object('label',f.label,'description',f.description,'lifecycle',f.lifecycle,
        'platformEnabled',f.platform_enabled,
        'available', private.feature_enabled(p_salon,f.key),
        'entitled', coalesce((select o.enabled from public.salon_feature_overrides o
                              where o.salon_id=p_salon and o.flag_key=f.key), true)) v
    from public.feature_flags f) x;
 $$;
revoke all on function private.feature_enabled(uuid,text) from public,anon;
revoke all on function public.feature_state(uuid) from public,anon;
grant execute on function public.feature_state(uuid) to authenticated;

-- ------------------------------------------------ Super Admin setters (guarded)
create function public.platform_feature_set(p_key text,p_platform_enabled boolean,p_lifecycle text)
 returns void language plpgsql security definer set search_path='' as $$
 begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_lifecycle is not null and p_lifecycle not in ('planned','beta','enabled','disabled','deprecated')
    then raise exception 'Invalid lifecycle'; end if;
  update public.feature_flags set
    platform_enabled = coalesce(p_platform_enabled,platform_enabled),
    lifecycle = coalesce(p_lifecycle,lifecycle),
    updated_at = now()
  where key=p_key;
  if not found then raise exception 'Unknown feature'; end if;
  insert into public.platform_audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'FEATURE_SET','feature_flags',p_key,
      jsonb_build_object('platformEnabled',p_platform_enabled,'lifecycle',p_lifecycle));
 end $$;
revoke all on function public.platform_feature_set(text,boolean,text) from public,anon;
grant execute on function public.platform_feature_set(text,boolean,text) to authenticated;

create function public.platform_salon_feature(p_salon uuid,p_key text,p_enabled boolean)
 returns void language plpgsql security definer set search_path='' as $$
 begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.feature_flags where key=p_key) then raise exception 'Unknown feature'; end if;
  if not exists(select 1 from public.salons where id=p_salon) then raise exception 'Unknown salon'; end if;
  if p_enabled is null then
    delete from public.salon_feature_overrides where salon_id=p_salon and flag_key=p_key;
  else
    insert into public.salon_feature_overrides(salon_id,flag_key,enabled) values(p_salon,p_key,p_enabled)
      on conflict (salon_id,flag_key) do update set enabled=excluded.enabled;
  end if;
  insert into public.platform_audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'SALON_FEATURE','salon_feature_overrides',p_salon::text,
      jsonb_build_object('flag',p_key,'enabled',p_enabled));
 end $$;
revoke all on function public.platform_salon_feature(uuid,text,boolean) from public,anon;
grant execute on function public.platform_salon_feature(uuid,text,boolean) to authenticated;

-- ------------------------------- enforcement: rewrite writer RPCs with gates
create or replace function public.create_service_entry(p_salon uuid,p_employee uuid,p_customer uuid,p_items jsonb,p_discount numeric,p_notes text,p_request uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare e uuid; d date; item jsonb; price numeric; subtotal numeric:=0; qty integer; payload jsonb; old_payload jsonb;
 begin
 if not private.has_role(p_salon,array['owner','manager','receptionist']) then raise exception 'Not authorized'; end if;
 if not private.feature_enabled(p_salon,'services') then raise exception 'The Services feature is not available for this salon'; end if;
 select (now() at time zone timezone)::date into d from public.salons where id=p_salon for update;
 payload=jsonb_build_object('employee',p_employee,'customer',p_customer,'items',p_items,'discount',p_discount,'notes',p_notes);
 select id,request_payload into e,old_payload from public.service_entries where salon_id=p_salon and request_id=p_request;
 if found then if old_payload<>payload then raise exception 'Idempotency key reused with different request'; end if; return e; end if;
 perform private.lock_open_day(p_salon,d);
 if p_request is null or p_discount is null or p_discount<0 or p_discount<>round(p_discount,2) then raise exception 'Invalid discount/request'; end if;
 if not exists(select 1 from public.employees where salon_id=p_salon and id=p_employee and active) then raise exception 'Choose an active employee'; end if;
 if p_customer is not null and not exists(select 1 from public.customers where salon_id=p_salon and id=p_customer) then raise exception 'Invalid customer'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Select 1 to 100 service items'; end if;
 for item in select * from jsonb_array_elements(p_items) loop
 qty=(item->>'quantity')::integer;
 if qty is null or qty<1 or qty>100 or (item->>'quantity')::numeric<>qty then raise exception 'Invalid quantity'; end if;
 select s.price into price from public.services s where s.id=(item->>'service_id')::uuid and salon_id=p_salon and active for share;
 if not found then raise exception 'Invalid or archived service'; end if;
 subtotal=subtotal+price*qty;
 end loop;
 if p_discount>subtotal then raise exception 'Discount exceeds subtotal'; end if;
 insert into public.service_entries(salon_id,employee_id,customer_id,service_date,subtotal,discount_amount,total_amount,notes,request_id,request_payload)
 values(p_salon,p_employee,p_customer,d,subtotal,p_discount,subtotal-p_discount,coalesce(p_notes,''),p_request,payload) returning id into e;
 insert into public.service_entry_items(salon_id,service_entry_id,service_id,service_name,quantity,unit_price)
 select p_salon,e,s.id,s.name,(i->>'quantity')::integer,s.price from jsonb_array_elements(p_items) i join public.services s on s.id=(i->>'service_id')::uuid and s.salon_id=p_salon;
 perform private.notify(p_salon,'pending','Service recorded','An invoice was created. Collect payment separately.');
 return e;
 end $$;

create or replace function public.record_payment(p_salon uuid,p_entry uuid,p_parts jsonb,p_confirmation text,p_request uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare total numeric; received numeric; amount numeric:=0; part jsonb; result uuid; n integer:=0; d date; old_parts jsonb;
 begin
 if not private.has_role(p_salon,array['owner','manager','receptionist']) then raise exception 'Not authorized'; end if;
 if not private.feature_enabled(p_salon,'payments') then raise exception 'The Payments feature is not available for this salon'; end if;
 select (now() at time zone timezone)::date into d from public.salons where id=p_salon for update;
 if p_request is null or p_confirmation is null or length(trim(p_confirmation))=0 then raise exception 'Confirm receipt before recording payment'; end if;
 select service_entry_id into result from public.payments where salon_id=p_salon and request_id=p_request limit 1;
 if found then
 select jsonb_agg(jsonb_build_object('method',p.payment_method,'amount',p.amount) order by p.part) into old_parts from public.payments p where p.salon_id=p_salon and request_id=p_request;
 if result<>p_entry or old_parts<>p_parts or exists(select 1 from public.payments where salon_id=p_salon and request_id=p_request and confirmation<>p_confirmation) then raise exception 'Idempotency key reused with different request'; end if;
 return result;
 end if;
 perform private.lock_open_day(p_salon,d);
 select total_amount into total from public.service_entries where salon_id=p_salon and id=p_entry and status='completed' for update;
 if not found then raise exception 'Invalid invoice'; end if;
 if p_parts is null or jsonb_typeof(p_parts)<>'array' or jsonb_array_length(p_parts) not between 1 and 3 then raise exception 'Invalid payment parts'; end if;
 for part in select * from jsonb_array_elements(p_parts) loop
 if (part->>'method') is null or (part->>'method') not in ('cash','upi','card') or (part->>'amount') is null or (part->>'amount')::numeric<=0 or (part->>'amount')::numeric<>round((part->>'amount')::numeric,2) then raise exception 'Invalid payment'; end if;
 amount=amount+(part->>'amount')::numeric;
 end loop;
 select coalesce(sum(p.amount),0) into received from public.payments p where salon_id=p_salon and service_entry_id=p_entry;
 if amount>total-received then raise exception 'Payment exceeds outstanding balance'; end if;
 for part in select * from jsonb_array_elements(p_parts) loop
 n=n+1;
 insert into public.payments(salon_id,service_entry_id,amount,payment_method,confirmation,request_id,part)
 values(p_salon,p_entry,(part->>'amount')::numeric,part->>'method',p_confirmation,p_request,n);
 end loop;
 perform private.notify(p_salon,'payment','Payment recorded','Receipt manually confirmed by staff; no provider settlement implied.');
 return p_entry;
 end $$;

create or replace function public.close_business_day(p_salon uuid,p_date date,p_opening numeric,p_counted numeric)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare cash_in numeric; cash_out numeric; gross numeric; costs numeric; service_count integer; result uuid; tz text;
 begin
 if not private.has_role(p_salon,array['owner','manager']) then raise exception 'Not authorized'; end if;
 if not private.feature_enabled(p_salon,'daily_closing') then raise exception 'The Daily Closing feature is not available for this salon'; end if;
 select timezone into tz from public.salons where id=p_salon for update;
 if p_date is null or p_date>(now() at time zone tz)::date or p_opening is null or p_counted is null or p_opening<0 or p_counted<0 or p_opening<>round(p_opening,2) or p_counted<>round(p_counted,2) then raise exception 'Invalid closing inputs'; end if;
 perform private.lock_open_day(p_salon,p_date);
 select coalesce(sum(amount),0) into cash_in from public.payments where salon_id=p_salon and payment_method='cash' and (paid_at at time zone tz)::date=p_date;
 select coalesce(sum(amount) filter(where payment_method='cash'),0),coalesce(sum(amount),0) into cash_out,costs from public.expenses where salon_id=p_salon and expense_date=p_date;
 select coalesce(sum(total_amount),0) into gross from public.service_entries where salon_id=p_salon and service_date=p_date and status='completed';
 select coalesce(sum(i.quantity),0) into service_count from public.service_entry_items i join public.service_entries e on e.id=i.service_entry_id where e.salon_id=p_salon and e.service_date=p_date and e.status='completed';
 insert into public.daily_closings(salon_id,closing_date,opening_cash,cash_collected,cash_expenses,expected_cash,counted_cash,difference,gross_sales,expenses,services_count)
 values(p_salon,p_date,p_opening,cash_in,cash_out,p_opening+cash_in-cash_out,p_counted,p_counted-(p_opening+cash_in-cash_out),gross,costs,service_count) returning id into result;
 perform private.notify(p_salon,'closing','Day closed',p_date::text);
 return result;
 end $$;

revoke all on function public.create_service_entry(uuid,uuid,uuid,jsonb,numeric,text,uuid),public.record_payment(uuid,uuid,jsonb,text,uuid),public.close_business_day(uuid,date,numeric,numeric) from public,anon;
grant execute on function public.create_service_entry(uuid,uuid,uuid,jsonb,numeric,text,uuid),public.record_payment(uuid,uuid,jsonb,text,uuid),public.close_business_day(uuid,date,numeric,numeric) to authenticated;

-- ---------------- enforcement: writer policies consult the matching flag
-- (original role lists from 202610240001_core.sql are preserved per table)
drop policy operational_insert on public.customers;
drop policy operational_edit on public.customers;
create policy operational_insert on public.customers for insert to authenticated with check(
  private.has_role(salon_id,array['owner','manager','receptionist']) and private.feature_enabled(salon_id,'customers'));
create policy operational_edit on public.customers for update to authenticated
  using(private.has_role(salon_id,array['owner','manager','receptionist']) and private.feature_enabled(salon_id,'customers'))
  with check(private.has_role(salon_id,array['owner','manager','receptionist']) and private.feature_enabled(salon_id,'customers'));

drop policy operational_insert on public.employees;
drop policy operational_edit on public.employees;
create policy operational_insert on public.employees for insert to authenticated with check(
  private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'employees'));
create policy operational_edit on public.employees for update to authenticated
  using(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'employees'))
  with check(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'employees'));

drop policy operational_insert on public.services;
drop policy operational_edit on public.services;
create policy operational_insert on public.services for insert to authenticated with check(
  private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'services'));
create policy operational_edit on public.services for update to authenticated
  using(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'services'))
  with check(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'services'));

drop policy operational_insert on public.service_categories;
drop policy operational_edit on public.service_categories;
create policy operational_insert on public.service_categories for insert to authenticated with check(
  private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'services'));
create policy operational_edit on public.service_categories for update to authenticated
  using(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'services'))
  with check(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'services'));

drop policy operational_insert on public.expense_categories;
drop policy operational_edit on public.expense_categories;
create policy operational_insert on public.expense_categories for insert to authenticated with check(
  private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'expenses'));
create policy operational_edit on public.expense_categories for update to authenticated
  using(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'expenses'))
  with check(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'expenses'));

drop policy operational_insert on public.expenses;
drop policy operational_edit on public.expenses;
drop policy operational_delete on public.expenses;
create policy operational_insert on public.expenses for insert to authenticated with check(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'expenses'));
create policy operational_edit on public.expenses for update to authenticated using(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'expenses')) with check(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'expenses'));
create policy operational_delete on public.expenses for delete to authenticated using(private.has_role(salon_id,array['owner','manager']) and private.feature_enabled(salon_id,'expenses'));

drop policy operational_insert on public.appointments;
drop policy operational_edit on public.appointments;
drop policy operational_delete on public.appointments;
create policy operational_insert on public.appointments for insert to authenticated with check(private.has_role(salon_id,array['owner','manager','receptionist']) and private.feature_enabled(salon_id,'appointments'));
create policy operational_edit on public.appointments for update to authenticated using(private.has_role(salon_id,array['owner','manager','receptionist']) and private.feature_enabled(salon_id,'appointments')) with check(private.has_role(salon_id,array['owner','manager','receptionist']) and private.feature_enabled(salon_id,'appointments'));
create policy operational_delete on public.appointments for delete to authenticated using(private.has_role(salon_id,array['owner','manager','receptionist']) and private.feature_enabled(salon_id,'appointments'));

revoke all on all functions in schema private from public,anon;
grant execute on function private.is_platform_admin(),private.feature_enabled(uuid,text) to authenticated;
commit;