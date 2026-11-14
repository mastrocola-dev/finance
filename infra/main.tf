data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "finance" {
  name = var.resource_group_name
}

data "azurerm_user_assigned_identity" "runtime" {
  name                = var.runtime_identity_name
  resource_group_name = var.runtime_identity_resource_group
}

ephemeral "azurerm_key_vault_secret" "db_password" {
  name         = "finance-db-password"
  key_vault_id = local.key_vault_id
}

locals {
  suffix        = substr(sha1("${data.azurerm_client_config.current.subscription_id}-${var.name}"), 0, 6)
  location      = var.location
  key_vault_id  = "/subscriptions/${data.azurerm_client_config.current.subscription_id}/resourceGroups/${var.key_vault_resource_group}/providers/Microsoft.KeyVault/vaults/${var.key_vault_name}"
  key_vault_uri = "https://${var.key_vault_name}.vault.azure.net/"
  identity_id   = data.azurerm_user_assigned_identity.runtime.id
  api_host      = "${var.name}-api.${azurerm_container_app_environment.main.default_domain}"
  mcp_host      = "${var.name}-mcp.${azurerm_container_app_environment.main.default_domain}"
  extract_host  = "${var.name}-extract.internal.${azurerm_container_app_environment.main.default_domain}"

  entra = {
    AUTH_MODE      = "entra"
    ENTRA_ISSUER   = var.entra_issuer
    ENTRA_AUDIENCE = var.entra_audience
  }

  database = {
    PGHOST     = azurerm_postgresql_flexible_server.main.fqdn
    PGPORT     = "5432"
    PGUSER     = var.db_admin_login
    PGDATABASE = azurerm_postgresql_flexible_server_database.finance.name
    PGSSLMODE  = "require"
  }

  database_secrets = {
    PGPASSWORD = "finance-db-password"
  }

  tags = {
    app        = "finance"
    managed_by = "terraform"
  }

  apps = {
    api = {
      image        = var.api_image
      port         = 3200
      min_replicas = var.api_min_replicas
      external     = true
      probe        = "/api/health"

      env = {
        API_HOST            = "0.0.0.0"
        API_PORT            = "3200"
        API_ALLOWED_HOSTS   = local.api_host
        API_ALLOWED_ORIGINS = local.api_host
        API_PUBLIC_URL      = "https://${local.api_host}"
        ENTRA_CLIENT_ID     = var.entra_web_client_id
        EXTRACT_URL         = "https://${local.extract_host}"
      }

      secrets = {
        SESSION_KEY         = "finance-session-key"
        ENTRA_CLIENT_SECRET = "finance-web-secret"
        EXTRACT_KEY         = "finance-extract-key"
      }
    }

    extract = {
      image        = var.extract_image
      port         = 3300
      min_replicas = 0
      external     = false
      probe        = "/health"

      env = {
        EXTRACT_HOST         = "0.0.0.0"
        EXTRACT_PORT         = "3300"
        IMPORT_DAILY_USD_CAP = tostring(var.import_daily_usd_cap)
      }

      secrets = {
        EXTRACT_KEY       = "finance-extract-key"
        ANTHROPIC_API_KEY = "anthropic-api-key-finance"
      }
    }

    mcp = {
      image        = var.mcp_image
      port         = 3100
      min_replicas = 0
      external     = true
      probe        = null

      env = {
        MCP_HOST            = "0.0.0.0"
        MCP_PORT            = "3100"
        MCP_ALLOWED_HOSTS   = local.mcp_host
        MCP_ALLOWED_ORIGINS = join(",", var.mcp_allowed_origins)
        MCP_PUBLIC_URL      = "https://${local.mcp_host}"
        MCP_SCOPES          = join(",", var.mcp_scopes)
      }

      secrets = {}
    }
  }
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.name}-${local.location}"
  resource_group_name = data.azurerm_resource_group.finance.name
  location            = local.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = var.log_daily_cap_gb
  tags                = local.tags
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                              = "psql-${var.name}-${local.suffix}"
  resource_group_name               = data.azurerm_resource_group.finance.name
  location                          = local.location
  version                           = "16"
  sku_name                          = "B_Standard_B1ms"
  storage_mb                        = 32768
  storage_tier                      = "P4"
  backup_retention_days             = 7
  geo_redundant_backup_enabled      = false
  public_network_access_enabled     = true
  administrator_login               = var.db_admin_login
  administrator_password_wo         = ephemeral.azurerm_key_vault_secret.db_password.value
  administrator_password_wo_version = var.db_password_version
  tags                              = local.tags

  authentication {
    password_auth_enabled = true
  }

  lifecycle {
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "finance" {
  name      = "finance"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "azure-services"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${var.name}"
  resource_group_name        = data.azurerm_resource_group.finance.name
  location                   = local.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = local.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

resource "azurerm_container_app" "app" {
  for_each = local.apps

  name                         = "${var.name}-${each.key}"
  resource_group_name          = data.azurerm_resource_group.finance.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  revision_mode                = "Single"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [local.identity_id]
  }

  dynamic "secret" {
    for_each = merge(local.database_secrets, each.value.secrets)

    content {
      name                = secret.value
      identity            = local.identity_id
      key_vault_secret_id = "${local.key_vault_uri}secrets/${secret.value}"
    }
  }

  ingress {
    external_enabled = each.value.external
    target_port      = each.value.port
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }

    dynamic "ip_security_restriction" {
      for_each = each.value.external ? var.allowed_ips : []

      content {
        name             = "allow-${ip_security_restriction.key}"
        action           = "Allow"
        ip_address_range = ip_security_restriction.value
      }
    }
  }

  template {
    min_replicas = each.value.min_replicas
    max_replicas = 1

    container {
      name   = each.key
      image  = each.value.image
      cpu    = 0.25
      memory = "0.5Gi"

      dynamic "env" {
        for_each = merge(each.value.external ? local.entra : {}, local.database, each.value.env)

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = merge(local.database_secrets, each.value.secrets)

        content {
          name        = env.key
          secret_name = env.value
        }
      }

      dynamic "startup_probe" {
        for_each = each.value.probe == null ? [] : [each.value.probe]

        content {
          transport               = "HTTP"
          port                    = each.value.port
          path                    = startup_probe.value
          initial_delay           = 1
          interval_seconds        = 6
          timeout                 = 3
          failure_count_threshold = 10
        }
      }
    }
  }
}

resource "azurerm_container_app_job" "migrate" {
  name                         = "${var.name}-migrate"
  resource_group_name          = data.azurerm_resource_group.finance.name
  location                     = local.location
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 600
  replica_retry_limit          = 0
  tags                         = local.tags

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [local.identity_id]
  }

  dynamic "secret" {
    for_each = local.database_secrets

    content {
      name                = secret.value
      identity            = local.identity_id
      key_vault_secret_id = "${local.key_vault_uri}secrets/${secret.value}"
    }
  }

  template {
    container {
      name    = "migrate"
      image   = var.api_image
      command = ["npm", "run", "db:migrate"]
      cpu     = 0.25
      memory  = "0.5Gi"

      dynamic "env" {
        for_each = local.database

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.database_secrets

        content {
          name        = env.key
          secret_name = env.value
        }
      }
    }
  }
}
