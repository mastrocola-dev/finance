# Infrastructure

Terraform 1.16.4 for the Azure stage. Nothing here has been applied: the build agent cannot reach the Terraform registry, so `init`, `validate` and `plan` run on the author's machine or in CI.

## Resources

| Resource | Setting |
|---|---|
| Resource group `rg-<name>` | every resource below, tagged `app = finance` |
| Log Analytics `log-<name>` | PerGB2018, 30 days, daily cap `log_daily_cap_gb` (0.1 GB) |
| Key Vault `kv-<name>-<suffix>` | RBAC, soft delete 7 days, no purge protection; holds `database-url` and, for private images, `registry-password` |
| PostgreSQL Flexible Server `psql-<name>-<suffix>` | 16, B_Standard_B1ms, 32 GiB (P4), 7-day backups, no geo backup, database `finance`, firewall open to Azure services only |
| Container Apps environment `cae-<name>` | consumption, logs to the workspace |
| Container Apps `<name>-api` (3200) and `<name>-mcp` (3100) | 0.25 vCPU, 0.5 GiB, zero to one replica, `DATABASE_URL` from Key Vault through a user-assigned identity |
| Static Web App `swa-<name>` | Free, in `web_location` (eastus2: Static Web Apps are not offered in eastus) |
| Budget `budget-<name>` | `budget_amount` (25) per month on the resource group; e-mail at 80 percent actual and 100 percent forecast |

`<suffix>` is the first six hex digits of `sha1("<subscription>-<name>")`, stable per subscription, because Key Vault and PostgreSQL names are global.

## Secrets

No secret is in this folder, in a variable or in the state. The database password is an ephemeral `random_password` sent once through write-only attributes (`administrator_password_wo` on the server, `value_wo` on the `database-url` secret); raise `db_password_version` to rotate it. The apps read `database-url` (and `registry-password`) as Key Vault references. A private registry needs `registry_server`, `registry_username` and a `registry-password` secret created in the vault before the apps.

## Exposure

`allowed_ips` empty (the default) keeps both apps on internal ingress: nothing answers from the internet. Listing CIDR ranges turns on external ingress for those ranges only. Keep it to the author's address while `AUTH_MODE` is `local`, because any caller can name a member with `x-member` until the Entra verifier exists. The HTTP API also still accepts only localhost Host and Origin (backlog L177), so it answers 403 behind Container Apps until that lands.

## Apply order

1. Create the state storage once, outside this configuration: a resource group, a storage account and a container (`tfstate`)
2. Copy the backend settings to an untracked `backend.hcl`:

   ```hcl
   resource_group_name  = "<state resource group>"
   storage_account_name = "<state storage account>"
   container_name       = "tfstate"
   key                  = "finance.tfstate"
   use_azuread_auth     = true
   ```

3. Put the values in an untracked `terraform.tfvars`: `subscription_id`, `api_image`, `mcp_image`, `budget_emails` and any default to change
4. `az login` with an identity that may assign roles (Owner or User Access Administrator on the subscription)
5. `terraform init -backend-config=backend.hcl`
6. `terraform fmt -check && terraform validate`
7. `terraform plan -out=finance.tfplan`, review it, `terraform apply finance.tfplan`. Role assignments take a few minutes to reach Key Vault; if the first apply fails reading or writing a secret, run plan and apply again
8. Run the migrations once against the new server: `DATABASE_URL="$(az keyvault secret show --vault-name <vault> --name database-url --query value -o tsv)" npm run db:migrate` from an address the firewall allows (add a temporary rule for it and remove it afterwards). Never run the seed there
9. Deploy the web build with the `web_deployment_token` output (`terraform output -raw web_deployment_token`)

## Rollback

- A bad image: set `api_image` or `mcp_image` back to the previous tag and apply; each app runs a single revision
- A bad configuration change: check out the previous commit of `infra/`, plan and apply
- A bad migration: write a forward migration that reverts it (migrations are forward-only); for lost data restore the server to a point in time (7 days) into a new server and point `database-url` at it
- Everything: `terraform destroy`. The Key Vault stays soft-deleted for 7 days and keeps its name taken; purge it (`az keyvault purge`) before applying again with the same name

`terraform.tfvars`, `backend.hcl`, `*.tfplan`, `.terraform/` and state files are ignored by git.
