begin;
-- All financial writers serialize on the salon row, including expense triggers.
create function private.lock_open_day(s uuid,d date) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform 1 from public.salons where id=s for update;
 if exists(select 1 from public.daily_closings where salon_id=s and closing_date=d) then raise exception 'Business day is closed'; end if;
 end; $$;
create function private.expense_day() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 perform private.lock_open_day(new.salon_id,new.expense_date);
 if TG_OP='UPDATE' then perform private.lock_open_day(old.salon_id,old.expense_date); end if;
 return new;
 end; $$;
create trigger expense_open_day before insert or update on public.expenses for each row execute function private.expense_day();
create function private.notify(s uuid,t text,heading text,body text) returns void language sql security definer set search_path='' as $$
 insert into public.notifications(salon_id,recipient_user_id,type,title,message)
 select s,user_id,t,heading,body from public.salon_members where salon_id=s and active and role in ('owner','manager','receptionist');
$$;
create function public.create_service_entry(p_salon uuid,p_employee uuid,p_customer uuid,p_items jsonb,p_discount numeric,p_notes text,p_request uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare e uuid; d date; item jsonb; price numeric; subtotal numeric:=0; qty integer; payload jsonb; old_payload jsonb;
 begin
 if not private.has_role(p_salon,array['owner','manager','receptionist']) then raise exception 'Not authorized'; end if;
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

create function public.record_payment(p_salon uuid,p_entry uuid,p_parts jsonb,p_confirmation text,p_request uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare total numeric; received numeric; amount numeric:=0; part jsonb; result uuid; n integer:=0; d date; old_parts jsonb;
 begin
 if not private.has_role(p_salon,array['owner','manager','receptionist']) then raise exception 'Not authorized'; end if;
 select (now() at time zone timezone)::date into d from public.salons where id=p_salon for update;
 if p_request is null or p_confirmation is null or length(trim(p_confirmation))=0 then raise exception 'Confirm receipt before recording payment'; end if;
 select service_entry_id into result from public.payments where salon_id=p_salon and request_id=p_request limit 1;
 if found then
 select jsonb_agg(jsonb_build_object('method',p.payment_method,'amount',p.amount) order by p.part) into old_parts from public.payments p where p.salon_id=p_salon and p.request_id=p_request;
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
 end; $$;

create function public.close_business_day(p_salon uuid,p_date date,p_opening numeric,p_counted numeric)
 returns uuid language plpgsql security definer set search_path='' as $$
 declare cash_in numeric; cash_out numeric; gross numeric; costs numeric; service_count integer; result uuid; tz text;
 begin
 if not private.has_role(p_salon,array['owner','manager']) then raise exception 'Not authorized'; end if;
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
 end; $$;

-- Invoker aggregations preserve RLS, including employee restrictions.
create function public.report_summary(p_salon uuid,p_from date,p_to date) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'revenue',coalesce((select sum(total_amount) from public.service_entries where salon_id=p_salon and service_date between p_from and p_to and status='completed'),0),
 'services',coalesce((select sum(i.quantity) from public.service_entry_items i join public.service_entries e on e.id=i.service_entry_id where e.salon_id=p_salon and e.service_date between p_from and p_to and e.status='completed'),0),
 'visits',(select count(*) from public.service_entries where salon_id=p_salon and service_date between p_from and p_to and status='completed'),
 'expenses',coalesce((select sum(amount) from public.expenses where salon_id=p_salon and expense_date between p_from and p_to),0),
 'outstanding',coalesce((select sum(e.total_amount-coalesce((select sum(amount) from public.payments p where p.service_entry_id=e.id),0)) from public.service_entries e where salon_id=p_salon and status='completed'),0),
 'methods',coalesce((select jsonb_object_agg(payment_method,amount) from (select p.payment_method,sum(p.amount) amount from public.payments p join public.salons s on s.id=p.salon_id where p.salon_id=p_salon and (paid_at at time zone s.timezone)::date between p_from and p_to group by p.payment_method) m),'{}'),
 'chart',coalesce((select jsonb_agg(x order by label) from (select service_date::text label,sum(total_amount) value from public.service_entries where salon_id=p_salon and service_date between p_from and p_to and status='completed' group by service_date) x),'[]'),
 'topServices',coalesce((select jsonb_agg(x) from (select i.service_name name,sum(i.quantity) count,sum(i.line_total * case when e.subtotal=0 then 0 else e.total_amount/e.subtotal end) revenue from public.service_entry_items i join public.service_entries e on e.id=i.service_entry_id where e.salon_id=p_salon and e.service_date between p_from and p_to and e.status='completed' group by i.service_name order by revenue desc limit 5) x),'[]'),
 'employees',coalesce((select jsonb_agg(x) from (select employee_id,sum(total_amount) revenue,count(*) visits from public.service_entries where salon_id=p_salon and service_date between p_from and p_to and status='completed' group by employee_id) x),'[]')
 ); $$;
revoke all on function public.create_service_entry(uuid,uuid,uuid,jsonb,numeric,text,uuid),public.record_payment(uuid,uuid,jsonb,text,uuid),public.close_business_day(uuid,date,numeric,numeric),public.report_summary(uuid,date,date) from public,anon;
grant execute on function public.create_service_entry(uuid,uuid,uuid,jsonb,numeric,text,uuid),public.record_payment(uuid,uuid,jsonb,text,uuid),public.close_business_day(uuid,date,numeric,numeric),public.report_summary(uuid,date,date) to authenticated;
revoke all on all functions in schema private from public,anon;
commit;
