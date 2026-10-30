# ADR-010 proposal: Azure hosting

Status: proposed by the build agent on 2026-10-27 (sprint item S5); not applied. The defaults below were built into `infra/` (S4) and the `Dockerfile` (S5) and wait for the author under **Needs author** in `BACKLOG.md`.

## Context

The POC runs locally: PostgreSQL 16, the HTTP API (port 3200), the MCP server (port 3100) and the web app, which calls `/api` on its own origin (`createApi` uses `location.origin`; Vite proxies `/api` in development). S4 wrote Terraform for the Azure stage and S5 the container images. Facts that shape the choice:

- The API and the MCP server run as Container Apps on the consumption plan, zero to one replica, on internal ingress until `allowed_ips` lists the author's address, because `AUTH_MODE=local` trusts the `x-member` header until Entra ID exists
- The Static Web App is on the Free plan in eastus2 (Static Web Apps are not offered in eastus). Free cannot link a backend, so `/api` on the web's origin does not reach the Container App: the web would have to call the API cross-origin (CORS plus `API_ALLOWED_ORIGINS`, backlog L177) or a host must serve both
- The API accepts only localhost Host and Origin today (L177), so any Azure host needs that setting first
- The API image ships the ingest runtime prebuilt (`ingest/.venv-runtime`, uv offline), so a cold start no longer waits for `uv sync` (L179); since S12 D2 it also carries service-agent at a pinned commit, with the model key from Key Vault and a daily spending cap
- Entra ID comes with the Azure stage (ADR-008); the tenant kind is open

## Decision (proposed)

### 1. The API container is the backend for frontend (BFF)

The API Container App also serves the web build (`web/dist`) on the same origin, as a thin static handler in front of `api()`. One origin means no CORS, no `API_ALLOWED_ORIGINS` list to keep, and the session cookie of the Entra sign-in stays `HttpOnly` and same-site: tokens never reach the browser, which is the reason for a BFF. The Static Web App is dropped from `infra/` when this lands.

| Option | Monthly cost | Trade-off |
|---|---|---|
| **API serves the web (BFF), proposed** | US$ 0 extra | one image grows by the web build (about 1 MB); a web change ships a new API revision; the scale-to-zero cold start also delays the first page |
| Static Web App Standard with a linked backend | about US$ 9 | same origin through the SWA proxy; SWA auth can front Entra; a second resource to deploy |
| Static Web App Free, API cross-origin | US$ 0 | CORS and `API_ALLOWED_ORIGINS`; a bearer token must live in the browser, the weakest option for a finance app |

### 2. Hosts and images

- Container Apps consumption, zero to one replica, 0.25 vCPU and 0.5 GiB per app (as in S4); Functions Flex was the alternative and would need a Node adapter for the HTTP API
- One `Dockerfile`, targets `api` and `mcp`, Node 24 slim, multi-stage, user `node`, production dependencies only; `api` adds uv and Python 3.13 with `ingest/.venv-runtime` built from the lock
- Registry: GitHub Container Registry (`ghcr.io/mastrocola-dev/finance-api`, `-mcp`), private, pulled with a read-only token kept in Key Vault as `registry-password` (`registry_server`, `registry_username` in `infra/`); Azure Container Registry Basic costs about US$ 5 a month and is not needed for two images
- Images tagged with the commit SHA; pin the base images by digest after the first build
- Migrations stay a manual step (`infra/README.md` step 8) until L178 adds a Container Apps job

### 3. Identity

- Entra ID **workforce tenant** (the author's existing directory, free tier), one single-tenant app registration, Gabriela invited as a B2B guest (e-mail one-time passcode or her Microsoft account). Two people do not need Entra External ID (customer identity), which adds a second tenant and user flows for nothing; External ID only makes sense if the app ever serves other households
- The BFF runs the authorization code flow with PKCE, keeps the session in an encrypted cookie and maps the signed-in object id to a member (`members.external_id`, a new migration); the `token` verifier slot of S2 becomes that check
- The MCP server keeps `x-member` only behind the same sign-in (Claude's connector OAuth against the same app registration), decided when the connector is published

## Costs (default options, eastus, list prices known to the agent; check the Azure pricing calculator before applying)

| Resource | Monthly |
|---|---|
| PostgreSQL Flexible Server B1ms, 32 GiB, 7-day backups | about US$ 16 (compute about US$ 12.5, storage about US$ 3.7) |
| Container Apps, two apps scaled to zero | US$ 0 within the monthly free grant (180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests) |
| Log Analytics, 0.1 GB daily cap | under US$ 1 |
| Key Vault, a few secrets | under US$ 0.10 |
| Static Web App Free (until the BFF lands) | US$ 0 |
| GitHub Container Registry, private | US$ 0 within the free storage |
| **Total** | **about US$ 17**, under the US$ 25 budget alert |

PostgreSQL is the floor cost (author, 2026-10-26). Stopping the server when unused saves compute but Azure restarts it after seven days.

## Consequences

- Before anything is exposed: L177 (allowed hosts and origins for the API), the static handler, the Entra sign-in and the member mapping; until then `allowed_ips` stays empty or lists only the author's address
- `infra/` changes when this is approved: the Static Web App goes, the API app gets the web build and the auth settings in Key Vault
- The import agent needs a home: either service-agent becomes a package installed in the API image, or imports stay on the author's machine at first
- CI builds and smoke-tests both images (`images` job); publishing to GHCR needs `packages: write` and is a separate, approved change
