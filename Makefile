NODE_IMAGE ?= node:22.18.0-bookworm-slim@sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e
DOCKER_RUN = docker run --rm --user $$(id -u):$$(id -g) -e npm_config_cache=/tmp/npm-cache -v "$$(pwd):/app" -w /app $(NODE_IMAGE)

.PHONY: install dev typecheck lint test build check version

install:
	$(DOCKER_RUN) npm ci

dev: install
	$(DOCKER_RUN) npm run dev

typecheck: install
	$(DOCKER_RUN) npm run typecheck

lint: install
	$(DOCKER_RUN) npm run lint

test: install
	$(DOCKER_RUN) npm run test:coverage

build: install
	$(DOCKER_RUN) npm run build

check: install
	$(DOCKER_RUN) npm run check

version:
	docker run --rm --user $$(id -u):$$(id -g) -e npm_config_cache=/tmp/npm-cache -e VERSION="$(VERSION)" -v "$$(pwd):/app" -w /app $(NODE_IMAGE) sh -c 'test -n "$$VERSION" && npm version "$$VERSION" --no-git-tag-version'
