-- RLS and access tests. Run with `npm run test:rls` against a local Supabase.
-- Everything happens in one transaction that is rolled back.
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
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
  ('00000000-0000-4000-8000-000000000004', 'newbie@test');
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
insert into invites (code, grants_admin) values ('testcode', false), ('usedcode', false);
update invites set used_by = '00000000-0000-4000-8000-000000000002', used_at = now() where code = 'usedcode';

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

-- Members read everything, write only their own ------------------------------
select pg_temp.reset_role();
select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select pg_temp.expect_eq((select count(*) from recommendations), 1, 'member reads recommendations');
select pg_temp.expect_eq((select count(*) from ratings), 1, 'member reads everyone''s ratings');

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
select pg_temp.expect_eq((select count(*) from reactions), 1, 'member reacts');

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

-- Suggestion owner can change status only
select pg_temp.reset_role();
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select pg_temp.expect_eq((select count(*) from ai_suggestions), 1, 'owner sees own suggestion');
update ai_suggestions set status = 'dismissed' where id = '30000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($$update ai_suggestions set reason = 'edited'$$, 'permission denied');
select pg_temp.expect_eq((select count(*) from invites), 2, 'admin reads invites');
insert into invites (created_by) values (auth.uid());

-- Redeeming an invite ---------------------------------------------------------
select pg_temp.reset_role();
select pg_temp.act_as('00000000-0000-4000-8000-000000000004');
select pg_temp.expect_error($$select redeem_invite('usedcode', 'Newbie')$$, 'invalid or expired');
select redeem_invite('testcode', '  Newbie  ');
select pg_temp.expect_eq((select count(*) from profiles where id = auth.uid() and display_name = 'Newbie' and not is_admin), 1, 'redeeming creates a trimmed, non-admin profile');
select pg_temp.expect_eq((select count(*) from recommendations), 1, 'new member can read the feed');
select pg_temp.reset_role();
select pg_temp.expect_eq((select count(*) from invites where code = 'testcode' and used_by = '00000000-0000-4000-8000-000000000004'), 1, 'invite is marked used');

rollback;
\echo 'All RLS tests passed.'
