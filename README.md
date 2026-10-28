# Plainer website

Static site for https://plainer.co.uk: hand-written HTML and CSS, no framework, no build step, no npm. Hosted on Cloudflare Pages.

- `index.html`, `support/`, `wtm/`, `policy/`, `404.html`: pages (folder-per-page for clean URLs)
- `css/site.css`: design tokens (`:root`) plus one block per component
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

## Deploy (Cloudflare Pages)

Framework preset: None. Build command: empty. Output directory: `/`.

## Before launch

- Replace `PROVIDER_TOKEN` in every App Store link (`grep -r PROVIDER_TOKEN .`) and regenerate `assets/qr-app-store.svg` with the `ct=web_qr` link.
- Fill the `[CONFIRM STEPS …]` FAQ answers on `/support/`.
- Confirm the "no data collected" claim still holds now that the app has sign-in.
