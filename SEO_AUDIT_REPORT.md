# SEO and Lighthouse Audit Report

Audit date: May 8, 2026
Production URL audited: <https://strava.alainnicolas.fr/>
Secondary host checked: <https://strava-attestations.netlify.app/>

## Executive Summary

The production site was crawlable and served over HTTPS, but it had several technical SEO and Lighthouse issues:

- The advertised sitemap was invalid: `robots.txt` pointed to the Netlify host, and `/sitemap.xml` returned the SPA HTML shell instead of XML.
- Unknown URLs returned `200` with an empty app route, creating soft-404 and duplicate crawl signals.
- Canonical, Open Graph, Twitter, route-specific metadata, and rendered JSON-LD were missing.
- The public landing page loaded the full wallet/Web3 stack on first paint, driving poor mobile Lighthouse performance.
- Accessibility was held back by low-contrast muted text and link styling that relied on color alone.
- Hashed assets did not have immutable cache headers, production source maps were unavailable, and `llms.txt` was missing.

## Baseline Production Lighthouse

Baseline run target: <https://strava.alainnicolas.fr/>

| Mode | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Speed Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | 62 | 90 | 81 | 100 | 4.3 s | 8.6 s | 0 ms | 0.01 | 6.0 s |
| Desktop | 93 | 90 | 81 | 100 | 0.9 s | 1.6 s | 0 ms | 0 | 1.2 s |

Largest baseline Lighthouse issues:

- Mobile LCP was the hero H1 and took 8.6 s in the measured production run.
- Unused JavaScript was estimated at 367 KiB, mostly from the initial wallet/Web3 bundle.
- A third-party getinsights.io script registered an unload handler, causing the deprecation and bfcache failures.
- Text contrast failed for the hero feature labels and footer text.
- The Strava button and Powered by Strava image lacked explicit `width` and `height`.

## Findings and Fixes

| Priority | Finding | Evidence | Fix Applied |
| --- | --- | --- | --- |
| High | Invalid sitemap setup | `robots.txt` pointed to `https://strava-attestations.netlify.app/sitemap.xml`, which returned HTML. | Added `packages/frontend/public/sitemap.xml` and updated `robots.txt` to the canonical domain. |
| High | Soft-404 SPA fallback | Unknown production routes returned `200` with no route content. | Replaced the catch-all SPA rewrite with known route rewrites and a Netlify `404.html` fallback returning 404. Added a noindex React 404 route. |
| High | Canonical inconsistency | Canonical domain pages had no rendered canonical tag; Netlify host was still directly accessible. | Added route-level canonical tags and a Netlify host-to-canonical 301 redirect. |
| Medium | Duplicate route metadata | `/`, `/about`, and `/oauth` all used the same static title and description. | Added route-level title, description, canonical, robots, OG, Twitter, and JSON-LD metadata for the indexable routes. Marked `/oauth` noindex with an `X-Robots-Tag` header. |
| Medium | Empty static HTML shell | Raw HTML contained only `<div id="root"></div>`. | Added meaningful static fallback homepage content in `index.html`. Full route prerendering remains a future enhancement if organic content becomes a larger priority. |
| High | Initial JavaScript too large | Main production bundle loaded wallet/AppKit/Wagmi before the user needed wallet actions. | Removed the root Web3 provider and lazy-loaded wallet/AppKit code only after wallet connect or segment attestation interactions. |
| Medium | Accessibility contrast failures | Lighthouse flagged muted hero/footer text and footer link styling. | Increased muted/secondary text contrast, used accessible orange for CTA backgrounds, and underlined the footer author link. |
| Low | Unsized images | Lighthouse flagged Strava button and footer Strava logo. | Added explicit `width` and `height` attributes to key images and icon images. |
| Medium | Analytics blocked bfcache | getinsights.io used a deprecated unload listener. | Added `VITE_ENABLE_INSIGHTS`; analytics now loads only when explicitly enabled. |
| Low | Missing source maps | Lighthouse flagged large first-party JS without maps. | Enabled production source maps in Vite. |
| Low | Weak cache policy | Hashed assets lacked long-lived cache headers. | Added immutable one-year `Cache-Control` for `/assets/*` in `netlify.toml`. |
| Low | Missing `llms.txt` | Lighthouse reported missing H1 and links for `llms.txt`. | Added `packages/frontend/public/llms.txt` with canonical pages and related resources. |

## Local After-Fix Lighthouse

After applying changes, the production build was audited locally with Vite preview at `http://127.0.0.1:4177/`.

| Mode | Performance | Accessibility | Best Practices | SEO | Agentic Browsing | FCP | LCP | TBT | CLS | Speed Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | 99 | 100 | 100 | 100 | 100 | 1.6 s | 1.9 s | 0 ms | 0 | 1.6 s |
| Desktop | 100 | 100 | 100 | 100 | 100 | 0.4 s | 0.5 s | 0 ms | 0 | 0.4 s |

Remaining local Lighthouse notes:

- Lighthouse still reports about 30 KiB of unused JavaScript on first load, which is minor and expected for a React app shell.
- Vite preview does not apply Netlify redirect status codes, so final 404 and host redirect behavior must be verified after deployment.

## Validation

- `pnpm --filter @strava-attestations/frontend build`: passed.
- `pnpm --filter @strava-attestations/frontend test`: passed, 27 tests.
- `pnpm --filter @strava-attestations/frontend exec eslint .`: passed.
- `pnpm lint`: passed.
- `pnpm test`: failed in `packages/functions/test/auth.test.ts` because the current worktree has unrelated function changes where the auth handler returns `400` instead of the expected `200` for `does not expose Strava refresh tokens to the browser`.

## Production Comparison

This section must be completed after the commit is deployed to production.

| Mode | Baseline Performance | Post-Deploy Performance | Baseline LCP | Post-Deploy LCP | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Mobile | 62 | Pending | 8.6 s | Pending | Awaiting production deployment. |
| Desktop | 93 | Pending | 1.6 s | Pending | Awaiting production deployment. |
