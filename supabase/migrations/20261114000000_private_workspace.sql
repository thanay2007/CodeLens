-- Run as the project database owner. Set a password for the app role separately.
create role codelens_app login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema codelens_private;
revoke all on schema codelens_private from public, anon, authenticated, service_role;
grant usage on schema codelens_private to codelens_app;

create table codelens_private.repositories (
  id text primary key,
  owner_id text not null,
  url text not null,
  name text not null,
  status text not null,
  stage text not null,
  progress integer not null default 0,
  error text,
  created_at bigint not null,
  updated_at bigint not null,
  attempts integer not null default 0,
  lease_token text,
  lease_until bigint not null default 0,
  data text
);
create index repositories_owner on codelens_private.repositories (owner_id, created_at);

create table codelens_private.quotas (
  bucket text primary key,
  count integer not null,
  expires_at bigint not null
);
create table codelens_private.chat_locks (
  bucket text primary key,
  token text not null,
  expires_at bigint not null
);

alter table codelens_private.repositories enable row level security;
alter table codelens_private.repositories force row level security;
alter table codelens_private.quotas enable row level security;
alter table codelens_private.quotas force row level security;
alter table codelens_private.chat_locks enable row level security;
alter table codelens_private.chat_locks force row level security;

create policy own_repositories on codelens_private.repositories for all to codelens_app
  using (owner_id = nullif(current_setting('codelens.owner_id', true), ''))
  with check (owner_id = nullif(current_setting('codelens.owner_id', true), ''));

create policy own_quotas on codelens_private.quotas for all to codelens_app
  using (split_part(bucket, ':', 1) = nullif(current_setting('codelens.owner_id', true), ''))
  with check (split_part(bucket, ':', 1) = nullif(current_setting('codelens.owner_id', true), ''));

create policy own_locks on codelens_private.chat_locks for all to codelens_app
  using (split_part(bucket, ':', 1) = nullif(current_setting('codelens.owner_id', true), ''))
  with check (split_part(bucket, ':', 1) = nullif(current_setting('codelens.owner_id', true), ''));

revoke all on all tables in schema codelens_private from public, anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema codelens_private to codelens_app;
