variable "subscription_id" {
  type        = string
  description = "Azure subscription that holds every resource"
}

variable "name" {
  type        = string
  description = "Prefix of every resource name"
  default     = "finance"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{2,11}$", var.name))
    error_message = "Use 3 to 12 lowercase letters or digits, starting with a letter."
  }
}

variable "location" {
  type        = string
  description = "Region of the database, the Container Apps and the logs"
  default     = "eastus"
}

variable "api_image" {
  type        = string
  description = "Full image reference of the HTTP API, built from the S5 Dockerfile"
}

variable "mcp_image" {
  type        = string
  description = "Full image reference of the MCP server, built from the S5 Dockerfile"
}

variable "registry_server" {
  type        = string
  description = "Registry of private images, such as ghcr.io; null for public images"
  default     = null
}

variable "registry_username" {
  type        = string
  description = "Registry user; its password is the Key Vault secret registry-password"
  default     = null
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
  description = "Increase to rotate the generated database password"
  default     = 1
}

variable "log_daily_cap_gb" {
  type        = number
  description = "Daily ingestion cap of Log Analytics in GB"
  default     = 0.1
}

variable "budget_amount" {
  type        = number
  description = "Monthly budget of the resource group, in the billing currency of the subscription"
  default     = 25
}

variable "budget_emails" {
  type        = list(string)
  description = "Addresses notified at 80 percent actual and 100 percent forecast spend"
}
