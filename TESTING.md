# Testing

## Environment

- Repository: `/home/jody/Portal/TrackerSite`
- Branch: `main`
- Linux host with Node.js 18 and Chromium
- Static local HTTP server: Python `http.server` on port 8080
- Browser tests use a disposable Chromium user-data directory and synthetic Tracker data; real browser Tracker data is not touched.

## Commands

```bash
node -e 'const fs=require("fs"),vm=require("vm"); const h=fs.readFileSync("index.html","utf8"); new vm.Script(h.slice(h.indexOf("<script>")+8,h.lastIndexOf("</script>")))'
node tests/tracker-regression.test.js
python3 -m http.server 8080
curl -sS -I http://127.0.0.1:8080/
```

Additional Node-based structural and browser automation checks are described below. Node and Chromium are development-only test tools and are not deployment dependencies.

## Pre-edit findings

- `index.html` and `nutrition-tracker.html` were byte-identical.
- JavaScript grammar check passed.
- The built-in food literal had 142 array positions but four sparse positions caused by extra separators; it contained 138 usable food objects.

## Automated tests

- **PASS — JavaScript syntax:** both HTML files were extracted and parsed with Node's JavaScript parser after editing.
- **PASS — regression counts:** 138 usable built-in foods, 15 recipes, 20 standard exercise choices, and 9 supplements.
- **PASS — malformed catalog protection:** fresh state contains 138 named built-in foods and zero blank food records. Four sparse source-array positions are ignored.
- **PASS — calculations:** a two-serving synthetic food entry produced exactly twice the per-serving calories in daily totals.
- **PASS — empty-day guard:** a completely empty day returns zero calorie balance and zero estimated weight change. Food-only, completed-exercise-only, and food-plus-exercise days calculate the unchanged expected balance against maintenance.
- **PASS — standard exercise logging:** a normal activity preserves its name, category, date, time, minutes, calories, completion state, and generated ID.
- **PASS — exercise calorie persistence:** a saved normal activity and its calories survive compact localStorage save and reload.
- **PASS — normal exercise Copy Day:** REPLACE removes the old destination activity and copies the selected source activity with its calories.
- **PASS — grouped complete protein:** complete-protein food produces the same complete and collagen protein values in grouped and overall totals.
- **PASS — grouped collagen protein:** collagen stored in the food's `protein` field contributes only to collagen protein in grouped and overall totals.
- **PASS — grouped mixed protein:** mixed complete-protein and collagen foods remain separated, and grouped totals agree with Today's Menu/overall totals.
- **PASS — exercise deletion:** deleting one standard exercise preserves the unrelated standard exercise.
- **PASS — clean fresh state:** built-in catalogs and neutral profile placeholders are present with no logged food, exercise, weight, custom-food, one-off-food, or saved-day history.
- **PASS — state boundary:** `getTrackerState()` returns current user state, `applyTrackerState()` accepts validated current state, and `createEmptyTrackerState()` creates a clean state.
- **PASS — current-schema validation:** invalid structures are rejected and unknown top-level fields are ignored rather than retained.
- **PASS — intentional incompatibility boundary:** unversioned browser-local state is not migrated, normalized, merged, or salvaged.
- **PASS — protected format reset:** incompatible stored data remains byte-for-byte untouched, the one-time format notice appears, and no localStorage write occurs before explicit acknowledgment.
- **PASS — acknowledged clean start:** acknowledgment writes one clean current-schema state with empty user collections; the next reload recognizes and loads it normally.
- **PASS — food and exercise logging:** food servings update totals and standard exercises retain duration and calories.
- **PASS — profile and weight state:** profile values and daily weight history are exposed through the current state boundary.
- **PASS — reset behavior:** Reset Day clears only its selected day and Reset App returns to clean state while retaining built-in catalogs.
- **PASS — retained nutrition modules:** Food hub, Nutrition Stats, Daily Totals, Daily Macro/Micro Breakdown, Food Database, and Recipes screens remain present.
- **PASS — retained nutrient calculations:** calories, protein, fiber, and vitamin totals remain correct for multi-serving food entries.
- **PASS — permanent suggestion-module removal:** its navigation, screen, controls, cached state, calculations, messages, functions, IDs, and listeners are absent.
- **PASS — complete removal scan:** application source contains none of the removed module's text, IDs, function names, or data-field names.
- **PASS — localStorage schema:** key remains `nutritionTracker.rebuild.v1`; food entries, profile values, and standard exercise data survived a save/load cycle in an isolated storage implementation.
- **PASS — storage failure handling:** a simulated `QuotaExceededError` produced the useful “browser storage is full” status message.
- **PASS — URL privacy:** successful and failed saves leave `location.href`, `location.hash`, `location.search`, and browser-history methods untouched; personal food/profile data never appears in the URL stub.
- **PASS — localStorage-only reload:** a simulated page reload restored the saved food entry and profile value from `nutritionTracker.rebuild.v1`.
- **PASS — failed-save warning:** simulated unavailable/full localStorage produced a visible warning that changes may not persist.
- **PASS — failed-save URL isolation:** localStorage failure did not write Tracker state to any URL field or browser-history method.
- **PASS — URL isolation scan:** no hash persistence or history mutation remains in application JavaScript.
- **PASS — file-transfer removal:** no related controls, file input, reader, download-object URL, upload handler, or compatibility path remains.
- **PASS — module presence:** required screen/module IDs, including Users Guide, reports, recipes, food tools, stats, and the standard Exercise Tracker, remain present.
- **PASS — confirmations:** Reset Day and Reset App confirmation paths remain in place.
- **PASS — dependency/network scan:** no external script, stylesheet, image URL, `fetch`, XMLHttpRequest, or WebSocket dependency was found.
- **PASS — static hosting baseline:** `python3 -m http.server` previously served `/` as `200 OK` with `index.html` and no backend. The current verification rerun was attempted but the execution wrapper blocked loopback completion; root-document and no-runtime-dependency checks still pass.
- **PASS — file synchronization:** `cmp` confirms `index.html` and `nutrition-tracker.html` are byte-identical.
- **PASS — repository hygiene:** `git diff --check` reports no whitespace errors.
- **PASS — Cloudflare header syntax:** `_headers` begins with the `/*` path pattern, contains four indented response-header lines, has no Content Security Policy, and ends with a newline.

An automated Chromium interaction suite was prepared with a disposable profile, but the installed low-memory Pi Chromium did not expose either its pipe or debugging-port endpoint in headless mode. No browser interaction result is claimed from that run.

## Manual tests

Code paths and controls were inspected for all requested modules. The following device/browser checks remain for final review on a normal desktop browser and Android Chrome:

1. Add a disposable food, weight, profile change, and standard exercise; reload and reopen the browser to confirm persistence.
2. Save profile, food, exercise, and weight values, reload, and compare the restored values.
3. Open every navigation module, review Nutrition Stats and Daily Macro/Micro Breakdown, and add a recipe.
4. Verify recipe printing, Weight History Print / Create PDF, and shopping-list printing in the browser print dialog.
5. At approximately 360 × 800 CSS pixels, confirm navigation, forms, internal table/calendar scrolling, and footer remain usable without landscape mode.
6. Deploy to Cloudflare Pages and repeat food, exercise, profile, weight, and reload checks on the generated HTTPS origin.

## Known limitations

- Browser data is specific to the browser, device, and exact origin; changing from localhost to a Pages domain starts a separate storage area.
- Private/incognito browser storage may be removed when the session closes.
- Browser pop-up, print, and Save as PDF behavior varies by browser permissions and platform.
- Cloudflare applies `_headers` only when deployed; the Python preview server does not emulate those response headers.
- Headless Chromium interaction and real Android Chrome testing could not be completed on this Pi because the installed Chromium debugging endpoint did not start; these are explicitly listed as manual checks above.
- The current loopback static-server rerun was blocked by the command execution wrapper; no new HTTP result is claimed for that rerun.
