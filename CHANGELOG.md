# Changelog

## Web Version 1.0 — Stage 1

### Functional fixes

- Filtered four malformed sparse slots from the built-in food array at initialization. All 138 usable built-in foods remain present; no food was removed.
- Restored the empty-day energy-balance guard so blank and future days show zero calorie balance and zero estimated weight change instead of a maintenance-sized deficit. Food-only, completed-exercise-only, and mixed days retain their existing calculations.
- Applied the same `nutrientForTotals()` conversion to grouped Daily Totals as overall totals, keeping collagen stored in the protein field separate from complete protein.
- Permanently removed the automated nutrient-suggestion module, including its screen, controls, ranking logic, cached state, messages, and listeners. Standard nutrition totals, statistics, breakdowns, food logging, recipes, and the food database remain intact.
- Permanently removed the branded gym-machine workout module and all associated interface, calculations, history, state fields, and compatibility code.
- Kept the standard Exercise Tracker, normal exercise deletion, Copy Day, and browser-local save/reload behavior intact.

### Hosting preparation

- Kept `index.html` at the repository root as the authoritative static entry point.
- Retained the optional GitHub Pages workflow and documented Cloudflare Pages as the Stage 1 target with no build command and repository-root output.
- Confirmed the site has no backend or runtime package dependency.

### Mobile corrections

- Prevented mobile form-input zoom by using 16px inputs on phone widths.
- Added horizontal scrolling to dense Tracker result areas and kept navigation controls touch-sized.
- Allowed the shopping calendar to scroll instead of forcing landscape orientation.

### Storage corrections

- Kept localStorage key `nutritionTracker.rebuild.v1` unchanged.
- Added visible save success and useful storage/quota error feedback.
- Added a plain-language warning about browser-local and private/incognito storage.
- Removed automatic URL-fragment persistence and restoration. Tracker data is never written to the hash, query string, page URL, or browser history; localStorage is the only automatic Stage 1 persistence mechanism.
- Strengthened localStorage failure messages to warn clearly that changes may not persist.
- Added `createEmptyTrackerState()`, `validateTrackerState()`, `applyTrackerState()`, and `getTrackerState()` as the provider-neutral state boundary for authenticated Stage 2 storage.
- Fresh state now contains neutral profile placeholders, built-in catalogs, and no user activity, custom foods, one-off foods, weights, or saved days.
- Intentionally does not migrate unversioned browser-local state. Incompatible stored values remain untouched and automatic saving stays blocked until the user explicitly acknowledges the new format and clean reset.

### File-transfer removal

- Removed manual JSON file-transfer controls, file handling, validation, and compatibility paths.
- Removed obsolete-version migration and repair logic; Stage 1 loads only the current validated state schema and safely ignores unknown fields.

### Security headers

- Added conservative `nosniff`, referrer, permissions, and same-origin framing headers without adding a Content Security Policy that could break inline Tracker code or printing.

### Documentation

- Reworked `README.md` for local preview, GitHub, Cloudflare Pages, data warnings, and future stages.
- Added `AGENTS.md`, `CHANGELOG.md`, and `TESTING.md`.

### Tests

- See `TESTING.md` for automated, static-server, mobile, persistence, state-boundary, network, and manual coverage.
- Added executable regression coverage for clean fresh state, built-in catalogs, food/exercise logging, profile and weight state, Copy Day, Reset Day, Reset App, localStorage reload, unknown-field exclusion, and removal scans.
- Added regression coverage for the retained Food hub, Nutrition Stats, Daily Totals, Daily Macro/Micro Breakdown, nutrient calculations, and standard food logging, plus a complete removed-module scan.
- Added state-boundary coverage proving current-schema loading, incompatible detection, notice display, zero pre-acknowledgment writes, clean acknowledged reset, normal subsequent reload, and absence of migration.

### Visual changes

- Added a compact Stage 1 local-data notice and unobtrusive footer with Privacy, Contact, version, and save status.
- The Utilities page was simplified after removal of manual file-transfer controls; other Tracker screens retain their established layout.
