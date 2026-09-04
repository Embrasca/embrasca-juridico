create or replace function public.bootstrap_public_status()
returns table(available boolean, expected_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row public.bootstrap_state%rowtype;
  admin_exists boolean;
begin
  select exists(
    select 1 from public.profiles
    where role = 'admin' and active = true
  ) into admin_exists;

  if admin_exists then
    return query select false, null::text;
    return;
  end if;

  select * into state_row
  from public.bootstrap_state
  where id = 1 and claimed_at is null;

  if not found then
    return query select false, null::text;
    return;
  end if;

  return query select true, state_row.expected_email;
end;
$$;

revoke execute on function public.bootstrap_public_status() from public;
grant execute on function public.bootstrap_public_status() to anon, authenticated;
