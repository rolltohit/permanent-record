-- Rec Room initial schema.
--
-- Access model:
--   * Anyone can hold an auth account, but only users with a row in `profiles`
--     (created by redeeming an invite) are members and can see anything.
--   * Members write only their own activity rows.
--   * AI output (music_items.ai_summary, ai_suggestions, ai_batches) is written
--     only by the service role, i.e. the local batch push script.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.invites (
  code text primary key default substr(md5(gen_random_uuid()::text), 1, 12),
  created_by uuid references public.profiles (id) on delete set null,
  email text,
  grants_admin boolean not null default false,
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table public.music_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('album', 'track')),
  title text not null,
  artist text not null,
  album text,
  artwork_url text,
  release_year int,
  -- {spotify, apple_music, youtube_music}: each a URL or absent
  links jsonb not null default '{}'::jsonb,
  songlink_url text,
  -- Stable identity used to dedupe the same album/track posted twice.
  external_key text not null unique,
  ai_summary text,
  ai_summary_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.music_items (id) on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index recommendations_created_at_idx on public.recommendations (created_at desc);
create index recommendations_item_idx on public.recommendations (item_id);

create table public.listens (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_id uuid not null references public.music_items (id) on delete cascade,
  listened_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.ratings (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_id uuid not null references public.music_items (id) on delete cascade,
  stars smallint check (stars between 1 and 5),
  thumb smallint check (thumb in (-1, 1)),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  check (stars is not null or thumb is not null)
);

create table public.reactions (
  recommendation_id uuid not null references public.recommendations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (recommendation_id, user_id, emoji)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index comments_recommendation_idx on public.comments (recommendation_id, created_at);

create table public.ai_batches (
  id uuid primary key default gen_random_uuid(),
  pulled_at timestamptz not null default now(),
  pushed_at timestamptz,
  stats jsonb not null default '{}'::jsonb
);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null references public.music_items (id) on delete cascade,
  reason text not null,
  batch_id uuid references public.ai_batches (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'dismissed', 'shared')),
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

-- Invite details are readable before membership so /invite/[code] can show
-- whether a code is still valid.
create function public.check_invite(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invites
    where code = p_code and used_by is null and expires_at > now()
  );
$$;

-- Turns a signed-in auth user into a member.
create function public.redeem_invite(p_code text, p_display_name text) returns void
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
  values (auth.uid(), trim(p_display_name), v_invite.grants_admin);

  update public.invites set used_by = auth.uid(), used_at = now()
  where code = p_code;
end;
$$;

-- Members add music via this function so they can't set AI fields or
-- overwrite existing items. Returns the id of the new or existing item.
create function public.ensure_music_item(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_member() then
    raise exception 'not a member';
  end if;

  insert into public.music_items
    (kind, title, artist, album, artwork_url, release_year, links, songlink_url, external_key, created_by)
  values (
    p ->> 'kind',
    p ->> 'title',
    p ->> 'artist',
    nullif(p ->> 'album', ''),
    nullif(p ->> 'artwork_url', ''),
    nullif(p ->> 'release_year', '')::int,
    coalesce(p -> 'links', '{}'::jsonb),
    nullif(p ->> 'songlink_url', ''),
    p ->> 'external_key',
    auth.uid()
  )
  on conflict (external_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.music_items where external_key = p ->> 'external_key';
  end if;
  return v_id;
end;
$$;

-- Functions are executable by PUBLIC by default; limit the write paths to
-- signed-in users.
revoke execute on function public.redeem_invite(text, text) from public, anon;
revoke execute on function public.ensure_music_item(jsonb) from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated;
grant execute on function public.ensure_music_item(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.music_items enable row level security;
alter table public.recommendations enable row level security;
alter table public.listens enable row level security;
alter table public.ratings enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.ai_batches enable row level security;
alter table public.ai_suggestions enable row level security;

-- profiles
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- invites: admins only
create policy "admins read invites" on public.invites
  for select to authenticated using (public.is_admin());
create policy "admins create invites" on public.invites
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy "admins delete unused invites" on public.invites
  for delete to authenticated using (public.is_admin() and used_by is null);

-- music_items: read-only for members; writes go through ensure_music_item()
create policy "members read items" on public.music_items
  for select to authenticated using (public.is_member());
revoke insert, update, delete on public.music_items from authenticated, anon;

-- recommendations
create policy "members read recs" on public.recommendations
  for select to authenticated using (public.is_member());
create policy "members post recs" on public.recommendations
  for insert to authenticated with check (public.is_member() and from_user = auth.uid());
create policy "edit own recs" on public.recommendations
  for update to authenticated using (from_user = auth.uid()) with check (from_user = auth.uid());
create policy "delete own recs" on public.recommendations
  for delete to authenticated using (from_user = auth.uid());
revoke update on public.recommendations from authenticated;
grant update (note) on public.recommendations to authenticated;

-- listens, ratings, reactions, comments: read by members, written by owner
create policy "members read listens" on public.listens
  for select to authenticated using (public.is_member());
create policy "own listens" on public.listens
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

create policy "members read ratings" on public.ratings
  for select to authenticated using (public.is_member());
create policy "own ratings" on public.ratings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

create policy "members read reactions" on public.reactions
  for select to authenticated using (public.is_member());
create policy "own reactions" on public.reactions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

create policy "members read comments" on public.comments
  for select to authenticated using (public.is_member());
create policy "members post comments" on public.comments
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy "delete own comments" on public.comments
  for delete to authenticated using (user_id = auth.uid());

-- AI: suggestions visible to their owner, who may only change status.
-- ai_batches has no policies, so only the service role can touch it.
create policy "read own suggestions" on public.ai_suggestions
  for select to authenticated using (user_id = auth.uid());
create policy "update own suggestion status" on public.ai_suggestions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.ai_suggestions from authenticated, anon;
grant update (status) on public.ai_suggestions to authenticated;
