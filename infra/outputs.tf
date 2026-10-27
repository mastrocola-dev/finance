output "api_url" {
  value = "https://${azurerm_container_app.app["api"].ingress[0].fqdn}"
}

output "mcp_url" {
  value = "https://${azurerm_container_app.app["mcp"].ingress[0].fqdn}"
}

output "migrate_job" {
  value = azurerm_container_app_job.migrate.name
}

output "resource_group" {
  value = azurerm_resource_group.main.name
}

output "web_url" {
  value = "https://${azurerm_static_web_app.web.default_host_name}"
}

output "web_deployment_token" {
  value     = azurerm_static_web_app.web.api_key
  sensitive = true
}

output "database_host" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "key_vault_uri" {
  value = azurerm_key_vault.main.vault_uri
}
