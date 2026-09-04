create extension if not exists pgcrypto with schema extensions;

create table if not exists public.bootstrap_state (
  id smallint primary key default 1 check (id = 1),
  expected_email text not null,
  token_hash text not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bootstrap_state enable row level security;
revoke all on table public.bootstrap_state from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, role, active)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      new.email,
      'Usuário'
    ),
    'usuario',
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.bootstrap_available(p_token text)
returns table(available boolean, expected_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row public.bootstrap_state%rowtype;
  admin_exists boolean;
begin
  if coalesce(length(p_token), 0) < 32 then
    return query select false, null::text;
    return;
  end if;

  select * into state_row
  from public.bootstrap_state
  where id = 1
    and claimed_at is null
    and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if not found then
    return query select false, null::text;
    return;
  end if;

  select exists(
    select 1 from public.profiles
    where role = 'admin' and active = true
  ) into admin_exists;

  if admin_exists then
    return query select false, null::text;
    return;
  end if;

  return query select true, state_row.expected_email;
end;
$$;

revoke execute on function public.bootstrap_available(text) from public;
grant execute on function public.bootstrap_available(text) to anon, authenticated;

create or replace function public.claim_first_admin(
  p_token text,
  p_user_id uuid,
  p_email text,
  p_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row public.bootstrap_state%rowtype;
  auth_email text;
  admin_exists boolean;
begin
  if coalesce(length(p_token), 0) < 32
     or p_user_id is null
     or coalesce(length(trim(p_name)), 0) < 2 then
    return false;
  end if;

  select * into state_row
  from public.bootstrap_state
  where id = 1
  for update;

  if not found
     or state_row.claimed_at is not null
     or state_row.token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex')
     or lower(trim(p_email)) <> lower(state_row.expected_email) then
    return false;
  end if;

  select lower(email) into auth_email
  from auth.users
  where id = p_user_id;

  if auth_email is null or auth_email <> lower(state_row.expected_email) then
    return false;
  end if;

  select exists(
    select 1 from public.profiles
    where role = 'admin' and active = true
  ) into admin_exists;

  if admin_exists then
    return false;
  end if;

  update public.profiles
  set name = trim(p_name),
      email = auth_email,
      role = 'admin',
      active = true,
      updated_at = now()
  where id = p_user_id;

  if not found then
    return false;
  end if;

  update public.bootstrap_state
  set claimed_at = now(), updated_at = now()
  where id = 1;

  return true;
end;
$$;

revoke execute on function public.claim_first_admin(text, uuid, text, text) from public;
grant execute on function public.claim_first_admin(text, uuid, text, text) to anon, authenticated;
