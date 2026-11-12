# Infrastructure

Terraform 1.16.4 for the Azure stage, on the organization's shared platform. Privileged resources live in `bootstrap` of [mastrocola-dev/infra](https://github.com/mastrocola-dev/infra), applied by the author as Owner; this module creates only the finance workload and is meant to be applied by CI as `id-finance` through OIDC. Nothing here has been applied: the build agent cannot reach the Terraform registry, so `init`, `validate` and `plan` run in CI (`.github/workflows/deploy.yml`) or on the author's machine. The whole deploy, from the Entra tenant to the smoke test and the rollback, is in [docs/deploy-azure.md](../docs/deploy-azure.md); this file covers Terraform only.

## What bootstrap provides

Infra PR #22 (`finance-bootstrap`) creates, and this module reads but never changes:

| Resource | Use here |
|---|---|
| Resource group `rg-finance-dev` | every resource below; its region is theirs. `id-finance` is Contributor on it |
| CI identity `id-finance` | federated with `finance` on `main` and `pull_request`; reads `finance-db-password` and holds Managed Identity Operator on `id-run-finance`, no other role |
| Runtime identity `id-run-finance` in `rg-identity` | attached to both apps and the migration job; reads the four secrets |
| Container `tfstate-finance` in the shared state account | backend, key `finance.tfstate`, Entra auth |
| Secrets in `kv-mastrocola-dev` (`rg-identity`) | `finance-db-password`, `finance-session-key`, `finance-web-secret`, `anthropic-api-key-finance`, placeholders until the author sets their values |
| Subscription budget and provider registration | the provider registers nothing (`resource_provider_registrations = "none"`) |

The vault is not managed here: its ID and URI are built from `key_vault_name` and `key_vault_resource_group`. `id-finance` holds `Reader` on it (infra PR #23) because the provider resolves the vault URI through the management plane before reading `finance-db-password`; that role reads no secret values. The subscription comes from `ARM_SUBSCRIPTION_ID`.

## Resources

| Resource | Setting |
|---|---|
| Log Analytics `log-<name>` | PerGB2018, 30 days, daily cap `log_daily_cap_gb` (0.1 GB) |
| PostgreSQL Flexible Server `psql-<name>-<suffix>` | 16, B_Standard_B1ms, 32 GiB (P4), 7-day backups, no geo backup, database `finance`, firewall open to Azure services only; administrator password from `finance-db-password` |
| Container Apps environment `cae-<name>` | consumption, logs to the workspace |
| Container Apps `<name>-api` (3200, also serves the web from the image) and `<name>-mcp` (3100) | 0.25 vCPU, 0.5 GiB, zero to one replica, external ingress, public images, `AUTH_MODE=entra` with `ENTRA_ISSUER` and `ENTRA_AUDIENCE`, `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGSSLMODE=require` and `PGPASSWORD` from Key Vault through `id-run-finance`; the API app also signs people in (`ENTRA_CLIENT_ID`, `API_PUBLIC_URL`, `SESSION_KEY` and `ENTRA_CLIENT_SECRET` from Key Vault) and imports files (`ANTHROPIC_API_KEY` from Key Vault, `IMPORT_DAILY_USD_CAP`) |
| Container Apps job `<name>-migrate` | manual trigger, `npm run db:migrate` with `api_image`, the same identity and database settings, 10 minutes, no retry |

`<suffix>` is the first six hex digits of `sha1("<subscription>-<name>")`, stable per subscription, because PostgreSQL names are global.

## Inputs

| Variable | Default | Source |
|---|---|---|
| `api_image`, `mcp_image` | required | `ghcr.io/mastrocola-dev/finance-{api,mcp}:<commit>` from the `images` job |
| `entra_issuer`, `entra_audience`, `entra_web_client_id` | required | Entra External ID tenant and app registrations (runbook steps 1 and 2) |
| `mcp_scopes`, `mcp_allowed_origins`, `allowed_ips` | `[]` | Entra and the author |
| `name` | `finance` | prefix of the names this module creates |
| `resource_group_name` | `rg-finance-dev` | bootstrap |
| `runtime_identity_name`, `runtime_identity_resource_group` | `id-run-finance`, `rg-identity` | bootstrap |
| `key_vault_name`, `key_vault_resource_group` | `kv-mastrocola-dev`, `rg-identity` | bootstrap |
| `db_admin_login` | `finance_admin` | |
| `db_password_version` | `1` | raise after a new `finance-db-password` value |
| `log_daily_cap_gb` | `0.1` | |
| `import_daily_usd_cap` | `2` | US$ per day for the import agent |

## Secrets

No secret is in this folder, in a variable or in the state. The administrator password is read from `finance-db-password` by an `ephemeral "azurerm_key_vault_secret"` and sent once through `administrator_password_wo`; after setting a new value in the vault, raise `db_password_version`. The apps read the secrets as Key Vault references (versionless, so a new value reaches the next revision), and a reference to an empty placeholder fails at start, so the author sets all four values before the first apply (runbook step 4).

## Exposure

Both apps have external ingress and run `AUTH_MODE=entra`: every route but `/api/health`, `/api/openapi.json`, the web files and the MCP metadata needs a bearer token from `entra_issuer` for `entra_audience` or, on the API, the session cookie set by `/auth/callback`, linked to a member. `allowed_ips` restricts both apps to the listed CIDR ranges; leave it empty while Claude's connector is used, since Claude calls from Anthropic's servers. Never set `AUTH_MODE=local` here: it trusts the `x-member` header. The API accepts the Host `<name>-api.<environment domain>` (`API_ALLOWED_HOSTS`) and the Origin of its own https address only (`API_ALLOWED_ORIGINS`), since the web is served from it.

## Deploy pipeline

`.github/workflows/deploy.yml` signs in as `id-finance` through OIDC (no secret in GitHub) and runs Terraform 1.16.4 against the `tfstate-finance` container, key `finance.tfstate`, waiting up to five minutes for the state lock:

| Trigger | Images | What runs |
|---|---|---|
| Pull request to `main` | head commit of the pull request | `init` and `plan` |
| `ci` completed with success for a push to `main` (its `images` job published both images) | the commit `ci` tested | `plan`, `apply`, then the migration job; the run fails unless the execution ends `Succeeded` |
| Manual dispatch on `main` | the head of `main` | `plan`; with **apply** checked also `apply` and the migration job |

Runs never cancel each other: one group per pull request and one for `main`. Before applying, the run checks that both images exist on GHCR. `id-finance` is federated with `main` and `pull_request` only, so a dispatch from another branch fails at sign-in. The `ci` workflow lints every workflow with actionlint in its `infra` job.

## Repository variables

Set in **Settings → Secrets and variables → Actions → Variables** of `mastrocola-dev/finance`. None is a secret.

| Variable | Value | Source |
|---|---|---|
| `AZURE_CLIENT_ID` | client ID of `id-finance` | bootstrap output `ci_client_ids["finance"]` |
| `AZURE_TENANT_ID` | the organization's tenant, where `id-finance` and the subscription live; not the External ID tenant of the sign-in (`caixafinance`) | bootstrap output `tenant_id` |
| `AZURE_SUBSCRIPTION_ID` | subscription of `rg-finance-dev` | the author (`az account show --query id`) |
| `TFSTATE_RESOURCE_GROUP` | resource group of the shared state account | bootstrap output `state_resource_group` |
| `TFSTATE_STORAGE_ACCOUNT` | the shared state account | bootstrap output `state_storage_account` |
| `ENTRA_ISSUER` | `https://<tenant id>.ciamlogin.com/<tenant id>/v2.0` of the External ID tenant | Entra (runbook step 1) |
| `ENTRA_AUDIENCE` | application (client) ID of the API registration | Entra (runbook step 2) |
| `ENTRA_WEB_CLIENT_ID` | application (client) ID of the web registration | Entra (runbook step 2) |
| `MCP_SCOPES` | HCL list, such as `["api://<API client id>/access"]`; `[]` when unset | Entra (runbook step 2) |

## Apply order

CI applies on every push to `main` once the repository variables are set (runbook steps 5 to 8). By hand, from the author's machine (runbook **Terraform by hand**):

1. Bootstrap applied and the four secret values set (runbook step 4)
2. An untracked `backend.hcl` with the state account, container `tfstate-finance`, key `finance.tfstate` and `use_azuread_auth = true`, and an untracked `terraform.tfvars`
3. `export ARM_SUBSCRIPTION_ID=<subscription>`, `terraform init -backend-config=backend.hcl`, `terraform fmt -check && terraform validate`
4. `terraform plan -out=finance.tfplan`, review it, `terraform apply finance.tfplan`
5. Start the `migrate_job` output (`az containerapp job start`) and wait for `Succeeded`; it runs inside Azure, so no firewall rule is needed. Never run the seed there
6. Open the `web_url` output: the API image serves the web on its own origin, nothing else to deploy

## Rollback

- A bad image: set `api_image` or `mcp_image` back to the previous tag and apply; each app runs a single revision
- A bad configuration change: check out the previous commit of `infra/`, plan and apply
- A bad migration: write a forward migration that reverts it (migrations are forward-only); for lost data restore the server to a point in time (7 days) into a new server and move this module to it
- Everything: `terraform destroy`; the resource group, identities, state and secrets stay with bootstrap

`terraform.tfvars`, `backend.hcl`, `*.tfplan`, `.terraform/` and state files are ignored by git.
