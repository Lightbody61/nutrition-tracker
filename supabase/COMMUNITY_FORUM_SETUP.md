# Community Forum v2 live setup

Do not run the older `community_forum.sql`. The v2 migration is consolidated and safely handles both a new forum and a database where the original migration was already applied.

## Live deployment steps

1. Push the frontend commit to GitHub.
2. Open the Supabase project.
3. Go to **SQL Editor**.
4. Run all contents of `supabase/community_forum_v2.sql`.
5. Go to **Authentication → Users**.
6. Copy Jody’s authenticated user UUID.
7. Run this statement after replacing `ACTUAL_UUID`:

   ```sql
   insert into public.forum_admins (user_id)
   values ('ACTUAL_UUID')
   on conflict (user_id) do nothing;
   ```

8. Reload the Nutrition Tracker.
9. Choose a screen name.
10. Verify **Forum Administration** appears for Jody.
11. Post a top-level test comment.
12. Post a reply.
13. Confirm dates display using the browser’s local date and time.
14. Delete the test comment from Forum Administration and confirm its replies are also removed.
15. Test with a second nonadministrator account: it should read/post/reply with a screen name, delete only its own comments, and have no administration access.

Do not consider the forum live until the migration, administrator assignment, and all live checks above succeed.

## Diagnostic queries

Confirm the tables exist:

```sql
select to_regclass('public.forum_profiles') as forum_profiles,
       to_regclass('public.forum_admins') as forum_admins,
       to_regclass('public.community_forum_comments') as community_forum_comments;
```

Confirm Jody is an administrator (replace `ACTUAL_UUID`):

```sql
select user_id, created_at
from public.forum_admins
where user_id = 'ACTUAL_UUID';
```

Confirm RLS is enabled:

```sql
select relname, relrowsecurity
from pg_class
where oid in (
  'public.forum_profiles'::regclass,
  'public.forum_admins'::regclass,
  'public.community_forum_comments'::regclass
)
order by relname;
```

View comments and reply relationships:

```sql
select id, user_id, parent_comment_id, reply_to_user_id, created_at, comment_text
from public.community_forum_comments
order by created_at desc;
```

View forum profiles without accessing authentication emails:

```sql
select user_id, screen_name, created_at, updated_at
from public.forum_profiles
order by lower(screen_name);
```
