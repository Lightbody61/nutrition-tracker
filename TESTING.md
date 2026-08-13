# Testing

All automated account checks use source inspection or local mocks/stubs and do not contact or mutate the production Supabase database. Never create production test users automatically.

## Automated commands

```bash
node -e 'const fs=require("fs"),vm=require("vm");const h=fs.readFileSync("index.html","utf8"),s=h.indexOf("<script>")+8;new vm.Script(h.slice(s,h.indexOf("</script>",s)))'
node --check account.js
node tests/tracker-regression.test.js
node tests/account-module.test.js
node tests/account-auth-mock.test.js
node tests/cloud-persistence-correctness.test.js
node tests/contact-security.test.js
node tests/admin-module.test.js
node tests/ai-assistance.test.js
cmp -s index.html nutrition-tracker.html
git diff --check
```

AI Assistance coverage verifies the submenu and relocated Add Food/Add Recipe pages, Suggest Menus request validation, conditional goal prompt data, fenced JSON cleanup, malformed/incomplete package rejection, local-date handling, existing Food List and recipe reuse, per-date imports, append/replace/cancel behavior, save-failure rollback, visual page separation, and mirrored file synchronization.

Contact coverage should verify signed-out access remains locked, form required/email/length validation, duplicate-submit prevention, message preservation on failure, fixed server-side recipient, authenticated session-derived `user_id`, storage-before-delivery, and RLS denial of message reads/updates/deletes. Production delivery requires the migration, deployed Edge Function, and configured Resend secrets described in README.

Navigation coverage verifies the six-button Home screen has no module or account data, every parent and submenu destination opens independently, return controls use designated immediate parents, shared Daily Totals returns to its launching menu, only one screen is active, and every navigation resets scroll position. Responsive Home layout should be manually checked at wide desktop (three columns), tablet (two columns), and Android phone (one column), including overflow, spacing, return-control visibility, tables, forms, and cloud status.

Coverage includes signed-out startup; Auth flows; dirty/clean/no-cache startup reconciliation; identical, older, and newer cloud/cache cases; failed dirty-cache retries; atomic first insert, matching update, stale rejection, and simulated concurrent devices; server-derived identity and absence of a user-ID RPC parameter; conflict non-mutation; debounce and Save Now; clean/successful/failed/conflicted/expired/discard logout paths and cache retention; user separation; retained Tracker regression behavior; static configuration; and URL/log privacy.

Recovered-cache regression coverage verifies confirmed overwrite against the displayed cloud `updated_at`, null-version insertion when the row was deleted, rejection and refreshed conflict when another device recreates it, retained cached state after rejection, Load Cloud Version behavior, clean cache metadata after success, and continued absence of unconditional upsert.

Clean-cache missing-row coverage verifies successful startup without a stale server version, immediate atomic row recreation, offline/reconnect retry, and a normal conflict containing the recreated cloud record when another device saves first. Deletion coverage verifies cancellation of debounced work, invalidation and draining of in-flight saves before deletion, no automatic recreation, later explicit insertion, and state/cache preservation with autosave restoration after failure.

Revision-race coverage verifies that an older successful RPC cannot mark newer edits clean, multiple edits coalesce into one follow-up save, Save Now queues behind an active RPC, and failure preserves the newest dirty cache. Direct-session-switch coverage verifies immediate locked-state clearing, successful and failed new-user loads, per-user cache selection, stale old-user response rejection, and the signed-out-to-signed-in path. Missing clean-cache rows are now tested for immediate null-version recreation, clean metadata after success, real-record conflict on a competing insert, and reconnect retry after offline preservation.

Deletion/session race coverage verifies same-session success and failure, stale success and failure after User A switches to User B, captured-user-only cache handling, unchanged User B state/status/save scheduling, and correct empty state when returning to User A after its authorized cloud deletion completed.

Authentication initialization coverage verifies that the auth listener’s `INITIAL_SESSION` callback is the sole boot authority, generation-keyed deduplication still shares any overlapping same-user load request, duplicate same-user sign-in and token-refresh events do not reload, new generations do load, and failed loads can retry after the shared promise clears. Password-recovery coverage verifies the locked recovery form, blocked pre-load saves, guarded password-update completion, successful existing-state display without reload, locked failure messaging, Retry Load, and safe rejection after a session switch.

The source test does not substitute for production Auth email delivery, real RLS verification, browser lifecycle behavior, or multi-device timing.

## Production manual test plan

1. Create User A without automation and confirm the email.
2. Log in as User A; add food, exercise, profile, and weight data; confirm Saved status.
3. On a second device, log in as User A and confirm the same state loads.
4. Log out and verify no User A data remains visible.
5. Create and confirm User B; verify a clean Tracker and no User A data/cache.
6. Log back in as User A and confirm User A data remains.
7. Request password reset, follow the email link, set matching new passwords, and log in with the new password.
8. First run the exact `supabase/atomic_tracker_state.sql` file manually in the Supabase SQL editor and verify authenticated execute access.
9. Disconnect networking after a successful load, modify data, close the page, reconnect, and verify cached edits are offered rather than discarded. Test both Save Cached Version and confirmed Load Cloud Version.
10. Open User A on two devices from the same version and save simultaneously. Verify exactly one atomic write succeeds and the other reports conflict.
11. While dirty, test logout after offline, conflict, expired-session, and RLS-style failures. Verify logout stops and cache remains; test Retry, Stay Signed In, and strongly confirmed discard.
12. Use Delete Account Data during both a pending debounce and an in-flight save. Cancel each confirmation once, then complete both confirmations. Verify only Tracker data is deleted, no row is automatically recreated, Save Now can later create a row, and the Auth account still works. Simulate a failed delete and verify state/cache remain and autosave resumes.
13. Through the Supabase dashboard or a safe authenticated test, verify neither user can read/update/delete the other's row and RLS remains enabled.
14. Exercise retained Tracker modules and verify production desktop/mobile confirmation and reset redirects.

## Known test limitations

- Production email confirmation/reset delivery and Auth URL allow-list settings require manual verification.
- Browser unload requests are best-effort and must be manually observed.
- True offline recovery and simultaneous-device conflicts require browser/device tests.
- The publishable client relies on the already-configured database schema and RLS policies; tests do not alter them.
