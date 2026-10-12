# OAuth state retention

`oauth-state-cleanup` is a Netlify scheduled function (03:15 UTC daily). It
paginates the current deployment context's strong-consistency Blobs namespace.
Only recognized v1 pending/consumed records whose expiry is more than one hour
old are deleted. Active, recently expired, malformed and unknown-version records
are preserved. A missing deployment context fails closed rather than selecting
production. The cleanup is idempotent and its storage requests share a 20-second
abort budget. Errors produce a generic non-cacheable 503, never a success count.

Nonce keys are random and never reused. Callback consumption preserves expiry;
the grace period ensures deletion cannot interfere with an active callback.
Tests cover pagination, the exact grace boundary, both statuses, malformed
records, storage failure, cancellation before deletion and context isolation.

## Provider verification

`pnpm verify:oauth-preview` checks a specific Netlify deploy preview against
`NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_DEPLOY_ID`,
`EXPECTED_SHA`, `PREVIEW_API_URL`, and `PREVIEW_ORIGIN`.
It checks provider deployment metadata, secure cookie/CORS handling, strong
read, only-if-new, concurrent compare-and-set, and namespace isolation. It
cleans up its own synthetic state in `finally`, without exchanging a Strava
user token or signing a transaction. Do not put these credentials in Git.

The local suite does not certify Netlify's deployed storage/scheduler. The
provider harness must be run on the corresponding deployed SHA to make that
claim; its availability is not itself a live validation result.

## Local release verification — 2026-10-12

Frozen pnpm 11.0.3 install, formatting, lint and complete production build
(including function/harness TypeScript compilation) passed. Tests: 35 contracts,
99 functions, 40 frontend and 8 desktop/mobile Playwright cases, all passed.
Full and production dependency audits report zero advisories. No lockfile update,
GitHub Actions run, live user OAuth exchange or signing was required.
