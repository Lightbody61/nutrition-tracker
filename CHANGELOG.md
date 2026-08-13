# Changelog

## AI Assistance menu and meal plans

- Converted AI Assistance into a submenu with separate Add Food, Add Recipe, and Suggest Meal Plans pages.
- Kept the existing AI-assisted Add Food and Add Recipe import controls and behavior while relocating them to child pages.
- Added a validated AI meal-plan workflow with local-date range limits, goal prompts, defensive JSON parsing, preview totals, existing food/recipe matching, append/replace/cancel imports, and rollback on save failure.
- Added regression coverage for AI navigation, meal-plan prompt construction, parsing, validation, matching, dated import behavior, conflicts, and mirrored file synchronization.

## Login landing page and authenticated navigation

- Made the existing Supabase account interface the opening login view and navigate authenticated users to the six-button tracker menu.
- Moved signed-in account and logout controls into Profile, and added Contact Admin and updated Users Guide destinations.
- Added a private RLS-protected contact-message queue and authenticated Supabase Edge Function with server-fixed administrator delivery.

## Navigation hierarchy redesign

- Replaced the horizontal header navigation with a dedicated responsive Home screen containing exactly six primary menu buttons.
- Added full-screen Food, Food Lists, Stats, Exercise, Utilities, and Reports menu levels with explicit immediate-parent return buttons.
- Centralized single-page navigation and shared-destination parent handling without changing URLs, Tracker state, schemas, calculations, or account persistence.
- Added navigation regression coverage for Home isolation, menu destinations, return mappings, single-screen visibility, and scroll-to-top behavior.

## Stage 2 — Supabase accounts and private cloud saving

- Added email/password registration, confirmation guidance/resend, login, logout, password-reset request, recovery-session handling, and password update.
- Added a prominent signed-out account gate and clean signed-out Tracker state.
- Added authenticated per-user load, clean-row creation, Save Now, 1.8-second autosave, lifecycle flush attempts, and readable status handling.
- Added the manual `supabase/atomic_tracker_state.sql` migration and replaced select-then-upsert with an `auth.uid()`-derived atomic version-matching RPC.
- Added startup reconciliation that preserves dirty cached edits and offers Save Cached Version to Cloud or confirmed Load Cloud Version choices.
- Added protected logout: failed dirty saves abort logout, retain cache, and offer retry, stay signed in, or strongly confirmed discard.
- Fixed recovered-cache overwrite resolution to require confirmation and atomically target the displayed cloud record's current `updated_at`; a second cloud advance refreshes the conflict without discarding cached edits.
- Fixed missing-row recovery so dirty and clean account caches discard obsolete server versions and atomically recreate deleted rows with a null expected timestamp; concurrent recreation still produces a refreshed, resolvable conflict.
- Guarded account-data deletion against debounced and in-flight saves, preventing automatic row recreation after success while preserving cached state and restoring autosave after deletion failure.
- Added revision-aware save draining so edits and Save Now requests made during an RPC remain dirty and coalesce into a follow-up save instead of being incorrectly marked clean.
- Added session-generation isolation that immediately clears and locks Tracker state on direct account switches and rejects stale loads or save completions from the previous user.
- Changed clean-cache missing-row recovery to immediately recreate the cloud row atomically, retain dirty offline cache for reconnect retry, and present a real-record conflict if another device recreates first.
- Scoped account-data deletion completions to their captured user, session generation, and deletion operation so a late User A response cannot alter User B’s cache, visible state, saves, conflicts, or status messages.
- Added generation-keyed cloud-load deduplication so overlapping initial-session callbacks, duplicate sign-in events, and token refreshes cannot fetch or insert the same account state twice.
- Fixed password recovery to remain locked through the post-update cloud/cache load, reject stale recovery completions, and offer Retry Load if the password changes but Tracker loading fails.
- Added strong-confirmation deletion of only the current user's Tracker data row.
- Updated privacy and Users Guide wording for Supabase, RLS, synchronization, cache, shared-device logout, and Stage 2 scope.
- Added account/static/privacy tests and preserved existing Tracker regression coverage.
- Retained the static single-page architecture and all existing Tracker calculations and supported modules.
