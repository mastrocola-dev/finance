data "azurerm_client_config" "current" {}

locals {
  suffix = substr(sha1("${var.subscription_id}-${var.name}"), 0, 6)
  public = length(var.allowed_ips) > 0

  tags = {
    app        = "finance"
    managed_by = "terraform"
  }

  apps = {
    api = {
      image = var.api_image
      port  = 3200

      env = {
        API_HOST  = "0.0.0.0"
        API_PORT  = "3200"
        AUTH_MODE = "local"
      }
    }

    mcp = {
      image = var.mcp_image
      port  = 3100

      env = {
        MCP_HOST            = "0.0.0.0"
        MCP_PORT            = "3100"
        AUTH_MODE           = "local"
        MCP_ALLOWED_HOSTS   = "${var.name}-mcp.${azurerm_container_app_environment.main.default_domain}"
        MCP_ALLOWED_ORIGINS = join(",", var.mcp_allowed_origins)
      }
    }
  }
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${var.name}"
  location = var.location
  tags     = local.tags
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.name}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = var.log_daily_cap_gb
  tags                = local.tags
}

resource "azurerm_key_vault" "main" {
  name                       = "kv-${var.name}-${local.suffix}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = var.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  tags                       = local.tags
}

resource "azurerm_role_assignment" "deployer_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

ephemeral "random_password" "db" {
  length      = 32
  special     = false
  min_lower   = 2
  min_upper   = 2
  min_numeric = 2
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                              = "psql-${var.name}-${local.suffix}"
  resource_group_name               = azurerm_resource_group.main.name
  location                          = var.location
  version                           = "16"
  sku_name                          = "B_Standard_B1ms"
  storage_mb                        = 32768
  storage_tier                      = "P4"
  backup_retention_days             = 7
  geo_redundant_backup_enabled      = false
  public_network_access_enabled     = true
  administrator_login               = var.db_admin_login
  administrator_password_wo         = ephemeral.random_password.db.result
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

resource "azurerm_key_vault_secret" "database_url" {
  name             = "database-url"
  key_vault_id     = azurerm_key_vault.main.id
  value_wo         = "postgres://${var.db_admin_login}:${ephemeral.random_password.db.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${azurerm_postgresql_flexible_server_database.finance.name}?sslmode=require"
  value_wo_version = var.db_password_version

  depends_on = [azurerm_role_assignment.deployer_secrets]
}

resource "azurerm_user_assigned_identity" "apps" {
  name                = "id-${var.name}-apps"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  tags                = local.tags
}

resource "azurerm_role_assignment" "apps_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${var.name}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = var.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = local.tags
}

resource "azurerm_container_app" "app" {
  for_each = local.apps

  name                         = "${var.name}-${each.key}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  secret {
    name                = "database-url"
    identity            = azurerm_user_assigned_identity.apps.id
    key_vault_secret_id = azurerm_key_vault_secret.database_url.versionless_id
  }

  dynamic "secret" {
    for_each = var.registry_username == null ? [] : [1]

    content {
      name                = "registry-password"
      identity            = azurerm_user_assigned_identity.apps.id
      key_vault_secret_id = "${azurerm_key_vault.main.vault_uri}secrets/registry-password"
    }
  }

  dynamic "registry" {
    for_each = var.registry_username == null ? [] : [1]

    content {
      server               = var.registry_server
      username             = var.registry_username
      password_secret_name = "registry-password"
    }
  }

  ingress {
    external_enabled = local.public
    target_port      = each.value.port
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }

    dynamic "ip_security_restriction" {
      for_each = var.allowed_ips

      content {
        name             = "allow-${ip_security_restriction.key}"
        action           = "Allow"
        ip_address_range = ip_security_restriction.value
      }
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = each.key
      image  = each.value.image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      dynamic "env" {
        for_each = each.value.env

        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  depends_on = [azurerm_role_assignment.apps_secrets]
}

resource "azurerm_static_web_app" "web" {
  name                = "swa-${var.name}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.web_location
  sku_tier            = "Free"
  sku_size            = "Free"
  tags                = local.tags
}

resource "azurerm_consumption_budget_resource_group" "monthly" {
  name              = "budget-${var.name}"
  resource_group_id = azurerm_resource_group.main.id
  amount            = var.budget_amount
  time_grain        = "Monthly"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", plantimestamp())
  }

  notification {
    enabled        = true
    operator       = "GreaterThan"
    threshold      = 80
    threshold_type = "Actual"
    contact_emails = var.budget_emails
  }

  notification {
    enabled        = true
    operator       = "GreaterThan"
    threshold      = 100
    threshold_type = "Forecasted"
    contact_emails = var.budget_emails
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}
