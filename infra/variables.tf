variable "name" {
  type        = string
  description = "Prefix of every resource name"
  default     = "finance"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{2,11}$", var.name))
    error_message = "Use 3 to 12 lowercase letters or digits, starting with a letter."
  }
}

variable "resource_group_name" {
  type        = string
  description = "Resource group created by bootstrap where every finance resource lives"
  default     = "rg-finance-dev"
}

variable "location" {
  type        = string
  description = "Region of every finance resource; PostgreSQL Flexible Server B1ms must be creatable there by the subscription (eastus is restricted, eastus2 and westus3 had no capacity on 2026-11-12)"
  default     = "centralus"
}

variable "runtime_identity_name" {
  type        = string
  description = "User-assigned identity created by bootstrap that the apps and the job run as; it reads the four finance secrets"
  default     = "id-run-finance"
}

variable "runtime_identity_resource_group" {
  type        = string
  description = "Resource group of the runtime identity"
  default     = "rg-identity"
}

variable "key_vault_name" {
  type        = string
  description = "Shared Key Vault holding the finance secrets; Terraform builds its ID and URI and never manages the vault"
  default     = "kv-mastrocola-dev"
}

variable "key_vault_resource_group" {
  type        = string
  description = "Resource group of the shared Key Vault"
  default     = "rg-identity"
}

variable "api_image" {
  type        = string
  description = "Public image of the HTTP API, ghcr.io/mastrocola-dev/finance-api:<commit>"
}

variable "mcp_image" {
  type        = string
  description = "Public image of the MCP server, ghcr.io/mastrocola-dev/finance-mcp:<commit>"
}

variable "entra_issuer" {
  type        = string
  description = "Issuer of the access tokens, https://<tenant id>.ciamlogin.com/<tenant id>/v2.0 for External ID"

  validation {
    condition     = can(regex("^https://[^/]+/.+", var.entra_issuer))
    error_message = "Use the https issuer URL of the tenant, ending in /v2.0."
  }
}

variable "entra_audience" {
  type        = string
  description = "Audience of the access tokens: the application (client) ID of the API registration"
}

variable "entra_web_client_id" {
  type        = string
  description = "Application (client) ID of the web registration the API signs people in with; its secret is the Key Vault secret finance-web-secret"
}

variable "mcp_scopes" {
  type        = list(string)
  description = "Scopes the MCP server advertises to Claude, such as api://<API client id>/access"
  default     = []
}

variable "allowed_ips" {
  type        = list(string)
  description = "CIDR ranges allowed to reach api and mcp; empty lets any address reach them, behind Entra sign-in"
  default     = []
}

variable "mcp_allowed_origins" {
  type        = list(string)
  description = "Origins accepted by the MCP server besides its own host"
  default     = []
}

variable "db_admin_login" {
  type        = string
  description = "Administrator login of the PostgreSQL server"
  default     = "finance_admin"
}

variable "db_password_version" {
  type        = number
  description = "Increase after a new finance-db-password value so the server takes it"
  default     = 1
}

variable "log_daily_cap_gb" {
  type        = number
  description = "Daily ingestion cap of Log Analytics in GB"
  default     = 0.1
}

variable "import_daily_usd_cap" {
  type        = number
  description = "Daily spend of the import agent in US$; new uploads and retries are refused past it"
  default     = 2

  validation {
    condition     = var.import_daily_usd_cap > 0
    error_message = "import_daily_usd_cap must be positive."
  }
}

variable "api_min_replicas" {
  type        = number
  description = "API replicas kept running; 1 avoids a cold start of about 30 seconds and bills the idle rate (about US$ 4 to 6 a month for 0.25 vCPU and 0.5 GiB), 0 scales to zero"
  default     = 1
}
