terraform {
  required_version = "1.16.4"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.42"
    }
  }

  backend "azurerm" {}
}

provider "azurerm" {
  features {
    log_analytics_workspace {
      permanently_delete_on_destroy = true
    }
  }

  resource_provider_registrations = "none"
  storage_use_azuread             = true
}
