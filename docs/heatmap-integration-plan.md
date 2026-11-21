# Activity heatmap integration plan

Status: in execution, revision 5. Pull request 1 is done. Date: 2026-11-21. Baseline commit: `436ca05` (`main`).

Revision 2 adds the audit done with the Ponytail plugin, the checks of the Strava legal texts, and the cuts that Ponytail makes in this plan (section 6.1).

Revision 3 adds the answers of the owner (2026-11-21), the proof of the cause of finding 1, the light and dark themes, the merge process and the pull request list (section 8.1).

Revision 5 (after pull request 1) sets the product name, adds the module contracts (section 7.7) and the execution guide for the next agent sessions, with subagents (section 12).

Revision 4 groups the work in 5 pull requests (owner limit), adds the totals line and the single import style, records the end-to-end baseline and changes the wallet test (section 9.1).

## 1. Summary

This plan adds an activity heatmap to `strava.alainnicolas.fr`. The heatmap reproduces the functions of `graph.rnnr.io`, a third-party application whose Strava synchronization is broken.

The work has three parts, in this order:

1. Clean the current codebase (Phase 0 and Phase 1). Two defects in production were found during the audit.
2. Build the heatmap as a new route in the current frontend (Phase 2 to Phase 5).
3. Turn the site into a hub of two tools and rebrand it (Phase 6), then harden it (Phase 7).

The heatmap adds no backend code, no database and no runtime dependency. All activity data stays in the browser.

## 2. Goal and scope

### 2.1 Goal

A connected athlete opens `/heatmap` and sees one colored cell for each day of each year. The color shows the distance or the duration of the activities of that day. The athlete can filter, change the thresholds and the colors, and export an image.

### 2.2 In scope

- Full functional parity with the reference application (see section 3.2).
- A shared Strava client and a shared authentication state for the two tools.
- A hub home page, a new product name and updated SEO files.
- A Content Security Policy.

### 2.3 Not in scope

These items are refused on purpose. Each one adds code that the goal does not need.

- Server-side storage of activities, tokens or athlete profiles.
- Refresh tokens in the browser or on the server.
- Strava webhooks and background synchronization.
- Multi-athlete support. The Strava application has an athlete capacity of 1: Strava refuses the authorization of a second athlete. The settings page offers a capacity of 10 with a Strava account upgrade. A larger capacity needs a review by Strava.
- Server-side image rendering.
- Statistics pages, charts other than the heatmap, internationalization.
- Migration to Next.js or to another framework.

## 3. Reference application analysis

Method: observation of the live application in a browser with a connected account, and static reading of its public JavaScript bundles. No code, image or brand asset of the reference application is copied. The heatmap is a new implementation from the observed behavior.

### 3.1 Architecture of the reference

| Item | Observation |
| --- | --- |
| Frontend | Vue 3, Pinia, vue-router, Tailwind, html2canvas 1.4.1. Vite build dated April 2023, version `v0.5.0`. |
| Backend | `bgraph.rnnr.io`, cookie session. Routes: `/login?code=`, `/stats`, `/api/v1/get-athlete`, `/api/v1/get-data?type=`, `/api/v1/sync`, `/api/v1/render`. |
| Data model | The server aggregates activities as `years > months > weekdays > days`. A day has `day`, `distance` (m), `duration` (s), `activities[{id, name, ext_source, ext_id}]`. A day with `distance = -1` is a padding cell. |
| Client storage | The aggregated result is kept in `localStorage` (about 3 MB). |
| Failure | `GET /api/v1/sync` returns HTTP 500. The other routes return 200. |

### 3.2 Feature parity matrix

| # | Reference feature | Behavior to reproduce | Phase |
| --- | --- | --- | --- |
| F1 | Year view | One block for each year, 12 months, 7 rows (Monday to Sunday), one cell for each day. | 4 |
| F2 | Continuous view | One grid for the last N days. N is an input, default 365. | 4 |
| F3 | `Converged` switch | On: months join in one continuous grid. Off: a gap separates the months. | 4 |
| F4 | `Labels` switch | Shows or hides the weekday labels. | 4 |
| F5 | Cell size | S, M, L (8, 12 and 16 px). | 4 |
| F6 | Sport filter | `All` plus each sport type found in the data. | 4 |
| F7 | Year range | Start year and end year selectors. | 4 |
| F8 | Threshold type | `Distance` (km) or `Duration` (minutes). | 3 |
| F9 | Thresholds | Five editable levels. Value above level `i` gives shade `i`. | 3 |
| F10 | Reset thresholds | From the mean value `m` of an activity: `floor(2.5m)`, `floor(1.5m)`, `floor(m) - 1`, `floor(m / 2)`, `0`. | 3 |
| F11 | Color palettes | 22 palettes, 5 shades each. | 4 |
| F12 | Day tooltip | Date, distance (km, 2 decimals), duration (`h m s`). For each activity: its name and a `View on Strava` link (text required by the Strava brand guidelines). A click opens it. `Escape` closes it. | 4 |
| F13 | Empty and future days | Empty day: neutral cell. Future day: neutral cell, or hidden in the export. | 4 |
| F14 | Synchronization | A `Sync` button gets new activities. A blocking overlay shows progress. | 2 |
| F15 | Image export | Options: dark mode, invisible future dates, newest year first, year range. | 5 |
| F16 | Private activities | Option at login in the reference. Here: always included, because the current scope is `activity:read_all`. | 2 |
| F17 | Persistent settings | Sport, palette, size, thresholds and threshold type stay after a reload. | 4 |

### 3.3 Defects of the reference that we do not reproduce

- The OAuth `state` parameter is the constant string `STATE`. The current `auth` function already uses a random, single-use state.
- The login asks for `profile:read_all` without need, and the server stores email, weight and city.
- Third-party scripts load without a Content Security Policy.
- The fifth threshold input is empty by default.
- The server computes the day from a date that it stores. We compute the day from `start_date_local` to prevent time zone errors.

## 4. Decisions

| # | Decision | Reason | Alternatives refused |
| --- | --- | --- | --- |
| D1 | Integrate the heatmap in this repository and this site. | Strava gives one API application for each account, with one callback domain and one athlete. Same client, same `/oauth` callback, same scope: no Strava setting changes. One repository to maintain. | Separate site on a subdomain: second Netlify site, wider callback domain, CORS list, second dependency tree. |
| D2 | No new backend code. | The Strava token exchange needs `client_secret` (the Strava documentation does not offer PKCE). The `auth` Netlify function already does this. The Strava API accepts browser calls with a bearer token, as `useActivities` does today. | Backend-for-frontend proxy with an `HttpOnly` cookie: stronger against XSS, but one more function on each API call and more code to maintain. |
| D3 | Keep Vite, React and react-router. | Already in place with tests, CI and deployment. Data is private and loaded after OAuth, so server rendering gives no benefit. | Next.js (adapter runtime on Netlify, larger CVE surface, full migration). Astro, SvelteKit, Vue (a second framework). |
| D4 | Render the heatmap as SVG, one `<rect>` for each day, with `fill` attributes set in JavaScript. | About 5,500 cells for 15 years: no virtualization needed. Export becomes a serialization of the same SVG. No `html2canvas` (about 200 kB). | DOM `div` grid (export needs a library). Canvas (tooltips and accessibility are harder). |
| D5 | Store activities in `localStorage`, one versioned key for each athlete. | Synchronous, no dependency, cross-tab update through the `storage` event. About 120 bytes for each activity: 10,000 activities use about 1.2 MB. The cache is transient (D11). | IndexedDB: asynchronous code and a wrapper for no present benefit. Add a `shortcut:` comment with the 5 MB limit and move to IndexedDB if an athlete exceeds it. |
| D6 | Keep the current token model: access token in `sessionStorage`, no refresh token, session of about 6 hours. | Simple. The long-lived token never reaches the browser. A new login is one click. | Server-side session with refresh: needs storage and rotation logic. |
| D7 | Use `sport_type`, not `type`, for the sport filter. | The API reference returns `sport_type` in each activity (checked 2026-11-21). It separates trail runs, gravel rides and others. | Keep `type`. |
| D8 | Use `moving_time` for the duration. | Nearest to the effort. The reference does not document its choice. | `elapsed_time`. |
| D9 | Follow the current folder convention (`screens`, `components`, `hooks`, `utils`). | No new structure to learn. | A `features/` folder. |
| D10 | Palettes are a constant table in TypeScript (22 names, 5 hex values each). | The export needs literal `fill` values. CSS variables do not resolve in a serialized SVG image. | CSS `color-mix()`. Tailwind as a dependency. |
| D11 | Delete the activity cache 7 days after the last full sync, and at logout. | Strava API Policy, section 6.2: no Strava data in a cache for more than 7 days. Section 2.5: delete the data when the user asks or revokes the access. | A permanent local archive. |
| D12 | The product name is "Effortprint" (owner, 2026-11-21). It does not contain the word "Strava". | Strava brand guidelines: "You must not use the Strava name in your application name". The current name, "Strava Segment Attestations", does not comply. | Keep the current name. |
| D13 | Phase 1 fixes all the findings, also those of the attestation tool only (16 to 19). | The owner wants a clean base before the feature work. | GitHub issues for later (revision 2). |
| D14 | Light and dark themes for the full site. Default from the system setting, with a switch in the header. | Owner decision. The colors are already CSS variables: 6 hardcoded values in 4 files to change. | A theme for the heatmap screen only. |
| D15 | Keep the accent color `#fc5200`. | The brand guidelines, read in full, do not forbid it. They give this color as one option for "View on Strava" links. | A new accent color (revision 2). |
| D16 | Hub at `/`, attestation flow at `/attestations`. The domain `strava.alainnicolas.fr` stays. | Owner decisions. | None. |
| D17 | The agent opens, reviews and merges the pull requests (section 8). The agent does the manual tests. | Owner decision. The repository has no branch protection and permits squash merges only. | Review and merge by the owner. |
| D18 | 5 pull requests at most (section 8.1). Each one has several commits, and is squashed at the merge. | Owner decision: 20 pull requests are too many. | 20 small pull requests (revision 3). |
| D19 | One import style in `packages/frontend`: the `@/` alias for each import outside the current folder, `./` inside it. An ESLint rule refuses `../`. | Owner decision: no two styles in the codebase. The rule keeps it true. | Two styles (revision 2). |
| D20 | A totals line under each year: activity count, distance and duration, for the current sport filter. | Owner decision. | No totals (revision 2). |

## 5. Current codebase state

### 5.1 What the repository does

A pnpm monorepo with four packages. An athlete connects Strava, selects a segment from an activity, and creates a Verax attestation on Linea.

| Package | Role | Source lines |
| --- | --- | --- |
| `packages/frontend` | React 19, Vite 8, react-router 7, CSS modules, wagmi and Reown AppKit. | 3,340 (with CSS) |
| `packages/functions` | Netlify functions: `auth` (OAuth state and token exchange), `sign` (EIP-712 signature), `oauth-state-cleanup` (scheduled). | 1,415 |
| `packages/shared` | Shared constants and types. | 124 |
| `packages/contracts` | `StravaPortal.sol`, Hardhat 3. | 216 |

Totals: 5,095 source lines and 4,393 test lines.

Expected load: one athlete (the Strava application limit), low traffic.

### 5.2 Measured baseline (2026-11-21, Node 24.22.3, pnpm 12.16.1)

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm lint` | Pass, no warning |
| `pnpm format` | Pass |
| `pnpm test` | Pass: 175 tests (functions 100, frontend 40, contracts 35) |
| Frontend coverage | Statements 74.25 %, branches 60.33 %, lines 75.69 % |
| `pnpm build` | Pass |
| Entry chunk `index` | 247.89 kB (79.31 kB gzip) |
| Chunk `wallet` | 3,134.87 kB (845.90 kB gzip) |
| Production headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`. No `Content-Security-Policy`. |
| Git | One worktree, one branch (`main`), no stale remote branch. One stash dated 2026-10-17 (see 5.5). |

End-to-end tests, run on `436ca05` (revision 4): 8 passed of 8 (4 tests, at desktop and mobile width). Lint, format and the 175 unit tests pass on `436ca05` too.

### 5.3 Audit findings

Method: the `ponytail-audit` skill, plugin version 5.3.3 (map the flows, then look for bugs, risks, scale problems, missing tests, slow paths and code to remove).

- First pass: the plugin was disabled, so the procedure was applied by hand.
- Second pass (revision 2): the skill was run with the plugin enabled. The files not read in the first pass were read: `sign.ts`, `http.ts`, `SegmentsModalImpl.tsx`, `Modal.tsx`, `errors.ts`, the wallet components, the cleanup job, the local function server and `StravaPortal.sol`.
- Result: 13 findings confirmed. Findings 8 and 13 withdrawn. Findings 16 to 20 added. The numbers of the first pass are kept.

#### Must fix

1. **The wallet code loads on every page** (`packages/frontend/vite.config.ts`)
   - What this is: the build puts wagmi, viem, Reown and related libraries in one `wallet` chunk, meant to load only when the athlete connects a wallet.
   - Problem: the built entry file imports three symbols from that chunk, and `dist/index.html` preloads it. Each visitor downloads 846 kB (gzip) before the first render. Cause, proved by a test build on 2026-11-21: the manual `wallet` chunk group in `vite.config.ts`, added with the Vite 8 migration (`944cc14`). The group also takes shared modules such as the JSX runtime, so the entry depends on it. Without the group, `index.html` preloads 13 kB of shared code and the wallet code loads on demand.
   - Fix: delete the `rolldownOptions` block (12 lines). Add a test on the build output: no file that `index.html` preloads is larger than 50 kB.
   - If we skip it: the heatmap page pays the same cost, and the site stays slow on mobile networks.

2. **A helper file is deployed as a public function** (`packages/functions/src/rateLimiter.ts`)
   - What this is: Netlify deploys each file at the top level of `packages/functions/src` as a function.
   - Problem: `rateLimiter.ts` has no handler. `https://strava.alainnicolas.fr/.netlify/functions/rateLimiter` returns HTTP 502. An unknown name returns 404, so the endpoint exists.
   - Fix: move the file to `packages/functions/src/lib/` and update two imports. Add a test that lists the top-level files and requires a default export in each one.
   - If we skip it: a public endpoint with no purpose stays online and produces errors in the function logs.

#### Should fix

3. **No Content Security Policy** (`netlify.toml`)
   - What this is: the Strava access token (scope `activity:read_all`, about 6 hours) is in `sessionStorage`.
   - Problem: one injected script, or one compromised dependency, can read the token. No header limits where scripts come from or where data goes.
   - Fix: Phase 7. Start in report-only mode because the wallet SDK needs several hosts.
   - If we skip it: the token model of decision D6 has no second barrier.

4. **The authentication state is not shared** (`packages/frontend/src/hooks/useStravaAuth.ts`, `screens/About`, `screens/NotFound`, `screens/StravaCallback`)
   - What this is: each screen that calls `useStravaAuth` gets its own copy of the state. Three screens pass `isStravaConnected={false}` to the header as a constant.
   - Problem: a connected athlete who opens `/about` sees a header with no name and no logout button.
   - Fix: one provider at the top of the tree. All screens read the same state.
   - If we skip it: each new tool page repeats the error.

5. **The header and the footer are repeated in each screen** (four screens)
   - What this is: `Home`, `About`, `NotFound` and `StravaCallback` each render `<Header>` and `<Footer>`.
   - Problem: a new route must copy them, with the props of finding 4.
   - Fix: one layout route with `<Outlet />`.
   - If we skip it: more copies with each new page.

6. **The Strava HTTP logic is locked in one hook** (`packages/frontend/src/hooks/useActivities.ts`, 380 lines)
   - What this is: the hook does pagination, token checks, HTTP error mapping, `Retry-After` parsing, retry timers and segment loading.
   - Problem: the heatmap needs the same HTTP rules (401, 403, 429) but cannot reuse them.
   - Fix: extract the request and error mapping to `utils/strava.ts`. The hook keeps its state logic. The existing tests must pass without change.
   - If we skip it: the same rule lives in two places and changes in one only.

7. **A test file tests the platform, not the application** (`packages/frontend/src/App.test.tsx`, 148 lines)
   - What this is: tests named "Frontend Core Logic".
   - Problem: they call `sessionStorage` and viem directly, and they test a copy of `getExplorerUrl` written in the test file. A defect in the application code cannot make them fail.
   - Fix: delete the file. Export `getExplorerUrl` and keep one real test if the function stays.
   - If we skip it: the test count and the coverage give false confidence.

8. **Withdrawn.** The first pass got a pnpm version error (`ERR_PNPM_BAD_PM_VERSION`) once, with `corepack pnpm test`. The second pass did not reproduce it: `pnpm test` and a nested `corepack pnpm -r` pass with pnpm 12.16.1. No action.

9. **The product name is written in ten files**
   - What this is: `index.html`, `404.html`, `llms.txt`, `README.md`, four screens, `Header.tsx`, `Web3Provider.tsx`. The title, the description and the JSON-LD block exist in `index.html` and again in `Home.tsx`.
   - Problem: the rebrand must change each copy, and the two copies of the metadata must stay the same.
   - Fix: one `BRAND` constant for the TypeScript files. The three static files are changed by hand and listed in the rebrand checklist.
   - If we skip it: the old name stays in some places after the rebrand.

10. **The login always returns to `/`** (`screens/StravaCallback/StravaCallback.tsx`)
    - What this is: after the token exchange, the callback calls `navigate('/')`.
    - Problem: an athlete who starts the login from `/heatmap` lands on another page.
    - Fix: save the start path in `sessionStorage` with the state. Accept only a path that starts with one `/` and is a known route.
    - If we skip it: one more click after each login, every 6 hours.

#### Nice to have

11. **Dead code.** `trackEvent` in `useInsights.ts` has no caller. `AuthState.refreshToken`, `STORAGE_KEYS.REFRESH_TOKEN` and the calls that remove it are remains of an old model. `refreshTokenIfNeeded` does not refresh: rename it to `getValidToken`.
12. **Pass-through files.** `frontend/src/types/index.ts`, `functions/lib/constants.ts` and `functions/lib/types.ts` only re-export the shared package. Import from the shared package directly.
13. **Two import styles** (the `@/` alias and relative paths). Withdrawn in revision 2, opened again in revision 4 by the owner. Fix: decision D19, with an ESLint rule.
14. **The allowed origin list exists twice** (`functions/lib/env.ts` and `functions/src/auth.ts`). Keep one exported list.
15. **Header gaps.** `Strict-Transport-Security` has no `includeSubDomains`. There is no `Permissions-Policy`. Add both in Phase 7.
16. **The modal does not manage keyboard focus** (`components/Modal/Modal.tsx`). When it opens, focus stays on the button behind the overlay, and the Tab key reaches the page behind. Fix: set `inert` on `#root` while the modal is open, move focus to the dialog, and give focus back at close. The native `<dialog>` element is not an option without a test stub: jsdom 29 has no `showModal`. Attestation tool only.
17. **The attestation fee is a constant in the frontend** (`shared/src/constants.ts`, `StravaPortal.sol`). The contract owner can change `fee` with `setFee`. If the fee goes up, each attestation reverts with `InsufficientFee` until a new frontend release. Fix: read `fee` from the contract. Attestation tool only.
18. **The wallet error table is almost never used** (`utils/errors.ts`, 94 lines). The errors from wagmi are `Error` objects, so the function returns the raw message before it reads the code table. A contract revert shows a long technical message. Fix: use the `shortMessage` of viem and keep the user rejection check. About 50 lines less. Attestation tool only.
19. **The signer builds a network client that it does not use** (`functions/src/sign.ts`). `createWalletClient` with an HTTP transport is created to sign typed data, which is a local operation. Fix: call `signTypedData` on the account. About 10 lines less. Attestation tool only.
20. **The OAuth callback effect is not safe to run twice** (`screens/StravaCallback/StravaCallback.tsx`). In development, React StrictMode runs the effect twice. The second run finds no saved state and shows "Sign-in failed" until the first run completes. Production is not affected. Found by code reading, not run. Fix it in part 1c.

21. **The segments modal crashes when the wallet is not configured** (`components/SegmentsModal`). Found in the manual test of pull request 1. Without `VITE_WALLETCONNECT_PROJECT_ID` and `VITE_INFURA_API_KEY` there is no wagmi provider, and the wagmi hooks of the modal threw: blank page. Production is configured. Fixed in pull request 1 with a notice and a test.

#### Decisions to keep (not findings)

- The deadline logic and the single-use state in `auth.ts`. It is long, but it is security code with 493 lines of tests.
- The process-local rate limiter. Its comment states the limit.
- The explicit route list in `netlify.toml`. It gives a real 404 status for unknown paths.

#### Summary

- Verdict: healthy and well tested. Fix findings 1 and 2 first.
- Lean: about 290 lines can go (findings 5, 7, 11, 12, 18, 19). No dependency to remove.
- Read with no finding: `StravaPortal.sol`, `http.ts`, the cleanup job, the local function server.
- Not checked: the CSS files, `Activities.tsx`, `verify-netlify-preview.ts`, the Hardhat scripts and the contract tests, the end-to-end tests (not run), the Netlify environment variables.

### 5.4 Constraints from Strava

| Constraint | Value | Effect |
| --- | --- | --- |
| API application | One for each account. Client ID shared by the two tools. | Decision D1. |
| Athlete capacity | 1 ("single player mode"). | The site works for its owner only. This is already true today. Secondary sources (2026) give this ladder: 10 athletes by self-service in the API settings, up to 9,999 after a Developer Program review (form with screenshots, no time limit, approval not guaranteed), with an application near its capacity. Reported rejection causes: no deauthorization webhook, inefficient API use. A public launch is not in scope: the owner decides after pull request 5. |
| Read rate limit | 100 requests each 15 minutes, 1,000 each day, shared by the two tools. | A full sync uses one request for each 200 activities, plus one. 4,000 activities use 21 requests. |
| Scope | `read,activity:read_all` (current). | Sufficient. No new authorization. |
| Callback | `/oauth` on the current domain. `localhost` is always permitted. | No Strava setting changes. |
| Logout | Do not call `POST /oauth/deauthorize`. | It revokes the access of the two tools. |
| Data cache | API Policy 6.2 (effective 2026-06-01): no Strava data in a cache for more than 7 days. A resource that Strava no longer returns must leave the cache immediately. | Decision D11. A full sync replaces the cache, so deleted activities leave it. |
| Data deletion | API Policy 2.5: delete the data of a user on request, or when the user revokes the access. | Logout deletes the cache. The About page says how to delete the data. |
| Display | API Agreement: the data of a user is shown to that user only. | No public page shows activity data. The athlete exports and shares an image by their own action. |
| Name | Brand guidelines: no "Strava" in the application name. No suggestion of an official application. | Decision D12. The current name does not comply. |
| Links | Brand guidelines: a link to Strava data uses the text "View on Strava". | Feature F12. |
| Look | API Policy: an application must not imitate the look or the brand identity of Strava. | The name changes (D12). The accent color stays (D15). |
| Logos | Brand guidelines: no part of a Strava logo in the application icon. Strava logos stay separate from the product name and are not more prominent. | Check the favicon and the header at the rebrand. |

The brand guidelines were read in full. The API Policy and the API Agreement were searched by keyword only. Phase 0 has a task for the full reading.

### 5.5 Housekeeping

- `main` was fast-forwarded to `436ca05`. The merged branch `fix/dependabot-glob-minimatch` was deleted. No stale worktree existed.
- `stash@{0}` (2026-10-17, base `d01313c`, 21 files) was dropped on 2026-11-21 with the agreement of the owner. It was an old draft of the security work that is on `main`.

## 6. Use of Ponytail

Ponytail is an agent skill: write the smallest change that fully solves the task, and never cut validation, error handling, security or accessibility.

Status: the plugin `ponytail@ponytail` (version 5.3.3) was enabled on 2026-11-21. Its skills are available in the agent sessions.

| When | Command | Output |
| --- | --- | --- |
| Before (Phase 0) | `/ponytail-audit` on the full repository | Done in revision 2. The result is section 5.3. |
| During (each session) | `/ponytail full` active | Each change follows the ladder: needed, already in the codebase, platform, installed dependency, one line, minimum code. |
| During (each pull request) | `/ponytail-review branch` before the push | Findings fixed or answered in the pull request. |
| During (each deliberate limit) | A `shortcut: <limit>, <when to upgrade>` comment | Traceable debt. |
| After (Phase 8) | `/ponytail-audit`, then `/ponytail-debt` | A second report and a ledger of the shortcuts. Compare lines, bundle sizes and coverage with section 5.2. |

### 6.1 Effect of Ponytail on this plan

The first rule of Ponytail is: do not build what nobody asked for. Applied to revision 1 of this plan:

| Item | Change | Reason |
| --- | --- | --- |
| SVG download button | Removed, then restored in revision 3 | Owner request. The PNG export was never removed. |
| Totals line under each year | Removed, then added in revision 4 (D20) | Owner request. |
| Coverage target for the new files | Removed | One test for each risky function, not a percentage. |
| Test that reads `netlify.toml` for the headers | Removed, then restored in revision 3 | It guards a security control with about 10 lines. |
| One import style (finding 13) | Removed, then restored in revision 4 (D19) | Owner request. |
| Findings 16 to 19 | Deferred, then moved to Phase 1 in revision 3 (D13) | The owner wants a clean base. |
| Return path validation, sync error handling, keyboard access, Content Security Policy | Kept | Ponytail does not cut validation, error handling, accessibility or security. |

## 7. Target design

### 7.1 Routes

| Path | Screen | Index |
| --- | --- | --- |
| `/` | Hub: two tool cards, one Strava login button. | Yes |
| `/heatmap` | Heatmap tool. Asks for login if not connected. | Yes |
| `/attestations` | Current segment attestation flow (moved from `/`). | Yes |
| `/about` | About page, updated for the two tools. | Yes |
| `/oauth` | Callback. | No |

Each new path needs two entries in `netlify.toml` (with and without the last slash) and one entry in `sitemap.xml`.

### 7.2 Files

All paths are in `packages/frontend/src`.

| File | Content | New or changed |
| --- | --- | --- |
| `utils/strava.ts` | `stravaFetch(path, token, signal)`, typed errors for 401, 403, 429 and other status codes, `parseRetryAfter` (moved). | New (extracted) |
| `hooks/useStravaAuth.ts` | Becomes a provider and a hook on one shared state. `getValidToken` replaces `refreshTokenIfNeeded`. | Changed |
| `components/Layout/Layout.tsx` | Header, `<Outlet />`, footer. | New |
| `utils/heatmap.ts` | Pure functions: day key, aggregation, sport list, threshold level, reset values, year layout, continuous layout. | New |
| `utils/heatmapPalettes.ts` | Palette table. | New |
| `utils/activityStore.ts` | Read, write and clear the cache and the settings in `localStorage`. | New |
| `hooks/useHeatmapSync.ts` | Full and incremental sync, progress, abort, rate limit state. | New |
| `components/Heatmap/HeatmapGrid.tsx` | SVG grid for the year view and the continuous view. | New |
| `components/Heatmap/HeatmapControls.tsx` | Filters, thresholds, palettes, sizes, switches. | New |
| `components/Heatmap/DayTooltip.tsx` | Day detail. | New |
| `utils/heatmapExport.ts` | SVG to PNG, and SVG download. | New |
| `index.css`, `components/ThemeSwitch/ThemeSwitch.tsx` | Light and dark values for the CSS variables, and the switch. | Changed, new |
| `screens/Heatmap/Heatmap.tsx` | The screen. Lazy route. | New |
| `screens/Hub/Hub.tsx` | The new home. | New |

### 7.3 Data model

```ts
interface StoredActivity {
  id: number;
  name: string;
  sportType: string;
  startLocal: string; // start_date_local, for example 2026-06-14T07:31:02Z
  distance: number; // meters
  movingTime: number; // seconds
}

interface ActivityCache {
  version: 1;
  athleteId: number;
  syncedAt: number; // epoch milliseconds of the last full sync
  activities: StoredActivity[];
}
```

Rules:

- The day key is the first 10 characters of `startLocal`. Do not parse it with `new Date()`, which applies the browser time zone.
- The aggregation (`Map<dayKey, { distance, duration, activities }>`) is computed in memory from the cache and the sport filter. It is not stored.
- The cache key includes the athlete ID. Logout removes the cache and the token. Settings stay.
- At load, a cache with `syncedAt` older than 7 days is deleted before use (D11).

### 7.4 Synchronization

1. No cache, or cache older than 7 days, or the athlete selects `Full sync`: request pages of 200 activities in sequence until a page is empty. This rule stays correct if Strava returns fewer items than the page size. Replace the cache.
2. Else: request with `after` set to the newest start date minus 7 days. Merge by `id`. The 7-day overlap gets late uploads.
3. Edits and deletions made on Strava appear at the next full sync, 7 days later at most.
4. Status 429: stop, keep the pages already received, show the time of the next attempt. Use `Retry-After` when present, else the next quarter of the hour.
5. Status 401 or 403: keep the cache, show the data, ask for a new login.
6. Requests are sequential. An `AbortController` stops them on logout and on unmount.
7. The overlay shows the number of activities received.

### 7.5 Rendering and accessibility

- One `<svg>` for each year in the year view, one for the continuous view. Width from the cell size and the week count.
- Empty cells use the surface color of the current theme. The palettes are checked against the light and the dark background.
- The grid has `role="grid"` semantics with one tab stop. Arrow keys move between days. `Enter` opens the tooltip. `Escape` closes it.
- Each cell has an accessible name: date, distance, duration.
- Under each year, one line of text gives the totals for the current sport filter: activity count, distance, duration (D20). The export includes it.
- The controls are native elements: `select`, `input type="number"`, `button`, `input type="checkbox"`.

### 7.6 Export

- Clone the SVG, apply the options (background, hidden future days, year order, year range), serialize it, draw it on a canvas at 2x, and download a PNG.
- A second button downloads the SVG file (vector format, for print or zoom).
- Text uses a system font stack, so the export needs no font file.
- The export shows no activity name. The image contains dates and colors only.

### 7.7 Module contracts

These signatures are fixed before the work starts, so that subagents can build the modules in parallel (section 12). A change to a contract goes through the lead agent.

```ts
// utils/heatmap.ts (pure, no React, no storage, no Date.now(): `today` is a parameter)
export type Metric = 'distance' | 'duration';
export interface DayTotal {
  distance: number; // meters
  duration: number; // seconds
  activities: StoredActivity[];
}
export type DayMap = Map<string, DayTotal>; // key: YYYY-MM-DD
export function dayKey(startLocal: string): string;
export function aggregateByDay(activities: StoredActivity[], sport: string | null): DayMap;
export function listSports(activities: StoredActivity[]): string[]; // most frequent first
export function listYears(days: DayMap): number[]; // ascending
// Thresholds are 5 numbers in descending order, in km or in minutes (F9).
// Returns 0 for a day with no activity, else 1 (lightest) to 5 (darkest).
export function shadeLevel(day: DayTotal | undefined, metric: Metric, thresholds: number[]): number;
export function resetThresholds(activities: StoredActivity[], metric: Metric): number[]; // F10
export interface Cell {
  key: string; // YYYY-MM-DD
  column: number;
  row: number; // 0 = Monday
  future: boolean;
}
export interface Layout {
  cells: Cell[];
  columns: number;
  monthLabels: { column: number; month: number }[]; // month: 0 to 11
}
export function yearLayout(year: number, today: string, converged: boolean): Layout; // F1, F3
export function continuousLayout(dayCount: number, today: string): Layout; // F2
export function yearTotals(days: DayMap, year: number): { count: number; distance: number; duration: number }; // D20

// utils/heatmapPalettes.ts
export const PALETTES: Record<string, readonly [string, string, string, string, string]>; // 22 names, lightest first
export const DEFAULT_PALETTE: string;

// utils/activityStore.ts (localStorage only)
export function readCache(athleteId: number, now?: number): ActivityCache | null; // null: none, wrong version, or older than 7 days (then deleted)
export function writeCache(cache: ActivityCache): boolean; // false on a quota error
export function clearCache(athleteId: number): void;
export interface HeatmapSettings {
  sport: string | null;
  palette: string;
  size: 'S' | 'M' | 'L';
  metric: Metric;
  thresholds: { distance: number[]; duration: number[] };
  converged: boolean;
  labels: boolean;
}
export function readSettings(): HeatmapSettings; // defaults when absent or invalid
export function writeSettings(settings: HeatmapSettings): void;

// hooks/useHeatmapSync.ts (uses stravaGet and StravaHttpError of utils/strava.ts)
export interface HeatmapSync {
  activities: StoredActivity[];
  syncedAt: number | null;
  status: 'idle' | 'syncing' | 'rate-limited' | 'auth-error' | 'error';
  received: number; // activities received in the current sync
  retryAt: number | null; // epoch milliseconds, when rate-limited
  sync: (mode: 'full' | 'incremental') => Promise<void>;
}
export function useHeatmapSync(athleteId: number | undefined, getValidToken: () => Promise<string | null>): HeatmapSync;

// utils/heatmapExport.ts (works on the <svg> elements that HeatmapGrid renders)
export interface ExportOptions {
  dark: boolean;
  hideFuture: boolean;
  newestFirst: boolean;
  fromYear: number;
  toYear: number;
}
export function buildExportSvg(years: SVGSVGElement[], options: ExportOptions): string; // one serialized SVG document
export function downloadSvg(svg: string, fileName: string): void;
export function downloadPng(svg: string, fileName: string): Promise<void>; // canvas at 2x
```

Contract between `HeatmapGrid` and the export: each year is one `<svg data-year="2026">`. Each day is one `<rect data-day="YYYY-MM-DD" fill="#rrggbb">`, with `data-future` on a future day. All colors are literal `fill` attributes (D4, D10). The totals line is a `<text>` element inside the same `<svg>`.

## 8. Phases

The phases are work packages. They ship in 5 pull requests (section 8.1, D18). The agent opens, reviews and merges them (D17).

Process for each pull request:

1. Branch from an up-to-date `main`. Conventional Commits, signed commits, no tool attribution.
2. Local checks: lint, format, tests, build, end-to-end tests.
3. Open the pull request: short description, assigned to `alainncls`, ready for review.
4. Challenge review: `/ponytail-review branch`, then `/code-review`. Fix each finding, or answer it in the pull request. The agent does the manual tests in a browser: the owner is asked only for a secret or for a decision.
5. Wait for CI and the Netlify checks (`Validate`, header rules, redirect rules, deploy preview). All must be green.
6. Open the deploy preview in a browser: routes, console, the changed behavior.
7. Squash merge. The branch is deleted.
8. A merge to `main` deploys production. Check production after the deployment, then start the next pull request.

Limits of the checks:

- A deploy preview cannot do the Strava login. The callback domain and the allowed origins accept production and `localhost` only. Checks with the real account run on `localhost` before the merge, then on production.
- The attestation flow needs a wallet. Section 9.1 gives the tests that replace a manual check.

### Phase 0: preparation

| Task | Done when |
| --- | --- |
| Enable Ponytail and run `/ponytail-audit`. | Done (revision 2). |
| Confirm `sport_type`, the cache clause and the brand rules. | Done (revision 2, section 5.4). |
| Read the full Strava API Policy, API Agreement and brand guidelines. | Each obligation that applies is a row of section 5.4. |
| Answer the questions of section 10. | All closed except Q1 (the name, needed for pull request 4 only). |
| Drop `stash@{0}` after the owner confirms (Q8). | Done (revision 4). |
| Local environment (owner, only if the files do not exist yet). `packages/functions/.env`: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `FRONTEND_URL=http://localhost:5174`, `SIGNER_PRIVATE_KEY`. `packages/frontend/.env.local`: the keys of `.env.example`. Checked on 2026-11-21: `packages/functions/.env` does not exist, and the frontend file has no wallet values. The agent does not read these files. | `pnpm dev` completes a Strava login on `localhost`. |
| Run the end-to-end tests once. | Done (revision 4): 8 passed of 8. |
| Commit this plan in pull request 1. | The plan is on `main`. |

### Phase 1: technical cleanup

No user-visible change, except findings 4, 16 and 17. The existing tests are the safety net and must pass after each part. All the parts ship in pull request 1.

| Part | Content | Findings | Done when |
| --- | --- | --- | --- |
| 1a `fix(functions)` | Move `rateLimiter.ts` to `src/lib/`. Add the top-level file test. | 2, 14 | After deployment, `/.netlify/functions/rateLimiter` returns 404. |
| 1b `perf(frontend)` | Delete the manual chunk group in `vite.config.ts`. Add the build output test and the wallet tests (section 9.1). | 1 | No file preloaded by `dist/index.html` is larger than 50 kB. The wallet tests pass. |
| 1c `refactor(frontend)` | Layout route, shared authentication provider, `getValidToken`. | 4, 5, 11, 20 | `/about` shows the athlete name when connected. |
| 1d `refactor(frontend)` | Extract `utils/strava.ts` from `useActivities`. | 6 | `useActivities.test.tsx` passes without change to its assertions. |
| 1e `chore(frontend)` | Delete `App.test.tsx`, `trackEvent`, the refresh token remains and the pass-through files. `BRAND` constant with the current name. | 7, 9, 11, 12 | Lint, tests and build pass. The line count goes down. |
| 1f `fix(frontend)` | Modal: `inert` on the page behind, focus moved in, focus given back. | 16 | A keyboard test: Tab stays in the modal, and focus returns to the button at close. |
| 1g `fix(frontend)` | Read the attestation fee from the contract. | 17 | The displayed fee and the transaction value come from `fee()`. The wallet tests pass. |
| 1h `refactor` | Remove the wallet error table and the network client of the signer. | 18, 19 | Tests pass. About 60 lines less. |
| 1i `style` | One import style and its ESLint rule (D19). | 13 | `pnpm lint` fails on a `../` import in `packages/frontend`. |

### Phase 2: activity data

| Task | Done when |
| --- | --- |
| `utils/activityStore.ts` with version and athlete key. | Unit tests: round trip, wrong version ignored, cache older than 7 days deleted, quota error handled, clear on logout. |
| `hooks/useHeatmapSync.ts` as in section 7.4. | Unit tests with a mocked `fetch`: full sync on several pages, incremental merge, 429 with resume, 401 with cache kept, abort. |
| Request count check. | A test proves that N activities use `ceil(N / 200) + 1` requests. |

### Phase 3: heatmap logic

Pure functions in `utils/heatmap.ts`, with unit tests written first.

| Function | Cases to test |
| --- | --- |
| Day key and aggregation | Two activities on one day. An activity at 23:59 local time. Sport filter. Activity with distance 0 and a duration. |
| Threshold level | Each boundary value. Distance and duration. Zero value. |
| Reset values | The formula of F10. No activity (no division by zero). |
| Year layout | Leap year. A year that starts on a Monday and one that starts on a Sunday. Converged and separated months. |
| Continuous layout | N = 1, N = 365, a range across two years. |
| Future days | A day after today is marked as future. The test injects the current date. |

### Phase 3b: light and dark themes

| Task | Done when |
| --- | --- |
| Give each color variable of `index.css` a light and a dark value with the CSS `light-dark()` function. `color-scheme: light dark` follows the system setting. | The site is readable in the two themes. Text and controls meet the WCAG AA contrast. |
| Replace the 6 hardcoded colors (4 CSS modules) and the footer icon filter with variables. | No hex color outside `index.css` and the palette table. |
| Theme switch in the header: system, light, dark. The choice is saved in `localStorage` and applied by a small script file loaded before the first paint (a file, not inline code, for the policy of Phase 7). | No flash of the wrong theme at load. |
| The wallet modal follows the theme. | `themeMode` is not a constant. |
| End-to-end test in the two themes. | The test checks the computed background and text colors of the hub and of the heatmap. |

### Phase 4: heatmap screen

| Task | Done when |
| --- | --- |
| Route `/heatmap`, lazy, with the two `netlify.toml` entries. | A direct load of `/heatmap` and of `/heatmap/` returns 200 in the preview deployment. |
| `HeatmapGrid`, `HeatmapControls`, `DayTooltip`. | Features F1 to F13 and F17 pass a manual check against the reference with the same account. |
| Not connected state, with the return path of finding 10. Moved here from Phase 1: today the login button exists on `/` only, so the return path has no use before this screen. | The page shows the login button and returns to `/heatmap` after login. |
| Accessibility. | Keyboard path works with no pointer. An automated accessibility check in the end-to-end test reports no violation. |
| End-to-end test with mocked Strava responses. | The test loads the page, syncs, filters by sport, opens a tooltip, at desktop and mobile width. |
| Bundle check. | The heatmap chunk does not import the wallet chunk. |

### Phase 5: export

| Task | Done when |
| --- | --- |
| `utils/heatmapExport.ts` and the export panel. | Feature F15 works. The PNG opens in an image viewer and matches the screen. The SVG file opens in a browser. |
| Unit test on the SVG transform (options applied to the clone). | The four options are covered. |

### Phase 6: hub and rebrand

| Task | Done when |
| --- | --- |
| Apply the product name (Q1). | The name has no "Strava". The favicon has no part of a Strava logo. |
| Show the wallet button on `/attestations` only. | The hub and the heatmap have no wallet button. |
| Add a privacy section to the About page: data read, local cache of 7 days, how to delete (logout, or revoke the access in the Strava settings). | The section is online. |
| Move the attestation flow to `/attestations`. Add the hub at `/`. | The two tools open from the hub. Old links to `/` still give a useful page. |
| Update `BRAND`, `index.html` (title, description, Open Graph, JSON-LD, static fallback), `404.html`, `llms.txt`, `sitemap.xml`, the About page, the wallet metadata, the README. | A search for the old name returns only the attestation tool pages, where it stays as the tool name. |
| Update the tests that check titles and routes. | Unit, integration and end-to-end tests pass. |
| Run the `seo-audit` skill of the repository on the preview deployment. | No new critical item against `SEO_AUDIT_REPORT.md`. |

### Phase 7: hardening

| Task | Done when |
| --- | --- |
| Write the `Content-Security-Policy` in `netlify.toml`. List the hosts that the wallet SDK, Infura, Strava and the analytics script use. The Vite development and preview servers send the same header, so the local use and the end-to-end tests run under the policy. | A full manual pass of the two tools on `localhost` and on the deploy preview, with no blocked request that the tools need. |
| Enforce the policy in the same pull request (D18 leaves no separate report-only release). | The two tools work in production. The header is present on `/`. A violation found in production is fixed, or the header is reverted, in the same day. |
| Add `Permissions-Policy` and `includeSubDomains`. | Headers present in production. |
| Test on the headers. | A test reads `netlify.toml` and fails if a security header is removed. |

### Phase 8: closure

| Task | Done when |
| --- | --- |
| `/ponytail-audit` and `/ponytail-debt`. | No "must fix" item. The shortcut ledger is in the repository. |
| Compare with the baseline of section 5.2. | A table with tests, coverage, entry chunk size and source lines, before and after. |
| Use the tool with the real account: full sync, incremental sync on the next day, export. | The newest activity on Strava is in the heatmap. |
| Check the production headers with `curl`. | The four security headers and the policy are present. |
| Update the README (structure, routes, environment). | A new reader can run the two tools locally. |

### 8.1 Pull request list

5 pull requests (D18). The heatmap is usable in production after pull request 3.

| # | Phases | Title | Content |
| --- | --- | --- | --- |
| 1 | 0, 1 | `refactor: clean the codebase before the heatmap work` | This plan. All the findings of section 5.3 except 3, 10 and 15. The wallet tests of section 9.1. |
| 2 | 3b | `feat(frontend): add light and dark themes` | Theme variables, the switch, the wallet modal theme. |
| 3 | 2, 3, 4, 5 | `feat(heatmap): add the activity heatmap` | Cache, synchronization, logic, screen, controls, totals line, PNG and SVG export, route. |
| 4 | 6 | `feat: add the hub and rename the product` | Hub at `/`, attestation flow at `/attestations`, new name, SEO files, privacy section. |
| 5 | 7, 8 | `feat(security): add a content security policy` | Findings 3 and 15, the header test, the README, the final audit and the shortcut ledger. |

Cost of this grouping: pull requests 1 and 3 are large. Each one keeps several commits until the squash, so the challenge review reads the parts one at a time.

## 9. Test strategy

| Level | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest | `utils/heatmap.ts` (table-driven), `activityStore`, export transform, `utils/strava.ts`. |
| Hook | Vitest and Testing Library | `useHeatmapSync` with a mocked `fetch` and fake timers. |
| Integration | Vitest and Testing Library | Routes, shared authentication, return path. |
| End-to-end | Playwright on the production build | Heatmap with mocked Strava responses, direct route loads, mobile width, accessibility check. |
| Build | Vitest on `dist` | No wallet import in the entry and heatmap chunks. Each top-level function file has a handler. |
| Manual | Real account | Parity with the reference, real sync, real export. |

No coverage target. Each function with a branch, a parser or a date rule has one test that fails when the function breaks.

### 9.1 Wallet tests

The attestation flow has no automated test with a wallet today. Pull request 1 changes the wallet code path (findings 1, 17, 18, 19), so it must prove the flow.

Fact (measured 2026-11-21): the 20 accounts of the standard Hardhat and Foundry test mnemonic hold 21,349,050,994 wei in total on Linea Sepolia (0.00000002 ETH). They cannot pay a transaction. A faucet needs a CAPTCHA, which the agent does not solve.

The proof has three parts, with no funds and no secret of the owner:

1. End-to-end test in CI (`e2e/wallet.spec.ts`, done in pull request 1): Playwright injects a test wallet provider (EIP-1193, announced with EIP-6963). The test mocks each remote host: Strava, the `sign` function, the RPC node and the wallet SDK services. It connects the wallet through the wallet modal, reads a fee of 0.01 ETH from the mocked contract, attests one segment and expects "Attestation confirmed". It checks the destination and the value of the transaction. It also fails if the page loads more than 400 kB of scripts before the athlete asks for a wallet (finding 1: 290 kB after the fix, 2.9 MB with the wallet code).
2. Read-only calls to the two deployed portals (done 2026-11-21): `fee()` returns 100,000,000,000,000 wei on Linea and on Linea Sepolia, equal to the constant that pull request 1 removes.
3. The 35 contract tests and the signature tests of the `sign` function, which pull request 1 does not weaken: the signer test still verifies the typed data signature.

Not done: a real transaction. A local fork of Linea Sepolia was considered. It needs a Strava access token on the server side of the `sign` function, and the agent does not handle the token of the owner. Pull request 1 does not change the data that the contract receives, except the fee value.

The end-to-end build uses `vite build --mode e2e` with public placeholder values (`packages/frontend/.env.e2e`), so the wallet is configured in CI and no local `.env.local` value reaches the tests.

## 10. Risks and open questions

| # | Item | Type | Action |
| --- | --- | --- | --- |
| R1 | The fix for finding 1 breaks the wallet flow. | Risk | The wallet tests of section 9.1. |
| R2 | The shared rate limit stops a first full sync for an athlete with many activities. | Risk | Sequential requests, resume after 429, progress kept. 100 requests cover about 19,800 activities. |
| R3 | The Content Security Policy blocks a wallet. | Risk | The local servers and the end-to-end tests run under the policy before the merge. Revert the header if production shows a violation. |
| R4 | Strava changes the API terms or the fields. | Risk | One client file (`utils/strava.ts`) and one mapping function to change. |
| Q1 | Product name for the hub. | Closed: "Effortprint" | "Sweat Ledger" is withdrawn: too near "Sweatcoin", a known application that pays crypto tokens for steps. Proposals: "Effortprint" (recommended, one web search found no product with this name), "Pacemark", "Trailproof". No trademark database was checked. "Segment Attestations" stays as a tool name. Needed for pull request 4 only. |
| Q2 | Does `/` stay the attestation flow, with the hub on another path? | Closed | Hub at `/` (D16). |
| Q3 | Does logout remove the activity cache? | Closed | Yes (D11). |
| Q4 | Light theme for the heatmap screen. | Closed | Light and dark themes for the full site (D14). |
| Q5 | The domain `strava.alainnicolas.fr` contains the Strava name. | Closed | The domain stays (D16). |
| Q6 | The accent color is the Strava brand orange. | Closed | The color stays (D15). |
| Q7 | Findings 16 to 19. | Closed | Fixed in Phase 1 (D13). |
| Q8 | Drop `stash@{0}`. | Closed | Dropped (revision 4). |
| Q9 | The agent clicks "Authorize" on the Strava consent page during the tests on `localhost`. | Closed | Yes (owner, 2026-11-21). No password is typed: the browser session of the owner is used. |

## 11. Definition of done

- All features of section 3.2 pass the manual parity check.
- All the findings of section 5.3 are closed (8 is withdrawn).
- CI is green on `main`. The end-to-end tests include the heatmap.
- No new runtime dependency in `packages/frontend`.
- No activity data leaves the browser, except the requests to the Strava API.
- The final Ponytail audit has no "must fix" item.
- The product name does not contain the word "Strava".
- The README describes the two tools.

## 12. Execution guide for the next sessions

This section is for the agent that builds pull requests 2 to 5. Read sections 4, 7, 8 and 9 first.

### 12.1 State after pull request 1

- `main` has the clean base: one layout route (`components/Layout`), one authentication provider (`hooks/useStravaAuth.tsx`), the Strava client (`utils/strava.ts`: `stravaGet`, `StravaHttpError`, `parseRetryAfter`), the `BRAND` constant (`utils/constants.ts`).
- Open findings: 3 and 15 (pull request 5), 10 (pull request 3).
- Checks on `main`: 164 unit tests, 10 end-to-end tests, lint and format clean.

### 12.2 Rules (owner decisions)

1. Never merge with a red or pending check. All the checks of the pull request must be green: `Validate`, the Netlify rules and the deploy preview. Read the failed log before any new push.
2. Test before the merge, by yourself: unit tests, end-to-end tests, then a manual pass in a browser on `localhost` with the real Strava account, then the deploy preview (no Strava login there).
3. After the merge, check production (`https://strava.alainnicolas.fr`) with the real account.
4. Ask the owner only for a secret or for a product decision.
5. Follow the process of section 8, the Ponytail rules of section 6, and the commit rules of the owner (Conventional Commits, signed, no tool attribution, English).
6. Do not read or print the `.env` files, the Strava client secret or the tokens.
7. No new runtime dependency. One import style (D19): `pnpm lint` enforces it.

### 12.3 Local setup that works

- Functions: `pnpm --filter @strava-attestations/functions dev` (port 8888). `packages/functions/.env` exists.
- Frontend: `BROWSER=none VITE_STRAVA_CLIENT_ID=59630 pnpm --filter @strava-attestations/frontend dev` (port 5174). The local `.env.local` has no client ID and no wallet values. The client ID is public.
- With no wallet values, the wallet button is disabled and the segments modal shows a notice. The wallet flow is tested by `e2e/wallet.spec.ts` only.
- The Strava login needs no click on the consent page when the browser session of the owner is active.
- `pnpm test:e2e` builds with `--mode e2e` and leaves a `dist` folder with placeholder values. Do not deploy that folder by hand.

### 12.4 Lessons from pull request 1

- The CI runner is about 3 times slower than the local machine. A lazy route imports its modules inside the test timeout: `setupTests.ts` sets `asyncUtilTimeout` to 5 s. Do not use fixed waits in tests.
- wagmi batches contract reads in one Multicall3 call. An RPC mock must decode `aggregate3` (see `e2e/wallet.spec.ts`).
- A manual chunk group in the Vite configuration preloaded the wallet code. Do not add manual chunks. The wallet test fails above 400 kB of scripts before the wallet opens.
- Each top-level file of `packages/functions/src` is a public function. A test lists the 3 permitted files.
- A build with no wallet values is a real case (local, CI unit tests). Each new screen must render with `IS_WALLET_CONFIGURED` false.

### 12.5 Work split with subagents

File ownership is exclusive: two writers never change the same file. Each subagent works in its own git worktree, on a branch from the head of the pull request branch, and gets the contracts of section 7.7. It writes its tests first, runs lint, format and its tests, and commits. It does not push, does not open a pull request and does not change the files of another package. The lead agent reviews each result (diff, not the report), merges the branches, and runs the full checks.

| Wave | Runs in parallel | Owner files | Needs |
| --- | --- | --- | --- |
| A | Lead agent: pull request 2 (themes), complete, merged. | `index.css`, the CSS modules, `components/ThemeSwitch`, `Header`, `Web3Provider`, `index.html` | Nothing |
| A | Subagent 1: heatmap logic. | `utils/heatmap.ts`, `utils/heatmapPalettes.ts`, their tests | Section 7.7, Phase 3 test cases |
| A | Subagent 2: activity data. | `utils/activityStore.ts`, `hooks/useHeatmapSync.ts`, their tests | Section 7.3, 7.4, 7.7, Phase 2 test cases |
| A | Subagent 3: export. | `utils/heatmapExport.ts`, its test | Section 7.6, 7.7 (the SVG contract) |
| B | Lead agent: the heatmap screen, the grid, the controls, the tooltip, the route, the return path (finding 10), the end-to-end test. Then pull request 3. | `components/Heatmap`, `screens/Heatmap`, `App.tsx`, `netlify.toml`, `sitemap.xml`, `e2e/heatmap.spec.ts` | Wave A merged in the branch of pull request 3, after pull request 2 is on `main` |
| C | Lead agent: pull request 4 (hub, Effortprint, SEO files). One subagent can run the `seo-audit` skill on the deploy preview. | Section 8, Phase 6 | Pull request 3 on `main` |
| D | Lead agent: pull request 5 (policy, headers, closure). One subagent can run `/ponytail-audit` on the full repository. | `netlify.toml`, `vite.config.ts`, the header test, the README | Pull request 4 on `main` |

Wave A is the only large gain: the three modules are pure or isolated, and their contracts are fixed. Waves B to D stay sequential because they change shared files (`App.tsx`, `Header`, `netlify.toml`).

A brief for a subagent has these parts: the goal in one sentence, the files it owns, the contract (copy of the block of section 7.7), the test cases (copy of the rows of section 8), the rules 5 to 7 of section 12.2, and the definition of done (lint, format and its tests pass, one signed commit).

### 12.6 Start prompt for the next session

> Read `docs/heatmap-integration-plan.md`, sections 4, 7, 8, 9 and 12. Build pull requests 2 to 5 in the order of section 12.5, with subagents for wave A. Follow the rules of section 12.2: no merge before all the checks are green and all the tests are done. Stop and report after each merged pull request.
