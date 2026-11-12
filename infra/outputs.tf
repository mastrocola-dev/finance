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
  value = data.azurerm_resource_group.finance.name
}

output "web_url" {
  value = "https://${azurerm_container_app.app["api"].ingress[0].fqdn}"
}

output "database_host" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "key_vault_uri" {
  value = local.key_vault_uri
}
