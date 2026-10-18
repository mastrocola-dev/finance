# finance

Household finance ledger with a Claude connector. Two members, every change audited, nothing deleted, no payment ever executed. Work in progress on branch `poc`, built one increment at a time by an agent following [CLAUDE.md](CLAUDE.md).

## Run locally

Requires Node 24 and PostgreSQL 16.

```sh
npm ci
npm test
npm run check
npm run fix
```
