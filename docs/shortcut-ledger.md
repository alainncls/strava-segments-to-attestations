# Shortcut ledger

Deliberate limits, marked in the code with a `shortcut:` comment. Last scan: 2026-11-21.

| Location | What is simplified | Ceiling | Upgrade trigger |
| --- | --- | --- | --- |
| `packages/frontend/src/utils/activityStore.ts:36` | The activity cache is in `localStorage`. | About 5 MB, about 37,000 activities (measured: 3,498 activities use 489 KB). | An athlete reaches the quota (`writeCache` returns false): move to IndexedDB. |

1 marker, 0 with no trigger.
