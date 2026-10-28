# Plainer website

Static site for https://plainer.co.uk: hand-written HTML and CSS, no framework, no build step, no npm. Hosted on Cloudflare Pages.

- `index.html`, `support/`, `wtm/`, `policy/`, `404.html`: pages (folder-per-page for clean URLs)
- `css/site.css`: design tokens (`:root`) plus one block per component
- `js/site.js`: optional enhancement (copy email, menu close, sticky download bar). Pages work without it
- `assets/`: images (WebP + JPG: screenshots at 400/800 px, photos at 800/1600 px), icons, OG image, QR code
- `_redirects`, `_headers`: Cloudflare Pages config
- `apple-app-site-association`: universal links for the iOS app

## Develop

    python3 -m http.server 8000   # then open http://localhost:8000

`_redirects` and `_headers` only apply on Cloudflare Pages.

## Conventions

- The header and footer are copied into every page between `<!-- header:start/end -->` and `<!-- footer:start/end -->`. Update all pages together (only `aria-current="page"` differs per page). Photo credits sit in a `.site-credit` line after the footer and differ per page.
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

- Photo credit links to Wikimedia Commons: the Tower Bridge credit on `/wtm/` links to a Commons search; swap in the exact file page.
