-- Corrections and deletions. Financial documents stay immutable to direct writes;
-- the only correction paths are these audited, day-locked RPCs.
begin;

create function public.void_service_entry(p_salon uuid,p_entry uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.service_entries%rowtype;
begin
  if not private.has_role(p_salon,array['owner','manager']) then raise exception 'Not authorized'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Enter a reason of at least 3 characters'; end if;
  select * into e from public.service_entries where salon_id=p_salon and id=p_entry for update;
  if not found then raise exception 'Invalid invoice'; end if;
  if e.status <> 'completed' then raise exception 'Only a completed invoice can be voided'; end if;
  perform private.lock_open_day(p_salon,e.service_date);
  if exists(select 1 from public.payments p where p.salon_id=p_salon and p.service_entry_id=p_entry) then
    raise exception 'Reverse the receipts on this invoice before voiding it';
  end if;
  update public.service_entries set status='cancelled' where id=p_entry;
  insert into public.audit_logs(salon_id,actor_user_id,action,entity_type,entity_id)
    values(p_salon,auth.uid(),'VOID '||left(trim(p_reason),80),'service_entries',p_entry);
  perform private.notify(p_salon,'pending','Invoice voided',left(trim(p_reason),120));
  return p_entry;
end; $$;

create function public.void_payment(p_salon uuid,p_payment uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare pay public.payments%rowtype; tz text; d date;
begin
  if not private.has_role(p_salon,array['owner','manager']) then raise exception 'Not authorized'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Enter a reason of at least 3 characters'; end if;
  select timezone into tz from public.salons where id=p_salon for update;
  select * into pay from public.payments where salon_id=p_salon and id=p_payment for update;
  if not found then raise exception 'Invalid receipt'; end if;
  d := (pay.paid_at at time zone tz)::date;
  perform private.lock_open_day(p_salon,d);
  delete from public.payments where id=p_payment;
  insert into public.audit_logs(salon_id,actor_user_id,action,entity_type,entity_id)
    values(p_salon,auth.uid(),'VOID_PAYMENT '||left(trim(p_reason),80),'payments',p_payment);
  perform private.notify(p_salon,'payment','Receipt reversed',left(trim(p_reason),120));
  return p_payment;
end; $$;

revoke all on function public.void_service_entry(uuid,uuid,text),public.void_payment(uuid,uuid,text) from public,anon;
grant execute on function public.void_service_entry(uuid,uuid,text),public.void_payment(uuid,uuid,text) to authenticated;

-- Deletions are narrow, role-scoped and audited. A closed business day cannot lose
-- an expense; appointments are non-financial so only the audit trail applies.
create function private.audit_delete() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 insert into public.audit_logs(salon_id,actor_user_id,action,entity_type,entity_id)
 values(old.salon_id,auth.uid(),'DELETE',TG_TABLE_NAME,old.id);
 return old;
 end; $$;

create function private.expense_delete_day() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 perform private.lock_open_day(old.salon_id,old.expense_date);
 return old;
 end; $$;

create trigger expense_delete_day before delete on public.expenses
 for each row execute function private.expense_delete_day();
create trigger audit_delete after delete on public.expenses
 for each row execute function private.audit_delete();
create trigger audit_delete after delete on public.appointments
 for each row execute function private.audit_delete();

grant delete on public.expenses, public.appointments to authenticated;
create policy operational_delete on public.expenses for delete to authenticated
 using(private.has_role(salon_id,array['owner','manager']));
create policy operational_delete on public.appointments for delete to authenticated
 using(private.has_role(salon_id,array['owner','manager','receptionist']));

commit;
