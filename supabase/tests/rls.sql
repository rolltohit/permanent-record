-- RLS and access tests. Run with `npm run test:rls` against a local Supabase.
-- Counts are scoped to this file's fixtures, so seeded data doesn't matter.
-- Everything happens in one transaction that is rolled back.
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
declare
  v_email text := (select email from auth.users where id = uid);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', v_email)::text, true);
end $$;

create function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end $$;

create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Raises unless `stmt` fails with an error whose message contains `expected`.
create function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected error "%" from: %', expected, stmt;
exception when others then
  if sqlerrm not ilike '%' || expected || '%' then
    raise exception 'expected error "%" but got "%" from: %', expected, sqlerrm, stmt;
  end if;
end $$;

create function pg_temp.expect_eq(actual bigint, expected bigint, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception '%: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok - %', label;
end $$;

-- Fixtures ------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@test'),
  ('00000000-0000-4000-8000-000000000002', 'member@test'),
  ('00000000-0000-4000-8000-000000000003', 'stranger@test'),
  ('00000000-0000-4000-8000-000000000004', 'newbie@test'),
  ('00000000-0000-4000-8000-000000000005', 'Invited@Test'),
  ('00000000-0000-4000-8000-000000000006', 'blank@test');
insert into profiles (id, display_name, is_admin) values
  ('00000000-0000-4000-8000-000000000001', 'Admin', true),
  ('00000000-0000-4000-8000-000000000002', 'Member', false);
insert into music_items (id, kind, title, artist, external_key) values
  ('10000000-0000-4000-8000-000000000001', 'album', 'In Rainbows', 'Radiohead', 'test:album:1');
insert into recommendations (id, item_id, from_user) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
insert into ratings (user_id, item_id, stars) values
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 5);
insert into ai_suggestions (id, user_id, item_id, reason) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'because');
insert into invites (code, grants_admin, created_by) values
  ('testcode', false, '00000000-0000-4000-8000-000000000001'),
  ('usedcode', false, null);
update invites set used_by = '00000000-0000-4000-8000-000000000002', used_at = now() where code = 'usedcode';
insert into invites (code, email, name, created_by) values
  ('emailcode', 'invited@test', 'Ivy', '00000000-0000-4000-8000-000000000001'),
  ('blankcode', null, null, null);
insert into invites (code, expires_at) values ('oldcode', now() - interval '1 day');

-- Non-members see nothing --------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000003');
select pg_temp.expect_eq((select count(*) from recommendations), 0, 'non-member cannot read recommendations');
select pg_temp.expect_eq((select count(*) from profiles), 0, 'non-member cannot read profiles');
select pg_temp.expect_eq((select count(*) from music_items), 0, 'non-member cannot read items');
select pg_temp.expect_error($$select ensure_music_item('{"kind":"album","title":"x","artist":"y","external_key":"k"}')$$, 'not a member');
select pg_temp.expect_error($$insert into recommendations (item_id) values ('10000000-0000-4000-8000-000000000001')$$, 'row-level security');

-- Anonymous visitors see nothing, but can check an invite -------------------
select pg_temp.reset_role();
set local role anon;
select pg_temp.expect_eq((select count(*) from recommendations), 0, 'anon cannot read recommendations');
select pg_temp.expect_eq((select check_invite('testcode'))::int, 1, 'anon can check a valid invite');
select pg_temp.expect_eq((select check_invite('usedcode'))::int, 0, 'used invite is invalid');
select pg_temp.expect_error($$select redeem_invite('testcode', 'x')$$, 'permission denied');
select pg_temp.expect_error($$select claim_email_invite('x')$$, 'permission denied');
select pg_temp.expect_error($$select my_email_invite()$$, 'permission denied');
select pg_temp.reset_role();

-- invite_details and invite_open_for_email work for anonymous visitors ------
select pg_temp.act_as_anon();
select pg_temp.expect_eq((select (invite_details('testcode') ->> 'status' = 'open')::int), 1, 'anon sees an open invite');
select pg_temp.expect_eq((select (invite_details('testcode') ->> 'inviter' = 'Admin')::int), 1, 'invite names who sent it');
select pg_temp.expect_eq((select (invite_details('usedcode') ->> 'status' = 'used')::int), 1, 'used invite says used');
select pg_temp.expect_eq((select (invite_details('oldcode') ->> 'status' = 'expired')::int), 1, 'old invite says expired');
select pg_temp.expect_eq((select (invite_details('nope') ->> 'status' = 'missing')::int), 1, 'unknown code says missing');
select pg_temp.expect_eq((select (invite_details('emailcode') ->> 'name' = 'Ivy')::int), 1, 'invite carries the friend''s name');
select pg_temp.expect_eq(invite_open_for_email(' INVITED@test ')::int, 1, 'email lookup ignores case and spaces');
select pg_temp.expect_eq(invite_open_for_email('member@test')::int, 0, 'no invite for that email');
select pg_temp.expect_eq((select count(*) from invites), 0, 'anon cannot list invites');

-- Members read everything, write only their own ------------------------------
select pg_temp.reset_role();
select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select pg_temp.expect_eq((select count(*) from recommendations where id = '20000000-0000-4000-8000-000000000001'), 1, 'member reads recommendations');
select pg_temp.expect_eq((select count(*) from ratings where item_id = '10000000-0000-4000-8000-000000000001'), 1, 'member reads everyone''s ratings');

with u as (update ratings set stars = 1 where user_id = '00000000-0000-4000-8000-000000000001' returning 1)
select pg_temp.expect_eq((select count(*) from u), 0, 'member cannot change someone else''s rating');
select pg_temp.expect_error($$insert into ratings (user_id, item_id, stars) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1)$$, 'row-level security');
insert into ratings (item_id, stars) values ('10000000-0000-4000-8000-000000000001', 4);
select pg_temp.expect_eq((select count(*) from ratings where user_id = auth.uid()), 1, 'member rates an item');
select pg_temp.expect_error($$insert into ratings (item_id) values ('10000000-0000-4000-8000-000000000001')$$, 'check constraint');

with d as (delete from recommendations where id = '20000000-0000-4000-8000-000000000001' returning 1)
select pg_temp.expect_eq((select count(*) from d), 0, 'member cannot delete someone else''s recommendation');

insert into comments (recommendation_id, body) values ('20000000-0000-4000-8000-000000000001', 'nice');
select pg_temp.expect_error($$insert into comments (recommendation_id, body) values ('20000000-0000-4000-8000-000000000001', repeat('x', 281))$$, 'check constraint');
insert into reactions (recommendation_id, emoji) values ('20000000-0000-4000-8000-000000000001', '🔥');
select pg_temp.expect_eq((select count(*) from reactions where recommendation_id = '20000000-0000-4000-8000-000000000001'), 1, 'member reacts');

-- AI fields are service-role only --------------------------------------------
select pg_temp.expect_error($$update music_items set ai_summary = 'hacked'$$, 'permission denied');
select pg_temp.expect_error($$insert into music_items (kind, title, artist, external_key) values ('album', 'x', 'y', 'z')$$, 'permission denied');
select pg_temp.expect_error($$insert into ai_suggestions (user_id, item_id, reason) values (auth.uid(), '10000000-0000-4000-8000-000000000001', 'x')$$, 'permission denied');
select pg_temp.expect_eq((select count(*) from ai_suggestions), 0, 'member cannot see others'' suggestions');
select pg_temp.expect_eq((select count(*) from ai_batches), 0, 'member cannot see batches');

-- ensure_music_item dedupes and ignores AI fields
select pg_temp.expect_eq(
  (select count(distinct x) from (
    select ensure_music_item('{"kind":"album","title":"Kid A","artist":"Radiohead","external_key":"test:album:2","ai_summary":"nope"}') as x
    union all
    select ensure_music_item('{"kind":"album","title":"Kid A (dupe)","artist":"Radiohead","external_key":"test:album:2"}')
  ) t), 1, 'ensure_music_item returns one id per external_key');
select pg_temp.expect_eq((select count(*) from music_items where external_key = 'test:album:2' and ai_summary is null and title = 'Kid A'), 1, 'ensure_music_item ignores ai_summary and keeps the original');

-- Profiles: can rename self, cannot self-promote
update profiles set display_name = 'Renamed' where id = auth.uid();
select pg_temp.expect_error($$update profiles set is_admin = true where id = auth.uid()$$, 'permission denied');

-- Invites: admins only
select pg_temp.expect_eq((select count(*) from invites), 0, 'non-admin cannot read invites');
select pg_temp.expect_error($$insert into invites (created_by) values (auth.uid())$$, 'row-level security');
update invites set expires_at = now() + interval '1 year' where code = 'testcode';
select pg_temp.expect_eq((select count(*) from invites where code = 'testcode' and expires_at > now() + interval '300 days'), 0, 'non-admin cannot renew invites');
select pg_temp.expect_eq(claim_email_invite('x')::int, 1, 'claim is a no-op for existing members');

-- Suggestion owner can change status only
select pg_temp.reset_role();
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select pg_temp.expect_eq((select count(*) from ai_suggestions where id = '30000000-0000-4000-8000-000000000001'), 1, 'owner sees own suggestion');
update ai_suggestions set status = 'dismissed' where id = '30000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($$update ai_suggestions set reason = 'edited'$$, 'permission denied');
select pg_temp.expect_eq((select count(*) from invites where code in ('testcode', 'usedcode')), 2, 'admin reads invites');
insert into invites (created_by, name) values (auth.uid(), 'Sam');
select pg_temp.expect_eq((select count(*) from invites where created_by = auth.uid() and name = 'Sam' and expires_at > now() + interval '29 days'), 1, 'new invites last 30 days');
update invites set expires_at = now() + interval '30 days' where code = 'oldcode';
select pg_temp.expect_eq((select count(*) from invites where code = 'oldcode' and expires_at > now()), 1, 'admin renews an expired invite');
select pg_temp.expect_error($$update invites set grants_admin = true where code = 'testcode'$$, 'permission denied');
update invites set expires_at = now() + interval '1 year' where code = 'usedcode';
select pg_temp.expect_eq((select count(*) from invites where code = 'usedcode' and expires_at > now() + interval '300 days'), 0, 'used invites cannot be renewed');

-- Redeeming an invite ---------------------------------------------------------
select pg_temp.reset_role();
select pg_temp.act_as('00000000-0000-4000-8000-000000000004');
select pg_temp.expect_error($$select redeem_invite('usedcode', 'Newbie')$$, 'invalid or expired');
select redeem_invite('testcode', '  Newbie  ');
select pg_temp.expect_eq((select count(*) from profiles where id = auth.uid() and display_name = 'Newbie' and not is_admin), 1, 'redeeming creates a trimmed, non-admin profile');
select pg_temp.expect_eq((select count(*) from recommendations where id = '20000000-0000-4000-8000-000000000001'), 1, 'new member can read the feed');
select pg_temp.reset_role();
select pg_temp.expect_eq((select count(*) from invites where code = 'testcode' and used_by = '00000000-0000-4000-8000-000000000004'), 1, 'invite is marked used');
select pg_temp.act_as('00000000-0000-4000-8000-000000000004');
select pg_temp.expect_eq((select (invite_details('testcode') ->> 'used_by_me')::boolean::int), 1, 'invite page knows you already used it');
select pg_temp.reset_role();

-- Claiming the invite addressed to your email ---------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000003');
select pg_temp.expect_eq((select count(*) from (select my_email_invite() as i) x where i is not null), 0, 'stranger has no email invite');
select pg_temp.expect_eq(claim_email_invite('Stranger')::int, 0, 'stranger cannot claim');
select pg_temp.expect_eq((select count(*) from profiles), 0, 'stranger is still not a member');
select pg_temp.reset_role();
select pg_temp.act_as('00000000-0000-4000-8000-000000000005');
select pg_temp.expect_eq((select (my_email_invite() ->> 'code' = 'emailcode')::int), 1, 'invited user finds their invite, ignoring case');
select pg_temp.expect_eq(claim_email_invite(null)::int, 1, 'invited user claims it');
select pg_temp.expect_eq((select count(*) from profiles where id = auth.uid() and display_name = 'Ivy'), 1, 'name falls back to the invite''s');
select pg_temp.reset_role();
select pg_temp.expect_eq((select count(*) from invites where code = 'emailcode' and used_by = '00000000-0000-4000-8000-000000000005'), 1, 'claimed invite is marked used');

-- A blank name falls back to the email's local part
select pg_temp.act_as('00000000-0000-4000-8000-000000000006');
select redeem_invite('blankcode', '   ');
select pg_temp.expect_eq((select count(*) from profiles where id = auth.uid() and display_name = 'blank'), 1, 'blank name falls back to the email');
select pg_temp.reset_role();

rollback;
\echo 'All RLS tests passed.'
