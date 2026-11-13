# Personal area (User Space): implementation plan

Source design: `personal-area-handover/` (local only, never committed; owner deletes it when done).
Four stages, each ends in one PR, branched from `main` after the previous PR merges.

## Decisions (from owner)

| Topic | Decision |
|---|---|
| Hosting | Netlify (`netlify.toml` copies the site into `build/`). `_redirects` / `_headers` work on Netlify too. |
| Environments | `js/config.js` picks config by `location.hostname`: `plainer.co.uk` / `www.plainer.co.uk` = Prod; everything else (Netlify PR previews, localhost) = Dev. Each env has its own Firebase web config and backend base URL. No build step, no secrets (Firebase web config is public). |
| Dev deploy | Same repo. `main` = Prod, PR deploy previews = Dev. |
| Stack | Vanilla ES modules, Firebase JS SDK from the gstatic CDN (pinned version), no framework, no bundler. |
| Data | **REST API of `plainer-trips-server`** (`api/trips/...`, `days`, `route-stops`, `notes`, `shares`, `profile`), **not Firestore**. Firebase is used for auth only; the ID token is sent as the Bearer token, as the iOS app does. HANDOFF's "same Firebase project" data layer does not apply. |
| Sign-in | Email + password only in stage 1. No Apple/Google buttons are rendered until later. |
| Verification | Sign-up sends the verification email. Unverified users are let in, with a "Verify your email" banner and a resend link. |
| Stage 1 scope | Everything: auth pages, theme system, public header, public CSS moved onto the tokens. |
| Editing model | **Changed from the design: no Save / Discard button. Every change is saved immediately**, like iOS. See stage 4. |
| Conflicts | Same as iOS: last write wins, no version check (the backend has `UpdatedAt` but no ETag / If-Match). Web adds a refetch when the tab regains focus and nothing is saving. |
| Deferred (hidden, not disabled) | Share, Export PDF, Plan with AI, Generate days with AI, Validation Review, Trip Assistant. Menu items for these are not rendered. |
| Included extra | Profile page. |
| CORS | Add to `plainer-trips-server` when stage 2 needs it (separate PR in that repo, merged before the stage 2 PR). |
| Tests | Playwright E2E against Dev, in a dev-only `package.json` that is not deployed. |

## Cross-cutting rules

- Follow `README.md` conventions: root-relative links, no inline styles, `?v=` bump on every page after any change to a shared css/js file.
- Shared files: `css/app.css` (from the handover, public styles migrated onto its tokens), `js/theme.js`, `js/config.js`, `js/firebase.js`, `js/api.js`, then `js/trips.js`, `js/trip.js`.
- Pure logic (trip status from dates, cover colour by id, list filtering, ordering helpers) lives in small modules with no DOM, so Node's built-in test runner can cover them.
- `netlify.toml` build command must exclude `tests/`, `node_modules/`, `package.json`, `package-lock.json`, `playwright.config.*`, `docs/` from `build/`.
- `robots.txt`: add `Disallow: /trips/`, `/trip/`, `/login/`, `/signup/`, `/profile/`.
- `personal-area-handover/` is never staged. It is listed in `.git/info/exclude`; use explicit paths with `git add`.
- Every PR description includes a manual QA checklist and the Dev preview URL.

## Stage 1: Foundations, auth pages, theme, public header

**Branch:** `feature/personal-area-auth`

1. **Config + Firebase:** `js/config.js` (hostname map, Dev fallback), `js/firebase.js` (init, `getUser`, `requireUser(next)`, `signOut`, auth state helper). Ask the owner for the Dev and Prod Firebase web configs and backend URLs. Enable Email/Password and add the Dev preview domains to Authorized domains.
2. **Theme system:** copy `css/app.css`; `js/theme.js` + the tiny inline head script (localStorage `plainerTheme`, fallback `prefers-color-scheme`, no flash); toggle button with the specified `aria-label`s.
3. **Migrate public site to tokens:** move the hard-coded colours in `css/site.css` to the `.pl` tokens, add the dark theme, add the toggle to every public page header (desktop and phone), update the header block in all pages together (`<!-- header:start/end -->`).
4. **Header changes:** desktop `… Support, Privacy, [toggle] [Log in] [Get the app]`; phone `toggle, person icon, hamburger`. When signed in, "Log in" becomes "My trips" (`/trips/`). Must degrade without JS (links point to `/login/`).
5. **Pages:** `/login/` (email + password, "Forgot password?" with inline confirmation, link to sign-up), `/signup/` (name, email, password with "At least 8 characters"; `createUser…` → `updateProfile` → `sendEmailVerification`). Inline errors with `aria-describedby`, plain-language messages (no raw Firebase codes), busy and disabled submit. Redirect to `next` or `/trips/` after success; redirect away if already signed in. Light and dark, desktop and phone, per the mockups; social button areas are not rendered.
6. **Verify-email banner** component (used by later stages) with resend.
7. `robots.txt`, README update (config, environments, how to run Playwright).
8. **Playwright setup:** dev-only `package.json`, `playwright.config`, a Dev test user (credentials via env, never committed), tests for login/signup validation, redirect rules, theme persistence/no flash, header state signed in/out, widths 360/390/768/1024/1440.
9. `/trips/` does not exist yet, so the post-login redirect target is a stub page, removed in stage 2 (or the PR is merged with `/trips/` showing a temporary "Coming soon").

**Done when:** acceptance items for login, sign-up, reset, verification, theme, public header, responsive widths pass on the Dev preview.

## Stage 2: Trips list (read-only), Profile page

**Prerequisite (other repo):** `plainer-trips-server` PR adding CORS for the Dev origins (Netlify previews, localhost) and Prod origins.
**Branch:** `feature/personal-area-trips`

1. **Discovery (before code):** read the trips/shares DTOs (`plainer-app/src/services/api/trips-api`, `trip-shares-api`) and controllers to confirm: how "owned vs shared with me" is returned, owner name, shared-with count, stop and day counts on the list item, and how the app derives Draft / Upcoming / Active / Past. Record the mapping at the top of `js/api.js`. If the list endpoint lacks counts, decide with the owner (extra calls vs backend change).
2. `js/api.js`: fetch wrapper, Bearer ID token (refresh on 401 once), error mapping, `{ result }` unwrapping like the app's `init-api.ts`.
3. **Auth guard:** skeleton until `onAuthStateChanged`, then redirect to `/login/?next=…`.
4. **`/trips/`:** app header (logo, My trips, Help → `/support/`, theme toggle, avatar menu with name, email, Profile, Log out), title with count, tabs My trips / Shared with me with counts, status chips, client search, Cards/List switch (remembered), cards and list per mockups, stable cover colour by trip id, phone layout (segmented tabs, scrolling chips), empty states, loading skeleton, error + retry state.
5. Card and row ⋯ menu contains only **Open** (other actions arrive in stage 4). New trip and Plan with AI are not rendered. Entire card links to `/trip/?id=…`.
6. **`/profile/`:** display name, email, log out. Delete account only if the profile endpoint supports it, otherwise deferred and noted in the PR.
7. Unit tests for status derivation, filtering, cover colour; Playwright for guard, tabs, filters, search, view memory, shared tab, phone.

**Done when:** a signed-in user with existing trips sees them correctly in both themes and at all widths; signed-out users are redirected.

## Stage 3: Trip details (view only)

**Branch:** `feature/personal-area-trip-view`

1. **Discovery:** confirm the mapping of day entries (Activity / Fact) to the backend (`notes`?), how stops relate to locations (`LocationId`, the displayed stop name), nights vs `PlannedDays`, transport enum, the validation-issues endpoint (`trip-validations`), and shared-with data.
2. `/trip/?id=`: guard, "Trip not found or you don't have access" state (also for 403/404), back link "All trips".
3. Title row (name, status badge, dates, owner, shared avatars), overview cards (Stops, Days, To review, Planning progress, "Fix N validation issues" showing the count only, no Review button), Days column grouped by stop with expandable days and entries, Route column, phone tabs (Overview / Stops / Days), `aria-expanded` on chevrons.
4. Loading skeleton, error state, theme and dark-mode contrast pass for badges, `--t3` text, focus rings.
5. **Share, Export PDF, ⋯ menu:** not rendered in this stage.
6. State held as one plain draft-free object (`trip`), rendered by small DOM functions, ready for stage 4.
7. Tests: render from fixtures (pure), Playwright against a Dev trip, shared trip opens for invitee, forbidden id shows the message.

**Done when:** every trip in Dev renders correctly and matches the mockups at all widths, both themes.

## Stage 4: Editing (autosave) and trip-level actions

**Branch:** `feature/personal-area-trip-edit` (if it grows too large, split into 4a "text, types, trip actions" and 4b "structure and drag-and-drop"; recommend deciding after the stage 3 merge).

### Autosave model (replaces Save/Discard)

- Edit in place per the design: click `.editable` → `.inline-input`; **Enter or blur commits, Esc cancels that field**. An unchanged value sends nothing.
- A commit updates the UI immediately (optimistic) and enqueues one API call. Calls are **serialized per entity** so two quick edits cannot arrive out of order; different entities may run in parallel.
- **Save area (top right) becomes a status indicator** instead of a button: `Saving…` → `✓ All changes saved` → on failure `Couldn't save · Retry`. Announced via an `aria-live` region.
- **Failure:** the field/row reverts to the last server-confirmed value, an inline message explains it, Retry re-sends. No Save/Discard, no "Unsaved changes" strip on phone; `beforeunload` warns only while requests are in flight.
- **Conflicts:** last write wins (as iOS). On tab focus with an empty queue, refetch the trip and re-render. Remote edits therefore appear on return, and concurrent edits to the same field resolve to whoever saved last. Raised with the owner; revisit if shared editing becomes common (would need If-Match on the backend).

### Work items

1. Edits: trip name, start date, stop name (check the location constraint found in stage 3 discovery), day title, entry text, entry-type cycle (Activity / Fact).
2. Structure: add stop, add day, add entry, remove stop (confirm "Remove Bergen and its 2 days?"), remove day, remove entry, duplicate day, nights −/+, transport cycle, Move up/down for stops and days, drag-and-drop for stops and days (including a day to another stop), using the reorder/batch endpoints where they exist.
3. Hover controls on desktop (`:hover`, `:focus-within`), always visible under `@media (hover: none)`; phone ⋯ bottom action sheet for stop and day rows. Not rendered: Generate days with AI, Getting-there remains.
4. Trip-level actions on the trip page ⋯ menu: Duplicate trip (`clone`), Delete trip… (owner only, confirm). Shared users see Leave trip… instead of Delete.
5. Trips page actions: ⋯ menu gains Duplicate, Delete…, Leave…, with confirmation modals; **New trip** modal (name required, optional start date) creates the trip and opens it; empty-state buttons (New trip only).
6. Status badge and "Planning progress" recompute locally after each edit.
7. Accessibility: menus/dialogs Esc, focus in/out, `role=dialog/alertdialog`, 36/44 px targets, keyboard alternative to drag.
8. Tests: pure tests for the entity queue (ordering, retry, rollback), reorder helpers; Playwright for each edit type, failure/retry (mock a failing route), keyboard reordering, shared-trip Leave, owner Delete, phone sheets.

**Done when:** the acceptance checklist in HANDOFF section 10 passes, adjusted for autosave (Save button items replaced by the status-indicator behavior).

## Open items to confirm during the stages

- Dev and Prod Firebase web configs, backend base URLs, Dev test-user credentials (stage 1).
- Whether the list endpoint returns counts and the shared-with data (stage 2 discovery).
- Whether stop names can be edited freely or are tied to a location, and the entries ↔ notes mapping (stage 3 discovery).
- Whether `/profile/` can offer delete account (stage 2).
- Apple and Google sign-in, Share, Export PDF, AI planning, Trip Assistant, Validation Review: later, outside these four stages.
