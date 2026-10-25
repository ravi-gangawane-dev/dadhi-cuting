-- Fresh-schema migration. Inspect an existing project before applying; conflicting
-- tables deliberately fail instead of silently accepting incompatible definitions.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.salons (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) > 0),
 phone text not null default '', address text not null default '', logo_url text,
 opening_hours jsonb not null default '{"opening":"09:00","closing":"21:00"}',
 timezone text not null default 'Asia/Kolkata', language text not null default 'en' check(language in ('en','mr')),
 name_marathi text not null default '', tagline text not null default '', tagline_marathi text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_profiles (
 id uuid primary key references auth.users(id) on delete cascade, full_name text not null default '', avatar_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.salon_members (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
 user_id uuid not null references auth.users(id), role text not null check(role in ('owner','manager','receptionist','employee')),
 active boolean not null default true, created_at timestamptz not null default now(), unique(salon_id,user_id)
);
create table public.employees (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
 user_id uuid references auth.users(id), full_name text not null check(length(trim(full_name)) > 0), phone text not null default '',
 designation text not null default 'barber', avatar_url text, active boolean not null default true,
 commission_rate numeric(5,2) not null default 0 check(commission_rate between 0 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(salon_id,id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
 full_name text not null check(length(trim(full_name)) > 0), phone text not null default '', gender text, notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(salon_id,id)
);
create table public.service_categories (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
 name text not null check(length(trim(name)) > 0), active boolean not null default true, unique(salon_id,name), unique(salon_id,id)
);
create table public.services (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), category_id uuid,
 name text not null check(length(trim(name)) > 0), price numeric(12,2) not null check(price >= 0),
 duration_minutes integer not null check(duration_minutes > 0), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(salon_id,id),
 foreign key(salon_id,category_id) references public.service_categories(salon_id,id)
);
create table public.service_entries (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), customer_id uuid, employee_id uuid not null,
 service_date date not null, status text not null default 'completed' check(status in ('completed','in_progress','cancelled')),
 subtotal numeric(12,2) not null check(subtotal >= 0), discount_amount numeric(12,2) not null default 0 check(discount_amount >= 0 and discount_amount <= subtotal),
 total_amount numeric(12,2) not null check(total_amount = subtotal-discount_amount), notes text not null default '',
 request_id uuid not null, request_payload jsonb not null, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(salon_id,id), unique(salon_id,request_id),
 foreign key(salon_id,customer_id) references public.customers(salon_id,id), foreign key(salon_id,employee_id) references public.employees(salon_id,id)
);
create table public.service_entry_items (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), service_entry_id uuid not null, service_id uuid not null,
 service_name text not null, quantity integer not null check(quantity > 0 and quantity <= 100), unit_price numeric(12,2) not null check(unit_price >= 0),
 line_total numeric(12,2) generated always as (quantity*unit_price) stored,
 foreign key(salon_id,service_entry_id) references public.service_entries(salon_id,id), foreign key(salon_id,service_id) references public.services(salon_id,id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), service_entry_id uuid not null,
 amount numeric(12,2) not null check(amount > 0), payment_method text not null check(payment_method in ('cash','upi','card')),
 status text not null default 'paid' check(status = 'paid'), confirmation text not null check(length(trim(confirmation)) > 0),
 request_id uuid not null, part integer not null, paid_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 unique(salon_id,request_id,part), foreign key(salon_id,service_entry_id) references public.service_entries(salon_id,id)
);
create table public.expense_categories (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), name text not null,
 unique(salon_id,name), unique(salon_id,id)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), category_id uuid,
 amount numeric(12,2) not null check(amount > 0), expense_date date not null, description text not null check(length(trim(description))>0), notes text not null default '',
 payment_method text not null check(payment_method in ('cash','upi','card','bank_transfer')), attachment_path text,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(salon_id,category_id) references public.expense_categories(salon_id,id)
);
create table public.daily_closings (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), closing_date date not null,
 opening_cash numeric(12,2) not null check(opening_cash>=0), cash_collected numeric(12,2) not null, cash_expenses numeric(12,2) not null,
 expected_cash numeric(12,2) not null, counted_cash numeric(12,2) not null check(counted_cash>=0), difference numeric(12,2) not null,
 gross_sales numeric(12,2) not null, expenses numeric(12,2) not null, services_count integer not null,
 closed_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), unique(salon_id,closing_date),
 check(expected_cash=opening_cash+cash_collected-cash_expenses), check(difference=counted_cash-expected_cash)
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), customer_id uuid not null, employee_id uuid not null,
 appointment_date date not null, start_time time not null, end_time time not null check(end_time>start_time),
 status text not null default 'Booked' check(status in ('Booked','Done','Cancelled')), notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(salon_id,customer_id) references public.customers(salon_id,id), foreign key(salon_id,employee_id) references public.employees(salon_id,id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), recipient_user_id uuid not null references auth.users(id),
 type text not null, title text not null, message text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id), actor_user_id uuid references auth.users(id),
 action text not null, entity_type text not null, entity_id uuid not null, created_at timestamptz not null default now()
);

create function private.has_role(s uuid, roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.salon_members where salon_id=s and user_id=auth.uid() and active and role=any(roles));
$$;
create function private.own_employee(s uuid, e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employees where salon_id=s and id=e and user_id=auth.uid() and active)
 and private.has_role(s,array['employee']);
$$;
create function private.touch() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
create function private.audit() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 insert into public.audit_logs(salon_id,actor_user_id,action,entity_type,entity_id)
 values(new.salon_id,auth.uid(),TG_OP,TG_TABLE_NAME,new.id); return new;
 end; $$;
do $$ declare t text; begin
 foreach t in array array['salons','user_profiles','salon_members','employees','customers','service_categories','services','service_entries','service_entry_items','payments','expense_categories','expenses','daily_closings','appointments','notifications','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t not in ('salons','user_profiles') then
 execute format('create index on public.%I(salon_id)',t);
 end if;
 end loop;
 foreach t in array array['salons','user_profiles','employees','customers','services','service_entries','expenses','appointments'] loop
 execute format('create trigger touch before update on public.%I for each row execute function private.touch()',t);
 end loop;
 foreach t in array array['employees','customers','services','service_entries','payments','expenses','daily_closings','appointments','salon_members'] loop
 execute format('create trigger audit after insert or update on public.%I for each row execute function private.audit()',t);
 end loop;
end $$;
create index on public.salon_members(user_id,active);
create index on public.service_entries(salon_id,service_date);
create index on public.payments(salon_id,paid_at);
create index on public.payments(service_entry_id);
create index on public.expenses(salon_id,expense_date);
create index on public.customers(salon_id,full_name,id);
create index on public.appointments(salon_id,appointment_date);
create index on public.notifications(recipient_user_id,read_at);

create policy salon_read on public.salons for select to authenticated using(private.has_role(id,array['owner','manager','receptionist','employee']));
grant update(name,phone,address,logo_url,opening_hours,timezone,language,name_marathi,tagline,tagline_marathi) on public.salons to authenticated;
create policy salon_edit on public.salons for update to authenticated using(private.has_role(id,array['owner'])) with check(private.has_role(id,array['owner']));
create policy profile_read on public.user_profiles for select to authenticated using(id=auth.uid());
grant insert(id,full_name,avatar_url),update(full_name,avatar_url) on public.user_profiles to authenticated;
create policy profile_insert on public.user_profiles for insert to authenticated with check(id=auth.uid());
create policy profile_edit on public.user_profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy member_read on public.salon_members for select to authenticated using(user_id=auth.uid() or private.has_role(salon_id,array['owner']));

do $$ declare t text; roles text; begin
 foreach t in array array['employees','customers','service_categories','services','expense_categories','expenses','appointments'] loop
 roles := case when t in ('employees','service_categories','services','expense_categories','expenses') then '''owner'',''manager''' else '''owner'',''manager'',''receptionist''' end;
 execute format('create policy operational_read on public.%I for select to authenticated using(private.has_role(salon_id,array[''owner'',''manager'',''receptionist'']))',t);
 execute format('create policy operational_insert on public.%I for insert to authenticated with check(private.has_role(salon_id,array[%s]))',t,roles);
 execute format('create policy operational_edit on public.%I for update to authenticated using(private.has_role(salon_id,array[%s])) with check(private.has_role(salon_id,array[%s]))',t,roles,roles);
 end loop;
 foreach t in array array['service_entries','service_entry_items','payments','daily_closings'] loop
 execute format('create policy finance_read on public.%I for select to authenticated using(private.has_role(salon_id,array[''owner'',''manager'',''receptionist'']))',t);
 end loop;
end $$;
grant insert(salon_id,full_name,phone,designation,commission_rate),update(full_name,phone,designation,commission_rate,active,avatar_url) on public.employees to authenticated;
grant insert(salon_id,full_name,phone,gender,notes),update(full_name,phone,gender,notes) on public.customers to authenticated;
grant insert(salon_id,name,active),update(name,active) on public.service_categories to authenticated;
grant insert(salon_id,category_id,name,price,duration_minutes,active),update(category_id,name,price,duration_minutes,active) on public.services to authenticated;
grant insert(salon_id,name),update(name) on public.expense_categories to authenticated;
grant insert(salon_id,category_id,amount,expense_date,description,notes,payment_method,attachment_path),update(category_id,amount,expense_date,description,notes,payment_method,attachment_path) on public.expenses to authenticated;
grant insert(salon_id,customer_id,employee_id,appointment_date,start_time,end_time,notes),update(customer_id,employee_id,appointment_date,start_time,end_time,status,notes) on public.appointments to authenticated;
create policy own_employee on public.employees for select to authenticated using(private.own_employee(salon_id,id));
create policy own_entries on public.service_entries for select to authenticated using(private.own_employee(salon_id,employee_id));
create policy own_appointments on public.appointments for select to authenticated using(private.own_employee(salon_id,employee_id));
create policy own_items on public.service_entry_items for select to authenticated using(exists(select 1 from public.service_entries e where e.id=service_entry_id and private.own_employee(e.salon_id,e.employee_id)));
create policy catalog_staff on public.services for select to authenticated using(private.has_role(salon_id,array['employee']));
create policy category_staff on public.service_categories for select to authenticated using(private.has_role(salon_id,array['employee']));
create policy notification_read on public.notifications for select to authenticated using(recipient_user_id=auth.uid() and private.has_role(salon_id,array['owner','manager','receptionist','employee']));
grant update(read_at) on public.notifications to authenticated;
create policy notification_edit on public.notifications for update to authenticated using(recipient_user_id=auth.uid() and private.has_role(salon_id,array['owner','manager','receptionist','employee'])) with check(recipient_user_id=auth.uid());
create policy audit_read on public.audit_logs for select to authenticated using(private.has_role(salon_id,array['owner']));

-- Initial owners are provisioned by a trusted administrator, never by profile metadata.
-- This function has no browser execute grant.
create function public.provision_salon(p_owner uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
 declare s uuid; begin
 if not exists(select 1 from auth.users where id=p_owner) then raise exception 'Create the Auth user first'; end if;
 insert into public.salons(name) values(p_name) returning id into s;
 insert into public.salon_members(salon_id,user_id,role) values(s,p_owner,'owner');
 insert into public.user_profiles(id) values(p_owner) on conflict do nothing;
 insert into public.service_categories(salon_id,name) select s,unnest(array['Hair','Beard','Combo','Facial','Wellness','Treatment']);
 insert into public.expense_categories(salon_id,name) select s,unnest(array['Shop supplies','Electricity','Staff advance','Tea & refreshments','Rent','Equipment maintenance','Other']);
 return s;
 end; $$;
revoke all on function public.provision_salon(uuid,text) from public,anon,authenticated;
grant execute on function public.provision_salon(uuid,text) to service_role;
revoke all on all functions in schema private from public,anon;
grant execute on function private.has_role(uuid,text[]),private.own_employee(uuid,uuid) to authenticated;
commit;
