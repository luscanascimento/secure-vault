# Secure Vault — convenience targets. Run `make help` for the list.

.DEFAULT_GOAL := help
.PHONY: help install build lint dev generate migrate seed up down logs clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install all workspace dependencies
	npm install

build: ## Build every workspace (turbo)
	npm run build

lint: ## Lint every workspace
	npm run lint

dev: ## Run API + web in watch mode
	npm run dev

generate: ## Generate the Prisma client
	npm run prisma:generate

migrate: ## Apply database migrations (dev)
	npm run prisma:migrate

seed: ## Seed a demo user + encrypted notes
	npm run prisma:seed

up: ## Build & start the full stack with Docker
	docker compose up -d --build

down: ## Stop the Docker stack
	docker compose down

logs: ## Tail Docker logs
	docker compose logs -f

clean: ## Remove build artifacts and node_modules
	rm -rf node_modules apps/*/node_modules packages/*/node_modules \
		apps/*/dist apps/web/.angular .turbo apps/api/src/generated
