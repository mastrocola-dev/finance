# Deploy to Azure

The single order for the author to put the finance POC on Azure, from an empty account to the smoke test, behind sign-in with Google. The build agent never runs any of these steps: it cannot reach Azure, the Terraform registry or the image registries. Every value below is a placeholder in `<angle brackets>`; keep real values in untracked files (`terraform.tfvars`, `backend.hcl`) or in Key Vault, never in the repository. `npm run check` runs `scripts/runbook.ts`, which fails when this page and `infra/` disagree on a variable or a Key Vault secret.

## What you get

- One Container App `<name>-api` that serves the web and the HTTP API on one origin (`web_url` = `api_url`) and signs people in itself: `/auth/login` runs a server-side code flow with PKCE against Entra External ID, which federates Google, and keeps a sealed `HttpOnly` session cookie. It also imports files with the real model through service-agent, capped by `import_daily_usd_cap`
- One Container App `<name>-mcp` for Claude's connector, which accepts only Entra bearer tokens
- PostgreSQL 16, Log Analytics and a migration job in `rg-finance-dev`. About US$ 17 a month, almost all of it PostgreSQL ([ADR-010](adr-010-azure-hosting.md)); the subscription budget of the organization covers it
- The resource group, both identities, the state container and the four secrets come from `bootstrap` in `mastrocola-dev/infra` (infra PR #22), applied by the author; this configuration creates no role and no vault

## 0. Tools and accounts

- Azure CLI (`az`), Terraform 1.16.4, `openssl`; Docker only to publish images by hand
- An Azure subscription where `bootstrap` of `mastrocola-dev/infra` is applied with the `finance-bootstrap` resources; Contributor on `rg-finance-dev` is enough for this configuration
- A Google account that may create OAuth clients in Google Cloud Console
- An Anthropic Console account for the import key

## 1. Entra External ID tenant with Google (one time)

1. In the Microsoft Entra admin center, **Manage tenants** → **Create** → **External**. Pick a subdomain, for example `caixa`: the authority becomes `https://<subdomain>.ciamlogin.com/`. Write down the **tenant ID** (a GUID)
2. In Google Cloud Console, **APIs & Services** → **OAuth consent screen**: external, app name `finance`, your address as support and developer contact, no extra scopes; while it is in testing, add Marcio's and Gabriela's Google addresses as test users
3. **Credentials** → **Create credentials** → **OAuth client ID** of type **Web application**, with these authorized redirect URIs:
   - `https://<tenant ID>.ciamlogin.com/<tenant ID>/federation/oauth2`
   - `https://<subdomain>.ciamlogin.com/<tenant ID>/federation/oauth2`
   - `https://<subdomain>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oauth2`
4. In the external tenant, **External Identities** → **All identity providers** → **Google**: paste the Google client ID and secret. The Google secret stays in Entra; do not copy it anywhere else
5. **User flows** → **New user flow** (sign up and sign in): identity providers **Google** only (untick e-mail one-time passcode if offered), no extra attributes. Applications are added to it in step 2.4

## 2. App registrations (one time)

All three live in the external tenant.

1. **API** (`finance-api`): **App registrations** → **New registration**, single tenant, no redirect URI. Its **application (client) ID** is `entra_audience`
   - **Manifest**: set `requestedAccessTokenVersion` (`api.requestedAccessTokenVersion` in the Microsoft Graph manifest) to `2`, so tokens carry the v2 issuer and the client ID as audience
   - **Expose an API**: accept the default Application ID URI `api://<API client ID>` and add the delegated scope `access` (admins and users, display name "Usar o finance"). The full scope is `api://<API client ID>/access`
2. **Web** (`finance-web`): new registration, platform **Web** (the API exchanges the code on the server, so not Single-page application), no redirect URI yet: it is `<api_url>/auth/callback`, added in step 6 once `api_url` exists
   - **Certificates & secrets** → new client secret; save it to a file for step 4.3. It goes only into Key Vault as `finance-web-secret`
   - **API permissions** → **Add** → **My APIs** → `finance-api` → `access`, then **Grant admin consent**
   - Its **application (client) ID** is `entra_web_client_id`; Terraform sets it as the API's `ENTRA_CLIENT_ID`. The web build carries no Entra setting
3. **Claude** (`finance-claude`): the client Claude's connector uses, because Entra does not offer dynamic client registration
   - Platform **Web**, redirect URI `https://claude.ai/api/mcp/auth_callback`
   - **Certificates & secrets** → new client secret with the shortest expiry you accept; it goes only into Claude's connector form in step 13
   - **API permissions** → `finance-api` → `access`, plus `offline_access`, then **Grant admin consent**
4. **User flows** → the flow of step 1.5 → **Applications** → add `finance-web` and `finance-claude`

The token issuer is `https://<tenant ID>.ciamlogin.com/<tenant ID>/v2.0`: that is `entra_issuer`. Check it: `curl https://<tenant ID>.ciamlogin.com/<tenant ID>/v2.0/.well-known/openid-configuration` returns that exact `issuer`.

## 3. Images

CI's `images` job builds both images after the tests pass and, on every push to `poc`, publishes `ghcr.io/mastrocola-dev/finance-api:<commit>` and `ghcr.io/mastrocola-dev/finance-mcp:<commit>` with the workflow's own token: the commit is the full SHA shown on the run. Tags are never `latest`, so a rollback is a variable change. The first push creates both packages as private; open each package on GitHub → **Package settings** and check that `finance` is listed under **Manage Actions access** with the **Write** role.

The run summary also shows the `Dockerfile` diff that pins the base images by digest (`scripts/pin-bases.sh`); apply it in a commit to make the next builds reproducible.

To publish by hand instead:

```sh
docker build --target api -t ghcr.io/mastrocola-dev/finance-api:<commit> .
docker build --target mcp -t ghcr.io/mastrocola-dev/finance-mcp:<commit> .
echo <token with write:packages> | docker login ghcr.io -u <GitHub user> --password-stdin
docker push ghcr.io/mastrocola-dev/finance-api:<commit>
docker push ghcr.io/mastrocola-dev/finance-mcp:<commit>
```

Make both packages public (**Package settings** → **Change visibility**): the apps pull them without credentials, and this configuration has no registry settings.

## 4. State and secrets

`bootstrap` creates the state container `tfstate-finance` in the shared state account and four placeholder secrets in the shared vault `kv-mastrocola-dev` (`rg-identity`), read by `id-run-finance` as Key Vault references. Terraform never holds their values; it reads only `finance-db-password`, ephemerally, to set the PostgreSQL administrator password.

1. Write an untracked `infra/backend.hcl`:

   ```hcl
   resource_group_name  = "<state resource group>"
   storage_account_name = "<state storage account>"
   container_name       = "tfstate-finance"
   key                  = "finance.tfstate"
   use_azuread_auth     = true
   ```

2. Write `infra/terraform.tfvars` (untracked) with every required variable of the table in step 5 and any default you change, then in `infra/`, with `ARM_SUBSCRIPTION_ID` set:

   ```sh
   terraform init -backend-config=backend.hcl
   terraform fmt -check && terraform validate
   ```

3. Set the secret values from files, never on the command line, with an expiry:

   ```sh
   openssl rand -base64 24 | tr -d '/+=' > db-password.txt
   openssl rand -base64 32 > session-key.txt
   az keyvault secret set --vault-name <vault> --name finance-db-password --file db-password.txt --expires <date>
   az keyvault secret set --vault-name <vault> --name finance-session-key --file session-key.txt --expires <date>
   az keyvault secret set --vault-name <vault> --name finance-web-secret --file <file holding the finance-web secret> --expires <date>
   az keyvault secret set --vault-name <vault> --name anthropic-api-key-finance --file <file holding the Anthropic key> --expires <date>
   rm db-password.txt session-key.txt
   ```

| Secret | Read by | Value |
|---|---|---|
| `finance-db-password` | Terraform (ephemeral), both apps and the job (`PGPASSWORD`) | PostgreSQL administrator password; after a new value raise `db_password_version` and apply |
| `finance-session-key` | API (`SESSION_KEY`) | 32 random bytes in base64; replacing it signs everyone out |
| `finance-web-secret` | API (`ENTRA_CLIENT_SECRET`) | client secret of `finance-web`; renew it before it expires |
| `anthropic-api-key-finance` | API (`ANTHROPIC_API_KEY`) | key from an Anthropic Console workspace with its own spend limit above `import_daily_usd_cap` |

## 5. Terraform

`terraform plan -out=finance.tfplan`, review it, `terraform apply finance.tfplan`.

| Variable | Required | Value |
|---|---|---|
| `api_image` | yes | `ghcr.io/mastrocola-dev/finance-api:<commit>` |
| `mcp_image` | yes | `ghcr.io/mastrocola-dev/finance-mcp:<commit>` |
| `entra_issuer` | yes | `https://<tenant ID>.ciamlogin.com/<tenant ID>/v2.0` |
| `entra_audience` | yes | the `finance-api` client ID |
| `entra_web_client_id` | yes | the `finance-web` client ID |
| `mcp_scopes` | no, `[]` | `["api://<API client ID>/access"]`, so Claude asks for the right scope |
| `mcp_allowed_origins` | no, `[]` | extra browser origins for MCP clients (Claude calls server side and needs none) |
| `allowed_ips` | no, `[]` | CIDR ranges to restrict both apps to; empty lets any address in, behind Entra. Claude's connector calls from Anthropic's servers, so a list that leaves them out breaks it |
| `name` | no, `finance` | prefix of every resource |
| `resource_group_name` | no, `rg-finance-dev` | resource group from bootstrap; its region is the region of every resource |
| `runtime_identity_name` | no, `id-run-finance` | identity from bootstrap the apps and the job run as |
| `runtime_identity_resource_group` | no, `rg-identity` | its resource group |
| `key_vault_name` | no, `kv-mastrocola-dev` | shared vault of the four secrets; never read by Terraform as a resource |
| `key_vault_resource_group` | no, `rg-identity` | its resource group |
| `db_admin_login` | no, `finance_admin` | PostgreSQL administrator |
| `db_password_version` | no, `1` | raise after a new `finance-db-password` value |
| `log_daily_cap_gb` | no, `0.1` | Log Analytics daily cap |
| `import_daily_usd_cap` | no, `2` | US$ the import agent may spend per day (São Paulo time); uploads and retries are refused past it |

Terraform sets on both apps `AUTH_MODE=entra`, `ENTRA_ISSUER` and `ENTRA_AUDIENCE`. On the API app: `API_ALLOWED_HOSTS` (`<name>-api.<environment domain>`), `API_ALLOWED_ORIGINS` and `API_PUBLIC_URL` (both `https://<name>-api.<environment domain>`, its own origin), `ENTRA_CLIENT_ID` and `IMPORT_DAILY_USD_CAP`. On the MCP app: `MCP_ALLOWED_HOSTS`, `MCP_ALLOWED_ORIGINS`, `MCP_PUBLIC_URL` (`https://<name>-mcp.<environment domain>`) and `MCP_SCOPES`. Both apps and the job get `PGHOST` (the server), `PGPORT`, `PGUSER`, `PGDATABASE` and `PGSSLMODE=require`. Secrets arrive as the Key Vault references of step 4, through `id-run-finance`.

Note the outputs: `terraform output` (`api_url`, `mcp_url`, `web_url`, `migrate_job`, `resource_group`, `key_vault_uri`).

## 6. Redirect URI

In Entra, `finance-web` → **Authentication** → **Web** → add the redirect URI `<api_url>/auth/callback` exactly.

## 7. Migrations

The `<name>-migrate` Container Apps job runs `npm run db:migrate` with the `api` image and the `finance-db-password` secret, inside Azure, so no firewall rule is needed. Run it after every apply that changes `api_image`:

```sh
az containerapp job start -g "$(terraform output -raw resource_group)" -n "$(terraform output -raw migrate_job)"
az containerapp job execution list -g "$(terraform output -raw resource_group)" -n "$(terraform output -raw migrate_job)" -o table
```

The execution must end `Succeeded`; its log (Log Analytics, `ContainerAppConsoleLogs_CL`) prints `applied …` or `up to date`. Migrations are forward-only and take an advisory lock, so running the job twice is safe.

## 8. First sign-in of each person

1. Each person opens `web_url` and signs in with Google once, so Entra creates their user. The web then says "Esta conta Google não está cadastrada na casa": expected until step 10
2. In the external tenant, **Users**: write down the **object ID** of Marcio and of Gabriela

## 9. Members

Migrations create an empty ledger; never run `db:seed` on Azure. Both members are created in one execution, because active shares must always add up to 100. The job's image runs any npm script with an override (check the flags with `az containerapp job start --help` if your CLI version differs):

```sh
az containerapp job start -g <resource group> -n <migrate job> --image <api image> --container-name migrate --command npm --args "run member:add -- Marcio 50 Gabriela 50"
```

The execution prints `added Marcio, Gabriela`; it refuses a name that already exists or shares that do not add up to 100, and writes nothing then.

## 10. Link members to their sign-in

```sh
az containerapp job start -g <resource group> -n <migrate job> --image <api image> --container-name migrate --command npm --args "run member:link -- Marcio <Marcio object ID>"
az containerapp job start -g <resource group> -n <migrate job> --image <api image> --container-name migrate --command npm --args "run member:link -- Gabriela <Gabriela object ID>"
```

Each execution prints `linked <name>`. An unlinked person who signs in gets 403 `unknown member`.

## 11. Check the APIs

- `curl <api_url>/api/health` returns 200, and `curl -i <api_url>/api/members` returns 401 without a session
- `curl -i <api_url>/auth/login` returns 302 to `https://<tenant ID>.ciamlogin.com/…/authorize` with `redirect_uri=<api_url>/auth/callback` (URL-encoded) and sets a `Secure` cookie. If the API app does not start, its log says `AUTH_MODE entra needs <name>` or `SESSION_KEY must be 32 bytes in base64`: check the secrets of step 4.3
- `curl -i -H 'Origin: https://example.com' <api_url>/api/members` returns 403 (a foreign origin), and the same call with `-H 'Origin: <api_url>'` returns 401 (its own origin, no session)
- `curl <mcp_url>/.well-known/oauth-protected-resource/mcp` returns `resource` `<mcp_url>/mcp`, `authorization_servers` with `entra_issuer` and the scopes of `mcp_scopes`
- `curl -i -X POST <mcp_url>/mcp` returns 401 with `WWW-Authenticate: Bearer resource_metadata=…`

## 12. Web app

The API image carries the web, built with `VITE_AUTH_MODE=entra`, served on the API's own origin: there is nothing to build or upload.

Open `web_url`: the screen says Entrar; Entrar com Google goes to `/auth/login`, then to Entra and Google, and back to `<api_url>/auth/callback`, which sets the session cookie and returns to the web signed in. A return to `/?entrada=falhou` ("Não foi possível concluir a entrada") means the callback failed: check the redirect URI of step 6 and the `finance-web-secret` value (an expired client secret fails the same way).

## 13. Claude connector

In Claude, **Settings** → **Connectors** → **Add custom connector**: URL `<mcp_url>/mcp`; under advanced settings the `finance-claude` client ID and secret. Connect: Claude reads the metadata of step 11, sends you to Entra, and comes back signed in. Ask "quais contas vencem este mês?" and see the answer; a write (for example marking a bill as paid) appears in Atividade with the member as author.

## 14. Smoke test

Walk through [docs/acceptance.md](acceptance.md) section 8 against `web_url`, with an empty ledger: sign-in with Google for both members, the first accounts and categories under Cadastros, the import of `evals/cases/bank-csv/extrato-conjunta.csv` with the real model and its cost, and the Claude connector. Never type real financial data during the POC.

## Deploy a new commit

1. Wait for the `images` job of that commit on `poc` to pass
2. Set `api_image` and `mcp_image` to `:<new commit>` in `terraform.tfvars`, plan and apply
3. Run the migration job (step 7), then open `web_url` and repeat step 11

## Rollback

- **Bad image or web build**: the web ships inside the API image, so set `api_image` (or `mcp_image`) back to the previous commit tag and apply; each app keeps a single revision. Do not run the job with the old image after a newer migration ran: migrations are forward-only, so write a forward migration that reverts the change instead
- **Bad configuration**: check out the previous commit of `infra/`, plan and apply
- **Bad data or migration**: restore PostgreSQL to a point in time (7 days) into a new server, switching the apps to it is a change in `infra/` (`PGHOST` comes from the server resource)
- **Sign-in broken**: the apps refuse every call without a valid session or token, so nothing leaks; fix the registration, or set `entra_issuer`, `entra_audience` or `entra_web_client_id` back and apply. Never switch `AUTH_MODE` to `local` on Azure: it trusts the `x-member` header
- **Import spending too much**: lower `import_daily_usd_cap` and apply, or disable the key in the Anthropic Console; the rest of the app keeps working
- **Claude misbehaves**: remove the connector in Claude, or delete the `finance-claude` client secret in Entra; the web keeps working
- **Everything**: `terraform destroy` (the resource group, identities and secrets stay with `bootstrap`); delete the three app registrations, the Google OAuth client and the external tenant last
