terraform {
  required_version = "1.16.4"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.42"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  backend "azurerm" {}
}

provider "azurerm" {
  features {}

  subscription_id = var.subscription_id
}
