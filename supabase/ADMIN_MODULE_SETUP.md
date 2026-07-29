# Secure Admin module deployment

The Admin frontend is not operational until every step below is complete. Do not place a service-role key or administrator UUID in browser code.

1. In the Supabase SQL Editor for project `bwihhbcfthkfsogqmgdq`, run all of `supabase/admin_activity.sql`. This creates `admin_users`, `user_activity`, `user_activity_days`, their RLS policies, and the authenticated `record_user_activity` RPC. It does not modify tracker nutrition data.
2. In **Authentication → Users**, copy the intended administrator's Auth UUID. In SQL Editor, assign it through a privileged session:

   ```sql
   insert into public.admin_users(user_id)
   values ('ACTUAL_ADMIN_AUTH_USER_UUID')
   on conflict (user_id) do nothing;
   ```

   Never add this UUID to frontend source. To remove authorization:

   ```sql
   delete from public.admin_users where user_id = 'ACTUAL_ADMIN_AUTH_USER_UUID';
   ```

3. Authenticate the Supabase CLI and deploy the function with normal JWT verification:

   ```bash
   supabase login
   supabase functions deploy admin-users --project-ref bwihhbcfthkfsogqmgdq
   ```

   Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function environment. No additional secret is required. Never copy `SUPABASE_SERVICE_ROLE_KEY` into the browser or repository.
4. Verify an unauthenticated request returns `401`, not `404`:

   ```bash
   curl -i -X POST 'https://bwihhbcfthkfsogqmgdq.supabase.co/functions/v1/admin-users' \
     -H 'Content-Type: application/json' --data '{"action":"status"}'
   ```
5. Deploy the static frontend only after the SQL and function are ready. Test with one assigned administrator and one normal confirmed account. The administrator should see **Admin** after login; the normal account must never see it and a direct request must receive `403`.

## Metrics and privacy

- **Active now**: last successful visible-page heartbeat within five minutes.
- **Recently active**: more than five minutes but no more than 24 hours since the last heartbeat.
- **Offline**: last heartbeat older than 24 hours. **Never active**: no heartbeat exists.
- Registration and last sign-in timestamps are exact Supabase Auth values.
- Session count is the number of authenticated application session starts recorded after this migration; it is not a historical Auth login total.
- Active days are distinct UTC dates with a recorded heartbeat after this migration.
- Tracked days and last tracked date are derived inside the privileged function from dates already present in `tracker_states` entries, exercises, and daily weights. Private tracker content is never returned.
- Heartbeats run immediately after authentication, on visibility return, on major-screen changes, and at most once per 60-second interval while visible. Failure is non-blocking.

The user list is read-only. It does not expose passwords, tokens, identities, provider metadata, meals, measurements, notes, or exercise details.
