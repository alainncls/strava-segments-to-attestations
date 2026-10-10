# Local Netlify Function development

The local workflow no longer installs or runs `netlify-cli`. The production
Netlify Functions configuration and `@netlify/functions` contract are
unchanged. `packages/functions/lib/localDevServer.ts` is a development-only
HTTP adapter that invokes the real `auth` and `sign` `Request`/`Response`
handlers. It adds no OAuth exchange or signing implementation of its own.

## Start

From the repository root, create the functions environment file and start the
workspace:

```sh
cp packages/functions/.env.example packages/functions/.env
corepack pnpm@11.0.3 dev
```

Vite remains at `http://localhost:5174`; the adapter binds only to
`127.0.0.1:8888`. `VITE_API_URL` continues to target
`http://localhost:8888/.netlify/functions`, and the adapter accepts both that
path and the short `/auth` and `/sign` paths. For a functions-only run, first
build the shared workspace package, then run the functions package `dev`
script. The `.env` file remains local and must not be committed.

The adapter streams Node request/response bodies through Web `Request` and
`Response`, propagates client cancellation, forwards cookies/CORS/cache
headers, and supplies `127.0.0.1` as explicit function context IP. It trusts no
forwarded-IP header and is never deployed. Production function routing remains
owned by `netlify.toml`/Netlify.

## Security dependency result

Removing the CLI removed its vulnerable dependency tree. With pnpm 11.0.3,
the frozen workspace resolves without `netlify-cli`; current audit reports
**0 high, 0 critical, and 1 low**. The remaining low `elliptic <=6.6.1` is in
the Hardhat verification-tool chain and was already documented in
`SECURITY_SCAN_REPORT.md`.

At the 2026-10-10 registry check, `braces@3.0.4` and `node-forge@1.4.1` each
returned npm `E404`; registry latest versions were `braces@3.0.3` and
`node-forge@1.4.0`. No patched release was available to pin. The existing
Netlify-specific overrides were removed only after checking that their
packages disappeared from the resolved graph. `@fastify/busboy@3.2.2` stays
because the Verax/GraphQL fetch stack still depends on it.

## Local evidence and limits

The adapter tests call the actual handlers and cover function-style and short
routes, OAuth state cookie attributes, credentialed CORS, `no-store`, preflight,
invalid JSON, unsupported methods, malformed sign input, and unknown paths.
No real Strava token exchange or signature is performed. On 2026-10-10 with
Node 24.21.0 and pnpm 11.0.3, local checks passed: frozen install, format,
lint, all package builds, 84 function tests, 32 frontend tests, 35 contract
tests, and six Playwright cases (Chromium and mobile Chromium). The adapter
was also started on loopback and checked for method handling, preflight,
credentialed CORS, `no-store`, and 404 behavior. The combined root dev command
was smoke-tested as well: Vite returned HTTP 200 on localhost and the function
adapter returned the expected 405/no-store response. The production frontend
build still reports its existing oversized wallet chunk; it does not fail the
build.

The dependency audit reports zero high/moderate/critical advisories and one
low `elliptic <=6.6.1` finding in the development-only Hardhat verification
chain. `pnpm why netlify-cli` returns no dependency. GitHub Actions were not
run due the owner's CI budget constraint; no PR was opened to avoid triggering
those workflows.
