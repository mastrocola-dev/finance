# Deploy to Azure

The single order for the author to put the finance POC on Azure through the organization's shared platform: bootstrap in `mastrocola-dev/infra` holds the privileged resources, and this repository's `deploy` workflow applies `infra/` as `id-finance` through OIDC. The build agent never runs any of these steps: it cannot reach Azure, the Terraform registry or the image registries. Every value below that is not public is a placeholder in `<angle brackets>`; keep secrets in Key Vault only, never in the repository, in a repository variable or on a command line. `npm run check` runs `scripts/runbook.ts`, which fails when this page, `infra/` and the workflows disagree on a variable or a Key Vault secret.

## What you get

- One Container App `finance-api` that serves the web and the HTTP API on one origin (`web_url` = `api_url`) and signs people in itself: `/auth/login` runs a server-side code flow with PKCE against Entra External ID, which federates Google, and keeps a sealed `HttpOnly` session cookie
- One Container App `finance-extract` with internal ingress only, scaled to zero: the API hands it every upload (`EXTRACT_URL`, with the shared key `EXTRACT_KEY`) and it reads the file with the real model through service-agent, capped by `import_daily_usd_cap`. It wakes on the first upload after about five idle minutes (step 13)
- One Container App `finance-mcp` for Claude's connector, which accepts only Entra bearer tokens
- PostgreSQL 16, Log Analytics and the migration job `finance-migrate`, all in `rg-finance-dev`. About US$ 17 a month, almost all of it PostgreSQL ([ADR-010](adr-010-azure-hosting.md)); the subscription budget of the organization covers it
- The resource group, both identities, the state container and four of the five secrets come from bootstrap (infra PR #22, `finance-bootstrap`); this configuration creates no role, no vault and registers no provider. The fifth, `finance-extract-key`, is not in bootstrap yet: create it in step 4.4 and give `id-run-finance` read access to it as to the other four

## 0. Tools and accounts

- Azure CLI (`az`), `openssl` and bash (3.2 or later, for `scripts/job.sh`); Terraform 1.16.4 only for bootstrap and for the optional manual runs at the end
- Owner of the subscription, to apply bootstrap and register providers
- Admin of `mastrocola-dev/finance` on GitHub, to set repository variables, package visibility and merge to `main`
- A Google account that may create OAuth clients in Google Cloud Console, and an Anthropic Console account for the import key

## 1. Entra External ID tenant with Google

Done by the author on 2026-11-10: external tenant `caixafinance`, issuer `https://21ecb71d-5641-4bcf-b347-0a0287ff78f6.ciamlogin.com/21ecb71d-5641-4bcf-b347-0a0287ff78f6/v2.0` (that is `ENTRA_ISSUER` in step 5). Check it: `curl https://21ecb71d-5641-4bcf-b347-0a0287ff78f6.ciamlogin.com/21ecb71d-5641-4bcf-b347-0a0287ff78f6/v2.0/.well-known/openid-configuration` returns that exact `issuer`.

To rebuild it from nothing:

1. Microsoft Entra admin center → **Manage tenants** → **Create** → **External**, subdomain `<subdomain>`; write down the **tenant ID**
2. Google Cloud Console → **OAuth consent screen**: external, app name `finance`, no extra scopes; while in testing, Marcio's and Gabriela's Google addresses as test users
3. **Credentials** → **OAuth client ID**, type **Web application**, redirect URIs `https://<tenant ID>.ciamlogin.com/<tenant ID>/federation/oauth2`, `https://<subdomain>.ciamlogin.com/<tenant ID>/federation/oauth2` and `https://<subdomain>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oauth2`
4. External tenant → **External Identities** → **All identity providers** → **Google**: paste the Google client ID and secret (the Google secret stays in Entra)
5. **User flows** → **New user flow** (sign up and sign in), identity provider **Google** only, no extra attributes

### Sign-in page

The API sends `domain_hint` on every sign-in (`ENTRA_DOMAIN_HINT`, default `google`; `none` sends no hint), so External ID opens Google directly and its own page never shows. These steps make that page look like the app for the times it does show (a hint the tenant ignores, `none`, or a Google error that sends the person back). Still to do on `caixafinance`:

1. **User flows** → the flow of step 1.5 → **Identity providers**: under **Email accounts** select **None** (or clear **Email with password** and **Email one-time passcode**), keep **Google** checked, **Save**. If the portal keeps an email option mandatory, leave it: the hint still skips the page
2. **Company branding** → **Default sign-in** → **Edit**. Every file is in `docs/branding/`, made by `npm run branding -w web` from `web/public/icon.svg` and the tokens of `docs/design.md`; never edit the PNGs by hand
   - **Basics**: **Favicon**: `docs/branding/favicon.png`, **Background image**: `docs/branding/background.png`, **Page background color** `#F6F6F3` (`bg`)
   - **Layout**: template **Full-screen background**, header and footer hidden, **Custom CSS**: `docs/branding/custom.css` (sign-in box in `surface` with a `border` hairline and no shadow, primary button in `accent`)
   - **Sign-in form**: **Banner logo**: `docs/branding/banner-logo.png`, **Square logo (light theme)**: `docs/branding/square-logo.png`, **Square logo (dark theme)**: `docs/branding/square-logo-dark.png`, **Sign-in page text** "Acesso só para os membros da casa"
   - **Review + save**; changes can take up to an hour to show
3. Check the hint once the app runs (step 13): in a private window open `web_url`, press **Entrar com Google** and watch the address bar or the browser's network panel: after `…ciamlogin.com/…/authorize?…&domain_hint=google` the next page is `accounts.google.com`, with no Entra page in between. `curl -s -o /dev/null -w '%{redirect_url}\n' <api_url>/auth/login` must print an authorize URL with `domain_hint=google`
4. To see the branded page, show it for a moment: `az containerapp update -g rg-finance-dev -n finance-api --set-env-vars ENTRA_DOMAIN_HINT=none`, sign in from a private window, then `az containerapp update -g rg-finance-dev -n finance-api --remove-env-vars ENTRA_DOMAIN_HINT` (the next deploy also removes it, since `infra/` does not set it)

## 2. App registrations

All three live in the external tenant.

1. **API** (`finance-api`): new registration, single tenant, no redirect URI. Its **application (client) ID** is `ENTRA_AUDIENCE`
   - **Manifest**: `requestedAccessTokenVersion` (`api.requestedAccessTokenVersion` in the Microsoft Graph manifest) set to `2`, so tokens carry the v2 issuer and the client ID as audience
   - **Expose an API**: Application ID URI `api://<API client ID>` and the delegated scope `access` (admins and users, display name "Usar o finance"). The full scope `api://<API client ID>/access` goes into `MCP_SCOPES`
2. **Web** (`finance-web`): new registration, platform **Web** (the API exchanges the code on the server), no redirect URI yet: `<api_url>/auth/callback` is added in step 8
   - **Certificates & secrets** → new client secret, saved to a file for step 4.4; it goes only into Key Vault as `finance-web-secret`
   - **API permissions** → **My APIs** → `finance-api` → `access`, then **Grant admin consent**
   - Its **application (client) ID** is `ENTRA_WEB_CLIENT_ID`
3. **Claude** (`finance-claude`): the client of Claude's connector, because Entra has no dynamic client registration
   - Platform **Web**, redirect URI `https://claude.ai/api/mcp/auth_callback`
   - New client secret with the shortest expiry you accept; it goes only into Claude's connector form in step 14
   - **API permissions** → `finance-api` → `access` plus `offline_access`, then **Grant admin consent**
4. **User flows** → the flow of step 1.5 → **Applications** → add `finance-web` and `finance-claude`

## 3. Images on GHCR, public

CI's `images` job builds the three images after the tests and, on every push to `poc` or `main`, publishes `ghcr.io/mastrocola-dev/finance-api:<commit>`, `ghcr.io/mastrocola-dev/finance-extract:<commit>` and `ghcr.io/mastrocola-dev/finance-mcp:<commit>` with the workflow's token (full SHA, never `latest`). The apps pull without credentials, so:

1. Open each package on GitHub (**mastrocola-dev** → **Packages**) → **Package settings**: under **Manage Actions access** `finance` has the **Write** role, and under **Danger Zone** → **Change visibility** the package is **Public**
2. If no package exists yet, the `images` job of a push to `poc` failed: its log says why (`permission_denied` means the organization must allow Actions to create packages)

The run summary also shows the `Dockerfile` diff that pins the base images by digest (`scripts/pin-bases.sh`); apply it in a commit when convenient.

## 4. Bootstrap

1. Review and merge infra PR #22 (`finance-bootstrap`) in `mastrocola-dev/infra`. It creates `rg-finance-dev` (Contributor for `id-finance`), `id-finance` federated with `finance` on `main` and `pull_request`, the container `tfstate-finance` in the shared state account, `id-run-finance` in `rg-identity` (Managed Identity Operator for `id-finance`) and four placeholder secrets in `kv-mastrocola-dev` read by `id-run-finance`; `id-finance` reads only `finance-db-password`
2. Register the providers this configuration uses, once per subscription, as Owner (it registers none itself):

   ```sh
   az provider register --namespace Microsoft.App --wait
   az provider register --namespace Microsoft.DBforPostgreSQL --wait
   az provider register --namespace Microsoft.OperationalInsights --wait
   ```

3. Apply bootstrap from your machine as its README says (`az login` as Owner, `terraform init -backend-config=backend.hcl`, `terraform plan -out=tfplan`, review, `terraform apply tfplan`), then note the outputs `tenant_id`, `ci_client_ids["finance"]`, `state_resource_group` and `state_storage_account` for step 5
4. Set the five secret values from files, never on the command line, each with an expiry. A reference to an empty placeholder or a missing secret makes the app fail at start, so all five come before the first deploy; `finance-extract-key` is created here, so check that `id-run-finance` can read it (`az role assignment list --assignee <id-run-finance principal ID> --all -o table` lists a `Key Vault Secrets User` scope that covers it). `--file` keeps a trailing newline as part of the value, so write pasted values with `read -rs V && printf '%s' "$V" > <file> && unset V`:

   ```sh
   openssl rand -base64 24 | tr -d '/+=\n' > db-password.txt
   openssl rand -base64 32 | tr -d '\n' > session-key.txt
   openssl rand -base64 48 | tr -d '/+=\n' > extract-key.txt
   az keyvault secret set --vault-name kv-mastrocola-dev --name finance-db-password --file db-password.txt --expires <date>
   az keyvault secret set --vault-name kv-mastrocola-dev --name finance-session-key --file session-key.txt --expires <date>
   az keyvault secret set --vault-name kv-mastrocola-dev --name finance-web-secret --file <file holding the finance-web secret> --expires <date>
   az keyvault secret set --vault-name kv-mastrocola-dev --name anthropic-api-key-finance --file <file holding the Anthropic key> --expires <date>
   az keyvault secret set --vault-name kv-mastrocola-dev --name finance-extract-key --file extract-key.txt --expires <date>
   rm db-password.txt session-key.txt extract-key.txt
   ```

| Secret | Read by | Value |
|---|---|---|
| `finance-db-password` | Terraform (ephemeral, as `id-finance`), the three apps and the job (`PGPASSWORD`) | PostgreSQL administrator password; after a new value raise `db_password_version` (step 6) |
| `finance-session-key` | API (`SESSION_KEY`) | 32 random bytes in base64; replacing it signs everyone out |
| `finance-web-secret` | API (`ENTRA_CLIENT_SECRET`) | client secret of `finance-web`; renew it before it expires |
| `anthropic-api-key-finance` | extraction service (`ANTHROPIC_API_KEY`) | key from an Anthropic Console workspace with its own spend limit above `import_daily_usd_cap` |
| `finance-extract-key` | API and extraction service (`EXTRACT_KEY`) | at least 32 random characters; the API sends it on every call to `finance-extract`, which refuses calls without it. A new value reaches both at their next revision, so restart both together (`az containerapp revision restart`) |

## 5. Repository variables

In `mastrocola-dev/finance`, **Settings** → **Secrets and variables** → **Actions** → **Variables**. None is a secret; the same table, with sources, is in [infra/README.md](../infra/README.md#repository-variables).

| Variable | Value |
|---|---|
| `AZURE_CLIENT_ID` | bootstrap output `ci_client_ids["finance"]` (client ID of `id-finance`) |
| `AZURE_TENANT_ID` | bootstrap output `tenant_id`: the organization's tenant, not `caixafinance` |
| `AZURE_SUBSCRIPTION_ID` | subscription of `rg-finance-dev` (`az account show --query id -o tsv`) |
| `TFSTATE_RESOURCE_GROUP` | bootstrap output `state_resource_group` |
| `TFSTATE_STORAGE_ACCOUNT` | bootstrap output `state_storage_account` |
| `ENTRA_ISSUER` | the issuer of step 1 |
| `ENTRA_AUDIENCE` | `finance-api` client ID (step 2.1) |
| `ENTRA_WEB_CLIENT_ID` | `finance-web` client ID (step 2.2) |
| `MCP_SCOPES` | `["api://<API client ID>/access"]` |

## 6. Terraform variables

The `deploy` workflow sets the required variables: the images from the commit it deploys and the rest from step 5. The others keep the defaults of `infra/variables.tf`; change one with a pull request that edits its default.

| Variable | Required | Value |
|---|---|---|
| `api_image` | yes | `ghcr.io/mastrocola-dev/finance-api:<commit>`, set by the workflow |
| `mcp_image` | yes | `ghcr.io/mastrocola-dev/finance-mcp:<commit>`, set by the workflow |
| `extract_image` | yes | `ghcr.io/mastrocola-dev/finance-extract:<commit>`, set by the workflow |
| `entra_issuer` | yes | `ENTRA_ISSUER` |
| `entra_audience` | yes | `ENTRA_AUDIENCE` |
| `entra_web_client_id` | yes | `ENTRA_WEB_CLIENT_ID` |
| `mcp_scopes` | no, `[]` | `MCP_SCOPES`, so Claude asks for the right scope |
| `mcp_allowed_origins` | no, `[]` | extra browser origins for MCP clients (Claude calls server side and needs none) |
| `allowed_ips` | no, `[]` | CIDR ranges to restrict `finance-api` and `finance-mcp` to (`finance-extract` has no external ingress); empty lets any address in, behind Entra. Claude's connector calls from Anthropic's servers, so a list that leaves them out breaks it |
| `name` | no, `finance` | prefix of every resource |
| `resource_group_name` | no, `rg-finance-dev` | resource group from bootstrap; it only groups the resources |
| `location` | no, `centralus` | region of every resource. `list-skus` shows offers, not capacity: on 2026-11-12 a real B1ms create failed with SkuNotAvailable in `eastus2` and `westus3` and succeeded in `centralus` and `canadacentral` (`eastus` is restricted). Before changing it, create and drop a throwaway B1ms server in the new region |
| `runtime_identity_name` | no, `id-run-finance` | identity from bootstrap the apps and the job run as |
| `runtime_identity_resource_group` | no, `rg-identity` | its resource group |
| `key_vault_name` | no, `kv-mastrocola-dev` | shared vault of the five secrets; Terraform reads only its management plane (`Reader`, infra PR #23) and `finance-db-password` |
| `key_vault_resource_group` | no, `rg-identity` | its resource group |
| `db_admin_login` | no, `finance_admin` | PostgreSQL administrator |
| `db_password_version` | no, `1` | raise after a new `finance-db-password` value |
| `log_daily_cap_gb` | no, `0.1` | Log Analytics daily cap |
| `api_min_replicas` | no, `1` | API replicas kept running: 1 avoids a cold start of about 30 seconds (measured 2026-11-12) for about US$ 4 to 6 a month at the idle rate; 0 scales to zero |
| `import_daily_usd_cap` | no, `2` | US$ the import agent may spend per day (São Paulo time), counted by `finance-extract`; uploads and retries are refused past it |

Terraform sets on the API and MCP apps `AUTH_MODE=entra`, `ENTRA_ISSUER` and `ENTRA_AUDIENCE`. On the API app: `API_ALLOWED_HOSTS` (`finance-api.<environment domain>`), `API_ALLOWED_ORIGINS` and `API_PUBLIC_URL` (both `https://finance-api.<environment domain>`), `ENTRA_CLIENT_ID` and `EXTRACT_URL` (`https://finance-extract.internal.<environment domain>`). On the extraction app: `EXTRACT_HOST=0.0.0.0`, `EXTRACT_PORT=3300` and `IMPORT_DAILY_USD_CAP`. On the MCP app: `MCP_ALLOWED_HOSTS`, `MCP_ALLOWED_ORIGINS`, `MCP_PUBLIC_URL` and `MCP_SCOPES`. The three apps and the job get `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` and `PGSSLMODE=require`; the secrets of step 4 arrive as Key Vault references through `id-run-finance`.

## 7. Merge `poc` into `main`

1. Open a pull request from `poc` to `main`. `ci` runs the tests and builds the images; `deploy` signs in as `id-finance` and runs `init` and `plan` with the pull request's head commit. A failure at **Azure login** or **Terraform init** means a repository variable of step 5 or a bootstrap grant is wrong
2. Read the plan in the `Terraform plan` log: it creates Log Analytics, the PostgreSQL server and database, the firewall rule, the environment, the three apps and the job, and changes nothing in bootstrap's resources
3. Merge when both checks pass. Never force-push `main`

## 8. The deploy run

The merge push runs `ci` on `main`, which publishes the three images of the merge commit; when it succeeds, `deploy` starts from `workflow_run`: it checks the three images exist, plans, applies, starts `finance-migrate` and fails unless the execution ends `Succeeded`. The run summary prints the migration execution and `Deployed <commit> to <web_url>`.

- No run appeared: `workflow_run` uses the workflow file of `main`, which exists only after this merge. Start **Actions** → **deploy** → **Run workflow** on `main` with **apply** checked
- The apps fail to start: a secret of step 4.4 is empty, expired or not readable by `id-run-finance`, or a package of step 3 is private. `finance-api` and `finance-extract` have a startup probe (`/api/health` and `/health`, every 6 seconds, 10 failures): a revision that does not answer within about a minute is marked failed, and `az containerapp revision list -g rg-finance-dev -n <app> -o table` shows it
- The URLs: `api_url` and `web_url` are the `<web_url>` of the summary; `mcp_url` is `https://` plus `az containerapp show -g rg-finance-dev -n finance-mcp --query properties.configuration.ingress.fqdn -o tsv`

## 9. Redirect URI

In Entra, `finance-web` → **Authentication** → **Web** → add `<api_url>/auth/callback` exactly.

## 10. First sign-in of each person

1. Each person opens `web_url` and signs in with Google once, so Entra creates their user. The web then says "Esta conta Google não está cadastrada na casa": expected until step 12
2. In the external tenant, **Users**: note the **object ID** of Marcio and of Gabriela

## 11. Members

Migrations create an empty ledger; never run `db:seed` on Azure. Both members are created in one execution, because active shares must always add up to 100. `scripts/job.sh <npm script> [word ...]` runs any npm script on `finance-migrate` from your machine (signed in with `az login`) and waits for the execution to end. It works around two traps checked on 2026-11-12:

- An override built from `--image` and `--command` replaces the whole container, so the job's database settings are lost and the script reaches for localhost: the script reads the job's image, container and settings with `az containerapp job show` and passes them again with `--env-vars`, the password as `secretref:finance-db-password`
- `--args` takes one argument per word, and a bare `--` is swallowed by the CLI: the script passes each word on its own and drops a bare `--`

It refuses `db:seed` and `db:reset`. `JOB_IMAGE` runs another image than the job's (the image of the last deploy), `JOB_GROUP` and `JOB_NAME` another resource group or job:

```sh
scripts/job.sh member:add Marcio 50 Gabriela 50
```

It prints `started <execution>` and ends with `<execution> Succeeded` (exit 0) or the failed status (exit 1). The execution log prints `added Marcio, Gabriela`; it refuses a name that already exists or shares that do not add up to 100, and writes nothing then. The log is in Log Analytics:

```sh
W=$(az monitor log-analytics workspace show -g rg-finance-dev -n log-finance-<location> --query customerId -o tsv)
az monitor log-analytics query -w $W -o table --analytics-query "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(30m) and ContainerName_s == 'migrate' | project TimeGenerated, Log_s | order by TimeGenerated asc"
```

## 12. Link members to their sign-in

One execution at a time; the script returns only when the previous one has ended:

```sh
scripts/job.sh member:link Marcio <Marcio object ID>
scripts/job.sh member:link Gabriela <Gabriela object ID>
```

Each execution prints `linked <name>`. An unlinked person who signs in gets 403 `unknown member`.

## 13. Checks

- `curl <api_url>/api/health` returns 200, and `curl -i <api_url>/api/members` returns 401 without a session
- `curl -i <api_url>/auth/login` returns 302 to `https://<tenant ID>.ciamlogin.com/…/authorize` with `redirect_uri=<api_url>/auth/callback` (URL-encoded) and sets a `Secure` cookie. If the API app does not start, its log says `AUTH_MODE entra needs <name>` or `SESSION_KEY must be 32 bytes in base64`: check step 4.4
- `curl -i -H 'Origin: https://example.com' <api_url>/api/members` returns 403, and with `-H 'Origin: <api_url>'` it returns 401
- The extraction service sleeps while idle and wakes on an upload. With nobody importing for five minutes, `az containerapp replica list -g rg-finance-dev -n finance-extract -o table` lists no replica; upload `evals/cases/bank-csv/extrato-conjunta.csv` in Importar, run it again and one replica appears. The first upload after a sleep waits the cold start before Extraindo shows. The wake is in the logs: `az containerapp logs show -g rg-finance-dev -n finance-extract --type system` prints the scale-up and the probe, and the console query of step 11 with `ContainerName_s == 'extract'` prints `finance extract on http://0.0.0.0:3300`. `finance-extract` has no public address: `curl https://finance-extract.internal.<environment domain>/health` from your machine does not resolve. If the upload answers "the extraction service cannot be reached", check `EXTRACT_URL` on `finance-api` and that both apps run the same `finance-extract-key` revision
- `curl <mcp_url>/.well-known/oauth-protected-resource/mcp` returns `resource` `<mcp_url>/mcp`, `authorization_servers` with the issuer and the scopes of `MCP_SCOPES`; `curl -i -X POST <mcp_url>/mcp` returns 401 with `WWW-Authenticate: Bearer resource_metadata=…`
- `web_url` shows Entrar; Entrar com Google goes to `/auth/login`, straight to Google (step 1, **Sign-in page**, item 3) and back signed in. A return to `/?entrada=falhou` ("Não foi possível concluir a entrada") means the callback failed: check step 9 and `finance-web-secret`

## 14. Claude connector

In Claude, **Settings** → **Connectors** → **Add custom connector**: URL `<mcp_url>/mcp`; under advanced settings the `finance-claude` client ID and secret. Connect: Claude reads the metadata of step 13, sends you to Entra and comes back signed in. Ask "quais contas vencem este mês?"; a write (for example marking a bill as paid) appears in Atividade with the member as author.

## 15. Acceptance

Walk through [docs/acceptance.md](acceptance.md) section 8 against `web_url`, with an empty ledger: sign-in with Google for both members, the first accounts and categories under Cadastros, the import of `evals/cases/bank-csv/extrato-conjunta.csv` with the real model and its cost, and the Claude connector. Never type real financial data during the POC.

## First day on Azure

The first day, from step 11 on, in this order. Each line is done when what it names is seen; [docs/acceptance.md](acceptance.md) section 8 is the full walk.

- [ ] **Cold start**: open `web_url` after a quiet hour. With `api_min_replicas` at `1` (default) Entrar shows at once; at `0` the first request waits about 30 seconds while `finance-api` starts, and `az containerapp revision list -g rg-finance-dev -n finance-api -o table` shows the revision `Running`. `finance-extract` sleeps either way and wakes on the first upload (step 13)
- [ ] **Members**: `scripts/job.sh member:add Marcio 50 Gabriela 50` ends `Succeeded` (step 11); each person signs in once, then `scripts/job.sh member:link <name> <object ID>` for each (step 12); both see the same household, and Você é shows each one's own name
- [ ] **Categories and accounts**: under **Cadastros** (`/cadastros`), one person registers the joint account (institution, nickname, last four digits only) and the first categories; the other sees them, and **Atividade** (`/atividade`) shows who did it. Never type real account numbers: the POC holds invented values only
- [ ] **First import**: in **Importar** (`/importar`), upload `evals/cases/bank-csv/extrato-conjunta.csv` with the consent checked; the first upload after a sleep waits the cold start of `finance-extract`, then Extraindo and Para revisar with tokens and the cost in US$. Names the ledger lacks are matched or created by the model; review "Escolhas do Claude", answer whatever is under "Precisa de vocês", import, and see the entries in **Lançamentos** with the Importado chip
- [ ] **Spend**: the Anthropic Console shows the import's cost, under `import_daily_usd_cap` (US$ 2 a day by default)
- [ ] **Something failed**: the console query of step 11 with the app's container name (`api`, `extract`, `mcp`, `migrate`) shows its log; rollback is below

## Deploy a new commit

Merge a pull request into `main`: `ci` publishes the images of the merge commit and `deploy` applies them and runs the migrations. The pull request shows the plan beforehand.

## Rollback

- **Bad image or web build**: revert the merge on `main` with a pull request; the revert commit gets its own images and deploy. The web ships inside the API image. Migrations are forward-only and the job always runs the deployed image, so a revert that removes a migration needs a forward migration that undoes it instead
- **Faster, by hand**: run Terraform from your machine (below) with `api_image`, `extract_image` and `mcp_image` set to the previous commit; the next push to `main` deploys its own commit again
- **Bad configuration**: revert the `infra/` change on `main`
- **Bad data or migration**: restore PostgreSQL to a point in time (7 days) into a new server; moving the apps to it is a change in `infra/` (`PGHOST` comes from the server resource)
- **Sign-in broken**: the apps refuse every call without a valid session or token, so nothing leaks; fix the registration or the repository variable and run **deploy** with **apply**. Never set `AUTH_MODE=local` on Azure: it trusts the `x-member` header
- **Import spending too much**: lower `import_daily_usd_cap` in a pull request, or disable the key in the Anthropic Console; the rest of the app keeps working
- **Claude misbehaves**: remove the connector in Claude, or delete the `finance-claude` client secret in Entra
- **Everything**: `terraform destroy` by hand (the resource group, identities, state and secrets stay with bootstrap); delete the three app registrations, the Google OAuth client and the external tenant last

## Terraform by hand (optional)

For a rollback or a plan without a pull request, as a user with Contributor on `rg-finance-dev` and read access to `finance-db-password`. In `infra/`, write an untracked `backend.hcl` (`resource_group_name` and `storage_account_name` from step 5, `container_name = "tfstate-finance"`, `key = "finance.tfstate"`, `use_azuread_auth = true`) and an untracked `terraform.tfvars` with the six required variables of step 6, then:

```sh
export ARM_SUBSCRIPTION_ID=<subscription>
terraform init -backend-config=backend.hcl
terraform plan -lock-timeout=5m -out=finance.tfplan
terraform apply finance.tfplan
```

The state is shared with the pipeline and locked while either runs.
