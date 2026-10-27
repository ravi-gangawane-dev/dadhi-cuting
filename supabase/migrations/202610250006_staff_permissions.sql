-- Granular per-staff capability grants, layered ON TOP of the fixed roles.
-- The role matrix stays the floor (nothing a role already has is ever removed);
-- an explicit row here can only ADD access for a non-owner member. Owners keep
-- full access regardless of rows, and hard owner-only work (staff accounts,
-- platform flags, membership changes) is never grantable.
begin;

create table public.salon_permissions (
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in
    ('record_services','manage_customers','manage_appointments','manage_services','manage_expenses')),
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(salon_id,user_id,permission)
);
create index on public.salon_permissions(user_id);
alter table public.salon_permissions enable row level security;
revoke all on public.salon_permissions from public, anon, authenticated;
create policy salon_permissions_read on public.salon_permissions for select to authenticated using(
  user_id = auth.uid() or private.has_role(salon_id,array['owner'])
);
create policy salon_permissions_write on public.salon_permissions for insert to authenticated
  with check(private.has_role(salon_id,array['owner']) and granted);
create policy salon_permissions_write_update on public.salon_permissions for update to authenticated
  using(private.has_role(salon_id,array['owner']))
  with check(private.has_role(salon_id,array['owner']) and granted);
create policy salon_permissions_write_delete on public.salon_permissions for delete to authenticated
  using(private.has_role(salon_id,array['owner']));

-- True only while an explicit, current, active NON-OWNER membership holds the
-- capability. Purely additive: the role matrix is never weakened.
create function private.has_permission(s uuid,u uuid,k text) returns boolean
 language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.salon_permissions p
    join public.salon_members m on m.salon_id=p.salon_id and m.user_id=p.user_id
    where p.salon_id=s and p.user_id=u and p.permission=k and p.granted and m.active and m.role<>'owner'
  );
 $$;

-- Owner-only setter with audit; a grant row is created, a revoke deletes the
-- row so semantics stay "role defaults + explicit additions".
create function public.set_member_permission(p_salon uuid,p_user uuid,p_permission text,p_granted boolean)
 returns void language plpgsql security definer set search_path='' as $$
 declare m record; begin
  if not private.has_role(p_salon,array['owner']) then raise exception 'Not authorized'; end if;
  if p_permission not in
     ('record_services','manage_customers','manage_appointments','manage_services','manage_expenses')
  then raise exception 'Unknown capability'; end if;
  if p_granted is null then raise exception 'Specify granted true or false'; end if;
  select role,active into m from public.salon_members
    where salon_id=p_salon and user_id=p_user for update;
  if not found or not m.active or m.role='owner' then raise exception 'Active staff member required'; end if;
  if p_granted then
    insert into public.salon_permissions(salon_id,user_id,permission,granted) values(p_salon,p_user,p_permission,true)
    on conflict (salon_id,user_id,permission) do update set granted=true, updated_at=now();
  else
    delete from public.salon_permissions where salon_id=p_salon and user_id=p_user and permission=p_permission;
  end if;
  insert into public.audit_logs(salon_id,actor_user_id,action,entity_type,entity_id)
    values(p_salon,auth.uid(),
      case when p_granted then 'GRANT_'||p_permission else 'REVOKE_'||p_permission end,
      'salon_permissions',p_user);
 end $$;
revoke all on function public.set_member_permission(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.set_member_permission(uuid,uuid,text,boolean) to authenticated;

-- Read reach for granted staff (row-level adds; note finance reads stay tight).
create policy perm_read_entries on public.service_entries for select to authenticated
  using(private.has_permission(salon_id,auth.uid(),'record_services'));
create policy perm_read_items on public.service_entry_items for select to authenticated
  using(private.has_permission(salon_id,auth.uid(),'record_services'));
create policy perm_read_payments on public.payments for select to authenticated
  using(private.has_permission(salon_id,auth.uid(),'record_services'));
create policy perm_read_customers on public.customers for select to authenticated
  using(private.has_permission(salon_id,auth.uid(),'record_services')
     or private.has_permission(salon_id,auth.uid(),'manage_customers'));
create policy perm_read_appointments on public.appointments for select to authenticated
  using(private.has_permission(salon_id,auth.uid(),'manage_appointments'));
create policy perm_read_expenses on public.expenses for select to authenticated
  using(private.has_permission(salon_id,auth.uid(),'manage_expenses'));
create policy perm_read_expense_categories on public.expense_categories for select to authenticated
  using(private.has_permission(salon_id,auth.uid(),'manage_expenses'));

-- Write reach for granted staff (creates/edits in the granted domain only).
create policy perm_write_customers on public.customers for insert to authenticated
  with check(private.has_permission(salon_id,auth.uid(),'manage_customers'));
create policy perm_edit_customers on public.customers for update to authenticated
  using(private.has_permission(salon_id,auth.uid(),'manage_customers'))
  with check(private.has_permission(salon_id,auth.uid(),'manage_customers'));
create policy perm_write_appointments on public.appointments for insert to authenticated
  with check(private.has_permission(salon_id,auth.uid(),'manage_appointments'));
create policy perm_edit_appointments on public.appointments for update to authenticated
  using(private.has_permission(salon_id,auth.uid(),'manage_appointments'))
  with check(private.has_permission(salon_id,auth.uid(),'manage_appointments'));
create policy perm_write_services on public.services for insert to authenticated
  with check(private.has_permission(salon_id,auth.uid(),'manage_services'));
create policy perm_edit_services on public.services for update to authenticated
  using(private.has_permission(salon_id,auth.uid(),'manage_services'))
  with check(private.has_permission(salon_id,auth.uid(),'manage_services'));
create policy perm_write_expenses on public.expenses for insert to authenticated
  with check(private.has_permission(salon_id,auth.uid(),'manage_expenses'));
create policy perm_edit_expenses on public.expenses for update to authenticated
  using(private.has_permission(salon_id,auth.uid(),'manage_expenses'))
  with check(private.has_permission(salon_id,auth.uid(),'manage_expenses'));

-- The visit/payment RPCs also honour the explicit grant. Bodies mirror
-- 202610250002_feature_flags.sql exactly (flags still gate); only the guard
-- line accumulates the capability alternative.
create or replace function public.create_service_entry(p_salon uuid,p_employee uuid,p_customer uuid,p_items jsonb,p_discount numeric,p_notes text,p_request uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare e uuid; d date; item jsonb; price numeric; subtotal numeric:=0; qty integer; payload jsonb; old_payload jsonb;
 begin
 if not (private.has_role(p_salon,array['owner','manager','receptionist'])
         or private.has_permission(p_salon,auth.uid(),'record_services')) then raise exception 'Not authorized'; end if;
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
 end; $$;

create or replace function public.record_payment(p_salon uuid,p_entry uuid,p_parts jsonb,p_confirmation text,p_request uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
declare total numeric; received numeric; amount numeric:=0; part jsonb; result uuid; n integer:=0; d date; old_parts jsonb;
 begin
 if not (private.has_role(p_salon,array['owner','manager','receptionist'])
         or private.has_permission(p_salon,auth.uid(),'record_services')) then raise exception 'Not authorized'; end if;
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
 select coalesce(sum(p.amount),0) into received from public.payments p where p.salon_id=p_salon and service_entry_id=p_entry;
 if amount>total-received then raise exception 'Payment exceeds outstanding balance'; end if;
 for part in select * from jsonb_array_elements(p_parts) loop
 n=n+1;
 insert into public.payments(salon_id,service_entry_id,amount,payment_method,confirmation,request_id,part)
   values(p_salon,p_entry,(part->>'amount')::numeric,part->>'method',p_confirmation,p_request,n);
 end loop;
 perform private.notify(p_salon,'payment','Payment recorded','Receipt manually confirmed by staff; no provider settlement implied.');
 return p_entry;
 end; $$;
commit;
