# Nutrition Tracker — Stage 1

## Purpose

This repository contains Stage 1 of the Nutrition Tracker: a static online version built with plain HTML, CSS, and JavaScript. `index.html` is the authoritative Tracker and public entry point. Tracker information is stored locally in the browser; there are no user accounts, cloud synchronization, databases, analytics, or backend services.

## Local preview

```bash
cd /home/jody/Portal/TrackerSite
python3 -m http.server 8080
```

Open `http://localhost:8080`.

To preview from another device on the same network, find the Pi's local IP address (for example with `hostname -I`), keep the preview server running, and open `http://PI_LOCAL_IP:8080` on that device. The Pi firewall and Wi-Fi network must permit local connections. This command is only for preview; the deployed site does not require Python or the Pi.

## GitHub

Repository: `Lightbody61/nutrition-tracker`

Remote: `git@github.com:Lightbody61/nutrition-tracker.git`

Branch: `main`

After reviewing and approving all changes:

```bash
git status
git add .
git commit -m "Prepare current nutrition tracker for Stage 1 hosting"
GIT_SSH_COMMAND='ssh -i /home/jody/.ssh/github_nutrition_tracker' git push origin main
```

Do not commit or push until the repository owner approves.

The existing `.github/workflows/pages.yml` workflow remains usable for GitHub Pages. It does not interfere with Cloudflare Pages, but maintaining two hosting targets can be confusing; Cloudflare Pages is the Stage 1 publishing target.

## Cloudflare Pages

1. Sign in to Cloudflare.
2. Open **Workers & Pages**.
3. Create a Pages project.
4. Connect GitHub.
5. Select `Lightbody61/nutrition-tracker`.
6. Set **Framework preset** to `None`.
7. Leave **Build command** blank.
8. Set **Build output directory** to the repository root (`.`).
9. Deploy.
10. Open the generated Pages address.
11. Test food, exercise, profile, and weight saving and reloading on the live site.

No environment variables, secrets, build process, or server process are required.

## Data warning

During Stage 1, entries are stored only in the current browser on the current device and website origin. They do not synchronize between devices and may be lost when browser storage is cleared or a private/incognito session closes. Stage 2 will replace browser-only persistence with authenticated account storage.

## Files

- `index.html`: authoritative Tracker and public website entry point.
- `nutrition-tracker.html`: synchronized convenience copy of the authoritative Tracker.
- `_headers`: conservative Cloudflare Pages response headers.
- `TESTING.md`: test environment, coverage, results, and limitations.
- `CHANGELOG.md`: Stage 1 changes only.
- `AGENTS.md`: permanent maintenance rules.

## Future stages (not implemented)

- Stage 2: authenticated user accounts and account-based data storage.
- Stage 3: additional features and ecommerce.
