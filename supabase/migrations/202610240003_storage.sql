begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('salon-private','salon-private',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
-- Paths: salon UUID / logo|employees|expenses / random UUID.extension.
create policy salon_files_read on storage.objects for select to authenticated using(
 bucket_id='salon-private' and private.has_role((storage.foldername(name))[1]::uuid,array['owner','manager'])
);
create policy salon_files_add on storage.objects for insert to authenticated with check(
 bucket_id='salon-private' and (storage.foldername(name))[2] in ('logo','employees','expenses')
 and private.has_role((storage.foldername(name))[1]::uuid,case when (storage.foldername(name))[2]='logo' then array['owner'] else array['owner','manager'] end)
);
create policy salon_files_delete on storage.objects for delete to authenticated using(
 bucket_id='salon-private' and private.has_role((storage.foldername(name))[1]::uuid,case when (storage.foldername(name))[2]='logo' then array['owner'] else array['owner','manager'] end)
);
commit;
