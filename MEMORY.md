# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

## Session setup (cloud container, each run)

- Node 22 is preinstalled; `npm i -g node@24` then `hash -r` gives v24
- PostgreSQL 16: `pg_ctlcluster 16 main start`
- Local auth: `su postgres -c "psql -c \"alter user postgres password 'local'\""` then `cp .env.example .env` (scripts load it via `--env-file-if-exists`; `.env` is gitignored). Without it the default URL has no password and `npm test` hangs
- Run setup commands one per Bash call; long chained commands were refused by the classifier
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- No `add_repo`/`register_repo_root` tools exist in these runs; the repo is already cloned at /home/claude/finance (detached on main), `git fetch origin && git checkout poc` works

## Decisions taken so far (for the author to review)

- Lifecycle is `closed_at timestamptz` (null = active) on every table; `entry.status` is the payment status (planned, paid, late); a corrected entry is closed with `replaced_by`
- Deletes and truncates raise through triggers; `audit_log` and `decision_confirmation` are immutable
- `audit_log.author` is member, claude, import or system; member and claude require `member_id`
- Joint split lives in `member.share_percent`; null `member_id` on account, entry, expense or debt means joint
- `decision.status` proposed, confirmed, rejected, withdrawn; closing a decision must set status in the same `close` call (DB check)
- Account, institution, nickname and creditor reject any run of 5+ digits
- Migrations are forward-only, one transaction each; share sum of 100 enforced in `write()` at commit
- F04: seed in English, invented institutions; fixed `seedToday` 2026-10-18 (months 2025-11..2026-10); only Electricity in 2026-10 is stored `late`; debt `balance_cents` = installment × remaining (L08)
- F05: summary groups by `competence`, active entries only; paid = `paid`, pending = `planned` due on/after today, late = stored `late` or `planned` past due (L11)
- F06: MCP output is JSON text only (no `outputSchema`/`structuredContent`); every bigint becomes `{ cents, brl }` except key `id` (string) (L13); domain read models use camelCase keys
- F06: `month_summary` always returns `compareMonths` (both months plus difference); `list_entries` filters match names case-insensitively: category name, account nickname, member name or `joint`; `state` is derived (paid, pending, late), `status` is the stored one
- F06: tools are annotated `readOnlyHint: true`; F11 demo mode can reuse `createServer` as is until write tools exist
- Dependencies added: `@modelcontextprotocol/server` 2.3.1 and `zod` 4.6.7 (runtime), `@modelcontextprotocol/client` 2.3.1 (dev, tests only)

## Notes for next items

- All ledger writes go through `write(client, actor, (ledger) => ...)` from `src/db/write.ts`; never insert with raw SQL outside migrations and tests
- Read side: `src/ledger/summary.ts` (`monthSummary`, `compareMonths`, `competenceOf`, `shiftMonth`, `localToday`, `assertDate`), `entries.ts` (`listEntries`), `debts.ts` (`listDebts`), `money.ts` (`formatBrl`, `money`); all take a `pg` `ClientBase`
- MCP: `createServer(client)` in `src/mcp/server.ts`; `result(value)` in `src/mcp/json.ts` builds the tool result; stdio entry `src/mcp/stdio.ts` uses `serveStdio(factory)` from `@modelcontextprotocol/server/stdio`
- SDK 2.x: `InMemoryTransport.createLinkedPair()` and `Client` come from `@modelcontextprotocol/client`; `StdioClientTransport` from `@modelcontextprotocol/client/stdio`; zod validation failures and thrown errors come back as `isError: true` results, not rejections
- F06b: check the server package exports for streamable HTTP (`createMcpHandler`, `PerRequestHTTPServerTransport` are exported from the root); bind 127.0.0.1 by default
- F07: author `claude` with the calling member's `member_id`; needs the member from the `x-member` header (HTTP) or an env/default for stdio — decide and record
- Seed 2026-10 as of `seedToday`: 16 active entries; income 3 entries 2030000 (paid 1770000, pending 260000); expenses 13 entries 1023800 (paid 818300, pending 183300, late 22200); 2026-09 expenses 1009500 all paid; two debts (Car financing joint, Personal loan Gabriela)
- To get a seeded test DB: `testDatabase()` then `seed(db.client)` (about 0.3 s)
- `pg` returns `bigint` as `BigInt` (including ids), `date` as `YYYY-MM-DD` string, `timestamptz` as `Date`, `numeric` as string; `count(*)` needs `::int`, `sum()` of bigint is `numeric` unless cast
- Tests use `test/db/database.ts` (`testDatabase()`): fresh `finance_test_<uuid>` database per suite, dropped `with (force)` in `after`
- `import.meta.main` is used for CLI entry points
- Tests: 52 passing after F06
- Failing-test run streak: 0
