# Nutrition Tracker — Stage 2

Static HTML/CSS/JavaScript nutrition and exercise Tracker with Supabase email/password accounts and private per-user cloud state. `index.html` is authoritative; `nutrition-tracker.html` is kept byte-identical. Production is deployed from `Lightbody61/nutrition-tracker` `main` to `https://nutrition-tracker.jodydmccord.workers.dev`.

## Supabase configuration and security model

- Project URL: `https://bwihhbcfthkfsogqmgdq.supabase.co`
- Browser credential: the intended browser-safe `sb_publishable_...` key in `account.js`
- No secret, service-role, database password, JWT secret, or direct connection string is used.
- The official Supabase JavaScript v2 browser client is loaded from a pinned HTTPS CDN URL.
- Email/password registration uses a production confirmation redirect. Login, logout, confirmation resend, password-reset request, recovery-session detection, and password update use Supabase Auth.
- The existing `public.tracker_states` table must have `user_id uuid primary key`, `tracker_state jsonb not null`, `schema_version integer not null`, and `updated_at timestamptz not null`.
- RLS must remain enabled with authenticated users restricted to their own `user_id`. Client code derives the ID only from the authenticated session.

### Required manual database migration

Before deploying this browser release, open the production Supabase SQL editor and run the complete, exact contents of [`supabase/atomic_tracker_state.sql`](supabase/atomic_tracker_state.sql). The migration creates `public.save_tracker_state_if_version_matches(jsonb, integer, timestamptz)` as `SECURITY INVOKER`, derives identity from `auth.uid()`, leaves RLS in force, revokes public/anonymous execution, and grants execution only to `authenticated`. The browser release must not be deployed before this function exists.

Also run [`supabase/contact_messages.sql`](supabase/contact_messages.sql). It creates the private `contact_messages` queue with RLS enabled. Authenticated users can insert only rows whose `user_id` is their own; they cannot read, update, or delete submitted messages.

The optional secure administrator activity dashboard requires the separate migration, role assignment, Edge Function deployment, and verification steps in [`supabase/ADMIN_MODULE_SETUP.md`](supabase/ADMIN_MODULE_SETUP.md). Committing the frontend alone does not make the Admin module operational.

This checkout does not use an automated production database migration runner. In the Supabase Dashboard, open **SQL Editor** for project `bwihhbcfthkfsogqmgdq`, paste the complete contents of `supabase/contact_messages.sql`, and choose **Run**. The SQL is additive and safe to rerun; it does not reset the database or delete messages.

### Contact Administrator Edge Function

Deploy `supabase/functions/contact-admin` with Supabase's normal JWT verification enabled. The function authenticates the caller again, derives `user_id` from the verified session, validates all fields, and fixes the recipient server-side. It stores the message before attempting email delivery, then records the delivery result.

Configure these Edge Function secrets in Supabase (never in browser code or a committed `.env` file):

- `RESEND_API_KEY` — Resend server API key.
- `CONTACT_FROM_EMAIL` — a verified Resend sender address.
- `ADMIN_EMAIL` — optional; defaults server-side to `clanmccord@hotmail.com`.

After authenticating the Supabase CLI, deploy and configure the function with:

```bash
supabase login
supabase functions deploy contact-admin --project-ref bwihhbcfthkfsogqmgdq
supabase secrets set --project-ref bwihhbcfthkfsogqmgdq RESEND_API_KEY='YOUR_REAL_RESEND_KEY' CONTACT_FROM_EMAIL='YOUR_VERIFIED_RESEND_SENDER' ADMIN_EMAIL='clanmccord@hotmail.com'
```

Replace the two placeholders locally with real values; do not commit them. Supabase automatically supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the deployed function. Verify that an unauthenticated request is rejected (401) rather than missing (404):

```bash
curl -i -X POST 'https://bwihhbcfthkfsogqmgdq.supabase.co/functions/v1/contact-admin' -H 'Content-Type: application/json' --data '{}'
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Supabase Edge Function environment. The service-role key is used only inside the server function so it can update delivery status; it must never be copied into frontend code. Without the Resend settings, submissions remain safely stored with `pending_configuration` status and the user is told that storage succeeded but email delivery failed.

## Cloud state flow

After authentication resolves, the Tracker reads only that user's row and the matching account-scoped cache. Dirty cached edits are compared with cloud state before either is applied. Different dirty cache/cloud versions require Save Cached Version to Cloud or a confirmed Load Cloud Version choice; identical versions load normally. A missing row with no cache creates a clean state. Old unscoped Stage 1 data is never uploaded.

Mutations are obtained through `getTrackerState()`, validated, and cached with `dirty`, `base_updated_at`, and cache time metadata. Saves call the atomic RPC with the last confirmed `updated_at`; the database updates only on an exact match. A stale version returns conflict without mutation. No unconditional upsert or field-level merging is used.

Signed-out users see a clean, locked Tracker. Dirty logout attempts save first. Offline, expired-session, RLS, and conflict failures stop logout and preserve cache, offering Retry Save, Stay Signed In, or strongly confirmed discard-and-logout. Delete Account Data deletes only the authenticated user's row after two confirmations.

## Static preview and deployment

```bash
cd /home/jody/Portal/TrackerSite
python3 -m http.server 8080
```

Open `http://127.0.0.1:8080`. No application server, framework, package install, environment variables, or build step is required. Cloudflare should deploy the repository root with framework preset `None`, blank build command, and output directory `.`. HTTPS and network access to the Supabase and jsDelivr origins are required in production.

## Testing

```bash
node --check account.js
node tests/tracker-regression.test.js
node tests/account-module.test.js
node tests/account-auth-mock.test.js
node tests/cloud-persistence-correctness.test.js
node tests/contact-security.test.js
cmp -s index.html nutrition-tracker.html
git diff --check
```

See `TESTING.md` for complete automated and production manual procedures.

## Stage 2 limitations

- Email delivery and confirmation depend on production Supabase Auth configuration.
- Conflict resolution is whole-state choice, not merging.
- Offline cache is best-effort and browser/origin specific.
- Delete Account Data does not delete the authentication identity.
- No ecommerce, subscriptions, destructive user administration, JSON transfer, or old-format migration is included. The optional read-only activity dashboard requires the separate secured deployment steps above.
- Supabase Auth normally persists its own session; application code does not manually store tokens.

Do not commit or push without repository-owner approval.
