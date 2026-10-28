# fast-uri security migration

The Verax SDK GraphQL dependency graph resolves vulnerable `fast-uri` releases
on the 2.x, 3.x and 4.x lines. Four advisories affect those ranges:
GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr and
GHSA-333x-w4r6-6crp.

The workspace pins each line to its first patched release: 2.4.8, 3.1.9 and
4.2.3. These releases had passed the workspace's minimum release-age guard when
the migration was introduced. The override is intentionally transitive: upstream
Verax packages retain their declared ranges while the resolved production graph
remains patched.

Acceptance requires a frozen install, a production audit with no high or
critical findings, all package gates, browser E2E, CI, preview and production
smoke verification.
