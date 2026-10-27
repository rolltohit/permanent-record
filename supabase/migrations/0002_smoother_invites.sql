-- Smoother invites.
--
--   * Invites can carry the friend's name, so the invite page can greet them
--     and prefill it. They now last 30 days, and admins can renew them.
--   * invite_details() tells the invite page who sent it and why a link no
--     longer works, instead of a bare true/false.
--   * An invite addressed to an email address works from /login too: signing
--     in with that address claims it (claim_email_invite), so a friend who
--     lost the link, or whose first attempt failed, still gets in.
--   * redeem_invite() no longer fails on a blank name.

alter table public.invites
  add column name text check (name is null or char_length(name) between 1 and 40);
alter table public.invites
  alter column expires_at set default now() + interval '30 days';
create index invites_open_email_idx on public.invites (lower(email)) where used_by is null;

-- A name for a new member: the one they typed, else the invite's, else their
-- email's local part.
create function public.member_name(p_typed text, p_invite_name text, p_email text) returns text
language sql immutable set search_path = public as $$
  select left(coalesce(
    nullif(trim(p_typed), ''),
    nullif(trim(p_invite_name), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Friend'
  ), 40);
$$;

-- What the invite page shows. Anyone holding the code may ask; the code is the secret.
create function public.invite_details(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
        'status', case
          when i.used_by is not null then 'used'
          when i.expires_at <= now() then 'expired'
          else 'open' end,
        'name', i.name,
        'email', case when i.used_by is null then i.email end,
        'inviter', p.display_name,
        'used_by_me', i.used_by is not null and i.used_by = auth.uid())
     from public.invites i
     left join public.profiles p on p.id = i.created_by
     where i.code = p_code),
    jsonb_build_object('status', 'missing'));
$$;

-- Whether an open invite is addressed to this email. /login uses it to let an
-- invited friend create their account there, not only from the invite link.
create function public.invite_open_for_email(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invites
    where lower(email) = lower(trim(p_email)) and used_by is null and expires_at > now()
  );
$$;

-- Same as before, but the name falls back instead of failing when blank.
create or replace function public.redeem_invite(p_code text, p_display_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    return; -- already a member
  end if;

  select * into v_invite from public.invites
  where code = p_code and used_by is null and expires_at > now()
  for update;
  if not found then
    raise exception 'invite is invalid or expired';
  end if;

  insert into public.profiles (id, display_name, is_admin)
  values (auth.uid(), public.member_name(p_display_name, v_invite.name, auth.email()), v_invite.grants_admin);

  update public.invites set used_by = auth.uid(), used_at = now()
  where code = p_code;
end;
$$;

-- The newest open invite addressed to the signed-in user's email, if any.
create function public.my_email_invite() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', i.code, 'name', i.name, 'inviter', p.display_name)
  from public.invites i
  left join public.profiles p on p.id = i.created_by
  where auth.email() is not null
    and lower(i.email) = lower(auth.email()) and i.used_by is null and i.expires_at > now()
  order by i.created_at desc
  limit 1;
$$;

-- Joins using the invite addressed to the signed-in user's email. Returns
-- whether they are a member afterwards.
create function public.claim_email_invite(p_display_name text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    return true;
  end if;
  v_code := (public.my_email_invite()) ->> 'code';
  if v_code is null then
    return false;
  end if;
  perform public.redeem_invite(v_code, p_display_name);
  return true;
end;
$$;

revoke execute on function public.my_email_invite() from public, anon;
revoke execute on function public.claim_email_invite(text) from public, anon;
grant execute on function public.my_email_invite() to authenticated;
grant execute on function public.claim_email_invite(text) to authenticated;
grant execute on function public.invite_details(text) to anon, authenticated;
grant execute on function public.invite_open_for_email(text) to anon, authenticated;

-- Admins can renew an unused invite (only its expiry can change).
create policy "admins renew unused invites" on public.invites
  for update to authenticated
  using (public.is_admin() and used_by is null)
  with check (public.is_admin() and used_by is null);
revoke update on public.invites from authenticated;
grant update (expires_at) on public.invites to authenticated;
