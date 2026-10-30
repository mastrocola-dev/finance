# Deploy to Azure

The exact order for the author to put the finance POC on Azure behind sign-in with Google. The build agent never runs any of these steps: it cannot reach Azure, the Terraform registry or the image registries. Every value below is a placeholder in `<angle brackets>`; keep real values in untracked files (`terraform.tfvars`, `backend.hcl`, `web/.env.production.local`) or in Key Vault, never in the repository.

## Before you start

One gap remains between this runbook and a working deploy:

- **Web origin** (Needs author, ADR-010): the web calls `/api` on its own origin, and the Free Static Web App cannot forward `/api` to the API container. Until the author picks an option of ADR-010 (API serving the web, SWA Standard with a linked backend, or cross-origin calls), step 10 publishes a web app that signs in but cannot load data. Claude through the MCP connector works without it

Tools on the author's machine: Azure CLI (`az`), Terraform 1.16.4, Docker, Node 24 and npm.

## 1. Entra External ID tenant with Google

1. In the Microsoft Entra admin center, **Manage tenants** → **Create** → **External**. Pick a subdomain, for example `caixa`: the authority becomes `https://<subdomain>.ciamlogin.com/`. Write down the **tenant ID** (a GUID)
2. In Google Cloud Console, create an OAuth client of type **Web application** with these authorized redirect URIs:
   - `https://<tenant ID>.ciamlogin.com/<tenant ID>/federation/oauth2`
   - `https://<subdomain>.ciamlogin.com/<tenant ID>/federation/oauth2`
   - `https://<subdomain>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oauth2`
3. In the external tenant, **External Identities** → **All identity providers** → **Google**: paste the Google client ID and secret. The secret stays in Entra; do not copy it anywhere else
4. **User flows** → **New user flow** (sign up and sign in): identity providers **Google** only (untick e-mail one-time passcode if offered), no extra attributes. Applications are added to it in step 2.4

## 2. App registrations

All three live in the external tenant.

1. **API** (`finance-api`): **App registrations** → **New registration**, single tenant, no redirect URI. Write down its **application (client) ID**: that is `entra_audience`
   - **Manifest**: set `requestedAccessTokenVersion` (`api.requestedAccessTokenVersion` in the Microsoft Graph manifest) to `2`, so tokens carry the v2 issuer and the client ID as audience
   - **Expose an API**: accept the default Application ID URI `api://<API client ID>` and add the delegated scope `access` (admins and users, display name "Usar o finance"). The full scope is `api://<API client ID>/access`
2. **Web** (`finance-web`): new registration, platform **Single-page application**, redirect URI the `web_url` output of step 4, added once it exists (the web redirects to its own origin, no path); add `http://localhost:4173` only if you want to try the `entra` build locally
   - **API permissions** → **Add** → **My APIs** → `finance-api` → `access`, then **Grant admin consent**
   - Its client ID is the API's `ENTRA_CLIENT_ID`: the API signs people in with it (server-side code flow with PKCE and a session cookie); the web build carries no Entra setting
3. **Claude** (`finance-claude`): the client Claude's connector uses, because Entra does not offer dynamic client registration
   - Platform **Web**, redirect URI `https://claude.ai/api/mcp/auth_callback`
   - **Certificates & secrets** → new client secret with the shortest expiry you accept; it goes only into Claude's connector form in step 11
   - **API permissions** → `finance-api` → `access`, plus `offline_access`, then **Grant admin consent**
4. **User flows** → the flow of step 1.4 → **Applications** → add `finance-web` and `finance-claude`

The token issuer is `https://<tenant ID>.ciamlogin.com/<tenant ID>/v2.0`: that is `entra_issuer`. Check it: `curl https://<tenant ID>.ciamlogin.com/<tenant ID>/v2.0/.well-known/openid-configuration` returns that exact `issuer`.

## 3. Images

The `Dockerfile` builds both images; CI's `images` job builds them on every push without pushing. Tag with the commit, never `latest`, so a rollback is a variable change.

```sh
docker build --target api -t ghcr.io/mastrocola-dev/finance-api:<commit> .
docker build --target mcp -t ghcr.io/mastrocola-dev/finance-mcp:<commit> .
echo <token with write:packages> | docker login ghcr.io -u <GitHub user> --password-stdin
docker push ghcr.io/mastrocola-dev/finance-api:<commit>
docker push ghcr.io/mastrocola-dev/finance-mcp:<commit>
```

Public packages need nothing else. Private packages need `registry_server = "ghcr.io"`, `registry_username` and a Key Vault secret `registry-password` (a token with `read:packages` only) before the apps exist: apply the vault first with `terraform apply -target=azurerm_key_vault.main -target=azurerm_role_assignment.deployer_secrets`, then `az keyvault secret set --vault-name <vault> --name registry-password --file <file holding the token>`, then the full apply of step 4.

## 4. Terraform

Steps 1 to 7 of [infra/README.md](../infra/README.md) (state storage, `backend.hcl`, `az login`, `init`, `fmt -check`, `validate`, `plan`, `apply`). `terraform.tfvars` sets these variables; names only here:

| Variable | Required | Value |
|---|---|---|
| `subscription_id` | yes | the subscription |
| `api_image` | yes | `ghcr.io/mastrocola-dev/finance-api:<commit>` |
| `mcp_image` | yes | `ghcr.io/mastrocola-dev/finance-mcp:<commit>` |
| `entra_issuer` | yes | `https://<tenant ID>.ciamlogin.com/<tenant ID>/v2.0` |
| `entra_audience` | yes | the `finance-api` client ID |
| `budget_emails` | yes | the addresses for budget alerts |
| `mcp_scopes` | no, `[]` | `["api://<API client ID>/access"]`, so Claude asks for the right scope |
| `mcp_allowed_origins` | no, `[]` | extra browser origins for MCP clients (Claude calls server side and needs none) |
| `allowed_ips` | no, `[]` | CIDR ranges to restrict both apps to; empty lets any address in, behind Entra. Claude's connector calls from Anthropic's servers, so a list that leaves them out breaks it |
| `registry_server` | no, `null` | `ghcr.io` for private images |
| `registry_username` | no, `null` | the GitHub user for private images |
| `name` | no, `finance` | prefix of every resource |
| `location` | no, `eastus` | region of everything but the web |
| `web_location` | no, `eastus2` | region of the Static Web App |
| `db_admin_login` | no, `finance_admin` | PostgreSQL administrator |
| `db_password_version` | no, `1` | raise to rotate the database password |
| `log_daily_cap_gb` | no, `0.1` | Log Analytics daily cap |
| `budget_amount` | no, `25` | monthly budget in the billing currency |

Terraform sets on both apps `AUTH_MODE=entra`, `ENTRA_ISSUER` and `ENTRA_AUDIENCE`, on the API app `API_ALLOWED_HOSTS` (`<name>-api.<environment domain>`), and on the MCP app `MCP_ALLOWED_HOSTS`, `MCP_PUBLIC_URL` (`https://<name>-mcp.<environment domain>`) and `MCP_SCOPES`. `DATABASE_URL` is a Key Vault reference, never a value. Note the outputs: `terraform output` (`api_url`, `mcp_url`, `web_url`, `migrate_job`, `resource_group`, `key_vault_uri`).

## 5. Migrations

The `<name>-migrate` Container Apps job runs `npm run db:migrate` with the `api` image and the `database-url` secret, inside Azure, so no firewall rule is needed. Run it after every apply that changes `api_image`, before the apps receive traffic:

```sh
az containerapp job start -g "$(terraform output -raw resource_group)" -n "$(terraform output -raw migrate_job)"
az containerapp job execution list -g "$(terraform output -raw resource_group)" -n "$(terraform output -raw migrate_job)" -o table
```

The execution must end `Succeeded`; its log (Log Analytics, `ContainerAppConsoleLogs_CL`) prints `applied …` or `up to date`. Migrations are forward-only and take an advisory lock, so running the job twice is safe.

## 6. First sign-in of each person

1. Each person opens the web app (or any Entra sign-in of `finance-web`) and signs in with Google once, so Entra creates their user
2. In the external tenant, **Users**: write down the **object ID** of Marcio and of Gabriela

## 7. Members

Migrations create an empty ledger; never run `db:seed` on Azure. Both members are created in one execution, because active shares must always add up to 100. The job's image runs any npm script with an override (check the flags with `az containerapp job start --help` if your CLI version differs):

```sh
az containerapp job start -g <resource group> -n <migrate job> --image <api image> --container-name migrate --command npm --args "run member:add -- Marcio 50 Gabriela 50"
```

The execution prints `added Marcio, Gabriela`; it refuses a name that already exists or shares that do not add up to 100, and writes nothing then.

## 8. Link members to their sign-in

```sh
az containerapp job start -g <resource group> -n <migrate job> --image <api image> --container-name migrate --command npm --args "run member:link -- Marcio <Marcio object ID>"
az containerapp job start -g <resource group> -n <migrate job> --image <api image> --container-name migrate --command npm --args "run member:link -- Gabriela <Gabriela object ID>"
```

Each execution prints `linked <name>`. An unlinked person who signs in gets 403 `unknown member`.

## 9. Check the APIs

- `curl <mcp_url>/.well-known/oauth-protected-resource/mcp` returns `resource` `<mcp_url>/mcp`, `authorization_servers` with `entra_issuer` and the scopes of `mcp_scopes`
- `curl -i -X POST <mcp_url>/mcp` returns 401 with `WWW-Authenticate: Bearer resource_metadata=…`
- `curl <api_url>/api/health` returns 200, and `curl -i <api_url>/api/members` returns 401 without a token

## 10. Web app

Blocked by the web origin decision; the build and upload are:

```sh
cd web
VITE_AUTH_MODE=entra npm run build
npx @azure/static-web-apps-cli deploy dist --deployment-token "$(terraform -chdir=../infra output -raw web_deployment_token)" --env production
```

Open `web_url`: the screen says Entrar; Entrar com Google goes to `/auth/login` on the API, which needs `SESSION_KEY` and `ENTRA_CLIENT_ID` (S12 part C adds them to `infra/`).

## 11. Claude connector

In Claude, **Settings** → **Connectors** → **Add custom connector**: URL `<mcp_url>/mcp`; under advanced settings the `finance-claude` client ID and secret. Connect: Claude reads the metadata of step 9, sends you to Entra, and comes back signed in. Ask "quais contas vencem este mês?" and see the answer; a write (for example marking a bill as paid) appears in Atividade with the member as author.

## 12. Smoke test

Walk through [docs/acceptance.md](acceptance.md) against Azure with an empty ledger instead of the seed: section 2 (both members, signed in with Google instead of the picker), section 3 (every screen, registering the first accounts and categories under Cadastros) and section 5 (Claude connector). Never type real financial data during the POC. Imports do not work in the container yet (backlog L181).

## Rollback

- **Bad image**: set `api_image` or `mcp_image` back to the previous commit tag, `terraform apply`; each app keeps a single revision. Do not run the job with the old image after a newer migration ran: migrations are forward-only, so write a forward migration that reverts the change instead
- **Bad data or migration**: restore PostgreSQL to a point in time (7 days) into a new server, point the `database-url` secret at it, restart both apps
- **Bad web build**: deploy the previous `dist` again with the same command
- **Sign-in broken**: the apps refuse every call without a valid token, so nothing leaks; fix the registration or set `entra_issuer`/`entra_audience` back and apply. Never switch `AUTH_MODE` to `local` on Azure: it trusts the `x-member` header
- **Claude misbehaves**: remove the connector in Claude, or delete the `finance-claude` client secret in Entra; the web keeps working
- **Everything**: `terraform destroy`, then purge the soft-deleted Key Vault (`az keyvault purge`) before applying again with the same name; delete the three app registrations and the external tenant last
