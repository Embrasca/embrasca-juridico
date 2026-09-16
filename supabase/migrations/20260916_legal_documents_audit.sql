create table if not exists public.legal_documents (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id),
  template_code text not null,
  title text,
  counterparty text,
  status text not null default 'draft'
    check (status in ('draft','under_review','correction_requested','approved')),
  current_version integer not null default 1 check (current_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  version integer not null check (version >= 1),
  generated_by uuid not null references public.profiles(id),
  generated_at timestamptz not null default now(),
  form_data jsonb not null default '{}'::jsonb,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.legal_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  version integer not null check (version >= 1),
  action text not null check (action in ('correction_requested','approved')),
  reviewed_by uuid not null references public.profiles(id),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists legal_documents_owner_idx on public.legal_documents(owner_id);
create index if not exists legal_versions_document_idx on public.legal_document_versions(document_id, version desc);
create index if not exists legal_reviews_document_idx on public.legal_reviews(document_id, version desc, created_at desc);

drop trigger if exists legal_documents_set_updated_at on public.legal_documents;
create trigger legal_documents_set_updated_at
before update on public.legal_documents
for each row execute function public.set_updated_at();

create or replace function public.legal_current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.active = true
$$;

create or replace function public.legal_can_access_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.legal_documents d
    where d.id = p_document_id
      and (
        d.owner_id = auth.uid()
        or public.legal_current_role() in ('admin','juridico')
      )
  )
$$;

alter table public.legal_documents enable row level security;
alter table public.legal_document_versions enable row level security;
alter table public.legal_reviews enable row level security;

drop policy if exists legal_documents_select_allowed on public.legal_documents;
create policy legal_documents_select_allowed
on public.legal_documents
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.legal_current_role() in ('admin','juridico')
);

drop policy if exists legal_versions_select_allowed on public.legal_document_versions;
create policy legal_versions_select_allowed
on public.legal_document_versions
for select
to authenticated
using (public.legal_can_access_document(document_id));

drop policy if exists legal_reviews_select_allowed on public.legal_reviews;
create policy legal_reviews_select_allowed
on public.legal_reviews
for select
to authenticated
using (public.legal_can_access_document(document_id));

revoke insert, update, delete on public.legal_documents from authenticated;
revoke insert, update, delete on public.legal_document_versions from authenticated;
revoke insert, update, delete on public.legal_reviews from authenticated;

grant select on public.legal_documents to authenticated;
grant select on public.legal_document_versions to authenticated;
grant select on public.legal_reviews to authenticated;

create or replace function public.legal_create_document(
  p_document_id uuid,
  p_template_code text,
  p_title text,
  p_counterparty text,
  p_form_data jsonb,
  p_storage_path text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.profiles where id = v_uid and active = true
  ) then
    raise exception 'UNAUTHORIZED';
  end if;

  insert into public.legal_documents(id, owner_id, template_code, title, counterparty, status, current_version)
  values (p_document_id, v_uid, p_template_code, nullif(trim(p_title), ''), nullif(trim(p_counterparty), ''), 'draft', 1);

  insert into public.legal_document_versions(document_id, version, generated_by, form_data, storage_path)
  values (p_document_id, 1, v_uid, coalesce(p_form_data, '{}'::jsonb), p_storage_path);

  return p_document_id;
end;
$$;

create or replace function public.legal_add_version(
  p_document_id uuid,
  p_expected_current_version integer,
  p_form_data jsonb,
  p_storage_path text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc public.legal_documents%rowtype;
  v_next integer;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_doc
  from public.legal_documents
  where id = p_document_id
  for update;

  if not found then raise exception 'NOT_FOUND'; end if;
  if v_doc.owner_id <> v_uid and public.legal_current_role() not in ('admin','juridico') then
    raise exception 'FORBIDDEN';
  end if;
  if v_doc.current_version <> p_expected_current_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  v_next := v_doc.current_version + 1;

  insert into public.legal_document_versions(document_id, version, generated_by, form_data, storage_path)
  values (p_document_id, v_next, v_uid, coalesce(p_form_data, '{}'::jsonb), p_storage_path);

  update public.legal_documents
  set current_version = v_next, status = 'draft'
  where id = p_document_id;

  return v_next;
end;
$$;

create or replace function public.legal_submit_review(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  select owner_id into v_owner from public.legal_documents where id = p_document_id;
  if v_owner is null then raise exception 'NOT_FOUND'; end if;
  if v_owner <> v_uid and public.legal_current_role() not in ('admin','juridico') then
    raise exception 'FORBIDDEN';
  end if;
  update public.legal_documents set status = 'under_review' where id = p_document_id;
end;
$$;

create or replace function public.legal_request_correction(p_document_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.legal_documents%rowtype;
begin
  if public.legal_current_role() not in ('admin','juridico') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_doc from public.legal_documents where id = p_document_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  insert into public.legal_reviews(document_id, version, action, reviewed_by, comment)
  values (p_document_id, v_doc.current_version, 'correction_requested', auth.uid(), nullif(trim(p_comment), ''));

  update public.legal_documents set status = 'correction_requested' where id = p_document_id;
end;
$$;

create or replace function public.legal_approve_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.legal_documents%rowtype;
begin
  if public.legal_current_role() not in ('admin','juridico') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_doc from public.legal_documents where id = p_document_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  insert into public.legal_reviews(document_id, version, action, reviewed_by)
  values (p_document_id, v_doc.current_version, 'approved', auth.uid());

  update public.legal_documents set status = 'approved' where id = p_document_id;
end;
$$;

create or replace function public.legal_list_documents()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by item->>'updatedAt' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', d.id,
      'ownerId', d.owner_id,
      'templateCode', d.template_code,
      'title', d.title,
      'counterparty', d.counterparty,
      'status', d.status,
      'currentVersion', d.current_version,
      'createdAt', d.created_at,
      'updatedAt', d.updated_at,
      'generatedBy', case when gp.id is null then null else jsonb_build_object('id', gp.id, 'name', gp.name) end,
      'generatedAt', v.generated_at,
      'reviewedBy', case when rp.id is null then null else jsonb_build_object('id', rp.id, 'name', rp.name) end,
      'reviewedAt', lr.created_at,
      'approvedBy', case when ap.id is null then null else jsonb_build_object('id', ap.id, 'name', ap.name) end,
      'approvedAt', ar.created_at
    ) as item
    from public.legal_documents d
    join public.legal_document_versions v on v.document_id = d.id and v.version = d.current_version
    join public.profiles gp on gp.id = v.generated_by
    left join lateral (
      select r.reviewed_by, r.created_at
      from public.legal_reviews r
      where r.document_id = d.id and r.version = d.current_version
      order by r.created_at desc, r.id desc
      limit 1
    ) lr on true
    left join public.profiles rp on rp.id = lr.reviewed_by
    left join lateral (
      select r.reviewed_by, r.created_at
      from public.legal_reviews r
      where r.document_id = d.id and r.version = d.current_version and r.action = 'approved'
      order by r.created_at desc, r.id desc
      limit 1
    ) ar on true
    left join public.profiles ap on ap.id = ar.reviewed_by
    where d.owner_id = auth.uid() or public.legal_current_role() in ('admin','juridico')
  ) q
$$;

create or replace function public.legal_get_document(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc public.legal_documents%rowtype;
  v_result jsonb;
begin
  if not public.legal_can_access_document(p_document_id) then
    return null;
  end if;

  select * into v_doc from public.legal_documents where id = p_document_id;
  if not found then return null; end if;

  select jsonb_build_object(
    'id', v_doc.id,
    'ownerId', v_doc.owner_id,
    'templateCode', v_doc.template_code,
    'title', v_doc.title,
    'counterparty', v_doc.counterparty,
    'status', v_doc.status,
    'currentVersion', v_doc.current_version,
    'createdAt', v_doc.created_at,
    'updatedAt', v_doc.updated_at,
    'generatedBy', (
      select jsonb_build_object('id', p.id, 'name', p.name)
      from public.legal_document_versions v join public.profiles p on p.id = v.generated_by
      where v.document_id = v_doc.id and v.version = v_doc.current_version
    ),
    'generatedAt', (
      select v.generated_at from public.legal_document_versions v
      where v.document_id = v_doc.id and v.version = v_doc.current_version
    ),
    'reviewedBy', (
      select jsonb_build_object('id', p.id, 'name', p.name)
      from public.legal_reviews r join public.profiles p on p.id = r.reviewed_by
      where r.document_id = v_doc.id and r.version = v_doc.current_version
      order by r.created_at desc, r.id desc limit 1
    ),
    'reviewedAt', (
      select r.created_at from public.legal_reviews r
      where r.document_id = v_doc.id and r.version = v_doc.current_version
      order by r.created_at desc, r.id desc limit 1
    ),
    'approvedBy', (
      select jsonb_build_object('id', p.id, 'name', p.name)
      from public.legal_reviews r join public.profiles p on p.id = r.reviewed_by
      where r.document_id = v_doc.id and r.version = v_doc.current_version and r.action = 'approved'
      order by r.created_at desc, r.id desc limit 1
    ),
    'approvedAt', (
      select r.created_at from public.legal_reviews r
      where r.document_id = v_doc.id and r.version = v_doc.current_version and r.action = 'approved'
      order by r.created_at desc, r.id desc limit 1
    ),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', v.version,
        'generatedBy', jsonb_build_object('id', p.id, 'name', p.name),
        'generatedAt', v.generated_at,
        'storagePath', v.storage_path,
        'formData', v.form_data
      ) order by v.version desc)
      from public.legal_document_versions v
      join public.profiles p on p.id = v.generated_by
      where v.document_id = v_doc.id
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', r.version,
        'action', r.action,
        'reviewedBy', jsonb_build_object('id', p.id, 'name', p.name),
        'comment', r.comment,
        'createdAt', r.created_at
      ) order by r.created_at desc, r.id desc)
      from public.legal_reviews r
      join public.profiles p on p.id = r.reviewed_by
      where r.document_id = v_doc.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.legal_get_download_path(p_document_id uuid, p_version integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.legal_can_access_document(p_document_id) then (
    select jsonb_build_object(
      'storagePath', v.storage_path,
      'templateCode', d.template_code,
      'title', d.title,
      'version', v.version
    )
    from public.legal_document_versions v
    join public.legal_documents d on d.id = v.document_id
    where v.document_id = p_document_id and v.version = p_version
  ) else null end
$$;

revoke all on function public.legal_current_role() from public, anon;
revoke all on function public.legal_can_access_document(uuid) from public, anon;
revoke all on function public.legal_create_document(uuid,text,text,text,jsonb,text) from public, anon;
revoke all on function public.legal_add_version(uuid,integer,jsonb,text) from public, anon;
revoke all on function public.legal_submit_review(uuid) from public, anon;
revoke all on function public.legal_request_correction(uuid,text) from public, anon;
revoke all on function public.legal_approve_document(uuid) from public, anon;
revoke all on function public.legal_list_documents() from public, anon;
revoke all on function public.legal_get_document(uuid) from public, anon;
revoke all on function public.legal_get_download_path(uuid,integer) from public, anon;

grant execute on function public.legal_current_role() to authenticated;
grant execute on function public.legal_can_access_document(uuid) to authenticated;
grant execute on function public.legal_create_document(uuid,text,text,text,jsonb,text) to authenticated;
grant execute on function public.legal_add_version(uuid,integer,jsonb,text) to authenticated;
grant execute on function public.legal_submit_review(uuid) to authenticated;
grant execute on function public.legal_request_correction(uuid,text) to authenticated;
grant execute on function public.legal_approve_document(uuid) to authenticated;
grant execute on function public.legal_list_documents() to authenticated;
grant execute on function public.legal_get_document(uuid) to authenticated;
grant execute on function public.legal_get_download_path(uuid,integer) to authenticated;

insert into storage.buckets (id, name, public)
values ('legal-documents', 'legal-documents', false)
on conflict (id) do update set public = false;

drop policy if exists legal_documents_storage_select on storage.objects;
create policy legal_documents_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'legal-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.legal_current_role() in ('admin','juridico')
  )
);

drop policy if exists legal_documents_storage_insert on storage.objects;
create policy legal_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'legal-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.legal_current_role() in ('admin','juridico')
  )
);

drop policy if exists legal_documents_storage_update on storage.objects;
create policy legal_documents_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'legal-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.legal_current_role() in ('admin','juridico')
  )
)
with check (
  bucket_id = 'legal-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.legal_current_role() in ('admin','juridico')
  )
);

drop policy if exists legal_documents_storage_delete on storage.objects;
create policy legal_documents_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'legal-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.legal_current_role() in ('admin','juridico')
  )
);
