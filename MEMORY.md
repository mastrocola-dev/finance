# Memory

Rewritten by every run, at most 60 lines. Only what the next run needs and cannot see in the code.

- F01 was done by Claude in the author's session on 2026-10-18 to validate the environment
- Session facts: Node 22 is preinstalled, `npm i -g node@24` works; PostgreSQL 16 is installed but stopped, `pg_ctlcluster 16 main start` brings it up, superuser `postgres` with peer auth (use `su postgres -c` or set a password for TCP)
- npm, PyPI and Ubuntu apt are reachable; Docker Hub, mcr.microsoft.com and packages.microsoft.com are not
- `npm run typecheck` fails with "No inputs" until `src/` exists; F02 must make it pass
- Sibling repos use `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.x and `zod` 4; follow them in F06
