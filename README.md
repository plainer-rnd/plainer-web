# Plainer website

Static site for https://plainer.co.uk: hand-written HTML and CSS, no framework, no build step. Deployed from this repo to Netlify (`netlify.toml` copies the site into `build/`). `package.json` is dev-only test tooling and is not deployed.

- `index.html`, `support/`, `wtm/`, `policy/`, `404.html`: pages (folder-per-page for clean URLs)
- `css/site.css`: design tokens (`:root`, light and `:root[data-theme="dark"]`) plus one block per component
- `css/app.css`: styles for the signed-in area and the login/sign-up pages (same palette, `.pl` scope)
- `login/`, `signup/`, `trips/`, `profile/` (and later `trip/`): the personal area, vanilla ES modules in `js/`
- `js/config.js`: Dev/Prod config picked by hostname; `js/firebase.js`: Firebase Auth and session helpers; `js/theme.js`: theme toggle
- `js/site.js`: optional enhancement (copy email, menu close, sticky download bar). Pages work without it
- `assets/`: images (WebP + JPG at 400/800 px), icons, OG image, QR code
- `_redirects`, `_headers`: Cloudflare Pages config
- `apple-app-site-association`: universal links for the iOS app

## Develop

    python3 -m http.server 8000   # then open http://localhost:8000

`_redirects` and `_headers` only apply on Cloudflare Pages.

## Conventions

- The header and footer are copied into every page between `<!-- header:start/end -->` and `<!-- footer:start/end -->`. Update all pages together (only `aria-current="page"` differs per page).
- No inline styles. Links are root-relative.
- After changing `site.css` or `site.js`, bump the `?v=` query in every page.

## Deploy to Cloudflare Pages

### 1. Create the project (Git integration, recommended)

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Authorise GitHub and pick the `plainer-web` repository.
3. Build settings:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: *leave empty*
   - Build output directory: `/`
4. Click **Save and Deploy**. Pushes to `main` go to production; every other branch and PR gets its own preview URL (`<branch>.<project>.pages.dev`).

Alternative without Git (direct upload):

    npx wrangler pages deploy . --project-name=plainer

Run it from the repo root. It uploads everything in the folder, so make sure no local-only files (e.g. a `design-handoff/` folder) are lying around.

### 2. Custom domain

1. Project → **Custom domains → Set up a custom domain**.
2. Add `plainer.co.uk` and `www.plainer.co.uk`. If the domain's DNS is on Cloudflare the records are created for you; otherwise add the CNAME shown.
3. Redirect `www` to the apex (Bulk Redirects or a Redirect Rule: `www.plainer.co.uk/*` → `https://plainer.co.uk/${1}`, 301).

### 3. Analytics

Project → **Metrics → Web Analytics → Enable**. Cloudflare injects the beacon, so there is no snippet to add. `/wtm/` page views approximate business-card scans.

### 4. Verify before going live (and before printing the cards)

Use the preview URL first, then the real domain, on an iPhone in a private tab:

- `/wtm`, `/wtm/` and `/contact` all load (the first redirects to `/wtm/`, the last to `/support/`)
- An unknown URL such as `/nope` shows the 404 page (not the home page)
- `/apple-app-site-association` returns JSON
- Every App Store button opens the listing, and the `/wtm/` button uses `ct=wtm2026`

### Notes

- `_redirects` and `_headers` are read by Pages automatically; they do nothing when serving locally.
- After editing `css/site.css` or `js/site.js`, bump the `?v=` query on the links in every page so browsers fetch the new file (HTML itself is not cached by Pages).
- Don't add a Content-Security-Policy until Google Fonts and the Cloudflare analytics beacon are allowed in it.
- Don't add extra Cache Rules; asset file names are not content-hashed.

## Before launch

- Replace `PROVIDER_TOKEN` in every App Store link (`grep -r PROVIDER_TOKEN .`) and regenerate `assets/qr-app-store.svg` with the `ct=web_qr` link.
- Fill the `[CONFIRM STEPS …]` FAQ answers on `/support/`.
- Confirm the "no data collected" claim still holds now that the app has sign-in.

## Personal area: environments and tests

- **Dev vs Prod:** `js/config.js` picks the Firebase web config and backend URL by `location.hostname`. `plainer.co.uk` and `www.plainer.co.uk` are Prod; anything else (Netlify deploy previews, localhost) is Dev. Firebase web config values are public identifiers. Add every Dev preview domain to the Dev Firebase project's Authorized domains.
- **Theme:** every page sets `data-theme` on `<html>` from an inline script in `<head>` (localStorage `plainerTheme`, else the OS setting). Keep that script identical on all pages.
- **Signed-in hint:** `js/firebase.js` stores `localStorage.plainerSignedIn`; `js/site.js` uses it to show "My trips" in the public header without loading Firebase. Protected pages always check the real session.
- **Backend API:** `js/api.js` calls `plainer-trips-server` (`config.apiBaseUrl` + `/api/...`) with the Firebase ID token as Bearer. The server must allow the web origin through its `Cors:AllowedOrigins` setting (Netlify previews: `https://*--plainer.netlify.app`).
- **Pure logic:** `js/trips-model.js` (status, filtering, labels) mirrors the iOS app's `TripInfoModel`. Trips have no end date, so there is no "Past" status.
- **Tests:** `npm install && npx playwright install chromium`, then `npm test`. Unit tests use Node's test runner; E2E tests replace `config.js` and the Firebase CDN modules with fakes, so they need no network or credentials.
