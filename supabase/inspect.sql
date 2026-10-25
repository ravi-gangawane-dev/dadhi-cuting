-- Read-only preflight; run through authenticated project tooling or SQL Editor.
select table_schema,table_name from information_schema.tables
where table_schema not in ('pg_catalog','information_schema') order by 1,2;
select table_name,column_name,data_type,is_nullable from information_schema.columns
where table_schema='public' order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage') order by 1,2,3;
select n.nspname,p.proname,p.prosecdef,p.proacl from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private');
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets;
