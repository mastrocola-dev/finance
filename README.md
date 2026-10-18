# finance

Household finance ledger with a Claude connector. Two members, every change audited, nothing deleted, no payment ever executed. Work in progress on branch `poc`, built one increment at a time by an agent following [CLAUDE.md](CLAUDE.md).

## Run locally

Requires Node 24 and PostgreSQL 16.

```sh
npm ci
npm run db:reset
npm run db:seed
npm test
npm run check
npm run fix
```

`DATABASE_URL` defaults to `postgres://postgres@localhost:5432/finance`. `npm run db:migrate` applies pending migrations from `db/migrations`; `npm run db:reset` drops and recreates the database; `npm run db:seed` fills an empty database with an invented household (twelve months up to 2026-10, as if today were 2026-10-18). Tests create and drop their own `finance_test_*` databases on the same server.
